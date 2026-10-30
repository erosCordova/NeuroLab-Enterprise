# NeuroLab Enterprise — CNN

Frontend para diseñar arquitecturas CNN, cargar imágenes por clase, explorar
particiones y observar simulaciones con gráficos de precisión y pérdida.
Automático es el modo predeterminado; Manual permite editar la configuración.

**Estado:** frontend demo y modo conectado opcional a FastAPI/PostgreSQL.
La API persiste cuentas, sesiones y proyectos. Consulta
[la conexión React/API](docs/CONEXION_REACT_API.md) para activarla.
La base de plataforma ya está creada en Neon; consulta [su estado y conexión](docs/NEON.md).
La vista previa sigue en demo hasta desplegar el backend.
Las imágenes y su preprocesamiento son
reales; el entrenamiento y las métricas son simulados. Dropout y L2 se conservan
como configuración y no modifican esas curvas. No se generan pesos entrenados.
En demo los datos se pierden al recargar. En modo conectado se conservan
los proyectos; imágenes, arquitecturas y simulaciones todavía son de sesión.

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
