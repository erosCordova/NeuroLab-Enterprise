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

La vista previa privada permite recorrer el mismo frontend sin iniciar Vite.
La autorización de acceso de esa vista no añade autenticación a la aplicación.

Cambiar entre pantallas conserva la sesión.
Recargar la página elimina los datos y cambios en memoria.

## 1.1. Organizar proyectos CNN

Proyectos permite crear y editar nombre, descripción, estado y hasta seis
etiquetas. Los nombres son únicos sin distinguir mayúsculas, espacios repetidos
ni formas Unicode equivalentes. Las etiquetas se separan por comas.

La búsqueda incluye nombre, descripción y etiquetas y se puede combinar con el
filtro de estado. Limpiar filtros permite recuperar la lista completa.

Editar conserva el identificador del proyecto: sus imágenes, configuración,
versiones y ejecuciones permanecen asociadas. Los nombres guardados dentro de
las ejecuciones anteriores conservan el contexto que tenían al crearse.

Estados: Activo, En preparación y Archivado. Archivar bloquea nuevas simulaciones,
pero no elimina datos ni cancela las ejecuciones existentes. Para crear nuevas
simulaciones, cambia el estado a Activo o En preparación. Los estados y cambios
son locales a la sesión; recargar sigue eliminando los datos en memoria.

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
Pulsar Enviar dataset al proyecto. La carga permanece en el navegador;
no se envían imágenes a un servidor de entrenamiento.

Las particiones son estratificadas por clase.
El redondeo puede modificar los porcentajes efectivos.
Cada índice de imagen pertenece a una única partición.
Se bloquean archivos con bytes idénticos, incluso si tienen nombres diferentes,
y archivos idénticos asignados a clases distintas. Esto no detecta similitud
visual entre imágenes recodificadas.

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

Si preparaste la muestra con el script local, su ruta puede estar en
runtime/ultimo_dataset.txt. Ese archivo y las imágenes no se incluyen en GitHub.
Las pruebas automatizadas generan PNG sintéticos propios; no son MNIST.

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

## 4.1. Exportar el dataset completo

En Datasets, Exportar dataset completo permite elegir una carpeta de destino
y autorizar escritura en un navegador compatible (por ejemplo, Chrome o Edge).
Se crea una subcarpeta nueva con las imágenes originales organizadas por clase,
un manifiesto dataset.neurolab.json con hashes y particiones y un LEEME.txt.
No se necesita ZIP. El inventario JSON por separado solo contiene metadatos.

El importador de carpetas vuelve a calcular las particiones con los porcentajes
y la semilla del formulario: no restaura automáticamente el manifiesto exportado.
Si falla una escritura puede quedar una carpeta parcial; consulta el aviso.

## 5. Diseñar la CNN

En cada proyecto, Automático es el modo predeterminado.
Al aplicar un dataset, calcula una propuesta usando la cantidad de imágenes de
entrenamiento. Muestra las clases y el mínimo de ejemplos de entrenamiento por
clase como contexto. No consulta el conjunto de prueba para elegir la red.
Es una heurística inicial, no una arquitectura óptima demostrada.

Con la muestra de 200 imágenes, 140 de ellas para entrenamiento:
- Entrada de 28 × 28, un canal.
- Conv2D de 8 filtros y Conv2D de 16 filtros, kernel 3 × 3.
- ReLU y MaxPooling 2 × 2 en ambos bloques.
- Flatten y Dense de 32 unidades.
- Dropout 0.35 y L2 0.001.
- Máximo de 60 épocas, parada temprana activa y paciencia de 5 épocas.
- Mejora mínima de pérdida de validación: 0.01.
- Con diez clases: softmax, sparse_categorical_crossentropy y 26698 parámetros.

En Automático los controles de arquitectura, regularización y épocas están
bloqueados. Cambiar el dataset recalcula la propuesta.

Para editar, selecciona Manual en Modo de configuración:
- El primer cambio copia la propuesta activa como punto de partida.
- Puedes editar capas, filtros, entrada, activaciones y regularización.
- Puedes cambiar las épocas desde Entrenamientos.
- Usar propuesta en modo manual reemplaza los ajustes manuales por la propuesta.
- Alternar Automático/Manual conserva los ajustes manuales anteriores por proyecto,
  incluyendo sus épocas. Todo se conserva solo mientras la página siga abierta.

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
- Épocas: calculadas en Automático; editables de 1 a 100 en Manual.
- Batch size: entero entre 1 y 256.

