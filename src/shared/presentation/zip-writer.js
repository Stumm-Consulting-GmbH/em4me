// 4T-002293 (Epic 3E-000349): ZIP-Schreiber für den PowerPoint-Container der
// Stufe 3 (Entscheidung C1 des Product Owners vom 2026-10-17: Eigenbau ohne
// neue Abhängigkeit, gekennzeichnete Abweichung vom Standard pptxgenjs).
//
// Format nach der PKWARE-Beschreibung (APPNOTE.TXT): je Eintrag ein lokaler
// Datei-Kopf mit den Daten, danach das zentrale Verzeichnis und der
// Abschluss-Datensatz. Bewusst nur der Ausschnitt, den eine feste Liste von
// Einträgen braucht:
//
// - **kein Daten-Deskriptor** (Bit 3 der Allzweck-Kennzeichen bleibt aus),
//   weil Prüfsumme und Größen vor dem Schreiben feststehen; PowerPoint und
//   andere Leser verlangen dann keine Nachträge hinter den Daten;
// - **kein ZIP64**: Mehr als 65 535 Einträge oder eine Größe bzw. Lage über
//   4 GiB brechen mit einem Fehler ab, statt eine Datei zu erzeugen, deren
//   Verzeichnis überläuft;
// - Bit 11 (Namen in UTF-8) ist immer gesetzt;
// - die Reihenfolge der Einträge bleibt, wie sie übergeben wird. Dass
//   `[Content_Types].xml` vorn steht, sichert der Aufrufer (pptx-writer.js).
//
// Prozessneutral (Entwicklungsrichtlinien, Kapitel 1): Die Kompression wird
// übergeben, nicht geladen. Der Hauptprozess reicht `zlib.deflateRawSync`
// hinein, die Prüfdatei ebenso; so lädt das Modul zur Lade-Zeit kein
// Node-Modul. Die Prüfsumme CRC-32 rechnet es selbst, weil `zlib.crc32` erst
// ab Node 20.15 besteht und an die Übergabe einer zweiten Funktion gebunden
// wäre.
'use strict';

/** Signatur des lokalen Datei-Kopfs. */
const SIG_LOKAL = 0x04034b50;
/** Signatur eines Eintrags im zentralen Verzeichnis. */
const SIG_ZENTRAL = 0x02014b50;
/** Signatur des Abschluss-Datensatzes. */
const SIG_ABSCHLUSS = 0x06054b50;

/** Version 2.0: Deflate und Verzeichnisse (APPNOTE 4.4.3). */
const VERSION = 20;
/** Allzweck-Kennzeichen: nur Bit 11 (UTF-8), Bit 3 ausdrücklich aus. */
const KENNZEICHEN_UTF8 = 0x0800;
const METHODE_DEFLATE = 8;
const METHODE_STORE = 0;

const LAENGE_LOKAL = 30;
const LAENGE_ZENTRAL = 46;
const LAENGE_ABSCHLUSS = 22;

/** Grenzen des einfachen Formats ohne ZIP64. */
const MAX_EINTRAEGE = 0xffff;
const MAX_GROESSE = 0xffffffff;
const MAX_NAME_BYTES = 0xffff;

/** CRC-32-Tabelle zum Polynom 0xEDB88320 (gespiegelte Form, wie ZIP und PNG). */
const CRC_TABELLE = (() => {
  const tabelle = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabelle[n] = c >>> 0;
  }
  return tabelle;
})();

/**
 * Prüfsumme CRC-32 nach ZIP (Startwert 0xFFFFFFFF, Einerkomplement am Ende).
 *
 * @param {Uint8Array} daten
 * @returns {number} vorzeichenlose 32-Bit-Zahl.
 */
