// Clasificación manual: Claude (u otra persona) hace el trabajo de la IA "masivo".
//   npm run clasificar-manual -- exportar [cuentaId] [maximo]   → datos/pendientes.json
//   npm run clasificar-manual -- importar [cuentaId]            ← datos/clasificados.json
// clasificados.json: [{"id":1,"relevancia":2,"tema":"seguridad","comuna":null,"sentimiento":"negativo","emocion":"miedo","resumen":"..."}]
import { loadEnvConfig } from "@next/env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

loadEnvConfig(process.cwd());

async function main() {
  const [modo, cuentaArg, maxArg] = process.argv.slice(2);
  const { and, eq, isNull } = await import("drizzle-orm");
  const { db, items, cuentas } = await import("../lib/db");
  const { guardarClasificacion, TEMAS } = await import("../lib/escucha");

  const cuentaId = cuentaArg ? Number(cuentaArg) : (await db.select({ id: cuentas.id }).from(cuentas).limit(1))[0]?.id;
  if (!cuentaId) throw new Error("No hay cuentas.");
  mkdirSync("datos", { recursive: true });

  if (modo === "recolectar") {
    const { recolectar } = await import("../lib/escucha");
    const [c] = await db.select().from(cuentas).where(eq(cuentas.id, cuentaId));
    console.log(await recolectar(c));
  } else if (modo === "exportar") {
    const [c] = await db.select().from(cuentas).where(eq(cuentas.id, cuentaId));
    const pendientes = await db
      .select({ id: items.id, fuente: items.fuente, titulo: items.titulo, texto: items.texto })
      .from(items)
      .where(and(eq(items.cuentaId, cuentaId), isNull(items.clasificadoEn)))
      .limit(Number(maxArg) || 200);
    const salida = {
      contexto: { municipio: c.municipio, departamento: c.departamento, barrios: c.ajustes.barrios ?? "", temas: TEMAS },
      pendientes: pendientes.map((x) => ({ ...x, texto: x.texto.slice(0, 600) })),
    };
    writeFileSync("datos/pendientes.json", JSON.stringify(salida, null, 1));
    console.log(`Cuenta ${cuentaId}: ${pendientes.length} pendientes → datos/pendientes.json`);
  } else if (modo === "importar") {
    const salida = JSON.parse(readFileSync("datos/clasificados.json", "utf8"));
    const lote = await db
      .select({ id: items.id, fuente: items.fuente })
      .from(items)
      .where(and(eq(items.cuentaId, cuentaId), isNull(items.clasificadoEn)));
    const n = await guardarClasificacion(cuentaId, lote, salida);
    console.log(`Cuenta ${cuentaId}: ${n} clasificados de ${salida.length} recibidos.`);
  } else {
    throw new Error("Uso: recolectar | exportar | importar");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
