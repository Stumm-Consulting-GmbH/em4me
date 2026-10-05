// 4T-002023 (Epic 3E-000192): Diagramm zu einer Datentabelle — Erkennung der
// Angabe `table:` im Zaun `perspective-chart`.
//
// Blatt der Familie: Es lädt kein Modul, weder aus der eigenen Familie noch
// sonst eines. Prozess-neutral: kein DOM, kein Electron, kein Datei-Zugriff.
//
// **Warum die Erkennung eine eigene Heimat hat.** Vier Stellen müssen dieselbe
// Angabe lesen: der Format-Kern (perspective-chart.js), der Verweis-Parser des
// Bereichs-Index (src/main/index/parse.js), die ausgehenden Verweise der offenen
// Datei (src/renderer/modules/panels/panel-outgoing.js) und die beiden
// Nachzüge beim Umbenennen, der Datei (src/shared/link-rewrite.js) und des
// Tabellen-Namens (src/shared/block-anchors.js). Der Kern selbst kommt dafür
// nicht in Frage: Er lädt block-anchors.js, und block-anchors.js braucht die
// Erkennung — der Kern als Quelle schlösse einen Zyklus. Vorbild der Aufteilung
// ist die Canvas (`istCanvasFenceInfo`, `scanneKartenVerweise` in link-scan.js).
//
// **Was hier nicht entschieden wird.** Das Blatt prüft die Anker-Kennung nicht;
// das tun die Aufrufer mit `isValidBlockAnchorId`, wie der Kern in
// `parseTableRef`. Ebenso wenig kennt es die Regel «es gilt das erste `table:`
// der Fence»: Es sieht eine Zeile, die Aufrufer sehen die Fence.
//
// 4T-002072 (Epic 3E-000192): **Die Zeichen-Ebene von `table:` gilt für beide
// Blöcke.** Die Datentabelle trägt ihren Namen seither in derselben Angabe
// `table: Umsatz` wie das Diagramm; `angabeWert` liefert für beide den Wert samt
// Spanne, die Heimat der Kennungen (block-anchors.js, `namensAngabe`) liest ihn
// für die Datentabelle von hier. Im Diagramm ist der Name ohne Dach-Zeichen die
// Form «selbes Dokument» (Entscheidung des Product Owners vom 2026-10-03); die
// Form mit Dach-Zeichen wird weiter gelesen.
'use strict';

// Info-Zeichenfolge des Diagramm-Blocks.
const CHART_FENCE_INFO = 'perspective-chart';

// Trägt die Info-Zeichenfolge einer Fence die Diagramm-Marke? Gelesen wird das
// erste Wort, wie `istCanvasFenceInfo` es für die Fläche tut; der Aufrufer
// schneidet den Fence-Marker selbst ab.
function istDiagrammFenceInfo(info) {
  return (
    String(info || '')
      .trim()
      .split(/\s+/)[0] === CHART_FENCE_INFO
  );
}

// Eine Angabe je Zeile, Form `schlüssel: wert`; der Schlüssel in beliebiger
// Schreibweise, Leerraum um den Doppelpunkt erlaubt. Angewandt auf die
// getrimmte Zeile.
const ANGABE_ZEILE_RE = /^([A-Za-z][A-Za-z-]*)\s*:\s*(.*)$/;

