import * as tf from "@tensorflow/tfjs";
import type {Config} from "./cnn.ts";

/** Una medición de inferencia con UNA imagen fija de validación: no son pesos ni gradientes. */
export type LayerActivity={
  key:string;label:string;shape:string;units:number;
  magnitude:number;preview:number[];mode:"channels"|"neurons"|"groups"|"probabilities"|"pixels";
};
export type NetworkTrace={
  epoch:number;sampleLabel:string;predictedLabel:string;
  confidence:number;layers:LayerActivity[];pixels:number[];
};
export function summarizeLayer(values:ArrayLike<number>,shape:readonly number[],kind:LayerActivity["mode"],limit=12){
  const spatial=shape.length===4?shape[1]*shape[2]:1;
  const units=shape.length===4?shape[3]:shape[shape.length-1];
  if(!units||!spatial||values.length!==units*spatial)throw new Error("Dimensión de activación inválida.");
  const magnitude=Array.from(values,v=>Math.abs(Number.isFinite(v)?v:0)).reduce((a,b)=>a+b,0)/values.length;
  const preview:number[]=[];
  if(kind==="channels"){
    for(let c=0;c<Math.min(units,limit);c++){
      let sum=0;
      for(let p=0;p<spatial;p++)sum+=Math.abs(values[p*units+c]);
      preview.push(sum/spatial);
    }
  }else if(kind==="groups"){
    const count=Math.min(units,limit);
    for(let g=0;g<count;g++){
      const start=Math.floor(g*units/count),end=Math.floor((g+1)*units/count);
      let sum=0;for(let p=start;p<end;p++)sum+=Math.abs(values[p]);
      preview.push(sum/(end-start));
    }
  }else for(let i=0;i<Math.min(units,limit);i++)preview.push(values[i]);
  return {units,magnitude,preview};
}
export function captureNetworkTrace(model:tf.LayersModel,sample:tf.Tensor4D,config:Config,
  classes:string[],epoch:number,sampleLabel:string):NetworkTrace{
  if(sample.shape[0]!==1)throw new Error("La inspección usa una imagen.");
  return tf.tidy(()=>{
    const original=sample.dataSync(),pixels:number[]=[];
    const size=config.size,channels=config.channels;
    for(let y=0;y<14;y++)for(let x=0;x<14;x++){
      const y0=Math.floor(y*size/14),y1=Math.max(y0+1,Math.floor((y+1)*size/14));
      const x0=Math.floor(x*size/14),x1=Math.max(x0+1,Math.floor((x+1)*size/14));
      let sum=0,n=0;
      for(let row=y0;row<y1;row++)for(let col=x0;col<x1;col++)
        for(let c=0;c<channels;c++){sum+=original[(row*size+col)*channels+c];n++;}
      pixels.push(Math.min(1,Math.max(0,sum/n)));
    }
    const layers:LayerActivity[]=[{
      key:"input",label:"ENTRADA",shape:size+" × "+size+" × "+channels,units:channels,
      magnitude:summarizeLayer(original,[1,size,size,channels],"channels").magnitude,
      preview:[],mode:"pixels",
    }];
    let output:tf.Tensor=sample,conv=0;
    for(const layer of model.layers){
      output=layer.apply(output,{training:false}) as tf.Tensor;
      const cls=layer.getClassName();
      let key="",label="",mode:LayerActivity["mode"]="neurons";
      if(cls==="Conv2D"){conv++;key="conv-"+conv;label="CONV2D "+conv;mode="channels";}
      else if(cls==="MaxPooling2D"){key="pool-"+conv;label="MAXPOOL "+conv;mode="channels";}
      else if(cls==="Flatten"){key="flatten";label="FLATTEN";mode="groups";}
      else if(cls==="Dropout"){key="dropout";label="DROPOUT";}
      else if(cls==="Dense"){
        const last=layer===model.layers[model.layers.length-1];
        key=last?"output":"dense";label=last?"SALIDA":"DENSE";mode=last?"probabilities":"neurons";
      }else continue;
      const values=output.dataSync();
      const summary=summarizeLayer(values,output.shape,mode,mode==="probabilities"?classes.length:12);
      layers.push({key,label,shape:output.shape.slice(1).join(" × "),units:summary.units,
        magnitude:summary.magnitude,preview:summary.preview,mode});
    }
    const raw=Array.from(output.dataSync());
    const probabilities=classes.length===2?[1-raw[0],raw[0]]:raw;
    if(probabilities.length!==classes.length)throw new Error("La salida no coincide con las etiquetas.");
    const best=probabilities.reduce((j,v,i)=>v>probabilities[j]?i:j,0);
    const last=layers.find(l=>l.key==="output");
    if(last){last.preview=probabilities;last.units=classes.length;}
    return {epoch,sampleLabel,predictedLabel:classes[best],confidence:probabilities[best],
      layers,pixels};
  });
}
