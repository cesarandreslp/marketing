/**
 * Proveedor Claude (API de Anthropic, SDK oficial). Solo texto.
 * Sin `temperature`: los modelos 5.5 la rechazan (400); la calidad se regula con `effort`.
 */
import Anthropic from "@anthropic-ai/sdk";
import { AIError, AIProvider, Modalidad, PeticionJSON, extraerJSON } from "./provider";

type Esfuerzo = "low" | "medium" | "high";

export function crearAnthropic(apiKey: string, modelo: string, esfuerzo: Esfuerzo): AIProvider {
  const cliente = new Anthropic({ apiKey, maxRetries: 3 }); // el SDK reintenta 429/5xx solo
  return {
    nombre: `anthropic:${modelo}`,
    soporta: (m: Modalidad) => m === "texto",
    async generarJSON<T>(pet: PeticionJSON): Promise<T> {
      if (pet.archivos?.length) throw new AIError(`"${modelo}" no se usa para archivos aquí.`, "anthropic");
      const contenido =
        `${pet.prompt}\n\n` +
        (pet.esquemaHint
          ? `Responde EXCLUSIVAMENTE con JSON válido de la forma:\n${pet.esquemaHint}`
          : "Responde exclusivamente con JSON válido.");
      try {
        const r = await cliente.messages.create({
          model: modelo,
          max_tokens: pet.maxTokens ?? 16000,
          output_config: { effort: esfuerzo },
          system: pet.sistema,
          messages: [{ role: "user", content: contenido }],
        });
        if (r.stop_reason === "refusal") throw new AIError(`${modelo} rechazó la solicitud.`, "anthropic");
        if (r.stop_reason === "max_tokens") throw new AIError(`${modelo} truncó la respuesta.`, "anthropic");
        const texto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        if (!texto) throw new AIError(`${modelo} devolvió respuesta vacía.`, "anthropic");
        return extraerJSON<T>(texto);
      } catch (e) {
        // status 429/5xx → la cadena lo trata como saturación; 401/403 → clave inválida (ver lib/pruebas.ts).
        if (e instanceof Anthropic.APIError) throw new AIError(`anthropic respondió ${e.status}: ${e.message.slice(0, 300)}`, "anthropic", e.status);
        throw e;
      }
    },
  };
}
