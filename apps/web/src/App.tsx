import TrainingHistory from "./TrainingHistory";
import RealCNNResults from "./RealCNNResults";
import RealModelRegistry from "./RealModelRegistry";
import BrowserCNNTrainer from "./BrowserCNNTrainer";
import {repeatRun,cancelRun} from "./trainingHistory";
import EvaluationPanel from "./EvaluationPanel";
import RealEvaluationPanel from "./RealEvaluationPanel";
import ProjectsPanel from "./ProjectsPanel";
import {saveProject} from "./projects";
import type {Project,ProjectDraft} from "./projects";
import AutoCNNPanel from "./AutoCNNPanel";
import DatasetTransfer from "./DatasetTransfer";
import {recommendCNN} from "./adaptiveTraining";
import {fingerprintDataset,validateCompletedJob} from "./integrity";
import DatasetExplorer from "./DatasetExplorer";
import "./explorer.css";
import { useEffect, useRef, useState } from "react";
import {
  advanceJobs, csvCell, datasetMeta, defaultConfig,
  partition, readImages, summary, terminal,
} from "./cnn";
import type { Config, ImageDataset, ImageRecord, Job } from "./cnn";
import "./cnn.css";

type Page = "Dashboard" | "Proyectos" | "Diseñador CNN" | "Datasets" | "Entrenamientos" | "Evaluación" | "Modelos" | "Fundamentos" | "Reportes" | "Administración";
type Version = { id:string; projectId:string; version:number; config:Config; datasetName:string; classes:number; datasetFingerprint?:string };
type RecordModel = { id:string; version:number; job:Job; status:"Borrador"|"Revisado"|"Aprobado"|"Retirado"; history:string[] };

const pages: Page[] = ["Dashboard","Proyectos","Diseñador CNN","Datasets","Entrenamientos","Evaluación","Modelos","Fundamentos","Reportes","Administración"];


const pageDescriptions:Record<Page,string>={
  Dashboard:"El estado de tus proyectos, imágenes y experimentos en un solo lugar.",
  Proyectos:"Organiza tus iniciativas de clasificación de imágenes.",
  "Diseñador CNN":"Construye una arquitectura CNN válida para entrenar o simular.",
  Datasets:"Carga, valida y explora las imágenes que utilizará tu proyecto.",
  Entrenamientos:"Entrena CNN reales en tu navegador o revisa las simulaciones didácticas.",
  Evaluación:"Compara métricas de CNN reales y revisa simulaciones por separado.",
  Modelos:"Conserva versiones y revisa las fichas de cada experimento.",
  Fundamentos:"Comprende cada operación de una red convolucional.",
  Reportes:"Reúne la información del proyecto y prepara tus exportaciones.",
  Administración:"Gestiona usuarios de ejemplo y los límites de la cola."
};

