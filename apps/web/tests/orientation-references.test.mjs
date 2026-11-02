import {test} from "node:test";
import assert from "node:assert/strict";
import {hogDescriptor,top3ReferenceSimilarity} from "../src/orientationReferences.ts";

test("HOG: descriptor de 324 dimensiones finitas, norma 1 para un trazo",()=>{
 const image=new Float32Array(784);
 for(let y=4;y<24;y++)for(let dx=0;dx<3;dx++)image[y*28+12+dx]=1;
 const v=hogDescriptor(image);
 assert.equal(v.length,324);
 assert.ok(v.every(Number.isFinite));
 const norm=Math.sqrt(v.reduce((sum,x)=>sum+x*x,0));
 assert.ok(Math.abs(norm-1)<.00001);
});
test("HOG: referencias idénticas puntúan más alto que formas ortogonales",()=>{
 const a=new Float32Array(784),b=new Float32Array(784);
 for(let y=4;y<24;y++)a[y*28+12]=1;
 for(let x=4;x<24;x++)b[12*28+x]=1;
 const va=hogDescriptor(a),vb=hogDescriptor(b);
 const bank={byClass:Array.from({length:10},(_,i)=>new Float32Array(3*324).map((_,k)=>(i===0?va:vb)[k%324])),counts:Array(10).fill(3)};
 const score=top3ReferenceSimilarity(va,bank);
 assert.ok(score[0]>score[1]);
 assert.ok(score[0]>.98);
});
