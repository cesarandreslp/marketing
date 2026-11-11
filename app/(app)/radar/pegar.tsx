"use client";
import { useActionState } from "react";
import { pegarMencion } from "./acciones";

export function PegarMencion() {
  const [r, enviar, enviando] = useActionState(pegarMencion, null);
  return (
    <details className="tarjeta" open={r?.ok === false}>
      <summary className="cursor-pointer font-medium">Agregar una mención a mano</summary>
      <p className="mt-2 text-sm text-suave">
        ¿Viste algo en Instagram, Facebook o TikTok que el Radar no trae? Pega el texto y el enlace: entra como una mención más y se tiene en cuenta al armar la semana.
      </p>
      <form action={enviar} className="mt-3 space-y-3">
        <textarea name="texto" rows={6} required className="campo" placeholder="Pega aquí el texto de la publicación o nota" />
        <input name="enlace" type="url" className="campo" placeholder="Enlace de la publicación (https://…)" />
        <div className="flex flex-wrap items-center gap-3">
          <select name="origen" className="campo w-auto" defaultValue="instagram" aria-label="Dónde la viste">
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="tiktok">TikTok</option>
            <option value="x">X</option>
            <option value="rss">Noticia (medio o cuenta de noticias)</option>
            <option value="manual">Otro</option>
            <option value="competencia">De un competidor</option>
          </select>
          <input name="competidor" className="campo w-auto" placeholder="Si es de un competidor: su nombre" />
          <label className="flex items-center gap-2 text-sm text-suave">
            Fecha <input name="fecha" type="date" className="campo w-auto" />
          </label>
          <button className="btn btn-primario" disabled={enviando}>{enviando ? "Agregando…" : "Agregar al Radar"}</button>
          {r && <span className={`text-sm ${r.ok ? "text-ok" : "text-alerta"}`}>{r.msg}</span>}
        </div>
      </form>
    </details>
  );
}
