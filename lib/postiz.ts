/**
 * Publicación automática con Postiz (http://localhost:4007, en Docker).
 * La app programa en Postiz cada pieza aprobada cuya red tenga un canal
 * conectado allá; Postiz la publica a su hora. Lo que no tenga canal (o falle)
 * sigue por la publicación asistida de Telegram (lib/publicador.ts).
 *
 * API: http://localhost:4007/api/public/v1, cabecera "Authorization: <api key>".
 * Formas verificadas en el código de Postiz v2.25.1.
 */
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { publicacionHabilitada } from "./cumplimiento";
import { leerSecretos } from "./cuenta";
import { cuentas, db, piezas } from "./db";
import { leerMedio } from "./medios";

type Cuenta = typeof cuentas.$inferSelect;
type Pieza = typeof piezas.$inferSelect;
export type Canal = { id: string; name: string; identifier: string; disabled: boolean; picture?: string };

const BASE = `${process.env.POSTIZ_URL || "http://localhost:4007"}/api/public/v1`;

async function api<T>(clave: string, metodo: string, ruta: string, cuerpo?: object | FormData): Promise<T> {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { authorization: clave, ...(cuerpo && !(cuerpo instanceof FormData) ? { "content-type": "application/json" } : {}) },
    body: cuerpo instanceof FormData ? cuerpo : cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  const txt = await r.text();
  if (!r.ok) {
    let msg = txt.slice(0, 300);
    try {
      const j = JSON.parse(txt);
      msg = j.msg ?? j.message ?? j.error ?? msg;
      if (typeof msg !== "string") msg = JSON.stringify(msg).slice(0, 300);
    } catch {}
    throw new Error(r.status === 401 ? "Postiz rechazó la API key." : `Postiz ${r.status}: ${msg}`);
  }
  return (txt ? JSON.parse(txt) : {}) as T;
}

export const listarCanales = (clave: string) => api<Canal[]>(clave, "GET", "/integrations");

/** Red de la app → canal de Postiz (identifier "instagram" o "instagram-standalone", etc.). */
export function mapaCanales(canales: Canal[]): Partial<Record<string, Canal>> {
  const mapa: Partial<Record<string, Canal>> = {};
  for (const c of canales) {
    if (c.disabled) continue;
    const red = c.identifier.split("-")[0]; // instagram-standalone → instagram
    if (["instagram", "facebook", "tiktok", "x", "youtube"].includes(red) && !mapa[red]) mapa[red] = c;
  }
  return mapa;
}

/** Campos que exige cada red (documentación de Postiz → providers). */
function ajustes(p: Pieza, canal: Canal) {
  const titulo = (p.concepto || p.copy.split("\n")[0]).replace(/\s+/g, " ").trim();
  switch (p.red) {
    case "instagram":
      return { __type: canal.identifier, post_type: "post" };
    case "tiktok":
      return {
        __type: "tiktok",
        title: titulo.slice(0, 90),
        privacy_level: "PUBLIC_TO_EVERYONE",
        duet: false,
        stitch: false,
        comment: true,
        autoAddMusic: "no",
        brand_content_toggle: false,
        brand_organic_toggle: false,
        video_made_with_ai: false,
        content_posting_method: "DIRECT_POST",
      };
    case "youtube":
      return { __type: "youtube", title: titulo.slice(0, 100).padEnd(2, "."), type: "public", selfDeclaredMadeForKids: "no", tags: [] };
    default:
      return { __type: canal.identifier };
  }
}

/** Instagram, TikTok y YouTube no publican sin foto o video. */
const NECESITA_MEDIO = new Set(["instagram", "tiktok", "youtube"]);
export const SIN_MEDIO = "Falta la foto o el video";

async function programar(clave: string, p: Pieza, canal: Canal): Promise<string> {
  const imagenes: { id: string; path: string }[] = [];
  if (p.medio) {
    const datos = await leerMedio(p.medio);
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(datos)], { type: p.medioTipo ?? "" }), p.medio);
    const subido = await api<{ id: string; path: string }>(clave, "POST", "/upload", form);
    imagenes.push({ id: subido.id, path: subido.path });
  }
  // Si la hora ya pasó (PC apagado, aprobación tardía), se publica de inmediato.
  const ahora = p.fechaProgramada.getTime() <= Date.now() + 60_000;
  const r = await api<{ postId: string; integration: string }[]>(clave, "POST", "/posts", {
    type: ahora ? "now" : "schedule",
    date: (ahora ? new Date() : p.fechaProgramada).toISOString(),
    shortLink: false,
    tags: [],
    posts: [{ integration: { id: canal.id }, value: [{ content: p.copy, image: imagenes }], settings: ajustes(p, canal) }],
  });
  const id = r[0]?.postId;
  if (!id) throw new Error("Postiz no devolvió el identificador de la publicación.");
  return id;
}

