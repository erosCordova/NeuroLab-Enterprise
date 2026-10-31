import * as tf from "@tensorflow/tfjs";
import type {Config,Metric} from "./cnn.ts";
import {summary} from "./cnn.ts";
import {buildBrowserCNN,TrainingCancelled} from "./browserCNN.ts";
import type {BrowserReport} from "./browserCNN.ts";
import {mnistFingerprint,partitionMnist} from "./mnistDataset.ts";
import type {MnistData} from "./mnistDataset.ts";
import {captureNetworkTrace} from "./networkTelemetry.ts";
import type {NetworkTrace} from "./networkTelemetry.ts";

export type BatchState={epoch:number;epochs:number;batch:number;batches:number;tensorBytes:number};
const safe=(v:number,min:number,max:number)=>Number.isInteger(v)&&v>=min&&v<=max;
type Cfg={size:number;channels:number};
export function makeMnistBatches(
  pixels:Uint8Array,labels:Uint8Array,indices:number[],config:Cfg,batchSize:number,
  signal?:AbortSignal,shuffle=false,
) {
  const size=config.size*config.size*config.channels;
  if(config.size!==28||config.channels!==1)throw new Error("MNIST requiere entrada de 28×28 y un canal.");
  const generator=function*(){
    const selected=[...indices];
    if(shuffle){
      for(let i=selected.length-1;i>0;i--){
        const j=Math.floor(Math.random()*(i+1));
        [selected[i],selected[j]]=[selected[j],selected[i]];
      }
    }
    for(let start=0;start<selected.length;start+=batchSize){
      if(signal?.aborted)throw new TrainingCancelled();
      const take=Math.min(batchSize,selected.length-start);
      const values=new Float32Array(take*size);
      const targets=new Float32Array(take*10);
      for(let row=0;row<take;row++){
        const index=selected[start+row],offset=index*784;
        for(let p=0;p<784;p++)values[row*size+p]=pixels[offset+p]/255;
        targets[row*10+labels[index]]=1;
      }
      yield {xs:tf.tensor4d(values,[take,28,28,1]),ys:tf.tensor2d(targets,[take,10])};
    }
  };
  return tf.data.generator(generator);
}
function unpack(epoch:number,logs?:tf.Logs):Metric {
  const values=logs as Record<string,number>|undefined;
  const accuracy=values?.acc??values?.accuracy;
  const valAccuracy=values?.val_acc??values?.val_accuracy;
  const loss=values?.loss,valLoss=values?.val_loss;
  if([accuracy,valAccuracy,loss,valLoss].some(v=>typeof v!=="number"||!Number.isFinite(v)))
    throw new Error("TensorFlow.js no devolvió métricas MNIST válidas.");
  return {epoch,accuracy:accuracy!,valAccuracy:valAccuracy!,loss:loss!,valLoss:valLoss!};
}
export async function trainMnistInBrowser(
  projectId:string,data:MnistData,config:Config,epochs:number,batchSize:number,
  onEpoch:(epoch:number,total:number,metric:Metric)=>void,
  onBatch:(status:BatchState)=>void,
  signal?:AbortSignal,
  onTrace?:(trace:NetworkTrace)=>void,
):Promise<BrowserReport>{
  if(config.size!==28||config.channels!==1)throw new Error("Configura la CNN a 28×28 píxeles y escala de grises para MNIST.");
  const architecture=summary(config,10);
  if(architecture.total>500000)throw new Error("Reduce la arquitectura a 500 000 parámetros como máximo para entrenar en el navegador.");
  if(!safe(epochs,1,40)||!safe(batchSize,1,64))throw new Error("Épocas de 1 a 40 y batch de 1 a 64.");
  if(signal?.aborted)throw new TrainingCancelled();
  await tf.ready();
  const partitions=partitionMnist(data);
  const steps=Math.ceil(partitions.train.length/batchSize);
  const validationSteps=Math.ceil(partitions.validation.length/batchSize);
  const testSteps=Math.ceil(partitions.test.length/batchSize);
  const name="indexeddb://neurolab-cnn-"+projectId+"-"+crypto.randomUUID();
  const model=buildBrowserCNN(config,10);
  const bestWeights:{value:tf.Tensor[]|null}={value:null};
  let saved=false;
  let bestLoss=Infinity,stale=0;
  const metrics:Metric[]=[];
  let currentEpoch=0,currentBatch=0;
  const train=makeMnistBatches(data.trainPixels,data.trainLabels,partitions.train,config,batchSize,signal,true).repeat();
  const validation=makeMnistBatches(data.trainPixels,data.trainLabels,partitions.validation,config,batchSize,signal).repeat();
  const sampleIndex=partitions.validation[0];
  const samplePixels=new Float32Array(784);
  for(let p=0;p<784;p++)samplePixels[p]=data.trainPixels[sampleIndex*784+p]/255;
  const sample=tf.tensor4d(samplePixels,[1,28,28,1]);
  const sampleLabel=String(data.trainLabels[sampleIndex]);
  try{
    await model.fitDataset(train,{
      epochs,batchesPerEpoch:steps,validationData:validation,validationBatches:validationSteps,verbose:0,yieldEvery:"batch",
      callbacks:{
        onEpochBegin:async()=>{currentBatch=0;currentEpoch++;},
        onBatchEnd:async()=>{
          currentBatch++;
          if(currentBatch===1||currentBatch%20===0||currentBatch===steps){
            onBatch({epoch:currentEpoch,epochs,batch:currentBatch,batches:steps,tensorBytes:tf.memory().numBytes});
            await tf.nextFrame();
          }
          if(signal?.aborted)model.stopTraining=true;
          if(tf.memory().numTensors>500)throw new Error("Se detectó una acumulación anómala de tensores. Entrenamiento detenido por seguridad.");
        },
        onEpochEnd:async(epoch,logs)=>{
          if(signal?.aborted)model.stopTraining=true;
          const point=unpack(epoch+1,logs);
          metrics.push(point);
          if(onTrace){
            try{onTrace(captureNetworkTrace(model,sample,config,Array.from({length:10},(_,i)=>String(i)),epoch+1,sampleLabel));}
            catch{/* La medición opcional no modifica el entrenamiento. */}
          }
          onEpoch(epoch+1,epochs,point);
          if(config.earlyStopping){
            if(bestLoss-point.valLoss>(config.minDelta??.01)){
              bestLoss=point.valLoss;
              bestWeights.value?.forEach(w=>w.dispose());
              bestWeights.value=model.getWeights().map(w=>w.clone());
              stale=0;
            }else stale++;
            if(stale>=(config.patience??5))model.stopTraining=true;
          }
          await tf.nextFrame();
        },
      },
    });
    if(signal?.aborted)throw new TrainingCancelled();
    if(!metrics.length)throw new Error("El entrenamiento MNIST no registró épocas.");
    if(bestWeights.value){model.setWeights(bestWeights.value);bestWeights.value.forEach(w=>w.dispose());bestWeights.value=null;}
    const test=makeMnistBatches(data.testPixels,data.testLabels,partitions.test,config,batchSize,signal);
    const out=await model.evaluateDataset(test,{batches:testSteps,verbose:0});
    const outputs=Array.isArray(out)?out:[out];
    const scores=await Promise.all(outputs.map(async t=>(await t.data())[0]));
    outputs.forEach(t=>t.dispose());
    if(scores.length<2||scores.some(v=>!Number.isFinite(v)))throw new Error("La evaluación MNIST no produjo resultados válidos.");
    if(signal?.aborted)throw new TrainingCancelled();
    await model.save(name);
    saved=true;
    if(signal?.aborted)throw new TrainingCancelled();
    return {
      training:"real",engine:"TensorFlow.js",
      dataset_fingerprint:await mnistFingerprint(data.source,data.limit),
      classes:Array.from({length:10},(_,i)=>String(i)),
      samples:{train:partitions.train.length,validation:partitions.validation.length,test:partitions.test.length},
      config:structuredClone(config),parameters:architecture.total,
      requested_epochs:epochs,completed_epochs:metrics.length,batch:batchSize,seed:42,
      metrics,test:{accuracy:scores[1],loss:scores[0]},weights_file:"model.json",model_ref:name,
    };
  }catch(err){
    if(saved)await tf.io.removeModel(name).catch(()=>undefined);
    throw err;
  }finally{
    sample.dispose();
    bestWeights.value?.forEach(w=>w.dispose());
    model.optimizer?.dispose();
    model.dispose();
  }
}
