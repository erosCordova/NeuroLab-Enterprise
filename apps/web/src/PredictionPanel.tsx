import {useEffect,useRef,useState} from "react";
import "./prediction-panel.css";
import type {MultiDigitPrediction} from "./multiDigitInference";

export type Prediction={clase:string;probabilidad:number};
type Props={
  inputLabel:string;
  inputAriaLabel:string;
  disabled?:boolean;
  digitMode?:boolean;
  onPredict:(file:File)=>Promise<Prediction[]|MultiDigitPrediction>;
};

export default function PredictionPanel({inputLabel,inputAriaLabel,disabled=false,digitMode=false,onPredict}:Props){
  const [preview,setPreview]=useState<string|null>(null);
  const [fileName,setFileName]=useState("");
  const [predictions,setPredictions]=useState<Prediction[]>([]);
  const [multi,setMulti]=useState<MultiDigitPrediction|null>(null);
  const [predicting,setPredicting]=useState(false);
  const [error,setError]=useState("");
  const [domainWarning,setDomainWarning]=useState("");
  const [showAnnotated,setShowAnnotated]=useState(true);
  const urlRef=useRef<string|null>(null);
  const requestRef=useRef(0);

  useEffect(()=>()=>{requestRef.current++;if(urlRef.current)URL.revokeObjectURL(urlRef.current);},[]);

  async function onFile(file:File){
    const request=++requestRef.current;
    setPredictions([]);setMulti(null);setError("");setDomainWarning("");setShowAnnotated(true);setFileName(file.name);
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
      const values=Array.isArray(next)?next:next.predictions;
      if(!values.length||!values.every(p=>Number.isFinite(p.probabilidad)&&p.probabilidad>=0)){
        throw new Error("No se pudieron obtener probabilidades válidas.");
      }
      setMulti(Array.isArray(next)?null:next);
      setPredictions([...values].sort((a,b)=>b.probabilidad-a.probabilidad));
    }catch(cause){
      if(request===requestRef.current){
        if(cause instanceof Error&&cause.name==="PredictionDomainError")setDomainWarning(cause.message);
        else setError(cause instanceof Error?cause.message:"No se pudo reconocer la imagen.");
      }
    }finally{if(request===requestRef.current)setPredicting(false);}
  }

  const top=predictions[0];
  const multiNumber=Boolean(multi&&multi.digits.length>1);
  const display=multi?.digits[0]?.digit??top?.clase;
  const rows=multi?[...new Set(multi.digits.map(d=>d.row))].sort((a,b)=>a-b):[];
  const annotated=Boolean(multiNumber&&showAnnotated&&multi?.annotatedImage);
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
      <div className={"nl-prediction-image "+(multiNumber?"nl-prediction-image-multi":"")}>
        <img src={annotated?multi!.annotatedImage:preview}
          alt={annotated?"Fotografía con recuadros, números de región y dígitos predichos":"Imagen seleccionada: "+fileName}/>
        {multiNumber&&<div className="nl-image-switch" role="group" aria-label="Visualización de la fotografía">
          <button type="button" aria-pressed={showAnnotated} onClick={()=>setShowAnnotated(true)}>Regiones detectadas</button>
          <button type="button" aria-pressed={!showAnnotated} onClick={()=>setShowAnnotated(false)}>Original</button>
        </div>}
      </div>
      <div className="nl-prediction-outcome">
        <span className="nl-prediction-eyebrow">{multiNumber?"ANÁLISIS DE DÍGITOS MANUSCRITOS":digitMode?"Número detectado":"Clase detectada"}</span>
        {predicting?<p className="nl-prediction-wait" role="status">Analizando imagen…</p>:
        domainWarning?<><strong className="nl-prediction-class uncertain">No concluyente</strong><p className="nl-prediction-wait" role="alert">{domainWarning}</p></>:
        multiNumber&&multi?<div className="nl-colab-summary">
          <strong>{multi.digits.length} dígitos detectados</strong>
          <span>En {rows.length} {rows.length===1?"fila":"filas"} · Lectura de izquierda a derecha</span>
          <div className="nl-colab-row-readings">
            {rows.map(row=><div key={row} className="nl-colab-reading"><small>Fila {row}</small>
              <strong>{multi.digits.filter(d=>d.row===row).sort((a,b)=>a.box.x-b.box.x)
                .map(d=>d.uncertain?"?":d.digit).join("")}</strong></div>)}
          </div>
          <p className="nl-prediction-context">{multi.warning}</p>
        </div>:
        top?<><strong className={"nl-prediction-class "+(digitMode?"digit":"")}>{display}</strong>
          <div className="nl-prediction-confidence">
            <span>Confianza estimada</span>
            <strong>{(top.probabilidad*100).toFixed(2)}%</strong>
          </div>
          <div className="nl-prediction-track" aria-hidden="true">
            <span style={{width:(Math.max(0,Math.min(1,top.probabilidad))*100)+"%"}}/>
          </div>
          {multi&&<p className="nl-prediction-context">{multi.warning}</p>}
          </>:<p className="nl-prediction-wait">Sin resultado</p>}
      </div>
    </div>}
    {multi&&<section className="nl-colab-results" aria-label="Tabla de reconocimiento por dígito">
      <div className="nl-colab-results-head">
        <div><h3>Resultados por dígito</h3>
          <p>Recortes normalizados a 28 × 28, igual que en el reporte de Colab.</p></div>
        <span>{multi.digits.length} {multi.digits.length===1?"región":"regiones"}</span>
      </div>
      <div className="nl-colab-table-scroll">
        <table className="nl-colab-table">
          <thead><tr><th>Posición</th><th>Fila</th><th>Imagen</th>
            <th>Dígito reconocido</th><th>Confianza (%)</th><th>Margen (%)</th><th>Estado</th></tr></thead>
          <tbody>{multi.digits.map(d=><tr key={d.position}>
            <td className="nl-colab-position">{d.position}</td>
            <td>{d.row}</td>
            <td>{d.thumbnail&&<img src={d.thumbnail} width="62" height="62" alt={"Recorte orientado del dígito "+d.position}/>}</td>
            <td className="nl-colab-digit">{d.digit}</td>
            <td className="nl-colab-confidence">{(d.confidence*100).toFixed(2)}%</td>
            <td className="nl-colab-confidence">{(d.margin*100).toFixed(2)}%</td>
            <td><span className={"nl-colab-state "+(d.uncertain?"review":"good")}>
              {d.uncertain?"Revisar":"Sin aviso"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="nl-colab-results-caption">Confianza y margen estimados por la CNN. No son porcentajes de exactitud en fotografías reales. Las regiones en revisión se muestran como «?» en la lectura por filas.</p>
    </section>}
    {error&&<p className="error" role="alert">{error}</p>}
    {top&&!multi&&<details className="nl-prediction-details">
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
