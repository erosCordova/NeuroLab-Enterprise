import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeMnistPixels} from "../src/mnistPreprocess.ts";

test("La imagen MNIST oficial mantiene sus píxeles",()=>{
 const raw=new Float32Array(784);raw[200]=1;
 assert.deepEqual(Array.from(normalizeMnistPixels(raw,28,28)),Array.from(raw));
});

test("MNIST oscuro sobre fondo blanco se invierte",()=>{
 const raw=new Float32Array(784).fill(1);raw[200]=0;
 const pixels=normalizeMnistPixels(raw,28,28);
 assert.equal(pixels[200],1);assert.equal(pixels[0],0);
});

test("Una imagen sin tinta no genera una predicción falsa",()=>{
 assert.throws(()=>normalizeMnistPixels(new Float32Array(10000).fill(.7),100,100),/contraste/);
});
