// 4T-002038 (Epic 3E-000258): Der Tabellen-Bestand für die Abfrage. Liest eine
// Datenbank-Tabelle mit allen Datensätzen und ihren typisierten Feld-Werten,
// frisch zur Laufzeit, als Grundlage der Datensatz-Ebene der Abfrage-Sprache.
//
// **Frisch aus der Datei, nicht aus dem Index.** Der Index führt je Datensatz
// Kennung, Schlüssel, Anzeige-Form und Zeile, aber keine Zellwerte (Variante A1
// vom 2026-09-08, `datensatz-erfassung.js`): Er hielte sonst die ganze Datenbank
// dauerhaft im Arbeitsspeicher. Welche Tabellen es gibt, sagt der Index, ihren
// Inhalt die Datei (E26.4).
//
// **Das Dokument einer Tabelle ist das, was der Editor öffnet.** Eine geteilte
// Tabelle öffnet der Lese-Weg als EIN zusammengesetztes Dokument unter dem Pfad
// der Kopf-Datei (`file:read` in `src/main/ipc/files.js`), und genau diesen Text
// meldet der Editor als ungespeicherten Stand an die Puffer-Schicht; eine
// Folge-Datei hat deshalb nie einen eigenen Puffer. Die Regel hier ist eine:
// Liegt für die Kopf-Datei ein Puffer vor, ist er das Dokument; sonst entsteht
// das Dokument wie beim Öffnen aus Kopf-Datei und Folge-Dateien der Platte
// (`assembleParts`). Ausgelegt wird danach auf einem Weg, und die Zeile eines
// Datensatzes zählt in diesem Dokument, also dort, wo der Editor ihn zeigt.
//
// **Synchron**, nach dem Vorbild von `leseKopfSync` und `erfasseAusDatei`: Der
// Erzeuger der Abfrage und seine drei Aufrufer arbeiten synchron.
//
// **Zwei Stufen im Zwischenspeicher.** Die Grund-Stufe hält das ausgelegte
// Dokument einer Tabelle. Sie gilt, solange der Puffer-Text derselbe ist, oder
// ohne Puffer, solange Index-Stand, Änderungszeit und Größe aller gelesenen
// Dateien gleich sind; sie wartet damit nicht auf den Datei-Beobachter. Die
// Ergebnis-Stufe löst darüber die Verweise auf, Datei-Verweise über den Index
// und Datensatz-Verweise über die Grund-Stufe der Ziel-Tabelle. Sie gilt,
// solange Index- und Puffer-Zähler, die eigene Grund-Stufe und die der
// Ziel-Tabellen dieselben sind. Getrennt sind die Stufen, weil der Puffer-Zähler
// bei jedem Tippen in irgendeinem offenen Dokument hochzählt; ohne die Trennung
// läse jede solche Bewegung die Tabelle erneut von der Platte. Beide Stufen sind
// gedeckelt, damit der Speicher an den abgefragten Tabellen hängt und nicht an
// der Größe der Datenbank.
//
// **Keine aufgelöste Beschriftung im Zwischenspeicher** (E21.6): Die Definition
// trägt die Beschriftungs-Angaben der Datei; aufgelöst wird je Lauf beim
// Aufrufer, damit ein Sprachwechsel nichts Veraltetes zeigt.
//
// **Weich beim eigenen Wert** (E22): Ein Wert, der nicht zu seinem Typ passt, ist
// «fehlend» (`null`), ein unlesbarer Teil fehlt und wird genannt. Nichts davon
// bricht die Abfrage ab.
//
// **Aus-Zustand** (E15.4): Ruht der Datensatz-Bestand des Index, liest das Modul
// keine Datei und liefert `null`.
//
// Die zurückgegebenen Objekte sind Einträge des Zwischenspeichers und werden
// von Aufrufern nur gelesen, nie verändert.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { MD_EXT_RE, createWikiLinkRegex } = require('../../shared/markdown/link-scan.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { readPartLine, FIRST_PART_INDEX } = require('../../shared/document-parts.js');
const { orderPartFiles, assembleParts } = require('../../shared/document-assembly.js');
const { parseTableDefinition } = require('../../shared/database/table-definition.js');
const { parseRecordBlock } = require('../../shared/database/record-block.js');
const { ROLLE_KOPF, datensatzRumpf } = require('../../shared/database/record-segment.js');
const { zellTexte } = require('../../shared/database/record-write.js');
const { zellWert } = require('../../shared/database/record-values.js');
const { anzeigeSpalte } = require('../../shared/database/record-identity.js');
const { VERWEIS_ARTEN, legeVerweisZelleAus } = require('../../shared/database/record-verweis.js');
const { parseIsoLocalMs } = require('../../shared/query/query-format.js');
// Dieselbe Auflösung einer Tabellen-Angabe wie die Wertehilfe der Verweis-Felder
// (Name oder Pfad relativ zur Bereichs-Wurzel, gegen die Tabellen-Sicht), damit
// eine Abfrage und eine Verweis-Spalte mit derselben Angabe dieselbe Tabelle
// meinen. Kein Datei-Zyklus: Nichts unter `database/` lädt dieses Modul.
const { findeZielTabelle } = require('../database/datensatz-liste.js');
const { VERWEIS_TYP, zielAngabe } = require('../database/record-regel-hilfen.js');
const { tabellenName } = require('../database/table-catalog.js');
const { indexes, indexStand } = require('./store.js');
const { bufferTextFor, entryWithOverlay, overlaysUnder, overlayStand } = require('./overlay.js');
const { resolveWikiLink, filesByAlias } = require('./resolve.js');
const { logicalNameFor } = require('./link-graph.js');
const { datensatzErfassungAktiv } = require('./index-schalter.js');

