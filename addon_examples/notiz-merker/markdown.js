'use strict';
// Beispiel-Erweiterung „Notiz-Merker" (4T-000826, Epic 3E-000103): Render-Beitrag.
//
// Diese Datei wird vom Loader der Anwendung in einer eigenen, leeren
// Umgebung ausgewertet: es gibt module und exports, aber kein require,
// kein process und kein DOM. module.exports muss ein markdown-it-Plugin
// (eine Funktion) liefern.
//
// Die Syntax >>Text<< macht aus einer Textstelle einen Merker.
//
// Drei Dinge, die an einer eigenen Inline-Regel leicht schiefgehen und
// hier absichtlich vorgeführt werden:
//
//  1. DAS START-ZEICHEN MUSS EIN TERMINATOR-ZEICHEN SEIN. markdown-it
//     ruft Inline-Regeln nur an bestimmten Zeichen auf; alles dazwischen
//     schluckt die eingebaute text-Regel am Stueck. Eine Regel auf einem
//     anderen Zeichen greift dann nur am Absatz-Anfang und mitten im Satz
//     nie. '>' gehoert zur Liste, eine runde Klammer zum Beispiel nicht.
//     Wer eine eigene Syntax waehlt, prueft das zuerst.
//  2. EIGENE TOKEN STATT ROHEM HTML. Es waere kuerzer, ein html_inline-
//     Token mit fertigem Markup zu schieben. Dann muesste diese Datei den
//     Text aber selbst escapen, und ein vergessenes Escape waere eine
//     Sicherheitsluecke im Dokument des Anwenders. Mit eigenem Token und
//     einer Renderer-Regel uebernimmt markdown-it das Escapen.
//  3. NUR EINE ZEILE. Die Regel endet an einem Zeilenumbruch, sonst
//     verschluckt ein unpaariges Zeichen den halben Absatz.
module.exports = function notizMerkerPlugin(md) {
  const GROESSER = 0x3e; /* > */

  function tokenize(state, silent) {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== GROESSER) return false;
    if (state.src.charCodeAt(start + 1) !== GROESSER) return false;

    const rest = state.src.slice(start + 2);
    const zeilenende = rest.indexOf('\n');
    const zeile = zeilenende < 0 ? rest : rest.slice(0, zeilenende);
    const ende = zeile.indexOf('<<');
    // ende === 0 waere '>><<', ein leerer Merker; der zaehlt nicht.
    if (ende <= 0) return false;

    if (!silent) {
      const token = state.push('notiz_merker', '', 0);
      token.content = zeile.slice(0, ende);
    }
    state.pos = start + 2 + ende + 2;
    return true;
  }

  // Vor 'emphasis' registriert, damit ein Merker, der Sternchen enthaelt,
  // als Ganzes erkannt wird.
  md.inline.ruler.before('emphasis', 'notiz_merker', tokenize);

  md.renderer.rules.notiz_merker = (tokens, idx) => {
    const text = md.utils.escapeHtml(tokens[idx].content);
    // data-merker traegt denselben Text noch einmal: Das Panel liest ihn
    // von dort, ohne das Dokument erneut zu zerlegen.
    return `<span class="ext-notiz-merker-marke" data-merker="${text}">${text}</span>`;
  };
};
