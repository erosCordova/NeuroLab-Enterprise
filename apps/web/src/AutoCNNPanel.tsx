import { recommendCNN } from "./adaptiveTraining";
import type { Config,ImageDataset } from "./cnn";

type Props={
  dataset:ImageDataset;
  config:Config;
  automatic:boolean;
  onChange:(config:Config)=>void;
  onApply:(config:Config,epochs:number)=>void;
};

export default function AutoCNNPanel({
  dataset,config,automatic,onChange,onApply,
}:Props) {
  const proposal=recommendCNN(dataset,{
    size:28,channels:1,dense:64,layers:[],
  });

  return <section className="panel recent auto-cnn" aria-label="Configuración automática CNN">
    <div className="panel-head">
      <div><h2>Configuración automática CNN</h2><p className="muted">{proposal.reason}</p></div>

    </div>

    <p className="soft" role="status">
      {automatic
        ? "Automático activo: la arquitectura, la regularización y la parada temprana se configuran al enviar el dataset. No necesitas pulsar Aplicar."
        : "Manual activo: tus ajustes se conservan al alternar entre modos. Puedes usar la propuesta como punto de partida."}
    </p>
    {!automatic&&<button className="secondary" onClick={()=>
      onApply(structuredClone(proposal.config),proposal.epochs)
    }>Usar propuesta en modo manual</button>}

    <div className="metric-grid">
      <div><small>Imágenes de entrenamiento</small><strong>{proposal.count}</strong></div>
      <div><small>Bloques recomendados</small><strong>{proposal.config.layers.length}</strong></div>
      <div><small>Dense recomendado</small><strong>{proposal.config.dense}</strong></div>
      <div><small>Mínimo por clase</small><strong>{proposal.minimumClass}</strong></div>
    </div>

    <div className="soft">
      La propuesta usa únicamente los conteos de entrenamiento, las clases y
      la configuración de entrada. No consulta el conjunto de prueba para
      elegir la arquitectura ni demuestra una mejora de precisión.
      {proposal.minimumClass<10
        ? " Hay pocas imágenes por clase: conviene ampliar el dataset antes de evaluar rendimiento real."
        : ""}
    </div>

    <fieldset disabled={automatic} className="cnn-mode-fields">
      <legend>Regularización y parada temprana</legend>
    <div className="cnn-three">
      <label className="field"><span>Dropout</span><input
        aria-label="Dropout" type="number" min="0" max=".79" step=".05"
        value={config.dropout??0}
        onChange={event=>onChange({...config,dropout:Number(event.target.value)})}
      /></label>
      <label className="field"><span>Regularización L2</span><input
        aria-label="Regularización L2" type="number" min="0" max=".1" step=".0001"
        value={config.l2??0}
        onChange={event=>onChange({...config,l2:Number(event.target.value)})}
      /></label>
      <label className="field"><span>Paciencia · épocas</span><input
        aria-label="Paciencia" type="number" min="1" max="20" step="1"
        value={config.patience??5}
        onChange={event=>onChange({...config,patience:Number(event.target.value)})}
      /></label>
    </div>

    <div className="two-fields">
      <label className="field"><span>Mejora mínima de pérdida de validación</span><input
        aria-label="Mejora mínima" type="number" min="0" max="1" step=".001"
        value={config.minDelta??.01}
        onChange={event=>onChange({...config,minDelta:Number(event.target.value)})}
      /></label>
      <label className="cnn-check">
        <input
          aria-label="Activar parada temprana"
          type="checkbox"
          checked={config.earlyStopping??false}
          onChange={event=>onChange({...config,earlyStopping:event.target.checked})}
        />
        Activar parada temprana por pérdida de validación
      </label>
    </div>

    </fieldset>

    <p className="caption">
      Dropout y L2 se conservan como configuración para entrenamiento real.
      No modifican las curvas ilustrativas actuales. La parada temprana sí
      controla cuándo termina la simulación. No se restauran pesos porque
      todavía no existe un modelo entrenado.
    </p>
  </section>;
}