const LINK_TYPE = 'link';

// Die Verweis-Auslegung eines Datensatzes ohne Verweis-Feld. Eine geteilte, nie
// beschriebene Map statt einer je Datensatz; die Einträge sind nur zu lesen.
const NO_REFS = new Map();

// Deckel der beiden Stufen, nach dem Muster in `datensatz-zugriff.js`: Beim
// Überlauf fällt der älteste Eintrag heraus. Die Auflösung einer Angabe hält nur
// einen Pfad und darf deshalb mehr Einträge führen.
const MAX_TABLES = 16;
const MAX_HEADS = 64;

const baseCache = new Map(); // Wurzel | Kopf-Pfad -> Grund-Stufe
const resultCache = new Map(); // Wurzel | Kopf-Pfad -> Ergebnis-Stufe samt Stand
const headCache = new Map(); // Wurzel | Angabe -> { indexStand, overlayStand, head }

// Zählt, wie oft ein Dokument tatsächlich gelesen und ausgelegt wurde. Der
// Nachweis des Zwischenspeichers zählt Lese-Vorgänge und nicht Laufzeit.
let reads = 0;

function readCount() {
  return reads;
}

/** Nur für Tests: alle Zwischenspeicher und den Zähler zurücksetzen. */
function clearCaches() {
  baseCache.clear();
  resultCache.clear();
  headCache.clear();
  reads = 0;
}

function remember(map, key, value, max) {
  map.delete(key);
  map.set(key, value);
  if (map.size > max) map.delete(map.keys().next().value);
}

function cacheKey(root, head) {
  return root + ' | ' + pathCompareKey(head);
}

// --- Dateien lesen -------------------------------------------------------------------

