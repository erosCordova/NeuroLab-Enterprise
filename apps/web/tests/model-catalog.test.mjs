import {test} from "node:test";
import assert from "node:assert/strict";
import {isOwnedModelRef,isValidImported} from "../src/modelCatalog.ts";
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
