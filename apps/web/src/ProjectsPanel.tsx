import { useState } from "react";
import { filterProjects, projectStatuses } from "./projects";
import type { Project, ProjectDraft } from "./projects";
import "./projects.css";

type Props = {
  projects: Project[];
  activeId: string;
  onSave: (draft:ProjectDraft,id:string)=>void|Promise<unknown>;
  persistent?:boolean;
  onOpen: (id:string)=>void;
  onDelete?: (id:string)=>Promise<void>;
};
const emptyDraft = ():ProjectDraft => ({name:"",description:"",status:"Activo",tags:""});

export default function ProjectsPanel({projects,activeId,onSave,onOpen,onDelete,persistent=false}:Props) {
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("Todos");
  const [editing,setEditing]=useState<string|null>(null);
  const [draft,setDraft]=useState<ProjectDraft>(emptyDraft);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [saving,setSaving]=useState(false);
  const [target,setTarget]=useState<Project|null>(null);
  const [confirmation,setConfirmation]=useState("");
  const [deleting,setDeleting]=useState(false);
  const [deleteError,setDeleteError]=useState("");
  const visible=filterProjects(projects,search,status);

  async function confirmDeletion(){
    if(!target||!onDelete||confirmation.trim()!==target.name)return;
    setDeleting(true);setDeleteError("");
    try {
      await onDelete(target.id);
      setNotice("Proyecto eliminado. El listado está actualizado.");
      if(editing===target.id)reset();
      setTarget(null);setConfirmation("");
    }catch(cause){setDeleteError(cause instanceof Error?cause.message:"No se pudo eliminar el proyecto.");}
    finally{setDeleting(false);}
  }
  function reset() {setEditing(null);setDraft(emptyDraft());setError("");}
  function edit(project:Project) {
    setEditing(project.id);
    setDraft({name:project.name,description:project.description,status:project.status,tags:project.tags.join(", ")});
    setError("");setNotice("");
    document.getElementById("project-editor")?.scrollIntoView({behavior:"smooth",block:"start"});
    document.getElementById("project-name")?.focus({preventScroll:true});
  }
  return <div className="project-workspace">
    <div className="project-overview">
      <div><strong>Mis proyectos CNN</strong><p>Abre, edita o elimina cada proyecto desde su tarjeta. Las acciones de eliminación siempre requieren confirmación.</p></div>
      <button type="button" className="primary" onClick={()=>{reset();document.getElementById("project-editor")?.scrollIntoView({behavior:"smooth",block:"start"});document.getElementById("project-name")?.focus({preventScroll:true});}}>+ Nuevo proyecto</button>
    </div>
    <section className="panel project-editor" id="project-editor" aria-label="Editor del proyecto">
      <div className="panel-head"><div><div className="eyebrow">CONTEXTO DEL EXPERIMENTO</div>
        <h2>{editing?"Editar proyecto":"Crear proyecto CNN"}</h2>
        <p className="muted">Define el problema y organiza tus experimentos de imágenes.</p></div>
        <span className="badge">{persistent?"Proyectos en PostgreSQL":"Sesión en memoria"}</span></div>
      <form onSubmit={async event=>{
        event.preventDefault();setError("");setNotice("");setSaving(true);
        try {
          await onSave(draft,editing??crypto.randomUUID());
          setNotice(editing?"Proyecto actualizado. Sus datasets y ejecuciones se conservan.":"Proyecto creado.");
          reset();
        } catch(cause) {setError(cause instanceof Error?cause.message:"No se pudo guardar el proyecto.");}
        finally {setSaving(false);}
      }}>
        <fieldset disabled={saving} className="cnn-mode-fields"><div className="two-fields">
          <label className="field" htmlFor="project-name"><span>{editing?"Nombre del proyecto":"Nuevo proyecto CNN"}</span>
            <input id="project-name" value={draft.name} maxLength={80} required onChange={event=>setDraft({...draft,name:event.target.value})}/></label>
          <label className="field"><span>Estado del proyecto</span><select aria-label="Estado del proyecto" value={draft.status} onChange={event=>setDraft({...draft,status:event.target.value})}>
            {projectStatuses.map(value=><option key={value}>{value}</option>)}
          </select></label>
        </div>
        <label className="field"><span>Descripción del problema</span><textarea aria-label="Descripción del problema" rows={3} maxLength={1000} value={draft.description}
          placeholder="Ejemplo: clasificar imágenes de dígitos manuscritos del 0 al 9."
          onChange={event=>setDraft({...draft,description:event.target.value})}/></label>
        <label className="field"><span>Etiquetas del proyecto</span><input aria-label="Etiquetas del proyecto" value={draft.tags} maxLength={160}
          placeholder="MNIST, dígitos, clasificación" aria-describedby="project-tags-help"
          onChange={event=>setDraft({...draft,tags:event.target.value})}/></label>
        <p className="caption" id="project-tags-help">Hasta seis etiquetas separadas por comas. Archivar mantiene la información del proyecto. Reactívalo antes de iniciar nuevos entrenamientos.</p>
        {error&&<p className="error" role="alert">{error}</p>}
        <div className="actions"><button className="primary">{editing?"Guardar cambios":"Crear proyecto"}</button>
          {editing&&<button type="button" className="secondary" onClick={reset}>Cancelar edición</button>}</div>
        </fieldset><p role="status" className="feedback">{saving?"Guardando proyecto…":notice}</p>
      </form>
    </section>
    <section className="project-library" aria-label="Listado de proyectos">
      <div className="project-filters">
        <label className="field"><span>Buscar proyectos</span><input aria-label="Buscar proyectos" value={search} placeholder="Nombre, descripción o etiqueta" onChange={event=>setSearch(event.target.value)}/></label>
        <label className="field"><span>Filtrar proyectos por estado</span><select aria-label="Filtrar proyectos por estado" value={status} onChange={event=>setStatus(event.target.value)}>
          {["Todos",...projectStatuses].map(value=><option key={value}>{value}</option>)}</select></label>
      </div>
      <p className="caption" role="status">{visible.length} de {projects.length} proyectos</p>
      <div className="projects-grid">{visible.map(project=><article className="card project-card" key={project.id} aria-label={`Proyecto ${project.name}`}>
        <div className="panel-head"><span className="badge">CNN · {project.status}</span>{project.id===activeId&&<span className="caption">Proyecto activo</span>}</div>
        <h2>{project.name}</h2><p className="muted project-description">{project.description||"Añade una descripción del problema que deseas resolver."}</p>
        <div className="project-tags">{project.tags.map(tag=><span key={tag}>{tag}</span>)}</div>
        <div className="actions project-card-actions">
          <button className="primary" onClick={()=>onOpen(project.id)}>Abrir proyecto →</button>
          <button className="secondary" aria-label={`Editar proyecto ${project.name}`} onClick={()=>edit(project)}>Editar</button>
          {onDelete&&<button type="button" className="project-delete-trigger" aria-label={`Eliminar proyecto ${project.name}`}
            onClick={()=>{setTarget(project);setConfirmation("");setDeleteError("");}}>Eliminar</button>}
        </div>
      </article>)}</div>
      {!visible.length&&<div className="panel cnn-empty"><h2>No hay proyectos que coincidan</h2><p className="muted">Prueba otro nombre, etiqueta o estado.</p>
        <button className="secondary" onClick={()=>{setSearch("");setStatus("Todos");}}>Limpiar filtros de proyectos</button></div>}
    </section>
    {target&&<div className="project-dialog-backdrop">
      <section className="project-dialog" role="alertdialog" aria-modal="true" aria-label={"Confirmar eliminación de "+target.name} aria-describedby="project-delete-warning">
        <div className="project-danger-icon" aria-hidden="true">!</div>
        <h2>Eliminar proyecto</h2>
        <p id="project-delete-warning">Eliminarás <strong>{target.name}</strong> de manera irreversible, junto con sus resultados de entrenamiento y las fichas guardadas en PostgreSQL. Los pesos almacenados en otros navegadores no pueden eliminarse desde esta página.</p>
        <p>Si deseas conservar el modelo, descarga antes su archivo de respaldo <strong>.ncnn</strong>.</p>
        <label className="field"><span>Escribe exactamente <strong>{target.name}</strong> para confirmar</span>
          <input aria-label="Escribe el nombre del proyecto para eliminarlo" autoFocus disabled={deleting}
            value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
        {deleteError&&<p className="error" role="alert">{deleteError}</p>}
        <div className="project-dialog-actions">
          <button type="button" className="secondary" disabled={deleting} onClick={()=>{setTarget(null);setConfirmation("");}}>Cancelar</button>
          <button type="button" className="project-danger-button" disabled={deleting||confirmation.trim()!==target.name}
            onClick={()=>void confirmDeletion()}>{deleting?"Eliminando…":"Eliminar definitivamente"}</button>
        </div>
      </section>
    </div>}
  </div>;
}
