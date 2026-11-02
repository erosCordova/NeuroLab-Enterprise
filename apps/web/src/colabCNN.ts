/**
 * Importación exclusiva del modelo real TecnoForms MNIST exportado desde Keras 3.
 * No es un .ncnn convencional: NLCOLAB1 contiene tensores originales,
 * suma SHA-256 y una arquitectura canónica validada antes de guardar.
 * Las capas de aumento aleatorio de Keras se omiten porque son identidad
 * en inferencia. Los pesos no se reentrenan ni se suben al servidor.
 */
import * as tf from "@tensorflow/tfjs";

const SIGNATURE="NLCOLAB1";
const FORMAT="neurolab-colab-mnist",ARCHITECTURE="tecnoforms-mnist-conv32x2-conv64x2-dense128-v1";
const LIMIT=1_500_000;
const EXPECTED:ReadonlyArray<readonly [string,readonly number[]]>=[
  ["conv2d/kernel",[3,3,1,32]],["conv2d/bias",[32]],
  ["conv2d_1/kernel",[3,3,32,32]],["conv2d_1/bias",[32]],
  ["conv2d_2/kernel",[3,3,32,64]],["conv2d_2/bias",[64]],
  ["conv2d_3/kernel",[3,3,64,64]],["conv2d_3/bias",[64]],
  ["dense/kernel",[1600,128]],["dense/bias",[128]],
  ["dense_1/kernel",[128,10]],["dense_1/bias",[10]],
];

const EXPECTED_BYTES=EXPECTED.reduce((n,[,shape])=>n+shape.reduce((a,b)=>a*b,1)*4,0);
const classes=Array.from({length:10},(_,i)=>String(i));

