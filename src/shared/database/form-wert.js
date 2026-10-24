// 4T-002183 (Epic 3E-000261, F3 Option A, S3): Der Wert-Platzhalter der
// Einzel-Maske — das Lesen seines Ausdrucks und seine Auswertung gegen den
// Stand eines Datensatzes.
//
// **Kein eigener Auswerter** (E22-Auflage, S3). Gelesen wird mit
// `parseExpression` der Abfrage-Sprache und gegen den Funktions-Katalog
// geprüft (`validateQuery`), in derselben Folge wie eine Prüfregel
// (`alsAusdruck` in `table-checks.js`); ausgewertet wird mit
// `evaluateExpression` über dem Kontext aus `baueRegelKontext`, wie Prüfregel
// und Bearbeitbarkeits-Bedingung. Ein Ausdruck nennt damit die Felder des
// eigenen Datensatzes unter ihrem Namen, ohne Rücksicht auf die Schreibung,
// und kennt alle Funktionen der Abfrage-Sprache. Pfade über Verweis-Felder
// gibt es hier nicht, weil der Kontext keinen Navigator trägt (F3 A).
//
// **Ein Datum wird zum Datums-Wert.** `baueRegelKontext` lässt ein Datum als
// ISO-Text stehen, weil eine Prüfregel nur vergleicht und die Abfrage-Sprache
// ISO-Texte chronologisch vergleicht. Ein Wert-Platzhalter rechnet aber auch:
// `ausgeliehen + dur(14 days)` ergäbe über dem Text eine Verkettung statt eines
// Datums. Die Datensatz-Ebene der Abfrage löst denselben Punkt im
// Tabellen-Bestand (`typedValue` in `src/main/index/record-table-read.js`); der
// Kontext hier hebt ein Datum deshalb nach derselben Regel auf den Datums-Wert
// des Werte-Modells, eine Uhrzeit bleibt Text. So rechnet der Ausdruck in der
// Maske wie derselbe Ausdruck in einer Tabellen-Abfrage.
//
// **Die Bedingung eines Bereichs** (4T-002186) läuft durch dieselbe Auswertung
// und bekommt die Wahrheits-Lesart der Prüfregeln (`truthy`), damit
// `{{when:onloan}}` so entscheidet wie `check: onloan` in der Definition.
//
// **Weiche Fehler.** Ein Ausdruck, der für den Datensatz keinen Wert ergibt
// oder bei der Auswertung wirft, liefert `null`; die Maske zeigt dann eine
// leere, markierte Stelle ohne Meldung. Gemeldet wird allein ein Ausdruck, der
// sich nicht lesen lässt (`liesWertAusdruck` liefert `null`).
//
// **Die Weiche der Verweis-Pfade** (4T-002252, F6 A, S8, Festlegung 1): Ein
// Ausdruck, der einen Feld-Namen mit Punkt nennt, dessen Kopf vor dem ersten
// Punkt ein Verweis-Feld der Definition ist, braucht den Navigator der
// Datensatz-Abfrage und wird deshalb im Haupt-Prozess ausgewertet
// (`nenntVerweisPfad`); jeder andere Ausdruck bleibt hier, sofort und lokal.
// Den gelieferten Wert setzt die Anzeige über `wertAlsAusdruck` in dieselbe
// Stelle, damit Darstellung und Markierung dieselben bleiben.
//
// Prozess-neutral (kein Electron, kein DOM): Gelesen wird beim Zerlegen des
// Körpers im Haupt-Prozess, ausgewertet bei jeder Anzeige im Anzeige-Prozess.
'use strict';

const { parseExpression } = require('../query/perspective-query.js');
const { validateQuery } = require('../query/query-functions.js');
const { evaluateExpression } = require('../query/perspective-query-eval.js');
const { parseIsoLocalMs, truthy } = require('../query/query-format.js');
const { baueRegelKontext } = require('./record-check-eval.js');

