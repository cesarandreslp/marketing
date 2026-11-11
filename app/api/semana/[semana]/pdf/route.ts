import { and, eq, ne } from "drizzle-orm";
import { cuentas, db, piezas } from "@/lib/db";
import { pdfSemana } from "@/lib/pdf-semana";
import { radar } from "@/lib/radar";
import { KITS, type Kit } from "@/lib/semana";
import { requerirSesion } from "@/lib/sesion";
import { zip } from "@/lib/zip";

/** PDF de la semana (lunes AAAA-MM-DD): ?para=produccion|copys|imagenes, o «todos» = los tres en un ZIP. */
export async function GET(req: Request, { params }: { params: Promise<{ semana: string }> }) {
  const { cuentaId } = await requerirSesion();
  const { semana } = await params;
  const para = new URL(req.url).searchParams.get("para") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana)) return new Response("Semana inválida", { status: 400 });
  if (para !== "todos" && !(para in KITS)) return new Response("Documento inválido", { status: 400 });
  const [[cuenta], ps, temas] = await Promise.all([
    db.select({ nombre: cuentas.nombrePublico }).from(cuentas).where(eq(cuentas.id, cuentaId)),
    db.select().from(piezas).where(and(eq(piezas.cuentaId, cuentaId), eq(piezas.semana, semana), ne(piezas.estado, "rechazada"))),
    radar(cuentaId, 6),
  ]);
  if (!ps.length) return new Response("No hay piezas esa semana", { status: 404 });

  const kits = para === "todos" ? (Object.keys(KITS) as Kit[]) : [para as Kit];
  const pdfs = await Promise.all(kits.map(async (k) => ({ nombre: `${k}-${semana}.pdf`, datos: await pdfSemana(k, cuenta.nombre, semana, ps, temas) })));
  const [unico] = pdfs;
  const cuerpo = para === "todos" ? zip(pdfs) : unico.datos;
  return new Response(new Uint8Array(cuerpo), {
    headers: {
      "content-type": para === "todos" ? "application/zip" : "application/pdf",
      "content-disposition": `attachment; filename="${para === "todos" ? `semana-${semana}.zip` : unico.nombre}"`,
      "cache-control": "private, no-store",
    },
  });
}
