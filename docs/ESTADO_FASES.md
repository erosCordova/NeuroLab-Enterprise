# Estado de NeuroLab Enterprise por fases

Referencia: sección 14 del Documento Maestro, versión 1.0, octubre de 2026.
Base revisada: commit c170804 de main. Este documento distingue funcionalidades
visibles de los requisitos completos de salida de cada fase.

## Alcance vigente solicitado

- Exclusivamente CNN; las otras familias quedan fuera de este incremento.
- Frontend React y TypeScript, sin base de datos por ahora.
- Carga y exportación de imágenes originales; preprocesamiento real por imagen.
- Entrenamiento y métricas simulados. No hay modelos ni pesos entrenados.
- Automático por defecto; Manual conserva ajustes por proyecto durante la sesión.

El documento maestro exige entrenamiento real en Python, persistencia y seguridad
para completar el MVP. El alcance actual aplaza esos componentes. Además, el MVP
original menciona Feedforward: el alcance CNN es una adaptación solicitada por el
usuario y no debe presentarse como cumplimiento literal de ese requisito original.

## Fases originales

| Fase | Evidencia actual | Pendiente para cerrar según el documento |
| --- | --- | --- |
| 0. Descubrimiento y diseño | Documento maestro, alcance CNN y pantallas implementadas | Consolidar historias y criterios del alcance adaptado; aprobación de sus flujos |
| 1. Base de plataforma | Shell React, proyectos en memoria y pruebas; CI añadido en esta rama | Autenticación, permisos reales, API, PostgreSQL, migraciones e integración; integración del PR validado |
| 2. Arquitecturas | Constructor CNN validado, formas, parámetros, exportación y versiones en memoria | Guardado y versionado persistente mediante API; validación del servidor |
| 3. Entrenamiento | Cola y parada temprana de demostración | Worker Python, TensorFlow/Keras y estados persistidos; entrenamiento real de extremo a extremo |
| 4. Tiempo real y evaluación | Dos gráficos y cancelación de simulación | Eventos autenticados, métricas reales, recuperación y reconexión |
| 5. Model registry y reportes | Fichas, revisión y exportaciones de demostración | Artefactos reales, comparaciones, permisos y auditoría persistente |
| 6. Endurecimiento y despliegue | Pruebas locales y documentación parcial | Seguridad, monitoreo, backups y restauración, despliegue y checklist de producción |

**Primera fase técnica sin cerrar: Fase 1.** Las pantallas de fases posteriores
son avances de frontend y no prueban que esas fases estén completadas.
No se asigna un porcentaje global: no hay una ponderación aprobada ni evidencia
para considerar terminados los componentes aplazados.

## Incremento de continuación: validación del frontend

- Pruebas E2E independientes de runtime/ultimo_dataset.txt y de rutas Windows.
- Imágenes PNG sintéticas temporales, 10 clases y 20 imágenes por clase.
  Sirven para validar archivos e interfaz; no evalúan aprendizaje ni reconocimiento.
- Dataset externo opcional mediante NEUROLAB_E2E_DATASET (200 PNG, 20 por clase,
  carpetas 0 a 9, imágenes de 28 x 28 y nombres únicos para el caso de búsqueda).
- Los escenarios que editan arquitectura o épocas seleccionan Manual.
- Regresiones para modo predeterminado, bloqueo de controles, conservación de
  configuración/épocas y aislamiento de ajustes entre proyectos.
- Workflow de GitHub Actions: dependencias, unitarias, build y E2E en Node 24.

## Evidencias de esta revisión

- npm ci: correcto.
- npm run test:unit: 27 aprobadas.
- npm run build: correcto.
- GitHub Actions: 27 pruebas unitarias y 13 escenarios E2E aprobados; build correcto.
- Evidencia remota: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40983413937
  Código probado: commit 1490a98d778f1aa4b5b4031664e3fd68f3ae6935.
- La descarga local de Chromium no estuvo disponible; el resultado E2E procede
  del runner de GitHub, que sí instaló y ejecutó el navegador.
- Validación automatizada de este incremento: 40/40 pruebas aprobadas (100%).
  Este porcentaje mide la suite ejecutada, no el avance global del producto.
- La exportación prueba bytes y manifiesto con un adaptador; el diálogo nativo
  de permisos sigue requiriendo comprobación manual en el navegador del usuario.

