// 4T-002351 (Epic 3E-000184): Die Lage der Hervorhebung in einer Befehls-Zeile.
//
// **Ein Erkenner, zwei Träger.** Die Färbung im Editor
// (`src/renderer/modules/workflows/workflow-hervorhebung.js`) und in der
// Darstellung (`src/shared/markdown/workflow-block.js`) lesen beide diese
// Funktion; sie selbst liest die Bausteine aus dem Zeilen-Leser und die
// Platzhalter aus der Vorlagen-Engine. Es gibt damit keinen zweiten Erkenner
// (Entwicklungsrichtlinien, Kapitel 1, «Erkennungen haben eine Heimat»), und
// eine Änderung der Grammatik zieht die Färbung von selbst mit.
//
// **Drei Arten** nach Story 4S-001107: das Schlüsselwort, Text in
// Anführungszeichen (bei einem Paar `feld="Wert"` allein der Wert ab dem
// Anführungszeichen) und Platzhalter `{{…}}` innerhalb eines Texts. Eine Zeile
// mit Lese-Fehler, ein Kommentar und eine Leerzeile ergeben keine Spanne; den
// Fehler zeigt die Prüf-Anzeige.
//
// **Lage im Wert und in der Zeile:** Der Prüfer analysiert die Platzhalter im
// Wert eines Texts (`checkPlaceholders` nimmt `token.value`). Im Wert ist `\"`
// ein Zeichen, in der Zeile zwei; die Lage wird deshalb Zeichen für Zeichen
// zurückgerechnet.
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const { analyzeTemplate } = require('../template-engine.js');
const { readLine } = require('./workflow-line-reader.js');

// Lagen des Werts in der Zeile: Eintrag i ist die Zeilen-Lage des i-ten
// Wert-Zeichens, der letzte Eintrag die Lage des schließenden Zeichens.
function wertLagen(zeile, start) {
  const lagen = [];
  let i = start;
  while (i < zeile.length && zeile[i] !== '"') {
    lagen.push(i);
    i += zeile[i] === '\\' && zeile[i + 1] === '"' ? 2 : 1;
  }
  lagen.push(i);
  return lagen;
}

function platzhalterSpannen(zeile, token, oeffnung) {
  const analyse = analyzeTemplate(token.value);
  if (!analyse.ok) return [];
  const lagen = wertLagen(zeile, oeffnung + 1);
  return analyse.segments
    .filter((s) => s.type !== 'lit' && typeof s.from === 'number')
    .map((s) => ({ from: lagen[s.from], to: lagen[s.to - 1] + 1, kind: 'placeholder' }));
}

/**
 * Die Spannen der Hervorhebung einer Befehls-Zeile.
 *
 * @param {string} text die Zeile ohne Zeilenende (ein `\r` am Ende fällt weg).
 * @returns {{from: number, to: number, kind: 'keyword'|'string'|'placeholder'}[]}
 *   Offsets in der Zeile (Anfang inklusive, Ende exklusiv), aufsteigend nach
 *   Anfang; ein Platzhalter folgt dem Text, in dem er steht.
 */
function workflowHighlightRanges(text) {
  const zeile = String(text == null ? '' : text).replace(/\r$/, '');
  const gelesen = readLine(zeile);
  if (!gelesen.ok || !gelesen.statement) return [];
  const { statement } = gelesen;
  const spannen = [{ from: statement.from, to: statement.to, kind: 'keyword' }];
  for (const token of statement.tokens) {
    if (token.type !== 'string' && token.type !== 'pair') continue;
    const oeffnung = token.type === 'pair' ? token.from + token.key.length + 1 : token.from;
    spannen.push({ from: oeffnung, to: token.to, kind: 'string' });
    spannen.push(...platzhalterSpannen(zeile, token, oeffnung));
  }
  return spannen;
}

module.exports = { workflowHighlightRanges };
