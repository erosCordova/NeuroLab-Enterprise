/** Variaciones ligeras para generalizar desde MNIST a escritura de distintas personas.
 * Solo se aplica al entrenamiento. Validación y prueba conservan los datos oficiales.
 */
export function augmentMnistPixels(source:Float32Array,random:()=>number=Math.random):Float32Array{
  if(source.length!==784)throw new Error("MNIST requiere 784 píxeles.");
  const dx=(random()*2-1)*2;
  const dy=(random()*2-1)*2;
  const angle=(random()*2-1)*.16;
  const zoom=.92+random()*.16;
  const brightness=.9+random()*.2;
  const cos=Math.cos(angle)/zoom,sin=Math.sin(angle)/zoom;
  const result=new Float32Array(784);
  for(let y=0;y<28;y++)for(let x=0;x<28;x++){
    const cx=x-13.5-dx,cy=y-13.5-dy;
    const sx=cos*cx+sin*cy+13.5,sy=-sin*cx+cos*cy+13.5;
    if(sx<0||sy<0||sx>=27||sy>=27)continue;
    const x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0,i=y0*28+x0;
    const value=(source[i]*(1-fx)+source[i+1]*fx)*(1-fy)+
      (source[i+28]*(1-fx)+source[i+29]*fx)*fy;
    result[y*28+x]=Math.min(1,Math.max(0,value*brightness));
  }
  return result;
}
/** Promediar perturbaciones de un píxel estabiliza la predicción de una foto sin alterar los pesos. */
export function mnistInferenceViews(source:Float32Array):Float32Array[]{
  if(source.length!==784)throw new Error("MNIST requiere 784 píxeles.");
  const shifts:[[number,number],[number,number],[number,number],[number,number],[number,number]]=
    [[0,0],[1,0],[-1,0],[0,1],[0,-1]];
  return shifts.map(([dx,dy])=>{
    const result=new Float32Array(784);
    for(let y=0;y<28;y++)for(let x=0;x<28;x++){
      const sx=x-dx,sy=y-dy;
      if(sx>=0&&sx<28&&sy>=0&&sy<28)result[y*28+x]=source[sy*28+sx];
    }
    return result;
  });
}