## Próximo cierre

1. Integrar el PR del frontend adaptado, con CI verde comprobada.
2. Revisar los criterios del alcance CNN antes de ampliar módulos.
3. Mantener API, autenticación y persistencia aplazadas hasta que el usuario
   autorice avanzar más allá del frontend sin base de datos.


## Incremento: gestión de proyectos CNN

- Edición de nombre y descripción, estado y hasta seis etiquetas.
- Búsqueda combinada con filtros por estado; nombres únicos normalizados.
- Identificadores estables: editar no cambia datasets, arquitectura ni ejecuciones.
- Archivar impide nuevas simulaciones y conserva los trabajos ya iniciados.
- Los datos siguen en memoria; no hay base de datos ni entrenamiento real.
- Evidencia: 32/32 unitarias, 15/15 escenarios Chromium y build aprobados en
  https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40984192661
  para el código 87bcbe2a5f8b60ad1d58c2587b0f9c7801ce703e.
- Avance global estimado comunicado: 32% (anterior 30%). Es una estimación del
  alcance integral CNN; no equivale al porcentaje de pruebas ni al cierre de fase.
- La Fase 1 permanece parcial: autenticación, API, permisos y persistencia siguen
  aplazados por la restricción vigente de trabajar solo el frontend.


## Incremento: evaluación y comparación de ejecuciones CNN

- Hasta tres ejecuciones completadas del mismo proyecto, comparadas lado a lado.
- Configuración, modo y huella de dataset conservados; advertencia si cambian
  las particiones o las imágenes. No se calcula una clasificación de ganadores.
- JSON/CSV de comparación y CSV completo por época; paginación de diez épocas.
- Mínimo observado de pérdida separado de la referencia de parada temprana.
- No incluye predicciones, entrenamiento real ni medidas reales de generalización.
- Evidencia: 38/38 pruebas unitarias, 17/17 escenarios Chromium y build aprobados:
  https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40984772219
  Código probado: 737feedc6e119d695738c5361f6940848a084a7a.
- Avance global estimado comunicado: 35% (antes 32%). Estimación del alcance
  integral CNN, no un porcentaje de fases completadas ni de pruebas aprobadas.
- La Fase 1 integral sigue parcial; se avanzó en la interfaz de fases 4 y 5.


## Incremento: historial y repetición de simulaciones CNN

- Búsqueda, filtros y CSV del historial del proyecto activo.
- Fechas de creación/inicio/fin; duración de ejecuciones terminadas, sin inventar
  fechas para registros anteriores ni duración de trabajos cancelados antes del inicio.
- Repetición desde la primera época con ID nuevo y vínculo al origen; conserva
  configuración, dataset y versión. No reanuda pesos ni altera el trabajo anterior.
- Repeticiones sujetas a cuotas y al estado archivado del proyecto.
- Evidencia: 43/43 unitarias, 18/18 escenarios Chromium y build aprobados:
  https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40985276837
  Código: 317788915d8a1b4d3ac932801d5f494afd2cbf51.
- Avance global estimado comunicado: 38% (antes 35%). El porcentaje es una
  estimación del producto integral CNN, no la proporción de pruebas aprobadas.
- Sin base de datos ni entrenamiento real. La Fase 1 integral sigue parcial.


## Autorización de PostgreSQL e inicio real de la base de plataforma

El usuario autorizó base de datos si la exige el documento. La sección 14,
Fase 1, exige PostgreSQL, API, autenticación y migraciones, por lo que se inició
ese incremento. La restricción anterior de solo frontend queda superada para
estos componentes; el motor de entrenamiento sigue simulado.

- PostgreSQL 16 y API FastAPI con migración SQL versionada e idempotente.
- Usuarios, sesiones revocables y proyectos con propietario.
- Registro/login/logout y protección de proyectos entre usuarios.
- Persistencia comprobada entre conexiones/clientes; revisión para evitar
  sobrescribir ediciones y nombres únicos por propietario.
- Seis pruebas de integración aprobadas contra PostgreSQL real en GitHub Actions:
  https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40986139303
  Código b56207103414915c8836106aa32723ebc67a1394.
- No se ejecutó PostgreSQL localmente en el entorno de revisión: no dispone de
  Docker ni del servidor instalado. La evidencia procede del runner de CI.
