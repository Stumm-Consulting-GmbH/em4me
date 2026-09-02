// 4T-1289 (Epic 3E-0224): Namensform und Erkennung der Teile großer Dokumente.
// Ein Dokument jenseits der Größen-Schwelle liegt in mehreren Teil-Dateien,
// die die Anwendung als ein Dokument führt. Träger der Zuordnung sind zwei
// Spuren mit klarer Rangfolge (Architektur, Kapitel «Teilung großer
// Dokumente»): die Zeile im Frontmatter jeder Teil-Datei ist die Wahrheit,
// der Katalog in der Begleitdatei des ersten Teils ist Cache.
//
// Dieses Modul ist die Single Source für beide Formen der Zuordnung:
//   - die Namensform «Name•part-00002» (Zerlegen, Prüfen, Bilden) und
//   - die Zuordnungs-Zeile im Frontmatter (Lesen, Schreiben, Entfernen).
// Es liest und schreibt selbst keine Dateien und kennt keinen Prozess;
// Electron-frei (CommonJS, Vorbild src/shared/subpages.js).
'use strict';

const { extractFrontmatter, writeFrontmatter } = require('./markdown/frontmatter.js');

// U+2022 BULLET (F3). Bewusst ein anderes Zeichen als das Unterseiten-
// Trennzeichen U+2215 und bewusst kein Homoglyph dazu: Bei gleichem oder
// ähnlichem Zeichen müsste jede Verarbeitungs-Stelle der Unterseiten den
// Frontmatter jedes Kandidaten lesen, um echte Unterseiten von Teil-Dateien
// zu trennen — genau dieser Zwang ist der Grund für ein eigenes Zeichen.
const PART_SEP = '•';

// Sprachneutraler Infix der Namensform (F4). Wie eine Dateiendung nicht
// übersetzt: Ein übersetzter Namensteil bräche bei jedem Sprachwechsel der
// Oberfläche sämtliche Verweise auf die Teil-Dateien.
const PART_INFIX = 'part-';

// Fünf Stellen (F4). Die Nummer wird nie wiederverwendet (Ablage-Regel), die
// Stellenzahl hängt damit nicht an der Zahl gleichzeitiger Teile, sondern an
// der Summe aller je vergebenen.
const PART_DIGITS = 5;

// Die Kopf-Datei behält ihren Namen unverändert und ist Teil 1 (F4). Ein
// Namens-Suffix tragen deshalb erst die Folgeteile ab Position 2; die
// Position im Frontmatter beginnt dagegen bei 1, weil auch die Kopf-Datei
// eine Teil-Datei ist und ihre Zuordnungs-Zeile trägt.
const FIRST_PART_INDEX = 1;
const FIRST_SUFFIXED_PART_INDEX = 2;

// Schlüssel der Zuordnungs-Zeile im Frontmatter. Kleingeschrieben, englisch
// und sprachneutral aus demselben Grund wie PART_INFIX.
const PART_FRONTMATTER_KEY = 'doc-part';

// Schema-Version der Zuordnungs-Zeile (O6). Wird mitgeschrieben, damit ein
// späteres Format erkennbar bleibt; Konvention und Konstanten-Muster wie bei
// BOOK_SCHEMA_VERSION in src/shared/books/book-core.js.
const PART_SCHEMA_VERSION = 1;

// Feld-Trenner der Zuordnungs-Zeile. Der Grundname steht bewusst als LETZTES
// Feld: Beim Lesen wird nur zweimal getrennt, der Rest ist der Name. Damit
// darf er jedes Zeichen enthalten — auch den Trenner selbst — ohne dass das
// Format eine eigene Maskierung braucht.
const PART_VALUE_SEP = '|';

// Byte-Order-Mark am Datei-Anfang. extractFrontmatter erkennt einen Block nur,
// wenn die Datei mit '---' beginnt; ein vorangestelltes BOM verhindert das.
// Die Bestands-Konsumenten (src/main/ipc/index-views.js, profile-catalog.js)
// schneiden es vor dem Lesen ab und setzen es beim Schreiben wieder davor.
// Dieses Modul übernimmt das selbst, damit die aufsetzenden Pakete den Fall
// nicht jedes Mal neu behandeln müssen.
const BOM = '﻿';

