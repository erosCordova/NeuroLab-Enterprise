/**
 * Reconocimiento multi-dígito: mismo modelo original de Colab, recortes con
 * escala de grises y orientación conservadora. No seleccionar el máximo entre
 * 24 giros si el dígito ya está derecho: eso convertía 6→5, 4→1 y 9→1.
 */
import * as tf from "@tensorflow/tfjs";
import type {Config} from "./cnn.ts";
import {normalizeDigitCrop,segmentDigitsFromFile} from "./digitSegmentation.ts";
import type {DigitBox,DigitRegion} from "./digitSegmentation.ts";
import {deskewMnistPixels} from "./mnistRobust.ts";
import {hogDescriptor,loadOrientationBank,top3ReferenceSimilarity} from "./orientationReferences.ts";
import type {OrientationBank} from "./orientationReferences.ts";

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
/** Girar en un lienzo ampliado: no cortar los extremos como en el visor anterior. */
function normalizeRotated(source:Float32Array,angle:number):Float32Array{
  if(angle===0)return new Float32Array(source);
  const rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  const side=Math.ceil(28*(Math.abs(c)+Math.abs(s)))+4;
  const expanded=new Float32Array(side*side),center=(side-1)/2;
  const sample=(x:number,y:number)=>{
    if(x<0||y<0||x>27||y>27)return 0;
    const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(27,x0+1),y1=Math.min(27,y0+1),fx=x-x0,fy=y-y0;
    return (source[y0*28+x0]*(1-fx)+source[y0*28+x1]*fx)*(1-fy)+
      (source[y1*28+x0]*(1-fx)+source[y1*28+x1]*fx)*fy;
  };
  for(let y=0;y<side;y++)for(let x=0;x<side;x++){
    const dx=x-center,dy=y-center;
    expanded[y*side+x]=sample(c*dx-s*dy+13.5,s*dx+c*dy+13.5);
  }
  return normalizeDigitCrop(expanded,side,side);
}
const SEARCH_ANGLES=Array.from({length:24},(_,i)=>i*15);
type OrientationDecision={scores:number[];angle:number;pixels:Float32Array;confidence:number;margin:number};
function decideWithReferences(
  variants:ReadonlyArray<{pixels:Float32Array;angle:number}>,
  distributions:ReadonlyArray<number[]>,bank:OrientationBank,
):OrientationDecision{
  if(variants.length!==48||distributions.length!==48)
    throw new Error("La búsqueda de orientación requiere 24 giros con dos preparaciones.");
  const raw=distributions.map((scores,i)=>{
    const similarity=top3ReferenceSimilarity(hogDescriptor(variants[i].pixels),bank);
    return scores.map((probability,digit)=>
      Math.pow(Math.max(1e-7,probability),.75)*Math.exp(Math.max(-30,Math.min(0,(similarity[digit]-1)/.065))));
  });
  // Máximo entre preparación original y corregida, seguido de suavizado
  // angular idéntico al Colab (la primera y última orientación son vecinas).
  const max=SEARCH_ANGLES.map((_,i)=>raw[2*i].map((v,d)=>Math.max(v,raw[2*i+1][d])));
  const smoothed=max.map((row,i)=>row.map((value,d)=>
    .6*value+.2*max[(i+23)%24][d]+.2*max[(i+1)%24][d]));
  const best=Array.from({length:10},(_,d)=>Math.max(...smoothed.map(row=>row[d])));
  const order=Array.from({length:10},(_,d)=>d).sort((a,b)=>best[b]-best[a]);
  const sum=best.reduce((n,v)=>n+v,0);
  const confidence=best[order[0]]/Math.max(sum,1e-8);
  const margin=(best[order[0]]-best[order[1]])/Math.max(sum,1e-8);
  const digit=order[0];
  const angleIndex=smoothed.findIndex(row=>row[digit]===best[digit]);
  const v=raw[2*angleIndex][digit]>=raw[2*angleIndex+1][digit]?2*angleIndex:2*angleIndex+1;
  const degrees=SEARCH_ANGLES[angleIndex];
  return {scores:best.map(value=>value/Math.max(sum,1e-8)),confidence,margin,
    angle:degrees>180?degrees-360:degrees,pixels:variants[v].pixels};
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
  const baseline=rankDigitScores(original);
  let selected:Choice={scores:original,angle:0,pixels:region.pixels};
  let confidence=baseline.confidence,margin=baseline.margin;
  let needsReview=false;
  // Los recortes claros conservan la decisión y la confianza original.
  if(baseline.confidence<.70||baseline.margin<.15){
    const referenceTask=loadOrientationBank().catch(()=>null);
    const bank=await referenceTask;
    if(bank){
      const variants:Array<{pixels:Float32Array;angle:number}>=[];
      for(const angle of SEARCH_ANGLES){
        const rotated=normalizeRotated(region.pixels,angle);
        variants.push({pixels:rotated,angle});
        variants.push({pixels:deskewMnistPixels(rotated),angle});
      }
      const distributions:number[][]=[];
      for(let i=0;i<variants.length;i+=12){
        distributions.push(...await forward(model,variants.slice(i,i+12).map(v=>v.pixels)));
        await tf.nextFrame();
      }
      const decision=decideWithReferences(variants,distributions,bank);
      const winner=rankDigitScores(decision.scores);
      if(decision.confidence>=.52&&decision.margin>=.12&&
         (winner.digit===baseline.digit||decision.confidence>=baseline.confidence-.08)){
        selected={scores:decision.scores,angle:decision.angle,pixels:decision.pixels};
        confidence=decision.confidence;margin=decision.margin;
      }else needsReview=true;
    }else{
      // Sin conexión se preserva el motor anterior, sin bloquear predicciones.
      const candidates=[{pixels:deskewMnistPixels(region.pixels),angle:0},
        ...fallbackAngles.map(angle=>({pixels:normalizeRotated(region.pixels,angle),angle}))];
      const distributions:number[][]=[];
      for(let i=0;i<candidates.length;i+=5)
        distributions.push(...await forward(model,candidates.slice(i,i+5).map(v=>v.pixels)));
      const index=chooseOrientation(original,distributions.map((scores,i)=>({scores,angle:candidates[i].angle})));
      if(index>=0)selected={...candidates[index],scores:distributions[index]};
      const ranked=rankDigitScores(selected.scores);
      confidence=ranked.confidence;margin=ranked.margin;
      needsReview=true;
    }
  }
  const result=rankDigitScores(selected.scores);
  const ambiguous69=Math.abs(selected.angle)>=90&&["6","9"].includes(result.digit)&&
    (confidence<.8||margin<.25);
  const uncertain=needsReview||confidence<.6||margin<.15||ambiguous69;
  return {...region.box,digit:ambiguous69?"6 / 9":result.digit,
    alternative:result.alternative,confidence,margin,
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
