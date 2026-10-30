"""Inspección de migraciones PostgreSQL SIN ESCRITURAS.

La consulta de estado funciona con transacción read-only, detecta cambios en
migraciones ya aplicadas, versiones desconocidas y huecos en el historial.
Nunca muestra cadenas de conexión ni contenidos de variables secretas.
"""
import hashlib
import os
import re
from pathlib import Path
import psycopg


class MigrationPlanError(RuntimeError):
    """El historial no es compatible con las migraciones versionadas locales."""


def local_manifest(directory=None):
    folder = Path(directory) if directory else Path(__file__).parent.parent / "migrations"
    files = sorted(folder.glob("*.sql"))
    names = [file.name for file in files]
    if not files or any(not re.fullmatch(r"\d{3}_[a-z0-9_]+\.sql", name) for name in names):
        raise MigrationPlanError("El catálogo de migraciones contiene nombres no válidos.")
    if len(set(names)) != len(names):
        raise MigrationPlanError("Existen nombres de migraciones duplicados.")
    return {file.name: hashlib.sha256(file.read_bytes()).hexdigest() for file in files}


def migration_plan(url=None, directory=None):
    manifest = local_manifest(directory)
    target = url or os.getenv("DATABASE_URL_UNPOOLED") or os.getenv("DATABASE_URL")
    if not target:
        raise MigrationPlanError("Falta DATABASE_URL_UNPOOLED o DATABASE_URL.")
    try:
        with psycopg.connect(target) as conn:
            # Asegura que ni siquiera una futura modificación de esta función
            # pueda cambiar tablas en una consulta de comprobación.
            conn.execute("SET TRANSACTION READ ONLY")
            exists = conn.execute("SELECT to_regclass('public.schema_migrations')").fetchone()[0]
            records = conn.execute(
                "SELECT version, checksum FROM public.schema_migrations ORDER BY version"
            ).fetchall() if exists else []
    except psycopg.Error as error:
        # No incluir str(error), ya que algunos errores pueden contener DSN.
        raise MigrationPlanError("No se pudo consultar PostgreSQL de forma segura.") from None
    applied = {name: digest.strip() for name, digest in records}
    unknown = sorted(set(applied) - set(manifest))
    if unknown:
        raise MigrationPlanError("Existen migraciones aplicadas sin archivo local: " + ", ".join(unknown))
    changed = [name for name, digest in applied.items() if manifest[name] != digest]
    if changed:
        raise MigrationPlanError("La suma SHA-256 de migraciones aplicadas no coincide: " + ", ".join(changed))
    names = list(manifest)
    existing = [name for name in names if name in applied]
    if existing != names[:len(existing)]:
        raise MigrationPlanError("El historial tiene migraciones aplicadas fuera de orden.")
    return {
        "read_only": True,
        "total": len(names),
        "applied": existing,
        "pending": names[len(existing):],
        "ready_to_migrate": True,
        "current": len(existing) == len(names),
    }


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Consultar migraciones de NeuroLab sin escribir en PostgreSQL.")
    parser.add_argument("--require-current", action="store_true",
                        help="Rechazar historial con migraciones pendientes.")
    args = parser.parse_args()
    try:
        result = migration_plan()
    except MigrationPlanError as error:
        parser.error(str(error))
    print("PLAN_MIGRACIONES_SOLO_LECTURA=OK")
    print("MIGRACIONES_APLICADAS=" + ",".join(result["applied"]))
    print("MIGRACIONES_PENDIENTES=" + ",".join(result["pending"]))
    if args.require_current and not result["current"]:
        parser.error("La base todavía tiene migraciones pendientes.")


if __name__ == "__main__":
    main()