function download(name:string,value:string,type:string) {
  const url = URL.createObjectURL(new Blob([value],{type}));
  const link = document.createElement("a");
  link.href=url; link.download=name; link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function Preview({image}:{image:ImageRecord}) {
  const [url,setURL]=useState("");
  useEffect(()=>{
    const value=URL.createObjectURL(image.file);
    setURL(value);
    return ()=>URL.revokeObjectURL(value);
  },[image.file]);
  return <figure className="cnn-preview"><img src={url || undefined} alt={`Ejemplo de la clase ${image.label}`} /><figcaption>{image.label}<small>{image.width} × {image.height}</small></figcaption></figure>;
}

function Chart({job,kind}:{job:Job;kind:"accuracy"|"loss"}) {
  const max=kind==="accuracy"?1:1.6;
  const chartEpochs=job.status==="Completado"?job.epoch:job.epochs;
  const x=(epoch:number)=>42+epoch/chartEpochs*430;
  const y=(value:number)=>165-value/max*145;
  const path=(validation:boolean)=>job.metrics.map((point,index)=>{
    const value=kind==="accuracy" ? validation?point.valAccuracy:point.accuracy : validation?point.valLoss:point.loss;
    return `${index?"L":"M"}${x(point.epoch)},${y(value)}`;
  }).join(" ");

  return <div className="cnn-chart">
    <svg viewBox="0 0 500 205" role="img" aria-label={kind==="accuracy"?"Precisión simulada de entrenamiento y validación":"Pérdida simulada de entrenamiento y validación"}>
      {[0,.25,.5,.75,1].map(ratio=><g key={ratio}><line x1="42" x2="472" y1={y(ratio*max)} y2={y(ratio*max)} stroke="#e2e8f1" /><text x="34" y={y(ratio*max)+4} textAnchor="end" fontSize="10" fill="#718098">{kind==="accuracy"?`${ratio*100}%`:(ratio*max).toFixed(2)}</text></g>)}
      <path d={path(false)} fill="none" stroke="#536bce" strokeWidth="2.5" />
      <path d={path(true)} fill="none" stroke="#318b79" strokeWidth="2.5" strokeDasharray="6 4" />
      {[0,.5,1].map(ratio=><text key={ratio} x={x(ratio*chartEpochs)} y="183" fontSize="10" fill="#718098" textAnchor="middle">{Math.round(ratio*chartEpochs)}</text>)}
      <text x="255" y="201" fontSize="10" fill="#718098" textAnchor="middle">Época</text>
    </svg>
    <div className="cnn-legend"><span>━ Entrenamiento</span><span>┄ Validación</span></div>
    {!job.metrics.length&&<p className="caption">Esperando las primeras épocas.</p>}
  </div>;
}

export default function App({initialProjects,onPersistProject}:{initialProjects?:Project[];onPersistProject?:(draft:ProjectDraft,id:string)=>Promise<Project>}={}) {
  const [page,setPage]=useState<Page>("Dashboard");
  const [projects,setProjects]=useState<Project[]>(initialProjects??[{id:"CNN-001",name:"Clasificación de imágenes",description:"Explora la clasificación de imágenes con una arquitectura CNN.",status:"Activo",tags:["CNN"]}]);
  const [projectId,setProjectId]=useState(initialProjects?.[0]?.id??"CNN-001");
  const [configs,setConfigs]=useState<Record<string,Config>>({});
  const [cnnModes,setCnnModes]=useState<Record<string,"automatic"|"manual">>({});
  const [datasets,setDatasets]=useState<Record<string,ImageDataset>>({});
  const [versions,setVersions]=useState<Version[]>([]);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [records,setRecords]=useState<RecordModel[]>([]);
  const [selectedId,setSelectedId]=useState("");
  const [modelId,setModelId]=useState("");
  const [note,setNote]=useState("");
  const [paused,setPaused]=useState(false);
  const [realRevision,setRealRevision]=useState(0);
  const [manualEpochsByProject,setManualEpochsByProject]=useState<Record<string,string>>({});
  const [batch,setBatch]=useState("32");
  const [train,setTrain]=useState("70");
  const [validation,setValidation]=useState("15");
  const [seed,setSeed]=useState("42");
  const [draft,setDraft]=useState<{projectId:string;name:string;images:ImageRecord[]}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [maxPending,setMaxPending]=useState("5");
  const [maxJobs,setMaxJobs]=useState("30");
  const [limits,setLimits]=useState({pending:5,jobs:30});
  const [users,setUsers]=useState([{name:"Administrador demo",email:"admin@example.com",role:"Administrador"}]);
  const [userName,setUserName]=useState("");
  const [userEmail,setUserEmail]=useState("");
  const [role,setRole]=useState("Lector");
  const request=useRef(0);

  const project=projects.find(item=>item.id===projectId)!;
  const dataset=datasets[projectId];
  const automatic=(cnnModes[projectId]??"automatic")==="automatic";
  const proposal=dataset?recommendCNN(dataset,defaultConfig()):null;
  const config=automatic
    ? proposal?.config??defaultConfig()
    : configs[projectId]??defaultConfig();
  const epochs=automatic&&proposal
    ? String(proposal.epochs)
    : manualEpochsByProject[projectId]??"20";

  function setEpochs(value:string) {
    if(automatic)return;
    setManualEpochsByProject(current=>({...current,[projectId]:value}));
  }

  function changeCNNMode(next:"automatic"|"manual") {
    if(next==="manual"&&automatic) {
      setConfigs(current=>current[projectId]
        ? current
        : {...current,[projectId]:structuredClone(config)});
      setManualEpochsByProject(current=>current[projectId]!==undefined
        ? current
        : {...current,[projectId]:epochs});
    }
    setCnnModes(current=>({...current,[projectId]:next}));
    setError("");
    setMessage(next==="automatic"
      ? "Modo automático activo: la configuración se calcula con el dataset del proyecto."
      : "Modo manual activo: puedes editar la arquitectura y los controles de entrenamiento.");
  }
  const projectJobs=jobs.filter(job=>job.projectId===projectId);
  const selected=projectJobs.find(job=>job.id===selectedId)??projectJobs.at(-1);
  const model=records.find(record=>record.id===modelId);
  const pending=jobs.filter(job=>!terminal(job.status)).length;

  let info:ReturnType<typeof summary>|null=null;
  let architectureError="";
  try {
    if(dataset) info=summary(config,dataset.classes.length);
  } catch(cause) {
    architectureError=cause instanceof Error?cause.message:"Configuración inválida.";
  }

  useEffect(()=>{
    if(paused)return;
    const timer=window.setInterval(()=>setJobs(current=>advanceJobs(current)),700);
    return ()=>window.clearInterval(timer);
  },[paused]);

  function navigate(next:Page) {setPage(next);setError("");setMessage("");}
  function changeProject(id:string) {
    request.current++;setBusy(false);setDraft(null);
    setProjectId(id);setSelectedId("");setError("");setMessage("");
  }
  function updateConfig(next:Config) {
    if(automatic)return;
    setConfigs(current=>({...current,[projectId]:next}));
    setMessage("");setError("");
  }
  function fail(cause:unknown) {
    setError(cause instanceof Error?cause.message:"No se pudo completar la operación.");
  }

  async function load(files:File[]) {
    const token=++request.current;
    const capturedProject=projectId;
    setBusy(true);setError("");setMessage("");setDraft(null);
    try {
      const images=await readImages(files);
      if(token!==request.current)return;
      const name=files.find(file=>file.webkitRelativePath)?.webkitRelativePath.split("/")[0]??"Imágenes";
      setDraft({projectId:capturedProject,name,images});
      setMessage(`Se decodificaron ${images.length} imágenes. Revisa las clases y aplica el dataset.`);
    } catch(cause) {
      if(token===request.current)fail(cause);
    } finally {
      if(token===request.current)setBusy(false);
    }
  }

  async function applyDataset() {
    setError("");setMessage("");
    try {
      if(!draft||draft.projectId!==projectId)throw new Error("Selecciona una carpeta de imágenes para este proyecto.");
      if([train,validation,seed].some(value=>!value.trim()))throw new Error("Completa porcentajes y semilla.");
      const split=partition(draft.images.map(image=>image.label),Number(train),Number(validation),Number(seed));
      const token=request.current;
      const prepared:ImageDataset={...split,name:draft.name,images:draft.images,seed:Number(seed)};
      prepared.fingerprint=await fingerprintDataset(prepared);
      if(token!==request.current)return;
      setDatasets(current=>({...current,[projectId]:prepared}));
      // En Automático la configuración se deriva del dataset aplicado.
      // En Manual se conservan los ajustes del proyecto.
      setMessage("Dataset de imágenes validado y aplicado.");
    } catch(cause){fail(cause);}
  }

  function saveVersion() {
    setError("");setMessage("");
    try {
      if(!dataset?.fingerprint)throw new Error("Carga y aplica nuevamente el dataset para registrar su identidad.");
      summary(config,dataset.classes.length);
      const previous=versions.filter(item=>item.projectId===projectId);
      const last=previous.at(-1);
      if(last&&JSON.stringify(last.config)===JSON.stringify(config)&&last.datasetFingerprint===dataset.fingerprint)throw new Error("Esta configuración ya es la última versión guardada.");
      const version=(last?.version??0)+1;
      setVersions(current=>[...current,{id:crypto.randomUUID(),projectId,version,config:structuredClone(config),datasetName:dataset.name,classes:dataset.classes.length,datasetFingerprint:dataset.fingerprint}]);
      setMessage(`Arquitectura CNN guardada como versión ${version}.`);
    } catch(cause){fail(cause);}
  }

  function createJob() {
    setError("");setMessage("");
    try {
      if(project.status==="Archivado")throw new Error("El proyecto está archivado. Actívalo desde Proyectos para crear nuevas simulaciones.");
      if(!dataset?.fingerprint)throw new Error("Primero carga y aplica el dataset con su huella digital.");
      summary(config,dataset.classes.length);
      const count=Number(epochs),batchSize=Number(batch);
      if(!epochs.trim()||!Number.isInteger(count)||count<1||count>100||!batch.trim()||!Number.isInteger(batchSize)||batchSize<1||batchSize>256)throw new Error("Épocas: entero de 1 a 100. Batch: entero de 1 a 256.");
      if(pending>=limits.pending||jobs.length>=limits.jobs)throw new Error(`Límite activo: ${limits.pending} trabajos pendientes y ${limits.jobs} por sesión.`);
      const version=[...versions].reverse().find(item=>item.projectId===projectId&&JSON.stringify(item.config)===JSON.stringify(config)&&item.datasetFingerprint===dataset.fingerprint);
      const id=`CNN-${crypto.randomUUID().slice(0,8)}`;
      const job:Job={createdAt:new Date().toISOString(),configurationMode:automatic?"automatic":"manual",id,projectId,name:project.name,config:structuredClone(config),dataset:datasetMeta(dataset),versionId:version?.id??null,epochs:count,batch:batchSize,epoch:0,status:"En cola",metrics:[]};
      setJobs(current=>[...current,job]);setSelectedId(id);
    } catch(cause){fail(cause);}
  }

  function repeatJob(source:Job) {
    setError("");setMessage("");
    try {
      if(source.projectId!==projectId)throw new Error("Selecciona una ejecución de este proyecto.");
      if(project.status==="Archivado")throw new Error("Activa el proyecto antes de repetir una simulación.");
      if(pending>=limits.pending||jobs.length>=limits.jobs)throw new Error(`Límite activo: ${limits.pending} trabajos pendientes y ${limits.jobs} por sesión.`);
      const next=repeatRun(source,`CNN-${crypto.randomUUID().slice(0,8)}`,new Date().toISOString());
      setJobs(current=>[...current,next]);setSelectedId(next.id);
      setMessage("Nueva simulación creada con la configuración original.");
    } catch(cause){fail(cause);}
  }

  function register(job:Job) {
    setError("");setMessage("");
    try{validateCompletedJob(job);}catch(cause){fail(cause);return;}
    if(records.some(record=>record.job.id===job.id)){setError("Esta ejecución ya tiene una ficha.");return;}
    const version=records.filter(record=>record.job.projectId===job.projectId).length+1;
    const record:RecordModel={id:crypto.randomUUID(),version,job:structuredClone(job),status:"Borrador",history:["Ficha CNN de demostración registrada. Sin pesos entrenados."]};
    setRecords(current=>[...current,record]);setModelId(record.id);setMessage("Ficha CNN registrada.");
  }

  function review(next:RecordModel["status"]) {
    if(!model)return;
    const allowed=model.status==="Borrador"?["Revisado","Retirado"]:model.status==="Revisado"?["Aprobado","Retirado"]:model.status==="Aprobado"?["Retirado"]:[];
    if(!allowed.includes(next)||note.trim().length<10){setError("Utiliza una transición permitida y una observación de al menos diez caracteres.");return;}
    setRecords(current=>current.map(record=>record.id===model.id?{...record,status:next,history:[...record.history,`${next}: ${note.trim()}`]}:record));
    setNote("");setError("");
  }

  function exportJobs() {
    const rows=[
      ["ejecucion","proyecto","tipo","estado","dataset","imagenes","clases","epocas_configuradas","epocas_ejecutadas","parada_temprana","precision_validacion","perdida_validacion"],
      ...projectJobs.map(job=>{
        const last=job.status==="Completado"?job.metrics.at(-1):undefined;
        return [job.id,job.name,"CNN_SIMULADA",job.status,job.dataset.name,job.dataset.count,job.dataset.classes.length,job.epochs,job.epoch,job.stoppedEarly?"SI":"NO",last?.valAccuracy??"",last?.valLoss??""];
      }),
    ];
    download("neurolab-cnn-reporte.csv","\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n"),"text/csv;charset=utf-8");
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon">N</span><div>NeuroLab<strong>Enterprise</strong><small>LABORATORIO CNN</small></div></div>
      <div className="workspace"><span>CNN</span><div><strong>Visión computacional</strong><small>Clasificación de imágenes</small></div></div>
      <p className="nav-label">ESPACIO DE TRABAJO</p>
      <nav aria-label="Navegación principal">{pages.map(item=><button className={page===item?"nav-item active":"nav-item"} key={item} aria-current={page===item?"page":undefined} onClick={()=>navigate(item)}>{item}</button>)}</nav>
      <div className="sidebar-foot">Exclusivamente CNN<small>{onPersistProject?"Proyectos y métricas en PostgreSQL":"Datos de esta sesión en memoria"}</small></div>
    </aside>
    <main>
      <header className="topbar"><div><span className="muted">NeuroLab</span><span className="slash">/</span><strong>{page}</strong></div><span className="badge">CNN · REAL + DEMO</span></header>
      <div className="content">
        <div className="heading"><div><div className="eyebrow">REDES NEURONALES CONVOLUCIONALES</div><h1>{page}</h1><p className="muted">{pageDescriptions[page]}</p></div></div>
        <div className="notice"><strong>Alcance actual:</strong> puedes entrenar CNN reales con TensorFlow.js y guardar los pesos en este navegador (IndexedDB). La cola de simulaciones, sus métricas y las fichas de demostración están claramente separadas de los resultados reales. {onPersistProject?"Proyectos y reportes CNN se conservan en PostgreSQL; las imágenes y arquitecturas aún no se sincronizan.":"Sin iniciar sesión, las métricas y proyectos no se sincronizan con PostgreSQL."}</div>
        <label className="field cnn-project no-print"><span>Proyecto activo</span><select aria-label="Proyecto activo" value={projectId} onChange={event=>changeProject(event.target.value)}>{projects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <p className="error" role="alert">{error}</p><p className="feedback" role="status">{message}</p>

        {page==="Dashboard"&&<>
          <div className="stats">{[["Proyectos CNN",projects.length],["Datasets aplicados",Object.keys(datasets).length],["Simulaciones pendientes",pending],["Fichas registradas",records.length]].map(([label,value])=><article className="card stat" key={String(label)}><p>{label}</p><strong>{value}</strong></article>)}</div>
          <section className="panel recent"><h2>Flujo de trabajo CNN</h2><div className="workflow">{["Carga imágenes por clase","Configura convolución y pooling","Entrena una CNN real y analiza las curvas","Registra y exporta resultados"].map((text,index)=><div key={text}><span>0{index+1}</span><strong>{text}</strong></div>)}</div><button className="primary" onClick={()=>navigate("Datasets")}>Cargar imágenes →</button></section>
        </>}

        {page==="Proyectos"&&<ProjectsPanel projects={projects} activeId={projectId}
          persistent={Boolean(onPersistProject)} onSave={async(draft,id)=>{
            const validated=saveProject(projects,draft,id);
            if(onPersistProject){const stored=await onPersistProject(draft,id);setProjects(current=>current.some(item=>item.id===stored.id)?current.map(item=>item.id===stored.id?stored:item):[...current,stored]);}
            else setProjects(validated);
          }}
          onOpen={id=>{changeProject(id);navigate("Diseñador CNN");}} />}

        {page==="Datasets"&&<>
          <section className="panel"><h2>Cargar imágenes por clase</h2><p className="muted">Selecciona la carpeta principal que contiene una subcarpeta por clase.</p>
            <div className="soft">Ejemplo: una carpeta «animales» con las subcarpetas «gatos» y «perros», cada una con sus imágenes. Se admiten PNG, JPG y WebP; entre 2 y 20 clases y al menos tres imágenes por clase. Máximo: 500 imágenes y 50 MiB.</div>
            <label className="field"><span>Carpeta de imágenes</span><input type="file" aria-label="Carpeta de imágenes" multiple ref={node=>{if(node)node.webkitdirectory=true;}} onChange={event=>{const files=Array.from(event.target.files??[]);event.target.value="";if(files.length)void load(files);}} /></label>
            {busy&&<p role="status">Decodificando y comprobando imágenes...</p>}
            {draft&&<><p>{draft.images.length} imágenes leídas · {new Set(draft.images.map(image=>image.label)).size} clases detectadas.</p><div className="cnn-previews">{draft.images.slice(0,8).map((image,index)=><Preview key={`${image.label}-${index}`} image={image} />)}</div></>}
            <div className="cnn-three"><label className="field"><span>Entrenamiento (%)</span><input type="number" value={train} onChange={event=>setTrain(event.target.value)} /></label><label className="field"><span>Validación (%)</span><input type="number" value={validation} onChange={event=>setValidation(event.target.value)} /></label><label className="field"><span>Semilla</span><input type="number" value={seed} onChange={event=>setSeed(event.target.value)} /></label></div>
            <button className="primary" disabled={busy||!draft} onClick={applyDataset}>Enviar dataset al proyecto</button>
            <p className="caption">Se verifican los archivos y se separan sus índices por clase. El tamaño y los canales del diseñador son la configuración de entrada prevista; aún no se ejecuta un pipeline de entrenamiento o normalización.</p>
          </section>
          {dataset&&<section className="panel recent"><h2>Dataset aplicado</h2><p>{dataset.name} · {dataset.images.length} imágenes · {dataset.classes.length} clases</p><details className="cnn-fingerprint"><summary>Identidad del dataset</summary><code>{dataset.fingerprint}</code><p>Identifica el contenido, las etiquetas y las particiones de esta configuración.</p></details><div className="metric-grid">{[["Entrenamiento",dataset.train.length],["Validación",dataset.validation.length],["Prueba",dataset.test.length]].map(([label,value])=><div key={String(label)}><small>{label}</small><strong>{value}</strong></div>)}</div><div className="table-scroll"><table><thead><tr><th>Clase</th><th>Imágenes</th><th>Etiqueta</th></tr></thead><tbody>{dataset.classes.map((label,index)=><tr key={label}><td>{label}</td><td>{dataset.images.filter(image=>image.label===label).length}</td><td>{index}</td></tr>)}</tbody></table></div></section>}
        </>}

        {page==="Datasets"&&dataset&&<><DatasetTransfer dataset={dataset} /><DatasetExplorer key={projectId} dataset={dataset} config={config} /></>}

        {page==="Diseñador CNN"&&<div className="designer">
          <section className="panel"><h2>Constructor convolucional</h2>{dataset&&<AutoCNNPanel dataset={dataset} config={config} automatic={automatic} onModeChange={changeCNNMode} onChange={updateConfig} onApply={(next,count)=>{updateConfig(next);setEpochs(String(count));}} />}<fieldset disabled={automatic} className="cnn-mode-fields">
            <legend>Arquitectura CNN · {automatic?"calculada automáticamente":"edición manual"}</legend>
            {automatic&&<p className="caption">Para modificar estos valores, selecciona Manual.</p>}
            <div className="cnn-three">
            <label className="field"><span>Tamaño de entrada</span><select value={config.size} onChange={event=>updateConfig({...config,size:Number(event.target.value)})}>{[28,32,64,128].map(value=><option key={value} value={value}>{value} × {value}</option>)}</select></label>
            <label className="field"><span>Canales</span><select value={config.channels} onChange={event=>updateConfig({...config,channels:Number(event.target.value)})}><option value={1}>Escala de grises · 1</option><option value={3}>RGB · 3</option></select></label>
            <label className="field"><span>Unidades Dense</span><input type="number" min="1" max="512" value={config.dense} onChange={event=>updateConfig({...config,dense:Number(event.target.value)})} /></label>
          </div>
          <div className="cnn-flow" role="region" aria-label="Diagrama desplazable de la arquitectura CNN" tabIndex={0}><span>Entrada<br />{config.size} × {config.size} × {config.channels}</span>{config.layers.map((layer,index)=><span key={layer.id}>Conv2D {index+1}<br />{layer.filters} filtros{layer.pool?<><br />MaxPool 2 × 2</>:null}</span>)}<span>Flatten<br />{info?.flattened??"—"}</span><span>Dense<br />{config.dense}</span><span>Salida<br />{info?`${info.output} · ${info.activation}`:"Requiere dataset"}</span></div>
          {config.layers.map((layer,index)=><article className="cnn-block" key={layer.id}>
            <div className="panel-head"><h3>Bloque convolucional {index+1}</h3><div className="actions"><button className="secondary" disabled={index===0} aria-label={`Subir bloque ${index+1}`} onClick={()=>{const layers=[...config.layers];[layers[index-1],layers[index]]=[layers[index],layers[index-1]];updateConfig({...config,layers});}}>↑</button><button className="secondary" disabled={config.layers.length===1} onClick={()=>updateConfig({...config,layers:config.layers.filter(item=>item.id!==layer.id)})}>Eliminar bloque</button></div></div>
            <div className="cnn-three"><label className="field"><span>Filtros · 1 a 128</span><input type="number" min="1" max="128" value={layer.filters} onChange={event=>updateConfig({...config,layers:config.layers.map(item=>item.id===layer.id?{...item,filters:Number(event.target.value)}:item)})} /></label>
            <label className="field"><span>Kernel</span><select value={layer.kernel} onChange={event=>updateConfig({...config,layers:config.layers.map(item=>item.id===layer.id?{...item,kernel:Number(event.target.value)}:item)})}><option value={3}>3 × 3</option><option value={5}>5 × 5</option></select></label>
            <label className="field"><span>Activación</span><select value={layer.activation} onChange={event=>updateConfig({...config,layers:config.layers.map(item=>item.id===layer.id?{...item,activation:event.target.value as "relu"|"tanh"}:item)})}><option>relu</option><option>tanh</option></select></label></div>
            <label className="cnn-check"><input type="checkbox" checked={layer.pool} onChange={event=>updateConfig({...config,layers:config.layers.map(item=>item.id===layer.id?{...item,pool:event.target.checked}:item)})} />MaxPooling 2 × 2</label>
            <p className="caption">Stride convolucional: 1 · Padding: same. {info?`Salida del bloque: ${info.blocks[index].spatial} × ${info.blocks[index].spatial} × ${info.blocks[index].channels}. Parámetros: ${info.blocks[index].parameters.toLocaleString("es-PE")}.`:""}</p>
          </article>)}
          <button className="secondary" disabled={config.layers.length>=4} onClick={()=>updateConfig({...config,layers:[...config.layers,{id:crypto.randomUUID(),filters:32,kernel:3,pool:true,activation:"relu"}]})}>Añadir bloque Conv2D</button>
          </fieldset>
          {architectureError&&<p className="error">{architectureError}</p>}
          </section>
          <section className="panel properties"><h2>Resumen CNN</h2><dl><dt>Dataset</dt><dd>{dataset?.name??"Sin dataset"}</dd><dt>Clases</dt><dd>{dataset?.classes.length??"—"}</dd><dt>Parámetros</dt><dd>{info?.total.toLocaleString("es-PE")??"Pendiente"}</dd><dt>Salida</dt><dd>{info?.activation??"Pendiente"}</dd><dt>Pérdida prevista</dt><dd>{info?.loss??"Pendiente"}</dd></dl><button className="primary full" onClick={saveVersion}>Guardar versión CNN</button><button className="secondary full cnn-spaced" onClick={()=>navigate("Entrenamientos")}>Configurar simulación →</button>
          <h3 className="cnn-spaced">Versiones</h3>{versions.filter(item=>item.projectId===projectId).map(item=><div className="cnn-version" key={item.id}>CNN v{item.version} · {item.config.layers.length} bloques <button className="text-button" onClick={()=>download(`cnn-arquitectura-v${item.version}.json`,JSON.stringify({containsWeights:false,architecture:item},null,2),"application/json")}>Exportar JSON</button></div>)}
          </section>
        </div>}

        {page==="Entrenamientos"&&<>
          <BrowserCNNTrainer key={projectId} projectId={projectId} dataset={dataset} config={config} connected={Boolean(onPersistProject)} onSaved={()=>setRealRevision(current=>current+1)}/>
          {onPersistProject&&<RealCNNResults key={projectId+":"+realRevision} projectId={projectId} />}
          <section className="panel"><div className="panel-head"><h2>Simulación CNN · {automatic?"Automático":"Manual"}</h2><button className="secondary" onClick={()=>setPaused(value=>!value)}>{paused?"Reanudar demo":"Pausar demo"}</button></div><div className="cnn-three"><label className="field"><span>Épocas</span><input aria-label="Épocas" type="number" min="1" max="100" disabled={automatic} value={epochs} onChange={event=>setEpochs(event.target.value)} /></label><label className="field"><span>Batch size</span><input type="number" value={batch} onChange={event=>setBatch(event.target.value)} /></label><button className="primary" onClick={createJob}>Añadir a la cola</button></div><div className="soft">Las imágenes son reales. Las curvas son ilustrativas y no dependen de los píxeles, filtros o batch. No se ejecuta TensorFlow ni se generan pesos.</div></section>
          <div className="training-layout"><section className="panel"><h2>Cola del proyecto</h2>{!projectJobs.length&&<div className="cnn-empty"><p>Todavía no hay ejecuciones en este proyecto.</p><button className="secondary" onClick={()=>navigate(dataset?"Diseñador CNN":"Datasets")}>{dataset?"Revisar arquitectura":"Cargar imágenes"}</button></div>}{[...projectJobs].reverse().map(job=><button className={selected?.id===job.id?"queue-item chosen":"queue-item"} key={job.id} onClick={()=>setSelectedId(job.id)}><strong>{job.name}</strong><span data-status={job.status}>{job.status}</span><small>{job.id}</small><progress max={job.epochs} value={job.status==="Completado"?job.epochs:job.epoch} /><small>{job.epoch}/{job.epochs} épocas</small></button>)}</section>
          <div className="training-detail">{selected&&<>
            <section className="panel"><div className="panel-head"><h2>{selected.name}</h2><span className="badge" data-status={selected.status}>{selected.status}</span></div><progress max={selected.epochs} value={selected.status==="Completado"?selected.epochs:selected.epoch} /><p className="caption">{selected.epoch}/{selected.epochs} épocas · {selected.dataset.name} · {selected.dataset.classes.length} clases · {selected.config.layers.length} bloques CNN</p><button className="secondary" disabled={terminal(selected.status)} onClick={()=>setJobs(current=>current.map(job=>job.id===selected.id?cancelRun(job,new Date().toISOString()):job))}>Cancelar simulación</button></section>
            <p className="soft">{selected.stopReason??"Simulación en curso."} {selected.bestEpoch?`Época de referencia de mejora: ${selected.bestEpoch}.`:""} No se restauran pesos porque el entrenamiento es simulado.</p><div className="cnn-two-charts"><section className="panel"><h2>Precisión de entrenamiento</h2><p className="caption">Entrenamiento y validación · simulado</p><Chart job={selected} kind="accuracy" /></section><section className="panel"><h2>Pérdida</h2><p className="caption">Entrenamiento y validación · simulado</p><Chart job={selected} kind="loss" /></section></div>
          </>}</div></div>
          <TrainingHistory key={projectId} jobs={projectJobs} onRepeat={repeatJob} onSelect={setSelectedId}/>
        </>}

        {page==="Evaluación"&&<>
          {onPersistProject?<RealEvaluationPanel key={projectId} projectId={projectId}/>:<p className="soft">Para comparar informes CNN reales, inicia sesión y registra los resultados en PostgreSQL. Las simulaciones aparecen separadas abajo.</p>}
          <EvaluationPanel key={projectId} jobs={projectJobs}/>
        </>}

        {page==="Modelos"&&<>
          {onPersistProject?<RealModelRegistry projectId={projectId}/>:<p className="soft">Los modelos CNN reales pueden respaldarse desde Entrenamientos. Inicia sesión para administrarlos con fichas persistentes en PostgreSQL.</p>}
          <section className="panel"><h2>Registrar ficha CNN</h2><p className="muted">Selecciona una ejecución completada. Cada ejecución admite una ficha.</p>{projectJobs.filter(job=>job.status==="Completado"&&!records.some(record=>record.job.id===job.id)).map(job=><div className="panel-head cnn-version" key={job.id}><span>{job.id} · {job.dataset.name}</span><button className="primary" onClick={()=>register(job)}>Registrar ficha</button></div>)}</section>
          <div className="projects-grid cnn-spaced">{records.filter(record=>record.job.projectId===projectId).map(record=><article className="card" key={record.id}><span className="badge" data-status={record.status}>{record.status} · demo</span><h2 className="cnn-spaced">{record.job.name}</h2><p>CNN · versión {record.version}</p><p className="caption">{record.job.config.layers.length} bloques · {record.job.dataset.classes.length} clases</p><button className="text-button" onClick={()=>{setModelId(record.id);setNote("");}}>Ver detalle →</button></article>)}</div>
          {model&&<section className="panel recent"><h2>CNN v{model.version} · {model.status}</h2><p>{model.job.dataset.name} · {model.job.dataset.count} imágenes · {model.job.config.layers.map(layer=>`${layer.filters} filtros ${layer.kernel}×${layer.kernel}`).join(" → ")}</p><button className="secondary" onClick={()=>download(`cnn-ficha-v${model.version}.json`,JSON.stringify({simulated:true,containsModelWeights:false,record:model},null,2),"application/json")}>Exportar ficha JSON</button><label className="field"><span>Observación de revisión</span><textarea rows={3} maxLength={1000} value={note} onChange={event=>setNote(event.target.value)} /></label><div className="actions">{model.status==="Borrador"&&<button className="primary" onClick={()=>review("Revisado")}>Marcar revisado</button>}{model.status==="Revisado"&&<button className="primary" onClick={()=>review("Aprobado")}>Aprobar demo</button>}{model.status!=="Retirado"&&<button className="secondary" onClick={()=>review("Retirado")}>Retirar ficha</button>}</div><ol className="event-list">{model.history.map((event,index)=><li key={index}>{event}</li>)}</ol><div className="soft">Revisión de demostración: no representa permisos reales ni certifica un modelo entrenado.</div></section>}
        </>}

        {page==="Fundamentos"&&<div className="concept-grid">{[
          ["CNN","Red neuronal convolucional para aprender patrones locales de imágenes."],
          ["Conv2D","Aplica filtros con pesos compartidos sobre regiones de la imagen."],
          ["Filtros","Cada filtro produce un mapa de características. Aprende patrones durante un entrenamiento real."],
          ["Kernel","Ventana del filtro. El constructor admite 3 × 3 y 5 × 5."],
          ["Padding same","Con stride 1 conserva la altura y anchura en la convolución."],
          ["MaxPooling","Reduce las dimensiones espaciales tomando máximos de regiones 2 × 2."],
          ["Flatten y Dense","Flatten convierte mapas en un vector; Dense combina sus características para clasificar."],
          ["Salida","Dos clases: una unidad sigmoid. Más clases: una unidad por clase y softmax."],
        ].map(([title,text])=><article className="card concept-card" key={title}><h2>{title}</h2><p className="muted">{text}</p></article>)}</div>}

        {page==="Reportes"&&<section className="panel cnn-report"><div className="panel-head no-print"><h2>Reporte CNN del proyecto</h2><div className="actions"><button className="secondary" onClick={exportJobs}>Exportar CSV</button><button className="primary" onClick={()=>window.print()}>Imprimir / guardar PDF</button></div></div><h2 className="cnn-spaced">{project.name}</h2><p>Dataset actual: {dataset?.name??"Sin dataset"} · Imágenes: {dataset?.images.length??0}</p><div className="soft">Reporte de frontend. Métricas simuladas; no contiene modelos entrenados ni las imágenes originales.</div><div className="table-scroll"><table><thead><tr><th>Ejecución</th><th>Estado</th><th>Dataset conservado</th><th>Bloques CNN</th><th>Clases</th></tr></thead><tbody>{projectJobs.map(job=><tr key={job.id}><td>{job.id}</td><td>{job.status}</td><td>{job.dataset.name}</td><td>{job.config.layers.length}</td><td>{job.dataset.classes.length}</td></tr>)}</tbody></table></div><h3 className="cnn-spaced">Versiones registradas</h3>{records.filter(record=>record.job.projectId===projectId).map(record=><p key={record.id}>CNN v{record.version} · {record.status} · origen {record.job.id}</p>)}</section>}

        {page==="Administración"&&<>
          <section className="panel"><h2>Límites de la cola</h2><div className="cnn-three"><label className="field"><span>Máximo de pendientes · 1 a 10</span><input type="number" value={maxPending} onChange={event=>setMaxPending(event.target.value)} /></label><label className="field"><span>Máximo por sesión · hasta 100</span><input type="number" value={maxJobs} onChange={event=>setMaxJobs(event.target.value)} /></label><button className="primary" onClick={()=>{const first=Number(maxPending),second=Number(maxJobs);if(!Number.isInteger(first)||first<1||first>10||!Number.isInteger(second)||second<first||second>100){setError("Revisa los límites: pendientes 1 a 10; máximo por sesión entre ese límite y 100.");return;}setLimits({pending:first,jobs:second});setError("");setMessage("Límites aplicados a nuevas ejecuciones.");}}>Aplicar límites</button></div><div className="soft">Activos: {limits.pending} pendientes y {limits.jobs} por sesión. Un trabajo se procesa a la vez. Los límites no eliminan ejecuciones existentes.</div></section>
          <section className="panel recent"><h2>Usuarios de demostración</h2><form className="cnn-user-form" onSubmit={event=>{event.preventDefault();const email=userEmail.trim().toLowerCase();if(userName.trim().length<3||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||users.some(user=>user.email===email)){setError("Revisa el nombre y utiliza un correo válido y único.");return;}setUsers(current=>[...current,{name:userName.trim(),email,role}]);setUserName("");setUserEmail("");setError("");}}><label className="field"><span>Nombre</span><input value={userName} maxLength={80} onChange={event=>setUserName(event.target.value)} required /></label><label className="field"><span>Correo</span><input type="email" value={userEmail} onChange={event=>setUserEmail(event.target.value)} required /></label><label className="field"><span>Rol</span><select value={role} onChange={event=>setRole(event.target.value)}>{["Administrador","Responsable de proyecto","Ingeniero/analista","Revisor","Lector"].map(value=><option key={value}>{value}</option>)}</select></label><button className="primary">Añadir usuario demo</button></form><div className="table-scroll"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th></tr></thead><tbody>{users.map(user=><tr key={user.email}><td>{user.name}</td><td>{user.email}</td><td>{user.role}</td></tr>)}</tbody></table></div><p className="caption">No crea cuentas reales, envía mensajes ni aplica autorización.</p></section>
        </>}
        <footer>NeuroLab Enterprise · Exclusivamente CNN · Pesos reales en IndexedDB · {onPersistProject?"Métricas en PostgreSQL":"Sesión sin persistencia en servidor"}</footer>
      </div>
    </main>
  </div>;
}

import "./premium.css";
