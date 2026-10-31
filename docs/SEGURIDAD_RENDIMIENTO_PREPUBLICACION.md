# NeuroLab Enterprise — Revisión de seguridad y rendimiento

## Endurecimiento de API FastAPI
- Restringir todas las operaciones de escritura con `Origin` no confiable o `Sec-Fetch-Site: cross-site`, incluyendo cerrar sesión.
- Exigir `Content-Type: application/json` para registros, acceso, proyectos e informes. Cerrar sesión permite POST sin cuerpo.
- Limitar el cuerpo de estas solicitudes a 64 KiB, incluyendo transferencias por fragmentos sin encabezado `Content-Length`; devolver 413 antes del procesamiento.
- Añadir `Cache-Control: private, no-store`, cabeceras antisuplantación de MIME, no permitir marcos y política de referentes a la API. Conservar las cabeceras de CORS existentes y los permisos.
- No cambia el esquema ni migra datos en Neon.

## Rendimiento y contenedor Render
- La imagen de producción instala solo las dependencias operativas de la API. Se excluyen `pytest` y `httpx`, empleados exclusivamente durante GitHub Actions.
- Se conserva el usuario no privilegiado y el arranque con migraciones versionadas.
- La construcción del contenedor tiene una prueba que comprueba que las librerías de pruebas no están instaladas.
- TensorFlow/Keras sigue fuera de Render. El entrenamiento TensorFlow.js se realiza en el dispositivo del usuario.

## Vercel
- La configuración que genera el despliegue añade cabeceras de protección para la interfaz estática y mantiene la API sin caché.
- La política CSP integral, el control distribuido de intentos de acceso y los límites de almacenamiento IndexedDB quedan para una auditoría posterior. Estos cambios **no equivalen a certificación de seguridad**.
- Se debe confirmar el origen HTTPS y la configuración real de Vercel/Render antes de cualquier despliegue de producción.

## Comprobaciones
- Pruebas API de origen externo, intento de CSRF, tipo JSON, payload demasiado grande y fragmentos enviados sin Content-Length.
- Pruebas frontend del generador de configuración de despliegue.
- Docker/Render CI comprueba dependencias mínimas, conectividad y arranque.
- Ninguna modificación se publica hasta autorización explícita del propietario.
