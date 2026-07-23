// 4T-0402 (Epic 3E-0076): Unit-Tests für das Auswertungs-Modul der
// Perspective-Query-Sprache (perspective-query-eval.js): Typ-System,
// implizite file.*-Felder, Funktions-Katalog, FROM-Quellen und Validierung.
// Prozess-neutral mit synthetischem Kontext (kein Temp-FS); die Integration
// mit dem echten Index liegt in perspective-query-index.test.js.
import { describe, it, expect } from 'vitest';
import { parseQuery } from '../../src/shared/perspective-query.js';
import {
  matchesQuery,
  evaluateExpression,
  validateQuery,
  queryUsesLinks,
  applyResultPipeline,
  formatValue,
  formatValueSegments,
  formatExprSource,
} from '../../src/shared/perspective-query-eval.js';
// 4T-0502 (Epic 3E-0096): Task-Modell fuer die Feld-Aufloesung des TASKS-Scopes.
import { parseTaskLine } from '../../src/shared/task-markers.js';

const DAY = 24 * 60 * 60 * 1000;
// Fester Bezugszeitpunkt (lokal 2026-07-08 12:00), damit date(today)/date(now)
// deterministisch sind.
const NOW = new Date(2026, 6, 8, 12, 0, 0).getTime();

function parseOk(query) {
  const r = parseQuery(query);
  if (!r.ok) throw new Error(`unerwarteter Parse-Fehler: ${r.error.code}`);
  return r.ast;
}

// Synthetischer Datei-Kontext; Teile über `over` überschreibbar.
function ctxFor(over = {}) {
  return {
    props: over.props || {},
    file: {
      name: 'Alpha',
      folder: 'Projekte/Aktiv',
      path: 'Projekte/Aktiv/Alpha.md',
      ext: 'md',
      absPath: 'C:/Wurzel/Projekte/Aktiv/Alpha.md',
      size: 1234,
      ctimeMs: NOW - 30 * DAY,
      mtimeMs: NOW - 3 * DAY,
      tags: ['projekt/unter', 'Wichtig'],
      aliases: ['A1'],
      inlinks: [{ path: 'C:/Wurzel/Quelle.md', name: 'Quelle' }],
      outlinks: [{ path: 'C:/Wurzel/Ziel.md', name: 'Ziel' }],
      ...(over.file || {}),
    },
    now: NOW,
    resolveLinkTarget: over.resolveLinkTarget,
  };
}

function matchWith(query, over) {
  return matchesQuery(parseOk(query), ctxFor(over));
}

describe('perspective-query-eval — Typ-System', () => {
  it('Ordnungs-Vergleiche: Zahl numerisch (auch Zahl-Strings)', () => {
    expect(matchWith('prio > 5', { props: { prio: '10' } })).toBe(true);
    expect(matchWith('prio > 5', { props: { prio: '3' } })).toBe(false);
    expect(matchWith('prio > 5', { props: {} })).toBe(false);
    expect(matchWith('prio <= 3', { props: { prio: '3' } })).toBe(true);
  });

  it('Ordnungs-Vergleiche: String lexikographisch case-insensitiv', () => {
    expect(matchWith('name < "M"', { props: { name: 'anton' } })).toBe(true);
    expect(matchWith('name < "m"', { props: { name: 'Zebra' } })).toBe(false);
  });

  it('Datums-Vergleiche: Frontmatter-ISO-Strings chronologisch', () => {
    expect(matchWith('due <= date(2026-07-08)', { props: { due: '2026-07-01' } })).toBe(true);
    expect(matchWith('due <= date(2026-07-08)', { props: { due: '2026-07-09' } })).toBe(false);
    expect(matchWith('due < "2026-07-02"', { props: { due: '2026-07-01' } })).toBe(true);
  });

  it('file.mtime gegen date(today) mit Dauer-Arithmetik', () => {
    // mtime liegt 3 Tage vor NOW: innerhalb von 7 Tagen, nicht innerhalb von 1 Tag.
    expect(matchWith('WHERE file.mtime >= date(today) - dur(7 days)')).toBe(true);
    expect(matchWith('WHERE file.mtime >= date(today) - dur(1 day)')).toBe(false);
    expect(matchWith('WHERE file.ctime < file.mtime')).toBe(true);
  });

  it('Zahl-Arithmetik mit Punkt-vor-Strich', () => {
    expect(matchWith('a = 2 + 2 * 2', { props: { a: '6' } })).toBe(true);
    expect(matchWith('a = (2 + 2) * 2', { props: { a: '8' } })).toBe(true);
    expect(matchWith('a > 10 / 4', { props: { a: '3' } })).toBe(true);
  });

  it('Datum minus Datum ergibt eine Dauer', () => {
    const v = evaluateExpression(
      parseOk('WHERE file.mtime - file.ctime >= dur(27 days)').where,
      ctxFor(),
    );
    expect(v).toBe(true);
  });

  it('String-Konkatenation über +', () => {
    const expr = parseOk('LIST a + "-" + b').fields[0].expr;
    expect(evaluateExpression(expr, ctxFor({ props: { a: 'x', b: 'y' } }))).toBe('x-y');
  });
});

