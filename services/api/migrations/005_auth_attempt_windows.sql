-- Protección compartida contra intentos repetidos en una misma cuenta.
-- key_hash es un HMAC SHA-256 del email normalizado y la operación.
-- No almacena emails, contraseñas o IP; puede limpiarse tras 24 horas.
CREATE TABLE auth_attempt_windows (
    key_hash char(64) PRIMARY KEY,
    started_at timestamptz NOT NULL DEFAULT now(),
    attempts integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 9),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_attempt_windows_updated_idx ON auth_attempt_windows(updated_at);
