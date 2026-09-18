// 4T-001610 (Epic 3E-000252): Die Datensätze einer Tabellen-Datei, wie sie in
// den Bereichs-Index eingehen.
//
// **Kein zweiter Index** (E4): Der Bestand ist eine weitere Extraktions-Art im
// vorhandenen Index-Subsystem, nach demselben Muster, in dem die
// Datenbank-Marken mit `4T-001510` hinzugekommen sind. Der Ort ist der
// Haupt-Prozess, weil die Auskunft den Bestand braucht und nicht nur das eigene
// Dokument.
//
// **Was je Datensatz mitgeführt wird, ist entschieden** (Product Owner am
// 2026-09-08, Variante A1): interne Kennung, Wert des fachlichen Schlüssels,
// Anzeige-Form und Fundort. **Die Zellwerte gehören nicht dazu.** Verworfen ist
// die Variante, sämtliche Zellinhalte mitzuführen: Sie hielte die gesamte
// Datenbank dauerhaft im Arbeitsspeicher und nähme damit zurück, was
// `4T-001609` beim Suchraum gerade gewonnen hat.
//
// --- Das Reihenfolge-Problem und seine Lösung ----------------------------------------
//
// Der fachliche Schlüssel ist eine Angabe der **Definition**, und die steht
// allein in der Kopf-Datei. Ein Folge-Segment trägt zwar die Feld-Namen als
// Lese-Hilfe (`db-fields`), aber sie ist nach E26.3 ausdrücklich **ohne
// Vertragswirkung** und darf die Definition nicht ersetzen. Der Index-Aufbau
// liest die Dateien jedoch in einer Reihenfolge, die er nicht bestimmt: Trifft
// er ein Folge-Segment vor dessen Kopf-Datei, kann er die Zellen nicht zuordnen.
//
// **Gewählt ist der Vorlauf** (Product Owner am 2026-09-08, Weg B): Ein
// Folge-Segment ist an seinem **Dateinamen** erkennbar (`Name•part-00002`), und
// daraus folgt der Name seiner Kopf-Datei. Vor dem Durchlauf wird deshalb je
// betroffener Tabelle **einmal** deren Frontmatter gelesen; danach ist jedes
// Folge-Segment sofort zuordenbar. In einem Bereich ohne geteilte Tabelle —
// dem Regelfall, denn geteilt wird erst ab 0,7 MB — kostet der Vorlauf nichts,
// weil kein Segment-Name auftaucht.
//
// Verworfen sind beide Nachbarn. Das **Zwischenlagern** der Rohdaten bis zum
// Ende des Aufbaus hielte kurzzeitig die ganze Datenbank im Speicher und nähme
// den Gewinn aus `4T-001609` zurück. Die **Zuordnung erst beim Zugriff**
// verschöbe den Aufwand in jede Abfrage und arbeitete damit gegen den Zweck des
// Epics.
//
// --- Die Definitions-Ablage ----------------------------------------------------------
//
// Die gelesenen Definitionen liegen in einer prozessweiten Map, Schlüssel ist
// der absolute Pfad der Kopf-Datei. Sie wird vom Vorlauf gefüllt, vom
// Watcher-Pfad bei jeder Änderung einer Kopf-Datei fortgeschrieben und vom
// Puffer-Overlay mitbenutzt. Ihre Größe hängt an der Zahl der **geteilten**
// Tabellen und nicht an der Zahl der Dateien; ein Eintrag ist eine Feld-Liste.
//
// **Fehler-Isolation nach dem Vorbild von `block-data.js`:** Eine unlesbare
// oder widersprüchliche Datei setzt die Erfassung **dieser Datei** aus und nie
// den übrigen Index.

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { parseTableDefinition } = require('../../shared/database/table-definition.js');
const { anzeigeSpalte } = require('../../shared/database/record-identity.js');
const { parseRecordBlock } = require('../../shared/database/record-block.js');
const {
  ROLLE_FOLGE,
  kommtUeberhauptInFrage,
  datensatzRumpf,
} = require('../../shared/database/record-segment.js');
const { isPartBasename, baseBasenameOf } = require('../../shared/document-parts.js');

// Nur der Kopf einer Datei wird gelesen, wenn allein die Definition gebraucht
// wird. Das Frontmatter einer Tabellen-Datei ist klein; der Datensatz-Block
// dahinter kann Hunderttausende Zeilen tragen, und ihn dafür einzulesen wäre
// genau die Speicher-Spitze, die dieser Vorgang vermeidet.
const DEFINITIONS_KOPF_BYTES = 64 * 1024;

