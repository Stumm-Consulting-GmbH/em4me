// 4T-0354 (Epic 3E-0065): Unit-Tests für Parser und Evaluator der Perspective-
// Query-Sprache (perspective-query-Fence). Prozess-neutral, ohne Temp-FS: die
// reine String -> AST -> boolean-Kette wird hier erschöpfend geprüft; die
// Integration mit dem Index liegt in backlinks.test.js.
// 4T-0401 (Epic 3E-0076): Klausel-Grammatik (LIST/TABLE/FROM/WHERE/SORT/
// LIMIT/COLUMNS), Literale und Abwärtskompatibilitäts-Fälle ergänzt; Modul
// umbenannt (frontmatter-query.js -> perspective-query.js).
import { describe, it, expect } from 'vitest';
import { parseQuery, evaluateQuery, tokenize } from '../../src/shared/query/perspective-query.js';

// Parst und evaluiert; wirft bei Parse-Fehler (die Fehler-Fälle testet der
// Parser-Block separat).
function match(query, props) {
  const r = parseQuery(query);
  if (!r.ok) throw new Error(`unerwarteter Parse-Fehler: ${r.error.code}`);
  return evaluateQuery(r.ast, props);
}

describe('frontmatter-query — Parser', () => {
  it('parst Vergleich, Ungleichheit, IN und NOT IN', () => {
    expect(parseQuery('a = "x"').ok).toBe(true);
    expect(parseQuery('a != "x"').ok).toBe(true);
    expect(parseQuery('a IN ("x", "y")').ok).toBe(true);
    expect(parseQuery('a NOT IN ("x")').ok).toBe(true);
  });

  it('parst boolesche Verknüpfung, NOT und Klammern', () => {
    expect(parseQuery('a = "1" AND b = "2" OR c = "3"').ok).toBe(true);
    expect(parseQuery('(a = "1" OR b = "2") AND NOT c = "3"').ok).toBe(true);
    expect(parseQuery('NOT NOT a = "1"').ok).toBe(true);
  });

  it('akzeptiert mehrzeiligen Body (Zeilenumbruch wie Leerzeichen)', () => {
    expect(parseQuery('a = "1"\n  AND b = "2"').ok).toBe(true);
  });

  it('Keywords sind case-insensitiv, einfache Anführungszeichen erlaubt', () => {
    expect(parseQuery("a = 'x' and b = 'y' or c = 'z'").ok).toBe(true);
    expect(parseQuery('a not in ("x")').ok).toBe(true);
  });

  it('meldet Syntaxfehler mit definierten Codes', () => {
    const cases = {
      empty: '',
      expectedOperator: 'bereich',
      expectedValue: 'bereich =',
      expectedParen: '(a = "1"',
      unexpectedEnd: 'a = "1" OR',
      emptyList: 'a IN ()',
      unexpectedChar: 'a !',
      expectedIn: 'a NOT "x"',
      unexpectedToken: '= "x"',
      unterminatedString: 'a = "x',
      trailing: 'a = "1" b = "2"',
    };
    for (const [code, query] of Object.entries(cases)) {
      const r = parseQuery(query);
      expect(r.ok, `"${query}" sollte fehlschlagen`).toBe(false);
      expect(r.error.code, `"${query}" -> ${r.error && r.error.code}`).toBe(code);
    }
  });
});

describe('frontmatter-query — Evaluator (skalar)', () => {
  it('Gleichheit', () => {
    expect(match('bereich = "Privat"', { bereich: 'Privat' })).toBe(true);
    expect(match('bereich = "Privat"', { bereich: 'Beruflich' })).toBe(false);
  });

  it('Ungleichheit, auch bei fehlendem Feld', () => {
    expect(match('bereich != "Privat"', { bereich: 'Beruflich' })).toBe(true);
    expect(match('bereich != "Privat"', {})).toBe(true);
    expect(match('bereich = "Privat"', {})).toBe(false);
  });

  it('IN und NOT IN', () => {
    expect(match('bereich IN ("Privat", "Persönlich")', { bereich: 'Privat' })).toBe(true);
    expect(match('bereich IN ("Privat", "Persönlich")', { bereich: 'Beruflich' })).toBe(false);
    expect(match('bereich NOT IN ("Archiv")', { bereich: 'Privat' })).toBe(true);
    expect(match('bereich NOT IN ("Archiv")', {})).toBe(true);
  });

  it('Zahlen und Booleans werden als String verglichen', () => {
    expect(match('prioritaet = "1"', { prioritaet: 1 })).toBe(true);
    expect(match('aktiv = "true"', { aktiv: true })).toBe(true);
  });
});

