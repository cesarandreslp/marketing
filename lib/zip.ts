import { crc32 } from "node:zlib";

/** ZIP sin compresión (los PDF ya van comprimidos): suficiente para entregar varios archivos en una sola descarga. */
export function zip(archivos: { nombre: string; datos: Buffer }[]): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const { nombre, datos } of archivos) {
    const n = Buffer.from(nombre, "utf8");
    const crc = crc32(datos);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0);
    l.writeUInt16LE(20, 4); // versión mínima
    l.writeUInt16LE(0x0800, 6); // nombre en UTF-8
    l.writeUInt16LE(0x21, 12); // fecha fija: 1980-01-01
    l.writeUInt32LE(crc, 14);
    l.writeUInt32LE(datos.length, 18);
    l.writeUInt32LE(datos.length, 22);
    l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(datos.length, 20);
    c.writeUInt32LE(datos.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(desplazamiento, 42);
    locales.push(l, n, datos);
    centrales.push(c, n);
    desplazamiento += 30 + n.length + datos.length;
  }
  const central = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(central.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, central, fin]);
}
