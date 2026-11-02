import {test} from "node:test";
import assert from "node:assert/strict";
import * as tf from "@tensorflow/tfjs";
import {buildBrowserCNN} from "../src/browserCNN.ts";
import {captureNetworkTrace,summarizeLayer,activationMaps} from "../src/networkTelemetry.ts";

test("Las activaciones convolucionales se calculan por canal y no como neuronas ficticias",()=>{
  const summary=summarizeLayer(new Float32Array([1,3,5,7,9,11,13,15]),[1,2,2,2],"channels");
  assert.deepEqual(summary.preview,[7,9]);
  assert.equal(summary.units,2);
  assert.equal(summary.magnitude,8);
});
test("Flatten visualiza promedios de grupos, no conexiones inexistentes",()=>{
  const result=summarizeLayer(new Float32Array([1,2,3,4,5,6]),[1,6],"groups",3);
  assert.deepEqual(result.preview,[1.5,3.5,5.5]);
  assert.equal(result.units,6);
});
test("TensorFlow.js inspecciona capas reales, no altera los pesos ni filtra tensores",async()=>{
  await tf.ready();
  const config={size:28,channels:1,dense:8,dropout:.1,
    layers:[{id:"one",filters:3,kernel:3,pool:true,activation:"relu"},
      {id:"two",filters:4,kernel:3,pool:true,activation:"relu"}]};
  const model=buildBrowserCNN(config,10);
  const input=tf.zeros([1,28,28,1]);
  const beforeCount=tf.memory().numTensors;
  const before=model.getWeights().map(w=>Array.from(w.dataSync()));
  try{
    const classes=Array.from({length:10},(_,i)=>String(i));
    const sample=captureNetworkTrace(model,input,config,classes,2,"7");
    assert.equal(sample.epoch,2);assert.equal(sample.sampleLabel,"7");
    assert.deepEqual(sample.layers.map(layer=>layer.key),[
      "input","conv-1","pool-1","conv-2","pool-2","flatten","dense","dropout","output"
    ]);
    assert.deepEqual(sample.layers.slice(0,3).map(layer=>layer.shape),[
      "28 × 28 × 1","28 × 28 × 3","14 × 14 × 3"
    ]);
    assert.equal(sample.pixels.length,196);
    assert.equal(sample.layers.at(-1).preview.length,10);
    assert.ok(Math.abs(sample.layers.at(-1).preview.reduce((sum,v)=>sum+v,0)-1)<.0001);
    assert.deepEqual(model.getWeights().map(w=>Array.from(w.dataSync())),before);
    for(let i=0;i<4;i++)captureNetworkTrace(model,input,config,classes,i+1,"7");
    assert.equal(tf.memory().numTensors,beforeCount);
  }finally{input.dispose();model.optimizer?.dispose();model.dispose();}
});

test("Mapas reales 8x8 mantienen canales, dimensiones y normalización",()=>{
 const values=new Float32Array(1*8*8*3);
 for(let y=0;y<8;y++)for(let x=0;x<8;x++){
  const i=(y*8+x)*3;
  values[i]=x/7;values[i+1]=y/7;values[i+2]=(x+y)/14;
 }
 const maps=activationMaps(values,[1,8,8,3]);
 assert.equal(maps.length,3);
 assert.equal(maps[0].length,64);
 assert.ok(maps.every(map=>map.every(v=>v>=0&&v<=1)));
 assert.equal(maps[0][0],0);
 assert.equal(maps[0][7],1);
});
