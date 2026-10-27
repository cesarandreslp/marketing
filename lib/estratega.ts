/**
 * Fase 2: arma la semana. Tres pasos con el rol "textos" (Mistral primero):
 *   1. plan: conceptos de la semana según el radar, los pilares y lo que rechazaste antes;
 *   2. redacción: guion y copy por red de cada concepto;
 *   3. revisión: una segunda lectura busca riesgos legales y éticos (además del filtro por regex).
 * Todo queda en borrador: nada sale sin tu aprobación.
 */
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { generarJSON, SaturacionError } from "./ai";
import { enCampana, revisar } from "./cumplimiento";
import { cuentas, db, items, piezas } from "./db";
import { radar } from "./radar";
import { enviar } from "./telegram";

type Cuenta = typeof cuentas.$inferSelect;

export const REDES = ["instagram", "facebook", "tiktok", "youtube", "x"] as const;
type Red = (typeof REDES)[number];

/** Qué formato va a qué redes y a qué hora por defecto (Bogotá). */
const FORMATOS = {
  video: { redes: ["instagram", "facebook", "tiktok", "youtube"], hora: "18:30", cantidad: 3 },
  carrusel: { redes: ["instagram", "facebook"], hora: "12:30", cantidad: 2 },
  post_x: { redes: ["x"], hora: "07:30", cantidad: 7 },
} as const satisfies Record<string, { redes: readonly Red[]; hora: string; cantidad: number }>;
type Formato = keyof typeof FORMATOS;

const PILARES = {
  escucha: "40% · escucha territorial: «fui al barrio X y esto me dijeron»",
  explicar: "30% · explicar lo público: presupuesto, impuestos, obras, decisiones del Concejo, con datos y fuente",
  "quien-soy": "20% · quién eres: tu historia, valores y trabajo",
  coyuntura: "10% · reacción a la coyuntura, siempre con propuesta y no solo crítica",
};

const REGLAS = (campana: boolean) =>
  (campana
    ? "Campaña en Colombia, dentro de la ventana legal de propaganda (Ley 1475 de 2011): puede presentarse como candidato, " +
      "pedir el voto y mencionar el tarjetón y su número. Prohibido ofrecer sorteos, regalos o beneficios a cambio de apoyo. "
    : "Pre-campaña en Colombia (Ley 1475 de 2011): prohibido pedir el voto o apoyo electoral, aun de forma implícita " +
      "(«acompáñame en 2027», «ayúdame a llegar»); prohibido presentarse como candidato o hacer promesas de gobierno " +
      "(«cuando sea concejal haré…»). Sí se permite la pedagogía electoral (cuidar el voto, testigos electorales). ") +
  "Prohibido acusar o atacar a personas con nombre propio, nombrar a particulares, " +
  "mostrar menores identificables, usar símbolos oficiales de la Alcaldía, dar cifras sin fuente o afirmar hechos no " +
  "verificables. Tono: cercano, propositivo, respetuoso, en español de Colombia.";

// ---------- fechas (Bogotá) ----------

const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

/** Lunes de la semana siguiente (desde hoy en Bogotá). */
export function proximoLunes(hoy = hoyBogota()): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (((8 - d.getUTCDay()) % 7) || 7));
  return d.toISOString().slice(0, 10);
}

/** dia: 1 = lunes … 7 = domingo; hora "HH:MM" en Bogotá. */
export function fechaHora(semana: string, dia: number, hora: string): Date {
  const d = new Date(`${semana}T${hora}:00-05:00`);
  d.setUTCDate(d.getUTCDate() + Math.min(6, Math.max(0, Math.round(dia) - 1)));
  return d;
}

const horaValida = (h: unknown, porDefecto: string) =>
  typeof h === "string" && /^([01]\d|2[0-1]):[0-5]\d$/.test(h) && h >= "06:00" ? h : porDefecto;

