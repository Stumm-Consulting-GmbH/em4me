// 4T-002511 (Epic 3E-000402, Konzept 4T-002506 Abschnitt 2): die Platzhalter
// der Abfrage-Sprache, `$name`.
//
// **Was ein Platzhalter ist:** ein benannter Wert, den ein Filter eines
// Dashboards von außen setzt (Story «Filter am Kopf des Dashboards»). Er ist
// keine Variable der Sprache und kein Text-Baustein: Sein Wert wird nach dem
// Parsen im Hauptprozess als Zeichenketten-Literal in den Baum gesetzt
// (`bindePlatzhalter`) und nie als Abfrage-Text gelesen. Eine Text-Ersetzung
// öffnete den Weg, über einen Eigenschafts-Wert Abfrage-Syntax einzuschleusen.
//
// **Wo er stehen darf:** nur in `WHERE` und `HAVING`, dort an jeder
// Ausdrucks-Stelle (Operand eines Vergleichs, Element einer `IN`-Liste,
// Argument einer Funktion). Überall sonst ist er der Syntax-Fehler
// `placeholderPosition`, weil die Regel «alle» nur für Bedingungen definiert ist
// (`pruefePlatzhalter`, gerufen am einen Ausgang von `parseQuery`).
//
// **«alle»** ist der Wert `null`. Die kleinste Bedingung mit dem Platzhalter (ein
// Vergleich, eine `IN`-Liste oder ein Funktions-Aufruf in boolescher Stellung)
// wird durch den Knoten «erfüllt» (`{ type: 'always' }`) ersetzt; ein `NOT`
// unmittelbar darüber gehört zur Bedingung und wird mit ersetzt, `AND` und `OR`
// darüber rechnen normal. «alle» gilt auch für einen Namen, den der Aufrufer
// nicht kennt, und für jeden Aufrufer ohne Werte (Abfrage außerhalb eines
// Dashboards); beide Fälle melden einen Hinweis statt eines Fehlers.
//
// **Warum ein eigenes Modul:** Der Parser steht nahe an seinem eingefrorenen
// Größen-Wert; er bekommt allein den Zweig des Tokenizers, den Knoten und einen
// Aufruf, nach dem Muster der Angabe `DISPLAY` (`query-display.js`).
//
// Prozess-neutral (kein Electron, kein DOM), ohne Import.
'use strict';

// Name nach `$`: Buchstabe oder Unterstrich, danach auch Ziffern.
const NAME_RE = /[\p{L}_][\p{L}\p{N}_]*/uy;

// Der Knoten «erfüllt»; der Auswerter liefert für ihn `true`.
const ERFUELLT = Object.freeze({ type: 'always' });

// Token-Arten, nach denen ein Operand eines Ausdrucks beginnen kann.
const VOR_OPERAND = new Set([
  '(',
  ',',
  '=',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  '+',
  '-',
  '*',
  '/',
  'AND',
  'OR',
  'NOT',
]);

// Klausel-Wörter, in deren Ausdruck ein Platzhalter stehen darf.
const BEDINGUNGS_KLAUSELN = new Set(['WHERE', 'HAVING']);

/**
 * Liest einen Platzhalter ab dem `$` an Position `i`; ohne gültigen Namen danach
 * null, und der Tokenizer meldet wie bisher `unexpectedChar`.
 * @param {string} src
 * @param {number} i  Position des `$`
 * @returns {{ type: 'param', name: string, pos: number, ende: number }|null}
 */
function platzhalterToken(src, i) {
  NAME_RE.lastIndex = i + 1;
  const m = NAME_RE.exec(src);
  return m ? { type: 'param', name: m[0], pos: i, ende: i + 1 + m[0].length } : null;
}

function stellenFehler(t) {
  return {
    ok: false,
    error: {
      code: 'placeholderPosition',
      message: `Platzhalter $${t.name} steht nur in WHERE oder HAVING (Position ${t.pos})`,
      pos: t.pos,
      name: t.name,
    },
  };
}

