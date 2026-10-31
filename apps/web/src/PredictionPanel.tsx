import {useEffect,useRef,useState} from "react";
import "./prediction-panel.css";

export type Prediction={clase:string;probabilidad:number};
type Props={
  inputLabel:string;
  inputAriaLabel:string;
  disabled?:boolean;
  digitMode?:boolean;
  onPredict:(file:File)=>Promise<Prediction[]>;
};

export default function PredictionPanel({inputLabel,inputAriaLabel,disabled=false,digitMode=false,onPredict}:Props){
  const [preview,setPreview]=useState<string|null>(null);
  const [fileName,setFileName]=useState("");
  const [predictions,setPredictions]=useState<Prediction[]>([]);
  const [predicting,setPredicting]=useState(false);
  const [error,setError]=useState("");
  const [domainWarning,setDomainWarning]=useState("");
  const urlRef=useRef<string|null>(null);
  const requestRef=useRef(0);

  useEffect(()=>()=>{requestRef.current++;if(urlRef.current)URL.revokeObjectURL(urlRef.current);},[]);

  async function onFile(file:File){
    const request=++requestRef.current;
    setPredictions([]);setError("");setDomainWarning("");setFileName(file.name);
    if(urlRef.current)URL.revokeObjectURL(urlRef.current);
    urlRef.current=null;setPreview(null);
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)){
      setError("Selecciona una imagen PNG, JPG o WebP.");return;
    }
    if(file.size>15*1024*1024){
      setError("La imagen supera el límite de 15 MB.");return;
    }
    const url=URL.createObjectURL(file);
    urlRef.current=url;setPreview(url);setPredicting(true);
    try{
      const next=await onPredict(file);
      if(request!==requestRef.current)return;
      if(!next.length||!next.every(p=>Number.isFinite(p.probabilidad)&&p.probabilidad>=0)){
        throw new Error("No se pudieron obtener probabilidades válidas.");
      }
      setPredictions([...next].sort((a,b)=>b.probabilidad-a.probabilidad));
    }catch(cause){
      if(request===requestRef.current){
        if(cause instanceof Error&&cause.name==="PredictionDomainError")setDomainWarning(cause.message);
        else setError(cause instanceof Error?cause.message:"No se pudo reconocer la imagen.");
      }
    }finally{if(request===requestRef.current)setPredicting(false);}
  }

  const top=predictions[0];
  return <div className="nl-prediction" aria-label="Predicción de imagen">
    <label className="field nl-prediction-input">
      <span>{inputLabel}</span>
      <input aria-label={inputAriaLabel} type="file" accept="image/png,image/jpeg,image/webp"
        disabled={disabled||predicting} onChange={e=>{
          const file=e.target.files?.[0];e.target.value="";
          if(file)void onFile(file);
        }}/>
    </label>
    {preview&&<div className="nl-prediction-layout" role="region" aria-label="Resultado de predicción">
      <div className="nl-prediction-image">
        <img src={preview} alt={"Imagen seleccionada: "+fileName}/>
      </div>
      <div className="nl-prediction-outcome">
        <span className="nl-prediction-eyebrow">{digitMode?"Número detectado":"Clase detectada"}</span>
        {predicting?<p className="nl-prediction-wait" role="status">Analizando imagen…</p>:
        domainWarning?<><strong className="nl-prediction-class uncertain">No concluyente</strong><p className="nl-prediction-wait" role="alert">{domainWarning}</p></>:
        top?<><strong className={"nl-prediction-class "+(digitMode?"digit":"")}>{top.clase}</strong>
          <div className="nl-prediction-confidence">
            <span>Confianza del modelo</span>
            <strong>{(top.probabilidad*100).toFixed(2)}%</strong>
          </div>
          <div className="nl-prediction-track" aria-hidden="true">
            <span style={{width:(Math.max(0,Math.min(1,top.probabilidad))*100)+"%"}}/>
          </div></>:<p className="nl-prediction-wait">Sin resultado</p>}
      </div>
    </div>}
    {error&&<p className="error" role="alert">{error}</p>}
    {top&&<details className="nl-prediction-details">
      <summary>Ver detalles</summary>
      <div className="nl-prediction-detail-list">
        {predictions.map(item=><div className="nl-prediction-detail-row" key={item.clase}>
          <span>{item.clase}</span>
          <div className="nl-prediction-detail-track" aria-hidden="true">
            <span style={{width:(Math.max(0,Math.min(1,item.probabilidad))*100)+"%"}}/>
          </div>
          <strong>{(item.probabilidad*100).toFixed(2)}%</strong>
        </div>)}
      </div>
    </details>}
  </div>;
}
