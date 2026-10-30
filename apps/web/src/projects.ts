export const projectStatuses = ["Activo", "En preparación", "Archivado"] as const;
export type ProjectStatus = typeof projectStatuses[number];
export type Project = {
  id: string;
  revision?: number;
  name: string;
  description: string;
  status: ProjectStatus;
  tags: string[];
};
export type ProjectDraft = {
  name: string;
  description: string;
  status: string;
  tags: string;
};

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").normalize("NFC");
const key = (value: string) => normalize(value).toLocaleLowerCase("es");

export function saveProject(projects: Project[], draft: ProjectDraft, id: string): Project[] {
  const name = normalize(draft.name);
  const description = draft.description.trim();
  if (name.length < 3 || name.length > 80) throw new Error("El nombre debe tener entre 3 y 80 caracteres.");
  if (description.length > 1000) throw new Error("La descripción admite hasta 1000 caracteres.");
  if (!projectStatuses.includes(draft.status as ProjectStatus)) throw new Error("Selecciona un estado válido.");
  if (projects.some(project => project.id !== id && key(project.name) === key(name))) {
    throw new Error("Ya existe un proyecto con ese nombre.");
  }
  const tags = [...new Map(draft.tags.split(",").map(normalize).filter(Boolean).map(tag => [key(tag), tag])).values()];
  if (tags.length > 6 || tags.some(tag => tag.length > 24)) {
    throw new Error("Usa hasta seis etiquetas, con un máximo de 24 caracteres cada una.");
  }
  const next: Project = {id, name, description, status:draft.status as ProjectStatus, tags};
  return projects.some(project => project.id === id)
    ? projects.map(project => project.id === id ? next : project)
    : [...projects, next];
}

export function filterProjects(projects: Project[], search: string, status: string): Project[] {
  const query = key(search);
  return projects.filter(project => (status === "Todos" || project.status === status) &&
    key([project.name, project.description, ...project.tags].join(" ")).includes(query));
}
