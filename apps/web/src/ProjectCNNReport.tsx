import {useEffect,useState} from "react";
import {api} from "./api";
import type {RealRun} from "./realRuns";
import type {RealModel} from "./realModelRegistry";
import {buildProjectReport,reportCSV,reportJSON} from "./projectReport";
import "./project-report.css";

type Props={projectId:string;projectName:string;mode:"dashboard"|"report"};
function download(name:string,content:string,type:string){
 const url=URL.createObjectURL(new Blob([content],{type}));
 const a=document.createElement("a");a.href=url;a.download=name;
 document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const pct=(v:number)=>(v*100).toFixed(1)+"%";
export default function ProjectCNNReport({projectId,projectName,mode}:Props){
 const [runs,setRuns]=useState<RealRun[]>([]);
 const [models,setModels]=useState<RealModel[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [version,setVersion]=useState(0);
 const [engine,setEngine]=useState("Todos");
 useEffect(()=>{
  let live=true;
  setLoading(true);setError("");setRuns([]);setModels([]);setEngine("Todos");
  void Promise.all([
   api<RealRun[]>("/projects/"+projectId+"/real-runs"),
   api<RealModel[]>("/projects/"+projectId+"/real-models"),
  ]).then(([history,registered])=>{
   if(live){setRuns(history);setModels(registered);}
  }).catch(cause=>{
   if(live)setError(cause instanceof Error?cause.message:"No se pudieron consultar los indicadores CNN.");
  }).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[projectId,version]);
 const report=buildProjectReport(projectName,runs,models);
 const isFull=mode==="report";
 const shown=report.rows.filter(r=>engine==="Todos"||engine===r.engine);
 const metrics=[
  ["Entrenamientos reales",report.totals.runs,"Informes registrados"],
  ["Modelos CNN reales",report.totals.models,"Fichas en PostgreSQL"],
  ["Datasets distintos",report.totals.datasets,"Huellas declaradas"],
  ["Mayor precisión declarada",report.highest_reported?pct(report.highest_reported.accuracy):"—","No implica superioridad"],
 ] as const;
 return <section className={"project-real-report "+(isFull?"project-report-full":"project-report-short")}
  aria-label={isFull?"Informe profesional de CNN reales":"Indicadores CNN reales del proyecto"}>
  <header className="project-report-head">
   <div><div className="project-report-eyebrow">NEUROLAB · RESULTADOS OBSERVADOS</div>
    <h2>{isFull?"Informe profesional de experimentos CNN":"Panel de indicadores CNN reales"}</h2>
    <p className="muted">{projectName} · {report.totals.browser} TensorFlow.js · {report.totals.keras} Keras</p>
   </div>
   <div className="project-report-buttons no-print">
    <button className="secondary" disabled={loading} onClick={()=>setVersion(v=>v+1)}>Actualizar indicadores</button>
    {isFull&&<button className="primary" onClick={()=>window.print()}>Imprimir / guardar PDF</button>}
   </div>
  </header>
  {loading&&<p role="status">Cargando los indicadores CNN del proyecto…</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  {!loading&&!error&&<>
   <div className="project-report-kpis">
    {metrics.map(([label,value,caption])=><article className="project-report-kpi" key={label}>
     <small>{label}</small><strong>{value}</strong><span>{caption}</span>
    </article>)}
   </div>
   <p className="project-report-warning">{report.warning} Las cifras describen los {report.totals.runs} informes recuperados.</p>
   {!report.coverage.exhaustive&&<p className="soft">Vista parcial: se consultan como máximo 50 entrenamientos y 50 modelos por proyecto; los totales y máximos podrían no abarcar el historial completo.</p>}
   {!report.rows.length?<div className="project-report-empty">
    <h3>Sin entrenamientos CNN reales registrados</h3>
    <p>Entrena una CNN desde Entrenamientos o importa un informe válido. Los datos de demostración están separados y no se cuentan como reales.</p>
   </div>:<>
    <div className="project-report-main">
     <article className="project-report-section" aria-label="Precisión de últimos entrenamientos reales">
      <div className="project-report-section-head"><h3>Últimos resultados de prueba</h3><span>Máximo 8 registros</span></div>
      <div className="project-report-bars">
       {report.rows.slice(0,8).map(r=><div className="project-report-bar" key={r.id}>
        <span>{r.id.slice(0,8)}</span>
        <div className="project-report-track" aria-label={"Precisión reportada "+pct(r.accuracy)}>
         <div style={{width:pct(r.accuracy)}}/>
        </div><strong>{pct(r.accuracy)}</strong>
       </div>)}
      </div>
      <p className="caption">Resultados comunicados por clientes. No se han comparado estadísticamente ni se garantizan particiones idénticas.</p>
     </article>
     <article className="project-report-section" aria-label="Estados de modelos reales">
      <div className="project-report-section-head"><h3>Inventario de modelos</h3><span>Metadatos, no pesos</span></div>
      <div className="project-report-totals">
       <p><span>Activos</span><strong>{report.totals.active}</strong></p>
       <p><span>Archivados</span><strong>{report.totals.archived}</strong></p>
       <p><span>Favoritos</span><strong>{report.totals.favorites}</strong></p>
       <p><span>Informes Python/Keras</span><strong>{report.totals.keras}</strong></p>
      </div>
      <p className="caption">Los pesos TensorFlow.js permanecen en IndexedDB o en archivos .ncnn del usuario.</p>
     </article>
    </div>
    {isFull&&<>
     <div className="project-report-tools no-print">
      <label className="field"><span>Filtrar motor</span>
       <select value={engine} aria-label="Filtrar motor del informe CNN" onChange={e=>setEngine(e.target.value)}>
        <option>Todos</option><option>TensorFlow.js</option><option>TensorFlow/Keras</option>
       </select>
      </label>
      <div className="project-report-buttons">
       <button className="secondary" onClick={()=>download("neurolab-informe-cnn-real.csv",reportCSV(report),"text/csv;charset=utf-8")}>Exportar informe real CSV</button>
       <button className="secondary" onClick={()=>download("neurolab-informe-cnn-real.json",reportJSON(report),"application/json")}>Exportar informe real JSON</button>
      </div>
     </div>
     <div className="table-scroll"><table aria-label="Tabla del informe CNN real">
      <thead><tr><th>Experimento</th><th>Fecha</th><th>Motor</th><th>Épocas</th><th>Parámetros</th><th>Precisión test</th><th>Pérdida test</th><th>Precisión validación</th></tr></thead>
      <tbody>{shown.map(r=><tr key={r.id}>
       <td>{r.id.slice(0,8)}</td><td>{new Date(r.date).toLocaleDateString("es-PE")}</td>
       <td>{r.engine}</td><td>{r.epochs}</td><td>{r.parameters.toLocaleString("es-PE")}</td>
       <td>{pct(r.accuracy)}</td><td>{r.loss.toFixed(4)}</td><td>{pct(r.validationAccuracy)}</td>
      </tr>)}</tbody>
     </table></div>
     {!shown.length&&<p className="caption">No se encontraron entrenamientos para el motor seleccionado.</p>}
     <p className="project-report-foot">Informe descriptivo. No contiene imágenes, pesos de modelos ni credenciales. La precisión comunicada no sustituye una evaluación independiente.</p>
    </>}
   </>}
  </>}
 </section>;
}
