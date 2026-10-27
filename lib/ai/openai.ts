/**
 * Proveedor genérico para APIs compatibles con OpenAI (chat/completions).
 * Cubre Z.AI (GLM), Mistral y xAI (Grok): solo cambian la URL base y el modelo.
 * Solo texto (sin visión); la visión y los documentos largos van por Gemini.
 */
import {
  AIError,
  AIProvider,
  Modalidad,
  PeticionJSON,
  conReintentos,
  extraerJSON,
  parseEsperaMs,
} from "./provider";

export const BASES = {
  zai: "https://api.z.ai/api/paas/v4",
  mistral: "https://api.mistral.ai/v1",
  xai: "https://api.x.ai/v1",
} as const;

export function crearOpenAICompat(
  proveedor: keyof typeof BASES,
  apiKey: string,
  modelo: string,
): AIProvider {
  return {
    nombre: `${proveedor}:${modelo}`,
    soporta(m: Modalidad) {
      return m === "texto";
    },
    async generarJSON<T>(pet: PeticionJSON): Promise<T> {
      if (pet.archivos?.length) {
        throw new AIError(`"${modelo}" no admite archivos.`, proveedor);
      }
      const contenido =
        `${pet.prompt}\n\n` +
        (pet.esquemaHint
          ? `Responde EXCLUSIVAMENTE con JSON válido de la forma:\n${pet.esquemaHint}`
          : "Responde exclusivamente con JSON válido.");
      const maxTokens = pet.maxTokens ?? 8192;
      const body = {
        model: modelo,
        temperature: pet.temperatura ?? 0.3,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: pet.sistema },
          { role: "user", content: contenido },
        ],
        // GLM-4.7 "piensa" por defecto y a veces gasta todo el presupuesto pensando:
        // la respuesta llega vacía. Para clasificar y redactar no hace falta.
        ...(proveedor === "zai" ? { thinking: { type: "disabled" } } : {}),
      };
      return conReintentos(async () => {
        const res = await fetch(`${BASES[proveedor]}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          const esperaMs =
            res.status === 429
              ? parseEsperaMs(res.headers.get("retry-after"), txt)
              : undefined;
          throw new AIError(
            `${proveedor} respondió ${res.status}: ${txt.slice(0, 400)}`,
            proveedor,
            res.status,
            esperaMs,
          );
        }
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        };
        const choice = data.choices?.[0];
        const texto = choice?.message?.content ?? "";
        if (!texto) throw new AIError(`${proveedor} devolvió respuesta vacía.`, proveedor);
        if (choice?.finish_reason === "length") {
          throw new AIError(`${proveedor} truncó la respuesta (${maxTokens} tokens).`, proveedor);
        }
        return extraerJSON<T>(texto);
      });
    },
  };
}
