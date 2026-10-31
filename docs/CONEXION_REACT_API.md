# React conectado a FastAPI y PostgreSQL

## Modos explícitos

- Sin VITE_USE_API=true: demo local en memoria, igual que la vista previa privada.
- Con VITE_USE_API=true: requiere API disponible; muestra registro/login y carga
  los proyectos de la cuenta. Nunca cambia silenciosamente a memoria si falla la API.

Solo cuentas, sesiones y proyectos están persistidos en este incremento. Las
imágenes, arquitecturas, ejecuciones, fichas y métricas siguen en memoria y se
pierden al recargar o cerrar sesión. El entrenamiento permanece simulado.

## Activación local

Con PostgreSQL y la API iniciados según POSTGRESQL_Y_API.md, en Git Bash desde
apps/web:

```bash
VITE_USE_API=true npm run dev
```

Vite redirige /api al backend en http://127.0.0.1:8011. Puedes cambiar el destino
con NEUROLAB_API_PROXY. La API admite los orígenes locales de Vite en puerto 5173;
si Vite usa otro puerto, configura APP_ORIGINS explícitamente y reinicia la API.

Al registrarte, crea tu primer proyecto. El servidor genera su ID. El frontend
muestra guardados exitosos solo después de recibir confirmación. Una edición
con revisión desactualizada muestra un conflicto y requiere recargar para
obtener la versión actual; no sobrescribe cambios ajenos silenciosamente.

La sesión usa cookies HttpOnly; React no lee ni guarda tokens en localStorage.
Cerrar sesión revoca la sesión del servidor y desmonta los datos en memoria.
Una cuenta nueva no recibe los proyectos de la demo ni de otra cuenta.

## Despliegue

VITE_USE_API y VITE_API_BASE_URL son variables de compilación. Por defecto,
VITE_API_BASE_URL es /api/v1. En producción el frontend estará en Vercel y la API en Render. El proxy
/api de Vercel conserva el mismo origen visible al navegador, con COOKIE_SECURE=true.
La configuración y los destinos explícitos están en DESPLIEGUE_RENDER.md.
No publiques URLs de PostgreSQL ni contraseñas como variables VITE_.

La vista previa de Sites no aloja el backend Python/PostgreSQL. Sigue en modo demo
hasta disponer de un despliegue compatible; activar la API sin servidor no crea
persistencia ni una base de datos.

## Prueba de integración de navegador

Desde apps/web y con TEST_DATABASE_URL hacia una base de prueba migrada:

```bash
npm run test:platform
```

La configuración inicia FastAPI en 8011 y Vite en 4188. No reutiliza servidores
existentes. GitHub Actions ejecuta primero las pruebas de la API y después el
flujo React → API → PostgreSQL. Comprueba recarga, logout/login, aislamiento de
cuentas y que un error de guardado no cree un proyecto ficticio.
