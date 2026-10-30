import {useEffect,useState} from "react";
import {api} from "./api";
import type {RealRun} from "./realRuns";
import {prepareRealReport} from "./realRuns";

type Props={projectId:string};

function Curves({run,kind}:{run:RealRun;kind:"accuracy"|"loss"}) {
  const keys=kind==="accuracy"?(["accuracy","valAccuracy"] as const):(["loss","valLoss"] as const);
  const maximum=kind==="accuracy"?1:Math.max(0.1,...run.metrics.flatMap(point=>keys.map(key=>point[key])));
  const x=(index:number)=>32+(index/Math.max(1,run.metrics.length-1))*438;
  const y=(number:number)=>145-Math.max(0,number)/maximum*125;
  const coords=(key:typeof keys[number])=>run.metrics.map((point,index)=>
    (index===0?"M":"L")+x(index).toFixed(1)+","+y(point[key]).toFixed(1)
  ).join(" ");
  return <div className="cnn-chart">
    <svg viewBox="0 0 500 172" role="img" aria-label={kind==="accuracy"?"Precisión real por época importada":"Pérdida real por época importada"}>
      {[0,.25,.5,.75,1].map(ratio=><g key={ratio}>
        <line x1="32" x2="470" y1={y(ratio*maximum)} y2={y(ratio*maximum)} stroke="#e2e8f1"/>
        <text x="27" y={y(ratio*maximum)+4} fill="#64748b" fontSize="10" textAnchor="end">{kind==="accuracy"?String(ratio*100)+"%":(ratio*maximum).toFixed(2)}</text>
      </g>)}
      <path d={coords(keys[0])} stroke="#536bce" strokeWidth="2.5" fill="none"/>
      <path d={coords(keys[1])} stroke="#318b79" strokeWidth="2.5" strokeDasharray="6 4" fill="none"/>
      <text x="32" y="165" fontSize="10" fill="#64748b">1</text>
      <text x="470" y="165" fontSize="10" textAnchor="end" fill="#64748b">{run.completed_epochs}</text>
    </svg>
    <div className="cnn-legend"><span>━ Entrenamiento</span><span>┄ Validación</span></div>
  </div>;
}