describe('frontmatter-query — Evaluator (Listen-Feld)', () => {
  it('= als Mitgliedschaft', () => {
    expect(match('tags = "rot"', { tags: ['rot', 'blau'] })).toBe(true);
    expect(match('tags = "gelb"', { tags: ['rot', 'blau'] })).toBe(false);
  });

  it('IN als nicht-leere Schnittmenge', () => {
    expect(match('tags IN ("gelb", "blau")', { tags: ['rot', 'blau'] })).toBe(true);
    expect(match('tags IN ("gelb")', { tags: ['rot', 'blau'] })).toBe(false);
  });

  it('NOT IN als leere Schnittmenge, auch bei fehlendem Feld', () => {
    expect(match('tags NOT IN ("gelb")', { tags: ['rot'] })).toBe(true);
    expect(match('tags NOT IN ("rot")', { tags: ['rot'] })).toBe(false);
    expect(match('tags NOT IN ("rot")', {})).toBe(true);
  });
});

describe('frontmatter-query — Evaluator (Logik und Semantik)', () => {
  it('vergleicht Feldnamen und Werte case-insensitiv', () => {
    expect(match('BEREICH = "privat"', { bereich: 'Privat' })).toBe(true);
    expect(match('Tags IN ("ROT")', { tags: ['rot'] })).toBe(true);
  });

  it('Präzedenz NOT > AND > OR', () => {
    // a OR b AND c  ==  a OR (b AND c)
    expect(match('a = "1" OR b = "1" AND c = "1"', { a: '1' })).toBe(true);
    expect(match('a = "1" OR b = "1" AND c = "1"', { b: '1' })).toBe(false);
    // NOT bindet enger als AND: (NOT a) AND b
    expect(match('NOT a = "1" AND b = "1"', { b: '1' })).toBe(true);
    expect(match('NOT a = "1" AND b = "1"', { a: '1', b: '1' })).toBe(false);
  });

  it('Klammern überschreiben die Präzedenz', () => {
    expect(match('(a = "1" OR b = "1") AND c = "1"', { a: '1', c: '1' })).toBe(true);
    expect(match('(a = "1" OR b = "1") AND c = "1"', { a: '1' })).toBe(false);
  });

  it('komplexer PO-Ausdruck', () => {
    const q =
      '(bereich = "Privat" AND tags IN ("rot", "rund", "groß") AND NOT alias = "Müller") OR bereich = "Persönlich"';
    expect(match(q, { bereich: 'Privat', tags: ['rot'], alias: 'Meier' })).toBe(true);
    expect(match(q, { bereich: 'Privat', tags: ['rund'], alias: 'Müller' })).toBe(false);
    expect(match(q, { bereich: 'Persönlich' })).toBe(true);
    expect(match(q, { bereich: 'Beruflich', tags: ['rot'] })).toBe(false);
  });
});

describe('frontmatter-query — tokenize', () => {
  it('meldet ein nicht geschlossenes Anführungszeichen', () => {
    const r = tokenize('a = "offen');
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('unterminatedString');
  });

  it('erkennt reservierte Wörter unabhängig von der Groß-/Kleinschreibung', () => {
    const r = tokenize('a AND b or c');
    expect(r.ok).toBe(true);
    const types = r.tokens.map((t) => t.type);
    expect(types).toContain('AND');
    expect(types).toContain('OR');
  });
});

// --- 4T-0401 (Epic 3E-0076): Klausel-Grammatik ------------------------------

// Parst und liefert den Abfrage-Knoten; wirft bei Parse-Fehler.
function parseOk(query) {
  const r = parseQuery(query);
  if (!r.ok) throw new Error(`unerwarteter Parse-Fehler: ${r.error.code}`);
  return r.ast;
}

