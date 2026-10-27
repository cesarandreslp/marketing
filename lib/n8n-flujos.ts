import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { sha256 } from "./cifrado";
import { leerSecretos } from "./cuenta";
import { cuentas, db } from "./db";
import type { Resultado } from "./pruebas";

/** Dónde ve la app a n8n (servidor → n8n) y dónde ve n8n a la app (contenedor → host). */
const N8N = process.env.N8N_URL || "http://localhost:5678";
const APP_DESDE_N8N = process.env.APP_URL || "http://host.docker.internal:3000";

/** Tareas programadas. La fase 3 suma el publicador (cada 15 min). */
export const TAREAS = [
  { nombre: "Leer Telegram", ruta: "telegram", regla: { field: "minutes", minutesInterval: 2 }, cuando: "Cada 2 minutos" },
  { nombre: "Escuchar y clasificar", ruta: "escuchar", regla: { field: "days", triggerAtHour: 5, triggerAtMinute: 0 }, cuando: "Todos los días 5:00 a. m." },
  { nombre: "Resumen diario", ruta: "resumen", regla: { field: "days", triggerAtHour: 6, triggerAtMinute: 30 }, cuando: "Todos los días 6:30 a. m." },
  { nombre: "Avisos de publicación", ruta: "publicar", regla: { field: "minutes", minutesInterval: 15 }, cuando: "Cada 15 minutos" },
  { nombre: "Generar semana", ruta: "semana", regla: { field: "weeks", weeksInterval: 1, triggerAtDay: [6], triggerAtHour: 8, triggerAtMinute: 0 }, cuando: "Sábados 8:00 a. m." },
] as const;

/** Huella de las tareas: si cambia, los flujos instalados están desactualizados. */
export const VERSION_FLUJOS = TAREAS.map((t) => t.ruta).join(",");

export function definicionFlujo(nombre: string, credencial: { id: string; name: string }) {
  const nodes = TAREAS.flatMap((t, i) => [
    {
      id: randomUUID(),
      name: t.cuando,
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, i * 200],
      parameters: { rule: { interval: [t.regla] } },
    },
    {
      id: randomUUID(),
      name: t.nombre,
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [300, i * 200],
      parameters: {
        method: "POST",
        url: `${APP_DESDE_N8N}/api/n8n/${t.ruta}`,
        authentication: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
        options: { timeout: 600_000 },
      },
      credentials: { httpHeaderAuth: credencial },
    },
  ]);
  const connections = Object.fromEntries(
    TAREAS.map((t) => [t.cuando, { main: [[{ node: t.nombre, type: "main", index: 0 }]] }]),
  );
  return {
    name: nombre,
    nodes,
    connections,
    settings: {
      timezone: "America/Bogota",
      executionOrder: "v1",
      // La lectura de Telegram corre 720 veces al día: no guardar ejecuciones exitosas.
      saveDataSuccessExecution: "none",
      saveDataErrorExecution: "all",
    },
  };
}

async function api<T>(apiKey: string, metodo: string, ruta: string, body?: object): Promise<T> {
  const r = await fetch(`${N8N}/api/v1${ruta}`, {
    method: metodo,
    headers: { "x-n8n-api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (r.status === 404 && metodo === "DELETE") return {} as T; // ya no existía
  if (!r.ok) throw new Error(`n8n ${metodo} ${ruta} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json().catch(() => ({}))) as T;
}

/**
 * Instala (o reinstala) los flujos de la cuenta en n8n con su API:
 * clave nueva para la cuenta → credencial Header Auth → flujo → publicar.
 * Reinstalar reemplaza lo anterior, así nunca quedan claves viejas activas.
 */
export async function instalarFlujos(cuentaId: number): Promise<Resultado> {
  const { n8n_api_key: apiKey } = await leerSecretos(cuentaId);
  if (!apiKey) return { ok: false, msg: "Primero guarda la API key de n8n." };
  const [c] = await db.select().from(cuentas).where(eq(cuentas.id, cuentaId));
  try {
    if (c.ajustes.n8nFlujoId) {
      // n8n 2.x no deja borrar un flujo publicado: primero se despublica (404 = ya no existe).
      await api(apiKey, "POST", `/workflows/${c.ajustes.n8nFlujoId}/unpublish`).catch((e: Error) => {
        if (!e.message.includes("→ 404")) throw e;
      });
      await api(apiKey, "DELETE", `/workflows/${c.ajustes.n8nFlujoId}`);
    }
    if (c.ajustes.n8nCredencialId) await api(apiKey, "DELETE", `/credentials/${c.ajustes.n8nCredencialId}`);

    const clave = randomBytes(32).toString("hex");
    const nombre = `Radar · ${c.nombrePublico}`;
    const cred = await api<{ id: string; name: string }>(apiKey, "POST", "/credentials", {
      name: nombre,
      type: "httpHeaderAuth",
      data: { name: "Authorization", value: `Bearer ${clave}` },
    });
    const flujo = await api<{ id: string }>(apiKey, "POST", "/workflows", definicionFlujo(nombre, { id: cred.id, name: cred.name }));
    await api(apiKey, "POST", `/workflows/${flujo.id}/publish`);

    await db
      .update(cuentas)
      .set({
        claveN8nHash: sha256(clave),
        ajustes: sql`${cuentas.ajustes} || ${JSON.stringify({ n8nFlujoId: flujo.id, n8nCredencialId: cred.id, n8nTareas: VERSION_FLUJOS })}::jsonb`,
      })
      .where(eq(cuentas.id, cuentaId));
    return { ok: true, msg: `Flujos instalados y activos en n8n («${nombre}»).` };
  } catch (e) {
    const m = (e as Error).message;
    if (m.includes("→ 401")) return { ok: false, msg: "n8n rechazó la API key. Revisa que esté completa y vigente." };
    if (e instanceof TypeError) return { ok: false, msg: `No encuentro n8n en ${N8N}. ¿Está encendido Docker?` };
    return { ok: false, msg: m };
  }
}
