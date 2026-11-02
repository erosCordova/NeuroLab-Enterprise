import {test} from "node:test";
import assert from "node:assert/strict";
import * as tf from "@tensorflow/tfjs";
import {buildBrowserCNN} from "../src/browserCNN.ts";
import {
  encodeCNNBackup,decodeCNNBackup,validatePortableIdentity,validateBackupHeader,importedCNNReference,
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


test("MNIST grande: respaldo portátil de pesos y métricas válido, con verificación SHA-256",async()=>{
  const digits=Array.from({length:10},(_,i)=>String(i));
  const scenarios=[
    {train:900,validation:100,test:1000,hash:"d567d6cb604019ab474cf35f730970531f6deac146b9cfddb89f34a522299d5a"},
    {train:9000,validation:1000,test:10000,hash:"d64c3c31d16d3ed1e0babc32435e4a833ce6964068e64266981e5c03b4c3da8d"},
    {train:54000,validation:6000,test:10000,hash:"7189635e27d58bddf63a1657cadb0295241c677dc6d940846c82794b61df08b6"},
  ];
  const model=buildBrowserCNN(config,10);
  try{
    for(const scenario of scenarios){
      const meta={...report,classes:digits,parameters:model.countParams(),
        samples:{train:scenario.train,validation:scenario.validation,test:scenario.test},
        dataset_fingerprint:scenario.hash};
      assert.equal(validatePortableIdentity(project,meta),meta);
      let backupFile;
      await model.save(tf.io.withSaveHandler(async artifacts=>{
        backupFile=await encodeCNNBackup(project,meta,artifacts);
        return {modelArtifactsInfo:{dateSaved:new Date(),modelTopologyType:"JSON",
          modelTopologyBytes:0,weightSpecsBytes:0,weightDataBytes:0}};
      }),{includeOptimizer:false});
      const parsed=await decodeCNNBackup(backupFile,project);
      assert.equal(parsed.report.dataset_fingerprint,scenario.hash);
      const loaded=await tf.loadLayersModel({load:async()=>parsed.artifacts});
      try{assert.equal(loaded.countParams(),model.countParams());}finally{loaded.dispose();}
      assert.throws(()=>validatePortableIdentity(project,{...meta,dataset_fingerprint:"f".repeat(64)}),/inconsistentes/);
      assert.throws(()=>validatePortableIdentity(project,{...meta,samples:{...meta.samples,test:meta.samples.test+1}}),/inconsistentes/);
      assert.throws(()=>validatePortableIdentity(project,{...meta,classes:digits.toReversed()}),/inconsistentes/);
    }
  }finally{model.dispose();}
});

test("La ruta de pesos importados nunca comparte identificador con el entrenado aquí",()=>{
 const sha="d".repeat(64),imported=importedCNNReference(project,sha);
 assert.match(imported,/^indexeddb:\/\/neurolab-cnn-CNN-001-imported-/);
 assert.notEqual(imported,report.model_ref);
 assert.equal(importedCNNReference(project,sha),imported);
 assert.notEqual(importedCNNReference(project,"e".repeat(64)),imported);
 assert.notEqual(importedCNNReference("OTRO",sha),imported);
 assert.throws(()=>importedCNNReference(project,"sin-sha"),/identificar/);
});
