'use strict';

// 4T-0401 (Epic 3E-0076): Parser und Evaluator der Perspective-Query-Sprache
// (`perspective-query`-Fence). Hervorgegangen aus frontmatter-query.js
// (4T-0354, Epic 3E-0065) und umbenannt, weil die Sprache seit dem Ausbau
// nicht mehr nur Frontmatter abfragt (Klauseln, implizite Datei-Felder,
// Quellen). Prozess-neutral (kein Electron, kein Renderer-DOM): parseQuery
// zerlegt den Fence-Body in einen Abfrage-AST oder einen strukturierten
// Syntaxfehler, evaluateQuery prüft eine Datei gegen den AST. Ausgewertet
// wird ausschließlich über diesen eigenen AST-Evaluator, nie über eval o. Ä.
//
// Grammatik (Klausel-Ebene, Schlüsselwörter case-insensitiv):
//   query      := [typeClause] clause*
//   typeClause := 'LIST' ['BLOCKS' | 'TASKS'] [expr]
//              | 'TABLE' ['BLOCKS' | 'TASKS'] ['WITHOUT' 'ID'] [column ( ',' column )*]
//   column     := expr [ 'AS' string ]
//   clause     := 'FROM' source | 'WHERE' boolExpr
//              | 'SORT' sortKey ( ',' sortKey )* | 'LIMIT' number
//              | 'COLUMNS' number
//              | 'GROUP' 'BY' expr ( ',' expr )*        (4T-0503; LIST TASKS)
//              | 'HIDE' element ( ',' element )*        (4T-0503; LIST TASKS)
//              | 'SHOW' element ( ',' element )*        (4T-0503; LIST TASKS)
//              | 'SHORT'                                (4T-0503; LIST TASKS)
//   sortKey    := expr [ 'ASC' | 'DESC' ]
//   source     := srcAnd ( 'OR' srcAnd )*
//   srcAnd     := srcUnary ( 'AND' srcUnary )*
//   srcUnary   := '-' srcUnary | '(' source ')' | srcAtom
//   srcAtom    := string             (Ordner, relativ zur Abfrage-Wurzel)
//              | tag                 (#tag)
//              | link                ([[Datei]]: Dateien, die auf X verlinken;
//                                     [[]] leer: auf die Träger-Datei, 4T-1070)
//              | 'outgoing' '(' link ')'  (Dateien, auf die X verlinkt;
//                                     outgoing([[]]): auf die die Träger-Datei
//                                     verlinkt, 4T-1070)
//
// Grammatik (Ausdrucks-Ebene, Präzedenz NOT > AND > OR, Vergleich > Arithmetik):
//   expr       := orExpr
//   orExpr     := andExpr ( 'OR' andExpr )*
//   andExpr    := notExpr ( 'AND' notExpr )*
//   notExpr    := 'NOT' notExpr | comparison
//   comparison := additive [ ('=' | '!=' | '<' | '<=' | '>' | '>=') additive
//                          | 'IN' '(' exprList ')' | 'NOT' 'IN' '(' exprList ')' ]
//   additive   := multiplicative ( ('+' | '-') multiplicative )*
//   multiplicative := unary ( ('*' | '/') unary )*
//   unary      := '-' unary | primary
//   primary    := '(' expr ')' | string | number | dateLit | durLit
//              | word '(' [exprList] ')'   (Funktions-Aufruf)
//              | word                      (Feld-Pfad, z. B. file.mtime)
//   dateLit    := 'date' '(' (relWort | JJJJ-MM-TT[THH:MM[:SS]]) ')'
//   relWort    := 'today' | 'now' | 'tomorrow' | 'yesterday'
//              | 'sow' | 'eow' | 'som' | 'eom' | 'soy' | 'eoy'
//   durLit     := 'dur' '(' ( zahl einheit )+ ')'
//
// Abwärtskompatibilität: Beginnt der Body mit keinem Klausel-Schlüsselwort
// (oder mit einem, dem direkt ein Vergleichsoperator folgt — dann ist es ein
// Feldname), wird der gesamte Body wie bisher als Bedingung geparst und als
// `LIST WHERE <ausdruck>` interpretiert. In boolescher Position (WHERE bzw.
// Alt-Ausdruck) muss ein nacktes Feld weiterhin einen Vergleich tragen
// (expectedOperator wie bisher); Funktions-Aufrufe sind als boolesches Blatt
// erlaubt. Feldnamen dürfen wie bisher '.', '-' und Unicode-Buchstaben
// enthalten ('parent-categories', 'file.mtime' sind EIN Wort); die neuen
// Operator-Zeichen (< > + * /) trennen Wörter, brauchen zwischen Feldnamen
// also Leerzeichen ('a - 1', nicht 'a-1' — Letzteres ist ein Feldname).
//
// Feldnamen und String-Werte werden case-insensitiv verglichen. Die
// reservierten Wörter AND, OR, NOT, IN können nicht als Feldnamen dienen;
// die Klausel-Schlüsselwörter (LIST, TABLE, FROM, WHERE, SORT, LIMIT,
// COLUMNS) nur dann nicht, wenn die Abfrage in Klausel-Form steht und das
// Wort am Anfang eines Klausel-Ausdrucks stünde.
//
// Die Auswertung (Typ-System, implizite file.*-Felder, Funktions-Katalog,
// FROM-Quellen) liegt seit 4T-0402 im Schwester-Modul perspective-query-eval.js.
// Die Alt-Semantik (eq/neq/in/notin über Properties, case-insensitiv, Listen
// als Mitgliedschaft) bleibt dort identisch erhalten.

