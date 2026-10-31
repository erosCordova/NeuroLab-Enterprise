import {useMemo,useState} from "react";
import type {Config,Metric} from "./cnn";
import {summary} from "./cnn";
import type {NetworkTrace,LayerActivity} from "./networkTelemetry";
import "./network-flow.css";

type Props={
  config:Config;classCount:number;working:boolean;realMetrics:Metric[];
  realEpochs:number;realComplete:boolean;trace?:NetworkTrace|null;history?:NetworkTrace[];
  classNames?:string[];batchState?:string;
};
type Stage={key:string;label:string;shape:string;units:number;mode:LayerActivity["mode"]};
function getStages(config:Config,classCount:number):Stage[]{
  const info=summary(config,classCount);
  const items:Stage[]=[{key:"input",label:"ENTRADA",shape:config.size+" × "+config.size+" × "+config.channels,
    units:config.channels,mode:"pixels"}];
  let spatial=config.size;
  config.layers.forEach((layer,index)=>{
    items.push({key:"conv-"+(index+1),label:"CONV2D "+(index+1),
      shape:spatial+" × "+spatial+" × "+layer.filters,units:layer.filters,mode:"channels"});
    if(layer.pool){
      spatial=Math.floor(spatial/2);
      items.push({key:"pool-"+(index+1),label:"MAXPOOL "+(index+1),
        shape:spatial+" × "+spatial+" × "+layer.filters,units:layer.filters,mode:"channels"});
    }
  });
  items.push({key:"flatten",label:"FLATTEN",shape:info.flattened+" valores",units:info.flattened,mode:"groups"});
  items.push({key:"dense",label:"DENSE",shape:config.dense+" neuronas",units:config.dense,mode:"neurons"});
  if(config.dropout)items.push({key:"dropout",label:"DROPOUT",shape:config.dense+" neuronas",units:config.dense,mode:"neurons"});
  items.push({key:"output",label:"SALIDA",shape:info.output+" unidades",units:classCount,mode:"probabilities"});
  return items;
}
const percent=(v:number)=>(Math.max(0,Math.min(1,v))*100).toFixed(1)+"%";

