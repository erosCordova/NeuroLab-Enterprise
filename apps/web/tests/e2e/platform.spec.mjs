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
async function create(page,name){
 await page.getByLabel('Nuevo proyecto CNN',{exact:true}).fill(name);
 await page.getByLabel('Descripción del problema',{exact:true}).fill('Proyecto persistente para dígitos.');
 await page.getByRole('button',{name:'Crear proyecto',exact:true}).click();
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
 await create(page,'No debe guardarse');
 await expect(page.getByRole('region',{name:'Editor del proyecto',exact:true}).getByRole('alert')).toContainText('Servidor temporalmente');
 await expect(page.getByRole('article',{name:'Proyecto No debe guardarse',exact:true})).toHaveCount(0);
 await page.unroute('**/api/v1/projects');await page.reload();await projects(page);
 await expect(page.getByRole('article',{name:'Proyecto No debe guardarse',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
 await register(page);
 await expect(page.getByRole('heading',{name:'Tu primer proyecto CNN',exact:true})).toBeVisible();
});