/** Redes con usuario configurado; si no hay ninguno, todas. */
export function redesActivas(c: Cuenta): Set<Red> {
  const a = c.ajustes;
  const activas = REDES.filter((r) =>
    ({ instagram: a.instagramUsuario, facebook: a.facebookPagina, tiktok: a.tiktokUsuario, youtube: a.youtubeCanal, x: a.xUsuario })[r],
  );
  return new Set(activas.length ? activas : REDES);
}

// ---------- contexto ----------

/** La etapa (pre-campaña o campaña) se fija por el lunes de la semana: una semana a caballo queda en pre-campaña. */
async function contexto(c: Cuenta, semana: string) {
  const [temas, menciones, rechazos, anteriores] = await Promise.all([
    radar(c.id, 8),
    db
      .select({ id: items.id, url: items.url, tema: items.tema, comuna: items.comuna, emocion: items.emocion, resumen: items.resumen })
      .from(items)
      .where(and(eq(items.cuentaId, c.id), gte(items.relevancia, 2), gte(sql`coalesce(${items.publicadoEn}, ${items.creadoEn})`, sql`now() - interval '10 days'`)))
      .orderBy(desc(items.relevancia), desc(items.creadoEn))
      .limit(50),
    db
      .select({ motivo: piezas.motivoRechazo })
      .from(piezas)
      .where(and(eq(piezas.cuentaId, c.id), eq(piezas.estado, "rechazada"), isNotNull(piezas.motivoRechazo)))
      .orderBy(desc(piezas.creadoEn))
      .limit(15),
    db
      .selectDistinct({ concepto: piezas.concepto })
      .from(piezas)
      .where(and(eq(piezas.cuentaId, c.id), gte(piezas.semana, sql`current_date - 21`), isNotNull(piezas.concepto))),
  ]);
  const perfil =
    `${c.nombrePublico}, ciudadano de ${c.municipio} (${c.departamento}) que quiere darse a conocer con miras a ` +
    `${c.cargo === "concejo" ? "el Concejo municipal" : c.cargo}. ` +
    (c.ajustes.equipo === "audiovisual"
      ? "Tiene equipo audiovisual: los guiones pueden pedir planos (general, medio, primer plano), tomas de apoyo (b-roll) y más de una locación."
      : "Trabaja solo: graba él/ella mismo con el celular.") +
    (c.ajustes.temasPropios ? `\nSus temas propios: ${c.ajustes.temasPropios.replace(/\n/g, "; ")}.` : "") +
    (c.ajustes.barrios ? `\nBarrios/zonas prioritarias: ${c.ajustes.barrios.replace(/\n/g, ", ")}.` : "");
  const motivos = rechazos.map((r) => r.motivo).filter((m) => m && m !== "Sin motivo");
  const campana = enCampana(c.inicioPropaganda, fechaHora(semana, 1, "00:00"));
  return { temas, menciones, motivos, anteriores: anteriores.map((a) => a.concepto!), perfil, campana, reglas: REGLAS(campana) };
}

type Ctx = Awaited<ReturnType<typeof contexto>>;

// ---------- paso 1: plan ----------

type Concepto = {
  concepto: string;
  formato: Formato;
  pilar: keyof typeof PILARES;
  dia: number;
  hora?: string;
  tema?: string;
  idea: string;
  menciones?: number[];
};

