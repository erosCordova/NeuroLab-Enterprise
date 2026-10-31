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
    const detail=payload?.detail;
    if(typeof detail==="string")throw new Error(detail);
    if(response.status===422&&Array.isArray(detail)){
      const items=detail.slice(0,3).map((issue:unknown)=>{
        if(!issue||typeof issue!=="object")return "";
        const entry=issue as {loc?:unknown;msg?:unknown};
        const where=Array.isArray(entry.loc)
          ?entry.loc.filter((part:unknown)=>part!=="body"&&(typeof part==="string"||typeof part==="number")).join(" · ")
          :"";
        const message=typeof entry.msg==="string"?entry.msg.replace(/^Value error,\s*/i,""):"Datos no válidos.";
        return where?where+": "+message:message;
      }).filter(Boolean).join(" | ");
      throw new Error(items||"Los datos enviados no cumplen los requisitos.");
    }
    throw new Error(response.status===422
      ?path.startsWith("/auth/")?"Revisa los datos de acceso. La contraseña debe tener al menos doce caracteres.":"Los datos del informe CNN no cumplen los requisitos del servidor."
      :"No se pudo completar la operación en el servidor.");
  }
  return response.status===204?undefined as T:response.json();
}
export function persistProject(draft:ProjectDraft,id:string,previous?:StoredProject) {
  return api<StoredProject>(previous?`/projects/${id}`:"/projects",{
    method:previous?"PUT":"POST",
    body:JSON.stringify({...draft,tags:draft.tags.split(",").map(value=>value.trim()).filter(Boolean),...(previous?{revision:previous.revision}:{})}),
  });
}
