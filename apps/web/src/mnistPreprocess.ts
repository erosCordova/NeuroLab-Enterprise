/** Preprocesado de fotografías para modelos entrenados con dígitos MNIST de 28×28. */
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export function normalizeMnistPixels(gray:Float32Array,width:number,height:number):Float32Array{
  if(width<1||height<1||gray.length!==width*height||!gray.every(Number.isFinite))
    throw new Error("No se pudo leer una imagen válida.");
  if(width===28&&height===28){
    // Las imágenes oficiales de MNIST ya tienen la geometría y resolución correctas.
    const output=new Float32Array(gray),avg=output.reduce((s,v)=>s+v,0)/output.length;
    if(avg>.55)for(let i=0;i<output.length;i++)output[i]=1-clamp(output[i]);
    return output;
  }
  const n=width*height;
  // Filtrado suave 3x3: atenúa ruido aislado sin borrar los trazos del bolígrafo.
  const source=new Float32Array(gray);
  if(width>=80&&height>=80){
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
      const i=y*width+x;
      source[i]=(gray[i]*4+
        2*(gray[i-1]+gray[i+1]+gray[i-width]+gray[i+width])+
        gray[i-width-1]+gray[i-width+1]+gray[i+width-1]+gray[i+width+1])/16;
    }
  }
  const border=Math.max(2,Math.min(12,Math.floor(Math.min(width,height)*.05)));
  let background=0,bgCount=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if(x<border||x>=width-border||y<border||y>=height-border){
      background+=source[y*width+x];bgCount++;
    }
  }
  background/=Math.max(1,bgCount);
  const light=background>=.5;
  // Fondo local corregido: elimina sombras suaves y la textura del papel.
  const stride=width+1,integral=new Float64Array((height+1)*stride);
  for(let y=0;y<height;y++){
    let row=0;
    for(let x=0;x<width;x++){
      row+=source[y*width+x];
      integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;
    }
  }
  const radius=Math.max(6,Math.min(40,Math.round(Math.min(width,height)*.18)));
  const contrast=new Float32Array(n);
  const positives:number[]=[];
  for(let y=0;y<height;y++){
    const y0=Math.max(0,y-radius),y1=Math.min(height,y+radius+1);
    for(let x=0;x<width;x++){
      const x0=Math.max(0,x-radius),x1=Math.min(width,x+radius+1);
      const local=(integral[y1*stride+x1]-integral[y0*stride+x1]-
        integral[y1*stride+x0]+integral[y0*stride+x0])/((x1-x0)*(y1-y0));
      const bg=.68*local+.32*background;
      const delta=Math.max(0,light?bg-source[y*width+x]:source[y*width+x]-bg);
      contrast[y*width+x]=delta;
      if(delta>.02)positives.push(delta);
    }
  }
  if(positives.length<16)throw new Error("No se detectó un número con suficiente contraste.");
  positives.sort((a,b)=>a-b);
  const peak=positives[Math.floor((positives.length-1)*.985)];
  if(peak<.065)throw new Error("El número tiene muy poco contraste. Acerca la cámara o mejora la iluminación.");
  // Umbral automático de Otsu sobre contraste: estable ante papel gris y sombras.
  const histogram=new Uint32Array(128);
  for(const value of contrast)histogram[Math.min(127,Math.floor(value*127))]++;
  let globalSum=0;
  for(let i=0;i<128;i++)globalSum+=i*histogram[i];
  let weight=0,partialSum=0,best=-1,bestIndex=0;
  for(let i=0;i<128;i++){
    weight+=histogram[i];partialSum+=i*histogram[i];
    if(!weight||weight===n)continue;
    const between=(globalSum*weight/n-partialSum)**2/(weight*(n-weight));
    if(between>best){best=between;bestIndex=i;}
  }
  const otsu=bestIndex/127;
  const threshold=Math.max(.023,Math.min(peak*.29,otsu*.76));
  const ink=new Float32Array(n),mask=new Uint8Array(n);
  for(let i=0;i<n;i++){
    const p=clamp((contrast[i]-threshold)/Math.max(.04,peak-threshold));
    ink[i]=p;
    if(p>=.18)mask[i]=1;
  }

  // Retirar puntos y ruido lejos del trazo principal sin suponer qué dígito representa.
  const visited=new Uint8Array(n),stack=new Int32Array(n);
  let largest:number[]=[],components:number[][]=[];
  for(let i=0;i<n;i++){
    if(!mask[i]||visited[i])continue;
    let len=0;stack[len++]=i;visited[i]=1;
    const points:number[]=[];
    while(len){
      const p=stack[--len],x=p%width,y=Math.floor(p/width);
      points.push(p);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;
        const nx=x+dx,ny=y+dy;
        if(nx<0||nx>=width||ny<0||ny>=height)continue;
        const q=ny*width+nx;
        if(mask[q]&&!visited[q]){visited[q]=1;stack[len++]=q;}
      }
    }
    components.push(points);
    if(points.length>largest.length)largest=points;
  }
  if(largest.length<Math.max(12,Math.floor(n*.00035)))
    throw new Error("No se detectó claramente un dígito. Encuádralo de forma individual.");
  let xMin=width,yMin=height,xMax=0,yMax=0;
  for(const i of largest){const x=i%width,y=Math.floor(i/width);xMin=Math.min(xMin,x);xMax=Math.max(xMax,x);yMin=Math.min(yMin,y);yMax=Math.max(yMax,y);}
  // Conservar trazos separados próximos a la figura principal; descartar ruido aislado.
  const allowed=new Uint8Array(n);
  for(const component of components){
    if(component!==largest&&component.length<Math.max(8,largest.length*.1))continue;
    let near=component===largest;
    if(!near)for(const i of component){
      const x=i%width,y=Math.floor(i/width);
      if(x>=xMin-width*.06&&x<=xMax+width*.06&&y>=yMin-height*.06&&y<=yMax+height*.06){near=true;break;}
    }
    if(near)for(const i of component){allowed[i]=1;const x=i%width,y=Math.floor(i/width);
      xMin=Math.min(xMin,x);xMax=Math.max(xMax,x);yMin=Math.min(yMin,y);yMax=Math.max(yMax,y);}
  }
  // Incluir antialiasing pegado a los trazos, sin recuperar el fondo.
  const strength=new Float32Array(n);
  for(let y=Math.max(0,yMin-2);y<=Math.min(height-1,yMax+2);y++)
    for(let x=Math.max(0,xMin-2);x<=Math.min(width-1,xMax+2);x++){
      const i=y*width+x;if(allowed[i]){strength[i]=ink[i];continue;}
      if(ink[i]<.07)continue;
      outer:for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy;
        if(nx>=0&&nx<width&&ny>=0&&ny<height&&allowed[ny*width+nx]){
          strength[i]=ink[i];break outer;
        }
      }
    }
  const bw=xMax-xMin+1,bh=yMax-yMin+1,scale=20/Math.max(bw,bh);
  const w=bw*scale,h=bh*scale;
  const left=(28-w)/2,top=(28-h)/2;
  const sample=(x:number,y:number)=>{
    if(x<0||y<0||x>width-1||y>height-1)return 0;
    const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1);
    const dx=x-x0,dy=y-y0;
    return (strength[y0*width+x0]*(1-dx)+strength[y0*width+x1]*dx)*(1-dy)+
      (strength[y1*width+x0]*(1-dx)+strength[y1*width+x1]*dx)*dy;
  };
  const output=new Float32Array(784);
  for(let y=0;y<28;y++)for(let x=0;x<28;x++){
    let total=0;
    for(let sy=0;sy<3;sy++)for(let sx=0;sx<3;sx++){
      const px=x+(sx+.5)/3,py=y+(sy+.5)/3;
      if(px<left||px>=left+w||py<top||py>=top+h)continue;
      const originX=xMin+(px-left)/scale-.5;
      const originY=yMin+(py-top)/scale-.5;
      total+=sample(originX,originY);
    }
    output[y*28+x]=clamp(total/9);
  }
  // MNIST está centrado por centro de masa, no solamente por su rectángulo.
  let sum=0,mx=0,my=0;
  for(let i=0;i<784;i++){const v=output[i];sum+=v;mx+=(i%28)*v;my+=Math.floor(i/28)*v;}
  if(sum<1)throw new Error("El número no se distingue claramente del fondo.");
  const moveX=Math.max(-3,Math.min(3,Math.round(13.5-mx/sum)));
  const moveY=Math.max(-3,Math.min(3,Math.round(13.5-my/sum)));
  if(!moveX&&!moveY)return output;
  const shifted=new Float32Array(784);
  for(let y=0;y<28;y++)for(let x=0;x<28;x++){
    const sx=x-moveX,sy=y-moveY;
    if(sx>=0&&sx<28&&sy>=0&&sy<28)shifted[y*28+x]=output[sy*28+sx];
  }
  return shifted;
}

export async function preprocessMnistPhotoWithMeta(file:File):Promise<{pixels:Float32Array;was28:boolean}>{
  const bitmap=await createImageBitmap(file);
  try{
    const ratio=Math.min(1,256/Math.max(bitmap.width,bitmap.height));
    const width=Math.max(1,Math.round(bitmap.width*ratio));
    const height=Math.max(1,Math.round(bitmap.height*ratio));
    const canvas=document.createElement("canvas");
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    if(!ctx)throw new Error("No se pudo leer el contenido de la imagen.");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
    ctx.drawImage(bitmap,0,0,width,height);
    const rgba=ctx.getImageData(0,0,width,height).data;
    const grayscale=new Float32Array(width*height);
    for(let i=0;i<grayscale.length;i++){
      const p=i*4;grayscale[i]=clamp((rgba[p]*.299+rgba[p+1]*.587+rgba[p+2]*.114)/255);
    }
    return {pixels:normalizeMnistPixels(grayscale,width,height),was28:bitmap.width===28&&bitmap.height===28};
  }finally{bitmap.close();}
}
export async function preprocessMnistPhoto(file:File):Promise<Float32Array>{
  return (await preprocessMnistPhotoWithMeta(file)).pixels;
}
