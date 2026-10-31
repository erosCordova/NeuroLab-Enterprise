import {useEffect,useState} from "react";
import {api} from "./api";
import type {RealRun} from "./realRuns";
import {
  compareRealRuns,comparisonRealCSV,epochsRealCSV,REAL_REPORT_WARNING,
} from "./realComparison";
import "./real-comparison.css";

const percentage=(number:number)=>(number*100).toFixed(1)+"%";
function download(name:string,value:string,mime:string) {
  const blob=new Blob([value],{type:mime});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;link.download=name;
  document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function RealEvaluationPanel({projectId}:{projectId:string}){
  const [runs,setRuns]=useState<RealRun[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [selected,setSelected]=useState<string[]>([]);
  const [inspected,setInspected]=useState("");
  const [page,setPage]=useState(0);
  const [engine,setEngine]=useState("Todos");
  const [datasetFilter,setDatasetFilter]=useState("Todos");

  useEffect(()=>{
    let live=true;
    setLoading(true);setError("");setRuns([]);setSelected([]);setInspected("");setPage(0);
    void api<RealRun[]>("/projects/"+projectId+"/real-runs")
      .then(rows=>{if(live){setRuns(rows);setInspected(rows[0]?.id??"");}})
      .catch(cause=>{if(live)setError(cause instanceof Error?cause.message:"No se pudieron cargar los experimentos reales.");})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[projectId]);

  const datasets=[...new Set(runs.map(run=>run.dataset_fingerprint))];
  const visible=runs.filter(run=>
    (engine==="Todos"||run.engine===engine)&&
    (datasetFilter==="Todos"||run.dataset_fingerprint===datasetFilter));
  const chosen=selected.map(id=>runs.find(run=>run.id===id)).filter((r):r is RealRun=>Boolean(r));
  const comparison=chosen.length>=2?compareRealRuns(chosen):null;
  const current=runs.find(run=>run.id===inspected);
  const totalPages=current?Math.max(1,Math.ceil(current.metrics.length/10)):1;
  const currentPage=Math.min(page,totalPages-1);

  function toggle(id:string,checked:boolean) {
    setSelected(old=>checked?old.length<3?[...old,id]:old:old.filter(item=>item!==id));
  }
  function exportComparison(type:"csv"|"json"){
    if(!comparison)return;
    const name="neurolab-comparacion-cnn-real";
    if(type==="csv")download(name+".csv",comparisonRealCSV(comparison),"text/csv;charset=utf-8");
    else download(name+".json",JSON.stringify(comparison,null,2),"application/json");
  }
  return <section className="panel real-eval" aria-label="Evaluación de CNN reales">
    <div className="panel-head">
      <div><div className="eyebrow">EXPERIMENTOS CON RESULTADOS OBSERVADOS</div>
        <h2>Comparar entrenamientos CNN reales</h2>
        <p className="muted">Hasta tres informes registrados en PostgreSQL. Comparación descriptiva, no simulada.</p></div>
      <span className="badge">RESULTADOS DECLARADOS</span>
    </div>
    <p className="soft">{REAL_REPORT_WARNING} El conjunto de prueba debe ser independiente del ajuste. No se otorga aprobación de modelo ni significación estadística.</p>
    {loading&&<p role="status">Recuperando experimentos reales…</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {!loading&&!runs.length&&!error&&<p className="caption">Aún no hay resultados reales guardados. Entrena una CNN en Entrenamientos o importa un informe JSON.</p>}
    {runs.length>0&&<>
      <div className="real-eval-filters">
        <label className="field"><span>Motor</span><select aria-label="Filtrar motor CNN real" value={engine} onChange={event=>setEngine(event.target.value)}>
          <option>Todos</option><option>TensorFlow.js</option><option>TensorFlow/Keras</option>
        </select></label>
        <label className="field"><span>Dataset (SHA-256)</span><select aria-label="Filtrar dataset CNN real" value={datasetFilter} onChange={event=>setDatasetFilter(event.target.value)}>
          <option>Todos</option>{datasets.map(fingerprint=><option value={fingerprint} key={fingerprint}>{fingerprint.slice(0,12)}…</option>)}
        </select></label>
      </div>
      <div className="table-scroll"><table>
        <thead><tr><th>Comparar</th><th>Experimento</th><th>Motor</th><th>Dataset</th><th>Épocas</th><th>Precisión test</th><th>Pérdida test</th><th>Inspección</th></tr></thead>
        <tbody>{visible.map(run=><tr key={run.id}>
          <td><input type="checkbox" aria-label={"Comparar entrenamiento real "+run.id} checked={selected.includes(run.id)} disabled={selected.length>=3&&!selected.includes(run.id)} onChange={event=>toggle(run.id,event.target.checked)}/></td>
          <td>{run.id.slice(0,8)}</td><td>{run.engine}</td><td>{run.dataset_fingerprint.slice(0,12)}…</td>
          <td>{run.completed_epochs}/{run.requested_epochs}</td>
          <td>{percentage(run.test.accuracy)}</td><td>{run.test.loss.toFixed(4)}</td>
          <td><button className="text-button" onClick={()=>{setInspected(run.id);setPage(0);}}>Ver épocas</button></td>
        </tr>)}</tbody>
      </table></div>
      {!visible.length&&<p className="caption">No hay experimentos que coincidan con esos filtros.</p>}
      <div className="real-eval-comparison" aria-label="Comparación real de experimentos">
        <div className="panel-head"><div><h3>Comparación de resultados de test</h3>
          <p className="caption">{selected.length} de 3 seleccionados. Elige al menos dos.</p></div>
          <div className="actions">
            <button className="secondary" disabled={!comparison} onClick={()=>exportComparison("csv")}>Exportar comparación real CSV</button>
            <button className="secondary" disabled={!comparison} onClick={()=>exportComparison("json")}>Exportar comparación real JSON</button>
            <button className="text-button" disabled={!selected.length} onClick={()=>setSelected([])}>Limpiar selección real</button>
          </div>
        </div>
        {comparison&&<>
          <p role="status" className={comparison.comparable_conditions?"feedback":"soft"}>
            {comparison.comparable_conditions?
              "Condiciones declaradas compatibles (dataset, clases, semilla, cantidades, motor y entrada); la igualdad exacta de particiones no está verificada.":
              "Comparabilidad limitada: "+comparison.differences.join("; ")+". No se establece un modelo de referencia."}
          </p>
          {comparison.highest_reported_test_accuracy_id&&<p className="real-eval-highlight">
            Mayor precisión de prueba declarada en esta selección: <strong>{comparison.highest_reported_test_accuracy_id.slice(0,8)}</strong>.
            No demuestra superioridad estadística.
          </p>}
          <div className="real-eval-cards">
            {comparison.rows.map(row=><article key={row.id} className="real-eval-card" aria-label={"Resultado CNN real "+row.id}>
              <h4>{row.id.slice(0,8)} · {row.engine}</h4>
              <dl>
                <dt>Precisión en test</dt><dd>{percentage(row.test_accuracy)}</dd>
                <dt>Pérdida en test</dt><dd>{row.test_loss.toFixed(4)}</dd>
                <dt>Precisión en validación (última época)</dt><dd>{percentage(row.validation_accuracy)}</dd>
                <dt>Pérdida en validación (última época)</dt><dd>{row.validation_loss.toFixed(4)}</dd>
                <dt>Épocas</dt><dd>{row.epochs}</dd>
                <dt>Parámetros</dt><dd>{row.parameters.toLocaleString("es-PE")}</dd>
                <dt>Entrenamiento / validación / prueba</dt><dd>{row.samples.train} / {row.samples.validation} / {row.samples.test}</dd>
              </dl>
            </article>)}
          </div>
        </>}
      </div>
      {current&&<div className="real-eval-epochs" aria-label="Métricas reales por época">
        <div className="panel-head">
          <div><h3>Métricas por época</h3><p className="caption">{current.id.slice(0,8)} · {current.engine}</p></div>
          <button className="secondary" onClick={()=>download("neurolab-metricas-cnn-real.csv",epochsRealCSV(current),"text/csv;charset=utf-8")}>Exportar épocas reales CSV</button>
        </div>
        <label className="field"><span>Experimento a inspeccionar</span>
          <select aria-label="Seleccionar entrenamiento real para épocas" value={current.id} onChange={event=>{setInspected(event.target.value);setPage(0);}}>
            {runs.map(run=><option value={run.id} key={run.id}>{run.id.slice(0,8)} · {run.engine}</option>)}
          </select>
        </label>
        <div className="table-scroll"><table>
          <thead><tr><th>Época</th><th>Precisión entrenamiento</th><th>Precisión validación</th><th>Pérdida entrenamiento</th><th>Pérdida validación</th></tr></thead>
          <tbody>{current.metrics.slice(currentPage*10,currentPage*10+10).map(point=><tr key={point.epoch}>
            <td>{point.epoch}</td><td>{percentage(point.accuracy)}</td><td>{percentage(point.valAccuracy)}</td><td>{point.loss.toFixed(4)}</td><td>{point.valLoss.toFixed(4)}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="actions">
          <button className="secondary" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Épocas anteriores reales</button>
          <span className="caption" role="status">Página {currentPage+1} de {totalPages}</span>
          <button className="secondary" disabled={currentPage+1>=totalPages} onClick={()=>setPage(currentPage+1)}>Épocas siguientes reales</button>
        </div>
      </div>}
    </>}
  </section>;
}