export default function RealCNNResults({projectId}:Props) {
  const [runs,setRuns]=useState<RealRun[]>([]);
  const [selected,setSelected]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [predicting,setPredicting]=useState(false);
  const [predictionError,setPredictionError]=useState("");
  const [predictions,setPredictions]=useState<{clase:string;probabilidad:number}[]>([]);

  useEffect(()=>{
    let active=true;
    setLoading(true);setError("");setRuns([]);setSelected("");
    void api<RealRun[]>("/projects/"+projectId+"/real-runs")
      .then(data=>{if(active){setRuns(data);setSelected(data[0]?.id??"");}})
      .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Error al consultar resultados CNN.");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[projectId]);

  async function importFile(file:File) {
    setBusy(true);setError("");setMessage("");
    try {
      if(file.size>65536)throw new Error("El archivo supera 64 KiB.");
      const body=prepareRealReport(JSON.parse(await file.text()) as unknown);
      const run=await api<RealRun>("/projects/"+projectId+"/real-runs",{
        method:"POST",body:JSON.stringify(body),
      });
      setRuns(current=>[run,...current]);
      setSelected(run.id);
      setMessage("Informe CNN importado y guardado en PostgreSQL. No se cargaron los pesos del modelo.");
    }catch(cause) {
      setError(cause instanceof Error?cause.message:"No se pudo importar el informe JSON.");
    }finally{setBusy(false);}
  }

  const current=runs.find(run=>run.id===selected)??runs[0];
  async function classify(file:File) {
    if(!current?.model_ref||current.engine!=="TensorFlow.js")return;
    setPredictionError("");setPredictions([]);setPredicting(true);
    try {
      const {predictInBrowser}=await import("./browserCNN");
      const result=await predictInBrowser(current.model_ref,file,current.config,current.classes);
      setPredictions(result);
    }catch(cause) {
      setPredictionError("No se encontró el modelo en este navegador o la imagen no es válida: "+(cause instanceof Error?cause.message:"error desconocido"));
    }finally {setPredicting(false);}
  }
  return <section className="panel recent" aria-label="Resultados CNN reales importados">
    <div className="panel-head">
      <div>
        <div className="eyebrow">ENTRENAMIENTOS CON MÉTRICAS OBSERVADAS</div>
        <h2>Resultados CNN reales</h2>
        <p className="muted">Historial persistente · {runs.length} entrenamientos registrados</p>
      </div>
      <span className="badge">IMPORTACIÓN JSON</span>
    </div>
    <p className="soft">Importa <strong>metrics.json</strong>, generado por el motor Python de NeuroLab. Los valores del archivo se validan y se conservan en PostgreSQL. También puedes entrenar con TensorFlow.js desde esta página: los pesos quedan en IndexedDB del navegador y no se suben a Neon. Los informes proporcionados por clientes no están certificados por el servidor.</p>
    <label className="field">
      <span>Seleccionar informe de un entrenamiento real</span>
      <input type="file" accept=".json,application/json" disabled={busy} aria-label="Importar métricas CNN reales" onChange={event=>{
        const file=event.target.files?.[0];
        event.target.value="";
        if(file)void importFile(file);
      }}/>
    </label>
    {busy&&<p role="status">Validando y guardando resultados…</p>}
    {loading&&<p role="status">Recuperando historial de PostgreSQL…</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {message&&<p className="feedback" role="status">{message}</p>}
    {!loading&&!runs.length&&<p className="caption">Aún no hay reportes importados en este proyecto.</p>}
    {current&&<>
      <label className="field"><span>Entrenamiento importado</span>
        <select aria-label="Seleccionar entrenamiento CNN real" value={current.id} onChange={event=>{setSelected(event.target.value);setPredictions([]);setPredictionError("");}}>
          {runs.map(run=><option key={run.id} value={run.id}>{new Date(run.imported_at).toLocaleString("es-PE")+" · "+run.classes.join(", ")}</option>)}
        </select>
      </label>
      <div className="metric-grid">
        <div><small>Precisión de prueba</small><strong>{(current.test.accuracy*100).toFixed(1)}%</strong></div>
        <div><small>Pérdida de prueba</small><strong>{current.test.loss.toFixed(4)}</strong></div>
        <div><small>Épocas ejecutadas</small><strong>{current.completed_epochs}/{current.requested_epochs}</strong></div>
        <div><small>Parámetros CNN</small><strong>{current.parameters.toLocaleString("es-PE")}</strong></div>
      </div>
      <p className="caption">Fuente: {current.source==="navegador"?"entrenamiento TensorFlow.js registrado":"informe externo Keras importado"} · particiones: {current.samples.train} entrenamiento / {current.samples.validation} validación / {current.samples.test} prueba. Estas cifras proceden del reporte del cliente; Render no realiza una verificación independiente del entrenamiento.</p>
      <div className="cnn-two-charts">
        <section className="panel"><h3>Precisión por época</h3><Curves run={current} kind="accuracy"/></section>
        <section className="panel"><h3>Pérdida por época</h3><Curves run={current} kind="loss"/></section>
      </div>
      {current.engine==="TensorFlow.js"&&current.model_ref&&<div className="browser-cnn-summary cnn-spaced">
        <h3>Reconocer otra imagen con este modelo</h3>
        <p className="caption">El modelo se recupera de IndexedDB en este navegador; no se vuelve a entrenar. Si cambias de equipo o eliminas los datos del navegador, puede no estar disponible.</p>
        <label className="field"><span>Imagen PNG, JPG o WebP</span><input aria-label="Imagen para predecir con CNN real" type="file" accept="image/png,image/jpeg,image/webp" disabled={predicting} onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file)void classify(file);}}/></label>
        {predicting&&<p role="status">Evaluando imagen con los pesos guardados…</p>}
        {predictionError&&<p className="error" role="alert">{predictionError}</p>}
        {predictions.length>0&&<div className="table-scroll"><table><thead><tr><th>Clase</th><th>Probabilidad estimada</th></tr></thead><tbody>{predictions.map(item=><tr key={item.clase}><td>{item.clase}</td><td>{(item.probabilidad*100).toFixed(2)}%</td></tr>)}</tbody></table></div>}
      </div>}
      <details className="cnn-fingerprint"><summary>Huella SHA-256 del dataset declarado</summary><code>{current.dataset_fingerprint}</code></details>
    </>}
  </section>;
}
