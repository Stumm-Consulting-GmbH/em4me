// 4T-002388 (Epic 3E-000265, Schritt 1, Entscheidung F1 A): Der zweite Lese-Weg
// der Datensatz-Ebene, für eine Tabelle in Kartei-Form.
//
// **Dieselbe Grund-Stufe wie die Tabellen-Form.** `record-table-read.js` legt
// das Dokument einer Tabelle aus und hält das Ergebnis als Grund-Stufe; eine
// Kartei-Tabelle trägt dort keinen Datensatz-Block (4T-002386). Für sie baut
// dieses Modul die Datensätze der Grund-Stufe aus den Karteikarten, in genau
// der Gestalt, die `parseDocument` für die Zeilen eines Blocks liefert
// (`{ id, display, key, file, line, texts, values, refs }` samt `byId`,
// `byKey`, `duplicateIds`, `withoutId`). Alles darüber bleibt ein Weg:
// Ergebnis-Stufe, Verweis-Auflösung (`targetOf`, `recordRef`), Abfrage,
// Hüllen, Datensatz-Suche und der Entwurfs-Datensatz der Einzel-Maske. Ein
// Verweis auf eine Kartei-Tabelle löst damit ohne eigene Regel auf, auch aus
// einer Tabelle der Tabellen-Form.
//
// **Welche Karteikarten es gibt, sagt der Index; ihren Inhalt die Datei.**
// Die Liste kommt aus der Datensatz-Spur des Index (`recordsPerFile`, Einträge
// mit `kartei`, 4T-002387), in der überlagerten Sicht, damit eine Karteikarte
// mit ungespeichertem Stand dabei ist. Gelesen wird je Karteikarte ihr
// Dateikopf, der ungespeicherte Stand vor dem der Platte, wie bei der Kopf-Datei
// der Tabellen-Form. Ausgelegt werden die Werte mit der einen Funktion für
// beide Ablage-Arten (`karteikartenWerte` in `karteikarte.js`); die Werte des
// Index sind beschnitten und taugen dafür nicht.
//
// **Die Kennung aus der Datei.** Die Liste des Index sagt nur, welche Dateien
// Karteikarten sind; die Kennung liest das Modul frisch aus dem Dateikopf.
// Trägt er keine brauchbare mehr, weil der Index noch nicht nachgezogen hat,
// zählt die Karteikarte wie ein Datensatz ohne Kennung (`withoutId`).
//
// **Gültigkeit.** Die Grund-Stufe gilt, solange zusätzlich zur Kopf-Datei die
// Liste der Karteikarten dieselbe ist und jede Karteikarte unverändert: der
// Puffer-Text derselbe oder, ohne Puffer, Änderungszeit und Größe gleich. Die
// Liste wird nur neu gebildet, wenn sich Index- oder Puffer-Zähler bewegt
// haben, weil ihr Durchlauf mit der Zahl der Datensatz-Dateien wächst.
//
// **Kein Datei-Zyklus.** Die Lese-Hilfen und die Auslegung eines Zell-Textes
// (`readText`, `stampsUnchanged`, `typedValue`) gehören `record-table-read.js`
// und kommen als Parameter herein; ein Import zurück schlösse einen Kreis, weil
// jenes Modul die Weiche zu diesem trägt.
//
// **Nicht hier:** der Vorlagen-Ausschluss. Ihn kennt nur das Fenster, das den
// Vorlagen-Ordner gewählt hat; die Grund-Stufe gehört allen Fenstern. Die
// Abfrage schließt deshalb je Zeile über die Datei des Datensatzes aus
// (`query-records.js`).
'use strict';

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { karteikartenKennung, karteikartenWerte } = require('../../shared/database/karteikarte.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { VERWEIS_TYP } = require('../database/record-regel-hilfen.js');
const { indexes, indexStand } = require('./store.js');
const { bufferTextFor, entryWithOverlay, overlaysUnder, overlayStand } = require('./overlay.js');

const LINK_TYPE = 'link';

// Die Zeile einer Karteikarte: ihre erste, der Dateikopf (Fundort im Index
// `zeile: 0`, hier ab 1 gezählt wie die Zeilen der Tabellen-Form).
const ERSTE_ZEILE = 1;

// Die Verweis-Auslegung eines Datensatzes vor der Ergebnis-Stufe; wie in
// `record-table-read.js` eine geteilte, nie beschriebene Map.
const NO_REFS = new Map();

/**
 * Die Dateien der Karteikarten einer Kartei-Tabelle, nach Pfad geordnet.
 *
 * @param {string} root Wurzel des Bereichs-Index.
 * @param {string} head Pfad der Tabellen-Datei.
 * @returns {string[]} Leer ohne bereiten Index-Eintrag.
 */
function kartenDateien(root, head) {
  const entry = indexes.get(root);
  if (!entry || !entry.recordsPerFile) return [];
  const sicht = entryWithOverlay(entry, overlaysUnder(root));
  const gesucht = pathCompareKey(head);
  const dateien = [];
  for (const [absPath, records] of sicht.recordsPerFile) {
    if (!Array.isArray(records) || records.length === 0 || !records[0].kartei) continue;
    if (pathCompareKey(records[0].kartei) === gesucht) dateien.push(absPath);
  }
  return dateien.sort();
}

// Der Text einer Karteikarte: der Puffer, sonst die Platte samt Stand.
function liesKarte(datei, readText) {
  const puffer = bufferTextFor(datei);
  if (puffer !== null) return { datei, puffer, stamps: [], text: puffer };
  const stamps = [];
  const text = readText(datei, stamps);
  return text === null ? null : { datei, puffer: null, stamps, text };
}

function spaltenIndex(fields, name) {
  if (typeof name !== 'string') return -1;
  const klein = name.toLowerCase();
  return fields.findIndex((feld) => feld.name.toLowerCase() === klein);
}

/**
 * Die Datensätze einer Kartei-Tabelle für die Grund-Stufe.
 *
 * @param {object} p Parameter.
 * @param {string} p.root Wurzel des Bereichs-Index.
 * @param {string} p.head Pfad der Tabellen-Datei.
 * @param {object} p.parsed Ergebnis von `parseDocument` für die Tabellen-Datei
 *   (`definition`, `fields`, `displayField`).
 * @param {object} p.helfer `{ readText, typedValue }` aus `record-table-read.js`.
 * @returns {{bestand: object, kartei: object}} `bestand` mit `records`, `byId`,
 *   `byKey`, `duplicateIds`, `withoutId` in der Gestalt von `parseDocument`;
 *   `kartei` der Stand für `karteiUnveraendert`.
 */
function leseKarteikarten({ root, head, parsed, helfer }) {
  const { definition, fields, displayField } = parsed;
  const displayIndex = spaltenIndex(fields, displayField);
  const keyIndexes = Array.isArray(definition.key)
    ? definition.key.map((name) => spaltenIndex(fields, name))
    : null;
  const dateien = kartenDateien(root, head);
  const karten = [];
  const records = [];
  const byId = new Map();
  const byKey = new Map();
  const duplicateIds = [];
  let withoutId = 0;
  for (const datei of dateien) {
    const karte = liesKarte(datei, helfer.readText);
    // Fehlt die Datei, zählt sie nicht; der Stand merkt sie trotzdem.
    karten.push(karte || { datei, puffer: null, stamps: [], fehlt: true });
    if (karte === null) continue;
    const frontmatter = extractFrontmatter(karte.text).data;
    const { kennung } = karteikartenKennung(frontmatter);
    if (kennung === null) {
      withoutId += 1;
      continue;
    }
    const zellen = karteikartenWerte(frontmatter, definition);
    const texts = zellen.map((zelle) => zelle.text);
    const cell = (i) => (i >= 0 && i < texts.length ? texts[i] : '');
    const values = new Map();
    for (let i = 0; i < fields.length; i++) {
      const type = fields[i].type;
      // Verweise löst die Ergebnis-Stufe auf, wie in der Tabellen-Form.
      const isRef = type === LINK_TYPE || type === VERWEIS_TYP;
      values.set(fields[i].name.toLowerCase(), isRef ? null : helfer.typedValue(type, cell(i)));
    }
    const display = displayIndex >= 0 ? cell(displayIndex).trim() : '';
    const record = {
      id: kennung,
      display: display === '' ? null : display,
      key: keyIndexes ? keyIndexes.map(cell) : null,
      file: datei,
      line: ERSTE_ZEILE,
      texts,
      values,
      refs: NO_REFS,
    };
    records.push(record);
    if (byId.has(kennung)) duplicateIds.push(kennung);
    else byId.set(kennung, record);
    // Ein Verweis per Schlüssel-Wert trifft nur einen einteiligen Schlüssel,
    // ungetrimmt verglichen wie in der Tabellen-Form.
    if (keyIndexes && keyIndexes.length === 1) {
      const liste = byKey.get(record.key[0]);
      if (liste) liste.push(record);
      else byKey.set(record.key[0], [record]);
    }
  }
  return {
    bestand: { records, byId, byKey, duplicateIds, withoutId },
    kartei: {
      karten,
      dateien,
      indexStand: indexStand(root),
      overlayStand: overlayStand(),
    },
  };
}

/**
 * Gilt der Stand der Karteikarten einer Grund-Stufe noch?
 *
 * @param {string} root Wurzel des Bereichs-Index.
 * @param {string} head Pfad der Tabellen-Datei.
 * @param {object} kartei Der Stand aus `leseKarteikarten`.
 * @param {(stamps: Array) => boolean} stampsUnchanged Aus `record-table-read.js`.
 * @returns {boolean}
 */
function karteiUnveraendert(root, head, kartei, stampsUnchanged) {
  if (indexStand(root) !== kartei.indexStand || overlayStand() !== kartei.overlayStand) {
    const jetzt = kartenDateien(root, head);
    if (jetzt.length !== kartei.dateien.length) return false;
    if (jetzt.some((datei, i) => datei !== kartei.dateien[i])) return false;
  }
  for (const karte of kartei.karten) {
    const puffer = bufferTextFor(karte.datei);
    // Eine fehlende Datei, die der Index noch führt: neu lesen, bis er
    // nachgezogen hat; ein Wiederauftauchen bliebe sonst unbemerkt.
    if (karte.fehlt) return false;
    if (puffer !== null || karte.puffer !== null) {
      if (puffer !== karte.puffer) return false;
      continue;
    }
    if (!stampsUnchanged(karte.stamps)) return false;
  }
  return true;
}

module.exports = { leseKarteikarten, karteiUnveraendert, kartenDateien };
