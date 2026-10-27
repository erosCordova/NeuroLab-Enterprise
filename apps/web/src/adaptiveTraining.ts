import type { Config, ImageDataset, Job } from "./cnn";

export function validateTrainingOptions(config:Config) {
  const dropout=config.dropout??0;
  const l2=config.l2??0;
  const patience=config.patience??5;
  const minDelta=config.minDelta??.01;

  if(
    !Number.isFinite(dropout)||dropout<0||dropout>=.8||
    !Number.isFinite(l2)||l2<0||l2>.1||
    !Number.isInteger(patience)||patience<1||patience>20||
    !Number.isFinite(minDelta)||minDelta<0||minDelta>1
  ){
    throw new Error("Revisa Dropout, L2, paciencia y mejora mínima.");
  }
}

export function recommendCNN(dataset:ImageDataset,current:Config) {
  const count=dataset.train.length;
  const classes=dataset.classes.length;

  if(count<1||classes<2){
    throw new Error("Aplica un dataset con entrenamiento y al menos dos clases.");
  }

  const filters=count<100?[8]:count<400?[8,16]:[16,32];

  const config:Config={
    size:[28,32,64,128].includes(current.size)?current.size:28,
    channels:[1,3].includes(current.channels)?current.channels:1,
    dense:count<100?16:count<400?32:64,
    layers:filters.map((value,index)=>({
      id:`auto-${index}`,
      filters:value,
      kernel:3,
      pool:true,
      activation:"relu",
    })),
    dropout:count<100?.4:count<400?.35:.25,
    l2:count<400?.001:.0001,
    earlyStopping:true,
    patience:5,
    minDelta:.01,
  };

  if(config.size>64&&count<400)config.size=32;

  const counts=dataset.classes.map(label=>
    dataset.train.filter(index=>dataset.images[index].label===label).length
  );

  return {
    config,
    epochs:count<100?40:60,
    count,
    minimumClass:Math.min(...counts),
    reason:`${count} imágenes de entrenamiento y ${classes} clases: se propone una CNN de ${filters.length} bloques para limitar su complejidad. Es una heurística editable, no una arquitectura óptima demostrada.`,
  };
}

export function advanceWithControls(jobs:Job[]):Job[] {
  const active=jobs.find(job=>
    job.status!=="Completado"&&job.status!=="Cancelado"
  );
  if(!active)return jobs;

  return jobs.map((job):Job=>{
    if(job.id!==active.id)return job;
    if(job.status==="En cola")return {...job,status:"Preparando"};
    if(job.status==="Preparando")return {...job,status:"Ejecutando"};

    const epoch=Math.min(job.epoch+1,job.epochs);
    const baseline=1/job.dataset.classes.length;

    const metric={
      epoch,
      accuracy:.96-(.96-baseline)*Math.exp(-epoch/7),
      valAccuracy:.91-(.91-baseline)*Math.exp(-epoch/8),
      loss:.13+1.25*Math.exp(-epoch/7),
      valLoss:.2+1.3*Math.exp(-epoch/8),
    };

    const improved=
      job.bestValLoss===undefined||
      job.bestValLoss-metric.valLoss>(job.config.minDelta??.01);

    const stale=improved?0:(job.staleEpochs??0)+1;
    const stoppedEarly=Boolean(
      job.config.earlyStopping&&
      stale>=(job.config.patience??5)&&
      epoch<job.epochs
    );
    const done=stoppedEarly||epoch===job.epochs;

    return {
      ...job,
      epoch,
      status:done?"Completado":"Ejecutando",
      metrics:[...job.metrics,metric],
      bestEpoch:improved?epoch:job.bestEpoch,
      bestValLoss:improved?metric.valLoss:job.bestValLoss,
      staleEpochs:stale,
      stoppedEarly,
      stopReason:done
        ? stoppedEarly
          ? "Parada temprana: sin mejora significativa en validación."
          : "Máximo de épocas alcanzado."
        : undefined,
    };
  });
}
