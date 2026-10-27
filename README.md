# Radar Territorial

Escucha territorial y bandeja de contenidos para campañas locales en Colombia (pre-campaña y campaña).

- **App (Next.js, en el host, puerto 3000):** IA, filtro legal, bandeja de aprobación y configuración.
- **n8n + Postgres (Docker, solo 127.0.0.1):** programación de tareas, conectores y publicación en redes.

## Varias cuentas

Cada campaña es una **cuenta**. Todo dato (piezas, escucha, gastos, claves) lleva `cuenta_id` y toda consulta filtra por
la cuenta de la sesión o de la clave de n8n. Cada cliente ingresa en **Configuración** sus propias API keys, sus redes y
su bot de Telegram; las claves se cifran con AES-256-GCM (`APP_MASTER_KEY`) y nunca vuelven al navegador.

`.env` solo tiene la configuración de la instalación. La primera cuenta se crea en `/bienvenida`; para abrir el
registro a más personas, usa `REGISTRO_ABIERTO=1`.

## Escucha (fase 1)

- **Fuentes** ([lib/fuentes.ts](lib/fuentes.ts)):
  - Google Noticias (RSS del municipio).
  - Medios locales (RSS, en Configuración).
  - X, con la herramienta `x_search` de Grok. Cuesta unos USD 5 por cada 1.000 posts leídos; se piden hasta 25 por día.
  - Capturas o textos que reenvías al bot de Telegram. De estos solo se guarda un resumen sin nombres.
- **Clasificación** ([lib/escucha.ts](lib/escucha.ts)), con el rol "masivo": relevancia (0–3), tema, barrio, sentimiento, emoción y un resumen de una línea.
- **Radar** ([lib/radar.ts](lib/radar.ts)): ordena los temas por volumen × crecimiento frente a la semana anterior × relevancia.
- **Resumen diario** ([lib/resumen.ts](lib/resumen.ts)), con el rol "textos": 5 viñetas enviadas por Telegram.

## Semana y bandeja (fase 2)

El estratega ([lib/estratega.ts](lib/estratega.ts)) trabaja con el rol "textos" (Mistral → Gemini → GLM) en tres pasos:

1. **Plan:** 3 videos, 2 carruseles y 7 posts de X, repartidos por pilares (40 % escucha, 30 % explicar lo público, 20 % quién soy, 10 % coyuntura). Usa el radar, las menciones y lo que rechazaste antes.
2. **Redacción:** guion para grabar o texto de las láminas, prompt de imagen y un copy por red. Solo redacta para las redes que tienen usuario configurado.
3. **Revisión:** una segunda lectura con IA, más el filtro por regex. Cualquier alerta bloquea la aprobación.

En la bandeja, cada concepto agrupa sus redes:

- **Editar:** vuelve a pasar el filtro.
- **Rechazar con motivo:** se rehace esa pieza atendiendo el comentario.
- **Rechazar sin motivo:** se descarta.
- **Aprobar semana:** aprueba todo lo que no tiene alertas.

Los sábados a las 8:00 a. m. se genera la semana siguiente y llega un aviso por Telegram.

## Publicación (fase 3: asistida)

- **Calendario** (`/calendario`): la semana de lunes a domingo, con la hora, la red y el estado de cada pieza.
- **Foto o video por concepto:** se suben desde la bandeja y se guardan en `datos/medios/` (fuera de git; se incluyen en el respaldo).
- **Avisos** ([lib/publicador.ts](lib/publicador.ts)): cada 15 minutos, todo lo aprobado cuya hora ya llegó se envía por Telegram. El aviso lleva la foto o el video (si pesa hasta 50 MB), el texto listo para copiar y el botón «✅ Ya lo publiqué». Antes de la fecha de retiro en firme no se envía nada.
- **Marcar como publicada:** con el botón de Telegram (se procesa en la siguiente lectura del bot, 1–2 minutos) o desde la bandeja.
## Postiz: publicación automática

Postiz es un programador de publicaciones de código abierto (AGPL-3.0, v2.25.1) que corre en Docker junto a n8n: [docker-compose.postiz.yml](docker-compose.postiz.yml), en http://localhost:4007. Ocupa unos 10 GB de disco y 2–3 GB de RAM, porque incluye Temporal y Elasticsearch.

- Cada 15 minutos, [lib/postiz.ts](lib/postiz.ts) programa en Postiz lo aprobado cuya red tenga un canal conectado allá. Luego revisa el estado de cada post: si quedó publicado, lo marca con su enlace; si falló, lo devuelve al aviso de Telegram sin reintentar.
- Lo que no tiene canal en Postiz, o le falta la foto o el video, sigue con el aviso de Telegram.
- **Requisitos de cada red**, que no dependen de Postiz:
  - Una app de desarrollador por red, con su ID y su secreto en `.env` (`POSTIZ_*`).
  - Para Facebook e Instagram, una página de Facebook con Instagram profesional vinculado.
  - Instagram y TikTok descargan los medios desde una URL pública: necesitan `POSTIZ_STORAGE=cloudflare` con un bucket R2.
  - TikTok pide además https y la aprobación de su app.
  - Publicar por la API de X tiene costo según su plan.
- La clave de su API (Settings → Public API) se pega en la app: Configuración → Redes sociales → Postiz.

La app instala los flujos en n8n con su API: Configuración → Integración n8n → API key → Instalar flujos. El flujo
`Radar · <cuenta>` llama a la app:

| Horario | Ruta |
|---|---|
| Cada 2 min | `POST /api/n8n/telegram` (lee el bot sin exponer el PC) |
| 5:00 a. m. | `POST /api/n8n/escuchar` (recolecta y clasifica) |
| 6:30 a. m. | `POST /api/n8n/resumen` |
| Cada 15 min | `POST /api/n8n/publicar` (avisos de publicación) |
| Sábados 8:00 a. m. | `POST /api/n8n/semana` (arma la semana siguiente) |

## API para n8n

`Authorization: Bearer <clave de la cuenta>`. La genera el instalador de flujos o, a mano, Configuración → Integración
n8n → Avanzado. URL base: `http://host.docker.internal:3000/api/n8n`.

- `POST /escuchar`, `POST /resumen`, `POST /telegram`, `POST /semana`: las tareas programadas (arriba).
- `POST /items`: entrega lo recolectado (`[{fuente, url?, titulo?, texto, publicadoEn?}]`), por ejemplo comentarios de tus redes leídos con las credenciales de n8n.
- `GET /pendientes`: piezas aprobadas cuya hora ya llegó. Devuelve una lista vacía antes de la fecha de retiro en firme.
- `POST /publicada`: `{id, url?}` marca una pieza como publicada.

## Instalar

1. Abre Docker Desktop.
2. Ejecuta `powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1`.
3. Ejecuta `npm run dev`, abre http://localhost:3000 y crea tu cuenta.

Otros scripts:

- `scripts\energia.ps1`: evita que el PC se suspenda.
- `scripts\respaldo.ps1`: respalda los flujos de n8n y la base de datos.
- `npm run verificar`: pruebas del filtro legal, el cifrado, la sesión y el lector de feeds.
