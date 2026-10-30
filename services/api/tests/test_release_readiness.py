"""Deployment gate: no secret reads, production-only validation, fail fast."""
import pytest
from app.release_readiness import validate_render_config, ReleaseConfigurationError
from app import serve


def test_local_ci_does_not_require_production_secrets():
    assert validate_render_config({}) == {"production": False, "valid": True}
    assert validate_render_config({"RENDER": "false"})["valid"]


def valid_config():
    return {
        "RENDER": "true",
        "DATABASE_URL": "postgresql://masked.invalid/neurolab",
        "DATABASE_URL_UNPOOLED": "postgresql://masked.invalid/neurolab",
        "APP_ORIGINS": "https://neurolab-enterprise-xi.vercel.app",
        "COOKIE_SECURE": "true",
        "NEUROLAB_RATE_LIMIT_SECRET": "synthetic-ci-only-configuration-not-for-use-123456789",
    }


def test_render_production_with_safe_vars_is_ready_and_redacted():
    response = validate_render_config(valid_config())
    assert response == {"production": True, "valid": True, "origin_count": 1}
    assert "postgresql" not in str(response)


@pytest.mark.parametrize("key", [
    "DATABASE_URL", "DATABASE_URL_UNPOOLED", "NEUROLAB_RATE_LIMIT_SECRET", "APP_ORIGINS",
])
def test_missing_production_dependency_blocks_startup(key):
    config = valid_config()
    config.pop(key)
    with pytest.raises(ReleaseConfigurationError) as err:
        validate_render_config(config)
    assert key in str(err.value)
    assert "postgresql://" not in str(err.value)


@pytest.mark.parametrize("origins", [
    "http://neurolab-enterprise-xi.vercel.app",
    "https://neurolab-enterprise-xi.vercel.app/",
    "https://*.vercel.app",
    "https://neurolab-enterprise-xi.vercel.app/login",
    "https://neurolab-enterprise-xi.vercel.app,https://localhost",
    "null",
])
def test_origin_must_be_exact_https_without_wildcards(origins):
    config = valid_config()
    config["APP_ORIGINS"] = origins
    with pytest.raises(ReleaseConfigurationError, match="APP_ORIGINS"):
        validate_render_config(config)


def test_cookie_security_and_short_secret_are_blocked_without_leaks():
    config = valid_config()
    config["COOKIE_SECURE"] = "false"
    config["NEUROLAB_RATE_LIMIT_SECRET"] = "not-a-secure-key"
    with pytest.raises(ReleaseConfigurationError) as err:
        validate_render_config(config)
    assert "COOKIE_SECURE" in str(err.value)
    assert "NEUROLAB_RATE_LIMIT_SECRET" in str(err.value)
    assert "not-a-secure-key" not in str(err.value)


def test_render_gate_is_checked_before_any_migration(monkeypatch):
    events = []
    monkeypatch.setattr(serve, "validate_render_config",
                        lambda: (_ for _ in ()).throw(ReleaseConfigurationError("bloqueo esperado")))
    monkeypatch.setattr(serve, "migrate", lambda: events.append("migracion"))
    monkeypatch.setattr(serve.uvicorn, "run", lambda *_a, **_k: events.append("server"))
    with pytest.raises(ReleaseConfigurationError, match="bloqueo esperado"):
        serve.main()
    assert events == []


def test_render_gate_allows_migration_when_valid(monkeypatch):
    events = []
    monkeypatch.setattr(serve, "validate_render_config", lambda: {"valid": True})
    monkeypatch.setattr(serve, "migrate", lambda: events.append("migracion"))
    monkeypatch.setattr(serve.uvicorn, "run", lambda *_a, **_k: events.append("server"))
    monkeypatch.setenv("PORT", "10000")
    serve.main()
    assert events == ["migracion", "server"]
