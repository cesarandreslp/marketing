"use client";

/** Página de error para toda la app. El caso típico: Docker cerrado → sin base de datos. */
export default function ErrorGlobal({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const sinBase = /Failed query|ECONNREFUSED|connect|database/i.test(error.message);
  return (
    <main className="m-auto w-full max-w-md p-4">
      <div className="tarjeta space-y-3">
        <h1 className="text-lg font-semibold">{sinBase ? "La base de datos no responde" : "Algo salió mal"}</h1>
        {sinBase ? (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-suave">
            <li>Abre <strong>Docker Desktop</strong> y espera a que diga <em>Engine running</em>.</li>
            <li>Pulsa <strong>Reintentar</strong>.</li>
          </ol>
        ) : (
          <p className="text-sm text-suave">{error.message.slice(0, 300)}</p>
        )}
        <p className="text-xs text-suave">Para encender todo de una vez, usa el archivo <code>Iniciar Radar</code> del proyecto.</p>
        <button className="btn btn-primario" onClick={reset}>Reintentar</button>
      </div>
    </main>
  );
}
