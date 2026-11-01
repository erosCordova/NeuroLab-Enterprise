import * as tf from "@tensorflow/tfjs";
import type {Config,ImageDataset,Metric} from "./cnn";
import {summary} from "./cnn.ts";
import {captureNetworkTrace} from "./networkTelemetry.ts";
import type {NetworkTrace} from "./networkTelemetry.ts";
import {assertFashionMnistInput,isFashionMnistClassifier} from "./fashionDomain.ts";

export type BrowserReport={
  training:"real";
  engine:"TensorFlow.js";
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
  weights_file:"model.json";
  model_ref:string;
};
export type BrowserProgress={epoch:number;epochs:number;metric:Metric};
export class TrainingCancelled extends Error {
  constructor(){super("Entrenamiento cancelado: no se guardaron métricas ni un modelo nuevo.");}
}
const safeInt=(value:number,min:number,max:number)=>Number.isInteger(value)&&value>=min&&value<=max;

export function validateBrowserBudget(config:Config,dataset:ImageDataset,epochs:number,batch:number) {
  const architecture=summary(config,dataset.classes.length);
  if(!dataset.fingerprint||!/^([0-9a-f]{64})$/.test(dataset.fingerprint))
    throw new Error("El dataset debe estar aplicado y tener una huella SHA-256.");
  if(dataset.images.length>200||dataset.images.length<6)
    throw new Error("Entrenamiento en navegador: entre 6 y 200 imágenes. Para datasets grandes se requerirá un trabajador externo.");
  if(config.size>32||architecture.total>500_000)
    throw new Error("Límite de navegador: hasta 32×32 píxeles y 500 000 parámetros CNN.");
  if(!safeInt(epochs,1,40)||!safeInt(batch,1,64))
    throw new Error("Límite de navegador: de 1 a 40 épocas y batch de 1 a 64.");
  for(const split of [dataset.train,dataset.validation,dataset.test])
    if(!split.length||new Set(split).size!==split.length)throw new Error("Particiones inválidas.");
  const all=[...dataset.train,...dataset.validation,...dataset.test];
  if(all.length!==dataset.images.length||new Set(all).size!==all.length
    ||all.some(index=>!safeInt(index,0,dataset.images.length-1)))
    throw new Error("Particiones solapadas o incompletas.");
  for(const split of [dataset.train,dataset.validation,dataset.test]){
    const covered=new Set(split.map(index=>dataset.images[index].label));
    if(dataset.classes.some(label=>!covered.has(label)))throw new Error("Cada partición debe contener todas las clases.");
  }
  return architecture;
}

export function buildBrowserCNN(config:Config,classCount:number):tf.Sequential {
  const details=summary(config,classCount);
  const model=tf.sequential();
  const regularizer=config.l2?tf.regularizers.l2({l2:config.l2}):undefined;
  config.layers.forEach((layer,index)=>{
    model.add(tf.layers.conv2d({
      inputShape:index===0?[config.size,config.size,config.channels]:undefined,
      filters:layer.filters,kernelSize:layer.kernel,padding:"same",
      activation:layer.activation,
      kernelInitializer:tf.initializers.glorotUniform({seed:2100+index}),
      kernelRegularizer:regularizer,
    }));
    if(layer.pool)model.add(tf.layers.maxPooling2d({poolSize:[2,2]}));
  });
  model.add(tf.layers.flatten());
  model.add(tf.layers.dense({
    units:config.dense,activation:"relu",
    kernelInitializer:tf.initializers.glorotUniform({seed:2200}),
    kernelRegularizer:regularizer,
  }));
  if(config.dropout)model.add(tf.layers.dropout({rate:config.dropout}));
  const binary=classCount===2;
  model.add(tf.layers.dense({
    units:binary?1:classCount,
    activation:binary?"sigmoid":"softmax",
    kernelInitializer:tf.initializers.glorotUniform({seed:2300}),
  }));
  if(model.countParams()!==details.total){
    model.dispose();
    throw new Error("El número de parámetros de TensorFlow.js no coincide con el diseñador.");
  }
  model.compile({
    optimizer:tf.train.adam(.001),
    loss:binary?"binaryCrossentropy":"categoricalCrossentropy",
    metrics:["accuracy"],
  });
  return model;
}

