import {useEffect,useState} from "react";
import {api} from "./api";
import type {RealRun} from "./realRuns";
import CNNBackupActions from "./CNNBackupActions";
import PredictionPanel from "./PredictionPanel";
import type {BrowserReport} from "./browserCNN";

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
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{
    let active=true;
    setLoading(true);setError("");setRuns([]);setSelected("");
    void api<RealRun[]>("/projects/"+projectId+"/real-runs")
      .then(data=>{if(active){const local=data.filter(run=>run.source==="navegador"&&run.engine==="TensorFlow.js"&&!!run.model_ref&&!run.model_ref.includes("-imported-"));setRuns(local);setSelected(local[0]?.id??"");}})
      .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Error al consultar resultados CNN.");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[projectId]);

  const current=runs.find(run=>run.id===selected)??runs[0];
  const backupReport:BrowserReport|null=current?.engine==="TensorFlow.js"&&current.model_ref?{
    training:"real",engine:"TensorFlow.js",weights_file:"model.json",model_ref:current.model_ref,
    dataset_fingerprint:current.dataset_fingerprint,classes:current.classes,samples:current.samples,
    config:current.config,parameters:current.parameters,requested_epochs:current.requested_epochs,
    completed_epochs:current.completed_epochs,batch:current.batch,seed:current.seed,
    metrics:current.metrics,test:current.test,
  }:null;
  return <section className="panel recent" aria-label="Modelos CNN entrenados en esta página">
    <div className="panel-head">
      <div>
        <div className="eyebrow">SOLO MODELOS ENTRENADOS AQUÍ</div>
        <h2>Historial de modelos entrenados en NeuroLab</h2>
        <p className="muted">Historial persistente · {runs.length} entrenamientos registrados</p>
      </div>
      <span className="badge">ENTRENADOS AQUÍ</span>
    </div>
    <p className="soft">Aquí aparecen únicamente CNN entrenadas dentro de NeuroLab y registradas para este proyecto. La otra opción de Entrenamientos gestiona exclusivamente modelos importados.</p>
    {loading&&<p role="status">Recuperando historial de PostgreSQL…</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {!loading&&!runs.length&&<p className="caption">Todavía no hay entrenamientos locales registrados. Inicia uno desde Entrenar modelo.</p>}
    {current&&<>
      <label className="field"><span>Entrenamiento creado en esta página</span>
        <select aria-label="Seleccionar entrenamiento CNN real" value={current.id} onChange={event=>{setSelected(event.target.value);}}>
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
      {backupReport&&<CNNBackupActions mode="export" key={backupReport.model_ref} projectId={projectId} report={backupReport}/>}
      {current.engine==="TensorFlow.js"&&current.model_ref&&<div className="browser-cnn-summary cnn-spaced">
        <h3>Reconocer otra imagen con este modelo</h3>
        <p className="caption">El modelo se recupera de IndexedDB en este navegador; no se vuelve a entrenar. Si cambias de equipo o eliminas los datos del navegador, puede no estar disponible.</p>
        <PredictionPanel key={current.id} inputLabel="Imagen PNG, JPG o WebP"
          inputAriaLabel="Imagen para predecir con CNN real"
          digitMode={current.classes.length===10&&current.classes.every((name,index)=>name===String(index))}
          onPredict={async file=>{
            const isMnist=current.classes.length===10&&current.classes.every((name,index)=>name===String(index));
            if(isMnist){const {predictMultipleDigits}=await import("./multiDigitInference");return predictMultipleDigits(current.model_ref,file,current.config,current.classes);}
            const {predictInBrowser}=await import("./browserCNN");
            return predictInBrowser(current.model_ref,file,current.config,current.classes,false);
          }}/>
      </div>}
      <details className="cnn-fingerprint"><summary>Huella SHA-256 del dataset declarado</summary><code>{current.dataset_fingerprint}</code></details>
    </>}
  </section>;
}
