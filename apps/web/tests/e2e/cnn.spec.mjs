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

async function createJob(page, epochs = "3") {
  await navigate(page, "Diseñador CNN");
  await page.getByLabel("Modo de configuración CNN", {exact:true}).selectOption("manual");
  await navigate(page, "Entrenamientos");
  await page.getByLabel("Épocas",{exact:true}).fill(epochs);
  await page.getByRole("button", {
    name: "Añadir a la cola", exact: true,
  }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", {
    name: "Dashboard", level: 1, exact: true,
  })).toBeVisible();
});

test("Los diez módulos corresponden exclusivamente a CNN", async ({ page }) => {
  for (const name of [
    "Dashboard", "Proyectos", "Diseñador CNN", "Datasets",
    "Entrenamientos", "Evaluación", "Modelos",
    "Fundamentos", "Reportes", "Administración",
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

test("Flujo CNN: versión, dos gráficos, ficha, revisión y exportaciones", async ({ page }) => {
  await applyDataset(page);
  await navigate(page, "Diseñador CNN");

  await page.getByRole("button", {
    name: "Guardar versión CNN", exact: true,
  }).click();

  await expect(page.getByRole("status").filter({
    hasText: "Arquitectura CNN guardada como versión 1.",
  })).toBeVisible();

  await createJob(page, "3");

  await expect(page.locator(".cnn-two-charts")).toBeVisible();

  await expect(
    page.locator(".cnn-two-charts").getByRole("img")
  ).toHaveCount(2);

  await expect(page.getByRole("img", {
    name: "Precisión simulada de entrenamiento y validación",
    exact: true,
  })).toBeVisible();

  await expect(page.getByRole("img", {
    name: "Pérdida simulada de entrenamiento y validación",
    exact: true,
  })).toBeVisible();

  await navigate(page, "Dashboard");
  await navigate(page, "Entrenamientos");

  await expect(page.locator(".training-detail").getByText(
    "Completado", { exact: true }
  )).toBeVisible({ timeout: 20000 });

  const charts = page.locator(".cnn-two-charts svg");
  for (let index = 0; index < 2; index++) {
    await expect(charts.nth(index).locator("path")).toHaveCount(2);
    await expect(charts.nth(index).locator("path").nth(0))
      .toHaveAttribute("d", /^M.+/);
    await expect(charts.nth(index).locator("path").nth(1))
      .toHaveAttribute("d", /^M.+/);
  }

  await navigate(page, "Diseñador CNN");

  await page.getByLabel(/^Filtros · 1 a 128/)
    .nth(0).fill("24");

  await navigate(page, "Modelos");

  await page.getByRole("button", {
    name: "Registrar ficha", exact: true,
  }).click();

  const detail = page.getByRole("heading", {
    name: "CNN v1 · Borrador", exact: true,
  }).locator("..");

  await expect(detail).toContainText("8 filtros 3×3");
  await expect(detail).toContainText("200 imágenes");

  await page.getByLabel(/^Observación de revisión/).fill(
    "Configuración y metadatos revisados en la demostración."
  );

  await page.getByRole("button", {
    name: "Marcar revisado", exact: true,
  }).click();

  await page.getByLabel(/^Observación de revisión/).fill(
    "Ficha aprobada para comprobar el flujo de revisión."
  );

  await page.getByRole("button", {
    name: "Aprobar demo", exact: true,
  }).click();

  await expect(page.getByRole("heading", {
    name: "CNN v1 · Aprobado", exact: true,
  })).toBeVisible();

  const jsonEvent = page.waitForEvent("download");
  await page.getByRole("button", {
    name: "Exportar ficha JSON", exact: true,
  }).click();

  const jsonDownload = await jsonEvent;
  const jsonPath = await jsonDownload.path();
  expect(jsonPath).toBeTruthy();

  const exported = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  expect(exported.simulated).toBe(true);
  expect(exported.containsModelWeights).toBe(false);
  expect(exported.record.job.config.layers[0].filters).toBe(8);
  expect(exported.record.job.dataset.classes.length).toBe(10);

  await navigate(page, "Evaluación");
  await expect(page.locator(".evaluation-summary tbody tr")).toHaveCount(1);

  await navigate(page, "Reportes");

  const csvEvent = page.waitForEvent("download");
  await page.getByRole("button", {
    name: "Exportar CSV simulado", exact: true,
  }).click();

  const csvDownload = await csvEvent;
  const csvPath = await csvDownload.path();
  expect(csvPath).toBeTruthy();

  const exportedCSV = fs.readFileSync(csvPath, "utf8");
  expect(exportedCSV).toContain("CNN_SIMULADA");
  expect(exportedCSV).toContain("Completado");

  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".cnn-report")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
});

test("La pausa y cancelación conservan los estados terminales", async ({ page }) => {
  await applyDataset(page);
  await createJob(page, "100");

  await page.getByRole("button", {
    name: "Pausar demo", exact: true,
  }).click();

  await expect(page.getByRole("button", {
    name: "Reanudar demo", exact: true,
  })).toBeVisible();

  const progress = page.locator(".training-detail progress");
  const before = await progress.getAttribute("value");

  await page.waitForTimeout(1200);

  await expect(progress).toHaveAttribute("value", before ?? "0");

  await page.getByRole("button", {
    name: "Cancelar simulación", exact: true,
  }).click();

  await expect(page.locator(".training-detail").getByText(
    "Cancelado", { exact: true }
  )).toBeVisible();

  await page.getByRole("button", {
    name: "Reanudar demo", exact: true,
  }).click();

  await page.waitForTimeout(1000);

  await expect(page.locator(".training-detail").getByText(
    "Cancelado", { exact: true }
  )).toBeVisible();

  await expect(page.getByRole("button", {
    name: "Cancelar simulación", exact: true,
  })).toBeDisabled();
});

test("Los límites de Administración controlan la cola CNN", async ({ page }) => {
  await applyDataset(page);
  await navigate(page, "Administración");

  await page.getByLabel(/^Máximo de pendientes/).fill("1");
  await page.getByLabel(/^Máximo por sesión/).fill("2");

  await page.getByRole("button", {
    name: "Aplicar límites", exact: true,
  }).click();

  await expect(page.getByRole("status").filter({
    hasText: "Límites aplicados a nuevas ejecuciones.",
  })).toBeVisible();

  await createJob(page, "100");

  await page.getByRole("button", {
    name: "Añadir a la cola", exact: true,
  }).click();

  await expect(page.getByRole("alert")).toContainText(
    "Límite activo: 1 trabajos pendientes y 2 por sesión."
  );

  await expect(page.locator(".queue-item")).toHaveCount(1);

  await page.getByRole("button", {
    name: "Cancelar simulación", exact: true,
  }).click();

  await page.getByRole("button", {
    name: "Añadir a la cola", exact: true,
  }).click();

  await expect(page.locator(".queue-item")).toHaveCount(2);

  await page.getByRole("button", {
    name: "Añadir a la cola", exact: true,
  }).click();

  await expect(page.locator(".queue-item")).toHaveCount(2);
  await expect(page.getByRole("alert")).toContainText("Límite activo:");
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

test("Proyectos CNN: archivar impide nuevas simulaciones y permite reactivar",async({page})=>{
  await applyDataset(page);
  await navigate(page,"Proyectos");
  await page.getByRole("button",{name:"Editar proyecto Clasificación de imágenes",exact:true}).click();
  await page.getByLabel("Estado del proyecto",{exact:true}).selectOption("Archivado");
  await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();
  await navigate(page,"Entrenamientos");
  await page.getByRole("button",{name:"Añadir a la cola",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("El proyecto está archivado");
  await expect(page.locator(".queue-item")).toHaveCount(0);
  await navigate(page,"Proyectos");
  await page.getByRole("button",{name:"Editar proyecto Clasificación de imágenes",exact:true}).click();
  await page.getByLabel("Estado del proyecto",{exact:true}).selectOption("Activo");
  await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();
  await createJob(page,"3");
  await expect(page.locator(".queue-item")).toHaveCount(1);
  await page.setViewportSize({width:390,height:844});
  await navigate(page,"Proyectos");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});


test("Evaluación CNN: comparación hasta tres ejecuciones y exportaciones trazables",async({page})=>{
  await applyDataset(page);
  for(let i=0;i<4;i++)await createJob(page,"2");
  await expect(page.locator(".training-detail").getByText("Completado",{exact:true})).toBeVisible({timeout:25000});
  await navigate(page,"Evaluación");
  const results=page.getByRole("region",{name:"Resultados de ejecuciones",exact:true});
  await expect(results.locator("tbody tr")).toHaveCount(4);
  const checks=results.getByRole("checkbox");
  for(let i=0;i<3;i++)await checks.nth(i).check();
  await expect(checks.nth(3)).toBeDisabled();
  const comparison=page.getByRole("region",{name:"Comparación de ejecuciones",exact:true});
  await expect(comparison.getByRole("article")).toHaveCount(3);
  await expect(comparison.getByRole("status")).toContainText("misma huella");
  const event=page.waitForEvent("download");
  await comparison.getByRole("button",{name:"Exportar comparación JSON",exact:true}).click();
  const report=JSON.parse(fs.readFileSync(await(await event).path(),"utf8"));
  expect(report.simulated).toBe(true);expect(report.sameDataset).toBe(true);
  expect(report.rows).toHaveLength(3);expect(report.rows.every(row=>row.epochsExecuted===2)).toBe(true);
  const csvEvent=page.waitForEvent("download");
  await comparison.getByRole("button",{name:"Exportar comparación CSV",exact:true}).click();
  expect(fs.readFileSync(await(await csvEvent).path(),"utf8")).toContain("CNN_SIMULADA");
  await results.getByRole("button",{name:/^Inspeccionar ejecución/}).first().click();
  await expect(page.locator(".epoch-table tbody tr")).toHaveCount(2);
  const metrics=page.getByRole("region",{name:"Métricas por época",exact:true});
  const metricEvent=page.waitForEvent("download");
  await metrics.getByRole("button",{name:"Exportar métricas por época CSV",exact:true}).click();
  expect(fs.readFileSync(await(await metricEvent).path(),"utf8").split("\r\n")).toHaveLength(3);
  await comparison.getByRole("button",{name:"Limpiar comparación",exact:true}).click();
  await expect(comparison.getByRole("article")).toHaveCount(0);
  await expect(checks.nth(3)).toBeEnabled();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});

test("Evaluación CNN: advierte si cambian las particiones del dataset",async({page})=>{
  await applyDataset(page);await createJob(page,"1");
  await expect(page.locator(".training-detail").getByText("Completado",{exact:true})).toBeVisible();
  await navigate(page,"Datasets");
  await page.getByLabel(/^Semilla/).fill("43");
  await page.getByRole("button",{name:"Enviar dataset al proyecto",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"Dataset de imágenes validado y aplicado."})).toBeVisible();
  await createJob(page,"1");
  await expect(page.locator(".training-detail").getByText("Completado",{exact:true})).toBeVisible();
  await navigate(page,"Evaluación");
  const checks=page.getByRole("region",{name:"Resultados de ejecuciones",exact:true}).getByRole("checkbox");
  await checks.nth(0).check();await checks.nth(1).check();
  await expect(page.getByRole("region",{name:"Comparación de ejecuciones",exact:true}).getByRole("status")).toContainText("no son directamente comparables");
});


test("Historial CNN: repetir una cancelación conserva la configuración de origen",async({page})=>{
  await applyDataset(page);await createJob(page,"2");
  await page.getByRole("button",{name:"Cancelar simulación",exact:true}).click();
  const history=page.getByRole("region",{name:"Historial de entrenamientos",exact:true});
  const sourceId=(await page.locator(".queue-item small").first().innerText()).trim();
  await history.getByLabel("Filtrar ejecuciones por estado",{exact:true}).selectOption("Cancelado");
  await expect(history.locator("tbody tr")).toHaveCount(1);
  await navigate(page,"Diseñador CNN");
  await page.getByLabel(/^Filtros · 1 a 128/).first().fill("24");
  await navigate(page,"Entrenamientos");
  await history.getByRole("button",{name:`Repetir ejecución ${sourceId}`,exact:true}).click();
  await expect(page.locator(".queue-item")).toHaveCount(2);
  await expect(page.locator(".training-detail").getByText("Completado",{exact:true})).toBeVisible();
  await history.getByLabel("Filtrar ejecuciones por estado",{exact:true}).selectOption("Completado");
  await expect(history.locator("tbody tr")).toHaveCount(1);
  await expect(history.locator("tbody")).toContainText(`Origen: ${sourceId}`);
  const event=page.waitForEvent("download");
  await history.getByRole("button",{name:"Exportar historial CSV",exact:true}).click();
  const csv=fs.readFileSync(await(await event).path(),"utf8");
  expect(csv).toContain(sourceId);expect(csv).toContain("CNN_SIMULADA");
  await navigate(page,"Modelos");
  await page.getByRole("button",{name:"Registrar ficha",exact:true}).click();
  const modelEvent=page.waitForEvent("download");
  await page.getByRole("button",{name:"Exportar ficha JSON",exact:true}).click();
  const result=JSON.parse(fs.readFileSync(await(await modelEvent).path(),"utf8"));
  expect(result.record.job.config.layers[0].filters).toBe(8);
  expect(result.record.job.repeatedFrom).toBe(sourceId);
  expect(result.record.job.startedAt).toBeTruthy();expect(result.record.job.endedAt).toBeTruthy();
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
    await expect(restored.getByRole("table")).toBeVisible({timeout:30000});
    await expect(restored.getByRole("table").locator("tbody tr")).toHaveCount(10);
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


test("Visualizador CNN: muestra arquitectura real, alterna 2D/3D y controla animación",async({page})=>{
  await navigate(page,"Entrenamientos");
  const visual=page.getByRole("region",{name:"Visualización animada de la arquitectura CNN"});
  await expect(visual).toBeVisible();
  await expect(visual.getByText("Red neuronal en movimiento")).toBeVisible();
  await expect(visual.getByText("CONV2D 1")).toBeVisible();
  await expect(visual.getByText("MAXPOOL 1")).toBeVisible();
  await expect(visual.getByText("FLATTEN")).toBeVisible();
  await expect(visual.getByText("DENSE",{exact:true})).toBeVisible();
  await expect(visual.getByText("SALIDA",{exact:true})).toBeVisible();
  await expect(visual.locator(".nl-neural-window")).toHaveAttribute("data-view","3d");
  await visual.getByRole("button",{name:"Vista 2D"}).click();
  await expect(visual.locator(".nl-neural-window")).toHaveAttribute("data-view","2d");
  await visual.getByRole("button",{name:"Pausar animación"}).click();
  await expect(visual.locator(".nl-neural-window")).toHaveAttribute("data-motion","paused");
  await visual.getByRole("button",{name:"Reanudar animación"}).click();
  await expect(visual.locator(".nl-neural-window")).toHaveAttribute("data-motion","running");
  await expect(visual.getByText(/no son activaciones, pesos ni gradientes medidos/)).toBeVisible();
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
  await expect(page.locator(".nl-neural-stage").filter({hasText:"SALIDA"})).toBeVisible();
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
