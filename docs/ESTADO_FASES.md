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
