import { tareaN8n } from "@/lib/n8n";
import { marcarPublicada } from "@/lib/publicador";
import { generarResumen } from "@/lib/resumen";
import { leerBot } from "@/lib/telegram";

/** Cada 2 min — lee lo que le enviaste al bot (capturas, /resumen, «Ya lo publiqué»). */
export const POST = (req: Request) => tareaN8n(req, (c) => leerBot(c, { generarResumen, marcarPublicada }));