describe('perspective-query-eval — implizite file.*-Felder', () => {
  it('name, folder, path, ext, size', () => {
    expect(matchWith('WHERE file.name = "alpha"')).toBe(true);
    expect(matchWith('WHERE file.folder = "Projekte/Aktiv"')).toBe(true);
    expect(matchWith('WHERE file.path = "Projekte/Aktiv/Alpha.md"')).toBe(true);
    expect(matchWith('WHERE file.ext = "md"')).toBe(true);
    expect(matchWith('WHERE file.size > 1000')).toBe(true);
    expect(matchWith('WHERE file.size > 2000')).toBe(false);
  });

  it('tags und aliases als Listen (Gleichheit = Mitgliedschaft)', () => {
    expect(matchWith('WHERE file.tags = "wichtig"')).toBe(true);
    expect(matchWith('WHERE file.aliases = "a1"')).toBe(true);
    expect(matchWith('WHERE file.tags = "fehlt"')).toBe(false);
  });

  it('inlinks/outlinks als Link-Listen (contains über den Namen)', () => {
    expect(matchWith('WHERE contains(file.outlinks, "ziel")')).toBe(true);
    expect(matchWith('WHERE contains(file.inlinks, "Quelle")')).toBe(true);
    expect(matchWith('WHERE contains(file.outlinks, "Anderes")')).toBe(false);
    expect(matchWith('WHERE length(file.inlinks) = 1')).toBe(true);
  });

  it('unbekanntes file.*-Feld und fehlender Datei-Kontext sind null', () => {
    expect(matchWith('WHERE file.unbekannt = "x"')).toBe(false);
    expect(matchesQuery(parseOk('WHERE file.name = "alpha"'), { props: {}, now: NOW })).toBe(false);
  });
});

