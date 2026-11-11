import assert from "node:assert/strict";
import { enCampana, publicacionHabilitada, revisar } from "../lib/cumplimiento";
import { cifrar, descifrar, hashClave, verificarClave } from "../lib/cifrado";
import { crearToken, leerToken } from "../lib/sesion";
import { enlaceVerificable, nombresMunicipio, parsearFeed, urlsNoticias } from "../lib/fuentes";
import { cuerpoDeNota } from "../lib/noticias";
import { leerCompetidores } from "../lib/competencia";
import { fechaHora, proximoLunes } from "../lib/estratega";
import { rutaDeMedio } from "../lib/medios";
import { filasAItems, leerLineasRobots, limpiarEnlace } from "../lib/browseai";

// Filtro de pre-campaña
assert.deepEqual(revisar("Fui al barrio Popular y me hablaron del agua."), []);
for (const pedido of [
  "Vota por mí en 2027",
  "Voten por el cambio",
  "Quiero tu voto por mí",
  "Dame tu voto",
  "Regálame tu voto este domingo",
  "Acompáñame en 2027",
  "Ayúdame a llegar al Concejo",
  "Apóyame en las urnas",
]) {
  assert.ok(revisar(pedido).length > 0, pedido);
}
// Pedagogía electoral: legal en pre-campaña.
for (const pedagogia of [
  "Yo le enseñé a Buga a cuidar su voto",
  "Cómo funciona el voto y los testigos electorales",
  "El que cuida el voto",
  "Un voto informado vale más",
  "¿Quieres ser testigo electoral?",
  "Así se cuenta un voto en la mesa",
]) {
  assert.deepEqual(revisar(pedagogia), [], pedagogia);
}
assert.ok(revisar("Soy candidato al Concejo").length > 0);
assert.ok(revisar("Concejal 2028-2031").length > 0);
assert.ok(revisar("Alcaldesa 2028").length > 0);
// Modo campaña: ya se puede pedir el voto y presentarse; lo demás sigue prohibido.
assert.deepEqual(revisar("Soy candidato: vota por mí, marca el número 3 en el tarjetón", [], true), []);
assert.ok(revisar("Soy candidato: vota por mí").length > 0); // en pre-campaña sí alerta
assert.ok(revisar("Gran sorteo para quienes me apoyen", [], true).length > 0);
assert.ok(revisar("Con el escudo de la Alcaldía", [], true).length > 0);
assert.ok(revisar("El predial subió 12%", [], true).includes("Dato numérico sin fuente"));
assert.equal(enCampana(null, new Date()), false);
assert.equal(enCampana("2027-07-29", new Date("2027-07-28T23:59:00-05:00")), false);
assert.equal(enCampana("2027-07-29", new Date("2027-07-29T00:00:00-05:00")), true);
assert.ok(revisar("El predial subió 12%").includes("Dato numérico sin fuente"));
assert.deepEqual(revisar("El predial subió 12%", ["https://www.datos.gov.co/x"]), []);

const retiro = (fechaRetiroFirme: string | null, nuncaServidorPublico = false) => ({ fechaRetiroFirme, nuncaServidorPublico });
assert.equal(publicacionHabilitada(retiro(null)), false);
assert.equal(publicacionHabilitada(retiro(null, true)), true); // nunca fue servidor público: no se exige fecha
assert.equal(publicacionHabilitada(retiro("2026-10-20"), new Date("2026-10-19T12:00:00-05:00")), false);
assert.equal(publicacionHabilitada(retiro("2026-10-20"), new Date("2026-10-20T00:00:00-05:00")), true);

// Cifrado de secretos y contraseñas
process.env.APP_MASTER_KEY = "11".repeat(32);
const sobre = cifrar("sk-secreto-123");
assert.notEqual(sobre, cifrar("sk-secreto-123")); // IV aleatorio
assert.equal(descifrar(sobre), "sk-secreto-123");
assert.throws(() => descifrar(sobre.slice(0, -2) + "AA")); // manipulado → GCM lo rechaza
const h = hashClave("mi clave larga");
assert.ok(verificarClave("mi clave larga", h));
assert.ok(!verificarClave("otra", h));

// Sesión firmada
process.env.SESSION_SECRET = "x".repeat(40);
const t = crearToken(7, 3);
assert.deepEqual(
  (({ usuarioId, cuentaId }) => ({ usuarioId, cuentaId }))(leerToken(t)!),
  { usuarioId: 7, cuentaId: 3 },
);
const [datos] = t.split(".");
const falso = Buffer.from(JSON.stringify({ usuarioId: 7, cuentaId: 4, exp: 9e9 })).toString("base64url");
assert.equal(leerToken(`${falso}.${t.split(".")[1]}`), null); // cambiar de cuenta invalida la firma
assert.equal(leerToken(`${datos}.malo`), null);

// Lector de feeds (RSS 2.0 y Atom)
const rss = `<rss><channel><item><title><![CDATA[Cierre vial en la &quot;Calle 4&quot;]]></title>
<link>https://medio.co/a</link><pubDate>Fri, 09 Oct 2026 14:00:00 GMT</pubDate>
<description>&lt;p&gt;Obras en el &#225;rea centro&lt;/p&gt;</description></item></channel></rss>`;
const [r1] = parsearFeed(rss, "rss");
assert.equal(r1.titulo, 'Cierre vial en la "Calle 4"');
assert.equal(r1.url, "https://medio.co/a");
assert.equal(r1.texto, "Obras en el área centro");
assert.equal(r1.publicadoEn?.toISOString(), "2026-10-09T14:00:00.000Z");
const atom = `<feed><entry><title>Concejo aprueba presupuesto</title><link rel="alternate" href="https://medio.co/b"/>
<updated>2026-10-08T10:00:00Z</updated><summary>Debate de 4 horas</summary></entry></feed>`;
const [a1] = parsearFeed(atom, "rss");
assert.equal(a1.url, "https://medio.co/b");
assert.equal(a1.texto, "Debate de 4 horas");
assert.deepEqual(nombresMunicipio("Guadalajara de Buga"), ["Guadalajara de Buga", "Buga"]);
assert.deepEqual(nombresMunicipio("Tuluá"), ["Tuluá"]);

