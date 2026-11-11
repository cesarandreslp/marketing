import type { piezas } from "./db";

export type Pieza = typeof piezas.$inferSelect;

/** Agrupa por concepto (un video = varias redes), oculta lo rechazado que ya se rehízo y ordena por fecha de publicación. */
export function agrupar(ps: Pieza[]) {
  const rehechas = new Set(ps.map((p) => p.reemplazaA).filter(Boolean));
  const visibles = ps.filter((p) => !rehechas.has(p.id));
  const grupos = Map.groupBy(visibles, (p) => `${p.formato}·${p.concepto ?? p.id}`);
  return [...grupos.values()].sort((a, b) => +a[0].fechaProgramada - +b[0].fechaProgramada);
}

/** Los tres PDF de la semana, cada uno con su destinatario. */
export type Kit = "produccion" | "copys" | "imagenes";
export const KITS: Record<Kit, { boton: string; titulo: string; para: string }> = {
  produccion: { boton: "Grabación", titulo: "Guía de grabación", para: "Para: quien acompaña al candidato y graba los videos" },
  copys: { boton: "Textos para redes", titulo: "Textos para publicar", para: "Para: quien maneja y monitorea las redes del candidato" },
  imagenes: { boton: "Prompts de imagen", titulo: "Prompts de imagen con IA", para: "Para: quien genera portadas y carruseles con IA" },
};
