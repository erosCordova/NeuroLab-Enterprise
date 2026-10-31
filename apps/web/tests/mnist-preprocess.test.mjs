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

test("Foto con fondo desigual y cifra grande: separa tinta y centra el dígito",()=>{
 const w=128,h=128,gray=new Float32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)gray[y*w+x]=.65+.13*x/w+.04*y/h;
 const paint=(x,y)=>{
   for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)
     if(Math.hypot(dx,dy)<=2&&x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)
       gray[(y+dy)*w+x+dx]=.25;
 };
 for(let i=0;i<=90;i++){
   const t=i/90;
   paint(Math.round(80-30*t),Math.round(20+57*t));
 }
 for(let i=0;i<150;i++){
   const a=i*Math.PI*2/150;
   paint(Math.round(62+19*Math.cos(a)),Math.round(82+17*Math.sin(a)));
 }
 gray[3*w+4]=0;
 const result=normalizeMnistPixels(gray,w,h);
 assert.equal(result.length,784);
 assert.ok(result.every(v=>v>=0&&v<=1));
 let sum=0,cx=0,cy=0,active=0;
 for(let i=0;i<784;i++){const v=result[i];sum+=v;cx+=(i%28)*v;cy+=Math.floor(i/28)*v;if(v>.2)active++;}
 assert.ok(sum>3);
 assert.ok(active>15&&active<260,"cantidad de trazo "+active);
 assert.ok(cx/sum>10&&cx/sum<17,"centrado horizontal");
 assert.ok(cy/sum>10&&cy/sum<17,"centrado vertical");
 assert.ok(result[0]<.05,"no confundir ruido de esquina con trazo");
});
