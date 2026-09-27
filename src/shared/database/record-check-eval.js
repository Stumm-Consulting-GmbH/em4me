// 4T-001931 (Epic 3E-000256, E22.2, E22.3): Die Auswertung einer Prüfregel
// gegen einen Datensatz — die eine Stelle, an der Schreib-Schnittstelle und
// Datensatz-Block dieselbe Regel gleich verstehen.
//
// **Warum ein eigenes Modul und prozess-neutral.** Eine Regel wirkt an zwei
// Orten: hart in der Schreib-Schnittstelle, die einen verletzenden Auftrag
// abweist, und weich im Datensatz-Block, der einen verletzenden Wert markiert.
// Läge die Auswertung zweimal vor, gäben beide Orte irgendwann verschiedene
// Antworten auf dieselbe Frage. Der Datensatz-Block liegt im Renderer-Bündel;
// dieses Modul lädt deshalb ausschließlich aus `src/shared`, und
// `record-values.js` lädt es nicht zurück.
//
// **Kein eigener Auswerter** (E22, erste Auflage). Ein Ausdruck läuft durch
// `evaluateExpression` der Abfrage-Sprache, ein regulärer Ausdruck ist der eine
// zweite Weg. Der Kontext folgt dem Muster der abgeleiteten Felder der
// Eigenschafts-Profile (`werteAbgeleiteteFelder`, dritte Runde): Jedes Feld der
// Definition steht unter seinem kleingeschriebenen Namen darin, ein Feld ohne
// Wert als `null`.
//
// **Typisierte Werte, Literale wie in jeder Abfrage** (Entscheidung beim Start
// des Vorgangs). Eine Zahl kommt als Zahl, ein Wahrheitswert als
// Wahrheitswert, ein Datum und eine Uhrzeit als ihr ISO-Text; die Abfrage-Sprache
// vergleicht ISO-Texte chronologisch, auch gegen ein `date(…)`-Literal. Der
// Autor schreibt eine Regel damit so, wie er eine Abfrage schreibt.
//
// **Fail-closed** (AK3). Ein Ergebnis ohne Wert (`null`), ein Wurf und eine Regel
// ohne Auswertungs-Weg gelten als verletzt mit dem Grund `nichtAuswertbar`. Ein
// stilles Durchlassen bräche die Zusicherung, gegen die die Regel antritt.
//
// Prozess-neutral (kein Electron, kein Dateizugriff, kein DOM).
'use strict';

const { zellWert } = require('./record-values.js');
const { DB_DEFAULT_COLUMN_TYPE } = require('./table-columns.js');
const { collectFieldRefs } = require('../query/perspective-query.js');
const { evaluateExpression } = require('../query/perspective-query-eval.js');
const { truthy } = require('../query/query-format.js');

// Die Gründe einer Verletzung. `regex` und `ausdruck` sagen, dass die Regel
// ausgewertet wurde und nicht erfüllt ist; `nichtAuswertbar`, dass sie sich
// gar nicht auswerten ließ.
const GRUENDE = Object.freeze({
  regex: 'regex',
  ausdruck: 'ausdruck',
  nichtAuswertbar: 'nichtAuswertbar',
});

// Der eigene Wert heißt in einer Feld-Regel `value` (`table-checks.js`).
const WERT_BEZUG = 'value';

// Präfixe, die keine Felder des Datensatzes ansprechen, sondern Datei und
// Träger (`resolveField` der Abfrage-Sprache).
const FREMDE_PRAEFIXE = ['this.', 'file.'];

// --- Der Kontext ---------------------------------------------------------------------

// Ist der Wert eines Feldes gesetzt? «Nicht gesetzt» heißt leerer getrimmter
// Text, wie bei der Pflicht-Angabe der Schreib-Schnittstelle
// (`istNichtGesetzt` in `src/main/database/record-auftrag-pruefung.js`,
// Entscheidung des Product Owners vom 2026-09-20). **Mit derselben Ausnahme,
// dem Wahrheitswert:** Die leere Zelle ist dort der geschriebene Wert «nein»
// und kein fehlender; eine Regel, die einen gesetzten Haken verlangt, muss sie
// deshalb sehen können.
function istGesetzt(text, typ) {
  if (typ === 'boolean') return true;
  return typeof text === 'string' && text.trim() !== '';
}