- Docker Compose y guía local preparados. No hay una base o API pública
  aprovisionada para el usuario. La vista previa sigue usando datos en memoria.
- Pendiente inmediato: conectar React a autenticación y proyectos de esta API.
- Fase 1 integral aún parcial; faltan integración UI, permisos colaborativos y
  el resto de criterios. El entrenamiento real corresponde a la fase posterior.
- Avance global estimado comunicado: 43% (antes 38%). Es una estimación del
  producto integral, no un porcentaje de pruebas ni una fase declarada completa.


## Integración React → API → PostgreSQL

- Registro/login, recuperación de sesión y logout desde React.
- Creación y edición de proyectos confirmadas por el servidor; revisión optimista.
- Persistencia comprobada tras recargar y cerrar/abrir sesión; aislamiento de cuentas.
- Sin falsos guardados ni fallback silencioso a memoria ante fallos de la API.
- Modo conectado explícito con VITE_USE_API=true. Sesiones mediante cookies HttpOnly,
  sin tokens en localStorage. Proxy Vite local y guía de despliegue del mismo origen.
- Persisten cuentas, sesiones y proyectos; imágenes, arquitecturas y experimentos
  permanecen en memoria. No hay entrenamiento real aún.
- Código 753dace60f30ebdbbe378411b2e131088fe0bf07 validado:
  6 pruebas API + 2 E2E reales PostgreSQL aprobadas en
  https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40987026295
  43 unitarias, build y 18 E2E demo aprobadas en
  https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40987026313
- Vista privada aún en demo: no hay API pública ni PostgreSQL aprovisionado para
  el usuario. La integración está probada en CI y preparada para activación local.
- Avance global estimado: 48% (antes 43%). La Fase 1 sigue parcial; faltan roles
  colaborativos y completar los demás criterios. No se declara finalizado el MVP.

## Base Neon aprovisionada y comprobada

- Proyecto neurolab-enterprise creado en la organización Eros (Free), PostgreSQL 16.
- Ramas production y development con migración 001_platform.sql aplicada.
- Desarrollo: segunda aplicación idempotente, restricciones SQL comprobadas y
  rollback de registros de prueba. Principal: lectura de esquema e historial.
- Ambas ramas sin cuentas, sesiones ni proyectos de prueba al finalizar.
- Migrador preparado para DATABASE_URL_UNPOOLED; las pruebas conservan siempre
  TEST_DATABASE_URL explícita, aunque exista una URL de migración de producción.
- Detalle reproducible en NEON.md. La revisión local por psycopg no pudo resolver
  el DNS de Neon; esta comprobación de esquema usa la conexión administrada.
- Pendiente: desplegar API, conectar vista previa y verificar el flujo sobre Neon.
  El entrenamiento continúa simulado. La Fase 1 sigue parcial.
- Avance global estimado: 50% (antes 48%), por la infraestructura real verificada.

## Preparación del despliegue de un solo origen

- Dockerfile.render compila React conectado y lo sirve con la API FastAPI.
- Arranque con migraciones previas, PORT configurable y usuario sin privilegios.
- Origen Render explícito para la sesión; las rutas API conservan su protección.
- Pruebas de hosting y verificación del contenedor de producción añadidas a CI.
- Referencias y configuración en DESPLIEGUE_RENDER.md. No se ha creado un servicio:
  Render requiere confirmar el workspace, que todavía no está seleccionado.
- La vista privada permanece en demo; no se declara conexión pública con Neon.

## Arquitectura de despliegue corregida según el usuario

- Backend exclusivamente en Render, frontend en Vercel y PostgreSQL en Neon.
- Se retira Dockerfile.render y el hosting de estáticos desde FastAPI.
- Imagen de API independiente y configuración Vercel programática con destino
  explícito; /api se reenvía a Render manteniendo las cookies del frontend.
- Origen Vercel exacto, respuestas privadas sin caché y pruebas del proxy en CI.
- Proyecto neurolab-enterprise creado en el equipo EROSSS de Vercel, sin publicar.
- Render pendiente de confirmar My Workspace; no hay servicio creado ni se
  declara operativo el despliegue. Avance global estimado conservado: 50%.

## Incremento comprobado: despliegue Render + Vercel (30 de octubre de 2026)

