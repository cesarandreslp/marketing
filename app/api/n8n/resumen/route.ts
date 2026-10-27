import { tareaN8n } from "@/lib/n8n";
import { generarResumen } from "@/lib/resumen";

/** 06:30 — resumen del día por Telegram. */
export const POST = (req: Request) => tareaN8n(req, generarResumen);
