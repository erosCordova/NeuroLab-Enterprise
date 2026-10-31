import {test} from "node:test";
import assert from "node:assert/strict";
import * as tf from "@tensorflow/tfjs";
import {gzipSync} from "node:zlib";
import {MNIST_REPOSITORY,FASHION_REPOSITORY,FASHION_LABELS_ES,isFashionDataset,classNamesForSource,validateIdxSourceUrl,validateMnistUrl,parseIdxImages,parseIdxLabels,selectMnistIndices,partitionMnist} from "../src/mnistDataset.ts";
import {makeMnistBatches} from "../src/mnistTrain.ts";
import {augmentMnistPixels,mnistInferenceViews} from "../src/mnistRobust.ts";
import {fashionDomainIssue,isFashionMnistClassifier,PredictionDomainError} from "../src/fashionDomain.ts";
test("MNIST: valida el repositorio y rechaza dominios arbitrarios",()=>{
  assert.equal(validateMnistUrl(MNIST_REPOSITORY),MNIST_REPOSITORY);
  assert.equal(validateMnistUrl("https://storage.googleapis.com/cvdf-datasets/mnist"),MNIST_REPOSITORY);
  assert.throws(()=>validateMnistUrl("https://example.com/file.gz"),/únicamente/);
});
test("MNIST: valida IDX big endian, dimensiones y etiquetas",()=>{
  const images=new Uint8Array(16+2*784),header=new DataView(images.buffer);
  header.setUint32(0,2051,false);header.setUint32(4,2,false);
  header.setUint32(8,28,false);header.setUint32(12,28,false);
  images[16]=255;images[16+784]=128;
  const pixels=parseIdxImages(images,2);
  assert.equal(pixels.length,1568);
  assert.equal(pixels[0],255);
  assert.equal(pixels[784],128);
  const labels=new Uint8Array(10),lv=new DataView(labels.buffer);
  lv.setUint32(0,2049,false);lv.setUint32(4,2,false);labels[8]=7;labels[9]=0;
  assert.deepEqual([...parseIdxLabels(labels,2)],[7,0]);
  labels[8]=10;
  assert.throws(()=>parseIdxLabels(labels,2),/0 y 9/);
  images[0]=1;
  assert.throws(()=>parseIdxImages(images,2),/encabezado/);
  assert.ok(gzipSync(images).length>0);
});
test("MNIST: selección equilibrada por clase y modo completo sin truncar dígitos",()=>{
  const labels=new Uint8Array(1000);
  for(let i=0;i<1000;i++)labels[i]=Math.floor(i/100);
  const a=selectMnistIndices(labels,100,42);
  assert.equal(a.length,100);
  assert.deepEqual(a,selectMnistIndices(labels,100,42));
  assert.equal(new Set(a).size,100);
  const byDigit=Array.from({length:10},(_,d)=>a.filter(i=>labels[i]===d).length);
  assert.deepEqual(byDigit,Array(10).fill(10));
  const all=selectMnistIndices(labels,1000,42);
  assert.equal(all.length,1000);
  assert.equal(new Set(all).size,1000);
  const data={kind:"mnist-idx",source:MNIST_REPOSITORY,
    trainPixels:new Uint8Array(1000*784),trainLabels:labels,
    testPixels:new Uint8Array(80*784),testLabels:new Uint8Array(80),limit:1000};
  const p=partitionMnist(data);
  assert.deepEqual([p.train.length,p.validation.length,p.test.length],[900,100,80]);
  assert.equal(new Set([...p.train,...p.validation]).size,1000);
});
test("MNIST: mini-batch crea solo tensores del lote y con etiquetas one-hot",async()=>{
  await tf.ready();
  const px=new Uint8Array(20*784),labels=new Uint8Array(20);
  labels[0]=4;px[0]=255;labels[1]=9;
  const before=tf.memory().numTensors;
  const dataset=makeMnistBatches(px,labels,[0,1,2,3,4,5],{size:28,channels:1},2);
  const iterator=await dataset.iterator();
  const first=await iterator.next();
  assert.equal(first.done,false);
  assert.deepEqual(first.value.xs.shape,[2,28,28,1]);
  assert.deepEqual(first.value.ys.shape,[2,10]);
  assert.equal((await first.value.xs.data())[0],1);
  assert.equal((await first.value.ys.data())[4],1);
  assert.equal((await first.value.ys.data())[19],1);
  first.value.xs.dispose();first.value.ys.dispose();
  assert.ok(tf.memory().numTensors-before<=1);
});

