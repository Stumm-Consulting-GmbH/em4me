// 4T-001803 (Epic 3E-000291): Die eine Entscheidung «dieser Zaun ist der Öffner
// eines Code-Blocks der OBERSTEN Ebene».
//
// **Warum sie nötig ist.** Jede Fence-Ersetzung des portablen Exports sucht
// zeilenweise nach einem öffnenden Zaun mit ihrem Ziel-Namen und weiß nichts
// von einem umschließenden Zaun. Ein Dokument, das seinen eigenen Quelltext
// zeigt, schachtelt aber genau so: ein äußerer Zaun aus vier Backticks mit dem
// Infostring `markdown`, darin die Fence als Anschauung. Nach Markdown-Semantik
// ist alles innerhalb des äußeren Zauns wörtlicher Text; ohne dieses Urteil
// wandelte der Export auch das zitierte Beispiel um und machte den Satz davor
// falsch.
//
// **Warum sie in einem eigenen Modul steht.** Sieben Ersetzungen an drei Orten
// brauchen dasselbe Urteil: die vier Konstrukte in `portable-fences.js`, die
// Fläche im Pipeline-Kern und die beiden Journal-Blöcke unter `src/shared/`.
// Läge der Scanner bei den Konstrukten, zöge der Journal-Kern deren Konverter
// samt Datenbank- und Ereignis-Modulen mit. Dieses Modul ist deshalb
// **abhängigkeitsfrei**: kein Import, kein Electron, kein DOM. Eine Wahrheit
// statt sieben Kopien, denn genau die Vervielfältigung des Erkennungs-Musters
// war die systemische Ursache des Fehlers.
'use strict';

// **Die Regeln nach CommonMark.** Ein Zaun öffnet mit 0 bis 3 Leerzeichen
// Einrückung und mindestens drei Backticks oder drei Tilden; er schließt mit
// einer Zeile desselben Zeichens in mindestens derselben Länge und ohne
// Infostring; ein nicht geschlossener Zaun reicht bis zum Textende. Ein
// Backtick-Zaun, dessen Infostring selbst einen Backtick trägt, ist keiner
// (Muster `findCanvasFences`, `findPerspectiveEventsFences`).
const ZAUN_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

// 4T-001833 (Epic 3E-000254): **Die Regel als zwei Bausteine für jeden Leser.**
// Bis dahin stand sie allein in der Zeilen-Logik von `fenceOeffnerOffsets`,
// und der Datensatz-Block der Datenbank führte eine zweite Fassung. Seither
// liegen Öffnung und Schluss hier als eigene Funktionen; `fenceOeffnerOffsets`
// und alle Leser des Datensatz-Blocks (über `database/record-block.js`) nehmen
// sie von hier, damit die Regel nur einmal steht.
//
// Die Öffnung einer Zaun-Zeile: das Zeichen, die Länge der Sequenz und das
// erste Wort des Infostrings (dieselbe Lesart, mit der markdown-it die Sprache
// einer Fence bestimmt; leer, wenn hinter der Sequenz nur Leerraum steht).
// `null`, wenn die Zeile keine Zaun-Zeile ist, auch beim Backtick-Zaun mit
// Backtick im Infostring. Ein `\r` am Zeilenende fällt vor der Prüfung weg,
// damit eine Datei mit Windows-Zeilenenden dieselben Zäune zeigt.
function zaunOeffnung(zeile) {
  const m = ZAUN_RE.exec(String(zeile == null ? '' : zeile).replace(/\r$/, ''));
  if (!m) return null;
  const zeichen = m[2][0];
  const info = m[3].trim();
  if (zeichen === '`' && info.includes('`')) return null;
  return { zeichen, laenge: m[2].length, sprache: info.split(/\s+/)[0] };
}

// Schließt diese Zeile den Block, den `oeffnung` geöffnet hat? Dasselbe
// Zeichen, MINDESTENS so lang wie die öffnende Sequenz, und hinter der Sequenz
// nichts als Leerraum. Eine kürzere Zeile oder eine mit Infostring ist Inhalt
// des Blocks; ohne `oeffnung` schließt nichts.
function schliesstZaun(zeile, oeffnung) {
  if (!oeffnung) return false;
  const eigene = zaunOeffnung(zeile);
  return (
    eigene !== null &&
    eigene.zeichen === oeffnung.zeichen &&
    eigene.laenge >= oeffnung.laenge &&
    eigene.sprache === ''
  );
}

// Die Start-Offsets der Öffner-Zeilen aller Code-Blöcke der obersten Ebene, als
// Menge. Gemessen wird am Zeilen-Anfang einschließlich der Einrückung, weil
// genau dort der Treffer-Offset einer Fence-Regex liegt.
//
// Ein `\r` am Zeilenende fällt vor der Prüfung weg (in `zaunOeffnung`), damit
// ein Dokument mit Windows-Zeilenenden dieselben Öffner findet.
//
// 4T-001833 (Epic 3E-000254): über die beiden Bausteine oben statt über eine
// eigene Zeilen-Logik; das Verhalten ist unverändert.
function fenceOeffnerOffsets(text) {
  const src = String(text == null ? '' : text);
  const offsets = new Set();
  let offen = null;
  let pos = 0;
  for (;;) {
    const nl = src.indexOf('\n', pos);
    const ende = nl === -1 ? src.length : nl;
    const zeile = src.slice(pos, ende);
    if (offen) {
      if (schliesstZaun(zeile, offen)) offen = null;
    } else {
      offen = zaunOeffnung(zeile);
      if (offen) offsets.add(pos);
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  return offsets;
}

module.exports = {
  fenceOeffnerOffsets,
  // 4T-001833 (Epic 3E-000254): die Zaun-Regel für jeden zeilenweisen Leser.
  zaunOeffnung,
  schliesstZaun,
};
