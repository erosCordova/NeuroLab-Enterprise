import os
from pathlib import Path
from uuid import uuid4
import psycopg
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.migrate import migrate


@pytest.fixture(scope='session',autouse=True)
def database_setup():
    # Never infer a test target from the application's DATABASE_URL.
    os.environ['DATABASE_URL']=os.environ['TEST_DATABASE_URL']
    os.environ['COOKIE_SECURE']='false'
    # An inherited production migration URL must never redirect test migrations.
    migrate(os.environ['TEST_DATABASE_URL'])
    migrate(os.environ['TEST_DATABASE_URL'])


@pytest.fixture
def client():
    with TestClient(create_app()) as client:
        yield client


def register(client):
    body={'email':str(uuid4())+'@example.com','password':'Contraseña-de-prueba-2026','display_name':'Usuario de prueba'}
    response=client.post('/api/v1/auth/register',json=body)
    assert response.status_code==201,response.text
    return body,response


def project(client,name='Proyecto CNN'):
    response=client.post('/api/v1/projects',json={'name':name,'description':'MNIST','tags':['CNN','cnn']})
    assert response.status_code==201,response.text
    return response.json()


def test_postgresql_and_idempotent_migration(client):
    assert client.get('/api/v1/health').json()['database']=='postgresql'
    with psycopg.connect(os.environ['TEST_DATABASE_URL']) as db:
        assert db.execute('SELECT count(*) FROM schema_migrations').fetchone()[0]==4
        assert 'PostgreSQL' in db.execute('SELECT version()').fetchone()[0]
        db.execute((Path(__file__).parent / 'neon_smoke.sql').read_text())


def test_registration_login_and_revocable_session(client):
    body,response=register(client)
    assert 'httponly' in response.headers['set-cookie'].lower()
    assert 'password' not in response.text
    old=client.cookies.get('neurolab_session')
    assert client.get('/api/v1/auth/me').status_code==200
    assert client.post('/api/v1/auth/logout').status_code==204
    assert client.get('/api/v1/auth/me').status_code==401
    client.cookies.set('neurolab_session',old)
    assert client.get('/api/v1/auth/me').status_code==401
    client.cookies.clear()
    assert client.post('/api/v1/auth/login',json={'email':body['email'],'password':body['password']}).status_code==200
    assert client.post('/api/v1/auth/login',json={'email':body['email'],'password':'incorrecta-12345'}).status_code==401


def test_duplicate_email_and_validation(client):
    body,_=register(client)
    assert client.post('/api/v1/auth/register',json={**body,'email':body['email'].upper()}).status_code==409
    assert client.post('/api/v1/auth/register',json={**body,'password':'short'}).status_code==422
    assert client.post('/api/v1/projects',json={'name':'   '}).status_code==422


def test_production_cookie_is_secure_and_httponly(client, monkeypatch):
    monkeypatch.setenv('COOKIE_SECURE', 'true')
    _, response = register(client)
    cookie = response.headers['set-cookie'].lower()
    assert 'secure' in cookie and 'httponly' in cookie and 'samesite=lax' in cookie


def test_projects_persist_after_new_client(client):
    register(client)
    saved=project(client)
    assert saved['tags']==['cnn']
    cookie=client.cookies.get('neurolab_session')
    with TestClient(create_app()) as reopened:
        reopened.cookies.set('neurolab_session',cookie)
        response=reopened.get('/api/v1/projects/'+saved['id'])
        assert response.status_code==200
        assert response.json()['name']=='Proyecto CNN'
        assert any(row['id']==saved['id'] for row in reopened.get('/api/v1/projects').json())
    result=client.put('/api/v1/projects/'+saved['id'],json={'name':'Proyecto actualizado','status':'Archivado','revision':saved['revision']})
    assert result.status_code==200
    assert result.json()['revision']==2
    assert client.get('/api/v1/projects/'+saved['id']).json()['status']=='Archivado'


def test_project_ownership_and_no_anonymous_access(client):
    assert client.get('/api/v1/projects').status_code==401
    register(client)
    saved=project(client)
    with TestClient(create_app()) as other:
        register(other)
        assert other.get('/api/v1/projects/'+saved['id']).status_code==404
        assert other.put('/api/v1/projects/'+saved['id'],json={'name':'Intento ajeno','revision':1}).status_code==404
        assert other.get('/api/v1/projects').json()==[]


def test_duplicate_names_revision_conflict_and_origin(client):
    register(client)
    saved=project(client,'  Análisis   CNN ')
    assert client.post('/api/v1/projects',json={'name':'ana\u0301lisis cnn'}).status_code==409
    body={'name':'Nuevo nombre','revision':1}
    assert client.put('/api/v1/projects/'+saved['id'],json=body).status_code==200
    assert client.put('/api/v1/projects/'+saved['id'],json={**body,'name':'Sobrescritura'}).status_code==409
    assert client.post('/api/v1/auth/logout',headers={'Origin':'https://sitio-ajeno.example'}).status_code==403
    assert client.get('/api/v1/auth/me').status_code==200


def test_cross_site_csrf_and_untrusted_origins_are_rejected(client, monkeypatch):
    # Browser requests from a foreign site are blocked before authentication.
    foreign = {'Origin':'https://other.example','Sec-Fetch-Site':'cross-site'}
    response=client.post('/api/v1/auth/logout', headers=foreign)
    assert response.status_code==403
    assert response.headers['Cache-Control']=='private, no-store'
    assert response.headers['X-Content-Type-Options']=='nosniff'
    assert response.headers['X-Frame-Options']=='DENY'
    assert response.headers['Referrer-Policy']=='no-referrer'
    assert client.post('/api/v1/auth/logout',headers={'Sec-Fetch-Site':'cross-site'}).status_code==403
    assert client.post('/api/v1/auth/logout',headers={'Origin':'null'}).status_code==403
    assert client.post('/api/v1/auth/logout',headers={'Origin':'https://other.example'}).status_code==403
    # A same-origin request may carry an explicit trusted Origin.
    monkeypatch.setenv('COOKIE_SECURE','false')
    with TestClient(create_app()) as allowed:
        response=allowed.post('/api/v1/auth/logout',headers={'Origin':'http://127.0.0.1:5173','Sec-Fetch-Site':'same-origin'})
        assert response.status_code==204


def test_json_content_type_and_streamed_size_limit(client):
    path='/api/v1/auth/register'
    sample={'email':str(uuid4())+'@example.com','password':'secure-password-2026','display_name':'Prueba CNN'}
    assert client.post(path,data='not json',headers={'Content-Type':'text/plain'}).status_code==415
    huge={**sample,'display_name':'CNN'*25000}
    import json
    from collections.abc import Iterator
    raw=json.dumps(huge).encode()
    assert client.post(path,content=raw,headers={'Content-Type':'application/json'}).status_code==413

    def data_chunks() -> Iterator[bytes]:
        yield raw[:30000]
        yield raw[30000:]
    assert client.post(path,content=data_chunks(),headers={'Content-Type':'application/json'}).status_code==413
    # A small valid request must still be readable by downstream FastAPI.
    response=client.post(path,json=sample)
    assert response.status_code==201,response.text
    assert client.get('/api/v1/auth/me').status_code==200
    assert client.get('/api/v1/auth/me').headers['Cache-Control']=='private, no-store'
