import { tareaN8n } from "@/lib/n8n";
import { sincronizarPostiz } from "@/lib/postiz";
import { avisarPendientes } from "@/lib/publicador";

/**
 * Cada 15 min: primero Postiz (programa lo aprobado y revisa lo publicado),
 * luego Telegram avisa lo que Postiz no publica (red sin canal, falta medio o error).
 * Si Postiz falla entero, los avisos siguen funcionando igual.
 */
export const POST = (req: Request) =>
  tareaN8n(req, async (c) => {
    const postiz = await sincronizarPostiz(c).catch((e: Error) => ({ postiz: "error", error: e.message }));
    const avisos = await avisarPendientes(c);
    return { postiz, avisos };
  });
