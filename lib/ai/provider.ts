/**
 * Capa de proveedor de IA intercambiable.
 *
 * Objetivo: que el resto de la app no dependa de un proveedor concreto.
 * Hoy soporta Gemini (Google) y Groq (OpenAI-compatible). Gemini se usa por
 * defecto para VISIÓN (lee PDFs escaneados e imágenes de forma nativa); Groq
 * es excelente para razonamiento de texto rápido y barato.
 *
 * Mañana se puede añadir Claude/OpenAI implementando la misma interfaz.
 */

export type Modalidad = "texto" | "vision";

export interface EntradaArchivo {
  /** Datos en base64 (sin prefijo data:). */
  base64: string;
  /** MIME, p. ej. application/pdf, image/png. */
  mime: string;
}

export interface PeticionJSON {
  /** Instrucción del sistema (rol experto). */
  sistema: string;
  /** Prompt del usuario. */
  prompt: string;
  /** Archivos adjuntos para modalidad visión. */
  archivos?: EntradaArchivo[];
  /** Esquema esperado (se inyecta en el prompt como guía). */
  esquemaHint?: string;
  /** temperatura 0..1 */
  temperatura?: number;
  /**
   * Máximo de tokens de salida. Importante cuando la respuesta JSON es larga
   * (p. ej. muchos comentarios por partida): si el modelo se queda sin tokens
   * antes de cerrar el JSON, el modo JSON estricto rechaza el documento.
   */
  maxTokens?: number;
}

export interface AIProvider {
  nombre: string;
  soporta(modalidad: Modalidad): boolean;
  /** Devuelve JSON ya parseado (el proveedor fuerza salida JSON). */
  generarJSON<T = unknown>(pet: PeticionJSON): Promise<T>;
}

/** Error de IA con contexto de proveedor. */
export class AIError extends Error {
  constructor(
    message: string,
    public proveedor: string,
    public status?: number,
    /** Espera sugerida por el proveedor (cabecera Retry-After / RetryInfo). */
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = "AIError";
  }
}

/**
 * Interpreta la espera sugerida por el proveedor ante un 429/503:
 * - Cabecera `Retry-After` (segundos).
 * - Cuerpo de Groq: "Please try again in 6.344s".
 * - Cuerpo de Gemini: `"retryDelay": "5s"` dentro de RetryInfo.
 * Devuelve milisegundos, o undefined si no hay pista.
 */
export function parseEsperaMs(
  header: string | null,
  cuerpo: string,
): number | undefined {
  if (header && /^\d+(\.\d+)?$/.test(header.trim())) {
    return Math.round(parseFloat(header) * 1000);
  }
  const m =
    cuerpo.match(/try again in\s+([\d.]+)\s*s/i) ||
    cuerpo.match(/"retryDelay":\s*"([\d.]+)s"/i);
  return m ? Math.round(parseFloat(m[1]) * 1000) : undefined;
}

/**
 * Códigos HTTP transitorios de servidor (saturación / caídas momentáneas) que
 * sí merecen reintento con backoff: Gemini devuelve 503 ("high demand") de
 * forma intermitente y suele resolverse al reintentar.
 */
const CODIGOS_TRANSITORIOS = new Set([408, 500, 502, 503, 504]);

/**
 * Espera máxima que aceptamos honrar ante un 429 con Retry-After. La app corre
 * en el PC (sin el límite de 60 s de serverless), así que se puede esperar.
 * Por encima de este tope es cuota agotada (p. ej. diaria): no se reintenta.
 */
const ESPERA_MAX_429_MS = 30_000;

/** Decide si reintentar y, si aplica, cuánto esperar (ms). */
function planReintento(err: unknown): { reintentar: boolean; esperaMs?: number } {
  if (err instanceof AIError) {
    if (err.status === 429) {
      // Sin pista (Mistral, Z.AI): saturación o límite por minuto de los planes
      // gratis → backoff normal. Con pista larga: cuota agotada → no insistir.
      if (err.retryAfterMs == null) return { reintentar: true };
      return err.retryAfterMs <= ESPERA_MAX_429_MS
        ? { reintentar: true, esperaMs: err.retryAfterMs }
        : { reintentar: false };
    }
    return {
      reintentar: err.status !== undefined && CODIGOS_TRANSITORIOS.has(err.status),
    };
  }
  // fetch() rechaza con TypeError ("fetch failed") ante cortes de red/DNS.
  return { reintentar: err instanceof TypeError };
}

/**
 * Ejecuta `fn` reintentando ante errores transitorios: 5xx/red/429 con backoff
 * exponencial + jitter (~2.5 s, 5 s, 10 s), y 429 honrando la espera sugerida
 * por el proveedor (Retry-After) si es corta. Los deterministas (400/404, JSON
 * inválido, truncación por tokens, cuota larga) se propagan al primer intento.
 *
 * Intentos por defecto: 4 (configurable con AI_MAX_RETRIES).
 */
export async function conReintentos<T>(
  fn: () => Promise<T>,
  opts: { intentos?: number; baseMs?: number } = {},
): Promise<T> {
  const intentos = Math.max(1, opts.intentos ?? (Number(process.env.AI_MAX_RETRIES) || 4));
  const baseMs = opts.baseMs ?? 2500;
  let ultimo: unknown;
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      const { reintentar, esperaMs } = planReintento(e);
      if (i === intentos - 1 || !reintentar) throw e;
      const espera =
        esperaMs != null
          ? esperaMs + 250 + Math.random() * 250 // honrar Retry-After + jitter
          : Math.round(baseMs * 2 ** i * (0.7 + Math.random() * 0.6)); // backoff
      await new Promise((r) => setTimeout(r, espera));
    }
  }
  throw ultimo;
}

/** Extrae el primer bloque JSON de un texto (por si el modelo lo envuelve). */
export function extraerJSON<T = unknown>(texto: string): T {
  const limpio = texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  try {
    return JSON.parse(limpio) as T;
  } catch {
    const m = limpio.match(/[[{][\s\S]*[\]}]/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("La respuesta de IA no contenía JSON válido.");
  }
}
