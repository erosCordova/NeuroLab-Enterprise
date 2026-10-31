"""Versioned transactional migrations. Requires an explicit DATABASE_URL."""
import hashlib
import os
from pathlib import Path
import psycopg
from app.migration_release_gate import approve_production_migrations


def migrate(url=None):
    # Neon migrations use the direct URL; normal API traffic may use its pooler.
    target = url or os.environ.get('DATABASE_URL_UNPOOLED') or os.environ['DATABASE_URL']
    # Falla antes de abrir cualquier transacción de escritura en Render.
    approve_production_migrations(target)
    with psycopg.connect(target) as connection:
        connection.execute('SELECT pg_advisory_xact_lock(726114091)')
        connection.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
        for file in sorted((Path(__file__).parent.parent / 'migrations').glob('*.sql')):
            sql = file.read_text(encoding='utf-8')
            checksum = hashlib.sha256(sql.encode()).hexdigest()
            previous = connection.execute('SELECT checksum FROM schema_migrations WHERE version=%s', (file.name,)).fetchone()
            if previous:
                if previous[0] != checksum:
                    raise RuntimeError('An applied migration was modified: ' + file.name)
                continue
            connection.execute(sql)
            connection.execute('INSERT INTO schema_migrations(version, checksum) VALUES (%s,%s)', (file.name, checksum))


if __name__ == '__main__':
    migrate()
    print('MIGRACIONES_POSTGRESQL=OK')
