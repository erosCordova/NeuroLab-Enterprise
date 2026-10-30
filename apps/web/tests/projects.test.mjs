import {test} from 'node:test';
import assert from 'node:assert/strict';
import {saveProject,filterProjects} from '../src/projects.ts';
const draft={name:'Proyecto CNN',description:'Dígitos',status:'Activo',tags:'MNIST, cnn, CNN'};
test('Proyectos: normaliza nombres y etiquetas sin mutar la lista',()=>{
 const source=[];const result=saveProject(source,{...draft,name:'  Proyecto   CNN  '},'P1');
 assert.equal(source.length,0);assert.equal(result[0].name,'Proyecto CNN');
 assert.deepEqual(result[0].tags,['MNIST','CNN']);
});
test('Proyectos: evita duplicados por mayúsculas, espacios y Unicode',()=>{
 const source=saveProject([],{...draft,name:'Análisis CNN'},'P1');
 assert.throws(()=>saveProject(source,{...draft,name:' ana\u0301lisis   cnn '},'P2'));
 assert.equal(saveProject(source,{...draft,name:'Análisis CNN'},'P1').length,1);
});
test('Proyectos: editar conserva identidad y otros proyectos',()=>{
 const source=saveProject(saveProject([],draft,'P1'),{...draft,name:'Otro CNN'},'P2');
 const result=saveProject(source,{...draft,name:'Nuevo nombre',status:'Archivado'},'P1');
 assert.equal(result[0].id,'P1');assert.equal(result[0].status,'Archivado');
 assert.equal(source[0].name,'Proyecto CNN');assert.deepEqual(result[1],source[1]);
});
test('Proyectos: rechaza nombres, estados y etiquetas fuera de límites',()=>{
 for(const changes of [{name:'a'},{name:'a'.repeat(81)},{description:'a'.repeat(1001)},{status:'Inválido'},{tags:'a,b,c,d,e,f,g'},{tags:'a'.repeat(25)}]){
  assert.throws(()=>saveProject([],{...draft,...changes},'P1'));
 }
});
test('Proyectos: combina búsqueda por descripción o etiqueta y estado',()=>{
 const source=saveProject(saveProject([],draft,'P1'),{...draft,name:'Otro CNN',status:'Archivado',tags:'animales',description:'Mascotas'},'P2');
 assert.equal(filterProjects(source,'mnist','Activo')[0].id,'P1');
 assert.equal(filterProjects(source,'mascotas','Archivado')[0].id,'P2');
 assert.equal(filterProjects(source,'mnist','Archivado').length,0);
 assert.equal(source.length,2);
});
