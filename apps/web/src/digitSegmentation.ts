/**
 * Segmentación de manuscritos inspirada en el flujo de TecnoForms/Colab.
 * No clasifica componentes: conserva filas, recortes y etiqueta de orden.
 * El módulo es puro para poder probarlo sin navegador ni TensorFlow.
 */
export type DigitBox={x:number;y:number;width:number;height:number;row:number;position:number};
export type DigitRegion={box:DigitBox;pixels:Float32Array};
type Component={x:number;y:number;w:number;h:number;area:number;ids:number[]};

export function normalizeDigitCrop(ink:Float32Array,width:number,height:number):Float32Array{
  if(width<1||height<1||width*height!==ink.length||!ink.every(Number.isFinite))
    throw new Error("El recorte del dígito es inválido.");
  const side=20/Math.max(width,height),w=Math.max(1,Math.round(width*side)),h=Math.max(1,Math.round(height*side));
  const result=new Float32Array(784),left=Math.floor((28-w)/2),top=Math.floor((28-h)/2);
  const sample=(x:number,y:number)=>{
    if(x<0||y<0||x>=width||y>=height)return 0;
    const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),fx=x-x0,fy=y-y0;
    return (ink[y0*width+x0]*(1-fx)+ink[y0*width+x1]*fx)*(1-fy)+
      (ink[y1*width+x0]*(1-fx)+ink[y1*width+x1]*fx)*fy;
  };
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const sx=(x+.5)*width/w-.5,sy=(y+.5)*height/h-.5;
    result[(top+y)*28+left+x]=Math.max(0,Math.min(1,sample(Math.max(0,sx),Math.max(0,sy))));
  }
  let total=0,mx=0,my=0;
  for(let i=0;i<784;i++){const v=result[i];total+=v;mx+=(i%28)*v;my+=Math.floor(i/28)*v;}
  if(total<.45)throw new Error("No hay suficiente tinta para reconocer un número.");
  const dx=Math.max(-3,Math.min(3,Math.round(13.5-mx/total))),dy=Math.max(-3,Math.min(3,Math.round(13.5-my/total)));
  if(dx===0&&dy===0)return result;
  const moved=new Float32Array(784);
  for(let y=0;y<28;y++)for(let x=0;x<28;x++){
    const xx=x-dx,yy=y-dy;
    if(xx>=0&&xx<28&&yy>=0&&yy<28)moved[y*28+x]=result[yy*28+xx];
  }
  return moved;
}
function otsu(values:Float32Array):number{
  const bins=new Uint32Array(128);let sum=0;
  for(const v of values){const index=Math.min(127,Math.floor(Math.max(0,v)*127));bins[index]++;sum+=index;}
  let best=0,highest=0,weight=0,partial=0;
  for(let i=0;i<128;i++){
    weight+=bins[i];partial+=i*bins[i];
    if(!weight||weight===values.length)continue;
    const score=(sum*weight/values.length-partial)**2/(weight*(values.length-weight));
    if(score>highest){highest=score;best=i;}
  }
  return best/127;
}
function mergeFragments(regions:Component[]):Component[]{
  const list=regions.map(c=>({...c,ids:[...c.ids]}));
  let iterations=0,changed=true;
  while(changed&&++iterations<40){
    changed=false;
    for(let i=0;i<list.length&&!changed;i++)for(let j=i+1;j<list.length;j++){
      const a=list[i],b=list[j],overlap=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);
      const gap=Math.max(a.y,b.y)-Math.min(a.y+a.h,b.y+b.h);
      const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);
      const w=Math.max(a.x+a.w,b.x+b.w)-x,h=Math.max(a.y+a.h,b.y+b.h)-y;
      if(overlap>=.3*Math.min(a.w,b.w)&&gap<=.2*Math.max(a.h,b.h)&&
        (Math.min(a.h,b.h)<.7*Math.max(a.h,b.h)||gap>=0)&&
        h<=1.5*Math.max(a.h,b.h)&&w<=1.2*h){
        list[i]={x,y,w,h,area:a.area+b.area,ids:[...a.ids,...b.ids]};
        list.splice(j,1);changed=true;break;
      }
    }
  }
  return list;
}
function orderRows(regions:Component[]):Array<Component&{row:number}>{
  const rows:Component[][]=[];
  for(const region of [...regions].sort((a,b)=>(a.y+a.h/2)-(b.y+b.h/2))){
    let index=-1,score=0;
    rows.forEach((row,j)=>{
      const top=row.reduce((s,r)=>s+r.y,0)/row.length;
      const bottom=row.reduce((s,r)=>s+r.y+r.h,0)/row.length;
      const overlap=Math.max(0,Math.min(region.y+region.h,bottom)-Math.max(region.y,top));
      const share=overlap/Math.max(1,Math.min(region.h,bottom-top));
      if(share>=.3&&share>score){score=share;index=j;}
    });
    if(index<0)rows.push([region]);else rows[index].push(region);
  }
  rows.sort((a,b)=>Math.min(...a.map(r=>r.y))-Math.min(...b.map(r=>r.y)));
  return rows.flatMap((row,index)=>row.sort((a,b)=>a.x-b.x).map(r=>({...r,row:index+1})));
}
export function segmentDigitsFromGray(gray:Float32Array,width:number,height:number):DigitRegion[]{
  const total=width*height;
  if(width<16||height<16||total!==gray.length||total>3_000_000||!gray.every(v=>Number.isFinite(v)&&v>=0&&v<=1))
    throw new Error("Imagen inválida o demasiado grande para segmentar.");
  let border=0,count=0;
  const margin=Math.max(2,Math.round(Math.min(width,height)*.055));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)
    if(x<margin||x>=width-margin||y<margin||y>=height-margin){border+=gray[y*width+x];count++;}
  const light=border/Math.max(1,count)>.5;
  const normalized=new Float32Array(total);
  for(let i=0;i<total;i++)normalized[i]=light?gray[i]:1-gray[i];
  // Media local para eliminar sombras de una fotografía sin destruir trazos finos.
  const stride=width+1,integral=new Float64Array((height+1)*stride);
  for(let y=0;y<height;y++){
    let line=0;for(let x=0;x<width;x++){
      line+=normalized[y*width+x];
      integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+line;
    }
  }
  const radius=Math.max(5,Math.round(Math.min(width,height)*.12));
  const ink=new Float32Array(total);
  for(let y=0;y<height;y++){
    const y0=Math.max(0,y-radius),y1=Math.min(height,y+radius+1);
    for(let x=0;x<width;x++){
      const x0=Math.max(0,x-radius),x1=Math.min(width,x+radius+1);
      const local=(integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0])/((y1-y0)*(x1-x0));
      const i=y*width+x;
      ink[i]=Math.max(0,local-normalized[i]);
    }
  }
  const threshold=Math.max(.045,Math.min(.21,otsu(ink)*.78));
  const mask=new Uint8Array(total);
  let painted=0;
  for(let i=0;i<total;i++)if(ink[i]>=threshold){mask[i]=1;painted++;}
  if(painted<12)throw new Error("No se detectaron trazos con contraste suficiente.");
  const labels=new Int32Array(total),queue=new Int32Array(total),components:Component[]=[];
  const minimum=Math.max(4,Math.floor(total*.000008));
  let found=0;
  for(let i=0;i<total;i++){
    if(!mask[i]||labels[i])continue;
    const id=++found;labels[i]=id;
    let head=0,tail=1,xMin=width,yMin=height,xMax=0,yMax=0;
    queue[0]=i;
    while(head<tail){
      const p=queue[head++],x=p%width,y=Math.floor(p/width);
      xMin=Math.min(xMin,x);xMax=Math.max(xMax,x);yMin=Math.min(yMin,y);yMax=Math.max(yMax,y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;
        const nx=x+dx,ny=y+dy;
        if(nx<0||nx>=width||ny<0||ny>=height)continue;
        const q=ny*width+nx;
        if(mask[q]&&!labels[q]){labels[q]=id;queue[tail++]=q;}
      }
    }
    if(tail>=minimum&&yMax-yMin>=2&&xMax-xMin>=1){
      components.push({x:xMin,y:yMin,w:xMax-xMin+1,h:yMax-yMin+1,area:tail,ids:[id]});
    }
  }
  if(!components.length)throw new Error("No se encontraron números; ajusta el encuadre y el contraste.");
  if(components.length>80)throw new Error("Se detectaron demasiados trazos; recorta la zona de números.");
  const ordered=orderRows(mergeFragments(components));
  if(ordered.length>40)throw new Error("Máximo 40 regiones por imagen; utiliza un recorte más pequeño.");
  return ordered.map((region,i)=>{
    const {x,y,w,h,ids,row}=region;
    const relevant=new Set(ids);
    const crop=new Float32Array(w*h);
    let strongest=0;
    for(let cy=0;cy<h;cy++)for(let cx=0;cx<w;cx++){
      const index=(y+cy)*width+x+cx;
      if(relevant.has(labels[index]))strongest=Math.max(strongest,ink[index]);
    }
    const scale=Math.max(.08,strongest);
    for(let cy=0;cy<h;cy++)for(let cx=0;cx<w;cx++){
      const global=(y+cy)*width+x+cx;
      if(relevant.has(labels[global]))crop[cy*w+cx]=Math.min(1,ink[global]/scale);
    }
    return {box:{x,y,width:w,height:h,row,position:i+1},pixels:normalizeDigitCrop(crop,w,h)};
  });
}
/** El procesamiento de fotografías se hace en memoria, sin enviar datos a otro servidor. */
export async function segmentDigitsFromFile(file:File):Promise<DigitRegion[]>{
  const bitmap=await createImageBitmap(file);
  try{
    if(bitmap.width*bitmap.height>40_000_000)throw new Error("Reduce la imagen a menos de 40 megapíxeles.");
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const width=Math.max(16,Math.round(bitmap.width*scale));
    const height=Math.max(16,Math.round(bitmap.height*scale));
    const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    if(!ctx)throw new Error("No se pudo leer la imagen para separar números.");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);
    ctx.drawImage(bitmap,0,0,width,height);
    const rgba=ctx.getImageData(0,0,width,height).data;
    const gray=new Float32Array(width*height);
    for(let i=0;i<gray.length;i++){
      const j=i*4;gray[i]=(rgba[j]*.299+rgba[j+1]*.587+rgba[j+2]*.114)/255;
    }
    return segmentDigitsFromGray(gray,width,height);
  }finally{bitmap.close();}
}
