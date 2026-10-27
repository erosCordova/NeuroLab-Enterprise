# NeuroLab Enterprise — Manual del frontend CNN

## Alcance actual

Plataforma educativa exclusivamente para CNN de clasificación de imágenes.

Implementado:
- Proyectos CNN.
- Carga y validación de imágenes por clase.
- Particiones reproducibles.
- Explorador de imágenes con búsqueda, filtros y ampliación.
- Preprocesamiento real de una imagen seleccionada.
- Constructor Conv2D, MaxPooling, Flatten y Dense.
- Versiones de arquitectura en memoria.
- Simulación de entrenamiento y cancelación.
- Dos gráficos: precisión y pérdida.
- Evaluación descriptiva.
- Fichas de modelos de demostración y revisión.
- Reportes y exportaciones.
- Usuarios y límites de demostración.

No hay base de datos, autenticación real ni entrenamiento TensorFlow.
Las métricas no representan aprendizaje sobre las imágenes.

## 1. Iniciar

Abrir Git Bash en:
~/neurolab-enterprise/apps/web

Ejecutar npm run dev.
Abrir la dirección Local que indique Vite y mantener la terminal abierta.

También puede utilizarse INICIAR_NEUROLAB.cmd, situado en la carpeta
principal del proyecto.

Cambiar entre pantallas conserva la sesión.
Recargar la página elimina los datos y cambios en memoria.

## 2. Cargar imágenes

En Datasets, seleccionar una carpeta principal con esta organización:
carpeta principal / clase / imagen.

Cada clase debe ser una subcarpeta directa.
No se admiten subcarpetas adicionales dentro de las clases.

Formatos: PNG, JPG y WebP.
Límites: 500 imágenes, 50 MiB en conjunto y dimensiones máximas
de 4096 × 4096 por imagen.

Debe haber entre 2 y 20 clases y al menos tres imágenes por clase.

Los archivos se decodifican y verifican realmente.
Los archivos con otras extensiones no se incluyen.

Seleccionar porcentajes y semilla.
Pulsar Validar y aplicar dataset.

Las particiones son estratificadas por clase.
El redondeo puede modificar los porcentajes efectivos.
Cada índice de imagen pertenece a una única partición.
Todavía no se detectan imágenes visualmente duplicadas.

## 3. Muestra MNIST

La muestra preparada tiene:
- 200 imágenes reales de dígitos.
- Diez clases, del 0 al 9.
- Veinte imágenes por clase.
- Tamaño original de 28 × 28.

Con entrenamiento 70%, validación 15% y semilla 42:
- 140 imágenes de entrenamiento.
- 30 de validación.
- 30 de prueba.

Esta muestra procede del conjunto de entrenamiento original de MNIST.
La partición de prueba local no es el conjunto de test oficial de MNIST.

La ruta de la carpeta preparada se encuentra en:
runtime/ultimo_dataset.txt

## 4. Explorar el dataset

Después de aplicar un dataset aparece su explorador.

Permite:
- Buscar por nombre o clase.
- Filtrar por clase.
- Filtrar por entrenamiento, validación o prueba.
- Recorrer páginas de doce imágenes.
- Ampliar una imagen.
- Consultar dimensiones, tamaño y partición.
- Exportar un inventario JSON.

Los filtros no cambian las particiones.
La tabla de distribución corresponde al dataset completo.

El inventario contiene metadatos y asignaciones, no los píxeles.

## 5. Diseñar la CNN

Configuración inicial recomendada para la muestra MNIST:
- Entrada de 28 × 28.
- Un canal de escala de grises.
- Primer bloque Conv2D: 16 filtros y kernel 3 × 3.
- Segundo bloque Conv2D: 32 filtros y kernel 3 × 3.
- ReLU y MaxPooling 2 × 2 en ambos bloques.
- Flatten.
- Dense de 64 unidades.

Con diez clases:
- Salida de diez unidades softmax.
- Pérdida prevista sparse_categorical_crossentropy.
- Total estimado: 105866 parámetros.

Con dos clases:
- Salida de una unidad sigmoid.
- Pérdida prevista binary_crossentropy.

El constructor admite de uno a cuatro bloques.
Las convoluciones utilizan stride 1 y padding same.
Cada pooling divide las dimensiones espaciales entre dos,
redondeando hacia abajo.

El límite es de cinco millones de parámetros estimados.

