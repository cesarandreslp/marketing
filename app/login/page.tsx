import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db, usuarios } from "@/lib/db";
import { verificarClave } from "@/lib/cifrado";
import { iniciarSesion } from "@/lib/sesion";
import { registroAbierto } from "@/lib/cuenta";

async function entrar(form: FormData) {
  "use server";
  const email = String(form.get("email") ?? "").toLowerCase().trim();
  const [u] = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1);
  if (!u || !verificarClave(String(form.get("clave") ?? ""), u.claveHash)) redirect("/login?error=1");
  await iniciarSesion(u.id, u.cuentaId);
  redirect("/");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(usuarios);
  if (n === 0) redirect("/bienvenida");

  return (
    <main className="m-auto w-full max-w-sm p-4">
      <h1 className="mb-1 text-2xl font-semibold">Radar Territorial</h1>
      <p className="mb-6 text-sm text-suave">Ingresa para revisar tu semana.</p>
      <form action={entrar} className="tarjeta space-y-4">
        <div>
          <label className="etiqueta" htmlFor="email">Correo</label>
          <input id="email" name="email" type="email" required autoFocus autoComplete="email" className="campo" />
        </div>
        <div>
          <label className="etiqueta" htmlFor="clave">Contraseña</label>
          <input id="clave" name="clave" type="password" required autoComplete="current-password" className="campo" />
        </div>
        {error && <p className="rounded-lg bg-alerta-fondo p-2 text-sm text-alerta">Correo o contraseña incorrectos.</p>}
        <button className="btn btn-primario w-full">Entrar</button>
      </form>
      {(await registroAbierto()) && (
        <p className="mt-4 text-center text-sm text-suave">
          ¿Primera vez? <Link href="/bienvenida" className="text-marca underline">Crea tu cuenta</Link>
        </p>
      )}
    </main>
  );
}
