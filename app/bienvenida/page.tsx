import { redirect } from "next/navigation";
import { z } from "zod";
import { CARGOS, cuentas, db, usuarios } from "@/lib/db";
import { hashClave } from "@/lib/cifrado";
import { iniciarSesion } from "@/lib/sesion";
import { NOMBRES_CARGO, registroAbierto } from "@/lib/cuenta";

const Datos = z.object({
  nombre: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().email(),
  clave: z.string().min(10),
  nombrePublico: z.string().trim().min(2),
  municipio: z.string().trim().min(2),
  departamento: z.string().trim().min(2),
  cargo: z.enum(CARGOS),
});

async function crear(form: FormData) {
  "use server";
  if (!(await registroAbierto())) redirect("/login");
  const d = Datos.safeParse(Object.fromEntries(form));
  if (!d.success) redirect("/bienvenida?error=datos");
  const { nombre, email, clave, ...perfil } = d.data;
  const ids = await db
    .transaction(async (tx) => {
      const [c] = await tx.insert(cuentas).values(perfil).returning({ id: cuentas.id });
      const [u] = await tx
        .insert(usuarios)
        .values({ cuentaId: c.id, nombre, email, claveHash: hashClave(clave) })
        .returning({ id: usuarios.id });
      return { usuarioId: u.id, cuentaId: c.id };
    })
    .catch(() => null); // correo ya registrado
  if (!ids) redirect("/bienvenida?error=correo");
  await iniciarSesion(ids.usuarioId, ids.cuentaId);
  redirect("/configuracion?inicio=1");
}

const ERRORES: Record<string, string> = {
  datos: "Revisa los campos: la contraseña debe tener al menos 10 caracteres.",
  correo: "Ese correo ya tiene una cuenta.",
};

export default async function Bienvenida({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await registroAbierto())) redirect("/login");
  const { error } = await searchParams;

  return (
    <main className="m-auto w-full max-w-xl p-4">
      <h1 className="text-2xl font-semibold">Bienvenido a Radar Territorial</h1>
      <p className="mt-1 mb-6 text-sm text-suave">
        Crea tu cuenta. Tus datos, claves y contenidos quedan separados de los de cualquier otra persona que use la
        aplicación.
      </p>
      <form action={crear} className="space-y-5">
        <section className="tarjeta space-y-4">
          <h2 className="font-medium">Tu acceso</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="etiqueta" htmlFor="nombre">Tu nombre</label>
              <input id="nombre" name="nombre" required className="campo" />
            </div>
            <div>
              <label className="etiqueta" htmlFor="email">Correo</label>
              <input id="email" name="email" type="email" required autoComplete="email" className="campo" />
            </div>
          </div>
          <div>
            <label className="etiqueta" htmlFor="clave">Contraseña</label>
            <input id="clave" name="clave" type="password" minLength={10} required autoComplete="new-password" className="campo" />
            <p className="ayuda">Mínimo 10 caracteres.</p>
          </div>
        </section>

        <section className="tarjeta space-y-4">
          <h2 className="font-medium">Tu campaña</h2>
          <div>
            <label className="etiqueta" htmlFor="nombrePublico">Nombre público</label>
            <input id="nombrePublico" name="nombrePublico" required className="campo" placeholder="Como te conoce la gente" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="etiqueta" htmlFor="municipio">Municipio</label>
              <input id="municipio" name="municipio" required className="campo" placeholder="Guadalajara de Buga" />
            </div>
            <div>
              <label className="etiqueta" htmlFor="departamento">Departamento</label>
              <input id="departamento" name="departamento" required className="campo" placeholder="Valle del Cauca" />
            </div>
          </div>
          <div>
            <label className="etiqueta" htmlFor="cargo">Corporación o cargo</label>
            <select id="cargo" name="cargo" className="campo" defaultValue="concejo">
              {CARGOS.map((c) => (
                <option key={c} value={c}>{NOMBRES_CARGO[c]}</option>
              ))}
            </select>
          </div>
        </section>

        {error && <p className="rounded-lg bg-alerta-fondo p-3 text-sm text-alerta">{ERRORES[error] ?? "No se pudo crear la cuenta."}</p>}
        <button className="btn btn-primario w-full">Crear cuenta y continuar</button>
      </form>
    </main>
  );
}
