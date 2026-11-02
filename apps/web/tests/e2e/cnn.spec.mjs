import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createImageFixture } from "../fixtures/images.mjs";

const externalDataset = process.env.NEUROLAB_E2E_DATASET;
const datasetDirectory = externalDataset
  ? path.resolve(externalDataset)
  : fs.mkdtempSync(path.join(os.tmpdir(), "neurolab-cnn-e2e-"));

test.beforeAll(() => {
  if (!externalDataset) createImageFixture(datasetDirectory);
});
test.afterAll(() => {
  if (!externalDataset) fs.rmSync(datasetDirectory, {recursive:true,force:true});
});

async function navigate(page, name) {
  await page.getByRole("navigation").getByRole("button", {
    name, exact: true,
  }).click();

  await expect(page.getByRole("heading", {
    name, level: 1, exact: true,
  })).toBeVisible();
}

async function applyDataset(page) {
  await navigate(page, "Datasets");

  await page.getByLabel("Carpeta de imágenes", {
    exact: true,
  }).setInputFiles(datasetDirectory);

  await expect(page.getByRole("status").filter({
    hasText: "Se decodificaron 200 imágenes.",
  })).toBeVisible({ timeout: 20000 });

  await page.getByRole("button", {
    name: "Enviar dataset al proyecto",
    exact: true,
  }).click();

  await expect(page.getByRole("status").filter({
    hasText: "Dataset de imágenes validado y aplicado.",
  })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", {
    name: "Dashboard", level: 1, exact: true,
  })).toBeVisible();
});

test("Los módulos de la plataforma corresponden a funcionalidades reales", async ({ page }) => {
  for (const name of [
    "Dashboard", "Proyectos", "Diseñador CNN", "Datasets",
    "Entrenamientos", "Evaluación", "Modelos",
    "Fundamentos", "Reportes",
  ]) {
    await navigate(page, name);
  }

  await navigate(page, "Fundamentos");

  await expect(page.getByText(
    /\b(Feedforward|RNN|GAN)\b/
  )).toHaveCount(0);
});

test("Dataset de prueba: decodifica 200 imágenes y aplica las diez clases", async ({ page }) => {
  await applyDataset(page);

  const applied = page.getByRole("heading", {
    name: "Dataset aplicado", exact: true,
  }).locator("..");

  await expect(applied).toContainText("200 imágenes");
  await expect(applied).toContainText("10 clases");

  await expect(applied.getByText("140", { exact: true })).toBeVisible();
  await expect(applied.getByText("30", { exact: true })).toHaveCount(2);
  await expect(applied.locator("tbody tr")).toHaveCount(10);

  await navigate(page, "Diseñador CNN");

  await expect(page.getByText("softmax", {
    exact: true,
  })).toBeVisible();

  await expect(page.getByText("sparse_categorical_crossentropy", {
    exact: true,
  })).toBeVisible();

  await expect(page.locator(".properties dd").filter({
    hasText: /^26[.,\s]698$/,
  })).toBeVisible();
});

test("El diseñador CNN funciona en pantalla pequeña y con teclado", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const projects = page.getByRole("navigation").getByRole("button", {
    name: "Proyectos", exact: true,
  });

  await projects.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", {
    name: "Proyectos", level: 1, exact: true,
  })).toBeVisible();

  await applyDataset(page);
  await navigate(page, "Diseñador CNN");

  await expect(page.getByRole("button", {
    name: "Guardar versión CNN", exact: true,
  })).toBeVisible();

  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    candidates: [...document.querySelectorAll("body *")]
      .map(element => {
        const rect=element.getBoundingClientRect();
        return {
          tag:element.tagName,
          className:element.getAttribute("class"),
          left:Math.round(rect.left),
          right:Math.round(rect.right),
          width:Math.round(rect.width)
        };
      })
      .filter(item=>item.right>window.innerWidth+2 || item.left < -2)
      .slice(0,20)
  }));

  if(layout.document>layout.viewport+2){
    console.log("DIAGNOSTICO_ANCHO=" + JSON.stringify(layout,null,2));
    await test.info().attach("diagnostico-ancho",{
      body:Buffer.from(JSON.stringify(layout,null,2)),
      contentType:"application/json"
    });
  }

  expect(layout.document).toBeLessThanOrEqual(layout.viewport+2);
});