// --- Tokenizer ---------------------------------------------------------------

const KEYWORDS = new Set(['AND', 'OR', 'NOT', 'IN']);
// 4T-0503 (Epic 3E-0096): GROUP/HIDE/SHOW/SHORT sind Klausel-Schluesselwoerter
// der Task-Ausgabe. Folge der bestehenden Kontext-Regel: gleichnamige Felder
// sind am Anfang einer Klausel-Position nicht mehr erreichbar (dokumentierte
// Einschraenkung, wie bei den uebrigen Klausel-Woertern).
const CLAUSE_KEYWORDS = new Set([
  'LIST',
  'TABLE',
  'FROM',
  'WHERE',
  'SORT',
  'LIMIT',
  'COLUMNS',
  'GROUP',
  'HIDE',
  'SHOW',
  'SHORT',
]);

// 4T-0503 (Epic 3E-0096): kuratierter Element-Katalog der HIDE/SHOW-Klauseln
// (Task-Layout). Marker-Elemente plus Ausgabe-Bausteine; 'urgency' (4T-0505)
// sowie 'edit' und 'postpone' (4T-0504) sind bereits reserviert und werden
// mit ihren Tasks wirksam.
const LAYOUT_ELEMENTS = new Set([
  'due',
  'scheduled',
  'start',
  'created',
  'done',
  'cancelled',
  'priority',
  'recurrence',
  'id',
  'dependson',
  'tags',
  'backlink',
  'count',
  'urgency',
  'edit',
  'postpone',
]);

// Wort-Lauf: erstes Zeichen Buchstabe/Ziffer/Unterstrich, danach zusätzlich
// '.' und '-'. Bewusst so gewählt, dass bestehende Feldnamen mit Bindestrich
// und Punkt (parent-categories, file.mtime) EIN Token bleiben (Kompatibilität
// zur alten Wort-Grenze, die nur an [\s(),=!'"] trennte).
const WORD_RE = /[\p{L}\p{N}_][\p{L}\p{N}_.-]*/uy;
// Reiner Zahl-Lauf (Klassifikation nach dem Wort-Scan): 12, 4.5.
const NUMBER_RE = /^\d+(\.\d+)?$/;
// Tag-Zeichen nach '#': wie TAG_RE des Backlinks-Index (Buchstaben, Ziffern,
// '_', '/', '-'), damit FROM #projekt/unter dieselben Tags trifft.
const TAG_CHARS_RE = /[\p{L}\p{N}_/-]+/uy;

// Datums-Literal-Inhalt: JJJJ-MM-TT, optional mit Uhrzeit (T oder Leerzeichen
// als Trenner, Sekunden optional). Zeitzonen-Angaben sind bewusst außen vor;
// die Abfrage rechnet in lokaler Zeit der Datei-Zeitstempel.
const DATE_CONTENT_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/;

// 4T-0502 (Epic 3E-0096): relative Datums-Wörter der date(...)-Literale.
// Start-Wörter (today, tomorrow, yesterday, sow, som, soy) liefern 00:00
// des Tages, End-Wörter (eow, eom, eoy) das Tages-Ende — Bereichs-Filter
// wie `due <= date(eow)` schließen den letzten Tag damit vollständig ein.
// Die Auswertung liegt im Evaluator (relativeDateMs).
const RELATIVE_DATE_WORDS = new Set([
  'today',
  'now',
  'tomorrow',
  'yesterday',
  'sow',
  'eow',
  'som',
  'eom',
  'soy',
  'eoy',
]);

