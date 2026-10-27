import { eq, sql } from "drizzle-orm";
import { generarJSON } from "./ai";
import { leerSecretos } from "./cuenta";
import { cuentas, db } from "./db";
import { guardarItems } from "./escucha";

type Cuenta = typeof cuentas.$inferSelect;

export async function telegram<T = unknown>(token: string, metodo: string, body: object = {}): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await r.json()) as { ok: boolean; result: T; description?: string };
  if (!j.ok) throw new Error(`Telegram ${metodo}: ${j.description}`);
  return j.result;
}

export const escaparHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Envía un mensaje al chat de la cuenta. Devuelve false si Telegram no está configurado. */
export async function enviar(c: Cuenta, html: string): Promise<boolean> {
  const { telegram_bot_token: token } = await leerSecretos(c.id);
  if (!token || !c.ajustes.telegramChatId) return false;
  await telegram(token, "sendMessage", {
    chat_id: c.ajustes.telegramChatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  return true;
}

type Update = {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string; file_size?: number }>;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
};

type Acciones = {
  generarResumen: (c: Cuenta) => Promise<unknown>;
  marcarPublicada: (cuentaId: number, piezaId: number) => Promise<boolean>;
};

/**
 * Lee lo que le escribiste al bot (n8n lo llama cada 2 min, sin exponer el PC):
 * capturas o textos reenviados → items de escucha; /resumen → resumen ya;
 * botón «Ya lo publiqué» → pieza publicada. Solo se atiende el chat configurado.
 */
export async function leerBot(c: Cuenta, acciones: Acciones) {
  const k = await leerSecretos(c.id);
  const token = k.telegram_bot_token;
  if (!token || !c.ajustes.telegramChatId) return { leidos: 0 };

  const updates = await telegram<Update[]>(token, "getUpdates", {
    offset: (c.ajustes.telegramOffset ?? 0) + 1,
    timeout: 0,
    allowed_updates: ["message", "callback_query"],
  });
  let guardados = 0;
  let publicadas = 0;
  for (const u of updates) {
    const q = u.callback_query;
    if (q?.message && String(q.message.chat.id) === c.ajustes.telegramChatId && q.data?.startsWith("pub:")) {
      const ok = await acciones.marcarPublicada(c.id, Number(q.data.slice(4)));
      if (ok) publicadas++;
      // Si el botón se pulsó hace rato, Telegram ya no acepta la respuesta: no importa.
      await telegram(token, "answerCallbackQuery", { callback_query_id: q.id, text: ok ? "Marcada como publicada" : "Ya estaba marcada" }).catch(() => {});
      await telegram(token, "editMessageReplyMarkup", {
        chat_id: q.message.chat.id,
        message_id: q.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: "✓ Publicada", callback_data: "listo" }]] },
      }).catch(() => {});
      continue;
    }
    const m = u.message;
    if (!m || String(m.chat.id) !== c.ajustes.telegramChatId) continue;
    const texto = (m.text ?? m.caption ?? "").trim();

    if (texto === "/start") {
      await enviar(c, "Hola. Reenvíame publicaciones o capturas de grupos de tu municipio y las sumo a la escucha. Escribe /resumen para recibir el resumen ahora.");
    } else if (texto === "/resumen") {
      await acciones.generarResumen(c);
    } else if (m.photo?.length) {
      const descripcion = k.gemini_api_key ? await leerCaptura(c.id, token, m.photo.at(-1)!.file_id) : null;
      if (!descripcion && !texto) {
        await enviar(c, "Para leer capturas necesito tu clave de Gemini (Configuración → Modelos de IA).");
        continue;
      }
      guardados += await guardarItems(c.id, [
        { fuente: "telegram", url: null, titulo: null, texto: [texto, descripcion].filter(Boolean).join("\n").slice(0, 2000), publicadoEn: new Date() },
      ]);
    } else if (texto && !texto.startsWith("/")) {
      guardados += await guardarItems(c.id, [
        { fuente: "telegram", url: null, titulo: null, texto: texto.slice(0, 2000), publicadoEn: new Date() },
      ]);
    }
  }
  if (updates.length) {
    await db
      .update(cuentas)
      .set({ ajustes: sql`${cuentas.ajustes} || ${JSON.stringify({ telegramOffset: updates.at(-1)!.update_id })}::jsonb` })
      .where(eq(cuentas.id, c.id));
  }
  if (guardados) await enviar(c, `✓ Recibido (${guardados}). Lo incluyo en la próxima escucha.`);
  return { leidos: updates.length, guardados, publicadas };
}

/** Extrae con Gemini el texto de una captura, sin datos de personas particulares. */
async function leerCaptura(cuentaId: number, token: string, fileId: string): Promise<string | null> {
  const f = await telegram<{ file_path?: string }>(token, "getFile", { file_id: fileId });
  if (!f.file_path) return null;
  const img = await fetch(`https://api.telegram.org/file/bot${token}/${f.file_path}`, { signal: AbortSignal.timeout(30_000) });
  const base64 = Buffer.from(await img.arrayBuffer()).toString("base64");
  const r = await generarJSON<{ texto?: string }>(cuentaId, "documentos", {
    sistema: "Lees capturas de pantalla de redes sociales para un análisis de opinión pública.",
    prompt:
      "Resume en 1 a 3 frases qué problema, queja u opinión expresa esta captura y de qué lugar habla. " +
      "No incluyas nombres, fotos ni datos de personas particulares.",
    esquemaHint: '{"texto":"..."}',
    archivos: [{ base64, mime: "image/jpeg" }],
  });
  return r.texto?.trim() || null;
}