test("Explorador CNN: filtros, paginación, ampliación y exportación", async ({ page }) => {
  await applyDataset(page);

  const explorer=page.getByRole("region",{
    name:"Explorador de imágenes",exact:true
  });

  await expect(explorer).toBeVisible();
  await expect(explorer.getByRole("button",{
    name:/^Ampliar /
  })).toHaveCount(12);

  await explorer.getByLabel("Filtrar por clase",{
    exact:true
  }).selectOption("0");

  await expect(explorer.getByRole("status")).toHaveText("20 resultados");

  await explorer.getByRole("button",{
    name:"Página siguiente",exact:true
  }).click();

  await expect(explorer.getByText("Página 2 de 2",{
    exact:true
  })).toBeVisible();

  await expect(explorer.getByRole("button",{
    name:/^Ampliar /
  })).toHaveCount(8);

  await explorer.getByLabel("Filtrar por partición",{
    exact:true
  }).selectOption("validation");

  await expect(explorer.getByRole("status")).toHaveText("3 resultados");

  await explorer.getByRole("button",{
    name:/^Ampliar /
  }).first().click();

  const dialog=page.getByRole("dialog",{
    name:"Detalle de imagen",exact:true
  });

  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("28 × 28");
  await expect(dialog).toContainText("Validación");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await explorer.getByRole("button",{
    name:"Limpiar filtros",exact:true
  }).click();

  const firstName=fs.readdirSync(path.join(datasetDirectory,"0"))
    .filter(name=>name.endsWith(".png")).sort()[0];

  await explorer.getByLabel("Buscar imágenes",{
    exact:true
  }).fill(firstName);

  await expect(explorer.getByRole("status")).toHaveText("1 resultados");

  const downloadEvent=page.waitForEvent("download");

  await explorer.getByRole("button",{
    name:"Exportar inventario JSON",exact:true
  }).click();

  const file=await downloadEvent;
  const filePath=await file.path();
  expect(filePath).toBeTruthy();

  const inventory=JSON.parse(fs.readFileSync(filePath,"utf8"));
  expect(inventory.format).toBe("neurolab-image-inventory");
  expect(inventory.total).toBe(200);
  expect(inventory.files.length).toBe(200);
  expect(inventory.files.filter(image=>image.partition==="train").length).toBe(140);
  expect(inventory.files.filter(image=>image.partition==="validation").length).toBe(30);
  expect(inventory.files.filter(image=>image.partition==="test").length).toBe(30);

  await page.setViewportSize({width:390,height:844});

  expect(await page.evaluate(()=>
    document.documentElement.scrollWidth<=window.innerWidth+2
  )).toBe(true);
});

test("Preprocesamiento CNN: píxeles de imagen, normalización y exportación de tensor",async({page})=>{
  await applyDataset(page);

  const explorer=page.getByRole("region",{
    name:"Explorador de imágenes",exact:true
  });

  await explorer.getByRole("button",{name:/^Ampliar /}).first().click();

  const dialog=page.getByRole("dialog",{
    name:"Detalle de imagen",exact:true
  });

  const preview=dialog.getByRole("region",{
    name:"Preprocesamiento de la imagen",exact:true
  });

  await expect(preview).toBeVisible();
  await expect(preview.getByText("28 × 28 × 1",{exact:true})).toBeVisible();

  const firstDownload=page.waitForEvent("download");
  await preview.getByRole("button",{
    name:"Exportar tensor JSON",exact:true
  }).click();

  const firstFile=await firstDownload;
  const firstPath=await firstFile.path();
  expect(firstPath).toBeTruthy();

  const first=JSON.parse(fs.readFileSync(firstPath,"utf8"));
  expect(first.shape).toEqual([28,28,1]);
  expect(first.data.length).toBe(784);
  expect(first.containsPredictions).toBe(false);
  expect(first.data.every(value=>Number.isFinite(value)&&value>=0&&value<=1)).toBe(true);

  await page.keyboard.press("Escape");
  await navigate(page,"Diseñador CNN");

  await page.getByLabel("Modo de configuración CNN", {exact:true}).selectOption("manual");
  await page.getByLabel(/^Tamaño de entrada/).selectOption("32");
  await page.getByLabel(/^Canales/).selectOption("3");

  await navigate(page,"Datasets");

  await page.getByRole("region",{
    name:"Explorador de imágenes",exact:true
  }).getByRole("button",{name:/^Ampliar /}).first().click();

  const nextPreview=page.getByRole("dialog",{
    name:"Detalle de imagen",exact:true
  }).getByRole("region",{
    name:"Preprocesamiento de la imagen",exact:true
  });

  await expect(nextPreview.getByText("32 × 32 × 3",{exact:true})).toBeVisible();

  const nextDownload=page.waitForEvent("download");
  await nextPreview.getByRole("button",{
    name:"Exportar tensor JSON",exact:true
  }).click();

  const nextFile=await nextDownload;
  const nextPath=await nextFile.path();
  expect(nextPath).toBeTruthy();

  const next=JSON.parse(fs.readFileSync(nextPath,"utf8"));
  expect(next.shape).toEqual([32,32,3]);
  expect(next.data.length).toBe(3072);
  expect(next.data.every(value=>Number.isFinite(value)&&value>=0&&value<=1)).toBe(true);
});

