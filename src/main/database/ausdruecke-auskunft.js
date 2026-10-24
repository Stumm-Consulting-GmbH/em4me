// 4T-002252 (Epic 3E-000262, F6 A, S1, S8, Festlegung 3): Die Auswertung der
// Wert- und Bereichs-Ausdrücke einer Einzel-Maske, die einen Pfad über ein
// Verweis-Feld nennen (`{{value:book.title}}`, `{{when:book.onloan}}`).
//
// **Hier und nicht im Anzeige-Prozess**, weil allein der Haupt-Prozess die
// verwiesenen Tabellen lesen kann. Ausgewertet wird gegen den **Entwurfs-Stand**
// des Datensatzes: Der Index-Leser legt die Zell-Texte des Entwurfs über dem
// gespeicherten Datensatz aus (`entwurfAlsDatensatz`), mit denselben Regeln wie
// beim Lesen einer Zeile, und der Navigator der Datensatz-Abfrage
// (`recordNavigator`) löst die Pfade auf. Gerechnet wird mit
// `evaluateExpression` wie in einer Tabellen-Abfrage; ein zweiter Auswerter
// entsteht nicht (E22).
//
// **Die Antwort ist JSON-fähig.** Ein Datensatz-Verweis wird zu seinem
// Anzeige-Text, jeder andere Wert bleibt im Werte-Modell (ein Datum etwa als
// `{ kind: 'date', ms }`), damit die Maske ihn wie einen lokalen Wert darstellt.
// `erfuellt` ist die Wahrheits-Lesart der Prüfregeln (`truthy`), `unbekannt`
// der Pfad, dessen Ziel-Feld die Ziel-Tabelle nicht führt.
//
// **Weiche Fehler** wie beim lokalen Wert-Platzhalter: Ein Ausdruck, der sich
// nicht lesen lässt oder bei der Auswertung wirft, ergibt `null`. Eine Lage, in
// der die Tabelle nicht gelesen werden kann, endet mit `{status: 'error', code}`.
//
// **Nicht hier:** die Prüfung der Anfrage gegen Tor und Bereichs-Grenze, die
// der Kanal `database:ausdruecke` vor dem Aufruf leistet. Electron-frei.
'use strict';

const { evaluateExpression } = require('../../shared/query/perspective-query-eval.js');
const { truthy } = require('../../shared/query/query-format.js');
const { feldNamen, liesWertAusdruck } = require('../../shared/database/form-wert.js');
const { entwurfAlsDatensatz } = require('../index/record-table-read.js');
const { recordNavigator } = require('../index/query-records.js');
const { LAGEN } = require('./record-auftrag-pruefung.js');
const { loeseTabelle } = require('./record-auftrag-bestand.js');

function fehler(code) {
  return { status: 'error', code };
}

function istVerweis(wert) {
  return !!wert && typeof wert === 'object' && wert.kind === 'record';
}

// Ein Wert für die Antwort: ein Verweis als Anzeige-Text, eine Liste je Eintrag.
function alsAntwort(wert) {
  if (wert === undefined || wert === null) return null;
  if (Array.isArray(wert)) return wert.map(alsAntwort);
  if (istVerweis(wert)) return wert.display || wert.id || null;
  return wert;
}

// Führt die Tabelle einen Namen aus ganzen Segmenten des Rests als Feld?
function fuehrtFeld(ziel, rest) {
  const teile = rest.split('.');
  for (let n = teile.length; n > 0; n -= 1) {
    if (ziel.values.has(teile.slice(0, n).join('.'))) return true;
  }
  return false;
}

// Der erste Pfad des Ausdrucks, dessen Kopf ein aufgelöster Verweis ist und
// dessen Ziel-Feld die Ziel-Tabelle nicht führt, oder null.
function unbekannterPfad(ast, record, nav) {
  for (const name of feldNamen(ast)) {
    const klein = name.toLowerCase();
    const punkt = klein.indexOf('.');
    if (punkt <= 0 || record.values.has(klein)) continue;
    const kopf = record.values.get(klein.slice(0, punkt));
    if (!istVerweis(kopf)) continue;
    const ziel = nav.target(kopf);
    if (ziel && !fuehrtFeld(ziel, klein.slice(punkt + 1))) return name;
  }
  return null;
}

function werteEinenAus(eintrag, record, nav) {
  const ast = liesWertAusdruck(eintrag.quelle);
  let wert = null;
  let unbekannt = null;
  if (ast) {
    try {
      wert = evaluateExpression(ast, { record, recordNav: nav });
      unbekannt = unbekannterPfad(ast, record, nav);
    } catch {
      wert = null;
    }
  }
  const antwort = alsAntwort(wert);
  return {
    id: eintrag.id,
    wert: antwort,
    erfuellt: antwort === null ? false : truthy(wert),
    unbekannt,
  };
}

/**
 * Wertet die Pfad-Ausdrücke einer Maske gegen den Entwurfs-Stand aus.
 *
 * @param {object} p Parameter.
 * @param {string} p.root Wurzel des Bereichs (und seines Index).
 * @param {string} p.tabelle Pfad der Kopf-Datei, relativ zur Bereichs-Wurzel.
 * @param {string|null} p.kennung Kennung des Datensatzes, oder null (Neuanlage).
 * @param {Object<string, string>|null} p.entwurf Feld-Name auf Zell-Text.
 * @param {Array<{id: string, quelle: string}>} p.ausdruecke Die Ausdrücke.
 * @returns {{status: 'ready', werte: Array<{id: string, wert: *, erfuellt: boolean,
 *   unbekannt: string|null}>}|{status: 'error', code: string}}
 */
function werteAusdrueckeAus({ root, tabelle, kennung, entwurf, ausdruecke }) {
  if (typeof root !== 'string' || root === '') return fehler(LAGEN.wurzelFehlt);
  try {
    const aufgeloest = loeseTabelle(root, tabelle);
    if (!aufgeloest.ok) return fehler(aufgeloest.lage.code);
    const stand = entwurfAlsDatensatz(root, aufgeloest.pfad, kennung, entwurf);
    if (stand === null) return fehler(LAGEN.tabelleUnbekannt);
    const nav = recordNavigator(root, [stand.table]);
    const liste = Array.isArray(ausdruecke) ? ausdruecke : [];
    return { status: 'ready', werte: liste.map((e) => werteEinenAus(e, stand.record, nav)) };
  } catch {
    return fehler(LAGEN.unerwartet);
  }
}

module.exports = { werteAusdrueckeAus };
