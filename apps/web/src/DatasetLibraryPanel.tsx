import {useState} from "react";
import type {LibraryEntry} from "./datasetLibrary";
import "./dataset-library.css";

const names={tabular:"Tabla",images:"Imágenes",mnist:"MNIST"} as const;
type Props={items:LibraryEntry[];activeId:string|null;loading:boolean;
  onSelect:(id:string)=>Promise<void>;onRename:(id:string,name:string)=>Promise<void>;
  onDelete:(id:string)=>Promise<void>};
export default function DatasetLibraryPanel({items,activeId,loading,onSelect,onRename,onDelete}:Props){
  const [editing,setEditing]=useState<string|null>(null);
  const [name,setName]=useState("");
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState("");
  async function act(id:string,action:()=>Promise<void>){
    setBusy(id);setError("");
    try{await action();}catch(cause){setError(cause instanceof Error?cause.message:"No se pudo guardar el cambio.");}
    finally{setBusy(null);}
  }
  return <section className="panel nl-library" aria-label="Biblioteca de datasets">
    <div className="panel-head"><h2>Mis datasets</h2>
      <span className="badge">{items.length} guardado{items.length===1?"":"s"}</span></div>
    {loading?<p role="status">Cargando datasets…</p>:
      items.length===0?<div className="nl-library-empty">
        <span aria-hidden="true">▤</span><p>Aún no tienes datasets guardados en este proyecto.</p>
      </div>:<div className="nl-library-grid">
      {items.map(item=><article className={"nl-library-card "+(activeId===item.id?"chosen":"")}
        key={item.id} aria-label={"Dataset "+item.name}>
        <div className="nl-library-summary">
          <span className={"nl-library-kind kind-"+item.kind}>{names[item.kind]}</span>
          {activeId===item.id&&<span className="nl-library-active">Activo</span>}
        </div>
        {editing===item.id?<form className="nl-library-edit" onSubmit={event=>{event.preventDefault();
          void act(item.id,async()=>{await onRename(item.id,name);setEditing(null);});}}>
          <input aria-label={"Nuevo nombre de "+item.name} value={name} maxLength={100} minLength={2} required
            onChange={event=>setName(event.target.value)}/>
          <div className="nl-library-actions">
            <button type="submit" disabled={busy!==null}>Guardar</button>
            <button type="button" onClick={()=>setEditing(null)}>Cancelar</button>
          </div>
        </form>:<h3 title={item.name}>{item.name}</h3>}
        <p>{item.summary}</p>
        <div className="nl-library-actions">
          <button type="button" className="nl-library-open" disabled={busy!==null||item.id===activeId}
            onClick={()=>void act(item.id,()=>onSelect(item.id))}>
            {item.id===activeId?"Seleccionado":"Usar dataset"}
          </button>
          <button type="button" disabled={busy!==null} aria-label={"Renombrar dataset "+item.name}
            onClick={()=>{setEditing(item.id);setName(item.name);setError("");}}>Renombrar</button>
          <button type="button" className="nl-library-remove" disabled={busy!==null}
            aria-label={"Eliminar dataset "+item.name}
            onClick={()=>{if(window.confirm('¿Eliminar definitivamente el dataset «'+item.name+'» de este navegador? Los modelos entrenados no se borrarán.'))
              void act(item.id,()=>onDelete(item.id));}}>Eliminar</button>
        </div>
      </article>)}
      </div>}
    <p className="nl-library-caption">Tus datasets se conservan en este navegador y no se suben al servidor. El almacenamiento depende del espacio disponible.</p>
    {error&&<p className="error" role="alert">{error}</p>}
  </section>;
}