import { requerirSesion } from "@/lib/sesion";

// URL de n8n vista desde el NAVEGADOR (no desde Docker).
// Por el intermediario de docker/caddy: n8n directo (5678) no se deja mostrar en un iframe.
const N8N_URL = process.env.N8N_MARCO_URL || "http://localhost:5679";

export default async function Automatizaciones({ searchParams }: { searchParams: Promise<{ ruta?: string }> }) {
  await requerirSesion();
  const { ruta } = await searchParams;
  // Solo rutas internas de n8n (p. ej. /home/credentials); nada de "//otro-sitio".
  const destino = N8N_URL + (ruta && /^\/(?!\/)[\w\-/]*$/.test(ruta) ? ruta : "");
  return (
    <div className="pantalla-completa flex h-full flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-borde bg-superficie px-4 py-2 text-sm">
        <p className="text-suave">Automatizaciones (n8n): flujos de escucha, resumen diario, publicación y conexiones con tus redes.</p>
        <a href={destino} target="_blank" rel="noreferrer" className="btn shrink-0 py-1 text-xs">Abrir en otra pestaña ↗</a>
      </div>
      <iframe src={destino} title="n8n" className="w-full flex-1 border-0" allow="clipboard-read; clipboard-write" />
    </div>
  );
}
