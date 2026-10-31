import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultConfig,advanceJobs} from '../src/cnn.ts';
import {repeatRun,cancelRun,filterRuns,historyCSV,elapsedSeconds} from '../src/trainingHistory.ts';
function source(){return {id:'J1',projectId:'P1',name:'=Ejemplo',config:defaultConfig(),dataset:{name:'Imágenes',count:6,classes:['A','B'],train:2,validation:2,test:2,seed:42,fingerprint:'a'.repeat(64)},versionId:'V1',epochs:1,batch:2,epoch:0,status:'Cancelado',metrics:[],createdAt:'2026-10-29T10:00:00Z',endedAt:'2026-10-29T10:00:03Z'};}
test('Repetición: crea identidad nueva, reinicia progreso y conserva origen',()=>{
 const original=source();const repeated=repeatRun(original,'J2','2026-10-29T11:00:00Z');
 assert.equal(repeated.repeatedFrom,'J1');assert.equal(repeated.epoch,0);assert.equal(repeated.status,'En cola');
 assert.equal(repeated.endedAt,undefined);assert.deepEqual(repeated.metrics,[]);assert.equal(repeated.versionId,'V1');
 repeated.config.layers[0].filters=99;repeated.dataset.classes.push('C');
 assert.equal(original.config.layers[0].filters,16);assert.equal(original.dataset.classes.length,2);assert.equal(original.status,'Cancelado');
});
test('Repetición: rechaza trabajos activos, identidad repetida y configuración inválida',()=>{
 const original=source();assert.throws(()=>repeatRun({...original,status:'Ejecutando'},'J2',original.createdAt));
 assert.throws(()=>repeatRun(original,'J1',original.createdAt));assert.throws(()=>repeatRun(original,'J2','fecha inválida'));
 assert.throws(()=>repeatRun({...original,epochs:0},'J2',original.createdAt));
});
test('Cancelación: conserva estado terminal y fecha final',()=>{
 const original=source();assert.equal(cancelRun(original,'2026-10-30T10:00:00Z'),original);
 const running={...original,status:'Ejecutando',endedAt:undefined};const result=cancelRun(running,'2026-10-29T10:00:05Z');
 assert.equal(result.status,'Cancelado');assert.equal(result.endedAt,'2026-10-29T10:00:05Z');assert.equal(running.status,'Ejecutando');
});
test('Historial: filtros, duración y CSV no inventan métricas finales',()=>{
 const job={...source(),startedAt:'2026-10-29T10:00:01Z'};
 assert.equal(elapsedSeconds(job),2);assert.equal(elapsedSeconds(source()),null);
 assert.equal(filterRuns([job],'imágenes','Cancelado').length,1);assert.equal(filterRuns([job],'J1','Completado').length,0);
 const csv=historyCSV([job]);assert.match(csv,/'=Ejemplo/);assert.match(csv,/CNN_SIMULADA/);assert.doesNotMatch(csv,/precision_validacion/);
});
test('Cola: registra inicio y fin y no modifica trabajos terminales',()=>{
 let jobs=[repeatRun(source(),'J2','2026-10-29T11:00:00Z')];
 for(let i=0;i<3;i++)jobs=advanceJobs(jobs);
 assert.equal(jobs[0].status,'Completado');assert.ok(jobs[0].startedAt);assert.ok(jobs[0].endedAt);
 assert.equal(advanceJobs(jobs)[0],jobs[0]);
});