async function planear(c: Cuenta, ctx: Ctx, redes: Set<Red>): Promise<Concepto[]> {
  const cantidades = (Object.keys(FORMATOS) as Formato[])
    .filter((f) => FORMATOS[f].redes.some((r) => redes.has(r)))
    .map((f) => `${FORMATOS[f].cantidad} ${f}`);
  const r = await generarJSON<{ conceptos?: Concepto[] }>(c.id, "textos", {
    sistema: `Eres estratega de comunicación política local. ${ctx.reglas}`,
    prompt:
      `Perfil: ${ctx.perfil}\n\n` +
      `Planea la próxima semana: exactamente ${cantidades.join(", ")}.\n` +
      `Formatos: video = vertical 45–90 s con la persona en cámara; carrusel = 5–7 láminas explicativas; post_x = opinión breve.\n` +
      `Reparte por pilares: ${Object.entries(PILARES).map(([k, v]) => `${k} (${v})`).join("; ")}.\n` +
      `Distribuye los días (1 = lunes … 7 = domingo); un post_x por día. Basa las ideas en lo que de verdad preocupa a la gente ` +
      `y cita en "menciones" los [id] que la respaldan.\n\n` +
      `Radar de la semana: ${ctx.temas.map((t) => `${t.tema} (${t.actual} menciones, emoción ${t.emocion}${t.comunas.length ? ", " + t.comunas.join("/") : ""})`).join("; ") || "sin datos aún"}\n\n` +
      `Menciones:\n${ctx.menciones.map((m) => `[${m.id}] ${m.tema}${m.comuna ? " · " + m.comuna : ""}: ${m.resumen}`).join("\n") || "(ninguna)"}\n\n` +
      (ctx.anteriores.length ? `No repitas estos conceptos recientes: ${ctx.anteriores.join(" | ")}\n` : "") +
      (ctx.motivos.length ? `El usuario rechazó antes piezas por esto, evítalo: ${ctx.motivos.join(" | ")}\n` : ""),
    esquemaHint:
      '{"conceptos":[{"concepto":"título corto","formato":"video|carrusel|post_x","pilar":"escucha|explicar|quien-soy|coyuntura","dia":1,"hora":"18:30","tema":"movilidad y vías","idea":"qué se dice y por qué importa","menciones":[12,15]}]}',
    temperatura: 0.6,
    maxTokens: 6000,
  });
  return (r.conceptos ?? []).filter((x) => x.concepto && x.formato in FORMATOS);
}

// ---------- paso 2: redacción ----------

type Redaccion = { guion?: string; promptMedia?: string; copys?: Partial<Record<Red, string>> };

const GUIA_RED: Record<Red, string> = {
  instagram: "Instagram: 1–3 párrafos cortos, gancho en la primera línea, 3–5 hashtags locales al final.",
  facebook: "Facebook: tono conversacional y cercano, invita a comentar desde qué barrio escriben, 0–2 hashtags.",
  tiktok: "TikTok: 1–2 líneas muy cortas con gancho y 3 hashtags.",
  youtube: "YouTube Shorts: título de máx. 80 caracteres en la primera línea, luego una descripción de 1–2 frases.",
  x: "X: máx. 260 caracteres, directo, sin hashtags o con uno solo.",
};

async function redactar(c: Cuenta, ctx: Ctx, k: Concepto, redes: Red[], corregir?: { previo: string; motivo: string }) {
  const formato =
    k.formato === "video"
      ? `"guion": guion para grabar en cámara (45–90 s), con [GANCHO 0–3 s], [DESARROLLO] y [CIERRE] que invite a comentar; ${c.ajustes.equipo === "audiovisual" ? "indica locaciones reales del municipio (puede ser más de una), el plano de cada parte y las tomas de apoyo (b-roll)" : "indica dónde grabar (un lugar real del municipio)"}. "promptMedia": prompt para generar la portada/miniatura con IA (sin rostros de terceros ni símbolos oficiales).`
      : k.formato === "carrusel"
        ? `"guion": texto de cada lámina numerada (5–7), una idea por lámina, la última con una pregunta. "promptMedia": prompt de estilo visual para las láminas (colores, tipografía, íconos; sin símbolos oficiales).`
        : `"guion" y "promptMedia" vacíos.`;
  const respaldo = ctx.menciones.filter((m) => k.menciones?.includes(m.id));
  return generarJSON<Redaccion>(c.id, "textos", {
    sistema: `Eres el redactor de ${c.nombrePublico}. ${ctx.reglas}`,
    prompt:
      `Perfil: ${ctx.perfil}\n\nConcepto: ${k.concepto}\nPilar: ${k.pilar}\nIdea: ${k.idea}\n` +
      (respaldo.length ? `Lo que dice la gente:\n${respaldo.map((m) => `- ${m.resumen}`).join("\n")}\n` : "") +
      `\nEscribe ${formato}\n"copys": un texto por red adaptado a cada una:\n${redes.map((r) => `- ${GUIA_RED[r]}`).join("\n")}\n` +
      `Escribe en primera persona como ${c.nombrePublico}. Si usas una cifra, debe venir de lo que dice la gente o ser verificable; si no, no la uses.` +
      (corregir ? `\n\nVersión anterior (rechazada):\n${corregir.previo}\nMotivo del rechazo: ${corregir.motivo}\nCorrígela atendiendo el motivo.` : ""),
    esquemaHint: `{"guion":"...","promptMedia":"...","copys":{${redes.map((r) => `"${r}":"..."`).join(",")}}}`,
    temperatura: 0.7,
    maxTokens: 4000,
  });
}

