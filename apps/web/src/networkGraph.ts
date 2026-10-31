import type {Config} from "./cnn.ts";
import {summary} from "./cnn.ts";

export type GraphStage={
  key:string;label:string;shape:string;units:number;
  mode:"pixels"|"channels"|"groups"|"neurons"|"probabilities";
};
export function graphStages(config:Config,classCount:number):GraphStage[]{
  const info=summary(config,classCount);
  let spatial=config.size;
  const result:GraphStage[]=[{key:"input",label:"ENTRADA",shape:config.size+" × "+config.size+" × "+config.channels,units:config.size*config.size*config.channels,mode:"pixels"}];
  config.layers.forEach((layer,i)=>{
    result.push({key:"conv-"+(i+1),label:"CONV2D "+(i+1),shape:spatial+" × "+spatial+" × "+layer.filters,units:layer.filters,mode:"channels"});
    if(layer.pool){
      spatial=Math.floor(spatial/2);
      result.push({key:"pool-"+(i+1),label:"MAXPOOL "+(i+1),shape:spatial+" × "+spatial+" × "+layer.filters,units:layer.filters,mode:"channels"});
    }
  });
  result.push({key:"flatten",label:"FLATTEN",shape:info.flattened+" valores",units:info.flattened,mode:"groups"});
  result.push({key:"dense",label:"DENSE",shape:config.dense+" neuronas",units:config.dense,mode:"neurons"});
  if(config.dropout)result.push({key:"dropout",label:"DROPOUT",shape:config.dense+" neuronas",units:config.dense,mode:"neurons"});
  result.push({key:"output",label:"SALIDA",shape:classCount+" clases",units:classCount,mode:"probabilities"});
  return result;
}
/** Muestra representativa de neuronas, nunca se confunde con el total real. */
export function visibleNodeCount(stage:GraphStage){
  return stage.mode==="probabilities"?Math.min(10,Math.max(2,stage.units)):Math.min(9,Math.max(3,stage.units));
}
export function graphNodePosition(column:number,index:number,total:number){
  if(total<1||index<0||index>=total||column<0)throw new Error("Índice de neurona no válido.");
  return {x:85+column*146,y:111+(total===1?93:index*186/(total-1))};
}
export function graphCanvasWidth(columns:number){
  return Math.max(900,170+Math.max(0,columns-1)*146);
}
