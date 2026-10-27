import type { ImageDataset } from "./cnn";

export type SplitName = "all" | "train" | "validation" | "test";

export function inspectDataset(dataset: ImageDataset) {
  const owners = new Array<string>(dataset.images.length).fill("");
  const classes = dataset.classes.map(label => ({
    label, total: 0, train: 0, validation: 0, test: 0,
  }));

  if (new Set(dataset.classes).size !== dataset.classes.length) {
    throw new Error("El dataset contiene clases duplicadas.");
  }

  for (const split of ["train","validation","test"] as const) {
    for (const index of dataset[split]) {
      if (!Number.isInteger(index) || index < 0 || index >= owners.length) {
        throw new Error("La partición contiene un índice inválido.");
      }
      if (owners[index]) {
        throw new Error("Un registro aparece en varias particiones o está duplicado en una de ellas.");
      }

      owners[index] = split;
      const row = classes.find(item => item.label === dataset.images[index].label);
      if (!row) throw new Error("Una imagen pertenece a una clase no registrada.");

      row[split]++;
      row.total++;
    }
  }

  if (owners.some(value => !value)) {
    throw new Error("Hay imágenes sin partición asignada.");
  }

  return {
    classes,
    owners,
    bytes: dataset.images.reduce((total,image) => total + image.file.size,0),
    dimensions: [...new Set(dataset.images.map(image => `${image.width} × ${image.height}`))],
  };
}

export function filterDataset(
  dataset: ImageDataset,
  options: { query: string; label: string; split: SplitName }
) {
  const indices = options.split === "all" ? null : new Set(dataset[options.split]);
  const query = options.query.trim().toLocaleLowerCase("es");

  return dataset.images.map((image,index) => ({image,index})).filter(({image,index}) =>
    (!options.label || image.label === options.label) &&
    (!indices || indices.has(index)) &&
    (!query || `${image.file.name} ${image.label}`.toLocaleLowerCase("es").includes(query))
  );
}
