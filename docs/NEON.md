# Neon — base de plataforma

Verificado el 30 de octubre de 2026. Organización Eros, plan Free. No se cambió
el plan ni se aprovisionaron servicios de pago. Proyecto `neurolab-enterprise`,
PostgreSQL 16, región AWS US East Ohio (`aws-us-east-2`), compute de 0.25 CU.
Se conservaron las políticas de suspensión permitidas por la cuenta.

Panel: https://console.neon.tech/app/projects/young-resonance-34672857

| Entorno | Rama | ID | Estado |
| --- | --- | --- | --- |
| Principal | production | br-tiny-sky-b4fivm0v | Esquema aplicado, sin cuentas ni proyectos |
| Desarrollo | development | br-curly-hall-b4gs7nlc | Migración y restricciones comprobadas |

## Qué está comprobado

- La rama de desarrollo se creó antes de aplicar el esquema.
- `001_platform.sql` se aplicó primero allí, y se repitió sin duplicar tablas
  ni la entrada de historial. Después se aplicó a production.
- Ambas ramas contienen users, sessions, projects y schema_migrations.
- Checksum de la migración:
  `7b2762115c0beef43dad388ed7a1c606bdf7b96178ccbd5c3c65e8dc9ee66e48`.
- La prueba SQL en development verifica alta, revisión inicial, nombre único por
  propietario, clave foránea, estado, etiquetas y revisión válidos. Revierte los
  registros de prueba mediante una subtransacción; no usa DELETE ni TRUNCATE.
- Al terminar, ambas ramas tenían cero usuarios, sesiones y proyectos.

La migración conserva exactamente el SQL versionado del repositorio. La
ejecución mediante la conexión administrada de Neon usó una transacción con
bloqueo y el mismo checksum que `app.migrate`.

## Conectar la API local

En el panel Connect, selecciona development y la base neurolab. Copia una URL
pooled para DATABASE_URL y una URL direct para DATABASE_URL_UNPOOLED. El archivo
`services/api/.env.example` es una plantilla sin credenciales. Cópialo a `.env`
en esa misma carpeta y completa los valores en tu computadora.

Desde services/api, en Git Bash y con Python 3.12:

```bash
set -a
source .env
set +a
python -m pip install -r requirements.txt
python -m app.migrate
python -m uvicorn app.main:app --host 127.0.0.1 --port 8011
```

La API usa DATABASE_URL; el migrador prefiere DATABASE_URL_UNPOOLED y admite una
URL explícita para pruebas. Las URLs deben conservar los parámetros TLS que
genera Neon. Las credenciales no deben aparecer en variables VITE_ ni en Git.
COOKIE_SECURE=false se utiliza únicamente para HTTP local.

En apps/web, con la API iniciada:

```bash
VITE_USE_API=true npm run dev
```

Sigue CONEXION_REACT_API.md para el modo conectado y el proxy. Las pruebas de
integración requieren TEST_DATABASE_URL de una base separada; nunca production.
El smoke SQL reutilizable está en services/api/tests/neon_smoke.sql y también
se ejecuta en las pruebas de PostgreSQL de CI.

## Límites actuales

La conexión directa por psycopg desde el entorno de revisión no resolvió el DNS
del host Neon. Por ello las verificaciones de este nuevo proyecto proceden de
la conexión administrada de Neon; no se atribuyen a pruebas API contra Neon.
Las pruebas completas React/API/PostgreSQL se ejecutan contra PostgreSQL de CI.

La vista previa privada sigue en modo demo. No hay API pública desplegada y no
se ha conectado esa vista previa a Neon. Cuentas, sesiones y proyectos tienen
esquema persistente; imágenes, arquitecturas y experimentos continúan en memoria.
El entrenamiento sigue simulado. Pendiente: despliegue HTTPS del backend y
conexión del frontend, antes de avanzar con persistencia de arquitecturas.