/** Los posts de X son cortos: todos en una sola llamada (ahorra cuota de los planes gratis). */
async function redactarPostsX(c: Cuenta, ctx: Ctx, ks: Concepto[]): Promise<string[]> {
  const r = await generarJSON<{ posts?: string[] }>(c.id, "textos", {
    sistema: `Eres el redactor de ${c.nombrePublico}. ${ctx.reglas}`,
    prompt:
      `Perfil: ${ctx.perfil}\n\nEscribe un post de X para cada idea, en el mismo orden. ${GUIA_RED.x} ` +
      `Primera persona como ${c.nombrePublico}; sin cifras que no sean verificables.\n\n` +
      ks.map((k, i) => `${i + 1}. ${k.concepto}: ${k.idea}`).join("\n"),
    esquemaHint: `{"posts":[${ks.map(() => '"..."').join(",")}]}`,
    temperatura: 0.7,
    maxTokens: 3000,
  });
  return r.posts ?? [];
}

// ---------- paso 3: revisión ----------

type Bloque = { id: string; guion?: string; copys: Partial<Record<Red, string>> };
type AlertaIA = { id: string; red: string; motivo: string };

/**
 * Segunda lectura con IA de TODA la semana en una sola llamada. Devuelve las
 * alertas por bloque; si la IA falla, null (no bloquea: queda "Sin revisión IA").
 */
async function revisarConIA(c: Cuenta, ctx: Ctx, bloques: Bloque[]): Promise<Map<string, AlertaIA[]> | null> {
  try {
    const r = await generarJSON<{ alertas?: AlertaIA[] }>(c.id, "textos", {
      sistema: `Eres abogado electoral y editor. Revisas contenido antes de publicarlo. ${ctx.reglas}`,
      prompt:
        `Revisa este contenido. Reporta SOLO problemas reales (no estilo): ` +
        (ctx.campana
          ? `sorteos, regalos o beneficios a cambio de apoyo, `
          : `pedir voto o apoyo electoral, presentarse como candidato o prometer gobierno, `) +
        `ataques o acusaciones a personas con nombre, datos de particulares o menores, ` +
        `cifras sin fuente, símbolos oficiales, desinformación o discurso de odio. Si todo está bien, devuelve una lista vacía.\n\n` +
        bloques
          .map((b) =>
            `### PIEZA ${b.id}\n` +
            (b.guion ? `GUION:\n${b.guion}\n` : "") +
            Object.entries(b.copys).map(([red, t]) => `COPY ${red}:\n${t}`).join("\n"),
          )
          .join("\n\n"),
      esquemaHint: '{"alertas":[{"id":"1","red":"instagram|facebook|tiktok|youtube|x|todas","motivo":"..."}]}',
      temperatura: 0,
      maxTokens: 3000,
    });
    return Map.groupBy(r.alertas ?? [], (a) => String(a.id));
  } catch (e) {
    console.warn("[estratega] revisión IA falló:", (e as Error).message);
    return null;
  }
}

