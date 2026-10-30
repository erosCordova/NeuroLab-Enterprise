import { useState } from "react";
import type { Job } from "./cnn";
import { compareRuns, comparisonCSV, describeRun, epochCSV } from "./evaluation";
import "./evaluation.css";

type Props={jobs:Job[]};
function download(name:string,content:string,type:string) {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const link=document.createElement("a");link.href=url;link.download=name;link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const percent=(value:number)=>(value*100).toFixed(1)+"%";

export default function EvaluationPanel({jobs}:Props) {
  const completed=jobs.filter(job=>job.status==="Completado");
  const [ids,setIds]=useState<string[]>([]);
  const [detailId,setDetailId]=useState("");
  const [showMetrics,setShowMetrics]=useState(false);
  const [metricPage,setMetricPage]=useState(0);
  const [error,setError]=useState("");
  const selectedIds=ids.filter(id=>completed.some(job=>job.id===id));
  const current=completed.find(job=>job.id===detailId)??completed.at(-1);
  const report=selectedIds.length?compareRuns(completed,selectedIds):null;
  const detail=current?describeRun(current):null;
  const page=Math.min(metricPage,Math.max(0,Math.ceil((current?.metrics.length??0)/10)-1));
  function exportReport(type:"json"|"csv") {
    try {
      if(type==="json") download("comparacion-cnn-simulada.json",JSON.stringify(compareRuns(completed,selectedIds),null,2),"application/json");
      else download("comparacion-cnn-simulada.csv",comparisonCSV(completed,selectedIds),"text/csv;charset=utf-8");
      setError("");
    } catch(cause) {setError(cause instanceof Error?cause.message:"No se pudo exportar.");}
  }
  return <div className="evaluation-workspace">
    <section className="panel" aria-label="Resultados de ejecuciones">
      <div className="panel-head"><div><div className="eyebrow">RESULTADOS DEL PROYECTO</div><h2>Evaluación de simulaciones CNN</h2></div>
        <span className="badge">{completed.length} completadas</span></div>
      <div className="soft">Métricas ilustrativas de la última época. No son predicciones ni evaluación real del conjunto de prueba. Selecciona hasta tres ejecuciones para comparar su configuración.</div>
      {!completed.length?<div className="cnn-empty"><h3>Aún no hay resultados completados</h3><p className="muted">Carga imágenes e inicia una simulación desde Entrenamientos. Los trabajos cancelados no se presentan como resultados finales.</p></div>:
      <div className="table-scroll"><table className="evaluation-summary"><thead><tr><th>Comparar</th><th>Ejecución</th><th>Dataset</th><th>Épocas</th><th>Precisión validación</th><th>Pérdida validación</th><th>Detalle</th></tr></thead>
        <tbody>{completed.map(job=>{const point=job.metrics.at(-1)!;return <tr key={job.id}>
          <td><input type="checkbox" aria-label={`Comparar ejecución ${job.id}`} checked={selectedIds.includes(job.id)} disabled={selectedIds.length>=3&&!selectedIds.includes(job.id)}
            onChange={event=>setIds(event.target.checked?[...selectedIds,job.id]:selectedIds.filter(id=>id!==job.id))}/></td>
          <td>{job.id}</td><td>{job.dataset.name}</td><td>{job.epoch} / {job.epochs}</td><td>{percent(point.valAccuracy)}</td><td>{point.valLoss.toFixed(4)}</td>
          <td><button className="text-button" aria-label={`Inspeccionar ejecución ${job.id}`} onClick={()=>{setDetailId(job.id);setMetricPage(0);setShowMetrics(true);}}>Inspeccionar</button></td>
        </tr>;})}</tbody></table></div>}
    </section>

    <section className="panel" aria-label="Comparación de ejecuciones">
      <div className="panel-head"><div><h2>Comparación de ejecuciones</h2><p className="muted">{selectedIds.length} de 3 seleccionadas · sin clasificación de ganadores</p></div>
        <div className="actions"><button className="secondary" disabled={!report} onClick={()=>exportReport("csv")}>Exportar comparación CSV</button>
          <button className="secondary" disabled={!report} onClick={()=>exportReport("json")}>Exportar comparación JSON</button>
          <button className="text-button" disabled={!report} onClick={()=>{setIds([]);setError("");}}>Limpiar comparación</button></div></div>
      {error&&<p className="error" role="alert">{error}</p>}
      {!report?<p className="caption">Marca las ejecuciones en la tabla superior para verlas lado a lado.</p>:<>
        <p role="status" className="soft">{report.sameDataset?"Las ejecuciones conservan la misma huella de dataset y particiones.":"Datasets o particiones distintos: los resultados no son directamente comparables."} Todas las métricas son simuladas.</p>
        <div className="evaluation-cards">{report.rows.map(row=><article className="comparison-card" aria-label={`Comparación ${row.id}`} key={row.id}>
          <span className="badge">{row.mode==="automatic"?"Automático":"Manual"}</span><h3>{row.id}</h3>
          <dl><dt>Dataset</dt><dd>{row.dataset.name}</dd><dt>Huella SHA-256</dt><dd className="evaluation-hash">{row.dataset.fingerprint}</dd>
            <dt>Entrada</dt><dd>{row.configuration.size} × {row.configuration.size} × {row.configuration.channels}</dd>
            <dt>Bloques / Dense</dt><dd>{row.configuration.layers.length} / {row.configuration.dense}</dd>
            <dt>Parámetros</dt><dd>{row.parameters.toLocaleString("es-PE")}</dd>
            <dt>Épocas ejecutadas / máximo</dt><dd>{row.epochsExecuted} / {row.epochsConfigured}</dd>
            <dt>Dropout / L2</dt><dd>{row.configuration.dropout??0} / {row.configuration.l2??0}</dd>
            <dt>Precisión entrenamiento / validación</dt><dd>{percent(row.final.accuracy)} / {percent(row.final.valAccuracy)}</dd>
            <dt>Pérdida entrenamiento / validación</dt><dd>{row.final.loss.toFixed(4)} / {row.final.valLoss.toFixed(4)}</dd>
            <dt>Parada temprana</dt><dd>{row.stoppedEarly?"Sí":"No"}</dd></dl>
        </article>)}</div>
      </>}
    </section>

    {current&&detail&&<section className="panel" aria-label="Métricas por época">
      <div className="panel-head"><div><h2>Detalle por época</h2><p className="caption">{current.id} · {current.dataset.name}</p></div>
        <button className="secondary" onClick={()=>download("metricas-por-epoca-cnn.csv",epochCSV(current),"text/csv;charset=utf-8")}>Exportar métricas por época CSV</button></div>
      <label className="field"><span>Ejecución a inspeccionar</span><select aria-label="Ejecución a inspeccionar" value={current.id} onChange={event=>{setDetailId(event.target.value);setMetricPage(0);}}>
        {completed.map(job=><option value={job.id} key={job.id}>{job.id}</option>)}</select></label>
      <div className="evaluation-facts"><p><small>Menor pérdida de validación observada</small><strong>{detail.minimumValidationLoss.toFixed(4)} · época {detail.minimumValidationEpoch}</strong></p>
        <p><small>Diferencia de precisión entrenamiento − validación</small><strong>{(detail.accuracyGap*100).toFixed(1)} puntos porcentuales</strong></p></div>
      <p className="caption">El mínimo observado puede diferir de la época de referencia usada por la parada temprana. No se restauran pesos ni se diagnostica sobreajuste con estas curvas simuladas.</p>
      <button className="text-button" aria-expanded={showMetrics} onClick={()=>setShowMetrics(value=>!value)}>{showMetrics?"Ocultar métricas por época":"Ver métricas por época"}</button>
      {showMetrics&&<><div className="table-scroll"><table className="epoch-table"><thead><tr><th>Época</th><th>Precisión entrenamiento</th><th>Precisión validación</th><th>Pérdida entrenamiento</th><th>Pérdida validación</th></tr></thead>
        <tbody>{current.metrics.slice(page*10,page*10+10).map(point=><tr key={point.epoch}><td>{point.epoch}</td><td>{percent(point.accuracy)}</td><td>{percent(point.valAccuracy)}</td><td>{point.loss.toFixed(4)}</td><td>{point.valLoss.toFixed(4)}</td></tr>)}</tbody></table></div>
        <div className="actions"><button className="secondary" disabled={page===0} onClick={()=>setMetricPage(page-1)}>Épocas anteriores</button>
          <span className="caption" role="status">Página {page+1} de {Math.ceil(current.metrics.length/10)}</span>
          <button className="secondary" disabled={(page+1)*10>=current.metrics.length} onClick={()=>setMetricPage(page+1)}>Épocas siguientes</button></div></>}
    </section>}
  </div>;
}
