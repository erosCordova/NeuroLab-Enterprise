/**
 * Referencias HOG de MNIST (solo entrenamiento, jamás test), equivalentes
 * a las del cuaderno de Colab. Se descargan del proxy público existente
 * para la búsqueda de orientación completa, se calculan una vez por sesión y no
 * cambian los pesos ni envían fotografías privadas.
 */
import {normalizeDigitCrop} from "./digitSegmentation.ts";
import {MNIST_PROXY_PATH} from "./mnistDataset.ts";

const DIM=324,CELLS=144,SAMPLE_PER_CLASS=300;
export type OrientationBank={byClass:Float32Array[];counts:number[]};
let loaded:Promise<OrientationBank>|undefined;

function reflect(v:number):number{
  return v<0?-v:v>=28?54-v:v;
}
export function hogDescriptor(src:Float32Array):Float32Array{
  if(src.length!==784||!src.every(Number.isFinite))throw new Error("Descriptor HOG requiere un recorte válido de 28 × 28.");
  const hist=new Float32Array(CELLS);
  const get=(x:number,y:number)=>src[reflect(y)*28+reflect(x)];
  for(let y=0;y<28;y++)for(let x=0;x<28;x++){
    const gx=(get(x+1,y-1)+2*get(x+1,y)+get(x+1,y+1))-
      (get(x-1,y-1)+2*get(x-1,y)+get(x-1,y+1));
    const gy=(get(x-1,y+1)+2*get(x,y+1)+get(x+1,y+1))-
      (get(x-1,y-1)+2*get(x,y-1)+get(x+1,y-1));
    const magnitude=Math.hypot(gx,gy);
    const direction=((Math.atan2(gy,gx)+Math.PI)%Math.PI)*9/Math.PI;
    const bin=Math.floor(direction),fraction=direction-bin;
    const index=((y/7|0)*4+(x/7|0))*9;
    hist[index+bin%9]+=magnitude*(1-fraction);
    hist[index+(bin+1)%9]+=magnitude*fraction;
  }
  const vector=new Float32Array(DIM);
  let offset=0;
  for(let cy=0;cy<3;cy++)for(let cx=0;cx<3;cx++){
    const block=new Float32Array(36);
    for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
      const start=((cy+yy)*4+cx+xx)*9;
      block.set(hist.subarray(start,start+9),(yy*2+xx)*9);
    }
    let length=1e-6;
    for(const v of block)length+=v*v;
    const denom=Math.sqrt(length);
    for(let j=0;j<36;j++)block[j]=Math.min(.2,block[j]/denom);
    length=1e-6;
    for(const v of block)length+=v*v;
    const denom2=Math.sqrt(length);
    for(let j=0;j<36;j++)vector[offset++]=block[j]/denom2;
  }
  let squared=0;
  for(const v of vector)squared+=v*v;
  const norm=Math.max(1e-8,Math.sqrt(squared));
  for(let i=0;i<DIM;i++)vector[i]/=norm;
  return vector;
}
export function top3ReferenceSimilarity(descriptor:Float32Array,bank:OrientationBank):number[]{
  if(descriptor.length!==DIM||bank.byClass.length!==10)throw new Error("Banco HOG incompatible.");
  return bank.byClass.map((reference,i)=>{
    const count=bank.counts[i];
    if(count<3||reference.length!==count*DIM)throw new Error("Referencias HOG incompletas.");
    let best=-Infinity,second=-Infinity,third=-Infinity;
    for(let j=0;j<count;j++){
      let score=0,idx=j*DIM;
      for(let k=0;k<DIM;k++)score+=descriptor[k]*reference[idx+k];
      if(score>best){third=second;second=best;best=score;}
      else if(score>second){third=second;second=score;}
      else if(score>third)third=score;
    }
    return (best+second+third)/3;
  });
}
async function readGzip(url:string,limit:number):Promise<Uint8Array>{
  if(typeof DecompressionStream==="undefined")throw new Error("El navegador no permite leer las referencias MNIST comprimidas.");
  const res=await fetch(url,{credentials:"omit",cache:"force-cache"});
  if(!res.ok||!res.body)throw new Error("No se pudieron cargar las referencias de entrenamiento MNIST.");
  const reader=res.body.pipeThrough(new DecompressionStream("gzip")).getReader();
  const bytes=new Uint8Array(limit);
  let count=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      const take=Math.min(limit-count,value.length);
      bytes.set(value.subarray(0,take),count);count+=take;
      if(count>=limit){
        await reader.cancel().catch(()=>undefined);
        break;
      }
    }
  }finally{reader.releaseLock();}
  if(count<limit)throw new Error("Referencias MNIST incompletas.");
  return bytes;
}
async function prepareBank():Promise<OrientationBank>{
  // Los primeros 300 ejemplos de cada clase son reproducibles y proceden
  // exclusivamente del entrenamiento MNIST. El banco completo del Colab
  // usa más ejemplos; este es un índice ligero adaptado a navegadores.
  const labels=await readGzip(MNIST_PROXY_PATH+"train-labels-idx1-ubyte.gz",60_008);
  const view=new DataView(labels.buffer,labels.byteOffset,labels.byteLength);
  if(view.getUint32(0,false)!==2049||view.getUint32(4,false)!==60_000)
    throw new Error("Etiquetas MNIST inválidas.");
  const chosen:number[][]=Array.from({length:10},()=>[]);
  let maxIndex=0;
  for(let i=0;i<60_000;i++){
    const cls=labels[8+i];
    if(cls>9)throw new Error("Etiqueta MNIST desconocida.");
    if(chosen[cls].length<SAMPLE_PER_CLASS){
      chosen[cls].push(i);maxIndex=i;
    }
    if(chosen.every(c=>c.length===SAMPLE_PER_CLASS))break;
  }
  if(chosen.some(c=>c.length!==SAMPLE_PER_CLASS))
    throw new Error("No se encontraron suficientes referencias por clase.");
  const bytes=await readGzip(MNIST_PROXY_PATH+"train-images-idx3-ubyte.gz",16+(maxIndex+1)*784);
  const images=new DataView(bytes.buffer,bytes.byteOffset,16);
  if(images.getUint32(0,false)!==2051||images.getUint32(4,false)!==60_000||
    images.getUint32(8,false)!==28||images.getUint32(12,false)!==28)
    throw new Error("Imágenes MNIST inválidas.");
  const byClass:Float32Array[]=[],counts:number[]=[];
  for(let cls=0;cls<10;cls++){
    const selected=chosen[cls],bank=new Float32Array(selected.length*DIM);
    selected.forEach((index,j)=>{
      const raw=new Float32Array(784),start=16+index*784;
      for(let k=0;k<784;k++)raw[k]=bytes[start+k]/255;
      const norm=normalizeDigitCrop(raw,28,28);
      bank.set(hogDescriptor(norm),j*DIM);
    });
    byClass.push(bank);counts.push(selected.length);
  }
  return {byClass,counts};
}
export async function loadOrientationBank():Promise<OrientationBank>{
  // Un fallo de red no dispara múltiples descargas durante el mismo análisis.
  if(!loaded)loaded=prepareBank();
  return loaded;
}
