# Despliegue de NeuroLab conectado a Neon

## Arquitectura de este incremento

Un único Web Service de Render sirve React compilado y la API FastAPI desde el
mismo origen HTTPS. Neon conserva PostgreSQL. No se crea otra base de datos ni
se añade un motor neuronal: el alcance sigue siendo exclusivamente CNN y el
entrenamiento continúa simulado.

`Dockerfile.render` compila el frontend con VITE_USE_API=true y
VITE_API_BASE_URL=/api/v1. La imagen final contiene Python, la API, las migraciones
y los archivos estáticos. No necesita Node en ejecución ni un servidor Vite.
`.dockerignore` excluye archivos .env, credenciales locales, datasets y respaldos.
El proceso se ejecuta como usuario sin privilegios y escucha en 0.0.0.0 usando PORT.

Al arrancar, `python -m app.serve` aplica las migraciones de forma transaccional y
solo inicia Uvicorn si terminan correctamente. DATABASE_URL_UNPOOLED selecciona
la conexión directa para migraciones y DATABASE_URL la conexión de la API.

## Configuración preparada

| Campo | Valor |
| --- | --- |
| Repositorio | https://github.com/erosCordova/NeuroLab-Enterprise |
| Rama de revisión | fix/validacion-frontend-cnn |
| Runtime | Docker |
| Dockerfile | Dockerfile.render |
| Contexto de construcción | raíz del repositorio |
| Compute plan | free |
| Región propuesta | Ohio, junto a la región de Neon |
| Health check HTTP | /api/v1/health |

Configurar DATABASE_URL y DATABASE_URL_UNPOOLED como secretos de Render hacia
la rama Neon destinada al despliegue. Mantener COOKIE_SECURE=true. No introducir
URLs de PostgreSQL en variables VITE_ ni en el Dockerfile. El origen público que
Render inyecta en RENDER_EXTERNAL_URL se admite explícitamente; no se confía en
un Host enviado por el cliente. Los dominios personalizados requieren APP_ORIGINS
con sus orígenes HTTPS exactos.

La creación se hará mediante la conexión de Render. Si se utiliza su interfaz
web, verificar esos mismos campos y seleccionar Free antes de crear el servicio.
No se requiere disco persistente: las cuentas, sesiones y proyectos usan Neon.
Las imágenes y simulaciones siguen en memoria y se pierden al recargar.

## Validación

La integración continua construye esta misma imagen con Docker, la arranca contra
PostgreSQL efímero de CI y prueba el bundle de producción, acceso a la API,
registro, creación/edición, recarga, logout/login y aislamiento de cuentas.
La cookie Secure se comprueba separadamente en las pruebas API; solo el servidor
HTTP de CI usa COOKIE_SECURE=false. Estas pruebas no escriben en Neon.

Después de publicar, todavía deben comprobarse el estado live del despliegue,
/api/v1/health por HTTPS y el flujo de sesión y guardado contra Neon. Ni un build
aprobado ni la creación del servicio equivalen por sí solos a despliegue verificado.

## Estado actual

El código está preparado para revisión y CI. No se ha creado un servicio Render:
la conexión no tiene un workspace seleccionado y exige que el usuario confirme
el destino antes de operar. El único espacio encontrado es My Workspace, ID
tea-daiqrkmk1f9s7399cle0. No se ha seleccionado automáticamente.

La vista previa privada de Sites sigue en modo demo. El servicio Render tendrá
su propia dirección y no modifica el acceso privado de esa vista previa.

Referencias oficiales consultadas el 30 de octubre de 2026:

- https://render.com/docs/web-services
- https://render.com/docs/compute-plans
- https://render.com/docs/deploys
- https://render.com/docs/health-checks
- https://render.com/docs/environment-variables
- https://render.com/docs/configure-environment-variables