// Die Kind-Knoten eines Ausdrucks.
function kinder(node) {
  const out = [];
  for (const key of ['left', 'right', 'operand']) if (node[key]) out.push(node[key]);
  if (Array.isArray(node.args)) out.push(...node.args);
  if (Array.isArray(node.values)) out.push(...node.values);
  return out;
}

// Alle Platzhalter-Knoten unter den Ausdrücken, in Baum-Reihenfolge.
function platzhalterIn(nodes, out = []) {
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'param') out.push(node);
    else platzhalterIn(kinder(node), out);
  }
  return out;
}

// Steht der Platzhalter an Token-Position `k` in einer Bedingung? Näherung für
// den Fehler-Fall, in dem es keinen Baum gibt: Vor ihm muss ein Operand beginnen
// können, und das letzte Klausel-Wort davor ist WHERE oder HAVING; ohne
// Klausel-Wort am Anfang ist die ganze Abfrage eine Bedingung (Alt-Form).
function inBedingung(tokens, k, klauselWort) {
  const vor = tokens[k - 1];
  const operand =
    !vor ||
    VOR_OPERAND.has(vor.type) ||
    (vor.type === 'field' && BEDINGUNGS_KLAUSELN.has(vor.value.toUpperCase()));
  if (!operand) return false;
  if (!klauselWort(tokens[0])) return true;
  for (let j = k - 1; j >= 0; j--) {
    const wort = klauselWort(tokens[j]);
    if (wort) return BEDINGUNGS_KLAUSELN.has(wort);
  }
  return true;
}

/**
 * Stellen-Prüfung der Platzhalter, gerufen am Ausgang von `parseQuery`. Mit Baum
 * ist jeder Platzhalter außerhalb von `where` und `having` ein Fehler, im
 * Ausdrucks-Modus jeder. Ohne Baum (Syntax-Fehler) ersetzt `placeholderPosition`
 * den Fehler, wenn ein Platzhalter an einer Stelle steht, an der er nie stehen
 * darf, etwa `LIMIT $n` oder `#a$b`; sonst bleibt der Fehler des Parsers.
 * @param {{ ok: boolean, ast?: object, error?: object }} result  Ergebnis des Parsers
 * @param {object[]} tokens  Tokens der Abfrage
 * @param {boolean} ausdruck  Ausdrucks-Modus (`parseExpression`)
 * @param {(t: object) => string|null} klauselWort  Klausel-Wort des Tokens oder null
 * @returns {{ ok: boolean, ast?: object, error?: object }}
 */
function pruefePlatzhalter(result, tokens, ausdruck, klauselWort) {
  if (!tokens.some((t) => t.type === 'param')) return result;
  if (!result.ok) {
    const falsch = tokens.find(
      (t, k) => t.type === 'param' && (ausdruck || !inBedingung(tokens, k, klauselWort)),
    );
    return falsch ? stellenFehler(falsch) : result;
  }
  const ast = result.ast;
  const stellen = ausdruck
    ? [ast]
    : [...ast.fields.map((f) => f.expr), ...ast.sort.map((s) => s.key), ...ast.groupBy];
  const falsch = platzhalterIn(stellen).sort((a, b) => a.pos - b.pos)[0];
  return falsch ? stellenFehler(falsch) : result;
}

// --- Bindung -------------------------------------------------------------------

// Bildet einen Ausdruck ab, ohne ihn zu verändern: `fn` entscheidet je Knoten,
// ob er ersetzt wird (Rückgabe) oder seine Kinder abgebildet werden (undefined).
function abbilden(node, fn) {
  if (!node || typeof node !== 'object') return node;
  const ersetzt = fn(node);
  if (ersetzt !== undefined) return ersetzt;
  const copy = { ...node };
  for (const key of ['left', 'right', 'operand'])
    if (node[key]) copy[key] = abbilden(node[key], fn);
  if (Array.isArray(node.args)) copy.args = node.args.map((a) => abbilden(a, fn));
  if (Array.isArray(node.values)) copy.values = node.values.map((v) => abbilden(v, fn));
  return copy;
}

