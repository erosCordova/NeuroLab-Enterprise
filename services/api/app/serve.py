"""Start the Render API after transactional migrations succeed."""
import os
import uvicorn
from app.migrate import migrate
from app.release_readiness import validate_render_config


def main():
    port = int(os.getenv('PORT', '10000'))
    if not 1 <= port <= 65535:
        raise ValueError('PORT must be between 1 and 65535')
    # Reject unsafe production configuration BEFORE touching Neon migrations.
    validate_render_config()
    migrate()
    uvicorn.run('app.main:app', host='0.0.0.0', port=port)


if __name__ == '__main__':
    main()