function crc32(daten) {
  let c = 0xffffffff;
  for (let i = 0; i < daten.length; i += 1) c = CRC_TABELLE[(c ^ daten[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Datum und Uhrzeit im MS-DOS-Format (APPNOTE 4.4.6), aus der Ortszeit wie
 * bei den verbreiteten Packern. Vor 1980 und nach 2107 ist das Format nicht
 * darstellbar; dann gilt die nächste darstellbare Grenze.
 *
 * @param {Date} zeitpunkt
 * @returns {{ zeit: number, datum: number }}
 */
function dosZeit(zeitpunkt) {
  const jahr = zeitpunkt.getFullYear();
  if (jahr < 1980) return { zeit: 0, datum: (1 << 5) | 1 };
  if (jahr > 2107) return { zeit: (23 << 11) | (59 << 5) | 29, datum: (127 << 9) | (12 << 5) | 31 };
  return {
    zeit:
      (zeitpunkt.getHours() << 11) | (zeitpunkt.getMinutes() << 5) | (zeitpunkt.getSeconds() >> 1),
    datum: ((jahr - 1980) << 9) | ((zeitpunkt.getMonth() + 1) << 5) | zeitpunkt.getDate(),
  };
}

/**
 * Ein Fehler an einer Grenze des einfachen Formats, mit Grund-Code für die
 * Meldung des Aufrufers.
 *
 * @param {'eintraege'|'groesse'} grund
 * @param {string} text
 * @returns {Error & {grund: string}}
 */
function grenzFehler(grund, text) {
  const fehler = new Error(`ZIP: ${text}`);
  fehler.grund = grund;
  return fehler;
}

/**
 * Prüft einen Eintrag und bringt ihn in die Schreib-Form.
 *
 * @param {unknown} eintrag
 * @param {number} nr 1-basiert, für die Meldung.
 * @param {TextEncoder} kodierer
 * @param {(daten: Uint8Array) => Uint8Array} deflate
 * @returns {{ name: Uint8Array, daten: Uint8Array, methode: number, crc: number, roh: number }}
 */
function bereiteEintrag(eintrag, nr, kodierer, deflate) {
  if (!eintrag || typeof eintrag !== 'object') throw new TypeError(`ZIP: Eintrag ${nr} fehlt`);
  const { name, daten, komprimieren = true } = eintrag;
  if (typeof name !== 'string' || name === '') {
    throw new TypeError(`ZIP: Eintrag ${nr} ohne Namen`);
  }
  // Ein Name ist ein relativer Pfad mit Schrägstrich (APPNOTE 4.4.17.1).
  if (name.startsWith('/') || name.includes('\\')) {
    throw new TypeError(`ZIP: Name ${name} ist kein relativer Pfad mit /`);
  }
  if (typeof komprimieren !== 'boolean') {
    throw new TypeError(`ZIP: Eintrag ${name}: komprimieren ist kein Wahrheitswert`);
  }
  let roh;
  if (typeof daten === 'string') roh = kodierer.encode(daten);
  else if (daten instanceof Uint8Array) roh = daten;
  else throw new TypeError(`ZIP: Eintrag ${name}: Daten weder Uint8Array noch Text`);

  const nameBytes = kodierer.encode(name);
  if (nameBytes.length > MAX_NAME_BYTES) throw grenzFehler('groesse', `Name zu lang: ${name}`);
  if (roh.length > MAX_GROESSE) throw grenzFehler('groesse', `Eintrag ${name} über 4 GiB`);

  const crc = crc32(roh);
  let gepackt = roh;
  if (komprimieren) {
    gepackt = deflate(roh);
    if (!(gepackt instanceof Uint8Array)) {
      throw new TypeError(`ZIP: deflate lieferte für ${name} kein Uint8Array`);
    }
    if (gepackt.length > MAX_GROESSE) throw grenzFehler('groesse', `Eintrag ${name} über 4 GiB`);
  }
  return {
    name: nameBytes,
    daten: gepackt,
    methode: komprimieren ? METHODE_DEFLATE : METHODE_STORE,
    crc,
    roh: roh.length,
  };
}

/**
 * Schreibt die Felder, die lokaler Kopf und Verzeichnis-Eintrag teilen
 * (Version needed bis Namenslänge), ab `stelle`.
 *
 * @returns {number} die Stelle hinter den Feldern.
 */
function schreibeGemeinsam(sicht, stelle, eintrag, zeit) {
  sicht.setUint16(stelle, VERSION, true);
  sicht.setUint16(stelle + 2, KENNZEICHEN_UTF8, true);
  sicht.setUint16(stelle + 4, eintrag.methode, true);
  sicht.setUint16(stelle + 6, zeit.zeit, true);
  sicht.setUint16(stelle + 8, zeit.datum, true);
  sicht.setUint32(stelle + 10, eintrag.crc, true);
  sicht.setUint32(stelle + 14, eintrag.daten.length, true);
  sicht.setUint32(stelle + 18, eintrag.roh, true);
  sicht.setUint16(stelle + 22, eintrag.name.length, true);
  return stelle + 24;
}

/**
 * Erzeugt ein ZIP-Archiv aus einer festen Liste von Einträgen.
 *
 * @param {Array<{ name: string, daten: Uint8Array|string, komprimieren?: boolean }>} eintraege
 *   in Schreib-Reihenfolge; Text wird als UTF-8 abgelegt; `komprimieren`
 *   (Vorgabe `true`) wählt Deflate, sonst Store.
 * @param {object} optionen
 * @param {(daten: Uint8Array) => Uint8Array} optionen.deflate rohes Deflate
 *   ohne Kopf (im Hauptprozess `zlib.deflateRawSync`); Pflicht.
 * @param {Date} optionen.zeitpunkt Zeitstempel aller Einträge; Pflicht.
 * @returns {Uint8Array} das Archiv.
 * @throws {TypeError} bei ungültiger Eingabe.
 * @throws {Error} mit `grund` `eintraege` oder `groesse` an den Grenzen ohne ZIP64.
 */
function erstelleZip(eintraege, optionen) {
  const { deflate, zeitpunkt } = optionen || {};
  if (typeof deflate !== 'function') throw new TypeError('ZIP: deflate fehlt');
  if (!(zeitpunkt instanceof Date) || Number.isNaN(zeitpunkt.getTime())) {
    throw new TypeError('ZIP: zeitpunkt ist kein gültiges Datum');
  }
  if (!Array.isArray(eintraege)) throw new TypeError('ZIP: Einträge sind keine Liste');
  if (eintraege.length > MAX_EINTRAEGE) {
    throw grenzFehler('eintraege', `${eintraege.length} Einträge, höchstens ${MAX_EINTRAEGE}`);
  }

  const kodierer = new TextEncoder();
  const zeit = dosZeit(zeitpunkt);
  const namen = new Set();
  const bereit = eintraege.map((eintrag, i) => {
    const b = bereiteEintrag(eintrag, i + 1, kodierer, deflate);
    if (namen.has(eintrag.name)) throw new TypeError(`ZIP: Name doppelt: ${eintrag.name}`);
    namen.add(eintrag.name);
    return b;
  });

  // Lagen vorab rechnen: Die Grenzen werden geprüft, bevor Speicher belegt wird.
  let lage = 0;
  const lagen = bereit.map((b) => {
    const eigene = lage;
    lage += LAENGE_LOKAL + b.name.length + b.daten.length;
    return eigene;
  });
  const verzeichnisLage = lage;
  const verzeichnisGroesse = bereit.reduce((s, b) => s + LAENGE_ZENTRAL + b.name.length, 0);
  if (verzeichnisLage + verzeichnisGroesse > MAX_GROESSE) {
    throw grenzFehler('groesse', 'Archiv über 4 GiB');
  }

  const archiv = new Uint8Array(verzeichnisLage + verzeichnisGroesse + LAENGE_ABSCHLUSS);
  const sicht = new DataView(archiv.buffer);

  bereit.forEach((b, i) => {
    let stelle = lagen[i];
    sicht.setUint32(stelle, SIG_LOKAL, true);
    stelle = schreibeGemeinsam(sicht, stelle + 4, b, zeit);
    sicht.setUint16(stelle, 0, true); // keine Zusatzfelder
    archiv.set(b.name, stelle + 2);
    archiv.set(b.daten, stelle + 2 + b.name.length);
  });

  let stelle = verzeichnisLage;
  bereit.forEach((b, i) => {
    sicht.setUint32(stelle, SIG_ZENTRAL, true);
    sicht.setUint16(stelle + 4, VERSION, true); // erzeugt von: MS-DOS, Version 2.0
    const hinter = schreibeGemeinsam(sicht, stelle + 6, b, zeit);
    // Zusatzfeld, Kommentar, Datenträger, interne und externe Attribute: 0.
    sicht.setUint32(hinter + 12, lagen[i], true);
    archiv.set(b.name, hinter + 16);
    stelle = hinter + 16 + b.name.length;
  });

  sicht.setUint32(stelle, SIG_ABSCHLUSS, true);
  sicht.setUint16(stelle + 8, bereit.length, true);
  sicht.setUint16(stelle + 10, bereit.length, true);
  sicht.setUint32(stelle + 12, verzeichnisGroesse, true);
  sicht.setUint32(stelle + 16, verzeichnisLage, true);
  return archiv;
}

module.exports = { erstelleZip, crc32, MAX_EINTRAEGE };
