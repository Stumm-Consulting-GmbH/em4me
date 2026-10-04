// 4T-002042 (Epic 3E-000258, E6.3): Die beiden Quellen-Formen der transitiven
// Hülle, `ancestors(ziel, feld, …)` und `descendants(ziel, feld, …)`.
//
// **Quellen-Formen nach dem Vorbild von `outgoing(…)`**: Wort, Klammer, ein
// Datensatz-Verweis in der Schreibweise des Fließtexts (`[[Tabelle#^r-00042]]`),
// danach durch Kommas getrennt ein oder mehr Verweis-Felder, schließende
// Klammer. Ein Feld-Name steht als Wort oder, wenn er Zeichen trägt, die ein Wort
// trennen, als Zeichenkette. Das Ergebnis ist ein Quellen-Knoten
// `{ type: 'srcHull', kind, target, table, start, fields }`.
//
// **Warum ein eigenes Modul:** Der Parser der Abfrage-Sprache steht nahe an
// seinem eingefrorenen Größen-Wert, und das nächste Vorhaben fügt dort ebenfalls
// an (Festlegung 17 des Epics). Er ruft die Formen mit einer Zeile auf und
// reicht dafür seine Token-Zugriffe herein.
//
// **Die Menge selbst** bildet der Haupt-Prozess einmal je Abfrage
// (`src/main/index/record-hull.js`); dieses Modul liest nur die Schreibweise und
// sagt, wo die Formen nicht hingehören. Auf der Datei-, Block- und
// Aufgaben-Ebene sind sie ein Abfrage-Fehler, weil es dort keine Datensätze gibt.
//
// Prozess-neutral (kein Electron, kein DOM), ohne Import.
'use strict';

const HULL_KINDS = new Map([
  ['ANCESTORS', 'ancestors'],
  ['DESCENDANTS', 'descendants'],
]);

/** Ist das Token das Wort einer Hüllen-Form (ohne Rücksicht auf die Schreibung)? */
function isHullWord(t) {
  return !!t && t.type === 'field' && HULL_KINDS.has(t.value.toUpperCase());
}

/**
 * Zerlegt das Ziel einer Hüllen-Form: `Tabelle#^r-00042`, `Tabelle#r-42` oder
 * `Tabelle#Schlüssel`. Das `^` des Ankers ist wahlfrei; was danach steht, liest
 * der Haupt-Prozess nach der Ordnung einer Verweis-Zelle (E5.4). Ein Alias hinter
 * `|` gehört zur Anzeige eines Verweises und nicht zu seinem Ziel.
 *
 * @returns {{ table: string, start: string }|null} null, wenn Tabelle oder Anker fehlen.
 */
function hullTarget(value) {
  const link = value.split('|')[0];
  const hash = link.indexOf('#');
  if (hash < 0) return null;
  const table = link.slice(0, hash).trim();
  const start = link.slice(hash + 1).replace(/^\^/, '');
  if (table === '' || start.trim() === '') return null;
  return { table, start };
}

/**
 * Liest eine Hüllen-Form ab dem aktuellen Token. Der Aufrufer hat mit
 * `isHullWord` geprüft, dass sie hier beginnt.
 *
 * @param {{ peek: Function, next: Function, atEnd: Function, fail: Function }} p
 *   Die Token-Zugriffe und die Fehler-Meldung des Parsers.
 * @returns {object|null} Der Quellen-Knoten oder null nach einer Fehler-Meldung.
 */
function parseHullSource({ peek, next, atEnd, fail }) {
  const kind = HULL_KINDS.get(next().value.toUpperCase());
  if (atEnd() || peek().type !== '(') {
    return fail('expectedParen', `'(' nach ${kind} erwartet`);
  }
  next();
  const linkTok = atEnd() ? null : peek();
  const target = linkTok && linkTok.type === 'link' ? hullTarget(linkTok.value) : null;
  if (target === null) {
    return fail('hullTarget', `Datensatz-Verweis in ${kind}(…) erwartet`);
  }
  next();
  const fields = [];
  while (!atEnd() && peek().type === ',') {
    next();
    const t = atEnd() ? null : peek();
    if (!t || (t.type !== 'field' && t.type !== 'string') || t.value.trim() === '') {
      return fail('hullField', `Verweis-Feld in ${kind}(…) erwartet`);
    }
    fields.push(next().value.trim().toLowerCase());
  }
  if (fields.length === 0) return fail('hullField', `Verweis-Feld in ${kind}(…) erwartet`);
  if (atEnd() || peek().type !== ')') {
    return fail('expectedParen', `Fehlende schließende Klammer nach ${kind}(…)`);
  }
  next();
  return { type: 'srcHull', kind, target: linkTok.value, ...target, fields };
}

/** Kommt in der Quelle eine Hüllen-Form vor? */
function usesHull(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'srcHull') return true;
  return usesHull(node.left) || usesHull(node.right) || usesHull(node.operand);
}

/**
 * Der Abfrage-Fehler einer Hüllen-Form außerhalb der Datensatz-Ebene, oder null.
 * Auf der Datei-, Block- und Aufgaben-Ebene gibt es keine Datensätze.
 */
function hullScopeError(ast) {
  if (!ast || ast.scope === 'records' || !usesHull(ast.source)) return null;
  return { code: 'recordHullScope', message: 'ancestors/descendants nur bei RECORDS', pos: -1 };
}

module.exports = { isHullWord, hullTarget, parseHullSource, hullScopeError };
