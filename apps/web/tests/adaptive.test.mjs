import {test} from "node:test";
import assert from "node:assert/strict";
import {defaultConfig} from "../src/cnn.ts";
import {recommendCNN,validateTrainingOptions} from "../src/adaptiveTraining.ts";

function dataset(count=140){
  return {
    name:"ejemplo",seed:42,classes:["A","B"],
    images:Array.from({length:Math.max(count,6)},(_,i)=>({label:i%2?"A":"B"})),
    train:Array.from({length:count},(_,i)=>i),
    validation:[],test:[]
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
test("Valida regularización y parámetros de parada",()=>{
  assert.throws(()=>validateTrainingOptions({...defaultConfig(),dropout:1}));
  assert.throws(()=>validateTrainingOptions({...defaultConfig(),l2:-1}));
  assert.throws(()=>validateTrainingOptions({...defaultConfig(),patience:0}));
});
