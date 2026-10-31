import hashlib
import hmac
import os
import re
import secrets
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from app.real_runs import RealCNNImport
from app.auth_throttle import check_attempt, clear_attempts
from app.readiness import schema_is_ready
from app.release_info import get_release_info


def normalize(value):
    return unicodedata.normalize('NFC', ' '.join(value.split()))


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return salt + ':' + digest


def verify_password(password, encoded):
    return hmac.compare_digest(password_hash(password, encoded.split(':')[0]), encoded)


def database():
    with psycopg.connect(os.environ['DATABASE_URL'], row_factory=dict_row) as connection:
        yield connection


def current_user(request: Request, db=Depends(database)):
    token = request.cookies.get('neurolab_session', '')
    user = db.execute('SELECT u.id,u.email,u.display_name FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=%s AND s.expires_at>now()', (hashlib.sha256(token.encode()).hexdigest(),)).fetchone() if token else None
    if not user:
        raise HTTPException(401, 'Inicia sesión para continuar.')
    return user


class Credentials(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=12, max_length=128)

    @field_validator('email')
    @classmethod
    def email_valid(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            raise ValueError('Correo no válido.')
        return value


class Registration(Credentials):
    display_name: str = Field(min_length=3, max_length=80)

    @field_validator('display_name')
    @classmethod
    def name_valid(cls, value):
        value = normalize(value)
        if len(value) < 3:
            raise ValueError('Nombre demasiado corto.')
        return value


class ProjectInput(BaseModel):
    name: str = Field(min_length=3, max_length=80)
    description: str = Field(default='', max_length=1000)
    status: Literal['Activo', 'En preparación', 'Archivado'] = 'Activo'
    tags: list[str] = Field(default_factory=list, max_length=6)

    @field_validator('name')
    @classmethod
    def name_valid(cls, value):
        value = normalize(value)
        if len(value) < 3:
            raise ValueError('Nombre demasiado corto.')
        return value

    @field_validator('tags')
    @classmethod
    def tags_valid(cls, tags):
        result = {}
        for tag in tags:
            tag = normalize(tag)
            if not tag or len(tag) > 24:
                raise ValueError('Etiqueta no válida.')
            result[tag.lower()] = tag
        return list(result.values())


class ProjectUpdate(ProjectInput):
    revision: int = Field(ge=1)



class ModelRegistration(BaseModel):
    run_id: UUID
    display_name: str = Field(min_length=3, max_length=80)
    notes: str = Field(default='', max_length=1000)

    @field_validator('display_name')
    @classmethod
    def valid_name(cls,value):
        value=normalize(value)
        if len(value)<3:raise ValueError('Escribe un nombre válido.')
        return value


class ModelEdit(BaseModel):
    display_name: str = Field(min_length=3, max_length=80)
    notes: str = Field(default='', max_length=1000)
    status: Literal['Registrado','Archivado'] = 'Registrado'
    favorite: bool = False
    revision: int = Field(ge=1)

    @field_validator('display_name')
    @classmethod
    def valid_name(cls,value):
        value=normalize(value)
        if len(value)<3:raise ValueError('Escribe un nombre válido.')
        return value

def create_app():
    app = FastAPI(title='NeuroLab CNN API', version='0.1.0')
    # Render supplies this exact public origin. Never derive trust from Host headers.
    render_origin = os.getenv('RENDER_EXTERNAL_URL', '').rstrip('/')
    defaults = render_origin or 'http://localhost:5173,http://127.0.0.1:5173'
    origins = [value.strip().rstrip('/') for value in os.getenv('APP_ORIGINS', defaults).split(',') if value.strip()]
    if render_origin and render_origin not in origins:
        origins.append(render_origin)
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=['GET','POST','PUT'], allow_headers=['Content-Type'])

    @app.middleware('http')
    async def verify_origin(request, call_next):
        path = request.url.path
        write = request.method in ('POST','PUT','PATCH','DELETE')
        origin = request.headers.get('origin')
        fetch_site = request.headers.get('sec-fetch-site', '').lower()
        rejection = None
        if write and (origin is not None and origin not in origins or fetch_site == 'cross-site'):
            rejection = JSONResponse(status_code=403, content={'detail':'Origen no permitido.'})
        elif write and path.startswith('/api/v1/'):
            # El único POST sin JSON válido es cerrar sesión (sin cuerpo).
            if path != '/api/v1/auth/logout' and (
                request.headers.get('content-type','').split(';')[0].strip().lower() != 'application/json'
            ):
                rejection = JSONResponse(status_code=415, content={'detail':'Usa JSON para enviar datos.'})
            elif path != '/api/v1/auth/logout':
                # Comprueba también transferencias fragmentadas sin Content-Length.
                # Starlette conserva _body para que FastAPI pueda leerlo después.
                chunks = []
                total = 0
                async for fragment in request.stream():
                    total += len(fragment)
                    if total > 65536:
                        rejection = JSONResponse(status_code=413, content={'detail':'La solicitud supera 64 KiB.'})
                        break
                    chunks.append(fragment)
                if rejection is None:
                    request._body = b''.join(chunks)
        response = rejection if rejection is not None else await call_next(request)
        if path.startswith('/api/'):
            response.headers['Cache-Control'] = 'private, no-store'
            response.headers['CDN-Cache-Control'] = 'no-store'
            response.headers['Vercel-CDN-Cache-Control'] = 'no-store'
            response.headers['X-Content-Type-Options'] = 'nosniff'
            response.headers['X-Frame-Options'] = 'DENY'
            response.headers['Referrer-Policy'] = 'no-referrer'
            response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        return response

    def start_session(db, response, user):
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=12)
        db.execute('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (%s,%s,%s)', (hashlib.sha256(token.encode()).hexdigest(),user['id'],expires))
        # Commit before issuing the cookie, not after response serialization.
        db.commit()
        response.set_cookie('neurolab_session',token,httponly=True,secure=os.getenv('COOKIE_SECURE','true').lower()!='false',samesite='lax',max_age=43200,path='/')
        return {key:user[key] for key in ('id','email','display_name')}

    @app.get('/api/v1/health')
    def health(db=Depends(database)):
        db.execute('SELECT 1')
        return {'status':'ok','database':'postgresql','training':'browser-tensorflowjs (not server)'}

    @app.get('/api/v1/ready')
    def ready(db=Depends(database)):
        # This URL intentionally has no detailed schema/credential diagnostics.
        if not schema_is_ready(db):
            raise HTTPException(503, 'El laboratorio aún no está preparado.')
        return {'status':'ready'}


    @app.get('/api/v1/release')
    def release():
        # Exponer solo un identificador de versión pública.
        return get_release_info()

    @app.post('/api/v1/auth/register', status_code=201)
    def register(body:Registration, response:Response, db=Depends(database)):
        attempt_key = check_attempt(db, body.email, 'register')
        try:
            user = db.execute('INSERT INTO users(id,email,display_name,password_hash) VALUES (%s,%s,%s,%s) RETURNING id,email,display_name', (uuid4(),body.email,body.display_name,password_hash(body.password))).fetchone()
            clear_attempts(db, attempt_key)
            return start_session(db,response,user)
        except psycopg.errors.UniqueViolation:
            db.rollback()
            raise HTTPException(409,'Este correo ya está registrado.')

    @app.post('/api/v1/auth/login')
    def login(body:Credentials, response:Response, db=Depends(database)):
        attempt_key = check_attempt(db, body.email, 'login')
        user = db.execute('SELECT id,email,display_name,password_hash FROM users WHERE email=%s',(body.email,)).fetchone()
        # Always do one expensive hash, including for unknown users, until the limit.
        encoded = user['password_hash'] if user else '0'*32+':'+'0'*128
        if not verify_password(body.password,encoded) or not user:
            raise HTTPException(401,'Correo o contraseña incorrectos.')
        clear_attempts(db, attempt_key)
        return start_session(db,response,user)

    @app.get('/api/v1/auth/me')
    def me(user=Depends(current_user)):
        return user

    @app.post('/api/v1/auth/logout',status_code=204)
    def logout(request:Request,response:Response,db=Depends(database)):
        token=request.cookies.get('neurolab_session','')
        db.execute('DELETE FROM sessions WHERE token_hash=%s',(hashlib.sha256(token.encode()).hexdigest(),))
        db.commit()
        response.delete_cookie('neurolab_session',path='/')

    fields='id,name,description,status,tags,revision,created_at,updated_at'

    @app.get('/api/v1/projects')
    def projects(user=Depends(current_user),db=Depends(database)):
        return db.execute(f'SELECT {fields} FROM projects WHERE owner_id=%s ORDER BY created_at,id',(user['id'],)).fetchall()

    @app.get('/api/v1/projects/{project_id}')
    def project(project_id:UUID,user=Depends(current_user),db=Depends(database)):
        row=db.execute(f'SELECT {fields} FROM projects WHERE id=%s AND owner_id=%s',(project_id,user['id'])).fetchone()
        if not row:raise HTTPException(404,'Proyecto no encontrado.')
        return row

    @app.post('/api/v1/projects',status_code=201)
    def add_project(body:ProjectInput,user=Depends(current_user),db=Depends(database)):
        try:
            row=db.execute(f'INSERT INTO projects(id,owner_id,name,normalized_name,description,status,tags) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING {fields}',(uuid4(),user['id'],body.name,body.name.lower(),body.description.strip(),body.status,Jsonb(body.tags))).fetchone()
            db.commit()
            return row
        except psycopg.errors.UniqueViolation:
            db.rollback()
            raise HTTPException(409,'Ya existe un proyecto con ese nombre.')

    @app.put('/api/v1/projects/{project_id}')
    def update_project(project_id:UUID,body:ProjectUpdate,user=Depends(current_user),db=Depends(database)):
        try:
            row=db.execute(f'UPDATE projects SET name=%s,normalized_name=%s,description=%s,status=%s,tags=%s,revision=revision+1,updated_at=now() WHERE id=%s AND owner_id=%s AND revision=%s RETURNING {fields}',(body.name,body.name.lower(),body.description.strip(),body.status,Jsonb(body.tags),project_id,user['id'],body.revision)).fetchone()
            if not row:
                exists=db.execute('SELECT 1 FROM projects WHERE id=%s AND owner_id=%s',(project_id,user['id'])).fetchone()
                raise HTTPException(409 if exists else 404,'El proyecto cambió; vuelve a cargarlo.' if exists else 'Proyecto no encontrado.')
            db.commit()
            return row
        except psycopg.errors.UniqueViolation:
            db.rollback()
            raise HTTPException(409,'Ya existe un proyecto con ese nombre.')

    @app.delete('/api/v1/projects/{project_id}',status_code=204)
    def delete_project(project_id:UUID,revision:int,user=Depends(current_user),db=Depends(database)):
        if revision<1:raise HTTPException(422,'Revisión del proyecto inválida.')
        # Propietario y revisión actual obligatorios. Los informes y fichas
        # se eliminan mediante ON DELETE CASCADE en PostgreSQL.
        row=db.execute('DELETE FROM projects WHERE id=%s AND owner_id=%s AND revision=%s RETURNING id',
                       (project_id,user['id'],revision)).fetchone()
        if not row:
            exists=db.execute('SELECT 1 FROM projects WHERE id=%s AND owner_id=%s',
                              (project_id,user['id'])).fetchone()
            raise HTTPException(409 if exists else 404,
                'El proyecto cambió. Actualiza la página antes de eliminarlo.' if exists else 'Proyecto no encontrado.')
        db.commit()
        return Response(status_code=204)

    real_fields='id,project_id,imported_at,dataset_fingerprint,classes,samples,config,parameters,requested_epochs,completed_epochs,batch,seed,metrics,test,source,engine,weights_file,model_ref'

    @app.get('/api/v1/projects/{project_id}/real-runs')
    def list_real_runs(project_id:UUID,user=Depends(current_user),db=Depends(database)):
        owned=db.execute('SELECT 1 FROM projects WHERE id=%s AND owner_id=%s',(project_id,user['id'])).fetchone()
        if not owned:raise HTTPException(404,'Proyecto no encontrado.')
        return db.execute(f'SELECT {real_fields} FROM real_cnn_runs WHERE project_id=%s AND owner_id=%s ORDER BY imported_at DESC,id DESC LIMIT 50',(project_id,user['id'])).fetchall()

    @app.post('/api/v1/projects/{project_id}/real-runs',status_code=201)
    def import_real_run(project_id:UUID,body:RealCNNImport,request:Request,user=Depends(current_user),db=Depends(database)):
        # Las métricas son declaradas por el usuario y no certificadas por el backend.
        # No se cargan pesos ni imágenes en este endpoint.
        if request.headers.get('content-length') and int(request.headers['content-length'])>65536:
            raise HTTPException(413,'El informe excede 64 KiB.')
        owned=db.execute('SELECT 1 FROM projects WHERE id=%s AND owner_id=%s',(project_id,user['id'])).fetchone()
        if not owned:raise HTTPException(404,'Proyecto no encontrado.')
        if body.engine == 'TensorFlow.js' and not body.model_ref.startswith('indexeddb://neurolab-cnn-'+str(project_id)+'-'):
            raise HTTPException(422,'El modelo no pertenece a este proyecto.')
        row=db.execute(f'''INSERT INTO real_cnn_runs
            (id,project_id,owner_id,dataset_fingerprint,classes,samples,config,parameters,
             requested_epochs,completed_epochs,batch,seed,metrics,test,source,engine,weights_file,model_ref)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING {real_fields}''',
            (uuid4(),project_id,user['id'],body.dataset_fingerprint,
             Jsonb(body.classes),Jsonb(body.samples.model_dump()),Jsonb(body.config),
             body.parameters,body.requested_epochs,body.completed_epochs,body.batch,
             body.seed,Jsonb([point.model_dump() for point in body.metrics]),
             Jsonb(body.test.model_dump()),
             'navegador' if body.engine == 'TensorFlow.js' else 'importado',
             body.engine,body.weights_file,body.model_ref)).fetchone()
        db.commit()
        return row


    model_fields=('m.id,m.project_id,m.run_id,m.display_name,m.notes,m.status,m.favorite,'
                  'm.revision,m.created_at,m.updated_at,r.engine,r.model_ref,'
                  'r.classes,r.test,r.parameters,r.completed_epochs,r.dataset_fingerprint')
    model_join='JOIN real_cnn_runs r ON r.id=m.run_id'

    @app.get('/api/v1/projects/{project_id}/real-models')
    def real_models(project_id:UUID,user=Depends(current_user),db=Depends(database)):
        if not db.execute('SELECT 1 FROM projects WHERE id=%s AND owner_id=%s',
                          (project_id,user['id'])).fetchone():
            raise HTTPException(404,'Proyecto no encontrado.')
        return db.execute(f'SELECT {model_fields} FROM real_cnn_models m {model_join} '
                          'WHERE m.owner_id=%s AND m.project_id=%s '
                          'ORDER BY m.favorite DESC,m.updated_at DESC,m.id LIMIT 50',
                          (user['id'],project_id)).fetchall()

    @app.post('/api/v1/projects/{project_id}/real-models',status_code=201)
    def register_real_model(project_id:UUID,body:ModelRegistration,user=Depends(current_user),db=Depends(database)):
        if not db.execute('SELECT 1 FROM projects WHERE id=%s AND owner_id=%s',
                          (project_id,user['id'])).fetchone():
            raise HTTPException(404,'Proyecto no encontrado.')
        run=db.execute('SELECT engine,model_ref FROM real_cnn_runs '
                       'WHERE id=%s AND owner_id=%s AND project_id=%s',
                       (body.run_id,user['id'],project_id)).fetchone()
        if not run:raise HTTPException(404,'Entrenamiento no encontrado en este proyecto.')
        if run['engine']!='TensorFlow.js' or not run['model_ref']:
            raise HTTPException(422,'Solo se registran modelos TensorFlow.js que tengan referencia a pesos.')
        total=db.execute('SELECT count(*) AS n FROM real_cnn_models WHERE owner_id=%s AND project_id=%s',
                         (user['id'],project_id)).fetchone()['n']
        if total>=50:raise HTTPException(409,'Máximo de 50 modelos registrados por proyecto.')
        try:
            row=db.execute(f'''WITH inserted AS (
              INSERT INTO real_cnn_models(id,owner_id,project_id,run_id,display_name,notes)
              VALUES (%s,%s,%s,%s,%s,%s) RETURNING *
            ) SELECT {model_fields} FROM inserted m {model_join}''',
            (uuid4(),user['id'],project_id,body.run_id,body.display_name,body.notes.strip())).fetchone()
            db.commit()
            return row
        except psycopg.errors.UniqueViolation:
            db.rollback()
            raise HTTPException(409,'Este entrenamiento ya tiene una ficha de modelo.')

    @app.put('/api/v1/projects/{project_id}/real-models/{model_id}')
    def edit_real_model(project_id:UUID,model_id:UUID,body:ModelEdit,
                        user=Depends(current_user),db=Depends(database)):
        row=db.execute(f'''WITH updated AS (
          UPDATE real_cnn_models SET display_name=%s,notes=%s,status=%s,favorite=%s,
          revision=revision+1,updated_at=now()
          WHERE id=%s AND project_id=%s AND owner_id=%s AND revision=%s
          RETURNING *
        ) SELECT {model_fields} FROM updated m {model_join}''',
        (body.display_name,body.notes.strip(),body.status,body.favorite,
         model_id,project_id,user['id'],body.revision)).fetchone()
        if not row:
            exists=db.execute('SELECT 1 FROM real_cnn_models WHERE id=%s AND project_id=%s AND owner_id=%s',
                              (model_id,project_id,user['id'])).fetchone()
            raise HTTPException(409 if exists else 404,
               'La ficha cambió; vuelve a cargarla.' if exists else 'Modelo no encontrado.')
        db.commit()
        return row

    return app


app=create_app()
