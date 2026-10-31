import {test} from "node:test";
import assert from "node:assert/strict";
import * as tf from "@tensorflow/tfjs";
import {buildBrowserCNN} from "../src/browserCNN.ts";
import {
  encodeCNNBackup,decodeCNNBackup,validatePortableIdentity,validateBackupHeader,
} from "../src/modelBackup.ts";

const config={
  size:28,channels:1,dense:8,
  layers:[{id:"conv-1",filters:4,kernel:3,pool:true,activation:"relu"}],
  dropout:0.1,l2:0.001,earlyStopping:true,patience:2,minDelta:0,
};
const project="CNN-001";
const report={
  training:"real",engine:"TensorFlow.js",weights_file:"model.json",
  model_ref:"indexeddb://neurolab-cnn-CNN-001-"+crypto.randomUUID(),
  dataset_fingerprint:"a".repeat(64),classes:["cero","uno"],
  samples:{train:8,validation:2,test:2},config,
  parameters:0,requested_epochs:2,completed_epochs:2,batch:4,seed:42,
  metrics:[
    {epoch:1,accuracy:.5,valAccuracy:.5,loss:.8,valLoss:.8},
    {epoch:2,accuracy:.6,valAccuracy:.5,loss:.7,valLoss:.75},
  ],
  test:{accuracy:.5,loss:.75},
};

test("el respaldo .ncnn conserva parámetros, pesos y métricas con SHA-256",async()=>{
  const model=buildBrowserCNN(config,2);
  const metadata={...report,parameters:model.countParams()};
  try{
    let blob;
    await model.save(tf.io.withSaveHandler(async artifacts=>{
      blob=await encodeCNNBackup(project,metadata,artifacts);
      return {modelArtifactsInfo:{
        dateSaved:new Date(),modelTopologyType:"JSON",
        modelTopologyBytes:JSON.stringify(artifacts.modelTopology).length,
        weightSpecsBytes:JSON.stringify(artifacts.weightSpecs).length,
        weightDataBytes:artifacts.weightData?.byteLength??0,
      }};
    }),{includeOptimizer:false});
    assert.ok(blob instanceof Blob);
    const buffer=Buffer.from(await blob.arrayBuffer());
    assert.equal(buffer.subarray(0,8).toString("utf8"),"NLCNN001");
    const parsed=await decodeCNNBackup(blob,project);
    assert.deepEqual(parsed.report,metadata);
    const reloaded=await tf.loadLayersModel({load:async()=>parsed.artifacts});
    try{assert.equal(reloaded.countParams(),model.countParams());}
    finally{reloaded.dispose();}

    const changed=Buffer.from(buffer);
    changed[changed.length-1]^=1;
    await assert.rejects(()=>decodeCNNBackup(new Blob([changed]),project),/pesos han sido modificados/);
    await assert.rejects(()=>decodeCNNBackup(blob,"proyecto-ajeno"),/este proyecto/);
  }finally{model.dispose();}
});

test("el respaldo rechaza informes incongruentes, arquitectura ajena y pesos gigantes",()=>{
  const valid={...report,parameters:6329};
  assert.throws(()=>validatePortableIdentity("OTRO",valid),/este proyecto/);
  assert.throws(()=>validatePortableIdentity(project,{...valid,parameters:1}),/inconsistentes/);
  assert.throws(()=>validateBackupHeader({format:"neurolab-portable-cnn",version:1,project_id:project},project),/no es un respaldo/);
});
