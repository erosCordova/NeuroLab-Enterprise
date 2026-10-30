# Backend en Render y frontend en Vercel

Esta es la arquitectura elegida por el usuario. Sustituye la preparación anterior
que servía React y FastAPI desde el mismo contenedor Render.

| Componente | Proveedor | Configuración |
| --- | --- | --- |
| Frontend React/Vite | Vercel | Root Directory apps/web, Node 24, salida dist |
| API FastAPI | Render | Dockerfile services/api/Dockerfile, contexto services/api, plan Free |
| PostgreSQL 16 | Neon | Proyecto neurolab-enterprise, base neurolab |

## Conexión y sesión

El navegador llama a /api/v1 en el dominio de Vercel. El archivo apps/web/vercel.mjs
configura la reescritura /api/:path* hacia el mismo path en el backend Render.
El backend sigue ejecutándose exclusivamente en Render y el frontend en Vercel.
No se añade un backend de negocio ni un motor neuronal a Vercel.

La cookie es HttpOnly, Secure y SameSite=Lax, sin Domain fijo. La API usa
APP_ORIGINS con el origen HTTPS exacto del frontend Vercel. No se aceptan comodines
ni se deduce confianza a partir de Host o X-Forwarded-Host enviados por el cliente.
Las respuestas /api incluyen private, no-store y las reglas de Vercel desactivan
la caché del proxy para no compartir información de cuentas.

## Backend Render

- Runtime Docker; Dockerfile services/api/Dockerfile; contexto services/api.
- Plan Free; región propuesta Ohio, junto a la región de Neon.
- DATABASE_URL pooled y DATABASE_URL_UNPOOLED direct como secretos de Render.
- COOKIE_SECURE=true y APP_ORIGINS con el origen de la publicación Vercel.
- Health check HTTP /api/v1/health.
- El proceso arranca con python -m app.serve: aplica migraciones, después escucha
  en 0.0.0.0 con PORT. Usuario sin privilegios. No incluye archivos del frontend.

## Frontend Vercel

- Proyecto neurolab-enterprise en el equipo EROSSS.
- Root Directory apps/web, framework Vite, Node 24, install npm ci, output dist.
- NEUROLAB_API_ORIGIN: URL HTTPS verificada del servicio Render, sin path.
  Es la dirección pública de la API; no es una contraseña.
- vercel.mjs carga deployment-config.mjs. Si falta ese origen, o contiene
  credenciales, rutas o un host ajeno a Render, la configuración falla antes de
  publicar. No hay un destino ficticio ni un fallback silencioso a modo demo.
- El build fuerza VITE_USE_API=true y VITE_API_BASE_URL=/api/v1.
- Las credenciales de Neon se configuran exclusivamente en Render.

No se activa todavía el enlace Git automático del proyecto Vercel: primero debe
existir y verificarse el backend para configurar el destino correcto. Después
se enlazará la rama revisada y se publicará. Nunca desplegar main accidentalmente:
los cambios aún están en fix/validacion-frontend-cnn y PR #1.

## Comprobaciones

CI construye la imagen de la API y compila el frontend por separado. Usa un
servidor estático Nginx solo en CI para aproximar el proxy /api de Vercel. Prueba
registro, login, edición, recarga, logout/login, aislamiento de cuentas y bundle
conectado contra PostgreSQL efímero. No escribe en Neon. Esta aproximación no
sustituye la comprobación del proxy real una vez publicados ambos servicios.

Tras publicar: esperar READY en Vercel y live en Render, comprobar HTTPS,
/api/v1/health, sesión, guardado y recarga contra Neon. Solo entonces se declara
el despliegue operativo. Las imágenes, arquitecturas y simulaciones siguen en
memoria y el entrenamiento continúa simulado, exclusivamente CNN.

## Estado de la publicación

El proyecto Vercel está creado, sin despliegue. La API Render todavía no está
creada: la conexión requiere confirmar My Workspace (tea-daiqrkmk1f9s7399cle0)
como destino antes de operar. La vista privada de Sites sigue en modo demo.

Referencias oficiales consultadas el 30 de octubre de 2026:

- https://vercel.com/docs/project-configuration/vercel-ts
- https://vercel.com/docs/routing/rewrites
- https://render.com/docs/web-services
- https://render.com/docs/environment-variables
