import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultConfig} from '../src/cnn.ts';
import {describeRun,compareRuns,comparisonCSV,epochCSV} from '../src/evaluation.ts';
function job(id='J1',fingerprint='a'.repeat(64)) {
 return {id,projectId:'P1',name:'=Proyecto',config:{...defaultConfig(),earlyStopping:true},
 dataset:{name:'Imágenes',count:6,classes:['A','B'],train:2,validation:2,test:2,seed:42,fingerprint},
 versionId:null,epochs:10,batch:2,epoch:2,status:'Completado',stoppedEarly:true,bestEpoch:1,
 metrics:[{epoch:1,accuracy:.7,valAccuracy:.6,loss:.7,valLoss:.5},{epoch:2,accuracy:.8,valAccuracy:.7,loss:.6,valLoss:.495}]};
}
test('Evaluación: distingue mínimo observado y referencia de parada temprana',()=>{
 const result=describeRun(job());assert.equal(result.minimumValidationEpoch,2);
 assert.equal(result.epochsExecuted,2);assert.equal(result.epochsConfigured,10);
 assert.equal(result.minimumValidationLoss,.495);assert.ok(Math.abs(result.accuracyGap-.1)<1e-9);
});
test('Evaluación: devuelve copias independientes de configuración, dataset y métricas',()=>{
 const original=job();const result=describeRun(original);
 result.configuration.layers[0].filters=99;result.dataset.classes.push('C');result.final.valLoss=5;
 assert.equal(original.config.layers[0].filters,16);assert.equal(original.dataset.classes.length,2);assert.equal(original.metrics[1].valLoss,.495);
});
test('Evaluación: rechaza ejecuciones canceladas, incompletas o con métricas inválidas',()=>{
 for(const changes of [{status:'Cancelado'},{metrics:[]},{dataset:{...job().dataset,fingerprint:undefined}}])assert.throws(()=>describeRun({...job(),...changes}));
 const invalid=job();invalid.metrics[0].accuracy=NaN;assert.throws(()=>describeRun(invalid));
});
test('Comparación: limita selecciones, exige identidades y un único proyecto',()=>{
 const jobs=['A','B','C','D'].map(id=>job(id));
 for(const ids of [[],['A','A'],['X'],['A','B','C','D']])assert.throws(()=>compareRuns(jobs,ids));
 jobs[1].projectId='P2';assert.throws(()=>compareRuns(jobs,['A','B']));
});
test('Comparación: detecta datasets distintos y marca los datos simulados',()=>{
 const jobs=[job('A'),job('B','b'.repeat(64))];
 const result=compareRuns(jobs,['A','B']);assert.equal(result.sameDataset,false);assert.equal(result.simulated,true);
 assert.equal(result.containsPredictions,false);assert.equal(result.containsModelWeights,false);
 assert.equal(compareRuns([job('A'),job('B')],['A','B']).sameDataset,true);
});
test('Exportaciones: conservan épocas reales y neutralizan fórmulas CSV',()=>{
 const j=job();const csv=comparisonCSV([j],[j.id]);assert.match(csv,/'=Proyecto/);
 assert.match(csv,/"10","2","Si"/);const epochs=epochCSV(j);
 assert.equal(epochs.split('\r\n').length,3);assert.match(epochs,/CNN_SIMULADA/);
});