export async function pixelsOfImage(file:File,config:Config) {
  const bitmap=await createImageBitmap(file);
  try{
    const canvas=document.createElement("canvas");
    canvas.width=config.size;canvas.height=config.size;
    const context=canvas.getContext("2d",{willReadFrequently:true});
    if(!context)throw new Error("No se pudo acceder al lienzo para normalizar las imágenes.");
    context.fillStyle="#ffffff";
    context.fillRect(0,0,config.size,config.size);
    context.drawImage(bitmap,0,0,config.size,config.size);
    const rgba=context.getImageData(0,0,config.size,config.size).data;
    const output=new Float32Array(config.size*config.size*config.channels);
    if(config.channels===1){
      for(let index=0;index<config.size*config.size;index++){
        const offset=index*4;
        output[index]=(rgba[offset]*.299+rgba[offset+1]*.587+rgba[offset+2]*.114)/255;
      }
    }else{
      for(let index=0;index<config.size*config.size;index++){
        const src=index*4,dst=index*3;
        output[dst]=rgba[src]/255;
        output[dst+1]=rgba[src+1]/255;
        output[dst+2]=rgba[src+2]/255;
      }
    }
    return output;
  }finally{bitmap.close();}
}

function metricFromLogs(epoch:number,logs?:tf.Logs):Metric {
  const values=logs as Record<string,number>|undefined;
  const accuracy=values?.acc??values?.accuracy;
  const valAccuracy=values?.val_acc??values?.val_accuracy;
  const loss=values?.loss, valLoss=values?.val_loss;
  if([accuracy,valAccuracy,loss,valLoss].some(value=>typeof value!=="number"||!Number.isFinite(value)))
    throw new Error("TensorFlow.js no devolvió métricas numéricas válidas.");
  return {epoch,accuracy:accuracy!,valAccuracy:valAccuracy!,loss:loss!,valLoss:valLoss!};
}

