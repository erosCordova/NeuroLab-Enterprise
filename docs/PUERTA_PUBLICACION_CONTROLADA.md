# Preparación controlada para el próximo despliegue de NeuroLab Enterprise

## Hallazgos de configuración (inspección, sin cambios remotos)

- **Render:** servicio Docker `neurolab-enterprise-api`, plan gratuito, región Ohio, despliegue automático desactivado. Dockerfile no incorpora paquetes de entrenamiento Python.
- **Vercel:** proyecto `neurolab-enterprise`, Vite/Node 24, último despliegue de producción en el commit `df162826`. Protección SSO habilitada en despliegues Vercel según la configuración inspeccionada.
- **Neon:** la versión aún no publicada requerirá aplicar mediante Render la migración `005_auth_attempt_windows.sql` a la base de datos de NeuroLab. **No se ha ejecutado esa migración en la instancia remota**.

## Variables y controles obligatorios antes de publicar

| Lugar | Nombre | Requisito |
|---|---|---|
| Render | `DATABASE_URL` | Cadena de conexión segura al Neon correcto; no mostrar el valor en logs |
| Render | `DATABASE_URL_UNPOOLED` | Conexión directa recomendada para migraciones |
| Render | `NEUROLAB_RATE_LIMIT_SECRET` | **NUEVA**: valor aleatorio, secreto, mínimo 32 bytes; no usar el valor de CI |
| Render | `APP_ORIGINS` | Origen HTTPS exacto de la página autorizada |
| Render | `COOKIE_SECURE` | `true`, con cookies `HttpOnly` y `SameSite=Lax` |
| Vercel | `NEUROLAB_API_ORIGIN` | Origen HTTPS del servicio Render, sin rutas ni credenciales |
| Vercel | `VITE_USE_API` | Incluido en el comando de build conectado |
| Vercel | `VITE_API_BASE_URL` | `/api/v1`, misma URL de origen mediante rewrite |

**Importante:** no he leído, mostrado ni cambiado valores secretos de servicios. Antes de cualquier despliegue se debe confirmar el nombre y la presencia de cada variable en el panel correspondiente. El código fallará con HTTP 503 en autenticación si falta `NEUROLAB_RATE_LIMIT_SECRET`; esto es deliberado para no publicar un acceso sin protección de intentos.

## Seguridad implementada en código, sin desplegar

- Límite por cuenta y operación de 8 solicitudes en 15 minutos, persistente entre instancias mediante PostgreSQL y clave HMAC. Los registros solo contienen digest, intervalo y conteos, sin emails en texto claro.
- Exceso: HTTP 429 con `Retry-After: 900`. La autenticación correcta limpia el contador; el inicio de sesión de otra cuenta se contabiliza por separado.
- Esta mitigación **no constituye un cortafuegos global ni una limitación por IP**: no impide intentos con grandes cantidades de emails distintos. El bloqueo por cuenta puede explotarse para negar acceso temporalmente a ese correo. Se recomiendan controles de borde antes de una apertura general.
- Política `Content-Security-Policy-Report-Only` con orígenes permitidos limitados. Por ahora **no se aplica en modo bloqueo**, ya que TensorFlow.js requiere comprobar entrenamiento e inferencia con el bundle de producción antes de endurecerla.
- Conservar protección por origen, límite JSON de 64 KiB y cabeceras que evitan caché de sesión.

## Puerta de salida

Requiere validación de CI, comprobación manual de variables, autorización expresa del propietario y un despliegue controlado de Render y Vercel; después, comprobar login, registro, modelos persistentes e inferencia en el navegador remoto. **Ninguno de esos despliegues se ha realizado.**