// Liest eine Datei und merkt Änderungszeit und Größe. Gemessen wird VOR dem
// Lesen: Ändert sich die Datei dazwischen, ist der gemerkte Stand der ältere,
// und der nächste Aufruf liest neu; umgekehrt bliebe ein veralteter Inhalt mit
// einem aktuellen Stand stehen. BOM und Zeilenenden wie im Lese-Weg der Anwendung.
function readText(file, stamps) {
  let stat;
  let raw;
  try {
    stat = fs.statSync(file);
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return null; // fehlt oder ist gesperrt: der Aufrufer entscheidet, was das heißt
  }
  stamps.push({ path: file, mtimeMs: stat.mtimeMs, size: stat.size });
  return raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

function stampsUnchanged(stamps) {
  for (const stamp of stamps) {
    let stat;
    try {
      stat = fs.statSync(stamp.path);
    } catch {
      return false;
    }
    if (stat.mtimeMs !== stamp.mtimeMs || stat.size !== stamp.size) return false;
  }
  return true;
}

// Die Folge-Dateien einer geteilten Tabelle, geordnet über dieselben Regeln wie
// der Lese-Weg des Editors (`orderPartFiles`). Der Verzeichnis-Durchlauf selbst
// ist die synchrone Fassung von `scanPartFiles` in `document-parts-io.js`, dessen
// Lesen asynchron ist. Das Verzeichnis geht mit in den Stand ein, damit ein neuer
// oder entfernter Teil sofort erkannt wird.
function partFilesOf(head, stamps) {
  const dir = path.dirname(head);
  let entries;
  try {
    const stat = fs.statSync(dir);
    entries = fs.readdirSync(dir, { withFileTypes: true });
    stamps.push({ path: dir, mtimeMs: stat.mtimeMs, size: stat.size });
  } catch {
    return { parts: [], gaps: [] };
  }
  const basenames = [];
  const names = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || !MD_EXT_RE.test(entry.name)) continue;
    const basename = entry.name.replace(MD_EXT_RE, '');
    basenames.push(basename);
    names.set(pathCompareKey(basename), entry.name);
  }
  const ext = path.extname(head) || '.md';
  const ordered = orderPartFiles(path.parse(head).name, basenames, pathCompareKey);
  const parts = ordered.parts
    .filter((part) => part.index !== FIRST_PART_INDEX)
    .map((part) => ({
      index: part.index,
      path: path.join(dir, names.get(pathCompareKey(part.basename)) || part.basename + ext),
    }));
  return { parts, gaps: ordered.luecken };
}

// Das Dokument einer Tabelle von der Platte, zusammengesetzt wie beim Öffnen.
// Der Regelfall, die ungeteilte Tabelle, liest kein Verzeichnis.
function readDiskDocument(head) {
  const stamps = [];
  const headText = readText(head, stamps);
  if (headText === null) return null;
  if (readPartLine(headText) === null) return { text: headText, stamps, missingParts: [] };
  const { parts, gaps } = partFilesOf(head, stamps);
  const pieces = [{ index: FIRST_PART_INDEX, content: headText }];
  const missing = [...gaps];
  for (const part of parts) {
    const text = readText(part.path, stamps);
    if (text === null) missing.push(part.index);
    else pieces.push({ index: part.index, content: text });
  }
  return { text: assembleParts(pieces).text, stamps, missingParts: missing.sort((a, b) => a - b) };
}

// --- Grund-Stufe: das Dokument auslegen ------------------------------------------------

function columnIndex(fields, name) {
  if (typeof name !== 'string') return -1;
  const lower = name.toLowerCase();
  return fields.findIndex((field) => field.name.toLowerCase() === lower);
}

// Der Wert einer Zelle nach dem Typ ihrer Spalte, über die Auslegung, die auch
// Maske und Schreibweg benutzen (`zellWert`). Ein Typ-Fehler ist «fehlend»; ein
// Datum wird zum Datums-Wert des Werte-Modells, eine Uhrzeit bleibt Text.
function typedValue(type, text) {
  const { value, error } = zellWert(type, text);
  if (error !== null) return null;
  if (type === 'date') return value === null ? null : { kind: 'date', ms: parseIsoLocalMs(value) };
  return value;
}

/**
 * Legt das Dokument einer Tabelle aus.
 *
 * @returns {object|null} null, wenn das Dokument keine Tabellen-Definition trägt.
 */
