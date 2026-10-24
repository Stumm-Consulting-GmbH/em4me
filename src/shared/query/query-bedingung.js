// 4T-002253 (Epic 3E-000262, F5 A, S6; Vorab-Festlegung 1): Die Bedingung
// entlang der Beziehung, als Text an eine Abfrage gefügt.
//
// **Warum Text und nicht Baum.** Der Positions-Bereich einer Maske zeigt die
// Zeilen einer Abfrage-Datei, deren Verweis-Feld auf den gezeigten Kopf zeigt.
// Die Abfrage wird danach im Anzeige-Prozess über denselben Kanal ausgewertet
// wie jede Abfrage-Datei (`runFrontmatterQuery`), und dieser nimmt Text. Eine
// Rückübersetzung eines Ausdrucks-Baums in Text gibt es nicht; die Ergänzung
// geschieht deshalb am Text, an den Klausel-Grenzen, die der Tokenizer des
// Parsers liefert (`tokenize`). Er kennt Anführungszeichen, ein Schlüsselwort
// in einem Text-Wert ist damit keine Grenze.
//
// **Zwei Fälle.** Ohne `WHERE`-Klausel kommt `WHERE <feld> = "<kennung>"` vor
// die erste folgende Klausel der obersten Ebene (`SORT`, `LIMIT`, `DISPLAY`,
// …), sonst ans Ende. Mit `WHERE`-Klausel wird ihre Bedingung geklammert und
// ` AND <feld> = "<kennung>"` angehängt, damit ein `OR` der vorhandenen
// Bedingung die Beziehung nicht aushebelt. Eine Abfrage in der Alt-Form, die
// mit keinem Klausel-Wort beginnt, ist als Ganzes eine Bedingung und wird
// ebenso geklammert.
//
// **Das Ergebnis muss den Parser bestehen**; sonst liefert die Funktion null,
// und der Aufrufer zeigt einen Hinweis statt einer falschen Menge.
//
// Der Vergleich eines Verweis-Feldes mit Text folgt Festlegung 8 des Epics
// 3E-000258 (`recordRefEquals`: die Kennung gewinnt); eine neue Syntax braucht
// es nicht. Prozess-neutral (kein Electron, kein DOM).
'use strict';

const { parseQuery, tokenize } = require('./perspective-query.js');

// Die Klausel-Wörter der obersten Ebene (`CLAUSE_KEYWORDS` des Parsers ohne
// die Typ-Wörter am Anfang). Eine `WHERE`-Klausel endet am nächsten von ihnen.
const KLAUSELN = new Set([
  'FROM',
  'WHERE',
  'SORT',
  'LIMIT',
  'COLUMNS',
  'GROUP',
  'HIDE',
  'SHOW',
  'SHORT',
  'DISPLAY',
  'HAVING',
]);
const TYP_WOERTER = new Set(['LIST', 'TABLE']);

// Ein Feld-Name als Text der Abfrage; ein Name mit Zeichen außerhalb eines
// Wortes ließe sich nicht als Feld schreiben.
const FELD_NAME_RE = /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u;

// Die Klausel-Wörter der obersten Ebene mit ihrer Stelle im Text, außerhalb
// von Klammern und Anführungszeichen.
function klauselStellen(tokens) {
  const stellen = [];
  let tiefe = 0;
  for (const token of tokens) {
    if (token.type === '(') tiefe += 1;
    else if (token.type === ')') tiefe = Math.max(0, tiefe - 1);
    else if (tiefe === 0 && token.type === 'field') {
      const wort = String(token.value).toUpperCase();
      if (KLAUSELN.has(wort) || TYP_WOERTER.has(wort)) stellen.push({ wort, pos: token.pos });
    }
  }
  return stellen;
}

/**
 * Ergänzt eine Abfrage um die Bedingung `<feld> = "<kennung>"`.
 *
 * @param {string} query Der Text der Abfrage.
 * @param {string} feld Der Name des Verweis-Feldes.
 * @param {string} kennung Die Kennung des Kopf-Datensatzes.
 * @returns {string|null} Die ergänzte Abfrage, oder null, wenn sie sich nicht
 *   ergänzen lässt oder das Ergebnis den Parser nicht besteht.
 */
function ergaenzeBedingung(query, feld, kennung) {
  const text = typeof query === 'string' ? query.trim() : '';
  if (text === '' || typeof feld !== 'string' || !FELD_NAME_RE.test(feld)) return null;
  if (typeof kennung !== 'string' || kennung === '' || /["\n\r]/.test(kennung)) return null;
  const gelesen = tokenize(text);
  if (!gelesen || !gelesen.ok) return null;
  const bedingung = `${feld} = "${kennung}"`;
  const stellen = klauselStellen(gelesen.tokens);

  let ergebnis;
  if (stellen.length === 0 || stellen[0].pos !== gelesen.tokens[0].pos) {
    // Alt-Form: der ganze Text ist eine Bedingung.
    ergebnis = `(${text}) AND ${bedingung}`;
  } else {
    const where = stellen.findIndex((s) => s.wort === 'WHERE');
    if (where >= 0) {
      const anfang = stellen[where].pos + 'WHERE'.length;
      const naechste = stellen[where + 1];
      const ende = naechste ? naechste.pos : text.length;
      const alt = text.slice(anfang, ende).trim();
      const rest = text.slice(ende);
      ergebnis = `${text.slice(0, anfang)} (${alt}) AND ${bedingung}${rest ? ` ${rest}` : ''}`;
    } else {
      const folgende = stellen.find((s, i) => i > 0 && s.wort !== 'FROM');
      const stelle = folgende ? folgende.pos : text.length;
      const vorne = text.slice(0, stelle).trimEnd();
      const rest = text.slice(stelle);
      ergebnis = `${vorne} WHERE ${bedingung}${rest ? ` ${rest}` : ''}`;
    }
  }
  return parseQuery(ergebnis).ok ? ergebnis : null;
}

module.exports = { ergaenzeBedingung };
