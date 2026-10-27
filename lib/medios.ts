import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/** Fotos y videos en disco, junto al proyecto (datos/medios). Un archivo por concepto. */
export const CARPETA = join(process.cwd(), "datos", "medios");
export const MAX_BYTES = 300 * 1024 * 1024;

export const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};
const MIME = Object.fromEntries(Object.entries(EXTENSION).map(([m, e]) => [e, m]));

/** Nombre "<cuentaId>-<uuid>.<ext>": la cuenta va en el nombre y se valida al servirlo. */
const NOMBRE = /^(\d+)-[0-9a-f-]{36}\.([a-z0-9]+)$/;

export async function guardarMedio(cuentaId: number, datos: Buffer, mime: string): Promise<string> {
  const nombre = `${cuentaId}-${randomUUID()}.${EXTENSION[mime]}`;
  await mkdir(CARPETA, { recursive: true });
  await writeFile(join(CARPETA, nombre), datos);
  return nombre;
}

/** null si el nombre no es válido o no pertenece a la cuenta (evita leer archivos ajenos o rutas raras). */
export function rutaDeMedio(cuentaId: number, nombre: string): { ruta: string; mime: string } | null {
  const m = nombre.match(NOMBRE);
  if (!m || Number(m[1]) !== cuentaId || !MIME[m[2]]) return null;
  return { ruta: join(CARPETA, nombre), mime: MIME[m[2]] };
}

export const leerMedio = (nombre: string) => readFile(join(CARPETA, nombre));
