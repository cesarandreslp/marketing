import { and, desc, eq, gte, sql } from "drizzle-orm";
import { generarJSON } from "./ai";
import { cuentas, db, items, resumenes } from "./db";
import { radar } from "./radar";
import { enviar, escaparHtml } from "./telegram";

type Cuenta = typeof cuentas.$inferSelect;

const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

/** Arma el resumen del día (5 viñetas) con el rol "textos" y lo envía por Telegram. */
export async function generarResumen(c: Cuenta) {
  const [menciones, temas] = await Promise.all([
    db
      .select({ fuente: items.fuente, tema: items.tema, comuna: items.comuna, emocion: items.emocion, resumen: items.resumen, url: items.url })
      .from(items)
      .where(and(eq(items.cuentaId, c.id), gte(items.relevancia, 2), gte(sql`coalesce(${items.publicadoEn}, ${items.creadoEn})`, sql`now() - interval '36 hours'`)))
      .orderBy(desc(items.relevancia))
      .limit(60),
    radar(c.id, 6),
  ]);

  let vinetas: string[];
  if (!menciones.length) {
    vinetas = [`Sin menciones relevantes sobre ${c.municipio} en las últimas 36 horas.`];
  } else {
    const r = await generarJSON<{ vinetas?: string[] }>(c.id, "textos", {
      sistema:
        `Eres el asesor de comunicaciones de ${c.nombrePublico}, que quiere darse a conocer en ${c.municipio} ` +
        `(pre-campaña: nunca sugieras pedir el voto ni presentarse como candidato). Escribes claro, breve y en español de Colombia.`,
      prompt:
        `Escribe exactamente 5 viñetas cortas (máx. 30 palabras cada una):\n` +
        `1. De qué habla hoy ${c.municipio}.\n2. Qué tema subió o se calentó esta semana.\n` +
        `3. Una queja o problema concreto que merece atención (con barrio si lo hay).\n` +
        `4. Qué emoción mueve a la gente y por qué.\n` +
        `5. Una oportunidad de contenido para hoy, propositiva y sin atacar a personas.\n` +
        (c.ajustes.temasPropios ? `Sus temas propios: ${c.ajustes.temasPropios.replace(/\n/g, ", ")}.\n` : "") +
        `\nRadar semanal: ${temas.map((t) => `${t.tema} (${t.actual} menciones, antes ${t.anterior}, ${t.negativas}% negativas, emoción: ${t.emocion})`).join("; ")}\n` +
        `\nMenciones de las últimas 36 h:\n${menciones.map((m) => `- [${m.tema}${m.comuna ? ", " + m.comuna : ""}] ${m.resumen}`).join("\n")}`,
      esquemaHint: '{"vinetas":["...","...","...","...","..."]}',
      temperatura: 0.4,
    });
    vinetas = (r.vinetas ?? []).filter(Boolean).slice(0, 5);
  }

  const fecha = hoyBogota();
  await db
    .insert(resumenes)
    .values({ cuentaId: c.id, fecha, vinetas })
    .onConflictDoUpdate({ target: [resumenes.cuentaId, resumenes.fecha], set: { vinetas, creadoEn: new Date() } });

  const html =
    `<b>Radar ${escaparHtml(c.municipio)} · ${fecha}</b>\n\n` +
    vinetas.map((v) => `• ${escaparHtml(v)}`).join("\n") +
    `\n\n<i>${menciones.length} menciones relevantes analizadas.</i>`;
  const enviado = await enviar(c, html);
  if (enviado) {
    await db.update(resumenes).set({ enviadoEn: new Date() }).where(and(eq(resumenes.cuentaId, c.id), eq(resumenes.fecha, fecha)));
  }
  return { fecha, vinetas, enviado, menciones: menciones.length };
}
