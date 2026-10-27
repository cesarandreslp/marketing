import { and, eq, ne } from "drizzle-orm";
import { db, piezas } from "@/lib/db";
import { EXTENSION, guardarMedio, MAX_BYTES } from "@/lib/medios";
import { requerirSesion } from "@/lib/sesion";

/**
 * Sube la foto o el video de un concepto. Va por ruta propia (fuera del proxy)
 * para no copiar en memoria archivos grandes; la sesión se valida aquí.
 * ponytail: el archivo entero pasa por memoria (formData); para videos de >300 MB, subir por partes.
 */
export async function POST(req: Request) {
  const { cuentaId } = await requerirSesion();
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 1024 * 1024) {
    return Response.json({ error: "El archivo pesa más de 300 MB." }, { status: 413 });
  }
  const form = await req.formData();
  const archivo = form.get("archivo");
  const id = Number(form.get("piezaId"));
  if (!(archivo instanceof File) || !archivo.size) return Response.json({ error: "Falta el archivo." }, { status: 400 });
  if (!EXTENSION[archivo.type]) return Response.json({ error: "Usa JPG, PNG, WEBP, MP4, MOV o WEBM." }, { status: 400 });
  if (archivo.size > MAX_BYTES) return Response.json({ error: "El archivo pesa más de 300 MB." }, { status: 413 });

  const [p] = await db.select().from(piezas).where(and(eq(piezas.id, id), eq(piezas.cuentaId, cuentaId)));
  if (!p) return Response.json({ error: "Pieza no encontrada." }, { status: 404 });

  const nombre = await guardarMedio(cuentaId, Buffer.from(await archivo.arrayBuffer()), archivo.type);
  // El mismo medio sirve para todas las redes del concepto (salvo lo ya publicado).
  const filtro = p.concepto
    ? and(eq(piezas.cuentaId, cuentaId), eq(piezas.semana, p.semana), eq(piezas.formato, p.formato), eq(piezas.concepto, p.concepto))
    : and(eq(piezas.cuentaId, cuentaId), eq(piezas.id, p.id));
  const r = await db
    .update(piezas)
    .set({ medio: nombre, medioTipo: archivo.type })
    .where(and(filtro, ne(piezas.estado, "publicada")))
    .returning({ id: piezas.id });
  return Response.json({ ok: true, medio: nombre, piezas: r.length });
}
