from fastapi.testclient import TestClient
import pytest
from app.main import create_app, database


def test_frontend_and_api_share_origin_without_exposing_other_files(tmp_path, monkeypatch):
    public = tmp_path / 'public'
    public.mkdir()
    (public / 'index.html').write_text('<h1>NeuroLab conectado</h1>')
    (public / 'app.js').write_text('window.bundleLoaded = true;')
    (tmp_path / 'private.env').write_text('private-fixture')
    monkeypatch.setenv('FRONTEND_DIST', str(public))
    app = create_app()
    app.dependency_overrides[database] = lambda: None
    with TestClient(app) as client:
        assert 'NeuroLab conectado' in client.get('/').text
        assert client.get('/app.js').status_code == 200
        assert client.get('/private.env').status_code == 404
        assert client.get('/%2e%2e/private.env').status_code == 404
        assert client.get('/api/v1/auth/login').status_code != 200
        assert client.post('/api/v1/auth/login', json={}).status_code == 422


def test_missing_bundle_fails_instead_of_showing_a_demo(monkeypatch, tmp_path):
    monkeypatch.setenv('FRONTEND_DIST', str(tmp_path))
    with pytest.raises(RuntimeError, match='compiled frontend'):
        create_app()


def test_render_origin_is_accepted_and_untrusted_origin_rejected(monkeypatch):
    monkeypatch.delenv('FRONTEND_DIST', raising=False)
    monkeypatch.delenv('APP_ORIGINS', raising=False)
    monkeypatch.setenv('RENDER_EXTERNAL_URL', 'https://neurolab-hosting.example')
    app = create_app()
    app.dependency_overrides[database] = lambda: None
    with TestClient(app) as client:
        assert client.post('/api/v1/auth/login', json={}, headers={
            'Origin': 'https://neurolab-hosting.example',
        }).status_code == 422
        assert client.post('/api/v1/auth/login', json={}, headers={
            'Origin': 'https://untrusted.example',
        }).status_code == 403
