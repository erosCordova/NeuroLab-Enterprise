import type { ImageDataset } from "./cnn";
import { inspectDataset } from "./inspection.ts";
import { fingerprintDataset,sha256 } from "./integrity.ts";

type Writer={
  write:(data:Blob|string)=>Promise<void>;
  close:()=>Promise<void>;
  abort?:()=>Promise<void>;
};

export type Directory={
  getDirectoryHandle:(name:string,options:{create:boolean})=>Promise<Directory>;
  getFileHandle:(name:string,options:{create:boolean})=>Promise<{
    createWritable:()=>Promise<Writer>;
  }>;
};

function safeName(name:string) {
  if(!name||name==="."||name===".."||/[\\/\u0000-\u001f]/.test(name)){
    throw new Error("El dataset contiene un nombre de archivo o clase no exportable.");
  }
}

export function datasetManifest(dataset:ImageDataset) {
  const stats=inspectDataset(dataset);

  if(!dataset.fingerprint||!/^[a-f0-9]{64}$/.test(dataset.fingerprint)){
    throw new Error("Carga y aplica el dataset antes de exportar.");
  }

  if(new Set(dataset.classes.map(value=>value.toLowerCase())).size!==dataset.classes.length){
    throw new Error("Dos clases difieren solo por mayúsculas. Renómbralas antes de exportar.");
  }

  const paths=new Set<string>();

  const images=dataset.images.map((image,index)=>{
    safeName(image.label);
    safeName(image.file.name);

    const relativePath=`${image.label}/${image.file.name}`;
    if(paths.has(relativePath.toLowerCase())){
      throw new Error("Dos imágenes tienen la misma ruta de exportación.");
    }
    paths.add(relativePath.toLowerCase());

    if(!image.checksum||!/^[a-f0-9]{64}$/.test(image.checksum)){
      throw new Error("Una imagen no tiene huella válida. Vuelve a cargar el dataset.");
    }

    return {
      index,path:relativePath,class:image.label,
      width:image.width,height:image.height,
      bytes:image.file.size,checksum:image.checksum,
      partition:stats.owners[index],
    };
  });

  return {
    format:"neurolab-cnn-dataset",
    schemaVersion:1,
    name:dataset.name,
    fingerprint:dataset.fingerprint,
    seed:dataset.seed,
    classes:[...dataset.classes],
    total:images.length,
    split:{
      train:[...dataset.train],
      validation:[...dataset.validation],
      test:[...dataset.test],
    },
    images,
  };
}

async function writeFile(directory:Directory,name:string,data:Blob|string) {
  const handle=await directory.getFileHandle(name,{create:true});
  const writer=await handle.createWritable();
  try{
    await writer.write(data);
    await writer.close();
  }catch(error){
    try{await writer.abort?.();}catch{}
    throw error;
  }
}

export async function exportDataset(
  dataset:ImageDataset,
  destination:Directory,
  onProgress:(done:number,total:number)=>void=()=>{}
) {
  const manifest=datasetManifest(dataset);

  if(await fingerprintDataset(dataset)!==dataset.fingerprint){
    throw new Error("La identidad del dataset cambió. Vuelve a validarlo antes de exportar.");
  }

  const folderName=`NeuroLab_CNN_${new Date().toISOString().replaceAll(":","-").replaceAll(".","-")}_${crypto.randomUUID().slice(0,8)}`;
  const output=await destination.getDirectoryHandle(folderName,{create:true});
  const directories=new Map<string,Directory>();

  onProgress(0,manifest.total);

  try{
    for(const [index,image] of dataset.images.entries()){
      const bytes=await image.file.arrayBuffer();

      if(await sha256(bytes)!==manifest.images[index].checksum){
        throw new Error(`El contenido de ${image.file.name} cambió. Carga otra vez las imágenes.`);
      }

      let directory=directories.get(image.label);
      if(!directory){
        directory=await output.getDirectoryHandle(image.label,{create:true});
        directories.set(image.label,directory);
      }

      await writeFile(directory,image.file.name,new Blob([bytes],{
        type:image.file.type,
      }));

      onProgress(index+1,manifest.total);
    }

    await writeFile(output,"dataset.neurolab.json",JSON.stringify(manifest,null,2));
    await writeFile(output,"LEEME.txt",
      "Dataset CNN exportado por NeuroLab.\n"+
      "Cada subcarpeta representa una clase.\n"+
      "El manifiesto conserva etiquetas, huellas y particiones.\n"+
      "Selecciona esta carpeta completa para volver a cargar imágenes.\n"+
      "El formulario vuelve a calcular las particiones: el manifiesto no se restaura automáticamente.\n"
    );
  }catch(error){
    throw new Error(
      `${error instanceof Error?error.message:"No se pudo completar la escritura."} `+
      `La carpeta ${folderName} puede estar incompleta.`
    );
  }

  return {folderName,total:manifest.total};
}
