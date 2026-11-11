/**
 * Lectura de redes con robots de Browse AI (API v2). El robot se entrena una vez en su panel
 * y aquí solo se corre: POST /robots/{id}/tasks y se espera el resultado con GET .../tasks/{id}.
 * Cada fila de la lista capturada se vuelve una mención. No se guardan nombres de personas.
 */
import { createHash } from "node:crypto";
import type { ItemNuevo } from "./fuentes";

const API = "https://api.browse.ai/v2";
const ESPERA_MAX_MS = 5 * 60_000; // la tarea del robot falla sola a los 15 min; aquí no se espera tanto

export const REDES_ROBOT = ["facebook", "instagram", "tiktok"] as const;
export type RedRobot = (typeof REDES_ROBOT)[number];

type Fila = Record<string, unknown>;

const dato = (f: Fila, ...nombres: string[]) => {
  for (const n of nombres) {
    const clave = Object.keys(f).find((k) => k.toLowerCase() === n);
    if (clave && typeof f[clave] === "string" && f[clave].trim() && f[clave] !== "-") return (f[clave] as string).trim();
  }
  return undefined;
};

/** Filas de `capturedLists` → menciones. Las filas sin texto (anuncios, videos) se descartan. */
export function filasAItems(listas: Record<string, Fila[]> | null | undefined, red: RedRobot, origen: string): ItemNuevo[] {
  return Object.values(listas ?? {}).flatMap((filas) =>
    (filas ?? []).flatMap((f) => {
      const texto = dato(f, "texto", "descripcion", "text", "description");
      if (!texto || texto.length < 8) return [];
      const enlace = dato(f, "enlace", "url", "link");
      // Sin enlace de la publicación, se identifica por el texto para no repetirla cada día.
      const url = enlace?.startsWith("https://") ? enlace : `${origen}#${createHash("sha1").update(texto).digest("hex").slice(0, 16)}`;
      return [{ fuente: red, url, titulo: null, texto: texto.slice(0, 2000), publicadoEn: null }];
    }),
  );
}

async function api<T>(apiKey: string, ruta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${ruta}`, {
    ...init,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(30_000),
  });
  const cuerpo = (await r.json().catch(() => ({}))) as T & { messageCode?: string };
  if (!r.ok) {
    if (cuerpo.messageCode === "credits_limit_reached") throw new Error("Browse AI: se acabaron los créditos del plan.");
    throw new Error(`Browse AI respondió ${r.status}${cuerpo.messageCode ? ` (${cuerpo.messageCode})` : ""}.`);
  }
  return cuerpo;
}

type Tarea = {
  result: { id: string; status?: string; userFriendlyError?: string | null; capturedLists?: Record<string, Fila[]> | null };
};

/** Corre el robot (opcionalmente con otra URL) y devuelve lo que capturó, ya como menciones. */
export async function leerRobot(apiKey: string, red: RedRobot, robotId: string, originUrl?: string): Promise<ItemNuevo[]> {
  const { result } = await api<Tarea>(apiKey, `/robots/${encodeURIComponent(robotId)}/tasks`, {
    method: "POST",
    body: JSON.stringify(originUrl ? { inputParameters: { originUrl } } : {}),
  });
  const limite = Date.now() + ESPERA_MAX_MS;
  for (;;) {
    await new Promise((r) => setTimeout(r, 5_000));
    const t = (await api<Tarea>(apiKey, `/robots/${encodeURIComponent(robotId)}/tasks/${result.id}`)).result;
    if (t.status === "successful") return filasAItems(t.capturedLists, red, originUrl ?? `https://browse.ai/robot/${robotId}`);
    if (t.status === "failed") throw new Error(`El robot falló: ${t.userFriendlyError ?? "sin detalle"}`);
    if (Date.now() > limite) throw new Error("El robot tardó más de 5 minutos; se reintenta en la próxima escucha.");
  }
}

/** Una línea por robot: "<red> <id del robot> [url]". Las líneas mal escritas se ignoran. */
export function leerLineasRobots(texto: string | undefined) {
  return (texto ?? "").split("\n").flatMap((l) => {
    const [red, id, url] = l.trim().split(/\s+/);
    const r = red?.toLowerCase() as RedRobot;
    return REDES_ROBOT.includes(r) && id ? [{ red: r, id, url: url && URL.canParse(url) ? url : undefined }] : [];
  });
}
