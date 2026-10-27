// Pone una contraseña nueva a un usuario de la app (por si se olvidó).
// Uso: npm run restablecer-clave -- correo@ejemplo.com
import { loadEnvConfig } from "@next/env";
import { createInterface } from "node:readline";

loadEnvConfig(process.cwd());

/** Una sola interfaz para todas las preguntas; lo que se escribe no se muestra. */
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const salida = rl as unknown as { _writeToOutput: (s: string) => void };
const escribirOriginal = salida._writeToOutput.bind(rl);
let oculto = false;
salida._writeToOutput = (s) => escribirOriginal(oculto ? (s.includes("\n") ? "\n" : "") : s);
const lineas = rl[Symbol.asyncIterator]();

async function preguntarOculto(texto: string): Promise<string> {
  oculto = false;
  process.stdout.write(texto);
  oculto = true;
  const { value = "" } = await lineas.next();
  oculto = false;
  process.stdout.write("\n");
  return value;
}

async function main() {
  const email = process.argv[2]?.toLowerCase().trim();
  if (!email) throw new Error("Indica el correo: npm run restablecer-clave -- correo@ejemplo.com");
  const { db, usuarios } = await import("../lib/db");
  const { hashClave } = await import("../lib/cifrado");
  const { eq } = await import("drizzle-orm");

  const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
  if (!u) throw new Error(`No hay ningún usuario con el correo ${email}.`);

  const clave = await preguntarOculto("Nueva contraseña (mínimo 10 caracteres): ");
  if (clave.length < 10) throw new Error("Debe tener al menos 10 caracteres.");
  if ((await preguntarOculto("Repítela: ")) !== clave) throw new Error("No coinciden.");

  await db.update(usuarios).set({ claveHash: hashClave(clave) }).where(eq(usuarios.id, u.id));
  console.log("Listo. Ya puedes entrar con la nueva contraseña.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
