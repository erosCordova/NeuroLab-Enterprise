import {test} from "node:test";
import assert from "node:assert/strict";
import {datasetManifest,exportDataset} from "../src/datasetExport.ts";
import {fingerprintDataset,sha256} from "../src/integrity.ts";

async function fixture(){
  const images=[];
  for(let i=0;i<6;i++){
    const file=new File([String(i)],`imagen_${i}.png`);
    images.push({file,label:i<3?"A":"B",width:28,height:28,checksum:await sha256(await file.arrayBuffer())});
  }
  const data={name:"ejemplo",images,classes:["A","B"],train:[0,3],validation:[1,4],test:[2,5],seed:42};
  data.fingerprint=await fingerprintDataset(data);
  return data;
}
test("Exporta bytes originales y manifiesto con particiones",async()=>{
  const data=await fixture();
  const files=new Map();
  function directory(prefix=""){
    return {
      getDirectoryHandle:async name=>directory(prefix+name+"/"),
      getFileHandle:async name=>({
        createWritable:async()=>{
          let content;
          return {
            write:async value=>{content=value;},
            close:async()=>{files.set(prefix+name,content);}
          };
        }
      })
    };
  }
  const result=await exportDataset(data,directory());
  assert.equal(result.total,6);
  assert.equal(files.size,8);
  const manifest=[...files.entries()].find(([name])=>name.endsWith("dataset.neurolab.json"))[1];
  assert.equal(JSON.parse(manifest).split.train.length,2);
  const image=[...files.entries()].find(([name])=>name.endsWith("imagen_0.png"))[1];
  assert.equal(await image.text(),"0");
});
test("No exporta metadatos sin identidad ni rutas repetidas",async()=>{
  const data=await fixture();
  assert.throws(()=>datasetManifest({...data,fingerprint:""}));
  data.images[1].file=data.images[0].file;
  assert.throws(()=>datasetManifest(data));
});
