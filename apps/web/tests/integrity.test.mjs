import {test} from "node:test";
import assert from "node:assert/strict";
import {
  sha256,rememberImage,fingerprintDataset,validateCompletedJob
} from "../src/integrity.ts";
import {defaultConfig} from "../src/cnn.ts";

function dataset(){
  return {
    name:"imagenes",classes:["A","B"],seed:42,
    images:Array.from({length:6},(_,index)=>({
      file:new File(["imagen"],`archivo_${index}.png`),
      label:index<3?"A":"B",width:28,height:28,
      checksum:(index+1).toString(16).padStart(64,"0")
    })),
    train:[0,3],validation:[1,4],test:[2,5]
  };
}

test("SHA-256 produce una huella conocida",async()=>{
  assert.equal(
    await sha256(new TextEncoder().encode("abc").buffer),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

test("Bloquea archivos idénticos repetidos y etiquetas contradictorias",()=>{
  const seen=new Map();
  const hash="a".repeat(64);
  rememberImage(seen,hash,"primera.png","A");
  assert.throws(()=>rememberImage(seen,hash,"copia.png","A"),/idéntico repetido/);
  assert.throws(()=>rememberImage(seen,hash,"otra.png","B"),/clases diferentes/);
});

test("La identidad depende del contenido y particiones, no del nombre",async()=>{
  const data=dataset();
  const first=await fingerprintDataset(data);
  assert.match(first,/^[a-f0-9]{64}$/);
  assert.equal(first,await fingerprintDataset({...data,name:"otra carpeta"}));
  assert.notEqual(first,await fingerprintDataset({...data,seed:43}));
  assert.notEqual(first,await fingerprintDataset({...data,train:[1,3],validation:[0,4]}));
  const changed=dataset();
  changed.images[0].checksum="f".repeat(64);
  assert.notEqual(first,await fingerprintDataset(changed));
});

test("No identifica conjuntos sin huellas ni particiones válidas",async()=>{
  const data=dataset();
  data.images[0].checksum="";
  await assert.rejects(()=>fingerprintDataset(data));
  await assert.rejects(()=>fingerprintDataset({...dataset(),test:[1,5]}));
});

test("El registro requiere métricas completas e identidad del dataset",()=>{
  const job={
    id:"J1",projectId:"P1",name:"Prueba",config:defaultConfig(),
    dataset:{name:"imagenes",count:6,classes:["A","B"],train:2,validation:2,test:2,seed:42,fingerprint:"a".repeat(64)},
    versionId:null,epochs:1,batch:32,epoch:1,status:"Completado",
    metrics:[{epoch:1,loss:.4,valLoss:.5,accuracy:.8,valAccuracy:.7}]
  };
  assert.doesNotThrow(()=>validateCompletedJob(job));
  assert.throws(()=>validateCompletedJob({...job,status:"Cancelado"}));
  assert.throws(()=>validateCompletedJob({...job,metrics:[]}));
  assert.throws(()=>validateCompletedJob({...job,dataset:{...job.dataset,fingerprint:""}}));
  assert.throws(()=>validateCompletedJob({...job,metrics:[{...job.metrics[0],accuracy:1.2}]}));
});
