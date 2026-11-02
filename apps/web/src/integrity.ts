import type { ImageDataset } from "./cnn";
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
