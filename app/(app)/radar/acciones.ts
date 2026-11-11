"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { limpiarEnlace } from "@/lib/browseai";
import { cuentas, db, items } from "@/lib/db";
import { clasificar, escuchar, guardarItems } from "@/lib/escucha";
import type { Resultado } from "@/lib/pruebas";
import { createHash } from "node:crypto";
import { generarResumen } from "@/lib/resumen";
import { requerirSesion } from "@/lib/sesion";

async function cuenta() {
  const { cuentaId } = await requerirSesion();
  const [c] = await db.select().from(cuentas).where(eq(cuentas.id, cuentaId));
  return c;
}

/** Lo mismo que hace n8n a las 5:00, a demanda. */
export async function escucharAhora(): Promise<Resultado> {
  try {
    const r = await escuchar(await cuenta());
    revalidatePath("/radar");
    const errores = Object.entries(r.porFuente).filter(([, v]) => typeof v === "string");
    const falloIA = "errorClasificacion" in r ? r.errorClasificacion : null;
    return {
      ok: errores.length === 0 && !falloIA,
      msg:
        `${r.nuevos} menciones nuevas, ${r.clasificados} clasificadas` +
        (r.pendientes > 0 ? `, ${r.pendientes} quedan para la próxima ronda` : "") +
        (falloIA ? `. No se pudo clasificar: ${falloIA.replace(/\.+$/, "")}` : "") +
        (errores.length ? `. Fallaron: ${errores.map(([k, v]) => `${k} (${v})`).join("; ")}` : "."),
    };
  } catch (e) {
    return { ok: false, msg: (e as Error).message.slice(0, 300) };
  }
}

export async function resumenAhora(): Promise<Resultado> {
  try {
    const r = await generarResumen(await cuenta());
    revalidatePath("/radar");
    return { ok: true, msg: r.enviado ? "Resumen enviado a tu Telegram." : "Resumen listo (Telegram no está conectado)." };
  } catch (e) {
    return { ok: false, msg: (e as Error).message.slice(0, 300) };
  }
}

const ORIGENES = ["instagram", "facebook", "tiktok", "x", "rss", "manual", "competencia"];

/** Lo que ves y la escucha no alcanzó: se pega el texto (y el enlace) y entra como una mención más. */
export async function pegarMencion(_: Resultado | null, f: FormData): Promise<Resultado> {
  try {
    const c = await cuenta();
    const texto = String(f.get("texto") ?? "").trim();
    const enlace = String(f.get("enlace") ?? "").trim();
    const origen = ORIGENES.includes(String(f.get("origen"))) ? String(f.get("origen")) : "manual";
    const dia = String(f.get("fecha") ?? "");
    const competidor = String(f.get("competidor") ?? "").trim();
    if (origen === "competencia" && !competidor) return { ok: false, msg: "Escribe el nombre del competidor." };
    if (texto.length < 20) return { ok: false, msg: "Pega el texto completo de la publicación o nota (mínimo 20 caracteres)." };
    if (enlace && !(enlace.startsWith("https://") && URL.canParse(enlace))) return { ok: false, msg: "El enlace debe empezar por https://" };
    // Sin enlace se identifica por el texto (no se repite) y queda sin fuente verificable.
    const url = enlace ? limpiarEnlace(enlace) : `manual#${createHash("sha1").update(texto).digest("hex").slice(0, 16)}`;
    const nueva = await guardarItems(c.id, [
      { fuente: origen, url, titulo: origen === "competencia" ? competidor : null, texto: texto.slice(0, 3000), publicadoEn: /^\d{4}-\d{2}-\d{2}$/.test(dia) ? new Date(`${dia}T12:00:00-05:00`) : null },
    ]);
    if (!nueva) return { ok: false, msg: "Esa publicación ya estaba en el Radar." };
    await clasificar(c).catch(() => {});
    // La pegaste porque importa: la IA la ordena por tema, pero no la descarta como irrelevante.
    await db.update(items).set({ relevancia: sql`greatest(coalesce(${items.relevancia}, 0), 2)` }).where(and(eq(items.cuentaId, c.id), eq(items.url, url)));
    revalidatePath("/radar");
    return { ok: true, msg: enlace ? "Agregada al Radar." : "Agregada al Radar, pero sin enlace no se usará para armar contenido." };
  } catch (e) {
    return { ok: false, msg: (e as Error).message.slice(0, 300) };
  }
}
