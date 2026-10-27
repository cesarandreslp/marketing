import { generarSemana } from "@/lib/estratega";
import { tareaN8n } from "@/lib/n8n";

/** Sábados 8:00 — arma los borradores de la semana siguiente y avisa por Telegram. */
export const POST = (req: Request) => tareaN8n(req, (c) => generarSemana(c));
