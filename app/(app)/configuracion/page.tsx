import Link from "next/link";
import { eq } from "drizzle-orm";
import { cuentas, CARGOS, db, usuarios } from "@/lib/db";
import { ClaveSecreto, estadoSecretos, NOMBRES_CARGO, SECRETOS } from "@/lib/cuenta";
import { requerirSesion } from "@/lib/sesion";
import { TAREAS, VERSION_FLUJOS } from "@/lib/n8n-flujos";
import { cambiarClave, instalar } from "./acciones";
import { BotonAccion, ClaveN8n, Probar, Seccion } from "./ui";

export const dynamic = "force-dynamic";

type Estado = Awaited<ReturnType<typeof estadoSecretos>>;

function Campo({ nombre, etiqueta, valor, ayuda, tipo = "text", ...resto }: {
  nombre: string; etiqueta: string; valor?: string | number | null; ayuda?: string; tipo?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="etiqueta" htmlFor={nombre}>{etiqueta}</label>
      <input id={nombre} name={nombre} type={tipo} defaultValue={valor ?? ""} className="campo" {...resto} />
      {ayuda && <p className="ayuda">{ayuda}</p>}
    </div>
  );
}

function Area({ nombre, etiqueta, valor, ayuda, placeholder }: {
  nombre: string; etiqueta: string; valor?: string; ayuda?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="etiqueta" htmlFor={nombre}>{etiqueta}</label>
      <textarea id={nombre} name={nombre} rows={4} defaultValue={valor ?? ""} placeholder={placeholder} className="campo" />
      {ayuda && <p className="ayuda">{ayuda}</p>}
    </div>
  );
}

/** Campo de clave: nunca muestra el valor; vacío = se conserva la actual. */
function Secreto({ clave, estado }: { clave: ClaveSecreto; estado: Estado }) {
  const s = SECRETOS[clave];
  const actual = estado.get(clave);
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium" htmlFor={clave}>{s.etiqueta}</label>
        {actual ? (
          <span className="chip bg-ok-fondo text-ok">Conectada · termina en {actual.ultimos4}</span>
        ) : (
          <span className="chip bg-fondo text-suave">Sin configurar</span>
        )}
      </div>
      <input
        id={clave}
        name={clave}
        type="password"
        autoComplete="off"
        placeholder={actual ? "Deja vacío para conservar la actual" : "Pega aquí tu clave"}
        className="campo font-mono"
      />
      <p className="ayuda">
        {s.ayuda}{" "}
        <a href={s.url} target="_blank" rel="noreferrer" className="text-marca hover:underline">Obtener clave ↗</a>
        {actual && (
          <label className="ml-3 inline-flex items-center gap-1">
            <input type="checkbox" name={`quitar_${clave}`} /> Quitar
          </label>
        )}
      </p>
    </div>
  );
}

function Bloque({ id, titulo, descripcion, children, pie }: {
  id: string; titulo: string; descripcion: string; children: React.ReactNode; pie?: React.ReactNode;
}) {
  return (
    <section id={id} className="tarjeta scroll-mt-6 space-y-4">
      <div>
        <h2 className="text-lg font-medium">{titulo}</h2>
        <p className="text-sm text-suave">{descripcion}</p>
      </div>
      {children}
      {pie}
    </section>
  );
}

/** Qué necesita cada red para que Postiz publique solo. */
const GUIAS = [
  {
    red: "Facebook e Instagram",
    estado: "Automático con Postiz",
    pasos: [
      "Necesitas una página de Facebook y una cuenta de Instagram profesional vinculada a esa página.",
      "Crea una app en developers.facebook.com (tipo Empresa). En Postiz, al pulsar «Add Channel» → Facebook o Instagram, verás la URL de redirección que debes registrar en la app.",
      "Copia el App ID y el App Secret en el archivo .env del proyecto (POSTIZ_FACEBOOK_APP_ID y POSTIZ_FACEBOOK_APP_SECRET) y vuelve a ejecutar «Iniciar Radar».",
      "Instagram descarga la foto o el video desde una dirección pública: hace falta almacenamiento en la nube para Postiz (por ejemplo Cloudflare R2).",
      "Mientras Meta no revise la app, solo publica en las cuentas que administras tú, que es justo tu caso.",
    ],
  },
  {
    red: "TikTok",
    estado: "Automático con Postiz (requiere aprobación)",
    pasos: [
      "Crea una app en developers.tiktok.com con «Content Posting API» y copia el Client Key y el Client Secret en .env (POSTIZ_TIKTOK_CLIENT_ID y POSTIZ_TIKTOK_CLIENT_SECRET).",
      "TikTok exige una dirección https y aprobar la app. Mientras no la apruebe, lo publicado queda privado: por eso, hasta entonces, TikTok sigue por aviso de Telegram.",
      "Igual que Instagram, necesita el video en una dirección pública (almacenamiento en la nube).",
    ],
  },
  {
    red: "YouTube Shorts",
    estado: "Automático con Postiz",
    pasos: [
      "En console.cloud.google.com crea un proyecto, activa «YouTube Data API v3» y crea un ID de cliente OAuth (aplicación web) con la URL de redirección que muestra Postiz.",
      "Copia el Client ID y el Client Secret en .env (POSTIZ_YOUTUBE_CLIENT_ID y POSTIZ_YOUTUBE_CLIENT_SECRET).",
      "Hasta que Google verifique la app, los videos pueden quedar privados.",
    ],
  },
  {
    red: "X",
    estado: "Automático con Postiz (API de pago)",
    pasos: [
      "Crea una app en developer.x.com con permisos de lectura y escritura, y copia API Key y API Secret en .env (POSTIZ_X_API_KEY y POSTIZ_X_API_SECRET).",
      "Publicar por la API de X tiene costo según su plan. Si no lo pagas, X sigue por aviso de Telegram.",
    ],
  },
];