test("MNIST: variantes de inferencia preservan la imagen original y no modifican los pesos",()=>{
 const data=new Float32Array(784);data[13*28+12]=1;
 const views=mnistInferenceViews(data);
 assert.equal(views.length,5);
 assert.deepEqual(views[0],data);
 for(const view of views)assert.ok(view.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 assert.equal(data[13*28+12],1);
});
test("MNIST: aumentos del entrenamiento preservan dimensión y normalización",()=>{
 const data=new Float32Array(784);data[12*28+14]=1;
 let i=0;const random=()=>[.2,.8,.1,.4,.7,.6][(i++)%6];
 const out=augmentMnistPixels(data,random);
 assert.equal(out.length,784);
 assert.ok(out.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 assert.ok(out.reduce((a,b)=>a+b,0)>0);
 assert.equal(data[12*28+14],1);
});


test("Fashion-MNIST: origen oficial, clases en español y aislamiento frente a dígitos",()=>{
  assert.equal(validateIdxSourceUrl(FASHION_REPOSITORY),FASHION_REPOSITORY);
  assert.equal(validateIdxSourceUrl(FASHION_REPOSITORY+"/tree/master"),FASHION_REPOSITORY);
  assert.equal(validateIdxSourceUrl(MNIST_REPOSITORY),MNIST_REPOSITORY);
  assert.equal(isFashionDataset(FASHION_REPOSITORY),true);
  assert.equal(isFashionDataset(MNIST_REPOSITORY),false);
  assert.deepEqual(classNamesForSource(FASHION_REPOSITORY),[...FASHION_LABELS_ES]);
  assert.deepEqual(classNamesForSource(MNIST_REPOSITORY),Array.from({length:10},(_,i)=>String(i)));
  assert.equal(classNamesForSource(FASHION_REPOSITORY)[7],"Zapatilla");
  assert.equal(classNamesForSource(FASHION_REPOSITORY)[8],"Bolso");
  assert.throws(()=>validateIdxSourceUrl("https://untrusted.example.org/labels.gz"),/únicamente/);
});

test("Fashion-MNIST: no confunde fotografía de camiseta con muestra oficial",()=>{
  assert.equal(isFashionMnistClassifier([...FASHION_LABELS_ES]),true);
  assert.equal(isFashionMnistClassifier(Array.from({length:10},(_,i)=>String(i))),false);
  assert.match(fashionDomainIssue(800,800),/28 × 28/);
  const gray=new Uint8ClampedArray(28*28*4);
  for(let i=0;i<gray.length;i+=4){gray[i]=gray[i+1]=gray[i+2]=0;gray[i+3]=255;}
  for(let y=6;y<22;y++)for(let x=6;x<22;x++){
    const offset=(y*28+x)*4;gray[offset]=gray[offset+1]=gray[offset+2]=190;
  }
  assert.equal(fashionDomainIssue(28,28,gray),null);
  const colorful=new Uint8ClampedArray(gray);
  for(let y=7;y<19;y++)for(let x=7;x<19;x++){
    const offset=(y*28+x)*4;colorful[offset]=240;colorful[offset+1]=20;colorful[offset+2]=10;
  }
  assert.match(fashionDomainIssue(28,28,colorful),/colores/);
  const white=new Uint8ClampedArray(gray);
  for(let y=0;y<28;y++)for(let x=0;x<28;x++){
    const corner=(x<5||x>=23)&&(y<5||y>=23);
    if(corner){const i=(y*28+x)*4;white[i]=white[i+1]=white[i+2]=255;}
  }
  assert.match(fashionDomainIssue(28,28,white),/fondo/);
  assert.equal(new PredictionDomainError("Foto no compatible").name,"PredictionDomainError");
});
