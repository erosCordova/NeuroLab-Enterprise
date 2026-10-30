"""Migraciones de Render: fallar cerrado si no se autorizó su lista exacta."""
from unittest.mock import patch
import pytest
from app.migration_release_gate import (
    approve_production_migrations,
    MigrationApprovalError, APPROVAL_VALUE,
)


def plan(*pending):
    return {"pending": list(pending), "applied": ["001_platform.sql"]}


def test_non_production_migrations_preserve_local_test_flow():
    # No consulta un servidor real; CI sigue usando bases efímeras.
    assert approve_production_migrations("not-a-real-dsn", {}) == {
        "production": False, "checked": False
    }


def test_production_without_pending_changes_does_not_require_approval():
    with patch("app.migration_release_gate.migration_plan", return_value=plan()):
        result = approve_production_migrations(
            "synthetic", {"RENDER": "true"})
    assert result == {"production": True, "checked": True, "pending": []}


@pytest.mark.parametrize("env", [
    {"RENDER": "true"},
    {"RENDER": "true", "NEUROLAB_MIGRATION_RELEASE": APPROVAL_VALUE},
    {"RENDER": "true", "NEUROLAB_EXPECTED_MIGRATIONS": "002_real_cnn_runs.sql"},
    {"RENDER": "true", "NEUROLAB_MIGRATION_RELEASE": "true",
     "NEUROLAB_EXPECTED_MIGRATIONS": "002_real_cnn_runs.sql"},
    {"RENDER": "true", "NEUROLAB_MIGRATION_RELEASE": APPROVAL_VALUE,
     "NEUROLAB_EXPECTED_MIGRATIONS": "002_real_cnn_runs.sql,003_browser_cnn.sql"},
    {"RENDER": "true", "NEUROLAB_MIGRATION_RELEASE": APPROVAL_VALUE,
     "NEUROLAB_EXPECTED_MIGRATIONS": "002_real_cnn_runs.sql "},
])
def test_migration_is_blocked_without_two_exact_release_conditions(env):
    with patch("app.migration_release_gate.migration_plan",
               return_value=plan("002_real_cnn_runs.sql")):
        with pytest.raises(MigrationApprovalError, match="autorización explícita") as err:
            approve_production_migrations("synthetic", env)
    assert "synthetic" not in str(err.value)
    assert "002_real" not in str(err.value)


def test_matching_explicit_authorization_allows_only_reviewed_set():
    names = ("002_real_cnn_runs.sql", "003_browser_cnn.sql",
             "004_real_cnn_models.sql", "005_auth_attempt_windows.sql")
    env = {"RENDER": "true", "NEUROLAB_MIGRATION_RELEASE": APPROVAL_VALUE,
           "NEUROLAB_EXPECTED_MIGRATIONS": ",".join(names)}
    with patch("app.migration_release_gate.migration_plan",
               return_value=plan(*names)):
        result = approve_production_migrations("synthetic", env)
    assert result["pending"] == list(names)
    assert result["checked"] is True


def test_failed_read_only_schema_verification_is_not_ignored():
    from app.migration_plan import MigrationPlanError
    with patch("app.migration_release_gate.migration_plan",
               side_effect=MigrationPlanError("hash mismatch")):
        with pytest.raises(MigrationPlanError):
            approve_production_migrations("synthetic", {
                "RENDER": "true",
                "NEUROLAB_MIGRATION_RELEASE": APPROVAL_VALUE,
                "NEUROLAB_EXPECTED_MIGRATIONS": "002_real_cnn_runs.sql",
            })
