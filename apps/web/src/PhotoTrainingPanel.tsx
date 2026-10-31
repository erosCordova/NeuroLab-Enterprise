import {useEffect,useRef,useState} from "react";
import type {ImageDataset} from "./cnn";
import type {PhotoReport,PhotoEpoch} from "./photoTransfer";
import PredictionPanel from "./PredictionPanel";
import "./photo-training.css";

function Plot({data,accuracy}:{data:PhotoEpoch[];accuracy:boolean}){
  const a=accuracy?"accuracy":"loss",b=accuracy?"valAccuracy":"valLoss";
  const limit=accuracy?1:Math.max(.1,...data.flatMap(p=>[p.loss,p.valLoss]));
  const path=(key:"accuracy"|"valAccuracy"|"loss"|"valLoss")=>data.map((p,i)=>
    (i?"L":"M")+(35+i*405/Math.max(1,data.length-1)).toFixed(1)+","+(140-120*p[key]/limit).toFixed(1)).join(" ");
  return <svg viewBox="0 0 480 165" role="img" aria-label={accuracy?"Precisión real del entrenamiento fotográfico":"Pérdida real del entrenamiento fotográfico"}>
    {[0,.25,.5,.75,1].map(n=><g key={n}><line x1="35" x2="440" y1={140-120*n} y2={140-120*n} stroke="#e0e9f0"/>
      <text x="30" y={144-120*n} textAnchor="end" fontSize="10">{accuracy?Math.round(n*100)+"%":(limit*n).toFixed(2)}</text></g>)}
    <path d={path(a)} fill="none" stroke="#536bce" strokeWidth="2.5"/>
    <path d={path(b)} fill="none" stroke="#1b9b80" strokeWidth="2.5" strokeDasharray="6 4"/>
    <text x="35" y="160" fontSize="10">1</text><text x="440" y="160" fontSize="10" textAnchor="end">{data.length}</text>
  </svg>;
}
export default function PhotoTrainingPanel({owner,projectId,dataset}:{owner:string;projectId:string;dataset?:ImageDataset}){
  const [report,setReport]=useState<PhotoReport|null>(null);
  const [epochs,setEpochs]=useState("20");
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState("");
  const [done,setDone]=useState(0);
  const [total,setTotal]=useState(1);
  const [metrics,setMetrics]=useState<PhotoEpoch[]>([]);
  const [error,setError]=useState("");
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>{
    let active=true;
    void import("./photoTransfer").then(m=>{if(active){const saved=m.readPhotoReport(owner,projectId);setReport(saved);setMetrics(saved?.metrics??[]);}});
    return ()=>{active=false;controller.current?.abort();};
  },[owner,projectId]);
  async function train(){
    if(!dataset)return;
    const abort=new AbortController();controller.current=abort;
    setBusy(true);setError("");setMetrics([]);setProgress("Cargando extractor de características preentrenado…");setDone(0);setTotal(dataset.images.length);
    try{
      const {trainPhotoModel}=await import("./photoTransfer");
      const result=await trainPhotoModel(owner,projectId,dataset,Number(epochs),p=>{
        if(abort.signal.aborted)return;
        setProgress(p.stage==="features"?"Extrayendo características de fotografías":"Entrenando clasificador con las características");
        setDone(p.done);setTotal(p.total);
        if(p.metric)setMetrics(m=>[...m,p.metric!]);
      },abort.signal);
      setReport(result);
      setProgress("Modelo fotográfico guardado en este navegador y evaluado en pruebas independientes.");
    }catch(cause){
      setError(cause instanceof Error?cause.message:"No se pudo entrenar el clasificador.");
      setProgress("Entrenamiento sin finalizar.");
    }finally{setBusy(false);if(controller.current===abort)controller.current=null;}
  }
  const same=dataset?.fingerprint===report?.datasetFingerprint;
  return <section className="panel photo-training" aria-label="Reconocimiento de fotografías reales de prendas">
    <div className="panel-head"><div><div className="eyebrow">FOTOGRAFÍAS REALES · TRANSFERENCIA DE APRENDIZAJE</div>
      <h2>Reconocer fotos reales con MobileNet</h2>
      <p className="muted">Una CNN preentrenada extrae rasgos de fotos de 224 × 224 y aprende tus clases con un clasificador nuevo.</p></div>
      <span className="badge">REAL · 224 × 224</span>
    </div>
    <p className="soft">Este modelo es <strong>independiente de Fashion-MNIST</strong>. Para reconocer camisetas de fútbol necesitas fotos reales etiquetadas de camisetas, bolsos y las otras categorías que quieras distinguir. La transferencia aprende patrones de tus fotografías; no puede garantizar la clasificación de objetos nuevos ni de clases ausentes.</p>
    <p className="caption">Los datos del entrenamiento y los pesos quedan en tu navegador. MobileNet se descarga una vez desde TensorFlow Hub mediante conexión a internet. No se envían tus fotografías a Render ni a TensorFlow Hub. El historial remoto de CNN convencionales no incluye este tipo de modelo.</p>
    {dataset?<div className="metric-grid">
      <div><small>Fotografías disponibles</small><strong>{dataset.images.length}</strong></div>
      <div><small>Categorías</small><strong>{dataset.classes.length}</strong></div>
      <div><small>Entrenamiento</small><strong>{dataset.train.length}</strong></div>
      <div><small>Prueba independiente</small><strong>{dataset.test.length}</strong></div>
    </div>:<p className="caption">Para entrenar, ve a Datasets → Cargar imágenes por clase. Usa una carpeta con una subcarpeta por clase y aplica el dataset. Se requieren al menos 8 fotos de entrenamiento, 2 de validación y 2 de prueba por clase.</p>}
    {dataset&&<><p className="caption">Dataset activo: {dataset.name} · {dataset.classes.join(", ")}. Para mejores resultados incluye distintas personas, iluminación, fondos y perspectivas.</p>
      <div className="photo-training-controls">
        <label className="field"><span>Épocas fotográficas (1–40)</span><input aria-label="Épocas de transferencia" type="number" min="1" max="40" value={epochs} disabled={busy} onChange={e=>setEpochs(e.target.value)}/></label>
        <button type="button" className="primary" onClick={()=>void train()} disabled={busy}>{busy?"Entrenando fotografías…":"Entrenar con fotografías reales"}</button>
        {busy&&<button type="button" className="secondary" onClick={()=>controller.current?.abort()}>Cancelar</button>}
      </div>
    </>}
    {progress&&<><p role="status" className="caption">{progress} {busy?done+"/"+total:""}</p>{busy&&<progress max={total} value={done} aria-label="Progreso del entrenamiento fotográfico"/>}</>}
    {error&&<p role="alert" className="error">{error}</p>}
    {metrics.length>0&&<div className="cnn-two-charts photo-training-charts">
      <div><h3>Precisión (entrenamiento / validación)</h3><Plot data={metrics} accuracy/></div>
      <div><h3>Pérdida (entrenamiento / validación)</h3><Plot data={metrics} accuracy={false}/></div>
    </div>}
    {report&&<section className="browser-cnn-summary" aria-label="Modelo fotográfico entrenado">
      <div className="metric-grid"><div><small>Precisión en prueba independiente</small><strong>{(report.test.accuracy*100).toFixed(1)}%</strong></div>
        <div><small>Pérdida en prueba</small><strong>{report.test.loss.toFixed(3)}</strong></div>
        <div><small>Épocas ejecutadas</small><strong>{report.completedEpochs}</strong></div>
        <div><small>Clases entrenadas</small><strong>{report.classes.length}</strong></div></div>
      {!same&&dataset&&<p className="caption">El modelo guardado se entrenó con otro dataset. Para nuevas pruebas seguirá usando sus clases y sus pesos, no el dataset que ahora está activo.</p>}
      <h3>Reconocer una fotografía sin volver a entrenar</h3>
      <p className="caption">Solo distingue las clases entrenadas: {report.classes.join(", ")}. La confianza estimada no es una garantía de acierto.</p>
      <PredictionPanel key={report.modelRef} inputLabel="Fotografía real (PNG, JPG o WebP)"
        inputAriaLabel="Fotografía real para clasificar"
        onPredict={async file=>(await import("./photoTransfer")).predictPhotoModel(report,file)}/>
    </section>}
  </section>;
}