// Trenner der Signatur-Teile. Ein Zeichen, das in keinem Feld-Namen vorkommen
// kann — ohne Trenner ergaeben `['ab', 'c']` und `['a', 'bc']` dieselbe
// Signatur, und eine Umbenennung bliebe unbemerkt. Als Escape-Sequenz
// geschrieben und nicht literal, damit im Quelltext nichts Unsichtbares steht.
const TRENNER = '\u0000';

// Pfad der Kopf-Datei -> { definition, signatur }. Siehe Kopf-Kommentar.
const definitionen = new Map();

/**
 * Pfad der Kopf-Datei zu einem Folge-Segment, allein aus dem Dateinamen.
 *
 * Ohne Datei-Zugriff und ohne Frontmatter — das ist der Zweck des eigenen
 * Trennzeichens der Namensform. Liefert `null` für jede Datei, die kein
 * Folgeteil ist.
 */
function kopfDateiFuer(filePath) {
  if (typeof filePath !== 'string' || !filePath) return null;
  // Die Namensform kennt keine Endung (`parsePartBasename` prüft die fünf
  // Ziffern bis zum Namens-Ende); zerlegt wird deshalb wie in `rename.js`.
  const teile = path.parse(filePath);
  if (!isPartBasename(teile.name)) return null;
  return path.join(teile.dir, baseBasenameOf(teile.name) + teile.ext);
}

/**
 * Die Signatur einer Definition: woran sich eine Zuordnung ändert.
 *
 * **Sie trägt den Zwischenspeicher.** Ein Folge-Segment liegt im
 * Platten-Zwischenspeicher mit seinem bereits zugeordneten Bestand; ändert der
 * Anwender die Schlüssel-Spalte, ändert sich die Datei des Segments nicht, und
 * ohne Signatur zeigte der Bestand dauerhaft veraltete Schlüsselwerte, ohne
 * dass etwas darauf hinwiese. Verglichen wird deshalb beim Warmstart die
 * Signatur, und bei Abweichung wird das Segment neu gelesen.
 *
 * Eingang finden allein die Angaben, die das Ergebnis der Zuordnung bestimmen:
 * die Reihenfolge der Feld-Namen, der fachliche Schlüssel und die Anzeige-Form.
 * Ein geänderter Feld-TYP verschiebt keine Spalte und bleibt deshalb draußen.
 */
function definitionsSignatur(definition) {
  if (!definition || !Array.isArray(definition.fields)) return '';
  const felder = definition.fields.map((f) => String((f && f.name) || '')).join(TRENNER);
  const schluessel = Array.isArray(definition.key) ? definition.key.join(TRENNER) : '';
  return [felder, schluessel, definition.display || ''].join(TRENNER);
}

// Position eines Feld-Namens in der Feld-Liste; -1, wenn er keine hat. Der
// Vergleich ist unabhängig von Gross- und Kleinschreibung, wie in
// `record-identity.js`, das den Schlüssel gegen dieselben Felder prüft.
function spalteVon(name, fields) {
  const gesucht = String(name).toLowerCase();
  return fields.findIndex((f) => String((f && f.name) || '').toLowerCase() === gesucht);
}

// Text einer Zelle nach Position. Eine fehlende Zelle ist der leere Wert ihres
// Feldes und kein Fehler (E3.7) — dieselbe weiche Linie, die
// `zellenNachFeldern` fährt.
function zellText(cells, index) {
  if (index < 0 || index >= cells.length) return '';
  const cell = cells[index];
  return String((cell && cell.text) || '');
}

/**
 * Liest die Definition aus dem Frontmatter eines Datei-Kopfes.
 *
 * @returns {{definition: object, signatur: string}|null} null, wenn der Text
 *   keine Tabellen-Definition trägt.
 */
function definitionAusText(text) {
  const fm = extractFrontmatter(String(text == null ? '' : text));
  const definition = parseTableDefinition(fm.data);
  if (!definition.istTabelle) return null;
  return { definition, signatur: definitionsSignatur(definition) };
}

