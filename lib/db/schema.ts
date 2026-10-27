import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Cada cuenta es una campaña (un cliente). TODO dato de negocio lleva cuentaId
 * y toda consulta filtra por él: así varias personas pueden usar la misma
 * instalación sin ver lo de las demás.
 */
export const CARGOS = ["concejo", "alcaldia", "asamblea", "gobernacion"] as const;

export type Ajustes = {
  partido?: string;
  temasPropios?: string; // uno por línea
  barrios?: string; // uno por línea: barrios, comunas, corregimientos prioritarios
  fuentesRss?: string; // una URL por línea
  presupuestoMensualCop?: number;
  // Solo usuarios públicos (contexto para la IA). Las credenciales de redes viven en n8n.
  facebookPagina?: string;
  instagramUsuario?: string;
  youtubeCanal?: string;
  tiktokUsuario?: string;
  xUsuario?: string;
  telegramChatId?: string;
  telegramOffset?: number; // último update_id leído del bot
  n8nFlujoId?: string; // flujo instalado por la app (para reinstalar sin duplicar)
  n8nCredencialId?: string;
  n8nTareas?: string; // VERSION_FLUJOS de lo instalado
};

export const cuentas = pgTable("cuentas", {
  id: serial().primaryKey(),
  nombrePublico: text().notNull(),
  municipio: text().notNull(),
  departamento: text().notNull(),
  cargo: text({ enum: CARGOS }).notNull(),
  fechaEleccion: date(),
  // Antes de esta fecha no se entrega nada para publicar (Const. art. 127).
  fechaRetiroFirme: date(),
  nuncaServidorPublico: boolean().default(false).notNull(), // marcado: no se exige fechaRetiroFirme
  // Desde esta fecha rige la propaganda electoral: ya se puede pedir el voto (Ley 1475 art. 35).
  inicioPropaganda: date(),
  ajustes: jsonb().$type<Ajustes>().default({}).notNull(),
  claveN8nHash: text("clave_n8n_hash").unique(), // sha256 de la clave que usa n8n para esta cuenta
  creadoEn: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export const usuarios = pgTable("usuarios", {
  id: serial().primaryKey(),
  cuentaId: integer().notNull().references(() => cuentas.id, { onDelete: "cascade" }),
  email: text().notNull().unique(),
  nombre: text().notNull(),
  claveHash: text().notNull(),
  creadoEn: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

/** API keys y tokens de cada cuenta, cifrados con APP_MASTER_KEY. Nunca se devuelven al navegador. */
export const secretos = pgTable(
  "secretos",
  {
    cuentaId: integer().notNull().references(() => cuentas.id, { onDelete: "cascade" }),
    clave: text().notNull(),
    valor: text().notNull(), // iv.tag.datos (base64url)
    ultimos4: text().notNull(),
    actualizadoEn: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.cuentaId, t.clave] })],
);

/** Lo que trae la escucha (noticias, X vía Grok, YouTube, capturas por Telegram). Sin datos personales. */
export const items = pgTable(
  "items",
  {
    id: serial().primaryKey(),
    cuentaId: integer().notNull().references(() => cuentas.id, { onDelete: "cascade" }),
    fuente: text().notNull(), // rss, grok, youtube, telegram, secop, concejo...
    url: text(), // dedupe por cuenta; null para capturas sin enlace
    titulo: text(),
    texto: text().notNull(),
    publicadoEn: timestamp({ withTimezone: true }),
    // Clasificación (rol "masivo"): null = aún sin clasificar.
    clasificadoEn: timestamp({ withTimezone: true }),
    relevancia: integer(), // 0 = no es del municipio … 3 = muy relevante
    tema: text(),
    comuna: text(),
    sentimiento: text(), // negativo, neutro, positivo
    emocion: text(), // qué moviliza: indignación, miedo, esperanza, orgullo…
    resumen: text(), // una línea, sin nombres de particulares
    creadoEn: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.cuentaId, t.url)],
);

/** Resumen diario enviado por Telegram (uno por cuenta y día). */
export const resumenes = pgTable(
  "resumenes",
  {
    id: serial().primaryKey(),
    cuentaId: integer().notNull().references(() => cuentas.id, { onDelete: "cascade" }),
    fecha: date().notNull(),
    vinetas: jsonb().$type<string[]>().notNull(),
    enviadoEn: timestamp({ withTimezone: true }),
    creadoEn: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.cuentaId, t.fecha)],
);

export const ESTADOS =["borrador", "aprobada", "rechazada", "publicada"] as const;

/** Cada pieza del calendario semanal. Solo las "aprobada" llegan al publicador. */
export const piezas = pgTable("piezas", {
  id: serial().primaryKey(),
  cuentaId: integer().notNull().references(() => cuentas.id, { onDelete: "cascade" }),
  semana: date().notNull(), // lunes de la semana
  red: text().notNull(), // facebook, instagram, tiktok, youtube, x
  formato: text().notNull(), // video, carrusel, imagen, historia, post
  pilar: text(), // escucha, explicar, quien-soy, coyuntura
  // Un concepto (p. ej. un video) se publica en varias redes: una pieza por red, mismo concepto.
  concepto: text(),
  tema: text(),
  copy: text().notNull(),
  guion: text(),
  promptMedia: text(),
  fuentes: jsonb().$type<string[]>().default([]).notNull(),
  alertas: jsonb().$type<string[]>().default([]).notNull(),
  fechaProgramada: timestamp({ withTimezone: true }).notNull(),
  estado: text({ enum: ESTADOS }).default("borrador").notNull(),
  motivoRechazo: text(),
  reemplazaA: integer(), // pieza rechazada que esta rehace
  revisadaIA: boolean().default(false).notNull(), // pasó la revisión semántica (o la editaste tú)
  // Foto o video (archivo en datos/medios/). Un concepto comparte el mismo medio en todas sus redes.
  medio: text(),
  medioTipo: text(), // MIME: image/jpeg, video/mp4…
  avisadaEn: timestamp({ withTimezone: true }), // se envió el aviso "hora de publicar" por Telegram
  postizId: text(), // programada en Postiz (publica sola); null = publicación asistida por Telegram
  postizError: text(), // último error de Postiz al programar o publicar
  publicadaEn: timestamp({ withTimezone: true }),
  urlPublicada: text(),
  creadoEn: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

/** Todo lo que pagues desde hoy: puede tener que reportarse en Cuentas Claras. */
export const gastos = pgTable("gastos", {
  id: serial().primaryKey(),
  cuentaId: integer().notNull().references(() => cuentas.id, { onDelete: "cascade" }),
  fecha: date().notNull(),
  concepto: text().notNull(),
  proveedor: text().notNull(),
  valorCop: integer().notNull(),
  soporte: text(), // ruta o enlace a la factura
});
