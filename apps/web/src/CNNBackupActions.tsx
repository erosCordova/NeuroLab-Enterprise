import {useState} from "react";
import type {ColabImported} from "./colabCNN";
import type {BrowserReport} from "./browserCNN";
import "./model-backup.css";

type Props={
  projectId:string;
  report?:BrowserReport|null;
  onRestored?:(report:BrowserReport)=>void;
  onColabImported?:(model:ColabImported)=>void;
  mode:"import"|"export";
};
export default function CNNBackupActions({projectId,report,onRestored,onColabImported,mode}:Props){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  async function save(){
    if(!report||mode!=="export")return;
    setBusy(true);setError("");setMessage("");
    try{
      const {createCNNBackup}=await import("./modelBackup");
      const blob=await createCNNBackup(projectId,report);
      const url=URL.createObjectURL(blob);
      try{
        const link=document.createElement("a");
        link.href=url;
        link.download="neurolab-cnn-"+report.dataset_fingerprint.slice(0,8)+"-"+report.model_ref.slice(-8)+".ncnn";
        document.body.appendChild(link);link.click();link.remove();
      }finally{window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
      setMessage("Copia de tu modelo entrenado descargada. No se alteraron sus pesos.");
    }catch(cause){
      setError(cause instanceof Error?cause.message:"No se pudo descargar el modelo.");
    }finally{setBusy(false);}
  }
  async function restore(file:File){
    if(mode!=="import")return;
    setBusy(true);setError("");setMessage("");
    try{
      const colabModule=await import("./colabCNN");
      if(await colabModule.isColabCNNFile(file)){
        const imported=await colabModule.importColabCNN(projectId,file);
        onColabImported?.(imported);
        setMessage("Modelo de Colab cargado. Puedes seleccionarlo abajo y predecir sin entrenar.");
      }else{
        const {importCNNBackupIsolated}=await import("./modelBackup");
        const imported=await importCNNBackupIsolated(projectId,file);
        onRestored?.(imported);
        setMessage("Respaldo cargado como modelo independiente. El modelo entrenado en NeuroLab no fue reemplazado.");
      }
    }catch(cause){
      setError(cause instanceof Error?cause.message:"No se pudo cargar el modelo preentrenado.");
    }finally{setBusy(false);}
  }
  return <div className={"cnn-backup-panel "+(mode==="import"?"cnn-backup-import":"cnn-backup-export")}
    aria-label={mode==="import"?"Importar modelo preentrenado independiente":"Exportar modelo entrenado en NeuroLab"}>
    <div className="panel-head">
      <div>
        <h3>{mode==="import"?"Importar un modelo distinto":"Guardar respaldo del modelo entrenado aquí"}</h3>
        <p className="caption">{mode==="import"?
          "Solo modelos externos o respaldos cargados: no se utiliza la CNN entrenada dentro de NeuroLab.":
          "Exporta los pesos de esta ejecución local. La importación se realiza únicamente en Cargar modelo preentrenado."}</p>
      </div>
      {mode==="export"&&report&&<button type="button" className="secondary" disabled={busy} onClick={()=>void save()}>
        {busy?"Procesando…":"Descargar modelo local .ncnn"}
      </button>}
    </div>
    {mode==="import"&&<label className="field">
      <span>Selecciona un archivo .ncnn preentrenado</span>
      <input type="file" aria-label="Restaurar modelo CNN desde respaldo" accept=".ncnn,application/octet-stream" disabled={busy}
        onChange={event=>{
          const file=event.target.files?.[0];event.target.value="";
          if(file)void restore(file);
        }}/>
    </label>}
    {mode==="import"&&<p className="caption">Puedes usar respaldos NeuroLab o la CNN de Colab previamente convertida. Los .keras necesitan conversión previa. Cada importación se guarda por separado en este navegador.</p>}
    {busy&&<p role="status">Verificando arquitectura y pesos del archivo…</p>}
    {message&&<p className="feedback" role="status">{message}</p>}
    {error&&<p className="error" role="alert">{error}</p>}
  </div>;
}