- Render: servicio `neurolab-enterprise-api` creado en My Workspace, plan Free; deploy `dep-dbi08a5g1s2s73dj7ok0` marcado `live`, commit `df162826`. URL: https://neurolab-enterprise-api.onrender.com.
- Vercel: proyecto `neurolab-enterprise` compilado y despliegue `dpl_6kV5FhqWpFkDPCQ7WUhBf5dyrJjK` con estado `READY` y destino `production`, desde `fix/validacion-frontend-cnn` y commit `df162826`. URL: https://neurolab-enterprise-xi.vercel.app.
- Neon: base `neurolab`, tablas `users`, `sessions`, `projects` y `schema_migrations`; 1 migración aplicada, 0 usuarios y 0 proyectos al comprobar. Sin datos de producción introducidos por esta revisión.
- CI del commit publicado: frontend y API/PostgreSQL correctos, https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40992764258 y https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40992764285.
- Advertencia de seguridad: el build npm reportó 4 vulnerabilidades de severidad alta en dependencias; pendiente de investigación y corrección.
- La publicación no se verificó aún navegando desde un cliente externo: la lectura HTTP del health y de la página no estuvo accesible en el entorno de revisión. No se afirma éxito E2E real en producción. La protección SSO del proyecto Vercel puede requerir inicio de sesión.
- Continúan pendientes: entrenamientos CNN reales en Python, persistencia de datasets, arquitecturas y resultados, monitorización y verificación de uso en producción. La Fase 1 sigue parcial.
- **Avance global estimado: 55%** (antes 50%) por la publicación comprobada de ambos componentes. Es una estimación de alcance, no porcentaje de pruebas ni cierre de fase.


## Incremento: motor Python de entrenamiento CNN real

- Se incorporó `services/api/app/real_cnn.py`: carga PNG/JPG/WebP por clase, valida formato y duplicados, redimensiona, normaliza y particiona de modo estratificado.
- El constructor Keras implementa Conv2D, MaxPooling, Flatten y Dense con activación de salida adecuada para dos o múltiples clases; admite dropout, L2, semilla y parada temprana. Acepta la configuración del diseñador exportada a JSON.
- `model.fit` genera métricas observadas por época; el test independiente produce precisión y pérdida reales. `model.keras` almacena pesos y `metrics.json` almacena resultados. `predict` reutiliza el modelo sin entrenamiento adicional.
- Dependencias de ML separadas en `requirements-ml.txt`: el contenedor público de Render NO las instala todavía, para evitar carga de TensorFlow en el servicio gratuito.
- GitHub Actions entrenó y realizó pruebas de preprocesamiento, divisiones, rechazo de duplicados, arquitectura, guardado, carga y predicción: ejecución `40994891105` con conclusión **success**.
- La ejecución de CI trabaja con imágenes sintéticas generadas dentro de la prueba, por lo que no representa precisión de un dataset real ni rendimiento de producción.
- Estado: motor Python **comprobado**, conexión de React a worker de entrenamiento y persistencia de artefactos **pendientes**. Los gráficos públicos siguen simulados; no se afirma haber concluido la fase de entrenamiento del MVP.
- Avance global estimado comunicado: **58%** (anterior 55%). El incremento corresponde a un motor funcional aislado, no a la integración completa.

## Incremento: CNN real en navegador, historial y predicción

- Se integró TensorFlow.js 4.22.0 en `apps/web`, cargado bajo demanda únicamente al entrenar o clasificar.
- La sección **Entrenamientos** distingue entrenamiento CNN real en navegador de la cola de simulaciones didácticas. Se entrena desde imágenes cargadas, con particiones de entrenamiento y validación; se evalúa por separado sobre test.
- Los límites explícitos son 200 imágenes, 32×32 píxeles, 500 000 parámetros CNN, 40 épocas y batch máximo de 64. Hay visualización de métricas observadas por época y cancelación.
- Los pesos se guardan mediante `model.save('indexeddb://...')`; se recuperan con `loadLayersModel` para reconocer imágenes nuevas **sin reentrenar**. Solo están disponibles en el mismo navegador mientras se conserven sus datos.
- La migración `003_browser_cnn.sql` distingue resultados del motor Python/Keras y del navegador. Las métricas del navegador se guardan en Neon, asociadas al usuario y proyecto, pero **ninguno de los reportes del cliente está certificado por el servidor**. Los pesos no se guardan en Neon.
- Las pruebas frontend incluyen entrenamiento verdadero con TensorFlow.js, prueba completa Chromium con imágenes sintéticas y guardado IndexedDB; API/PostgreSQL comprueba permisos, reportes y migraciones; el motor Python se prueba por separado.
- Referencia de prueba aprobada para la integración: frontend https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40997590491 y API/PostgreSQL https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40997590355; motor Python https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40997590345.
- **Limitación:** los modelos se entrenan en el navegador, no en un worker remoto Python; no se sincronizan los pesos entre equipos. No se ha desplegado este bloque; el despliegue de Vercel permanece en el commit `df162826`, por decisión expresa del usuario.
- Avance global estimado: **66%** (anterior 60%). No equivale a cierre íntegro de las fases del documento maestro ni a prueba de la publicación en producción.

