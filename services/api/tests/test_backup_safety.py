"""Bloquear el ensayo de respaldo fuera de la base temporal de GitHub CI."""
import pytest
from rehearse_backup_restore import assert_local_ci_target


@pytest.fixture
def ci_env():
    return {"GITHUB_ACTIONS": "true", "NEUROLAB_CI_BACKUP_REHEARSAL": "1"}


def test_local_ci_database_is_allowed(ci_env):
    result = assert_local_ci_target(
        "postgresql://user:fake@127.0.0.1:5432/neurolab_test", ci_env)
    assert result["dbname"] == "neurolab_test"


@pytest.mark.parametrize("url", [
    "postgresql://user:fake@neon.tech:5432/neurolab_test",
    "postgresql://user:fake@localhost:5432/neurolab",
    "postgresql://user:fake@127.0.0.1:55433/neurolab_test",
    "postgresql://user:fake@localhost:5432/postgres",
    "postgresql://user:fake@127.0.0.1:5432/neurolab_restore_ci",
])
def test_forbid_non_ci_or_remote_targets(url, ci_env):
    with pytest.raises(RuntimeError, match="restringido"):
        assert_local_ci_target(url, ci_env)


def test_requires_two_explicit_ci_guards():
    url = "postgresql://user:fake@localhost:5432/neurolab_test"
    for env in ({}, {"GITHUB_ACTIONS": "true"},
                {"NEUROLAB_CI_BACKUP_REHEARSAL": "1"}):
        with pytest.raises(RuntimeError, match="GitHub CI"):
            assert_local_ci_target(url, env)
