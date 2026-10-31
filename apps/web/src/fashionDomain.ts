import {FASHION_LABELS_ES} from "./mnistDataset.ts";

/** Detecta una distribución de entrada incompatible; no inventa una clase. */
export class PredictionDomainError extends Error {
  constructor(reason:string) {
    super(reason+" Fashion-MNIST no está entrenado para fotografías reales. Para reconocer fotos de ropa, carga fotografías por clase y entrena otro modelo CNN.");
    this.name="PredictionDomainError";
  }
}

export function isFashionMnistClassifier(classes:readonly string[]):boolean {
  return classes.length===FASHION_LABELS_ES.length&&
    FASHION_LABELS_ES.every((name,index)=>classes[index]===name);
}

/** Comprobación conservadora, no un detector OOD estadísticamente calibrado. */
export function fashionDomainIssue(width:number,height:number,rgba?:ArrayLike<number>):string|null {
  if(width!==28||height!==28) {
    return "La imagen no tiene el formato oficial de 28 × 28 píxeles.";
  }
  if(!rgba||rgba.length!==28*28*4) {
    return "No se pudo comprobar la escala de grises de la imagen.";
  }
  let colourPixels=0,opaquePixels=0,cornerBrightness=0,cornerCount=0;
  for(let y=0;y<28;y++){
    for(let x=0;x<28;x++){
      const i=(y*28+x)*4;
      const r=rgba[i],g=rgba[i+1],b=rgba[i+2],alpha=rgba[i+3];
      if(alpha<250)return "La imagen tiene transparencia incompatible con los originales.";
      opaquePixels++;
      if(Math.max(r,g,b)-Math.min(r,g,b)>20)colourPixels++;
      if((x<5||x>=23)&&(y<5||y>=23)){
        cornerBrightness+=(r+g+b)/3;
        cornerCount++;
      }
    }
  }
  if(colourPixels/opaquePixels>.03)return "La imagen contiene colores que no aparecen en las muestras oficiales en escala de grises.";
  if(cornerBrightness/cornerCount>85)return "El fondo es demasiado claro respecto a las imágenes originales de Fashion-MNIST.";
  return null;
}

export async function assertFashionMnistInput(file:File):Promise<void>{
  const bitmap=await createImageBitmap(file);
  try{
    // La fotografía real se rechaza antes de redimensionarla: cambiarle el tamaño
    // no la convierte en una muestra de la distribución de entrenamiento.
    if(bitmap.width!==28||bitmap.height!==28){
      throw new PredictionDomainError("La imagen es una fotografía o archivo de tamaño distinto de 28 × 28.");
    }
    const canvas=document.createElement("canvas");
    canvas.width=28;canvas.height=28;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    if(!ctx)throw new Error("No se pudo verificar el formato de Fashion-MNIST.");
    ctx.drawImage(bitmap,0,0);
    const issue=fashionDomainIssue(28,28,ctx.getImageData(0,0,28,28).data);
    if(issue)throw new PredictionDomainError(issue);
  }finally{bitmap.close();}
}
