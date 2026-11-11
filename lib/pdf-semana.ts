/**
 * Tres PDF de la semana, cada uno con su destinatario:
 *   produccion → quien acompaña al candidato y graba (solo videos: guion y entrega);
 *   copys      → quien maneja las redes (qué publicar, dónde, a qué hora, con qué archivo);
 *   imagenes   → quien genera piezas con IA (portadas y carruseles: prompt + texto de cada lámina).
 * El número de pieza es el mismo en los tres, para que se entiendan entre sí.
 * Fuentes estándar de PDF: se quitan emojis y símbolos fuera de Latin-1.
 */
import PDFDocument from "pdfkit";
import type { FilaRadar } from "./radar";
import { agrupar, KITS, type Kit, type Pieza } from "./semana";

const RED: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", x: "X" };
const FORMATO: Record<string, string> = { video: "Video", carrusel: "Carrusel", post_x: "Post en X" };

const limpio = (s: string) => s.replace(/[^\n -ÿ–—‘-”•…]/g, "").replace(/ /g, " ");
const BOG = "America/Bogota";
const dia = (d: Date) => limpio(d.toLocaleDateString("es-CO", { timeZone: BOG, weekday: "long", day: "numeric", month: "long" }));
const hora = (d: Date) => limpio(d.toLocaleTimeString("es-CO", { timeZone: BOG, hour: "numeric", minute: "2-digit" }));
const clave = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: BOG });
const diaLargo = (s: string) => limpio(new Date(`${s}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }));

export function pdfSemana(kit: Kit, nombre: string, semana: string, ps: Pieza[], temas: FilaRadar[] = []): Promise<Buffer> {
  const { titulo, para } = KITS[kit];
  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `${titulo} - semana del ${diaLargo(semana)}` } });
  const trozos: Buffer[] = [];
  doc.on("data", (t: Buffer) => trozos.push(t));
  const fin = new Promise<Buffer>((ok) => doc.on("end", () => ok(Buffer.concat(trozos))));

  const t = (texto: string, o: { f?: string; n?: number; c?: string; despues?: number } = {}) => {
    doc.font(o.f ?? "Helvetica").fontSize(o.n ?? 10.5).fillColor(o.c ?? "#111").text(limpio(texto), { lineGap: 2 });
    doc.moveDown(o.despues ?? 0.4);
  };
  const etiqueta = (s: string) => t(s.toUpperCase(), { f: "Helvetica-Bold", n: 8.5, c: "#666", despues: 0.15 });
  const espacio = (alto: number) => doc.y > doc.page.height - doc.page.margins.bottom - alto && doc.addPage();

  const grupos = agrupar(ps).map((g, i) => ({ n: i + 1, g, p: g[0] }));
  const nombrePieza = (n: number, p: Pieza) => `Pieza ${n} · ${FORMATO[p.formato] ?? p.formato}`;

  t(titulo, { f: "Helvetica-Bold", n: 22, despues: 0.2 });
  t(`Semana del ${diaLargo(semana)} · ${nombre}`, { n: 11, c: "#555", despues: 0.2 });
  t(para, { f: "Helvetica-Bold", n: 11, c: "#007a45", despues: 1 });

  if (kit === "produccion") {
    const videos = grupos.filter((x) => x.p.formato === "video");
    t(`Hay ${videos.length} videos esta semana. Todos los graba el candidato en persona, con celular o cámara, en vertical (9:16). Entrega cada archivo a quien maneja las redes con el nombre «pieza-N» (N = el número de la pieza).`, { despues: 0.8 });
    videos.forEach(({ n, p }) => t(`Pieza ${n}  ·  se publica ${dia(p.fechaProgramada)}, ${hora(p.fechaProgramada)}  ·  ${p.concepto ?? ""}`, { n: 10, despues: 0.3 }));
    videos.forEach(({ n, g, p }) => {
      doc.addPage();
      t(`PIEZA ${n}`, { f: "Helvetica-Bold", n: 9, c: "#666", despues: 0.1 });
      t(p.concepto ?? "Sin título", { f: "Helvetica-Bold", n: 17, despues: 0.3 });
      t(`Se publica: ${dia(p.fechaProgramada)}, ${hora(p.fechaProgramada)}\nDuración: 45 a 90 segundos · Vertical 9:16 · Archivo: pieza-${n}`, { c: "#333", despues: 0.8 });
      etiqueta("Guion (lo que dice el candidato, con planos, lugares y tomas de apoyo)");
      t(g.find((x) => x.guion)?.guion ?? "(sin guion)", { despues: 0.8 });
      etiqueta("Lista de pasos");
      t("[   ] Grabado      [   ] Editado      [   ] Entregado a redes", { n: 10 });
    });
    if (!videos.length) t("Esta semana no hay videos para grabar.");
  }

  if (kit === "copys") {
    t("Publica cada texto en la red indicada, a la hora indicada. Si la pieza lleva video o carrusel, adjunta el archivo «pieza-N» que entrega producción o diseño. Nada se publica sin que esté aprobado en la bandeja.", { despues: 0.8 });
    let ultimo = "";
    grupos.forEach(({ n, g, p }) => {
      if (clave(p.fechaProgramada) !== ultimo) {
        ultimo = clave(p.fechaProgramada);
        espacio(150);
        t(dia(p.fechaProgramada).toUpperCase(), { f: "Helvetica-Bold", n: 13, c: "#007a45", despues: 0.4 });
      }
      espacio(140);
      t(`${hora(p.fechaProgramada)} · ${nombrePieza(n, p)} · ${p.concepto ?? ""}`, { f: "Helvetica-Bold", n: 11, despues: 0.2 });
      t(p.formato === "post_x" ? "Adjuntar: nada (solo texto)" : `Adjuntar: ${p.formato === "video" ? "video" : "carrusel de láminas"} «pieza-${n}»`, { n: 9, c: "#555", despues: 0.3 });
      for (const x of g) {
        etiqueta(RED[x.red] ?? x.red);
        t(x.copy, { despues: 0.2 });
        for (const a of x.alertas) t(`ATENCIÓN: ${a}`, { n: 9, c: "#a00", despues: 0.1 });
      }
      if (p.fuentes.length) t(`Fuentes: ${p.fuentes.join("  ")}`, { n: 8, c: "#335", despues: 0.2 });
      doc.moveDown(0.6);
    });
    if (temas.length) {
      espacio(200);
      t("PARA VIGILAR ESTA SEMANA", { f: "Helvetica-Bold", n: 13, c: "#007a45", despues: 0.3 });
      t("Temas que más se mueven en Buga: atiende los comentarios y observa qué dicen las otras campañas sobre ellos.", { n: 10, despues: 0.3 });
      temas.forEach((x) => t(`•  ${x.tema} (${x.actual} menciones${x.emocion ? `, moviliza ${x.emocion}` : ""}${x.comunas.length ? `, ${x.comunas.join("/")}` : ""})`, { n: 10, despues: 0.15 }));
    }
  }

  if (kit === "imagenes") {
    // Los videos no van aquí: los graba el candidato y la portada sale del propio video.
    const con = grupos.filter((x) => x.p.formato !== "video" && x.g.some((y) => y.promptMedia));
    t("Genera las láminas con el prompt indicado (Gemini / Nano Banana u otra IA). El candidato debe salir siempre: adjunta su misma foto de referencia en cada generación, salvo donde diga «SIN CANDIDATO». Sin otros rostros reconocibles, menores ni escudos o símbolos oficiales. Tamaño de lámina: 1080×1350 (4:5). Nombra los archivos «pieza-N-lamina-1», «pieza-N-lamina-2»…", { despues: 0.8 });
    con.forEach(({ n, g, p }) => {
      espacio(220);
      t(`${nombrePieza(n, p)} · ${p.concepto ?? ""}`, { f: "Helvetica-Bold", n: 12, despues: 0.2 });
      t(`Se publica ${dia(p.fechaProgramada)}, ${hora(p.fechaProgramada)}`, { n: 9, c: "#555", despues: 0.3 });
      const prompt = g.find((x) => x.promptMedia)!.promptMedia!;
      etiqueta(/^sin candidato/i.test(prompt) ? "Prompt (sin el candidato)" : "Prompt (con el candidato: adjunta su foto de referencia)");
      t(prompt, { c: "#222", despues: 0.4 });
      etiqueta("Texto de cada lámina (va escrito en la imagen)");
      t(g.find((x) => x.guion)?.guion ?? "(sin texto)", { despues: 0.4 });
      doc.moveDown(0.8);
    });
    if (!con.length) t("Esta semana no hay carruseles ni imágenes por generar con IA.");
  }

  doc.end();
  return fin;
}
