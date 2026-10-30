import type { Job } from "./cnn";
import { csvCell, summary } from "./cnn.ts";
import { validateCompletedJob } from "./integrity.ts";

export function describeRun(job:Job) {
  validateCompletedJob(job);
  const final=job.metrics.at(-1)!;
  // Minimum actually observed; independent of minDelta's reference epoch.
  const minimum=job.metrics.reduce((best,point)=>point.valLoss<best.valLoss?point:best);
  return {
    id:job.id,projectId:job.projectId,projectName:job.name,
    mode:job.configurationMode??"manual",
    dataset:structuredClone(job.dataset),configuration:structuredClone(job.config),
    versionId:job.versionId,epochsConfigured:job.epochs,epochsExecuted:job.epoch,
    batch:job.batch,parameters:summary(job.config,job.dataset.classes.length).total,
    stoppedEarly:Boolean(job.stoppedEarly),
    final:structuredClone(final),
    minimumValidationLoss:minimum.valLoss,minimumValidationEpoch:minimum.epoch,
    accuracyGap:final.accuracy-final.valAccuracy,
  };
}

export function compareRuns(jobs:Job[],ids:string[]) {
  if(ids.length<1||ids.length>3||new Set(ids).size!==ids.length) {
    throw new Error("Selecciona entre una y tres ejecuciones distintas.");
  }
  const rows=ids.map(id=>{
    const job=jobs.find(item=>item.id===id);
    if(!job)throw new Error("No se encontró una de las ejecuciones seleccionadas.");
    return describeRun(job);
  });
  if(new Set(rows.map(row=>row.projectId)).size!==1) {
    throw new Error("Compara ejecuciones del mismo proyecto.");
  }
  return {
    format:"neurolab-cnn-comparison",schemaVersion:1,simulated:true,
    containsModelWeights:false,containsPredictions:false,
    sameDataset:rows.every(row=>row.dataset.fingerprint===rows[0].dataset.fingerprint),
    interpretation:"Comparación descriptiva de métricas simuladas; no mide calidad predictiva ni identifica un modelo ganador.",
    rows,
  };
}

export function comparisonCSV(jobs:Job[],ids:string[]) {
  const report=compareRuns(jobs,ids);
  const rows:(string|number)[][]=[
    ["tipo","ejecucion","proyecto","dataset","huella_dataset","modo","parametros","epocas_maximas","epocas_ejecutadas","parada_temprana","precision_entrenamiento_0_1","precision_validacion_0_1","perdida_entrenamiento","perdida_validacion","minimo_val_loss","epoca_minimo_val_loss"],
    ...report.rows.map(row=>[
      "CNN_SIMULADA",row.id,row.projectName,row.dataset.name,row.dataset.fingerprint!,row.mode,
      row.parameters,row.epochsConfigured,row.epochsExecuted,row.stoppedEarly?"Si":"No",
      row.final.accuracy,row.final.valAccuracy,row.final.loss,row.final.valLoss,
      row.minimumValidationLoss,row.minimumValidationEpoch,
    ]),
  ];
  return rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
}

export function epochCSV(job:Job) {
  validateCompletedJob(job);
  return [
    ["tipo","ejecucion","epoca","precision_entrenamiento_0_1","precision_validacion_0_1","perdida_entrenamiento","perdida_validacion"],
    ...job.metrics.map(point=>["CNN_SIMULADA",job.id,point.epoch,point.accuracy,point.valAccuracy,point.loss,point.valLoss]),
  ].map(row=>row.map(csvCell).join(",")).join("\r\n");
}
