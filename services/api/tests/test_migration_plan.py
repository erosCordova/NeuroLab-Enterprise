"""El plan de migración nunca aplica cambios, ni siquiera ante fallos."""
from pathlib import Path
import shutil

import psycopg
import pytest

from app.migration_plan import migration_plan, MigrationPlanError, local_manifest
from test_platform import database_setup


@pytest.fixture
def local_migrations(tmp_path):
    original = Path(__file__).parent.parent / "migrations"
    dest = tmp_path / "migrations"
    shutil.copytree(original, dest)
    return dest


def test_current_migration_plan_is_read_only(local_migrations):
    import os
    url = os.environ["TEST_DATABASE_URL"]
    with psycopg.connect(url) as db:
        count_before = db.execute("SELECT count(*) FROM schema_migrations").fetchone()[0]
    result = migration_plan(url, local_migrations)
    with psycopg.connect(url) as db:
        count_after = db.execute("SELECT count(*) FROM schema_migrations").fetchone()[0]
    assert result["read_only"] and result["current"]
    assert result["total"] == 5
    assert result["pending"] == []
    assert count_before == count_after == 5


def test_pending_new_migration_is_reported_not_applied(local_migrations):
    import os
    (local_migrations / "006_future_test.sql").write_text("SELECT 1;\n", encoding="utf8")
    result = migration_plan(os.environ["TEST_DATABASE_URL"], local_migrations)
    assert result["pending"] == ["006_future_test.sql"]
    assert not result["current"] and result["ready_to_migrate"]
    with psycopg.connect(os.environ["TEST_DATABASE_URL"]) as db:
        assert db.execute("SELECT count(*) FROM schema_migrations").fetchone()[0] == 5


def test_modified_applied_migration_stops_preflight(local_migrations):
    import os
    with (local_migrations / "001_platform.sql").open("a", encoding="utf8") as file:
        file.write("\n-- modificación incompatible\n")
    with pytest.raises(MigrationPlanError, match="SHA-256"):
        migration_plan(os.environ["TEST_DATABASE_URL"], local_migrations)


def test_unknown_applied_version_stops_preflight(local_migrations):
    import os
    (local_migrations / "005_auth_attempt_windows.sql").unlink()
    with pytest.raises(MigrationPlanError, match="sin archivo local"):
        migration_plan(os.environ["TEST_DATABASE_URL"], local_migrations)


def test_plan_rejects_invalid_names(local_migrations):
    (local_migrations / "malware.sql").write_text("SELECT 1;", encoding="utf8")
    with pytest.raises(MigrationPlanError, match="nombres no válidos"):
        local_manifest(local_migrations)


def test_migration_plan_requires_explicit_database_configuration(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL_UNPOOLED", raising=False)
    with pytest.raises(MigrationPlanError, match="Falta DATABASE_URL"):
        migration_plan(url="")
