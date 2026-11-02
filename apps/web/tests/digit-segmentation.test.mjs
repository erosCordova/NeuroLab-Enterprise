import {test} from "node:test";
import assert from "node:assert/strict";
import {segmentDigitsFromGray,normalizeDigitCrop} from "../src/digitSegmentation.ts";

function canvas(width=180,height=110){
 const gray=new Float32Array(width*height).fill(.94);
 const line=(x1,y1,x2,y2)=>{
   const steps=Math.ceil(Math.hypot(x2-x1,y2-y1)*2);
   for(let p=0;p<=steps;p++){
     const x=Math.round(x1+(x2-x1)*p/steps),y=Math.round(y1+(y2-y1)*p/steps);
     for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)
       if(Math.hypot(dx,dy)<=2&&x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height)
         gray[(y+dy)*width+x+dx]=.08;
   }
 };
 return {gray,line,width,height};
}
test("Separación por regiones y filas conserva el orden natural",()=>{
 const s=canvas();
 s.line(20,15,28,45);s.line(28,45,43,22);
 s.line(87,13,99,48);s.line(99,48,110,18);
 s.line(35,72,45,96);s.line(45,96,57,73);
 const regions=segmentDigitsFromGray(s.gray,s.width,s.height);
 assert.equal(regions.length,3,"Cada línea dibujada debe ser un dígito.");
 assert.deepEqual(regions.map(r=>r.box.row),[1,1,2]);
 assert.ok(regions[0].box.x<regions[1].box.x);
 assert.ok(regions[0].pixels.every(v=>v>=0&&v<=1));
 assert.ok(regions.every(r=>r.pixels.length===784));
});
test("Fotografía con fondos grises y trazos claros invertidos produce recortes",()=>{
 const s=canvas(100,100);s.gray.fill(.05);s.line(28,18,28,77);
 for(let y=18;y<=77;y++)for(let x=26;x<=30;x++)s.gray[y*100+x]=.95;
 const regions=segmentDigitsFromGray(s.gray,100,100);
 assert.equal(regions.length,1);
 assert.ok(regions[0].pixels.reduce((a,b)=>a+b,0)>3);
});
test("Recorte manual se centra y no debe estar vacío",()=>{
 const pixels=new Float32Array(10*40);
 for(let y=2;y<37;y++)pixels[y*10+5]=1;
 const r=normalizeDigitCrop(pixels,10,40);
 assert.equal(r.length,784);
 assert.ok(r.reduce((a,b)=>a+b,0)>5);
 assert.throws(()=>normalizeDigitCrop(new Float32Array(5),2,2),/inválido/);
});

test("Las líneas finas mantienen intensidad y continuidad después del recorte",()=>{
 const width=70,height=90,gray=new Float32Array(width*height).fill(.68);
 for(let y=12;y<74;y++)for(let dx=-1;dx<=1;dx++)gray[y*width+35+dx]=.19;
 const result=segmentDigitsFromGray(gray,width,height);
 assert.equal(result.length,1);
 const active=Array.from(result[0].pixels).filter(v=>v>.22);
 assert.ok(active.length>18,"La tinta debe sobrevivir al escalado: "+active.length);
 assert.ok(Math.max(...active)<1,"No debe saturarse artificialmente");
});

test("Una imagen MNIST con márgenes grandes se recorta antes de normalizar",()=>{
 const src=new Float32Array(784);
 for(let y=4;y<24;y++)src[y*28+13]=.8;
 const output=normalizeDigitCrop(src,28,28);
 assert.equal(output.length,784);
 assert.ok(output.reduce((sum,x)=>sum+x,0)>5);
 // La altura del trazo debe seguir siendo de unos 20 píxeles, no 14.
 const rows=[];for(let y=0;y<28;y++)if(output.slice(y*28,(y+1)*28).some(x=>x>.1))rows.push(y);
 assert.ok(rows.length>=18);
});
