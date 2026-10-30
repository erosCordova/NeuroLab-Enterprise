# PostgreSQL y API — primer incremento de la Fase 1

La autorización para usar base de datos permite avanzar en los componentes que
exige la sección 14 del documento maestro. PostgreSQL y FastAPI siguen la
arquitectura propuesta. El entrenamiento permanece simulado.

## Qué incluye

- Migración transaccional versionada con checksum y bloqueo entre migradores.
- Usuarios, sesiones revocables y proyectos con propietario.
- Contraseñas derivadas con scrypt y sal aleatoria; no se guardan en claro.
- Cookie de sesión HttpOnly, SameSite=Lax y Secure por defecto.
- Registro, login, logout y consulta de identidad.
- Listado, creación, consulta y edición de proyectos propios.
- Nombres únicos por propietario; control de revisión para evitar sobrescrituras.
- Docker Compose con PostgreSQL 16, volumen y API en 127.0.0.1:8011.
- Pruebas de integración con un PostgreSQL efímero real en GitHub Actions.

## Límites del incremento

React dispone de modo conectado opcional, explicado en CONEXION_REACT_API.md.
La vista previa privada continúa en modo demo y no llama a esta API. Ya existe
una base Neon en la cuenta del usuario, con esquema comprobado (NEON.md), pero
no hay backend público desplegado. Las cuentas de integración de CI son efímeras.
No se implementan todavía datasets persistentes, workers, roles colaborativos,
recuperación de contraseña, verificación de email, límites de login distribuidos,
auditoría, backups ni endurecimiento para exposición pública.

## Ejecución local en Git Bash

Requiere Docker Desktop con el motor activo. Desde la raíz del repositorio:

```bash
cp .env.example .env
```

Define NEUROLAB_DB_PASSWORD en .env con una contraseña aleatoria de letras y
números (por ejemplo 32 bytes aleatorios codificados en hexadecimal). No publiques
ese archivo. Compose exige que la variable esté definida.

```bash
docker compose up -d --build
curl http://127.0.0.1:8011/api/v1/health
```

La API aplica la migración antes de iniciar. Contrato interactivo:
http://127.0.0.1:8011/docs . La base no expone un puerto al host; la API es accesible
solo desde la propia PC. docker compose down conserva el volumen; no añadas -v
si necesitas conservar datos.

El ajuste COOKIE_SECURE=false es únicamente para HTTP local. Un despliegue debe
usar HTTPS, COOKIE_SECURE=true y APP_ORIGINS con el origen exacto de su frontend.

## Desarrollo Python

Desde services/api, con un entorno Python 3.12 y DATABASE_URL definida
(en Neon define también DATABASE_URL_UNPOOLED para migraciones directas):

```bash
python -m pip install -r requirements.txt
python -m app.migrate
python -m uvicorn app.main:app --host 127.0.0.1 --port 8011
```

Las pruebas requieren TEST_DATABASE_URL explícita hacia una base separada:

```bash
python -m pytest -q
```

No copies la URL de producción para probar. Las pruebas crean usuarios y
proyectos de ejemplo; no borran ni truncan tablas.
