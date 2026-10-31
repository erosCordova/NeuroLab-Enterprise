"""Read-only production configuration gate for Render.

This module never connects to Postgres, changes remote resources, or prints
secret values. Production checks run before any database migration.
"""
import os
from urllib.parse import urlsplit


class ReleaseConfigurationError(RuntimeError):
    """Missing or unsafe production configuration (names only, never values)."""


def _canonical_https_origin(value: str) -> bool:
    try:
        parsed = urlsplit(value)
        return (
            parsed.scheme == "https"
            and bool(parsed.hostname)
            and bool(parsed.hostname.count("."))
            and not parsed.username
            and not parsed.password
            and parsed.port is None
            and not parsed.path
            and not parsed.query
            and not parsed.fragment
            and "*" not in value
            and parsed.hostname not in ("localhost", "127.0.0.1")
        )
    except ValueError:
        return False


def validate_render_config(env=None):
    """Verify required production variables *without reporting their values*.

    Render's RENDER=true marker is used instead of implicitly assuming any
    generic CI container is production. CI invokes this with synthetic data.
    """
    values = os.environ if env is None else env
    if values.get("RENDER", "").lower() != "true":
        return {"production": False, "valid": True}
    issues = []
    for key in ("DATABASE_URL", "DATABASE_URL_UNPOOLED"):
        if not values.get(key, "").strip():
            issues.append(key + " es obligatorio")
    secret = values.get("NEUROLAB_RATE_LIMIT_SECRET", "")
    if len(secret.encode("utf-8")) < 32:
        issues.append("NEUROLAB_RATE_LIMIT_SECRET requiere al menos 32 bytes")
    if values.get("COOKIE_SECURE", "true").strip().lower() != "true":
        issues.append("COOKIE_SECURE debe ser true")
    raw_origins = values.get("APP_ORIGINS", "")
    origins = raw_origins.split(",") if raw_origins.strip() else []
    if not origins or any(not _canonical_https_origin(origin.strip()) for origin in origins):
        issues.append("APP_ORIGINS requiere orígenes HTTPS exactos sin comodines")
    if not any(_canonical_https_origin(origin.strip()) and
               not origin.strip().endswith(".onrender.com") for origin in origins):
        issues.append("APP_ORIGINS debe incluir al menos un dominio HTTPS del frontend")
    if issues:
        # No database URIs, tokens, domains or other secret values in logs.
        raise ReleaseConfigurationError("Configuración Render no apta: " + "; ".join(issues))
    return {"production": True, "valid": True, "origin_count": len(origins)}
