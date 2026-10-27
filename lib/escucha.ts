import { and, eq, isNull } from "drizzle-orm";
import { generarJSON } from "./ai";
import { leerSecretos } from "./cuenta";
import { cuentas, db, items } from "./db";
import { buscarEnX, ItemNuevo, leerFeed, urlGoogleNoticias } from "./fuentes";

export const TEMAS = [
  "seguridad", "movilidad y vías", "servicios públicos", "salud", "educación", "empleo y economía",
  "medio ambiente", "obras e infraestructura", "finanzas públicas y contratación", "gobierno y concejo",
  "turismo y cultura", "deporte y recreación", "zona rural y corregimientos", "vivienda", "otro",
] as const;

type Cuenta = typeof cuentas.$inferSelect;

/** Guarda items nuevos de la cuenta; los repetidos (misma URL) se ignoran. */
export async function guardarItems(cuentaId: number, nuevos: ItemNuevo[]): Promise<number> {
  if (!nuevos.length) return 0;
  const r = await db
    .insert(items)
    .values(nuevos.map((i) => ({ ...i, cuentaId })))
    .onConflictDoNothing()
    .returning({ id: items.id });
  return r.length;
}

/** Recolecta de todas las fuentes configuradas. Una fuente caída no detiene a las demás. */
export async function recolectar(c: Cuenta) {
  const k = await leerSecretos(c.id);
  const feeds = (c.ajustes.fuentesRss ?? "").split(/\s+/).filter((u) => /^https?:\/\//.test(u) && URL.canParse(u));
  const tareas: [string, Promise<ItemNuevo[]>][] = [
    ["Google Noticias", leerFeed(urlGoogleNoticias(c.municipio, c.departamento), "noticias")],
    ...feeds.map((u) => [new URL(u).hostname, leerFeed(u)] as [string, Promise<ItemNuevo[]>]),
  ];
  if (k.xai_api_key) tareas.push(["X (Grok)", buscarEnX(k.xai_api_key, c.municipio, c.departamento)]);

  const resultados = await Promise.allSettled(tareas.map(([, p]) => p));
  const porFuente: Record<string, number | string> = {};
  let nuevos = 0;
  for (const [i, r] of resultados.entries()) {
    const nombre = tareas[i][0];
    if (r.status === "fulfilled") {
      const n = await guardarItems(c.id, r.value);
      porFuente[nombre] = n;
      nuevos += n;
    } else {
      porFuente[nombre] = `error: ${(r.reason as Error).message.slice(0, 120)}`;
    }
  }
  return { nuevos, porFuente };
}

type Clasificacion = {
  id: number;
  relevancia: number;
  tema: string;
  comuna: string | null;
  sentimiento: string;
  emocion: string;
  resumen: string;
};

/** Clasifica lo pendiente por lotes con el rol "masivo" (GLM gratis primero). */
export async function clasificar(c: Cuenta, maximo = 200) {
  const pendientes = await db
    .select({ id: items.id, fuente: items.fuente, titulo: items.titulo, texto: items.texto })
    .from(items)
    .where(and(eq(items.cuentaId, c.id), isNull(items.clasificadoEn)))
    .limit(maximo);
  const barrios = (c.ajustes.barrios ?? "").split("\n").map((b) => b.trim()).filter(Boolean);
  let hechos = 0;

  for (let i = 0; i < pendientes.length; i += 25) {
    const lote = pendientes.slice(i, i + 25);
    const { items: salida = [] } = await generarJSON<{ items?: Clasificacion[] }>(c.id, "masivo", {
      sistema:
        `Eres analista de opinión pública local en ${c.municipio} (${c.departamento}, Colombia). ` +
        `Clasificas menciones para entender qué le preocupa a la gente. Eres preciso y neutral.`,
      prompt:
        `Para cada mención devuelve:\n` +
        `- relevancia: 0 si no trata de ${c.municipio}; 1 poco; 2 relevante; 3 muy relevante para la vida local.\n` +
        `- tema: uno de ${TEMAS.join(", ")}.\n` +
        `- comuna: barrio, comuna o corregimiento mencionado (prioriza: ${barrios.join(", ") || "cualquiera"}), o null.\n` +
        `- sentimiento: negativo, neutro o positivo.\n` +
        `- emocion: la emoción que moviliza (indignación, miedo, tristeza, esperanza, orgullo, alegría, cansancio, otra).\n` +
        `- resumen: una línea en español, SIN nombres de personas particulares (sí de entidades o cargos públicos).\n\n` +
        `Menciones:\n${lote.map((x) => `[${x.id}] (${x.fuente}) ${x.titulo ? x.titulo + " — " : ""}${x.texto.slice(0, 600)}`).join("\n")}`,
      esquemaHint: `{"items":[{"id":1,"relevancia":2,"tema":"seguridad","comuna":null,"sentimiento":"negativo","emocion":"miedo","resumen":"..."}]}`,
      temperatura: 0.1,
    });

    const ids = new Set(lote.map((x) => x.id));
    for (const s of salida) {
      if (!ids.has(s.id)) continue;
      const original = lote.find((x) => x.id === s.id)!;
      await db
        .update(items)
        .set({
          clasificadoEn: new Date(),
          relevancia: Math.max(0, Math.min(3, Math.round(Number(s.relevancia) || 0))),
          tema: (TEMAS as readonly string[]).includes(s.tema) ? s.tema : "otro",
          comuna: s.comuna || null,
          sentimiento: s.sentimiento,
          emocion: s.emocion,
          resumen: s.resumen?.slice(0, 300),
          // Ley 1581: de las capturas reenviadas solo queda el resumen anonimizado.
          ...(original.fuente === "telegram" && s.resumen ? { texto: s.resumen } : {}),
        })
        .where(and(eq(items.id, s.id), eq(items.cuentaId, c.id)));
      hechos++;
    }
  }
  return { clasificados: hechos, pendientes: pendientes.length - hechos };
}

export async function escuchar(c: Cuenta) {
  const recoleccion = await recolectar(c);
  // Lo recolectado ya quedó guardado; si la IA falla se clasifica en la próxima ronda.
  const clasificacion = await clasificar(c).catch((e: Error) => ({
    clasificados: 0,
    pendientes: -1,
    errorClasificacion: e.message.slice(0, 200),
  }));
  return { ...recoleccion, ...clasificacion };
}

