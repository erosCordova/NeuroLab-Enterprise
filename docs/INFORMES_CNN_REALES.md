# Dashboard e informes profesionales CNN reales

El Dashboard y Reportes consultan los informes guardados en PostgreSQL a través
de la API autenticada. Los indicadores son de entrenamientos reales declarados
y no incluyen los datos de las simulaciones educativas.

Dashboard: número de informes, fichas de modelos, huellas de dataset distintas,
mayor precisión de test declarada y barras de resultados recientes.

Reportes: filtros por motor, tabla por experimento, exportación CSV y JSON,
e impresión mediante el navegador (Guardar PDF). Las fichas y reportes
de simulación permanecen en un bloque distinto.

Limitaciones: como máximo 50 informes y 50 fichas por proyecto; al llegar
a ese límite se advierte que los contadores podrían ser parciales. El informe
no incluye imágenes, pesos, enlaces de IndexedDB ni credenciales.
Las métricas son proporcionadas por clientes y no certificadas por Render;
la mayor precisión comunicada no demuestra que un modelo sea mejor.
Se neutralizan fórmulas potencialmente ejecutables en CSV.

Sin nuevos despliegues en Vercel o Render hasta autorización explícita.
