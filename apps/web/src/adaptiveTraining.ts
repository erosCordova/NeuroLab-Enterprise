import type { Config, ImageDataset } from "./cnn";

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
