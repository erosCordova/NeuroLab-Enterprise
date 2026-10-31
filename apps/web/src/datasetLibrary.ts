import type {ImageDataset} from "./cnn";
import type {MnistData} from "./mnistDataset";
import type {TabularDataset} from "./tabular";

/** Almacenamiento local por cuenta y proyecto: no publica imágenes ni credenciales. */
export type LibraryContent=
 | {kind:"images";dataset:ImageDataset}
 | {kind:"tabular";dataset:TabularDataset}
 | {kind:"mnist";dataset:MnistData};
export type LibraryKind=LibraryContent["kind"];
export type LibraryEntry={
  id:string;owner:string;projectId:string;name:string;kind:LibraryKind;
  summary:string;source:string;createdAt:number;updatedAt:number;
};
type StoredEntry=LibraryEntry & {payload:LibraryContent};
type Choice={key:string;id:string|null};
const DB_NAME="neurolab-datasets-v1";
const RECORDS="records",CHOICES="choices",SUMMARIES="summaries";
const key=(owner:string,projectId:string)=>JSON.stringify([owner,projectId]);
function errorMessage(err:unknown){
  const name=err instanceof DOMException?err.name:"";
  if(name==="QuotaExceededError")return new Error("No hay espacio suficiente en este navegador para guardar el dataset. Libera almacenamiento y vuelve a intentarlo.");
  return err instanceof Error?err:new Error("No se pudo acceder a la biblioteca de datasets.");
}
function requestResult<T>(request:IDBRequest<T>):Promise<T>{
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(errorMessage(request.error));
  });
}
function complete(tx:IDBTransaction):Promise<void>{
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(errorMessage(tx.error));
    tx.onabort=()=>reject(errorMessage(tx.error));
  });
}
function openLibrary():Promise<IDBDatabase>{
  if(typeof indexedDB==="undefined")return Promise.reject(new Error("Este navegador no permite guardar datasets localmente."));
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,2);
    request.onupgradeneeded=()=>{
      const database=request.result;
      if(!database.objectStoreNames.contains(RECORDS)){
        const store=database.createObjectStore(RECORDS,{keyPath:"id"});
        store.createIndex("scope",["owner","projectId"],{unique:false});
      }
      if(!database.objectStoreNames.contains(CHOICES))database.createObjectStore(CHOICES,{keyPath:"key"});
      if(!database.objectStoreNames.contains(SUMMARIES)){
        const summaries=database.createObjectStore(SUMMARIES,{keyPath:"id"});
        summaries.createIndex("scope",["owner","projectId"],{unique:false});
        // Migración de versiones locales anteriores, sin descargar ni borrar archivos.
        const tx=request.transaction;
        if(tx){
          const cursor=tx.objectStore(RECORDS).openCursor();
          cursor.onsuccess=()=>{
            const record=cursor.result;
            if(!record)return;
            const {payload:_,...metadata}=record.value as StoredEntry;
            summaries.put(metadata);
            record.continue();
          };
        }
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(errorMessage(request.error));
    request.onblocked=()=>reject(new Error("Cierra otras pestañas de NeuroLab y vuelve a intentarlo."));
  });
}
function meta(content:LibraryContent){
  if(content.kind==="tabular")return {
    name:content.dataset.name,source:content.dataset.source,
    summary:content.dataset.rows.length.toLocaleString("es-PE")+" filas · "+content.dataset.headers.length+" columnas"
  };
  if(content.kind==="images")return {
    name:content.dataset.name,source:"Equipo",
    summary:content.dataset.images.length+" imágenes · "+content.dataset.classes.length+" clases"
  };
  return {name:"MNIST · "+content.dataset.limit.toLocaleString("es-PE"),
    source:content.dataset.source,summary:"Dígitos manuscritos · 10 clases"};
}
export async function listLibrary(owner:string,projectId:string):Promise<{items:LibraryEntry[];activeId:string|null}>{
  const db=await openLibrary();
  try{
    const tx=db.transaction([SUMMARIES,CHOICES],"readonly");
    const itemsPromise=requestResult(tx.objectStore(SUMMARIES).index("scope").getAll([owner,projectId])) as Promise<LibraryEntry[]>;
    const choicePromise=requestResult(tx.objectStore(CHOICES).get(key(owner,projectId))) as Promise<Choice|undefined>;
    const [items,choice]=await Promise.all([itemsPromise,choicePromise]);
    await complete(tx);
    return {items:items.sort((a,b)=>b.updatedAt-a.updatedAt),
      activeId:choice?.id??null};
  }finally{db.close();}
}
export async function getLibraryEntry(owner:string,projectId:string,id:string):Promise<StoredEntry>{
  const db=await openLibrary();
  try{
    const tx=db.transaction(RECORDS,"readonly");
    const found=await requestResult(tx.objectStore(RECORDS).get(id)) as StoredEntry|undefined;
    await complete(tx);
    if(!found||found.owner!==owner||found.projectId!==projectId)throw new Error("Dataset no encontrado en este proyecto.");
    return found;
  }finally{db.close();}
}
export async function saveLibraryEntry(owner:string,projectId:string,content:LibraryContent,id?:string,activate=true):Promise<LibraryEntry>{
  if(!owner||!projectId)throw new Error("Selecciona una cuenta y un proyecto válidos.");
  const db=await openLibrary();
  try{
    const tx=db.transaction([RECORDS,CHOICES,SUMMARIES],"readwrite");
    const store=tx.objectStore(RECORDS);
    // Los metadatos y el dataset se guardan juntos: nunca queda una ficha vacía.
    const previous=id?await requestResult(store.get(id)) as StoredEntry|undefined:undefined;
    if(id&&(!previous||previous.owner!==owner||previous.projectId!==projectId)){
      tx.abort();throw new Error("No puedes modificar un dataset de otro proyecto.");
    }
    const info=meta(content);
    const time=Date.now();
    const entry:StoredEntry={id:id??crypto.randomUUID(),owner,projectId,
      ...info,kind:content.kind,createdAt:previous?.createdAt??time,updatedAt:time,payload:content};
    store.put(entry);
    const {payload:_,...metadata}=entry;
    tx.objectStore(SUMMARIES).put(metadata);
    if(activate)tx.objectStore(CHOICES).put({key:key(owner,projectId),id:entry.id} satisfies Choice);
    await complete(tx);
    return metadata;
  }catch(e){throw errorMessage(e);}
  finally{db.close();}
}
export async function chooseLibraryEntry(owner:string,projectId:string,id:string|null):Promise<void>{
  const db=await openLibrary();
  try{
    const tx=db.transaction([RECORDS,CHOICES],"readwrite");
    if(id){
      const found=await requestResult(tx.objectStore(RECORDS).get(id)) as StoredEntry|undefined;
      if(!found||found.owner!==owner||found.projectId!==projectId){tx.abort();throw new Error("Dataset no encontrado.");}
    }
    tx.objectStore(CHOICES).put({key:key(owner,projectId),id} satisfies Choice);
    await complete(tx);
  }finally{db.close();}
}
export async function renameLibraryEntry(owner:string,projectId:string,id:string,name:string):Promise<void>{
  const trimmed=name.trim();
  if(trimmed.length<2||trimmed.length>100)throw new Error("El nombre debe tener entre 2 y 100 caracteres.");
  const db=await openLibrary();
  try{
    const tx=db.transaction([RECORDS,SUMMARIES],"readwrite"),store=tx.objectStore(RECORDS);
    const found=await requestResult(store.get(id)) as StoredEntry|undefined;
    if(!found||found.owner!==owner||found.projectId!==projectId){tx.abort();throw new Error("Dataset no encontrado.");}
    const payload=found.payload;
    if(payload.kind!=="mnist")payload.dataset.name=trimmed;
    const updated={...found,name:trimmed,updatedAt:Date.now(),payload};
    store.put(updated);
    const {payload:_,...metadata}=updated;
    tx.objectStore(SUMMARIES).put(metadata);
    await complete(tx);
  }finally{db.close();}
}
export async function deleteLibraryEntry(owner:string,projectId:string,id:string):Promise<boolean>{
  const db=await openLibrary();
  try{
    const tx=db.transaction([RECORDS,CHOICES,SUMMARIES],"readwrite");
    const store=tx.objectStore(RECORDS);
    const found=await requestResult(store.get(id)) as StoredEntry|undefined;
    if(!found||found.owner!==owner||found.projectId!==projectId){tx.abort();throw new Error("Dataset no encontrado.");}
    const choice=await requestResult(tx.objectStore(CHOICES).get(key(owner,projectId))) as Choice|undefined;
    store.delete(id);
    tx.objectStore(SUMMARIES).delete(id);
    if(choice?.id===id)tx.objectStore(CHOICES).put({key:key(owner,projectId),id:null} satisfies Choice);
    await complete(tx);
    return choice?.id===id;
  }finally{db.close();}
}
export async function clearProjectLibrary(owner:string,projectId:string):Promise<void>{
  const db=await openLibrary();
  try{
    const tx=db.transaction([RECORDS,CHOICES,SUMMARIES],"readwrite");
    const store=tx.objectStore(RECORDS),summaries=tx.objectStore(SUMMARIES);
    const keys=await requestResult(summaries.index("scope").getAllKeys([owner,projectId]));
    for(const k of keys){store.delete(k);summaries.delete(k);}
    tx.objectStore(CHOICES).delete(key(owner,projectId));
    await complete(tx);
  }finally{db.close();}
}
