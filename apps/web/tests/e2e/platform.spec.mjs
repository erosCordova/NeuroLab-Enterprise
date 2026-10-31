import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
async function register(page){
 const email=`${randomUUID()}@example.com`,password='NeuroLab-Prueba-2026';
 await page.goto('/');
 await page.getByRole('button',{name:'Crear una cuenta',exact:true}).click();
 await page.getByLabel('Nombre',{exact:true}).fill('Eros de prueba');
 await page.getByLabel('Correo electrónico',{exact:true}).fill(email);
 await page.getByLabel('Contraseña',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Crear mi cuenta',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Tu primer proyecto CNN',exact:true})).toBeVisible();
 return {email,password};
}
async function create(page,name,expectSuccess=true){
 await page.getByLabel('Nuevo proyecto CNN',{exact:true}).fill(name);
 await page.getByLabel('Descripción del problema',{exact:true}).fill('Proyecto persistente para dígitos.');
 await page.getByRole('button',{name:'Crear proyecto',exact:true}).click();
 if(expectSuccess)await expect(page.getByRole('heading',{name:'Dashboard',level:1,exact:true})).toBeVisible();
}
async function projects(page){await page.getByRole('navigation').getByRole('button',{name:'Proyectos',exact:true}).click();}

test('Plataforma: React guarda en PostgreSQL y recupera proyectos tras recargar y volver a entrar',async({page})=>{
 const account=await register(page);
 await create(page,'MNIST persistente');
 await expect(page.getByRole('heading',{name:'Dashboard',level:1,exact:true})).toBeVisible();
 await projects(page);
 await expect(page.getByRole('article',{name:'Proyecto MNIST persistente',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Editar proyecto MNIST persistente',exact:true}).click();
 await page.getByLabel('Nombre del proyecto',{exact:true}).fill('MNIST actualizado');
 await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
 await expect(page.getByRole('article',{name:'Proyecto MNIST actualizado',exact:true})).toBeVisible();
 await page.reload();await projects(page);
 await expect(page.getByRole('article',{name:'Proyecto MNIST actualizado',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Iniciar sesión',exact:true})).toBeVisible();
 await page.getByLabel('Correo electrónico',{exact:true}).fill(account.email);
 await page.getByLabel('Contraseña',{exact:true}).fill(account.password);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await projects(page);
 await expect(page.getByRole('article',{name:'Proyecto MNIST actualizado',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByRole('heading',{name:'Iniciar sesión',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});

test('Plataforma: un guardado fallido no crea proyectos falsos y una cuenta distinta no ve datos ajenos',async({page})=>{
 await register(page);await create(page,'Proyecto privado');await projects(page);
 await page.route('**/api/v1/projects',async route=>{
  if(route.request().method()==='POST')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Servidor temporalmente no disponible.'})});
  else await route.continue();
 });
 await create(page,'No debe guardarse',false);
 await expect(page.getByRole('region',{name:'Editor del proyecto',exact:true}).getByRole('alert')).toContainText('Servidor temporalmente');
 await expect(page.getByRole('article',{name:'Proyecto No debe guardarse',exact:true})).toHaveCount(0);
 await page.unroute('**/api/v1/projects');await page.reload();await projects(page);
 await expect(page.getByRole('article',{name:'Proyecto No debe guardarse',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
 await register(page);
 await expect(page.getByRole('heading',{name:'Tu primer proyecto CNN',exact:true})).toBeVisible();
});


test('Plataforma: registro de modelos reales editable y persistente',async({page})=>{
 await register(page);
 await create(page,'Proyecto registro CNN');
 const saved=await page.evaluate(async()=>{
  const projects=await (await fetch("/api/v1/projects",{credentials:"include"})).json();
  const owned=projects.find(item=>item.name==="Proyecto registro CNN");
  const report={
   training:"real",engine:"TensorFlow.js",dataset_fingerprint:"b".repeat(64),
   classes:["cero","uno"],samples:{train:8,validation:2,test:2},
   config:{size:28,channels:1,dense:8,layers:[{filters:4,kernel:3,pool:true,activation:"relu"}]},
   parameters:6329,requested_epochs:1,completed_epochs:1,batch:4,seed:42,
   metrics:[{epoch:1,accuracy:.5,valAccuracy:.5,loss:.8,valLoss:.8}],
   test:{accuracy:.5,loss:.8},weights_file:"model.json",
   model_ref:"indexeddb://neurolab-cnn-"+owned.id+"-"+crypto.randomUUID(),
  };
  const res=await fetch("/api/v1/projects/"+owned.id+"/real-runs",{
   method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},
   body:JSON.stringify(report),
  });
  return res.status;
 });
 expect(saved).toBe(201);
 await page.getByRole("navigation").getByRole("button",{name:"Modelos",exact:true}).click();
 const registry=page.getByRole("region",{name:"Registro de modelos CNN reales"});
 await expect(registry).toBeVisible();
 await registry.getByLabel("Nombre del modelo real").fill("Clasificador CNN A");
 await registry.getByRole("button",{name:"Registrar modelo real"}).click();
 await expect(registry.getByRole("article",{name:"Modelo real Clasificador CNN A"})).toBeVisible();
 await registry.getByLabel("Editar nombre del modelo real").fill("Clasificador CNN revisado");
 await registry.getByLabel("Observación del modelo real").fill("Notas de revisión");
 await registry.getByRole("button",{name:"Guardar ficha real"}).click();
 await expect(registry.getByRole("heading",{name:"Ficha: Clasificador CNN revisado"})).toBeVisible();
 await registry.getByRole("button",{name:"Marcar favorito"}).click();
 await registry.getByLabel("Filtrar modelos reales").selectOption("Favoritos");
 await expect(registry.getByRole("article",{name:"Modelo real Clasificador CNN revisado"})).toBeVisible();
 await registry.getByRole("button",{name:"Archivar ficha"}).click();
 await registry.getByLabel("Filtrar modelos reales").selectOption("Archivados");
 await expect(registry.getByRole("article",{name:"Modelo real Clasificador CNN revisado"})).toBeVisible();
 await page.reload();
 await page.getByRole("navigation").getByRole("button",{name:"Modelos",exact:true}).click();
 const again=page.getByRole("region",{name:"Registro de modelos CNN reales"});
 await expect(again.getByRole("article",{name:"Modelo real Clasificador CNN revisado"})).toBeVisible();
 await page.getByRole("button",{name:"Cerrar sesión"}).click();
 await register(page);
 await expect(page.getByRole("heading",{name:"Tu primer proyecto CNN"})).toBeVisible();
});


test('Plataforma: comparación CNN real guardada y exportable sin simulaciones',async({page})=>{
 await register(page);
 await create(page,'Proyecto evaluación CNN');
 const inserted=await page.evaluate(async()=>{
  const projects=await (await fetch('/api/v1/projects',{credentials:'include'})).json();
  const project=projects.find(p=>p.name==='Proyecto evaluación CNN');
  const template={
   training:'real',engine:'TensorFlow.js',dataset_fingerprint:'a'.repeat(64),
   classes:['cero','uno'],samples:{train:8,validation:2,test:2},
   config:{size:28,channels:1,dense:8,layers:[{filters:4,kernel:3,pool:true,activation:'relu'}]},
   parameters:6329,requested_epochs:2,completed_epochs:2,
   batch:4,seed:42,
   metrics:[
    {epoch:1,accuracy:.5,valAccuracy:.5,loss:.9,valLoss:.9},
    {epoch:2,accuracy:.75,valAccuracy:.5,loss:.6,valLoss:.7},
   ],
   test:{accuracy:.5,loss:.7},weights_file:'model.json',
  };
  const responses=[];
  for(let i=0;i<2;i++){
   const body={...template,
    test:{accuracy:i===0?.55:.75,loss:i===0?.7:.5},
    model_ref:'indexeddb://neurolab-cnn-'+project.id+'-'+crypto.randomUUID()};
   const r=await fetch('/api/v1/projects/'+project.id+'/real-runs',{
    method:'POST',credentials:'include',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   responses.push({status:r.status,data:await r.json()});
  }
  return responses;
 });
 expect(inserted.map(x=>x.status)).toEqual([201,201]);
 const ids=inserted.map(x=>x.data.id);
 await page.getByRole('navigation').getByRole('button',{name:'Evaluación',exact:true}).click();
 const panel=page.getByRole('region',{name:'Evaluación de CNN reales'});
 await expect(panel).toBeVisible();
 for(const id of ids)await panel.getByLabel('Comparar entrenamiento real '+id).check();
 await expect(panel.getByRole('status').filter({hasText:/Condiciones declaradas compatibles/})).toBeVisible();
 await expect(panel.getByText(/Mayor precisión de prueba declarada/)).toBeVisible();
 const csvEvent=page.waitForEvent('download');
 await panel.getByRole('button',{name:'Exportar comparación real CSV'}).click();
 const csvFile=await csvEvent;
 expect(csvFile.suggestedFilename()).toBe('neurolab-comparacion-cnn-real.csv');
 const jsonEvent=page.waitForEvent('download');
 await panel.getByRole('button',{name:'Exportar comparación real JSON'}).click();
 const jsonFile=await jsonEvent;
 const content=await jsonFile.createReadStream();
 const chunks=[];for await(const part of content)chunks.push(part);
 const parsed=JSON.parse(Buffer.concat(chunks).toString());
 expect(parsed.simulated).toBe(false);
 expect(parsed.server_verified).toBe(false);
 expect(parsed.highest_reported_test_accuracy_id).toBe(ids[1]);
 const epochsEvent=page.waitForEvent('download');
 await panel.getByRole('button',{name:'Exportar épocas reales CSV'}).click();
 expect((await epochsEvent).suggestedFilename()).toBe('neurolab-metricas-cnn-real.csv');
 await page.reload();
 await page.getByRole('navigation').getByRole('button',{name:'Evaluación',exact:true}).click();
 await expect(page.getByRole('region',{name:'Evaluación de CNN reales'}).getByLabel('Comparar entrenamiento real '+ids[0])).toBeVisible();
});


test('Plataforma: Dashboard e informe CNN real exportan resultados sin pesos',async({page})=>{
 await register(page);await create(page,'Proyecto informe CNN');
 const code=await page.evaluate(async()=>{
  const projects=await (await fetch('/api/v1/projects',{credentials:'include'})).json();
  const project=projects.find(p=>p.name==='Proyecto informe CNN');
  const report={
   training:'real',engine:'TensorFlow.js',dataset_fingerprint:'a'.repeat(64),
   classes:['cero','uno'],samples:{train:8,validation:2,test:2},
   config:{size:28,channels:1,dense:8,layers:[{filters:4,kernel:3,pool:true,activation:'relu'}]},
   parameters:6329,requested_epochs:1,completed_epochs:1,batch:4,seed:42,
   metrics:[{epoch:1,accuracy:.75,valAccuracy:.5,loss:.6,valLoss:.7}],
   test:{accuracy:.75,loss:.6},weights_file:'model.json',
   model_ref:'indexeddb://neurolab-cnn-'+project.id+'-'+crypto.randomUUID(),
  };
  const response=await fetch('/api/v1/projects/'+project.id+'/real-runs',{
   method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
   body:JSON.stringify(report)});
  return response.status;
 });
 expect(code).toBe(201);
 await page.getByRole('navigation').getByRole('button',{name:'Dashboard',exact:true}).click();
 const dash=page.getByRole('region',{name:'Indicadores CNN reales del proyecto'});
 await dash.getByRole('button',{name:'Actualizar indicadores'}).click();
 await expect(dash.locator('.project-report-kpi').last().getByText('75.0%')).toBeVisible();
 await page.getByRole('navigation').getByRole('button',{name:'Reportes',exact:true}).click();
 const panel=page.getByRole('region',{name:'Informe profesional de CNN reales'});
 await expect(panel).toBeVisible();
 await expect(panel.getByRole('table',{name:'Tabla del informe CNN real'}).locator('tbody tr')).toHaveCount(1);
 await expect(panel.getByText(/no verificadas independientemente/)).toBeVisible();
 const event=page.waitForEvent('download');
 await panel.getByRole('button',{name:'Exportar informe real JSON'}).click();
 const file=await event;
 expect(file.suggestedFilename()).toBe('neurolab-informe-cnn-real.json');
 const stream=await file.createReadStream();
 const chunks=[];for await(const chunk of stream)chunks.push(chunk);
 const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 expect(result.simulated).toBe(false);
 expect(result.server_verified).toBe(false);
 expect(result.totals.runs).toBe(1);
 expect(JSON.stringify(result)).not.toContain('indexeddb://');
 const csvEvent=page.waitForEvent('download');
 await panel.getByRole('button',{name:'Exportar informe real CSV'}).click();
 expect((await csvEvent).suggestedFilename()).toBe('neurolab-informe-cnn-real.csv');
 await page.reload();
 await page.getByRole('navigation').getByRole('button',{name:'Reportes',exact:true}).click();
 await expect(page.getByRole('region',{name:'Informe profesional de CNN reales'}).getByRole('table',{name:'Tabla del informe CNN real'}).locator('tbody tr')).toHaveCount(1);
});


test('Plataforma: eliminar proyecto es seguro, persiste y permite eliminar el último',async({page})=>{
  await register(page);
  await create(page,'MNIST temporal');
  await projects(page);
  await page.getByLabel('Nuevo proyecto CNN',{exact:true}).fill('Proyecto que conservar');
  await page.getByRole('button',{name:'Crear proyecto',exact:true}).click();
  const name='MNIST temporal';
  await page.getByRole('button',{name:'Eliminar proyecto '+name}).click();
  const dialog=page.getByRole('alertdialog',{name:'Confirmar eliminación de '+name});
  await expect(dialog.getByRole('button',{name:'Eliminar definitivamente'})).toBeDisabled();
  await dialog.getByRole('textbox',{name:'Escribe el nombre del proyecto para eliminarlo'}).fill(name);
  await dialog.getByRole('button',{name:'Eliminar definitivamente'}).click();
  await expect(page.getByRole('article',{name:'Proyecto '+name})).toHaveCount(0);
  await expect(page.getByRole('article',{name:'Proyecto Proyecto que conservar'})).toBeVisible();
  await page.reload();
  await projects(page);
  await expect(page.getByRole('article',{name:'Proyecto '+name})).toHaveCount(0);
  await page.getByRole('button',{name:'Eliminar proyecto Proyecto que conservar'}).click();
  const last=page.getByRole('alertdialog',{name:'Confirmar eliminación de Proyecto que conservar'});
  await last.getByRole('textbox',{name:'Escribe el nombre del proyecto para eliminarlo'}).fill('Proyecto que conservar');
  await last.getByRole('button',{name:'Eliminar definitivamente'}).click();
  await expect(page.getByRole('heading',{name:'Tu primer proyecto CNN'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Tu primer proyecto CNN'})).toBeVisible();
});
