# Respaldos y recuperación de modelos CNN

La interfaz de NeuroLab Enterprise incluye una copia portátil **sin ZIP** de cada modelo TensorFlow.js entrenado en el navegador. Este bloque está en la rama `fix/validacion-frontend-cnn` y aún **no se ha desplegado en Vercel**.

## Descargar un respaldo

1. Abre **Entrenamientos**, entrena una CNN real o selecciona una ejecución TensorFlow.js del historial conectado.
2. Haz clic en **Descargar respaldo CNN**.
3. Guarda el archivo `.ncnn`. Contiene arquitectura, pesos, métricas, clases, particiones y huella declarada del dataset. No incluye imágenes originales ni credenciales.
4. Conserva este archivo en una ubicación segura: mientras los pesos solo estén en IndexedDB, limpiar el navegador o cambiar de dispositivo podría eliminarlos.

## Restaurar y predecir sin reentrenar

1. Abre la página de NeuroLab en el navegador donde quieres recuperar el modelo.
2. Abre el **mismo proyecto** y selecciona **Entrenamientos**. No necesitas volver a cargar el dataset para restaurar.
3. En **Respaldo del modelo CNN**, selecciona **Restaurar respaldo .ncnn**.
4. Se verifica que el archivo pertenece al proyecto, que su tamaño es compatible, que el SHA-256 coincide y que la topología y el número de parámetros corresponden a la CNN original.
5. Tras restaurarlo, sube una imagen en **Reconocer una imagen con los pesos guardados**. La predicción se hace sobre el modelo almacenado y **no vuelve a entrenarlo**.

También es posible restaurar un respaldo asociado a una ejecución seleccionada en **Resultados CNN reales**, siempre que coincida el identificador del entrenamiento. Los datos del historial permanecen en PostgreSQL únicamente si la API ya los había registrado.

## Formato y limitaciones

- Un único archivo binario `.ncnn` de NeuroLab, con versión de formato, metadatos JSON y matriz de pesos Float32.
- La huella SHA-256 detecta cambios accidentales en los pesos, **no certifica el origen del modelo** ni la veracidad de las métricas.
- Tamaño máximo de respaldo: alrededor de 4.5 MiB; pesos máximos 4 MiB; arquitectura/metadatos máximos 512 KiB.
- Rechaza modelos ajenos al proyecto, arquitecturas incompatibles y archivos incompletos. No sobrescribe modelos existentes automáticamente.
- El respaldo es portable **entre instalaciones de NeuroLab**; no equivale a un archivo `.keras` de Python ni a un modelo servido por Render.
- Restaurar un modelo **no inserta un nuevo registro en Neon** ni elimina otros modelos.
- Los modelos son datos procesables de origen externo. No importes archivos desconocidos o que no provengan de una fuente de confianza.

## Evidencia

- Pruebas de serialización, checksum, detección de alteraciones y carga de pesos en la suite `model-backup.test.mjs`.
- Prueba de extremo a extremo en Chromium: entrenamiento real, descarga de respaldo, restauración en contexto nuevo y predicción sin reentrenamiento.
- Verificado: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40998937195 (19/19 casos Chromium, incluidas restauración y predicción), https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40998937185 (API + PostgreSQL) y https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40998937139 (motor Python/Keras).
