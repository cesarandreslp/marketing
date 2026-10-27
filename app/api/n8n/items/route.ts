import { z } from "zod";
import { db, items } from "@/lib/db";
import { cuentaDeN8n } from "@/lib/n8n";

const Item = z.object({
  fuente: z.string().min(1),
  url: z.string().url().nullish(),
  titulo: z.string().nullish(),
  texto: z.string().min(1),
  publicadoEn: z.coerce.date().nullish(),
});

/** n8n entrega lo que recolectó (RSS, Grok, YouTube, Telegram). Duplicados por URL se ignoran. */
export async function POST(req: Request) {
  const { cuenta, error } = await cuentaDeN8n(req);
  if (error) return error;
  const parsed = z.array(Item).max(500).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  if (!parsed.data.length) return Response.json({ insertados: 0 });
  const r = await db
    .insert(items)
    .values(parsed.data.map((i) => ({ ...i, cuentaId: cuenta.id })))
    .onConflictDoNothing()
    .returning({ id: items.id });
  return Response.json({ insertados: r.length });
}
