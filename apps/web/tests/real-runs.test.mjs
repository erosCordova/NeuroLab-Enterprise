import test from "node:test";
import assert from "node:assert/strict";
import {prepareRealReport} from "../src/realRuns.ts";

function report() {
  return {
    training:"real",engine:"TensorFlow/Keras",
    dataset_fingerprint:"a".repeat(64),
    classes:["cero","uno"],
    samples:{train:8,validation:2,test:2},
    config:{size:28,channels:1,dense:8,layers:[{filters:4,kernel:3,pool:true,activation:"relu"}]},
    parameters:6329,requested_epochs:2,completed_epochs:2,batch:4,seed:42,
    metrics:[
      {epoch:1,accuracy:.5,valAccuracy:.5,loss:.9,valLoss:.8},
      {epoch:2,accuracy:.8,valAccuracy:.6,loss:.4,valLoss:.5},
    ],
    test:{accuracy:.6,loss:.5},weights_file:"model.keras",
  };
}

test("acepta estructura de informe CNN real importable",()=>{
  const value=report();
  assert.equal(prepareRealReport(value),value);
});
test("rechaza métricas simuladas y manifiestos sin pesos declarados",()=>{
  assert.throws(()=>prepareRealReport({...report(),training:"simulated"}),/CNN real/);
  assert.throws(()=>prepareRealReport({...report(),weights_file:"model.bin"}),/CNN real/);
});
test("rechaza épocas o huella inconsistente",()=>{
  assert.throws(()=>prepareRealReport({...report(),completed_epochs:3}),/épocas/);
  assert.throws(()=>prepareRealReport({...report(),dataset_fingerprint:"falso"}),/huella/);
});

test("recupera el JSON de TensorFlow.js y distingue metadatos de pesos",()=>{
  const value={
    ...report(),engine:"TensorFlow.js",weights_file:"model.json",
    model_ref:"indexeddb://neurolab-cnn-proyecto-123",
  };
  assert.equal(prepareRealReport(value),value);
  assert.throws(()=>prepareRealReport({...value,model_ref:"https://externo.example/pesos.bin"}),/CNN real/);
  assert.throws(()=>prepareRealReport({...value,weights_file:"model.keras"}),/CNN real/);
});
