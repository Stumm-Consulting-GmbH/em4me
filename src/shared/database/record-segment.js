// 4T-001610 (Epic 3E-000252): Wo stehen die Datensätze in einer Datei?
//
// Eine Tabelle liegt in **einer oder mehreren** Dateien. Die Kopf-Datei trägt
// die Definition im Frontmatter und den Datensatz-Block in einer
// `perspective-records`-Fence; ein Folge-Segment trägt die Marke `db-table`
// nach O6 nicht, sondern beginnt hinter seinem Frontmatter unmittelbar mit
// Datensätzen. Beide Formen unterscheiden sich damit im Aufbau, nicht im
// Inhalt — und wer die Datensätze einer Datei sucht, braucht für beide
// dieselbe Antwort.
//
// **Warum das ein eigenes Modul ist und nicht zweimal geschrieben wird.** Die
// Erkennung des Folge-Segments entstand mit `4T-001609` im Suchraum-Schnitt,
// und die Erfassung des Bestands braucht sie ein zweites Mal. Zwei
// Erkennungen könnten voneinander abweichen, und dann verhielte sich dieselbe
// Datei beim Suchen anders als beim Erfassen — genau der Fall, für den
// `4T-001550` die Auskunft «ist das eine Tabellen-Datei» bereits zur einen
// Quelle gemacht hat. Dieses Modul führt beide Auskünfte zusammen.
//
// Prozess-neutral (kein Electron, kein DOM), wie die Nachbarn in diesem Ordner.
'use strict';

const { extractFrontmatter } = require('../markdown/frontmatter.js');
const { FENCE_RE } = require('../markdown/link-scan.js');
const { RECORD_FENCE, RECORD_MARKER } = require('./record-block.js');
const { PART_FRONTMATTER_KEY } = require('../document-parts.js');
// Die EINE Quelle der Auskunft «ist das eine Tabellen-Datei» (4T-001550).
const { istTabellenDatei } = require('../document-split-punkte.js');

// Die beiden Rollen, die eine Datei im Ablage-Format einnehmen kann.
const ROLLE_KOPF = 'kopf';
const ROLLE_FOLGE = 'folge';

// Das erste Wort des Infostrings hinter einem Zaun; dieselbe Lesart, mit der
// markdown-it die Fence-Sprache bestimmt und mit der `document-split-punkte.js`
// den Datenblock findet.
function zaunSprache(zeile, zaun) {
  return zeile.slice(zaun[0].length).trim().split(/\s+/)[0];
}

/**
 * Billige Vorprüfung, bevor Frontmatter ausgelegt wird.
 *
 * Der Regelfall eines Bereichs ist die Datei ohne jeden Datensatz, und sie darf
 * nichts kosten; dasselbe Sparmuster nutzt `block-data.js` für die Begleitdatei.
 */
function kommtUeberhauptInFrage(text) {
  return (
    typeof text === 'string' && (text.includes(RECORD_FENCE) || text.includes('\n' + RECORD_MARKER))
  );
}

/**
 * Ist dieser Text ein Folge-Segment einer Tabelle?
 *
 * Ein Folge-Segment trägt die Marke `db-table` nicht (nach O6 nur Zugehörigkeit,
 * Position und Schema-Version, dazu die Lese-Hilfe `db-fields`). Erkannt wird es
 * deshalb an zwei Merkmalen, die zusammen eindeutig sind: Es trägt die
 * Zuordnungs-Zeile `doc-part`, UND sein Rumpf beginnt mit einem Datensatz-Marker
 * in Spalte 0.
 *
 * Das zweite Merkmal folgt zwingend aus der Teilung: Eine Tabellen-Datei wird
 * ausschließlich VOR einem Datensatz-Marker geschnitten (`datensatzPunkte`),
 * jedes andere Dokument dagegen an einer Überschrift. Ein Teil eines gewöhnlichen
 * Dokuments beginnt damit nie so.
 *
 * @param {string} text Datei-Inhalt.
 * @param {object} [fm] Bereits ausgelegtes Frontmatter, wenn der Aufrufer es hat.
 */
function istFolgeSegment(text, fm) {
  const s = typeof text === 'string' ? text : '';
  const kopf = fm || extractFrontmatter(s);
  const daten = kopf && kopf.data;
  if (!daten || typeof daten !== 'object' || daten[PART_FRONTMATTER_KEY] === undefined)
    return false;
  const rumpf = s.slice((kopf && kopf.endOffset) || 0);
  for (const zeile of rumpf.split('\n')) {
    if (zeile.trim() === '') continue;
    return zeile.startsWith(RECORD_MARKER);
  }
  return false;
}

