/**
 * Respaldo portable sin ZIP de una CNN TensorFlow.js: arquitectura, pesos y métricas.
 * El formato .ncnn usa 8 bytes de firma, uint32 de tamaño JSON y pesos Float32.
 * No se envían imágenes ni credenciales a la nube.
 */
import * as tf from "@tensorflow/tfjs";
import type {BrowserReport} from "./browserCNN";
import {buildBrowserCNN} from "./browserCNN.ts";
import {summary} from "./cnn.ts";
import {prepareRealReport} from "./realRuns.ts";

const SIGNATURE="NLCNN001";
const HEADER_LIMIT=512*1024;
const WEIGHT_LIMIT=4*1024*1024;
const FILE_LIMIT=SIGNATURE.length+4+HEADER_LIMIT+WEIGHT_LIMIT;
const encoder=new TextEncoder();
const decoder=new TextDecoder("utf-8",{fatal:true});

type BackupHeader={
  format:"neurolab-portable-cnn";
  version:1;
  project_id:string;
  report:BrowserReport;
  modelTopology:unknown;
  weightSpecs:tf.io.WeightsManifestEntry[];
  weights_bytes:number;
  weights_sha256:string;
};

function error(message:string):never{throw new Error(message);}

async function hash(bytes:Uint8Array):Promise<string>{
  const copy=new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest=await crypto.subtle.digest("SHA-256",copy);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

export function validatePortableIdentity(projectId:string,value:unknown):BrowserReport {
  if(!value||typeof value!=="object")error("El respaldo no contiene un informe CNN válido.");
  const parsed=prepareRealReport(value);
  if(parsed.engine!=="TensorFlow.js"||parsed.weights_file!=="model.json"||
     typeof parsed.model_ref!=="string"||
     !parsed.model_ref.startsWith("indexeddb://neurolab-cnn-"+projectId+"-")||
     parsed.model_ref.length>240)
    error("El modelo no corresponde a este proyecto de NeuroLab.");
  const result=parsed as BrowserReport;
  if(result.classes.length!==new Set(result.classes).size||
     result.classes.some(label=>typeof label!=="string"||!label.trim()||label.length>100)||
     result.samples.train<2||result.samples.validation<2||result.samples.test<2||
     result.samples.train+result.samples.validation+result.samples.test>200||
     result.completed_epochs!==result.metrics.length||
     result.completed_epochs>result.requested_epochs||
     result.completed_epochs<1||
     !Number.isInteger(result.parameters)||
     result.config.size>32||
     result.parameters>500000||
     !Number.isInteger(result.batch)||result.batch<1||result.batch>64||
     result.requested_epochs>40||
     summary(result.config,result.classes.length).total!==result.parameters)
    error("El respaldo contiene parámetros de CNN inconsistentes o demasiado grandes.");
  return result;
}

function compareStructure(actual:tf.LayersModel,config:BrowserReport["config"],classes:number){
  const reference=buildBrowserCNN(config,classes);
  try{
    if(actual.countParams()!==reference.countParams()||
      JSON.stringify(actual.inputs.map(item=>item.shape))!==JSON.stringify(reference.inputs.map(item=>item.shape))||
      JSON.stringify(actual.outputs.map(item=>item.shape))!==JSON.stringify(reference.outputs.map(item=>item.shape))||
      actual.layers.length!==reference.layers.length)
      error("La topología o las dimensiones del respaldo no coinciden con la CNN esperada.");
    const fields=["filters","kernelSize","poolSize","padding","activation","units","rate","strides","dilationRate"] as const;
    for(let index=0;index<actual.layers.length;index++){
      const got=actual.layers[index],wanted=reference.layers[index];
      if(got.getClassName()!==wanted.getClassName())
        error("El respaldo no es una arquitectura convolucional compatible.");
      const g=got.getConfig() as Record<string,unknown>,w=wanted.getConfig() as Record<string,unknown>;
      if(fields.some(key=>JSON.stringify(g[key]??null)!==JSON.stringify(w[key]??null))||
        JSON.stringify(got.weights.map(item=>item.shape))!==JSON.stringify(wanted.weights.map(item=>item.shape)))
        error("Los filtros, capas o pesos del respaldo no corresponden al modelo.");
    }
  }finally{reference.dispose();}
}

export function validateBackupHeader(header:unknown,projectId:string):asserts header is BackupHeader {
  if(!header||typeof header!=="object"||Array.isArray(header))error("Cabecera de respaldo inválida.");
  const data=header as Record<string,unknown>;
  if(data.format!=="neurolab-portable-cnn"||data.version!==1||
    data.project_id!==projectId||!data.modelTopology||typeof data.modelTopology!=="object"||
    !Array.isArray(data.weightSpecs)||data.weightSpecs.length<1||data.weightSpecs.length>64||
    typeof data.weights_sha256!=="string"||!/^[0-9a-f]{64}$/.test(data.weights_sha256)||
    !Number.isInteger(data.weights_bytes)||Number(data.weights_bytes)<4||
    Number(data.weights_bytes)>WEIGHT_LIMIT)
    error("El archivo no es un respaldo de NeuroLab válido para este proyecto.");
  validatePortableIdentity(projectId,data.report);
  let elements=0;
  for(const spec of data.weightSpecs as Record<string,unknown>[]){
    if(typeof spec.name!=="string"||spec.dtype!=="float32"||
       !Array.isArray(spec.shape)||spec.shape.length>5||
       spec.shape.some(item=>!Number.isInteger(item)||Number(item)<1||Number(item)>500000))
      error("Especificación de pesos inválida.");
    const count=(spec.shape as number[]).reduce((value,size)=>value*size,1);
    elements+=count;
    if(elements>500000)error("El respaldo contiene demasiados pesos.");
  }
  if(elements*4!==data.weights_bytes)
    error("El tamaño de pesos no coincide con la estructura declarada.");
}

export async function encodeCNNBackup(
  projectId:string,report:BrowserReport,artifacts:tf.io.ModelArtifacts,
):Promise<Blob>{
  validatePortableIdentity(projectId,report);
  if(!(artifacts.weightData instanceof ArrayBuffer)||!artifacts.modelTopology||!artifacts.weightSpecs)
    error("TensorFlow.js no proporcionó arquitectura y pesos exportables.");
  const weights=new Uint8Array(artifacts.weightData);
  if(!weights.length||weights.byteLength>WEIGHT_LIMIT)error("El modelo supera el límite de 4 MiB.");
  const header:BackupHeader={
    format:"neurolab-portable-cnn",version:1,project_id:projectId,
    report,modelTopology:artifacts.modelTopology,weightSpecs:artifacts.weightSpecs,
    weights_bytes:weights.byteLength,weights_sha256:await hash(weights),
  };
  validateBackupHeader(header,projectId);
  const encoded=encoder.encode(JSON.stringify(header));
  if(encoded.length>HEADER_LIMIT)error("La arquitectura del respaldo supera 512 KiB.");
  const size=new ArrayBuffer(4);
  new DataView(size).setUint32(0,encoded.length,true);
  return new Blob([encoder.encode(SIGNATURE),size,encoded,weights],{type:"application/octet-stream"});
}

export async function decodeCNNBackup(file:Blob,projectId:string):Promise<{
  report:BrowserReport;artifacts:tf.io.ModelArtifacts;
}>{
  if(file.size<20||file.size>FILE_LIMIT)error("Tamaño de respaldo no admitido.");
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(decoder.decode(bytes.subarray(0,8))!==SIGNATURE)error("Firma de respaldo NeuroLab inválida.");
  const headerSize=new DataView(bytes.buffer,bytes.byteOffset+8,4).getUint32(0,true);
  if(!headerSize||headerSize>HEADER_LIMIT||12+headerSize>=bytes.length)
    error("La cabecera de respaldo está incompleta.");
  let header:unknown;
  try{header=JSON.parse(decoder.decode(bytes.subarray(12,12+headerSize)));}catch{error("El JSON de respaldo está dañado.");}
  validateBackupHeader(header,projectId);
  const remaining=bytes.subarray(12+headerSize);
  if(remaining.length!==header.weights_bytes||await hash(remaining)!==header.weights_sha256)
    error("El archivo está incompleto o sus pesos han sido modificados.");
  const weightData=remaining.slice().buffer as ArrayBuffer;
  return {
    report:header.report,
    artifacts:{
      modelTopology:header.modelTopology as tf.io.ModelArtifacts["modelTopology"],
      weightSpecs:header.weightSpecs,
      weightData,
      format:"layers-model",
    },
  };
}

export async function createCNNBackup(projectId:string,report:BrowserReport):Promise<Blob>{
  validatePortableIdentity(projectId,report);
  const model=await tf.loadLayersModel(report.model_ref);
  try{
    compareStructure(model,report.config,report.classes.length);
    let backup:Blob|undefined;
    await model.save(tf.io.withSaveHandler(async artifacts=>{
      backup=await encodeCNNBackup(projectId,report,artifacts);
      return {modelArtifactsInfo:{
        dateSaved:new Date(),modelTopologyType:"JSON",
        modelTopologyBytes:JSON.stringify(artifacts.modelTopology).length,
        weightSpecsBytes:JSON.stringify(artifacts.weightSpecs).length,
        weightDataBytes:artifacts.weightData instanceof ArrayBuffer?artifacts.weightData.byteLength:0,
      }};
    }),{includeOptimizer:false});
    if(!backup)error("No se pudieron recopilar los pesos del respaldo.");
    return backup;
  }finally{model.dispose();}
}

export async function restoreCNNBackup(projectId:string,file:Blob,expectedRef?:string):Promise<BrowserReport>{
  const {report,artifacts}=await decodeCNNBackup(file,projectId);
  if(expectedRef&&report.model_ref!==expectedRef)error("El respaldo no pertenece al entrenamiento seleccionado.");
  const existing=await tf.io.listModels();
  if(existing[report.model_ref])error("El modelo ya existe en este navegador; no se reemplazarán sus pesos.");
  const model=await tf.loadLayersModel({load:async()=>artifacts});
  try{
    compareStructure(model,report.config,report.classes.length);
    // Solo se guarda después de validar archivo, checksum y topología.
    await model.save(report.model_ref,{includeOptimizer:false});
    return report;
  }finally{model.dispose();}
}
