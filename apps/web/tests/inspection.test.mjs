import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectDataset,filterDataset } from "../src/inspection.ts";

function fixture() {
  return {
    name:"ejemplo",classes:["A","B"],seed:42,
    images:Array.from({length:6},(_,index)=>({
      file:{name:`imagen_${index}.png`,size:10},
      label:index<3?"A":"B",width:28,height:28
    })),
    train:[0,3],validation:[1,4],test:[2,5]
  };
}

test("Inspección: calcula conteos, bytes y dimensiones",()=>{
  const stats=inspectDataset(fixture());
  assert.equal(stats.bytes,60);
  assert.deepEqual(stats.dimensions,["28 × 28"]);
  assert.deepEqual(stats.classes.map(row=>[row.total,row.train,row.validation,row.test]),[[3,1,1,1],[3,1,1,1]]);
});

test("Inspección: rechaza índices duplicados y registros sin asignar",()=>{
  const data=fixture();
  assert.throws(()=>inspectDataset({...data,test:[1,5]}));
  assert.throws(()=>inspectDataset({...data,test:[5]}));
  assert.throws(()=>inspectDataset({...data,test:[2,999]}));
});

test("Filtros: combina nombre, clase y partición",()=>{
  const data=fixture();
  assert.equal(filterDataset(data,{query:"",label:"A",split:"test"}).length,1);
  assert.equal(filterDataset(data,{query:"IMAGEN_0",label:"",split:"all"})[0].index,0);
  assert.equal(filterDataset(data,{query:"no existe",label:"",split:"all"}).length,0);
});

test("Filtrar no modifica el dataset ni sus particiones",()=>{
  const data=fixture();
  const before=structuredClone(data);
  filterDataset(data,{query:"imagen",label:"B",split:"train"});
  assert.deepEqual(data,before);
});
