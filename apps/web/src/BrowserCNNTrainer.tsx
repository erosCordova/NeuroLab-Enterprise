import {useEffect,useRef,useState} from "react";
import {api} from "./api";
import type {Config,ImageDataset,Metric,Job} from "./cnn";
import {summary} from "./cnn";
import type {BrowserReport} from "./browserCNN";
import CNNBackupActions from "./CNNBackupActions";
import NetworkFlow from "./NetworkFlow";
import "./browser-cnn.css";

type Props={
  projectId:string;
  dataset?:ImageDataset;
  config:Config;
  connected:boolean;
  onSaved:()=>void;
  demoJob?:Job;
  demoPaused?:boolean;
};

function Curve({metrics,kind}:{metrics:Metric[];kind:"accuracy"|"loss"}) {
  const keys=kind==="accuracy"?(["accuracy","valAccuracy"] as const):(["loss","valLoss"] as const);
  const max=kind==="accuracy"?1:Math.max(0.1,...metrics.flatMap(point=>keys.map(key=>point[key])));
  const x=(index:number)=>30+430*index/Math.max(1,metrics.length-1);
  const y=(v:number)=>140-120*v/max;
  const path=(key:typeof keys[number])=>metrics.map((metric,index)=>
    (index?"L":"M")+x(index).toFixed(1)+","+y(metric[key]).toFixed(1)
  ).join(" ");
  return <svg viewBox="0 0 490 160" role="img" aria-label={kind==="accuracy"?"Precisión real medida en cada época":"Pérdida real medida en cada época"}>
    {[0,.25,.5,.75,1].map(ratio=><g key={ratio}>
      <line x1="30" x2="460" y1={y(ratio*max)} y2={y(ratio*max)} stroke="#d8e2ef"/>
      <text x="26" y={y(ratio*max)+3} fontSize="9" textAnchor="end" fill="#64748b">{kind==="accuracy"?Math.round(ratio*100)+"%":(ratio*max).toFixed(2)}</text>
    </g>)}
    <path stroke="#536bce" strokeWidth="2.5" fill="none" d={path(keys[0])}/>
    <path stroke="#318b79" strokeWidth="2.5" strokeDasharray="5 4" fill="none" d={path(keys[1])}/>
  </svg>;
}

