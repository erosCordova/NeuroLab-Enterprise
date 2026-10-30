from fastapi.testclient import TestClient
from app.main import create_app, database


def hosting_app(monkeypatch):
    monkeypatch.delenv('APP_ORIGINS', raising=False)
    monkeypatch.setenv('RENDER_EXTERNAL_URL', 'https://neurolab-api.example')
    app = create_app()
    app.dependency_overrides[database] = lambda: None
    return app


def test_backend_exposes_no_frontend_bundle(monkeypatch):
    with TestClient(hosting_app(monkeypatch)) as client:
        assert client.get('/').status_code == 404
        assert client.get('/index.html').status_code == 404


def test_exact_vercel_origin_is_accepted_and_others_rejected(monkeypatch):
    hosting_app(monkeypatch)
    monkeypatch.setenv('APP_ORIGINS', 'https://neurolab.vercel.app')
    app = create_app()
    app.dependency_overrides[database] = lambda: None
    with TestClient(app) as client:
        assert client.post('/api/v1/auth/login', json={}, headers={
            'Origin': 'https://neurolab.vercel.app',
        }).status_code == 422
        assert client.post('/api/v1/auth/login', json={}, headers={
            'Origin': 'https://neurolab.vercel.app.attacker.example',
        }).status_code == 403


def test_preflight_allows_only_the_configured_frontend(monkeypatch):
    hosting_app(monkeypatch)
    monkeypatch.setenv('APP_ORIGINS', 'https://neurolab.vercel.app')
    with TestClient(create_app()) as client:
        headers = {'Origin': 'https://neurolab.vercel.app', 'Access-Control-Request-Method': 'POST'}
        response = client.options('/api/v1/auth/login', headers=headers)
        assert response.status_code == 200
        assert response.headers['access-control-allow-origin'] == headers['Origin']
        assert response.headers['access-control-allow-credentials'] == 'true'
        response = client.options('/api/v1/auth/login', headers={**headers, 'Origin': 'https://another.vercel.app'})
        assert 'access-control-allow-origin' not in response.headers


def test_api_responses_and_errors_are_never_cached(monkeypatch):
    with TestClient(hosting_app(monkeypatch)) as client:
        for response in [client.post('/api/v1/auth/login', json={}), client.get('/api/v1/missing')]:
            assert response.headers['cache-control'] == 'private, no-store'
            assert response.headers['vercel-cdn-cache-control'] == 'no-store'