function parseDocument(text, head) {
  const definition = parseTableDefinition(extractFrontmatter(text).data);
  if (!definition.istTabelle) return null;
  const fields = definition.fields;
  const block = datensatzRumpf(text);
  // Ohne `fields`: Pflicht und Feld-Regeln wirken beim Lesen nicht auf den Wert
  // einer Abfrage, und ihre Auswertung kostete hier nur Zeit.
  const parsed = block && block.rolle === ROLLE_KOPF ? parseRecordBlock(block.rumpf, null) : null;
  const displayField = anzeigeSpalte(definition);
  const displayIndex = columnIndex(fields, displayField);
  const keyIndexes = Array.isArray(definition.key)
    ? definition.key.map((name) => columnIndex(fields, name))
    : null;

  const records = [];
  const byId = new Map();
  const byKey = new Map();
  const duplicateIds = [];
  let withoutId = 0;
  for (const record of parsed ? parsed.records : []) {
    // Ohne Kennung ist ein Datensatz nicht ansprechbar, weder als Treffer noch
    // als Ziel eines Verweises; die Wertehilfe übergeht ihn ebenso.
    if (!record.id) {
      withoutId += 1;
      continue;
    }
    // Die Texte des Schreibwegs: Der Trennabstand hinter einem Datensatz gehört
    // nicht zum Wert seiner letzten Zelle (`zellTexte`).
    const texts = zellTexte(record);
    const cell = (i) => (i >= 0 && i < texts.length ? texts[i] : '');
    const values = new Map();
    for (let i = 0; i < fields.length; i++) {
      const type = fields[i].type;
      // Verweise löst die Ergebnis-Stufe auf; der Platzhalter hält die
      // Reihenfolge der Definition in der Zuordnung.
      const isRef = type === LINK_TYPE || type === VERWEIS_TYP;
      values.set(fields[i].name.toLowerCase(), isRef ? null : typedValue(type, cell(i)));
    }
    const display = displayIndex >= 0 ? cell(displayIndex).trim() : '';
    const entry = {
      id: record.id,
      display: display === '' ? null : display,
      key: keyIndexes ? keyIndexes.map(cell) : null,
      file: head,
      line: block.vonZeile + record.zeile + 1,
      texts,
      values,
      refs: NO_REFS,
    };
    records.push(entry);
    if (byId.has(record.id)) duplicateIds.push(record.id);
    else byId.set(record.id, entry);
    // Ein Verweis per Schlüssel-Wert trifft nur einen einteiligen Schlüssel und
    // wird ungetrimmt verglichen, wie im Index und in der Verweis-Regel.
    if (keyIndexes && keyIndexes.length === 1) {
      const list = byKey.get(entry.key[0]);
      if (list) list.push(entry);
      else byKey.set(entry.key[0], [entry]);
    }
  }
  return { definition, fields, displayField, records, byId, byKey, duplicateIds, withoutId };
}

// Die Grund-Stufe einer Tabelle, aus dem Zwischenspeicher oder frisch gelesen.
function baseFor(root, head, currentIndexStand) {
  const key = cacheKey(root, head);
  const known = baseCache.get(key);
  const buffer = bufferTextFor(head);
  if (buffer !== null) {
    if (known && known.source === 'buffer' && known.text === buffer) return known;
  } else if (
    known &&
    known.source === 'disk' &&
    known.indexStand === currentIndexStand &&
    stampsUnchanged(known.stamps)
  ) {
    return known;
  }

  const document =
    buffer !== null ? { text: buffer, stamps: [], missingParts: [] } : readDiskDocument(head);
  if (document === null) {
    baseCache.delete(key);
    return null;
  }
  reads += 1;
  const parsed = parseDocument(document.text, head);
  if (parsed === null) {
    baseCache.delete(key);
    return null;
  }
  const base = {
    ...parsed,
    head,
    source: buffer !== null ? 'buffer' : 'disk',
    // Nur beim Puffer gehalten: Er ist dort der Vergleichs-Stand und liegt
    // ohnehin im Speicher der Puffer-Schicht.
    text: buffer,
    stamps: document.stamps,
    indexStand: currentIndexStand,
    missingParts: document.missingParts,
  };
  remember(baseCache, key, base, MAX_TABLES);
  return base;
}

// --- Ergebnis-Stufe: Verweise auflösen ----------------------------------------------------

// Die Kopf-Datei zu einer Angabe, gegen die Tabellen-Sicht mit Puffer-Overlay,
// damit auch eine gerade angelegte, noch nicht gespeicherte Tabelle gefunden
// wird. Gemerkt gegen Index- und Puffer-Zähler, weil der Durchlauf über die
// Sicht mit der Zahl der Dateien wächst.
function headFor(root, entry, ref, stand) {
  const key = root + ' | ' + ref;
  const known = headCache.get(key);
  if (known && known.indexStand === stand.index && known.overlayStand === stand.overlay) {
    return known.head;
  }
  const sicht = entryWithOverlay(entry, overlaysUnder(root));
  const head = findeZielTabelle({ wurzel: root, sicht, tabelle: ref });
  remember(
    headCache,
    key,
    { indexStand: stand.index, overlayStand: stand.overlay, head },
    MAX_HEADS,
  );
  return head;
}

