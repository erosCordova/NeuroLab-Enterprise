/**
 * Importador MNIST desde el espejo público CVDF/GCS.
 * Conserva píxeles u8; los float32 se crean SOLO en el batch de entrenamiento.
 * Se admiten solo dos enlaces del origen MNIST reconocido, no URLs arbitrarias.
 */
export const MNIST_REPOSITORY="https://github.com/cvdfoundation/mnist";
const GCS="https://storage.googleapis.com/cvdf-datasets/mnist/";
const SOURCES=[
  ["train-images-idx3-ubyte.gz",60000*784+16],
  ["train-labels-idx1-ubyte.gz",60000+8],
  ["t10k-images-idx3-ubyte.gz",10000*784+16],
  ["t10k-labels-idx1-ubyte.gz",10000+8],
] as const;
export type MnistLimit=1000|10000|60000;
export type MnistData={
  kind:"mnist-idx";
  source:string;
  trainPixels:Uint8Array;
  trainLabels:Uint8Array;
  testPixels:Uint8Array;
  testLabels:Uint8Array;
  limit:MnistLimit;
};
export type ImportProgress={file:string;step:number;total:number;received:number;expected:number};
export function validateMnistUrl(value:string) {
  const normalized=value.trim().replace(/\/+$/,"").toLowerCase();
  if(normalized===MNIST_REPOSITORY || normalized===MNIST_REPOSITORY+"/tree/master" ||
     normalized===MNIST_REPOSITORY+"/tree/main" ||
     normalized===GCS.slice(0,-1))return MNIST_REPOSITORY;
  throw new Error("Por seguridad, la importación de esta versión admite únicamente el repositorio público cvdfoundation/mnist o su espejo oficial de Google Storage.");
}

function u32(view:DataView,offset:number){return view.getUint32(offset,false);}
export function parseIdxImages(raw:Uint8Array,count:number) {
  if(raw.byteLength!==16+count*784)throw new Error("El archivo IDX de imágenes tiene un tamaño inesperado.");
  const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
  if(u32(view,0)!==2051 || u32(view,4)!==count || u32(view,8)!==28 || u32(view,12)!==28)
    throw new Error("El encabezado IDX de imágenes es inválido: se requieren dígitos de 28×28.");
  return raw.subarray(16);
}
export function parseIdxLabels(raw:Uint8Array,count:number) {
  if(raw.byteLength!==8+count)throw new Error("El archivo IDX de etiquetas tiene un tamaño inesperado.");
  const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
  if(u32(view,0)!==2049||u32(view,4)!==count)
    throw new Error("El encabezado IDX de etiquetas es inválido.");
  const data=raw.subarray(8);
  if(data.some(d=>d>9))throw new Error("Las etiquetas MNIST deben estar entre 0 y 9.");
  return data;
}

async function readGzip(url:string,expected:number,signal:AbortSignal|undefined,progress:(received:number)=>void) {
  if(typeof DecompressionStream==="undefined")throw new Error("Este navegador no permite descomprimir gzip mediante DecompressionStream.");
  const response=await fetch(url,{method:"GET",mode:"cors",credentials:"omit",signal,cache:"force-cache"});
  if(!response.ok || !response.body)throw new Error("No se pudo descargar MNIST ("+response.status+"). Revisa la conexión y el acceso CORS.");
  const decoded=response.body.pipeThrough(new DecompressionStream("gzip"));
  const reader=decoded.getReader();
  const target=new Uint8Array(expected);
  let total=0;
  try {
    for(;;){
      if(signal?.aborted)throw new DOMException("Importación cancelada.","AbortError");
      const {done,value}=await reader.read();
      if(done)break;
      if(total+value.length>expected)throw new Error("El archivo MNIST excede el tamaño permitido.");
      target.set(value,total);total+=value.length;
      progress(total);
    }
  }finally{reader.releaseLock();}
  if(total!==expected)throw new Error("El archivo MNIST está incompleto.");
  return target;
}

export async function importMnist(link:string,limit:MnistLimit,onProgress:(value:ImportProgress)=>void,signal?:AbortSignal):Promise<MnistData> {
  const source=validateMnistUrl(link);
  if(!([1000,10000,60000] as number[]).includes(limit))throw new Error("Selecciona un volumen MNIST admitido.");
  const data:Uint8Array[]=[];
  for(let i=0;i<SOURCES.length;i++){
    const [file,expected]=SOURCES[i];
    const raw=await readGzip(GCS+file,expected,signal,received=>onProgress({file,step:i+1,total:4,received,expected}));
    data.push(raw);
  }
  const [trainRaw,trainLabelsRaw,testRaw,testLabelsRaw]=data;
  return {kind:"mnist-idx",source,
    trainPixels:parseIdxImages(trainRaw,60000),
    trainLabels:parseIdxLabels(trainLabelsRaw,60000),
    testPixels:parseIdxImages(testRaw,10000),
    testLabels:parseIdxLabels(testLabelsRaw,10000),
    limit};
}
export function selectMnistIndices(labels:Uint8Array,count:number,seed:number) {
  if(!Number.isInteger(count)||count<10||count>labels.length)throw new Error("Cantidad MNIST fuera de rango.");
  const groups=Array.from({length:10},()=>[] as number[]);
  for(let i=0;i<labels.length;i++)groups[labels[i]].push(i);
  let rng=seed>>>0;
  const random=()=>{rng=(Math.imul(1664525,rng)+1013904223)>>>0;return rng/4294967296;};
  const result:number[]=[];
  for(let digit=0;digit<10;digit++){
    const group=groups[digit];
    for(let k=group.length-1;k>0;k--){
      const other=Math.floor(random()*(k+1));
      [group[k],group[other]]=[group[other],group[k]];
    }
    const target=Math.floor(count/10)+(digit<count%10?1:0);
    if(group.length<target)throw new Error("MNIST no contiene suficientes ejemplos de una clase.");
    result.push(...group.slice(0,target));
  }
  for(let k=result.length-1;k>0;k--){
    const other=Math.floor(random()*(k+1));
    [result[k],result[other]]=[result[other],result[k]];
  }
  return result;
}
export function partitionMnist(data:MnistData,seed=42) {
  const ordered=selectMnistIndices(data.trainLabels,data.limit,seed);
  const valSize=Math.max(10,Math.round(data.limit*.1));
  return {train:ordered.slice(valSize),validation:ordered.slice(0,valSize),
    test:Array.from({length:data.testLabels.length},(_,index)=>index)};
}
export async function mnistFingerprint(source:string,limit:MnistLimit,seed=42) {
  const bytes=new TextEncoder().encode("mnist-cvdf-idx-v1:"+source+":"+limit+":"+seed);
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,"0")).join("");
}
