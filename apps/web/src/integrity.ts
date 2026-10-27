import type { ImageDataset, Job } from "./cnn";
import { inspectDataset } from "./inspection.ts";

export async function sha256(buffer: ArrayBuffer) {
  const digest=await crypto.subtle.digest("SHA-256",buffer);
  return Array.from(new Uint8Array(digest),value=>
    value.toString(16).padStart(2,"0")
  ).join("");
}

export function rememberImage(
  seen: Map<string,{name:string;label:string}>,
  checksum:string,
  name:string,
  label:string
) {
  if(!/^[a-f0-9]{64}$/.test(checksum)){
    throw new Error("Huella de imagen inválida.");
  }

  const previous=seen.get(checksum);

  if(previous){
    throw new Error(previous.label===label
      ? `Archivo idéntico repetido: ${name} y ${previous.name}, clase ${label}. Retira una copia antes de cargar.`
      : `El mismo archivo aparece en clases diferentes: ${previous.label} y ${label}. Revisa las etiquetas.`
    );
  }

  seen.set(checksum,{name,label});
}

export async function fingerprintDataset(dataset:ImageDataset) {
  inspectDataset(dataset);

  if(dataset.images.some(image=>
    !image.checksum || !/^[a-f0-9]{64}$/.test(image.checksum)
  )){
    throw new Error("Vuelve a cargar las imágenes para calcular su huella digital.");
  }

  const identity={
    schemaVersion:1,
    seed:dataset.seed,
    classes:dataset.classes,
    images:dataset.images.map(image=>({
      label:image.label,
      checksum:image.checksum,
    })),
    train:dataset.train,
    validation:dataset.validation,
    test:dataset.test,
  };

  return sha256(new TextEncoder().encode(JSON.stringify(identity)).buffer);
}

export function validateCompletedJob(job:Job) {
  const last=job.metrics.at(-1);

  if(
    job.status!=="Completado" || !last ||
    last.epoch!==job.epoch || job.metrics.length!==job.epoch ||
    job.epoch>job.epochs ||
    (!job.stoppedEarly&&job.epoch!==job.epochs) ||
    (job.stoppedEarly&&!job.config.earlyStopping)
  ){
    throw new Error("Solo se registra una ejecución completada con todas sus épocas.");
  }

  if(!job.dataset.fingerprint || !/^[a-f0-9]{64}$/.test(job.dataset.fingerprint)){
    throw new Error("La ejecución no conserva la identidad del dataset. Crea otra tras aplicar las imágenes.");
  }

  if(job.dataset.train+job.dataset.validation+job.dataset.test!==job.dataset.count){
    throw new Error("Los conteos del dataset conservado no son coherentes.");
  }

  for(const [index,metric] of job.metrics.entries()){
    if(
      metric.epoch!==index+1 ||
      ![metric.loss,metric.valLoss,metric.accuracy,metric.valAccuracy].every(Number.isFinite) ||
      metric.loss<0 || metric.valLoss<0 ||
      metric.accuracy<0 || metric.accuracy>1 ||
      metric.valAccuracy<0 || metric.valAccuracy>1
    ){
      throw new Error("La ejecución contiene métricas incompletas o fuera de rango.");
    }
  }
}
