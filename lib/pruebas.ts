import { eq, sql } from "drizzle-orm";
import { AIError, proveedores } from "./ai";
import { listarCanales, mapaCanales } from "./postiz";
import { ClaveSecreto, leerSecretos } from "./cuenta";
import { cuentas, db } from "./db";

export type Resultado = { ok: boolean; msg: string };

/** Prueba con una llamada mínima que la clave guardada de la cuenta funciona. */
export async function probarServicio(cuentaId: number, clave: ClaveSecreto): Promise<Resultado> {
  const k = await leerSecretos(cuentaId);
  const valor = k[clave];
  if (!valor) return { ok: false, msg: "Primero guarda la clave." };
  const [cuenta] = await db.select().from(cuentas).where(eq(cuentas.id, cuentaId));
  try {
    switch (clave) {
      case "zai_api_key":
      case "mistral_api_key":
      case "gemini_api_key":
      case "xai_api_key": {
        await proveedores(k)[clave]!.generarJSON({
          sistema: "Eres una prueba de conexión.",
          prompt: 'Devuelve {"ok": true}',
          maxTokens: 50,
        });
        return { ok: true, msg: "Conexión correcta." };
      }
      case "postiz_api_key": {
        const canales = mapaCanales(await listarCanales(valor));
        const redes = Object.entries(canales).map(([red, c]) => `${red} (${c!.name})`);
        return redes.length
          ? { ok: true, msg: `Conectado. Publicará solo en: ${redes.join(", ")}.` }
          : { ok: true, msg: "Conectado, pero aún no hay redes conectadas en Postiz. Agrégalas allá con «Add Channel»." };
      }
      case "n8n_api_key": {
        const r = await fetch(`${process.env.N8N_URL || "http://localhost:5678"}/api/v1/workflows?limit=1`, {
          headers: { "x-n8n-api-key": valor, accept: "application/json" },
        });
        return r.ok ? { ok: true, msg: "n8n acepta la clave." } : { ok: false, msg: `n8n respondió ${r.status}. Revisa la clave.` };
      }
      case "telegram_bot_token": {
        const api = (m: string, body?: object) =>
          fetch(`https://api.telegram.org/bot${valor}/${m}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body ?? {}),
          }).then((r) => r.json());
        let chatId = cuenta.ajustes.telegramChatId;
        if (!chatId) {
          // Detecta el chat del último mensaje que el usuario le envió al bot.
          const u = await api("getUpdates");
          if (!u.ok) return { ok: false, msg: u.description ?? "Token inválido." };
          chatId = String(u.result?.at(-1)?.message?.chat?.id ?? "");
          if (!chatId) return { ok: false, msg: "Escríbele /start a tu bot en Telegram y vuelve a probar." };
          await db
            .update(cuentas)
            .set({ ajustes: sql`${cuentas.ajustes} || ${JSON.stringify({ telegramChatId: chatId })}::jsonb` })
            .where(eq(cuentas.id, cuentaId));
        }
        const m = await api("sendMessage", { chat_id: chatId, text: "✅ Radar Territorial conectado. Aquí recibirás tu resumen diario." });
        return m.ok ? { ok: true, msg: "Te enviamos un mensaje de prueba." } : { ok: false, msg: m.description ?? "No se pudo enviar." };
      }
    }
  } catch (e) {
    const status = e instanceof AIError ? e.status : undefined;
    if (status === 401 || status === 403) return { ok: false, msg: "La clave no es válida o fue revocada. Revisa que la copiaste completa." };
    if (status === 429) return { ok: false, msg: "La clave funciona, pero alcanzaste el límite de uso o no tienes saldo." };
    if (e instanceof TypeError) return { ok: false, msg: "Sin conexión a internet o el servicio no responde." };
    return { ok: false, msg: (e as Error).message.slice(0, 200) };
  }
}