Guardar versión conserva una copia de la configuración en memoria.
Exportar JSON no exporta pesos entrenados.

## 6. Inspeccionar el preprocesamiento real

En el explorador, ampliar una imagen.

La sección Entrada preprocesada para CNN utiliza el tamaño y los canales
configurados en el diseñador.

Aplica realmente a esa imagen:
- Redimensionado directo sin recorte.
- Fondo negro para transparencia.
- Conversión a grises o RGB.
- Normalización entre 0 y 1.

Muestra mínimo, máximo, media y forma del tensor.

Ejemplos:
- 28 × 28 × 1: 784 valores.
- 32 × 32 × 3: 3072 valores.

Exportar tensor JSON descarga esos valores en orden HWC:
alto, ancho y canales.

No modifica la imagen original.
No genera predicciones.
No procesa automáticamente todo el dataset para entrenar.

## 7. Simular entrenamiento

Requiere un dataset aplicado y una configuración válida.

Configurar:
- Épocas: entero entre 1 y 100.
- Batch size: entero entre 1 y 256.

Añadir a la cola.

La ejecución conserva configuración y metadatos del dataset.
Se procesa un trabajo a la vez.

Estados:
En cola, Preparando, Ejecutando, Completado y Cancelado.

Pausar demo detiene la simulación.
Cancelar mantiene el estado terminal cancelado.
Cambiar de pantalla no elimina el trabajo.

Se muestran exactamente dos gráficos:
1. Precisión de entrenamiento y validación.
2. Pérdida de entrenamiento y validación.

Las curvas son simuladas y se generan con fórmulas ilustrativas.
No demuestran el efecto de filtros, imágenes ni batch size.
No se presentan resultados reales del conjunto de prueba.

## 8. Evaluación y modelos

Evaluación presenta resultados de simulaciones completadas.

En Modelos se puede registrar una ficha de cada ejecución completada.
Una ejecución no puede registrarse dos veces.

Las fichas conservan copias de la ejecución y sus metadatos.
No contienen pesos ni permiten realizar predicciones.

Flujo de demostración:
Borrador → Revisado → Aprobado → Retirado.

También puede retirarse una ficha desde Borrador o Revisado.
Los cambios requieren una observación de al menos diez caracteres.
Una ficha retirada no se reactiva.

La exportación JSON identifica que se trata de una demostración.

## 9. Reportes

El reporte corresponde al proyecto activo.
Incluye ejecuciones y versiones registradas.

Exportar CSV conserva los metadatos de las ejecuciones.
Las métricas se identifican como simuladas.

Imprimir / guardar PDF abre la impresión del navegador.
Elegir Guardar como PDF si está disponible.

Para un reporte estable, pausar la demo antes de imprimir.

## 10. Administración

Los usuarios y roles son ejemplos de interfaz.
No crean cuentas, no envían invitaciones y no aplican autorización real.

Los límites sí restringen nuevas ejecuciones:
- Entre 1 y 10 trabajos pendientes.
- Hasta 100 por sesión.
- El límite por sesión debe ser igual o superior al de pendientes.

Reducir límites no elimina trabajos existentes.

## 11. Pruebas

Desde apps/web:
- npm run test:unit
- npm run test:e2e
- npm run build

Informes:
- runtime/cnn-e2e.json
- runtime/cnn-e2e-report/index.html
- runtime/VALIDACION_FRONTEND_CNN.json

El archivo de validación final se crea únicamente si todas las
comprobaciones del bloque de cierre terminan correctamente.

## 12. Pendientes fuera del alcance actual

- Entrenamiento real con TensorFlow/Keras y workers.
- Predicciones y evaluación real.
- Backend y persistencia.
- Autenticación y autorización.
- Almacenamiento de pesos.
- Operación y despliegue del sistema completo.

La validación del frontend no certifica que el producto enterprise
completo esté terminado.


## Mejora de integridad y diseño
Cada archivo se identifica mediante SHA-256.
Se rechazan archivos binariamente idénticos repetidos o asignados a clases distintas.
No se trata de detección de similitud visual: imágenes recodificadas pueden tener otra huella.
La identidad del dataset considera contenido, etiquetas, orden, semilla y particiones.
Cambiar el nombre de la carpeta no altera por sí solo esa identidad.
Las versiones se vinculan mediante la identidad del dataset y su configuración.
La nueva apariencia conserva los dos gráficos y el alcance de demostración.
