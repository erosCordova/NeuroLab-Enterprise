import {test} from "node:test";
import assert from "node:assert/strict";
import {defaultConfig} from "../src/cnn.ts";
import {graphStages,graphNodePosition,visibleNodeCount,graphCanvasWidth,graphEnergyRoutes,shouldAnimateGraph} from "../src/networkGraph.ts";

test("Grafo neuronal reproduce el flujo de conv, pooling, dense y salida real",()=>{
  const config=defaultConfig();
  const layers=graphStages(config,10);
  assert.deepEqual(layers.map(stage=>stage.key),["input","conv-1","pool-1","conv-2","pool-2","flatten","dense","output"]);
  assert.equal(layers[0].shape,"28 × 28 × 1");
  assert.equal(layers[4].shape,"7 × 7 × 32");
  assert.equal(layers[7].units,10);
  assert.equal(visibleNodeCount(layers[7]),10);
  assert.equal(visibleNodeCount(layers[5]),9);
  assert.ok(graphCanvasWidth(layers.length)>900);
  const left=graphNodePosition(0,0,visibleNodeCount(layers[0]));
  const right=graphNodePosition(1,0,visibleNodeCount(layers[1]));
  assert.ok(right.x>left.x);
});
test("El grafo cambia según arquitectura manual, incluido Dropout y binario",()=>{
  const config=defaultConfig();config.dropout=.25;config.layers[0].pool=false;
  const stages=graphStages(config,2);
  assert.equal(stages.some(s=>s.key==="pool-1"),false);
  assert.ok(stages.some(s=>s.key==="dropout"));
  assert.equal(stages.at(-1).shape,"2 clases");
  assert.throws(()=>graphNodePosition(0,5,3),/no válido/);
});

test("La animación tiene rutas válidas antes de existir métricas o trazas",()=>{
  const stages=graphStages(defaultConfig(),10);
  const first=graphEnergyRoutes(stages);
  assert.equal(first.length,4*(stages.length-1));
  assert.deepEqual(graphEnergyRoutes(stages),first);
  for(const route of first){
    assert.match(route.path,/^M [0-9]+ [0-9]+ L [0-9]+ [0-9]+$/);
    assert.ok(route.duration>=1&&route.duration<=2.5);
    assert.ok(route.delay>=0);
  }
});
test("Las rutas se adaptan también a capas manuales y conjuntos binarios",()=>{
  const config=defaultConfig();
  config.layers[1].pool=false;
  const stages=graphStages(config,2);
  assert.equal(graphEnergyRoutes(stages).length,4*(stages.length-1));
  assert.ok(graphEnergyRoutes(stages).every(route=>!route.path.includes("NaN")));
});

test("La animación solo se activa al iniciar Entrenar CNN y se detiene al finalizar o cancelar",()=>{
  assert.equal(shouldAnimateGraph(false,true),false,"Antes de pulsar Entrenar CNN");
  assert.equal(shouldAnimateGraph(true,true),true,"Entrenamiento iniciado aun sin traza");
  assert.equal(shouldAnimateGraph(true,false),false,"Pausa manual durante entrenamiento");
  assert.equal(shouldAnimateGraph(false,false),false,"Finalización o cancelación");
});
