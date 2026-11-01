/**
 * Transformaciones afines de MNIST en 28 × 28, sin modificar el original.
 * Se mantienen las etiquetas: las rotaciones máximas son deliberadamente
 * moderadas para no convertir un 6 en un 9 (o viceversa).
 */
const SIZE=28,PIXELS=SIZE*SIZE,CENTER=(SIZE-1)/2;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const check=(source:Float32Array)=>{
  if(source.length!==PIXELS||!source.every(v=>Number.isFinite(v)&&v>=0&&v<=1))
    throw new Error("MNIST requiere 784 píxeles válidos entre 0 y 1.");
};
const sample=(pixels:Float32Array,x:number,y:number)=>{
  if(x<0||y<0||x>SIZE-1||y>SIZE-1)return 0;
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(SIZE-1,x0+1),y1=Math.min(SIZE-1,y0+1);
  const fx=x-x0,fy=y-y0;
  return (pixels[y0*SIZE+x0]*(1-fx)+pixels[y0*SIZE+x1]*fx)*(1-fy)+
    (pixels[y1*SIZE+x0]*(1-fx)+pixels[y1*SIZE+x1]*fx)*fy;
};
/** Inverse mapping + interpolación bilineal (sin CSS ni depender de Canvas). */
export function transformMnistPixels(
  source:Float32Array,angle=0,dx=0,dy=0,zoom=1,shear=0,
):Float32Array{
  check(source);
  if([angle,dx,dy,zoom,shear].some(v=>!Number.isFinite(v))||zoom<.75||zoom>1.25||
    Math.abs(angle)>Math.PI/3||Math.abs(shear)>.75)
    throw new Error("Transformación de imagen MNIST fuera de rango.");
  if(angle===0&&dx===0&&dy===0&&zoom===1&&shear===0)return new Float32Array(source);
  const cos=Math.cos(angle)/zoom,sin=Math.sin(angle)/zoom;
  const result=new Float32Array(PIXELS);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const cx=x-CENTER-dx,cy=y-CENTER-dy;
    const sx=cos*cx+sin*cy+shear*cy+CENTER;
    const sy=-sin*cx+cos*cy+CENTER;
    result[y*SIZE+x]=clamp(sample(source,sx,sy));
  }
  return result;
}
/** Desinclina la escritura estimando su pendiente por momentos centrales.
 * Si la geometría no permite estimarla con seguridad, no transforma nada.
 */
export function estimateMnistSlant(source:Float32Array):number{
  check(source);
  let total=0,mx=0,my=0;
  for(let i=0;i<PIXELS;i++){
    const v=Math.max(0,source[i]-.12);
    total+=v;mx+=(i%SIZE)*v;my+=Math.floor(i/SIZE)*v;
  }
  if(total<3)return 0;
  mx/=total;my/=total;
  let xy=0,yy=0;
  for(let i=0;i<PIXELS;i++){
    const v=Math.max(0,source[i]-.12);
    const y=Math.floor(i/SIZE);
    xy+=v*((i%SIZE)-mx)*(y-my);
    yy+=v*(y-my)*(y-my);
  }
  if(yy<8)return 0;
  const skew=xy/yy;
  return Math.abs(skew)<.075?0:Math.max(-.65,Math.min(.65,skew));
}
export function deskewMnistPixels(source:Float32Array):Float32Array{
  const skew=estimateMnistSlant(source);
  return skew?transformMnistPixels(source,0,0,0,1,skew):new Float32Array(source);
}
/** Aumento de datos SOLO del entrenamiento: giros moderados, desplazamiento,
 * escala y escritura sesgada; jamás se aplica a validación/prueba.
 */
export function augmentMnistPixels(source:Float32Array,random:()=>number=Math.random):Float32Array{
  check(source);
  const dx=(random()*2-1)*2;
  const dy=(random()*2-1)*2;
  const angle=(random()*2-1)*(Math.PI*24/180);
  const zoom=.91+random()*.18;
  const shear=(random()*2-1)*.24;
  const brightness=.90+random()*.20;
  const warped=transformMnistPixels(source,angle,dx,dy,zoom,shear);
  for(let i=0;i<PIXELS;i++)warped[i]=clamp(warped[i]*brightness);
  return warped;
}
export type MnistView={pixels:Float32Array;weight:number;kind:string};
/**
 * TTA para fotos o imágenes nuevas. Conserva la entrada original como vista
 * principal y combina transformaciones con pesos no negativos y normalizados.
 * No inventa información ni cambia los pesos de la CNN ya entrenada.
 */
export function mnistInferenceVariants(source:Float32Array):MnistView[]{
  check(source);
  const raw:Array<{pixels:Float32Array;weight:number;kind:string}>=[
    {pixels:new Float32Array(source),weight:8,kind:"original"},
  ];
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    raw.push({pixels:transformMnistPixels(source,0,dx,dy),weight:1,kind:"desplazamiento"});
  }
  for(const degrees of [-24,-12,12,24]){
    raw.push({pixels:transformMnistPixels(source,degrees*Math.PI/180),weight:1.4,kind:"rotación"});
  }
  if(estimateMnistSlant(source)!==0){
    raw.push({pixels:deskewMnistPixels(source),weight:3,kind:"inclinación corregida"});
  }
  const sum=raw.reduce((a,v)=>a+v.weight,0);
  return raw.map(v=>({...v,weight:v.weight/sum}));
}
/** API anterior: útil para inspección y tests sin información de pesos. */
export function mnistInferenceViews(source:Float32Array):Float32Array[]{
  return mnistInferenceVariants(source).map(item=>item.pixels);
}

/** No omitir la robustez en un PNG de 28×28 si ya presenta inclinación notable. */
export function shouldUseMnistRobustInference(was28:boolean,pixels:Float32Array):boolean{
  return !was28||Math.abs(estimateMnistSlant(pixels))>=.18;
}
