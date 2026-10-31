-- Mantener reportes del motor Python y admitir entrenamientos TensorFlow.js
-- con pesos guardados exclusivamente en IndexedDB del navegador del usuario.
ALTER TABLE real_cnn_runs
  ADD COLUMN engine text NOT NULL DEFAULT 'TensorFlow/Keras'
    CHECK (engine IN ('TensorFlow/Keras','TensorFlow.js'));
ALTER TABLE real_cnn_runs
  ADD COLUMN weights_file text NOT NULL DEFAULT 'model.keras'
    CHECK (weights_file IN ('model.keras','model.json'));
ALTER TABLE real_cnn_runs
  ADD COLUMN model_ref varchar(240);
ALTER TABLE real_cnn_runs DROP CONSTRAINT real_cnn_runs_source_check;
ALTER TABLE real_cnn_runs
  ADD CONSTRAINT real_cnn_runs_source_check
  CHECK (
    (source='importado' AND engine='TensorFlow/Keras' AND weights_file='model.keras' AND model_ref IS NULL)
    OR
    (source='navegador' AND engine='TensorFlow.js' AND weights_file='model.json'
      AND model_ref LIKE 'indexeddb://neurolab-cnn-%')
  );
