"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cuentas, db, piezas } from "@/lib/db";
import { revisar } from "@/lib/cumplimiento";
import { editarPieza, generarSemana, rehacerPieza } from "@/lib/estratega";
import { marcarPublicada } from "@/lib/publicador";
import type { Resultado } from "@/lib/pruebas";
import { requerirSesion } from "@/lib/sesion";

async function cuenta() {
  const { cuentaId } = await requerirSesion();
  const [c] = await db.select().from(cuentas).where(eq(cuentas.id, cuentaId));
  return c;
}

const fallo = (e: unknown): Resultado => ({ ok: false, msg: (e as Error).message.slice(0, 300) });

/** Aprueba los borradores sin alertas. Las piezas con alertas esperan a que las edites o rehagas. */
export async function aprobarSemana(_: Resultado | null, form: FormData): Promise<Resultado> {
  const { cuentaId } = await requerirSesion();
  const borradores = await db
    .select()
    .from(piezas)
    .where(and(eq(piezas.cuentaId, cuentaId), eq(piezas.semana, String(form.get("semana"))), eq(piezas.estado, "borrador")));
  let aprobadas = 0;
  for (const p of borradores) {
    // Doble control: las alertas guardadas y el filtro por regex de nuevo.
    const alertas = p.alertas.length ? p.alertas : revisar(`${p.copy}\n${p.guion ?? ""}`, p.fuentes);
    if (alertas.length) {
      await db.update(piezas).set({ alertas }).where(eq(piezas.id, p.id));
      continue;
    }
    await db.update(piezas).set({ estado: "aprobada" }).where(and(eq(piezas.id, p.id), eq(piezas.cuentaId, cuentaId)));
    aprobadas++;
  }
  revalidatePath("/");
  const pendientes = borradores.length - aprobadas;
  return {
    ok: pendientes === 0,
    msg: `${aprobadas} aprobadas.` + (pendientes ? ` ${pendientes} tienen alertas: edítalas o recházalas para rehacerlas.` : ""),
  };
}

export async function generarAhora(_: Resultado | null, form: FormData): Promise<Resultado> {
  try {
    const r = await generarSemana(await cuenta(), String(form.get("semana")) || undefined);
    revalidatePath("/");
    return {
      ok: r.fallidos === 0,
      msg:
        `${r.creadas} piezas listas para revisar` +
        (r.fallidos ? `. Faltaron ${r.fallidos} de ${r.conceptos} conceptos` : "") +
        (r.detenido ? ` porque la IA llegó a su límite de uso; vuelve a generar más tarde para completarlos` : "") +
        ".",
    };
  } catch (e) {
    return fallo(e);
  }
}

export async function rechazar(_: Resultado | null, form: FormData): Promise<Resultado> {
  try {
    const motivo = String(form.get("motivo") ?? "").trim();
    const nueva = await rehacerPieza(await cuenta(), Number(form.get("id")), motivo);
    revalidatePath("/");
    return { ok: true, msg: nueva ? "Listo: nueva versión abajo." : "Descartada." };
  } catch (e) {
    return fallo(e);
  }
}

export async function marcar(_: Resultado | null, form: FormData): Promise<Resultado> {
  const { cuentaId } = await requerirSesion();
  const ok = await marcarPublicada(cuentaId, Number(form.get("id")));
  revalidatePath("/", "layout");
  return ok ? { ok: true, msg: "Marcada como publicada." } : { ok: false, msg: "Solo se marcan piezas aprobadas." };
}

export async function editar(_: Resultado | null, form: FormData): Promise<Resultado> {
  try {
    const { cuentaId } = await requerirSesion();
    const copy = String(form.get("copy") ?? "").trim();
    if (!copy) return { ok: false, msg: "El texto no puede quedar vacío." };
    await editarPieza(cuentaId, Number(form.get("id")), copy);
    revalidatePath("/");
    return { ok: true, msg: "Guardado." };
  } catch (e) {
    return fallo(e);
  }
}
