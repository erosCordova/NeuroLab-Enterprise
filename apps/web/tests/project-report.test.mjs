import test from "node:test";
import assert from "node:assert/strict";
import {buildProjectReport,reportCSV,reportJSON} from "../src/projectReport.ts";
const row=(id,change={})=>({
 id,imported_at:"2026-10-29T20:00:00Z",engine:"TensorFlow.js",
 dataset_fingerprint:"a".repeat(64),classes:["cero","uno"],samples:{train:8,validation:2,test:2},
 completed_epochs:1,parameters:6329,metrics:[{epoch:1,accuracy:.7,valAccuracy:.6,loss:.5,valLoss:.7}],
 test:{accuracy:.6,loss:.6},model_ref:"indexeddb://secreto",...change
});
const model=(id,change={})=>({id,display_name:"Modelo",status:"Registrado",favorite:false,notes:"Prueba",model_ref:"indexeddb://pesos",...change});
test("agregados de resultados reales declarados no certificados",()=>{
 const report=buildProjectReport("Proyecto CNN",[
  row("a"),row("b",{engine:"TensorFlow/Keras",test:{accuracy:.9,loss:.3},dataset_fingerprint:"b".repeat(64)})],
  [model("m1"),model("m2",{status:"Archivado",favorite:true})]);
 assert.equal(report.simulated,false);assert.equal(report.server_verified,false);
 assert.deepEqual(report.totals,{runs:2,browser:1,keras:1,models:2,active:1,archived:1,favorites:1,datasets:2});
 assert.equal(report.highest_reported.id,"b");assert.equal(report.coverage.exhaustive,true);
 assert.ok(!reportJSON(report).includes("indexeddb://"));
});
test("sin datos no inventa métricas",()=>{
 const report=buildProjectReport("Vacío",[],[]);
 assert.equal(report.totals.runs,0);assert.equal(report.highest_reported,null);
 assert.equal(report.latest,null);
 assert.equal(reportCSV(report).split("\r\n").filter(Boolean).length,1);
});
test("resalta ventana parcial y neutraliza fórmulas CSV",()=>{
 const report=buildProjectReport("=INYECCION",Array.from({length:50},(_,i)=>row(String(i))),[]);
 assert.equal(report.coverage.exhaustive,false);
 const csv=reportCSV(report);assert.ok(csv.includes("'=INYECCION"));
 assert.ok(!csv.includes('"=INYECCION"'));assert.ok(!csv.includes("indexeddb://"));
});
