import {test} from "node:test";
import assert from "node:assert/strict";
import {defaultConfig} from "../src/cnn.ts";
import {isDigitClassifier,rankDigitScores,chooseOrientation,orderDigitResults,normalizeRotated,resolveAngleEvidence} from "../src/multiDigitInference.ts";

test("Solo admite CNN de diez cifras con entrada MNIST",()=>{
 const c=defaultConfig(),names=Array.from({length:10},(_,i)=>String(i));
 assert.equal(isDigitClassifier(names,c),true);
 assert.equal(isDigitClassifier(["Bolso","Camisa"],c),false);
 assert.equal(isDigitClassifier(names,{...c,size:64}),false);
});
const vector=(best,confidence,runner=0,runnerScore=.05)=>{
 const values=new Array(10).fill(.001);
 values[best]=confidence;
 if(best!==runner)values[runner]=runnerScore;
 return values;
};
test("Conservar las clases altas de la foto real de Colab: 6 4 / 7 5 / 9 1 / 8",()=>{
 const observed=[6,4,7,5,9,1,8];
 for(const [i,digit] of observed.entries()){
   const actual=vector(digit,[.769,.893,.999,.999,.971,.995,.969][i],2,.04);
   const spurious=vector((digit+9)%10,.998,3,.01);
   assert.equal(chooseOrientation(actual,[{scores:spurious,angle:180}]),-1);
   assert.equal(rankDigitScores(actual).digit,String(digit));
 }
});
test("Orientación alternativa solo cuando mejora de forma convincente un resultado débil",()=>{
 const baseline=vector(2,.38,3,.27);
 const improve=vector(7,.97,3,.02);
 assert.equal(chooseOrientation(baseline,[{scores:improve,angle:90}]),0);
 assert.equal(chooseOrientation(vector(6,.76),[{scores:vector(9,.99),angle:180}]),-1);
 assert.equal(chooseOrientation(baseline,[{scores:vector(7,.53),angle:90}]),-1);
});
test("Margen insuficiente se muestra como revisión, sin inventar 99% de exactitud",()=>{
 const weak=vector(1,.48,7,.40);
 const r=rankDigitScores(weak);
 assert.equal(r.uncertain,true);
 assert.ok(r.margin<.10);
});
test("Las filas conservan orden de lectura y señalan dudas",()=>{
 const row=(row,x,digit,uncertain=false)=>({row,box:{x,y:0,width:10,height:20,row,position:x},digit,uncertain});
 assert.equal(orderDigitResults([row(2,50,"8"),row(1,70,"2"),row(1,10,"5"),row(2,10,"7",true)]),"52 / ?8");
});

test("Los giros de 90° y 180° preservan un trazo sin cortar el recorte",()=>{
 const src=new Float32Array(784);
 for(let y=3;y<26;y++)src[y*28+13]=1;
 for(const degrees of [15,45,90,180,270]){
   const rotated=normalizeRotated(src,degrees);
   assert.equal(rotated.length,784);
   assert.ok(rotated.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
   assert.ok(rotated.reduce((a,v)=>a+v,0)>6,"El trazo se cortó a "+degrees+"°");
 }
});
