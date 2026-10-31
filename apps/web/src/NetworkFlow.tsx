import {useId,useMemo,useState} from "react";
import type {Config,Metric} from "./cnn";
import type {NetworkTrace} from "./networkTelemetry";
import {graphStages,visibleNodeCount,graphNodePosition,graphCanvasWidth} from "./networkGraph";
import "./network-flow.css";

type Props={
  config:Config;classCount:number;working:boolean;realMetrics:Metric[];
  realEpochs:number;realComplete:boolean;trace?:NetworkTrace|null;history?:NetworkTrace[];
  classNames?:string[];batchState?:string;
};
const percent=(value:number)=>(100*Math.max(0,Math.min(1,value))).toFixed(1)+"%";

export default function NetworkFlow({config,classCount,working,realMetrics,realEpochs,realComplete,trace,
  history=[],classNames,batchState}:Props){
  const [view,setView]=useState<"2d"|"3d">("3d");
  const [motion,setMotion]=useState(true);
  const [selectedKey,setSelectedKey]=useState("output");
  const [epochView,setEpochView]=useState("latest");
  const gradientId=useId().replace(/:/g,"-");
  const stages=useMemo(()=>{try{return graphStages(config,classCount);}catch{return [];}},[config,classCount]);
  const visible=epochView==="latest"?trace:history.find(h=>String(h.epoch)===epochView)??trace;
  const measured=useMemo(()=>new Map(visible?.layers.map(item=>[item.key,item])??[]),[visible]);
  const selected=stages.find(item=>item.key===selectedKey)??stages.at(-1);
  const active=selected?measured.get(selected.key):undefined;
  const epochs=Math.max(1,realEpochs),done=Math.min(epochs,realMetrics.length);
  const latest=epochView==="latest"?realMetrics.at(-1):realMetrics.find(m=>String(m.epoch)===epochView)??realMetrics.at(-1);
  const labels=classNames?.length===classCount?classNames:Array.from({length:classCount},(_,i)=>String(i));
  const running=working&&Boolean(visible)&&motion;
  const width=graphCanvasWidth(stages.length);
  const counts=stages.map(visibleNodeCount);
  const positions=stages.map((_,column)=>Array.from({length:counts[column]},(_,index)=>graphNodePosition(column,index,counts[column])));
  const strength=(stageIndex:number,nodeIndex:number)=>{
    const layer=measured.get(stages[stageIndex].key);
    if(!layer)return .12;
    const data=layer.preview;
    if(!data?.length)return Math.min(1,layer.magnitude);
    const abs=Math.abs(data[nodeIndex%data.length]??0);
    const max=Math.max(.00001,...data.map(v=>Math.abs(v)));
    return Math.min(1,Math.max(.08,stages[stageIndex].mode==="probabilities"?abs:abs/max));
  };
  const inputImage=visible?.pixels;
  return <section className="nl-neural-panel" aria-label="Visualización de neuronas y conexiones de la CNN">
    <div className="nl-neural-head">
      <div className="nl-heading"><h3>Red neuronal CNN</h3>
        <span className={"nl-status-pill "+(working?"live":realComplete?"done":"idle")} role="status">
          {working?"Entrenando":realComplete?"Completado":"Arquitectura"}
        </span>
      </div>
      <div className="nl-neural-controls" role="group" aria-label="Controles del gráfico neuronal">
        {history.length>1&&<select aria-label="Revisar medición de época" value={epochView} onChange={event=>setEpochView(event.target.value)}>
          <option value="latest">Última época</option>
          {history.map(h=><option key={h.epoch} value={String(h.epoch)}>Época {h.epoch}</option>)}
        </select>}
        <div className="nl-view-toggle" role="group" aria-label="Vista del grafo">
          <button type="button" className={view==="3d"?"selected":""} aria-pressed={view==="3d"} onClick={()=>setView("3d")}>3D</button>
          <button type="button" className={view==="2d"?"selected":""} aria-pressed={view==="2d"} onClick={()=>setView("2d")}>2D</button>
        </div>
        {working&&visible&&<button type="button" className="nl-motion-toggle" aria-pressed={motion} onClick={()=>setMotion(v=>!v)}>{motion?"Pausar":"Animar"}</button>}
      </div>
    </div>
    <div className="nl-neural-data-heading">
      {visible?<><span className="nl-epoch-pill">Época {visible.epoch}</span>
        <span>Original: <strong>{visible.sampleLabel}</strong></span><span aria-hidden="true">→</span>
        <span>Predicción: <strong>{visible.predictedLabel}</strong> <small>{percent(visible.confidence)}</small></span></>:
        <span className="nl-empty-pill">Vista de arquitectura · sin mediciones de entrenamiento</span>}
    </div>
    {stages.length?<div className="nl-neural-window" data-view={view} data-motion={running?"running":"paused"}>
      <div className="nl-neural-scroll" tabIndex={0} aria-label="Diagrama desplazable de neuronas y conexiones">
        <svg className="nl-neural-svg" viewBox={"0 0 "+width+" 352"} width={width} height="352" role="img" aria-label="Grafo de la red: neuronas conectadas de entrada a convoluciones, pooling, Flatten, Dense y salida">
          <defs>
            <linearGradient id={gradientId+"-back"} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#103e53"/><stop offset="100%" stopColor="#091b30"/>
            </linearGradient>
            <radialGradient id={gradientId+"-node"}>
              <stop offset="0%" stopColor="#efffff"/><stop offset="30%" stopColor="#58eac8"/><stop offset="100%" stopColor="#147b9b"/>
            </radialGradient>
          </defs>
          <rect width={width} height="352" rx="14" fill={"url(#"+gradientId+"-back)"}/>
          {Array.from({length:Math.ceil(width/32)},(_,i)=><line key={"grid-v"+i} x1={i*32} x2={i*32} y1="0" y2="352" stroke="#a9e8eb" strokeOpacity=".038"/>)}
          {Array.from({length:12},(_,i)=><line key={"grid-h"+i} x1="0" x2={width} y1={i*32} y2={i*32} stroke="#a9e8eb" strokeOpacity=".038"/>)}
          {positions.slice(0,-1).map((column,columnIndex)=>column.map((from,fromIndex)=>
            positions[columnIndex+1].map((to,toIndex)=>{
              const power=measured.has(stages[columnIndex].key)?strength(columnIndex,fromIndex):.13;
              const selectedLink=selected?.key===stages[columnIndex].key||selected?.key===stages[columnIndex+1].key;
              return <line key={columnIndex+"-"+fromIndex+"-"+toIndex} x1={from.x+9} y1={from.y} x2={to.x-9} y2={to.y}
                className={"nl-neural-edge "+(selectedLink?"focused ":"")+(running?"active":"")}
                stroke={columnIndex%2?"#89a8ff":"#55e6d4"}
                strokeWidth={selectedLink?1.15:.75}
                strokeOpacity={measured.size?Math.min(.5,.085+power*.28):.16}/>;
            })))}
          {stages.map((stage,column)=><g key={stage.key} className={selected?.key===stage.key?"nl-column chosen":"nl-column"}>
            <text className="nl-svg-label" x={85+column*146} y="32" textAnchor="middle">{stage.label}</text>
            <text className="nl-svg-shape" x={85+column*146} y="49" textAnchor="middle">{stage.shape}</text>
            {positions[column].map((point,nodeIndex)=>{
              const value=strength(column,nodeIndex),observed=measured.has(stage.key);
              const chosen=selected?.key===stage.key;
              const r=6+value*4;
              return <g key={nodeIndex} className={"nl-neuron "+(running&&observed?"live":"")}>
                {view==="3d"&&<><circle cx={point.x+7} cy={point.y-6} r={r+2} fill="#050e21" stroke={column%2?"#9686eb":"#167f8f"} strokeOpacity=".65"/>
                  <line x1={point.x+7} y1={point.y-6} x2={point.x} y2={point.y} stroke="#96eee2" strokeOpacity=".28"/></>}
                {chosen&&<circle cx={point.x} cy={point.y} r={r+6} fill="none" stroke="#64fce0" strokeOpacity=".36"/>}
                <circle cx={point.x} cy={point.y} r={r} fill={observed?"url(#"+gradientId+"-node)":"#2c6678"}
                  fillOpacity={observed?.55+value*.45:.65} stroke={observed?"#a5ffeb":"#82b5ce"} strokeWidth={chosen?1.7:1.0}/>
                {observed&&<circle cx={point.x-2} cy={point.y-2} r={Math.max(1.5,r*.26)} fill="#e9ffff" fillOpacity=".55"/>}
              </g>;
            })}
            <text className="nl-svg-count" x={85+column*146} y="321" textAnchor="middle">
              {stage.mode==="pixels"?"Píxeles":stage.mode==="probabilities"?"Clases":stage.units+" valores"}
            </text>
          </g>)}
          {inputImage?.length===196&&<g transform="translate(20 273)" aria-label="Miniatura de la imagen de validación">
            {inputImage.map((v,i)=>{
              const c=Math.round(255*Math.max(0,Math.min(1,v)));
              return <rect key={i} x={i%14*2} y={Math.floor(i/14)*2} width="2" height="2" fill={"rgb("+c+","+c+","+c+")"}/>;
            })}
          </g>}
        </svg>
      </div>
    </div>:<p className="nl-neural-error" role="alert">No se puede dibujar una arquitectura CNN inválida.</p>}
    {stages.length>0&&<div className="nl-node-selector" role="group" aria-label="Seleccionar capa del grafo">
      {stages.map(stage=><button type="button" key={stage.key} aria-pressed={selected?.key===stage.key}
        className={selected?.key===stage.key?"chosen":""} onClick={()=>setSelectedKey(stage.key)}>{stage.label}</button>)}
    </div>}
    {selected&&<div className="nl-layer-details" aria-live="polite">
      <strong>{selected.label}</strong><span>{active?.shape??selected.shape}</span>
      <span className="nl-detail-value">{active?"Activación media: "+active.magnitude.toFixed(3):"Configuración prevista"}</span>
      {selected.key==="output"&&active&&<div className="nl-output-probabilities" aria-label="Probabilidades por clase">
        {active.preview.map((v,i)=><div key={i} className="nl-prob"><span>{labels[i]??i}</span>
          <div className="nl-prob-track"><span style={{width:percent(v)}}/></div><strong>{percent(v)}</strong>
        </div>)}
      </div>}
    </div>}
    <div className="nl-neural-footer">
      <div className="nl-neural-progress"><span>Épocas</span><progress max={epochs} value={done} aria-label="Progreso de épocas"/>
        <strong>{done}/{epochs}</strong></div>
      {latest&&<div className="nl-neural-metrics"><span>Precisión <strong>{percent(latest.accuracy)}</strong></span>
        <span>Validación <strong>{percent(latest.valAccuracy)}</strong></span>
        <span>Pérdida <strong>{latest.valLoss.toFixed(3)}</strong></span></div>}
      {working&&batchState&&<span className="nl-neural-batch">{batchState}</span>}
      <p className="nl-neural-disclaimer">{visible?"Brillo de neuronas: resumen de activaciones medidas.":"Estructura ilustrativa antes de entrenar."} Las conexiones representan la arquitectura simplificada, no pesos individuales.</p>
    </div>
  </section>;
}
