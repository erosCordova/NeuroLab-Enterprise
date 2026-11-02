/**
 * Reconocimiento multi-dígito: búsqueda completa 360° adaptada del Colab,
 * ponderada con HOG del entrenamiento MNIST y coherencia entre dígitos.
 * Un softmax alto en la orientación equivocada NO evita investigar los giros.
 * Los pesos de la CNN original permanecen sin cambios.
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
export function normalizeRotated(source:Float32Array,angle:number):Float32Array{
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
export type AngleEvidence={angles:number[][];pixels:Float32Array[][]};
type AngleSolution={
  digit:number;alternative:number;confidence:number;margin:number;angle:number;
  ambiguous69:boolean;pixels:Float32Array;
};
const angularDistance=(a:number,b:number)=>Math.abs((a-b+180)%360-180);
export function resolveAngleEvidence(items:ReadonlyArray<AngleEvidence>):{results:AngleSolution[];commonAngle:number|null}{
  if(!items.length)return {results:[],commonAngle:null};
  const valid=items.every(item=>item.angles.length===24&&item.pixels.length===24&&
    item.angles.every(v=>v.length===10&&v.every(x=>Number.isFinite(x)&&x>=0)));
  if(!valid)throw new Error("Las 24 orientaciones no están completas.");
  const initial=items.map(item=>{
    const best=Array.from({length:10},(_,d)=>Math.max(...item.angles.map(row=>row[d])));
    const ranked=best.map((value,digit)=>({value,digit})).sort((a,b)=>b.value-a.value);
    return {angle:SEARCH_ANGLES[item.angles.findIndex(row=>row[ranked[0].digit]===ranked[0].value)],
      digit:ranked[0].digit,ratio:ranked[0].value/Math.max(1e-8,ranked[1].value)};
  });
  const anchors=initial.filter(v=>v.ratio>2&&v.digit!==6&&v.digit!==9);
  let commonAngle:number|null=null;
  if(anchors.length>=3&&anchors.length>=Math.ceil(items.length*.4)){
    let bestCount=0;
    for(const candidate of SEARCH_ANGLES){
      const support=anchors.filter(v=>angularDistance(v.angle,candidate)<=30).length;
      if(support>bestCount){bestCount=support;commonAngle=candidate;}
    }
    if(bestCount<Math.ceil(anchors.length*.75))commonAngle=null;
  }
  const results=items.map((item,i)=>{
    const adjusted=item.angles.map((row,a)=>row.map(score=>
      commonAngle!==null&&initial[i].ratio<2.5?
        score*(.15+.85*Math.exp(-.5*(angularDistance(SEARCH_ANGLES[a],commonAngle)/30)**2)):score));
    const max=Array.from({length:10},(_,d)=>Math.max(...adjusted.map(row=>row[d])));
    const order=Array.from({length:10},(_,d)=>d).sort((a,b)=>max[b]-max[a]);
    const sum=Math.max(1e-8,max.reduce((n,v)=>n+v,0));
    const digit=order[0],alternative=order[1],confidence=max[digit]/sum,margin=(max[digit]-max[alternative])/sum;
    const angleIndex=adjusted.findIndex(row=>row[digit]===max[digit]);
    const degree=SEARCH_ANGLES[Math.max(0,angleIndex)];
    return {digit,alternative,confidence,margin,
      angle:degree>180?degree-360:degree,
      ambiguous69:(digit===6&&alternative===9||digit===9&&alternative===6)&&margin<.25,
      pixels:item.pixels[Math.max(0,angleIndex)][digit]??item.pixels[Math.max(0,angleIndex)][0]};
  });
  return {results,commonAngle};
}
/** Puntuación CNN+HOG por orientación, siguiendo la combinación del Colab. */
function createAngleEvidence(
  variants:ReadonlyArray<{pixels:Float32Array;angle:number}>,
  distributions:ReadonlyArray<number[]>,bank:OrientationBank,
):AngleEvidence{
  if(variants.length!==48||distributions.length!==48)
    throw new Error("La búsqueda de orientación necesita 24 giros y dos preparaciones.");
  const raw=distributions.map((scores,i)=>{
    const similarity=top3ReferenceSimilarity(hogDescriptor(variants[i].pixels),bank);
    return scores.map((probability,digit)=>
      Math.pow(Math.max(1e-7,probability),.75)*Math.exp(Math.max(-30,Math.min(0,(similarity[digit]-1)/.065))));
  });
  const best=SEARCH_ANGLES.map((_,i)=>raw[2*i].map((v,d)=>Math.max(v,raw[2*i+1][d])));
  const smoothed=best.map((row,i)=>row.map((value,d)=>
    .6*value+.2*best[(i+23)%24][d]+.2*best[(i+1)%24][d]));
  const pixels=SEARCH_ANGLES.map((_,i)=>Array.from({length:10},(_,digit)=>
    variants[raw[2*i][digit]>=raw[2*i+1][digit]?2*i:2*i+1].pixels));
  return {angles:smoothed,pixels};
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
/**
 * Evalúa TODAS las orientaciones, incluso si el softmax del original es alto.
 * Un dígito horizontal puede dar 95% a una clase incorrecta; la CNN sola
 * no permite determinar que la escritura estaba girada.
 */
async function inferRegions(model:tf.LayersModel,regions:DigitRegion[]):Promise<{digits:DigitPrediction[];orientationWarning:string}>{
  const baseline=await forward(model,regions.map(region=>region.pixels));
  let bank:OrientationBank|null=null;
  try{bank=await loadOrientationBank();}catch{bank=null;}
  if(!bank){
    const digits:DigitPrediction[]=[];
    for(let i=0;i<regions.length;i++){
      const region=regions[i],candidates=[
        {pixels:region.pixels,angle:0},
        {pixels:deskewMnistPixels(region.pixels),angle:0},
        ...fallbackAngles.map(angle=>({pixels:normalizeRotated(region.pixels,angle),angle})),
      ];
      const scores:number[][]=[];
      for(let j=0;j<candidates.length;j+=8)
        scores.push(...await forward(model,candidates.slice(j,j+8).map(c=>c.pixels)));
      const original=baseline[i];
      const index=chooseOrientation(original,candidates.slice(1).map((item,j)=>({scores:scores[j+1],angle:item.angle})));
      const selected=index>=0?{...candidates[index+1],scores:scores[index+1]}:{...candidates[0],scores:original};
      const ranked=rankDigitScores(selected.scores);
      digits.push({...region.box,box:region.box,position:region.box.position,row:region.box.row,
        digit:ranked.digit,alternative:ranked.alternative,confidence:ranked.confidence,
        margin:ranked.margin,angle:selected.angle,uncertain:true,thumbnail:thumb(selected.pixels)});
    }
    return {digits,orientationWarning:"No se pudieron cargar las referencias de orientación. La lectura de números girados puede requerir revisión."};
  }
  const evidence:AngleEvidence[]=[];
  for(const region of regions){
    const variants:Array<{pixels:Float32Array;angle:number}>=[];
    for(const angle of SEARCH_ANGLES){
      const rotated=normalizeRotated(region.pixels,angle);
      variants.push({pixels:rotated,angle},{pixels:deskewMnistPixels(rotated),angle});
    }
    const scores:number[][]=[];
    for(let j=0;j<variants.length;j+=12){
      scores.push(...await forward(model,variants.slice(j,j+12).map(item=>item.pixels)));
      await tf.nextFrame();
    }
    evidence.push(createAngleEvidence(variants,scores,bank));
  }
  const decisions=resolveAngleEvidence(evidence);
  return {digits:decisions.results.map((result,i)=>{
    const region=regions[i];
    return {...region.box,box:region.box,position:region.box.position,row:region.box.row,
      digit:result.ambiguous69?"6 / 9":String(result.digit),alternative:String(result.alternative),
      confidence:result.confidence,margin:result.margin,angle:result.angle,
      uncertain:result.ambiguous69||result.margin<.15||result.confidence<.65,
      thumbnail:thumb(result.pixels)};
  }),orientationWarning:decisions.commonAngle===null?
    "Orientación estimada individualmente por dígito.":
    "Orientación coherente entre varios dígitos; los casos ambiguos se contrastaron con el grupo."};
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
    const {digits,orientationWarning}=await inferRegions(model,regions);
    const doubtful=digits.filter(d=>d.uncertain).length;
    const warning=doubtful
      ?doubtful+" región(es) requieren revisión: trazos ambiguos u orientación no concluyente. "+orientationWarning
      :"Las cifras se evalúan con los pesos guardados y referencias HOG. "+orientationWarning+" Las puntuaciones no son exactitud medida sobre fotografías.";
    const sequence=orderDigitResults(digits);
    const predictions=digits.length===1
      ?[{clase:digits[0].digit,probabilidad:digits[0].confidence}]
      :[{clase:sequence,probabilidad:Math.min(...digits.map(d=>d.confidence))}];
    return {digits,sequence,warning,predictions,
      annotatedImage:digits.length>1?await annotateImage(file,digits):undefined};
  }finally{model.dispose();}
}