// Ein Datei-Verweis: die ganze Zelle als Wiki-Link oder als bloßer Name,
// aufgelöst wie ein Ziel der Abfrage (`createTargetResolver` in
// `link-graph.js`). Trifft der Name genau eine Datei, entsteht ein Datei-Verweis
// des Werte-Modells; sonst bleibt der Text, denn ein Verweis auf ein noch nicht
// angelegtes Dokument ist bei Dateien ein gewöhnlicher Zustand und kein Fehler.
function linkValue(entry, text) {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const match = createWikiLinkRegex().exec(trimmed);
  const whole = match && match.index === 0 && match[0].length === trimmed.length;
  const target = (whole ? match[1] : trimmed).split('#')[0].trim().replace(MD_EXT_RE, '');
  if (target === '') return trimmed;
  let files = resolveWikiLink(entry, target);
  if (files.length === 0) files = filesByAlias(entry, target);
  if (files.length !== 1) return trimmed;
  return { kind: 'link', path: files[0], name: logicalNameFor(files[0]) };
}

// Die Ziel-Tabelle einer Verweis-Spalte, samt ihrer Grund-Stufe.
function targetOf(root, entry, field, stand, deps) {
  const ref = zielAngabe(field);
  if (ref === null) return { status: 'noTarget' };
  const head = headFor(root, entry, ref, stand);
  const base = head === null ? null : baseFor(root, head, stand.index);
  if (base === null) return { status: 'unknownTable' };
  deps.set(cacheKey(root, head), { head, base });
  return { status: 'ok', head, base, table: tabellenName(head) };
}

// Eine Verweis-Zelle nach der Ordnung aus E5.4: Die Kennung gewinnt, sonst ist
// der Text ein Wert des einteiligen Schlüssels. Liefert den Wert (ein
// Datensatz-Verweis oder «fehlend») und die Auslegung samt Befund.
function recordRef(target, text) {
  const cell = legeVerweisZelleAus(text);
  const raw = { text, art: cell.art, wert: cell.wert, table: target.table || null };
  if (cell.art === VERWEIS_ARTEN.leer) return { value: null, ref: { ...raw, status: 'empty' } };
  if (target.status !== 'ok') return { value: null, ref: { ...raw, status: target.status } };
  let hit;
  if (cell.art === VERWEIS_ARTEN.kennung) {
    hit = target.base.byId.get(cell.wert) || null;
    if (hit === null) return { value: null, ref: { ...raw, status: 'notFound' } };
  } else {
    const key = target.base.definition.key;
    if (!Array.isArray(key) || key.length !== 1) {
      return { value: null, ref: { ...raw, status: 'noSingleKey' } };
    }
    const hits = target.base.byKey.get(cell.wert) || [];
    if (hits.length === 0) return { value: null, ref: { ...raw, status: 'notFound' } };
    if (hits.length > 1) return { value: null, ref: { ...raw, status: 'ambiguous' } };
    hit = hits[0];
  }
  const value = {
    kind: 'record',
    table: target.table,
    id: hit.id,
    display: hit.display || '',
    path: target.head,
  };
  return { value, ref: { ...raw, status: 'ok' } };
}

