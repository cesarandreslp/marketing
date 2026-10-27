"use client";
import { useActionState } from "react";
import type { Resultado } from "@/lib/pruebas";
import { generarClaveN8n, guardar, probar } from "./acciones";

function Mensaje({ r }: { r: Resultado | null }) {
  if (!r) return null;
  return <span className={`text-sm ${r.ok ? "text-ok" : "text-alerta"}`}>{r.ok ? "✓ " : ""}{r.msg}</span>;
}

/** Formulario de una sección: guarda solo sus campos y muestra el resultado. */
export function Seccion({ children, accion = guardar, boton = "Guardar" }: {
  children: React.ReactNode;
  accion?: (prev: Resultado | null, f: FormData) => Promise<Resultado>;
  boton?: string;
}) {
  const [r, enviar, enviando] = useActionState(accion, null);
  return (
    <form action={enviar} className="space-y-4">
      {children}
      <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-4">
        <button className="btn btn-primario" disabled={enviando}>{enviando ? "Guardando…" : boton}</button>
        <Mensaje r={r} />
      </div>
    </form>
  );
}

export function Probar({ servicio }: { servicio: string }) {
  const [r, enviar, enviando] = useActionState(probar, null);
  return (
    <form action={enviar} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="servicio" value={servicio} />
      <button className="btn py-1 text-xs" disabled={enviando}>{enviando ? "Probando…" : "Probar"}</button>
      <Mensaje r={r} />
    </form>
  );
}

/** Botón que ejecuta una acción del servidor y muestra su resultado al lado. */
export function BotonAccion({ accion, texto, enCurso, primario }: {
  accion: (prev: Resultado | null) => Promise<Resultado>;
  texto: string;
  enCurso: string;
  primario?: boolean;
}) {
  const [r, enviar, enviando] = useActionState(accion, null);
  return (
    <form action={enviar} className="flex flex-wrap items-center gap-3">
      <button className={`btn ${primario ? "btn-primario" : ""}`} disabled={enviando}>{enviando ? enCurso : texto}</button>
      <Mensaje r={r} />
    </form>
  );
}

export function ClaveN8n({ existe }: { existe: boolean }) {
  const [r, enviar, enviando] = useActionState(generarClaveN8n, null);
  return (
    <form action={enviar} className="space-y-3">
      {r ? (
        <div className="rounded-lg bg-aviso-fondo p-3 text-sm text-aviso">
          <p className="font-medium">Cópiala ahora: no se volverá a mostrar.</p>
          <code className="mt-2 block break-all rounded bg-superficie p-2 font-mono text-xs text-texto select-all">{r.clave}</code>
        </div>
      ) : (
        <p className="text-sm text-suave">{existe ? "Ya hay una clave activa. Si generas otra, la anterior deja de funcionar." : "Aún no hay clave."}</p>
      )}
      <button
        className="btn"
        disabled={enviando}
        onClick={(e) => existe && !r && !confirm("La clave actual dejará de funcionar en n8n. ¿Continuar?") && e.preventDefault()}
      >
        {existe || r ? "Generar clave nueva" : "Generar clave"}
      </button>
    </form>
  );
}
