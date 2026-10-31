import {test} from "node:test";
import assert from "node:assert/strict";
import * as tf from "@tensorflow/tfjs";
import {gzipSync} from "node:zlib";
import {MNIST_REPOSITORY,validateMnistUrl,parseIdxImages,parseIdxLabels,selectMnistIndices,partitionMnist} from "../src/mnistDataset.ts";
import {makeMnistBatches} from "../src/mnistTrain.ts";
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
