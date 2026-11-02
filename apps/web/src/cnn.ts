import {advanceWithControls,validateTrainingOptions} from "./adaptiveTraining.ts";
import {sha256,rememberImage} from "./integrity.ts";
export type ConvLayer = {
  id: string;
  filters: number;
  kernel: number;
  pool: boolean;
  activation: "relu" | "tanh";
};

export type Config = {
  size: number;
  channels: number;
  dense: number;
  layers: ConvLayer[];
  dropout?: number;
  l2?: number;
  earlyStopping?: boolean;
  patience?: number;
  minDelta?: number;
};

export type ImageRecord = {
  file: File;
  label: string;
  width: number;
  height: number;
  checksum: string;
};

export type ImageDataset = {
  name: string;
  images: ImageRecord[];
  classes: string[];
  train: number[];
  validation: number[];
  test: number[];
  seed: number;
  fingerprint?: string;
};

export type DatasetMeta = {
  name: string;
  count: number;
  classes: string[];
  train: number;
  validation: number;
  test: number;
  seed: number;
  fingerprint?: string;
};

export type Metric = {
  epoch: number;
  accuracy: number;
  valAccuracy: number;
  loss: number;
  valLoss: number;
};

export type Job = {
  createdAt?: string;
  startedAt?: string;
  endedAt?: string;
  repeatedFrom?: string;
  configurationMode?: "automatic" | "manual";
  id: string;
  projectId: string;
  name: string;
  config: Config;
  dataset: DatasetMeta;
  versionId: string | null;
  epochs: number;
  batch: number;
  epoch: number;
  status: "En cola" | "Preparando" | "Ejecutando" | "Completado" | "Cancelado";
  metrics: Metric[];
  bestEpoch?: number;
  bestValLoss?: number;
  staleEpochs?: number;
  stoppedEarly?: boolean;
  stopReason?: string;
};

export const defaultConfig = (): Config => ({
  size: 28,
  channels: 1,
  dense: 64,
  layers: [
    { id: "c1", filters: 16, kernel: 3, pool: true, activation: "relu" },
    { id: "c2", filters: 32, kernel: 3, pool: true, activation: "relu" },
  ],
});

export function summary(config: Config, classes: number) {
  validateTrainingOptions(config);
  if (![28,32,64,128].includes(config.size) || ![1,3].includes(config.channels)) {
    throw new Error("Selecciona un tamaño y canales válidos.");
  }
  if (!Number.isInteger(classes) || classes < 2 || classes > 20) {
    throw new Error("El dataset necesita entre 2 y 20 clases.");
  }
  if (
    !Number.isInteger(config.dense) || config.dense < 1 || config.dense > 512 ||
    config.layers.length < 1 || config.layers.length > 4
  ) {
    throw new Error("Utiliza de 1 a 4 bloques y entre 1 y 512 unidades Dense.");
  }

  let spatial = config.size;
  let channels = config.channels;
  let total = 0;

  const blocks = config.layers.map((layer,index) => {
    if (
      !Number.isInteger(layer.filters) || layer.filters < 1 || layer.filters > 128 ||
      ![3,5].includes(layer.kernel) ||
      !["relu","tanh"].includes(layer.activation)
    ) {
      throw new Error(`Bloque ${index + 1}: revisa filtros, kernel y activación.`);
    }
    const parameters = (layer.kernel * layer.kernel * channels + 1) * layer.filters;
    total += parameters;
    channels = layer.filters;

    if (layer.pool) {
      spatial = Math.floor(spatial / 2);
      if (spatial < 1) throw new Error("El pooling produce una dimensión inválida.");
    }
    return { spatial, channels, parameters };
  });

  const flattened = spatial * spatial * channels;
  const denseParameters = (flattened + 1) * config.dense;
  const output = classes === 2 ? 1 : classes;
  total += denseParameters + (config.dense + 1) * output;

  if (total > 5000000) {
    throw new Error("Máximo: cinco millones de parámetros. Reduce tamaño, filtros o unidades Dense.");
  }

  return {
    blocks, flattened, denseParameters, output, total,
    activation: classes === 2 ? "sigmoid" : "softmax",
    loss: classes === 2 ? "binary_crossentropy" : "sparse_categorical_crossentropy",
  };
}