// Die Erkennung vergleicht NFC-normalisiert. Dateinamen erreichen die
// Anwendung je nach Dateisystem in unterschiedlicher Normalisierungsform;
// der Bestand normalisiert seine Datei-Schlüssel aus demselben Grund auf NFC
// (src/main/index/cache.js, resolve.js, ipc/rename.js, area/area-search.js).
function normalize(value) {
  return String(value == null ? '' : value).normalize('NFC');
}

// Fünfstellige Nummer aus einer Position ('2' -> '00002').
function formatPartNumber(index) {
  return String(index).padStart(PART_DIGITS, '0');
}

// Trägt der Basename die Namensform eines Folgeteils?
// Geprüft wird ausschließlich der Name, ohne Datei-Zugriff und ohne
// Frontmatter — das ist der Zweck des eigenen Trennzeichens.
function isPartBasename(basename) {
  return parsePartBasename(basename) !== null;
}

// Zerlegt den Basename eines Folgeteils in Grundname und Position.
// Liefert { base, index } oder null, wenn der Name die Form nicht trägt.
// Erwartet den Basename OHNE Datei-Endung.
//
// Kein Teil sind (AK4): ein Name ohne das Trennzeichen, ein Name mit
// Trennzeichen aber ohne den Infix, eine Nummer mit abweichender Stellenzahl
// oder Nicht-Ziffern, ein leerer Grundname und die Positionen 0 und 1 — die
// Kopf-Datei trägt nie einen Namens-Suffix, eine Datei «Name•part-00001»
// kann also kein gültiger Teil sein.
function parsePartBasename(basename) {
  const name = normalize(basename);
  const idx = name.lastIndexOf(PART_SEP);
  if (idx <= 0) return null;
  const suffix = name.slice(idx + PART_SEP.length);
  if (!suffix.startsWith(PART_INFIX)) return null;
  const digits = suffix.slice(PART_INFIX.length);
  if (digits.length !== PART_DIGITS) return null;
  if (!/^[0-9]+$/.test(digits)) return null;
  const index = Number(digits);
  if (index < FIRST_SUFFIXED_PART_INDEX) return null;
  return { base: name.slice(0, idx), index };
}

// Bildet den Basename eines Folgeteils aus Grundname und Position.
// Liefert null, wenn der Grundname leer oder die Position kein Folgeteil ist.
function buildPartBasename(base, index) {
  const name = normalize(base);
  if (!name) return null;
  if (!Number.isInteger(index) || index < FIRST_SUFFIXED_PART_INDEX) return null;
  if (String(index).length > PART_DIGITS) return null;
  return name + PART_SEP + PART_INFIX + formatPartNumber(index);
}

// Grundname zu einem beliebigen Basename: bei einem Folgeteil sein
// Grundname, sonst der Name selbst. Damit führt jede Teil-Datei auf den
// Namen der Kopf-Datei zurück, ohne dass der Aufrufer die Form prüfen muss.
function baseBasenameOf(basename) {
  const parsed = parsePartBasename(basename);
  return parsed ? parsed.base : normalize(basename);
}

// Präfix, unter dem alle Folgeteile eines Dokuments liegen
// ('Name' -> 'Name•part-'). Vorbild childPrefix in subpages.js; gedacht als
// billiger Vorfilter beim Durchsehen eines Verzeichnisses.
function partPrefix(base) {
  return normalize(base) + PART_SEP + PART_INFIX;
}

// Formt den Wert der Zuordnungs-Zeile: 'v<Schema>|<Position>|<Grundname>'.
function formatPartValue(index, base, schemaVersion = PART_SCHEMA_VERSION) {
  return `v${schemaVersion}${PART_VALUE_SEP}${index}${PART_VALUE_SEP}${normalize(base)}`;
}

