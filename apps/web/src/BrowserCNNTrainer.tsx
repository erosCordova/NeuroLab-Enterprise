import {useEffect,useRef,useState} from "react";
import {api} from "./api";
import type {Config,ImageDataset,Metric,Job} from "./cnn";
import {summary} from "./cnn";
import type {BrowserReport} from "./browserCNN";
import CNNBackupActions from "./CNNBackupActions";
import PredictionPanel from "./PredictionPanel";
import NetworkFlow from "./NetworkFlow";
import type {NetworkTrace} from "./networkTelemetry";
import type {MnistData} from "./mnistDataset";
import {classNamesForSource,isFashionDataset} from "./mnistDataset";
import "./browser-cnn.css";

type Props={
  projectId:string;
  dataset?:ImageDataset;
  mnist?:MnistData;
  config:Config;
  connected:boolean;
  onSaved:()=>void;
  demoJob?:Job;
  demoPaused?:boolean;
};

function Curve({metrics,kind}:{metrics:Metric[];kind:"accuracy"|"loss"}) {
  const keys=kind==="accuracy"?(["accuracy","valAccuracy"] as const):(["loss","valLoss"] as const);
  const max=kind==="accuracy"?1:Math.max(0.1,...metrics.flatMap(point=>keys.map(key=>point[key])));
  const x=(index:number)=>30+430*index/Math.max(1,metrics.length-1);
  const y=(v:number)=>140-120*v/max;
  const path=(key:typeof keys[number])=>metrics.map((metric,index)=>
    (index?"L":"M")+x(index).toFixed(1)+","+y(metric[key]).toFixed(1)
  ).join(" ");
  return <svg viewBox="0 0 490 160" role="img" aria-label={kind==="accuracy"?"Precisión real medida en cada época":"Pérdida real medida en cada época"}>
    {[0,.25,.5,.75,1].map(ratio=><g key={ratio}>
      <line x1="30" x2="460" y1={y(ratio*max)} y2={y(ratio*max)} stroke="#d8e2ef"/>
      <text x="26" y={y(ratio*max)+3} fontSize="9" textAnchor="end" fill="#64748b">{kind==="accuracy"?Math.round(ratio*100)+"%":(ratio*max).toFixed(2)}</text>
    </g>)}
    <path stroke="#536bce" strokeWidth="2.5" fill="none" d={path(keys[0])}/>
    <path stroke="#318b79" strokeWidth="2.5" strokeDasharray="5 4" fill="none" d={path(keys[1])}/>
  </svg>;
}

