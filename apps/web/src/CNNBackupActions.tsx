import {useEffect,useState} from "react";
import PredictionPanel from "./PredictionPanel";
import type {ColabImported} from "./colabCNN";
import {defaultConfig} from "./cnn";
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
  const [colab,setColab]=useState<ColabImported|null>(null);
  useEffect(()=>{
    if(strictSelection)return;
    let active=true;
    void import("./colabCNN").then(async mod=>{
      const saved=mod.readImportedColab(projectId);
      if(!saved)return;
      const tf=await import("@tensorflow/tfjs");
      const models=await tf.io.listModels();
      if(active&&models[saved.modelRef])setColab(saved);
    }).catch(()=>undefined);
    return ()=>{active=false;};
  },[projectId,strictSelection]);

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
      const colabModule=await import("./colabCNN");
      if(await colabModule.isColabCNNFile(file)){
        if(strictSelection)throw new Error("Para importar la CNN de Colab, utiliza la sección Respaldo del modelo CNN en Entrenamientos.");
        const imported=await colabModule.importColabCNN(projectId,file);
        setColab(imported);
        setMessage("Modelo real de Colab importado correctamente. Sus pesos están en este navegador y ya puedes reconocer números sin entrenar otra vez.");
        return;
      }
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
      <span>{strictSelection?"Restaurar respaldo .ncnn":"Restaurar respaldo .ncnn o importar CNN de Colab"}</span>
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
    {colab&&!strictSelection&&<section className="cnn-backup-predictions" aria-label="Modelo original importado desde Colab">
      <h3>Modelo entrenado en Google Colab</h3>
      <p className="caption">Arquitectura original: 4 convoluciones (32, 32, 64 y 64 filtros), Dense de 128 unidades y salida de 10 dígitos. Se importaron 271 210 parámetros entrenados, sin volver a entrenar. Los pesos quedan guardados en este navegador y no modifican el modelo anterior.</p>
      <PredictionPanel key={colab.modelRef} inputLabel="Imagen PNG, JPG o WebP"
        inputAriaLabel="Imagen para reconocer usando los pesos importados de Colab"
        digitMode onPredict={async file=>{
          const {predictMultipleDigits}=await import("./multiDigitInference");
          return predictMultipleDigits(colab.modelRef,file,defaultConfig(),colab.classes);
        }}/>
    </section>}
  </div>;
}