// Nur der Kopf einer Datei, für die Definitions-Beschaffung. Ein Lesefehler
// liefert null und setzt allein diese eine Erfassung aus.
async function leseKopfAsync(filePath) {
  let handle;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const puffer = Buffer.alloc(DEFINITIONS_KOPF_BYTES);
    const { bytesRead } = await handle.read(puffer, 0, DEFINITIONS_KOPF_BYTES, 0);
    return puffer.subarray(0, bytesRead).toString('utf8');
  } catch {
    return null;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

function leseKopfSync(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const puffer = Buffer.alloc(DEFINITIONS_KOPF_BYTES);
    const gelesen = fs.readSync(fd, puffer, 0, DEFINITIONS_KOPF_BYTES, 0);
    return puffer.subarray(0, gelesen).toString('utf8');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* Handle war bereits zu */
      }
    }
  }
}

/**
 * Trägt die Definition einer Kopf-Datei in die Ablage ein.
 *
 * Aufgerufen, wo eine Kopf-Datei ohnehin gelesen wurde: im Aufbau- und im
 * Watcher-Pfad. Eine Datei ohne Tabellen-Marke räumt ihren Eintrag ab — sie war
 * einmal eine Tabelle und ist es nicht mehr.
 *
 * @returns {string|null} Die neue Signatur, oder null bei einer Nicht-Tabelle.
 */
function merkeDefinition(kopfPfad, text) {
  const gelesen = definitionAusText(text);
  if (!gelesen) {
    definitionen.delete(kopfPfad);
    return null;
  }
  definitionen.set(kopfPfad, gelesen);
  return gelesen.signatur;
}

/** Nimmt eine Kopf-Datei aus der Ablage (gelöschte Datei, Index-Abbau). */
function vergissDefinition(kopfPfad) {
  definitionen.delete(kopfPfad);
}

/** Leert die Ablage vollständig (Test-Isolation, Index-Abbau). */
function vergissAlleDefinitionen() {
  definitionen.clear();
}

/**
 * Die Definition zu einem Folge-Segment, aus der Ablage oder frisch gelesen.
 *
 * Der synchrone Rückfall greift nur, wo die Kopf-Datei noch nicht durch den
 * Aufbau gelaufen ist — beim Puffer-Overlay eines Segments, das vor seiner
 * Kopf-Datei geöffnet wird. Er liest **einen Datei-Kopf**, nicht die Datei.
 */
function definitionFuerSegment(filePath) {
  const kopfPfad = kopfDateiFuer(filePath);
  if (!kopfPfad) return null;
  const bekannt = definitionen.get(kopfPfad);
  if (bekannt) return bekannt;
  const text = leseKopfSync(kopfPfad);
  if (text === null) return null;
  const gelesen = definitionAusText(text);
  if (!gelesen) return null;
  definitionen.set(kopfPfad, gelesen);
  return gelesen;
}

/**
 * Der Vorlauf des Index-Aufbaus: Definitionen aller geteilten Tabellen holen.
 *
 * Aus der Datei-Liste des Scans werden die Folge-Segmente an ihrem **Namen**
 * erkannt und daraus die Kopf-Dateien bestimmt; gelesen wird je Kopf-Datei
 * genau einmal und nur ihr Kopf. Eine Kopf-Datei, die es nicht (mehr) gibt,
 * fällt still weg — ihr Segment bleibt dann ohne Zuordnung, was der Bestand
 * verträgt.
 *
 * @param {Iterable<string>} dateien Absolute Pfade aus dem Scan.
 * @returns {Promise<number>} Zahl der gelesenen Kopf-Dateien (für die Prüfung,
 *   dass der Regelfall nichts kostet).
 */
async function holeDefinitionenVorab(dateien) {
  const kopfDateien = new Set();
  for (const datei of dateien || []) {
    const kopfPfad = kopfDateiFuer(datei);
    if (kopfPfad) kopfDateien.add(kopfPfad);
  }
  for (const kopfPfad of kopfDateien) {
    const text = await leseKopfAsync(kopfPfad);
    if (text !== null) merkeDefinition(kopfPfad, text);
  }
  return kopfDateien.size;
}

