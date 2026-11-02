# Manual de usuario — NeuroLab Enterprise

## 1. Acceder y crear proyecto

Inicia sesión en el frontend conectado con la API. Si aún no tienes proyectos, crea uno desde la pantalla de bienvenida. No se generan cuentas de demostración ni proyectos automáticos.

## 2. Cargar dataset

En **Datasets**, selecciona una carpeta con una subcarpeta por clase (PNG, JPG o WebP), un origen MNIST/Fashion-MNIST o un CSV compatible. Comprueba las clases, separaciones y archivos. Usa el dataset activo del proyecto para iniciar el entrenamiento.

## 3. Entrenar un modelo propio

Abre **Diseñador CNN** y selecciona el modo **Automático** o **Manual**. En **Entrenamientos → Modelo entrenado en NeuroLab**, selecciona los parámetros reales e inicia **Entrenar CNN real**. Durante el entrenamiento verás épocas y métricas obtenidas por TensorFlow.js, no simulaciones.

La arquitectura se muestra en el diagrama CNN. Antes de la primera medición solo se dibuja su estructura; cuando hay mediciones se pueden inspeccionar las activaciones y mapas de características que corresponden a la imagen de validación examinada. Los enlaces dibujados son esquemáticos y no representan pesos individuales.

Al terminar, revisa la precisión, pérdida, resultados de prueba y predicciones. Guarda una copia `.ncnn` cuando sea necesario.

## 4. Utilizar un modelo preentrenado

En **Entrenamientos → Modelo preentrenado importado**, selecciona un `.ncnn` compatible de NeuroLab o un modelo de Colab previamente convertido. La importación no reentrena ni reemplaza la CNN local.

Selecciona el modelo importado y carga imágenes nuevas. Cuando la CNN es compatible con MNIST, puede segmentar múltiples dígitos y mostrar las predicciones individuales con sus niveles de confianza.

## 5. Administrar modelos

Puedes consultar, renombrar y eliminar modelos importados desde su catálogo. Los modelos locales se administran desde el historial y el registro de modelos.

Antes de eliminar debes confirmar la operación. **La eliminación de pesos de IndexedDB es definitiva en ese navegador**, salvo que cuentes con un respaldo descargado. Los informes históricos guardados en PostgreSQL se mantienen separados de los pesos.

## 6. Evaluar y generar informes

En **Evaluación** y **Reportes** se consultan únicamente métricas de entrenamientos reales registrados. Sin conexión a la API, las comparaciones persistentes no están disponibles y no se muestran cifras sustitutas. No existen colas simuladas, usuarios ficticios ni curvas generadas por fórmulas.

## 7. Privacidad y limitaciones

Los pesos entrenados o importados en el navegador permanecen en IndexedDB. Cambiar de equipo o limpiar los datos del sitio puede perder esos pesos. El modelo guardado y su rendimiento no están garantizados para todas las fotografías: verifica los resultados con datos de prueba independientes.