function ConectarRedes({ estado }: { estado: Estado }) {
  return (
    <div className="space-y-4 border-t border-borde pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Publicación automática con Postiz</p>
          <p className="text-sm text-suave">
            Lo que apruebes se programa en Postiz y se publica solo a la hora del calendario. Las redes que no estén conectadas
            allá siguen con el aviso por Telegram.
          </p>
        </div>
        <a href="http://localhost:4007" target="_blank" rel="noreferrer" className="btn btn-primario">Abrir Postiz ↗</a>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-suave">
        <li>Abre Postiz y crea tu usuario (solo la primera vez).</li>
        <li>Conecta tus redes con <strong>Add Channel</strong>; cada red pide antes su app de desarrollador (abajo).</li>
        <li>En Postiz ve a <strong>Settings → Public API</strong>, copia la clave, pégala aquí, guarda y pulsa <strong>Probar</strong>.</li>
      </ol>
      <Seccion>
        <Secreto clave="postiz_api_key" estado={estado} />
      </Seccion>
      {estado.has("postiz_api_key") && <Probar servicio="postiz_api_key" />}
      <div className="divide-y divide-borde rounded-lg border border-borde">
        {GUIAS.map((g) => (
          <details key={g.red} className="group px-3 py-2 text-sm">
            <summary className="flex cursor-pointer items-center justify-between gap-2">
              <span className="font-medium">{g.red}</span>
              <span className="text-xs text-suave">{g.estado}</span>
            </summary>
            <ol className="mt-2 mb-1 list-decimal space-y-1 pl-5 text-suave">
              {g.pasos.map((p) => <li key={p}>{p}</li>)}
            </ol>
          </details>
        ))}
      </div>
    </div>
  );
}

const INDICE = [
  ["perfil", "Perfil y campaña"],
  ["territorio", "Territorio y temas"],
  ["ia", "Modelos de IA"],
  ["redes", "Redes sociales"],
  ["avisos", "Telegram"],
  ["n8n", "Integración n8n"],
  ["acceso", "Mi acceso"],
] as const;