/**
 * Welche Rolle spielt diese Datei im Ablage-Format?
 *
 * @returns {'kopf'|'folge'|null} null für jede Datei, die keine ist.
 */
function rolleVon(text, fm) {
  const s = typeof text === 'string' ? text : '';
  if (!s) return null;
  if (istTabellenDatei(s)) return ROLLE_KOPF;
  if (istFolgeSegment(s, fm)) return ROLLE_FOLGE;
  return null;
}

// Zeilen-Index, in dem der Rumpf hinter dem Frontmatter beginnt.
function rumpfZeile(text, endOffset) {
  let zeile = 0;
  for (let i = 0; i < endOffset && i < text.length; i++) if (text[i] === '\n') zeile++;
  return zeile;
}

// Der Rumpf der ersten `perspective-records`-Fence einer Kopf-Datei.
//
// **Eine öffnende Fence ohne schließende ist kein Fehler**, sondern der
// Normalfall der Kopf-Datei einer geteilten Tabelle: Der Block läuft dort in das
// nächste Segment hinein. Gelesen wird dann bis zum Datei-Ende.
//
// Es zählt die ERSTE solche Fence. Das Ablage-Format sieht je Datei genau einen
// Datensatz-Block vor; eine zweite Fence wäre eine von Hand erzeugte
// Doppelung, und sie stillschweigend mitzulesen hieße, zwei Blöcke zu einem zu
// verschmelzen und dabei jede Kennung doppelt zu führen.
function kopfRumpf(zeilen) {
  let imZaun = false;
  let zaunZeichen = null;
  let von = -1;
  for (let i = 0; i < zeilen.length; i++) {
    const zaun = zeilen[i].match(FENCE_RE);
    if (!zaun) continue;
    const zeichen = zaun[1].charAt(0);
    if (!imZaun) {
      imZaun = true;
      zaunZeichen = zeichen;
      if (zaunSprache(zeilen[i], zaun) === RECORD_FENCE) von = i + 1;
      continue;
    }
    if (zeichen !== zaunZeichen) continue;
    imZaun = false;
    zaunZeichen = null;
    if (von >= 0) return { von, bis: i };
  }
  return von >= 0 ? { von, bis: zeilen.length } : null;
}

// Der Rumpf eines Folge-Segments: alles hinter dem Frontmatter bis zu einer
// schließenden Zaun-Zeile. Das mittlere Segment trägt gar keinen Zaun, das
// letzte den schließenden der Kopf-Datei.
function folgeRumpf(zeilen, abZeile) {
  for (let i = abZeile; i < zeilen.length; i++) {
    if (FENCE_RE.test(zeilen[i])) return { von: abZeile, bis: i };
  }
  return { von: abZeile, bis: zeilen.length };
}

/**
 * Der Datensatz-Rumpf einer Datei samt seiner Anfangs-Zeile.
 *
 * Liefert `null`, wenn die Datei keine Datensätze trägt — der Regelfall, und er
 * kostet dank der Vorprüfung nur eine Teilstring-Suche.
 *
 * @param {string} text Datei-Inhalt.
 * @returns {{rolle: string, vonZeile: number, rumpf: string}|null} `vonZeile`
 *   ist der 0-basierte Zeilen-Index der ersten Rumpf-Zeile IN DER DATEI; wer
 *   die Zeile eines Datensatzes in der Datei braucht, addiert sie zu der
 *   Zeilen-Angabe aus `parseRecordBlock`.
 */
function datensatzRumpf(text) {
  const s = typeof text === 'string' ? text : '';
  if (!kommtUeberhauptInFrage(s)) return null;

  const fm = extractFrontmatter(s);
  const rolle = rolleVon(s, fm);
  if (!rolle) return null;

  const zeilen = s.split('\n');
  const grenzen =
    rolle === ROLLE_KOPF
      ? kopfRumpf(zeilen)
      : folgeRumpf(zeilen, rumpfZeile(s, (fm && fm.endOffset) || 0));
  if (!grenzen || grenzen.bis <= grenzen.von) return null;
  return { rolle, vonZeile: grenzen.von, rumpf: zeilen.slice(grenzen.von, grenzen.bis).join('\n') };
}

module.exports = {
  ROLLE_KOPF,
  ROLLE_FOLGE,
  kommtUeberhauptInFrage,
  istFolgeSegment,
  rolleVon,
  datensatzRumpf,
};
