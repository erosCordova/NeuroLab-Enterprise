"""Readiness for a *fully migrated* Neon/PostgreSQL schema.

Unlike /health (database connectivity only), this function checks exact
version/checksum parity and the minimum set of required tables. It is read-only.
It reveals no database schema, credentials, users or stored model data.
"""
import psycopg
from app.migration_plan import local_manifest

REQUIRED_TABLES = (
    "public.users", "public.sessions", "public.projects",
    "public.real_cnn_runs", "public.real_cnn_models",
    "public.auth_attempt_windows",
)


def schema_is_ready(db) -> bool:
    try:
        first = db.execute("SELECT to_regclass('public.schema_migrations') AS item").fetchone()
        if (first["item"] if isinstance(first, dict) else first[0]) is None:
            return False
        expected = local_manifest()
        rows = db.execute(
            "SELECT version, checksum FROM public.schema_migrations ORDER BY version"
        ).fetchall()
        current = {
            row["version"] if isinstance(row, dict) else row[0]:
            (row["checksum"] if isinstance(row, dict) else row[1]).strip()
            for row in rows
        }
        if current != expected:
            return False
        result = db.execute(
            "SELECT bool_and(to_regclass(item) IS NOT NULL) AS ready "
            "FROM unnest(%s::text[]) AS items(item)", (list(REQUIRED_TABLES),)
        ).fetchone()
        return bool(result["ready"] if isinstance(result, dict) else result[0])
    except (psycopg.Error, ValueError, OSError):
        return False