/**
 * Baut den Kontext eines Datensatzes für die Auswertung eines Ausdrucks.
 *
 * @param {Array<{name: string, type?: string}>} fields Die Felder der Definition.
 * @param {Array<string|undefined>} texte Die Zell-Texte in Feld-Reihenfolge,
 *   demaskiert und ohne Trennabstand; eine fehlende Zelle ist leer.
 * @returns {Object<string, *>} Feld-Name kleingeschrieben auf seinen Wert nach
 *   dem Typ des Feldes; ein nicht gesetzter Wert und ein Typ-Fehler sind `null`.
 */
function baueRegelKontext(fields, texte) {
  if (!Array.isArray(fields))
    throw new TypeError('baueRegelKontext: fields muss eine Liste von Feldern sein');
  const liste = Array.isArray(texte) ? texte : [];
  const kontext = {};
  fields.forEach((feld, i) => {
    const typ = feld.type || DB_DEFAULT_COLUMN_TYPE;
    const text = typeof liste[i] === 'string' ? liste[i] : '';
    let wert = null;
    if (istGesetzt(text, typ)) {
      const gelesen = zellWert(typ, text);
      wert = gelesen.error === null ? gelesen.value : null;
    }
    kontext[feld.name.toLowerCase()] = wert;
  });
  return kontext;
}

// --- Eine Regel ----------------------------------------------------------------------

function ergebnis(regel, erfuellt, grund) {
  return {
    erfuellt,
    grund: erfuellt ? null : grund,
    quelle: regel.quelle,
    message: regel.message === undefined ? null : regel.message,
  };
}

// Regulärer Ausdruck gegen den Zell-Text. `lastIndex` wird vor dem Test
// zurückgesetzt: Die Flags `g` und `y` weist das Lesen zwar ab, aber ein
// zustandsbehafteter Ausdruck lieferte sonst für denselben Wert abwechselnd
// zwei Ergebnisse, und das darf an dieser Stelle nicht von einer fernen Regel
// abhängen.
function pruefeRegex(regel, text) {
  regel.regex.lastIndex = 0;
  return regel.regex.test(typeof text === 'string' ? text : '');
}

// Ausdruck der Abfrage-Sprache. Liefert true, false oder null (nicht
// auswertbar). Eine Feld-Regel sieht ihren eigenen Wert als `value`, eine
// Datensatz-Regel nicht.
function pruefeAusdruck(regel, kontext, mitWert, wert) {
  const props = mitWert ? { ...kontext, [WERT_BEZUG]: wert } : { ...kontext };
  const roh = evaluateExpression(regel.ast, { props });
  if (roh === null || roh === undefined) return null;
  return truthy(roh);
}

/**
 * Wertet eine normalisierte Regel aus (`table-checks.js`).
 *
 * @param {{art: string, quelle: string, regex?: RegExp, ast?: object,
 *   message?: *}} regel Die Regel.
 * @param {{kontext: object, text?: string, wert?: *}} eingabe Der Kontext des
 *   Datensatzes, dazu bei einer Feld-Regel Zell-Text und Wert des eigenen
 *   Feldes. Ohne `wert` gilt die Regel als Datensatz-Regel und sieht kein
 *   `value`.
 * @returns {{erfuellt: boolean, grund: null|'regex'|'ausdruck'|'nichtAuswertbar',
 *   quelle: string, message: *}} `message` ist der Anwender-Text der Definition,
 *   unverändert und unübersetzt.
 */
function wertePruefregel(regel, { kontext, text, wert } = {}) {
  if (!regel || typeof regel !== 'object')
    throw new TypeError('wertePruefregel: regel muss eine normalisierte Regel sein');
  try {
    if (regel.art === 'regex') {
      const passt = pruefeRegex(regel, text);
      return ergebnis(regel, passt, GRUENDE.regex);
    }
    if (regel.art === 'expr') {
      const wahr = pruefeAusdruck(regel, kontext || {}, wert !== undefined, wert);
      if (wahr === null) return ergebnis(regel, false, GRUENDE.nichtAuswertbar);
      return ergebnis(regel, wahr, GRUENDE.ausdruck);
    }
    // Ein Regel-Name (`art: 'name'`) erreicht diese Stelle heute nicht, weil
    // der Katalog leer ist und das Lesen einen unbekannten Namen verwirft. Der
    // Katalog trägt aber keine Prüfung, nur Namen; ein Name ohne Prüfung und
    // jede andere Art sind nicht auswertbar und damit verletzt, nie erfüllt.
    return ergebnis(regel, false, GRUENDE.nichtAuswertbar);
  } catch {
    // Ein Wurf der Auswertung lässt nicht durch (AK3).
    return ergebnis(regel, false, GRUENDE.nichtAuswertbar);
  }
}

