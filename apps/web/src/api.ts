import type {Project,ProjectDraft} from "./projects";
export type Account={id:string;email:string;display_name:string};
export type StoredProject=Project&{revision:number;created_at:string;updated_at:string};
export const apiEnabled=import.meta.env.VITE_USE_API==="true";
const base=(import.meta.env.VITE_API_BASE_URL??"/api/v1").replace(/\/$/,"");
export async function api<T>(path:string,options:RequestInit={}):Promise<T> {
  let response:Response;
  try {response=await fetch(base+path,{...options,credentials:"include",headers:{"Content-Type":"application/json",...options.headers}});}
  catch {throw new Error("No se pudo conectar con el servidor. Revisa la conexión e inténtalo de nuevo.");}
  if(!response.ok){
    if(response.status===401&&!path.startsWith("/auth/"))window.dispatchEvent(new Event("neurolab-session-expired"));
    const payload=await response.json().catch(()=>null);
    throw new Error(typeof payload?.detail==="string"?payload.detail:response.status===422?"Revisa los campos y utiliza una contraseña de al menos doce caracteres.":"No se pudo completar la operación en el servidor.");
  }
  return response.status===204?undefined as T:response.json();
}
export function persistProject(draft:ProjectDraft,id:string,previous?:StoredProject) {
  return api<StoredProject>(previous?`/projects/${id}`:"/projects",{
    method:previous?"PUT":"POST",
    body:JSON.stringify({...draft,tags:draft.tags.split(",").map(value=>value.trim()).filter(Boolean),...(previous?{revision:previous.revision}:{})}),
  });
}
