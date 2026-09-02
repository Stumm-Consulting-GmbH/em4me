// 4T-001073 (Epic 3E-000211, Datei-Größen-Budget): Schnitt aus
// perspective-query-eval.test.js — die Feld-Auflösung außerhalb des
// Datei-Scopes. Hier liegen der BLOCKS-Scope (ctx.block, 4T-000409) und der
// TASKS-Scope (ctx.task über query-task-fields.js, 4T-000502); die Auswertung
// selbst (Typ-System, file.*-Felder, Funktions-Katalog, FROM-Quellen,
// Selbstbezug, Validierung, Ergebnis-Pipeline, Segmente) bleibt in der
// Ursprungs-Datei. Der Schnitt folgt der Naht, die die Suite schon einmal
// gezogen hat: perspective-query-tasks.test.js trennt dieselbe Fachlichkeit
// auf der Index-Ebene ab. Der Helfer-Kopf (NOW, DAY, parseOk, ctxFor) ist
// nach etablierter Konvention je Datei dupliziert.
import { describe, it, expect } from 'vitest';
import { parseQuery } from '../../src/shared/query/perspective-query.js';
import { matchesQuery, evaluateExpression } from '../../src/shared/query/perspective-query-eval.js';
// 4T-000502 (Epic 3E-000096): Task-Modell fuer die Feld-Aufloesung des TASKS-Scopes.
import { parseTaskLine } from '../../src/shared/tasks/task-markers.js';

const DAY = 24 * 60 * 60 * 1000;
// Fester Bezugszeitpunkt (lokal 2026-07-08 12:00), damit date(today)/date(now)
// deterministisch sind.
const NOW = new Date(2026, 6, 8, 12, 0, 0).getTime();

function parseOk(query) {
  const r = parseQuery(query);
  if (!r.ok) throw new Error(`unerwarteter Parse-Fehler: ${r.error.code}`);
  return r.ast;
}

// Synthetischer Datei-Kontext; Teile über `over` überschreibbar. Wortgleich
// mit der Ursprungs-Datei, damit dieselbe Konstruktion in beiden Dateien
// dasselbe bedeutet.
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
    root: over.root === undefined ? 'C:/Wurzel' : over.root,
    resolveLinkTarget: over.resolveLinkTarget,
    self: over.self,
    locale: over.locale,
  };
}

// --- 4T-000409 (Epic 3E-000077): Feld-Aufloesung im Block-Kontext ------------------

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

// --- 4T-000502 (Epic 3E-000096): Task-Feld-Katalog des TASKS-Scopes ----------------

describe('perspective-query-eval — Task-Felder (TASKS-Scope, 4T-000502)', () => {
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
