import {test} from "node:test";
import assert from "node:assert/strict";
import {isOwnedModelRef,isValidImported,addImportedModel,importedModels,renameImportedModel,forgetImportedModel,renameLocalModel,localModelName,markLocalDeleted,deletedLocalRefs} from "../src/modelCatalog.ts";
const p="CNN-001",h="f".repeat(24);
test("Cada origen tiene referencias independientes y protegidas",()=>{
 const local="indexeddb://neurolab-cnn-CNN-001-160011";
 const imported="indexeddb://neurolab-cnn-CNN-001-imported-"+h;
 const colab="indexeddb://neurolab-cnn-colab-CNN-001-2026";
 assert.equal(isOwnedModelRef(p,local,"local"),true);
 assert.equal(isOwnedModelRef(p,imported,"ncnn"),true);
 assert.equal(isOwnedModelRef(p,colab,"colab"),true);
 assert.equal(isOwnedModelRef(p,local,"ncnn"),false);
 assert.equal(isOwnedModelRef(p,imported,"local"),false);
 assert.equal(isOwnedModelRef("CNN-002",local,"local"),false);
 assert.equal(isOwnedModelRef(p,"indexeddb://unrelated","local"),false);
 assert.equal(isOwnedModelRef(p,colab,"local"),false);
});
test("Una ficha importada no puede apuntar a pesos locales",()=>{
 const ref="indexeddb://neurolab-cnn-CNN-001-imported-"+h;
 const report={model_ref:ref};
 const item={ref,origin:"ncnn",name:"Modelo",createdAt:"2026-11-01",report};
 assert.equal(isValidImported(p,item),true);
 assert.equal(isValidImported(p,{...item,ref:"indexeddb://neurolab-cnn-CNN-001-1"}),false);
 assert.equal(isValidImported(p,{...item,name:""}),false);
});

test("CRUD local: se pueden crear, leer, renombrar y retirar fichas sin tocar otros proyectos",()=>{
 const old=globalThis.localStorage;
 const data=new Map();
 globalThis.localStorage={
  getItem:key=>data.get(key)??null,setItem:(key,v)=>data.set(key,v),
  removeItem:key=>data.delete(key),
 };
 try{
  const project="CNN-003",ref="indexeddb://neurolab-cnn-CNN-003-imported-"+h;
  const item={ref,origin:"ncnn",name:"Importado",createdAt:"2026-11-01",report:{model_ref:ref}};
  assert.equal(addImportedModel(project,item).length,1);
  assert.equal(importedModels(project)[0].name,"Importado");
  assert.equal(renameImportedModel(project,ref," Renombrado ")[0].name,"Renombrado");
  assert.equal(forgetImportedModel(project,ref).length,0);
  const local="indexeddb://neurolab-cnn-CNN-003-local-123";
  renameLocalModel(project,local,"CNN de prueba");
  assert.equal(localModelName(project,local),"CNN de prueba");
  markLocalDeleted(project,local);
  assert.equal(deletedLocalRefs(project).has(local),true);
  assert.equal(deletedLocalRefs("CNN-004").has(local),false);
 }finally{globalThis.localStorage=old;}
});
