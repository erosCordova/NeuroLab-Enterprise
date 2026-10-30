"""Ventanas de intentos de autenticación compartidas por todas las instancias API.

No se guardan emails, contraseñas ni IPs. Las claves HMAC requieren
NEUROLAB_RATE_LIMIT_SECRET configurado en Render (min. 32 bytes).
Una ventana por email+operación limita intentos repetidos, no ataques
distribuidos con múltiples direcciones de correo.
"""
import hashlib
import hmac
import os
import secrets

from fastapi import HTTPException

WINDOW_MINUTES = 15
MAX_ATTEMPTS = 8


def identifier(email: str, operation: str) -> str:
    secret = os.getenv('NEUROLAB_RATE_LIMIT_SECRET', '')
    if len(secret.encode('utf-8')) < 32:
        # Fallar cerrado: no permitir un login sin defensa por omisión.
        raise HTTPException(503, 'El control de acceso no está configurado en el servidor.')
    data = (operation + ':' + email.strip().casefold()).encode('utf-8')
    return hmac.new(secret.encode('utf-8'), data, hashlib.sha256).hexdigest()


def check_attempt(db, email: str, operation: str) -> str:
    key = identifier(email, operation)
    row = db.execute("""
        INSERT INTO auth_attempt_windows(key_hash, started_at, attempts, updated_at)
        VALUES (%s, now(), 1, now())
        ON CONFLICT(key_hash) DO UPDATE SET
          attempts = CASE
             WHEN auth_attempt_windows.started_at <= now() - interval '15 minutes' THEN 1
             ELSE LEAST(auth_attempt_windows.attempts + 1, 9) END,
          started_at = CASE
             WHEN auth_attempt_windows.started_at <= now() - interval '15 minutes' THEN now()
             ELSE auth_attempt_windows.started_at END,
          updated_at = now()
        RETURNING attempts
    """, (key,)).fetchone()
    # Commit here; otherwise a following HTTP 401 would roll back the attempt.
    if secrets.randbelow(256) == 0:
        db.execute("DELETE FROM auth_attempt_windows WHERE updated_at < now() - interval '24 hours'")
    db.commit()
    if row['attempts'] > MAX_ATTEMPTS:
        raise HTTPException(
            429, 'Demasiados intentos de acceso. Inténtalo nuevamente en 15 minutos.',
            headers={'Retry-After': '900'},
        )
    return key


def clear_attempts(db, key: str) -> None:
    db.execute('DELETE FROM auth_attempt_windows WHERE key_hash=%s', (key,))
    db.commit()