describe('perspective-query — Klausel-Struktur', () => {
  it('Alt-Body ohne Klausel wird als LIST WHERE geliefert', () => {
    const ast = parseOk('bereich = "Privat"');
    expect(ast.type).toBe('list');
    expect(ast.where).toBeTruthy();
    expect(ast.source).toBeNull();
    expect(ast.sort).toEqual([]);
    expect(ast.limit).toBeNull();
    expect(ast.layoutColumns).toBeNull();
  });

  it('nacktes LIST passt auf alles (leeres WHERE)', () => {
    const ast = parseOk('LIST');
    expect(ast.type).toBe('list');
    expect(ast.where).toBeNull();
    expect(evaluateQuery(ast, {})).toBe(true);
  });

  it('LIST mit Zusatzfeld', () => {
    const ast = parseOk('LIST status WHERE bereich = "Privat"');
    expect(ast.fields).toHaveLength(1);
    expect(ast.fields[0].expr).toEqual({ type: 'field', name: 'status' });
    expect(ast.fields[0].alias).toBeNull();
  });

  it('TABLE mit Spalten, Alias und WITHOUT ID', () => {
    const ast = parseOk('TABLE WITHOUT ID status AS "Status", file.mtime');
    expect(ast.type).toBe('table');
    expect(ast.withoutId).toBe(true);
    expect(ast.fields).toHaveLength(2);
    expect(ast.fields[0].alias).toBe('Status');
    expect(ast.fields[1].expr).toEqual({ type: 'field', name: 'file.mtime' });
    expect(ast.fields[1].alias).toBeNull();
  });

  it('Klauseln in beliebiger Reihenfolge nach dem Ausgabe-Typ', () => {
    const ast = parseOk('TABLE status SORT file.name DESC FROM #projekt WHERE a = "1" LIMIT 5');
    expect(ast.type).toBe('table');
    expect(ast.source).toEqual({ type: 'srcTag', value: 'projekt' });
    expect(ast.sort).toEqual([{ key: { type: 'field', name: 'file.name' }, dir: 'desc' }]);
    expect(ast.limit).toBe(5);
  });

  it('SORT mehrfach mit Richtungen, LIMIT und COLUMNS', () => {
    const ast = parseOk('LIST SORT prio DESC, file.name ASC, status LIMIT 10 COLUMNS 3');
    expect(ast.sort.map((s) => s.dir)).toEqual(['desc', 'asc', 'asc']);
    expect(ast.limit).toBe(10);
    expect(ast.layoutColumns).toBe(3);
  });

  it('Klausel-Schlüsselwörter sind case-insensitiv', () => {
    const ast = parseOk('list where a = "1" sort b desc limit 2 columns 4');
    expect(ast.where).toBeTruthy();
    expect(ast.sort[0].dir).toBe('desc');
    expect(ast.limit).toBe(2);
    expect(ast.layoutColumns).toBe(4);
  });

  it('meldet doppelte, unbekannte und falsch platzierte Klauseln', () => {
    expect(parseQuery('WHERE a = "1" WHERE b = "2"').error.code).toBe('duplicateClause');
    expect(parseQuery('LIST WHERE a = "1" TABLE b').error.code).toBe('duplicateClause');
    expect(parseQuery('WHERE a = "1" foo = "2"').error.code).toBe('unknownClause');
    expect(parseQuery('WHERE a = "1" LIST').error.code).toBe('misplacedType');
  });

  it('meldet Zahlen-Fehler bei LIMIT und COLUMNS', () => {
    expect(parseQuery('LIST LIMIT').error.code).toBe('expectedNumber');
    expect(parseQuery('LIST LIMIT "5"').error.code).toBe('expectedNumber');
    expect(parseQuery('LIST LIMIT 2.5').error.code).toBe('invalidLimit');
    expect(parseQuery('LIST COLUMNS 0').error.code).toBe('invalidColumns');
    expect(parseQuery('LIST COLUMNS 9').error.code).toBe('invalidColumns');
  });

  it('meldet Spalten- und Sortier-Fehler', () => {
    expect(parseQuery('TABLE a AS 5').error.code).toBe('expectedAlias');
    expect(parseQuery('TABLE a, WHERE b = "1"').error.code).toBe('expectedColumn');
    expect(parseQuery('TABLE WITHOUT a').error.code).toBe('expectedId');
    expect(parseQuery('LIST SORT').error.code).toBe('expectedField');
    expect(parseQuery('LIST SORT LIMIT 5').error.code).toBe('expectedField');
  });
});

