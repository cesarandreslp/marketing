/**
 * Publicación asistida: a la hora de cada pieza aprobada, Telegram te manda el
 * texto listo (y la foto o el video) con un botón «Ya lo publiqué». Funciona
 * igual para todas las redes y no necesita permisos especiales de ninguna.
 * Cuando haya página de Facebook + Instagram profesional, esas redes pueden
 * pasar a publicarse solas desde n8n sin cambiar este flujo.
 */
import { and, eq, isNull, lte } from "drizzle-orm";
import { publicacionHabilitada } from "./cumplimiento";
import { leerSecretos } from "./cuenta";
import { cuentas, db, piezas } from "./db";
import { leerMedio } from "./medios";
import { escaparHtml, telegram } from "./telegram";

type Cuenta = typeof cuentas.$inferSelect;
type Pieza = typeof piezas.$inferSelect;

const RED: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube Shorts", x: "X" };
const FORMATO: Record<string, string> = { video: "Video", carrusel: "Carrusel", post_x: "Post" };
const LIMITE_TELEGRAM = 50 * 1024 * 1024; // los bots no pueden enviar archivos más grandes

export const botonPublicada = (id: number) => ({ inline_keyboard: [[{ text: "✅ Ya lo publiqué", callback_data: `pub:${id}` }]] });

/** Envía el archivo (si cabe) y luego el texto con el botón. Devuelve false si Telegram no está listo. */
async function avisar(c: Cuenta, token: string, p: Pieza) {
  const chat = c.ajustes.telegramChatId!;
  let nota = "";
  if (p.medio) {
    const datos = await leerMedio(p.medio).catch(() => null);
    if (!datos) nota = "\n\n⚠ No encontré el archivo en el PC; súbelo de nuevo en la app.";
    else if (datos.length > LIMITE_TELEGRAM) nota = "\n\n📎 El video pesa más de 50 MB: descárgalo desde la bandeja de la app.";
    else {
      const esVideo = p.medioTipo?.startsWith("video/");
      const form = new FormData();
      form.set("chat_id", chat);
      form.set(esVideo ? "video" : "photo", new Blob([new Uint8Array(datos)], { type: p.medioTipo ?? "" }), p.medio);
      const r = await fetch(`https://api.telegram.org/bot${token}/${esVideo ? "sendVideo" : "sendPhoto"}`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      if (!r.ok) nota = "\n\n⚠ No pude adjuntar el archivo; descárgalo desde la bandeja de la app.";
    }
  } else if (p.formato !== "post_x") {
    nota = "\n\n📎 Esta pieza no tiene foto o video cargado: súbelo en la bandeja o publícalo con el tuyo.";
  }
  const hora = p.fechaProgramada.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" });
  await telegram(token, "sendMessage", {
    chat_id: chat,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    text:
      `📣 <b>Hora de publicar en ${RED[p.red] ?? p.red}</b> · ${FORMATO[p.formato] ?? p.formato} · ${hora}\n` +
      (p.concepto ? `<i>${escaparHtml(p.concepto)}</i>\n` : "") +
      `\nCopia este texto:\n\n${escaparHtml(p.copy)}${nota}\n\n` +
      `Cuando lo publiques, pulsa el botón (se confirma en 1–2 minutos).`,
    reply_markup: botonPublicada(p.id),
  });
}

/** n8n lo llama cada 15 min. Avisa lo aprobado cuya hora ya llegó (incluye lo atrasado si el PC estuvo apagado). */
export async function avisarPendientes(c: Cuenta) {
  if (!publicacionHabilitada(c.fechaRetiroFirme)) return { habilitado: false, avisadas: 0 };
  const { telegram_bot_token: token } = await leerSecretos(c.id);
  if (!token || !c.ajustes.telegramChatId) return { habilitado: true, avisadas: 0, motivo: "Telegram no está conectado" };

  const listas = await db
    .select()
    .from(piezas)
    // Lo programado en Postiz se publica solo: no se avisa por Telegram.
    .where(
      and(
        eq(piezas.cuentaId, c.id),
        eq(piezas.estado, "aprobada"),
        isNull(piezas.avisadaEn),
        isNull(piezas.postizId),
        lte(piezas.fechaProgramada, new Date()),
      ),
    )
    .orderBy(piezas.fechaProgramada)
    .limit(10); // tope por ronda para no inundar el chat tras días apagado
  let avisadas = 0;
  for (const p of listas) {
    try {
      await avisar(c, token, p);
      await db.update(piezas).set({ avisadaEn: new Date() }).where(eq(piezas.id, p.id));
      avisadas++;
    } catch (e) {
      console.warn(`[publicador] aviso de la pieza ${p.id} falló:`, (e as Error).message);
    }
  }
  return { habilitado: true, avisadas };
}

/** Marca como publicada (desde Telegram o desde la app). Solo piezas aprobadas de la cuenta. */
export async function marcarPublicada(cuentaId: number, piezaId: number, url?: string | null) {
  const r = await db
    .update(piezas)
    .set({ estado: "publicada", publicadaEn: new Date(), urlPublicada: url ?? null })
    .where(and(eq(piezas.id, piezaId), eq(piezas.cuentaId, cuentaId), eq(piezas.estado, "aprobada")))
    .returning({ id: piezas.id });
  return r.length === 1;
}
