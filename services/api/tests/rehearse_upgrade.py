"""Ensayar actualización 001 -> 005 en una base TEMPORAL de GitHub Actions.

REQUIERE la base de CI neurolab_test en localhost. Nunca acepta Neon o
servidores externos. No lee ni modifica el entorno de Render o Vercel.
"""
import hashlib
import os
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from app.migrate import migrate
from app.migration_plan import migration_plan

TEST_DB = "neurolab_test"
UPGRADE_DB = "neurolab_upgrade_ci"


def main():
    url = os.environ.get("TEST_DATABASE_URL", "")
    try:
        parsed = conninfo_to_dict(url)
    except psycopg.Error:
        raise RuntimeError("URL de la base de pruebas inválida.") from None
    if parsed.get("host") not in ("localhost", "127.0.0.1") or parsed.get("dbname") != TEST_DB:
        raise RuntimeError("El ensayo solo está permitido sobre PostgreSQL local de GitHub CI.")
    # Autocommit para CREATE DATABASE. El nombre no procede de la URL.
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(f"CREATE DATABASE {UPGRADE_DB}")
    test_url = make_conninfo(url, dbname=UPGRADE_DB)
    migrations = Path(__file__).parent.parent / "migrations"
    file001 = migrations / "001_platform.sql"
    synthetic_id = uuid4()
    project_id = uuid4()
    with psycopg.connect(test_url) as connection:
        connection.execute(file001.read_text(encoding="utf-8"))
        connection.execute(
            "CREATE TABLE schema_migrations (version text PRIMARY KEY, checksum char(64) NOT NULL, "
            "applied_at timestamptz NOT NULL DEFAULT now())"
        )
        checksum = hashlib.sha256(file001.read_bytes()).hexdigest()
        connection.execute(
            "INSERT INTO schema_migrations(version, checksum) VALUES (%s, %s)",
            ("001_platform.sql", checksum),
        )
        connection.execute(
            "INSERT INTO users(id,email,display_name,password_hash) VALUES (%s,%s,%s,%s)",
            (synthetic_id, "registro-historico@example.invalid", "Cuenta de ensayo", "synthetic-hash"),
        )
        connection.execute(
            "INSERT INTO projects(id,owner_id,name,normalized_name) VALUES (%s,%s,%s,%s)",
            (project_id, synthetic_id, "Proyecto histórico", "proyecto historico"),
        )
    before = migration_plan(test_url)
    expected = [f"{i:03d}_{name}.sql" for i, name in [
        (2,"real_cnn_runs"),(3,"browser_cnn"),(4,"real_cnn_models"),(5,"auth_attempt_windows")
    ]]
    assert before["applied"] == ["001_platform.sql"] and before["pending"] == expected, before
    # Simula el arranque de Render SOBRE LA BASE EFÍMERA del ensayo:
    # sin dos confirmaciones exactas debe rechazar antes de tocar tablas.
    from app.migration_release_gate import MigrationApprovalError, APPROVAL_VALUE
    import os
    saved = {key: os.environ.get(key) for key in (
        "RENDER", "NEUROLAB_MIGRATION_RELEASE", "NEUROLAB_EXPECTED_MIGRATIONS"
    )}
    try:
        os.environ["RENDER"] = "true"
        os.environ.pop("NEUROLAB_MIGRATION_RELEASE", None)
        os.environ.pop("NEUROLAB_EXPECTED_MIGRATIONS", None)
        try:
            migrate(test_url)
            raise AssertionError("Producción migró sin autorización.")
        except MigrationApprovalError:
            pass
        assert migration_plan(test_url) == before
        os.environ["NEUROLAB_MIGRATION_RELEASE"] = APPROVAL_VALUE
        os.environ["NEUROLAB_EXPECTED_MIGRATIONS"] = ",".join(expected)
        migrate(test_url)
    finally:
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
    after = migration_plan(test_url)
    assert after["current"] and len(after["applied"]) == 5 and not after["pending"], after
    with psycopg.connect(test_url) as conn:
        assert conn.execute("SELECT display_name FROM users WHERE id=%s",(synthetic_id,)).fetchone()[0] == "Cuenta de ensayo"
        assert conn.execute("SELECT name FROM projects WHERE id=%s",(project_id,)).fetchone()[0] == "Proyecto histórico"
        assert conn.execute("SELECT to_regclass('public.real_cnn_runs')").fetchone()[0] is not None
        assert conn.execute("SELECT to_regclass('public.real_cnn_models')").fetchone()[0] is not None
        assert conn.execute("SELECT to_regclass('public.auth_attempt_windows')").fetchone()[0] is not None
    # Repetir todas las migraciones no debe cambiar el historial ni los registros.
    migrate(test_url)
    again = migration_plan(test_url)
    assert again == after
    print("ENSAYO_MIGRACION_001_A_005=APROBADO")
    print("REGISTROS_HISTORICOS=CONSERVADOS")
    print("MIGRACIONES_REPETIDAS=IDEMPOTENTES")
    # Base y datos son sintéticos; serán destruidos con el contenedor PG de CI.


if __name__ == "__main__":
    main()
