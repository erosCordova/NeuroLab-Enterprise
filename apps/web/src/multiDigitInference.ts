/**
 * Inferencia de fotografías multi-dígito, adaptada del flujo de Colab:
 * recortes individuales -> búsqueda 360° -> evaluación CNN en lotes.
 * No usa ejemplos del conjunto de prueba para elegir el resultado.
 */
import * as tf from "@tensorflow/tfjs";
import type {Config} from "./cnn.ts";
import {segmentDigitsFromFile} from "./digitSegmentation.ts";
import type {DigitBox,DigitRegion} from "./digitSegmentation.ts";
import {transformMnistPixels,deskewMnistPixels} from "./mnistRobust.ts";

export type DigitPrediction={position:number;row:number;digit:string;confidence:number;alternative:string;angle:number;uncertain:boolean;box:DigitBox;thumbnail:string};
export type MultiDigitPrediction={predictions:Array<{clase:string;probabilidad:number}>;digits:DigitPrediction[];sequence:string;warning:string};
const ANGLES=Array.from({length:24},(_,i)=>i*15);
const LABELS=Array.from({length:10},(_,i)=>String(i));
export function isDigitClassifier(classes:readonly string[],config:Config):boolean{
  return config.size===28&&config.channels===1&&
    classes.length===10&&classes.every((name,i)=>name===LABELS[i]);
}
export function rotationHypothesis(probabilities:ArrayLike<number>,labels:readonly string[]=LABELS){
  if(probabilities.length!==ANGLES.length*2*labels.length||Array.from(probabilities).some(x=>!Number.isFinite(x)||x<0))
    throw new Error("Probabilidades incompletas para búsqueda de orientación.");
  const scores=Array.from({length:ANGLES.length},()=>Array(labels.length).fill(0) as number[]);
  for(let a=0;a<ANGLES.length;a++)for(let j=0;j<labels.length;j++){
    scores[a][j]=Math.max(probabilities[a*20+j],probabilities[a*20+10+j]);
  }
  // Estabilizar la búsqueda contra saltos de una orientación aislada.
  const smoothed=scores.map((row,a)=>row.map((v,j)=>
    .6*v+.2*scores[(a+ANGLES.length-1)%ANGLES.length][j]+.2*scores[(a+1)%ANGLES.length][j]));
  const max=labels.map((_,j)=>Math.max(...smoothed.map(row=>row[j])));
  const ranked=labels.map((label,j)=>({label,score:max[j],index:j})).sort((a,b)=>b.score-a.score);
  const power=ranked.map(item=>Math.pow(Math.max(1e-6,item.score),5));
  const denom=power.reduce((sum,x)=>sum+x,0);
  const probability=power[0]/denom;
  const second=power[1]/denom;
  const digit=ranked[0].label,alternative=ranked[1].label;
  const variant=smoothed.findIndex(row=>row[ranked[0].index]===max[ranked[0].index]);
  const angle=ANGLES[Math.max(0,variant)];
  const sixNine=[digit,alternative].sort().join("")==="69"&&probability-second<.25;
  const uncertain=sixNine||probability<.52||probability-second<.12;
  return {digit:sixNine?"6 / 9":digit,alternative,confidence:probability,angle:angle>180?angle-360:angle,uncertain,
    all:ranked.map((item,i)=>({clase:item.label,probabilidad:power[i]/denom}))};
}
export function orderDigitResults(digits:DigitPrediction[]):string{
  const rows=[...new Set(digits.map(d=>d.row))].sort((a,b)=>a-b);
  return rows.map(row=>digits.filter(d=>d.row===row).sort((a,b)=>a.box.x-b.box.x)
    .map(d=>d.uncertain?"?":d.digit).join("")).join(" / ");
}
function thumb(pixels:Float32Array):string{
  const canvas=document.createElement("canvas");canvas.width=28;canvas.height=28;
  const ctx=canvas.getContext("2d");
  if(!ctx)return "";
  const data=ctx.createImageData(28,28);
  for(let i=0;i<784;i++){
    const color=Math.round(255*Math.min(1,Math.max(0,pixels[i])));
    data.data[i*4]=data.data[i*4+1]=data.data[i*4+2]=color;
    data.data[i*4+3]=255;
  }
  ctx.putImageData(data,0,0);
  return canvas.toDataURL("image/png");
}
async function inferRegion(model:tf.LayersModel,region:DigitRegion):Promise<ReturnType<typeof rotationHypothesis>>{
  const values=new Float32Array(ANGLES.length*2*784);
  for(let k=0;k<ANGLES.length;k++){
    const rotated=transformMnistPixels(region.pixels,ANGLES[k]*Math.PI/180);
    values.set(rotated,(k*2)*784);
    values.set(deskewMnistPixels(rotated),(k*2+1)*784);
  }
  const predictions=new Float32Array(ANGLES.length*2*10);
  for(let start=0;start<ANGLES.length*2;start+=24){
    const len=Math.min(24,ANGLES.length*2-start);
    const input=tf.tensor4d(values.subarray(start*784,(start+len)*784),[len,28,28,1]);
    try{
      const output=model.predict(input) as tf.Tensor;
      try{
        const values=await output.data();
        if(values.length!==len*10)throw new Error("La CNN no devolvió las diez categorías esperadas.");
        predictions.set(values,start*10);
      }finally{output.dispose();}
    }finally{input.dispose();}
    await tf.nextFrame();
  }
  return rotationHypothesis(predictions);
}
export async function predictMultipleDigits(modelRef:string,file:File,config:Config,classes:string[]):Promise<MultiDigitPrediction>{
  if(!modelRef.startsWith("indexeddb://neurolab-cnn-")||!isDigitClassifier(classes,config))
    throw new Error("La detección multi-dígito requiere una CNN MNIST compatible de 28 × 28.");
  // Mantener la ruta original para imágenes oficiales de 28×28:
  // fragmentar un "8" o un "9" del test en componentes perjudicaría los aciertos previos.
  const probe=await createImageBitmap(file);
  const isOfficial=probe.width===28&&probe.height===28;
  probe.close();
  if(isOfficial){
    const {predictInBrowser}=await import("./browserCNN.ts");
    const {preprocessMnistPhoto}=await import("./mnistPreprocess.ts");
    const predictions=await predictInBrowser(modelRef,file,config,classes,true);
    const pixels=await preprocessMnistPhoto(file);
    const first=predictions[0];
    const doubtful=first.probabilidad<.55;
    const box:DigitBox={x:0,y:0,width:28,height:28,row:1,position:1};
    return {
      predictions,sequence:doubtful?"?":first.clase,
      digits:[{position:1,row:1,digit:first.clase,confidence:first.probabilidad,
        alternative:predictions[1]?.clase??"",angle:0,uncertain:doubtful,box,thumbnail:thumb(pixels)}],
      warning:doubtful?"La imagen oficial tiene baja confianza; revisa el modelo y la etiqueta.":"Imagen MNIST de 28 × 28: se conservó la inferencia original del modelo.",
    };
  }
  const regions=await segmentDigitsFromFile(file);
  if(!regions.length)throw new Error("No se detectaron números en esta imagen.");
  const model=await tf.loadLayersModel(modelRef);
  try{
    const digits:DigitPrediction[]=[];
    let singleScores:Array<{clase:string;probabilidad:number}>=[];
    for(const region of regions){
      const outcome=await inferRegion(model,region);
      if(regions.length===1)singleScores=outcome.all.sort((a,b)=>b.probabilidad-a.probabilidad);
      digits.push({position:region.box.position,row:region.box.row,box:region.box,
        digit:outcome.digit,confidence:outcome.confidence,alternative:outcome.alternative,
        angle:outcome.angle,uncertain:outcome.uncertain,thumbnail:thumb(region.pixels)});
    }
    const doubtful=digits.filter(d=>d.uncertain).length;
    const warning=doubtful
      ?doubtful+" región(es) requieren revisión: inclinación, cifras ambiguas (especialmente 6 y 9) o poca separación entre hipótesis."
      :"La orientación se estima automáticamente. La puntuación compara hipótesis; no es precisión medida sobre fotografías.";
    const predictions=regions.length===1
      ?singleScores
      :[{clase:orderDigitResults(digits),probabilidad:digits.reduce((sum,d)=>sum+d.confidence,0)/digits.length}];
    return {digits,sequence:orderDigitResults(digits),warning,predictions};
  }finally{model.dispose();}
}
