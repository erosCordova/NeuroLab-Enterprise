import test from "node:test";
import assert from "node:assert/strict";
import {compareRealRuns,comparisonRealCSV,epochsRealCSV} from "../src/realComparison.ts";
function row(id,overrides={}){
 return {
  id,project_id:"proj",engine:"TensorFlow.js",source:"navegador",
  dataset_fingerprint:"a".repeat(64),classes:["cero","uno"],
  samples:{train:8,validation:2,test:2},seed:42,
  config:{size:28,channels:1,dense:8,layers:[{filters:4,kernel:3,pool:true,activation:"relu"}]},
  parameters:6329,requested_epochs:2,completed_epochs:2,
  batch:4,metrics:[
   {epoch:1,accuracy:.5,valAccuracy:.5,loss:.9,valLoss:.8},
   {epoch:2,accuracy:.75,valAccuracy:.5,loss:.6,valLoss:.7},
  ],
  test:{accuracy:.6,loss:.7},imported_at:"2026-10-29T03:00:00Z",
  ...overrides,
 };
}
test("compara hasta tres resultados reales y solo destaca métricas declaradas con condiciones compatibles",()=>{
 const a=row("a"),b=row("b",{test:{accuracy:.8,loss:.5}});
 const comparison=compareRealRuns([a,b]);
 assert.equal(comparison.simulated,false);
 assert.equal(comparison.server_verified,false);
 assert.equal(comparison.comparable_conditions,true);
 assert.equal(comparison.highest_reported_test_accuracy_id,"b");
 assert.match(comparison.report_warning,/no certificados/);
 assert.deepEqual(comparison.rows.map(r=>r.test_accuracy),[.6,.8]);
});
test("no atribuye ganador si motor, huella, clases, partición o semilla difieren",()=>{
 const a=row("a");
 for(const patch of [
  {dataset_fingerprint:"b".repeat(64)}, {classes:["cero","dos"]},
  {samples:{train:9,validation:2,test:2}}, {seed:43},
  {engine:"TensorFlow/Keras"}, {config:{...a.config,channels:3}},
 ]){
  const result=compareRealRuns([a,row("b",patch)]);
  assert.equal(result.comparable_conditions,false);
  assert.equal(result.highest_reported_test_accuracy_id,null);
  assert.ok(result.differences.length>0);
 }
});
test("rechaza duplicados y selecciones fuera del límite",()=>{
 assert.throws(()=>compareRealRuns([row("a")]),/dos o tres/);
 assert.throws(()=>compareRealRuns([row("a"),row("a")]),/diferentes/);
 assert.throws(()=>compareRealRuns([row("a"),row("b"),row("c"),row("d")]),/dos o tres/);
});
test("exporta CSV y métricas sin pesos, simulaciones ni fórmulas ejecutables",()=>{
 const report=compareRealRuns([row("a"),row("b",{classes:["=CMD","uno"]})]);
 const csv=comparisonRealCSV(report);
 assert.match(csv,/certificado_servidor/);
 assert.match(csv,/FALSE|false/);
 assert.match(csv,/formulas|declarados|no certificados/);
 assert.ok(!csv.includes('"=CMD'));
 assert.ok(csv.includes("'=CMD"));
 const epochs=epochsRealCSV(row("a"));
 assert.equal(epochs.split("\r\n").filter(Boolean).length,3);
 assert.match(epochs,/precision_validacion/);
});