/**
 * Erfasst die Datensätze einer Datei für den Index.
 *
 * @param {string} text Datei-Inhalt.
 * @param {object|null} segmentDefinition Definition der Kopf-Datei, wenn `text`
 *   ein Folge-Segment ist. Für eine Kopf-Datei ohne Bedeutung: sie trägt ihre
 *   Definition selbst.
 * @returns {{records: Array, defSignatur: string|null}|null} `null`, wenn die
 *   Datei keine Datensätze trägt. Je Datensatz `{ id, key, display, zeile }`:
 *   `id` die interne Kennung (oder null bei einem Datensatz ohne), `key` die
 *   Werte des fachlichen Schlüssels in der Reihenfolge seiner Teile (oder
 *   null), `display` die Anzeige-Form (oder null) und `zeile` der 0-basierte
 *   Zeilen-Index in der Datei. `defSignatur` sagt, gegen welche Definition
 *   zugeordnet wurde — bei einer Kopf-Datei gegen ihre eigene, bei einem
 *   Folge-Segment gegen die geerbte. Sie ist einheitlich, damit der
 *   Watcher-Pfad an einer Kopf-Datei ohne zweites Lesen erkennt, dass eine
 *   Definitions-Änderung die Zuordnung ihrer Segmente überholt hat.
 */
function erfasseDatensaetze(text, segmentDefinition) {
  const s = typeof text === 'string' ? text : '';
  if (!kommtUeberhauptInFrage(s)) return null;

  let block;
  try {
    block = datensatzRumpf(s);
  } catch {
    return null; // Fehler-Isolation: diese Datei, nicht der Index
  }
  if (!block) return null;

  const eigene = block.rolle === ROLLE_FOLGE ? segmentDefinition : definitionAusText(s);
  const definition = eigene && eigene.definition;
  const fields = (definition && Array.isArray(definition.fields) && definition.fields) || [];

  // Ohne Definition bleiben Kennung und Fundort; Schlüssel und Anzeige-Form
  // entfallen. Das ist die Lage eines Folge-Segments, dessen Kopf-Datei fehlt,
  // und eines Datensatzes in einer Tabelle ohne fachlichen Schlüssel — beides
  // zulässige Zustände (E5.3) und kein Fehler.
  const schluesselSpalten = Array.isArray(definition && definition.key)
    ? definition.key.map((name) => spalteVon(name, fields))
    : null;
  const anzeigeSpaltenIndex = definition ? spalteVon(anzeigeSpalte(definition) || '', fields) : -1;

  let gelesen;
  try {
    // Ohne `fields` — die Zuordnungs-Hinweise und die Typ-Auslegung der Werte
    // kosten hier nur Zeit: Der Bestand führt keine Zellwerte, und gemeldet
    // wird an der Stelle, die die Tabelle anzeigt, nicht beim Indexieren.
    gelesen = parseRecordBlock(block.rumpf, null);
  } catch {
    return null;
  }

  const records = [];
  for (const record of gelesen.records) {
    const cells = Array.isArray(record.cells) ? record.cells : [];
    records.push({
      id: record.id || null,
      key: schluesselSpalten ? schluesselSpalten.map((i) => zellText(cells, i)) : null,
      display: anzeigeSpaltenIndex >= 0 ? zellText(cells, anzeigeSpaltenIndex) : null,
      zeile: block.vonZeile + (record.zeile || 0),
    });
  }
  if (records.length === 0) return null;
  return { records, defSignatur: (eigene && eigene.signatur) || '' };
}

/**
 * Erfasst die Datensätze einer Datei von der Platte (synchron).
 *
 * Für den Watcher-Pfad, der die Folge-Segmente einer Tabelle nachzieht, deren
 * Definition sich geändert hat. Ein Lesefehler liefert `null` und setzt allein
 * diese eine Erfassung aus.
 */
function erfasseAusDatei(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  return erfasseDatensaetze(text, definitionFuerSegment(filePath));
}

/**
 * Zieht die Definition einer Kopf-Datei in der Ablage nach (synchron).
 *
 * Liest **einen Datei-Kopf**, nicht die Datei: Die Definition steht im
 * Frontmatter, der Datensatz-Block dahinter kann Hunderttausende Zeilen tragen.
 */
function merkeDefinitionAusDatei(kopfPfad) {
  const text = leseKopfSync(kopfPfad);
  if (text === null) return null;
  return merkeDefinition(kopfPfad, text);
}

module.exports = {
  kopfDateiFuer,
  definitionsSignatur,
  definitionAusText,
  merkeDefinition,
  vergissDefinition,
  vergissAlleDefinitionen,
  definitionFuerSegment,
  holeDefinitionenVorab,
  erfasseDatensaetze,
  erfasseAusDatei,
  merkeDefinitionAusDatei,
};
