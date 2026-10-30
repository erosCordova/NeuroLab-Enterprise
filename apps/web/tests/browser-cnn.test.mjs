import {test} from "node:test";
import assert from "node:assert/strict";
import * as tf from "@tensorflow/tfjs";
import {buildBrowserCNN,validateBrowserBudget} from "../src/browserCNN.ts";
import {summary} from "../src/cnn.ts";

const config={
  size:28,channels:1,dense:8,
  layers:[{id:"conv-1",filters:4,kernel:3,pool:true,activation:"relu"}],
  dropout:.1,l2:.001,earlyStopping:true,patience:2,minDelta:0,
};

test("TensorFlow.js crea una CNN real binaria con el número correcto de parámetros",async()=>{
  await tf.ready();
  const model=buildBrowserCNN(config,2);
  try{
    assert.equal(model.countParams(),summary(config,2).total);
    assert.equal(model.layers[0].getClassName(),"Conv2D");
    const input=tf.randomUniform([4,28,28,1]);
    const targets=tf.tensor2d([[0],[1],[0],[1]]);
    try{
      const history=await model.fit(input,targets,{epochs:1,batchSize:2,validationSplit:.25,verbose:0});
      assert.equal(history.history.loss.length,1);
      assert.ok(Number.isFinite(Number(history.history.loss[0])));
      const result=model.predict(input) ;
      assert.ok(!Array.isArray(result));
      assert.deepEqual(result.shape,[4,1]);
      result.dispose();
    }finally{input.dispose();targets.dispose();}
  }finally{model.dispose();}
});
test("TensorFlow.js construye clasificación multiclase con softmax",async()=>{
  const model=buildBrowserCNN(config,3);
  try{
    assert.equal(model.countParams(),summary(config,3).total);
    const batch=tf.randomUniform([3,28,28,1]);
    const labels=tf.oneHot(tf.tensor1d([0,1,2],"int32"),3);
    try{
      const history=await model.fit(batch,labels,{epochs:1,batchSize:3,verbose:0});
      assert.equal(history.history.loss.length,1);
      const predicted=model.predict(batch);
      assert.ok(!Array.isArray(predicted));
      assert.deepEqual(predicted.shape,[3,3]);
      predicted.dispose();
    }finally{batch.dispose();labels.dispose();}
  }finally{model.dispose();}
});
test("restringe el uso del navegador sin alterar límites de la CNN Python",()=>{
  const dataset={
    name:"test",fingerprint:"a".repeat(64),seed:42,classes:["cero","uno"],
    images:Array.from({length:6},(_,index)=>({label:index<3?"cero":"uno"})),
    train:[0,3],validation:[1,4],test:[2,5],
  };
  assert.equal(validateBrowserBudget(config,dataset,4,2).total,summary(config,2).total);
  assert.throws(()=>validateBrowserBudget(config,{...dataset,fingerprint:"sin-sha"},4,2),/huella/);
  assert.throws(()=>validateBrowserBudget(config,{...dataset,test:[0,5]},4,2),/solapadas/);
  assert.throws(()=>validateBrowserBudget({...config,size:64},dataset,4,2),/32×32/);
  assert.throws(()=>validateBrowserBudget(config,dataset,41,2),/40 épocas/);
});
