# Registro de modelos CNN reales

El módulo Modelos permite registrar los entrenamientos reales TensorFlow.js, renombrar las fichas,
marcarlas como favoritas, archivarlas y añadir observaciones. Los datos se conservan en PostgreSQL.
Se validan permisos de usuario, relación con el proyecto y revisión optimista.

Los pesos no se almacenan en Render o Neon. La interfaz consulta IndexedDB para comprobar si
están disponibles en este navegador. Si faltan, será necesario restaurar un respaldo .ncnn.
El archivado conserva tanto el historial como los pesos. Los resultados importados no están
certificados por el servidor. Los informes Keras sin pesos accesibles no se registran como
modelos TensorFlow.js utilizables.

La sección de simulaciones sigue separada. Las nuevas funciones permanecen únicamente
en la rama de desarrollo hasta la autorización expresa de despliegue.
