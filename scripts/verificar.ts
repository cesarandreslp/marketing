import assert from "node:assert/strict";
import { enCampana, publicacionHabilitada, revisar } from "../lib/cumplimiento";
import { cifrar, descifrar, hashClave, verificarClave } from "../lib/cifrado";
import { crearToken, leerToken } from "../lib/sesion";
import { nombresMunicipio, parsearFeed } from "../lib/fuentes";
import { fechaHora, proximoLunes } from "../lib/estratega";
import { rutaDeMedio } from "../lib/medios";

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

console.log("verificación OK");
