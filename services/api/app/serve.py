"""Start the Render API after transactional migrations succeed."""
import os
import uvicorn
from app.migrate import migrate


def main():
    port = int(os.getenv('PORT', '10000'))
    if not 1 <= port <= 65535:
        raise ValueError('PORT must be between 1 and 65535')
    migrate()
    uvicorn.run('app.main:app', host='0.0.0.0', port=port)


if __name__ == '__main__':
    main()
