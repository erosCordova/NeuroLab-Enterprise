-- Registro de modelos entrenados en navegador. Solo metadatos, nunca pesos.
CREATE TABLE real_cnn_models (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES users(id),
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 run_id uuid NOT NULL REFERENCES real_cnn_runs(id) ON DELETE CASCADE,
 display_name varchar(80) NOT NULL CHECK (char_length(trim(display_name))>=3),
 notes varchar(1000) NOT NULL DEFAULT '',
 status varchar(16) NOT NULL DEFAULT 'Registrado' CHECK(status IN ('Registrado','Archivado')),
 favorite boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,project_id,run_id)
);
CREATE INDEX real_cnn_models_owner_project_idx
 ON real_cnn_models(owner_id,project_id,favorite DESC,updated_at DESC);