// 4T-0409 (Epic 3E-0077): Scope-Zusatz BLOCKS am Ausgabe-Typ.
describe('perspective-query — BLOCKS-Scope', () => {
  it('Default-Scope ist files (Klausel-Form und Alt-Body)', () => {
    expect(parseOk('LIST').scope).toBe('files');
    expect(parseOk('TABLE status').scope).toBe('files');
    expect(parseOk('bereich = "Privat"').scope).toBe('files');
  });

  it('LIST BLOCKS schaltet auf die Block-Ebene um', () => {
    const ast = parseOk('LIST BLOCKS WHERE status = "offen"');
    expect(ast.type).toBe('list');
    expect(ast.scope).toBe('blocks');
    expect(ast.fields).toEqual([]);
    expect(ast.where).toBeTruthy();
  });

  it('LIST BLOCKS mit Zusatzfeld und Klauseln', () => {
    const ast = parseOk('LIST BLOCKS prio FROM "Projekte" SORT updated DESC LIMIT 5');
    expect(ast.scope).toBe('blocks');
    expect(ast.fields[0].expr).toEqual({ type: 'field', name: 'prio' });
    expect(ast.source).toEqual({ type: 'srcFolder', value: 'Projekte' });
    expect(ast.sort[0].key).toEqual({ type: 'field', name: 'updated' });
    expect(ast.limit).toBe(5);
  });

  it('TABLE BLOCKS mit WITHOUT ID und Spalten (BLOCKS vor WITHOUT)', () => {
    const ast = parseOk('TABLE BLOCKS WITHOUT ID status AS "Status", updated');
    expect(ast.type).toBe('table');
    expect(ast.scope).toBe('blocks');
    expect(ast.withoutId).toBe(true);
    expect(ast.fields).toHaveLength(2);
    expect(ast.fields[0].alias).toBe('Status');
  });

  it('BLOCKS ist case-insensitiv', () => {
    expect(parseOk('list blocks where a = "1"').scope).toBe('blocks');
    expect(parseOk('table Blocks status').scope).toBe('blocks');
  });

  it('BLOCKS ist kontextuell: als Feldname ausserhalb der Scope-Position nutzbar', () => {
    // In WHERE/SORT bleibt 'blocks' ein normales Feld.
    const ast = parseOk('LIST WHERE blocks = "x" SORT blocks');
    expect(ast.scope).toBe('files');
    expect(ast.sort[0].key).toEqual({ type: 'field', name: 'blocks' });
    // Direkt nach LIST wird das Wort als Scope konsumiert (dokumentierte
    // Einschraenkung): kein Zusatzfeld 'blocks' in Scope-Position.
    expect(parseOk('LIST blocks').scope).toBe('blocks');
  });
});