function buildResult(root, entry, base, stand) {
  const deps = new Map();
  const linkFields = [];
  const refFields = [];
  base.fields.forEach((field, i) => {
    if (field.type === LINK_TYPE) linkFields.push({ i, name: field.name.toLowerCase() });
    if (field.type === VERWEIS_TYP) {
      const target = targetOf(root, entry, field, stand, deps);
      refFields.push({ i, name: field.name.toLowerCase(), target });
    }
  });
  // Ohne Verweis-Felder ist die Grund-Stufe bereits das Ergebnis; kopiert wird
  // nur, wo es etwas aufzulösen gibt.
  let records = base.records;
  let byId = base.byId;
  if (linkFields.length > 0 || refFields.length > 0) {
    records = base.records.map((record) => {
      const cell = (i) => (i < record.texts.length ? record.texts[i] : '');
      const values = new Map(record.values);
      const refs = new Map();
      for (const { i, name } of linkFields) values.set(name, linkValue(entry, cell(i)));
      for (const { i, name, target } of refFields) {
        const resolved = recordRef(target, cell(i));
        values.set(name, resolved.value);
        refs.set(name, resolved.ref);
      }
      return { ...record, values, refs };
    });
    byId = new Map();
    for (const record of records) if (!byId.has(record.id)) byId.set(record.id, record);
  }
  const table = {
    table: tabellenName(base.head),
    path: base.head,
    source: base.source,
    definition: {
      fields: base.fields,
      key: Array.isArray(base.definition.key) ? base.definition.key : null,
      display: base.displayField,
    },
    records,
    byId,
    duplicateIds: base.duplicateIds,
    withoutId: base.withoutId,
    missingParts: base.missingParts,
  };
  return { table, deps };
}

function depsUnchanged(root, deps, currentIndexStand) {
  for (const { head, base } of deps.values()) {
    if (baseFor(root, head, currentIndexStand) !== base) return false;
  }
  return true;
}

/**
 * Liest eine Datenbank-Tabelle für die Abfrage: alle Datensätze mit ihren
 * typisierten Feld-Werten, der ungespeicherte Stand vor dem der Platte.
 *
 * @param {string} root Wurzel des Bereichs-Index.
 * @param {string} tableRef Die Tabelle beim Namen (Dateiname ohne Endung) oder als
 *   Pfad, absolut oder relativ zur Wurzel.
 * @returns {object|null} `null` im Aus-Zustand, bei nicht bereitem Index, bei
 *   einer unbekannten Tabelle und bei einer unlesbaren Kopf-Datei; sonst
 *   `{ table, path, source, definition: { fields, key, display }, records, byId,
 *   duplicateIds, withoutId, missingParts }`. `source` ist `'buffer'` oder
 *   `'disk'`; `display` ist das Feld der Anzeige-Form oder null. Je Datensatz
 *   `{ id, display, key, file, line, texts, values, refs }`: `display` die
 *   Anzeige-Form (getrimmt) oder null, `key` die Texte des fachlichen Schlüssels
 *   oder null, `file` die Kopf-Datei und `line` die Zeile (ab 1) im Dokument,
 *   wie der Editor es öffnet; `values` eine Map vom klein geschriebenen
 *   Feld-Namen auf den Wert des Werte-Modells (`query-format.js`), ein
 *   Datensatz-Verweis als `{ kind: 'record', table, id, display, path }`;
 *   `refs` je Verweis-Feld die Auslegung der Zelle `{ text, art, wert, table,
 *   status }` mit `status` aus `ok`, `empty`, `notFound`, `ambiguous`,
 *   `noSingleKey`, `noTarget`, `unknownTable`.
 */
function readRecordTable(root, tableRef) {
  if (!datensatzErfassungAktiv()) {
    // Nichts lesen und nichts halten: Wer die Datenbank ausschaltet, gibt auch
    // den Speicher frei, und beim Wiedereinschalten wird ohnehin neu gelesen.
    baseCache.clear();
    resultCache.clear();
    return null;
  }
  const entry = typeof root === 'string' ? indexes.get(root) : null;
  if (!entry || entry.status !== 'ready') return null;
  const ref = typeof tableRef === 'string' ? tableRef.trim() : '';
  if (ref === '') return null;

  const stand = { index: indexStand(root), overlay: overlayStand() };
  const head = headFor(root, entry, ref, stand);
  if (head === null) return null;
  const base = baseFor(root, head, stand.index);
  if (base === null) return null;

  const key = cacheKey(root, head);
  const known = resultCache.get(key);
  if (
    known &&
    known.base === base &&
    known.indexStand === stand.index &&
    known.overlayStand === stand.overlay &&
    depsUnchanged(root, known.deps, stand.index)
  ) {
    return known.table;
  }
  const { table, deps } = buildResult(root, entry, base, stand);
  remember(
    resultCache,
    key,
    { base, deps, indexStand: stand.index, overlayStand: stand.overlay, table },
    MAX_TABLES,
  );
  return table;
}

module.exports = { readRecordTable, readCount, clearCaches };