## Incremento: respaldo y recuperación de pesos CNN

- Preparado un archivo portable `.ncnn` sin ZIP con arquitectura, métricas y pesos TensorFlow.js; no incluye imágenes ni contraseñas.
- Respaldo y restauración para el mismo proyecto y entrenamiento, con validación de topología, límite de tamaño, SHA-256 y protección contra sobrescritura de pesos existentes.
- Predicción posterior sin reentrenar incluso si no se ha vuelto a cargar el dataset.
- Integración de acciones en el panel de entrenamiento y en el historial de reportes reales.
- Persistencia de pesos limitada al IndexedDB de ese navegador; el respaldo debe conservarse externamente. No hay almacenamiento de pesos en Neon ni sincronización cloud automática.
- Verificado en GitHub Actions: frontend unitarias + build + **19/19 escenarios Chromium** (incluida descarga, restauración en otro contexto y predicción) aprobados: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40998937195. API/PostgreSQL aprobada: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40998937185. Motor Python/Keras aprobado: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/40998937139. Código funcional comprobado en commit `6c8704b998acb227694521ea429cc44a8be837bf`; commits posteriores hasta esta revisión son de documentación.
- Avance global estimado de la aplicación: **70%** (anterior 66%), dado que respaldo, restauración e inferencia desde otra sesión ya pasaron pruebas. No representa rendimiento predictivo demostrado ni disponibilidad de modelos en la nube.

## Bloque: evaluación comparativa CNN real

- Preparado panel independiente de resultados de pruebas reales declarados por el cliente, con selección de hasta tres experimentos, filtros, tablas de épocas y exportación CSV/JSON.
- Comparabilidad condicionada a huella, clases, cantidades, semilla, motor y entrada; nunca certifica particiones idénticas ni superioridad estadística.
- Panel previo de simulaciones se mantiene separado. No se almacenan ni exportan pesos o imágenes.
- Validación completa aprobada en el commit `64f9817951dc35052fd653f1f5761b18b7fb601c`: frontend 19/19 escenarios Chromium y build; API 30/30 pruebas Python y 9 escenarios conectados/hosting; motor TensorFlow/Keras independiente también aprobado. Referencias: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41000653594 y https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41000653591 y https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41000653578.
- **Avance global estimado: 77%** (anterior 74%, incremento +3 puntos por comparación y exportación CNN real verificadas). La prueba usa datos sintéticos y no valida capacidad de generalización predictiva.
- Ningún despliegue nuevo autorizado.

## Incremento verificado: Dashboard y reportes profesionales CNN reales

- Se conectaron Dashboard y Reportes a los informes y fichas de modelos reales de PostgreSQL.
- Indicadores de entrenamientos, modelos, datasets, inventario y mayor precisión de prueba declarada; no se atribuye superioridad científica.
- Visualización de los resultados más recientes, tabla por experimento, filtros de motor, descargas CSV/JSON y diálogo de impresión del navegador.
- Los reportes de simulaciones permanecen separados y rotulados como datos didácticos.
- Las exportaciones no incluyen imágenes ni datos binarios de pesos; las hojas CSV neutralizan fórmulas.
- Los datos presentados están limitados a los últimos 50 entrenamientos y 50 modelos; la interfaz advierte cuando pueden no ser exhaustivos.
- Verificación del bloque en GitHub Actions: frontend y Chromium https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41001571786 y API/PostgreSQL https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41001571595 (ambos exitosos); motor CNN https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41001571577 (exitoso).
- Avance global estimado: **80%** (anterior 77%), por integración y validación de informes profesionales CNN reales.
- Continúa sin desplegarse la rama de desarrollo; Vercel conserva el despliegue anterior hasta la autorización explícita.

