import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { cache } from "react";
import { iguales } from "./cifrado";
import { db, usuarios } from "./db";

export type Sesion = { usuarioId: number; cuentaId: number; exp: number };

export const COOKIE = "sesion";
const DURACION_S = 60 * 60 * 24 * 30;

const firma = (datos: string) =>
  createHmac("sha256", process.env.SESSION_SECRET ?? "").update(datos).digest("base64url");

/** Cookie firmada: base64url(json).firma. No guarda nada sensible, solo ids. */
export function crearToken(usuarioId: number, cuentaId: number): string {
  const datos = Buffer.from(
    JSON.stringify({ usuarioId, cuentaId, exp: Math.floor(Date.now() / 1000) + DURACION_S }),
  ).toString("base64url");
  return `${datos}.${firma(datos)}`;
}

export function leerToken(token: string | undefined): Sesion | null {
  if (!token || !process.env.SESSION_SECRET) return null;
  const [datos, f] = token.split(".");
  if (!datos || !f || !iguales(f, firma(datos))) return null;
  const s = JSON.parse(Buffer.from(datos, "base64url").toString()) as Sesion;
  return s.exp > Date.now() / 1000 ? s : null;
}

export async function iniciarSesion(usuarioId: number, cuentaId: number) {
  (await cookies()).set(COOKIE, crearToken(usuarioId, cuentaId), {
    httpOnly: true,
    sameSite: "lax",
    secure: !!process.env.APP_HTTPS, // actívalo cuando la app se sirva por https
    path: "/",
    maxAge: DURACION_S,
  });
}

export async function cerrarSesion() {
  (await cookies()).delete(COOKIE);
}

/** Úsalo en TODA página y server action privada: devuelve la cuenta del usuario o lo manda a /login. */
export async function requerirSesion(): Promise<Sesion> {
  const s = leerToken((await cookies()).get(COOKIE)?.value);
  // Firma válida no basta: el usuario o la cuenta pudieron borrarse después.
  if (!s || !(await existe(s.usuarioId, s.cuentaId))) redirect("/login");
  return s;
}

/** Una consulta por request aunque layout, página y acciones la llamen varias veces. */
const existe = cache(async (usuarioId: number, cuentaId: number) => {
  const [u] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.id, usuarioId), eq(usuarios.cuentaId, cuentaId)))
    .limit(1);
  return !!u;
});