/** El filtro por regex usa la fecha de publicación de cada pieza. */
function alertasDe(c: Cuenta, fecha: Date, red: Red, copy: string, guion: string | undefined, fuentes: string[], ia: AlertaIA[] | undefined) {
  return [
    ...revisar(`${copy}\n${guion ?? ""}`, fuentes, enCampana(c.inicioPropaganda, fecha)),
    ...(ia ?? []).filter((a) => a.red === red || a.red === "todas").map((a) => `IA: ${a.motivo}`),
  ];
}

// ---------- orquestación ----------

/**
 * Genera (o regenera) los borradores de la semana. Lo aprobado no se toca.
 * Llamadas a la IA: 1 plan + 1 por video/carrusel + 1 para todos los X + 1 revisión ≈ 8.
 * Si los modelos se saturan a mitad de camino, se guarda lo que alcanzó a salir.
 */
export async function generarSemana(c: Cuenta, semana = proximoLunes()) {
  const redes = redesActivas(c);
  const ctx = await contexto(c, semana);
  const conceptos = await planear(c, ctx, redes);
  if (!conceptos.length) throw new Error("La IA no devolvió un plan. Intenta de nuevo.");

  type Hecho = { k: Concepto; redes: Red[]; guion?: string; promptMedia?: string; copys: Partial<Record<Red, string>> };
  const hechos: Hecho[] = [];
  let detenido: string | null = null;
  const redesDe = (k: Concepto) => FORMATOS[k.formato].redes.filter((r) => redes.has(r));

  // ponytail: secuencial; los planes gratis cortan con varias peticiones a la vez.
  for (const k of conceptos.filter((k) => k.formato !== "post_x")) {
    try {
      const r = await redactar(c, ctx, k, redesDe(k));
      hechos.push({ k, redes: redesDe(k), guion: r.guion, promptMedia: r.promptMedia, copys: r.copys ?? {} });
    } catch (e) {
      if (e instanceof SaturacionError) { detenido = e.message; break; }
      console.warn(`[estratega] concepto «${k.concepto}» falló:`, (e as Error).message);
    }
  }
  const xs = conceptos.filter((k) => k.formato === "post_x");
  if (xs.length && !detenido) {
    try {
      const posts = await redactarPostsX(c, ctx, xs);
      xs.forEach((k, i) => posts[i]?.trim() && hechos.push({ k, redes: ["x"], copys: { x: posts[i] } }));
    } catch (e) {
      if (e instanceof SaturacionError) detenido = e.message;
      else console.warn("[estratega] posts de X fallaron:", (e as Error).message);
    }
  }
  if (!hechos.length) throw new Error(detenido ?? "La IA no pudo redactar ninguna pieza. Intenta de nuevo.");

  const ia = await revisarConIA(c, ctx, hechos.map((h, i) => ({ id: String(i + 1), guion: h.guion, copys: h.copys })));

  // Solo ahora se reemplazan los borradores viejos. Si la IA se cortó a mitad de
  // camino y ya había una semana armada, se conserva la anterior completa.
  const borradoresPrevios = await db.$count(piezas, and(eq(piezas.cuentaId, c.id), eq(piezas.semana, semana), eq(piezas.estado, "borrador")));
  if (detenido && borradoresPrevios > 0) {
    throw new Error(`${detenido} Tus borradores actuales se conservaron sin cambios.`);
  }
  await db.delete(piezas).where(and(eq(piezas.cuentaId, c.id), eq(piezas.semana, semana), eq(piezas.estado, "borrador")));
  const filas = hechos.flatMap((h, i) => {
    const fuentes = ctx.menciones.filter((m) => h.k.menciones?.includes(m.id) && m.url).map((m) => m.url!);
    return h.redes
      .filter((r) => h.copys[r]?.trim())
      .map((r) => {
        const fechaProgramada = fechaHora(semana, h.k.dia, horaValida(h.k.hora, FORMATOS[h.k.formato].hora));
        return {
        cuentaId: c.id,
        semana,
        red: r,
        formato: h.k.formato,
        pilar: h.k.pilar,
        concepto: h.k.concepto,
        tema: h.k.tema ?? null,
        copy: h.copys[r]!.trim(),
        guion: h.guion?.trim() || null,
        promptMedia: h.promptMedia?.trim() || null,
        fuentes,
        alertas: alertasDe(c, fechaProgramada, r, h.copys[r]!, h.guion, fuentes, ia?.get(String(i + 1))),
        revisadaIA: ia !== null,
        fechaProgramada,
      };
      });
  });
  if (filas.length) await db.insert(piezas).values(filas);

  const creadas = filas.length;
  const fallidos = conceptos.length - hechos.length;
  const conAlertas = filas.filter((f) => f.alertas.length).length;
  await enviar(
    c,
    `<b>Tu semana del ${semana} está lista</b>\n${creadas} piezas en ${hechos.length} conceptos` +
      (conAlertas ? `, ${conAlertas} con alertas por revisar` : "") +
      (detenido ? `. Faltaron ${fallidos} conceptos porque la IA está saturada; puedes rehacerlos más tarde` : "") +
      `.\nÁbrela en la bandeja, rechaza lo que no te guste y aprueba el resto.`,
  ).catch(() => {});
  return { semana, conceptos: conceptos.length, creadas, fallidos, conAlertas, detenido };
}

