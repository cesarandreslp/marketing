"use server";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Ajustes, CARGOS, cuentas, db, usuarios } from "@/lib/db";
import { hashClave, sha256, verificarClave } from "@/lib/cifrado";
import { borrarSecreto, esClaveSecreto, guardarSecreto } from "@/lib/cuenta";
import { instalarFlujos } from "@/lib/n8n-flujos";
import { probarServicio, Resultado } from "@/lib/pruebas";
import { requerirSesion } from "@/lib/sesion";

const opcional = z.string().trim().transform((s) => s || null);

const Perfil = z.object({
  nombrePublico: z.string().trim().min(2),
  municipio: z.string().trim().min(2),
  departamento: z.string().trim().min(2),
  cargo: z.enum(CARGOS),
  fechaEleccion: opcional,
  fechaRetiroFirme: opcional,
});

const AJUSTES = [
  "partido", "temasPropios", "barrios", "fuentesRss", "presupuestoMensualCop",
  "facebookPagina", "instagramUsuario", "youtubeCanal", "tiktokUsuario", "xUsuario", "telegramChatId",
] as const satisfies readonly (keyof Ajustes)[];

/**
 * Guarda lo que venga en el formulario: columnas del perfil, ajustes y secretos.
 * Un secreto vacío se conserva; la casilla quitar_<clave> lo borra.
 */
export async function guardar(_: Resultado | null, form: FormData): Promise<Resultado> {
  const { cuentaId } = await requerirSesion();
  const campos = Object.fromEntries(form) as Record<string, string>;

  if ("nombrePublico" in campos) {
    const p = Perfil.safeParse(campos);
    if (!p.success) return { ok: false, msg: "Revisa nombre, municipio, departamento y cargo." };
    await db.update(cuentas).set(p.data).where(eq(cuentas.id, cuentaId));
  }

  // null (y no undefined) para que vaciar un campo lo borre al fusionar el jsonb.
  const ajustes: Record<string, string | number | null> = {};
  for (const k of AJUSTES) {
    if (!(k in campos)) continue;
    const v = campos[k].trim();
    // El ID de chat es un número (o -100… en grupos); un enlace t.me/… o un @usuario no sirve.
    if (k === "telegramChatId" && v && !/^-?\d+$/.test(v)) {
      return { ok: false, msg: "El ID del chat es un número. Déjalo vacío: se llena solo al escribirle /start al bot y pulsar Probar." };
    }
    ajustes[k] = !v ? null : k === "presupuestoMensualCop" ? Number(v.replace(/\D/g, "")) || null : v;
  }
  if (Object.keys(ajustes).length) {
    await db
      .update(cuentas)
      .set({ ajustes: sql`${cuentas.ajustes} || ${JSON.stringify(ajustes)}::jsonb` })
      .where(eq(cuentas.id, cuentaId));
  }

  for (const [k, v] of Object.entries(campos)) {
    if (esClaveSecreto(k) && v.trim()) await guardarSecreto(cuentaId, k, v.trim());
    const quitar = k.replace(/^quitar_/, "");
    if (k.startsWith("quitar_") && esClaveSecreto(quitar)) await borrarSecreto(cuentaId, quitar);
  }

  // Primera vez que se guarda la API key de n8n: instalar los flujos sin otro clic.
  if (campos.n8n_api_key?.trim()) {
    const [c] = await db.select({ ajustes: cuentas.ajustes }).from(cuentas).where(eq(cuentas.id, cuentaId));
    if (!c.ajustes.n8nFlujoId) {
      const r = await instalarFlujos(cuentaId);
      revalidatePath("/", "layout");
      return { ok: r.ok, msg: `Clave guardada. ${r.msg}` };
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, msg: "Cambios guardados." };
}

export async function probar(_: Resultado | null, form: FormData): Promise<Resultado> {
  const { cuentaId } = await requerirSesion();
  const clave = String(form.get("servicio"));
  if (!esClaveSecreto(clave)) return { ok: false, msg: "Servicio desconocido." };
  const r = await probarServicio(cuentaId, clave);
  revalidatePath("/configuracion");
  return r;
}

export async function instalar(): Promise<Resultado> {
  const { cuentaId } = await requerirSesion();
  const r = await instalarFlujos(cuentaId);
  revalidatePath("/", "layout");
  return r;
}

/** Genera una clave nueva para n8n (invalida la anterior). Solo se muestra esta vez. */
export async function generarClaveN8n(): Promise<{ clave: string }> {
  const { cuentaId } = await requerirSesion();
  const clave = randomBytes(32).toString("hex");
  await db.update(cuentas).set({ claveN8nHash: sha256(clave) }).where(eq(cuentas.id, cuentaId));
  revalidatePath("/", "layout");
  return { clave };
}

export async function cambiarClave(_: Resultado | null, form: FormData): Promise<Resultado> {
  const { usuarioId } = await requerirSesion();
  const nueva = String(form.get("nueva") ?? "");
  if (nueva.length < 10) return { ok: false, msg: "La nueva contraseña debe tener al menos 10 caracteres." };
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!u || !verificarClave(String(form.get("actual") ?? ""), u.claveHash)) {
    return { ok: false, msg: "La contraseña actual no es correcta." };
  }
  await db.update(usuarios).set({ claveHash: hashClave(nueva) }).where(eq(usuarios.id, usuarioId));
  return { ok: true, msg: "Contraseña actualizada." };
}
