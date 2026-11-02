import {useEffect,useState} from "react";
import CNNBackupActions from "./CNNBackupActions";
import PredictionPanel from "./PredictionPanel";
import type {BrowserReport} from "./browserCNN";
import "./training-workspace.css";

const storageKey=(projectId:string)=>"neurolab-imported-ordinary-v1:"+projectId;

export default function PretrainedModelsPanel({projectId}:{projectId:string}){
  const [restored,setRestored]=useState<BrowserReport|null>(null);
  const [warning,setWarning]=useState("");
  useEffect(()=>{
    let mounted=true;
    setRestored(null);setWarning("");
    void (async()=>{
      const json=localStorage.getItem(storageKey(projectId));
      if(!json)return;
      const {validatePortableIdentity}=await import("./modelBackup");
      let report:BrowserReport;
      try{report=validatePortableIdentity(projectId,JSON.parse(json));}
      catch{return;}
      const tf=await import("@tensorflow/tfjs");
      const available=await tf.io.listModels();
      if(mounted&&available[report.model_ref])setRestored(report);
    })().catch(()=>undefined);
    return ()=>{mounted=false;};
  },[projectId]);
  function handleRestored(value:BrowserReport){
    setRestored(value);setWarning("");
    try{localStorage.setItem(storageKey(projectId),JSON.stringify(value));}
    catch{setWarning("Los pesos se importaron, pero este navegador no pudo conservar la ficha para recuperarla al recargar.");}
  }
  return <div className="pretrained-workspace">
    <section className="panel pretrained-welcome">
      <div className="eyebrow">MODELOS CON PESOS YA ENTRENADOS</div>
      <h2>Cargar modelo preentrenado</h2>
      <p>Usa un modelo previamente entrenado para reconocer imágenes <strong>sin volver a ejecutar épocas</strong>.</p>
      <div className="pretrained-steps" aria-label="Pasos para importar un modelo">
        <div><strong>01</strong><span>Selecciona tu archivo .ncnn</span></div>
        <div><strong>02</strong><span>NeuroLab verifica arquitectura y pesos</span></div>
        <div><strong>03</strong><span>Carga imágenes para predecir</span></div>
      </div>
      <p className="caption">Admite respaldos .ncnn creados en NeuroLab y el modelo de Colab convertido al formato compatible. No admite archivos .keras sin convertir. El modelo queda en este navegador; no reemplaza otros entrenamientos.</p>
    </section>
    <CNNBackupActions mode="import" projectId={projectId} onRestored={handleRestored}/>
    {warning&&<p className="error" role="alert">{warning}</p>}
    {restored&&<section className="panel pretrained-restored">
      <div className="eyebrow">MODELO NEUROLAB RECUPERADO</div>
      <h2>Modelo listo para reconocer imágenes</h2>
      <p className="caption">{restored.classes.length} clases · {restored.parameters.toLocaleString("es-PE")} parámetros · {restored.completed_epochs} épocas originales. No se entrenó nuevamente.</p>
      <PredictionPanel key={restored.model_ref} digitMode={restored.classes.length===10&&restored.classes.every((name,i)=>name===String(i))}
        inputLabel="Imagen para clasificar" inputAriaLabel="Imagen para predecir con modelo preentrenado"
        onPredict={async file=>{
          const digits=restored.classes.length===10&&restored.classes.every((name,i)=>name===String(i));
          if(digits){const {predictMultipleDigits}=await import("./multiDigitInference");return predictMultipleDigits(restored.model_ref,file,restored.config,restored.classes);}
          const {predictInBrowser}=await import("./browserCNN");
          return predictInBrowser(restored.model_ref,file,restored.config,restored.classes,false);
        }}/>
    </section>}
  </div>;
}
