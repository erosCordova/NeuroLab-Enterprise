import * as tf from "@tensorflow/tfjs";
import type {ImageDataset} from "./cnn.ts";

const PRETRAINED="https://tfhub.dev/google/imagenet/mobilenet_v1_050_224/classification/1";
const EMBEDDING_NODE="module_apply_default/MobilenetV1/Logits/global_pool";
export const PHOTO_BACKBONE="MobileNetV1 0.50 / ImageNet";
export type PhotoEpoch={epoch:number;accuracy:number;valAccuracy:number;loss:number;valLoss:number};
export type PhotoReport={
  version:1;projectId:string;owner:string;modelRef:string;backbone:string;
  datasetFingerprint:string;classes:string[];completedEpochs:number;
  samples:{train:number;validation:number;test:number};
  test:{accuracy:number;loss:number};metrics:PhotoEpoch[];
};
export type PhotoProgress={stage:"features"|"training";done:number;total:number;metric?:PhotoEpoch};
export function photoStorageKey(owner:string,projectId:string){
  return "neurolab-photo-transfer-v1:"+JSON.stringify([owner,projectId]);
}
export function validatePhotoDataset(dataset:ImageDataset):void{
  if(!dataset.fingerprint||!/^[a-f0-9]{64}$/.test(dataset.fingerprint))
    throw new Error("Aplica primero un dataset de imágenes validado.");
  if(dataset.classes.length<2||dataset.classes.length>20||dataset.images.length>500)
    throw new Error("Para fotos se permiten entre 2 y 20 clases y hasta 500 imágenes.");
  const all=[...dataset.train,...dataset.validation,...dataset.test];
  if(all.length!==dataset.images.length||new Set(all).size!==all.length||
    all.some(i=>!Number.isInteger(i)||i<0||i>=dataset.images.length))
    throw new Error("Las particiones del dataset no son válidas.");
  const known=new Set(dataset.classes);
  if(dataset.images.some(item=>!known.has(item.label)))
    throw new Error("El dataset contiene etiquetas desconocidas.");
  for(const label of dataset.classes){
    const count=(indices:number[])=>indices.filter(i=>dataset.images[i].label===label).length;
    if(count(dataset.train)<8||count(dataset.validation)<2||count(dataset.test)<2)
      throw new Error("La clase «"+label+"» requiere al menos 8 fotos de entrenamiento, 2 de validación y 2 de prueba. Agrega más imágenes reales y vuelve a aplicar el dataset.");
  }
}
export function readPhotoReport(owner:string,projectId:string):PhotoReport|null{
  try{
    const raw=localStorage.getItem(photoStorageKey(owner,projectId));
    if(!raw)return null;
    const x=JSON.parse(raw) as PhotoReport;
    if(x.version!==1||x.owner!==owner||x.projectId!==projectId||
       !x.modelRef?.startsWith("indexeddb://neurolab-photo-")||
       x.backbone!==PHOTO_BACKBONE||!Array.isArray(x.classes)||
       !Array.isArray(x.metrics)||!Number.isFinite(x.test?.accuracy))return null;
    return x;
  }catch{return null;}
}

