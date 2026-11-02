import {test} from "node:test";
import assert from "node:assert/strict";
import {defaultConfig} from "../src/cnn.ts";
import {isDigitClassifier,rotationHypothesis,orderDigitResults} from "../src/multiDigitInference.ts";

test("Reconocimiento multi-dígito solo para modelo MNIST, no Fashion",()=>{
 const c=defaultConfig();
 assert.equal(isDigitClassifier(Array.from({length:10},(_,i)=>String(i)),c),true);
 assert.equal(isDigitClassifier(["Camisa","Bolso"],c),false);
 assert.equal(isDigitClassifier(Array.from({length:10},(_,i)=>String(i)),{...c,size:64}),false);
});
test("Un número rotado 90 grados puede elegirse entre 24 orientaciones",()=>{
 const output=new Float32Array(24*2*10);
 for(let i=0;i<48;i++)for(let d=0;d<10;d++)output[i*10+d]=.01;
 for(let variant=0;variant<2;variant++)output[(6*2+variant)*10+7]=.99;
 for(let variant=0;variant<2;variant++)output[(5*2+variant)*10+7]=.7;
 for(let variant=0;variant<2;variant++)output[(7*2+variant)*10+7]=.7;
 const result=rotationHypothesis(output);
 assert.equal(result.digit,"7");
 assert.equal(result.angle,90);
 assert.ok(result.confidence>.5);
});
test("Cifras 6 y 9 deben marcarse para revisión si ambas son plausibles",()=>{
 const output=new Float32Array(48*10).fill(.01);
 for(let variant=0;variant<2;variant++){
   output[(0*2+variant)*10+6]=.98;
   output[(12*2+variant)*10+9]=.95;
 }
 const result=rotationHypothesis(output);
 assert.equal(result.uncertain,true);
 assert.match(result.digit,/6 \/ 9/);
});
test("Numeración múltiple conserva filas y marca las regiones inciertas",()=>{
 const row=(row,x,digit,uncertain=false)=>({row,box:{x,y:0,width:10,height:20,row,position:x},digit,uncertain});
 const sequence=orderDigitResults([row(2,50,"8"),row(1,70,"2"),row(1,10,"5"),row(2,10,"7",true)]);
 assert.equal(sequence,"52 / ?8");
});
