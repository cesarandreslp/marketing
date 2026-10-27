import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, piezas } from "@/lib/db";
import { cuentaDeN8n } from "@/lib/n8n";

const Body = z.object({ id: z.number().int(), url: z.string().url().nullish() });

/** n8n confirma que publicó una pieza (para no repetirla). */
export async function POST(req: Request) {
  const { cuenta, error } = await cuentaDeN8n(req);
  if (error) return error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const r = await db
    .update(piezas)
    .set({ estado: "publicada", publicadaEn: new Date(), urlPublicada: parsed.data.url })
    .where(and(eq(piezas.id, parsed.data.id), eq(piezas.cuentaId, cuenta.id), eq(piezas.estado, "aprobada")))
    .returning({ id: piezas.id });
  return Response.json({ actualizada: r.length === 1 });
}
