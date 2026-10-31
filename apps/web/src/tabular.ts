/** Importación tabular segura: CSV/TSV con comillas RFC-4180, sin enviar datos a servidores. */
export type PredictionTask="binary"|"multiclass"|"regression";
export type TabularDataset={
  name:string;source:string;headers:string[];rows:string[][];
  target:string;task:PredictionTask;automatic:boolean;createdAt:number;
};
export type TabularPlan={task:PredictionTask;activation:"sigmoid"|"softmax"|"linear";
  loss:"binaryCrossentropy"|"categoricalCrossentropy"|"meanSquaredError";
  classes:string[];numeric:string[];categorical:string[];validRows:number};
export function parseTable(text:string,name:string,source="Archivo local"):TabularDataset{
  if(text.length>12*1024*1024)throw new Error("El archivo supera el límite de 12 MB.");
  const value=text.replace(/^\uFEFF/,"");
  const firstLine=value.split(/\r?\n/,1)[0]??"";
  const separator=["\t",";",","].map(char=>({char,count:firstLine.split(char).length-1}))
    .sort((a,b)=>b.count-a.count)[0];
  if(!separator||separator.count===0)throw new Error("No se detectaron columnas separadas por coma, punto y coma o tabulador.");
  const data:string[][]=[];
  let row:string[]=[],cell="",quoted=false;
  for(let i=0;i<value.length;i++){
    const ch=value[i];
    if(ch==='"'){
      if(quoted&&value[i+1]==='"'){cell+='"';i++;}
      else if(quoted||!cell){quoted=!quoted;}
      else cell+=ch;
    }else if(ch===separator.char&&!quoted){row.push(cell.trim());cell="";}
    else if((ch==="\n"||ch==="\r")&&!quoted){
      if(ch==="\r"&&value[i+1]==="\n")i++;
      row.push(cell.trim());cell="";
      if(row.some(v=>v!==""))data.push(row);
      if(data.length>15001)throw new Error("Máximo de análisis: 15.000 registros por archivo.");
      row=[];
    }else cell+=ch;
  }
  if(quoted)throw new Error("El CSV contiene comillas sin cerrar.");
  row.push(cell.trim());if(row.some(v=>v!==""))data.push(row);
  if(data.length<11)throw new Error("El dataset necesita encabezados y al menos diez filas.");
  const headers=data[0].map(h=>h.replace(/^\uFEFF/,"").trim());
  if(headers.length<2||headers.length>80||headers.some(h=>!h)||new Set(headers).size!==headers.length)
    throw new Error("Se requieren entre 2 y 80 columnas con encabezados únicos.");
  const rows=data.slice(1);
  if(rows.some(r=>r.length!==headers.length))throw new Error("Hay filas con una cantidad de columnas distinta a la cabecera.");
  const preference=/^(target|label|class|clase|categoria|categoría|objetivo|resultado|y|churn|species|diagnosis|survived|price|precio|ventas|sales)$/i;
  const target=headers.findLast(h=>preference.test(h))??headers.at(-1)!;
  const dataset={name:name.replace(/\.(csv|tsv|txt)$/i,""),source,headers,rows,
    target,task:"binary" as PredictionTask,automatic:true,createdAt:Date.now()};
  return {...dataset,task:inferTask(dataset,target)};
}
export function inferTask(dataset:Pick<TabularDataset,"headers"|"rows">,target:string):PredictionTask{
  const column=dataset.headers.indexOf(target);
  if(column<0)throw new Error("Elige una columna objetivo válida.");
  const labels=dataset.rows.map(row=>row[column]).filter(s=>s!=="");
  if(labels.length<10)throw new Error("No hay suficientes valores en la columna objetivo.");
  const unique=[...new Set(labels)];
  const numeric=labels.every(v=>Number.isFinite(Number(v)));
  if(!numeric&&unique.length>20)return "multiclass";
  if(numeric){
    const values=unique.map(Number);
    const integers=values.every(Number.isInteger);
    const isCategory=/^(class|clase|category|categoria|categoría|label|target|outcome|result|resultado|survived|churn|diagnosis)$/i.test(target);
    if(unique.length>20||(!isCategory&&(!integers||unique.length>10||unique.length>Math.max(3,labels.length*.08))))
      return "regression";
  }
  return unique.length===2?"binary":"multiclass";
}
export function profileTable(dataset:TabularDataset):TabularPlan{
  const index=dataset.headers.indexOf(dataset.target);
  if(index<0)throw new Error("Selecciona una variable objetivo.");
  const valid=dataset.rows.filter(row=>row[index]!=="");
  if(valid.length<10)throw new Error("La variable objetivo necesita al menos diez valores.");
  const classes=dataset.task==="regression"?[]:[...new Set(valid.map(row=>row[index]))].sort((a,b)=>a.localeCompare(b,"es",{numeric:true}));
  if(dataset.task==="binary"&&classes.length!==2)throw new Error("La clasificación binaria requiere exactamente dos clases.");
  if(dataset.task==="multiclass"&&(classes.length<3||classes.length>20))
    throw new Error("La clasificación multiclase admite entre 3 y 20 clases.");
  if(dataset.task==="regression"&&!valid.every(row=>Number.isFinite(Number(row[index]))))
    throw new Error("Regresión requiere una variable objetivo numérica.");
  const numeric:string[]=[],categorical:string[]=[];
  for(let i=0;i<dataset.headers.length;i++)if(i!==index){
    const nonEmpty=valid.map(row=>row[i]).filter(v=>v!=="");
    if(nonEmpty.length&&nonEmpty.every(v=>Number.isFinite(Number(v))))numeric.push(dataset.headers[i]);
    else categorical.push(dataset.headers[i]);
  }
  if(!numeric.length&&!categorical.length)throw new Error("No se encontraron columnas de entrada.");
  return {task:dataset.task,
    activation:dataset.task==="regression"?"linear":dataset.task==="binary"?"sigmoid":"softmax",
    loss:dataset.task==="regression"?"meanSquaredError":dataset.task==="binary"?"binaryCrossentropy":"categoricalCrossentropy",
    classes,numeric,categorical,validRows:valid.length};
}
export function canonicalTableUrl(url:string):URL{
  let parsed:URL;
  try{parsed=new URL(url);}catch{throw new Error("Introduce una URL válida.");}
  if(parsed.protocol!=="https:"||parsed.username||parsed.password)throw new Error("Usa un enlace público HTTPS sin credenciales.");
  // Enlaces públicos de GitHub a CSV/TSV se sirven desde la URL de contenido crudo.
  if(parsed.hostname==="github.com"){
    const match=parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if(!match)throw new Error("En GitHub, copia el enlace al archivo CSV, no al repositorio completo.");
    parsed=new URL("https://raw.githubusercontent.com/"+match.slice(1).map(encodeURI).join("/"));
  }
  if(/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|::1|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(parsed.hostname)||
     !parsed.hostname.includes("."))throw new Error("Solo se admiten enlaces públicos.");
  return parsed;
}
export async function fetchPublicTable(url:string,signal:AbortSignal):Promise<TabularDataset>{
  const parsed=canonicalTableUrl(url);
  let response:Response;
  try{response=await fetch(parsed.href,{mode:"cors",credentials:"omit",signal});}
  catch(cause){if(signal.aborted)throw cause;throw new Error("No se pudo importar la URL. El servidor debe permitir descargas desde otras páginas (CORS).");}
  if(!response.ok)throw new Error("La descarga devolvió HTTP "+response.status+".");
  const size=Number(response.headers.get("content-length")||0);
  if(size>12*1024*1024)throw new Error("El archivo supera 12 MB.");
  const limit=12*1024*1024;
  const parts:Uint8Array[]=[],reader=response.body?.getReader();
  let total=0;
  if(reader){
    try{
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        total+=value.byteLength;
        if(total>limit)throw new Error("El archivo supera 12 MB.");
        parts.push(value);
      }
    }catch(cause){await reader.cancel().catch(()=>{});throw cause;}
  }else{
    const all=new Uint8Array(await response.arrayBuffer());
    if(all.byteLength>limit)throw new Error("El archivo supera 12 MB.");
    parts.push(all);total=all.byteLength;
  }
  const bytes=new Uint8Array(total);let offset=0;
  for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  const content=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
  const name=parsed.pathname.split("/").pop()||"Dataset web";
  return parseTable(content,name,parsed.origin);
}
