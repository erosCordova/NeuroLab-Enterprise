import os
from pathlib import Path
from uuid import uuid4
import psycopg
import pytest
from fastapi.testclient import TestClient
from app.main import create_app, database
from app.migrate import migrate


@pytest.fixture(scope='session',autouse=True)
def database_setup():
    # Never infer a test target from the application's DATABASE_URL.
    os.environ['DATABASE_URL']=os.environ['TEST_DATABASE_URL']
    os.environ['COOKIE_SECURE']='false'
    os.environ['NEUROLAB_RATE_LIMIT_SECRET']='clave-efimera-pruebas-neurolab-12345678901234567890'
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
        assert db.execute('SELECT count(*) FROM schema_migrations').fetchone()[0]==5
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


def test_auth_throttling_shared_between_clients_and_secret_required(client, monkeypatch):
    body,_=register(client)
    email=body['email']
    url='/api/v1/auth/login'
    attempt={'email':email,'password':'incorrecta-12345'}
    for _ in range(8):
        assert client.post(url,json=attempt).status_code==401
    blocked=client.post(url,json={**attempt,'password':body['password']})
    assert blocked.status_code==429
    assert blocked.headers['Retry-After']=='900'
    # Persiste entre clientes, no depende de memoria del proceso.
    with TestClient(create_app()) as another:
        assert another.post(url,json=attempt).status_code==429
    # Otro correo no comparte la cuota (sin acceso a datos de otras cuentas).
    assert client.post(url,json={
        'email':str(uuid4())+'@example.invalid','password':'incorrecta-12345'
    }).status_code==401
    # Caducidad del límite permite el acceso de nuevo.
    import psycopg
    from app.auth_throttle import identifier
    with psycopg.connect(os.environ['TEST_DATABASE_URL']) as db:
        key=identifier(email,'login')
        db.execute("UPDATE auth_attempt_windows SET started_at=now()-interval '16 minutes' WHERE key_hash=%s",(key,))
        db.commit()
    assert client.post(url,json={'email':email,'password':body['password']}).status_code==200
    with psycopg.connect(os.environ['TEST_DATABASE_URL']) as db:
        assert db.execute('SELECT count(*) FROM auth_attempt_windows WHERE key_hash=%s',(key,)).fetchone()[0]==0
    # No aceptar el inicio de sesión sin secreto (fallar cerrado).
    monkeypatch.delenv('NEUROLAB_RATE_LIMIT_SECRET')
    assert client.post(url,json={'email':email,'password':body['password']}).status_code==503


def test_register_limit_and_hmac_privacy(client):
    from app.auth_throttle import identifier
    email=str(uuid4())+'@example.invalid'
    data={'email':email,'password':'contraseña-segura-12345','display_name':'Prueba CNN'}
    # No necesita gastar scrypt en más de ocho registros fallidos del mismo email.
    initial=client.post('/api/v1/auth/register',json=data)
    assert initial.status_code==201
    for _ in range(8):
        assert client.post('/api/v1/auth/register',json=data).status_code==409
    throttled=client.post('/api/v1/auth/register',json=data)
    assert throttled.status_code==429
    assert identifier(email,'register')!=identifier(email,'login')
    with psycopg.connect(os.environ['TEST_DATABASE_URL']) as db:
        keys=[row[0] for row in db.execute('SELECT key_hash FROM auth_attempt_windows').fetchall()]
    assert email not in keys


def test_readiness_requires_all_migrations_and_tables(client):
    response=client.get('/api/v1/ready')
    assert response.status_code==200,response.text
    assert response.json()=={'status':'ready'}
    assert 'password' not in response.text and 'migration' not in response.text
    assert response.headers['Cache-Control']=='private, no-store'


def test_readiness_denies_missing_schema_without_leaking_details():
    # A stub never touches Neon or modifies the CI database.
    class MissingSchema:
        def execute(self, sql, args=None):
            return self
        def fetchone(self):
            return (None,)

    app=create_app()
    app.dependency_overrides[database]=lambda: MissingSchema()
    with TestClient(app) as test_client:
        result=test_client.get('/api/v1/ready')
    assert result.status_code==503
    assert result.json()=={'detail':'El laboratorio aún no está preparado.'}
    assert 'schema' not in result.text and 'password' not in result.text


def test_release_fingerprint_is_safe_and_never_cached(client, monkeypatch):
    sha = "a" * 40
    monkeypatch.setenv("RENDER_GIT_COMMIT", sha)
    response = client.get("/api/v1/release")
    assert response.status_code == 200
    assert response.json() == {"commit": sha, "protocol": "neurolab-cnn-real-1"}
    assert response.headers["Cache-Control"] == "private, no-store"
    monkeypatch.setenv("RENDER_GIT_COMMIT", "invalid-secret")
    assert client.get("/api/v1/release").json()["commit"] is None


def test_delete_project_enforces_owner_revision_and_cascade(client):
    from test_real_runs_api import report
    register(client)
    targeted=project(client,'Proyecto de eliminación')
    safe=project(client,'Proyecto intacto')
    endpoint=f'/api/v1/projects/{targeted["id"]}'
    with TestClient(create_app()) as outsider:
        register(outsider)
        assert outsider.delete(endpoint,params={'revision':targeted['revision']}).status_code==404
    assert client.delete(endpoint,params={'revision':99}).status_code==409
    assert client.get(endpoint).status_code==200
    body={**report(),'engine':'TensorFlow.js','weights_file':'model.json',
          'model_ref':'indexeddb://neurolab-cnn-'+targeted['id']+'-'+str(uuid4())}
    run=client.post(endpoint+'/real-runs',json=body)
    assert run.status_code==201,run.text
    model=client.post(endpoint+'/real-models',json={'run_id':run.json()['id'],
                                                     'display_name':'Modelo CNN temporal'})
    assert model.status_code==201,model.text
    assert client.delete(endpoint,params={'revision':targeted['revision']}).status_code==204
    with psycopg.connect(os.environ['TEST_DATABASE_URL']) as db:
        assert db.execute('SELECT count(*) FROM real_cnn_runs WHERE project_id=%s',
                          (targeted['id'],)).fetchone()[0]==0
        assert db.execute('SELECT count(*) FROM real_cnn_models WHERE project_id=%s',
                          (targeted['id'],)).fetchone()[0]==0
    assert client.delete(endpoint,params={'revision':targeted['revision']}).status_code==404
    assert [p['id'] for p in client.get('/api/v1/projects').json()]==[safe['id']]
