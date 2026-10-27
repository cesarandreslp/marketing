import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

function llaveMaestra(): Buffer {
  const k = Buffer.from(process.env.APP_MASTER_KEY ?? "", "hex");
  if (k.length !== 32) throw new Error("APP_MASTER_KEY debe tener 64 caracteres hex (32 bytes).");
  return k;
}

/** AES-256-GCM. Formato: iv.tag.datos en base64url. */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", llaveMaestra(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString("base64url")).join(".");
}

export function descifrar(sobre: string): string {
  const [iv, tag, datos] = sobre.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", llaveMaestra(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(datos), d.final()]).toString("utf8");
}

/** Contraseñas de usuario con scrypt (sal aleatoria). Formato: sal.hash en hex. */
export function hashClave(clave: string): string {
  const sal = randomBytes(16);
  return `${sal.toString("hex")}.${scryptSync(clave, sal, 64).toString("hex")}`;
}

export function verificarClave(clave: string, guardado: string): boolean {
  const [sal, hash] = guardado.split(".");
  if (!sal || !hash) return false;
  const calc = scryptSync(clave, Buffer.from(sal, "hex"), 64);
  const guardada = Buffer.from(hash, "hex");
  return guardada.length === calc.length && timingSafeEqual(calc, guardada); // hash dañado → false, no error
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
