"""Esquema seguro de importación de reportes Keras, sin instalar TensorFlow en Render.

La procedencia de un JSON importado no está certificada por el servidor.
"""
from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Literal
from math import isfinite
from hashlib import sha256

from app.real_cnn import TrainingInputError, validated_config


class EpochMetric(BaseModel):
    model_config = ConfigDict(extra='forbid')
    epoch: int = Field(ge=1, le=100)
    accuracy: float = Field(ge=0, le=1, allow_inf_nan=False)
    valAccuracy: float = Field(ge=0, le=1, allow_inf_nan=False)
    loss: float = Field(ge=0, allow_inf_nan=False)
    valLoss: float = Field(ge=0, allow_inf_nan=False)


class TestMetric(BaseModel):
    model_config = ConfigDict(extra='forbid')
    accuracy: float = Field(ge=0, le=1, allow_inf_nan=False)
    loss: float = Field(ge=0, allow_inf_nan=False)


class SampleCounts(BaseModel):
    model_config = ConfigDict(extra='forbid')
    train: int = Field(ge=2)
    validation: int = Field(ge=2)
    test: int = Field(ge=2)


class RealCNNImport(BaseModel):
    model_config = ConfigDict(extra='forbid')
    training: Literal['real']
    engine: Literal['TensorFlow/Keras', 'TensorFlow.js']
    dataset_fingerprint: str = Field(pattern=r'^[0-9a-f]{64}$')
    classes: list[str] = Field(min_length=2, max_length=20)
    samples: SampleCounts
    config: dict
    parameters: int = Field(ge=1, le=5_000_000)
    requested_epochs: int = Field(ge=1, le=100)
    completed_epochs: int = Field(ge=1, le=100)
    batch: int = Field(ge=1, le=256)
    seed: int = Field(ge=0, le=2**32 - 1)
    metrics: list[EpochMetric] = Field(min_length=1, max_length=100)
    test: TestMetric
    weights_file: Literal['model.keras', 'model.json']
    model_ref: str | None = Field(default=None, max_length=240)

    @model_validator(mode='after')
    def valid_import(self):
        if self.engine == 'TensorFlow/Keras':
            if self.weights_file != 'model.keras' or self.model_ref is not None:
                raise ValueError('Los informes Keras deben referir solamente a model.keras.')
        else:
            if self.weights_file != 'model.json' or not self.model_ref or not self.model_ref.startswith('indexeddb://neurolab-cnn-'):
                raise ValueError('El modelo TensorFlow.js necesita una referencia IndexedDB.')
        if self.classes != sorted(self.classes) or len({name.casefold() for name in self.classes}) != len(self.classes):
            raise ValueError('Las clases deben ser únicas y estar ordenadas.')
        if any(not name or len(name) > 100 or '/' in name or '\\' in name for name in self.classes):
            raise ValueError('Nombres de clase inválidos.')
        total = self.samples.train + self.samples.validation + self.samples.test
        if total > 500:
            # Solamente el contrato MNIST del importador propio puede exceder
            # el límite de 500. Los pesos e imágenes nunca llegan a la API.
            # La huella identifica la configuración declarada; no certifica
            # que el cliente haya entrenado realmente esos píxeles.
            sizes = {
                1000: (900, 100, 1000),
                10000: (9000, 1000, 10000),
                60000: (54000, 6000, 10000),
            }
            mnist_valid = (
                self.engine == 'TensorFlow.js'
                and self.weights_file == 'model.json'
                and self.classes == [str(i) for i in range(10)]
                and self.seed == 42
                and self.config.get('size') == 28
                and self.config.get('channels') == 1
                and any(
                    (self.samples.train, self.samples.validation, self.samples.test) == split
                    and self.dataset_fingerprint == sha256(
                        f'mnist-cvdf-idx-v1:https://github.com/cvdfoundation/mnist:{size}:42'.encode()
                    ).hexdigest()
                    for size, split in sizes.items()
                )
            )
            if not mnist_valid:
                raise ValueError('La cantidad de imágenes supera 500. Para MNIST grande se exige una partición y una huella compatibles con el importador oficial.')
        if self.completed_epochs > self.requested_epochs or len(self.metrics) != self.completed_epochs:
            raise ValueError('Cantidad de épocas inconsistente.')
        if [item.epoch for item in self.metrics] != list(range(1, self.completed_epochs + 1)):
            raise ValueError('Las épocas deben ser consecutivas.')
        try:
            config = validated_config(self.config, len(self.classes))
        except TrainingInputError as error:
            raise ValueError(str(error)) from error
        if self.parameters != config['parameters']:
            raise ValueError('El conteo de parámetros no coincide con la arquitectura.')
        # El formato es compatible con metrics.json del motor independiente;
        # no demuestra que el archivo haya sido generado por TensorFlow.
        return self
