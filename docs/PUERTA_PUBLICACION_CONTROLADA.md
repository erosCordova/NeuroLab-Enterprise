# Preparación controlada para el próximo despliegue de NeuroLab Enterprise

## Hallazgos de configuración (inspección, sin cambios remotos)

- **Render:** servicio Docker `neurolab-enterprise-api`, plan gratuito, región Ohio, despliegue automático desactivado. Dockerfile no incorpora paquetes de entrenamiento Python.
- **Vercel:** proyecto `neurolab-enterprise`, Vite/Node 24, último despliegue de producción en el commit `df162826`. Protección SSO habilitada en despliegues Vercel según la configuración inspeccionada.
- **Neon (consulta de solo lectura del 30/10/2026):** la rama predeterminada `production` de la base `neurolab` tiene **solamente `001_platform.sql` aplicada**. Están pendientes las migraciones `002_real_cnn_runs.sql`, `003_browser_cnn.sql`, `004_real_cnn_models.sql` y `005_auth_attempt_windows.sql`. **Ninguna de ellas se ha ejecutado en la instancia remota**.

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


## Validación de inicio previa a migraciones (candidato)

El arranque del contenedor ejecuta una comprobación **antes** de migrar Neon si
Render define \`RENDER=true\`. Exige presencia de \`DATABASE_URL\`,
\`DATABASE_URL_UNPOOLED\` y \`NEUROLAB_RATE_LIMIT_SECRET\` (mínimo 32 bytes),
\`COOKIE_SECURE=true\` y \`APP_ORIGINS\` con al menos un dominio HTTPS exacto
del frontend, sin comodines ni rutas. Si falla, detiene el arranque en lugar de
modificar la base de datos o exponer un login sin límites. No imprime secretos.

Las pruebas de GitHub Actions usan configuración sintética y no consultan
credenciales reales. La comprobación de nombres de variables en Vercel mostró
\`NEUROLAB_API_ORIGIN\` definido para producción y vista previa, pero **no**
verifica el valor ni su destino. Las variables de Render aún requieren
comprobación antes de autorizar la publicación.

**Orden de publicación autorizado posteriormente:** confirmar variables;
revisar copia de respaldo de Neon; aplicar migraciones mediante un arranque
controlado de Render; confirmar API y sesiones; publicar el frontend Vercel;
verificar entrenamiento, respaldo, reportes, cookies y recuperación.
No ejecutar este proceso sin la autorización explícita del propietario.

## Ensayo verificable de migraciones antes de publicar

El repositorio incluye `python -m app.migration_plan` desde `services/api`. El comando
consulta `schema_migrations` con una **transacción PostgreSQL de solo lectura**,
compara las huellas SHA-256 del repositorio y muestra únicamente los nombres
de las migraciones aplicadas y pendientes. `--require-current` comprueba
que ya no queden versiones por aplicar. No revela contraseñas ni modifica tablas.

GitHub Actions también crea una **base de datos CI independiente**, instala
`001_platform.sql`, inserta un proyecto y usuario sintéticos, ensaya la
aplicación de `002` a `005`, verifica que los registros sobreviven y comprueba
que repetir el proceso no produce cambios. Este ensayo no prueba compatibilidad
con todos los datos reales de producción: antes del despliegue, validar respaldo
y estado de la base remota.

**La aplicación de las cuatro migraciones a Neon se reserva para un despliegue
autorizado.** No se han ejecutado en producción desde ChatGPT.

## Evidencia del ensayo aprobado (30/10/2026)

- PostgreSQL CI: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41008274920
  - `ENSAYO_MIGRACION_001_A_005=APROBADO`
  - `REGISTROS_HISTORICOS=CONSERVADOS`
  - `MIGRACIONES_REPETIDAS=IDEMPOTENTES`
  - 55 pruebas de API, 5 de plataforma y 6 de alojamiento aprobadas.
- Frontend: 20 recorridos Chromium aprobados en
  https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41008274919.
- Entrenamiento Python/Keras: 3 pruebas aprobadas en
  https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41008274908.
- Neon, Render y Vercel **sin cambios de publicación**. La prueba sintética no
  sustituye una copia de respaldo y verificación de las variables de producción.

## Comprobaciones operativas de salud y preparación

- \`GET /api/v1/health\` indica conectividad a PostgreSQL; **no certifica**
  que todas las migraciones y tablas necesarias existan.
- \`GET /api/v1/ready\` es una lectura sin autenticación que devuelve
  \`{"status":"ready"}\` solo cuando las cinco migraciones y sus sumas SHA-256
  coinciden con los archivos y existen las seis tablas esenciales. Si falta
  alguna, devuelve HTTP 503 con un mensaje genérico, sin revelar estructura,
  nombres de cuentas o credenciales.
- GitHub Actions probará la misma ruta desde el contenedor Docker de API y
  a través del proxy de frontend. También ejecutará una validación de variables
  de producción dentro de la imagen con **valores de CI sintéticos**, sin
  conectarse a Neon real.
- La comprobación **no sustituye las pruebas funcionales** de autenticación,
  datos existentes, entrenamiento TensorFlow.js e inferencia en el sitio
  público tras el futuro despliegue autorizado.

### Comprobación read-only de migración 001 de Neon

El 30 de octubre de 2026 se comprobó con una instrucción SELECT que la huella
SHA-256 de la migración local \`001_platform.sql\` es idéntica a la huella
registrada en \`schema_migrations\` de la rama predeterminada de Neon. Las
migraciones \`002\`–\`005\` siguen pendientes. Esta comprobación no leyó
credenciales ni cambió objetos.

## Resultado del control de preparación (CI aprobado)

En el commit `08f7c4bd537185890351ba9909d6ce312166afd1`, el nuevo
`GET /api/v1/ready` fue validado junto con 57 pruebas Python. El contenedor
Docker verificó los valores sintéticos de producción (RENDER_PREFLIGHT=APROBADO).
También aprobaron 11 pruebas conectadas y 20 recorridos Chromium.

- API y contenedor: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41008926192
- Frontend: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41008926140
- Motor CNN (3 pruebas): https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41008926310

**Las pruebas de CI no sustituyen una prueba sobre Render y Neon publicados.**
Antes de continuar se deben confirmar las variables reales de Render, el
respaldo verificable de Neon, y la autorización explícita para aplicar
migraciones 002–005 y publicar backend y frontend conjuntamente.

## Recuperación comprobable antes del despliegue

GitHub Actions ensaya `pg_dump --format=custom` de la base **temporal**
`neurolab_test` usando PostgreSQL 16 y `pg_restore --single-transaction`
sobre otra base **nueva y temporal** (`neurolab_restore_ci`). La prueba
compara los conteos de todas las tablas, identificadores de usuarios y
proyectos sintéticos y las cinco migraciones con sus hashes.

El ensayo se ejecuta únicamente cuando `GITHUB_ACTIONS=true`,
`NEUROLAB_CI_BACKUP_REHEARSAL=1`, host=localhost/127.0.0.1, puerto 5432
y base=`neurolab_test`. Rechaza cualquier DSN externo o base distinta.
El archivo temporal `.dump` se elimina al finalizar. No se sube a GitHub.

**Este ensayo no ha generado un respaldo de los datos reales de Neon.**
Antes de publicar, con autorización expresa, se debe obtener y comprobar
un respaldo de **la base real**, guardarlo en una ubicación privada
fuera del repositorio y validar su restauración en un entorno seguro.
El plan de recuperación de un fallo posterior a una migración es restaurar
el respaldo verificado en una instancia aislada y coordinar el retorno
del backend/frontend a versiones compatibles; no invertir SQL a ciegas.

## Evidencia de respaldo y restauración CI — aprobado

El ensayo PostgreSQL 16 restauró satisfactoriamente un respaldo de formato
personalizado en una segunda base de datos efímera. Comparó los recuentos
de las siete tablas, identificadores de usuarios/proyectos sintéticos y hashes
de las cinco migraciones. La prueba confirmó que el respaldo temporal se elimina.

- PostgreSQL/API y recuperación: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41009630984
- Frontend/Chromium: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41009630858

**Esta evidencia NO es un respaldo de la base real de Neon.** Solo prueba
el procedimiento sobre datos sintéticos de CI. Antes de autorizar producción
quedan el respaldo real verificable, las variables seguras de Render,
las cuatro migraciones pendientes y las pruebas sobre los servicios publicados.
