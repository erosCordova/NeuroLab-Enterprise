import {test} from "node:test";
import assert from "node:assert/strict";
import {photoStorageKey,validatePhotoDataset,PHOTO_BACKBONE} from "../src/photoTransfer.ts";

function fixture(){
  const classes=["Camiseta","Bolso"];
  const images=Array.from({length:40},(_,i)=>({label:i<20?"Camiseta":"Bolso"}));
  const train=[...Array.from({length:14},(_,i)=>i),...Array.from({length:14},(_,i)=>i+20)];
  const validation=[14,15,16,34,35,36],test=[17,18,19,37,38,39];
  return {fingerprint:"b".repeat(64),name:"Fotos",classes,images,train,validation,test,seed:42};
}
test("Fotografía: dataset real estratificado es apto para entrenamiento",()=>{
  assert.doesNotThrow(()=>validatePhotoDataset(fixture()));
  assert.match(PHOTO_BACKBONE,/MobileNet/);
  assert.notEqual(photoStorageKey("usuario-A","proyecto"),photoStorageKey("usuario-B","proyecto"));
});
test("Fotografía: impide errores de partición, clases insuficientes y pérdida de identidad",()=>{
  const d=fixture();
  assert.throws(()=>validatePhotoDataset({...d,test:[...d.test,0]}),/particiones/);
  assert.throws(()=>validatePhotoDataset({...d,fingerprint:""}),/dataset/);
  assert.throws(()=>validatePhotoDataset({...d,train:[0,20],validation:d.validation,test:d.test}),/particiones/);
  const small={...d,train:[...d.train],test:[...d.test]};
  small.train.splice(0,8);small.test.push(...Array.from({length:8},(_,i)=>i));
  assert.throws(()=>validatePhotoDataset(small),/8 fotos/);
});
