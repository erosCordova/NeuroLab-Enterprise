# NeuroLab Enterprise — Exposición CNN

Duración orientativa: cinco minutos.

## Preparación

Iniciar el frontend y tener localizada la carpeta MNIST.
No recargar la página después de preparar la demostración.
Configurar cinco épocas para que la simulación termine rápidamente.

## 1. Presentación

"Mi proyecto es NeuroLab Enterprise, una plataforma educativa para
diseñar y explorar redes neuronales convolucionales.

Esta entrega corresponde al frontend desarrollado con React y TypeScript.
Trabajamos únicamente con CNN y todavía no utilizamos base de datos."

Mostrar Dashboard y los módulos.

## 2. Dataset

"Podemos cargar una carpeta con imágenes organizadas por clase.

La aplicación decodifica y valida los archivos realmente.
En este ejemplo utilizamos 200 imágenes reales de MNIST:
veinte por cada dígito del cero al nueve."

Aplicar 70% entrenamiento, 15% validación y semilla 42.

"La separación genera 140 imágenes de entrenamiento,
30 de validación y 30 de prueba.

Es una separación local de la muestra. No equivale al test oficial
completo de MNIST."

Mostrar filtros y ampliar una imagen.

## 3. Arquitectura CNN

"Una CNN aplica filtros para aprender patrones locales de las imágenes.

Nuestro constructor permite definir filtros, kernels, activaciones,
pooling y unidades de la capa Dense."

Mostrar la configuración inicial de 28 × 28 y un canal.

"Después de dos bloques convolucionales y pooling, Flatten convierte
los mapas en un vector y Dense combina esas características.

Como tenemos diez clases, la salida utiliza softmax.
Esta configuración tiene 105866 parámetros estimados."

Guardar una versión.

## 4. Preprocesamiento

Ampliar una imagen en Datasets.

"Esta vista sí realiza operaciones reales: redimensiona la imagen,
configura sus canales y normaliza sus valores entre cero y uno.

Una entrada de 28 × 28 y un canal contiene 784 valores.
Podemos consultar sus estadísticas y exportar el tensor."

Aclarar:

"Esta operación procesa la imagen seleccionada.
Todavía no equivale a entrenar con todo el dataset."

## 5. Entrenamientos y los dos gráficos

Crear una simulación de cinco épocas.

"La interfaz reproduce los estados de una cola de entrenamiento.

Tenemos dos gráficos: precisión y pérdida.
Cada uno muestra una serie de entrenamiento y otra de validación."

Aclarar expresamente:

"El entrenamiento está simulado.
Estas curvas no son resultados de aprendizaje sobre MNIST
y no demuestran que una arquitectura sea mejor que otra."

Mostrar pausa o cancelación si el tiempo lo permite.

## 6. Modelos y reportes

Registrar una ficha de una simulación completada.

"Cada ficha conserva configuración, metadatos y resultados simulados.
Puede revisarse, aprobarse y retirarse mediante un historial.

No contiene pesos entrenados."

Mostrar Reportes.

"Podemos exportar CSV y utilizar la impresión del navegador para
guardar un reporte PDF."

## Cierre

"Esta entrega permite recorrer el flujo del frontend CNN:
cargar datos, inspeccionarlos, configurar la arquitectura,
simular una ejecución, consultar gráficas y registrar resultados.

La carga de imágenes y el preprocesamiento individual son reales.
El entrenamiento y las métricas continúan simulados.

El backend, TensorFlow y la persistencia corresponden a una fase posterior."

## Preguntas habituales

¿Qué aprende un filtro?
En entrenamiento real ajusta sus pesos para detectar patrones locales.

¿Qué hace el pooling?
Reduce las dimensiones espaciales de los mapas de características.

¿Qué hace Flatten?
Reorganiza esos mapas como un vector sin añadir parámetros.

¿Por qué softmax?
Porque la configuración clasifica diez categorías excluyentes.

¿Una época es lo mismo que un batch?
No. Una época recorre el conjunto de entrenamiento.
Un batch es un grupo de muestras procesado en un paso.

¿784 son neuronas ocultas?
No. En una imagen de 28 × 28 y un canal son 784 valores de píxel.
La CNN utiliza inicialmente la estructura espacial de la imagen.

¿Las curvas muestran aprendizaje real?
No. Están identificadas como simulación.

¿La información se conserva al recargar?
No. Actualmente permanece en memoria del navegador.
