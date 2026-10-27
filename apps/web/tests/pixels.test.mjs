import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizePixels} from "../src/pixels.ts";

test("Normaliza negro y blanco al intervalo 0-1",()=>{
  const pixels=new Uint8ClampedArray([0,0,0,255,255,255,255,255]);
  const result=normalizePixels(pixels,2,1,1);
  assert.deepEqual([...result.values],[0,1]);
  assert.equal(result.minimum,0);
  assert.equal(result.maximum,1);
  assert.equal(result.mean,.5);
});

test("Conserva tres canales RGB en orden HWC",()=>{
  const result=normalizePixels(new Uint8ClampedArray([255,0,0,255]),1,1,3);
  assert.deepEqual([...result.values],[1,0,0]);
  assert.equal(result.values.length,3);
});

test("Compone transparencia sobre fondo negro sin modificar la entrada",()=>{
  const pixels=new Uint8ClampedArray([255,255,255,0]);
  const before=new Uint8ClampedArray(pixels);
  const result=normalizePixels(pixels,1,1,3);
  assert.deepEqual([...result.values],[0,0,0]);
  assert.deepEqual(pixels,before);
});

test("Rechaza dimensiones, canales y longitud de datos inválidos",()=>{
  const pixels=new Uint8ClampedArray([0,0,0,255]);
  assert.throws(()=>normalizePixels(pixels,0,1,1));
  assert.throws(()=>normalizePixels(pixels,1,1,2));
  assert.throws(()=>normalizePixels(pixels,2,2,1));
});
