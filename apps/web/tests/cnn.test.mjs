import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultConfig,summary,partition } from "../src/cnn.ts";

test("CNN: calcula dimensiones, Flatten y parámetros multiclase",()=>{
  const result=summary(defaultConfig(),10);
  assert.equal(result.blocks[0].spatial,14);
  assert.equal(result.blocks[1].spatial,7);
  assert.equal(result.flattened,1568);
  assert.equal(result.total,105866);
  assert.equal(result.output,10);
  assert.equal(result.activation,"softmax");
});

test("CNN: salida binaria coherente",()=>{
  const result=summary(defaultConfig(),2);
  assert.equal(result.total,105281);
  assert.equal(result.output,1);
  assert.equal(result.activation,"sigmoid");
  assert.equal(result.loss,"binary_crossentropy");
});

test("CNN: rechaza filtros, kernels y tamaño inválidos",()=>{
  const config=defaultConfig();
  assert.throws(()=>summary({...config,size:0},2));
  assert.throws(()=>summary({...config,layers:[]},2));
  assert.throws(()=>summary({...config,layers:[{...config.layers[0],filters:0}]},2));
  assert.throws(()=>summary({...config,layers:[{...config.layers[0],kernel:7}]},2));
});

test("Imágenes: separación estratificada y reproducible",()=>{
  const labels=Array.from({length:60},(_,index)=>index%2?"gato":"perro");
  const first=partition(labels,70,15,42);
  const second=partition(labels,70,15,42);
  assert.deepEqual(first,second);
  assert.deepEqual([first.train.length,first.validation.length,first.test.length],[42,8,10]);
  const all=[...first.train,...first.validation,...first.test];
  assert.equal(all.length,60);
  assert.equal(new Set(all).size,60);
});

test("Imágenes: requiere varias clases y suficientes ejemplos",()=>{
  assert.throws(()=>partition(["A","A","A"],70,15,42));
  assert.throws(()=>partition(["A","A","B","B"],70,15,42));
  assert.throws(()=>partition(["A","A","A","B","B","B"],90,15,42));
});
