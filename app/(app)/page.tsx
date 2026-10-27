import Link from "next/link";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { cuentas, db, piezas, ESTADOS } from "@/lib/db";
import { publicacionHabilitada } from "@/lib/cumplimiento";
import { estadoSecretos } from "@/lib/cuenta";
import { proximoLunes } from "@/lib/estratega";
import { VERSION_FLUJOS } from "@/lib/n8n-flujos";
import { requerirSesion } from "@/lib/sesion";
import { AccionesPieza, AprobarSemana, Copiar, GenerarSemana, MarcarPublicada, SubirMedio } from "./pieza-ui";

export const dynamic = "force-dynamic";

type Pieza = typeof piezas.$inferSelect;

const ESTILO_ESTADO: Record<(typeof ESTADOS)[number], string> = {
  borrador: "bg-fondo text-suave",
  aprobada: "bg-ok-fondo text-ok",
  rechazada: "bg-alerta-fondo text-alerta",
  publicada: "bg-marca/15 text-marca",
};
const RED: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", x: "X" };
const FORMATO: Record<string, string> = { video: "Video", carrusel: "Carrusel", post_x: "Post en X" };
const PILAR: Record<string, string> = { escucha: "Escucha", explicar: "Explicar lo público", "quien-soy": "Quién soy", coyuntura: "Coyuntura" };

const cuando = (d: Date) =>
  d.toLocaleString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
const diaLargo = (s: string) =>
  new Date(`${s}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long" });

/** Agrupa por concepto (un video = varias redes) y oculta las versiones rechazadas que ya se rehicieron. */
function agrupar(ps: Pieza[]) {
  const rehechas = new Set(ps.map((p) => p.reemplazaA).filter(Boolean));
  const visibles = ps.filter((p) => !rehechas.has(p.id));
  const grupos = Map.groupBy(visibles, (p) => `${p.formato}·${p.concepto ?? p.id}`);
  return [...grupos.values()].sort((a, b) => +a[0].fechaProgramada - +b[0].fechaProgramada);
}

function Concepto({ ps }: { ps: Pieza[] }) {
  const p = ps[0];
  const guion = ps.find((x) => x.guion)?.guion;
  const prompt = ps.find((x) => x.promptMedia)?.promptMedia;
  const { medio, medioTipo } = ps.find((x) => x.medio) ?? {};
  return (
    <li className="tarjeta space-y-3">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="chip bg-marca/15 font-semibold text-marca">{FORMATO[p.formato] ?? p.formato}</span>
          {p.pilar && <span className="chip bg-fondo text-suave">{PILAR[p.pilar] ?? p.pilar}</span>}
          {p.tema && <span className="chip bg-fondo text-suave">{p.tema}</span>}
          <span className="text-suave">{cuando(p.fechaProgramada)}</span>
        </div>
        {p.concepto && <h3 className="mt-2 font-medium">{p.concepto}</h3>}
      </div>

      {guion && (
        <details className="rounded-lg bg-fondo p-3 text-sm">
          <summary className="cursor-pointer font-medium">{p.formato === "video" ? "Guion para grabar" : "Texto de las láminas"}</summary>
          <p className="mt-2 whitespace-pre-wrap">{guion}</p>
          <div className="mt-2"><Copiar texto={guion} /></div>
        </details>
      )}
      {prompt && (
        <details className="rounded-lg bg-fondo p-3 text-sm">
          <summary className="cursor-pointer font-medium">Prompt de imagen (Gemini / Nano Banana)</summary>
          <p className="mt-2 whitespace-pre-wrap text-suave">{prompt}</p>
          <div className="mt-2"><Copiar texto={prompt} /></div>
        </details>
      )}

      {p.formato !== "post_x" && (
        <div className="space-y-2 rounded-lg border border-dashed border-borde p-3">
          {medio && (medioTipo?.startsWith("video/") ? (
            <video src={`/api/medios/${medio}`} controls className="max-h-72 rounded-lg" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por la app
            <img src={`/api/medios/${medio}`} alt={p.concepto ?? "Imagen de la pieza"} className="max-h-72 rounded-lg" />
          ))}
          {ps.some((x) => x.estado !== "publicada") && <SubirMedio piezaId={ps.find((x) => x.estado !== "publicada")!.id} tiene={!!medio} />}
          {!medio && (
            <p className="text-xs text-suave">
              Instagram y TikTok necesitan la foto o el video. Súbelo aquí y te llegará adjunto en el aviso de publicación.
            </p>
          )}
        </div>
      )}

      <div className="divide-y divide-borde rounded-lg border border-borde">
        {ps.map((x) => (
          <div key={x.id} className={`p-3 ${x.estado === "rechazada" ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold">{RED[x.red] ?? x.red}</span>
              {x.reemplazaA && <span className="text-suave">· versión rehecha</span>}
              {!x.revisadaIA && x.estado === "borrador" && <span className="chip bg-aviso-fondo text-aviso">Sin revisión IA</span>}
              <span className={`chip ml-auto ${ESTILO_ESTADO[x.estado]}`}>{x.estado === "rechazada" ? "descartada" : x.estado}</span>
            </div>
            <p className={`mt-2 whitespace-pre-wrap text-sm ${x.estado === "rechazada" ? "line-through" : ""}`}>{x.copy}</p>
            {x.alertas.length > 0 && x.estado === "borrador" && (
              <ul className="mt-2 space-y-1 rounded-lg bg-alerta-fondo p-2 text-sm text-alerta">
                {x.alertas.map((a) => <li key={a}>⚠ {a}</li>)}
              </ul>
            )}
            {x.estado === "borrador" && <AccionesPieza id={x.id} copy={x.copy} />}
            {x.estado === "aprobada" && (
              <>
                {x.postizId && <p className="mt-2 text-xs text-marca">🤖 Programada en Postiz: se publicará sola a su hora.</p>}
                {!x.postizId && x.postizError && <p className="mt-2 text-xs text-aviso">Postiz: {x.postizError}. Irá por aviso de Telegram.</p>}
                {x.avisadaEn && <p className="mt-2 text-xs text-suave">📣 Aviso enviado por Telegram {cuando(x.avisadaEn)}</p>}
                <MarcarPublicada id={x.id} />
              </>
            )}
            {x.estado === "publicada" && x.publicadaEn && <p className="mt-2 text-xs text-suave">Publicada {cuando(x.publicadaEn)}</p>}
          </div>
        ))}
      </div>
      {p.fuentes.length > 0 && (
        <p className="text-xs text-suave">
          Respaldo:{" "}
          {p.fuentes.map((f, i) => (
            <a key={f} href={f} target="_blank" rel="noreferrer" className="text-marca hover:underline">[{i + 1}]</a>
          )).reduce<React.ReactNode[]>((acc, el) => (acc.length ? [...acc, " ", el] : [el]), [])}
        </p>
      )}
    </li>
  );
}

