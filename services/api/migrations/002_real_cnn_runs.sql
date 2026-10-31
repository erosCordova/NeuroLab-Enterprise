-- Historial de resultados CNN importados: métricas persistentes, sin imágenes ni pesos.
-- Los datos son declaraciones proporcionadas por el propietario; no equivalen a
-- un entrenamiento ejecutado o certificado por el servidor.
CREATE TABLE real_cnn_runs (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    owner_id uuid NOT NULL REFERENCES users(id),
    imported_at timestamptz NOT NULL DEFAULT now(),
    dataset_fingerprint char(64) NOT NULL CHECK (dataset_fingerprint ~ '^[0-9a-f]{64}$'),
    classes jsonb NOT NULL CHECK (jsonb_typeof(classes) = 'array' AND jsonb_array_length(classes) BETWEEN 2 AND 20),
    samples jsonb NOT NULL CHECK (jsonb_typeof(samples) = 'object'),
    config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
    parameters integer NOT NULL CHECK (parameters BETWEEN 1 AND 5000000),
    requested_epochs integer NOT NULL CHECK (requested_epochs BETWEEN 1 AND 100),
    completed_epochs integer NOT NULL CHECK (completed_epochs BETWEEN 1 AND requested_epochs),
    batch integer NOT NULL CHECK (batch BETWEEN 1 AND 256),
    seed bigint NOT NULL CHECK (seed BETWEEN 0 AND 4294967295),
    metrics jsonb NOT NULL CHECK (jsonb_typeof(metrics) = 'array' AND jsonb_array_length(metrics) BETWEEN 1 AND 100),
    test jsonb NOT NULL CHECK (jsonb_typeof(test) = 'object'),
    source text NOT NULL DEFAULT 'importado' CHECK (source = 'importado')
);
CREATE INDEX real_cnn_runs_owner_project_idx
    ON real_cnn_runs (owner_id, project_id, imported_at DESC);