describe('perspective-query-eval — Funktions-Katalog', () => {
  const props = { titel: 'Herbst-Plan', tags: ['rot', 'Blau'], werte: ['1', '2', '3'] };

  it('contains (case-sensitiv) und icontains (case-insensitiv)', () => {
    expect(matchWith('contains(titel, "Herbst")', { props })).toBe(true);
    expect(matchWith('contains(titel, "herbst")', { props })).toBe(false);
    expect(matchWith('icontains(titel, "herbst")', { props })).toBe(true);
    expect(matchWith('contains(tags, "Blau")', { props })).toBe(true);
    expect(matchWith('contains(tags, "blau")', { props })).toBe(false);
    expect(matchWith('icontains(tags, "blau")', { props })).toBe(true);
  });

  it('length, lower, upper, startswith, endswith', () => {
    expect(matchWith('length(tags) = 2', { props })).toBe(true);
    expect(matchWith('lower(titel) = "herbst-plan"', { props })).toBe(true);
    expect(matchWith('upper(titel) = "HERBST-PLAN"', { props })).toBe(true);
    expect(matchWith('startswith(titel, "Herbst")', { props })).toBe(true);
    expect(matchWith('endswith(titel, "Plan")', { props })).toBe(true);
    expect(matchWith('startswith(titel, "herbst")', { props })).toBe(false);
  });

  it('default und choice', () => {
    expect(matchWith('default(fehlt, "leer") = "leer"', { props })).toBe(true);
    expect(matchWith('default(titel, "leer") = "Herbst-Plan"', { props })).toBe(true);
    expect(matchWith('choice(length(tags) > 1, "viele", "wenige") = "viele"', { props })).toBe(
      true,
    );
  });

  it('number, string, dateformat', () => {
    expect(matchWith('number("42") = 42', { props })).toBe(true);
    expect(matchWith('string(42) = "42"', { props })).toBe(true);
    expect(matchWith('WHERE dateformat(file.mtime, "yyyy-MM") = "2026-07"')).toBe(true);
    expect(matchWith('WHERE dateformat(file.mtime, "yyyy/MM/dd") = "2026/07/05"')).toBe(true);
  });

  it('sum, min, max, average über Zahl-Listen', () => {
    expect(matchWith('sum(werte) = 6', { props })).toBe(true);
    expect(matchWith('min(werte) = 1', { props })).toBe(true);
    expect(matchWith('max(werte) = 3', { props })).toBe(true);
    expect(matchWith('average(werte) = 2', { props })).toBe(true);
    expect(matchWith('sum(titel) = 0', { props })).toBe(false); // nicht numerisch -> null
  });

  it('formatValue: Datum ISO, Dauer kompakt, Liste kommagetrennt', () => {
    expect(formatValue({ kind: 'date', ms: new Date(2026, 6, 8).getTime() })).toBe('2026-07-08');
    expect(formatValue({ kind: 'dur', ms: DAY + 2 * 60 * 60 * 1000 })).toBe('1d 2h');
    expect(formatValue(['a', 'b'])).toBe('a, b');
    expect(formatValue(null)).toBe('');
  });
});

describe('perspective-query-eval — FROM-Quellen', () => {
  it('Ordner-Quelle: Präfix-Match, case-insensitiv', () => {
    expect(matchWith('FROM "Projekte"')).toBe(true);
    expect(matchWith('FROM "projekte/aktiv"')).toBe(true);
    expect(matchWith('FROM "Projekte/Anderes"')).toBe(false);
    expect(matchWith('FROM "Projekt"')).toBe(false); // kein Teilstring-Match
  });

  it('Tag-Quelle: hierarchisch und case-insensitiv, Negation über -', () => {
    expect(matchWith('FROM #projekt')).toBe(true); // trifft projekt/unter
    expect(matchWith('FROM #projekt/unter')).toBe(true);
    expect(matchWith('FROM #wichtig')).toBe(true);
    expect(matchWith('FROM #fehlt')).toBe(false);
    expect(matchWith('FROM -#projekt')).toBe(false);
    expect(matchWith('FROM "Projekte" AND -#fehlt')).toBe(true);
  });

  it('Link-Quellen über den Ziel-Resolver', () => {
    const resolveLinkTarget = (t) => {
      if (t === 'Ziel') return new Set(['c:/wurzel/ziel.md']);
      if (t === 'Quelle') return new Set(['c:/wurzel/quelle.md']);
      return new Set();
    };
    // [[Ziel]]: Dateien, die auf Ziel verlinken -> outlinks enthalten Ziel.
    expect(matchWith('FROM [[Ziel]]', { resolveLinkTarget })).toBe(true);
    expect(matchWith('FROM [[Quelle]]', { resolveLinkTarget })).toBe(false);
    // outgoing([[Quelle]]): Dateien, auf die Quelle verlinkt -> inlinks von Quelle.
    expect(matchWith('FROM outgoing([[Quelle]])', { resolveLinkTarget })).toBe(true);
    expect(matchWith('FROM outgoing([[Ziel]])', { resolveLinkTarget })).toBe(false);
    // Ohne Resolver (kein Index-Kontext) matcht keine Link-Quelle.
    expect(matchWith('FROM [[Ziel]]')).toBe(false);
  });

  it('FROM und WHERE müssen beide zutreffen', () => {
    expect(matchWith('FROM #wichtig WHERE file.size > 1000')).toBe(true);
    expect(matchWith('FROM #wichtig WHERE file.size > 9999')).toBe(false);
    expect(matchWith('FROM #fehlt WHERE file.size > 1000')).toBe(false);
  });
});

