"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Íconos de trazo (estilo Tabler), en línea para no sumar dependencias. */
const ICONOS: Record<string, React.ReactNode> = {
  bandeja: <path d="M4 13h3l3 3h4l3-3h3M4 13l2-8h12l2 8M4 13v6h16v-6" />,
  calendario: <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12H4zM16 3v4M8 3v4M4 11h16M8 15h2v2H8z" />,
  radar: <path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0M12 12l5-5M21 12a9 9 0 1 1-9-9M17 12a5 5 0 1 1-5-5" />,
  automatizaciones: <path d="M4 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M16 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 8v4a4 4 0 0 0 4 4h6M18 16V8a2 2 0 0 0-2-2h-6M13 3l-3 3l3 3" />,
  configuracion: <path d="M10.3 4.3c.4-1.8 3-1.8 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 0 0 1 2.5c1.9.5 1.9 3.1 0 3.5a1.7 1.7 0 0 0-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 0 0-2.6 1c-.4 1.9-3 1.9-3.4 0a1.7 1.7 0 0 0-2.6-1c-1.5.9-3.3-.9-2.4-2.4a1.7 1.7 0 0 0-1-2.6c-1.9-.4-1.9-3 0-3.5a1.7 1.7 0 0 0 1-2.5c-.9-1.6.9-3.3 2.4-2.4a1.7 1.7 0 0 0 2.6-1.1zM9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0" />,
};

const ENLACES = [
  { href: "/", texto: "Bandeja", icono: "bandeja" },
  { href: "/calendario", texto: "Calendario", icono: "calendario" },
  { href: "/radar", texto: "Radar", icono: "radar" },
  { href: "/automatizaciones", texto: "Automatizaciones", icono: "automatizaciones" },
  { href: "/configuracion", texto: "Configuración", icono: "configuracion" },
];

/** Barra lateral fija: solo íconos en pantallas pequeñas, ícono + nombre desde md. */
export function Nav() {
  const ruta = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {ENLACES.map((e) => (
        <Link
          key={e.href}
          href={e.href}
          title={e.texto}
          aria-current={ruta === e.href ? "page" : undefined}
          className="flex items-center gap-3 rounded-md px-2.5 py-2 text-sm text-texto/85 hover:bg-white/5 hover:text-texto aria-[current=page]:bg-marca/15 aria-[current=page]:font-medium aria-[current=page]:text-texto"
        >
          <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICONOS[e.icono]}
          </svg>
          <span className="hidden md:inline">{e.texto}</span>
        </Link>
      ))}
    </nav>
  );
}
