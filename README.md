# NeuroLab Enterprise — CNN

Frontend para diseñar arquitecturas CNN, cargar imágenes por clase, explorar
particiones, entrenar CNN reales con TensorFlow.js en el navegador y observar
simulaciones didácticas claramente diferenciadas.
Automático es el modo predeterminado; Manual permite editar la configuración.

**Estado:** CNN real entrenable en navegador, simulaciones didácticas y modo conectado a FastAPI/PostgreSQL.
La API persiste cuentas, sesiones y proyectos. Consulta
[la conexión React/API](docs/CONEXION_REACT_API.md) para activarla.
La base de plataforma ya está creada en Neon; consulta [su estado y conexión](docs/NEON.md).
El backend ya está publicado en Render y el frontend se compiló y publicó en Vercel desde la rama de integración. Falta confirmar el recorrido completo contra Neon desde un navegador externo; el entrenamiento Python/Keras sigue separado de la interfaz, pero el navegador ya incorpora TensorFlow.js real.
La arquitectura elegida usa backend en Render y frontend en Vercel; consulta
[la guía de despliegue](docs/DESPLIEGUE_RENDER.md).
Las imágenes y su preprocesamiento son reales. El modo TensorFlow.js entrena y guarda
pesos en IndexedDB del navegador; la antigua cola de simulación mantiene curvas
ilustrativas para aprendizaje y no debe confundirse con el entrenamiento real.
En modo conectado se conservan los proyectos y reportes reales en PostgreSQL.
Las imágenes y arquitecturas siguen siendo de sesión; los pesos TensorFlow.js
quedan solo en el IndexedDB del navegador que los entrenó.

## Ejecución local

Usa Node.js 24 y npm. Desde la raíz del repositorio:

```bash
cd apps/web
npm ci
npm run dev
```

Abre la dirección que indique Vite. Carga una carpeta con estructura
`dataset/clase/imagen.png`. Se admiten PNG, JPG y WebP. No necesitas ZIP.
Los datasets y resultados locales se excluyen de Git.

## Validación

Desde `apps/web`:

```bash
npm run test:unit
npm run build
npx playwright install chromium
npm run test:e2e
```

En Linux, si faltan dependencias del navegador, usa
`npx playwright install --with-deps chromium`.

Las pruebas E2E generan 200 PNG sintéticos temporales; no necesitan descargas de
MNIST, archivos en runtime ni rutas de otra computadora. No constituyen una prueba
de calidad de un modelo entrenado. La exportación de carpetas se prueba con un
adaptador simulado: el diálogo de permisos nativo requiere comprobación manual.

Para probar tu MNIST local de 200 imágenes (20 por clase, carpetas 0 a 9), puedes
usar, en Git Bash:

```bash
NEUROLAB_E2E_DATASET='/c/ruta/a/mnist_200' npm run test:e2e
```

El dataset externo se conserva; solo se eliminan las imágenes temporales que
crean las propias pruebas. Consulta [el estado de las fases](docs/ESTADO_FASES.md)
y [el alcance CNN](docs/ALCANCE_CNN.md) para distinguir frontend y MVP completo.

## Integración continua

GitHub Actions ejecuta unitarias, build y E2E en los pull requests y al actualizar
main. Los resultados efectivos se consultan en la pestaña Actions del repositorio.

## Entrenamiento CNN real en Python (componente independiente)

Se incorporó el motor `services/api/app/real_cnn.py`, que utiliza TensorFlow/Keras para entrenar y guardar modelos reales fuera del backend web de Render. Consulta [ENTRENAMIENTO_REAL_CNN.md](docs/ENTRENAMIENTO_REAL_CNN.md) para instalar el entorno ML, entrenar por CLI, evaluar en test y predecir sin reentrenar. **La web también incorpora entrenamiento real en el navegador**, separado del motor Python. Para los límites, el historial y la predicción consulta [ENTRENAMIENTO_NAVEGADOR.md](docs/ENTRENAMIENTO_NAVEGADOR.md). El procesamiento remoto Python y el almacenamiento de pesos en la nube siguen pendientes.

## Despliegue controlado

El bloque TensorFlow.js está implementado y probado en la rama `fix/validacion-frontend-cnn`, **no publicado**. Vercel y Render solo se actualizarán después de la autorización explícita del propietario, agrupando funcionalidades para ahorrar despliegues.

## Respaldo portable de modelos CNN

El navegador permite descargar un solo archivo `.ncnn` con arquitectura, pesos y métricas, restaurarlo en el mismo proyecto y reconocer imágenes sin reentrenar. Consulta [RESPALDOS_CNN.md](docs/RESPALDOS_CNN.md). Esta función está preparada en la rama de desarrollo; no modifica el despliegue público hasta autorización explícita.

## Estado de la versión candidata

La rama `fix/validacion-frontend-cnn` está validada en GitHub Actions, pero
la aplicación pública sigue en el commit `df162826`. No confundir los avances
de la rama de desarrollo con los servicios actualmente publicados.

La protección de arranque de Render exige configurar
`NEUROLAB_RATE_LIMIT_SECRET`, `DATABASE_URL`,
`DATABASE_URL_UNPOOLED`, `COOKIE_SECURE=true` y `APP_ORIGINS`
con el origen HTTPS correcto. No se han leído ni modificado secretos.

La lista de requisitos antes de publicar se encuentra en
[PUERTA_PUBLICACION_CONTROLADA.md](docs/PUERTA_PUBLICACION_CONTROLADA.md).

## Preparación de migraciones sin tocar Neon

El estado real de Neon confirmó solo `001_platform.sql` aplicada. Hay cuatro migraciones pendientes (`002`–`005`). El módulo `app.migration_plan` ofrece una inspección **de solo lectura**, y GitHub Actions ensaya el salto desde 001 con datos sintéticos en PostgreSQL aislado. Consulta [la puerta de publicación](docs/PUERTA_PUBLICACION_CONTROLADA.md) antes de aprobar cualquier despliegue.