export async function trainInBrowser(
  projectId:string,dataset:ImageDataset,config:Config,epochs:number,batch:number,
  onProgress:(progress:BrowserProgress)=>void,signal?:AbortSignal,
  onTrace?:(trace:NetworkTrace)=>void,
):Promise<BrowserReport> {
  const architecture=validateBrowserBudget(config,dataset,epochs,batch);
  if(signal?.aborted)throw new TrainingCancelled();
  await tf.ready();
  const name="indexeddb://neurolab-cnn-"+projectId+"-"+crypto.randomUUID();
  const classes=dataset.classes, channels=config.channels;
  const classMap=new Map(classes.map((label,index)=>[label,index]));
  const sampleSize=config.size*config.size*channels;
  const buffer=new Float32Array(dataset.images.length*sampleSize);
  for(let index=0;index<dataset.images.length;index++){
    if(signal?.aborted)throw new TrainingCancelled();
    buffer.set(await pixelsOfImage(dataset.images[index].file,config),index*sampleSize);
    if(index%8===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  let model:tf.Sequential|undefined;
  // Se liberan incluso si fit(), onProgress o la evaluación generan un error.
  const bestWeights:{value:tf.Tensor[]|null}={value:null};
  const tensors:tf.Tensor[]=[];
  const remember=<T extends tf.Tensor>(value:T):T=>{tensors.push(value);return value;};
  try {
    const all=remember(tf.tensor4d(buffer,[dataset.images.length,config.size,config.size,channels]));
    const inputs=(indices:number[])=>remember(tf.gather(all,remember(tf.tensor1d(indices,"int32"))) as tf.Tensor4D);
    const xTrain=inputs(dataset.train),xVal=inputs(dataset.validation),xTest=inputs(dataset.test);
    // Una muestra fija del conjunto de validación; nunca del conjunto de prueba.
    const sample=remember(tf.slice(xVal,[0,0,0,0],[1,config.size,config.size,channels]));
    const label=dataset.images[dataset.validation[0]].label;
    const targets=(indices:number[])=>{
      const labels=indices.map(index=>{
        const label=classMap.get(dataset.images[index].label);
        if(label===undefined)throw new Error("Etiqueta fuera del conjunto de clases.");
        return label;
      });
      if(classes.length===2)return remember(tf.tensor2d(labels.map(value=>value===1?1:0),[labels.length,1],"float32"));
      const ids=remember(tf.tensor1d(labels,"int32"));
      return remember(tf.oneHot(ids,classes.length));
    };
    const yTrain=targets(dataset.train),yVal=targets(dataset.validation),yTest=targets(dataset.test);
    model=buildBrowserCNN(config,classes.length);
    let bestLoss=Infinity,stale=0;
    const metrics:Metric[]=[];
    const history=await model.fit(xTrain,yTrain,{
      batchSize:batch,epochs,shuffle:true,validationData:[xVal,yVal],verbose:0,
      callbacks:{
        onEpochEnd:async(epoch,logs)=>{
          const point=metricFromLogs(epoch+1,logs);
          metrics.push(point);
          if(onTrace){
            try{onTrace(captureNetworkTrace(model!,sample,config,classes,epoch+1,label));}
            catch{/* Un error opcional del visor no debe interrumpir el entrenamiento. */}
          }
          onProgress({epoch:epoch+1,epochs,metric:point});
          if(config.earlyStopping){
            if(bestLoss-point.valLoss>(config.minDelta??.01)){
              bestLoss=point.valLoss;
              bestWeights.value?.forEach(weight=>weight.dispose());
              bestWeights.value=model!.getWeights().map(weight=>weight.clone());
              stale=0;
            }else stale++;
            if(stale>=(config.patience??5))model!.stopTraining=true;
          }
          if(signal?.aborted)model!.stopTraining=true;
          await tf.nextFrame();
        },
      },
    });
    if(signal?.aborted)throw new TrainingCancelled();
    if(!metrics.length||!history.history.loss?.length)throw new Error("El entrenamiento no devolvió épocas.");
    if(bestWeights.value){model.setWeights(bestWeights.value);bestWeights.value.forEach(weight=>weight.dispose());bestWeights.value=null;}
    const evaluated=model.evaluate(xTest,yTest,{batchSize:Math.min(batch,16),verbose:0});
    const outputs=Array.isArray(evaluated)?evaluated:[evaluated];
    const result=outputs.map(item=>item.dataSync()[0]);
    outputs.forEach(item=>item.dispose());
    if(result.length<2||result.some(value=>!Number.isFinite(value)))throw new Error("La evaluación del conjunto de prueba no es válida.");
    await model.save(name);
    // Una cancelación durante IndexedDB no puede dejar un entrenamiento fantasma.
    if(signal?.aborted){
      try{
        await tf.io.removeModel(name);
      }catch{
        throw new Error("El entrenamiento fue cancelado, pero no se pudieron borrar sus pesos locales. Revisa el almacenamiento del navegador.");
      }
      throw new TrainingCancelled();
    }
    return {
      training:"real",engine:"TensorFlow.js",dataset_fingerprint:dataset.fingerprint!,
      classes:[...classes],samples:{
        train:dataset.train.length,validation:dataset.validation.length,test:dataset.test.length,
      },
      config:structuredClone(config),parameters:architecture.total,
      requested_epochs:epochs,completed_epochs:metrics.length,batch,seed:dataset.seed,
      metrics,test:{accuracy:result[1],loss:result[0]},
      weights_file:"model.json",model_ref:name,
    };
  }finally{
    bestWeights.value?.forEach(weight=>weight.dispose());
    tensors.forEach(tensor=>tensor.dispose());
    model?.optimizer?.dispose();
    model?.dispose();
  }
}

export async function predictInBrowser(modelRef:string,file:File,config:Config,classes:string[],autoInvertLightBackground=false) {
  if(!modelRef.startsWith("indexeddb://neurolab-cnn-"))throw new Error("Referencia de modelo inválida.");
  if(isFashionMnistClassifier(classes))await assertFashionMnistInput(file);
  const model=await tf.loadLayersModel(modelRef);
  try {
    const mnistPhoto=autoInvertLightBackground&&config.channels===1&&config.size===28;
    const prepared=mnistPhoto
      ?await (await import("./mnistPreprocess")).preprocessMnistPhotoWithMeta(file):null;
    const pixels=prepared?.pixels??await pixelsOfImage(file,config);
    // Conservar una sola pasada para PNG oficiales derechos de 28×28; aplicar
    // TTA también a imágenes pequeñas si muestran una inclinación marcada.
    const robust=prepared&&(await import("./mnistRobust"));
    const variants=prepared&&robust!.shouldUseMnistRobustInference(prepared.was28,pixels)
      ?robust!.mnistInferenceVariants(pixels)
      :[{pixels,weight:1,kind:"original"}];
    const flattened=new Float32Array(variants.length*pixels.length);
    variants.forEach((variant,index)=>flattened.set(variant.pixels,index*pixels.length));
    const input=tf.tensor4d(flattened,[variants.length,config.size,config.size,config.channels]);
    try{
      const output=model.predict(input) as tf.Tensor;
      try {
        const values=Array.from(await output.data());
        const averaged=classes.map((_,i)=>{
          let score=0;
          const count=classes.length===2?1:classes.length;
          for(let k=0;k<variants.length;k++){
            const value=values[k*count+i];
            score+=variants[k].weight*(classes.length===2?(i===0?1-values[k]:values[k]):value);
          }
          return score;
        });
        if(averaged.some(value=>!Number.isFinite(value)))
          throw new Error("El modelo no devolvió probabilidades válidas.");
        return classes.map((label,index)=>({clase:label,probabilidad:averaged[index]}))
          .sort((left,right)=>right.probabilidad-left.probabilidad);
      }finally{output.dispose();}
    }finally{input.dispose();}
  }finally{model.dispose();}
}