let backbonePromise:Promise<tf.GraphModel>|null=null;
async function backbone():Promise<tf.GraphModel>{
  if(!backbonePromise){
    backbonePromise=(async()=>{
      await tf.ready();
      return tf.loadGraphModel(PRETRAINED,{fromTFHub:true});
    })().catch(error=>{backbonePromise=null;throw new Error("No se pudo cargar MobileNet desde su repositorio público. Comprueba que el navegador permita la descarga del modelo y prueba de nuevo. Detalle: "+(error instanceof Error?error.message:"Error de red"));});
  }
  return backbonePromise;
}
async function embed(file:File,net:tf.GraphModel):Promise<Float32Array>{
  const bitmap=await createImageBitmap(file);
  let tensor:tf.Tensor|undefined;
  try{
    const canvas=document.createElement("canvas");
    canvas.width=224;canvas.height=224;
    const context=canvas.getContext("2d");
    if(!context)throw new Error("No se pudo preparar la fotografía.");
    context.fillStyle="#ffffff";context.fillRect(0,0,224,224);
    const ratio=Math.min(224/bitmap.width,224/bitmap.height);
    const width=Math.max(1,Math.round(bitmap.width*ratio)),height=Math.max(1,Math.round(bitmap.height*ratio));
    context.drawImage(bitmap,(224-width)/2,(224-height)/2,width,height);
    tensor=tf.tidy(()=>{
      const input=tf.browser.fromPixels(canvas).toFloat().div(255).expandDims(0);
      return net.execute(input,EMBEDDING_NODE) as tf.Tensor;
    });
    const data=await tensor.data();
    if(data.length<64||data.length>2048)throw new Error("MobileNet devolvió una dimensión inesperada.");
    return Float32Array.from(data);
  }finally{tensor?.dispose();bitmap.close();}
}
function unpack(epoch:number,logs?:tf.Logs):PhotoEpoch{
  const v=logs as Record<string,number>|undefined;
  const point={epoch,accuracy:v?.acc??v?.accuracy,valAccuracy:v?.val_acc??v?.val_accuracy,loss:v?.loss,valLoss:v?.val_loss};
  if([point.accuracy,point.valAccuracy,point.loss,point.valLoss].some(x=>!Number.isFinite(x)))
    throw new Error("No se recibieron métricas válidas de entrenamiento y validación.");
  return point as PhotoEpoch;
}
export async function trainPhotoModel(
  owner:string,projectId:string,dataset:ImageDataset,epochs:number,onProgress:(v:PhotoProgress)=>void,signal?:AbortSignal
):Promise<PhotoReport>{
  validatePhotoDataset(dataset);
  if(!Number.isInteger(epochs)||epochs<1||epochs>40)throw new Error("Selecciona de 1 a 40 épocas.");
  if(signal?.aborted)throw new Error("Entrenamiento cancelado.");
  const net=await backbone();
  const allVectors:Float32Array[]=[];
  for(let i=0;i<dataset.images.length;i++){
    if(signal?.aborted)throw new Error("Entrenamiento cancelado; no se han guardado pesos nuevos.");
    allVectors.push(await embed(dataset.images[i].file,net));
    if(i%3===0||i===dataset.images.length-1){
      onProgress({stage:"features",done:i+1,total:dataset.images.length});
      await tf.nextFrame();
    }
  }
  const dimensions=allVectors[0].length;
  if(allVectors.some(v=>v.length!==dimensions))throw new Error("Las características de MobileNet son incompatibles.");
  const flat=new Float32Array(allVectors.length*dimensions);
  allVectors.forEach((v,i)=>flat.set(v,i*dimensions));
  const classIndices=new Map(dataset.classes.map((label,i)=>[label,i]));
  const owned:tf.Tensor[]=[];
  const keep=<T extends tf.Tensor>(v:T):T=>{owned.push(v);return v;};
  let classifier:tf.Sequential|undefined;
  const best:{weights:tf.Tensor[]|null}={weights:null};
  let stored=false;
  const modelRef="indexeddb://neurolab-photo-"+crypto.randomUUID();
  try{
    const all=keep(tf.tensor2d(flat,[allVectors.length,dimensions]));
    const xs=(indices:number[])=>tf.tidy(()=>keep(tf.gather(all,tf.tensor1d(indices,"int32")) as tf.Tensor2D));
    const ys=(indices:number[])=>tf.tidy(()=>keep(tf.oneHot(tf.tensor1d(indices.map(i=>classIndices.get(dataset.images[i].label)!),"int32"),dataset.classes.length)));
    const xTrain=xs(dataset.train),yTrain=ys(dataset.train);
    const xVal=xs(dataset.validation),yVal=ys(dataset.validation);
    const xTest=xs(dataset.test),yTest=ys(dataset.test);
    classifier=tf.sequential();
    classifier.add(tf.layers.dense({inputShape:[dimensions],units:64,activation:"relu",kernelInitializer:tf.initializers.glorotUniform({seed:123})}));
    classifier.add(tf.layers.dropout({rate:.25}));
    classifier.add(tf.layers.dense({units:dataset.classes.length,activation:"softmax"}));
    classifier.compile({optimizer:tf.train.adam(.0007),loss:"categoricalCrossentropy",metrics:["accuracy"]});
    const metrics:PhotoEpoch[]=[];
    let minimum=Infinity,stale=0;
    await classifier.fit(xTrain,yTrain,{
      epochs,batchSize:16,shuffle:true,validationData:[xVal,yVal],verbose:0,
      callbacks:{onEpochEnd:async(index,logs)=>{
        const point=unpack(index+1,logs);metrics.push(point);
        if(minimum-point.valLoss>.002){
          minimum=point.valLoss;stale=0;
          best.weights?.forEach(w=>w.dispose());
          best.weights=classifier!.getWeights().map(w=>w.clone());
        }else stale++;
        onProgress({stage:"training",done:index+1,total:epochs,metric:point});
        if(stale>=5||signal?.aborted)classifier!.stopTraining=true;
        await tf.nextFrame();
      }},
    });
    if(signal?.aborted)throw new Error("Entrenamiento cancelado; no se guardaron pesos nuevos.");
    if(best.weights){classifier.setWeights(best.weights);best.weights.forEach(w=>w.dispose());best.weights=null;}
    const evaluated=classifier.evaluate(xTest,yTest,{batchSize:16,verbose:0});
    const output=Array.isArray(evaluated)?evaluated:[evaluated];
    const scores=await Promise.all(output.map(async t=>(await t.data())[0]));
    output.forEach(t=>t.dispose());
    if(scores.length!==2||scores.some(v=>!Number.isFinite(v)))throw new Error("La evaluación independiente falló.");
    const report:PhotoReport={version:1,owner,projectId,modelRef,backbone:PHOTO_BACKBONE,
      datasetFingerprint:dataset.fingerprint!,classes:[...dataset.classes],completedEpochs:metrics.length,
      samples:{train:dataset.train.length,validation:dataset.validation.length,test:dataset.test.length},
      metrics,test:{accuracy:scores[1],loss:scores[0]}};
    await classifier.save(modelRef);stored=true;
    try{localStorage.setItem(photoStorageKey(owner,projectId),JSON.stringify(report));}
    catch{throw new Error("El modelo fue entrenado, pero no se pudo persistir su ficha en este navegador. Comprueba que el almacenamiento local esté habilitado.");}
    return report;
  }catch(err){
    if(stored)await tf.io.removeModel(modelRef).catch(()=>undefined);
    throw err;
  }finally{
    best.weights?.forEach(w=>w.dispose());
    owned.forEach(t=>t.dispose());
    classifier?.optimizer?.dispose();classifier?.dispose();
  }
}
export async function predictPhotoModel(report:PhotoReport,file:File){
  if(!report.modelRef.startsWith("indexeddb://neurolab-photo-"))throw new Error("Referencia fotográfica no válida.");
  const net=await backbone();
  const vector=await embed(file,net);
  const classifier=await tf.loadLayersModel(report.modelRef);
  let input:tf.Tensor2D|undefined,output:tf.Tensor|undefined;
  try{
    input=tf.tensor2d(vector,[1,vector.length]);
    output=classifier.predict(input) as tf.Tensor;
    const values=Array.from(await output.data());
    if(values.length!==report.classes.length||values.some(n=>!Number.isFinite(n)))
      throw new Error("El clasificador devolvió un resultado inválido.");
    const ranked=report.classes.map((clase,i)=>({clase,probabilidad:values[i]}))
      .sort((a,b)=>b.probabilidad-a.probabilidad);
    if(ranked[0].probabilidad<.5){
      const err=new Error("El modelo fotográfico no tiene suficiente evidencia para elegir una clase. Amplía tu dataset con fotografías variadas y vuelve a entrenar.");
      err.name="PredictionDomainError";throw err;
    }
    return ranked;
  }finally{output?.dispose();input?.dispose();classifier.dispose();}
}
