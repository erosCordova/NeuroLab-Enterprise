import {test} from "node:test";
import assert from "node:assert/strict";
import {defaultConfig} from "../src/cnn.ts";
import {advanceWithControls,recommendCNN,validateTrainingOptions} from "../src/adaptiveTraining.ts";

function dataset(count=140){
  return {
    name:"ejemplo",seed:42,classes:["A","B"],
    images:Array.from({length:Math.max(count,6)},(_,i)=>({label:i%2?"A":"B"})),
    train:Array.from({length:count},(_,i)=>i),
    validation:[],test:[]
  };
}
function job(earlyStopping){
  return {
    id:"J1",projectId:"P1",name:"Ejemplo",
    config:{...defaultConfig(),earlyStopping,patience:5,minDelta:.01},
    dataset:{name:"ejemplo",count:6,classes:["A","B"],train:2,validation:2,test:2,seed:42},
    versionId:null,epochs:100,batch:32,epoch:0,status:"En cola",metrics:[]
  };
}
test("Propone complejidad moderada según datos de entrenamiento",()=>{
  const small=recommendCNN(dataset(40),defaultConfig());
  const medium=recommendCNN(dataset(140),defaultConfig());
  assert.equal(small.config.layers.length,1);
  assert.deepEqual(medium.config.layers.map(layer=>layer.filters),[8,16]);
  assert.equal(medium.config.dropout,.35);
  assert.equal(medium.config.l2,.001);
});
test("Parada temprana termina antes del máximo y conserva métricas",()=>{
  let jobs=[job(true)];
  for(let i=0;i<102;i++)jobs=advanceWithControls(jobs);
  assert.equal(jobs[0].status,"Completado");
  assert.equal(jobs[0].stoppedEarly,true);
  assert.ok(jobs[0].epoch<100);
  assert.equal(jobs[0].metrics.length,jobs[0].epoch);
});
test("Sin parada temprana alcanza todas las épocas",()=>{
  let jobs=[job(false)];
  for(let i=0;i<102;i++)jobs=advanceWithControls(jobs);
  assert.equal(jobs[0].epoch,100);
  assert.equal(jobs[0].stoppedEarly,false);
});
test("Valida regularización y parámetros de parada",()=>{
  assert.throws(()=>validateTrainingOptions({...defaultConfig(),dropout:1}));
  assert.throws(()=>validateTrainingOptions({...defaultConfig(),l2:-1}));
  assert.throws(()=>validateTrainingOptions({...defaultConfig(),patience:0}));
});
