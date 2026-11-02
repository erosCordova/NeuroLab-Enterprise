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
  let peak=0;
  for(const v of ink)peak=Math.max(peak,v);
  if(peak<=0)throw new Error("No hay tinta para reconocer un número.");
  // El Colab elimina el margen vacío ANTES del ajuste a 20 × 20.
  const threshold=Math.max(.00004,peak*.005);
  let minX=width,minY=height,maxX=-1,maxY=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)
    if(ink[y*width+x]>threshold){
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);
      minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
  if(maxX<minX||maxY<minY)throw new Error("No se encontraron trazos útiles.");
  const bw=maxX-minX+1,bh=maxY-minY+1;
  const scale=20/Math.max(bw,bh);
  const w=Math.max(1,Math.round(bw*scale)),h=Math.max(1,Math.round(bh*scale));
  const result=new Float32Array(784),left=Math.floor((28-w)/2),top=Math.floor((28-h)/2);
  const at=(x:number,y:number)=>{
    const xx=Math.max(0,Math.min(bw-1,x)),yy=Math.max(0,Math.min(bh-1,y));
    return ink[(minY+yy)*width+minX+xx];
  };
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let value=0;
    if(scale<1){
      // INTER_AREA de OpenCV: promedio ponderado del área fuente para reducir
      // fotografías sin perder grosor ni partes del trazo.
      const x0=x*bw/w,x1=(x+1)*bw/w,y0=y*bh/h,y1=(y+1)*bh/h;
      for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++)for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){
        const area=Math.max(0,Math.min(x1,sx+1)-Math.max(x0,sx))*
          Math.max(0,Math.min(y1,sy+1)-Math.max(y0,sy));
        if(area>0)value+=at(sx,sy)*area;
      }
      value/=(x1-x0)*(y1-y0);
    }else{
      const sx=(x+.5)*bw/w-.5,sy=(y+.5)*bh/h-.5;
      const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
      value=(at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+
        (at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;
    }
    result[(top+y)*28+left+x]=Math.max(0,Math.min(1,value));
  }
  let total=0,mx=0,my=0;
  for(let i=0;i<784;i++){const v=result[i];total+=v;mx+=(i%28)*v;my+=Math.floor(i/28)*v;}
  if(total<.1)throw new Error("No hay suficiente tinta para reconocer un número.");
  const dx=Math.max(-left,Math.min(28-left-w,13.5-mx/total));
  const dy=Math.max(-top,Math.min(28-top-h,13.5-my/total));
  if(Math.abs(dx)<.001&&Math.abs(dy)<.001)return result;
  const moved=new Float32Array(784);
  for(let y=0;y<28;y++)for(let x=0;x<28;x++){
    const sx=x-dx,sy=y-dy;
    if(sx<0||sx>27||sy<0||sy>27)continue;
    const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(27,x0+1),y1=Math.min(27,y0+1);
    const fx=sx-x0,fy=sy-y0;
    moved[y*28+x]=(result[y0*28+x0]*(1-fx)+result[y0*28+x1]*fx)*(1-fy)+
      (result[y1*28+x0]*(1-fx)+result[y1*28+x1]*fx)*fy;
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
  // Otsu global sobre tinta original, como Colab. El antiguo filtrado de
  // media local destruye el trazo fino del bolígrafo en fotografías.
  const ink=new Float32Array(total);
  for(let i=0;i<total;i++)ink[i]=1-normalized[i];
  const threshold=otsu(ink);
  const mask=new Uint8Array(total);
  let painted=0;
  for(let i=0;i<total;i++)if(ink[i]>threshold){mask[i]=1;painted++;}
  if(painted<12)throw new Error("No se detectaron trazos con contraste suficiente.");
  const labels=new Int32Array(total),queue=new Int32Array(total),components:Component[]=[];
  const minimum=Math.max(3,Math.ceil(total*.000003));
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
    if(tail>=minimum&&yMax-yMin>=2&&!(xMax-xMin>=width*.98&&yMax-yMin>=height*.98)){
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
    // Recuperar intensidad de grises real con antialiasing 3×3 cercano,
    // sin arrastrar píxeles pertenecientes a otra componente.
    for(let cy=0;cy<h;cy++)for(let cx=0;cx<w;cx++){
      const global=(y+cy)*width+x+cx;
      const label=labels[global];
      if(label!==0&&!relevant.has(label))continue;
      let near=false;
      for(let sy=Math.max(0,cy-1);sy<=Math.min(h-1,cy+1)&&!near;sy++)
        for(let sx=Math.max(0,cx-1);sx<=Math.min(w-1,cx+1);sx++)
          if(relevant.has(labels[(y+sy)*width+x+sx])){near=true;break;}
      if(near)crop[cy*w+cx]=ink[global];
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