test("Integridad CNN: huella reproducible y rechazo de archivos duplicados",async({page})=>{
  await applyDataset(page);

  async function inventory(){
    const event=page.waitForEvent("download");
    await page.getByRole("button",{
      name:"Exportar inventario JSON",exact:true
    }).click();
    const file=await event;
    const local=await file.path();
    expect(local).toBeTruthy();
    return JSON.parse(fs.readFileSync(local,"utf8"));
  }

  const first=await inventory();
  expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(first.files.every(image=>/^[a-f0-9]{64}$/.test(image.checksum))).toBe(true);

  await applyDataset(page);
  const second=await inventory();
  expect(second.fingerprint).toBe(first.fingerprint);

  const duplicateRoot=fs.mkdtempSync(
    path.join(path.resolve("../../runtime"),"cnn-duplicados-")
  );

  fs.mkdirSync(path.join(duplicateRoot,"0"));
  fs.mkdirSync(path.join(duplicateRoot,"1"));

  const zero=fs.readdirSync(path.join(datasetDirectory,"0"))
    .filter(name=>name.endsWith(".png")).sort()[0];

  fs.copyFileSync(path.join(datasetDirectory,"0",zero),path.join(duplicateRoot,"0","original.png"));
  fs.copyFileSync(path.join(datasetDirectory,"0",zero),path.join(duplicateRoot,"0","copia.png"));

  const ones=fs.readdirSync(path.join(datasetDirectory,"1"))
    .filter(name=>name.endsWith(".png")).sort().slice(0,3);

  ones.forEach((name,index)=>fs.copyFileSync(
    path.join(datasetDirectory,"1",name),
    path.join(duplicateRoot,"1",`imagen_${index}.png`)
  ));

  await page.getByLabel("Carpeta de imágenes",{
    exact:true
  }).setInputFiles(duplicateRoot);

  await expect(page.getByRole("alert").filter({hasText:"Archivo idéntico repetido"})).toBeVisible();

  const applied=page.getByRole("heading",{
    name:"Dataset aplicado",exact:true
  }).locator("..");

  await expect(applied).toContainText("200 imágenes");
});

test("CNN automática: propone capas y configuración de regularización",async({page})=>{
  await applyDataset(page);
  await navigate(page,"Diseñador CNN");

  const panel=page.getByRole("region",{
    name:"Configuración automática CNN",exact:true
  });

  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Dropout",{exact:true})).toHaveValue("0.35");
  await expect(panel.getByLabel("Regularización L2",{exact:true})).toHaveValue("0.001");
  await expect(panel.getByLabel("Activar parada temprana",{exact:true})).toBeChecked();
  await expect(page.getByLabel(/^Filtros · 1 a 128/).nth(0)).toHaveValue("8");
  await expect(page.getByLabel(/^Filtros · 1 a 128/).nth(1)).toHaveValue("16");
});

test("Exportación CNN: entrega imágenes originales y manifiesto al destino elegido",async({page})=>{
  await applyDataset(page);

  await page.evaluate(()=>{
    window.__cnnExport=[];
    function directory(prefix=""){
      return {
        getDirectoryHandle:async name=>directory(prefix+name+"/"),
        getFileHandle:async name=>({
          createWritable:async()=>{
            let payload;
            return {
              write:async data=>{
                if(typeof data==="string"){
                  payload={path:prefix+name,text:data};
                }else{
                  const bytes=await data.arrayBuffer();
                  const hash=await crypto.subtle.digest("SHA-256",bytes);
                  payload={
                    path:prefix+name,
                    bytes:bytes.byteLength,
                    checksum:[...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,"0")).join("")
                  };
                }
              },
              close:async()=>window.__cnnExport.push(payload),
              abort:async()=>{}
            };
          }
        })
      };
    }
    Object.defineProperty(window,"showDirectoryPicker",{
      configurable:true,
      value:async()=>directory()
    });
  });

  const transfer=page.getByRole("region",{
    name:"Exportación del dataset",exact:true
  });

  await transfer.getByRole("button",{
    name:"Exportar dataset completo",exact:true
  }).click();

  await expect(transfer.getByRole("status")).toContainText(
    "Dataset exportado: 200 imágenes."
  );

  const files=await page.evaluate(()=>window.__cnnExport);
  expect(files.length).toBe(202);

  const manifest=JSON.parse(
    files.find(file=>file.path.endsWith("/dataset.neurolab.json")).text
  );

  expect(manifest.total).toBe(200);
  expect(manifest.split.train.length).toBe(140);

  for(const image of manifest.images){
    const written=files.find(file=>file.path.endsWith("/"+image.path));
    expect(written).toBeTruthy();
    expect(written.bytes).toBe(image.bytes);
    expect(written.checksum).toBe(image.checksum);
  }
});


test("Modos CNN: automático predeterminado y ajustes manuales conservados", async ({page}) => {
  await applyDataset(page);
  await navigate(page,"Diseñador CNN");
  const mode=page.getByLabel("Modo de configuración CNN",{exact:true});
  const filters=page.getByLabel(/^Filtros · 1 a 128/).first();
  await expect(mode).toHaveValue("automatic");
  await expect(filters).toBeDisabled();
  await expect(page.getByLabel("Dropout",{exact:true})).toBeDisabled();
  await navigate(page,"Entrenamientos");
  await expect(page.getByLabel("Épocas",{exact:true})).toHaveValue("60");
  await expect(page.getByLabel("Épocas",{exact:true})).toBeDisabled();

  await navigate(page,"Diseñador CNN");
  await mode.selectOption("manual");
  await expect(filters).toBeEnabled();
  await filters.fill("24");
  await page.getByLabel("Dropout",{exact:true}).fill("0.2");
  await navigate(page,"Entrenamientos");
  await page.getByLabel("Épocas",{exact:true}).fill("7");

  await navigate(page,"Diseñador CNN");
  await mode.selectOption("automatic");
  await expect(filters).toHaveValue("8");
  await applyDataset(page);
  await navigate(page,"Diseñador CNN");
  await expect(mode).toHaveValue("automatic");
  await mode.selectOption("manual");
  await expect(filters).toHaveValue("24");
  await expect(page.getByLabel("Dropout",{exact:true})).toHaveValue("0.2");
  await navigate(page,"Entrenamientos");
  await expect(page.getByLabel("Épocas",{exact:true})).toHaveValue("7");
});

