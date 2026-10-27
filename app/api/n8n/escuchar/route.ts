import { escuchar } from "@/lib/escucha";
import { tareaN8n } from "@/lib/n8n";

/** 05:00 — recolecta (noticias, RSS, X) y clasifica lo nuevo. */
export const POST = (req: Request) => tareaN8n(req, escuchar);
