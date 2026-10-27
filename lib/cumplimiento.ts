/**
 * Filtro de cumplimiento "modo pre-campaña" (Ley 1475/2011 art. 35–36):
 * hasta la ventana legal de propaganda no se pide el voto ni se presenta
 * candidatura. Devuelve alertas; una pieza con alertas no se puede aprobar.
 * ponytail: reglas por regex; la revisión semántica con Mistral (ataques
 * personales, menores, logos) se suma en la fase 2 sobre esta misma salida.
 */
/** Solo en pre-campaña: desde inicioPropaganda ya es propaganda legal. */
const PRECAMPANA: [RegExp, string][] = [
  // Solo el pedido de voto o apoyo; la pedagogía electoral («cuidar el voto», «testigos electorales») es legal.
  [
    /\bvot(a|e|en)\s+por\b|\b(tu|su|el)\s+voto\s+(por|para)\s+m[ií](?![a-záéíóúñ])|\b(dame|denme|deme|reg[aá]la(me|nme)|reg[aá]le(me|nme))\s+(tu|su)\s+voto\b|\bacomp[aá][ñn](a|e|en)me\s+en\s+20\d\d\b|\bay[uú]d(a|e|en)me\s+a\s+llegar\b|\bap[oó]y(a|e|en)me\s+en\s+las\s+urnas\b/i,
    "Pide el voto o apoyo electoral (propaganda anticipada)",
  ],
  [/\bcandidat[oa]s?\b|\bcandidatura\b/i, "Se presenta como candidato/a"],
  [/\btarjet[oó]n\b|\bmarca (el|la|mi) (n[uú]mero|logo)\b/i, "Referencia al tarjetón"],
];

/** Siempre, también en campaña. */
const PROHIBIDO: [RegExp, string][] = [
  [
    /\b(concejal(es)?|alcalde(sa)?|diputad[oa]s?|gobernador(a)?)\s*20\d\d|\b20\d\d\s*[-–]\s*20\d\d\b/i,
    "Menciona periodo o cargo a elegir",
  ],
  [/\bsorteo\b|\brifa\b|\bregalo a cambio\b/i, "Sorteos o beneficios ligados a apoyo"],
  [/\b(escudo|logo) de (la )?(alcald[ií]a|gobernaci[oó]n)\b/i, "Uso de símbolos oficiales"],
];

/** ¿La fecha (de publicación o inicio de semana) cae dentro de la ventana de propaganda? */
export function enCampana(inicioPropaganda: string | null, fecha: Date): boolean {
  return !!inicioPropaganda && fecha >= new Date(`${inicioPropaganda}T00:00:00-05:00`);
}

export function revisar(copy: string, fuentes: string[] = [], campana = false): string[] {
  const alertas = (campana ? PROHIBIDO : [...PRECAMPANA, ...PROHIBIDO]).filter(([re]) => re.test(copy)).map(([, m]) => m);
  // Cifras (montos, porcentajes) exigen al menos una fuente citada.
  if (/\d+([.,]\d+)?\s*(%|millones|mil millones|\$)|\$\s*\d/i.test(copy) && fuentes.length === 0) {
    alertas.push("Dato numérico sin fuente");
  }
  return alertas;
}

/** Antes de que el retiro del cargo quede en firme no se publica nada político (Const. art. 127). */
export function publicacionHabilitada(
  { fechaRetiroFirme, nuncaServidorPublico }: { fechaRetiroFirme: string | null; nuncaServidorPublico: boolean },
  hoy = new Date(),
): boolean {
  return nuncaServidorPublico || (!!fechaRetiroFirme && hoy >= new Date(`${fechaRetiroFirme}T00:00:00-05:00`));
}