// Bindet eine Bedingung. `wertVon(name)` liefert den Wert oder null für «alle».
function bindeBedingung(node, wertVon) {
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'and' || node.type === 'or') {
    return {
      ...node,
      left: bindeBedingung(node.left, wertVon),
      right: bindeBedingung(node.right, wertVon),
    };
  }
  if (node.type === 'not') {
    const innen = bindeBedingung(node.operand, wertVon);
    return innen.type === 'always' ? ERFUELLT : { ...node, operand: innen };
  }
  const platzhalter = platzhalterIn([node]);
  if (platzhalter.length === 0) return node;
  if (platzhalter.some((p) => wertVon(p.name) === null)) return ERFUELLT;
  return abbilden(node, (n) =>
    n.type === 'param' ? { type: 'str', value: wertVon(n.name) } : undefined,
  );
}

/**
 * Setzt die Werte der Platzhalter in `where` und `having` einer Abfrage ein.
 * Ein Wert wird zum Zeichenketten-Literal und vergleicht wie `"wert"`: ohne
 * Rücksicht auf die Schreibung, bei Listen als Mitgliedschaft. `null`, ein
 * unbekannter Name und ein Aufrufer ohne Werte bedeuten «alle». Ohne Platzhalter
 * kommt der Baum unverändert zurück, als dasselbe Objekt.
 * @param {object} ast  Abfrage-Baum aus `parseQuery`
 * @param {Object<string, string|null>|null|undefined} werte  Wert je Name; ohne
 *   Objekt gilt der Aufruf als außerhalb eines Dashboards
 * @returns {{ ast: object, hinweis: { code: string, name: string|null }|null }}
 */
function bindePlatzhalter(ast, werte) {
  if (!ast || (ast.type !== 'list' && ast.type !== 'table')) return { ast, hinweis: null };
  const namen = platzhalterIn([ast.where, ast.having]).map((p) => p.name);
  if (namen.length === 0) return { ast, hinweis: null };
  const mitWerten = werte !== null && typeof werte === 'object';
  const bekannt = new Map(
    mitWerten ? Object.entries(werte).map(([k, v]) => [k.toLowerCase(), v]) : [],
  );
  const wertVon = (name) => {
    const v = bekannt.get(name.toLowerCase());
    return typeof v === 'string' ? v : null;
  };
  const gebunden = { ...ast, where: bindeBedingung(ast.where, wertVon) };
  if (ast.having) gebunden.having = bindeBedingung(ast.having, wertVon);
  const fremd = namen.find((n) => !bekannt.has(n.toLowerCase()));
  let hinweis = null;
  if (!mitWerten) hinweis = { code: 'placeholderOutside', name: null };
  else if (fremd !== undefined) hinweis = { code: 'placeholderUnknown', name: fremd };
  return { ast: gebunden, hinweis };
}

// Je Baum einmal gebunden, für die Auswertung ohne Werte.
const OHNE_WERTE = new WeakMap();

/**
 * Der Baum mit allen Platzhaltern als «alle», für Aufrufer, die eine Abfrage ohne
 * Bindung auswerten (Rückfall des Auswerters). Je Baum einmal berechnet.
 * @param {object} ast
 * @returns {object}
 */
function ohnePlatzhalter(ast) {
  if (!ast || typeof ast !== 'object') return ast;
  let gebunden = OHNE_WERTE.get(ast);
  if (!gebunden) {
    gebunden = bindePlatzhalter(ast, undefined).ast;
    OHNE_WERTE.set(ast, gebunden);
  }
  return gebunden;
}

module.exports = { platzhalterToken, pruefePlatzhalter, bindePlatzhalter, ohnePlatzhalter };
