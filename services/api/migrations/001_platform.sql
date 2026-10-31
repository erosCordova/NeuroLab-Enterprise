CREATE TABLE users (
    id uuid PRIMARY KEY,
    email text NOT NULL UNIQUE,
    display_name varchar(80) NOT NULL,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
    token_hash char(64) PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE TABLE projects (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users(id),
    name varchar(80) NOT NULL CHECK (char_length(name) >= 3),
    normalized_name text NOT NULL,
    description varchar(1000) NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'Activo' CHECK (status IN ('Activo', 'En preparación', 'Archivado')),
    tags jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(tags) = 'array' AND jsonb_array_length(tags) <= 6),
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_id, normalized_name)
);