/** Rechazo con motivo → se marca rechazada y se rehace esa pieza con el comentario. */
export async function rehacerPieza(c: Cuenta, piezaId: number, motivo: string) {
  const [p] = await db.select().from(piezas).where(and(eq(piezas.id, piezaId), eq(piezas.cuentaId, c.id)));
  if (!p || p.estado !== "borrador") throw new Error("Solo se pueden rehacer piezas en borrador.");
  await db.update(piezas).set({ estado: "rechazada", motivoRechazo: motivo || "Sin motivo" }).where(eq(piezas.id, p.id));
  if (!motivo) return null; // sin comentario no hay a qué atender: solo se descarta

  const ctx = await contexto(c, p.semana);
  const red = p.red as Red;
  const k: Concepto = { concepto: p.concepto ?? "", formato: p.formato as Formato, pilar: (p.pilar ?? "escucha") as Concepto["pilar"], dia: 1, idea: p.concepto ?? "" };
  const r = await redactar(c, ctx, k, [red], { previo: `${p.guion ? `GUION:\n${p.guion}\n\n` : ""}COPY:\n${p.copy}`, motivo });
  const copy = r.copys?.[red]?.trim();
  if (!copy) throw new Error("La IA no devolvió una versión nueva.");
  const ia = await revisarConIA(c, ctx, [{ id: "1", guion: r.guion, copys: { [red]: copy } }]);
  const [nueva] = await db
    .insert(piezas)
    .values({
      ...p,
      id: undefined,
      creadoEn: undefined,
      copy,
      guion: r.guion?.trim() || p.guion,
      promptMedia: r.promptMedia?.trim() || p.promptMedia,
      alertas: alertasDe(c, p.fechaProgramada, red, copy, r.guion, p.fuentes, ia?.get("1")),
      revisadaIA: ia !== null,
      estado: "borrador",
      motivoRechazo: null,
      reemplazaA: p.id,
    })
    .returning({ id: piezas.id });
  return nueva.id;
}

/** Edición manual: tú asumes la revisión; solo se re-aplica el filtro legal por regex. */
export async function editarPieza(cuentaId: number, piezaId: number, copy: string) {
  const [p] = await db.select().from(piezas).where(and(eq(piezas.id, piezaId), eq(piezas.cuentaId, cuentaId)));
  if (!p || p.estado !== "borrador") throw new Error("Solo se pueden editar piezas en borrador.");
  const [c] = await db.select({ inicioPropaganda: cuentas.inicioPropaganda }).from(cuentas).where(eq(cuentas.id, cuentaId));
  await db
    .update(piezas)
    .set({ copy, alertas: revisar(`${copy}\n${p.guion ?? ""}`, p.fuentes, enCampana(c.inicioPropaganda, p.fechaProgramada)), revisadaIA: true })
    .where(eq(piezas.id, p.id));
}
