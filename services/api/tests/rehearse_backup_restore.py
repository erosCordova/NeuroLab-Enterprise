"""Ensayo de pg_dump/pg_restore exclusivamente sobre PostgreSQL efímero de CI.

Nunca ejecuta comandos de respaldo en Neon/Render. El archivo se crea en un
directorio temporal que se elimina al finalizar; no se publica como artifact.
"""
import os
import subprocess
import tempfile
from pathlib import Path

import psycopg
from psycopg.conninfo import conninfo_to_dict, make_conninfo

CI_DATABASE = "neurolab_test"
RESTORE_DATABASE = "neurolab_restore_ci"
TABLES = (
    "users", "sessions", "projects", "real_cnn_runs", "real_cnn_models",
    "auth_attempt_windows", "schema_migrations",
)


def assert_local_ci_target(url: str, env=None) -> dict:
    env = os.environ if env is None else env
    if (env.get("GITHUB_ACTIONS") != "true"
            or env.get("NEUROLAB_CI_BACKUP_REHEARSAL") != "1"):
        raise RuntimeError("Respaldo restringido al entorno autorizado de GitHub CI.")
    try:
        values = conninfo_to_dict(url)
    except (psycopg.Error, ValueError):
        raise RuntimeError("URL de pruebas inválida.") from None
    if (values.get("host") not in ("localhost", "127.0.0.1")
            or values.get("dbname") != CI_DATABASE
            or values.get("port", "5432") != "5432"
            or not values.get("user")):
        raise RuntimeError("Respaldo restringido a PostgreSQL local de pruebas.")
    return values


def run_postgres_tool(command: str, args: list[str], stream, *, output: bool):
    # No credentials in process arguments; password is passed in the
    # ephemeral CI process environment and read by Docker's -e PGPASSWORD.
    process_env = os.environ.copy()
    process_env["PGPASSWORD"] = args[0]
    cmd = [
        "docker", "run", "--rm", "--network", "host",
        "-e", "PGPASSWORD", "postgres:16-alpine", command,
        "--host=127.0.0.1", "--port=5432", "--username=" + args[1],
    ]
    if command == "pg_dump":
        cmd.extend(["--format=custom", "--no-owner", "--no-acl",
                    "--dbname=" + CI_DATABASE])
    else:
        cmd.extend(["--no-owner", "--no-acl", "--single-transaction",
                    "--dbname=" + RESTORE_DATABASE])
    try:
        subprocess.run(
            cmd, check=True, timeout=120, env=process_env,
            stdout=stream if output else subprocess.DEVNULL,
            stdin=None if output else stream,
            stderr=subprocess.PIPE,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        # Never disclose stderr that may contain connection strings.
        raise RuntimeError("Falló el ensayo local de pg_dump/pg_restore.") from None


def snapshot(url: str) -> dict:
    with psycopg.connect(url) as conn:
        result = {}
        for name in TABLES:  # Static identifiers only; never user input.
            result[name] = conn.execute("SELECT count(*) FROM public." + name).fetchone()[0]
        result["migrations"] = conn.execute(
            "SELECT version, checksum FROM schema_migrations ORDER BY version"
        ).fetchall()
        result["user_ids"] = conn.execute("SELECT id FROM users ORDER BY id").fetchall()
        result["project_ids"] = conn.execute("SELECT id FROM projects ORDER BY id").fetchall()
        return result


def main():
    url = os.environ.get("TEST_DATABASE_URL", "")
    config = assert_local_ci_target(url)
    before = snapshot(url)
    if len(before["migrations"]) != 5:
        raise RuntimeError("El origen CI aún no tiene las cinco migraciones.")
    user = config["user"]
    password = config.get("password", "")
    admin_url = make_conninfo(url, dbname=CI_DATABASE)
    restore_url = make_conninfo(url, dbname=RESTORE_DATABASE)
    created = False
    with tempfile.TemporaryDirectory(prefix="neurolab-ci-backup-") as folder:
        dump = Path(folder) / "backup.dump"
        try:
            with psycopg.connect(admin_url, autocommit=True) as admin:
                # Never delete/overwrite an existing database.
                admin.execute("CREATE DATABASE " + RESTORE_DATABASE)
                created = True
            with dump.open("wb") as output:
                run_postgres_tool("pg_dump", [password, user], output, output=True)
            if dump.stat().st_size < 512:
                raise RuntimeError("El respaldo generado está vacío.")
            with dump.open("rb") as source:
                run_postgres_tool("pg_restore", [password, user], source, output=False)
            after = snapshot(restore_url)
            if before != after:
                raise RuntimeError("El respaldo restaurado no coincide con el original.")
            print("RESPALDO_POSTGRESQL_CI=VERIFICADO")
            print("RESTAURACION_POSTGRESQL_CI=VERIFICADA")
            print("MIGRACIONES_Y_REGISTROS_CI=CONSERVADOS")
            print("ARCHIVO_TEMPORAL_CI=ELIMINADO_AL_FINALIZAR")
        finally:
            if created:
                with psycopg.connect(admin_url, autocommit=True) as admin:
                    admin.execute("DROP DATABASE " + RESTORE_DATABASE + " WITH (FORCE)")


if __name__ == "__main__":
    main()
