import { sql } from "drizzle-orm";
import { db } from "./db";

export type FilaRadar = {
  tema: string;
  actual: number; // menciones relevantes últimos 7 días
  anterior: number; // los 7 días previos
  relevancia: number; // promedio 1–3
  negativas: number; // % negativas
  emocion: string | null; // la más frecuente
  comunas: string[]; // las 3 más mencionadas
  puntaje: number;
};

/**
 * Ranking de temas = volumen × crecimiento × relevancia. Solo menciones
 * relevantes (≥1). Fecha = publicación, o captura si la fuente no la trae.
 */
export async function radar(cuentaId: number, limite = 10): Promise<FilaRadar[]> {
  const filas = await db.execute<Omit<FilaRadar, "puntaje">>(sql`
    with m as (
      select tema, comuna, emocion, sentimiento, relevancia, coalesce(publicado_en, creado_en) as f
      from items
      where cuenta_id = ${cuentaId} and relevancia >= 1 and tema is not null
        and coalesce(publicado_en, creado_en) >= now() - interval '14 days'
    )
    select tema,
      count(*) filter (where f >= now() - interval '7 days')::int as actual,
      count(*) filter (where f < now() - interval '7 days')::int as anterior,
      round(avg(relevancia) filter (where f >= now() - interval '7 days'), 2)::float as relevancia,
      round(100.0 * count(*) filter (where sentimiento = 'negativo' and f >= now() - interval '7 days')
        / nullif(count(*) filter (where f >= now() - interval '7 days'), 0))::int as negativas,
      mode() within group (order by emocion) filter (where f >= now() - interval '7 days') as emocion,
      coalesce((select array_agg(comuna) from (
        select comuna from m m2 where m2.tema = m.tema and comuna is not null and f >= now() - interval '7 days'
        group by comuna order by count(*) desc limit 3) c), '{}') as comunas
    from m
    group by tema
  `);
  return filas.rows
    .filter((f) => f.actual > 0)
    .map((f) => ({
      ...f,
      // Crecimiento suavizado: un tema que pasa de 0 a 5 no debe aplastar a uno estable de 30.
      puntaje: Math.round(f.actual * ((f.actual + 2) / (f.anterior + 2)) * (f.relevancia || 1) * 10) / 10,
    }))
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, limite);
}
