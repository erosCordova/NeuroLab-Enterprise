import {useState} from "react";
import type {Job} from "./cnn";
import {terminal} from "./cnn";
import {elapsedSeconds,filterRuns,historyCSV} from "./trainingHistory";

type Props={jobs:Job[];onRepeat:(job:Job)=>void;onSelect:(id:string)=>void};
const date=(value?:string)=>value?new Date(value).toLocaleString("es-PE"):"—";
export default function TrainingHistory({jobs,onRepeat,onSelect}:Props) {
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("Todos");
  const visible=filterRuns(jobs,search,status).toReversed();
  function exportCSV() {
    const url=URL.createObjectURL(new Blob([historyCSV(visible)],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download="historial-cnn-simulado.csv";link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="panel recent" aria-label="Historial de entrenamientos">
    <div className="panel-head"><div><h2>Historial de entrenamientos</h2><p className="muted">Ejecuciones de esta sesión · {visible.length} de {jobs.length}</p></div>
      <button className="secondary" disabled={!visible.length} onClick={exportCSV}>Exportar historial CSV</button></div>
    <div className="two-fields"><label className="field"><span>Buscar ejecuciones</span><input aria-label="Buscar ejecuciones" value={search} placeholder="ID, proyecto o dataset" onChange={event=>setSearch(event.target.value)}/></label>
      <label className="field"><span>Filtrar ejecuciones por estado</span><select aria-label="Filtrar ejecuciones por estado" value={status} onChange={event=>setStatus(event.target.value)}>
        {["Todos","En cola","Preparando","Ejecutando","Completado","Cancelado"].map(value=><option key={value}>{value}</option>)}</select></label></div>
    <p className="caption">Repetir crea otra simulación con la configuración y el dataset originales, desde la primera época. No reanuda pesos ni modifica la ejecución anterior. La duración incluye pausas de la demo durante la ejecución.</p>
    <div className="table-scroll"><table><thead><tr><th>Ejecución</th><th>Estado</th><th>Creada / finalizada</th><th>Duración</th><th>Épocas</th><th>Dataset</th><th>Acciones</th></tr></thead>
      <tbody>{visible.map(job=><tr key={job.id}><td>{job.id}{job.repeatedFrom&&<small style={{display:"block"}}>Origen: {job.repeatedFrom}</small>}</td>
        <td><span className="badge" data-status={job.status}>{job.status}</span></td><td>{date(job.createdAt)}<br/>{date(job.endedAt)}</td>
        <td>{elapsedSeconds(job)===null?"—":`${elapsedSeconds(job)!.toFixed(1)} s`}</td><td>{job.epoch} / {job.epochs}</td><td>{job.dataset.name}</td>
        <td><div className="actions"><button className="text-button" aria-label={`Ver ejecución ${job.id}`} onClick={()=>onSelect(job.id)}>Ver</button>
          <button className="secondary" disabled={!terminal(job.status)} aria-label={`Repetir ejecución ${job.id}`} onClick={()=>onRepeat(job)}>Repetir</button></div></td>
      </tr>)}</tbody></table></div>
    {!visible.length&&<p className="caption">No hay ejecuciones que coincidan con los filtros.</p>}
  </section>;
}
