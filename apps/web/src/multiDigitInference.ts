/**
 * Reconocimiento multi-dígito: mismo modelo original de Colab, recortes con
 * escala de grises y orientación conservadora. No seleccionar el máximo entre
 * 24 giros si el dígito ya está derecho: eso convertía 6→5, 4→1 y 9→1.
 */
import * as tf from "@tensorflow/tfjs";
import type {Config} from "./cnn.ts";
import {normalizeDigitCrop,segmentDigitsFromFile} from "./digitSegmentation.ts";
import type {DigitBox,DigitRegion} from "./digitSegmentation.ts";
import {transformMnistPixels,deskewMnistPixels} from "./mnistRobust.ts";

export type DigitPrediction={
  position:number;row:number;digit:string;confidence:number;alternative:string;
  angle:number;uncertain:boolean;margin:number;box:DigitBox;thumbnail:string;
};
export type MultiDigitPrediction={
  predictions:Array<{clase:string;probabilidad:number}>;digits:DigitPrediction[];
  sequence:string;warning:string;annotatedImage?:string;
};
const LABELS=Array.from({length:10},(_,i)=>String(i));
const fallbackAngles=[-45,-30,-15,15,30,45,90,180,270];
export function isDigitClassifier(classes:readonly string[],config:Config):boolean{
  return config.size===28&&config.channels===1&&
    classes.length===10&&classes.every((name,i)=>name===LABELS[i]);
}
type Choice={scores:number[];angle:number;pixels:Float32Array};
type Ranked={digit:string;alternative:string;confidence:number;margin:number;uncertain:boolean};
export function rankDigitScores(scores:readonly number[]):Ranked{
  if(scores.length!==10||scores.some(v=>!Number.isFinite(v)||v<0))
    throw new Error("La CNN no devolvió diez puntuaciones válidas.");
  const indices=LABELS.map((_,i)=>i).sort((a,b)=>scores[b]-scores[a]);
  const top=indices[0],runner=indices[1];
  const margin=scores[top]-scores[runner];
  return {digit:String(top),alternative:String(runner),confidence:scores[top],margin,
    uncertain:scores[top]<.60||margin<.18};
}
/** Mantener el resultado original si la CNN está razonablemente segura.
 * Para dibujos muy girados, exigir mejora absoluta para reemplazarlo.
 */
