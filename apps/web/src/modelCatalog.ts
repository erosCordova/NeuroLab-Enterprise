/**
 * Catálogo local de CNN. Nunca guarda pesos en localStorage: los pesos siguen
 * en IndexedDB, con una referencia independiente para cada modelo importado.
 * El historial histórico remoto se conserva cuando se borra un peso local.
 */
import type {BrowserReport} from "./browserCNN";
import type {ColabImported} from "./colabCNN";

export type ImportedModel={
  ref:string;origin:"colab"|"ncnn";name:string;createdAt:string;
  report?:BrowserReport;colab?:ColabImported;
};
const catalogKey=(projectId:string)=>"neurolab-imports-v2:"+projectId;
const deletedKey=(projectId:string)=>"neurolab-deleted-local-v1:"+projectId;
const legacyBackupKey=(projectId:string)=>"neurolab-imported-ordinary-v1:"+projectId;
const legacyColabKey=(projectId:string)=>"neurolab-colab-keras-v1:"+projectId;
const trimName=(name:string)=>name.trim().slice(0,80);
export function isOwnedModelRef(projectId:string,ref:string,origin:"colab"|"ncnn"|"local"):boolean{
  if(!projectId||!ref||!projectId.match(/^[a-zA-Z0-9_-]{1,128}$/))return false;
  if(ref.length>240)return false;
  if(origin==="colab")return ref.startsWith("indexeddb://neurolab-cnn-colab-"+encodeURIComponent(projectId)+"-")&&
    !ref.includes("..");
  const prefix="indexeddb://neurolab-cnn-"+projectId+"-";
  if(!ref.startsWith(prefix))return false;
  if(origin==="ncnn")return ref.startsWith(prefix+"imported-")&&/^[a-f0-9]{24}$/.test(ref.slice((prefix+"imported-").length));
  return !ref.startsWith(prefix+"imported-")&&!ref.includes("-colab-");
}
export function isValidImported(projectId:string,item:ImportedModel):boolean{
  return !!item&&typeof item==="object"&&
    (item.origin==="colab"||item.origin==="ncnn")&&
    isOwnedModelRef(projectId,item.ref,item.origin)&&
    typeof item.name==="string"&&item.name.length>0&&item.name.length<=80&&
    typeof item.createdAt==="string"&&
    (item.origin==="colab"?item.colab?.modelRef===item.ref&&item.colab.projectId===projectId:
      item.report?.model_ref===item.ref);
}
function parseList(projectId:string):ImportedModel[]{
  try{
    const raw=JSON.parse(localStorage.getItem(catalogKey(projectId))||"[]") as unknown;
    return Array.isArray(raw)?raw.filter((v):v is ImportedModel=>isValidImported(projectId,v as ImportedModel)).slice(0,100):[];
  }catch{return [];}
}
function persist(projectId:string,items:ImportedModel[]){
  localStorage.setItem(catalogKey(projectId),JSON.stringify(items));
}
export function importedModels(projectId:string):ImportedModel[]{
  const entries=parseList(projectId);
  // Migrar las dos referencias que ya existían sin tocar sus pesos.
  try{
    const old=localStorage.getItem(legacyColabKey(projectId));
    const colab=old?JSON.parse(old) as ColabImported:null;
    if(colab?.projectId===projectId&&colab.modelRef&&
       isOwnedModelRef(projectId,colab.modelRef,"colab")&&!entries.some(item=>item.ref===colab.modelRef))
      entries.push({ref:colab.modelRef,origin:"colab",name:"CNN original de Colab",
        createdAt:new Date().toISOString(),colab});
  }catch{/* Migración opcional. */}
  try{
    const old=localStorage.getItem(legacyBackupKey(projectId));
    const report=old?JSON.parse(old) as BrowserReport:null;
    if(report&&isOwnedModelRef(projectId,report.model_ref,"ncnn")&&!entries.some(item=>item.ref===report.model_ref))
      entries.push({ref:report.model_ref,origin:"ncnn",name:"CNN importada desde respaldo",
        createdAt:new Date().toISOString(),report});
  }catch{/* Migración opcional. */}
  persist(projectId,entries);
  return entries;
}
export function addImportedModel(projectId:string,item:ImportedModel):ImportedModel[]{
  if(!isValidImported(projectId,item))throw new Error("El modelo importado no pertenece a este proyecto.");
  const items=importedModels(projectId).filter(old=>old.ref!==item.ref);
  items.unshift(item);persist(projectId,items);return items;
}
export function renameImportedModel(projectId:string,ref:string,name:string):ImportedModel[]{
  const next=trimName(name);
  if(!next)throw new Error("Escribe un nombre para el modelo.");
  const items=importedModels(projectId);
  if(!items.some(item=>item.ref===ref))throw new Error("Modelo importado no encontrado.");
  const updated=items.map(item=>item.ref===ref?{...item,name:next}:item);
  persist(projectId,updated);return updated;
}
export function forgetImportedModel(projectId:string,ref:string):ImportedModel[]{
  const items=importedModels(projectId);
  if(!items.some(item=>item.ref===ref))throw new Error("El modelo no está registrado en importaciones.");
  const updated=items.filter(item=>item.ref!==ref);
  persist(projectId,updated);
  // No permitir que un registro heredado vuelva a aparecer automáticamente.
  try{
    const legacy=localStorage.getItem(legacyColabKey(projectId));
    if(legacy&&(JSON.parse(legacy) as ColabImported).modelRef===ref)localStorage.removeItem(legacyColabKey(projectId));
  }catch{/* Ignorar respaldo heredado corrupto. */}
  try{
    const legacy=localStorage.getItem(legacyBackupKey(projectId));
    if(legacy&&(JSON.parse(legacy) as BrowserReport).model_ref===ref)localStorage.removeItem(legacyBackupKey(projectId));
  }catch{/* Ignorar respaldo heredado corrupto. */}
  return updated;
}
export function deletedLocalRefs(projectId:string):Set<string>{
  try{
    const value=JSON.parse(localStorage.getItem(deletedKey(projectId))||"[]") as unknown;
    return new Set(Array.isArray(value)?value.filter((ref):ref is string=>
      typeof ref==="string"&&isOwnedModelRef(projectId,ref,"local")):[]);
  }catch{return new Set();}
}
export function markLocalDeleted(projectId:string,ref:string):void{
  if(!isOwnedModelRef(projectId,ref,"local"))throw new Error("El modelo no pertenece a los entrenamientos locales.");
  const removed=deletedLocalRefs(projectId);removed.add(ref);
  localStorage.setItem(deletedKey(projectId),JSON.stringify([...removed]));
}
export async function deleteModelWeights(projectId:string,ref:string,origin:"colab"|"ncnn"|"local"):Promise<void>{
  if(!isOwnedModelRef(projectId,ref,origin))throw new Error("Se bloqueó la eliminación de un modelo ajeno al proyecto.");
  const tf=await import("@tensorflow/tfjs");
  const available=await tf.io.listModels();
  if(available[ref])await tf.io.removeModel(ref);
  if(origin==="local"){markLocalDeleted(projectId,ref);const names=localNames(projectId);delete names[ref];localStorage.setItem(nameKey(projectId),JSON.stringify(names));}
  else forgetImportedModel(projectId,ref);
}

const nameKey=(projectId:string)=>"neurolab-local-names-v1:"+projectId;
function localNames(projectId:string):Record<string,string>{
  try{
    const raw=JSON.parse(localStorage.getItem(nameKey(projectId))||"{}");
    if(!raw||typeof raw!=="object"||Array.isArray(raw))return {};
    return Object.fromEntries(Object.entries(raw).filter(([ref,name])=>
      isOwnedModelRef(projectId,ref,"local")&&typeof name==="string"&&name.length<=80));
  }catch{return {};}
}
export function localModelName(projectId:string,ref:string):string{
  if(!isOwnedModelRef(projectId,ref,"local"))return "";
  return localNames(projectId)[ref]??"";
}
export function renameLocalModel(projectId:string,ref:string,name:string):void{
  if(!isOwnedModelRef(projectId,ref,"local"))throw new Error("No es una CNN entrenada en este proyecto.");
  const value=trimName(name);
  if(!value)throw new Error("Escribe un nombre para el modelo.");
  const names=localNames(projectId);names[ref]=value;
  localStorage.setItem(nameKey(projectId),JSON.stringify(names));
}