export default async function Bandeja() {
  const { cuentaId } = await requerirSesion();
  const siguiente = proximoLunes();
  const [[cuenta], secretos, lista] = await Promise.all([
    db.select().from(cuentas).where(eq(cuentas.id, cuentaId)),
    estadoSecretos(cuentaId),
    db
      .select()
      .from(piezas)
      .where(and(eq(piezas.cuentaId, cuentaId), gte(piezas.semana, sql`current_date - 7`)))
      .orderBy(desc(piezas.semana), piezas.fechaProgramada),
  ]);
  const semanas = Map.groupBy(lista, (p) => p.semana);
  const haySiguiente = semanas.has(siguiente);
  const hayIA = ["zai_api_key", "mistral_api_key", "gemini_api_key"].some((k) => secretos.has(k));

  const pasos = [
    { hecho: !!cuenta.fechaRetiroFirme, texto: "Indica la fecha en que tu retiro del cargo quedó en firme", ancla: "perfil" },
    { hecho: hayIA, texto: "Conecta al menos un modelo de IA", ancla: "ia" },
    { hecho: secretos.has("telegram_bot_token") && !!cuenta.ajustes.telegramChatId, texto: "Conecta Telegram para tu resumen diario", ancla: "avisos" },
    {
      hecho: !!cuenta.ajustes.n8nFlujoId && cuenta.ajustes.n8nTareas === VERSION_FLUJOS,
      texto: cuenta.ajustes.n8nFlujoId
        ? "Hay tareas nuevas: pulsa «Reinstalar flujos» en Configuración → Integración n8n"
        : "Instala los flujos en n8n (escucha, resumen, semana y avisos)",
      ancla: "n8n",
    },
  ];
  const pendientes = pasos.filter((p) => !p.hecho);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bandeja de aprobación</h1>
        <p className="text-sm text-suave">
          Cada sábado se arma tu semana. Revisa, edita o rechaza lo que no te guste (se rehace solo) y aprueba el resto con un clic.
        </p>
      </div>

      {pendientes.length > 0 && (
        <section className="tarjeta">
          <h2 className="font-medium">Primeros pasos · {pasos.length - pendientes.length} de {pasos.length}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {pasos.map((p) => (
              <li key={p.ancla} className="flex items-center gap-2">
                <span className={p.hecho ? "text-ok" : "text-suave"}>{p.hecho ? "✓" : "○"}</span>
                {p.hecho ? (
                  <span className="text-suave line-through">{p.texto}</span>
                ) : (
                  <Link href={`/configuracion#${p.ancla}`} className="text-marca hover:underline">{p.texto}</Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!publicacionHabilitada(cuenta.fechaRetiroFirme) && (
        <p className="rounded-xl bg-aviso-fondo p-4 text-sm text-aviso">
          <strong>Publicación en pausa.</strong> Puedes preparar y aprobar contenido, pero nada se publicará hasta la fecha en
          que tu retiro del cargo quede en firme. <Link href="/configuracion#perfil" className="underline">Configurar fecha</Link>
        </p>
      )}

      {!haySiguiente && (
        <section className="tarjeta flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">Semana del {diaLargo(siguiente)}</p>
            <p className="text-sm text-suave">
              {hayIA ? "Se generará el sábado a las 8:00 a. m., o ahora mismo si prefieres." : "Conecta un modelo de IA para generarla."}
            </p>
          </div>
          {hayIA && <GenerarSemana semana={siguiente} texto="Generar ahora" />}
        </section>
      )}

      {[...semanas].map(([semana, ps]) => {
        const borradores = ps.filter((p) => p.estado === "borrador");
        const listos = borradores.filter((p) => !p.alertas.length).length;
        const aprobadas = ps.filter((p) => p.estado === "aprobada" || p.estado === "publicada").length;
        return (
          <section key={semana} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium">Semana del {diaLargo(semana)}</h2>
                <p className="text-sm text-suave">
                  {borradores.length} por revisar · {aprobadas} aprobadas
                  {borradores.length - listos > 0 && ` · ${borradores.length - listos} con alertas`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {semana === siguiente && hayIA && borradores.length > 0 && (
                  <GenerarSemana semana={semana} texto="Rehacer borradores" confirmar="Se reemplazarán los borradores de esta semana (lo aprobado se conserva). ¿Continuar?" />
                )}
                {listos > 0 && <AprobarSemana semana={semana} cuantas={listos} />}
              </div>
            </div>
            <ul className="grid items-start gap-4 2xl:grid-cols-2">
              {agrupar(ps).map((g) => <Concepto key={g[0].id} ps={g} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
