// 4T-002013 (Epic 3E-000332): Zell-Grammatik der typisierten Datentabelle —
// wo in einer Roh-Zeile des Fence-Bodys die Text-Zellen stehen.
//
// **Wozu.** Verweis-Index (src/main/index/parse.js), Umbenennungs-Nachzug
// (src/shared/link-rewrite.js), Schlagwort-Umbenennung
// (src/shared/tag-erkennung.js) und die ausgehenden Verweise der offenen Datei
// (src/renderer/modules/panels/panel-outgoing.js) überspringen den Inhalt jedes
// Code-Blocks. Seit Weg B der Story 4S-001015 (Entscheidung des Product Owners
// vom 2026-09-28) wirken Verweise und Schlagworte in einer Text-Zelle der
// Datentabelle wie im Fließtext; alle vier Leser müssen dafür **dieselben**
// Stellen als Text-Zelle erkennen, sonst zöge das Umbenennen einen Verweis
// nach, den der Index nicht kennt, oder umgekehrt. Die Antwort steht deshalb
// hier, einmal, nach dem Vorbild `istCanvasFenceInfo` in link-scan.js.
//
// **Eine Zerlegung, nicht zwei.** Die Zerlegung einer Pipe-Zeile
// (`splitPipeRow`) und der Kopfzeile `columns:` (`splitTopLevel`) stand bis
// 4T-002013 im Kern der Familie (perspective-datatable.js). Der Kern lädt seine
// Schwester-Module, nie umgekehrt, und exportierte beide nicht; beide sind
// deshalb hierher umgezogen, und der Kern importiert sie von hier. So liest der
// Parser dieselben Zellen, deren Stellen die Scanner bekommen. Die
// Offset-Rechnung bewacht zusätzlich ein Gleichlauf-Wächter in
// test/unit/datentabelle-zell-scan.test.js (beide Leser gegeneinander).
//
// Prozess-neutral, ohne DOM und ohne Datei-Zugriff. Einzige Abhängigkeit ist
// die Zeichen-Ebene der Kopfzeilen (perspective-datatable-kopf.js); der Kern
// wird bewusst nicht geladen, weil der Bereichs-Index sonst Grid-HTML,
// Aggregat-Rechnung und berechnete Spalten mitlüde.
'use strict';

const { parseColumnDef } = require('./perspective-datatable-kopf.js');

// Info-Zeichenfolge der Datentabelle; gelesen wird das erste Wort, wie in
// `istCanvasFenceInfo` und in `findPerspectiveDatatableFences`.
const DATENTABELLE_FENCE_INFO = 'perspective-datatable';

// Kopf-Direktive `name: wert`, wörtlich wie im Parser des Kerns.
const DIREKTIVE_RE = /^([A-Za-z][A-Za-z-]*)\s*:\s*(.*)$/;

/**
 * Trägt die Info-Zeichenfolge einer Fence die Marke der Datentabelle?
 *
 * @param {string} info Info-Zeichenfolge ohne den Fence-Marker.
 * @returns {boolean}
 */
function istDatentabellenFenceInfo(info) {
  return (
    String(info || '')
      .trim()
      .split(/\s+/)[0] === DATENTABELLE_FENCE_INFO
  );
}

// --- Zeilen-Zerlegung (aus dem Kern, 4T-002013) ------------------------------

