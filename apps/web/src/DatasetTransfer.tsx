import { useState } from "react";
import type { ImageDataset } from "./cnn";
import { datasetManifest,exportDataset } from "./datasetExport";
import type { Directory } from "./datasetExport";

export default function DatasetTransfer({dataset}:{dataset:ImageDataset}) {
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(0);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function startExport() {
    setError("");setMessage("");setDone(0);

    const api=window as unknown as {
      showDirectoryPicker?:(options:{mode:"readwrite"})=>Promise<Directory>;
    };

    if(!api.showDirectoryPicker){
      setError("Este navegador no permite exportar carpetas. Abre NeuroLab en Chrome o Edge compatible.");
      return;
    }

    try{
      datasetManifest(dataset);
      setBusy(true);

      const target=await api.showDirectoryPicker({mode:"readwrite"});
      const result=await exportDataset(dataset,target,(count)=>setDone(count));

      setMessage(`Dataset exportado: ${result.total} imágenes. Carpeta creada: ${result.folderName}`);
    }catch(cause){
      if(cause instanceof Error&&cause.name==="AbortError"){
        setMessage("Exportación cancelada.");
      }else if(cause instanceof Error&&cause.name==="NotAllowedError"){
        setError("No se concedió permiso para escribir en la carpeta.");
      }else{
        setError(cause instanceof Error?cause.message:"No se pudo exportar el dataset.");
      }
    }finally{
      setBusy(false);
    }
  }

  return <section className="panel recent" aria-label="Exportación del dataset">
    <div className="panel-head">
      <div><h2>Exportar dataset completo</h2><p className="muted">Guarda las imágenes reales, organizadas por clase, y su manifiesto.</p></div>
      <button className="primary" disabled={busy} onClick={()=>void startExport()}>
        {busy?"Exportando imágenes...":"Exportar dataset completo"}
      </button>
    </div>
    {busy&&<>
      <progress aria-label="Progreso de exportación" max={dataset.images.length} value={done} />
      <p className="caption">{done}/{dataset.images.length} imágenes</p>
    </>}
    <p className="feedback" role="status">{message}</p>
    <p className="error" role="alert">{error}</p>
    <div className="soft">
      Se crea una carpeta nueva dentro del destino que elijas.
      Incluye las imágenes y dataset.neurolab.json con clases, particiones y huellas.
      No utiliza ZIP ni envía archivos a un servidor.
    </div>
  </section>;
}
