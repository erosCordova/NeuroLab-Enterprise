import {useEffect,useState} from "react";
import CNNBackupActions from "./CNNBackupActions";
import PredictionPanel from "./PredictionPanel";
import {defaultConfig} from "./cnn";
import type {BrowserReport} from "./browserCNN";
import {readImportedColab} from "./colabCNN";
import type {ColabImported} from "./colabCNN";
import "./training-workspace.css";

const storageKey=(projectId:string)=>"neurolab-imported-ordinary-v1:"+projectId;
type Origin="colab"|"ncnn";
const isImportRef=(projectId:string,ref:string)=>ref.startsWith("indexeddb://neurolab-cnn-"+projectId+"-imported-");

export default function PretrainedModelsPanel({projectId}:{projectId:string}){
  const [ordinary,setOrdinary]=useState<BrowserReport|null>(null);
  const [colab,setColab]=useState<ColabImported|null>(null);
  const [active,setActive]=useState<Origin|null>(null);
  const [warning,setWarning]=useState("");
  useEffect(()=>{
    let mounted=true;
    setOrdinary(null);setColab(null);setActive(null);setWarning("");
    void (async()=>{
      const tf=await import("@tensorflow/tfjs");
      const available=await tf.io.listModels();
      const previous=readImportedColab(projectId);
      if(previous&&available[previous.modelRef]&&mounted){
        setColab(previous);
        setActive(current=>current??"colab");
      }
      const json=localStorage.getItem(storageKey(projectId));
      if(!json)return;
      const {validatePortableIdentity}=await import("./modelBackup");
      try{
        const report=validatePortableIdentity(projectId,JSON.parse(json));
        if(!isImportRef(projectId,report.model_ref)){
          if(mounted)setWarning("Existe una importación de la versión anterior que compartía referencia con un entrenamiento. Vuelve a cargar su archivo .ncnn para utilizar una copia independiente.");
        }else if(available[report.model_ref]&&mounted){
          setOrdinary(report);
          setActive(current=>current??"ncnn");
        }
      }catch{/* Nunca dar por válido un registro alterado o incompleto. */}
    })().catch(()=>{if(mounted)setWarning("No se pudieron consultar los modelos importados en este navegador.");});
    return ()=>{mounted=false;};
  },[projectId]);

  function handleRestored(value:BrowserReport){
    if(!isImportRef(projectId,value.model_ref)){
      setWarning("No se pudo separar el modelo importado del entrenamiento local.");
      return;
    }
    setOrdinary(value);setActive("ncnn");setWarning("");
    try{localStorage.setItem(storageKey(projectId),JSON.stringify(value));}
    catch{setWarning("Los pesos se importaron, pero el navegador no pudo recordar la ficha después de recargar.");}
  }
  function handleColab(value:ColabImported){
    setColab(value);setActive("colab");setWarning("");
  }
  const chosen=active==="colab"&&colab?"colab":
    active==="ncnn"&&ordinary?"ncnn":colab?"colab":ordinary?"ncnn":null;
  const count=Number(Boolean(colab))+Number(Boolean(ordinary));
  const source=chosen==="colab"?colab:ordinary;
  return <div className="pretrained-workspace">
    <section className="panel pretrained-welcome">
      <div className="eyebrow">SOLO MODELOS CARGADOS DESDE ARCHIVO</div>
      <h2>Modelo preentrenado importado</h2>
      <p>En esta opción <strong>no se entrena ninguna CNN</strong>. Carga y utiliza únicamente los pesos del archivo seleccionado, separados de los modelos entrenados en NeuroLab.</p>
      <div className="pretrained-steps" aria-label="Pasos para importar un modelo">
        <div><strong>01</strong><span>Importa los pesos desde .ncnn</span></div>
        <div><strong>02</strong><span>Selecciona el modelo cargado</span></div>
        <div><strong>03</strong><span>Reconoce imágenes sin entrenar</span></div>
      </div>
      <p className="caption">Admite respaldos de NeuroLab y archivos de Colab previamente convertidos al formato .ncnn. Los archivos .keras originales requieren conversión previa. Tus modelos entrenados aquí permanecen intactos.</p>
    </section>
    <CNNBackupActions mode="import" projectId={projectId} onRestored={handleRestored} onColabImported={handleColab}/>
    {warning&&<p className="error" role="alert">{warning}</p>}
    {count===0&&<section className="panel pretrained-restored" aria-label="Esperando modelo importado">
      <h3>Sin modelo importado activo</h3>
      <p className="caption">Selecciona tu archivo .ncnn arriba. Los modelos entrenados en esta página se encuentran exclusivamente en la opción «Modelo entrenado en NeuroLab».</p>
    </section>}
    {count>1&&<section className="panel pretrained-chooser" aria-label="Seleccionar modelo importado">
      <h3>¿Qué modelo cargado quieres utilizar?</h3>
      <div className="pretrained-choices">
        {colab&&<button type="button" aria-pressed={chosen==="colab"} onClick={()=>setActive("colab")}>CNN original de Colab</button>}
        {ordinary&&<button type="button" aria-pressed={chosen==="ncnn"} onClick={()=>setActive("ncnn")}>CNN importada desde respaldo NeuroLab</button>}
      </div>
    </section>}
    {chosen&&source&&<section className="panel pretrained-restored" aria-label="Predicción exclusiva con modelo importado">
      <div className="eyebrow">MODELO IMPORTADO ACTIVO · {chosen==="colab"?"COLAB":"ARCHIVO .NCNN"}</div>
      <h2>{chosen==="colab"?"CNN original de Google Colab":"CNN importada desde respaldo"}</h2>
      <p className="caption">{chosen==="colab"?
        "4 capas convolucionales · 271 210 parámetros · 10 dígitos (0–9). Pesos originales importados sin reentrenar.":
        ordinary?ordinary.classes.length+" clases · "+ordinary.parameters.toLocaleString("es-PE")+" parámetros · "+ordinary.completed_epochs+" épocas completadas antes de importarlo.":""}
      </p>
      <p className="caption">Esta predicción usa exclusivamente la referencia de pesos importados. Nunca utiliza el último modelo entrenado dentro de NeuroLab.</p>
      <PredictionPanel key={chosen==="colab"?colab!.modelRef:ordinary!.model_ref}
        digitMode={chosen==="colab"||Boolean(ordinary&&ordinary.classes.length===10&&ordinary.classes.every((name,i)=>name===String(i)))}
        inputLabel="Imagen para reconocer con este modelo importado"
        inputAriaLabel="Imagen para predecir solo con el modelo importado"
        onPredict={async file=>{
          const digits=chosen==="colab"||Boolean(ordinary&&ordinary.classes.length===10&&ordinary.classes.every((name,i)=>name===String(i)));
          const modelRef=chosen==="colab"?colab!.modelRef:ordinary!.model_ref;
          const config=chosen==="colab"?defaultConfig():ordinary!.config;
          const classes=chosen==="colab"?colab!.classes:ordinary!.classes;
          if(digits){
            const {predictMultipleDigits}=await import("./multiDigitInference");
            return predictMultipleDigits(modelRef,file,config,classes);
          }
          const {predictInBrowser}=await import("./browserCNN");
          return predictInBrowser(modelRef,file,config,classes,false);
        }}/>
    </section>}
  </div>;
}
