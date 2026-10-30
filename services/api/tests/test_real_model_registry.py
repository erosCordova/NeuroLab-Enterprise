"""Persistencia y control de acceso del registro de modelos CNN."""
from uuid import uuid4
from fastapi.testclient import TestClient
from app.main import create_app
from test_platform import client, register, project, database_setup
from test_real_runs_api import report


def browser_run(client,project_id):
    payload={**report(),'engine':'TensorFlow.js','weights_file':'model.json',
             'model_ref':'indexeddb://neurolab-cnn-'+project_id+'-'+str(uuid4())}
    response=client.post('/api/v1/projects/'+project_id+'/real-runs',json=payload)
    assert response.status_code==201,response.text
    return response.json()


def test_register_private_and_persisted(client):
    unknown=str(uuid4())
    assert client.get('/api/v1/projects/'+unknown+'/real-models').status_code==401
    register(client)
    saved=project(client)
    prefix='/api/v1/projects/'+saved['id']+'/real-models'
    assert client.get('/api/v1/projects/'+unknown+'/real-models').status_code==404
    run=browser_run(client,saved['id'])
    assert client.post(prefix,json={'run_id':str(uuid4()),'display_name':'Modelo nuevo'}).status_code==404
    response=client.post(prefix,json={'run_id':run['id'],'display_name':' Modelo   CNN ','notes':'Notas de prueba'})
    assert response.status_code==201,response.text
    model=response.json()
    assert model['display_name']=='Modelo CNN' and model['revision']==1
    assert model['model_ref']==run['model_ref'] and model['favorite'] is False
    assert 'owner_id' not in model
    assert client.post(prefix,json={'run_id':run['id'],'display_name':'Modelo repetido'}).status_code==409
    assert len(client.get(prefix).json())==1
    token=client.cookies.get('neurolab_session')
    with TestClient(create_app()) as again:
        again.cookies.set('neurolab_session',token)
        assert again.get(prefix).json()[0]['id']==model['id']
    with TestClient(create_app()) as other:
        register(other)
        assert other.get(prefix).status_code==404
        assert other.post(prefix,json={'run_id':run['id'],'display_name':'Modelo ajeno'}).status_code==404
        assert other.put(prefix+'/'+model['id'],json={'display_name':'Modelo ajeno','revision':1}).status_code==404


def test_revision_archive_and_no_weight_loss(client):
    register(client)
    saved=project(client)
    prefix='/api/v1/projects/'+saved['id']+'/real-models'
    run=browser_run(client,saved['id'])
    model=client.post(prefix,json={'run_id':run['id'],'display_name':'Modelo base'}).json()
    update={'display_name':'CNN final','notes':'Revisión sin certificación','status':'Archivado','favorite':True,'revision':1}
    response=client.put(prefix+'/'+model['id'],json=update)
    assert response.status_code==200,response.text
    assert response.json()['revision']==2 and response.json()['favorite']
    assert response.json()['status']=='Archivado'
    assert response.json()['model_ref']==run['model_ref']
    assert client.put(prefix+'/'+model['id'],json=update).status_code==409
    assert client.put(prefix+'/'+str(uuid4()),json={**update,'revision':2}).status_code==404
    assert client.put(prefix+'/'+model['id'],json={**update,'revision':2,'status':'Listo'}).status_code==422
    assert client.get('/api/v1/projects/'+saved['id']+'/real-runs').json()[0]['id']==run['id']


def test_keras_report_is_not_registered_as_browser_weights(client):
    register(client)
    saved=project(client)
    path='/api/v1/projects/'+saved['id']
    imported=client.post(path+'/real-runs',json=report())
    assert imported.status_code==201
    response=client.post(path+'/real-models',json={'run_id':imported.json()['id'],
                                                    'display_name':'Informe sin pesos'})
    assert response.status_code==422