export function partition(labels: string[], train: number, validation: number, seed: number) {
  if (
    !Number.isInteger(train) || !Number.isInteger(validation) ||
    train < 1 || validation < 1 || train + validation >= 100 ||
    !Number.isInteger(seed) || seed < 0 || seed > 4294967295
  ) {
    throw new Error("Revisa los porcentajes enteros positivos y la semilla.");
  }

  const classes = [...new Set(labels)].sort();
  if (classes.length < 2 || classes.length > 20) {
    throw new Error("Se requieren entre 2 y 20 clases.");
  }

  let state = seed >>> 0;
  const shuffle = (values: number[]) => {
    for (let index = values.length - 1; index > 0; index--) {
      state = (Math.imul(1664525,state) + 1013904223) >>> 0;
      const next = Math.floor(state / 4294967296 * (index + 1));
      [values[index],values[next]] = [values[next],values[index]];
    }
    return values;
  };

  const result = {
    train: [] as number[],
    validation: [] as number[],
    test: [] as number[],
  };

  for (const name of classes) {
    const rows = shuffle(labels.flatMap((value,index) => value === name ? [index] : []));
    if (rows.length < 3) throw new Error(`La clase ${name} necesita al menos tres imágenes.`);

    let first = Math.max(1,Math.floor(rows.length * train / 100));
    let second = Math.max(1,Math.floor(rows.length * validation / 100));

    while (first + second >= rows.length) {
      if (first >= second && first > 1) first--;
      else second--;
    }

    result.train.push(...rows.slice(0,first));
    result.validation.push(...rows.slice(first,first + second));
    result.test.push(...rows.slice(first + second));
  }

  shuffle(result.train);
  shuffle(result.validation);
  shuffle(result.test);
  return { classes, ...result };
}

export async function readImages(files: File[]): Promise<ImageRecord[]> {
  const images = files.filter(file => /\.(png|jpe?g|webp)$/i.test(file.name));

  if (!images.length) throw new Error("La carpeta no contiene imágenes PNG, JPG o WebP.");
  if (images.length > 500) throw new Error("La importación de este dataset admite hasta 500 imágenes.");
  if (images.reduce((total,file) => total + file.size,0) > 50 * 1024 * 1024) {
    throw new Error("Las imágenes superan el límite conjunto de 50 MiB.");
  }

  const result: ImageRecord[] = [];
  const seen=new Map<string,{name:string;label:string}>();

  for (const file of images) {
    const parts = file.webkitRelativePath.split("/");
    if (parts.length !== 3 || !parts[1]) {
      throw new Error("Usa esta estructura: carpeta_principal/clase/imagen.png. No uses subcarpetas adicionales.");
    }

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error(`No se pudo decodificar la imagen ${file.name}.`);
    }

    const { width,height } = bitmap;
    bitmap.close();

    if (width < 1 || height < 1 || width > 4096 || height > 4096) {
      throw new Error(`${file.name}: dimensiones fuera del límite de 4096 × 4096.`);
    }

    const checksum=await sha256(await file.arrayBuffer());
    rememberImage(seen,checksum,file.name,parts[1]);
    result.push({ file,label:parts[1],width,height,checksum });
  }

  return result;
}

export function datasetMeta(dataset: ImageDataset): DatasetMeta {
  return {
    name: dataset.name,
    count: dataset.images.length,
    classes: [...dataset.classes],
    train: dataset.train.length,
    validation: dataset.validation.length,
    test: dataset.test.length,
    seed: dataset.seed,
    fingerprint: dataset.fingerprint,
  };
}

export function terminal(status: Job["status"]) {
  return status === "Completado" || status === "Cancelado";
}

export function advanceJobs(jobs: Job[]): Job[] {
  const now=new Date().toISOString();
  return advanceWithControls(jobs).map((next,index)=>{
    if(next===jobs[index])return next;
    return {...next,
      startedAt:next.startedAt??(next.status==="Ejecutando"?now:undefined),
      endedAt:next.endedAt??(terminal(next.status)?now:undefined),
    };
  });
}

export function csvCell(value: string | number) {
  let text = String(value);
  if (typeof value === "string" && /^\s*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"','""') + '"';
}
