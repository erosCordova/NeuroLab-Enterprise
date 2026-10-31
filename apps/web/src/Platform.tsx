import {useEffect,useState} from "react";
import App from "./App";
import ProjectsPanel from "./ProjectsPanel";
import {api,apiEnabled,persistProject} from "./api";
import type {Account,StoredProject} from "./api";
import type {ProjectDraft} from "./projects";
import "./platform.css";

export default function Platform(){
  const [user,setUser]=useState<Account|null>(null);
  const [projects,setProjects]=useState<StoredProject[]>([]);
  const [loading,setLoading]=useState(apiEnabled);
  const [error,setError]=useState("");
  const [register,setRegister]=useState(false);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [name,setName]=useState("");
  const [busy,setBusy]=useState(false);
  async function load(){
    setLoading(true);setError("");
    try {
      const identity=await api<Account>("/auth/me");
      const loaded=await api<StoredProject[]>("/projects");
      setProjects(loaded);setUser(identity);
    }catch(cause){setUser(null);setError(cause instanceof Error?cause.message:"No se pudo restaurar la sesión.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{
    if(!apiEnabled)return;
    void load();
    const expired=()=>{setUser(null);setProjects([]);setError("La sesión expiró. Vuelve a iniciar sesión.");};
    window.addEventListener("neurolab-session-expired",expired);
    return()=>window.removeEventListener("neurolab-session-expired",expired);
  },[]);
  async function save(draft:ProjectDraft,id:string){
    const result=await persistProject(draft,id,projects.find(project=>project.id===id));
    setProjects(current=>current.some(project=>project.id===result.id)?current.map(project=>project.id===result.id?result:project):[...current,result]);
    return result;
  }
  async function logout(){
    setError("");
    try{await api<void>("/auth/logout",{method:"POST"});setUser(null);setProjects([]);setPassword("");}
    catch(cause){setError(cause instanceof Error?cause.message:"No se pudo cerrar sesión.");}
  }
  if(!apiEnabled)return <App/>;
  if(loading)return <main className="platform-loading"><p role="status">Conectando con NeuroLab…</p></main>;
  if(user&&projects.length)return <><div className="account-strip"><span><strong>{user.display_name}</strong> · Proyectos en PostgreSQL</span><button className="secondary" onClick={()=>void logout()}>Cerrar sesión</button></div>{error&&<p role="alert">{error}</p>}
    <App key={user.id} initialProjects={projects} onPersistProject={save}/></>;
  if(user)return <main className="platform-onboarding"><div className="panel-head"><h1>Tu primer proyecto CNN</h1><button className="secondary" onClick={()=>void logout()}>Cerrar sesión</button></div>
    <p className="muted">Los proyectos se guardarán en tu cuenta de PostgreSQL.</p>{error&&<p role="alert">{error}</p>}
    <ProjectsPanel projects={[]} activeId="" persistent onSave={save} onOpen={()=>{}}/></main>;
  return <main className="platform-auth"><section className="platform-story"><div className="eyebrow">NEUROLAB ENTERPRISE</div><h1>Tu laboratorio de visión artificial.</h1><p>Organiza tus proyectos CNN, entrena imágenes y recupera los informes asociados a tu cuenta.</p><div className="platform-note">Proyectos e informes de entrenamientos persistentes en PostgreSQL. Los pesos CNN se conservan únicamente en el navegador que los entrenó.</div></section>
    <section className="panel platform-form" aria-label="Acceso a NeuroLab"><span className="badge">PLATAFORMA CNN</span><h2>{register?"Crear cuenta":"Iniciar sesión"}</h2>
      <p className="muted">{register?"Empieza con una cuenta personal.":"Continúa con tus proyectos guardados."}</p>
      <form onSubmit={async event=>{
        event.preventDefault();setBusy(true);setError("");
        try {
          const identity=await api<Account>(register?"/auth/register":"/auth/login",{method:"POST",body:JSON.stringify({email,password,...(register?{display_name:name}:{})})});
          const loaded=await api<StoredProject[]>("/projects");
          setPassword("");setProjects(loaded);setUser(identity);
        }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo iniciar sesión.");}
        finally{setBusy(false);}
      }}>
        <fieldset disabled={busy} className="cnn-mode-fields">
          {register&&<label className="field"><span>Nombre</span><input aria-label="Nombre" autoComplete="name" minLength={3} maxLength={80} required value={name} onChange={event=>setName(event.target.value)}/></label>}
          <label className="field"><span>Correo electrónico</span><input aria-label="Correo electrónico" type="email" autoComplete="username" required value={email} onChange={event=>setEmail(event.target.value)}/></label>
          <label className="field"><span>Contraseña</span><input aria-label="Contraseña" type="password" autoComplete={register?"new-password":"current-password"} minLength={12} maxLength={128} required value={password} onChange={event=>setPassword(event.target.value)}/></label>
          <p className="caption">Al menos doce caracteres. No compartas tu contraseña.</p>
          {error&&<p role="alert" className="error">{error}</p>}
          <button className="primary full">{busy?"Conectando…":register?"Crear mi cuenta":"Entrar"}</button>
          <button type="button" className="text-button" onClick={()=>{setRegister(value=>!value);setError("");setPassword("");}}>{register?"Ya tengo cuenta":"Crear una cuenta"}</button>
        </fieldset>
      </form>
      <button className="text-button" disabled={busy} onClick={()=>void load()}>Reintentar conexión</button>
    </section></main>;
}
