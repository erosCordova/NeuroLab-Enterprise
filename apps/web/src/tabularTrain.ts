import * as tf from "@tensorflow/tfjs";
import {profileTable} from "./tabular.ts";
import type {TabularDataset} from "./tabular.ts";

export type TabularMetric={epoch:number;loss:number;valLoss:number;accuracy?:number;valAccuracy?:number};
export type TabularResult={
  modelRef:string;epochs:number;trainRows:number;validationRows:number;testRows:number;
  metricName:string;testMetric:number;history:TabularMetric[];sample:{actual:string;predicted:string};
  activation:string;task:string;classes:string[];
};

function shuffleIndices(n:number,seed=42){
  const idx=Array.from({length:n},(_,i)=>i);
  let state=seed>>>0;
  for(let i=n-1;i>0;i--){state=(Math.imul(1664525,state)+1013904223)>>>0;
    const j=Math.floor(state/4294967296*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]];}
  return idx;
}
export async function trainTabular(data:TabularDataset,epochs:number,batch:number,
  onEpoch:(metric:TabularMetric)=>void,signal?:AbortSignal):Promise<TabularResult>{
  const plan=profileTable(data);
  if(!Number.isInteger(epochs)||epochs<1||epochs>80||!Number.isInteger(batch)||batch<4||batch>256)
    throw new Error("Configura de 1 a 80 épocas y un lote entre 4 y 256.");
  await tf.ready();
  const targetIndex=data.headers.indexOf(data.target);
  const valid=data.rows.filter(row=>row[targetIndex]!==""&&
    (plan.task!=="regression"||Number.isFinite(Number(row[targetIndex]))));
  if(valid.length<25)throw new Error("Para entrenar necesitas al menos 25 filas válidas.");
  const shuffled=shuffleIndices(valid.length);
  const trainSize=Math.floor(valid.length*.8);
  const validSize=Math.max(2,Math.floor(valid.length*.1));
  const subsets=[shuffled.slice(0,trainSize),shuffled.slice(trainSize,trainSize+validSize),shuffled.slice(trainSize+validSize)];
  if(subsets.some(arr=>arr.length<2))throw new Error("No hay suficientes datos para las tres particiones.");
  // Las transformaciones se aprenden solo sobre entrenamiento; validación y prueba no contaminan el ajuste.
  const numeric=plan.numeric.map(name=>{
    const idx=data.headers.indexOf(name);
    const vals=subsets[0].map(i=>Number(valid[i][idx])).filter(Number.isFinite);
    const mean=vals.reduce((a,b)=>a+b,0)/Math.max(1,vals.length);
    const variance=vals.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,vals.length);
    return {idx,mean,std:Math.max(Math.sqrt(variance),1e-6)};
  });
  const categories=plan.categorical.map(name=>{
    const idx=data.headers.indexOf(name),counts=new Map<string,number>();
    for(const i of subsets[0]){const value=valid[i][idx];if(value)counts.set(value,(counts.get(value)||0)+1);}
    return {idx,allowed:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,18).map(([value])=>value)};
  });
  const columns=numeric.length+categories.reduce((sum,category)=>sum+category.allowed.length+1,0);
  if(columns>256)throw new Error("Demasiadas características. Reduce columnas categóricas.");
  const features=(indices:number[])=>
    indices.map(i=>{
      const row=valid[i],vec:number[]=[];
      for(const c of numeric){const value=Number(row[c.idx]);vec.push(Number.isFinite(value)?Math.max(-10,Math.min(10,(value-c.mean)/c.std)):0);}
      for(const c of categories){const pos=c.allowed.indexOf(row[c.idx]);for(let j=0;j<=c.allowed.length;j++)vec.push(j===(pos<0?c.allowed.length:pos)?1:0);}
      return vec;
    });
  const labelIndex=(value:string)=>plan.classes.indexOf(value);
  const labels=(indices:number[])=>
    indices.map(i=>{
      const val=valid[i][targetIndex];
      if(plan.task==="regression")return [Number(val)];
      const label=labelIndex(val);
      if(label<0)throw new Error("Clase no reconocida.");
      if(plan.task==="binary")return [label];
      return plan.classes.map((_,j)=>j===label?1:0);
    });
  const xs=subsets.map(ids=>tf.tensor2d(features(ids),[ids.length,columns]));
  const ys=subsets.map(ids=>tf.tensor2d(labels(ids),[ids.length,plan.task==="multiclass"?plan.classes.length:1]));
  const model=tf.sequential();
  try{
    model.add(tf.layers.dense({units:Math.min(64,Math.max(12,columns*2)),inputShape:[columns],activation:"relu"}));
    model.add(tf.layers.dense({units:Math.min(32,Math.max(8,columns)),activation:"relu"}));
    model.add(tf.layers.dense({units:plan.task==="multiclass"?plan.classes.length:1,activation:plan.activation}));
    model.compile({optimizer:tf.train.adam(.001),loss:plan.loss,
      metrics:plan.task==="regression"?["mae"]:["accuracy"]});
    const history:TabularMetric[]=[];
    await model.fit(xs[0],ys[0],{
      epochs,batchSize:Math.min(batch,subsets[0].length),validationData:[xs[1],ys[1]],
      shuffle:true,
      callbacks:{
        onBatchEnd:async()=>{if(signal?.aborted)model.stopTraining=true;},
        onEpochEnd:async(epoch,logs)=>{
          if(signal?.aborted){model.stopTraining=true;return;}
          const m:TabularMetric={epoch:epoch+1,loss:Number(logs?.loss),valLoss:Number(logs?.val_loss),
            accuracy:plan.task==="regression"?undefined:Number(logs?.acc??logs?.accuracy),
            valAccuracy:plan.task==="regression"?undefined:Number(logs?.val_acc??logs?.val_accuracy)};
          history.push(m);onEpoch(m);
          if(history.length>=8&&history.slice(-5).every(point=>point.valLoss>=Math.min(...history.slice(0,-5).map(p=>p.valLoss))))
            model.stopTraining=true;
        }
      }
    });
    if(signal?.aborted)throw new Error("Entrenamiento cancelado.");
    const evalTensor=model.evaluate(xs[2],ys[2]) as tf.Scalar[];
    const testMetric=Number((await evalTensor[1].data())[0]);
    evalTensor.forEach(t=>t.dispose());
    const predicted=model.predict(xs[2].slice([0,0],[1,columns])) as tf.Tensor;
    const probabilities=Array.from(await predicted.data());predicted.dispose();
    const predictedValue=plan.task==="regression"?probabilities[0].toFixed(3):
      plan.task==="binary"?plan.classes[probabilities[0]>=.5?1:0]:
      plan.classes[probabilities.indexOf(Math.max(...probabilities))];
    const id="indexeddb://neurolab-tabular-"+Date.now()+"-"+Math.random().toString(36).slice(2);
    await model.save(id);
    return {modelRef:id,epochs:history.length,trainRows:subsets[0].length,
      validationRows:subsets[1].length,testRows:subsets[2].length,
      metricName:plan.task==="regression"?"MAE":"Precisión",
      testMetric,history,activation:plan.activation,task:plan.task,classes:plan.classes,
      sample:{actual:valid[subsets[2][0]][targetIndex],predicted:predictedValue}};
  }finally{
    xs.forEach(t=>t.dispose());ys.forEach(t=>t.dispose());model.dispose();
  }
}
