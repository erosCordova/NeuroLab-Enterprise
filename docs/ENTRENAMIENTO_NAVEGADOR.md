# Entrenamiento CNN real desde la página de NeuroLab

## Arquitectura sin costo de GPU en Render

- **Frontend en Vercel**: React + Vite y TensorFlow.js 4.22.0. El cálculo y los píxeles del dataset permanecen en el navegador durante el entrenamiento.
- **Backend en Render**: FastAPI recibe y valida solo informes JSON (métricas y configuración). **No ejecuta TensorFlow.js ni TensorFlow Python**.
- **PostgreSQL en Neon**: `real_cnn_runs` registra historial con clase, huella, configuración, métricas por época y evaluación en test. Los registros se aíslan por propietario y proyecto.
- **Pesos**: `model.save("indexeddb://...")` guarda el modelo TensorFlow.js en el navegador. El identificador `model_ref` se almacena en Neon para localizarlo, **pero los pesos nunca se guardan en Neon ni Render**. Si se borran los datos del navegador o se usa otro equipo, el modelo no estará disponible allí.

Esta modalidad no necesita abrir un servidor local para el usuario final: al publicar el bloque en Vercel, la página ejecutará el entrenamiento directamente en el navegador del usuario.

## Flujo de uso tras el próximo despliegue autorizado

1. Iniciar sesión, abrir un proyecto y cargar imágenes organizadas por clase.
2. Aplicar dataset con particiones de entrenamiento, validación y test.
3. Entrar a **Entrenamientos → Entrenar CNN con TensorFlow.js**.
4. Seleccionar entre 1 y 40 épocas, batch de 1 a 64 y pulsar **Entrenar CNN real**.
5. Revisar las curvas reales, la precisión de test y la pérdida de test. Si está autenticado y la API está disponible, se registran en Neon.
6. En **Resultados CNN reales**, seleccionar el entrenamiento y subir una imagen distinta para predecir con los pesos guardados, **sin reentrenar**.

## Límites de seguridad y capacidad

- Máximo **200 imágenes**, entrada de **32 × 32** píxeles, arquitectura de **500 000 parámetros**, hasta **40 épocas** para proteger memoria y recursos de dispositivos.
- Durante entrenamiento/validación no se consulta el conjunto test; se evalúa después del ajuste.
- Las clases deben aparecer en entrenamiento, validación y prueba. Las divisiones siguen el dataset aplicado.
- Las imágenes pueden usar escala de grises o RGB. Se redimensionan en Canvas y normalizan a 0..1; transparencia sobre fondo blanco.
- La semilla controla las particiones realizadas al aplicar dataset; la inicialización utiliza semillas fijas por capa. El entrenamiento paralelo del navegador y WebGL pueden introducir variaciones.
- La cancelación se procesa al terminar la época en curso. Si se cancela no se guardan métricas ni un modelo nuevo.
- **No confundir** la cola antigua de demostración con la nueva sección real. Los reportes creados por clientes no están certificados por el servidor; no deben emplearse como prueba independiente de rendimiento.
- Los modelos generados por Python/Keras (`.keras`) son diferentes de los modelos TensorFlow.js (`model.json` en IndexedDB). El motor Python sigue disponible por separado para uso con mayor capacidad.

## Verificación y despliegue controlado

- `npm run test:unit` comprueba arquitecturas CNN binarias/multiclase utilizando entrenamiento TensorFlow.js CPU sin datos externos.
- `npm run test:e2e` incluye flujo en Chromium con imágenes sintéticas; esta prueba comprueba ejecución y guardado, **no precisión científica**.
- `python -m pytest -q --tb=short --ignore=tests/test_real_cnn.py` valida API, migraciones y aislamiento de resultados.
- `cnn-training.yml` valida por separado el motor TensorFlow/Keras Python.
- **No desplegar automáticamente** este bloque. Mantenerlo en `fix/validacion-frontend-cnn` hasta autorización explícita.

## Cancelación y limpieza de memoria

Si se cancela un entrenamiento TensorFlow.js, el motor evita presentar el resultado como completado y libera sus tensores de entrenamiento y las copias temporales usadas para la parada temprana. Si la cancelación llega mientras IndexedDB guarda los pesos, intenta retirar ese modelo para que no quede como una ejecución finalizada. Si no puede eliminarlo, lo indica con un mensaje explícito.
