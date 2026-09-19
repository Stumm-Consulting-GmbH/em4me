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

// Die Start-Offsets der Öffner-Zeilen aller Code-Blöcke der obersten Ebene, als
// Menge. Gemessen wird am Zeilen-Anfang einschließlich der Einrückung, weil
// genau dort der Treffer-Offset einer Fence-Regex liegt.
//
// Ein `\r` am Zeilenende fällt vor der Prüfung weg, damit ein Dokument mit
// Windows-Zeilenenden dieselben Öffner findet.
function fenceOeffnerOffsets(text) {
  const src = String(text == null ? '' : text);
  const offsets = new Set();
  let offen = null;
  let pos = 0;
  for (;;) {
    const nl = src.indexOf('\n', pos);
    const ende = nl === -1 ? src.length : nl;
    const m = ZAUN_RE.exec(src.slice(pos, ende).replace(/\r$/, ''));
    if (m) {
      const zeichen = m[2][0];
      const laenge = m[2].length;
      const info = m[3].trim();
      if (offen) {
        if (zeichen === offen.zeichen && laenge >= offen.laenge && info === '') offen = null;
      } else if (!(zeichen === '`' && info.includes('`'))) {
        offen = { zeichen, laenge };
        offsets.add(pos);
      }
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  return offsets;
}

module.exports = {
  fenceOeffnerOffsets,
};
