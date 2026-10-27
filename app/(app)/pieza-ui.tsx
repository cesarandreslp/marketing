"use client";
import { useActionState, useState } from "react";
import type { Resultado } from "@/lib/pruebas";
import { aprobarSemana, editar, generarAhora, marcar, rechazar } from "./acciones";

function Mensaje({ r }: { r: Resultado | null }) {
  if (!r) return null;
  return <span className={`text-sm ${r.ok ? "text-ok" : "text-alerta"}`}>{r.msg}</span>;
}

export function AprobarSemana({ semana, cuantas }: { semana: string; cuantas: number }) {
  const [r, enviar, enviando] = useActionState(aprobarSemana, null);
  return (
    <form action={enviar} className="flex flex-wrap items-center justify-end gap-3">
      <Mensaje r={r} />
      <input type="hidden" name="semana" value={semana} />
      <button className="btn btn-ok" disabled={enviando}>{enviando ? "Aprobando…" : `Aprobar semana (${cuantas})`}</button>
    </form>
  );
}

export function GenerarSemana({ semana, texto, confirmar }: { semana: string; texto: string; confirmar?: string }) {
  const [r, enviar, enviando] = useActionState(generarAhora, null);
  return (
    <form action={enviar} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="semana" value={semana} />
      <button
        className="btn btn-primario"
        disabled={enviando}
        onClick={(e) => confirmar && !confirm(confirmar) && e.preventDefault()}
      >
        {enviando ? "Armando la semana… (puede tardar 3–6 min, no cierres la página)" : texto}
      </button>
      <Mensaje r={r} />
    </form>
  );
}

/** Editar el copy o rechazarlo (con motivo se rehace; sin motivo se descarta). */
export function AccionesPieza({ id, copy }: { id: number; copy: string }) {
  const [modo, setModo] = useState<"nada" | "editar" | "rechazar">("nada");
  const [re, enviarEdicion, editando] = useActionState(editar, null);
  const [rr, enviarRechazo, rechazando] = useActionState(rechazar, null);

  if (modo === "editar") {
    return (
      <form action={enviarEdicion} className="mt-3 space-y-2">
        <input type="hidden" name="id" value={id} />
        <textarea name="copy" defaultValue={copy} rows={Math.min(12, copy.split("\n").length + 3)} className="campo" autoFocus />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primario" disabled={editando}>{editando ? "Guardando…" : "Guardar"}</button>
          <button type="button" className="btn" onClick={() => setModo("nada")}>Cancelar</button>
          <Mensaje r={re} />
        </div>
      </form>
    );
  }
  if (modo === "rechazar") {
    return (
      <form action={enviarRechazo} className="mt-3 space-y-2">
        <input type="hidden" name="id" value={id} />
        <input name="motivo" placeholder="¿Qué cambiarías? Ej.: más corto, menos formal, habla del barrio…" className="campo" autoFocus />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primario" disabled={rechazando}>{rechazando ? "Rehaciendo…" : "Rechazar y rehacer"}</button>
          <button type="button" className="btn" onClick={() => setModo("nada")}>Cancelar</button>
          <span className="text-xs text-suave">Sin motivo, solo se descarta.</span>
          <Mensaje r={rr} />
        </div>
      </form>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button className="btn py-1 text-xs" onClick={() => setModo("editar")}>Editar</button>
      <button className="btn py-1 text-xs" onClick={() => setModo("rechazar")}>Rechazar</button>
      <Mensaje r={rr ?? re} />
    </div>
  );
}

/** Sube la foto o el video del concepto (sirve para todas sus redes). */
export function SubirMedio({ piezaId, tiene }: { piezaId: number; tiene: boolean }) {
  const [estado, setEstado] = useState<"" | "subiendo" | string>("");
  async function subir(archivo: File) {
    setEstado("subiendo");
    const form = new FormData();
    form.set("piezaId", String(piezaId));
    form.set("archivo", archivo);
    const r = await fetch("/api/medios", { method: "POST", body: form }).then((x) => x.json()).catch(() => ({ error: "No se pudo subir." }));
    if (r.error) return setEstado(r.error);
    setEstado("");
    location.reload();
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="btn cursor-pointer py-1 text-xs">
        {estado === "subiendo" ? "Subiendo…" : tiene ? "Cambiar foto/video" : "Subir foto o video"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          className="hidden"
          disabled={estado === "subiendo"}
          onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])}
        />
      </label>
      {estado && estado !== "subiendo" && <span className="text-alerta">{estado}</span>}
    </div>
  );
}

export function MarcarPublicada({ id }: { id: number }) {
  const [r, enviar, enviando] = useActionState(marcar, null);
  return (
    <form action={enviar} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button className="btn py-1 text-xs" disabled={enviando}>{enviando ? "Guardando…" : "✅ Ya lo publiqué"}</button>
      <Mensaje r={r} />
    </form>
  );
}

export function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn py-0.5 text-xs"
      onClick={() => navigator.clipboard.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })}
    >
      {ok ? "✓ Copiado" : "Copiar"}
    </button>
  );
}