// 4T-0502 (Epic 3E-0096): Scope-Zusatz TASKS am Ausgabe-Typ (Muster BLOCKS).
describe('perspective-query — TASKS-Scope (4T-0502, Epic 3E-0096)', () => {
  it('LIST TASKS und TABLE TASKS schalten auf die Task-Ebene um', () => {
    const list = parseOk('LIST TASKS');
    expect(list.type).toBe('list');
    expect(list.scope).toBe('tasks');
    expect(list.fields).toEqual([]);
    const table = parseOk('TABLE TASKS status, due');
    expect(table.type).toBe('table');
    expect(table.scope).toBe('tasks');
    expect(table.fields).toHaveLength(2);
  });

  it('TASKS ist case-insensitiv (list tasks / table Tasks)', () => {
    expect(parseOk('list tasks where status.type = "TODO"').scope).toBe('tasks');
    expect(parseOk('table Tasks due').scope).toBe('tasks');
  });

  it('LIST ohne TASKS bleibt files', () => {
    expect(parseOk('LIST').scope).toBe('files');
    expect(parseOk('LIST WHERE due <= date(today)').scope).toBe('files');
    expect(parseOk('due = "2026-07-08"').scope).toBe('files');
  });

  it('LIST TASKS mit Zusatzfeld und Klauseln', () => {
    const ast = parseOk('LIST TASKS priority FROM "Projekte" SORT due DESC LIMIT 3');
    expect(ast.scope).toBe('tasks');
    expect(ast.fields[0].expr).toEqual({ type: 'field', name: 'priority' });
    expect(ast.source).toEqual({ type: 'srcFolder', value: 'Projekte' });
    expect(ast.sort[0].key).toEqual({ type: 'field', name: 'due' });
    expect(ast.limit).toBe(3);
  });

  it('TABLE TASKS mit WITHOUT ID und Spalten (TASKS vor WITHOUT)', () => {
    const ast = parseOk('TABLE TASKS WITHOUT ID status AS "Status", due');
    expect(ast.type).toBe('table');
    expect(ast.scope).toBe('tasks');
    expect(ast.withoutId).toBe(true);
    expect(ast.fields).toHaveLength(2);
    expect(ast.fields[0].alias).toBe('Status');
  });

  it('TASKS ist kontextuell: als Feldname ausserhalb der Scope-Position nutzbar', () => {
    // In WHERE/SORT bleibt 'tasks' ein normales Feld.
    const ast = parseOk('LIST WHERE tasks = "x" SORT tasks');
    expect(ast.scope).toBe('files');
    expect(ast.sort[0].key).toEqual({ type: 'field', name: 'tasks' });
    // Direkt nach LIST wird das Wort als Scope konsumiert (dokumentierte
    // Einschraenkung): kein Zusatzfeld 'tasks' in Scope-Position.
    expect(parseOk('LIST tasks').scope).toBe('tasks');
  });
});

// 4T-0503 (Epic 3E-0096): GROUP BY und Task-Layout-Klauseln (HIDE/SHOW/SHORT).
// Reine Parser-Ebene: die Aktivierungs-Grenze (nur LIST TASKS) liegt in der
// Auswertung und wird im Index-Test geprueft.
describe('perspective-query — GROUP BY und Layout-Klauseln (4T-0503, Epic 3E-0096)', () => {
  it('GROUP BY: einfacher und mehrstufiger Ausdruck landet in ast.groupBy', () => {
    const one = parseOk('LIST TASKS GROUP BY heading');
    expect(one.groupBy).toEqual([{ type: 'field', name: 'heading' }]);
    const two = parseOk('LIST TASKS GROUP BY heading, priority');
    expect(two.groupBy).toEqual([
      { type: 'field', name: 'heading' },
      { type: 'field', name: 'priority' },
    ]);
  });

  it('GROUP ohne BY meldet expectedBy; GROUP BY ohne Feld meldet expectedField', () => {
    expect(parseQuery('LIST TASKS GROUP heading').error.code).toBe('expectedBy');
    expect(parseQuery('LIST TASKS GROUP BY').error.code).toBe('expectedField');
    // Eine folgende Klausel statt eines Gruppierungs-Feldes ist ebenfalls ein Fehler.
    expect(parseQuery('LIST TASKS GROUP BY SORT due').error.code).toBe('expectedField');
  });

  it('doppelte GROUP-Klausel meldet duplicateClause mit clause GROUP', () => {
    const err = parseQuery('LIST TASKS GROUP BY heading GROUP BY priority').error;
    expect(err.code).toBe('duplicateClause');
    expect(err.clause).toBe('GROUP');
  });

  it('HIDE/SHOW: Elemente lowercase und dedupliziert', () => {
    const ast = parseOk('LIST TASKS HIDE Due, PRIORITY, due SHOW backlink, backlink');
    expect(ast.hide).toEqual(['due', 'priority']);
    expect(ast.show).toEqual(['backlink']);
  });

  it('HIDE unbekanntes Element meldet unknownLayoutElement mit Originalschreibweise', () => {
    const err = parseQuery('LIST TASKS HIDE Foo').error;
    expect(err.code).toBe('unknownLayoutElement');
    expect(err.name).toBe('Foo');
    // Fehlendes Element (Body-Ende bzw. folgende Klausel) meldet expectedElement.
    expect(parseQuery('LIST TASKS HIDE').error.code).toBe('expectedElement');
    expect(parseQuery('LIST TASKS SHOW SORT due').error.code).toBe('expectedElement');
  });

  it('SHORT setzt ast.short; der volle Element-Katalog ist gueltig', () => {
    expect(parseOk('LIST TASKS SHORT').short).toBe(true);
    expect(parseOk('LIST TASKS').short).toBe(false);
    const all =
      'due, scheduled, start, created, done, cancelled, priority, recurrence, ' +
      'id, dependson, tags, backlink, count, urgency, edit, postpone';
    expect(parseOk(`LIST TASKS HIDE ${all}`).hide).toHaveLength(16);
  });
});

