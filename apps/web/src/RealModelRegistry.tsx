import {useEffect,useState} from "react";
import {api} from "./api";
import type {RealRun} from "./realRuns";
import type {BrowserReport} from "./browserCNN";
import type {RealModel,ModelFilter} from "./realModelRegistry";
import {filterRealModels,unregisteredRuns} from "./realModelRegistry";
import CNNBackupActions from "./CNNBackupActions";
import "./real-model-registry.css";

export default function RealModelRegistry({projectId}:{projectId:string}){
 const [models,setModels]=useState<RealModel[]>([]);
 const [runs,setRuns]=useState<RealRun[]>([]);
 const [available,setAvailable]=useState<Set<string>>(new Set());
 const [inventory,setInventory]=useState<"loading"|"available"|"error">("loading");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [query,setQuery]=useState("");
 const [filter,setFilter]=useState<ModelFilter>("Todos");
 const [selected,setSelected]=useState("");
 const [newRun,setNewRun]=useState("");
 const [newName,setNewName]=useState("");
 const [editName,setEditName]=useState("");
 const [editNotes,setEditNotes]=useState("");
 const [predicting,setPredicting]=useState(false);
 const [predictionError,setPredictionError]=useState("");
 const [predictions,setPredictions]=useState<{clase:string;probabilidad:number}[]>([]);

 async function refreshInventory(active:()=>boolean){
  try{
   const tf=await import("@tensorflow/tfjs");
   const local=await tf.io.listModels();
   if(active()){setAvailable(new Set(Object.keys(local)));setInventory("available");}
  }catch{if(active()){setAvailable(new Set());setInventory("error");}}
 }
 useEffect(()=>{
  let active=true;
  setLoading(true);setError("");setSelected("");setModels([]);setRuns([]);
  setAvailable(new Set());setInventory("loading");
  void Promise.all([
   api<RealModel[]>("/projects/"+projectId+"/real-models"),
   api<RealRun[]>("/projects/"+projectId+"/real-runs"),
  ]).then(([registered,history])=>{
   if(active){setModels(registered);setRuns(history);setSelected(registered[0]?.id??"");
    setEditName(registered[0]?.display_name??"");setEditNotes(registered[0]?.notes??"");}
  }).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"No se pudo consultar el registro.");})
    .finally(()=>{if(active)setLoading(false);});
  void refreshInventory(()=>active);
  return()=>{active=false;};
 },[projectId]);

 const pending=unregisteredRuns(runs,models);
 const visible=filterRealModels(models,filter,query,available);
 const current=models.find(model=>model.id===selected);
 const run=current?runs.find(item=>item.id===current.run_id):undefined;
 const report:BrowserReport|null=run?.engine==="TensorFlow.js"&&run.model_ref?{
  training:"real",engine:"TensorFlow.js",weights_file:"model.json",model_ref:run.model_ref,
  dataset_fingerprint:run.dataset_fingerprint,classes:run.classes,samples:run.samples,
  config:run.config,parameters:run.parameters,requested_epochs:run.requested_epochs,
  completed_epochs:run.completed_epochs,batch:run.batch,seed:run.seed,metrics:run.metrics,test:run.test,
 }:null;
 const onDevice=Boolean(current&&inventory==="available"&&available.has(current.model_ref));

 async function register(){
  const chosen=pending.find(item=>item.id===(newRun||pending[0]?.id));
  if(!chosen)return;
  setBusy(true);setError("");setMessage("");
  try{
   const saved=await api<RealModel>("/projects/"+projectId+"/real-models",{
    method:"POST",body:JSON.stringify({run_id:chosen.id,
      display_name:newName.trim()||"Modelo CNN "+chosen.classes.join(" · ")}),
   });
   setModels(prev=>[saved,...prev]);setSelected(saved.id);setEditName(saved.display_name);setEditNotes(saved.notes);
   setNewRun("");setNewName("");
   setMessage("Ficha CNN real registrada en PostgreSQL. Los pesos permanecen en el navegador.");
  }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo registrar la ficha.");}
  finally{setBusy(false);}
 }

 async function save(model:RealModel,changes?:Partial<Pick<RealModel,"favorite"|"status">>){
  setBusy(true);setError("");setMessage("");
  try{
   const updated=await api<RealModel>("/projects/"+projectId+"/real-models/"+model.id,{
    method:"PUT",body:JSON.stringify({
     display_name:editName,notes:editNotes,status:changes?.status??model.status,
     favorite:changes?.favorite??model.favorite,revision:model.revision,
    }),
   });
   setModels(prev=>prev.map(item=>item.id===updated.id?updated:item));
   setEditName(updated.display_name);setEditNotes(updated.notes);
   setMessage("Cambios del modelo real guardados en PostgreSQL.");
  }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo editar la ficha.");}
  finally{setBusy(false);}
 }

 async function classify(file:File){
  if(!current||!run?.model_ref||!onDevice)return;
  setPredicting(true);setPredictionError("");setPredictions([]);
  try{
   const {predictInBrowser}=await import("./browserCNN");
   const values=await predictInBrowser(current.model_ref,file,run.config,run.classes);
   setPredictions(values);
  }catch(cause){setPredictionError(cause instanceof Error?cause.message:"No se pudo clasificar.");}
  finally{setPredicting(false);}
 }

 return <section className="panel real-registry" aria-label="Registro de modelos CNN reales">
  <div className="panel-head">
   <div><div className="eyebrow">REGISTRO DE ENTRENAMIENTOS VERDADEROS</div>
    <h2>Registro de modelos CNN reales</h2>
    <p className="muted">Ficha editable, favoritos y archivado sin perder los pesos.</p></div>
   <span className="badge">CNN REAL</span>
  </div>
  <p className="soft">Se conservan las fichas y métricas en PostgreSQL; los pesos CNN siguen exclusivamente en IndexedDB o en tus archivos .ncnn. Las métricas reportadas por clientes no están certificadas por Render.</p>
  <div className="metric-grid">
   <div><small>Registrados</small><strong>{models.length}</strong></div>
   <div><small>Pesos disponibles aquí</small><strong>{inventory==="available"?models.filter(item=>available.has(item.model_ref)).length:"—"}</strong></div>
   <div><small>Favoritos</small><strong>{models.filter(item=>item.favorite).length}</strong></div>
   <div><small>Archivados</small><strong>{models.filter(item=>item.status==="Archivado").length}</strong></div>
  </div>
  <div className="real-registry-register">
   <h3>Registrar un entrenamiento real</h3>
   {pending.length?<div className="real-registry-form">
    <label className="field"><span>Entrenamiento no registrado</span><select aria-label="Entrenamiento real para registrar" disabled={busy} value={newRun||pending[0]?.id||""} onChange={event=>setNewRun(event.target.value)}>
     {pending.map(item=><option key={item.id} value={item.id}>{item.classes.join(", ")} · {new Date(item.imported_at).toLocaleString("es-PE")}</option>)}
    </select></label>
    <label className="field"><span>Nombre del modelo real</span><input aria-label="Nombre del modelo real" maxLength={80} disabled={busy} value={newName} onChange={event=>setNewName(event.target.value)} placeholder="Ej. Clasificador v1"/></label>
    <button className="primary" type="button" disabled={busy} onClick={()=>void register()}>Registrar modelo real</button>
   </div>:<p className="caption">{loading?"Recuperando entrenamientos…":"No hay entrenamientos TensorFlow.js sin registrar. Entrena una CNN real desde Entrenamientos."}</p>}
  </div>
  {loading&&<p role="status">Cargando modelos reales…</p>}
  {inventory==="error"&&<p className="error" role="alert">No se pudo consultar IndexedDB. No es posible confirmar los pesos locales.</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  {message&&<p className="feedback" role="status">{message}</p>}
  <div className="real-registry-filters">
   <label className="field"><span>Buscar modelo</span><input aria-label="Buscar modelo real" type="search" placeholder="Nombre, clase u observación" value={query} onChange={event=>setQuery(event.target.value)}/></label>
   <label className="field"><span>Filtrar modelos</span><select aria-label="Filtrar modelos reales" value={filter} onChange={event=>setFilter(event.target.value as ModelFilter)}>
    {(["Todos","Disponibles","Archivados","Favoritos"] as ModelFilter[]).map(item=><option key={item}>{item}</option>)}
   </select></label>
  </div>
  {!loading&&!models.length&&<p className="caption">Todavía no existen modelos reales registrados. Las fichas de demostración están separadas debajo.</p>}
  <div className="real-registry-grid">
   {visible.map(item=><article key={item.id} aria-label={"Modelo real "+item.display_name} className={item.id===selected?"real-model-card selected":"real-model-card"}>
    <div className="real-model-top"><span className="badge">{item.status}</span><span aria-label={item.favorite?"Favorito":"No favorito"}>{item.favorite?"★":"☆"}</span></div>
    <h3>{item.display_name}</h3>
    <p className="caption">{item.classes.join(" · ")} · {item.parameters.toLocaleString("es-PE")} parámetros · {item.completed_epochs} épocas</p>
    <p className="real-model-availability">{inventory==="loading"?"Comprobando pesos…":inventory==="error"?"Disponibilidad desconocida":available.has(item.model_ref)?"Pesos disponibles en este navegador":"Sin pesos en este navegador"}</p>
    <p className="caption">Precisión de prueba declarada: {(item.test.accuracy*100).toFixed(1)}%</p>
    <button type="button" className="secondary" onClick={()=>{setSelected(item.id);setEditName(item.display_name);setEditNotes(item.notes);setPredictions([]);setPredictionError("");}}>Administrar modelo</button>
   </article>)}
  </div>
  {current&&<div className="real-registry-detail" aria-label="Detalle del modelo CNN real">
   <div className="panel-head"><div><h3>Ficha: {current.display_name}</h3>
    <p className="caption">Fecha: {new Date(current.created_at).toLocaleString("es-PE")} · revisión {current.revision} · dataset SHA-256: {current.dataset_fingerprint.slice(0,12)}</p></div>
    <span className="badge">{onDevice?"Pesos presentes":"Pesos no confirmados"}</span>
   </div>
   <div className="real-registry-form">
    <label className="field"><span>Nombre visible</span><input aria-label="Editar nombre del modelo real" maxLength={80} disabled={busy} value={editName} onChange={event=>setEditName(event.target.value)}/></label>
    <label className="field"><span>Observación del modelo</span><textarea aria-label="Observación del modelo real" rows={2} maxLength={1000} disabled={busy} value={editNotes} onChange={event=>setEditNotes(event.target.value)}/></label>
   </div>
   <div className="actions real-registry-actions">
    <button className="primary" disabled={busy} onClick={()=>void save(current)}>Guardar ficha real</button>
    <button className="secondary" disabled={busy} onClick={()=>void save(current,{favorite:!current.favorite})}>{current.favorite?"Quitar de favoritos":"Marcar favorito"}</button>
    <button className="secondary" disabled={busy} onClick={()=>void save(current,{status:current.status==="Archivado"?"Registrado":"Archivado"})}>{current.status==="Archivado"?"Restaurar ficha archivada":"Archivar ficha"}</button>
   </div>
   {current.status==="Archivado"&&<p className="caption">Archivar no elimina ni modifica los pesos o las métricas del modelo.</p>}
   {report&&<CNNBackupActions key={current.id} projectId={projectId} report={report} strictSelection onRestored={()=>void refreshInventory(()=>true)}/>}
   {onDevice&&current.status==="Registrado"&&<section className="cnn-backup-predictions" aria-label="Predicción CNN desde registro">
    <h3>Reconocer otra imagen sin reentrenar</h3>
    <label className="field"><span>Imagen nueva</span><input aria-label="Clasificar imagen con modelo real registrado" type="file" accept="image/png,image/jpeg,image/webp" disabled={predicting} onChange={event=>{
     const file=event.target.files?.[0];event.target.value="";if(file)void classify(file);
    }}/></label>
    {predicting&&<p role="status">Realizando inferencia CNN…</p>}
    {predictionError&&<p role="alert" className="error">{predictionError}</p>}
    {predictions.length>0&&<div className="table-scroll"><table><thead><tr><th>Clase</th><th>Probabilidad estimada</th></tr></thead><tbody>{predictions.map(item=><tr key={item.clase}><td>{item.clase}</td><td>{(item.probabilidad*100).toFixed(2)}%</td></tr>)}</tbody></table></div>}
   </section>}
  </div>}
  <p className="caption">El registro administra metadatos de modelos reales sin certificación independiente; no modifica las fichas de demostración.</p>
 </section>;
}
