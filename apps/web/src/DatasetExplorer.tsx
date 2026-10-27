import InputPreview from "./InputPreview";
import "./input-preview.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Config, ImageDataset, ImageRecord } from "./cnn";
import { filterDataset, inspectDataset } from "./inspection";
import type { SplitName } from "./inspection";

const splitLabels: Record<string,string> = {
  train:"Entrenamiento",
  validation:"Validación",
  test:"Prueba",
};

function useImageURL(file: File | undefined) {
  const [url,setURL] = useState("");

  useEffect(() => {
    if (!file) {
      setURL("");
      return;
    }
    const value = URL.createObjectURL(file);
    setURL(value);
    return () => URL.revokeObjectURL(value);
  },[file]);

  return url;
}

function ImageTile({
  image, split, onOpen,
}: { image:ImageRecord; split:string; onOpen:()=>void }) {
  const url = useImageURL(image.file);

  return <button
    className="explorer-tile"
    aria-label={`Ampliar ${image.file.name} de la clase ${image.label}`}
    onClick={onOpen}
  >
    <img src={url || undefined} alt="" loading="lazy" />
    <strong>{image.file.name}</strong>
    <span>Clase {image.label} · {image.width} × {image.height}</span>
    <small>{splitLabels[split]}</small>
  </button>;
}