describe('perspective-query-eval — Validierung und Link-Bedarf', () => {
  it('meldet unbekannte Funktionen und falsche Stelligkeit', () => {
    const unknown = validateQuery(parseOk('WHERE foo(1)'));
    expect(unknown).toMatchObject({ code: 'unknownFunction', name: 'foo' });
    const arity = validateQuery(parseOk('WHERE contains(tags)'));
    expect(arity).toMatchObject({ code: 'functionArity', name: 'contains' });
    expect(validateQuery(parseOk('WHERE contains(tags, "rot")'))).toBeNull();
    // Auch in Spalten- und SORT-Ausdrücken.
    expect(validateQuery(parseOk('TABLE foo(1)'))).toMatchObject({ code: 'unknownFunction' });
    expect(validateQuery(parseOk('LIST SORT foo(1)'))).toMatchObject({ code: 'unknownFunction' });
  });

  it('queryUsesLinks erkennt Link-Felder und Link-Quellen', () => {
    expect(queryUsesLinks(parseOk('WHERE contains(file.outlinks, "x")'))).toBe(true);
    expect(queryUsesLinks(parseOk('WHERE length(file.inlinks) > 0'))).toBe(true);
    expect(queryUsesLinks(parseOk('FROM [[Datei]]'))).toBe(true);
    expect(queryUsesLinks(parseOk('FROM #tag WHERE a = "1"'))).toBe(false);
    expect(queryUsesLinks(parseOk('LIST SORT file.mtime DESC'))).toBe(false);
  });
});

// --- 4T-0403 (Epic 3E-0076): Ergebnis-Pipeline (SORT/LIMIT) ------------------

describe('perspective-query-eval — Ergebnis-Pipeline', () => {
  // Kontext-Zeile mit Kurzform: Name, Properties, optionale Datei-Felder.
  function row(name, props, fileOver = {}) {
    return ctxFor({
      props,
      file: { name, path: `${name}.md`, absPath: `C:/w/${name}.md`, ...fileOver },
    });
  }
  function pipeline(query, rows) {
    return applyResultPipeline(rows, parseOk(query)).map((c) => c.file.name);
  }

  it('sortiert numerisch (Zahl-Strings), ASC und DESC', () => {
    const rows = [row('A', { prio: '3' }), row('B', { prio: '10' }), row('C', { prio: '2' })];
    expect(pipeline('LIST SORT prio', rows)).toEqual(['C', 'A', 'B']);
    expect(pipeline('LIST SORT prio DESC', rows)).toEqual(['B', 'A', 'C']);
  });

  it('sortiert Datums-Felder chronologisch', () => {
    const rows = [
      row('Alt', {}, { mtimeMs: NOW - 30 * DAY }),
      row('Neu', {}, { mtimeMs: NOW - DAY }),
      row('Mittel', {}, { mtimeMs: NOW - 10 * DAY }),
    ];
    expect(pipeline('LIST SORT file.mtime', rows)).toEqual(['Alt', 'Mittel', 'Neu']);
    expect(pipeline('LIST SORT file.mtime DESC', rows)).toEqual(['Neu', 'Mittel', 'Alt']);
  });

  it('sortiert Strings locale-bewusst und case-insensitiv', () => {
    const rows = [row('1', { t: 'zebra' }), row('2', { t: 'Äpfel' }), row('3', { t: 'banane' })];
    expect(pipeline('LIST SORT t', rows)).toEqual(['2', '3', '1']);
  });

  it('Mehrfach-Sortierung: zweiter Schlüssel entscheidet bei Gleichstand', () => {
    const rows = [
      row('A', { grp: '1', prio: '2' }),
      row('B', { grp: '1', prio: '1' }),
      row('C', { grp: '0', prio: '9' }),
    ];
    expect(pipeline('LIST SORT grp, prio', rows)).toEqual(['C', 'B', 'A']);
    expect(pipeline('LIST SORT grp, prio DESC', rows)).toEqual(['C', 'A', 'B']);
  });

  it('fehlende Werte sortieren unabhängig von der Richtung ans Ende', () => {
    const rows = [row('Ohne', {}), row('B', { prio: '2' }), row('A', { prio: '1' })];
    expect(pipeline('LIST SORT prio', rows)).toEqual(['A', 'B', 'Ohne']);
    expect(pipeline('LIST SORT prio DESC', rows)).toEqual(['B', 'A', 'Ohne']);
  });

  it('Tiebreak über den Datei-Pfad, deterministisch', () => {
    const rows = [row('B', { prio: '1' }), row('A', { prio: '1' })];
    expect(pipeline('LIST SORT prio', rows)).toEqual(['A', 'B']);
  });

  it('LIMIT schneidet nach der Sortierung; ohne SORT bleibt die Basis-Ordnung', () => {
    const rows = [row('A', { prio: '3' }), row('B', { prio: '1' }), row('C', { prio: '2' })];
    expect(pipeline('LIST SORT prio LIMIT 2', rows)).toEqual(['B', 'C']);
    expect(pipeline('LIST LIMIT 2', rows)).toEqual(['A', 'B']);
    expect(pipeline('LIST LIMIT 0', rows)).toEqual([]);
    expect(pipeline('LIST', rows)).toEqual(['A', 'B', 'C']);
  });
});