// Kommata auf oberster Ebene trennen Listen-Einträge; Klammern und Quotes
// schützen (berechnete Spalten-Ausdrücke wie `min(Betrag, 10)` bleiben ganz).
function splitTopLevel(text) {
  const parts = [];
  let cur = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

// Pipe-Zeile -> Zellen mit un-escaptem Rohtext und ihrer Spanne in der Zeile
// (`start` inklusiv, `end` exklusiv, ohne die trennenden Pipes). Führende und
// (falls vorhanden) schließende Pipe werden abgestreift; `\|` ist das
// Pipe-Escape im Zelltext und trennt nicht.
//
// 4T-002013: Das ist die Zeichen-Schleife von `splitPipeRow`, um die Spanne je
// Zelle erweitert (Muster `tokenisiereMitOffsets` in link-scan.js).
// `splitPipeRow` ist seither nur noch ihre Abbildung auf den getrimmten Text;
// es gibt damit genau eine Zerlegung.
function zerlegePipeZeile(zeile) {
  const text = String(zeile == null ? '' : zeile);
  const zellen = [];
  let cur = '';
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      zellen.push({ roh: cur, start, end: i });
      cur = '';
      start = i + 1;
      continue;
    }
    cur += ch;
  }
  zellen.push({ roh: cur, start, end: text.length });
  // Segment vor der führenden Pipe ist leer (Zeile beginnt mit '|');
  // schließende Pipe erzeugt ein leeres End-Segment — beide sind Rahmen,
  // keine Zellen. Fehlt die schließende Pipe, zählt das letzte Segment
  // als Zelle (tolerantes Lesen).
  zellen.shift();
  if (zellen.length > 0 && zellen[zellen.length - 1].roh.trim() === '') zellen.pop();
  return zellen;
}

// Pipe-Zeile -> un-escapte, getrimmte Zell-Rohtexte (Vertrag unverändert seit
// 4T-000417).
function splitPipeRow(line) {
  return zerlegePipeZeile(line).map((z) => z.roh.trim());
}

// --- Zeilen-Zustand je Block -------------------------------------------------

/**
 * Frischer Zustand für einen Datentabellen-Block. Der Aufrufer legt ihn beim
 * Öffnen der Fence an und verwirft ihn beim Schließen.
 *
 * @returns {{columns: Array|null, inRows: boolean, dataColumns: Array}}
 */
function neuerZellZustand() {
  return { columns: null, inRows: false, dataColumns: [] };
}

// Kopfzeile `columns:` wie der Parser des Kerns lesen: dieselbe Zerlegung,
// dieselbe Definition, dieselbe Regel für doppelte Namen. Fehler interessieren
// hier nicht; sie meldet die Anzeige.
function leseSpalten(wert) {
  const columns = [];
  const fehler = [];
  for (const defText of splitTopLevel(wert)) {
    const col = parseColumnDef(defText, 0, fehler);
    if (!col) continue;
    if (columns.some((c) => c.name.toLowerCase() === col.name.toLowerCase())) continue;
    columns.push(col);
  }
  return columns;
}

/**
 * Spannen der Text-Zellen einer Datenzeile, gezählt über die Datenspalten
 * (berechnete Spalten haben keine Datenzelle). Die Spanne umfasst den
 * getrimmten Zell-Inhalt in der **Roh-Zeile**, das Escape `\|` eingeschlossen.
 * Zellen jenseits der deklarierten Datenspalten zählen nicht; die Anzeige
 * zeigt sie nicht.
 *
 * @param {string} zeile Roh-Zeile des Fence-Bodys.
 * @param {object} zustand Zustand aus `neuerZellZustand`, nach `leseZeile`.
 * @returns {Array<{start: number, end: number}>}
 */
function textZellSpannen(zeile, zustand) {
  const text = String(zeile == null ? '' : zeile);
  if (!zustand || !text.trim().startsWith('|')) return [];
  const spalten = zustand.dataColumns;
  if (!spalten || spalten.length === 0) return [];
  const spannen = [];
  const zellen = zerlegePipeZeile(text);
  for (let j = 0; j < zellen.length && j < spalten.length; j++) {
    if (spalten[j].type !== 'text') continue;
    const { start, end } = zellen[j];
    const stueck = text.slice(start, end);
    const vorne = stueck.length - stueck.trimStart().length;
    const hinten = stueck.length - stueck.trimEnd().length;
    if (start + vorne >= end - hinten) continue;
    spannen.push({ start: start + vorne, end: end - hinten });
  }
  return spannen;
}