export default async function Configuracion({ searchParams }: { searchParams: Promise<{ inicio?: string }> }) {
  const { cuentaId, usuarioId } = await requerirSesion();
  const { inicio } = await searchParams;
  const [[c], [u], estado] = await Promise.all([
    db.select().from(cuentas).where(eq(cuentas.id, cuentaId)),
    db.select({ email: usuarios.email }).from(usuarios).where(eq(usuarios.id, usuarioId)),
    estadoSecretos(cuentaId),
  ]);
  const a = c.ajustes;
  const iaConectadas = (["zai_api_key", "mistral_api_key", "gemini_api_key", "xai_api_key"] as const).filter((k) => estado.has(k));

  return (
    <div className="grid gap-6 md:grid-cols-[180px_1fr]">
      <nav className="hidden md:block">
        <ul className="sticky top-6 space-y-1 text-sm">
          {INDICE.map(([id, t]) => (
            <li key={id}><a href={`#${id}`} className="block rounded px-2 py-1 text-suave hover:bg-superficie hover:text-texto">{t}</a></li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Configuración</h1>
          <p className="text-sm text-suave">
            Todo lo de esta página es solo de tu cuenta. Las claves se guardan cifradas y nunca se muestran completas.
          </p>
        </div>

        {inicio && (
          <p className="rounded-xl bg-marca/10 p-4 text-sm">
            <strong>¡Cuenta creada!</strong> Completa estas secciones en orden. Puedes guardar cada una por separado y volver
            cuando quieras.
          </p>
        )}

        <Bloque id="perfil" titulo="Perfil y campaña" descripcion="Con esto el sistema ajusta el filtro legal y el calendario.">
          <Seccion>
            <Campo nombre="nombrePublico" etiqueta="Nombre público" valor={c.nombrePublico} required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo nombre="municipio" etiqueta="Municipio" valor={c.municipio} required />
              <Campo nombre="departamento" etiqueta="Departamento" valor={c.departamento} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="etiqueta" htmlFor="cargo">Corporación o cargo</label>
                <select id="cargo" name="cargo" defaultValue={c.cargo} className="campo">
                  {CARGOS.map((x) => <option key={x} value={x}>{NOMBRES_CARGO[x]}</option>)}
                </select>
              </div>
              <Campo nombre="partido" etiqueta="Partido o grupo significativo" valor={a.partido} ayuda="Opcional. Puedes definirlo más adelante." />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo nombre="fechaEleccion" etiqueta="Fecha de la elección" tipo="date" valor={c.fechaEleccion} ayuda="Confírmala en el calendario de la Registraduría." />
              <Campo
                nombre="fechaRetiroFirme"
                etiqueta="Retiro del cargo público en firme"
                tipo="date"
                valor={c.fechaRetiroFirme}
                ayuda="Fecha del acto que acepta tu renuncia. Antes de esta fecha no se publica nada."
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="nuncaServidorPublico" defaultChecked={c.nuncaServidorPublico} />
              No soy ni he sido servidor público (no se exige la fecha de retiro)
            </label>
            <Campo
              nombre="inicioPropaganda"
              etiqueta="Inicio de la propaganda electoral"
              tipo="date"
              valor={c.inicioPropaganda}
              ayuda="Desde esta fecha el sistema redacta en modo campaña: ya puedes presentarte como candidato y pedir el voto. Confírmala en el calendario de la Registraduría. Vacío = pre-campaña."
            />
            <div>
              <label className="etiqueta" htmlFor="equipo">¿Cómo grabas?</label>
              <select id="equipo" name="equipo" defaultValue={a.equipo ?? "solo"} className="campo">
                <option value="solo">Solo, con el celular</option>
                <option value="audiovisual">Con equipo audiovisual</option>
              </select>
              <p className="ayuda">Con equipo, los guiones piden planos, tomas de apoyo (b-roll) y más de una locación.</p>
            </div>
            <Campo nombre="presupuestoMensualCop" etiqueta="Presupuesto mensual (COP)" tipo="number" min={0} step={1000} valor={a.presupuestoMensualCop} />
          </Seccion>
        </Bloque>

        <Bloque id="territorio" titulo="Territorio y temas" descripcion="Orienta la escucha: qué zonas y temas priorizar y qué medios locales leer.">
          <Seccion>
            <Area nombre="barrios" etiqueta="Barrios, comunas y corregimientos prioritarios" valor={a.barrios} ayuda="Uno por línea." placeholder={"El Albañico\nLa Merced\nCorregimiento El Placer"} />
            <Area nombre="temasPropios" etiqueta="Tus temas" valor={a.temasPropios} ayuda="Uno por línea. Las banderas que quieres que la gente asocie contigo." placeholder={"Control de las finanzas públicas\nMovilidad en el centro"} />
            <Area nombre="fuentesRss" etiqueta="Medios locales (RSS)" valor={a.fuentesRss} ayuda="Una dirección RSS por línea." placeholder="https://medio-local.com/feed" />
          </Seccion>
        </Bloque>

        <Bloque
          id="ia"
          titulo="Modelos de IA"
          descripcion="Usa tus propias claves: el costo y los límites de uso son de tu cuenta. Con una sola ya funciona; con varias, si una falla, otra la reemplaza."
          pie={iaConectadas.length > 0 && (
            <div className="space-y-2 border-t border-borde pt-4">
              <p className="text-sm font-medium">Probar conexión</p>
              {iaConectadas.map((k) => (
                <div key={k} className="flex flex-wrap items-center gap-3">
                  <span className="w-32 text-sm text-suave">{SECRETOS[k].etiqueta}</span>
                  <Probar servicio={k} />
                </div>
              ))}
            </div>
          )}
        >
          <Seccion>
            {(["zai_api_key", "mistral_api_key", "gemini_api_key", "xai_api_key"] as const).map((k) => (
              <Secreto key={k} clave={k} estado={estado} />
            ))}
          </Seccion>
        </Bloque>

        <Bloque
          id="redes"
          titulo="Redes sociales"
          descripcion="Tus cuentas públicas le dan contexto a la IA (buscar tus menciones, el tono de cada red). Para publicar sola, la app usa Postiz (abajo)."
          pie={<ConectarRedes estado={estado} />}
        >
          <Seccion>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo nombre="facebookPagina" etiqueta="Página de Facebook" valor={a.facebookPagina} placeholder="facebook.com/tu-pagina" />
              <Campo nombre="instagramUsuario" etiqueta="Instagram" valor={a.instagramUsuario} placeholder="@usuario" />
              <Campo nombre="youtubeCanal" etiqueta="Canal de YouTube" valor={a.youtubeCanal} placeholder="@canal" />
              <Campo nombre="tiktokUsuario" etiqueta="TikTok" valor={a.tiktokUsuario} placeholder="@usuario" />
              <Campo nombre="xUsuario" etiqueta="X" valor={a.xUsuario} placeholder="@usuario" ayuda="La escucha en X usa tu clave de Grok." />
            </div>
          </Seccion>
        </Bloque>

        <Bloque
          id="avisos"
          titulo="Telegram"
          descripcion="Tu resumen diario a las 6:30 a. m. y botones para aprobar oportunidades rápidas."
          pie={estado.has("telegram_bot_token") && (
            <div className="space-y-2 border-t border-borde pt-4">
              <p className="text-sm text-suave">Escríbele <strong>/start</strong> a tu bot en Telegram y luego pulsa Probar: detectamos tu chat automáticamente.</p>
              <Probar servicio="telegram_bot_token" />
            </div>
          )}
        >
          <Seccion>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-suave">
              <li>Abre <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-marca hover:underline">@BotFather</a> y envía <code>/newbot</code>.</li>
              <li>Ponle un nombre y copia el token que te entrega.</li>
              <li>Pégalo aquí y guarda.</li>
            </ol>
            <Secreto clave="telegram_bot_token" estado={estado} />
            <Campo nombre="telegramChatId" etiqueta="ID del chat" valor={a.telegramChatId} ayuda="Se llena solo al probar. Cámbialo solo si quieres recibir en un grupo." />
          </Seccion>
        </Bloque>

        <Bloque
          id="n8n"
          titulo="Integración n8n"
          descripcion="n8n ejecuta las tareas a su hora. La app instala los flujos por ti; solo necesitas una API key de n8n."
        >
          <Seccion>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-suave">
              <li>
                Abre <Link href="/automatizaciones?ruta=/settings/api" className="text-marca hover:underline">n8n → Settings → n8n API</Link>{" "}
                (en n8n: <strong>Settings</strong>, abajo a la izquierda → <strong>n8n API</strong>) y pulsa{" "}
                <strong>Create an API key</strong>. Ponle un nombre, elige <strong>No expiration</strong> y copia la clave: n8n
                solo la muestra una vez.
              </li>
              <li>Pégala aquí, guarda y pulsa <strong>Instalar flujos</strong>.</li>
            </ol>
            <Secreto clave="n8n_api_key" estado={estado} />
          </Seccion>
          {estado.has("n8n_api_key") && (
            <div className="space-y-3 border-t border-borde pt-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">Flujos</span>
                {a.n8nFlujoId && a.n8nTareas !== VERSION_FLUJOS ? (
                  <span className="chip bg-aviso-fondo text-aviso">Hay tareas nuevas: reinstala</span>
                ) : a.n8nFlujoId ? (
                  <span className="chip bg-ok-fondo text-ok">Instalados</span>
                ) : (
                  <span className="chip bg-fondo text-suave">Sin instalar</span>
                )}
              </div>
              <ul className="space-y-1 text-sm text-suave">
                {TAREAS.map((t) => <li key={t.ruta}>• <strong className="text-texto">{t.nombre}</strong> — {t.cuando}</li>)}
              </ul>
              <BotonAccion accion={instalar} texto={a.n8nFlujoId ? "Reinstalar flujos" : "Instalar flujos"} enCurso="Instalando…" primario />
            </div>
          )}
          <details className="border-t border-borde pt-4 text-sm">
            <summary className="cursor-pointer text-suave">Avanzado: clave manual para tus propios flujos</summary>
            <div className="mt-3 space-y-3">
              <ClaveN8n existe={!!c.claveN8nHash} />
              <ol className="list-decimal space-y-1 pl-5 text-suave">
                <li>En n8n crea una credencial <strong>Header Auth</strong>: nombre <code>Authorization</code>, valor <code>Bearer</code> + espacio + la clave.</li>
                <li>URL base: <code>http://host.docker.internal:3000/api/n8n</code>.</li>
                <li>Generar una clave manual desconecta los flujos instalados hasta que los reinstales.</li>
              </ol>
            </div>
          </details>
        </Bloque>

        <Bloque id="acceso" titulo="Mi acceso" descripcion={`Entras con ${u.email}.`}>
          <Seccion accion={cambiarClave} boton="Cambiar contraseña">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo nombre="actual" etiqueta="Contraseña actual" tipo="password" autoComplete="current-password" required />
              <Campo nombre="nueva" etiqueta="Nueva contraseña" tipo="password" autoComplete="new-password" minLength={10} required />
            </div>
          </Seccion>
        </Bloque>
      </div>
    </div>
  );
}
