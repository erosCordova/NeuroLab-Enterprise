import {test} from "node:test";
import assert from "node:assert/strict";
import {parseTable,inferTask,profileTable} from "../src/tabular.ts";

function csv(targetName,values,delimiter=","){
  const lines=["edad"+delimiter+"region"+delimiter+targetName];
  for(let i=0;i<values.length;i++)lines.push([String(25+i%45),i%2?"Norte":"Sur",String(values[i])].join(delimiter));
  return lines.join("\n");
}
test("Detecta clasificación binaria, sigmoid y binaryCrossentropy",()=>{
  const d=parseTable(csv("churn",Array.from({length:80},(_,i)=>i%2)),"clientes.csv");
  const plan=profileTable(d);
  assert.equal(d.target,"churn");assert.equal(d.task,"binary");
  assert.equal(plan.activation,"sigmoid");
  assert.equal(plan.loss,"binaryCrossentropy");
  assert.equal(plan.classes.length,2);
  assert.equal(plan.numeric[0],"edad");
  assert.equal(plan.categorical[0],"region");
});
test("Detecta multiclase y salida softmax",()=>{
  const d=parseTable(csv("species",Array.from({length:90},(_,i)=>["setosa","virginica","versicolor"][i%3])),"iris.csv");
  const p=profileTable(d);
  assert.equal(d.task,"multiclass");
  assert.equal(p.activation,"softmax");
  assert.equal(p.loss,"categoricalCrossentropy");
  assert.equal(p.classes.length,3);
});
test("Detecta regresión y salida lineal",()=>{
  const d=parseTable(csv("precio",Array.from({length:80},(_,i)=>25000+i*53.4)),"casas.csv");
  const p=profileTable(d);
  assert.equal(d.task,"regression");
  assert.equal(p.activation,"linear");
  assert.equal(p.loss,"meanSquaredError");
});
test("CSV: respeta comillas, separadores y valida filas corruptas",()=>{
  const raw='edad;producto;clase\n'+Array.from({length:30},(_,i)=>i+';"Artículo; '+i+'";'+(i%2)).join("\r\n");
  const d=parseTable(raw,"articulos.csv");
  assert.equal(d.rows[0][1],"Artículo; 0");
  assert.equal(d.rows.length,30);
  assert.throws(()=>parseTable('a,b\n'+Array.from({length:20},()=>"1").join("\n"),"fallo.csv"),/distinta/);
  assert.throws(()=>parseTable("foo", "broken.csv"),/columnas/);
});
test("Requiere tarea manual compatible con sus etiquetas",()=>{
  const d=parseTable(csv("churn",Array.from({length:70},(_,i)=>i%2)),"churn.csv");
  assert.throws(()=>profileTable({...d,task:"multiclass",automatic:false}),/3 y 20/);
  assert.equal(inferTask(d,"churn"),"binary");
});
