"""Entrenamiento CNN real, reproducible y desacoplado de la API Render.

No importa TensorFlow durante el arranque del servidor web. Esta herramienta
se ejecuta en un entorno de cómputo con requirements-ml.txt instalados.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
DEFAULT_CONFIG = {
    "size": 28,
    "channels": 1,
    "dense": 64,
    "layers": [
        {"filters": 16, "kernel": 3, "pool": True, "activation": "relu"},
        {"filters": 32, "kernel": 3, "pool": True, "activation": "relu"},
    ],
    "dropout": 0.25,
    "l2": 0.0001,
    "earlyStopping": True,
    "patience": 5,
    "minDelta": 0.01,
}


class TrainingInputError(ValueError):
    """Datos o hiperparámetros inválidos; no ejecutar entrenamiento."""


def validated_config(value, classes):
    if not isinstance(value, dict):
        raise TrainingInputError("La arquitectura debe ser un objeto JSON.")
    config = dict(value)
    size = config.get("size")
    channels = config.get("channels")
    dense = config.get("dense")
    layers = config.get("layers")
    if type(size) is not int or size not in (28, 32, 64, 128):
        raise TrainingInputError("Tamaño de entrada inválido.")
    if type(channels) is not int or channels not in (1, 3):
        raise TrainingInputError("Canales inválidos.")
    if type(dense) is not int or not 1 <= dense <= 512:
        raise TrainingInputError("Dense debe estar entre 1 y 512.")
    if type(classes) is not int or not 2 <= classes <= 20:
        raise TrainingInputError("Se necesitan entre 2 y 20 clases.")
    if not isinstance(layers, list) or not 1 <= len(layers) <= 4:
        raise TrainingInputError("Se necesitan entre 1 y 4 bloques Conv2D.")

    spatial, previous, parameters = size, channels, 0
    for number, layer in enumerate(layers, start=1):
        if not isinstance(layer, dict):
            raise TrainingInputError(f"Bloque {number}: configuración inválida.")
        filters, kernel = layer.get("filters"), layer.get("kernel")
        activation, pool = layer.get("activation"), layer.get("pool")
        if (
            type(filters) is not int or not 1 <= filters <= 128
            or type(kernel) is not int or kernel not in (3, 5)
            or activation not in ("relu", "tanh")
            or type(pool) is not bool
        ):
            raise TrainingInputError(f"Bloque {number}: filtros, kernel o activación inválidos.")
        parameters += (kernel * kernel * previous + 1) * filters
        previous = filters
        if pool:
            spatial //= 2
            if spatial < 1:
                raise TrainingInputError("El pooling reduce la imagen a cero.")
    output = 1 if classes == 2 else classes
    parameters += (spatial * spatial * previous + 1) * dense + (dense + 1) * output
    if parameters > 5_000_000:
        raise TrainingInputError("La arquitectura supera 5 millones de parámetros.")

    for field, maximum, default in (("dropout", 0.8, 0), ("l2", 0.10000001, 0), ("minDelta", 1.00000001, 0.01)):
        number = config.get(field, default)
        if type(number) not in (float, int) or not math.isfinite(number) or not 0 <= number < maximum:
            raise TrainingInputError(f"{field} fuera de rango.")
        config[field] = float(number)
    patience = config.get("patience", 5)
    if type(patience) is not int or not 1 <= patience <= 20:
        raise TrainingInputError("La paciencia debe estar entre 1 y 20 épocas.")
    config["patience"] = patience
    early = config.get("earlyStopping", False)
    if type(early) is not bool:
        raise TrainingInputError("earlyStopping debe ser booleano.")
    config["earlyStopping"] = early
    config["parameters"] = parameters
    return config


def split_indices(labels, train_percent=70, validation_percent=15, seed=42):
    import numpy as np

    if (
        type(seed) is not int or not 0 <= seed <= 2**32 - 1
        or type(train_percent) is not int
        or type(validation_percent) is not int
        or train_percent < 1 or validation_percent < 1
        or train_percent + validation_percent >= 100
    ):
        raise TrainingInputError("Porcentajes o semilla inválidos.")
    rng = np.random.default_rng(seed)
    parts = {"train": [], "validation": [], "test": []}
    for label in sorted(set(labels)):
        indices = [i for i, value in enumerate(labels) if value == label]
        if len(indices) < 3:
            raise TrainingInputError(f"La clase {label} necesita al menos tres imágenes.")
        rng.shuffle(indices)
        first = max(1, len(indices) * train_percent // 100)
        second = max(1, len(indices) * validation_percent // 100)
        while first + second >= len(indices):
            if first >= second and first > 1:
                first -= 1
            else:
                second -= 1
        parts["train"].extend(indices[:first])
        parts["validation"].extend(indices[first:first + second])
        parts["test"].extend(indices[first + second:])
    for indices in parts.values():
        rng.shuffle(indices)
    return parts


def read_dataset(root, config, seed=42, train_percent=70, validation_percent=15):
    import numpy as np
    from PIL import Image, ImageOps, UnidentifiedImageError

    directory = Path(root)
    if not directory.is_dir():
        raise TrainingInputError("La carpeta de imágenes no existe.")
    class_dirs = sorted((p for p in directory.iterdir() if p.is_dir() and not p.is_symlink() and not p.name.startswith(".")), key=lambda p: p.name)
    classes = [p.name for p in class_dirs]
    config = validated_config(config, len(classes))
    data, labels, checksums = [], [], []
    seen = set()
    total_bytes = 0
    for index, folder in enumerate(class_dirs):
        files = sorted((p for p in folder.iterdir() if p.is_file() and not p.is_symlink() and p.suffix.lower() in IMAGE_EXTENSIONS))
        if len(files) < 3:
            raise TrainingInputError(f"La clase {folder.name} necesita al menos tres imágenes.")
        for path in files:
            total_bytes += path.stat().st_size
            if total_bytes > 50 * 1024 * 1024 or len(data) >= 500:
                raise TrainingInputError("Límite: 500 imágenes y 50 MiB.")
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest in seen:
                raise TrainingInputError("Se encontró una imagen duplicada; podría contaminar las particiones.")
            seen.add(digest)
            try:
                with Image.open(path) as loaded:
                    if loaded.width < 1 or loaded.height < 1 or loaded.width > 4096 or loaded.height > 4096:
                        raise TrainingInputError("Dimensiones fuera del límite de 4096 × 4096.")
                    image = ImageOps.exif_transpose(loaded).convert("L" if config["channels"] == 1 else "RGB")
                    image = image.resize((config["size"], config["size"]), Image.Resampling.BILINEAR)
                    pixels = np.asarray(image, dtype=np.float32) / np.float32(255)
            except (UnidentifiedImageError, OSError, ValueError) as exc:
                raise TrainingInputError(f"No se pudo leer una imagen válida: {path.name}.") from exc
            if config["channels"] == 1:
                pixels = pixels[..., np.newaxis]
            data.append(pixels)
            labels.append(index)
            checksums.append((folder.name, digest))
    if not data:
        raise TrainingInputError("No se encontraron imágenes.")
    partition = split_indices(labels, train_percent, validation_percent, seed)
    fingerprint = hashlib.sha256(json.dumps({"files": checksums, "split": partition, "seed": seed}, sort_keys=True).encode()).hexdigest()
    return np.stack(data), np.asarray(labels, dtype=np.int32), classes, partition, fingerprint, config


def build_model(config, class_count):
    # Importación tardía: la API principal nunca necesita cargar TensorFlow.
    import tensorflow as tf

    cfg = validated_config(config, class_count)
    regularizer = tf.keras.regularizers.l2(cfg["l2"]) if cfg["l2"] else None
    model = tf.keras.Sequential(name="NeuroLab_CNN")
    model.add(tf.keras.Input(shape=(cfg["size"], cfg["size"], cfg["channels"])))
    for layer in cfg["layers"]:
        model.add(tf.keras.layers.Conv2D(
            layer["filters"], layer["kernel"], padding="same",
            activation=layer["activation"], kernel_regularizer=regularizer
        ))
        if layer["pool"]:
            model.add(tf.keras.layers.MaxPooling2D(pool_size=2))
    model.add(tf.keras.layers.Flatten())
    model.add(tf.keras.layers.Dense(cfg["dense"], activation="relu", kernel_regularizer=regularizer))
    if cfg["dropout"]:
        model.add(tf.keras.layers.Dropout(cfg["dropout"]))
    binary = class_count == 2
    model.add(tf.keras.layers.Dense(1 if binary else class_count, activation="sigmoid" if binary else "softmax"))
    if model.count_params() != cfg["parameters"]:
        raise RuntimeError("El cálculo de parámetros no coincide con Keras.")
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss="binary_crossentropy" if binary else "sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def train(dataset_dir, output_dir, config=None, epochs=20, batch=32, seed=42, train_percent=70, validation_percent=15):
    import numpy as np
    import tensorflow as tf

    if type(epochs) is not int or not 1 <= epochs <= 100:
        raise TrainingInputError("Épocas: entero entre 1 y 100.")
    if type(batch) is not int or not 1 <= batch <= 256:
        raise TrainingInputError("Batch: entero entre 1 y 256.")
    if type(seed) is not int or not 0 <= seed <= 2**32 - 1:
        raise TrainingInputError("Semilla inválida.")
    target = Path(output_dir)
    if target.exists():
        raise TrainingInputError("La carpeta de salida ya existe; utiliza una nueva para no sobrescribir pesos.")
    config = config if config is not None else DEFAULT_CONFIG
    pixels, labels, classes, partitions, fingerprint, cfg = read_dataset(
        dataset_dir, config, seed, train_percent, validation_percent
    )
    tf.keras.utils.set_random_seed(seed)
    model = build_model(cfg, len(classes))
    callbacks = []
    if cfg["earlyStopping"]:
        callbacks.append(tf.keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=cfg["patience"],
            min_delta=cfg["minDelta"], restore_best_weights=True
        ))
    tr, va, te = (np.asarray(partitions[key], dtype=np.int32) for key in ("train", "validation", "test"))
    history = model.fit(
        pixels[tr], labels[tr], validation_data=(pixels[va], labels[va]),
        epochs=epochs, batch_size=batch, callbacks=callbacks, verbose=0, shuffle=True
    )
    test_loss, test_accuracy = (float(v) for v in model.evaluate(pixels[te], labels[te], verbose=0))
    metrics = [
        {
            "epoch": i + 1,
            "accuracy": float(history.history["accuracy"][i]),
            "valAccuracy": float(history.history["val_accuracy"][i]),
            "loss": float(history.history["loss"][i]),
            "valLoss": float(history.history["val_loss"][i]),
        }
        for i in range(len(history.history["loss"]))
    ]
    result = {
        "training": "real",
        "engine": "TensorFlow/Keras",
        "dataset_fingerprint": fingerprint,
        "classes": classes,
        "samples": {k: len(v) for k, v in partitions.items()},
        "config": {k: v for k, v in cfg.items() if k != "parameters"},
        "parameters": cfg["parameters"],
        "requested_epochs": epochs,
        "completed_epochs": len(metrics),
        "batch": batch,
        "seed": seed,
        "metrics": metrics,
        "test": {"accuracy": test_accuracy, "loss": test_loss},
        "weights_file": "model.keras",
    }
    target.mkdir(parents=True, exist_ok=False)
    model.save(target / "model.keras")
    (target / "metrics.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def predict(model_dir, image_path):
    import numpy as np
    import tensorflow as tf
    from PIL import Image, ImageOps

    folder = Path(model_dir)
    metadata = json.loads((folder / "metrics.json").read_text(encoding="utf-8"))
    if metadata.get("training") != "real":
        raise TrainingInputError("Esta carpeta no contiene un modelo CNN entrenado.")
    cfg, classes = metadata["config"], metadata["classes"]
    model = tf.keras.models.load_model(folder / "model.keras", compile=False)
    with Image.open(image_path) as original:
        if not 1 <= original.width <= 4096 or not 1 <= original.height <= 4096:
            raise TrainingInputError("Dimensiones inválidas.")
        resized = ImageOps.exif_transpose(original).convert("L" if cfg["channels"] == 1 else "RGB")
        resized = resized.resize((cfg["size"], cfg["size"]), Image.Resampling.BILINEAR)
        x = np.asarray(resized, dtype=np.float32) / np.float32(255)
    if cfg["channels"] == 1:
        x = x[..., np.newaxis]
    prediction = model.predict(x[np.newaxis, ...], verbose=0)[0]
    scores = [1.0 - float(prediction[0]), float(prediction[0])] if len(classes) == 2 else [float(value) for value in prediction]
    return sorted(({"clase": name, "probabilidad": score} for name, score in zip(classes, scores)), key=lambda row: -row["probabilidad"])


def main():
    parser = argparse.ArgumentParser(description="Entrenar o inferir con CNN reales (TensorFlow/Keras).")
    sub = parser.add_subparsers(dest="command", required=True)
    training = sub.add_parser("train", help="Entrenar con carpetas dataset/clase/imagen.png.")
    training.add_argument("--dataset", required=True)
    training.add_argument("--output", required=True)
    training.add_argument("--config", help="JSON de arquitectura exportado desde NeuroLab.")
    training.add_argument("--epochs", type=int, default=20)
    training.add_argument("--batch", type=int, default=32)
    training.add_argument("--seed", type=int, default=42)
    training.add_argument("--train", type=int, default=70)
    training.add_argument("--validation", type=int, default=15)
    inference = sub.add_parser("predict", help="Inferir sin reentrenar.")
    inference.add_argument("--model-dir", required=True)
    inference.add_argument("--image", required=True)
    args = parser.parse_args()
    if args.command == "train":
        architecture = json.loads(Path(args.config).read_text(encoding="utf-8")) if args.config else None
        if isinstance(architecture, dict) and "architecture" in architecture:
            architecture = architecture["architecture"].get("config")
        result = train(args.dataset, args.output, architecture, args.epochs, args.batch, args.seed, args.train, args.validation)
        print(json.dumps({"estado": "completado", "epocas": result["completed_epochs"], "prueba": result["test"], "salida": args.output}, ensure_ascii=False))
    else:
        print(json.dumps({"predicciones": predict(args.model_dir, args.image)}, ensure_ascii=False))


if __name__ == "__main__":
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
    main()
