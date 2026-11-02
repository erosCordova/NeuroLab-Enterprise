# Alcance operativo — NeuroLab Enterprise

NeuroLab permite entrenamientos reales, no simulaciones.

- **Imágenes:** carga desde carpetas y orígenes MNIST/Fashion-MNIST; validación de clases y particiones.
- **CNN:** arquitectura automática o manual, entrenamiento TensorFlow.js, métricas y predicción reales.
- **Modelo externo:** importación de respaldos `.ncnn` compatibles y de CNN de Colab previamente convertidas.
- **Persistencia:** pesos en IndexedDB; cuentas, proyectos e informes en PostgreSQL mediante la API.
- **Evaluación:** precisión/pérdida medidas y prueba independiente cuando está disponible.
- **Visualización:** esquema arquitectónico y mapas de activación calculados con TensorFlow.js; no hay partículas de entrenamiento ficticias.
- **Administración de modelos:** consulta, renombrado, selección y eliminación confirmada de pesos, con historial remoto conservado.

No existe un simulador público, cola ficticia, cuenta de demostración, reporte sintético ni modelo generado con pesos falsos. Los fixtures de pruebas automatizadas no son parte del producto.