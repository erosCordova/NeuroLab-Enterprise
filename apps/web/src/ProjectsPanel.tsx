import { useState } from "react";
import { filterProjects, projectStatuses } from "./projects";
import type { Project, ProjectDraft } from "./projects";
import "./projects.css";

type Props = {
  projects: Project[];
  activeId: string;
  onSave: (draft:ProjectDraft,id:string)=>void;
  onOpen: (id:string)=>void;
};
const emptyDraft = ():ProjectDraft => ({name:"",description:"",status:"Activo",tags:""});

export default function ProjectsPanel({projects,activeId,onSave,onOpen}:Props) {
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("Todos");
  const [editing,setEditing]=useState<string|null>(null);
  const [draft,setDraft]=useState<ProjectDraft>(emptyDraft);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const visible=filterProjects(projects,search,status);

  function reset() {setEditing(null);setDraft(emptyDraft());setError("");}
  function edit(project:Project) {
    setEditing(project.id);
    setDraft({name:project.name,description:project.description,status:project.status,tags:project.tags.join(", ")});
    setError("");setNotice("");
    document.getElementById("project-editor")?.scrollIntoView({behavior:"smooth",block:"start"});
    document.getElementById("project-name")?.focus({preventScroll:true});
  }
  return <div className="project-workspace">
    <section className="panel project-editor" id="project-editor" aria-label="Editor del proyecto">
      <div className="panel-head"><div><div className="eyebrow">CONTEXTO DEL EXPERIMENTO</div>
        <h2>{editing?"Editar proyecto":"Crear proyecto CNN"}</h2>
        <p className="muted">Define el problema y organiza tus experimentos de imágenes.</p></div>
        <span className="badge">Sesión en memoria</span></div>
      <form onSubmit={event=>{
        event.preventDefault();setError("");setNotice("");
        try {
          onSave(draft,editing??crypto.randomUUID());
          setNotice(editing?"Proyecto actualizado. Sus datasets y ejecuciones se conservan.":"Proyecto creado.");
          reset();
        } catch(cause) {setError(cause instanceof Error?cause.message:"No se pudo guardar el proyecto.");}
      }}>
        <div className="two-fields">
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
        <p className="caption" id="project-tags-help">Hasta seis etiquetas separadas por comas. Archivar bloquea nuevas simulaciones, pero conserva el historial y permite terminar las ya iniciadas.</p>
        {error&&<p className="error" role="alert">{error}</p>}
        <div className="actions"><button className="primary">{editing?"Guardar cambios":"Crear proyecto"}</button>
          {editing&&<button type="button" className="secondary" onClick={reset}>Cancelar edición</button>}</div>
        <p role="status" className="feedback">{notice}</p>
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
        <div className="actions"><button className="text-button" onClick={()=>onOpen(project.id)}>Abrir proyecto →</button>
          <button className="secondary" aria-label={`Editar proyecto ${project.name}`} onClick={()=>edit(project)}>Editar</button></div>
      </article>)}</div>
      {!visible.length&&<div className="panel cnn-empty"><h2>No hay proyectos que coincidan</h2><p className="muted">Prueba otro nombre, etiqueta o estado.</p>
        <button className="secondary" onClick={()=>{setSearch("");setStatus("Todos");}}>Limpiar filtros de proyectos</button></div>}
    </section>
  </div>;
}
