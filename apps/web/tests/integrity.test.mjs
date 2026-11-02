import {test} from "node:test";
import assert from "node:assert/strict";
import {
  sha256,rememberImage,fingerprintDataset
} from "../src/integrity.ts";

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
