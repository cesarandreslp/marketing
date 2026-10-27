import Link from "next/link";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, items, resumenes } from "@/lib/db";
import { radar } from "@/lib/radar";
import { requerirSesion } from "@/lib/sesion";
import { BotonAccion } from "../configuracion/ui";
import { escucharAhora, resumenAhora } from "./acciones";

export const dynamic = "force-dynamic";

const FUENTE: Record<string, string> = { noticias: "Noticias", rss: "Medio local", x: "X", telegram: "Captura", youtube: "YouTube" };

function Tendencia({ actual, anterior }: { actual: number; anterior: number }) {
  if (anterior === 0) return <span className="text-xs text-marca">nuevo</span>;
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  if (Math.abs(pct) < 10) return <span className="text-xs text-suave">= estable</span>;
  return pct > 0 ? <span className="text-xs font-medium text-marca">↑ {pct}%</span> : <span className="text-xs text-suave">↓ {-pct}%</span>;
}

const tipo = (s: string) => s[0].toUpperCase() + s.slice(1);
const menciones = (n: number) => `${n} ${n === 1 ? "mención" : "menciones"}`;

export default async function Radar({ searchParams }: { searchParams: Promise<{ tema?: string }> }) {
  const { cuentaId } = await requerirSesion();
  const { tema } = await searchParams;
  const hace7 = sql`now() - interval '7 days'`;
  const fecha = sql`coalesce(${items.publicadoEn}, ${items.creadoEn})`;

  const [ranking, [ultimo], recientes, [{ total, pendientes }]] = await Promise.all([
    radar(cuentaId),
    db.select().from(resumenes).where(eq(resumenes.cuentaId, cuentaId)).orderBy(desc(resumenes.fecha)).limit(1),
    db
      .select()
      .from(items)
      .where(and(eq(items.cuentaId, cuentaId), gte(items.relevancia, 1), gte(fecha, hace7), tema ? eq(items.tema, tema) : undefined))
      .orderBy(desc(items.relevancia), desc(fecha))
      .limit(40),
    db
      .select({
        total: sql<number>`count(*) filter (where ${items.relevancia} >= 1)::int`,
        pendientes: sql<number>`count(*) filter (where ${isNull(items.clasificadoEn)})::int`,
      })
      .from(items)
      .where(and(eq(items.cuentaId, cuentaId), gte(fecha, hace7))),
  ]);
  const max = Math.max(1, ...ranking.map((r) => r.puntaje));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Radar territorial</h1>
          <p className="text-sm text-suave">
            De qué habla tu municipio esta semana · {total} menciones relevantes
            {pendientes > 0 && ` · ${pendientes} por clasificar`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BotonAccion accion={escucharAhora} texto="Escuchar ahora" enCurso="Escuchando… (puede tardar 1–2 min)" />
          <BotonAccion accion={resumenAhora} texto="Enviar resumen" enCurso="Redactando…" />
        </div>
      </div>

      {ultimo && (
        <section className="tarjeta">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">Resumen del {new Date(`${ultimo.fecha}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</h2>
            <span className={`chip ${ultimo.enviadoEn ? "bg-ok-fondo text-ok" : "bg-fondo text-suave"}`}>
              {ultimo.enviadoEn ? "Enviado por Telegram" : "No enviado"}
            </span>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {ultimo.vinetas.map((v, i) => <li key={i} className="flex gap-2"><span className="text-suave">•</span>{v}</li>)}
          </ul>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:items-start">
      <section className="tarjeta xl:sticky xl:top-0">
        <h2 className="font-medium">Temas que más mueven a la gente</h2>
        <p className="text-sm text-suave">Volumen × crecimiento frente a la semana anterior × relevancia local.</p>
        {ranking.length === 0 ? (
          <p className="mt-6 mb-2 text-center text-sm text-suave">
            Aún no hay datos. Pulsa <strong>Escuchar ahora</strong> o instala los flujos en{" "}
            <Link href="/configuracion#n8n" className="text-marca underline">Configuración</Link>.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {ranking.map((r) => (
              <li key={r.tema}>
                <Link href={tema === r.tema ? "/radar" : `/radar?tema=${encodeURIComponent(r.tema)}`} className="block rounded-lg p-2 hover:bg-fondo aria-[current=true]:bg-fondo" aria-current={tema === r.tema}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{tipo(r.tema)}</span>
                    <span className="flex items-baseline gap-3 text-sm">
                      <span>{menciones(r.actual)}</span>
                      <Tendencia actual={r.actual} anterior={r.anterior} />
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-fondo">
                    <div className="h-1.5 rounded-full bg-marca" style={{ width: `${(r.puntaje / max) * 100}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-suave">
                    {r.negativas}% negativas{r.emocion && ` · moviliza: ${r.emocion}`}
                    {r.comunas.length > 0 && ` · ${r.comunas.join(", ")}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">
            Menciones recientes{tema && <span> · {tipo(tema)}</span>}
          </h2>
          {tema && <Link href="/radar" className="text-sm text-marca hover:underline">Ver todas</Link>}
        </div>
        {recientes.length === 0 && <p className="text-sm text-suave">Sin menciones en los últimos 7 días.</p>}
        <ul className="space-y-2">
          {recientes.map((m) => (
            <li key={m.id} className="tarjeta p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="chip bg-fondo font-semibold">{FUENTE[m.fuente] ?? m.fuente}</span>
                {m.tema && <span className="chip bg-fondo text-suave">{tipo(m.tema)}</span>}
                {m.comuna && <span className="chip bg-fondo text-suave">{m.comuna}</span>}
                {m.sentimiento === "negativo" && <span className="chip bg-alerta-fondo text-alerta">negativo</span>}
                {m.sentimiento === "positivo" && <span className="chip bg-ok-fondo text-ok">positivo</span>}
                <span className="ml-auto text-suave">
                  {(m.publicadoEn ?? m.creadoEn).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" })}
                </span>
              </div>
              <p className="mt-2 text-sm">{m.resumen ?? m.titulo ?? m.texto.slice(0, 200)}</p>
              {m.url && (
                <a href={m.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-marca hover:underline">Ver fuente ↗</a>
              )}
            </li>
          ))}
        </ul>
      </section>
      </div>
    </div>
  );
}