export function chooseOrientation(original:readonly number[],alternatives:ReadonlyArray<{scores:readonly number[];angle:number}>):number{
  const baseline=rankDigitScores(original);
  if(baseline.confidence>=.70&&baseline.margin>=.15)return -1;
  let best=-1,bestScore=baseline.confidence;
  for(let i=0;i<alternatives.length;i++){
    const next=rankDigitScores(alternatives[i].scores);
    const angle=Math.abs(alternatives[i].angle);
    const penalty=angle>60?.08:.015;
    const adjusted=next.confidence-penalty;
    // Los giros de 90°/180° son débiles sin referencias HOG de orientación;
    // evitar producir otra etiqueta muy segura solo por girar un 6/9.
    if(angle>60&&["6","9"].includes(next.digit)&&
       ["6","9"].includes(baseline.digit))continue;
    if(next.confidence>=.80&&next.margin>=.22&&adjusted>bestScore+.18){
      best=i;bestScore=adjusted;
    }
  }
  return best;
}
export function orderDigitResults(digits:DigitPrediction[]):string{
  const rows=[...new Set(digits.map(d=>d.row))].sort((a,b)=>a-b);
  return rows.map(row=>digits.filter(d=>d.row===row).sort((a,b)=>a.box.x-b.box.x)
    .map(d=>d.uncertain?"?":d.digit).join("")).join(" / ");
}
function thumb(pixels:Float32Array):string{
  const canvas=document.createElement("canvas");canvas.width=28;canvas.height=28;
  const ctx=canvas.getContext("2d");if(!ctx)return "";
  const img=ctx.createImageData(28,28);
  for(let i=0;i<784;i++){
    const v=Math.round(255*Math.min(1,Math.max(0,pixels[i])));
    img.data[i*4]=img.data[i*4+1]=img.data[i*4+2]=v;img.data[i*4+3]=255;
  }
  ctx.putImageData(img,0,0);return canvas.toDataURL("image/png");
}
function normalizeRotated(source:Float32Array,angle:number):Float32Array{
  const rotated=angle?transformMnistPixels(source,angle*Math.PI/180):source;
  let minX=28,minY=28,maxX=-1,maxY=-1;
  for(let y=0;y<28;y++)for(let x=0;x<28;x++){
    if(rotated[y*28+x]>.025){
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);
      minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
  }
  if(maxX<minX||maxY<minY)return new Float32Array(source);
  const w=maxX-minX+1,h=maxY-minY+1,patch=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)patch[y*w+x]=rotated[(minY+y)*28+minX+x];
  return normalizeDigitCrop(patch,w,h);
}
async function forward(model:tf.LayersModel,inputs:readonly Float32Array[]):Promise<number[][]>{
  const merged=new Float32Array(inputs.length*784);
  inputs.forEach((v,i)=>merged.set(v,i*784));
  const batch=tf.tensor4d(merged,[inputs.length,28,28,1]);
  try{
    const result=model.predict(batch) as tf.Tensor;
    try{
      const floats=await result.data();
      if(floats.length!==inputs.length*10)throw new Error("La CNN no devolvió diez clases por recorte.");
      return inputs.map((_,i)=>Array.from(floats.slice(i*10,(i+1)*10)));
    }finally{result.dispose();}
  }finally{batch.dispose();}
}
async function inferRegion(model:tf.LayersModel,region:DigitRegion):Promise<DigitPrediction>{
  const original=(await forward(model,[region.pixels]))[0];
  let selected:Choice={scores:original,angle:0,pixels:region.pixels};
  const baseline=rankDigitScores(original);
  if(baseline.confidence<.70||baseline.margin<.15){
    const candidates:{pixels:Float32Array;angle:number}[]=[];
    const correction=deskewMnistPixels(region.pixels);
    candidates.push({pixels:correction,angle:0});
    for(const angle of fallbackAngles){
      candidates.push({pixels:normalizeRotated(region.pixels,angle),angle});
    }
    const scores:number[][]=[];
    for(let i=0;i<candidates.length;i+=5){
      scores.push(...await forward(model,candidates.slice(i,i+5).map(c=>c.pixels)));
      await tf.nextFrame();
    }
    const index=chooseOrientation(original,scores.map((v,i)=>({scores:v,angle:candidates[i].angle})));
    if(index>=0)selected={...candidates[index],scores:scores[index]};
  }
  const result=rankDigitScores(selected.scores);
  const ambiguous69=selected.angle!==0&&Math.abs(selected.angle)>=90&&
    (result.digit==="6"||result.digit==="9");
  const uncertain=result.uncertain||ambiguous69;
  return {...region.box,digit:ambiguous69?"6 / 9":result.digit,
    alternative:result.alternative,confidence:result.confidence,margin:result.margin,
    uncertain,angle:selected.angle,box:region.box,thumbnail:thumb(selected.pixels)};
}
async function annotateImage(file:File,digits:DigitPrediction[]):Promise<string>{
  const bitmap=await createImageBitmap(file);
  try{
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const width=Math.max(16,Math.round(bitmap.width*scale));
    const height=Math.max(16,Math.round(bitmap.height*scale));
    const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("No se pudo generar la vista de regiones detectadas.");
    ctx.drawImage(bitmap,0,0,width,height);
    const line=Math.max(2,Math.round(Math.min(width,height)/200));
    const font=Math.max(12,Math.round(Math.min(width,height)/23));
    ctx.lineWidth=line;ctx.font="bold "+font+"px sans-serif";ctx.textBaseline="top";
    for(const d of digits){
      const box=d.box;
      ctx.strokeStyle=d.uncertain?"#e6a22c":"#13a984";
      ctx.strokeRect(box.x,box.y,box.width,box.height);
      const label=d.position+": "+(d.uncertain?"?":d.digit);
      const labelWidth=ctx.measureText(label).width+10;
      const ty=Math.max(0,box.y-font-8),tx=Math.min(width-labelWidth,Math.max(0,box.x));
      ctx.fillStyle=d.uncertain?"#99600e":"#087b66";
      ctx.fillRect(tx,ty,labelWidth,font+7);
      ctx.fillStyle="#ffffff";ctx.fillText(label,tx+5,ty+2);
    }
    return canvas.toDataURL("image/jpeg",.86);
  }finally{bitmap.close();}
}
export async function predictMultipleDigits(modelRef:string,file:File,config:Config,classes:string[]):Promise<MultiDigitPrediction>{
  if(!modelRef.startsWith("indexeddb://neurolab-cnn-")||!isDigitClassifier(classes,config))
    throw new Error("La detección multi-dígito requiere una CNN MNIST compatible de 28 × 28.");
  const probe=await createImageBitmap(file);
  const isOfficial=probe.width===28&&probe.height===28;
  probe.close();
  if(isOfficial){
    const {predictInBrowser}=await import("./browserCNN.ts");
    const {preprocessMnistPhoto}=await import("./mnistPreprocess.ts");
    const predictions=await predictInBrowser(modelRef,file,config,classes,true);
    const pixels=await preprocessMnistPhoto(file);
    const first=predictions[0];
    const margin=first.probabilidad-(predictions[1]?.probabilidad??0);
    const box:DigitBox={x:0,y:0,width:28,height:28,row:1,position:1};
    const uncertain=first.probabilidad<.60||margin<.18;
    return {predictions,sequence:uncertain?"?":first.clase,
      digits:[{position:1,row:1,digit:first.clase,confidence:first.probabilidad,margin,
        alternative:predictions[1]?.clase??"",angle:0,uncertain,box,thumbnail:thumb(pixels)}],
      warning:"Imagen individual de MNIST: se conserva la inferencia original."};
  }
  const regions=await segmentDigitsFromFile(file);
  if(!regions.length)throw new Error("No se detectaron números en esta imagen.");
  const model=await tf.loadLayersModel(modelRef);
  try{
    const digits:DigitPrediction[]=[];
    for(const region of regions)digits.push(await inferRegion(model,region));
    const doubtful=digits.filter(d=>d.uncertain).length;
    const warning=doubtful
      ?doubtful+" región(es) requieren revisión: trazos ambiguos u orientación no concluyente."
      :"Las cifras se evalúan con los pesos guardados; las puntuaciones son estimaciones del modelo, no exactitud medida sobre fotografías.";
    const sequence=orderDigitResults(digits);
    const predictions=digits.length===1
      ?[{clase:digits[0].digit,probabilidad:digits[0].confidence}]
      :[{clase:sequence,probabilidad:Math.min(...digits.map(d=>d.confidence))}];
    return {digits,sequence,warning,predictions,
      annotatedImage:digits.length>1?await annotateImage(file,digits):undefined};
  }finally{model.dispose();}
}
