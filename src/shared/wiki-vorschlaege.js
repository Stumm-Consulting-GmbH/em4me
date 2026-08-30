// 4T-1307 (Epic 3E-0235): Auswahl-Regel und Klammer-Schluss der Vorschlagsliste
// fuer interne Verweise (`[[…`).
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein DOM). Die beiden
// Entscheidungen liegen hier und nicht im Renderer-Modul, weil sie ohne Editor
// und ohne IPC pruefbar sind; der Renderer haelt nur noch die Verdrahtung mit
// CodeMirror.
'use strict';

// Wieviele Eintraege ein Dropdown hoechstens zeigt. Der Wert stand bis 4T-1307
// im Renderer-Modul und ist mit der Auswahl-Regel hierher gewandert, weil er
// zu ihr gehoert; das Renderer-Modul re-exportiert ihn unveraendert.
const AUTOCOMPLETE_RENDER_LIMIT = 30;

// --- Auswahl und Reihenfolge -------------------------------------------------

// Filtert und sortiert die Vorschlaege des Bereichs-Index fuer den bereits
// getippten Rest hinter `[[`.
//
// Zwei Lagen, und der Unterschied ist die eigentliche Regel (Entscheidung E3
// des Product Owners vom 2026-08-30):
//
//   - **Nichts getippt.** Dann gibt es keine Treffer-Guete, an der sich eine
//     Reihenfolge festmachen liesse, und alphabetisch ist die Liste bei einem
//     gewachsenen Bereich beliebig. Hier fuehrt die Aenderungszeit: Wer einen
//     Verweis setzt, meint fast immer das, woran er zuletzt gearbeitet hat.
//   - **Etwas getippt.** Dann fuehrt die Treffer-Guete wie bisher (Prefix vor
//     Teiltreffer, Datei vor Zweitname), und die Aenderungszeit tritt an die
//     Stelle des Alphabets als Entscheid zwischen Gleichrangigen.
//
// Der Name bleibt in beiden Lagen der letzte Entscheid, damit die Reihenfolge
// bei gleicher Zeit stabil und damit vorhersagbar ist.
function waehleWikiZiele(vorschlaege, eingabe, limit = AUTOCOMPLETE_RENDER_LIMIT) {
  if (!Array.isArray(vorschlaege)) return [];
  const gesucht = String(eingabe == null ? '' : eingabe).toLowerCase();
  const zeit = (s) => (Number.isFinite(s && s.mtimeMs) ? s.mtimeMs : 0);
  const treffer = vorschlaege.filter(
    (s) => !gesucht || String(s.name).toLowerCase().includes(gesucht),
  );
  treffer.sort((a, b) => {
    if (gesucht) {
      const aPrefix = String(a.name).toLowerCase().startsWith(gesucht) ? 0 : 1;
      const bPrefix = String(b.name).toLowerCase().startsWith(gesucht) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      // Dateien vor Zweitnamen bei gleichem Rang.
      if (a.kind !== b.kind) return a.kind === 'file' ? -1 : 1;
    }
    if (zeit(a) !== zeit(b)) return zeit(b) - zeit(a);
    return String(a.name).localeCompare(String(b.name));
  });
  return treffer.slice(0, limit);
}

// --- Klammer-Schluss bei der Uebernahme --------------------------------------

// Was hinter dem uebernommenen Namen noch fehlt, damit der Verweis geschlossen
// ist. `textDanach` ist der Dokument-Text unmittelbar hinter der ersetzten
// Stelle; zwei Zeichen genuegen zur Entscheidung.
//
// Der halb geschlossene Fall (`]`) ist kein Sonderfall aus Vorsicht, sondern
// entsteht regulaer: Wer die Klammern von Hand zu tippen begonnen hat und
// dann doch einen Vorschlag waehlt, hinterlaesst genau ihn.
function klammerSchluss(textDanach) {
  const s = String(textDanach == null ? '' : textDanach);
  if (s.startsWith(']]')) return '';
  if (s.startsWith(']')) return ']';
  return ']]';
}

// Wo die Schreibmarke nach der Uebernahme steht: hinter den schliessenden
// Klammern, unabhaengig davon, wieviele davon schon dastanden. `von` ist der
// Beginn der ersetzten Stelle im Dokument.
function schreibmarkeNachUebernahme(von, name) {
  return von + String(name == null ? '' : name).length + 2;
}

module.exports = {
  AUTOCOMPLETE_RENDER_LIMIT,
  waehleWikiZiele,
  klammerSchluss,
  schreibmarkeNachUebernahme,
};