export default function DatasetExplorer({dataset,config}:{dataset:ImageDataset;config:Config}) {
  const [query,setQuery] = useState("");
  const [label,setLabel] = useState("");
  const [split,setSplit] = useState<SplitName>("all");
  const [page,setPage] = useState(1);
  const [selected,setSelected] = useState<number|null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const analysis = useMemo(() => {
    try {
      return {stats:inspectDataset(dataset),error:""};
    } catch(cause) {
      return {
        stats:null,
        error:cause instanceof Error ? cause.message : "No se pudo inspeccionar el dataset.",
      };
    }
  },[dataset]);

  useEffect(() => {
    setQuery("");
    setLabel("");
    setSplit("all");
    setPage(1);
    setSelected(null);
  },[dataset]);

  const filtered = useMemo(() =>
    analysis.stats ? filterDataset(dataset,{query,label,split}) : [],
    [dataset,query,label,split,analysis.stats]
  );

  const pageCount = Math.max(1,Math.ceil(filtered.length/12));
  const currentPage = Math.min(page,pageCount);
  const items = filtered.slice((currentPage-1)*12,currentPage*12);
  const selectedImage = selected === null ? undefined : dataset.images[selected];
  const selectedURL = useImageURL(selectedImage?.file);

  useEffect(() => {
    if (selected !== null) {
      if (dialog.current && !dialog.current.open) dialog.current.showModal();
    } else {
      dialog.current?.close();
    }
  },[selected]);

  if (!analysis.stats) {
    return <section className="panel recent">
      <h2>Explorador del dataset</h2>
      <p className="error" role="alert">{analysis.error}</p>
    </section>;
  }

  const stats = analysis.stats;

  function exportInventory() {
    const inventory = {
      format:"neurolab-image-inventory",
      schemaVersion:1,
      dataset:dataset.name,
      seed:dataset.seed,
      fingerprint:dataset.fingerprint,
      total:dataset.images.length,
      containsImagePixels:false,
      classes:stats.classes,
      files:dataset.images.map((image,index) => ({
        name:image.file.name,
        class:image.label,
        width:image.width,
        height:image.height,
        bytes:image.file.size,
        checksum:image.checksum,
        partition:stats.owners[index],
      })),
    };

    const url = URL.createObjectURL(new Blob(
      [JSON.stringify(inventory,null,2)],
      {type:"application/json;charset=utf-8"}
    ));
    const link = document.createElement("a");
    link.href=url;
    link.download="cnn-inventario-imagenes.json";
    link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  return <section className="panel recent explorer" aria-label="Explorador de imágenes">
    <div className="panel-head">
      <div><h2>Explorador del dataset</h2><p className="muted">Inspecciona las imágenes aplicadas sin modificar sus particiones.</p></div>
      <button className="secondary" onClick={exportInventory}>Exportar inventario JSON</button>
    </div>

    <div className="metric-grid">
      <div><small>Imágenes</small><strong>{dataset.images.length}</strong></div>
      <div><small>Clases</small><strong>{dataset.classes.length}</strong></div>
      <div><small>Tamaño de archivos</small><strong>{(stats.bytes/1024/1024).toFixed(2)} MiB</strong></div>
      <div><small>Dimensiones distintas</small><strong>{stats.dimensions.length}</strong></div>
    </div>

    <div className="soft">
      Dimensiones originales: {stats.dimensions.slice(0,5).join(" · ")}
      {stats.dimensions.length>5 ? ` · y ${stats.dimensions.length-5} adicionales` : ""}.
      Los filtros solo cambian la vista; no vuelven a separar los datos.
    </div>

    <div className="explorer-filters">
      <label className="field"><span>Buscar por nombre o clase</span><input
        type="search"
        aria-label="Buscar imágenes"
        placeholder="Nombre del archivo..."
        value={query}
        onChange={event=>{setQuery(event.target.value);setPage(1);}}
      /></label>
      <label className="field"><span>Clase</span><select
        aria-label="Filtrar por clase"
        value={label}
        onChange={event=>{setLabel(event.target.value);setPage(1);}}
      >
        <option value="">Todas las clases</option>
        {dataset.classes.map(value=><option key={value} value={value}>{value}</option>)}
      </select></label>
      <label className="field"><span>Partición</span><select
        aria-label="Filtrar por partición"
        value={split}
        onChange={event=>{setSplit(event.target.value as SplitName);setPage(1);}}
      >
        <option value="all">Todas las particiones</option>
        <option value="train">Entrenamiento</option>
        <option value="validation">Validación</option>
        <option value="test">Prueba</option>
      </select></label>
    </div>

    <div className="panel-head explorer-result">
      <span role="status">{filtered.length} resultados</span>
      <button className="text-button" onClick={()=>{
        setQuery("");setLabel("");setSplit("all");setPage(1);
      }}>Limpiar filtros</button>
    </div>

    {items.length ? <div className="explorer-gallery">
      {items.map(({image,index})=><ImageTile
        key={`${image.label}-${image.file.name}-${index}`}
        image={image}
        split={stats.owners[index]}
        onOpen={()=>setSelected(index)}
      />)}
    </div> : <div className="empty">No hay imágenes que coincidan con los filtros.</div>}

    <div className="explorer-pagination">
      <button className="secondary" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Página anterior</button>
      <span>Página {currentPage} de {pageCount}</span>
      <button className="secondary" disabled={currentPage===pageCount} onClick={()=>setPage(currentPage+1)}>Página siguiente</button>
    </div>

    <h3 className="cnn-spaced">Distribución por clase y partición</h3>
    <div className="table-scroll">
      <table>
        <thead><tr><th>Clase</th><th>Total</th><th>Entrenamiento</th><th>Validación</th><th>Prueba</th></tr></thead>
        <tbody>{stats.classes.map(row=><tr key={row.label}>
          <td>{row.label}</td><td>{row.total}</td><td>{row.train}</td><td>{row.validation}</td><td>{row.test}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="caption">La distribución corresponde al dataset completo, independientemente de los filtros de la galería. Se comprueba que todos los registros tengan una única partición asignada.</p>

    <dialog
      className="explorer-dialog"
      ref={dialog}
      aria-label="Detalle de imagen"
      onCancel={()=>setSelected(null)}
      onClose={()=>setSelected(null)}
    >
      <div className="panel-head">
        <h2>Detalle de imagen</h2>
        <button className="secondary" autoFocus onClick={()=>setSelected(null)}>Cerrar imagen</button>
      </div>
      {selectedImage && <>
        <img className="explorer-full-image" src={selectedURL || undefined} alt={`Imagen de la clase ${selectedImage.label}`} />
        <dl>
          <dt>Archivo</dt><dd>{selectedImage.file.name}</dd>
          <dt>Clase</dt><dd>{selectedImage.label}</dd>
          <dt>Dimensiones originales</dt><dd>{selectedImage.width} × {selectedImage.height}</dd>
          <dt>Partición</dt><dd>{selected===null ? "" : splitLabels[stats.owners[selected]]}</dd>
          <dt>Tamaño</dt><dd>{(selectedImage.file.size/1024).toFixed(2)} KiB</dd>
        </dl>
        <p className="caption">Vista ampliada del archivo original. No representa una predicción de la CNN.</p>
        <InputPreview image={selectedImage} size={config.size} channels={config.channels} />
      </>}
    </dialog>
  </section>;
}
