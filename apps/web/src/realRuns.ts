import type {Config,Metric} from "./cnn";

export type RealReport={
  training:"real";
  engine:"TensorFlow/Keras"|"TensorFlow.js";
  dataset_fingerprint:string;
  classes:string[];
  samples:{train:number;validation:number;test:number};
  config:Config;
  parameters:number;
  requested_epochs:number;
  completed_epochs:number;
  batch:number;
  seed:number;
  metrics:Metric[];
  test:{accuracy:number;loss:number};
  weights_file:"model.keras"|"model.json";
  model_ref?:string;
};
export type RealRun=Omit<RealReport,"training"|"engine"|"weights_file">&{
  id:string;project_id:string;imported_at:string;source:"importado"|"navegador";engine:"TensorFlow/Keras"|"TensorFlow.js";weights_file:"model.keras"|"model.json";model_ref:string|null;
};

export function prepareRealReport(source:unknown):RealReport {
  if(!source||typeof source!=="object"||Array.isArray(source))throw new Error("El informe debe ser un objeto JSON.");
  const value=source as Record<string,unknown>;
  const python=value.engine==="TensorFlow/Keras"&&value.weights_file==="model.keras"&&!value.model_ref;
  const browser=value.engine==="TensorFlow.js"&&value.weights_file==="model.json"&&typeof value.model_ref==="string"&&value.model_ref.startsWith("indexeddb://neurolab-cnn-")&&value.model_ref.length<=240;
  if(value.training!=="real"||(!python&&!browser))
    throw new Error("Selecciona un informe CNN real de NeuroLab compatible con el motor Python o TensorFlow.js.");
  if(!Array.isArray(value.metrics)||value.metrics.length<1||value.metrics.length>100)
    throw new Error("El informe debe contener de 1 a 100 épocas.");
  const epochs=Number(value.completed_epochs);
  if(!Number.isInteger(epochs)||epochs!==value.metrics.length||
    value.metrics.some((item,index)=>!item||typeof item!=="object"||Number((item as {epoch:number}).epoch)!==index+1))
    throw new Error("Las épocas del informe no son consecutivas.");
  if(!Array.isArray(value.classes)||value.classes.length<2||value.classes.length>20)
    throw new Error("El informe debe tener entre dos y veinte clases.");
  if(typeof value.dataset_fingerprint!=="string"||!/^[a-f0-9]{64}$/.test(value.dataset_fingerprint))
    throw new Error("La huella SHA-256 del dataset es inválida.");
  return value as RealReport;
}