test("Modos CNN: cada proyecto conserva su selección y sus ajustes", async ({page}) => {
  await applyDataset(page);
  await navigate(page,"Diseñador CNN");
  await page.getByLabel("Modo de configuración CNN",{exact:true}).selectOption("manual");
  await page.getByLabel(/^Filtros · 1 a 128/).first().fill("24");
  await navigate(page,"Proyectos");
  await page.getByLabel("Nuevo proyecto CNN",{exact:true}).fill("Segundo proyecto CNN");
  await page.getByRole("button",{name:"Crear proyecto",exact:true}).click();
  await page.getByLabel("Proyecto activo",{exact:true}).selectOption({label:"Segundo proyecto CNN"});
  await applyDataset(page);
  await navigate(page,"Diseñador CNN");
  await expect(page.getByLabel("Modo de configuración CNN",{exact:true})).toHaveValue("automatic");
  await expect(page.getByLabel(/^Filtros · 1 a 128/).first()).toHaveValue("8");
  await page.getByLabel("Proyecto activo",{exact:true}).selectOption("CNN-001");
  await expect(page.getByLabel("Modo de configuración CNN",{exact:true})).toHaveValue("manual");
  await expect(page.getByLabel(/^Filtros · 1 a 128/).first()).toHaveValue("24");
});