// --- 4T-0404 (Epic 3E-0076): Anzeige-Segmente und Ausdrucks-Quelltext --------

describe('perspective-query-eval — Segmente und Quelltext', () => {
  it('formatValueSegments: Text, Links und kommagetrennte Listen', () => {
    expect(formatValueSegments('offen')).toEqual([{ text: 'offen' }]);
    expect(formatValueSegments(null)).toEqual([]);
    expect(formatValueSegments({ kind: 'link', path: 'C:/w/Z.md', name: 'Z' })).toEqual([
      { link: { path: 'C:/w/Z.md', name: 'Z' } },
    ]);
    expect(formatValueSegments(['a', { kind: 'link', path: 'p', name: 'n' }])).toEqual([
      { text: 'a' },
      { text: ', ' },
      { link: { path: 'p', name: 'n' } },
    ]);
    expect(formatValueSegments({ kind: 'date', ms: new Date(2026, 6, 8).getTime() })).toEqual([
      { text: '2026-07-08' },
    ]);
  });

  it('formatExprSource: Kopfzeilen-Fallback für Felder, Aufrufe und Arithmetik', () => {
    expect(formatExprSource(parseOk('LIST file.mtime').fields[0].expr)).toBe('file.mtime');
    expect(formatExprSource(parseOk('LIST dateformat(file.mtime, "yyyy")').fields[0].expr)).toBe(
      'dateformat(file.mtime, "yyyy")',
    );
    expect(formatExprSource(parseOk('LIST prio * 2').fields[0].expr)).toBe('prio * 2');
    expect(formatExprSource(parseOk('LIST default(status, "offen")').fields[0].expr)).toBe(
      'default(status, "offen")',
    );
  });
});

// --- 4T-0409 (Epic 3E-0077): Feld-Aufloesung im Block-Kontext ------------------

