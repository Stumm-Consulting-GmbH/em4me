// 4T-1357 (Epic 3E-0238): Auswahl-Regel der Schlagwort-Vorschlagsliste.
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein DOM), aus
// demselben Grund wie die Schwester-Regel der Verweis-Ziele in
// `wiki-vorschlaege.js`: Die Entscheidung ist ohne Editor und ohne IPC
// prüfbar, der Renderer hält nur die Verdrahtung.
//
// Sie stand bis 4T-1357 in der Vervollständigungs-Quelle des Renderers und ist
// dort ohne Wirkung geblieben — die Bibliothek sortierte die übergebene Liste
// neu. Der Umzug hierher ist Teil der Behebung: Die Regel wird prüfbar, und die
// Quelle bestellt die Eigensortierung ab.
'use strict';

// Wieviele Eintraege ein Dropdown hoechstens zeigt. Derselbe Wert wie bei den
// Verweis-Zielen; die Liste ist dieselbe Anzeige.
const SCHLAGWORT_RENDER_LIMIT = 30;

// Filtert und sortiert die Schlagworte des Bereichs-Index fuer den bereits
// getippten Rest hinter `#`.
//
// Zwei Lagen, wie bei den Verweis-Zielen — verschieden ist nur, was in der
// ersten fuehrt:
//
//   - **Nichts getippt.** Dann gibt es keine Treffer-Guete, an der sich eine
//     Reihenfolge festmachen liesse. Hier fuehrt die **Haeufigkeit**: Wer ein
//     Schlagwort setzt, meint weit ueberwiegend eines der etablierten, und ein
//     einmal vergebener Einzelfall steht sonst gleichberechtigt daneben.
//   - **Etwas getippt.** Dann fuehrt die Treffer-Guete (Prefix vor
//     Teiltreffer), und die Haeufigkeit entscheidet zwischen Gleichrangigen.
//
// Der Name bleibt in beiden Lagen der letzte Entscheid, damit die Reihenfolge
// bei gleicher Haeufigkeit stabil und damit vorhersagbar ist.
function waehleSchlagworte(vorschlaege, eingabe, limit = SCHLAGWORT_RENDER_LIMIT) {
  if (!Array.isArray(vorschlaege)) return [];
  const gesucht = String(eingabe == null ? '' : eingabe).toLowerCase();
  const anzahl = (e) => (Number.isFinite(e && e.count) ? e.count : 0);
  const name = (e) => String((e && e.tag) == null ? '' : e.tag);
  const treffer = vorschlaege.filter((e) => !gesucht || name(e).toLowerCase().includes(gesucht));
  treffer.sort((a, b) => {
    if (gesucht) {
      const aPrefix = name(a).toLowerCase().startsWith(gesucht) ? 0 : 1;
      const bPrefix = name(b).toLowerCase().startsWith(gesucht) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    }
    if (anzahl(a) !== anzahl(b)) return anzahl(b) - anzahl(a);
    return name(a).localeCompare(name(b));
  });
  return treffer.slice(0, limit);
}

module.exports = { SCHLAGWORT_RENDER_LIMIT, waehleSchlagworte };
