// 4T-002293 (Epic 3E-000349): Kleiner, unabhängiger ZIP-Leser für die
// Prüfdateien des ZIP-Schreibers und des PowerPoint-Containers. Er liest vom
// Abschluss-Datensatz aus das zentrale Verzeichnis, folgt jedem Eintrag zu
// seinem lokalen Kopf, entpackt mit `zlib.inflateRawSync` und rechnet
// Prüfsumme und Größen mit `zlib.crc32` nach — also mit einer zweiten,
// fremden Umsetzung statt mit der des Moduls.
//
// Bewusst streng: Jede Abweichung zwischen lokalem Kopf und Verzeichnis und
// jede falsche Prüfsumme wirft, damit ein Prüffall nicht an einem halb
// gelesenen Archiv grün wird.
import { inflateRawSync, crc32 } from 'node:zlib';

const u16 = (b, i) => b.readUInt16LE(i);
const u32 = (b, i) => b.readUInt32LE(i);

/**
 * @param {Uint8Array} archiv
 * @returns {{ eintraege: Array<object>, abschluss: object }}
 */
export function liesZip(archiv) {
  const b = Buffer.from(archiv.buffer, archiv.byteOffset, archiv.length);
  const ende = b.length - 22;
  if (u32(b, ende) !== 0x06054b50) throw new Error('kein Abschluss-Datensatz am Ende');
  const abschluss = {
    datentraeger: u16(b, ende + 4),
    verzeichnisDatentraeger: u16(b, ende + 6),
    anzahlHier: u16(b, ende + 8),
    anzahl: u16(b, ende + 10),
    verzeichnisGroesse: u32(b, ende + 12),
    verzeichnisLage: u32(b, ende + 16),
    kommentarLaenge: u16(b, ende + 20),
  };
  if (abschluss.verzeichnisLage + abschluss.verzeichnisGroesse !== ende) {
    throw new Error('Verzeichnis endet nicht am Abschluss-Datensatz');
  }
  const eintraege = [];
  let p = abschluss.verzeichnisLage;
  for (let i = 0; i < abschluss.anzahl; i += 1) {
    if (u32(b, p) !== 0x02014b50) throw new Error(`Verzeichnis-Eintrag ${i + 1}: Signatur`);
    const z = {
      erzeugtVon: u16(b, p + 4),
      version: u16(b, p + 6),
      kennzeichen: u16(b, p + 8),
      methode: u16(b, p + 10),
      zeit: u16(b, p + 12),
      datum: u16(b, p + 14),
      crc: u32(b, p + 16),
      gepackt: u32(b, p + 20),
      roh: u32(b, p + 24),
      nameLaenge: u16(b, p + 28),
      zusatzLaenge: u16(b, p + 30),
      kommentarLaenge: u16(b, p + 32),
      lage: u32(b, p + 42),
    };
    z.name = b.subarray(p + 46, p + 46 + z.nameLaenge).toString('utf8');
    p += 46 + z.nameLaenge + z.zusatzLaenge + z.kommentarLaenge;

    const l = z.lage;
    if (u32(b, l) !== 0x04034b50) throw new Error(`${z.name}: Signatur des lokalen Kopfs`);
    const lokal = {
      version: u16(b, l + 4),
      kennzeichen: u16(b, l + 6),
      methode: u16(b, l + 8),
      zeit: u16(b, l + 10),
      datum: u16(b, l + 12),
      crc: u32(b, l + 14),
      gepackt: u32(b, l + 18),
      roh: u32(b, l + 22),
      nameLaenge: u16(b, l + 26),
      zusatzLaenge: u16(b, l + 28),
    };
    for (const feld of [
      'version',
      'kennzeichen',
      'methode',
      'zeit',
      'datum',
      'crc',
      'gepackt',
      'roh',
    ]) {
      if (lokal[feld] !== z[feld]) throw new Error(`${z.name}: ${feld} lokal ungleich Verzeichnis`);
    }
    const lokalName = b.subarray(l + 30, l + 30 + lokal.nameLaenge).toString('utf8');
    if (lokalName !== z.name) throw new Error(`${z.name}: Name lokal ungleich Verzeichnis`);
    const start = l + 30 + lokal.nameLaenge + lokal.zusatzLaenge;
    const gepackt = b.subarray(start, start + z.gepackt);
    let daten;
    if (z.methode === 8) daten = inflateRawSync(gepackt);
    else if (z.methode === 0) daten = Buffer.from(gepackt);
    else throw new Error(`${z.name}: Methode ${z.methode}`);
    if (daten.length !== z.roh) throw new Error(`${z.name}: Größe ${daten.length} statt ${z.roh}`);
    if (crc32(daten) !== z.crc) throw new Error(`${z.name}: Prüfsumme falsch`);
    eintraege.push({ ...z, lokal, datenLage: start, daten });
  }
  if (p !== ende) throw new Error('Verzeichnis-Größe passt nicht zu den Einträgen');
  return { eintraege, abschluss };
}

/**
 * @param {Uint8Array} archiv
 * @returns {Map<string, Buffer>} Name → entpackte Daten, in Archiv-Reihenfolge.
 */
export function zipInhalt(archiv) {
  return new Map(liesZip(archiv).eintraege.map((e) => [e.name, e.daten]));
}
