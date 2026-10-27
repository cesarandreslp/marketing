import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { rutaDeMedio } from "@/lib/medios";
import { requerirSesion } from "@/lib/sesion";

/** Sirve un medio de la cuenta de la sesión (para verlo o descargarlo desde la bandeja). */
export async function GET(_: Request, { params }: { params: Promise<{ nombre: string }> }) {
  const { cuentaId } = await requerirSesion();
  const m = rutaDeMedio(cuentaId, (await params).nombre);
  if (!m) return new Response("No encontrado", { status: 404 });
  const info = await stat(m.ruta).catch(() => null);
  if (!info) return new Response("No encontrado", { status: 404 });
  return new Response(Readable.toWeb(createReadStream(m.ruta)) as ReadableStream, {
    headers: { "content-type": m.mime, "content-length": String(info.size), "cache-control": "private, max-age=3600" },
  });
}
