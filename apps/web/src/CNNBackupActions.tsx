import {useState} from "react";
import type {BrowserReport} from "./browserCNN";
import "./model-backup.css";

type Props={
  projectId:string;
  report?:BrowserReport|null;
  onRestored?:(report:BrowserReport)=>void;
  strictSelection?:boolean;
};

export default function CNNBackupActions({projectId,report,onRestored,strictSelection=false}:Props) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  async function save(){
    if(!report)return;
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
      setMessage("Respaldo CNN generado en un solo archivo .ncnn. Consérvalo en un lugar seguro.");
    }catch(cause){
      setError(cause instanceof Error?cause.message:"No se pudo descargar el respaldo CNN.");
    }finally{setBusy(false);}
  }

  async function restore(file:File){
    setBusy(true);setError("");setMessage("");
    try{
      const {restoreCNNBackup}=await import("./modelBackup");
      const restored=await restoreCNNBackup(projectId,file,strictSelection?report?.model_ref:undefined);
      setMessage("Modelo CNN restaurado con integridad verificada. Puedes clasificar imágenes sin volver a entrenar.");
      onRestored?.(restored);
    }catch(cause){
      setError(cause instanceof Error?cause.message:"No se pudo recuperar el modelo CNN.");
    }finally{setBusy(false);}
  }

  return <div className="cnn-backup-panel" aria-label="Respaldo y recuperación del modelo CNN">
    <div className="panel-head">
      <div><h3>Respaldo del modelo CNN</h3><p className="caption">Copia portátil de arquitectura, pesos y métricas. Sin ZIP, sin subir tus imágenes.</p></div>
      {report&&<button type="button" className="secondary" disabled={busy} onClick={()=>void save()}>
        {busy?"Procesando…":"Descargar respaldo CNN"}
      </button>}
    </div>
    <label className="field">
      <span>Restaurar respaldo .ncnn</span>
      <input type="file" aria-label="Restaurar modelo CNN desde respaldo" accept=".ncnn,application/octet-stream" disabled={busy}
        onChange={event=>{
          const file=event.target.files?.[0];
          event.target.value="";
          if(file)void restore(file);
        }}/>
    </label>
    <p className="caption">El respaldo debe corresponder a este proyecto{strictSelection?" y al entrenamiento seleccionado":""}. Si el modelo ya existe aquí, no será sobrescrito. Los pesos se conservan solo en el navegador.</p>
    {busy&&<p role="status">Verificando el modelo y sus pesos…</p>}
    {message&&<p className="feedback" role="status">{message}</p>}
    {error&&<p className="error" role="alert">{error}</p>}
  </div>;
}
