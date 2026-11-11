/**
 * Vigilancia de competidores. Se guarda como fuente "competencia" (titulo = nombre) y NO cuenta en el
 * ranking de temas de la gente: sirve para saber qué dicen y diferenciarse, nunca para atacarlos.
 */
import { leerRobot, type RedRobot } from "./browseai";
import { type ItemNuevo, leerFeed, urlGoogle } from "./fuentes";

export function leerCompetidores(texto?: string) {
  return (texto ?? "").split("\n").flatMap((l) => {
    const [nombre, url] = l.split("|").map((s) => s.trim());
    return nombre ? [{ nombre, url: url && URL.canParse(url) ? url : undefined }] : [];
  });
}

const redDe = (url: string): RedRobot | null => {
  const h = new URL(url).hostname;
  return /(^|\.)facebook\.com$/.test(h) ? "facebook" : /(^|\.)instagram\.com$/.test(h) ? "instagram" : /(^|\.)tiktok\.com$/.test(h) ? "tiktok" : null;
};

const sinRobot = (red: string) => {
  const p = Promise.reject<ItemNuevo[]>(new Error(`falta un robot «${red} <id> perfil» en Robots de Browse AI`));
  p.catch(() => {}); // se informa en la escucha; evita el aviso de rechazo sin atender
  return p;
};

/** Tareas de lectura (una por competidor y fuente) para sumar a las de `recolectar`. */
export function tareasCompetencia(
  competidores: ReturnType<typeof leerCompetidores>,
  robots: { red: RedRobot; id: string; perfil: boolean }[],
  apiKey: string | undefined,
  municipio: string,
): [string, Promise<ItemNuevo[]>][] {
  return competidores.flatMap(({ nombre, url }) => {
    const marcar = (xs: ItemNuevo[]) => xs.map((x) => ({ ...x, fuente: "competencia", titulo: nombre }));
    const tareas: [string, Promise<ItemNuevo[]>][] = [
      [`Competencia ${nombre} (noticias)`, leerFeed(urlGoogle(`"${nombre}" ${municipio} when:14d`), "noticias").then((xs) => marcar(xs.map((x) => ({ ...x, texto: x.titulo ?? x.texto }))))],
    ];
    const red = url ? redDe(url) : null;
    if (red && apiKey) {
      const robot = robots.find((r) => r.red === red && r.perfil);
      tareas.push([
        `Competencia ${nombre} (${red})`,
        robot ? leerRobot(apiKey, red, robot.id, url).then(marcar) : sinRobot(red),
      ]);
    }
    return tareas;
  });
}