describe('perspective-query-eval — Block-Kontext (BLOCKS-Scope)', () => {
  const block = (over = {}) => ({
    anchor: 'abc123',
    values: { status: 'offen', prio: 3 },
    updatedMs: NOW - 2 * DAY,
    ...over,
  });

  it('nackte Feldnamen loesen zuerst gegen die Block-Eigenschaften auf', () => {
    const ctx = { ...ctxFor({ props: { status: 'erledigt' } }), block: block() };
    expect(evaluateExpression({ type: 'field', name: 'status' }, ctx)).toBe('offen');
    expect(evaluateExpression({ type: 'field', name: 'Prio' }, ctx)).toBe(3);
  });

  it('faellt auf die Frontmatter-Properties der Traeger-Datei zurueck', () => {
    const ctx = { ...ctxFor({ props: { bereich: 'Privat' } }), block: block() };
    expect(evaluateExpression({ type: 'field', name: 'bereich' }, ctx)).toBe('Privat');
    expect(evaluateExpression({ type: 'field', name: 'fehlt' }, ctx)).toBeNull();
  });

  it('updated ist ein Datums-Wert aus updatedMs; eigene Block-Eigenschaft geht vor', () => {
    const ctx = { ...ctxFor(), block: block() };
    const v = evaluateExpression({ type: 'field', name: 'updated' }, ctx);
    expect(v).toEqual({ kind: 'date', ms: NOW - 2 * DAY });
    // Datums-Arithmetik und -Vergleich funktionieren damit direkt.
    expect(matchesQuery(parseOk('LIST BLOCKS WHERE updated >= date(now) - dur(7 days)'), ctx)).toBe(
      true,
    );
    // Eigene Block-Eigenschaft 'updated' wird nicht verdeckt.
    const own = { ...ctxFor(), block: block({ values: { updated: 'manuell' } }) };
    expect(evaluateExpression({ type: 'field', name: 'updated' }, own)).toBe('manuell');
    // Ohne Zeitstempel bleibt updated null (fehlender Wert).
    const noTs = { ...ctxFor(), block: block({ updatedMs: null }) };
    expect(evaluateExpression({ type: 'field', name: 'updated' }, noTs)).toBeNull();
  });

  it('file.*-Felder bleiben die Traeger-Datei; FROM filtert ueber sie', () => {
    const ctx = { ...ctxFor(), block: block() };
    expect(evaluateExpression({ type: 'field', name: 'file.name' }, ctx)).toBe('Alpha');
    expect(matchesQuery(parseOk('LIST BLOCKS FROM "Projekte" WHERE status = "offen"'), ctx)).toBe(
      true,
    );
    expect(matchesQuery(parseOk('LIST BLOCKS FROM "Anderswo" WHERE status = "offen"'), ctx)).toBe(
      false,
    );
  });

  it('ohne Block-Kontext bleibt die Datei-Semantik unveraendert', () => {
    const ctx = ctxFor({ props: { status: 'erledigt' } });
    expect(evaluateExpression({ type: 'field', name: 'status' }, ctx)).toBe('erledigt');
    expect(evaluateExpression({ type: 'field', name: 'updated' }, ctx)).toBeNull();
  });
});

// --- 4T-0502 (Epic 3E-0096): relative Datums-Woerter der date(...)-Literale ----

describe('perspective-query-eval — relative Datums-Woerter (4T-0502)', () => {
  // date(<wort>) gegen den injizierten Bezugszeitpunkt NOW (Mi 2026-07-08 12:00).
  const dv = (word) =>
    evaluateExpression(parseOk(`LIST date(${word})`).fields[0].expr, { now: NOW });

  it('Start-Woerter liefern 00:00 des Zieltages', () => {
    expect(dv('today')).toEqual({ kind: 'date', ms: new Date(2026, 6, 8).getTime() });
    expect(dv('tomorrow')).toEqual({ kind: 'date', ms: new Date(2026, 6, 9).getTime() });
    expect(dv('yesterday')).toEqual({ kind: 'date', ms: new Date(2026, 6, 7).getTime() });
    // Woche ab Montag: NOW ist Mittwoch -> sow = Montag 2026-07-06.
    expect(dv('sow')).toEqual({ kind: 'date', ms: new Date(2026, 6, 6).getTime() });
    expect(dv('som')).toEqual({ kind: 'date', ms: new Date(2026, 6, 1).getTime() });
    expect(dv('soy')).toEqual({ kind: 'date', ms: new Date(2026, 0, 1).getTime() });
  });

  it('now liefert den exakten Bezugszeitpunkt', () => {
    expect(dv('now')).toEqual({ kind: 'date', ms: NOW });
  });

  it('End-Woerter liefern das Tages-Ende (23:59:59.999) der Periode', () => {
    // eow = Sonntag 2026-07-12, Tages-Ende (schliesst den letzten Tag ein).
    expect(dv('eow')).toEqual({
      kind: 'date',
      ms: new Date(2026, 6, 12, 23, 59, 59, 999).getTime(),
    });
    expect(dv('eom')).toEqual({
      kind: 'date',
      ms: new Date(2026, 6, 31, 23, 59, 59, 999).getTime(),
    });
    expect(dv('eoy')).toEqual({
      kind: 'date',
      ms: new Date(2026, 11, 31, 23, 59, 59, 999).getTime(),
    });
  });

  it('als Bereichs-Filter: due <= date(eow) schliesst den letzten Perioden-Tag ein', () => {
    const late = { props: { due: '2026-07-12' } }; // Sonntag, letzter Wochentag
    expect(matchWith('WHERE due <= date(eow)', late)).toBe(true);
    const next = { props: { due: '2026-07-13' } }; // Montag der Folgewoche
    expect(matchWith('WHERE due <= date(eow)', next)).toBe(false);
    expect(matchWith('WHERE due >= date(sow)', { props: { due: '2026-07-06' } })).toBe(true);
  });
});