export default function NetworkFlow({config,classCount,working,realMetrics,realEpochs,realComplete,trace,
  history=[],classNames,batchState}:Props){
  const [view,setView]=useState<"2d"|"3d">("3d");
  const [motion,setMotion]=useState(true);
  const [selectedKey,setSelectedKey]=useState("output");
  const [epochView,setEpochView]=useState("latest");
  const stages=useMemo(()=>{try{return getStages(config,classCount);}catch{return [];}},[config,classCount]);
  const visible=epochView==="latest"?trace:history.find(h=>String(h.epoch)===epochView)??trace;
  const measured=new Map(visible?.layers.map(layer=>[layer.key,layer])??[]);
  const selected=stages.find(stage=>stage.key===selectedKey)??stages.at(-1);
  const active=selected?measured.get(selected.key):undefined;
  const epochs=Math.max(1,realEpochs),done=Math.min(epochs,realMetrics.length);
  const latest=epochView==="latest"?realMetrics.at(-1):realMetrics.find(m=>String(m.epoch)===epochView)??realMetrics.at(-1);
  const labels=classNames?.length===classCount?classNames:Array.from({length:classCount},(_,i)=>String(i));
  const running=working&&Boolean(trace)&&motion;
  return <section className="nl-neural-panel" aria-label="Visualización animada de la arquitectura CNN">
    <div className="nl-neural-head">
      <div className="nl-heading">
        <h3>Visualización CNN</h3>
        <span className={"nl-status-pill "+(working?"live":realComplete?"done":"idle")} role="status">
          {working?"Entrenando":realComplete?"Completado":"Listo"}
        </span>
      </div>
      <div className="nl-neural-controls" role="group" aria-label="Controles de visualización">
        {history.length>1&&<select aria-label="Revisar medición de época" value={epochView}
          onChange={e=>setEpochView(e.target.value)}>
          <option value="latest">Última época</option>
          {history.map(h=><option key={h.epoch} value={String(h.epoch)}>Época {h.epoch}</option>)}
        </select>}
        <div className="nl-view-toggle" role="group" aria-label="Vista">
          <button type="button" className={view==="3d"?"selected":""} aria-pressed={view==="3d"}
            aria-label="Vista 3D" onClick={()=>setView("3d")}>3D</button>
          <button type="button" className={view==="2d"?"selected":""} aria-pressed={view==="2d"}
            aria-label="Vista 2D" onClick={()=>setView("2d")}>2D</button>
        </div>
        {working&&trace&&<button type="button" className="nl-motion-toggle" aria-pressed={motion}
          aria-label={motion?"Pausar animación":"Reanudar animación"} title={motion?"Pausar animación":"Reanudar animación"}
          onClick={()=>setMotion(v=>!v)}>{motion?"Ⅱ":"▶"}</button>}
      </div>
    </div>
    <div className="nl-neural-data-heading">
      {visible?<><span className="nl-epoch-pill">Época {visible.epoch}</span>
        <span className="nl-sample-label">Original: <strong>{visible.sampleLabel}</strong></span>
        <span className="nl-sample-arrow" aria-hidden="true">→</span>
        <span className="nl-sample-label">Predicción: <strong>{visible.predictedLabel}</strong> <small>{percent(visible.confidence)}</small></span></>
        :<span className="nl-empty-pill">Sin mediciones</span>}
    </div>
    {stages.length?<div className="nl-neural-window" data-view={view} data-motion={running?"running":"paused"}>
      <div className="nl-neural-scroll" tabIndex={0} aria-label="Desplazar capas CNN">
        <div className="nl-layer-track" role="group" aria-label="Capas de la CNN">
          {stages.map((stage,index)=>{
            const traceLayer=measured.get(stage.key);
            const values=traceLayer?.preview??[];
            const maximum=values.reduce((max,v)=>Math.max(max,Math.abs(v)),0);
            const count=Math.min(12,stage.units);
            return <div className="nl-track-group" key={stage.key}>
              {index>0&&<span className="nl-flow-arrow" aria-hidden="true">→</span>}
              <button type="button" aria-label={"Examinar capa "+stage.label} aria-pressed={selected?.key===stage.key}
                className={"nl-stage-card "+(selected?.key===stage.key?"current ":"")+(traceLayer?"measured":"")}
                onClick={()=>setSelectedKey(stage.key)}>
                <span className="nl-stage-top">{stage.label}<i aria-hidden="true"/></span>
                <span className="nl-stage-shape">{stage.shape}</span>
                {stage.key==="input"&&visible
                  ?<svg className="nl-input-map" viewBox="0 0 14 14" role="img" aria-label="Imagen de validación">
                    {visible.pixels.map((v,i)=>{const c=Math.round(v*255);return <rect key={i} x={i%14} y={Math.floor(i/14)}
                      width="1" height="1" fill={"rgb("+c+","+c+","+c+")"}/>;})}
                  </svg>
                  :<div className="nl-layer-bars" aria-hidden="true">
                    {Array.from({length:count},(_,i)=>{
                      const value=values[i]??0;
                      const height=traceLayer?(stage.mode==="probabilities"?percent(value):percent(maximum?Math.abs(value)/maximum:0)):"8%";
                      return <span key={i} className="nl-layer-bar" style={{height}}/>;
                    })}
                  </div>}
              </button>
            </div>;
          })}
        </div>
      </div>
    </div>:<p className="nl-neural-error" role="alert">Arquitectura inválida</p>}
    {selected&&<div className="nl-layer-details" aria-live="polite">
      <strong className="nl-selected-name">{selected.label}</strong>
      <span>{active?.shape??selected.shape}</span>
      {active&&selected.mode!=="input"&&<span className="nl-detail-value">{active.magnitude.toFixed(3)}</span>}
      {selected.key==="output"&&active&&<div className="nl-output-probabilities" aria-label="Probabilidades por clase">
        {active.preview.map((v,i)=><div key={i} className="nl-prob">
          <span>{labels[i]??i}</span><div className="nl-prob-track"><span style={{width:percent(v)}}/></div>
          <strong>{percent(v)}</strong>
        </div>)}
      </div>}
    </div>}
    <div className="nl-neural-footer">
      <div className="nl-neural-progress">
        <span>Épocas</span>
        <progress max={epochs} value={done} aria-label="Progreso de épocas registrado"/>
        <strong>{done}/{epochs}</strong>
      </div>
      {latest&&<div className="nl-neural-metrics">
        <span>Precisión <strong>{percent(latest.accuracy)}</strong></span>
        <span>Validación <strong>{percent(latest.valAccuracy)}</strong></span>
        <span>Pérdida <strong>{latest.valLoss.toFixed(3)}</strong></span>
      </div>}
      {working&&batchState&&<span className="nl-neural-batch">{batchState}</span>}
    </div>
  </section>;
}
