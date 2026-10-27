import { and, eq, sql } from "drizzle-orm";
import { cifrar, descifrar } from "./cifrado";
import { CARGOS, db, secretos, usuarios } from "./db";

/**
 * Todo lo secreto que cada cliente debe ingresar con SUS propias cuentas.
 * Así el costo de IA, los límites de uso y las redes son de cada quien.
 */
export const SECRETOS = {
  zai_api_key: { grupo: "ia", etiqueta: "Z.AI (GLM)", ayuda: "Gratis con GLM-4.7-Flash. Trabajo masivo.", url: "https://z.ai/manage-apikey/apikey-list" },
  mistral_api_key: { grupo: "ia", etiqueta: "Mistral", ayuda: "Textos finales en español y filtro.", url: "https://console.mistral.ai/api-keys" },
  gemini_api_key: { grupo: "ia", etiqueta: "Google Gemini", ayuda: "Documentos largos, PDFs y sesiones del Concejo. Tiene capa gratis.", url: "https://aistudio.google.com/apikey" },
  xai_api_key: { grupo: "ia", etiqueta: "xAI (Grok)", ayuda: "Escucha en X con búsqueda nativa.", url: "https://console.x.ai" },
  n8n_api_key: { grupo: "n8n", etiqueta: "API key de n8n", ayuda: "En n8n: Settings → n8n API → Create an API key. Permite instalar los flujos con un clic.", url: "/automatizaciones?ruta=/settings/api" },
  postiz_api_key: { grupo: "redes", etiqueta: "API key de Postiz", ayuda: "En Postiz: Settings → Public API → copia la clave. Permite que la app programe las piezas aprobadas.", url: "http://localhost:4007/settings" },
  telegram_bot_token: { grupo: "avisos", etiqueta: "Token del bot de Telegram", ayuda: "Créalo con @BotFather. Resumen diario y aprobaciones rápidas.", url: "https://t.me/BotFather" },
} as const;

export type ClaveSecreto = keyof typeof SECRETOS;
export const esClaveSecreto = (k: string): k is ClaveSecreto => k in SECRETOS;

export async function guardarSecreto(cuentaId: number, clave: ClaveSecreto, valor: string) {
  const fila = { cuentaId, clave, valor: cifrar(valor), ultimos4: valor.slice(-4), actualizadoEn: new Date() };
  await db
    .insert(secretos)
    .values(fila)
    .onConflictDoUpdate({ target: [secretos.cuentaId, secretos.clave], set: fila });
}

export async function borrarSecreto(cuentaId: number, clave: ClaveSecreto) {
  await db.delete(secretos).where(and(eq(secretos.cuentaId, cuentaId), eq(secretos.clave, clave)));
}

/** Solo metadatos (para la pantalla): qué está configurado y sus últimos 4 caracteres. */
export async function estadoSecretos(cuentaId: number) {
  const filas = await db
    .select({ clave: secretos.clave, ultimos4: secretos.ultimos4, actualizadoEn: secretos.actualizadoEn })
    .from(secretos)
    .where(eq(secretos.cuentaId, cuentaId));
  return new Map(filas.map((f) => [f.clave, f]));
}

/** Valores descifrados, solo para uso en el servidor (llamadas a APIs). */
export async function leerSecretos(cuentaId: number): Promise<Partial<Record<ClaveSecreto, string>>> {
  const filas = await db.select().from(secretos).where(eq(secretos.cuentaId, cuentaId));
  return Object.fromEntries(filas.filter((f) => esClaveSecreto(f.clave)).map((f) => [f.clave, descifrar(f.valor)]));
}

export const NOMBRES_CARGO: Record<(typeof CARGOS)[number], string> = {
  concejo: "Concejo municipal",
  alcaldia: "Alcaldía",
  asamblea: "Asamblea departamental",
  gobernacion: "Gobernación",
};

/** La primera cuenta siempre se puede crear. Para vender la app con registro libre: REGISTRO_ABIERTO=1. */
export async function registroAbierto() {
  if (process.env.REGISTRO_ABIERTO === "1") return true;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(usuarios);
  return n === 0;
}