// --- 4T-0502 (Epic 3E-0096): Task-Feld-Katalog des TASKS-Scopes ----------------

describe('perspective-query-eval — Task-Felder (TASKS-Scope, 4T-0502)', () => {
  // Baut einen Task-Kontext (ctx.task) wie frontmatterQueryFor: Modell aus dem
  // Marker-Kern plus die Zusatz-Felder line/heading/statusType/description/tags.
  function taskCtx(line, over = {}) {
    const model = parseTaskLine(line);
    return {
      ...ctxFor({ props: over.props || {} }),
      task: {
        model,
        line: over.line != null ? over.line : 7,
        heading: over.heading !== undefined ? over.heading : 'Kapitel',
        statusType: over.statusType !== undefined ? over.statusType : 'TODO',
        description: model.description.trim(),
        tags: over.tags || [],
        raw: line,
      },
    };
  }
  const field = (ctx, name) => evaluateExpression({ type: 'field', name }, ctx);

  // Referenz-Zeile mit allen Marker-Arten (stabiles Datum 2099 fuer Termin-Werte).
  const FULL =
    '- [ ] Bericht schreiben \u{1F4C5} 2099-01-10 14:00 \u{1F53A} \u{1F501} every week \u{1F194} a1 ⛔ b2, c3';

  it('Termin-Feld liefert einen Datums-Wert; fehlende Felder sind null', () => {
    const ctx = taskCtx(FULL);
    expect(field(ctx, 'due')).toEqual({ kind: 'date', ms: new Date(2099, 0, 10, 14, 0).getTime() });
    expect(field(ctx, 'scheduled')).toBeNull();
    expect(field(ctx, 'start')).toBeNull();
  });

  it('<feld>.set (Marker vorhanden) und <feld>.invalid (ungueltiges Datum)', () => {
    const ctx = taskCtx(FULL);
    expect(field(ctx, 'due.set')).toBe(true);
    expect(field(ctx, 'due.invalid')).toBe(false);
    expect(field(ctx, 'scheduled.set')).toBe(false);
    expect(field(ctx, 'scheduled.invalid')).toBe(false);
    // Ungueltiges Datum: Wert null, aber set true und invalid true.
    const bad = taskCtx('- [ ] X \u{1F4C5} 2099-02-30');
    expect(field(bad, 'due')).toBeNull();
    expect(field(bad, 'due.set')).toBe(true);
    expect(field(bad, 'due.invalid')).toBe(true);
  });

  it('happens: fruehestes gueltiges aus due/scheduled/start', () => {
    // scheduled (2099-03-01) liegt vor due (2099-05-01) -> happens = scheduled.
    const ctx = taskCtx('- [ ] Y \u{1F4C5} 2099-05-01 ⏳ 2099-03-01');
    expect(field(ctx, 'happens')).toEqual({ kind: 'date', ms: new Date(2099, 2, 1).getTime() });
    // Ohne jeden Termin bleibt happens null.
    expect(field(taskCtx('- [ ] Z'), 'happens')).toBeNull();
  });

  it('priority (String-Level, normal ohne Marker) und priority.rank (0-5)', () => {
    expect(field(taskCtx(FULL), 'priority')).toBe('highest');
    expect(field(taskCtx(FULL), 'priority.rank')).toBe(0);
    // Ohne Prioritaets-Marker: 'normal', Rang zwischen mittel und niedrig.
    const plain = taskCtx('- [ ] Ohne Prioritaet');
    expect(field(plain, 'priority')).toBe('normal');
    expect(field(plain, 'priority.rank')).toBe(3);
    // Rang-Ordnung: dringlicher = kleinerer Rang.
    const low = taskCtx('- [ ] Niedrig \u{1F53D}');
    expect(field(low, 'priority.rank')).toBe(4);
    expect(field(taskCtx(FULL), 'priority.rank')).toBeLessThan(field(low, 'priority.rank'));
  });

  it('status (Status-Zeichen) und status.type (aus dem Resolver)', () => {
    expect(field(taskCtx(FULL), 'status')).toBe(' ');
    expect(field(taskCtx(FULL, { statusType: 'TODO' }), 'status.type')).toBe('TODO');
    const inProg = taskCtx('- [/] Laeuft', { statusType: 'IN_PROGRESS' });
    expect(field(inProg, 'status')).toBe('/');
    expect(field(inProg, 'status.type')).toBe('IN_PROGRESS');
    // Ohne aufgeloesten Typ bleibt status.type null.
    expect(field(taskCtx('- [?] Frage', { statusType: null }), 'status.type')).toBeNull();
  });

  it('description, heading und tags', () => {
    const ctx = taskCtx(FULL, { heading: 'Berichte', tags: ['dringend'] });
    expect(field(ctx, 'description')).toBe('Bericht schreiben');
    expect(field(ctx, 'heading')).toBe('Berichte');
    expect(field(ctx, 'tags')).toEqual(['dringend']);
    // Ohne Ueberschrift ist heading null; ohne Tags eine leere Liste.
    const bare = taskCtx('- [ ] Ohne', { heading: null });
    expect(field(bare, 'heading')).toBeNull();
    expect(field(bare, 'tags')).toEqual([]);
  });

  it('recurrence, id, dependson (Liste), line', () => {
    const ctx = taskCtx(FULL, { line: 42 });
    expect(field(ctx, 'recurrence')).toBe('every week');
    expect(field(ctx, 'id')).toBe('a1');
    expect(field(ctx, 'dependson')).toEqual(['b2', 'c3']);
    expect(field(ctx, 'line')).toBe(42);
    // dependson als Liste: Mitgliedschaft ueber contains.
    expect(matchesQuery(parseOk('LIST TASKS WHERE contains(dependson, "b2")'), ctx)).toBe(true);
    expect(matchesQuery(parseOk('LIST TASKS WHERE contains(dependson, "zz")'), ctx)).toBe(false);
    // Ohne Wiederholung/ID sind recurrence/id null.
    const plain = taskCtx('- [ ] Ohne Marker');
    expect(field(plain, 'recurrence')).toBeNull();
    expect(field(plain, 'id')).toBeNull();
    expect(field(plain, 'dependson')).toEqual([]);
  });

  it('feste Task-Feld-Namen verdecken gleichnamige Frontmatter-Properties', () => {
    // props tragen 'due' und 'heading' — die Task-Felder gewinnen.
    const ctx = taskCtx(FULL, { props: { due: '2000-01-01', heading: 'Frontmatter' } });
    expect(field(ctx, 'due')).toEqual({ kind: 'date', ms: new Date(2099, 0, 10, 14, 0).getTime() });
    expect(field(ctx, 'heading')).toBe('Kapitel');
  });

  it('unbekannte Namen fallen auf die Frontmatter-Properties der Traeger-Datei zurueck', () => {
    const ctx = taskCtx('- [ ] Aufgabe', { props: { bereich: 'Privat' } });
    expect(field(ctx, 'bereich')).toBe('Privat');
    expect(field(ctx, 'nichtVorhanden')).toBeNull();
    // file.* bleibt die Traeger-Datei.
    expect(field(ctx, 'file.name')).toBe('Alpha');
  });
});