type EstadoPostiz = { id: string; state?: string; error?: string | null; releaseURL?: string | null };

/**
 * n8n lo llama cada 15 min (antes de los avisos de Telegram):
 *  1. programa en Postiz lo aprobado que aún no está allá y tiene canal;
 *  2. revisa lo ya programado: publicado → la marca; error → la devuelve a Telegram.
 */
export async function sincronizarPostiz(c: Cuenta) {
  if (!publicacionHabilitada(c.fechaRetiroFirme)) return { postiz: "deshabilitado" };
  const { postiz_api_key: clave } = await leerSecretos(c.id);
  if (!clave) return { postiz: "sin clave" };
  const canales = mapaCanales(await listarCanales(clave));

  let programadas = 0;
  let omitidas = 0;
  // Sin reintentos infinitos: si Postiz ya falló con una pieza, esa sigue por Telegram.
  // La única excepción es la falta de foto/video, que se resuelve subiéndola.
  const pendientes = await db
    .select()
    .from(piezas)
    .where(
      and(
        eq(piezas.cuentaId, c.id),
        eq(piezas.estado, "aprobada"),
        isNull(piezas.postizId),
        isNull(piezas.avisadaEn),
        or(isNull(piezas.postizError), eq(piezas.postizError, SIN_MEDIO)),
      ),
    );
  for (const p of pendientes) {
    const canal = canales[p.red];
    if (!canal) continue; // esa red no está conectada en Postiz: va por Telegram
    if (NECESITA_MEDIO.has(p.red) && !p.medio) {
      omitidas++;
      if (p.postizError !== SIN_MEDIO) await db.update(piezas).set({ postizError: SIN_MEDIO }).where(eq(piezas.id, p.id));
      continue;
    }
    try {
      const id = await programar(clave, p, canal);
      await db.update(piezas).set({ postizId: id, postizError: null }).where(eq(piezas.id, p.id));
      programadas++;
    } catch (e) {
      await db.update(piezas).set({ postizError: (e as Error).message.slice(0, 300) }).where(eq(piezas.id, p.id));
    }
  }

  // Estado de lo programado cuya hora ya pasó.
  let publicadas = 0;
  let fallidas = 0;
  const enCurso = await db
    .select()
    .from(piezas)
    .where(and(eq(piezas.cuentaId, c.id), eq(piezas.estado, "aprobada"), isNotNull(piezas.postizId)));
  const vencidas = enCurso.filter((p) => p.fechaProgramada.getTime() <= Date.now());
  if (vencidas.length) {
    const desde = new Date(Math.min(...vencidas.map((p) => +p.fechaProgramada)) - 864e5).toISOString();
    const { posts = [] } = await api<{ posts?: EstadoPostiz[] }>(
      clave,
      "GET",
      `/posts?startDate=${encodeURIComponent(desde)}&endDate=${encodeURIComponent(new Date(Date.now() + 864e5).toISOString())}`,
    );
    const porId = new Map(posts.map((x) => [x.id, x]));
    for (const p of vencidas) {
      const e = porId.get(p.postizId!);
      if (e?.state === "PUBLISHED") {
        await db
          .update(piezas)
          .set({ estado: "publicada", publicadaEn: new Date(), urlPublicada: e.releaseURL ?? null, postizError: null })
          .where(eq(piezas.id, p.id));
        publicadas++;
      } else if (e?.state === "ERROR" || (!e && Date.now() - +p.fechaProgramada > 2 * 3600e3)) {
        // Falló (o desapareció de Postiz): vuelve a la publicación asistida por Telegram.
        await db
          .update(piezas)
          .set({ postizId: null, postizError: e?.error?.slice(0, 300) || "Postiz no la publicó" })
          .where(eq(piezas.id, p.id));
        fallidas++;
      }
    }
  }
  return { postiz: "ok", canales: Object.keys(canales), programadas, omitidas, publicadas, fallidas };
}
