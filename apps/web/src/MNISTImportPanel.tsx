import {useEffect,useRef,useState} from "react";
import {MNIST_REPOSITORY,FASHION_REPOSITORY,isFashionDataset,importMnist,partitionMnist} from "./mnistDataset";
import type {MnistData,MnistLimit} from "./mnistDataset";
import "./mnist.css";
type Props={current?:MnistData;onApply:(data:MnistData)=>void;onRemove:()=>void;active:boolean};
export default function MNISTImportPanel({current,onApply,onRemove,active}:Props){
  const [url,setUrl]=useState(current?.source??MNIST_REPOSITORY);
  const [fashion,setFashion]=useState(Boolean(current&&isFashionDataset(current.source)));
  const [count,setCount]=useState<MnistLimit>(1000);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function load(){
    setError("");setStatus("Comprobando el repositorio del dataset…");setBusy(true);
    const abort=new AbortController();controller.current=abort;
    try{
      const data=await importMnist(url,count,progress=>{
        if(abort.signal.aborted)return;
        setStatus("Archivo "+progress.step+" de 4: "+progress.file+" · "+Math.round(progress.received/progress.expected*100)+"% descomprimido");
      },abort.signal);
      if(abort.signal.aborted)return;
      onApply(data);
      setStatus((isFashionDataset(data.source)?"Fashion-MNIST":"MNIST")+" importado: 60 000 imágenes originales y 10 000 imágenes independientes de prueba.");
    }catch(e){
      if(!abort.signal.aborted)setError(e instanceof Error?e.message:"Falló la importación MNIST.");
    }finally{if(controller.current===abort)controller.current=null;setBusy(false);}
  }
  const size=current?partitionMnist(current):null;
  return <section className="panel recent mnist-panel" aria-label="Importar MNIST desde enlace">
    <div className="panel-head"><div><div className="eyebrow">IMPORTACIÓN ONLINE · IDX / GZIP</div><h2>{fashion?"Importar Fashion-MNIST desde repositorio":"Importar MNIST desde repositorio"}</h2><p className="muted">{fashion?"Reconoce 10 prendas y accesorios con imágenes reales de Zalando.":"Obtén los dígitos reales 0–9 sin subir carpetas ni archivos manualmente."}</p></div><span className="badge">60 000 + 10 000</span></div>
    <label className="field"><span>Tipo de dataset</span><select aria-label="Tipo de dataset IDX" disabled={busy} value={fashion?"fashion":"digits"} onChange={e=>{const next=e.target.value==="fashion";setFashion(next);setUrl(next?FASHION_REPOSITORY:MNIST_REPOSITORY);setError("");setStatus("");}}><option value="digits">MNIST · números manuscritos</option><option value="fashion">Fashion-MNIST · prendas y accesorios</option></select></label>
    <p className="soft">Selecciona cuántas imágenes usar. Puedes empezar con un conjunto pequeño y ampliar el entrenamiento después.</p>
    {fashion&&<p className="caption">Fashion-MNIST es para prendas de 28 × 28 en escala de grises. Las fotografías de productos reales requieren entrenar con fotografías reales por categoría; una confianza alta no garantiza que la clase sea correcta.</p>}
    <label className="field"><span>Enlace del repositorio oficial</span><input aria-label="Enlace del repositorio MNIST" type="url" value={url} disabled={busy} onChange={e=>setUrl(e.target.value)}/></label>
    <label className="field"><span>Ejemplos originales utilizados (incluye 10% validación)</span><select aria-label="Cantidad MNIST" value={count} disabled={busy} onChange={e=>setCount(Number(e.target.value) as MnistLimit)}>
      <option value={1000}>1 000 · prueba de recursos</option><option value={10000}>10 000 · entrenamiento intermedio</option><option value={60000}>60 000 · conjunto completo</option>
    </select></label>
    <div className="actions">
      <button className="primary" onClick={()=>void load()} disabled={busy}>{busy?"Importando dataset…":fashion?"Conectar e importar Fashion-MNIST":"Conectar e importar MNIST"}</button>
      {busy&&<button className="secondary" onClick={()=>controller.current?.abort()}>Cancelar importación</button>}
      {current&&current.source===(fashion?FASHION_REPOSITORY:MNIST_REPOSITORY)&&<button className="secondary" disabled={busy} onClick={()=>{onApply({...current,limit:count});setStatus("Cantidad de ejemplos actualizada sin nueva descarga.");}}>Usar cantidad seleccionada</button>}
      {current&&<button className="text-button" disabled={busy} onClick={()=>{onRemove();setStatus("");}}>Liberar dataset de memoria</button>}
    </div>
    {status&&<p role="status" className="caption mnist-status">{status}</p>}
    {error&&<p role="alert" className="error">{error}</p>}
    {current&&size&&<div className="mnist-ready">
      <strong>{isFashionDataset(current.source)?"Fashion-MNIST":"MNIST"} cargado {active?"· activo para entrenamiento":"· no seleccionado como origen activo"}</strong>
      <div className="metric-grid"><div><small>Entrenamiento</small><strong>{size.train.length.toLocaleString("es-PE")}</strong></div><div><small>Validación</small><strong>{size.validation.length.toLocaleString("es-PE")}</strong></div><div><small>Prueba independiente</small><strong>{size.test.length.toLocaleString("es-PE")}</strong></div><div><small>Clases</small><strong>10</strong></div></div>
      <p className="caption">La selección es equilibrada y reproducible (semilla 42). La prueba oficial nunca participa en el entrenamiento ni en la selección del modelo. En la prueba rápida se evalúan 1 000 imágenes del conjunto oficial; al entrenar con 10 000 o 60 000 ejemplos se evalúa el conjunto oficial completo.</p>
    </div>}
  </section>;
}
