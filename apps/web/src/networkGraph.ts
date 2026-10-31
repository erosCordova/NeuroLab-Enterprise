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

/** Rutas cortas y estables para pulsos animados visibles, aun antes de medir activaciones. */
export type GraphEnergyRoute={key:string;column:number;path:string;duration:number;delay:number};
export function graphEnergyRoutes(stages:readonly GraphStage[]):GraphEnergyRoute[]{
  const routes:GraphEnergyRoute[]=[];
  for(let column=0;column<stages.length-1;column++){
    const left=visibleNodeCount(stages[column]),right=visibleNodeCount(stages[column+1]);
    for(let lane=0;lane<4;lane++){
      const fromIndex=Math.round((lane+.5)*(left-1)/4);
      const toIndex=Math.round((((lane*3+1)%4)+.5)*(right-1)/4);
      const start=graphNodePosition(column,fromIndex,left);
      const end=graphNodePosition(column+1,toIndex,right);
      routes.push({
        key:column+"-"+lane,column,
        path:"M "+(start.x+9)+" "+start.y+" L "+(end.x-9)+" "+end.y,
        duration:1.55+.12*(lane%3)+.12*(column%3),
        delay:.21*(column+lane),
      });
    }
  }
  return routes;
}

/** La animación visible depende exclusivamente de una ejecución de entrenamiento activa. */
export function shouldAnimateGraph(working:boolean,motion:boolean):boolean{
  return working&&motion;
}