## Bloque UX y accesibilidad (verificado)

- Navegación accesible con enlace para saltar al contenido y foco gestionado al cambiar de sección.
- Menú móvil plegable con estado anunciado y navegación accesible desde teclado.
- Accesos rápidos a datasets, entrenamiento real y evaluación desde el Dashboard.
- Indicadores de sesión rotulados explícitamente como simulaciones, para no confundirlos con registros reales.
- Mejoras responsivas, contraste, tamaños de botones y estado visual de foco; acceso y registro más legibles.
- Tests de navegación móvil, enlace de salto, foco, estado activo, título de página y control de desbordamiento.
- No modifica la API ni las migraciones. Sin despliegue a Vercel ni Render.
- Validación de commit `3ebe6525894d6353a2233c510fed09d87ac3f44e`: frontend **20/20 escenarios Chromium** y compilación aprobados: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41002266848.
- API **30 pruebas Python** aprobadas, integración de plataforma **5 pruebas** y alojamiento conectado **6 pruebas** aprobadas: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41002266809.
- Motor independiente TensorFlow/Keras aprobado: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41002266817.
- **Avance global estimado: 83%** (anterior 80%, +3 puntos por UX accesible/responsiva verificada). No significa que la versión pública haya sido actualizada.

## Bloque seguridad/rendimiento previo a despliegue — validado

- Restricción de peticiones de otros orígenes, controles Fetch Metadata y límite de cuerpos JSON de 64 KiB.
- Cabeceras de seguridad y protección contra cachear contenido privado.
- Separación de dependencias de pruebas y runtime Render, con comprobación del contenedor.
- Sin modificaciones de pesos, modelos, datos ni migraciones en Neon.
- API y PostgreSQL: **32 pruebas Python aprobadas**, **5 pruebas de plataforma conectada**, **6 pruebas del paquete de producción** y contenedor verificado sin pytest/httpx; evidencia: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41002994070.
- Frontend: **20 pruebas Chromium aprobadas**, tests unitarios y compilación correctos; evidencia: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41002993980.
- TensorFlow/Keras independiente: **3 pruebas reales aprobadas**, sin incorporar entrenamiento Python al contenedor Render; evidencia: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41002993990.
- **Avance global estimado: 86%** (anterior 83%; +3 puntos por endurecimiento, eliminación de dependencias de prueba y verificación integral).
- Sin nuevos despliegues a Vercel/Render. Continúa pendiente la auditoría de límites de acceso distribuido, CSP y el paquete de publicación autorizado.

## Auditoría de publicación: acceso distribuido y CSP (validada en CI)

- Añadida cuota de autenticación por correo mediante HMAC y tabla PostgreSQL `005_auth_attempt_windows.sql`; límites entre instancias y expiración, sin revelar correo ni IP.
- Nueva variable obligatoria de Render `NEUROLAB_RATE_LIMIT_SECRET` (mínimo 32 bytes): necesaria antes de autorizar publicación.
- CSP en modo observación y comprobación de cabeceras en bundle conectado. No bloquear TensorFlow.js hasta probarlo con CSP obligatorio.
- Lista de verificación de Vercel, Render y Neon documentada. No se ha modificado ningún servicio publicado.
- API y PostgreSQL: **34 pruebas Python aprobadas**, además de **5 pruebas de plataforma** y **6 del paquete de producción**, verificadas en https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41004273993.
- Frontend: build, unitarias y **20 pruebas Chromium aprobadas**, incluida comprobación de CSP en observación en hosting conectado: https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41004273922.
- Motor CNN Python/Keras: **3 pruebas aprobadas** en https://github.com/erosCordova/NeuroLab-Enterprise/actions/runs/41004273957.
- **Avance global estimado: 89%** (anterior 86%; +3 puntos por controles de acceso, políticas del frontend y validación de release en CI).
- Importante: la variable `NEUROLAB_RATE_LIMIT_SECRET` **aún debe configurarse en Render antes de autorizar un despliegue**; de lo contrario, login/registro devolverían 503. La migración 005 tampoco se ha aplicado a la base Neon de producción.
- CSP sigue en modo **Report-Only**; sus restricciones no se aplican en modo bloqueo hasta probar el entrenamiento e inferencia real sobre el bundle desplegado.