export default function BrowserCNNTrainer({projectId,dataset,config,connected,onSaved,demoJob,demoPaused}:Props) {
  const [epochs,setEpochs]=useState("12");
  const [batch,setBatch]=useState("16");
  const [working,setWorking]=useState(false);
  const [stage,setStage]=useState("");
  const [metrics,setMetrics]=useState<Metric[]>([]);
  const [report,setReport]=useState<BrowserReport|null>(null);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [predicting,setPredicting]=useState(false);
  const [predictionError,setPredictionError]=useState("");
  const [predictions,setPredictions]=useState<{clase:string;probabilidad:number}[]>([]);
  const controller=useRef<AbortController|null>(null);

  useEffect(()=>()=>controller.current?.abort(),[]);
  let reason="";
  if(dataset){
    try{
      const details=summary(config,dataset.classes.length);
      if(dataset.images.length>200||config.size>32||details.total>500000)reason="Para entrenar en el navegador usa hasta 200 imágenes, entrada máxima 32×32 y hasta 500 000 parámetros.";
    }catch(cause){reason=cause instanceof Error?cause.message:"Arquitectura no válida.";}
  }

  async function start() {
    if(!dataset)return;
    setError("");setMessage("");setReport(null);setMetrics([]);setWorking(true);
    setStage("Preparando el motor de CNN y las imágenes…");
    const abort=new AbortController();
    controller.current=abort;
    try{
      const {trainInBrowser}=await import("./browserCNN");
      const result=await trainInBrowser(projectId,dataset,config,Number(epochs),Number(batch),
        ({epoch,epochs:total,metric})=>{
          if(abort.signal.aborted)return;
          setMetrics(current=>[...current,metric]);
          setStage("Entrenamiento real: época "+epoch+" de "+total);
        },abort.signal);
      if(abort.signal.aborted)return;
      setReport(result);
      setStage("Modelo CNN guardado en este navegador.");
      setMessage("Pesos guardados en IndexedDB. Puedes utilizarlos aquí para realizar predicciones sin reentrenar.");
      if(connected){
        try{
          await api("/projects/"+projectId+"/real-runs",{method:"POST",body:JSON.stringify(result)});
          if(!abort.signal.aborted){
            setMessage("Modelo guardado en este navegador y métricas conservadas en PostgreSQL.");
            onSaved();
          }
        }catch(cause) {
          setError("El modelo sí se guardó en este navegador, pero no se pudo conservar el historial en PostgreSQL: "+(cause instanceof Error?cause.message:"error de red")+". Puedes exportar el JSON.");
        }
      }
    }catch(cause){
      if(!abort.signal.aborted)setError(cause instanceof Error?cause.message:"No se pudo entrenar la CNN.");
      setStage("Sin entrenamiento completado.");
    }finally {
      if(controller.current===abort)controller.current=null;
      setWorking(false);
    }
  }

  async function classify(file:File){
    if(!report)return;
    setPredicting(true);setPredictionError("");setPredictions([]);
    try{
      const {predictInBrowser}=await import("./browserCNN");
      const values=await predictInBrowser(report.model_ref,file,report.config,report.classes);
      setPredictions(values);
    }catch(cause){setPredictionError(cause instanceof Error?cause.message:"No se pudo reconocer la imagen.");}
    finally{setPredicting(false);}
  }

  function exportReport(){
    if(!report)return;
    const blob=new Blob([JSON.stringify(report,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;link.download="neurolab-cnn-real-navegador.json";link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  return <section className="panel browser-cnn" aria-label="Entrenamiento CNN real en navegador">
    <div className="panel-head">
      <div><div className="eyebrow">ENTRENAMIENTO REAL · SIN COSTO DE GPU EN RENDER</div>
        <h2>Entrenar CNN con TensorFlow.js</h2>
        <p className="muted">Aprende de los píxeles de tus imágenes directamente en este navegador.</p></div>
      <span className="badge">REAL · NAVEGADOR</span>
    </div>
    <p className="soft">Las imágenes no se envían a Render para entrenar. Los pesos se guardan en IndexedDB de <strong>este navegador</strong>, no en Neon ni en la nube: podrían perderse si limpias sus datos o utilizas otro dispositivo. La calidad depende de las imágenes y no se garantiza una precisión determinada.</p>
    <NetworkFlow config={demoJob?.config??config} classCount={demoJob?.dataset.classes.length??dataset?.classes.length??2} working={working} realMetrics={metrics} realEpochs={Number(epochs)} realComplete={Boolean(report)} demoJob={demoJob} demoPaused={demoPaused}/>
    {!dataset?<div className="cnn-empty">Primero carga y aplica un dataset en la sección Datasets.</div>:<>
      <p><strong>{dataset.name}</strong> · {dataset.images.length} imágenes · {dataset.classes.length} clases · {dataset.train.length} entrenamiento / {dataset.validation.length} validación / {dataset.test.length} prueba</p>
      {reason&&<p className="error" role="alert">{reason}</p>}
      <div className="cnn-three">
        <label className="field"><span>Épocas reales (1–40)</span>
          <input aria-label="Épocas de entrenamiento real" type="number" min="1" max="40" step="1" value={epochs} disabled={working} onChange={event=>setEpochs(event.target.value)}/>
        </label>
        <label className="field"><span>Batch size (1–64)</span>
          <input aria-label="Batch del entrenamiento real" type="number" min="1" max="64" step="1" value={batch} disabled={working} onChange={event=>setBatch(event.target.value)}/>
        </label>
        <button className="primary" disabled={working||Boolean(reason)} onClick={()=>void start()}>{working?"Entrenando CNN…":"Entrenar CNN real"}</button>
      </div>
      {working&&<button className="secondary cnn-spaced" onClick={()=>controller.current?.abort()}>Cancelar entrenamiento real</button>}
      <p role="status" className="caption">{stage}</p>
      {working&&<progress aria-label="Épocas reales ejecutadas" max={Math.max(1,Number(epochs))} value={metrics.length}/>}
      {error&&<p className="error" role="alert">{error}</p>}
      {message&&<p className="feedback" role="status">{message}</p>}
      {metrics.length>0&&<div className="cnn-two-charts cnn-spaced">
        <div><h3>Precisión por época</h3><Curve metrics={metrics} kind="accuracy"/></div>
        <div><h3>Pérdida por época</h3><Curve metrics={metrics} kind="loss"/></div>
      </div>}
      {report&&<div className="browser-cnn-summary">
        <div className="metric-grid">
          <div><small>Precisión de prueba</small><strong>{(report.test.accuracy*100).toFixed(1)}%</strong></div>
          <div><small>Pérdida de prueba</small><strong>{report.test.loss.toFixed(4)}</strong></div>
          <div><small>Épocas ejecutadas</small><strong>{report.completed_epochs}</strong></div>
          <div><small>Parámetros</small><strong>{report.parameters.toLocaleString("es-PE")}</strong></div>
        </div>
        <button className="secondary cnn-spaced" onClick={exportReport}>Exportar informe JSON de entrenamiento real</button>
      </div>}
    </>}
    <CNNBackupActions projectId={projectId} report={report} onRestored={restored=>{
      setReport(restored);setMetrics(restored.metrics);setPredictions([]);setPredictionError("");
      setStage("Respaldo CNN recuperado desde otro navegador o dispositivo.");
    }}/>
    {report&&<section className="cnn-backup-predictions" aria-label="Predicción con modelo recuperado">
      <h3>Reconocer una imagen con los pesos guardados</h3>
      <p className="caption">El modelo no se reentrena: se recupera de IndexedDB y se aplica a una imagen nueva.</p>
      <label className="field"><span>Imagen para clasificar</span><input aria-label="Imagen para predecir con modelo respaldado" type="file" accept="image/png,image/jpeg,image/webp" disabled={working||predicting} onChange={event=>{
        const file=event.target.files?.[0];event.target.value="";if(file)void classify(file);
      }}/></label>
      {predicting&&<p role="status">Reconociendo imagen…</p>}
      {predictionError&&<p className="error" role="alert">{predictionError}</p>}
      {predictions.length>0&&<div className="table-scroll"><table><thead><tr><th>Clase</th><th>Probabilidad estimada</th></tr></thead><tbody>{predictions.map(item=><tr key={item.clase}><td>{item.clase}</td><td>{(item.probabilidad*100).toFixed(2)}%</td></tr>)}</tbody></table></div>}
    </section>}
  </section>;
}
