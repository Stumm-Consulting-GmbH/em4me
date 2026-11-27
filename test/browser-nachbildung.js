// 4T-002945 (Epic 3E-000452): Was der Browser-Nachbildung der Einzel-Prüfungen
// fehlt und die Editor-Bibliothek braucht.
//
// **Wozu.** Die Browser-Nachbildung (jsdom) rechnet kein Layout und kennt an
// Text-Bereichen (`Range`) weder `getClientRects` noch `getBoundingClientRect`.
// Die Editor-Bibliothek (@codemirror/view) ruft beide in ihrem Mess-Schritt
// auf, der in einem Rückruf des nächsten Bilds läuft. Dieser Rückruf feuert im
// Takt von rund 16 Millisekunden; ohne Last ist ein Fall mit seiner Ansicht
// vorher fertig und abgebaut, unter Last nicht. Dann wirft der Aufruf
// außerhalb jedes Falls («getClientRects is not a function»), und der nicht
// abgefangene Fehler macht den ganzen Lauf rot, obwohl jeder Fall grün ist.
// So am 2026-11-21 in einem Lauf im Linux-Container.
//
// **Wie.** `ergaenzeTextBereiche` gibt den Text-Bereichen die zwei Funktionen,
// nur wo sie fehlen. Eingehängt wird es in der einen Vorbereitungs-Datei der
// Unit-Suite (test/zeitgrenze-je-fall.js); in einer Prüfdatei ohne
// Browser-Nachbildung gibt es keine Text-Bereiche, und der Aufruf tut nichts.
//
// **Die Antwort ist die der Nachbildung für Elemente:** eine leere Liste der
// Rechtecke und eine Gesamt-Fläche aus Nullen (jsdom, Element-impl.js). Die
// Editor-Bibliothek fragt die leere Liste eigens ab und nimmt dann ihren Weg
// «nichts messbar». Gemessen am 2026-11-26 mit nachgestellter Last (Rückrufe
// des nächsten Bilds sofort, test/bild-rueckrufe.js) über alle 272 Prüfdateien
// mit Browser-Nachbildung: ohne die Funktionen 161 Fehler in Bild-Rückrufen in
// fünf Prüfdateien, mit ihnen keiner.
//
// **Gegenprobe.** Die Umgebungs-Variable `EM4ME_TEXT_BEREICHE=ohne` lässt die
// Funktionen fehlen und stellt so den Stand vor dieser Ergänzung her. Sie ist
// allein für die Gegenprobe da (test/unit/bild-rueckrufe.test.js); eine andere
// Angabe bricht jede Prüfdatei ab.
//
// **Grenze.** Die Funktionen liefern kein Layout. Ein Prüffall, der eine Lage
// oder Größe prüfen will, gehört in die Ablauf-Prüfungen.

export const FORM_VARIABLE = 'EM4ME_TEXT_BEREICHE';
export const FORM_OHNE = 'ohne';

function nullRechteck() {
  return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
}

// Ergänzt die fehlenden Funktionen und liefert ihre Namen; leer, wenn nichts
// fehlte oder die Umgebung keine Text-Bereiche kennt.
export function ergaenzeTextBereiche(ziel = globalThis) {
  const Bereich = ziel.Range;
  if (typeof Bereich !== 'function') return [];
  const ergaenzt = [];
  if (typeof Bereich.prototype.getClientRects !== 'function') {
    Bereich.prototype.getClientRects = function getClientRects() {
      return [];
    };
    ergaenzt.push('getClientRects');
  }
  if (typeof Bereich.prototype.getBoundingClientRect !== 'function') {
    Bereich.prototype.getBoundingClientRect = function getBoundingClientRect() {
      return nullRechteck();
    };
    ergaenzt.push('getBoundingClientRect');
  }
  return ergaenzt;
}

// Aufgerufen aus der Vorbereitungs-Datei der Unit-Suite
// (test/zeitgrenze-je-fall.js): ergänzt, außer die Gegenprobe ist eingeschaltet.
export function ergaenzeAusUmgebung(umgebung = globalThis.process?.env ?? {}, ziel = globalThis) {
  const angabe = umgebung[FORM_VARIABLE];
  if (angabe === undefined || angabe === '') return ergaenzeTextBereiche(ziel);
  if (angabe !== FORM_OHNE)
    throw new Error(
      `${FORM_VARIABLE}=${angabe} ist keine bekannte Angabe; gültig ist allein «${FORM_OHNE}».`,
    );
  return [];
}