/**
 * Liest den Ausdruck eines Wert-Platzhalters.
 *
 * @param {string} quelle Der Ausdruck, wie er in den Klammern steht.
 * @returns {object|null} Der Ausdrucks-Baum der Abfrage-Sprache, oder null,
 *   wenn der Ausdruck leer ist, sich nicht lesen lässt oder eine unbekannte
 *   Funktion beziehungsweise eine falsche Argument-Zahl nennt.
 */
function liesWertAusdruck(quelle) {
  const geparst = parseExpression(typeof quelle === 'string' ? quelle : '');
  if (!geparst.ok || validateQuery(geparst.ast)) return null;
  return geparst.ast;
}

/**
 * Der Kontext eines Datensatzes für Wert-Platzhalter: `baueRegelKontext`, dazu
 * jedes Datum als Datums-Wert des Werte-Modells.
 *
 * @param {Array<{name: string, type?: string}>} fields Die Felder der Definition.
 * @param {Array<string|undefined>} texte Die Zell-Texte in Feld-Reihenfolge.
 * @returns {Object<string, *>} Feld-Name kleingeschrieben auf seinen Wert.
 */
function baueWertKontext(fields, texte) {
  const kontext = baueRegelKontext(fields, texte);
  for (const feld of fields) {
    if (feld.type !== 'date') continue;
    const schluessel = feld.name.toLowerCase();
    const wert = kontext[schluessel];
    if (typeof wert !== 'string') continue;
    const ms = parseIsoLocalMs(wert);
    kontext[schluessel] = ms === null ? null : { kind: 'date', ms };
  }
  return kontext;
}

/**
 * Die Zell-Texte eines Datensatzes in Feld-Reihenfolge, im Bearbeiten aus dem
 * Entwurf (den eben eingegebenen Werten), sonst aus dem gelesenen Stand.
 *
 * @param {Array<{name: string}>} fields Die Felder der Definition.
 * @param {Array<{name: string, text?: string}>} zellen Die Zellen des Stands.
 * @param {Object<string, string>|null} entwurf Der Entwurf der Seite, oder null.
 * @returns {Array<string>} Ein Text je Feld; eine fehlende Zelle ist leer.
 */
function texteDesStands(fields, zellen, entwurf) {
  const gelesen = new Map((Array.isArray(zellen) ? zellen : []).map((z) => [z.name, z.text]));
  return fields.map((feld) => {
    const neu = entwurf ? entwurf[feld.name] : undefined;
    if (typeof neu === 'string') return neu;
    const text = gelesen.get(feld.name);
    return typeof text === 'string' ? text : '';
  });
}

/**
 * Wertet einen gelesenen Ausdruck gegen einen Kontext aus.
 *
 * @param {object|null} ast Ergebnis von `liesWertAusdruck`.
 * @param {object} kontext Ergebnis von `baueWertKontext`.
 * @returns {*} Der Wert im Werte-Modell der Abfrage-Sprache; `null` ohne Wert,
 *   bei einem ungelesenen Ausdruck und bei einem Wurf der Auswertung.
 */
function werteWertAus(ast, kontext) {
  if (!ast) return null;
  try {
    const wert = evaluateExpression(ast, { props: kontext || {} });
    return wert === undefined ? null : wert;
  } catch {
    return null;
  }
}

/**
 * Wertet die Bedingung eines bedingten Bereichs aus (4T-002186, E7.8, F5 A).
 *
 * Dieselbe Wahrheits-Lesart wie eine Prüfregel (`truthy` der Abfrage-Sprache):
 * Ein Ausdruck ohne Wert, ein ungelesener Ausdruck und ein Wurf der Auswertung
 * ergeben `false`, und der Bereich bleibt verborgen; er zeigt damit nie etwas
 * Falsches.
 *
 * @param {object|null} ast Ergebnis von `liesWertAusdruck`.
 * @param {object} kontext Ergebnis von `baueWertKontext`.
 * @returns {boolean} Ob der Bereich erscheint.
 */
function werteBedingungAus(ast, kontext) {
  const wert = werteWertAus(ast, kontext);
  return wert === null ? false : truthy(wert);
}

