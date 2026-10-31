# Motor CNN real — Python / TensorFlow / Keras

**Alcance:** el backend incluye un motor de entrenamiento real **separado del servicio web**. Ya no es necesario inventar gráficas: `model.fit` calcula precisión y pérdida a partir de los píxeles reales. La interfaz pública **todavía sigue en modo demo** hasta que exista un trabajador de entrenamiento integrado; no se activó una tarea pesada en el plan Free de Render.

## Funciones reales del motor

- Carga PNG, JPG y WebP desde `dataset/clase/imagen.png`, con 2 a 20 clases y al menos tres imágenes por clase.
- Rechaza duplicados exactos para evitar contaminación entre entrenamiento, validación y prueba.
- Redimensiona con PIL, convierte a grises o RGB y normaliza a valores entre 0 y 1.
- Divide por clase con semilla y particiones disjuntas; el test permanece aislado durante el ajuste.
- Construye Conv2D + MaxPooling opcional + Flatten + Dense, con activaciones ReLU/Tanh, dropout, regularización L2 y parada temprana con restauración de pesos.
- Entrena en TensorFlow/Keras (no simulado), evalúa una vez sobre test y guarda `model.keras` y `metrics.json`.
- Predice sobre una imagen nueva reutilizando `model.keras` **sin volver a entrenar**.
- Valida la arquitectura para los mismos límites del constructor React (5 millones de parámetros como máximo).

## Ejecutarlo localmente (Git Bash actual)

Desde `services/api`, instala un entorno Python 3.12 adecuado y ejecuta:

```bash
python -m pip install -r requirements-ml.txt
python -m app.real_cnn train --dataset "/c/ruta/dataset" --output "/c/ruta/resultados/cnn-001" --epochs 20 --batch 16
python -m app.real_cnn predict --model-dir "/c/ruta/resultados/cnn-001" --image "/c/ruta/imagen.png"
```

Si dispones de un JSON de arquitectura exportado desde el diseñador, añade `--config "/c/ruta/arquitectura.json"` al entrenamiento. Usa una carpeta de salida nueva por entrenamiento para conservar versiones y no sobrescribir pesos.

**Pruebas:** `python -m pytest -q tests/test_real_cnn.py`. El workflow `cnn-training.yml` prepara TensorFlow CPU en GitHub Actions y entrena un conjunto mínimo de imágenes sintéticas únicamente para comprobar el software. **Los resultados de esa prueba no son indicadores de calidad del modelo.**

## Limitaciones actuales

- Ejecutable por CLI; no hay endpoints ni cola remota para subir y procesar datasets desde la página publicada.
- Los pesos se guardan en archivos locales; no persisten en Neon ni en almacenamiento de objetos.
- El entrenamiento intenso necesita recursos de cómputo que deben medirse antes de seleccionar un servicio. No ampliar ni contratar planes sin autorización.
- La selección de particiones en Python es reproducible, pero puede diferir de la mezcla de índices de JavaScript; la UI debe enviar el manifiesto de división en la futura integración.
- No afirmar que la fase 3 del producto terminó hasta demostrar flujo React → API → motor CNN → almacenamiento → métricas reales → predicción y recuperación.
