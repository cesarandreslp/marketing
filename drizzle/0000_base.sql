CREATE TABLE "cuentas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre_publico" text NOT NULL,
	"municipio" text NOT NULL,
	"departamento" text NOT NULL,
	"cargo" text NOT NULL,
	"fecha_eleccion" date,
	"fecha_retiro_firme" date,
	"ajustes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"clave_n8n_hash" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cuentas_clave_n8n_hash_unique" UNIQUE("clave_n8n_hash")
);
--> statement-breakpoint
CREATE TABLE "gastos" (
	"id" serial PRIMARY KEY NOT NULL,
	"cuenta_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"concepto" text NOT NULL,
	"proveedor" text NOT NULL,
	"valor_cop" integer NOT NULL,
	"soporte" text
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"cuenta_id" integer NOT NULL,
	"fuente" text NOT NULL,
	"url" text,
	"titulo" text,
	"texto" text NOT NULL,
	"publicado_en" timestamp with time zone,
	"clasificado_en" timestamp with time zone,
	"relevancia" integer,
	"tema" text,
	"comuna" text,
	"sentimiento" text,
	"emocion" text,
	"resumen" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_cuentaId_url_unique" UNIQUE("cuenta_id","url")
);
--> statement-breakpoint
CREATE TABLE "piezas" (
	"id" serial PRIMARY KEY NOT NULL,
	"cuenta_id" integer NOT NULL,
	"semana" date NOT NULL,
	"red" text NOT NULL,
	"formato" text NOT NULL,
	"pilar" text,
	"concepto" text,
	"tema" text,
	"copy" text NOT NULL,
	"guion" text,
	"prompt_media" text,
	"fuentes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alertas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fecha_programada" timestamp with time zone NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"motivo_rechazo" text,
	"reemplaza_a" integer,
	"revisada_ia" boolean DEFAULT false NOT NULL,
	"medio" text,
	"medio_tipo" text,
	"avisada_en" timestamp with time zone,
	"postiz_id" text,
	"postiz_error" text,
	"publicada_en" timestamp with time zone,
	"url_publicada" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumenes" (
	"id" serial PRIMARY KEY NOT NULL,
	"cuenta_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"vinetas" jsonb NOT NULL,
	"enviado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resumenes_cuentaId_fecha_unique" UNIQUE("cuenta_id","fecha")
);
--> statement-breakpoint
CREATE TABLE "secretos" (
	"cuenta_id" integer NOT NULL,
	"clave" text NOT NULL,
	"valor" text NOT NULL,
	"ultimos4" text NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secretos_cuenta_id_clave_pk" PRIMARY KEY("cuenta_id","clave")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"cuenta_id" integer NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"clave_hash" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piezas" ADD CONSTRAINT "piezas_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumenes" ADD CONSTRAINT "resumenes_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secretos" ADD CONSTRAINT "secretos_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE cascade ON UPDATE no action;