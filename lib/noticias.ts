/**
 * Completa las noticias: Google Noticias y muchos RSS solo traen el titular. Se abre la nota
 * (resolviendo el enlace de Google al del medio) y se guarda el texto. Si algo falla, queda el titular.
 */
import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { db, items } from "./db";
import { limpiar } from "./fuentes";

const UA = { "user-agent": "Mozilla/5.0 (compatible; RadarTerritorial/1.0)" };
const MAX = 3000;

/** news.google.com/rss/articles/<id> → URL del medio, con el mismo intercambio que hace la página de Google. */
async function urlReal(url: string): Promise<string> {
  if (!url.startsWith("https://news.google.com/")) return url;
  const id = new URL(url).pathname.split("/").pop()!;
  const html = await (await fetch(`https://news.google.com/articles/${id}`, { headers: UA, signal: AbortSignal.timeout(15_000) })).text();
  const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sg || !ts) throw new Error("Google no entregó la firma del enlace");
  const interno = JSON.stringify(["garturlreq", [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(ts), sg]);
  const r = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    headers: { ...UA, "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ "f.req": JSON.stringify([[["Fbv4je", interno, null, "generic"]]]) }),
    signal: AbortSignal.timeout(15_000),
  });
  const linea = (await r.text()).split("\n").find((l) => l.startsWith('[["wrb.fr"'));
  const real = linea && (JSON.parse(JSON.parse(linea)[0][2]) as unknown[])[1];
  if (typeof real !== "string" || !real.startsWith("http")) throw new Error("no se pudo resolver el enlace");
  return real;
}

/** Párrafos del artículo; si la página no los trae, la descripción (og:description). */
export function cuerpoDeNota(html: string): string {
  const parrafos = (html.replace(/<(script|style|nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ").match(/<p[\s>][\s\S]*?<\/p>/gi) ?? [])
    .map(limpiar)
    .filter((p) => p.length > 60);
  const texto = parrafos.join("\n\n");
  if (texto.length > 200) return texto.slice(0, MAX);
  const og = html.match(/<meta[^>]+(?:property="og:description"|name="description")[^>]+content="([^"]+)"/i)?.[1];
  return og ? limpiar(og) : texto;
}

/** Solo las noticias nuevas (sin clasificar): cada nota se abre una vez. */
export async function completarNoticias(cuentaId: number) {
  const pendientes = await db
    .select({ id: items.id, url: items.url, texto: items.texto })
    .from(items)
    .where(and(eq(items.cuentaId, cuentaId), isNull(items.clasificadoEn), isNotNull(items.url), inArray(items.fuente, ["noticias", "rss"])))
    .limit(60);
  let completas = 0;
  for (let i = 0; i < pendientes.length; i += 5) {
    await Promise.allSettled(
      pendientes.slice(i, i + 5).map(async (p) => {
        if (/\/\/(www\.|m\.)?(instagram|facebook|tiktok|twitter|x)\.com\//.test(p.url!)) return; // redes: el texto lo pegó el usuario
        const r = await fetch(await urlReal(p.url!), { headers: UA, signal: AbortSignal.timeout(15_000) });
        if (!r.ok) throw new Error(`${r.status}`);
        const cuerpo = cuerpoDeNota(await r.text());
        if (cuerpo.length > p.texto.length + 40) {
          await db.update(items).set({ texto: cuerpo }).where(eq(items.id, p.id));
          completas++;
        }
      }),
    );
  }
  return completas;
}
