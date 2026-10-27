import { eq } from "drizzle-orm";
import { sha256 } from "./cifrado";
import { cuentas, db } from "./db";

/**
 * n8n se identifica con "Authorization: Bearer <clave de la cuenta>". La clave
 * se genera en Configuración → Integración n8n y solo se guarda su sha256.
 * Devuelve la cuenta, o una respuesta 401.
 */
export async function cuentaDeN8n(req: Request) {
  const clave = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (clave) {
    const [c] = await db.select().from(cuentas).where(eq(cuentas.claveN8nHash, sha256(clave))).limit(1);
    if (c) return { cuenta: c, error: null };
  }
  return { cuenta: null, error: Response.json({ error: "no autorizado" }, { status: 401 }) };
}

/** Autentica, ejecuta la tarea y devuelve el error legible (n8n lo muestra en sus ejecuciones). */
export async function tareaN8n(req: Request, tarea: (c: typeof cuentas.$inferSelect) => Promise<unknown>) {
  const { cuenta, error } = await cuentaDeN8n(req);
  if (error) return error;
  try {
    return Response.json(await tarea(cuenta));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