// --- Feld-Regeln und Datensatz-Regeln ------------------------------------------------

/**
 * Hält einen Wert gegen die Feld-Regeln seines Feldes.
 *
 * **Nicht angewandt** auf einen nicht gesetzten Wert (leer oder Typ-Fehler,
 * also `null` im Kontext): Ob ein leerer Wert erlaubt ist, sagt die
 * Pflicht-Angabe, und einen Typ-Fehler meldet die Typ-Prüfung.
 *
 * @param {{name: string, checks?: Array<object>}} feld Das Feld der Definition.
 * @param {string} text Der Zell-Text, demaskiert und ohne Trennabstand.
 * @param {object} kontext Ergebnis von `baueRegelKontext`.
 * @returns {Array<{feld: string, wert: string, quelle: string, message: *,
 *   grund: string}>} Die Verletzungen in der Reihenfolge der Regeln.
 */
function pruefeFeldRegeln(feld, text, kontext) {
  const regeln = Array.isArray(feld.checks) ? feld.checks : [];
  if (regeln.length === 0) return [];
  const schluessel = feld.name.toLowerCase();
  // Ein Kontext ohne dieses Feld ist ein gebrochener Vertrag und kein «nicht
  // gesetzt»: Still übergangen, ließe er jede Regel des Feldes durch.
  if (!kontext || !Object.prototype.hasOwnProperty.call(kontext, schluessel))
    throw new TypeError(`pruefeFeldRegeln: der Kontext kennt das Feld ${feld.name} nicht`);
  const wert = kontext[schluessel];
  if (wert === null) return [];
  const verletzungen = [];
  for (const regel of regeln) {
    const geprueft = wertePruefregel(regel, { kontext, text, wert });
    if (geprueft.erfuellt) continue;
    verletzungen.push({
      feld: feld.name,
      wert: text,
      quelle: geprueft.quelle,
      message: geprueft.message,
      grund: geprueft.grund,
    });
  }
  return verletzungen;
}

// Die Felder, die ein Ausdruck anspricht, in Definitions-Schreibweise und in
// der Reihenfolge der Definition, jedes einmal.
function beteiligteFelder(regel, fields) {
  const refs = [];
  collectFieldRefs(regel.ast, refs);
  const genannt = new Set(
    refs.filter((ref) => !FREMDE_PRAEFIXE.some((praefix) => ref.startsWith(praefix))),
  );
  return fields.filter((feld) => genannt.has(feld.name.toLowerCase())).map((feld) => feld.name);
}

/**
 * Hält einen Datensatz gegen die Datensatz-Regeln seiner Tabelle.
 *
 * **Eine Datensatz-Regel läuft immer**, auch wenn beteiligte Felder leer sind:
 * Es gibt hier keinen einen Wert, an dem «nicht gesetzt» hinge, und der Autor
 * prüft Leere im Ausdruck selbst.
 *
 * @param {Array<object>|undefined} checks Die Datensatz-Regeln der Definition.
 * @param {object} kontext Ergebnis von `baueRegelKontext`.
 * @param {Array<{name: string}>} fields Die Felder der Definition; aus ihnen
 *   kommt die Schreibweise der beteiligten Felder.
 * @returns {Array<{felder: Array<string>, quelle: string, message: *,
 *   grund: string}>} Die Verletzungen in der Reihenfolge der Definition.
 */
function pruefeDatensatzRegeln(checks, kontext, fields) {
  const regeln = Array.isArray(checks) ? checks : [];
  if (regeln.length === 0) return [];
  if (!Array.isArray(fields))
    throw new TypeError('pruefeDatensatzRegeln: fields muss eine Liste von Feldern sein');
  const verletzungen = [];
  for (const regel of regeln) {
    const geprueft = wertePruefregel(regel, { kontext });
    if (geprueft.erfuellt) continue;
    verletzungen.push({
      felder: regel.ast ? beteiligteFelder(regel, fields) : [],
      quelle: geprueft.quelle,
      message: geprueft.message,
      grund: geprueft.grund,
    });
  }
  return verletzungen;
}

module.exports = {
  GRUENDE,
  baueRegelKontext,
  wertePruefregel,
  pruefeFeldRegeln,
  pruefeDatensatzRegeln,
};