// Wert der Angabe `table:` in der Schreibweise für ein anderes Dokument:
// `[[Datei#^name]]`, ohne Bezeichnung nach `|`. Angewandt auf den getrimmten
// Wert; Gruppe 1 ist die Datei, Gruppe 2 der Name.
const TABELLEN_VERWEIS_RE = /^\[\[([^\]#|]+)#\^([^\]|]+)\]\]$/;

// Zeilen-Inhalt ohne das CRLF-Artefakt.
function ohneCr(zeile) {
  const text = String(zeile == null ? '' : zeile);
  return text.endsWith('\r') ? text.slice(0, -1) : text;
}

/**
 * 4T-002072: Der Wert einer Angabe `schlüssel: wert` samt seinem Anfang in der
 * Zeile — die Zeichen-Ebene, auf der die Angabe `table:` des Diagramms und die
 * Kopf-Angabe `table:` der Datentabelle aufbauen. Der Schlüssel zählt in
 * beliebiger Schreibweise; der Wert trägt keinen Leerraum an seinen Rändern und
 * ist leer, wenn hinter dem Doppelpunkt nichts steht. `wertStart` zählt in der
 * Zeile ohne ein abschließendes CR; bei leerem Wert ist es das Zeilenende der
 * getrimmten Zeile.
 *
 * @param {string} zeile Die zu prüfende Zeile.
 * @param {string} schluessel Der gesuchte Schlüssel, klein geschrieben.
 * @returns {{ wert: string, wertStart: number }|null} null, wenn die Zeile keine
 *   Angabe mit diesem Schlüssel ist.
 */
function angabeWert(zeile, schluessel) {
  const text = ohneCr(zeile);
  const getrimmt = text.trim();
  const m = ANGABE_ZEILE_RE.exec(getrimmt);
  if (!m || m[1].toLowerCase() !== schluessel) return null;
  // Der Wert steht am Ende der getrimmten Zeile und trägt keinen Leerraum an
  // seinen Rändern: Das `\s*` vor ihm ist gierig, und die Zeile ist getrimmt.
  const wert = m[2];
  const wertStart = text.length - text.trimStart().length + getrimmt.length - wert.length;
  return { wert, wertStart };
}

/**
 * Die Angabe `table:` einer Zeile des Diagramm-Blocks, mit den Spannen, die ein
 * Nachzug ersetzt.
 *
 * `form` ist `'same'` (Tabelle im selben Dokument: `Umsatz` oder, alte
 * Schreibweise, `^Umsatz`), `'other'` (`[[Datei#^name]]`) oder `null`, wenn die
 * Zeile die Angabe trägt, ihr Wert aber keiner der Schreibweisen folgt (leer
 * oder ein Verweis ohne gültige Form) — auch eine solche Zeile ist für den
 * Kern die wirksame Angabe, und kein späteres `table:` tritt an ihre Stelle.
 * Die Spannen zählen in der Zeile ohne ein abschließendes CR; `datei` ist bei
 * `'same'` null.
 *
 * @param {string} zeile Die zu prüfende Zeile.
 * @returns {object|null} `{ form, datei, dateiStart, dateiLen, name, nameStart, nameLen }`
 *   oder null, wenn die Zeile keine Angabe `table:` ist.
 */
function scanneTabellenAngabe(zeile) {
  const angabe = angabeWert(zeile, 'table');
  if (!angabe) return null;
  const { wert, wertStart } = angabe;
  const ohneDatei = { datei: null, dateiStart: -1, dateiLen: 0 };
  if (wert.startsWith('^')) {
    const name = wert.slice(1);
    return { form: 'same', ...ohneDatei, name, nameStart: wertStart + 1, nameLen: name.length };
  }
  const v = TABELLEN_VERWEIS_RE.exec(wert);
  const datei = v ? v[1].trim() : '';
  // 4T-002072: Der Name ohne Dach-Zeichen ist die Form «selbes Dokument». Was
  // mit `[[` beginnt, ist als Verweis gemeint und bleibt ohne gültige Form;
  // ob der Name eine gültige Kennung ist, prüfen die Aufrufer.
  if (!v && wert !== '' && !wert.startsWith('[[')) {
    return { form: 'same', ...ohneDatei, name: wert, nameStart: wertStart, nameLen: wert.length };
  }
  if (!datei) return { form: null, ...ohneDatei, name: null, nameStart: -1, nameLen: 0 };
  const dateiStart = wertStart + 2 + (v[1].length - v[1].trimStart().length);
  return {
    form: 'other',
    datei,
    dateiStart,
    dateiLen: datei.length,
    name: v[2],
    nameStart: wertStart + 2 + v[1].length + 2,
    nameLen: v[2].length,
  };
}

module.exports = {
  CHART_FENCE_INFO,
  istDiagrammFenceInfo,
  ANGABE_ZEILE_RE,
  TABELLEN_VERWEIS_RE,
  angabeWert,
  scanneTabellenAngabe,
};
