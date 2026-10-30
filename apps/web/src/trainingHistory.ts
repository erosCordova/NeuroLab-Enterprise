import type { Job } from "./cnn";
import {csvCell,summary,terminal} from "./cnn.ts";

export function repeatRun(source:Job,id:string,now:string):Job {
  if(!terminal(source.status))throw new Error("Solo puedes repetir ejecuciones completadas o canceladas.");
  if(!id||id===source.id||!Number.isFinite(Date.parse(now)))throw new Error("Identidad o fecha de ejecución inválida.");
  summary(source.config,source.dataset.classes.length);
  if(!/^[a-f0-9]{64}$/.test(source.dataset.fingerprint??"")||
    !Number.isInteger(source.epochs)||source.epochs<1||source.epochs>100||
    !Number.isInteger(source.batch)||source.batch<1||source.batch>256)throw new Error("La ejecución original no tiene una configuración válida para repetir.");
  return {
    id,projectId:source.projectId,name:source.name,
    config:structuredClone(source.config),dataset:structuredClone(source.dataset),
    configurationMode:source.configurationMode,versionId:source.versionId,
    epochs:source.epochs,batch:source.batch,epoch:0,status:"En cola",metrics:[],
    createdAt:now,repeatedFrom:source.id,
  };
}
export function cancelRun(job:Job,now:string):Job {
  return terminal(job.status)?job:{...job,status:"Cancelado",endedAt:now,stopReason:"Simulación cancelada por el usuario."};
}
export function filterRuns(jobs:Job[],query:string,status:string) {
  const search=query.trim().toLocaleLowerCase("es");
  return jobs.filter(job=>(status==="Todos"||job.status===status)&&
    [job.id,job.name,job.dataset.name,job.repeatedFrom??""].join(" ").toLocaleLowerCase("es").includes(search));
}
export function elapsedSeconds(job:Job):number|null {
  if(!job.startedAt||!job.endedAt)return null;
  const duration=(Date.parse(job.endedAt)-Date.parse(job.startedAt))/1000;
  return Number.isFinite(duration)&&duration>=0?duration:null;
}
export function historyCSV(jobs:Job[]) {
  return [
    ["tipo","ejecucion","origen_repeticion","proyecto","estado","creada","iniciada","finalizada","duracion_segundos","dataset","huella_dataset","epocas_ejecutadas","epocas_maximas"],
    ...jobs.map(job=>["CNN_SIMULADA",job.id,job.repeatedFrom??"",job.name,job.status,job.createdAt??"",job.startedAt??"",job.endedAt??"",elapsedSeconds(job)??"",job.dataset.name,job.dataset.fingerprint??"",job.epoch,job.epochs]),
  ].map(row=>row.map(csvCell).join(",")).join("\r\n");
}
