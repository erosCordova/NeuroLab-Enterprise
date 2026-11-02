import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {inspectColabCNN,isColabCNNFile} from "../src/colabCNN.ts";

const weights=[
 ["conv2d/kernel",[3,3,1,32]],["conv2d/bias",[32]],
 ["conv2d_1/kernel",[3,3,32,32]],["conv2d_1/bias",[32]],
 ["conv2d_2/kernel",[3,3,32,64]],["conv2d_2/bias",[64]],
 ["conv2d_3/kernel",[3,3,64,64]],["conv2d_3/bias",[64]],
 ["dense/kernel",[1600,128]],["dense/bias",[128]],
 ["dense_1/kernel",[128,10]],["dense_1/bias",[10]],
];
const checksum=buffer=>createHash("sha256").update(buffer).digest("hex");
function fixture(corrupt=false){
 const size=weights.reduce((sum,[,shape])=>sum+shape.reduce((a,b)=>a*b,1)*4,0);
 const floats=new Float32Array(size/4);
 floats[0]=.25;floats.at(-1);
 const bytes=new Uint8Array(floats.buffer);
 const header={
  format:"neurolab-colab-mnist",version:1,architecture:"tecnoforms-mnist-conv32x2-conv64x2-dense128-v1",
  source_sha256:"f".repeat(64),name:"Modelo Colab",input:[28,28,1],
  classes:Array.from({length:10},(_,i)=>String(i)),parameters:271210,
  weightSpecs:weights.map(([name,shape])=>({name,shape,dtype:"float32"})),
  weights_bytes:size,weights_sha256:checksum(bytes),
 };
 const serialized=new TextEncoder().encode(JSON.stringify(header));
 const out=new Uint8Array(12+serialized.length+size);
 out.set(new TextEncoder().encode("NLCOLAB1"));
 new DataView(out.buffer).setUint32(8,serialized.length,true);
 out.set(serialized,12);out.set(bytes,12+serialized.length);
 if(corrupt)out[out.length-1]^=0x7f;
 return new Blob([out]);
}
test("NLCOLAB1 permite solo pesos verificados de arquitectura esperada",async()=>{
 const valid=fixture();
 assert.equal(await isColabCNNFile(valid),true);
 const loaded=await inspectColabCNN(valid);
 assert.equal(loaded.header.parameters,271210);
 assert.equal(loaded.weights.length,271210*4);
 assert.equal(loaded.header.classes.length,10);
});
test("NLCOLAB1 rechaza la alteración de pesos, a diferencia de cambiar una extensión",async()=>{
 await assert.rejects(()=>inspectColabCNN(fixture(true)),/SHA-256/);
 const fake=new Blob(["fake .keras renamed .ncnn"]);
 assert.equal(await isColabCNNFile(fake),false);
});
