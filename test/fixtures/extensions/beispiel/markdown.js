'use strict';
// Referenz-Erweiterung (4T-0299, Epic 3E-0053): Render-Beitrag.
// Diese Datei wird vom Preload-Loader per node:vm in einem leeren
// Sandbox-Kontext evaluiert (kein require, kein process, kein DOM);
// module.exports muss ein markdown-it-Plugin (Funktion) liefern.
// Ersetzt ':-)' im Fliesstext durch ein Smiley-Span.
module.exports = function beispielSmileyPlugin(md) {
  md.inline.ruler.after('emphasis', 'beispiel-smiley', function (state, silent) {
    if (state.src.slice(state.pos, state.pos + 3) !== ':-)') return false;
    if (!silent) {
      const token = state.push('html_inline', '', 0);
      token.content = '<span class="ext-beispiel-smiley">☺</span>';
    }
    state.pos += 3;
    return true;
  });
};
