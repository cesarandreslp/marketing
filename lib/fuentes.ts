/**
 * Fuentes de la escucha. Todas oficiales/abiertas: RSS de medios, Google
 * Noticias (RSS) y X vía la búsqueda nativa de Grok. Nada de scraping.
 */
import { AIError, conReintentos, extraerJSON, parseEsperaMs } from "./ai/provider";

export type ItemNuevo = {
  fuente: string;
  url: string | null;
  titulo: string | null;
  texto: string;
  publicadoEn: Date | null;
};

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

const sinEtiquetas = (s: string) => s.replace(/<[^>]+>/g, " ");

function limpiar(s: string): string {
  const decodificado = sinEtiquetas(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).replace(
    /&(#x?[0-9a-f]+|\w+);/gi,
    (m, e: string) =>
      e[0] === "#"
        ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" ? 2 : 1), e[1] === "x" ? 16 : 10))
        : (ENTIDADES[e.toLowerCase()] ?? m),
  );
  // Segunda pasada: muchos feeds traen el HTML codificado (&lt;p&gt;).
  return sinEtiquetas(decodificado).replace(/\s+/g, " ").trim();
}

const etiqueta = (bloque: string, ...nombres: string[]) => {
  for (const n of nombres) {
    const m = bloque.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i"));
    if (m) return m[1];
  }
  return undefined;
};

/**
 * RSS 2.0 y Atom. ponytail: regex en vez de un parser XML; cubre los feeds de
 * medios y Google Noticias. Si un feed raro falla, agregar fast-xml-parser.
 */
export function parsearFeed(xml: string, fuente: string): ItemNuevo[] {
  const bloques = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  return bloques.flatMap((b) => {
    const titulo = limpiar(etiqueta(b, "title") ?? "");
    const url = limpiar(etiqueta(b, "link") ?? "") || b.match(/<link[^>]*href="([^"]+)"/i)?.[1] || null;
    const texto = limpiar(etiqueta(b, "description", "summary", "content") ?? "") || titulo;
    const fecha = limpiar(etiqueta(b, "pubDate", "published", "updated", "dc:date") ?? "");
    if (!texto) return [];
    const d = fecha ? new Date(fecha) : null;
    return [{ fuente, url, titulo: titulo || null, texto: texto.slice(0, 2000), publicadoEn: d && !isNaN(+d) ? d : null }];
  });
}

export async function leerFeed(url: string, fuente = "rss"): Promise<ItemNuevo[]> {
  const r = await fetch(url, {
    headers: { "user-agent": "RadarTerritorial/1.0 (+lector RSS)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
  return parsearFeed(await r.text(), fuente);
}

/** "Guadalajara de Buga" → también busca "Buga", que es como lo nombra la prensa. */
export function nombresMunicipio(municipio: string): string[] {
  const corto = municipio.split(/\s+de\s+/i).at(-1)!;
  return corto !== municipio ? [municipio, corto] : [municipio];
}

export function urlGoogleNoticias(municipio: string, departamento: string): string {
  const q = `(${nombresMunicipio(municipio).map((n) => `"${n}"`).join(" OR ")}) ${departamento} when:2d`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=CO&ceid=CO:es-419`;
}

/**
 * X con la herramienta x_search de Grok (Responses API). Cobra por post leído
 * (~USD 5 por 1.000), así que se pide un máximo acotado y solo 2 días.
 */
export async function buscarEnX(apiKey: string, municipio: string, departamento: string): Promise<ItemNuevo[]> {
  const desde = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const body = {
    model: "grok-4.3",
    input: [
      {
        role: "user",
        content:
          `Busca en X publicaciones de los últimos dos días sobre ${nombresMunicipio(municipio).join(" / ")} ` +
          `(${departamento}, Colombia): problemas de la ciudad, quejas, noticias locales y temas que la gente comenta. ` +
          `Máximo 25 publicaciones, priorizando las de más interacción. No incluyas nombres ni usuarios de personas ` +
          `particulares (sí de entidades y medios). Responde SOLO con JSON: ` +
          `{"posts":[{"texto":"lo que dice, resumido en una o dos frases","url":"enlace al post","fecha":"AAAA-MM-DD"}]}`,
      },
    ],
    tools: [{ type: "x_search", from_date: desde }],
  };
  return conReintentos(async () => {
    const r = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new AIError(`xai respondió ${r.status}: ${txt.slice(0, 300)}`, "xai", r.status,
        r.status === 429 ? parseEsperaMs(r.headers.get("retry-after"), txt) : undefined);
    }
    const data = (await r.json()) as {
      output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
    };
    const texto = (data.output ?? [])
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? [])
      .map((c) => c.text ?? "")
      .join("");
    const { posts = [] } = extraerJSON<{ posts?: Array<{ texto?: string; url?: string; fecha?: string }> }>(texto);
    return posts
      .filter((p) => p.texto)
      .map((p) => {
        const d = p.fecha ? new Date(`${p.fecha}T12:00:00-05:00`) : null;
        return {
          fuente: "x",
          url: p.url?.startsWith("https://") ? p.url : null,
          titulo: null,
          texto: p.texto!.slice(0, 2000),
          publicadoEn: d && !isNaN(+d) ? d : null,
        };
      });
  });
}