Añadir a la cola.

La ejecución conserva el modo, la configuración y los metadatos del dataset.
Cambiar el diseñador después no modifica ejecuciones ya creadas.
Se procesa un trabajo a la vez.

Estados:
En cola, Preparando, Ejecutando, Completado y Cancelado.

Pausar demo detiene la simulación.
Cancelar mantiene el estado terminal cancelado.
Cambiar de pantalla no elimina el trabajo.

Se muestran exactamente dos gráficos:
1. Precisión de entrenamiento y validación.
2. Pérdida de entrenamiento y validación.

La parada temprana detiene la simulación cuando la pérdida de validación deja
de mejorar más que el mínimo configurado durante la paciencia indicada.
La época de referencia es la de una mejora significativa; no implica restaurar
pesos ni necesariamente identifica el mínimo numérico absoluto.
Se muestra el número de épocas ejecutadas frente al máximo configurado.
Dropout y L2 se conservan como configuración para un futuro entrenamiento real;
no modifican las curvas actuales.

Las curvas son simuladas y se generan con fórmulas ilustrativas.
No demuestran el efecto de filtros, imágenes ni batch size.
No se presentan resultados reales del conjunto de prueba.

## 7.1. Historial y repetición de simulaciones

Debajo de la cola está Historial de entrenamientos. Puedes buscar por ID, nombre
de proyecto o dataset y combinar la búsqueda con un estado. El CSV exporta solo
las filas que coinciden con los filtros y conserva la huella del dataset.

Cada nueva ejecución registra creación, inicio y finalización. El CSV conserva
fechas ISO; la pantalla usa el formato local del navegador. La duración se muestra
al terminar y cuenta el tiempo desde que empieza a ejecutar, incluyendo pausas.
Una cancelación antes del inicio no tiene duración de ejecución. Las ejecuciones
anteriores sin fechas se muestran con un guion, sin inventar datos.

Ver selecciona la ejecución en el panel de detalle. Repetir está disponible solo
para trabajos completados o cancelados y crea un ID nuevo, desde la primera época.
Conserva modo, arquitectura, dataset, épocas, batch y referencia de versión de origen.
No cambia el trabajo anterior ni usa cambios posteriores del diseñador.
No se reanudan ni restauran pesos: el entrenamiento sigue siendo simulado.

La nueva ejecución conserva el ID de origen y respeta los límites de Administración.
Los proyectos archivados no admiten repeticiones hasta que se reactiven.
Recargar elimina el historial, igual que el resto de la sesión sin base de datos.

## 8. Evaluación y modelos

Evaluación presenta resultados de simulaciones completadas del proyecto activo.
Los trabajos cancelados o en curso no se presentan como resultados finales.

Marca entre una y tres ejecuciones para compararlas lado a lado. Se conservan
la huella del dataset y sus particiones, el modo, la configuración CNN, el número
de parámetros, las épocas ejecutadas y máximas, Dropout, L2 y métricas finales.
La cuarta selección queda bloqueada hasta desmarcar una de las anteriores.
Si las huellas difieren, se advierte que no son directamente comparables.
La comparación no identifica ganadores ni prueba precisión predictiva real.

Exportar comparación JSON conserva las configuraciones y los metadatos.
Exportar comparación CSV genera un resumen. Ambos identifican la simulación;
no incluyen imágenes, predicciones ni pesos. El CSV expresa precisión entre 0 y 1.

Inspeccionar muestra el detalle por época, con páginas de diez registros y
exportación CSV de todo el historial de esa ejecución. El mínimo numérico de
pérdida observado puede diferir de la referencia usada por la parada temprana.
La diferencia de precisión se muestra en puntos porcentuales y no constituye
un diagnóstico de sobreajuste sobre estas curvas ilustrativas.

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

Antes de la primera prueba de navegador: npx playwright install chromium.
Por defecto se generan 200 PNG sintéticos temporales de diez clases. Sirven para
validar la interfaz y los archivos, no para evaluar un modelo entrenado.
No se necesita runtime/ultimo_dataset.txt. Para un dataset externo compatible,
consulta NEUROLAB_E2E_DATASET en el README principal.

Informes locales:
- runtime/cnn-e2e.json
- runtime/cnn-e2e-report/index.html

Consulta GitHub Actions para el resultado de cada commit. Una evidencia JSON
antigua no certifica cambios posteriores. El estado de las fases se registra en
docs/ESTADO_FASES.md.

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
