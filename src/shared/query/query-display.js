// 4T-002043 (Epic 3E-000258, Entscheidungen F2 Option A und F3b): die Angabe
// der Darstellungsform einer Abfrage, `DISPLAY <Form> [BY <Feld>]`.
//
// **Was die Angabe ist:** ein Darstellungs-Wunsch des Autors, kein Teil der
// Auswertung. Sie wählt die Form, in der das Ergebnis erscheint (zuerst der Baum
// `DISPLAY tree BY <Verweis-Feld>`, später die Diagramme), und ändert an der
// Menge nichts. Gelesen wird sie wie die übrigen Klauseln, in der Regel als
// letzte; sie landet als `display: { form, by }` im Abfrage-Knoten und reist von
// dort als Wunsch in der Ergebnismenge (`wishes.display`). Ohne Angabe fehlt das
// Feld ganz, damit Abfrage und Menge ohne Angabe unverändert bleiben.
//
// **Was sie nicht ist:** eine Prüfung der Form. Ob es eine Form dieses Namens
// gibt und ob sie zur Abfrage passt, entscheidet erst das Verzeichnis der Formen
// im Anzeige-Prozess (`src/renderer/modules/query/display-forms.js`); eine
// unbekannte oder unpassende Form ist dort ein Hinweis und nie ein Fehler. Ein
// Syntax-Fehler ist allein die unvollständige Angabe: `DISPLAY` ohne den Namen
// einer Form oder `BY` ohne Feld.
//
// **Schreibung:** Das Wort der Form wird klein geschrieben, wie die Elemente von
// HIDE und SHOW; das Feld nach `BY` klein und ohne Rand, wie die Verweis-Felder
// der Hüllen-Formen (`query-record-sources.js`), und wie dort als Wort oder,
// wenn sein Name Zeichen trägt, die ein Wort trennen, als Zeichenkette.
//
// **Warum ein eigenes Modul:** Der Parser steht nahe an seinem eingefrorenen
// Größen-Wert (Festlegung 17 des Epics). Er reicht seine Erkennung der
// Klausel-Wörter einmal beim Laden herein (`displayReader`), damit die Wörter
// ihre eine Heimat im Parser behalten, und ruft die Angabe dann mit einer Zeile.
//
// Prozess-neutral (kein Electron, kein DOM), ohne Import.
'use strict';

/** Ist das Token das kontextuelle Wort `BY` (ohne Rücksicht auf die Schreibung)? */
function isBy(t) {
  return !!t && t.type === 'field' && t.value.toUpperCase() === 'BY';
}

/**
 * Liefert die Lese-Funktion der Angabe. Der Parser reicht seine Erkennung der
 * Klausel-Wörter herein, damit ein folgendes Klausel-Wort nicht als Name der
 * Form oder als Feld gelesen wird (`DISPLAY LIMIT 5` ist eine unvollständige
 * Angabe und keine Form namens «limit»).
 *
 * @param {(t: object) => string|null} clauseWordOf  Klausel-Wort des Tokens oder null.
 * @returns {(query: object, p: { peek: Function, next: Function, atEnd: Function, fail: Function }) => true|null}
 *   Liest ab dem Token nach `DISPLAY`, schreibt `query.display` und liefert true,
 *   oder meldet den Fehler über `fail` und liefert null.
 */
function displayReader(clauseWordOf) {
  const isName = (t, allowString) =>
    !!t &&
    (t.type === 'field' || (allowString && t.type === 'string')) &&
    t.value.trim() !== '' &&
    !(t.type === 'field' && clauseWordOf(t));

  return function readDisplay(query, { peek, next, atEnd, fail }) {
    const formTok = atEnd() ? null : peek();
    if (!isName(formTok, false) || isBy(formTok)) {
      return fail('displayForm', 'Name der Darstellungsform nach DISPLAY erwartet');
    }
    next();
    let by = null;
    if (!atEnd() && isBy(peek())) {
      next();
      const fieldTok = atEnd() ? null : peek();
      if (!isName(fieldTok, true)) return fail('displayBy', 'Feld nach BY in DISPLAY erwartet');
      by = next().value.trim().toLowerCase();
    }
    query.display = { form: formTok.value.toLowerCase(), by };
    return true;
  };
}

module.exports = { displayReader };