describe('perspective-query — FROM-Quellen', () => {
  it('Ordner, Tag und Link-Bezüge', () => {
    expect(parseOk('FROM "Projekte/Aktiv"').source).toEqual({
      type: 'srcFolder',
      value: 'Projekte/Aktiv',
    });
    expect(parseOk('FROM #projekt/unter').source).toEqual({
      type: 'srcTag',
      value: 'projekt/unter',
    });
    expect(parseOk('FROM [[Zieldatei]]').source).toEqual({
      type: 'srcLink',
      target: 'Zieldatei',
      mode: 'in',
    });
    expect(parseOk('FROM outgoing([[Zieldatei]])').source).toEqual({
      type: 'srcLink',
      target: 'Zieldatei',
      mode: 'out',
    });
  });

  it('Kombination mit AND/OR, Negation und Klammern', () => {
    const ast = parseOk('FROM ("Ordner" OR #tag) AND -[[Datei]]');
    expect(ast.source.type).toBe('srcAnd');
    expect(ast.source.left.type).toBe('srcOr');
    expect(ast.source.right).toEqual({
      type: 'srcNot',
      operand: { type: 'srcLink', target: 'Datei', mode: 'in' },
    });
  });

  it('meldet ungültige Quellen', () => {
    expect(parseQuery('FROM').error.code).toBe('expectedSource');
    expect(parseQuery('FROM 5').error.code).toBe('expectedSource');
    expect(parseQuery('FROM [[]]').error.code).toBe('expectedSource');
    expect(parseQuery('FROM [[Datei').error.code).toBe('unterminatedLink');
    expect(parseQuery('FROM outgoing(#tag)').error.code).toBe('expectedSource');
  });
});

