import { useMemo, useState } from "react";
import { summary } from "./cnn";
import type { Config, Job, Metric } from "./cnn";
import "./network-flow.css";

type Stage = {
  key: string;
  label: string;
  description: string;
  sampleCount: number;
  tone: "cyan" | "violet" | "mint";
};
type Props = {
  config: Config;
  classCount: number;
  working: boolean;
  realMetrics: Metric[];
  realEpochs: number;
  realComplete: boolean;
  demoJob?: Job;
  demoPaused?: boolean;
};

const nodesFor = (stage: Stage, center = 162) =>
  Array.from({ length: stage.sampleCount }, (_, index) =>
    center + (index - (stage.sampleCount - 1) / 2) * 29
  );

export default function NetworkFlow({
  config, classCount, working, realMetrics, realEpochs, realComplete,
  demoJob, demoPaused = false,
}: Props) {
  const [view, setView] = useState<"2d" | "3d">("3d");
  const [motion, setMotion] = useState(true);

  const stages = useMemo(() => {
    try {
      const shape = summary(config, classCount);
      const items: Stage[] = [{
        key: "input", label: "ENTRADA",
        description: String(config.size) + " × " + String(config.size) + " × " + String(config.channels),
        sampleCount: 7, tone: "cyan",
      }];
      config.layers.forEach((layer, index) => {
        const number = index + 1;
        items.push({
          key: "conv-" + number, label: "CONV2D " + number,
          description: String(layer.filters) + " filtros · " + String(layer.kernel) + "×" + String(layer.kernel),
          sampleCount: Math.min(7, Math.max(3, layer.filters)),
          tone: "violet",
        });
        if (layer.pool) items.push({
          key: "pool-" + number, label: "MAXPOOL " + number,
          description: String(shape.blocks[index].spatial) + "×" + String(shape.blocks[index].spatial),
          sampleCount: 5, tone: "cyan",
        });
      });
      items.push({
        key: "flatten", label: "FLATTEN",
        description: String(shape.flattened) + " valores",
        sampleCount: 6, tone: "cyan",
      }, {
        key: "dense", label: "DENSE",
        description: String(config.dense) + " unidades",
        sampleCount: Math.min(7, Math.max(1, config.dense)),
        tone: "violet",
      }, {
        key: "output", label: "SALIDA",
        description: String(shape.output) + " " + (shape.output === 1 ? "unidad" : "unidades") + " · " + String(classCount) + " clases",
        sampleCount: Math.min(6, shape.output),
        tone: "mint",
      });
      return items;
    } catch {
      return null;
    }
  }, [config, classCount]);

  const isDemo = !working && Boolean(demoJob);
  const metrics = working ? realMetrics : isDemo ? demoJob?.metrics ?? [] : realMetrics;
  const latest = metrics.at(-1);
  const completed = working
    ? realMetrics.length
    : isDemo
      ? demoJob?.epoch ?? 0
      : realMetrics.length;
  const requested = working
    ? realEpochs
    : isDemo
      ? demoJob?.epochs ?? 1
      : realComplete
        ? Math.max(1, realMetrics.length)
        : Math.max(1, realEpochs);
  const safeTotal = Number.isFinite(requested) && requested > 0 ? requested : 1;
  const pct = Math.max(0, Math.min(100, Math.round(completed / safeTotal * 100)));
  const active = working || (isDemo && demoJob?.status === "Ejecutando" && !demoPaused);
  const playing = motion && (active || (!working && !isDemo && !realComplete));
  const status = working
    ? "Entrenamiento real en ejecución"
    : isDemo
      ? demoPaused ? "Simulación en pausa" : "Simulación didáctica " + (demoJob?.status ?? "")
      : realComplete
        ? "Último entrenamiento real completado"
        : "Demostración visual (sin entrenamiento)";
  const width = stages ? Math.max(760, 76 + (stages.length - 1) * 150 + 85) : 760;

  return <section className="nl-neural-panel" aria-label="Visualización animada de la arquitectura CNN">
    <div className="nl-neural-head">
      <div>
        <p className="nl-neural-kicker">LABORATORIO VISUAL · CNN</p>
        <h3>Red neuronal en movimiento</h3>
        <p>Observa el recorrido ilustrativo desde los píxeles hasta las clases de salida.</p>
      </div>
      <div className="nl-neural-controls" role="group" aria-label="Controles de visualización">
        <button type="button" className={view === "3d" ? "selected" : ""} aria-pressed={view === "3d"} onClick={() => setView("3d")}>Vista 3D</button>
        <button type="button" className={view === "2d" ? "selected" : ""} aria-pressed={view === "2d"} onClick={() => setView("2d")}>Vista 2D</button>
        <button type="button" className="nl-motion-toggle" aria-pressed={motion} onClick={() => setMotion(value => !value)}>
          {motion ? "Pausar animación" : "Reanudar animación"}
        </button>
      </div>
    </div>
    <div className="nl-neural-status">
      <span className={active ? "nl-neural-live" : "nl-neural-idle"} aria-hidden="true"/>
      <strong>{status}</strong>
      {working || isDemo || realComplete ? <span>Épocas confirmadas: {completed} / {safeTotal}</span> : <span>Esquema de la arquitectura seleccionada</span>}
    </div>
    {stages ? <div className="nl-neural-window" data-motion={playing ? "running" : "paused"} data-view={view}>
      <div className="nl-neural-scroll" tabIndex={0} aria-label="Desplaza horizontalmente para explorar las capas">
        <svg width={width} height="350" viewBox={"0 0 " + width + " 350"} role="img" aria-label={"Esquema CNN: " + stages.map(s => s.label).join(", ")}>
          <defs>
            <radialGradient id="nl-neural-backdrop" cx="51%" cy="42%" r="70%">
              <stop offset="0%" stopColor="#153a47"/><stop offset="100%" stopColor="#091b26"/>
            </radialGradient>
            <filter id="nl-glow" x="-130%" y="-130%" width="360%" height="360%">
              <feGaussianBlur stdDeviation="4" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <rect x="0" y="0" width={width} height="350" rx="15" fill="url(#nl-neural-backdrop)"/>
          {Array.from({length: 19}, (_, i) => <line key={"grid-" + i} x1="0" y1={20 + i * 18} x2={width} y2={20 + i * 18} className="nl-neural-grid"/>)}
          {stages.slice(0, -1).flatMap((stage, index) => {
            const next = stages[index + 1];
            const a = nodesFor(stage);
            const b = nodesFor(next);
            const x1 = 76 + index * 150;
            const x2 = x1 + 150;
            return a.flatMap((y1, aIndex) => b.filter((_, bIndex) =>
              stage.key === "flatten" || stage.key === "dense" || next.key === "output"
                ? true
                : (aIndex + bIndex) % 2 === 0
            ).map((y2, bIndex) => {
              const key = stage.key + "-" + aIndex + "-" + bIndex;
              return <g key={key}>
                <path className="nl-neural-wire" d={"M" + x1 + "," + y1 + " C" + (x1 + 59) + "," + y1 + " " + (x2 - 60) + "," + y2 + " " + x2 + "," + y2}/>
                {(aIndex + bIndex) % 3 === 0 && <path className="nl-neural-signal" style={{animationDelay: "-" + ((aIndex + bIndex + index) % 9 / 6).toFixed(2) + "s"}} d={"M" + x1 + "," + y1 + " C" + (x1 + 59) + "," + y1 + " " + (x2 - 60) + "," + y2 + " " + x2 + "," + y2}/>}
              </g>;
            }));
          })}
          {stages.map((stage, index) => {
            const x = 76 + index * 150;
            const ys = nodesFor(stage);
            return <g key={stage.key} className={"nl-neural-stage nl-tone-" + stage.tone}>
              {view === "3d" && <g opacity=".25" transform="translate(9,-8)">
                {ys.map((y, j) => <circle key={"depth-" + j} cx={x} cy={y} r="8" className="nl-neural-depth"/>)}
              </g>}
              {ys.map((y, j) => <g key={j} className="nl-neural-node">
                <circle cx={x} cy={y} r="11" className="nl-node-halo"/>
                <circle cx={x} cy={y} r="5.2" className="nl-node-ring" filter="url(#nl-glow)"/>
                <circle cx={x} cy={y} r="1.7" className="nl-node-core"/>
              </g>)}
              <text className="nl-stage-title" x={x} y="295" textAnchor="middle">{stage.label}</text>
              <text className="nl-stage-caption" x={x} y="314" textAnchor="middle">{stage.description}</text>
              {stage.sampleCount < (stage.key.startsWith("conv") ? Number(stage.description.split(" ")[0]) : 0)
                && <text className="nl-stage-sample" x={x} y="333" textAnchor="middle">vista reducida</text>}
            </g>;
          })}
        </svg>
      </div>
    </div> : <p className="nl-neural-error" role="status">Revisa la arquitectura CNN en el diseñador para visualizar sus capas.</p>}
    <div className="nl-neural-footer">
      <div className="nl-neural-key"><span className="nl-dot-cyan"/> Entrada y procesamiento <span className="nl-dot-violet"/> Capas convolucionales y Dense <span className="nl-dot-mint"/> Salida</div>
      <div className="nl-neural-progress"><span>{active || realComplete || isDemo ? "Avance registrado" : "Esperando entrenamiento"}</span><progress max="100" value={pct} aria-label="Progreso de épocas registrado"/><strong>{active || realComplete || isDemo ? pct + "%" : "—"}</strong></div>
      {latest && <div className="nl-neural-metrics" aria-label={isDemo ? "Métricas simuladas" : "Métricas reales"}>
        <span>Precisión {isDemo ? "simulada" : "real"}: <strong>{(latest.accuracy * 100).toFixed(1)}%</strong></span>
        <span>Validación: <strong>{(latest.valAccuracy * 100).toFixed(1)}%</strong></span>
        <span>Pérdida: <strong>{latest.loss.toFixed(3)}</strong></span>
      </div>}
      <p className="nl-neural-disclaimer">Las luces y conexiones representan el flujo de información de forma ilustrativa; no son activaciones, pesos ni gradientes medidos de cada capa. {isDemo ? "Las métricas de esta ejecución son simuladas." : working || realComplete ? "Las épocas y métricas indicadas proceden del entrenamiento TensorFlow.js." : "Para obtener métricas reales, carga un dataset y pulsa «Entrenar CNN real»."} Los círculos son una muestra visual, no el número total de unidades.</p>
    </div>
  </section>;
}
