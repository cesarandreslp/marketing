/**
 * Proveedor Gemini (Google Generative Language API) vía REST/fetch.
 * Soporta texto y visión (lee PDFs escaneados e imágenes de forma nativa).
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

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export function crearGemini(
  apiKey: string,
  // Alias estable de Google que apunta al modelo flash GA vigente. Se evita
  // fijar "gemini-2.5-flash": las cuentas nuevas reciben 404 ("no longer
  // available to new users"). Configurable con GEMINI_MODEL.
  modelo = "gemini-flash-latest",
): AIProvider {
  return {
    nombre: `gemini:${modelo}`,
    soporta(m: Modalidad) {
      void m;
      return true; // texto y visión
    },
    async generarJSON<T>(pet: PeticionJSON): Promise<T> {
      const parts: unknown[] = [];
      const instruccion =
        `${pet.prompt}\n\n` +
        (pet.esquemaHint
          ? `Devuelve EXCLUSIVAMENTE un JSON válido con esta forma:\n${pet.esquemaHint}\n`
          : "Devuelve exclusivamente JSON válido.");
      parts.push({ text: instruccion });
      for (const a of pet.archivos ?? []) {
        parts.push({ inline_data: { mime_type: a.mime, data: a.base64 } });
      }

      const generationConfig: Record<string, unknown> = {
        temperature: pet.temperatura ?? 0.1,
        responseMimeType: "application/json",
      };
      // El control de "thinking" solo existe en Gemini 2.5+/3.x; enviarlo a
      // 2.0/1.5 provoca un 400. Donde aplica se desactiva (budget 0): reduce
      // mucho la latencia (clave para el límite de 60s de Vercel) sin dañar la
      // precisión tipo-OCR.
      if (!/gemini-(1\.5|2\.0)/.test(modelo)) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }
      // Presupuesto de salida opcional (p. ej. informes largos), por paridad
      // con Groq. Sin él, Gemini usa el máximo del modelo.
      if (pet.maxTokens) generationConfig.maxOutputTokens = pet.maxTokens;
      const body = {
        systemInstruction: { parts: [{ text: pet.sistema }] },
        contents: [{ role: "user", parts }],
        generationConfig,
      };

      const url = `${BASE}/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;
      // Reintenta ante 503 ("high demand") / 429 / cortes de red, que Gemini
      // devuelve de forma intermitente en el plan gratis. Los errores
      // deterministas (400/404) no se reintentan.
      return conReintentos(async () => {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          // 429/503 pueden traer RetryInfo ("retryDelay": "5s"). En el plan
          // gratis suele ser una espera larga (cuota/min) que conReintentos no
          // honrará por superar el tope; se propaga.
          const esperaMs =
            res.status === 429 || res.status === 503
              ? parseEsperaMs(res.headers.get("retry-after"), txt)
              : undefined;
          throw new AIError(
            `Gemini respondió ${res.status}: ${txt.slice(0, 400)}`,
            "gemini",
            res.status,
            esperaMs,
          );
        }
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const texto =
          data.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("") ?? "";
        if (!texto) throw new AIError("Gemini devolvió respuesta vacía.", "gemini");
        return extraerJSON<T>(texto);
      });
    },
  };
}
