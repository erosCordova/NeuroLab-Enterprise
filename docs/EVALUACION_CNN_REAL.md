# Evaluación y comparación de experimentos CNN reales

## Objetivo
Separar por completo la evaluación descriptiva de **informes de entrenamiento real**
de las curvas de demostración de NeuroLab. Disponible en la sección **Evaluación**
cuando el usuario ha iniciado sesión.

## Flujo
1. Obtener de PostgreSQL hasta 50 informes CNN del proyecto, sin datos inventados.
2. Filtrar por motor y huella SHA-256 declarada del dataset.
3. Seleccionar **dos o tres experimentos** y consultar su precisión/pérdida de prueba,
   precisión/pérdida final de validación, parámetros y épocas.
4. Identificar solo la **mayor precisión de test declarada** si las condiciones
   comunicadas son compatibles. **No se declara un modelo científicamente mejor**.
5. Exportar una comparación JSON o CSV, o descargar las métricas observadas por época.

## Restricciones metodológicas
- La comparación verifica coincidencia de huella, clases y orden, tamaños de
  particiones, semilla, motor y dimensiones de entrada.
- Una misma huella y semilla **no certifican que las divisiones de imágenes sean
  idénticas**. No se almacenan los índices de particiones ni hay una validación
  independiente del servidor; no se puede demostrar la equivalencia de test.
- Diferencias en esos criterios se señalan explícitamente: no se determina ninguna
  referencia por precisión.
- No se atribuye significación estadística, causalidad ni generalización por estas
  métricas. Solo se describen valores que fueron comunicados a la API.
- Los informes Keras pueden visualizarse, pero no generan pesos disponibles en
  TensorFlow.js.
- Las exportaciones no incluyen pesos ni imágenes, identifican los datos como
  \`client-reported\`, \`server_verified=false\` y \`simulated=false\`, y neutralizan
  celdas peligrosas que Excel podría ejecutar como fórmulas.
- Las **simulaciones** conservan su propio panel separado, claramente identificado.

## Verificación
Pruebas unitarias para comparabilidad, selección y exportación CSV; Playwright
en modo conectado que registra dos informes de prueba, compara, descarga JSON/CSV
y verifica persistencia tras recarga.

Este incremento permanece **solo en GitHub**, sin despliegues en Vercel ni Render.
