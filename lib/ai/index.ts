/**
 * Roles de IA del radar. Cada rol es una cadena primario → respaldos; los
 * proveedores sin API key (de ESA cuenta) se omiten.
 *   - masivo:     clasificar menciones, resúmenes, borradores (GLM gratis → Gemini → Mistral)
 *   - textos:     copys finales en español y filtro de cumplimiento (Mistral → Gemini → GLM)
 *   - documentos: PDFs, actas, sesiones del Concejo (Gemini; lee archivos)
 *   - x:          escucha y tono para X (Grok → Mistral)
 */
import { leerSecretos } from "../cuenta";
import { AIError, AIProvider, PeticionJSON } from "./provider";
import { crearGemini } from "./gemini";
import { crearOpenAICompat } from "./openai";

export type Rol = "masivo" | "textos" | "documentos" | "x";

type Llaves = Awaited<ReturnType<typeof leerSecretos>>;

export function proveedores(k: Llaves) {
  return {
    zai_api_key: k.zai_api_key ? crearOpenAICompat("zai", k.zai_api_key, "glm-4.7-flash") : undefined,
    mistral_api_key: k.mistral_api_key
      ? crearOpenAICompat("mistral", k.mistral_api_key, "mistral-small-latest")
      : undefined,
    gemini_api_key: k.gemini_api_key ? crearGemini(k.gemini_api_key) : undefined,
    xai_api_key: k.xai_api_key ? crearOpenAICompat("xai", k.xai_api_key, "grok-4.3") : undefined,
  };
}

function cadena(k: Llaves, rol: Rol): AIProvider[] {
  const p = proveedores(k);
  const orden = {
    masivo: [p.zai_api_key, p.gemini_api_key, p.mistral_api_key],
    textos: [p.mistral_api_key, p.gemini_api_key, p.zai_api_key],
    documentos: [p.gemini_api_key],
    x: [p.xai_api_key, p.mistral_api_key],
  }[rol];
  return orden.filter((x): x is AIProvider => !!x);
}

/** Prueba cada proveedor del rol, con las llaves de la cuenta, hasta que uno responda. */
export async function generarJSON<T>(cuentaId: number, rol: Rol, pet: PeticionJSON): Promise<T> {
  const lista = cadena(await leerSecretos(cuentaId), rol);
  if (!lista.length) throw new Error(`Configura una API key para "${rol}" en Configuración → Modelos de IA.`);
  const errores: unknown[] = [];
  // Dos vueltas por la cadena: si todos están saturados a la vez (pasa con los
  // planes gratis), se espera un poco y se intenta de nuevo antes de rendirse.
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    if (vuelta > 0) {
      if (!errores.every(esSaturacion)) break;
      await new Promise((r) => setTimeout(r, 20_000));
    }
    for (const p of lista) {
      try {
        return await p.generarJSON<T>(pet);
      } catch (e) {
        errores.push(e);
        console.warn(`[ia:${rol}] ${p.nombre} falló:`, (e as Error).message);
      }
    }
  }
  if (errores.every(esSaturacion)) {
    throw new SaturacionError(
      `Los modelos de IA no responden por límite de uso (${lista.map((p) => p.nombre.split(":")[0]).join(", ")}). ` +
        `Si es saturación, pasa en minutos; si es la cuota diaria de un plan gratis, se renueva mañana.`,
    );
  }
  throw errores.at(-1);
}

/** Todos los modelos del rol están limitados o caídos: no tiene sentido seguir pidiendo ahora. */
export class SaturacionError extends Error {}

/** 429, 5xx o corte de red: suele pasar con esperar (o al día siguiente si es cuota diaria). */
const esSaturacion = (e: unknown) =>
  e instanceof TypeError || (e instanceof AIError && e.status !== undefined && (e.status === 429 || e.status >= 500));

export * from "./provider";