/**
 * Liest eine Zeile des Fence-Bodys in den Zustand ein und liefert die Spannen
 * ihrer Text-Zellen. Kopfzeilen (`columns:`, `aggregate:`, `types:` und jede
 * andere Direktive), Leerzeilen und fehlerhafte Zeilen liefern eine leere
 * Liste. Der Ablauf folgt dem Parser des Kerns (`parsePerspectiveDatatable`):
 * Kopf-Direktiven bis zur ersten Pipe-Zeile, danach Datenzeilen.
 *
 * @param {object} zustand Zustand aus `neuerZellZustand`; wird fortgeschrieben.
 * @param {string} zeile Roh-Zeile des Fence-Bodys.
 * @returns {Array<{start: number, end: number}>}
 */
function leseZeile(zustand, zeile) {
  const text = String(zeile == null ? '' : zeile);
  const trimmed = text.trim();
  if (!zustand || trimmed === '') return [];
  if (!zustand.inRows && !trimmed.startsWith('|')) {
    const m = DIREKTIVE_RE.exec(trimmed);
    // Eine zweite `columns:`-Zeile ist im Parser ein Befund und wird übergangen.
    if (m && m[1].toLowerCase() === 'columns' && zustand.columns === null) {
      zustand.columns = leseSpalten(m[2]);
    }
    return [];
  }
  if (!zustand.inRows) {
    zustand.inRows = true;
    zustand.dataColumns = (zustand.columns || []).filter((c) => c.expr === null);
  }
  return textZellSpannen(text, zustand);
}

/**
 * Die Zeile für einen Scan vorbereiten, der wie im Fließtext laufen soll, aber
 * nur in den Text-Zellen treffen darf: Jedes Zeichen außerhalb der Spannen wird
 * durch einen Zeilenumbruch ersetzt.
 *
 * **Warum ein Zeilenumbruch.** Die Maskierung ist längengleich, damit ein
 * Treffer-Offset weiter auf die Stelle im Original zeigt (Muster
 * `maskInlineCode`). Und jede Zeichenklasse der Erkennungen schließt den
 * Zeilenumbruch aus, weil sie zeilenweise arbeiten: Wiki- und Markdown-Link,
 * Inline-Code, Schlagwort sowie Wiki- und Attribut-Maskierung des
 * Schlagwort-Scans. Ein Treffer kann damit keine Zellgrenze überspannen: `[[A | B]]`
 * mit einer unmaskierten Pipe ist in der Anzeige zwei Zellen und hier kein
 * Verweis. Ein Leerzeichen leistete das nicht, weil Wiki-Ziele Leerzeichen
 * tragen dürfen. Für einen Schlagwort-Scan wirkt der Umbruch wie Weißraum,
 * sodass ein Schlagwort am Zell-Anfang erkannt wird wie am Zeilen-Anfang.
 *
 * @param {string} zeile Roh-Zeile.
 * @param {Array<{start: number, end: number}>} spannen aus `textZellSpannen`.
 * @returns {string} gleich lang wie `zeile`.
 */
function maskiereAusserhalbTextZellen(zeile, spannen) {
  const text = String(zeile == null ? '' : zeile);
  let aus = '';
  let pos = 0;
  for (const { start, end } of spannen || []) {
    aus += '\n'.repeat(Math.max(0, start - pos)) + text.slice(start, end);
    pos = end;
  }
  return aus + '\n'.repeat(Math.max(0, text.length - pos));
}

/**
 * Bequemer Weg der vier Leser: Zeile einlesen und, wenn sie Text-Zellen trägt,
 * die maskierte Scan-Zeile liefern.
 *
 * @param {object} zustand Zustand aus `neuerZellZustand`.
 * @param {string} zeile Roh-Zeile des Fence-Bodys.
 * @returns {string|null} maskierte Zeile oder null ohne Text-Zelle.
 */
function zellScanZeile(zustand, zeile) {
  const spannen = leseZeile(zustand, zeile);
  return spannen.length > 0 ? maskiereAusserhalbTextZellen(zeile, spannen) : null;
}

module.exports = {
  istDatentabellenFenceInfo,
  splitTopLevel,
  splitPipeRow,
  neuerZellZustand,
  leseZeile,
  textZellSpannen,
  maskiereAusserhalbTextZellen,
  zellScanZeile,
};