describe('perspective-query — Literale und Ausdrücke', () => {
  it('Ordnungs-Vergleiche, Zahlen und Feld-Pfade parsen', () => {
    const ast = parseOk('WHERE prio >= 2');
    expect(ast.where).toEqual({
      type: 'cmp',
      op: 'ge',
      left: { type: 'field', name: 'prio' },
      right: { type: 'num', value: 2 },
    });
    expect(parseQuery('WHERE file.size < 1000').ok).toBe(true);
    expect(parseQuery('WHERE a <= 1 AND b > 2').ok).toBe(true);
  });

  it('Datums-Literale: today, now, Datum, Datum mit Uhrzeit, Quote-tolerant', () => {
    expect(parseOk('WHERE d = date(today)').where.right).toEqual({ type: 'date', value: 'today' });
    expect(parseOk('WHERE d = date(now)').where.right).toEqual({ type: 'date', value: 'now' });
    expect(parseOk('WHERE d = date(2026-07-08)').where.right).toEqual({
      type: 'date',
      value: '2026-07-08',
    });
    expect(parseOk('WHERE d = date(2026-07-08 14:30)').where.right).toEqual({
      type: 'date',
      value: '2026-07-08T14:30',
    });
    expect(parseOk('WHERE d = date("2026-07-08")').where.right).toEqual({
      type: 'date',
      value: '2026-07-08',
    });
    expect(parseQuery('WHERE d = date(morgen)').error.code).toBe('invalidDate');
    expect(parseQuery('WHERE d = date(2026-7-8)').error.code).toBe('invalidDate');
  });

  it('date(): neue relative Woerter (4T-0502) parsen; ungueltige melden invalidDate', () => {
    for (const w of ['tomorrow', 'yesterday', 'sow', 'eow', 'som', 'eom', 'soy', 'eoy']) {
      expect(parseOk(`WHERE d = date(${w})`).where.right, w).toEqual({ type: 'date', value: w });
    }
    // Case-insensitiv (Kleinschreibung im AST).
    expect(parseOk('WHERE d = date(EOW)').where.right).toEqual({ type: 'date', value: 'eow' });
    // Kein bekanntes relatives Wort und kein Datum -> invalidDate.
    expect(parseQuery('WHERE d = date(naechsteWoche)').error.code).toBe('invalidDate');
  });

  it('Dauer-Literale mit Einheiten und Kombinationen', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(parseOk('WHERE d = dur(7 days)').where.right).toEqual({ type: 'dur', ms: 7 * day });
    expect(parseOk('WHERE d = dur(1 day 2 hours)').where.right).toEqual({
      type: 'dur',
      ms: day + 2 * 60 * 60 * 1000,
    });
    expect(parseOk('WHERE d = dur(2w)').where.right).toEqual({ type: 'dur', ms: 14 * day });
    expect(parseQuery('WHERE d = dur(7 lichtjahre)').error.code).toBe('invalidDuration');
    expect(parseQuery('WHERE d = dur()').error.code).toBe('invalidDuration');
  });

  it('Arithmetik mit Punkt-vor-Strich und unärem Minus', () => {
    const ast = parseOk('WHERE a = 1 + 2 * 3');
    expect(ast.where.right.type).toBe('arith');
    expect(ast.where.right.op).toBe('add');
    expect(ast.where.right.right.op).toBe('mul');
    expect(parseOk('WHERE a = -1').where.right).toEqual({
      type: 'neg',
      operand: { type: 'num', value: 1 },
    });
    expect(parseQuery('WHERE file.mtime >= date(today) - dur(7 days)').ok).toBe(true);
  });

  it('Funktions-Aufrufe als boolesches Blatt und mit Argumenten', () => {
    const ast = parseOk('WHERE contains(file.tags, "rot")');
    expect(ast.where).toEqual({
      type: 'call',
      name: 'contains',
      args: [
        { type: 'field', name: 'file.tags' },
        { type: 'str', value: 'rot' },
      ],
      pos: 6,
    });
    expect(parseQuery('LIST dateformat(file.mtime, "yyyy-MM-dd")').ok).toBe(true);
    expect(parseQuery('WHERE length(default(tags, "")) > 0').ok).toBe(true);
  });

  it('nacktes Feld bleibt in boolescher Position ein Fehler', () => {
    expect(parseQuery('WHERE bereich').error.code).toBe('expectedOperator');
    expect(parseQuery('LIST WHERE bereich AND a = "1"').error.code).toBe('expectedOperator');
  });
});

describe('perspective-query — Abwärtskompatibilität', () => {
  it('Klausel-Schlüsselwörter bleiben als Alt-Feldnamen nutzbar', () => {
    expect(match('limit = "3"', { limit: '3' })).toBe(true);
    expect(match('sort IN ("x", "y")', { sort: 'y' })).toBe(true);
    expect(match('where != "z"', { where: 'a' })).toBe(true);
    expect(match('columns NOT IN ("1")', {})).toBe(true);
  });

  it('Feldnamen mit Bindestrich und Punkt bleiben EIN Wort', () => {
    expect(match('parent-categories = "Thema"', { 'parent-categories': ['Thema'] })).toBe(true);
    expect(match('a.b = "1"', { 'a.b': '1' })).toBe(true);
  });

  it('evaluateQuery akzeptiert Abfrage-Knoten und Ausdrucks-Knoten', () => {
    const ast = parseOk('bereich = "Privat"');
    expect(evaluateQuery(ast, { bereich: 'Privat' })).toBe(true);
    expect(evaluateQuery(ast.where, { bereich: 'Privat' })).toBe(true);
  });
});