// Der Typ eines Verweis-Feldes in der Definition (`record-regel-hilfen.js`).
const VERWEIS_TYP = 'record';

// Alle Feld-Namen eines Ausdrucks-Baums, über jeden Objekt-Wert hinweg, damit
// kein Knoten-Typ (Aufruf, Vergleich, Liste) eigens bekannt sein muss.
function feldNamen(knoten, namen = []) {
  if (Array.isArray(knoten)) {
    for (const kind of knoten) feldNamen(kind, namen);
  } else if (knoten && typeof knoten === 'object') {
    if (knoten.type === 'field' && typeof knoten.name === 'string') namen.push(knoten.name);
    for (const wert of Object.values(knoten))
      if (wert && typeof wert === 'object') feldNamen(wert, namen);
  }
  return namen;
}

// Das Feld der Definition zu einem Namen, ohne Rücksicht auf die Schreibung.
function feldZu(name, fields) {
  const klein = name.toLowerCase();
  return (Array.isArray(fields) ? fields : []).find(
    (feld) => feld && typeof feld.name === 'string' && feld.name.toLowerCase() === klein,
  );
}

// Das Feld zum Kopf eines Punkt-Namens, oder undefined. Ein Name, den die
// Definition wörtlich als Feld führt, ist kein Pfad (Rangfolge der
// Feld-Auflösung in `query-record-fields.js`); die Namensräume der Sprache
// (`record.`, `this.`, `file.`) ebenso wenig.
const NAMENSRAEUME = ['record.', 'this.', 'file.'];
function istPunktName(name, fields) {
  if (!name.includes('.') || feldZu(name, fields)) return false;
  const klein = name.toLowerCase();
  return !NAMENSRAEUME.some((raum) => klein.startsWith(raum));
}
function kopfFeld(name, fields) {
  return feldZu(name.slice(0, name.indexOf('.')), fields);
}

/**
 * Nennt der Ausdruck einen Pfad über ein Verweis-Feld (4T-002252, Festlegung 1)?
 * Ein Punkt-Name, dessen Kopf kein Verweis-Feld ist, zählt nicht und bleibt
 * lokal «fehlend» wie bisher.
 *
 * @param {object|null} ast Ergebnis von `liesWertAusdruck`.
 * @param {Array<{name: string, type?: string}>} fields Die Felder der Definition.
 * @returns {boolean}
 */
function nenntVerweisPfad(ast, fields) {
  return feldNamen(ast).some((name) => {
    if (!istPunktName(name, fields)) return false;
    const feld = kopfFeld(name, fields);
    return !!feld && feld.type === VERWEIS_TYP;
  });
}

/**
 * Die Punkt-Namen eines Ausdrucks, deren Kopf kein Feld der Definition ist
 * (4T-002252, Hinweis `formPfadUnbekannt`), ohne Doppelte.
 *
 * @param {object|null} ast Ergebnis von `liesWertAusdruck`.
 * @param {Array<{name: string}>} fields Die Felder der Definition.
 * @returns {Array<string>}
 */
function unbekanntePfade(ast, fields) {
  const namen = feldNamen(ast).filter(
    (name) => istPunktName(name, fields) && !kopfFeld(name, fields),
  );
  return [...new Set(namen)];
}

/**
 * Ein Ausdrucks-Baum, der genau den gelieferten Wert ergibt (4T-002252): So
 * füllt die Anzeige einen im Haupt-Prozess gerechneten Wert über dieselbe
 * Stelle wie einen lokalen.
 *
 * @param {*} wert Wert im Werte-Modell, oder null.
 * @returns {{type: 'const', value: *}}
 */
function wertAlsAusdruck(wert) {
  return { type: 'const', value: wert === undefined ? null : wert };
}

module.exports = {
  feldNamen,
  nenntVerweisPfad,
  unbekanntePfade,
  wertAlsAusdruck,
  liesWertAusdruck,
  baueWertKontext,
  texteDesStands,
  werteWertAus,
  werteBedingungAus,
};
