import type {RealRun} from "./realRuns";

export const REAL_REPORT_WARNING =
  "Resultados declarados por el cliente: no certificados por Render. " +
  "Coincidir en dataset, semilla y tamaños no demuestra que las mismas imágenes estén en cada partición.";

export type RealComparison={
  kind:"neurolab-real-cnn-comparison";
  simulated:false;
  source:"client-reported";
  server_verified:false;
  report_warning:string;
  comparable_conditions:boolean;
  differences:string[];
  highest_reported_test_accuracy_id:string|null;
  rows:{
    id:string;engine:string;dataset_fingerprint:string;classes:string[];
    samples:RealRun["samples"];seed:number;input:[number,number];
    parameters:number;epochs:number;test_accuracy:number;test_loss:number;
    training_accuracy:number;validation_accuracy:number;validation_loss:number;
    imported_at:string;
  }[];
};

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

export function compareRealRuns(runs:RealRun[]):RealComparison {
  if(runs.length<2||runs.length>3||new Set(runs.map(run=>run.id)).size!==runs.length)
    throw new Error("Selecciona dos o tres entrenamientos diferentes.");
  const first=runs[0];
  const differences:string[]=[];
  if(runs.some(run=>run.dataset_fingerprint!==first.dataset_fingerprint))
    differences.push("Huella SHA-256 del dataset distinta");
  if(runs.some(run=>!same(run.classes,first.classes)))
    differences.push("Orden o conjunto de clases distinto");
  if(runs.some(run=>!same(run.samples,first.samples)))
    differences.push("Cantidad de imágenes por partición distinta");
  if(runs.some(run=>run.seed!==first.seed))
    differences.push("Semilla de partición declarada distinta");
  if(runs.some(run=>run.engine!==first.engine))
    differences.push("Motor de entrenamiento distinto");
  if(runs.some(run=>run.config.size!==first.config.size||run.config.channels!==first.config.channels))
    differences.push("Dimensiones o canales de entrada distintos");
  const compatible=differences.length===0;
  const winner=compatible?[...runs].sort((a,b)=>b.test.accuracy-a.test.accuracy||
    a.test.loss-b.test.loss||a.id.localeCompare(b.id))[0].id:null;
  return {
    kind:"neurolab-real-cnn-comparison",simulated:false,
    source:"client-reported",server_verified:false,
    report_warning:REAL_REPORT_WARNING,
    comparable_conditions:compatible,differences,
    highest_reported_test_accuracy_id:winner,
    rows:runs.map(run=>{
      const last=run.metrics[run.metrics.length-1];
      if(!last)throw new Error("El experimento carece de métricas finales.");
      return {
        id:run.id,engine:run.engine,dataset_fingerprint:run.dataset_fingerprint,
        classes:[...run.classes],samples:{...run.samples},seed:run.seed,
        input:[run.config.size,run.config.channels],parameters:run.parameters,
        epochs:run.completed_epochs,test_accuracy:run.test.accuracy,
        test_loss:run.test.loss,training_accuracy:last.accuracy,
        validation_accuracy:last.valAccuracy,validation_loss:last.valLoss,
        imported_at:run.imported_at,
      };
    }),
  };
}
function csvCell(value:unknown):string{
  let text=String(value??"");
  // Prevent spreadsheet formula injection from labels or user-provided strings.
  if(/^[\s]*[=+\-@\t\r]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function comparisonRealCSV(report:RealComparison){
  const headings=["tipo","origen","certificado_servidor","id","motor",
    "huella_dataset","clases","semilla","train","validation","test",
    "size","channels","parametros","epocas","precision_test",
    "perdida_test","precision_entrenamiento_final","precision_validacion_final",
    "perdida_validacion_final","condiciones_compatibles","advertencia"];
  const lines=report.rows.map(row=>[
    report.kind,report.source,report.server_verified,row.id,row.engine,
    row.dataset_fingerprint,row.classes.join(" | "),row.seed,row.samples.train,
    row.samples.validation,row.samples.test,row.input[0],row.input[1],
    row.parameters,row.epochs,row.test_accuracy,row.test_loss,
    row.training_accuracy,row.validation_accuracy,row.validation_loss,
    report.comparable_conditions,report.report_warning,
  ].map(csvCell).join(","));
  return "\ufeff"+[headings.map(csvCell).join(","),...lines].join("\r\n")+"\r\n";
}
export function epochsRealCSV(run:RealRun){
  const headings=["id_entrenamiento","motor","origen","epoca",
    "precision_entrenamiento","precision_validacion",
    "perdida_entrenamiento","perdida_validacion","certificado_servidor"];
  const rows=run.metrics.map(point=>[
    run.id,run.engine,"cliente",point.epoch,point.accuracy,point.valAccuracy,
    point.loss,point.valLoss,false,
  ].map(csvCell).join(","));
  return "\ufeff"+[headings.map(csvCell).join(","),...rows].join("\r\n")+"\r\n";
}
