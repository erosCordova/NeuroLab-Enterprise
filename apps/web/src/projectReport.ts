import type {RealRun} from "./realRuns";
import type {RealModel} from "./realModelRegistry";

export const DISCLAIMER="Métricas declaradas por los usuarios, no verificadas independientemente por Render. No prueban la calidad del modelo ni que todos los experimentos tengan idénticas particiones de prueba.";
export type ReportRow={
 id:string;date:string;engine:string;dataset:string;classes:number;
 train:number;validation:number;testCount:number;epochs:number;parameters:number;
 accuracy:number;loss:number;validationAccuracy:number;validationLoss:number;
};
export type ProjectReport={
 schema:"neurolab-project-report-v1";project_name:string;
 source:"client-reported";server_verified:false;simulated:false;warning:string;
 coverage:{runs_limit:50;models_limit:50;exhaustive:boolean};
 totals:{runs:number;browser:number;keras:number;models:number;active:number;archived:number;favorites:number;datasets:number};
 latest:ReportRow|null;highest_reported:ReportRow|null;
 rows:ReportRow[];registered_models:{id:string;display_name:string;status:string;favorite:boolean;notes:string}[];
};
export function buildProjectReport(projectName:string,runs:RealRun[],models:RealModel[]):ProjectReport{
 const rows=runs.map(run=>{
  const last=run.metrics.at(-1);
  if(!last)throw new Error("El informe no contiene métricas válidas.");
  return {id:run.id,date:run.imported_at,engine:run.engine,
   dataset:run.dataset_fingerprint,classes:run.classes.length,
   train:run.samples.train,validation:run.samples.validation,testCount:run.samples.test,
   epochs:run.completed_epochs,parameters:run.parameters,accuracy:run.test.accuracy,
   loss:run.test.loss,validationAccuracy:last.valAccuracy,validationLoss:last.valLoss};
 }).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
 const highest=[...rows].sort((a,b)=>b.accuracy-a.accuracy||a.loss-b.loss||a.id.localeCompare(b.id))[0]??null;
 return {
  schema:"neurolab-project-report-v1",project_name:projectName,
  source:"client-reported",server_verified:false,simulated:false,warning:DISCLAIMER,
  coverage:{runs_limit:50,models_limit:50,exhaustive:runs.length<50&&models.length<50},
  totals:{runs:rows.length,browser:rows.filter(r=>r.engine==="TensorFlow.js").length,
   keras:rows.filter(r=>r.engine==="TensorFlow/Keras").length,
   models:models.length,active:models.filter(m=>m.status==="Registrado").length,
   archived:models.filter(m=>m.status==="Archivado").length,
   favorites:models.filter(m=>m.favorite).length,
   datasets:new Set(rows.map(r=>r.dataset)).size},
  latest:rows[0]??null,highest_reported:highest,rows,
  registered_models:models.map(m=>({id:m.id,display_name:m.display_name,
    status:m.status,favorite:m.favorite,notes:m.notes})),
 };
}
function safeCsv(value:unknown):string{
 let v=String(value??"");
 if(/^\s*[=+\-@\t\r]/.test(v))v="'"+v;
 return '"'+v.replaceAll('"','""')+'"';
}
export function reportCSV(report:ProjectReport):string{
 const head=["origen","verificado_servidor","simulado","proyecto","ejecucion","fecha","motor",
  "dataset_sha256","clases","train","validation","test","epocas","parametros",
  "precision_test","perdida_test","precision_validacion_final","perdida_validacion_final","advertencia"];
 const rows=report.rows.map(r=>[report.source,false,false,report.project_name,r.id,r.date,r.engine,
  r.dataset,r.classes,r.train,r.validation,r.testCount,r.epochs,r.parameters,
  r.accuracy,r.loss,r.validationAccuracy,r.validationLoss,report.warning].map(safeCsv).join(","));
 return "\ufeff"+[head.map(safeCsv).join(","),...rows].join("\r\n")+"\r\n";
}
export function reportJSON(report:ProjectReport){return JSON.stringify(report,null,2);}
