"""Pruebas de entrenamiento real con imágenes generadas para CI, sin dataset externo."""
import json
import math
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from app.real_cnn import (
    TrainingInputError, build_model, predict, read_dataset,
    split_indices, train, validated_config
)


SMALL = {
    "size": 28, "channels": 1, "dense": 8,
    "layers": [{"filters": 4, "kernel": 3, "pool": True, "activation": "relu"}],
    "dropout": 0.1, "l2": 0.001, "earlyStopping": True, "patience": 2, "minDelta": 0.0
}


def image_dataset(root: Path):
    for class_id, name in enumerate(("cero", "uno")):
        directory = root / name
        directory.mkdir(parents=True)
        for sample in range(6):
            image = Image.new("L", (28, 28), 15 + sample + class_id)
            draw = ImageDraw.Draw(image)
            if class_id == 0:
                draw.line((3 + sample, 0, 3 + sample, 27), fill=220, width=3)
            else:
                draw.line((0, 3 + sample, 27, 3 + sample), fill=220, width=3)
            image.save(directory / f"ejemplo-{sample:02d}.png")


def test_parameters_and_validation():
    config = validated_config(SMALL, 2)
    assert config["parameters"] == (3 * 3 * 1 + 1) * 4 + (14 * 14 * 4 + 1) * 8 + (8 + 1)
    assert build_model(SMALL, 2).count_params() == config["parameters"]
    for invalid in (
        {**SMALL, "dense": 513},
        {**SMALL, "size": 1},
        {**SMALL, "layers": [{**SMALL["layers"][0], "filters": 0}]},
        {**SMALL, "dropout": 0.8},
        {**SMALL, "earlyStopping": "sí"},
    ):
        with pytest.raises(TrainingInputError):
            validated_config(invalid, 2)


def test_stratified_split_and_duplicate_protection(tmp_path):
    base = tmp_path / "imagenes"
    image_dataset(base)
    pixels, labels, classes, parts, fingerprint, _ = read_dataset(base, SMALL, seed=15)
    assert pixels.shape == (12, 28, 28, 1)
    assert pixels.min() >= 0 and pixels.max() <= 1
    assert set(classes) == {"cero", "uno"}
    assert len(fingerprint) == 64
    assert sorted(parts["train"] + parts["validation"] + parts["test"]) == list(range(12))
    assert all(set(parts[a]).isdisjoint(parts[b]) for a,b in (("train","validation"),("train","test"),("validation","test")))
    for ids in parts.values():
        assert set(labels[ids]) == {0, 1}
    assert parts == split_indices(labels.tolist(), seed=15)
    (base / "uno" / "duplicada.png").write_bytes((base / "cero" / "ejemplo-00.png").read_bytes())
    with pytest.raises(TrainingInputError, match="duplicada"):
        read_dataset(base, SMALL)


def test_real_train_save_load_and_predict(tmp_path):
    base = tmp_path / "imagenes"
    image_dataset(base)
    output = tmp_path / "resultado"
    result = train(base, output, SMALL, epochs=2, batch=4, seed=12)
    assert result["training"] == "real"
    assert result["engine"] == "TensorFlow/Keras"
    assert result["requested_epochs"] == 2
    assert result["completed_epochs"] == 2
    assert len(result["metrics"]) == 2
    assert result["samples"]["test"] >= 2
    assert (output / "model.keras").stat().st_size > 0
    assert json.loads((output / "metrics.json").read_text())["training"] == "real"
    for epoch in result["metrics"]:
        assert all(math.isfinite(epoch[key]) for key in ("accuracy", "valAccuracy", "loss", "valLoss"))
        assert 0 <= epoch["valAccuracy"] <= 1
    predictions = predict(output, base / "cero" / "ejemplo-00.png")
    assert [entry["clase"] for entry in predictions] and len(predictions) == 2
    assert sum(entry["probabilidad"] for entry in predictions) == pytest.approx(1.0, abs=1e-5)
    with pytest.raises(TrainingInputError, match="ya existe"):
        train(base, output, SMALL, epochs=1)
