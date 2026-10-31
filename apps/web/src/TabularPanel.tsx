import {useEffect,useRef,useState} from "react";
import {fetchPublicTable,inferTask,parseTable,profileTable} from "./tabular";
import type {TabularDataset,PredictionTask} from "./tabular";
import {trainTabular} from "./tabularTrain";
import type {TabularResult,TabularMetric} from "./tabularTrain";
import "./tabular.css";

type Props={dataset?:TabularDataset;onApply:(dataset:TabularDataset)=>void;
  onImport?:(dataset:TabularDataset)=>Promise<void>;
  onRemove:()=>void;report?:TabularResult|null;onSaveReport?:(result:TabularResult|null)=>void};
const taskName:Record<PredictionTask,string>={
  binary:"Clasificación binaria",multiclass:"Clasificación multiclase",regression:"Regresión"
};
const fmt=(n:number)=>n.toLocaleString("es-PE",{maximumFractionDigits:4});
export default function TabularPanel({dataset,onApply,onImport,onRemove,report,onSaveReport}:Props){
  const [mode,setMode]=useState<"file"|"url">("file");
  const [url,setUrl]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");
  const abort=useRef<AbortController|null>(null);
  const [epochs,setEpochs]=useState("30");
  const [batch,setBatch]=useState("32");
  const [training,setTraining]=useState(false);
  const [history,setHistory]=useState<TabularMetric[]>(report?.history??[]);
  const [result,setResult]=useState<TabularResult|null>(report??null);
  const trainingAbort=useRef<AbortController|null>(null);
  useEffect(()=>()=>{abort.current?.abort();trainingAbort.current?.abort();},[]);
  async function importFile(file:File){
    setError("");setStatus("");setBusy(true);
    try{
      if(!/\.(csv|tsv|txt)$/i.test(file.name))throw new Error("Selecciona un archivo CSV o TSV.");
      if(file.size>12*1024*1024)throw new Error("Archivo demasiado grande (máximo 12 MB).");
      const next=parseTable(await file.text(),file.name);
      if(onImport)await onImport(next);else onApply(next);
      setResult(null);onSaveReport?.(null);setHistory([]);
      setStatus("Dataset analizado correctamente.");
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo leer el archivo.");}
    finally{setBusy(false);}
  }
  async function importUrl(){
    const controller=new AbortController();abort.current=controller;
    setError("");setStatus("");setBusy(true);
    try{
      const next=await fetchPublicTable(url,controller.signal);
      if(controller.signal.aborted)return;
      if(onImport)await onImport(next);else onApply(next);
      setResult(null);onSaveReport?.(null);setHistory([]);
      setStatus("Dataset importado desde la URL.");
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"No se pudo importar la URL.");}
    finally{setBusy(false);if(abort.current===controller)abort.current=null;}
  }
  function updateTarget(target:string){
    if(!dataset)return;
    const task=inferTask(dataset,target);
    onApply({...dataset,target,task,automatic:true});
    setResult(null);onSaveReport?.(null);setHistory([]);setError("");
  }
  function updateTask(task:PredictionTask){
    if(!dataset)return;
    onApply({...dataset,task,automatic:false});setResult(null);onSaveReport?.(null);setHistory([]);setError("");
  }
  function changeManual(field:"units1"|"units2"|"learningRate"|"dropout",value:number){
    if(!dataset)return;
    const previous=dataset.manualConfig??{units1:64,units2:32,learningRate:.001,dropout:0};
    onApply({...dataset,manualConfig:{...previous,[field]:value}});
    setResult(null);onSaveReport?.(null);setHistory([]);setError("");
  }
  function updateName(name:string){
    if(!dataset)return;onApply({...dataset,name});
  }
  async function start(){
    if(!dataset)return;
    const controller=new AbortController();trainingAbort.current=controller;
    setTraining(true);setResult(null);setHistory([]);setError("");setStatus("");
    try{
      const output=await trainTabular(dataset,Number(epochs),Number(batch),
        metric=>{if(!controller.signal.aborted)setHistory(old=>[...old,metric]);},controller.signal);
      if(!controller.signal.aborted){setResult(output);onSaveReport?.(output);setStatus("Modelo entrenado y guardado en este navegador.");}
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo completar el entrenamiento.");}
    finally{setTraining(false);trainingAbort.current=null;}
  }
  function exportReport(){
    if(!result||!dataset)return;
    const data=JSON.stringify({dataset:dataset.name,target:dataset.target,result},null,2);
    const location=URL.createObjectURL(new Blob([data],{type:"application/json"}));
    const a=document.createElement("a");a.href=location;a.download="neurolab-resultado-tabular.json";a.click();
    window.setTimeout(()=>URL.revokeObjectURL(location),1000);
  }
  let plan:ReturnType<typeof profileTable>|null=null;
  let profileError="";
  if(dataset){try{plan=profileTable(dataset);}catch(cause){profileError=cause instanceof Error?cause.message:"No se puede analizar la tarea.";}}
  return <section className="panel nl-tabular-panel" aria-label="Datos tabulares">
    <div className="panel-head"><div><h2>Datos tabulares</h2><p className="muted">CSV o TSV · archivo o URL pública</p></div>
      {dataset&&<span className="badge">Dataset cargado</span>}</div>
    <div className="nl-tabular-choice" role="group" aria-label="Origen de los datos">
      <button type="button" aria-pressed={mode==="file"} className={mode==="file"?"active":""} onClick={()=>setMode("file")}>Desde mi equipo</button>
      <button type="button" aria-pressed={mode==="url"} className={mode==="url"?"active":""} onClick={()=>setMode("url")}>Desde URL</button>
    </div>
    {mode==="file"?<label className="nl-upload-box"><span>Seleccionar CSV / TSV</span>
      <input aria-label="Archivo CSV o TSV" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
        disabled={busy||training} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void importFile(file);}}/>
    </label>:<div className="nl-url-input"><label className="field"><span>URL pública HTTPS del archivo</span>
      <input aria-label="URL del dataset tabular" type="url" placeholder="https://ejemplo.org/datos.csv"
        value={url} disabled={busy||training} onChange={e=>setUrl(e.target.value)}/></label>
      <button type="button" className="primary" disabled={busy||training||!url.trim()} onClick={()=>void importUrl()}>
        {busy?"Importando…":"Importar URL"}</button></div>}
    {busy&&<span role="status">Analizando archivo…</span>}
    {error&&<p role="alert" className="error">{error}</p>}
    {status&&<p role="status" className="feedback">{status}</p>}
    {dataset&&<div className="nl-tabular-data">
      <div className="nl-dataset-summary"><div><label className="field"><span>Nombre del dataset</span>
        <input aria-label="Nombre del dataset tabular" value={dataset.name} maxLength={100}
          disabled={training} onChange={e=>updateName(e.target.value)}/></label></div>
        <strong>{fmt(dataset.rows.length)} filas · {dataset.headers.length} columnas</strong>
        <button className="nl-danger" type="button" disabled={training}
          onClick={()=>{if(window.confirm("¿Quitar este dataset del proyecto? Los modelos entrenados no se eliminarán.")){onRemove();setResult(null);onSaveReport?.(null);setHistory([]);setStatus("");}}}>Quitar dataset</button>
      </div>
      <div className="nl-tabular-preview table-scroll"><table><thead><tr>{dataset.headers.map(h=><th key={h}>{h}</th>)}</tr></thead>
        <tbody>{dataset.rows.slice(0,5).map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell||"—"}</td>)}</tr>)}</tbody></table></div>
      <div className="nl-tabular-settings">
        <label className="field"><span>Variable objetivo</span><select aria-label="Variable objetivo" disabled={training}
          value={dataset.target} onChange={e=>updateTarget(e.target.value)}>
          {dataset.headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>
        <label className="field"><span>Configuración</span>
          <select aria-label="Modo de configuración tabular" disabled={training} value={dataset.automatic?"automatic":"manual"}
            onChange={e=>{if(!dataset)return;onApply({...dataset,automatic:e.target.value==="automatic",
              task:e.target.value==="automatic"?inferTask(dataset,dataset.target):dataset.task});setResult(null);onSaveReport?.(null);setHistory([]);}}>
            <option value="automatic">Automática</option><option value="manual">Manual</option>
          </select></label>
        {!dataset.automatic&&<label className="field"><span>Tipo de problema</span>
          <select aria-label="Tipo de problema" disabled={training} value={dataset.task}
            onChange={e=>updateTask(e.target.value as PredictionTask)}>
            <option value="binary">Clasificación binaria</option>
            <option value="multiclass">Clasificación multiclase</option>
            <option value="regression">Regresión</option>
          </select></label>}
      </div>
      {!dataset.automatic&&<div className="nl-tabular-manual" aria-label="Parámetros manuales">
        <label className="field"><span>Capa oculta 1</span><input aria-label="Neuronas capa 1" type="number" min="4" max="256"
          value={dataset.manualConfig?.units1??64} disabled={training}
          onChange={e=>changeManual("units1",Number(e.target.value))}/></label>
        <label className="field"><span>Capa oculta 2 (0 para desactivar)</span><input aria-label="Neuronas capa 2" type="number" min="0" max="128"
          value={dataset.manualConfig?.units2??32} disabled={training}
          onChange={e=>changeManual("units2",Number(e.target.value))}/></label>
        <label className="field"><span>Tasa de aprendizaje</span><input aria-label="Tasa de aprendizaje" type="number" min=".0001" max=".01" step=".0001"
          value={dataset.manualConfig?.learningRate??.001} disabled={training}
          onChange={e=>changeManual("learningRate",Number(e.target.value))}/></label>
        <label className="field"><span>Dropout</span><input aria-label="Dropout tabular" type="number" min="0" max=".6" step=".05"
          value={dataset.manualConfig?.dropout??0} disabled={training}
          onChange={e=>changeManual("dropout",Number(e.target.value))}/></label>
      </div>}
      {plan?<div className="nl-tabular-plan">
        <div><small>Tarea</small><strong>{taskName[plan.task]}</strong></div>
        <div><small>Salida</small><strong>{plan.activation}</strong></div>
        <div><small>Pérdida</small><strong>{plan.loss==="meanSquaredError"?"MSE":plan.loss==="binaryCrossentropy"?"Binaria":"Categórica"}</strong></div>
        <div><small>Entradas</small><strong>{plan.numeric.length} numéricas · {plan.categorical.length} categóricas</strong></div>
        <div><small>Muestras válidas</small><strong>{fmt(plan.validRows)}</strong></div>
      </div>:<p role="alert" className="error">{profileError}</p>}
      {plan&&<div className="nl-tabular-train">
        <h3>Entrenar modelo</h3>
        <div className="nl-tabular-settings">
          <label className="field"><span>Épocas</span><input aria-label="Épocas tabulares" type="number" min="1" max="80"
            value={epochs} disabled={training} onChange={e=>setEpochs(e.target.value)}/></label>
          <label className="field"><span>Lote</span><input aria-label="Lote tabular" type="number" min="4" max="256"
            value={batch} disabled={training} onChange={e=>setBatch(e.target.value)}/></label>
          <button type="button" className="primary" disabled={training} onClick={()=>void start()}>
            {training?"Entrenando…":"Iniciar entrenamiento"}</button>
          {training&&<button type="button" className="secondary" onClick={()=>trainingAbort.current?.abort()}>Detener</button>}
        </div>
        {history.length>0&&<div className="nl-training-status" role="status">
          <span>Época {history.at(-1)?.epoch} / {epochs}</span>
          <span>Pérdida {fmt(history.at(-1)?.loss??0)}</span>
          <span>Validación {fmt(history.at(-1)?.valLoss??0)}</span>
        </div>}
        {result&&<div className="nl-tabular-result">
          <div><small>Prueba independiente · {result.metricName}</small>
            <strong>{result.metricName==="Precisión"?(result.testMetric*100).toFixed(1)+"%":fmt(result.testMetric)}</strong></div>
          <div><small>Épocas completadas</small><strong>{result.epochs}</strong></div>
          <div><small>Ejemplo de prueba</small><strong>{result.sample.actual} → {result.sample.predicted}</strong></div>
          <button type="button" className="secondary" onClick={exportReport}>Exportar informe JSON</button>
        </div>}
      </div>}
    </div>}
  </section>;
}