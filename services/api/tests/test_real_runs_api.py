"""Integración de reportes CNN reales importados con PostgreSQL y aislamiento entre usuarios."""
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.real_cnn import validated_config
from test_platform import client, register, project, database_setup


CONFIG = {
    "size": 28, "channels": 1, "dense": 8,
    "layers": [{"filters": 4, "kernel": 3, "pool": True, "activation": "relu"}],
    "dropout": .1, "l2": .001, "earlyStopping": True, "patience": 2, "minDelta": 0.0,
}


def report():
    return {
        "training": "real",
        "engine": "TensorFlow/Keras",
        "dataset_fingerprint": "a" * 64,
        "classes": ["cero", "uno"],
        "samples": {"train": 8, "validation": 2, "test": 2},
        "config": CONFIG,
        "parameters": validated_config(CONFIG, 2)["parameters"],
        "requested_epochs": 3,
        "completed_epochs": 2,
        "batch": 4,
        "seed": 42,
        "metrics": [
            {"epoch": 1, "accuracy": .5, "valAccuracy": .5, "loss": .8, "valLoss": .8},
            {"epoch": 2, "accuracy": .75, "valAccuracy": .5, "loss": .6, "valLoss": .7},
        ],
        "test": {"accuracy": .5, "loss": .7},
        "weights_file": "model.keras",
    }


def test_requires_user_and_existing_owned_project(client):
    foreign_id = str(uuid4())
    assert client.get(f'/api/v1/projects/{foreign_id}/real-runs').status_code == 401
    assert client.post(f'/api/v1/projects/{foreign_id}/real-runs', json=report()).status_code == 401
    register(client)
    assert client.get(f'/api/v1/projects/{foreign_id}/real-runs').status_code == 404
    assert client.post(f'/api/v1/projects/{foreign_id}/real-runs', json=report()).status_code == 404


def test_import_persists_and_isolated_from_other_accounts(client):
    register(client)
    saved = project(client)
    path = f'/api/v1/projects/{saved["id"]}/real-runs'
    result = client.post(path, json=report())
    assert result.status_code == 201, result.text
    row = result.json()
    assert row['source'] == 'importado'
    assert row['test']['accuracy'] == .5
    assert len(row['metrics']) == 2
    assert row['weights_file'] == 'model.keras'  # Nombre del archivo, no los pesos.
    assert row['model_ref'] is None
    assert row['engine'] == 'TensorFlow/Keras'
    assert 'owner_id' not in row
    assert len(client.get(path).json()) == 1

    token = client.cookies.get('neurolab_session')
    with TestClient(create_app()) as restored:
        restored.cookies.set('neurolab_session', token)
        listed = restored.get(path)
        assert listed.status_code == 200
        assert listed.json()[0]['id'] == row['id']
    with TestClient(create_app()) as outsider:
        register(outsider)
        assert outsider.get(path).status_code == 404
        assert outsider.post(path, json=report()).status_code == 404


@pytest.mark.parametrize('invalid', [
    {"training": "simulated"},
    {"parameters": 1},
    {"classes": ["uno", "cero"]},
    {"dataset_fingerprint": "bad"},
    {"completed_epochs": 3},
    {"requested_epochs": 1},
    {"samples": {"train": 500, "validation": 2, "test": 2}},
    {"metrics": [{"epoch": 2, "accuracy": .5, "valAccuracy": .5, "loss": .5, "valLoss": .5}]},
    {"test": {"accuracy": 1.5, "loss": .7}},
    {"weights_file": "malware.exe"},
])
def test_reject_invalid_metrics(client, invalid):
    register(client)
    saved = project(client)
    payload = {**report(), **invalid}
    response = client.post(f'/api/v1/projects/{saved["id"]}/real-runs', json=payload)
    assert response.status_code == 422, response.text
    assert client.get(f'/api/v1/projects/{saved["id"]}/real-runs').json() == []


def test_browser_training_is_separated_from_imported_keras(client):
    register(client)
    saved = project(client)
    path = f'/api/v1/projects/{saved["id"]}/real-runs'
    report_browser = {
        **report(),
        'engine': 'TensorFlow.js',
        'weights_file': 'model.json',
        'model_ref': 'indexeddb://neurolab-cnn-' + saved['id'] + '-' + str(uuid4()),
    }
    response = client.post(path, json=report_browser)
    assert response.status_code == 201, response.text
    row = response.json()
    assert row['source'] == 'navegador'
    assert row['engine'] == 'TensorFlow.js'
    assert row['weights_file'] == 'model.json'
    assert row['model_ref'].startswith('indexeddb://neurolab-cnn-')
    assert client.get(path).json()[0]['model_ref'] == row['model_ref']
    assert client.post(path, json={**report_browser, 'model_ref': 'https://example.com/model.json'}).status_code == 422
    assert client.post(path, json={**report_browser, 'weights_file': 'model.keras'}).status_code == 422
    assert client.post(path, json={**report_browser, 'engine': 'TensorFlow/Keras'}).status_code == 422