// Fechas de la semana (Bogotá)
assert.equal(proximoLunes("2026-10-10"), "2026-10-12"); // sábado → lunes siguiente
assert.equal(proximoLunes("2026-10-11"), "2026-10-12"); // domingo
assert.equal(proximoLunes("2026-10-12"), "2026-10-19"); // lunes → el de la otra semana
assert.equal(fechaHora("2026-10-12", 3, "18:30").toISOString(), "2026-10-14T23:30:00.000Z"); // miércoles 6:30 p. m.
assert.equal(fechaHora("2026-10-12", 9, "07:30").toISOString(), "2026-10-18T12:30:00.000Z"); // día fuera de rango → domingo

// Archivos: solo los de la propia cuenta y con nombre válido
const nom = "7-123e4567-e89b-12d3-a456-426614174000.mp4";
assert.equal(rutaDeMedio(7, nom)?.mime, "video/mp4");
assert.equal(rutaDeMedio(8, nom), null); // de otra cuenta
assert.equal(rutaDeMedio(7, "../7-123e4567-e89b-12d3-a456-426614174000.mp4"), null);
assert.equal(rutaDeMedio(7, "7-123e4567-e89b-12d3-a456-426614174000.exe"), null);

// Robots de Browse AI: filas → menciones
const filas = { Publicaciones: [
  { Position: "1", Texto: "-" }, // fila vacía
  { Position: "2", Texto: "Atentado en la vía Buga Tuluá hoy", Enlace: "https://www.facebook.com/x/posts/1" },
  { Position: "3", texto: "Se presentó un accidente en la vía" }, // sin enlace
] };
const menciones = filasAItems(filas, "facebook", "https://www.facebook.com/search/top?q=buga");
assert.equal(menciones.length, 2);
assert.equal(menciones[0].url, "https://www.facebook.com/x/posts/1");
assert.match(menciones[1].url!, /^https:\/\/www\.facebook\.com\/search\/top\?q=buga#[0-9a-f]{16}$/);
assert.equal(filasAItems(null, "facebook", "u").length, 0);
assert.deepEqual(leerLineasRobots("facebook abc\nbasura\ntiktok def https://tiktok.com/tag/bugavalle\nfacebook"), [
  { red: "facebook", id: "abc", url: undefined, perfil: false },
  { red: "tiktok", id: "def", url: "https://tiktok.com/tag/bugavalle", perfil: false },
]);
assert.equal(leerLineasRobots("facebook abc perfil")[0].perfil, true);
assert.deepEqual(leerCompetidores("Ana Pérez | https://www.facebook.com/ana\nLuis\n | sin nombre\nRosa | basura"), [
  { nombre: "Ana Pérez", url: "https://www.facebook.com/ana" },
  { nombre: "Luis", url: undefined },
  { nombre: "Rosa", url: undefined },
]);

assert.equal(limpiarEnlace("https://www.facebook.com/reel/1/?__cft__[0]=AZ&__tn__=%2CO"), "https://www.facebook.com/reel/1/");
assert.equal(limpiarEnlace("https://www.facebook.com/permalink.php?story_fbid=9&id=2&__tn__=x"), "https://www.facebook.com/permalink.php?story_fbid=9&id=2");
assert.equal(filasAItems({ L: [{ texto: "Corte de agua en el barrio Popular hoy... Ver más" }] }, "facebook", "u")[0].texto, "Corte de agua en el barrio Popular hoy");
assert.equal(limpiarEnlace("https://www.instagram.com/p/ABC/?igsh=xyz&utm_source=qr"), "https://www.instagram.com/p/ABC/");
assert.equal(enlaceVerificable("https://x.co/a#abc"), null);
assert.equal(enlaceVerificable("https://x.co/a"), "https://x.co/a");
// Google Noticias: la descripción es «titular + medio»; se usa el titular y no quedan entidades dobles.
const [g] = parsearFeed("<rss><item><title>Choque en la vía - El Tiempo</title><link>https://n.google.com/a</link><description>&lt;a&gt;Choque en la vía&lt;/a&gt;&amp;nbsp;&amp;nbsp;El Tiempo</description></item></rss>", "noticias");
assert.equal(g.texto, "Choque en la vía - El Tiempo");
assert.equal(parsearFeed("<rss><item><title>t</title><description>A&amp;nbsp;B</description></item></rss>", "rss")[0].texto, "A B");
assert.equal(urlsNoticias("Buga", "Valle del Cauca", ["aseo basuras", "tema nuevo"]).length, 1 + 9 + 1); // sin repetir temas
const nota = `<html><nav><p>${"menú ".repeat(30)}</p></nav><p>${"El Concejo debatió el contrato del aseo. ".repeat(3)}</p><p>${"La empresa nueva asumirá el servicio desde enero. ".repeat(3)}</p></html>`;
assert.ok(cuerpoDeNota(nota).includes("asumirá el servicio") && !cuerpoDeNota(nota).includes("menú"));
assert.equal(cuerpoDeNota('<meta property="og:description" content="Resumen de la nota"><p>corto</p>'), "Resumen de la nota");

console.log("verificación OK");
