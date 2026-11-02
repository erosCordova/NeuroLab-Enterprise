# NeuroLab Enterprise

Plataforma para entrenar, evaluar, importar y gestionar modelos de inteligencia artificial con datos reales. Frontend React y TensorFlow.js; API FastAPI con persistencia de cuentas, proyectos e informes en PostgreSQL cuando está configurada.

## Funcionalidad disponible
- Crear y administrar proyectos y datasets de imágenes, MNIST, Fashion-MNIST y tablas CSV.
- Configurar la CNN en modo automático o manual y entrenarla realmente en el navegador con TensorFlow.js.
- Consultar épocas, precisión, pérdida, prueba independiente y activaciones calculadas en una imagen de validación.
- Guardar pesos entrenados en IndexedDB; exportarlos como respaldos `.ncnn`.
- Importar modelos preentrenados compatibles, incluidos los convertidos desde Colab, sin modificar los entrenamientos locales.
- Realizar predicciones y clasificar múltiples dígitos por imagen en las CNN MNIST compatibles.
- Administrar modelos y eliminarlos de forma selectiva con confirmación.
- Consultar reportes de entrenamientos reales almacenados en la API.

**No se publican simulaciones de entrenamiento, métricas sintéticas, usuarios ficticios ni reportes inventados.** El diagrama de arquitectura es estructural; solo muestra activaciones cuando TensorFlow.js ha obtenido una medición.

## Configuración

El frontend necesita la API configurada para habilitar cuentas y proyectos. Si falta, muestra un aviso de conexión en lugar de crear una cuenta o un proyecto de ejemplo. Consulta [Conexión React/API](docs/CONEXION_REACT_API.md), [Neon](docs/NEON.md) y [Despliegue Render](docs/DESPLIEGUE_RENDER.md).

Para desarrollo, desde `apps/web`:

```bash
npm ci
npm run build
npm run test:unit
```

Las pruebas pueden utilizar datasets sintéticos **solo como fixtures de prueba automatizada**, nunca como datos de producción. Los archivos de pruebas no se presentan como entrenamientos reales.

## Restricciones de los modelos

Los pesos del navegador quedan en IndexedDB del dispositivo. Borrar datos del sitio puede eliminarlos; exporta un `.ncnn` para conservar una copia. El historial de métricas persistente en la API no equivale a una copia de pesos. Las importaciones compatibles se guardan como modelos independientes. La precisión depende del dataset y debe medirse con conjuntos de validación y prueba separados.

Manual actualizado: [Manual de usuario](docs/MANUAL_USUARIO.md).