test("Proyectos CNN: editar, filtrar, evitar duplicados y conservar arquitectura",async({page})=>{
  await applyDataset(page);
  await navigate(page,"Diseñador CNN");
  await page.getByLabel("Modo de configuración CNN",{exact:true}).selectOption("manual");
  await page.getByLabel(/^Filtros · 1 a 128/).first().fill("24");
  await navigate(page,"Proyectos");
  await page.getByRole("button",{name:"Editar proyecto Clasificación de imágenes",exact:true}).click();
  const editor=page.getByRole("region",{name:"Editor del proyecto",exact:true});
  await editor.getByLabel("Nombre del proyecto",{exact:true}).fill("Dígitos manuscritos");
  await editor.getByLabel("Descripción del problema",{exact:true}).fill("Clasificar los números del cero al nueve.");
  await editor.getByLabel("Etiquetas del proyecto",{exact:true}).fill("MNIST, dígitos");
  await editor.getByRole("button",{name:"Guardar cambios",exact:true}).click();
  await expect(page.getByLabel("Proyecto activo",{exact:true})).toHaveValue("CNN-001");
  await page.getByLabel("Buscar proyectos",{exact:true}).fill("MNIST");
  await expect(page.getByRole("article",{name:"Proyecto Dígitos manuscritos",exact:true})).toBeVisible();
  await page.getByLabel("Filtrar proyectos por estado",{exact:true}).selectOption("Archivado");
  await expect(page.getByRole("heading",{name:"No hay proyectos que coincidan",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Limpiar filtros de proyectos",exact:true}).click();
  await editor.getByLabel("Nuevo proyecto CNN",{exact:true}).fill("dígitos manuscritos");
  await editor.getByRole("button",{name:"Crear proyecto",exact:true}).click();
  await expect(editor.getByRole("alert")).toContainText("Ya existe un proyecto");
  await page.getByRole("article",{name:"Proyecto Dígitos manuscritos",exact:true}).getByRole("button",{name:"Abrir proyecto →",exact:true}).click();
  await expect(page.getByLabel(/^Filtros · 1 a 128/).first()).toHaveValue("24");
  await navigate(page,"Datasets");
  await expect(page.getByRole("heading",{name:"Dataset aplicado",exact:true}).locator("..")).toContainText("200 imágenes");
});

test("Entrenamiento CNN real: aprende en navegador y guarda pesos sin desplegar",async({page,browser})=>{
  test.setTimeout(120000);
  await applyDataset(page);
  await navigate(page,"Diseñador CNN");
  await page.getByLabel("Modo de configuración CNN",{exact:true}).selectOption("manual");
  await page.getByRole("button",{name:"Eliminar bloque"}).last().click();
  await page.getByLabel(/^Filtros · 1 a 128/).first().fill("2");
  await page.getByRole("spinbutton",{name:"Unidades Dense"}).fill("8");
  await navigate(page,"Entrenamientos");
  const trainer=page.getByRole("region",{name:"Entrenamiento CNN real en navegador"});
  await expect(trainer.getByRole("button",{name:"Entrenar CNN real"})).toBeVisible();
  await trainer.getByLabel("Épocas de entrenamiento real").fill("1");
  await trainer.getByLabel("Batch del entrenamiento real").fill("8");
  await trainer.getByRole("button",{name:"Entrenar CNN real"}).click();
  await expect(trainer.getByText(/Pesos guardados en IndexedDB/)).toBeVisible({timeout:100000});
  await expect(trainer.getByRole("img",{name:"Precisión real medida en cada época"})).toBeVisible();
  await expect(trainer.getByRole("img",{name:"Pérdida real medida en cada época"})).toBeVisible();
  await expect(trainer.getByRole("button",{name:"Exportar informe JSON de entrenamiento real"})).toBeVisible();
  const graph=trainer.getByRole("region",{name:"Visualización animada de la arquitectura CNN"});
  await expect(graph.getByText("Época 1",{exact:true})).toBeVisible();
  await expect(graph.getByText(/Original:/)).toBeVisible();
  await graph.getByRole("button",{name:"Examinar capa CONV2D 1"}).click();
  await expect(graph.locator(".nl-selected-name")).toHaveText("CONV2D 1");
  await trainer.getByRole("button",{name:"Inspeccionar modelo guardado"}).click();
  await expect(trainer.getByText("Modelo inspeccionado.")).toBeVisible({timeout:30000});
  await expect(graph.getByText("Época 1",{exact:true})).toBeVisible();

  // Respaldo portable de un solo archivo; restauración en un navegador limpio.
  const downloadEvent=page.waitForEvent("download");
  await trainer.getByRole("button",{name:"Descargar respaldo CNN"}).click();
  const download=await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/\.ncnn$/);
  const backupPath=await download.path();
  const backup=fs.readFileSync(backupPath);
  expect(backup.subarray(0,8).toString("utf8")).toBe("NLCNN001");
  expect(backup.byteLength).toBeGreaterThan(1000);

  const isolated=await browser.newContext();
  try{
    const other=await isolated.newPage();
    await other.goto("/");
    await navigate(other,"Entrenamientos");
    const restored=other.getByRole("region",{name:"Entrenamiento CNN real en navegador"});
    await restored.getByLabel("Restaurar modelo CNN desde respaldo").setInputFiles(backupPath);
    await expect(restored.getByText(/Modelo CNN restaurado con integridad verificada/)).toBeVisible({timeout:30000});
    await restored.getByLabel("Imagen para predecir con modelo respaldado")
      .setInputFiles(path.join(datasetDirectory,"0",fs.readdirSync(path.join(datasetDirectory,"0"))[0]));
    const prediction=restored.getByRole("region",{name:"Resultado de predicción"});
    await expect(prediction.getByRole("img",{name:/Imagen seleccionada/})).toBeVisible({timeout:30000});
    await expect(prediction.getByText("Número detectado")).toBeVisible();
    await expect(prediction.locator(".nl-prediction-class")).toBeVisible();
    await expect(prediction.getByText("Confianza del modelo")).toBeVisible();
    await expect(restored.getByText("Ver detalles")).toBeVisible();
    await expect(restored.locator(".nl-prediction-detail-row")).toHaveCount(10);
    await expect(restored.locator(".nl-prediction-details")).not.toHaveAttribute("open",/.+/);
    // Reimportar no debe sobrescribir sin autorización los pesos guardados.
    await restored.getByLabel("Restaurar modelo CNN desde respaldo").setInputFiles(backupPath);
    await expect(restored.getByRole("alert")).toContainText("ya existe en este navegador");
  }finally{await isolated.close();}
});


test("Accesibilidad: salto al contenido, navegación y menú adaptable al móvil",async({page})=>{
  const skip=page.getByRole("link",{name:"Saltar al contenido principal"});
  await expect(skip).toBeAttached();
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#neurolab-main-content")).toBeFocused();

  await page.setViewportSize({width:390,height:844});
  const menu=page.getByRole("button",{name:"Ocultar menú"});
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded","true");
  await menu.click();
  const nav=page.getByRole("navigation",{name:"Navegación principal",includeHidden:true});
  await expect(nav).toBeHidden();
  await page.getByRole("button",{name:"Mostrar menú"}).click();
  await expect(nav).toBeVisible();
  await nav.getByRole("button",{name:"Reportes",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Reportes",level:1,exact:true})).toBeFocused();
  await expect(nav.getByRole("button",{name:"Reportes",exact:true})).toHaveAttribute("aria-current","page");
  expect(await page.title()).toBe("Reportes | NeuroLab Enterprise");
  await nav.getByRole("button",{name:"Dashboard",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Dashboard",level:1,exact:true})).toBeFocused();
  await expect(page.getByRole("region",{name:"Accesos rápidos del laboratorio"})).toBeVisible();
  await page.getByRole("button",{name:"Abrir entrenamiento real",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Entrenamientos",level:1,exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});


test("MNIST por URL: carga offline simulada de 70 000 IDX sin convertir todas las imágenes a tensores", async ({page})=>{
  test.setTimeout(180000);
  const {gzipSync}=await import("node:zlib");
  const base="http://127.0.0.1:4189/datasets/mnist/";
  const sources=[
    ["train-images-idx3-ubyte.gz",60000,2051,16],
    ["train-labels-idx1-ubyte.gz",60000,2049,8],
    ["t10k-images-idx3-ubyte.gz",10000,2051,16],
    ["t10k-labels-idx1-ubyte.gz",10000,2049,8],
  ];
  const files=new Map();
  for(const [file,count,magic,header] of sources){
    const bytes=Buffer.alloc(header+count*(header===16?784:1));
    bytes.writeUInt32BE(magic,0);bytes.writeUInt32BE(count,4);
    if(header===16){bytes.writeUInt32BE(28,8);bytes.writeUInt32BE(28,12);}
    else for(let i=0;i<count;i++)bytes[8+i]=i%10;
    files.set(base+file,gzipSync(bytes,{level:1}));
  }
  await page.route("**/datasets/mnist/*",async route=>{
    const bytes=files.get(route.request().url());
    if(!bytes)return route.abort();
    await route.fulfill({status:200,contentType:"application/octet-stream",
      headers:{"access-control-allow-origin":"*"},body:bytes});
  });
  await navigate(page,"Datasets");
  await expect(page.getByRole("heading",{name:"Importar MNIST desde repositorio"})).toBeVisible();
  await page.getByRole("button",{name:"Conectar e importar MNIST"}).click();
  await expect(page.getByText(/MNIST cargado · activo para entrenamiento/)).toBeVisible({timeout:30000});
  await expect(page.getByText("900",{exact:true})).toBeVisible();
  await expect(page.getByText("100",{exact:true})).toBeVisible();
  await expect(page.getByText("1,000",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Usar cantidad seleccionada"}).click();
  await navigate(page,"Entrenamientos");
  await expect(page.getByText(/MNIST · origen público/)).toBeVisible();
  await expect(page.getByRole("button",{name:"Entrenar CNN real"})).toBeEnabled();
  await expect(page.getByRole("button",{name:"Examinar capa SALIDA"})).toBeVisible();
  await page.getByLabel("Épocas de entrenamiento real").fill("1");
  await page.getByLabel("Batch del entrenamiento real").fill("64");
  await page.getByRole("button",{name:"Entrenar CNN real"}).click();
  await expect(page.getByText("Modelo CNN guardado en este navegador.")).toBeVisible({timeout:160000});
  await expect(page.locator(".browser-cnn-summary")).toBeVisible();
  await expect(page.getByRole("button",{name:"Descargar dígito oficial de prueba (PNG)"})).toBeVisible();
  const saved=page.waitForEvent("download");
  await page.getByRole("button",{name:"Descargar respaldo CNN"}).click();
  const backup=await saved;
  expect(backup.suggestedFilename()).toMatch(/\.ncnn$/);
  await expect(page.getByText(/parámetros de CNN inconsistentes o demasiado grandes/)).toHaveCount(0);
});


test("Eliminar proyectos: confirmación obligatoria y selección consistente",async({page})=>{
  await navigate(page,"Proyectos");
  const name="Clasificación de imágenes";
  const deleteButton=page.getByRole("button",{name:"Eliminar proyecto "+name});
  await deleteButton.click();
  const dialog=page.getByRole("alertdialog",{name:"Confirmar eliminación de "+name});
  await expect(dialog).toBeVisible();
  const confirm=dialog.getByRole("button",{name:"Eliminar definitivamente"});
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("button",{name:"Cancelar"}).click();
  await expect(page.getByRole("article",{name:"Proyecto "+name})).toBeVisible();
  await page.getByLabel("Nuevo proyecto CNN",{exact:true}).fill("Proyecto seguro");
  await page.getByRole("button",{name:"Crear proyecto",exact:true}).click();
  await deleteButton.click();
  await dialog.getByRole("textbox",{name:"Escribe el nombre del proyecto para eliminarlo"}).fill("Nombre equivocado");
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("textbox",{name:"Escribe el nombre del proyecto para eliminarlo"}).fill(name);
  await confirm.click();
  await expect(page.getByRole("article",{name:"Proyecto "+name})).toHaveCount(0);
  await expect(page.getByRole("article",{name:"Proyecto Proyecto seguro"})).toBeVisible();
  await expect(page.getByLabel("Proyecto activo")).toHaveValue(/.+/);
  await expect(page.getByRole("navigation").getByText("DATOS Y ENTRENAMIENTO")).toBeVisible();
});


test("CSV real: importar, inferir sigmoid, entrenar y evaluar",async({page})=>{
  await navigate(page,"Datasets");
  const csv=["edad,region,churn"];
  for(let i=0;i<160;i++)csv.push([20+i%50,i%2?"Norte":"Sur",i%2].join(","));
  await page.getByLabel("Archivo CSV o TSV").setInputFiles({
    name:"clientes.csv",mimeType:"text/csv",buffer:Buffer.from(csv.join("\n"))});
  const box=page.getByRole("region",{name:"Datos tabulares"});
  await expect(box.getByText("Clasificación binaria",{exact:true})).toBeVisible();
  await expect(box.getByText("sigmoid",{exact:true})).toBeVisible();
  await expect(box.getByText("binaryCrossentropy")).toHaveCount(0);
  await box.getByLabel("Épocas tabulares").fill("2");
  await box.getByRole("button",{name:"Iniciar entrenamiento"}).click();
  await expect(box.getByText("Modelo entrenado y guardado en este navegador.")).toBeVisible({timeout:90000});
  await expect(box.getByText("Prueba independiente · Precisión")).toBeVisible();
  await expect(box.getByRole("button",{name:"Exportar informe JSON"})).toBeVisible();
  await navigate(page,"Entrenamientos");
  const trained=page.getByRole("region",{name:"Datos tabulares"});
  await expect(trained.getByText("Prueba independiente · Precisión")).toBeVisible();
  await expect(trained.getByRole("button",{name:"Exportar informe JSON"})).toBeVisible();
});

test("CSV URL pública: multiclase Softmax y configuración manual",async({page})=>{
  await navigate(page,"Datasets");
  const csv=["sepal_length,species"];
  for(let i=0;i<80;i++)csv.push([4+i*.03,["setosa","versicolor","virginica"][i%3]].join(","));
  await page.route("https://example.org/datasets/iris.csv",async route=>
    route.fulfill({status:200,contentType:"text/csv",
      headers:{"access-control-allow-origin":"*"},body:csv.join("\n")}));
  const box=page.getByRole("region",{name:"Datos tabulares"});
  await box.getByRole("button",{name:"Desde URL"}).click();
  await box.getByLabel("URL del dataset tabular").fill("https://example.org/datasets/iris.csv");
  await box.getByRole("button",{name:"Importar URL"}).click();
  await expect(box.getByText("Clasificación multiclase",{exact:true})).toBeVisible();
  await expect(box.getByText("softmax",{exact:true})).toBeVisible();
  await box.getByLabel("Modo de configuración tabular").selectOption("manual");
  await expect(box.getByLabel("Tipo de problema")).toBeVisible();
  await expect(box.getByLabel("Neuronas capa 1")).toBeVisible();
  await box.getByLabel("Neuronas capa 1").fill("24");
  await expect(box.getByLabel("Neuronas capa 1")).toHaveValue("24");
  await box.getByLabel("Tipo de problema").selectOption("regression");
  await expect(box.getByText(/Regresión requiere una variable objetivo numérica/)).toBeVisible();
});


test("CSV regresión: recomienda salida lineal y evalúa MAE",async({page})=>{
  await navigate(page,"Datasets");
  const csv=["edad,habitaciones,precio"];
  for(let i=0;i<125;i++)csv.push([25+i%45,1+i%5,(160000+i%45*3200+(1+i%5)*30000).toFixed(1)].join(","));
  const box=page.getByRole("region",{name:"Datos tabulares"});
  await box.getByLabel("Archivo CSV o TSV").setInputFiles({
    name:"viviendas.csv",mimeType:"text/csv",buffer:Buffer.from(csv.join("\n"))});
  await expect(box.getByText("Regresión",{exact:true})).toBeVisible();
  await expect(box.getByText("linear",{exact:true})).toBeVisible();
  await box.getByLabel("Épocas tabulares").fill("2");
  await box.getByRole("button",{name:"Iniciar entrenamiento"}).click();
  await expect(box.getByText("Modelo entrenado y guardado en este navegador.")).toBeVisible({timeout:90000});
  await expect(box.getByText("Prueba independiente · MAE")).toBeVisible();
});


test("Biblioteca de datasets: guardar varios CSV, seleccionar, renombrar, recargar y eliminar",async({page})=>{
  await navigate(page,"Datasets");
  const library=page.getByRole("region",{name:"Biblioteca de datasets"});
  const uploader=page.getByRole("region",{name:"Datos tabulares"}).getByLabel("Archivo CSV o TSV");
  const make=(name,kind)=>({
    name,mimeType:"text/csv",
    buffer:Buffer.from(["edad,categoria,clase",...Array.from({length:50},(_,i)=>
      [20+i,kind+i%2,i%2].join(","))].join("\n"))
  });
  await uploader.setInputFiles(make("primero.csv","N"));
  await expect(library.getByText("1 guardado")).toBeVisible({timeout:15000});
  await uploader.setInputFiles(make("segundo.csv","S"));
  await expect(library.getByText("2 guardados")).toBeVisible({timeout:15000});
  await expect(library.getByRole("article",{name:"Dataset primero"})).toBeVisible();
  await expect(library.getByRole("article",{name:"Dataset segundo"})).toBeVisible();
  await library.getByRole("button",{name:"Renombrar dataset segundo"}).click();
  await library.getByLabel("Nuevo nombre de segundo").fill("segundo corregido");
  await library.getByRole("button",{name:"Guardar"}).click();
  await expect(library.getByRole("article",{name:"Dataset segundo corregido"})).toBeVisible();
  await library.getByRole("article",{name:"Dataset primero"}).getByRole("button",{name:"Usar dataset"}).click();
  await expect(library.getByRole("article",{name:"Dataset primero"}).getByText("Activo")).toBeVisible();
  await page.reload();
  await navigate(page,"Datasets");
  await expect(library.getByText("2 guardados")).toBeVisible({timeout:15000});
  await expect(library.getByRole("article",{name:"Dataset primero"}).getByText("Activo")).toBeVisible();
  await expect(page.getByLabel("Nombre del dataset tabular")).toHaveValue("primero");
  page.once("dialog",dialog=>dialog.accept());
  await library.getByRole("button",{name:"Eliminar dataset segundo corregido"}).click();
  await expect(library.getByText("1 guardado")).toBeVisible();
  await expect(library.getByRole("article",{name:"Dataset primero"})).toBeVisible();
});

test("Biblioteca de imágenes: restaura archivos binarios sin volver a seleccionarlos",async({page})=>{
  await applyDataset(page);
  const library=page.getByRole("region",{name:"Biblioteca de datasets"});
  await expect(library.getByText("1 guardado")).toBeVisible({timeout:20000});
  await page.reload();
  await navigate(page,"Datasets");
  await expect(library.getByText("1 guardado")).toBeVisible({timeout:15000});
  await expect(page.getByRole("heading",{name:"Dataset aplicado"})).toBeVisible({timeout:15000});
  await expect(page.getByRole("heading",{name:"Dataset aplicado"}).locator("..")).toContainText("200 imágenes · 10 clases");
  await navigate(page,"Entrenamientos");
  await expect(page.getByRole("button",{name:"Entrenar CNN real"})).toBeEnabled();
});


test("Entrenamientos aísla el modelo local del importado",async({page})=>{
  await navigate(page,"Entrenamientos");
  const train=page.getByRole("tab",{name:/Modelo entrenado en NeuroLab/});
  const pretrained=page.getByRole("tab",{name:/Modelo preentrenado importado/});
  await expect(train).toHaveAttribute("aria-selected","true");
  await expect(page.getByRole("tabpanel",{name:"Modelo entrenado en NeuroLab"})).toBeVisible();
  await expect(page.getByText("Entrenar CNN con TensorFlow.js",{exact:true})).toBeVisible();
  await pretrained.click();
  await expect(pretrained).toHaveAttribute("aria-selected","true");
  await expect(page.getByRole("tabpanel",{name:"Modelo entrenado en NeuroLab"})).toBeHidden();
  const imported=page.getByRole("tabpanel",{name:"Modelo preentrenado importado"});
  await expect(imported).toBeVisible();
  await expect(imported.getByLabel("Restaurar modelo CNN desde respaldo")).toHaveAttribute("accept",/\.ncnn/);
  await expect(imported.getByText(/conversiones compatibles de Colab/)).toBeVisible();
  await expect(imported.getByRole("button",{name:"Entrenar CNN real"})).toHaveCount(0);
  await expect(imported.getByRole("heading",{name:"Modelos cargados"})).toBeVisible();
  await expect(imported.getByRole("heading",{name:"Mis modelos preentrenados"})).toBeVisible();
  await train.click();
  await expect(page.getByRole("tabpanel",{name:"Modelo entrenado en NeuroLab"})).toBeVisible();
  await expect(page.getByRole("tabpanel",{name:"Modelo preentrenado importado"})).toBeHidden();
});

test("Los dos orígenes de CNN muestran controles CRUD sin compartir importador",async({page})=>{
 await navigate(page,"Entrenamientos");
 const local=page.getByRole("tabpanel",{name:"Modelo entrenado en NeuroLab"});
 await expect(local.getByRole("button",{name:"Entrenar CNN real"})).toBeVisible();
 await expect(local.getByLabel("Restaurar modelo CNN desde respaldo")).toHaveCount(0);
 await page.getByRole("tab",{name:/Modelo preentrenado importado/}).click();
 const imported=page.getByRole("tabpanel",{name:"Modelo preentrenado importado"});
 await expect(imported.getByLabel("Restaurar modelo CNN desde respaldo")).toBeVisible();
 await expect(imported.getByRole("button",{name:"Entrenar CNN real"})).toHaveCount(0);
 await expect(imported.getByRole("region",{name:"Administrar modelos preentrenados importados"})).toBeVisible();
});


test("No se ofrecen simulaciones, colas ficticias, usuarios demo ni métricas inventadas",async({page})=>{
 await navigate(page,"Dashboard");
 await expect(page.getByText("Simulaciones pendientes")).toHaveCount(0);
 await expect(page.getByText("Fichas simuladas")).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Administración",exact:true})).toHaveCount(0);
 await navigate(page,"Entrenamientos");
 await expect(page.getByText("Simulación CNN",{exact:false})).toHaveCount(0);
 await expect(page.getByText("Cola del proyecto")).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Añadir a la cola"})).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Pausar demo"})).toHaveCount(0);
 await expect(page.getByRole("region",{name:"Visualización de neuronas y conexiones de la CNN"})).toBeVisible();
 await expect(page.locator(".nl-energy-particle")).toHaveCount(0);
 await navigate(page,"Evaluación");
 await expect(page.getByRole("heading",{name:"Evaluación de simulaciones CNN"})).toHaveCount(0);
 await navigate(page,"Modelos");
 await expect(page.getByText(/Aprobar demo/)).toHaveCount(0);
 await navigate(page,"Reportes");
 await expect(page.getByText(/Reporte de simulaciones CNN/)).toHaveCount(0);
});


test("Entrenamientos no incluye MobileNet ni transferencia fotográfica retirada",async({page})=>{
  await navigate(page,"Entrenamientos");
  const local=page.getByRole("tabpanel",{name:"Modelo entrenado en NeuroLab"});
  await expect(local).toBeVisible();
  await expect(local.getByText(/MobileNet|Entrenar con fotografías reales|Reconocer fotos reales/i)).toHaveCount(0);
  await expect(local.locator("#photo-real-training")).toHaveCount(0);
  await expect(local.getByRole("button",{name:"Entrenar CNN real"})).toBeVisible();
  await page.getByRole("tab",{name:/Modelo preentrenado importado/}).click();
  const imported=page.getByRole("tabpanel",{name:"Modelo preentrenado importado"});
  await expect(imported).toBeVisible();
  await expect(imported.getByText(/MobileNet/i)).toHaveCount(0);
});
