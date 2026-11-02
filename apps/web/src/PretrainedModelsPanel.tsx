import {useEffect,useState} from "react";
import CNNBackupActions from "./CNNBackupActions";
import PredictionPanel from "./PredictionPanel";
import {defaultConfig} from "./cnn";
import type {BrowserReport} from "./browserCNN";
import type {ColabImported} from "./colabCNN";
import {addImportedModel,deleteModelWeights,importedModels,renameImportedModel} from "./modelCatalog";
import type {ImportedModel} from "./modelCatalog";
import "./training-workspace.css";

export default function PretrainedModelsPanel({projectId}:{projectId:string}){
  const [models,setModels]=useState<ImportedModel[]>([]);
  const [selected,setSelected]=useState("");
  const [renaming,setRenaming]=useState("");
  const [draft,setDraft]=useState("");
  const [confirming,setConfirming]=useState("");
  const [busy,setBusy]=useState(false);
  const [warning,setWarning]=useState("");
  const [available,setAvailable]=useState<Set<string>>(new Set());
  useEffect(()=>{
    let mounted=true;
    setSelected("");setModels([]);setWarning("");setConfirming("");setAvailable(new Set());
    void (async()=>{
      const tf=await import("@tensorflow/tfjs");
      const known=await tf.io.listModels();
      const items=importedModels(projectId);
      if(!mounted)return;
      setAvailable(new Set(Object.keys(known)));
      setModels(items);
      setSelected(items.find(item=>known[item.ref])?.ref??"");
    })().catch(e=>{if(mounted)setWarning(e instanceof Error?e.message:"No se pudieron recuperar los modelos importados.");});
    return ()=>{mounted=false;};
  },[projectId]);
  function choose(ref:string){setSelected(ref);setRenaming("");setConfirming("");}
  function created(report:BrowserReport){
    try{
      const item:ImportedModel={ref:report.model_ref,origin:"ncnn",name:"CNN importada desde respaldo",
        createdAt:new Date().toISOString(),report};
      const next=addImportedModel(projectId,item);
      setModels(next);setSelected(item.ref);setAvailable(prev=>new Set([...prev,item.ref]));
      setWarning("");setConfirming("");
    }catch(e){setWarning(e instanceof Error?e.message:"No se pudo registrar la importación.");}
  }
  function createdColab(colab:ColabImported){
    try{
      const item:ImportedModel={ref:colab.modelRef,origin:"colab",name:"CNN original de Google Colab",
        createdAt:new Date().toISOString(),colab};
      const next=addImportedModel(projectId,item);
      setModels(next);setSelected(item.ref);setAvailable(prev=>new Set([...prev,item.ref]));
      setWarning("");setConfirming("");
    }catch(e){setWarning(e instanceof Error?e.message:"No se pudo registrar el modelo de Colab.");}
  }
  function rename(ref:string){
    try{
      setModels(renameImportedModel(projectId,ref,draft));
      setRenaming("");setWarning("");
    }catch(e){setWarning(e instanceof Error?e.message:"No se pudo cambiar el nombre.");}
  }
  async function remove(item:ImportedModel){
    setBusy(true);setWarning("");
    try{
      await deleteModelWeights(projectId,item.ref,item.origin);
      const next=importedModels(projectId);
      setModels(next);setAvailable(prev=>{const updated=new Set(prev);updated.delete(item.ref);return updated;});
      setSelected(current=>current===item.ref?(next.find(x=>available.has(x.ref)&&x.ref!==item.ref)?.ref??""):current);
      setConfirming("");setRenaming("");
    }catch(e){setWarning(e instanceof Error?e.message:"No se pudo eliminar este modelo.");}
    finally{setBusy(false);}
  }
  const active=models.find(item=>item.ref===selected&&available.has(item.ref));
  const valid=models.filter(item=>available.has(item.ref));
  const lost=models.filter(item=>!available.has(item.ref));
  return <div className="pretrained-workspace">
    <section className="panel pretrained-welcome">
      <div className="eyebrow">EXCLUSIVO PARA MODELOS CARGADOS DESDE ARCHIVO</div>
      <h2>Mis modelos preentrenados</h2>
      <p>Importa, consulta, cambia el nombre, selecciona o elimina modelos <strong>sin volver a entrenar</strong>. Tus CNN entrenadas en NeuroLab permanecen independientes.</p>
      <div className="pretrained-steps">
        <div><strong>01</strong><span>Importa un archivo .ncnn</span></div>
        <div><strong>02</strong><span>Selecciona el modelo</span></div>
        <div><strong>03</strong><span>Reconoce imágenes</span></div>
      </div>
      <p className="caption">Se admiten archivos .ncnn de NeuroLab y conversiones compatibles de Colab. Los archivos .keras originales necesitan conversión previa. Los pesos permanecen exclusivamente en este navegador.</p>
    </section>
    <CNNBackupActions mode="import" projectId={projectId} onRestored={created} onColabImported={createdColab}/>
    {warning&&<p className="error" role="alert">{warning}</p>}
    <section className="panel model-crud-list" aria-label="Administrar modelos preentrenados importados">
      <div className="model-crud-head"><div><div className="eyebrow">CATÁLOGO DE IMPORTACIONES</div>
        <h3>Modelos cargados</h3><p className="caption">{valid.length} disponibles · {lost.length} sin pesos en este navegador</p></div>
        <span className="model-crud-counter">{models.length} modelos</span>
      </div>
      {!models.length&&<p className="model-crud-empty">No tienes modelos importados. Selecciona un archivo .ncnn arriba para comenzar.</p>}
      <div className="model-crud-grid">
        {models.map(item=><article key={item.ref} className={"model-crud-card "+(selected===item.ref?"is-selected ":"")+(item.origin==="colab"?"is-colab":"is-backup")}>
          <div className="model-crud-card-top">
            <span className={"model-crud-type "+item.origin}>{item.origin==="colab"?"Colab · Keras":"Respaldo · NeuroLab"}</span>
            <span className={available.has(item.ref)?"model-crud-online":"model-crud-offline"}>{available.has(item.ref)?"Disponible":"Sin pesos"}</span>
          </div>
          {renaming===item.ref?<div className="model-crud-rename">
            <input aria-label={"Nuevo nombre de "+item.name} maxLength={80} autoFocus value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")rename(item.ref);if(e.key==="Escape")setRenaming("");}}/>
            <button type="button" disabled={busy} onClick={()=>rename(item.ref)}>Guardar nombre</button>
            <button type="button" className="secondary" onClick={()=>setRenaming("")}>Cancelar</button>
          </div>:<h4>{item.name}</h4>}
          <p className="caption">{item.origin==="colab"?"10 clases · 271 210 parámetros":(item.report?.classes.length??0)+" clases · "+(item.report?.parameters??0).toLocaleString("es-PE")+" parámetros"}</p>
          {confirming===item.ref?<div className="model-crud-confirm" role="group" aria-label={"Confirmar eliminación de "+item.name}>
            <strong>¿Eliminar «{item.name}»?</strong>
            <p>Se borrarán sus pesos de IndexedDB y esta ficha del navegador. No se borrarán otros modelos ni los archivos que hayas descargado.</p>
            <div className="model-crud-actions">
              <button type="button" className="model-crud-danger" disabled={busy} onClick={()=>void remove(item)}>{busy?"Eliminando…":"Sí, eliminar definitivamente"}</button>
              <button type="button" className="secondary" disabled={busy} onClick={()=>setConfirming("")}>Cancelar</button>
            </div>
          </div>:<div className="model-crud-actions">
            <button type="button" disabled={busy||!available.has(item.ref)} className={selected===item.ref?"model-crud-current":"secondary"} onClick={()=>choose(item.ref)}>{selected===item.ref?"Modelo seleccionado":"Usar modelo"}</button>
            <button type="button" className="secondary" disabled={busy} onClick={()=>{setRenaming(item.ref);setDraft(item.name);setConfirming("");}}>Renombrar</button>
            <button type="button" className="model-crud-delete" disabled={busy} onClick={()=>{setConfirming(item.ref);setRenaming("");}}>Eliminar</button>
          </div>}
        </article>)}
      </div>
    </section>
    {active&&<section className="panel pretrained-restored" aria-label="Predicción exclusiva con modelo importado">
      <div className="eyebrow">MODELO IMPORTADO ACTIVO · {active.origin==="colab"?"COLAB":"ARCHIVO .NCNN"}</div>
      <h2>{active.name}</h2>
      <p className="caption">{active.origin==="colab"?
        "4 capas convolucionales · 271 210 parámetros · 10 dígitos (0–9). Pesos originales importados sin reentrenar.":
        active.report?active.report.classes.length+" clases · "+active.report.parameters.toLocaleString("es-PE")+" parámetros · "+active.report.completed_epochs+" épocas originales.":""}
      </p>
      <PredictionPanel key={active.ref}
        digitMode={active.origin==="colab"||Boolean(active.report&&active.report.classes.length===10&&active.report.classes.every((name,i)=>name===String(i)))}
        inputLabel="Imagen para reconocer con el modelo importado" inputAriaLabel="Imagen para predecir solo con el modelo importado"
        onPredict={async file=>{
          const ordinary=active.report;
          const digits=active.origin==="colab"||Boolean(ordinary&&ordinary.classes.length===10&&ordinary.classes.every((name,i)=>name===String(i)));
          const config=active.origin==="colab"?defaultConfig():ordinary!.config;
          const classes=active.origin==="colab"?active.colab!.classes:ordinary!.classes;
          if(digits){
            const {predictMultipleDigits}=await import("./multiDigitInference");
            return predictMultipleDigits(active.ref,file,config,classes);
          }
          const {predictInBrowser}=await import("./browserCNN");
          return predictInBrowser(active.ref,file,config,classes,false);
        }}/>
    </section>}
  </div>;
}
