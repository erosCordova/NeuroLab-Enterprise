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
