import type {RealRun} from "./realRuns";

export type RealModel={
 id:string;project_id:string;run_id:string;
 display_name:string;notes:string;status:"Registrado"|"Archivado";
 favorite:boolean;revision:number;created_at:string;updated_at:string;
 engine:"TensorFlow.js";model_ref:string;
 classes:string[];test:{accuracy:number;loss:number};
 parameters:number;completed_epochs:number;dataset_fingerprint:string;
};
export type ModelFilter="Todos"|"Disponibles"|"Archivados"|"Favoritos";
export function unregisteredRuns(runs:RealRun[],models:RealModel[]) {
 const ids=new Set(models.map(item=>item.run_id));
 return runs.filter(item=>item.engine==="TensorFlow.js"&&!!item.model_ref&&!ids.has(item.id));
}
export function filterRealModels(models:RealModel[],filter:ModelFilter,query:string,available:Set<string>){
 const needle=query.trim().toLocaleLowerCase("es");
 return models.filter(item=>{
  if(filter==="Disponibles"&&(item.status==="Archivado"||!available.has(item.model_ref)))return false;
  if(filter==="Archivados"&&item.status!=="Archivado")return false;
  if(filter==="Favoritos"&&!item.favorite)return false;
  return !needle||(item.display_name+" "+item.classes.join(" ")+" "+item.notes).toLocaleLowerCase("es").includes(needle);
 }).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.updated_at.localeCompare(a.updated_at));
}