// Dauer-Einheiten -> Millisekunden. Monate und Jahre sind bewusst fixe
// Näherungen (30 bzw. 365 Tage), damit eine Dauer ein Skalar bleibt und
// Vergleiche/Arithmetik deterministisch sind (dokumentierte Vereinfachung).
const DUR_UNITS = new Map([
  ['s', 1000],
  ['sec', 1000],
  ['secs', 1000],
  ['second', 1000],
  ['seconds', 1000],
  ['m', 60 * 1000],
  ['min', 60 * 1000],
  ['mins', 60 * 1000],
  ['minute', 60 * 1000],
  ['minutes', 60 * 1000],
  ['h', 60 * 60 * 1000],
  ['hr', 60 * 60 * 1000],
  ['hrs', 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['hours', 60 * 60 * 1000],
  ['d', 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['days', 24 * 60 * 60 * 1000],
  ['w', 7 * 24 * 60 * 60 * 1000],
  ['wk', 7 * 24 * 60 * 60 * 1000],
  ['wks', 7 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['weeks', 7 * 24 * 60 * 60 * 1000],
  ['mo', 30 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['months', 30 * 24 * 60 * 60 * 1000],
  ['y', 365 * 24 * 60 * 60 * 1000],
  ['yr', 365 * 24 * 60 * 60 * 1000],
  ['yrs', 365 * 24 * 60 * 60 * 1000],
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['years', 365 * 24 * 60 * 60 * 1000],
]);

// 4T-0425 (Epic 3E-0080): Dauer-Inhalt ('7d', '1d 2h', '90 minutes') →
// Millisekunden oder null (ungültige Einheit, keine Gruppe, Fremd-Zeichen).
// Gemeinsamer Kern des dur-Literals und der Datums-Offsets der Vorlagen-
// Platzhalter (Architekturentscheidung 5 des Epics: der Einheiten-Katalog
// der Query-Sprache ist die eine Quelle, keine zweite Datums-Bibliothek).
function parseDurationContent(content) {
  const src = String(content == null ? '' : content);
  const groupRe = /(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/g;
  let ms = 0;
  let matchedLen = 0;
  let m;
  while ((m = groupRe.exec(src)) !== null) {
    const unit = DUR_UNITS.get(m[2].toLowerCase());
    if (unit === undefined) return null;
    ms += parseFloat(m[1]) * unit;
    matchedLen += m[0].length;
  }
  // Vollständigkeit: außer den Gruppen dürfen nur Trennzeichen übrig sein.
  const residue = src.replace(groupRe, '').replace(/[\s,]/g, '');
  if (ms === 0 || matchedLen === 0 || residue.length > 0) return null;
  return ms;
}

function tokenError(code, message, pos) {
  return { ok: false, error: { code, message, pos } };
}

function tokenize(input) {
  const src = String(input || '');
  const tokens = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    // Whitespace (inkl. Zeilenumbrüche) trennt nur und wird verworfen —
    // die Klausel-Zerlegung ist dadurch zeilen-tolerant.
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (
      c === '(' ||
      c === ')' ||
      c === ',' ||
      c === '=' ||
      c === '+' ||
      c === '*' ||
      c === '/' ||
      c === '-'
    ) {
      tokens.push({ type: c, pos: i });
      i++;
      continue;
    }
    if (c === '!') {
      if (src[i + 1] === '=') {
        tokens.push({ type: '!=', pos: i });
        i += 2;
        continue;
      }
      return tokenError('unexpectedChar', `Unerwartetes Zeichen '!' an Position ${i}`, i);
    }
    if (c === '<' || c === '>') {
      if (src[i + 1] === '=') {
        tokens.push({ type: c + '=', pos: i });
        i += 2;
      } else {
        tokens.push({ type: c, pos: i });
        i++;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let val = '';
      while (j < n && src[j] !== quote) {
        val += src[j];
        j++;
      }
      if (j >= n) {
        return tokenError(
          'unterminatedString',
          `Nicht geschlossenes Anführungszeichen ab Position ${i}`,
          i,
        );
      }
      tokens.push({ type: 'string', value: val, pos: i });
      i = j + 1;
      continue;
    }
    // Tag-Quelle für FROM: '#name'.
    if (c === '#') {
      TAG_CHARS_RE.lastIndex = i + 1;
      const m = TAG_CHARS_RE.exec(src);
      if (!m) {
        return tokenError('unexpectedChar', `Unerwartetes Zeichen '#' an Position ${i}`, i);
      }
      tokens.push({ type: 'tag', value: m[0], pos: i });
      i = i + 1 + m[0].length;
      continue;
    }
    // Link-Quelle für FROM: '[[Ziel]]'.
    if (c === '[') {
      if (src[i + 1] !== '[') {
        return tokenError('unexpectedChar', `Unerwartetes Zeichen '[' an Position ${i}`, i);
      }
      const close = src.indexOf(']]', i + 2);
      if (close < 0) {
        return tokenError('unterminatedLink', `Nicht geschlossener Wiki-Link ab Position ${i}`, i);
      }
      tokens.push({ type: 'link', value: src.slice(i + 2, close).trim(), pos: i });
      i = close + 2;
      continue;
    }
    // Wort: Feldname, Keyword oder (nach Klassifikation) Zahl.
    WORD_RE.lastIndex = i;
    const wm = WORD_RE.exec(src);
    if (!wm) {
      return tokenError('unexpectedChar', `Unerwartetes Zeichen '${c}' an Position ${i}`, i);
    }
    const word = wm[0];
    const after = i + word.length;
    if (NUMBER_RE.test(word)) {
      tokens.push({ type: 'number', value: parseFloat(word), pos: i });
      i = after;
      continue;
    }
    const lower = word.toLowerCase();
    // date(...)/dur(...) sind Literal-Formen: der Inhalt bis zur schließenden
    // Klammer wird roh eingefangen, weil '2026-07-08' und '7 days' keine
    // regulären Token-Folgen sind (Arithmetik-Minus bzw. Zahl+Wort).
    if ((lower === 'date' || lower === 'dur') && src[after] === '(') {
      const close = src.indexOf(')', after + 1);
      if (close < 0) {
        return tokenError(
          'expectedParen',
          `Fehlende schließende Klammer für ${lower}(…) ab Position ${i}`,
          i,
        );
      }
      tokens.push({
        type: lower === 'date' ? 'datelit' : 'durlit',
        value: src.slice(after + 1, close).trim(),
        pos: i,
      });
      i = close + 1;
      continue;
    }
    const upper = word.toUpperCase();
    if (KEYWORDS.has(upper)) {
      tokens.push({ type: upper, pos: i });
    } else {
      tokens.push({ type: 'field', value: word, pos: i });
    }
    i = after;
  }
  return { ok: true, tokens };
}

function describeToken(t) {
  if (!t) return 'Ende';
  if (t.type === 'field') return t.value;
  if (t.type === 'string') return `"${t.value}"`;
  if (t.type === 'number') return String(t.value);
  if (t.type === 'tag') return `#${t.value}`;
  if (t.type === 'link') return `[[${t.value}]]`;
  return t.type;
}

// Knoten-Typen, die in boolescher Position (WHERE, Alt-Body) ohne weiteren
// Vergleich stehen dürfen.
const BOOL_NODE_TYPES = new Set(['or', 'and', 'not', 'cmp', 'inlist', 'call']);

// Vergleichsoperator-Token -> AST-Op.
const CMP_OPS = new Map([
  ['=', 'eq'],
  ['!=', 'neq'],
  ['<', 'lt'],
  ['<=', 'le'],
  ['>', 'gt'],
  ['>=', 'ge'],
]);

// Prüft, ob ein Token ein Klausel-Schlüsselwort ist (Wort-Token, dessen
// Großschreibung in CLAUSE_KEYWORDS liegt).
function clauseKeywordOf(t) {
  if (!t || t.type !== 'field') return null;
  const upper = t.value.toUpperCase();
  return CLAUSE_KEYWORDS.has(upper) ? upper : null;
}

// Kontextuelles Wort (AS, ASC, DESC, WITHOUT, ID, OUTGOING) case-insensitiv.
function isWord(t, upper) {
  return !!t && t.type === 'field' && t.value.toUpperCase() === upper;
}

// --- Parser (rekursiver Abstieg) ---------------------------------------------

// Liefert { ok: true, ast } oder { ok: false, error: { code, message, pos, … } }.
// ast ist immer ein Abfrage-Knoten { type: 'list'|'table', scope, fields,
// withoutId, source, where, sort, limit, layoutColumns }; ein Alt-Body (nackter
// Ausdruck) wird als LIST WHERE <ausdruck> geliefert. pos ist der 0-basierte
// Zeichen-Offset im Body (-1 bei unerwartetem Ende).
//
// 4T-0409 (Epic 3E-0077): scope ist 'files' (Default) oder 'blocks' — das
// kontextuelle Wort BLOCKS direkt nach LIST/TABLE schaltet die Abfrage auf die
// Block-Ebene um (Architekturentscheidung des Epics: gleicher Fence, gleiche
// Sprache, Scope-Zusatz am Ausgabe-Typ). Folge der Kontext-Regel: ein
// LIST-Zusatzfeld bzw. eine erste Spalte mit dem nackten Namen 'blocks' ist in
// Scope-Position nicht erreichbar (dokumentierte Einschraenkung; als Ausweg
// traegt z. B. ein umschliessender Ausdruck wie string(blocks)).
// 4T-0502 (Epic 3E-0096): dritter Scope 'tasks' ueber das kontextuelle Wort
// TASKS nach identischem Muster (Weg A des Konzept-Workshops: Task-Abfragen
// als Scope der einen Sprache, keine zweite Abfrage-Sprache); dieselbe
// Kontext-Einschraenkung gilt fuer den nackten Namen 'tasks'.
function parseQuery(input, opts) {
  const tk = tokenize(input);
  if (!tk.ok) return tk;
  const tokens = tk.tokens;
  if (tokens.length === 0) {
    return { ok: false, error: { code: 'empty', message: 'Leere Abfrage', pos: 0 } };
  }

  let pos = 0;
  let error = null;
  const atEnd = () => pos >= tokens.length;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  function fail(code, message, p, extra) {
    if (!error) {
      error = { code, message, pos: typeof p === 'number' ? p : atEnd() ? -1 : peek().pos };
      if (extra) Object.assign(error, extra);
    }
    return null;
  }

  // --- Ausdrucks-Ebene ---
  // boolCtx steuert die Blatt-Regel: in boolescher Position (WHERE, Alt-Body)
  // muss ein Blatt ein Vergleich oder ein Funktions-Aufruf sein (nackte Felder
  // melden wie bisher expectedOperator); in Wert-Position (Spalten, SORT,
  // LIST-Zusatzfeld) sind nackte Felder und Literale erlaubt.
  function parseExpr(boolCtx) {
    return parseOr(boolCtx);
  }
  function parseOr(boolCtx) {
    let left = parseAnd(boolCtx);
    if (left === null) return null;
    while (!atEnd() && peek().type === 'OR') {
      next();
      const right = parseAnd(boolCtx);
      if (right === null) return null;
      left = { type: 'or', left, right };
    }
    return left;
  }
  function parseAnd(boolCtx) {
    let left = parseNot(boolCtx);
    if (left === null) return null;
    while (!atEnd() && peek().type === 'AND') {
      next();
      const right = parseNot(boolCtx);
      if (right === null) return null;
      left = { type: 'and', left, right };
    }
    return left;
  }
  function parseNot(boolCtx) {
    if (!atEnd() && peek().type === 'NOT') {
      next();
      const operand = parseNot(boolCtx);
      if (operand === null) return null;
      return { type: 'not', operand };
    }
    return parseComparison(boolCtx);
  }
  function parseComparison(boolCtx) {
    const left = parseAdditive();
    if (left === null) return null;
    if (!atEnd()) {
      const t = peek();
      const op = CMP_OPS.get(t.type);
      if (op) {
        next();
        // Historischer Fehler-Code: nach einem Vergleichsoperator am Body-Ende
        // meldet der Parser expectedValue (nicht unexpectedEnd).
        if (atEnd()) return fail('expectedValue', 'Wert nach Vergleichsoperator erwartet');
        const right = parseAdditive();
        if (right === null) return null;
        return { type: 'cmp', op, left, right };
      }
      if (t.type === 'IN' || t.type === 'NOT') {
        let inOp = 'in';
        if (t.type === 'NOT') {
          next();
          if (atEnd() || peek().type !== 'IN') {
            return fail('expectedIn', "'IN' nach 'NOT' erwartet");
          }
          inOp = 'notin';
        }
        next(); // IN
        const values = parseValueList();
        if (values === null) return null;
        return { type: 'inlist', op: inOp, left, values };
      }
    }
    // Kein Vergleich: in boolescher Position sind nur boolesch-fähige Blätter
    // gültig — Funktions-Aufrufe (WHERE contains(tags, "rot")) und geklammerte
    // boolesche Gruppen ((a = "1" OR b = "2") AND …); nackte Felder und Wert-
    // Literale melden wie bisher expectedOperator.
    if (boolCtx && !BOOL_NODE_TYPES.has(left.type)) {
      return fail('expectedOperator', 'Vergleichsoperator erwartet');
    }
    return left;
  }
  function parseAdditive() {
    let left = parseMultiplicative();
    if (left === null) return null;
    while (!atEnd() && (peek().type === '+' || peek().type === '-')) {
      const op = next().type === '+' ? 'add' : 'sub';
      const right = parseMultiplicative();
      if (right === null) return null;
      left = { type: 'arith', op, left, right };
    }
    return left;
  }
  function parseMultiplicative() {
    let left = parseUnary();
    if (left === null) return null;
    while (!atEnd() && (peek().type === '*' || peek().type === '/')) {
      const op = next().type === '*' ? 'mul' : 'div';
      const right = parseUnary();
      if (right === null) return null;
      left = { type: 'arith', op, left, right };
    }
    return left;
  }
  function parseUnary() {
    if (!atEnd() && peek().type === '-') {
      next();
      const operand = parseUnary();
      if (operand === null) return null;
      return { type: 'neg', operand };
    }
    return parsePrimary();
  }
  function parsePrimary() {
    if (atEnd()) return fail('unexpectedEnd', 'Unerwartetes Ende der Abfrage');
    const t = peek();
    if (t.type === '(') {
      next();
      // Geklammerte Teilausdrücke dürfen auch boolesch sein ((a = "1" OR b = "2")).
      const inner = parseExpr(false);
      if (inner === null) return null;
      if (atEnd() || peek().type !== ')') {
        return fail('expectedParen', 'Fehlende schließende Klammer');
      }
      next();
      return inner;
    }
    if (t.type === 'string') {
      next();
      return { type: 'str', value: t.value };
    }
    if (t.type === 'number') {
      next();
      return { type: 'num', value: t.value };
    }
    if (t.type === 'datelit') {
      next();
      return parseDateLiteral(t);
    }
    if (t.type === 'durlit') {
      next();
      return parseDurLiteral(t);
    }
    if (t.type === 'field') {
      const fieldTok = next();
      if (!atEnd() && peek().type === '(') {
        next();
        const args = [];
        if (!atEnd() && peek().type !== ')') {
          const first = parseExpr(false);
          if (first === null) return null;
          args.push(first);
          while (!atEnd() && peek().type === ',') {
            next();
            const arg = parseExpr(false);
            if (arg === null) return null;
            args.push(arg);
          }
        }
        if (atEnd() || peek().type !== ')') {
          return fail('expectedParen', 'Fehlende schließende Klammer im Funktions-Aufruf');
        }
        next();
        return { type: 'call', name: fieldTok.value.toLowerCase(), args, pos: fieldTok.pos };
      }
      return { type: 'field', name: fieldTok.value };
    }
    return fail('unexpectedToken', `Unerwartetes Token '${describeToken(t)}'`, t.pos);
  }
  function parseValueList() {
    if (atEnd() || peek().type !== '(') return fail('expectedParen', "'(' nach IN erwartet");
    next();
    const values = [];
    if (!atEnd() && peek().type !== ')') {
      const first = parseExpr(false);
      if (first === null) return null;
      values.push(first);
      while (!atEnd() && peek().type === ',') {
        next();
        if (atEnd()) return fail('expectedValue', 'Wert nach Komma erwartet');
        const v = parseExpr(false);
        if (v === null) return null;
        values.push(v);
      }
    }
    if (atEnd() || peek().type !== ')') {
      return fail('expectedParen', 'Fehlende schließende Klammer in Werteliste');
    }
    next();
    if (values.length === 0) return fail('emptyList', 'Leere Werteliste');
    return values;
  }

  // Datums-Literal validieren. Erlaubt: relative Wörter (today, now sowie
  // seit 4T-0502 tomorrow, yesterday und die Perioden-Grenzen sow/eow/som/
  // eom/soy/eoy — Woche ab Montag, konsistent zur ISO-KW des Evaluators)
  // und JJJJ-MM-TT[THH:MM[:SS]]; ein umschließendes Anführungszeichen-Paar
  // wird toleriert (date("2026-01-01")).
  function parseDateLiteral(tok) {
    let content = tok.value;
    const quoted = /^"(.*)"$/.exec(content) || /^'(.*)'$/.exec(content);
    if (quoted) content = quoted[1].trim();
    const lower = content.toLowerCase();
    if (RELATIVE_DATE_WORDS.has(lower)) {
      return { type: 'date', value: lower };
    }
    if (DATE_CONTENT_RE.test(content)) {
      return { type: 'date', value: content.replace(' ', 'T') };
    }
    return fail('invalidDate', `Ungültiges Datums-Literal '${tok.value}'`, tok.pos);
  }

  // Dauer-Literal validieren: eine oder mehrere "<Zahl> <Einheit>"-Gruppen.
  // Kern in parseDurationContent (gemeinsame Quelle mit den Datums-Offsets
  // der Vorlagen-Platzhalter, 4T-0425).
  function parseDurLiteral(tok) {
    let content = tok.value;
    const quoted = /^"(.*)"$/.exec(content) || /^'(.*)'$/.exec(content);
    if (quoted) content = quoted[1].trim();
    const ms = parseDurationContent(content);
    if (ms === null) {
      return fail('invalidDuration', `Ungültiges Dauer-Literal '${tok.value}'`, tok.pos);
    }
    return { type: 'dur', ms };
  }

  // --- Quellen-Ebene (FROM) ---
  function parseSource() {
    let left = parseSourceAnd();
    if (left === null) return null;
    while (!atEnd() && peek().type === 'OR') {
      next();
      const right = parseSourceAnd();
      if (right === null) return null;
      left = { type: 'srcOr', left, right };
    }
    return left;
  }
  function parseSourceAnd() {
    let left = parseSourceUnary();
    if (left === null) return null;
    while (!atEnd() && peek().type === 'AND') {
      next();
      const right = parseSourceUnary();
      if (right === null) return null;
      left = { type: 'srcAnd', left, right };
    }
    return left;
  }
  function parseSourceUnary() {
    if (atEnd()) return fail('expectedSource', 'Quelle nach FROM erwartet');
    const t = peek();
    if (t.type === '-') {
      next();
      const operand = parseSourceUnary();
      if (operand === null) return null;
      return { type: 'srcNot', operand };
    }
    if (t.type === '(') {
      next();
      const inner = parseSource();
      if (inner === null) return null;
      if (atEnd() || peek().type !== ')') {
        return fail('expectedParen', 'Fehlende schließende Klammer in FROM');
      }
      next();
      return inner;
    }
    if (t.type === 'string') {
      next();
      return { type: 'srcFolder', value: t.value };
    }
    if (t.type === 'tag') {
      next();
      return { type: 'srcTag', value: t.value };
    }
    if (t.type === 'link') {
      next();
      // 4T-1070 (Epic 3E-0211): Der LEERE Wiki-Link ist die Selbstbezugs-
      // Quelle — 'Dateien, die auf die Traeger-Datei verlinken'. Die Form war
      // bis hierher ein Syntaxfehler und ist damit frei; sie ist zugleich der
      // Wortlaut des Bestands, aus dem konvertiert wird (Konzept-Entscheid E2).
      if (!t.value) return { type: 'srcSelf', mode: 'in' };
      return { type: 'srcLink', target: t.value, mode: 'in' };
    }
    if (isWord(t, 'OUTGOING')) {
      next();
      if (atEnd() || peek().type !== '(') {
        return fail('expectedParen', "'(' nach outgoing erwartet");
      }
      next();
      if (atEnd() || peek().type !== 'link') {
        return fail('expectedSource', 'Wiki-Link in outgoing(…) erwartet');
      }
      const linkTok = next();
      if (atEnd() || peek().type !== ')') {
        return fail('expectedParen', 'Fehlende schließende Klammer nach outgoing(…)');
      }
      next();
      // 4T-1070 (Epic 3E-0211): outgoing([[]]) ist die Gegenrichtung des
      // Selbstbezugs — 'Dateien, auf die die Traeger-Datei verlinkt'.
      if (!linkTok.value) return { type: 'srcSelf', mode: 'out' };
      return { type: 'srcLink', target: linkTok.value, mode: 'out' };
    }
    return fail('expectedSource', `Ungültige Quelle '${describeToken(t)}' in FROM`, t.pos);
  }

  // 4T-0421 (Epic 3E-0079): Ausdrucks-Modus — parst den Body als EINEN
  // Wert-Ausdruck (Spalten-Formeln der Perspective Datatable). Gleiches
  // Token-, AST- und Fehler-Modell wie die Abfrage; kein Klausel-Parsing,
  // nackte Felder und Arithmetik erlaubt (Wert-Position).
  if (opts && opts.expression) {
    const node = parseExpr(false);
    if (node === null) {
      return { ok: false, error: error || { code: 'syntax', message: 'Syntaxfehler', pos: -1 } };
    }
    if (!atEnd()) {
      return {
        ok: false,
        error: {
          code: 'trailing',
          message: 'Unerwarteter Text nach dem Ausdruck',
          pos: peek().pos,
        },
      };
    }
    return { ok: true, ast: node };
  }

  // --- Klausel-Ebene ---
  const query = {
    type: 'list',
    // 4T-0409/4T-0502: Auswertungs-Ebene 'files' | 'blocks' | 'tasks'.
    scope: 'files',
    fields: [],
    withoutId: false,
    source: null,
    where: null,
    sort: [],
    limit: null,
    layoutColumns: null,
    // 4T-0503 (Epic 3E-0096): Gruppierung und Task-Layout (LIST TASKS).
    groupBy: [],
    hide: [],
    show: [],
    short: false,
  };

  // Abwärtskompatibilität: Klausel-Form nur, wenn das erste Token ein Klausel-
  // Schlüsselwort ist, dem KEIN Vergleichsoperator folgt (sonst ist es ein
  // Alt-Feldname wie in `limit = "3"` oder `sort IN (…)`).
  const firstClause = clauseKeywordOf(tokens[0]);
  const second = tokens[1];
  const legacyLookahead =
    second &&
    (CMP_OPS.has(second.type) ||
      second.type === 'IN' ||
      (second.type === 'NOT' && tokens[2] && tokens[2].type === 'IN'));
  if (!firstClause || legacyLookahead) {
    const where = parseExpr(true);
    if (where === null) {
      return { ok: false, error: error || { code: 'syntax', message: 'Syntaxfehler', pos: -1 } };
    }
    if (!atEnd()) {
      const t = peek();
      return {
        ok: false,
        error: {
          code: 'trailing',
          message: `Unerwartetes Token '${describeToken(t)}' nach Abfrage`,
          pos: t.pos,
        },
      };
    }
    query.where = where;
    return { ok: true, ast: query };
  }

  // Klausel-Schleife. Jede Klausel höchstens einmal; LIST/TABLE nur als erste.
  const seen = new Set();
  let clauseCount = 0;
  while (!atEnd()) {
    const clause = clauseKeywordOf(peek());
    if (!clause) {
      const t = peek();
      fail('unknownClause', `Klausel erwartet, '${describeToken(t)}' gefunden`, t.pos);
      break;
    }
    if (seen.has(clause) || ((clause === 'LIST' || clause === 'TABLE') && seen.has('TYPE'))) {
      fail('duplicateClause', `Klausel '${clause}' doppelt`, peek().pos, { clause });
      break;
    }
    if ((clause === 'LIST' || clause === 'TABLE') && clauseCount > 0) {
      fail('misplacedType', `'${clause}' muss die erste Klausel sein`, peek().pos, { clause });
      break;
    }
    next();
    clauseCount++;
    seen.add(clause === 'LIST' || clause === 'TABLE' ? 'TYPE' : clause);

    if (clause === 'LIST') {
      query.type = 'list';
      // 4T-0409 (Epic 3E-0077): Scope-Zusatz BLOCKS (kontextuelles Wort).
      // 4T-0502 (Epic 3E-0096): Scope-Zusatz TASKS nach demselben Muster.
      if (!atEnd() && isWord(peek(), 'BLOCKS')) {
        next();
        query.scope = 'blocks';
      } else if (!atEnd() && isWord(peek(), 'TASKS')) {
        next();
        query.scope = 'tasks';
      }
      // Optionales Zusatzfeld: nur wenn kein Klausel-Schlüsselwort folgt.
      if (!atEnd() && !clauseKeywordOf(peek())) {
        const expr = parseExpr(false);
        if (expr === null) break;
        query.fields.push({ expr, alias: null });
      }
    } else if (clause === 'TABLE') {
      query.type = 'table';
      // 4T-0409 (Epic 3E-0077): Scope-Zusatz BLOCKS vor WITHOUT ID.
      // 4T-0502 (Epic 3E-0096): Scope-Zusatz TASKS nach demselben Muster.
      if (!atEnd() && isWord(peek(), 'BLOCKS')) {
        next();
        query.scope = 'blocks';
      } else if (!atEnd() && isWord(peek(), 'TASKS')) {
        next();
        query.scope = 'tasks';
      }
      if (!atEnd() && isWord(peek(), 'WITHOUT')) {
        next();
        if (atEnd() || !isWord(peek(), 'ID')) {
          fail('expectedId', "'ID' nach WITHOUT erwartet");
          break;
        }
        next();
        query.withoutId = true;
      }
      // Spalten-Liste (optional; ohne Spalten bleibt nur die Datei-Spalte).
      if (!atEnd() && !clauseKeywordOf(peek())) {
        for (;;) {
          const expr = parseExpr(false);
          if (expr === null) break;
          let alias = null;
          if (!atEnd() && isWord(peek(), 'AS')) {
            next();
            if (atEnd() || peek().type !== 'string') {
              fail('expectedAlias', 'Spalten-Titel als Zeichenkette nach AS erwartet');
              break;
            }
            alias = next().value;
          }
          query.fields.push({ expr, alias });
          if (atEnd() || peek().type !== ',') break;
          next();
          if (atEnd() || clauseKeywordOf(peek())) {
            fail('expectedColumn', 'Spalte nach Komma erwartet');
            break;
          }
        }
        if (error) break;
      }
    } else if (clause === 'FROM') {
      const source = parseSource();
      if (source === null) break;
      query.source = source;
    } else if (clause === 'WHERE') {
      const where = parseExpr(true);
      if (where === null) break;
      query.where = where;
    } else if (clause === 'SORT') {
      for (;;) {
        if (atEnd() || clauseKeywordOf(peek())) {
          fail('expectedField', 'Sortier-Feld erwartet');
          break;
        }
        const key = parseExpr(false);
        if (key === null) break;
        let dir = 'asc';
        if (!atEnd() && (isWord(peek(), 'ASC') || isWord(peek(), 'DESC'))) {
          dir = next().value.toLowerCase();
        }
        query.sort.push({ key, dir });
        if (atEnd() || peek().type !== ',') break;
        next();
      }
      if (error) break;
    } else if (clause === 'LIMIT') {
      if (atEnd() || peek().type !== 'number') {
        fail('expectedNumber', 'Zahl nach LIMIT erwartet');
        break;
      }
      const numTok = next();
      if (!Number.isInteger(numTok.value) || numTok.value < 0) {
        fail('invalidLimit', `Ungültiges LIMIT '${numTok.value}'`, numTok.pos);
        break;
      }
      query.limit = numTok.value;
    } else if (clause === 'COLUMNS') {
      if (atEnd() || peek().type !== 'number') {
        fail('expectedNumber', 'Zahl nach COLUMNS erwartet');
        break;
      }
      const numTok = next();
      if (!Number.isInteger(numTok.value) || numTok.value < 1 || numTok.value > 8) {
        fail('invalidColumns', `Ungültige Spalten-Zahl '${numTok.value}' (1–8)`, numTok.pos);
        break;
      }
      query.layoutColumns = numTok.value;
    } else if (clause === 'GROUP') {
      // 4T-0503 (Epic 3E-0096): GROUP BY expr (, expr)* — mehrstufige
      // Gruppierung (verschachtelte Gruppen-Ueberschriften). Generisch
      // geparst; die Aktivierungs-Grenze (nur LIST TASKS in dieser Stufe)
      // liegt bewusst in der Auswertung, damit die Klausel spaeter auch
      // Datei- und Block-Scope tragen kann (Epic-Risiko-Punkt).
      if (atEnd() || !isWord(peek(), 'BY')) {
        fail('expectedBy', "'BY' nach GROUP erwartet");
        break;
      }
      next();
      for (;;) {
        if (atEnd() || clauseKeywordOf(peek())) {
          fail('expectedField', 'Gruppierungs-Feld erwartet');
          break;
        }
        const key = parseExpr(false);
        if (key === null) break;
        query.groupBy.push(key);
        if (atEnd() || peek().type !== ',') break;
        next();
      }
      if (error) break;
    } else if (clause === 'HIDE' || clause === 'SHOW') {
      // 4T-0503: Element-Liste aus dem kuratierten Layout-Katalog.
      const target = clause === 'HIDE' ? query.hide : query.show;
      for (;;) {
        if (atEnd() || peek().type !== 'field' || clauseKeywordOf(peek())) {
          fail('expectedElement', `Layout-Element nach ${clause} erwartet`);
          break;
        }
        const tok = next();
        const name = tok.value.toLowerCase();
        if (!LAYOUT_ELEMENTS.has(name)) {
          fail('unknownLayoutElement', `Unbekanntes Layout-Element '${tok.value}'`, tok.pos, {
            name: tok.value,
          });
          break;
        }
        if (!target.includes(name)) target.push(name);
        if (atEnd() || peek().type !== ',') break;
        next();
      }
      if (error) break;
    } else if (clause === 'SHORT') {
      // 4T-0503: Kurz-Modus ohne Argumente.
      query.short = true;
    }
  }
  if (error) return { ok: false, error };
  return { ok: true, ast: query };
}

// --- Evaluator ---------------------------------------------------------------

// 4T-0402 (Epic 3E-0076): Typ-System, Funktions-Katalog und Kontext-Auflösung
// liegen im Schwester-Modul perspective-query-eval.js (eigenes Thema, eigener
// Leitwert-Rahmen). evaluateQuery wird hier für die Alt-Aufrufer re-exportiert
// (WHERE-Auswertung gegen eine reine Properties-Map, Alt-Semantik unverändert).
const { evaluateQuery } = require('./perspective-query-eval.js');

// 4T-0421 (Epic 3E-0079): Ausdrucks-Einstieg für die Spalten-Formeln der
// Perspective Datatable (ein Wert-Ausdruck, kein Klausel-Parsing).
function parseExpression(input) {
  return parseQuery(input, { expression: true });
}

module.exports = { parseQuery, parseExpression, evaluateQuery, tokenize, parseDurationContent };