// Zerlegt den Wert der Zuordnungs-Zeile.
// Liefert { schemaVersion, index, base } oder null bei unlesbarer Form.
//
// Eine UNBEKANNTE Schema-Version ist ausdrücklich kein null: Die Zeile wird
// gelesen und die Version mitgeliefert, damit ein Aufrufer eine fremde
// Fassung erkennen und darauf reagieren kann (etwa nur-lesend öffnen),
// statt die Datei für ein gewöhnliches Dokument zu halten.
function parsePartValue(value) {
  if (typeof value !== 'string') return null;
  const first = value.indexOf(PART_VALUE_SEP);
  if (first < 0) return null;
  const second = value.indexOf(PART_VALUE_SEP, first + 1);
  if (second < 0) return null;
  const versionField = value.slice(0, first);
  if (!/^v[0-9]+$/.test(versionField)) return null;
  const indexField = value.slice(first + 1, second);
  if (!/^[0-9]+$/.test(indexField)) return null;
  const index = Number(indexField);
  if (index < FIRST_PART_INDEX) return null;
  const base = normalize(value.slice(second + 1));
  if (!base) return null;
  return { schemaVersion: Number(versionField.slice(1)), index, base };
}

// Liest die Zuordnungs-Zeile aus dem Datei-Inhalt.
// Liefert { schemaVersion, index, base } oder null, wenn die Datei keinen
// lesbaren Frontmatter, keine Zeile oder eine unlesbare Zeile trägt.
function readPartLine(text) {
  const source = String(text == null ? '' : text);
  const withoutBom = source.startsWith(BOM) ? source.slice(BOM.length) : source;
  const fm = extractFrontmatter(withoutBom);
  if (fm.parseError) return null;
  if (!fm.data || typeof fm.data !== 'object' || Array.isArray(fm.data)) return null;
  return parsePartValue(fm.data[PART_FRONTMATTER_KEY]);
}

// Schreibt die Zuordnungs-Zeile in den Datei-Inhalt.
// zuordnung ist { index, base } oder null; null entfernt die Zeile
// (Gegenstück für das Wiedervereinen). Liefert { ok, text } bzw.
// { ok: false, error }. Der übrige Frontmatter bleibt unangetastet, weil
// writeFrontmatter nur geänderte Felder neu serialisiert.
function writePartLine(text, zuordnung) {
  const source = String(text == null ? '' : text);
  const hadBom = source.startsWith(BOM);
  const withoutBom = hadBom ? source.slice(BOM.length) : source;
  const fm = extractFrontmatter(withoutBom);
  if (fm.parseError) return { ok: false, error: fm.parseError };
  const data = {
    ...(fm.data && typeof fm.data === 'object' && !Array.isArray(fm.data) ? fm.data : {}),
  };
  if (zuordnung === null || zuordnung === undefined) {
    delete data[PART_FRONTMATTER_KEY];
  } else {
    const index = zuordnung.index;
    if (!Number.isInteger(index) || index < FIRST_PART_INDEX) {
      return { ok: false, error: 'ungueltige Position' };
    }
    const base = normalize(zuordnung.base);
    if (!base) return { ok: false, error: 'leerer Grundname' };
    data[PART_FRONTMATTER_KEY] = formatPartValue(index, base);
  }
  const written = writeFrontmatter(withoutBom, data);
  if (!written.ok) return written;
  return { ok: true, text: (hadBom ? BOM : '') + written.text };
}

module.exports = {
  PART_SEP,
  PART_INFIX,
  PART_DIGITS,
  PART_FRONTMATTER_KEY,
  PART_SCHEMA_VERSION,
  FIRST_PART_INDEX,
  FIRST_SUFFIXED_PART_INDEX,
  isPartBasename,
  parsePartBasename,
  buildPartBasename,
  baseBasenameOf,
  partPrefix,
  formatPartValue,
  parsePartValue,
  readPartLine,
  writePartLine,
};
