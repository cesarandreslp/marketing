import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { cuentas, db } from "@/lib/db";
import { cerrarSesion, requerirSesion } from "@/lib/sesion";
import { Nav } from "./nav";

async function salir() {
  "use server";
  await cerrarSesion();
  redirect("/login");
}

/**
 * Marco al estilo Docker Desktop: barra superior y barra lateral fijas; solo el
 * contenido se desplaza y usa todo el ancho de la pantalla.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { cuentaId } = await requerirSesion();
  const [c] = await db.select().from(cuentas).where(eq(cuentas.id, cuentaId)).limit(1);
  if (!c) redirect("/login");

  return (
    <div className="fixed inset-0 flex flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 bg-barra px-4 text-white">
        <span className="text-lg font-semibold tracking-tight">Radar Territorial</span>
        <span className="hidden rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide sm:inline">
          {c.nombrePublico}
        </span>
        <span className="ml-auto hidden text-sm text-white/70 sm:inline">
          {c.municipio}, {c.departamento}
        </span>
        <form action={salir} className="ml-auto sm:ml-3">
          <button className="cursor-pointer rounded-md bg-white px-3.5 py-1.5 text-sm font-semibold text-barra hover:bg-white/90">Salir</button>
        </form>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-14 shrink-0 overflow-y-auto border-r border-borde bg-lateral md:w-56">
          <Nav />
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-8 has-[.pantalla-completa]:flex has-[.pantalla-completa]:flex-col has-[.pantalla-completa]:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