export default function BrowserCNNTrainer({projectId,dataset,mnist,config,connected,onSaved}:Props) {
  const [epochs,setEpochs]=useState("12");
  const [batch,setBatch]=useState("16");
  const [working,setWorking]=useState(false);
  const [stage,setStage]=useState("");
  const [metrics,setMetrics]=useState<Metric[]>([]);
  const [networkTrace,setNetworkTrace]=useState<NetworkTrace|null>(null);
  const [networkHistory,setNetworkHistory]=useState<NetworkTrace[]>([]);
  const [inspecting,setInspecting]=useState(false);
  const [inspectError,setInspectError]=useState("");
  const [inspectMessage,setInspectMessage]=useState("");
  const [report,setReport]=useState<BrowserReport|null>(null);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [batchState,setBatchState]=useState("");
  const [tensorBytes,setTensorBytes]=useState(0);
  const [savingHistory,setSavingHistory]=useState(false);
  const [historySaved,setHistorySaved]=useState(false);
  const [officialBusy,setOfficialBusy]=useState(false);
  const [officialError,setOfficialError]=useState("");
  const [official,setOfficial]=useState<{preview:string;expected:string;predicted:string;confidence:number;correct:boolean}|null>(null);
  const controller=useRef<AbortController|null>(null);

  useEffect(()=>()=>controller.current?.abort(),[]);
  let reason="";
  if(dataset){
    try{
      const details=summary(config,dataset.classes.length);
      if(dataset.images.length>200||config.size>32||details.total>500000)reason="Para entrenar en el navegador usa hasta 200 imágenes, entrada máxima 32×32 y hasta 500 000 parámetros.";
    }catch(cause){reason=cause instanceof Error?cause.message:"Arquitectura no válida.";}
  }

  async function saveHistory(value:BrowserReport){
    if(!connected)return;
    setSavingHistory(true);
    try{
      await api("/projects/"+projectId+"/real-runs",{method:"POST",body:JSON.stringify(value)});
      setHistorySaved(true);
      setError("");
      setMessage("Modelo guardado en el navegador y métricas conservadas en PostgreSQL.");
      onSaved();
    }catch(cause){
      setHistorySaved(false);
      setError("Los pesos están guardados en este navegador, pero el historial no se pudo registrar en PostgreSQL: "+(cause instanceof Error?cause.message:"error de red")+". Puedes reintentar sin volver a entrenar.");
    }finally{setSavingHistory(false);}
  }

  async function start() {
    if(!dataset&&!mnist)return;
    setError("");setMessage("");setReport(null);setHistorySaved(false);setMetrics([]);setNetworkTrace(null);setNetworkHistory([]);setInspectError("");setInspectMessage("");setBatchState("");setTensorBytes(0);setWorking(true);
    setStage("Preparando el motor de CNN y las imágenes…");
    const abort=new AbortController();
    controller.current=abort;
    try{
      const onEpoch=(epoch:number,total:number,metric:Metric)=>{
        if(abort.signal.aborted)return;
        setMetrics(current=>[...current,metric]);
        setStage("Entrenamiento real: época "+epoch+" de "+total);
      };
      const result=mnist
        ? await (await import("./mnistTrain")).trainMnistInBrowser(projectId,mnist,config,Number(epochs),Number(batch),onEpoch,
          info=>{if(abort.signal.aborted)return;setBatchState("Época "+info.epoch+"/"+info.epochs+" · lote "+info.batch+"/"+info.batches);setTensorBytes(info.tensorBytes);},abort.signal,
          snapshot=>{if(!abort.signal.aborted){setNetworkTrace(snapshot);setNetworkHistory(old=>[...old,snapshot]);}})
        : await (await import("./browserCNN")).trainInBrowser(projectId,dataset!,config,Number(epochs),Number(batch),
          ({epoch,epochs:total,metric})=>onEpoch(epoch,total,metric),abort.signal,
          snapshot=>{if(!abort.signal.aborted){setNetworkTrace(snapshot);setNetworkHistory(old=>[...old,snapshot]);}});
      if(abort.signal.aborted)return;
      setReport(result);
      setStage("Modelo CNN guardado en este navegador.");
      setMessage("Pesos guardados en IndexedDB. Puedes utilizarlos aquí para realizar predicciones sin reentrenar.");
      if(connected&&!abort.signal.aborted)await saveHistory(result);
    }catch(cause){
      if(!abort.signal.aborted)setError(cause instanceof Error?cause.message:"No se pudo entrenar la CNN.");
      setStage("Sin entrenamiento completado.");
    }finally {
      if(controller.current===abort)controller.current=null;
      setWorking(false);
    }
  }

  async function downloadMnistExample(){
    if(!mnist)return;
    const index=0,offset=index*784;
    const canvas=document.createElement("canvas");
    canvas.width=28;canvas.height=28;
    const ctx=canvas.getContext("2d");
    if(!ctx)return;
    const img=ctx.createImageData(28,28);
    for(let pixel=0;pixel<784;pixel++){
      const v=mnist.testPixels[offset+pixel],pos=pixel*4;
      img.data[pos]=v;img.data[pos+1]=v;img.data[pos+2]=v;img.data[pos+3]=255;
    }
    ctx.putImageData(img,0,0);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));
    if(!blob)return;
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=(isFashionDataset(mnist.source)?"fashion-prueba-":"mnist-prueba-digito-")+mnist.testLabels[index]+".png";
    a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function checkOfficialTest(){
    if(!mnist||!report)return;
    setOfficial(null);setOfficialError("");setOfficialBusy(true);
    let classifier:import("@tensorflow/tfjs").LayersModel|undefined;
    let input:import("@tensorflow/tfjs").Tensor4D|undefined;
    let output:import("@tensorflow/tfjs").Tensor|undefined;
    try{
      const {mnistFingerprint}=await import("./mnistDataset");
      if(report.dataset_fingerprint!==await mnistFingerprint(mnist.source,mnist.limit)||
         report.classes.some((name,i)=>name!==classNamesForSource(mnist.source)[i])){
        throw new Error("El modelo y el dataset actual no coinciden. Vuelve a conectar el origen del entrenamiento para realizar esta prueba.");
      }
      const tf=await import("@tensorflow/tfjs");
      const values=new Float32Array(784);
      const canvas=document.createElement("canvas");canvas.width=28;canvas.height=28;
      const context=canvas.getContext("2d");
      if(!context)throw new Error("No se pudo preparar el ejemplo de prueba.");
      const image=context.createImageData(28,28);
      for(let pixel=0;pixel<784;pixel++){
        const value=mnist.testPixels[pixel];
        values[pixel]=value/255;
        const pos=pixel*4;
        image.data[pos]=image.data[pos+1]=image.data[pos+2]=value;
        image.data[pos+3]=255;
      }
      context.putImageData(image,0,0);
      const expected=report.classes[mnist.testLabels[0]];
      classifier=await tf.loadLayersModel(report.model_ref);
      input=tf.tensor4d(values,[1,28,28,1]);
      output=classifier.predict(input) as import("@tensorflow/tfjs").Tensor;
      const scores=await output.data();
      if(scores.length!==report.classes.length)throw new Error("El resultado no corresponde a las categorías del modelo.");
      const best=Array.from(scores).reduce((selected,value,index,all)=>value>all[selected]?index:selected,0);
      const predicted=report.classes[best];
      setOfficial({preview:canvas.toDataURL("image/png"),expected,predicted,confidence:scores[best],correct:predicted===expected});
    }catch(cause){setOfficialError(cause instanceof Error?cause.message:"No se pudo ejecutar la prueba oficial.");}
    finally{output?.dispose();input?.dispose();classifier?.dispose();setOfficialBusy(false);}
  }
  async function inspectSavedModel(){
    if(!report)return;
    setInspecting(true);setInspectError("");setInspectMessage("");
    let model:import("@tensorflow/tfjs").LayersModel|undefined;
    let sample:import("@tensorflow/tfjs").Tensor4D|undefined;
    try{
      const tf=await import("@tensorflow/tfjs");
      const {captureNetworkTrace}=await import("./networkTelemetry");
      const {partitionMnist,mnistFingerprint}=await import("./mnistDataset");
      const {pixelsOfImage}=await import("./browserCNN");
      let values:Float32Array,label:string;
      const correctClasses=mnist?classNamesForSource(mnist.source):[];
      const matches=report.classes.length===10&&report.classes.every((item,index)=>item===correctClasses[index]);
      if(mnist&&matches&&await mnistFingerprint(mnist.source,mnist.limit)===report.dataset_fingerprint){
        const index=partitionMnist(mnist).validation[0];
        values=new Float32Array(28*28);
        for(let p=0;p<784;p++)values[p]=mnist.trainPixels[index*784+p]/255;
        label=correctClasses[mnist.trainLabels[index]];
      }else if(dataset&&dataset.fingerprint===report.dataset_fingerprint){
        const index=dataset.validation[0];
        values=await pixelsOfImage(dataset.images[index].file,report.config);
        label=dataset.images[index].label;
      }else{
        throw new Error("Vuelve a conectar el mismo dataset con el que entrenaste este modelo. No necesitas volver a entrenar.");
      }
      model=await tf.loadLayersModel(report.model_ref);
      sample=tf.tensor4d(values,[1,report.config.size,report.config.size,report.config.channels]);
      const snapshot=captureNetworkTrace(model,sample,report.config,report.classes,report.completed_epochs,label);
      setNetworkTrace(snapshot);setNetworkHistory([snapshot]);
      setInspectMessage("Modelo inspeccionado.");
    }catch(cause){
      setInspectError(cause instanceof Error?cause.message:"No se pudo inspeccionar el modelo guardado.");
    }finally{
      sample?.dispose();
      model?.dispose();
      setInspecting(false);
    }
  }
  function exportReport(){
    if(!report)return;
    const blob=new Blob([JSON.stringify(report,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;link.download="neurolab-cnn-real-navegador.json";link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  return <section className="panel browser-cnn" aria-label="Entrenamiento CNN real en navegador">
    <div className="panel-head">
      <div><div className="eyebrow">ENTRENAMIENTO REAL · SIN COSTO DE GPU EN RENDER</div>
        <h2>Entrenar CNN con TensorFlow.js</h2>
        <p className="muted">Aprende de los píxeles de tus imágenes directamente en este navegador.</p></div>
      <span className="badge">REAL · NAVEGADOR</span>
    </div>
    <p className="soft">Las imágenes no se envían a Render para entrenar. Los pesos se guardan en IndexedDB de <strong>este navegador</strong>, no en Neon ni en la nube: podrían perderse si limpias sus datos o utilizas otro dispositivo. La calidad depende de las imágenes y no se garantiza una precisión determinada.</p>
    <NetworkFlow config={config} classCount={mnist?10:dataset?.classes.length??report?.classes.length??2} working={working} realMetrics={metrics} realEpochs={report?.requested_epochs??Number(epochs)} realComplete={Boolean(report)} trace={networkTrace} history={networkHistory}
      classNames={report?.classes??(mnist?classNamesForSource(mnist.source):dataset?.classes)}
      batchState={batchState}/>
    {!dataset&&!mnist?<div className="cnn-empty">Primero carga y aplica un dataset en la sección Datasets.</div>:<>
      {mnist?<p><strong>{isFashionDataset(mnist.source)?"Fashion-MNIST":"MNIST"} · origen público</strong> · {mnist.limit.toLocaleString("es-PE")} ejemplos seleccionados · 10 clases · 10 000 pruebas independientes.</p>:dataset&&<p><strong>{dataset.name}</strong> · {dataset.images.length} imágenes · {dataset.classes.length} clases · {dataset.train.length} entrenamiento / {dataset.validation.length} validación / {dataset.test.length} prueba</p>}
      {mnist&&<p className="mnist-usage">El entrenamiento IDX usa mini-batches de tensores temporales. Las imágenes originales permanecen como bytes; evita otras tareas pesadas mientras entrenas el conjunto completo. La duración depende de tu CPU/GPU.</p>}
      {reason&&<p className="error" role="alert">{reason}</p>}
      <div className="cnn-three">
        <label className="field"><span>Épocas reales (1–40)</span>
          <input aria-label="Épocas de entrenamiento real" type="number" min="1" max="40" step="1" value={epochs} disabled={working} onChange={event=>setEpochs(event.target.value)}/>
        </label>
        <label className="field"><span>Batch size (1–64)</span>
          <input aria-label="Batch del entrenamiento real" type="number" min="1" max="64" step="1" value={batch} disabled={working} onChange={event=>setBatch(event.target.value)}/>
        </label>
        <button className="primary" disabled={working||Boolean(reason)} onClick={()=>void start()}>{working?"Entrenando CNN…":"Entrenar CNN real"}</button>
      </div>
      {working&&<button className="secondary cnn-spaced" onClick={()=>controller.current?.abort()}>Cancelar entrenamiento real</button>}
      <p role="status" className="caption">{stage}</p>
      {working&&<progress aria-label="Épocas reales ejecutadas" max={Math.max(1,Number(epochs))} value={metrics.length}/>}
      {mnist&&working&&<p role="status" className="caption">{batchState} · Memoria de tensores estimada: {(tensorBytes/1048576).toFixed(1)} MiB (no incluye RAM total)</p>}
      {error&&<p className="error" role="alert">{error}</p>}
      {message&&<p className="feedback" role="status">{message}</p>}
      {metrics.length>0&&<div className="cnn-two-charts cnn-spaced">
        <div><h3>Precisión por época</h3><Curve metrics={metrics} kind="accuracy"/></div>
        <div><h3>Pérdida por época</h3><Curve metrics={metrics} kind="loss"/></div>
      </div>}
      {report&&<div className="browser-cnn-summary">
        <div className="metric-grid">
          <div><small>Precisión de prueba</small><strong>{(report.test.accuracy*100).toFixed(1)}%</strong></div>
          <div><small>Pérdida de prueba</small><strong>{report.test.loss.toFixed(4)}</strong></div>
          <div><small>Épocas ejecutadas</small><strong>{report.completed_epochs}</strong></div>
          <div><small>Parámetros</small><strong>{report.parameters.toLocaleString("es-PE")}</strong></div>
        </div>
        {connected&&!historySaved&&<button className="primary cnn-spaced" type="button" disabled={savingHistory||working} onClick={()=>void saveHistory(report)}>
          {savingHistory?"Guardando historial…":"Reintentar guardar historial en PostgreSQL"}
        </button>}
        <button type="button" className="primary cnn-spaced" disabled={working||inspecting} onClick={()=>void inspectSavedModel()}>
          {inspecting?"Inspeccionando capas…":"Inspeccionar modelo guardado"}
        </button>
        {inspectMessage&&<p className="feedback" role="status">{inspectMessage}</p>}
        {inspectError&&<p className="error" role="alert">{inspectError}</p>}
        <button className="secondary cnn-spaced" onClick={exportReport}>Exportar informe JSON de entrenamiento real</button>
      </div>}
    </>}
    {mnist&&<p className="caption">Importación IDX en RAM: al recargar la página deberás reconectar el origen; el modelo entrenado y guardado en IndexedDB permanece disponible para exportar o restaurar mediante los respaldos.</p>}
    <CNNBackupActions projectId={projectId} report={report} onRestored={restored=>{
      setReport(restored);setNetworkTrace(null);setNetworkHistory([]);setInspectMessage("");setInspectError("");setHistorySaved(false);setMetrics(restored.metrics);
      setStage("Respaldo CNN recuperado desde otro navegador o dispositivo.");
    }}/>
    {report&&<section className="cnn-backup-predictions" aria-label="Predicción con modelo recuperado">
      <h3>Reconocer una imagen con los pesos guardados</h3>
      {mnist&&<><p className="caption">{isFashionDataset(mnist.source)?"Fashion-MNIST utiliza imágenes oficiales en escala de grises de 28×28.":"MNIST utiliza números claros sobre fondo oscuro. También se invierte automáticamente una imagen cuando tiene el fondo claro."}</p><button className="secondary" type="button" onClick={()=>void downloadMnistExample()}>{isFashionDataset(mnist.source)?"Descargar prenda oficial de prueba (PNG)":"Descargar dígito oficial de prueba (PNG)"}</button></>}
      <p className="caption">El modelo no se reentrena: se recupera de IndexedDB y se aplica a una imagen nueva.</p>
      {mnist&&<section className="photo-official-check" aria-label="Verificación automática con imagen de prueba oficial">
        <button className="secondary" type="button" disabled={officialBusy||working} onClick={()=>void checkOfficialTest()}>
          {officialBusy?"Comprobando muestra oficial…":"Comprobar ahora con una imagen oficial"}
        </button>
        <p className="caption">Prueba sin descargar ni subir archivos: compara la predicción con la etiqueta real de la primera imagen del conjunto oficial de prueba.</p>
        {officialError&&<p role="alert" className="error">{officialError}</p>}
        {official&&<div className="photo-official-result">
          <img src={official.preview} width="84" height="84" alt="Imagen del conjunto oficial de prueba"/>
          <div><strong>{official.correct?"Clasificación correcta":"Clasificación incorrecta"}</strong>
            <p>Etiqueta real: <strong>{official.expected}</strong></p>
            <p>Predicción: <strong>{official.predicted}</strong> · confianza {(official.confidence*100).toFixed(2)}%</p>
            <p className="caption">Este resultado es de una sola imagen; consulta también la precisión de prueba del conjunto completo.</p>
          </div>
        </div>}
      </section>}
      <PredictionPanel key={report.model_ref} inputLabel="Imagen para clasificar"
        inputAriaLabel="Imagen para predecir con modelo respaldado"
        disabled={working} digitMode={report.classes.length===10&&report.classes.every((name,index)=>name===String(index))}
        onPredict={async file=>{
          const {predictInBrowser}=await import("./browserCNN");
          const isMnist=report.classes.length===10&&report.classes.every((name,index)=>name===String(index));
          return predictInBrowser(report.model_ref,file,report.config,report.classes,isMnist);
        }}/>
    </section>}
  </section>;
}
