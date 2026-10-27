"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cuentas, db } from "@/lib/db";
import { escuchar } from "@/lib/escucha";
import type { Resultado } from "@/lib/pruebas";
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
