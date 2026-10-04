// 4T-002079 (Epic 3E-000259, Festlegungen 7 und 8, F5 Option A): die
// Bedingung über das Aggregat, `HAVING <Ausdruck>`.
//
// **Was die Klausel ist:** ein Filter über Gruppen. `WHERE` wirkt vor der
// Gruppen-Bildung auf die einzelnen Treffer; `HAVING` wirkt danach auf die
// Gruppen und kann deshalb über sie rechnen, etwa «nur Autoren mit mehr als
// einem Buch» (`GROUP BY author HAVING count() > 1`). Der Ausdruck ist ein
// Wahrheits-Ausdruck wie nach `WHERE` und steht an einer Aggregat-Stelle; was
// dort stehen darf und was er über einer Gruppe bedeutet, regelt
// `query-aggregate.js`. Gelesen wird die Klausel wie die übrigen, an beliebiger
// Stelle der Klausel-Folge; sie landet als `having` im Abfrage-Knoten. Ohne
// Klausel fehlt das Feld ganz, damit Abfragen ohne sie unverändert bleiben.
//
// **`HAVING` ohne `GROUP BY`** ist ein Abfrage-Fehler, weil es ohne Gruppe keine
// Aggregat-Stelle gibt (`havingError`). Die Prüfung steht in der
// Funktions-Prüfung (`validateQuery` in `query-functions.js`), die jeder
// Abfrage-Weg vor dem Lesen fährt, und nicht im Parser: Dort hätte sie nach der
// Klausel-Schleife eine weitere Zeile gekostet, weil `GROUP BY` auch hinter
// `HAVING` stehen darf.
//
// **Warum ein eigenes Modul:** Der Parser steht nahe an seinem eingefrorenen
// Größen-Wert (Festlegung 21 des Epics); er bekommt allein das Klausel-Wort und
// einen Aufruf, nach dem Muster der Angabe `DISPLAY` (`query-display.js`).
//
// Prozess-neutral (kein Electron, kein DOM), ohne Import.
'use strict';

/**
 * Liest den Ausdruck nach `HAVING`. Der Parser reicht seinen Ausdrucks-Leser
 * herein; die boolesche Stellung gilt wie nach `WHERE` (ein nacktes Feld braucht
 * einen Vergleich).
 * @param {object} query  Abfrage-Knoten, in den `having` geschrieben wird
 * @param {(boolCtx: boolean) => object|null} parseExpr  Ausdrucks-Leser des Parsers;
 *   meldet einen Fehler selbst und liefert dann null
 * @returns {true|null}
 */
function readHaving(query, parseExpr) {
  const expr = parseExpr(true);
  if (expr === null) return null;
  query.having = expr;
  return true;
}

/**
 * Abfrage-Fehler für `HAVING` ohne `GROUP BY`, sonst null.
 * @param {object} queryAst
 * @returns {{ code: string, message: string, pos: number }|null}
 */
function havingError(queryAst) {
  if (!queryAst || !queryAst.having) return null;
  if (Array.isArray(queryAst.groupBy) && queryAst.groupBy.length > 0) return null;
  return { code: 'havingWithoutGroupBy', message: 'HAVING ohne GROUP BY', pos: -1 };
}

module.exports = { readHaving, havingError };
