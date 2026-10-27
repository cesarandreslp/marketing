import Link from "next/link";
import { and, eq, ne } from "drizzle-orm";
import { db, piezas, ESTADOS } from "@/lib/db";
import { proximoLunes } from "@/lib/estratega";
import { requerirSesion } from "@/lib/sesion";

export const dynamic = "force-dynamic";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const RED: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", x: "X" };
const FORMATO: Record<string, string> = { video: "Video", carrusel: "Carrusel", post_x: "Post" };
const ESTILO: Record<(typeof ESTADOS)[number], string> = {
  borrador: "border-borde bg-superficie",
  aprobada: "border-ok/40 bg-ok-fondo",
  rechazada: "border-borde bg-superficie opacity-50",
  publicada: "border-marca/40 bg-marca/10",
};

const sumarDias = (lunes: string, n: number) => {
  const d = new Date(`${lunes}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaBogota = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const horaBogota = (d: Date) => d.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" });

/** Lunes de la semana en curso (Bogotá). */
const esteLunes = () => sumarDias(proximoLunes(), -7);

export default async function Calendario({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const { cuentaId } = await requerirSesion();
  const { semana: pedida } = await searchParams;
  const semana = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : proximoLunes();

  const lista = await db
    .select()
    .from(piezas)
    .where(and(eq(piezas.cuentaId, cuentaId), eq(piezas.semana, semana), ne(piezas.estado, "rechazada")))
    .orderBy(piezas.fechaProgramada);
  const porDia = Map.groupBy(lista, (p) => diaBogota(p.fechaProgramada));
  const hoy = diaBogota(new Date());
  const cuenta = (e: string) => lista.filter((p) => p.estado === e).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Calendario de publicaciones</h1>
          <p className="text-sm text-suave">
            Semana del {new Date(`${semana}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long" })} ·{" "}
            {lista.length} piezas · {cuenta("aprobada")} aprobadas · {cuenta("borrador")} por revisar · {cuenta("publicada")} publicadas
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/calendario?semana=${sumarDias(semana, -7)}`} className="btn">← Anterior</Link>
          <Link href={`/calendario?semana=${esteLunes()}`} className="btn">Esta semana</Link>
          <Link href={`/calendario?semana=${sumarDias(semana, 7)}`} className="btn">Siguiente →</Link>
        </div>
      </div>

      {lista.length === 0 && (
        <p className="tarjeta text-center text-sm text-suave">
          No hay piezas para esta semana. <Link href="/" className="text-marca underline">Genera la semana en la Bandeja</Link>.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-7">
        {DIAS.map((nombre, i) => {
          const fecha = sumarDias(semana, i);
          const ps = porDia.get(fecha) ?? [];
          return (
            <section key={fecha} className={`rounded-xl border p-2 ${fecha === hoy ? "border-marca" : "border-borde"}`}>
              <h2 className="mb-2 px-1 text-sm font-medium">
                {nombre} <span className="text-suave">{Number(fecha.slice(8))}</span>
              </h2>
              <ul className="space-y-2">
                {ps.map((p) => (
                  <li key={p.id}>
                    <Link href="/" className={`block rounded-lg border p-2 text-xs hover:brightness-95 ${ESTILO[p.estado]}`}>
                      <div className="flex justify-between gap-1">
                        <span className="font-semibold">{horaBogota(p.fechaProgramada)}</span>
                        <span className="text-suave">
                          {p.estado === "publicada" ? "●" : p.postizId ? "🤖" : p.estado === "aprobada" ? "✓" : "…"}
                        </span>
                      </div>
                      <p className="mt-0.5">{RED[p.red] ?? p.red} · {FORMATO[p.formato] ?? p.formato}</p>
                      {p.concepto && <p className="mt-0.5 line-clamp-2 text-suave">{p.concepto}</p>}
                    </Link>
                  </li>
                ))}
                {ps.length === 0 && <li className="px-1 text-xs text-suave">—</li>}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="text-xs text-suave">✓ aprobada (aviso por Telegram) · 🤖 programada en Postiz · … por revisar · ● publicada. Horas en hora de Colombia.</p>
    </div>
  );
}
