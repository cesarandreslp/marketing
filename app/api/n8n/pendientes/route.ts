import { and, eq, lte } from "drizzle-orm";
import { db, piezas } from "@/lib/db";
import { publicacionHabilitada } from "@/lib/cumplimiento";
import { cuentaDeN8n } from "@/lib/n8n";

/**
 * n8n consulta cada 15 min. Devuelve lo aprobado cuya hora ya llegó, incluido
 * lo que quedó atrasado si el PC estuvo apagado. Nada antes del retiro en firme.
 */
export async function GET(req: Request) {
  const { cuenta, error } = await cuentaDeN8n(req);
  if (error) return error;
  if (!publicacionHabilitada(cuenta)) return Response.json({ habilitado: false, piezas: [] });
  const lista = await db
    .select()
    .from(piezas)
    .where(
      and(eq(piezas.cuentaId, cuenta.id), eq(piezas.estado, "aprobada"), lte(piezas.fechaProgramada, new Date())),
    )
    .orderBy(piezas.fechaProgramada);
  return Response.json({ habilitado: true, piezas: lista });
}