type Header={
  format:string;version:number;name:string;source_sha256:string;
  architecture:string;input:number[];classes:string[];
  parameters:number;weightSpecs:{name:string;shape:number[];dtype:string}[];
  weights_bytes:number;weights_sha256:string;
};
export type ColabImported={
  version:1;projectId:string;modelRef:string;sourceHash:string;name:string;
  classes:string[];parameters:271210;architecture:string;
};
function key(projectId:string){return "neurolab-colab-keras-v1:"+projectId;}
const fail=(message:string):never=>{throw new Error(message);};
async function sha256(view:Uint8Array):Promise<string>{
  const digest=await crypto.subtle.digest("SHA-256",new Uint8Array(view).buffer);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
export async function isColabCNNFile(file:Blob):Promise<boolean>{
  return file.size>=8&&(await file.slice(0,8).text())===SIGNATURE;
}
export function readImportedColab(projectId:string):ColabImported|null{
  try{
    const raw=localStorage.getItem(key(projectId));
    if(!raw)return null;
    const result=JSON.parse(raw) as ColabImported;
    if(result.version!==1||result.projectId!==projectId||
      !result.modelRef?.startsWith("indexeddb://neurolab-cnn-colab-")||
      !/^[a-f0-9]{64}$/.test(result.sourceHash)||
      result.architecture!==ARCHITECTURE||result.parameters!==271210||
      JSON.stringify(result.classes)!==JSON.stringify(classes))return null;
    return result;
  }catch{return null;}
}
function validateHeader(value:unknown):Header{
  if(!value||typeof value!=="object"||Array.isArray(value))
    return fail("La cabecera del modelo no es válida.");
  const h=value as Header;
  if(h.format!==FORMAT||h.version!==1||h.architecture!==ARCHITECTURE||
    h.parameters!==271210||h.weights_bytes!==EXPECTED_BYTES||
    !/^[a-f0-9]{64}$/.test(h.source_sha256)||
    !/^[a-f0-9]{64}$/.test(h.weights_sha256)||
    JSON.stringify(h.classes)!==JSON.stringify(classes)||
    JSON.stringify(h.input)!=="[28,28,1]"||
    !Array.isArray(h.weightSpecs)||h.weightSpecs.length!==EXPECTED.length)
    return fail("El archivo no corresponde a la CNN MNIST de Colab compatible.");
  h.weightSpecs.forEach((s,i)=>{
    const [name,shape]=EXPECTED[i];
    if(s.name!==name||s.dtype!=="float32"||JSON.stringify(s.shape)!==JSON.stringify(shape))
      fail("Las dimensiones de los pesos no coinciden con el modelo de Colab.");
  });
  return h;
}
export async function inspectColabCNN(file:Blob):Promise<{header:Header;weights:Uint8Array}>{
  if(file.size<100||file.size>LIMIT)return fail("El modelo Colab supera el tamaño admitido.");
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(new TextDecoder().decode(bytes.subarray(0,8))!==SIGNATURE)
    return fail("Este archivo no es la conversión .ncnn de Colab.");
  const length=new DataView(bytes.buffer).getUint32(8,true);
  if(length<100||length>65536||12+length>=bytes.length)
    return fail("La cabecera de los pesos está incompleta.");
  let parsed:unknown;
  try{parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(12,12+length)));}
  catch{return fail("No se pudo leer la cabecera del modelo.");}
  const header=validateHeader(parsed);
  const weights=bytes.slice(12+length);
  if(weights.length!==EXPECTED_BYTES||await sha256(weights)!==header.weights_sha256)
    return fail("Los pesos están incompletos o no superaron la verificación SHA-256.");
  // Exigir números reales finitos; nunca guardar tensores con NaN/Infinity.
  const floats=new Float32Array(weights.buffer,weights.byteOffset,weights.length/4);
  if(!floats.every(Number.isFinite))return fail("El archivo contiene pesos numéricos inválidos.");
  return {header,weights};
}
function buildColabCNN():tf.Sequential{
  const model=tf.sequential();
  model.add(tf.layers.conv2d({inputShape:[28,28,1],filters:32,kernelSize:3,padding:"same",activation:"relu"}));
  model.add(tf.layers.conv2d({filters:32,kernelSize:3,padding:"valid",activation:"relu"}));
  model.add(tf.layers.maxPooling2d({poolSize:[2,2],strides:[2,2]}));
  model.add(tf.layers.dropout({rate:.15}));
  model.add(tf.layers.conv2d({filters:64,kernelSize:3,padding:"same",activation:"relu"}));
  model.add(tf.layers.conv2d({filters:64,kernelSize:3,padding:"valid",activation:"relu"}));
  model.add(tf.layers.maxPooling2d({poolSize:[2,2],strides:[2,2]}));
  model.add(tf.layers.dropout({rate:.25}));
  model.add(tf.layers.flatten());
  model.add(tf.layers.dense({units:128,activation:"relu"}));
  model.add(tf.layers.dropout({rate:.4}));
  model.add(tf.layers.dense({units:10,activation:"softmax"}));
  if(model.countParams()!==271210||model.outputShape[1]!==10){
    model.dispose();
    return fail("La arquitectura de TensorFlow.js no coincide con la original.");
  }
  return model;
}
export async function importColabCNN(projectId:string,file:Blob):Promise<ColabImported>{
  if(!projectId||projectId.length>128)return fail("Selecciona un proyecto válido.");
  const {header,weights}=await inspectColabCNN(file);
  const modelRef="indexeddb://neurolab-cnn-colab-"+encodeURIComponent(projectId)+"-"+header.source_sha256.slice(0,16);
  const record:ColabImported={
    version:1,projectId,modelRef,sourceHash:header.source_sha256,
    name:"CNN de Colab · dígitos 0–9",classes:[...classes],
    parameters:271210,architecture:ARCHITECTURE,
  };
  const existing=await tf.io.listModels();
  if(existing[modelRef]){
    localStorage.setItem(key(projectId),JSON.stringify(record));
    return record;
  }
  const model=buildColabCNN();
  const tensors:tf.Tensor[]=[];
  try{
    let offset=0;
    for(const [,shape] of EXPECTED){
      const count=shape.reduce((a,b)=>a*b,1);
      const slice=new Float32Array(weights.buffer.slice(weights.byteOffset+offset,weights.byteOffset+offset+count*4));
      tensors.push(tf.tensor(slice,[...shape],"float32"));
      offset+=count*4;
    }
    if(offset!==weights.length)fail("El número de pesos cargados es inconsistente.");
    model.setWeights(tensors);
    const check=model.predict(tf.zeros([1,28,28,1])) as tf.Tensor;
    try{
      const values=await check.data();
      if(values.length!==10||Array.from(values).some(v=>!Number.isFinite(v)))
        fail("El modelo importado no superó la prueba de inferencia.");
    }finally{check.dispose();}
    await model.save(modelRef,{includeOptimizer:false});
    try{localStorage.setItem(key(projectId),JSON.stringify(record));}
    catch{
      await tf.io.removeModel(modelRef).catch(()=>undefined);
      return fail("No se pudo registrar el modelo en este navegador; habilita el almacenamiento local.");
    }
    return record;
  }finally{tensors.forEach(t=>t.dispose());model.dispose();}
}
