import { useEffect, useRef, useState } from "react";
import { normalizePixels } from "./pixels";
import type { ImageRecord } from "./cnn";

type Props = {image:ImageRecord;size:number;channels:number};
type Result = ReturnType<typeof normalizePixels>;

export default function InputPreview({image,size,channels}:Props) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [result,setResult]=useState<Result|null>(null);
  const [error,setError]=useState("");

  useEffect(()=>{
    let cancelled=false;
    setResult(null);
    setError("");

    async function prepare() {
      try {
        if(![28,32,64,128].includes(size)||![1,3].includes(channels)){
          throw new Error("Configura un tamaño y número de canales válidos en el diseñador.");
        }

        const bitmap=await createImageBitmap(image.file);

        try {
          const source=document.createElement("canvas");
          source.width=size;
          source.height=size;

          const context=source.getContext("2d",{willReadFrequently:true});
          if(!context)throw new Error("El navegador no permite procesar la imagen.");

          context.fillStyle="#000000";
          context.fillRect(0,0,size,size);
          context.imageSmoothingEnabled=true;
          context.imageSmoothingQuality="high";
          context.drawImage(bitmap,0,0,size,size);

          const pixels=context.getImageData(0,0,size,size);
          const next=normalizePixels(pixels.data,size,size,channels);

          if(cancelled)return;

          const destination=canvas.current?.getContext("2d");
          if(!destination)throw new Error("No se pudo mostrar la imagen procesada.");

          destination.putImageData(new ImageData(next.preview,size,size),0,0);
          setResult(next);
        } finally {
          bitmap.close();
        }
      } catch(cause) {
        if(!cancelled)setError(cause instanceof Error?cause.message:"No se pudo procesar.");
      }
    }

    void prepare();
    return ()=>{cancelled=true;};
  },[image.file,size,channels]);

  function exportTensor() {
    if(!result)return;

    const tensor={
      format:"neurolab-input-tensor",
      schemaVersion:1,
      sourceFile:image.file.name,
      sourceClass:image.label,
      originalShape:[image.height,image.width],
      shape:[size,size,channels],
      layout:"HWC",
      dtype:"float32",
      normalization:"divide_by_255",
      resize:"direct_resize_without_crop",
      transparencyBackground:"black",
      containsPredictions:false,
      data:Array.from(result.values),
    };

    const url=URL.createObjectURL(new Blob(
      [JSON.stringify(tensor)],
      {type:"application/json;charset=utf-8"}
    ));
    const link=document.createElement("a");
    link.href=url;
    link.download=`cnn-entrada-${size}x${size}-${channels}canales.json`;
    link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  return <section className="input-preview" aria-label="Preprocesamiento de la imagen">
    <h3>Entrada preprocesada para CNN</h3>
    <p className="caption">Configuración del diseñador: {size} × {size} · {channels===1?"escala de grises":"RGB"}.</p>

    <canvas
      ref={canvas}
      width={size}
      height={size}
      aria-label="Vista de la imagen redimensionada para la CNN"
    />

    {error&&<p className="error" role="alert">{error}</p>}
    {!result&&!error&&<p role="status">Preparando la entrada...</p>}

    {result&&<>
      <dl>
        <dt>Forma del tensor · alto × ancho × canales</dt>
        <dd>{size} × {size} × {channels}</dd>
        <dt>Cantidad de valores</dt>
        <dd>{result.values.length}</dd>
      </dl>
      <div className="input-stats">
        <div><small>Mínimo</small><strong>{result.minimum.toFixed(4)}</strong></div>
        <div><small>Máximo</small><strong>{result.maximum.toFixed(4)}</strong></div>
        <div><small>Media</small><strong>{result.mean.toFixed(4)}</strong></div>
      </div>
    </>}

    <button className="secondary" disabled={!result} onClick={exportTensor}>Exportar tensor JSON</button>

    <div className="soft input-note">
      Transformación real de esta imagen: redimensionado directo, fondo negro para transparencias,
      conversión de canales y normalización entre 0 y 1.
      No se modifica el archivo original ni se entrena la CNN.
      El procesamiento de todas las imágenes para entrenamiento todavía está pendiente.
    </div>
  </section>;
}
