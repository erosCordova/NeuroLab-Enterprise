import test from "node:test";
import assert from "node:assert/strict";
import {unregisteredRuns,filterRealModels} from "../src/realModelRegistry.ts";
const rows=[
 {id:"a",run_id:"1",model_ref:"indexeddb://a",display_name:"Dígitos v1",classes:["0","1"],notes:"original",status:"Registrado",favorite:false,updated_at:"2026-10-01"},
 {id:"b",run_id:"2",model_ref:"indexeddb://b",display_name:"Plantas",classes:["rosa"],notes:"verificar",status:"Archivado",favorite:true,updated_at:"2026-10-02"},
];
const runs=[
 {id:"1",engine:"TensorFlow.js",model_ref:"indexeddb://a"},
 {id:"2",engine:"TensorFlow.js",model_ref:"indexeddb://b"},
 {id:"3",engine:"TensorFlow.js",model_ref:"indexeddb://c"},
 {id:"4",engine:"TensorFlow/Keras",model_ref:null},
];
test("solo muestra entrenamientos de navegador que todavía no se registraron",()=>{
 assert.deepEqual(unregisteredRuns(runs,rows).map(item=>item.id),["3"]);
});
test("filtra modelos por disponibilidad comprobada, estado y favorito",()=>{
 const local=new Set(["indexeddb://a"]);
 assert.deepEqual(filterRealModels(rows,"Disponibles","",local).map(item=>item.id),["a"]);
 assert.deepEqual(filterRealModels(rows,"Archivados","",local).map(item=>item.id),["b"]);
 assert.deepEqual(filterRealModels(rows,"Favoritos","",local).map(item=>item.id),["b"]);
 assert.deepEqual(filterRealModels(rows,"Todos","ROS",local).map(item=>item.id),["b"]);
 assert.deepEqual(filterRealModels(rows,"Disponibles","",new Set()).map(item=>item.id),[]);
});
