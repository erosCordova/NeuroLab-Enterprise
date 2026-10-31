import {useMemo,useState} from "react";
import type {Config,Metric} from "./cnn";
import {summary} from "./cnn";
import type {NetworkTrace,LayerActivity} from "./networkTelemetry";
import "./network-flow.css";

type Props={
  config:Config;classCount:number;working:boolean;realMetrics:Metric[];
  realEpochs:number;realComplete:boolean;trace?:NetworkTrace|null;batchState?:string;
};
type Stage={key:string;label:string;shape:string;units:number;mode:LayerActivity["mode"];description:string};
function architecture(config:Config,classCount:number):Stage[]{
  const info=summary(config,classCount),stages:Stage[]=[
    {key:"input",label:"ENTRADA",shape:config.size+" × "+config.size+" × "+config.channels,
      units:config.channels,mode:"pixels",description:"Píxeles normalizados de la imagen de validación."},
  ];
  let spatial=config.size;
  config.layers.forEach((layer,index)=>{
    stages.push({key:"conv-"+(index+1),label:"CONV2D "+(index+1),
      shape:spatial+" × "+spatial+" × "+layer.filters,units:layer.filters,mode:"channels",
      description:"Cada uno de los "+layer.filters+" filtros ("+layer.kernel+" × "+layer.kernel+") produce un mapa de características. Las barras miden la activación media absoluta de sus canales."});
    if(layer.pool){
      spatial=Math.floor(spatial/2);
      stages.push({key:"pool-"+(index+1),label:"MAXPOOL "+(index+1),
        shape:spatial+" × "+spatial+" × "+layer.filters,units:layer.filters,mode:"channels",
        description:"Conserva los valores máximos por región 2 × 2 y reduce la resolución espacial."});
    }
  });
  stages.push({key:"flatten",label:"FLATTEN",shape:info.flattened+" valores",
    units:info.flattened,mode:"groups",description:"Convierte los mapas espaciales en un vector. Las barras representan promedios de grupos, no neuronas individuales."});
  stages.push({key:"dense",label:"DENSE",shape:config.dense+" neuronas",
    units:config.dense,mode:"neurons",description:"Combina las características anteriores mediante neuronas con activación ReLU."});
  if(config.dropout)stages.push({key:"dropout",label:"DROPOUT",shape:config.dense+" neuronas",
    units:config.dense,mode:"neurons",description:"Reduce sobreajuste durante entrenamiento. En esta medición por inferencia está desactivado."});
  stages.push({key:"output",label:"SALIDA",shape:info.output+" unidades · "+classCount+" clases",
    units:classCount,mode:"probabilities",description:"Calcula las probabilidades de las clases mediante "+info.activation+"."});
  return stages;
}
const percentage=(v:number)=>Math.round(Math.max(0,Math.min(1,v))*100)+"%";
export default function NetworkFlow({config,classCount,working,realMetrics,realEpochs,realComplete,trace,batchState}:Props){
  const [view,setView]=useState<"2d"|"3d">("3d");
  const [motion,setMotion]=useState(true);
  const [selectedKey,setSelectedKey]=useState("output");
  const stages=useMemo(()=>{try{return architecture(config,classCount);}catch{return [];}}
    ,[config,classCount]);
  const measured=new Map(trace?.layers.map(layer=>[layer.key,layer])??[]);
  const selected=stages.find(stage=>stage.key===selectedKey)??stages.at(-1);
  const inspected=selected?measured.get(selected.key):undefined;
  const epochs=Math.max(1,realEpochs),done=Math.min(epochs,realMetrics.length);
  const latest=realMetrics.at(-1),animated=working&&Boolean(trace)&&motion;
  return <section className="nl-neural-panel" aria-label="Visualización animada de la arquitectura CNN">
    <div className="nl-neural-head">
      <div><p className="nl-neural-kicker">EXPLORADOR DE CAPAS · TENSORFLOW.JS</p>
        <h3>¿Qué está aprendiendo la CNN?</h3>
        <p>Arquitectura real y activaciones medidas con una imagen fija de validación, al terminar cada época.</p></div>
      <div className="nl-neural-controls" role="group" aria-label="Controles de visualización">
        <button type="button" className={view==="3d"?"selected":""} aria-pressed={view==="3d"} onClick={()=>setView("3d")}>Vista 3D</button>
        <button type="button" className={view==="2d"?"selected":""} aria-pressed={view==="2d"} onClick={()=>setView("2d")}>Vista 2D</button>
        <button type="button" className="nl-motion-toggle" aria-pressed={motion} onClick={()=>setMotion(m=>!m)}>{motion?"Pausar animación":"Reanudar animación"}</button>
      </div>
    </div>
    <div className="nl-neural-status" role="status">
      <span className={working?"nl-neural-live":"nl-neural-idle"}/>
      <strong>{working?(trace?"Activaciones reales · época "+trace.epoch:"Entrenando; esperando primera medición")
        :realComplete?"Entrenamiento real completado":"Sin entrenamiento activo"}</strong>
      <span>Épocas confirmadas: {done} / {epochs}</span>
    </div>
    <div className="nl-neural-data-heading">
      {trace?<><span className="nl-measured-tag">Medición real · época {trace.epoch}</span>
        <span>Imagen de validación — valor correcto: <strong>{trace.sampleLabel}</strong>. Predicción: <strong>{trace.predictedLabel}</strong> ({percentage(trace.confidence)}).</span></>
        :<><span className="nl-waiting-tag">Sin mediciones todavía</span>
          <span>Las capas muestran su estructura; sus valores se activarán después de la primera época real.</span></>}
    </div>
    {stages.length?<div className="nl-neural-window" data-view={view} data-motion={animated?"running":"paused"}>
      <div className="nl-neural-scroll" tabIndex={0} aria-label="Desplaza horizontalmente para explorar las capas">
        <div className="nl-layer-track" role="group" aria-label="Capas de la CNN">
          {stages.map((stage,index)=>{
            const actual=measured.get(stage.key);
            const values=actual?.preview??[];
            const max=values.reduce((n,v)=>Math.max(n,Math.abs(v)),0);
            const count=Math.min(12,stage.units);
            return <div className="nl-track-group" key={stage.key}>
              {index>0&&<div className="nl-flow-arrow" aria-hidden="true"><span>→</span></div>}
              <button type="button" aria-pressed={selected?.key===stage.key} aria-label={"Examinar capa "+stage.label}
                className={"nl-stage-card "+(selected?.key===stage.key?"current ":"")+(actual?"measured":"")}
                onClick={()=>setSelectedKey(stage.key)}>
                <span className="nl-stage-top">{stage.label}<small>{actual?"MEDIDA":"CAPA"}</small></span>
                <span className="nl-stage-shape">{stage.shape}</span>
                {stage.key==="input"&&trace?<svg className="nl-input-map" viewBox="0 0 14 14" role="img" aria-label="Píxeles medidos del ejemplo de validación">
                  {trace.pixels.map((v,i)=>{const c=Math.round(255*v);return <rect key={i} x={i%14} y={Math.floor(i/14)} width="1" height="1" fill={"rgb("+c+","+c+","+c+")"}/>;})}
                </svg>:<div className="nl-layer-bars" aria-hidden="true">
                  {Array.from({length:count},(_,i)=>{
                    const v=values[i]??0;
                    const height=actual?(stage.mode==="probabilities"?percentage(v):percentage(max>0?Math.abs(v)/max:0)):"8%";
                    return <span key={i} className="nl-layer-bar" style={{height}}/>;
                  })}
                </div>}
                <span className="nl-stage-bottom">{actual?stage.mode==="probabilities"?"Probabilidades observadas":stage.mode==="groups"?"Grupos de activaciones":"Activación observada":"Esperando medición"}</span>
                {actual&&<span className="nl-stage-mag">Media |a|: {actual.magnitude.toFixed(3)}</span>}
              </button>
            </div>;
          })}
        </div>
      </div>
    </div>:<p className="nl-neural-error">Revisa los parámetros de la CNN para visualizar su arquitectura.</p>}
    {selected&&<div className="nl-layer-explanation" aria-live="polite">
      <div><strong>{selected.label}: qué hace</strong><p>{selected.description}</p>
        {inspected?<p className="nl-measure-note">Los valores provienen del modelo TensorFlow.js en la época {trace?.epoch}. No son valores simulados.</p>
          :<p className="nl-measure-note">Al finalizar cada época aparecerán las activaciones calculadas sobre el mismo ejemplo de validación.</p>}
      </div>
      <div className="nl-layer-facts">
        <span>Forma de salida: <strong>{inspected?.shape??selected.shape}</strong></span>
        <span>{selected.mode==="groups"?"Valores":"Canales / unidades"}: <strong>{selected.units.toLocaleString("es-PE")}</strong></span>
        {inspected&&<span>Magnitud media: <strong>{inspected.magnitude.toFixed(4)}</strong></span>}
      </div>
    </div>}
    <div className="nl-neural-footer">
      <div className="nl-neural-progress"><span>Progreso real</span><progress max={epochs} value={done} aria-label="Progreso de épocas registrado"/><strong>{done} / {epochs}</strong></div>
      {working&&batchState&&<p className="nl-neural-batch">{batchState}</p>}
      {latest&&<div className="nl-neural-metrics">
        <span>Precisión entrenamiento: <strong>{percentage(latest.accuracy)}</strong></span>
        <span>Precisión validación: <strong>{percentage(latest.valAccuracy)}</strong></span>
        <span>Pérdida validación: <strong>{latest.valLoss.toFixed(3)}</strong></span>
      </div>}
      <p className="nl-neural-disclaimer">Las barras son activaciones medidas de una muestra de <strong>validación</strong>: Conv2D y MaxPool muestran magnitud media por canal; Flatten agrupa valores; Dense muestra unidades; la salida indica probabilidades calculadas. Cada capa tiene su propia escala. Cuando hay más de 12 canales o unidades solo se muestra una selección. Las flechas indican el orden de operaciones, <strong>no son pesos ni gradientes</strong>. Vista 3D cambia solo la perspectiva. El visor no altera el entrenamiento ni consulta el conjunto de prueba.</p>
    </div>
  </section>;
}
