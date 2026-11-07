// @vitest-environment jsdom
// 4T-002511 (Epic 3E-000402, Konzept 4T-002506 Abschnitte 2 und 3.3): Platzhalter
// `$name` der Abfrage-Sprache und die Nähte der Abfrage-Befüllung.
//
// Geprüft wird die Stellen-Prüfung am Parser, die Bindung im Hauptprozess über den
// echten Erzeuger (`frontmatterQueryFor`) auf Wegwerf-Bereichen, die Regel «alle»
// am gebundenen Baum und an der Menge, die Hinweise außerhalb eines Dashboards und
// bei unbekanntem Namen bis in die Anzeige, die Naht der Befüllung am Container
// (`befuelleAbfrageContainer` mit `data-fm-params` und `data-fm-form`) und der
// Vorher-nachher-Vergleich über einen festen Satz Bestands-Abfragen.
//
// **Vorher-nachher.** Der Satz `KORPUS` vereint die Abfragen des Vergleichs-Prüffalls
// der Ergebnismenge (ergebnismenge-vorher-nachher.test.js, dessen Aufgaben-Vorlage
// unter test/fixtures/query liegt), die Beispiele der Handbuch-Seite der Abfrage und
// der Render-Vorlage, Grenzfälle der Aggregat-Stellen ohne `GROUP BY` und Abfragen mit
// `$` in Zeichenketten, Verweisen und Literalen. Je Abfrage stehen zwei Prüfsummen,
// aufgenommen am 2026-11-03 einmal mit dem Stand VOR diesem Task: über Parser-Ergebnis,
// Funktions- und Aggregat-Prüfung, und über die Antwort des Erzeugers auf dem Bereich
// `KORPUS_DATEIEN`. Eine Abweichung heißt, dass sich das Ergebnis einer Abfrage
// geändert hat; die Prüfsummen werden nie selbsttätig nachgezogen.
//
// Setup-Muster (Temp-Wurzeln, Index-Warteschleife, Aufräumen) aus
// perspective-query-aggregate.test.js.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  backlinksFor,
  frontmatterQueryFor,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';
import { parseQuery, parseExpression } from '../../src/shared/query/perspective-query.js';
import { evaluateQuery } from '../../src/shared/query/perspective-query-eval.js';
import { isTotalTable, validateQuery } from '../../src/shared/query/query-functions.js';
import { checkGroupedTable } from '../../src/shared/query/query-aggregate.js';
import { bindePlatzhalter } from '../../src/shared/query/query-platzhalter.js';
import { validateResultSet } from '../../src/shared/query/result-set.js';
import { createTaskStatusTypeResolver } from '../../src/shared/markdown/plugins.js';
import {
  buildQueryListDom,
  befuelleAbfrageContainer,
  registriereVorgabeForm,
  waitForFrontmatterQueriesIdle,
} from '../../src/renderer/modules/query/frontmatter-query-view.js';

// Die Brücke des Anzeige-Prozesses: Der Abfrage-Kanal ruft im Prüffall den echten
// Erzeuger, damit die Naht von Container bis Antwort ohne Preload läuft.
const bruecke = vi.hoisted(() => ({ runFrontmatterQuery: null }));
vi.mock('../../src/renderer/modules/app/api.js', async (echt) => ({
  ...(await echt()),
  api: bruecke,
}));

const require_ = createRequire(import.meta.url);
const { clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { clearCaches } = require_('../../src/main/index/record-table-read.js');

const dir = path.dirname(fileURLToPath(import.meta.url));
const de = JSON.parse(readFileSync(path.join(dir, '../../src/i18n/de.json'), 'utf8'));
const tStub = (key) => de[key] ?? key;

// --- Bereich ----------------------------------------------------------------

const KORPUS_DATEIEN = {
  'Abfragen.md': '# Abfragen\n',
  'Projekte/Alpha.md':
    '---\nbereich: Privat\nstatus: offen\nprio: 3\ntags: [rot, aktiv, demo]\nchapter: 1\ntopic: syntax\ntitle: Alpha\nkategorie: x\npunkte: [1, 2]\nwerte: [1, 2, 3]\n---\n# Alpha\n\n## Plan\n\n- [ ] Eins #wichtig\n- [x] Zwei\n\nPunkt eins. ^a1\n',
  'Projekte/Alpha.mdd': JSON.stringify({
    schemaVersion: 1,
    history: { anchors: [], packets: [] },
    blockData: { a1: { values: { status: 'offen', prio: 2 }, updated: '2026-07-01T10:00:00Z' } },
  }),
  'Projekte/Beta.md':
    '---\nbereich: Arbeit\nstatus: erledigt\nprio: 10\ntags: [rund, demo, planning]\nchapter: 3\ntopic: tables\ntitle: Beta\nkategorie: y\npunkte: 4\nwerte: [5]\n---\n# Beta\nSiehe [[Alpha]].\n\n- [ ] Drei\n',
  'Gamma.md':
    '---\nbereich: Archiv\nstatus: offen\ntags: [intern, demo]\nchapter: 2\ntopic: syntax\n---\n# Gamma\n',
  'Bücher.md': [
    '---',
    'db-table:',
    '  fields:',
    '    - name: titel',
    '    - name: autor',
    '    - name: seiten',
    '      type: number',
    '  display: titel',
    '---',
    '',
    '```perspective-records',
    '|- id="r-00001"',
    '| Solaris',
    '| Lem',
    '| 250',
    '|- id="r-00002"',
    '| Anna Karenina',
    '| Tolstoi',
    '| 864',
    '|- id="r-00003"',
    '| Krieg und Frieden',
    '| Tolstoi',
    '| 1200',
    '```',
    '',
  ].join('\n'),
};

const openRoots = new Set();
let tmpDirs = [];

async function bereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-pqp-'));
  tmpDirs.push(wurzel);
  for (const [rel, inhalt] of Object.entries(KORPUS_DATEIEN)) {
    const p = path.join(wurzel, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, inhalt, 'utf8');
    fs.utimesSync(p, new Date(2020, 0, 1), new Date(2020, 0, 1));
  }
  const abfragen = path.join(wurzel, 'Abfragen.md');
  let result = backlinksFor(abfragen);
  openRoots.add(rootForActiveFile(abfragen));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(abfragen);
  }
  expect(result.status).toBe('ready');
  return { abfragen, wurzel, root: rootForActiveFile(abfragen) };
}

afterEach(() => {
  bruecke.runFrontmatterQuery = null;
  clearAllBufferOverlays();
  vergissAlleDefinitionen();
  clearCaches();
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const d of tmpDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* Windows hält die Datei manchmal noch */
    }
  }
  tmpDirs = [];
});

const taskEnv = () => ({
  enabled: true,
  globalFilter: '',
  statusTypeOf: createTaskStatusTypeResolver(null),
});

function antwort(b, abfrage, werte) {
  return frontmatterQueryFor(b.abfragen, abfrage, undefined, taskEnv(), 'de-DE', undefined, werte);
}

// Die Ergebnismenge einer gültigen Abfrage, ohne Befund des Prüfers.
function menge(b, abfrage, werte) {
  const payload = antwort(b, abfrage, werte);
  expect(Object.keys(payload), abfrage).toEqual(['resultSet']);
  expect(validateResultSet(payload.resultSet), abfrage).toEqual([]);
  expect(payload.resultSet.state.queryError, abfrage).toBeNull();
  return payload.resultSet;
}

const namen = (rs) => rs.rows.map((r) => r.origin.name);

// Der Text der Anzeige zu einer Antwort (mit dem echten deutschen Wörterbuch).
function anzeige(payload, kontext) {
  const host = document.createElement('div');
  host.appendChild(buildQueryListDom(structuredClone(payload), tStub, kontext));
  return host;
}

// --- Stellen (AK1) ------------------------------------------------------------

function platzhalterDes(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'param') out.push(node.name);
  for (const key of ['left', 'right', 'operand']) platzhalterDes(node[key], out);
  for (const k of [...(node.args || []), ...(node.values || [])]) platzhalterDes(k, out);
  return out;
}

describe('Stellen der Platzhalter (AK1)', () => {
  it('in WHERE und HAVING an jeder Ausdrucks-Stelle gelesen', () => {
    const faelle = [
      ['LIST WHERE status = $status', ['status']],
      ['LIST WHERE $s = status', ['s']],
      ['LIST WHERE prio IN ($a, 3) OR prio NOT IN ($b)', ['a', 'b']],
      ['LIST WHERE contains(tags, $tag)', ['tag']],
      ['LIST WHERE NOT prio > $p + 1', ['p']],
      ['status = $Status', ['Status']],
      ['LIST GROUP BY status HAVING count() > $n', ['n']],
      ['TABLE prio WHERE a = $ä_1 SORT prio', ['ä_1']],
    ];
    for (const [abfrage, erwartet] of faelle) {
      const r = parseQuery(abfrage);
      expect(r.ok, abfrage).toBe(true);
      expect([...platzhalterDes(r.ast.where), ...platzhalterDes(r.ast.having)], abfrage).toEqual(
        erwartet,
      );
    }
  });

  it('an jeder anderen Stelle der Fehler placeholderPosition mit Position und Name', () => {
    for (const abfrage of [
      'TABLE $x',
      'TABLE upper($x) WHERE a = $y',
      'LIST $x',
      'LIST SORT $x',
      'LIST WHERE a = 1 SORT a, $x DESC',
      'LIST GROUP BY $g',
      'LIST LIMIT $n',
      'LIST FROM $q',
      'LIST FROM #a$b',
      '#a$b',
      'LIST WHERE x = a$b',
      'LIST WHERE a IN $x',
      'LIST DISPLAY $f',
      'LIST TASKS HIDE $e',
    ]) {
      const r = parseQuery(abfrage);
      expect(r.ok, abfrage).toBe(false);
      const pos = abfrage.indexOf('$');
      expect(r.error, abfrage).toMatchObject({ code: 'placeholderPosition', pos });
      expect(r.error.name, abfrage).toBe(/\$([\p{L}_][\p{L}\p{N}_]*)/u.exec(abfrage)[1]);
    }
    // Ausdrücke außerhalb einer Abfrage (Spalten-Formeln, Rechnungen) kennen keinen.
    expect(parseExpression('a + $x').error).toMatchObject({ code: 'placeholderPosition', pos: 4 });
    // Ein Fehler des Parsers an anderer Stelle bleibt, wenn der Platzhalter recht steht.
    expect(parseQuery('LIST WHERE a = $x AND (((').error.code).toBe('unexpectedEnd');
  });

  it('ein $ ohne gültigen Namen bleibt unexpectedChar', () => {
    for (const abfrage of [
      'LIST WHERE a = $',
      'LIST WHERE a = $1',
      'LIST WHERE a = $-x',
      'LIST WHERE a = $ x',
    ]) {
      expect(parseQuery(abfrage).error, abfrage).toMatchObject({
        code: 'unexpectedChar',
        pos: abfrage.indexOf('$'),
      });
    }
  });

  it('Rückwärtskompatibilität: die vier Fälle aus Abschnitt 2 des Konzepts', () => {
    // War der Fehler unexpectedChar an Position 20, ist jetzt gültig.
    expect(parseQuery('LIST WHERE status = $status').ok).toBe(true);
    // In einer Zeichenkette bleibt `$` Text.
    expect(parseQuery('LIST WHERE status = "$x"').ast.where.right).toEqual({
      type: 'str',
      value: '$x',
    });
    // Verweise und die Literale date(…) und dur(…) liest der Tokenizer roh ein.
    expect(parseQuery('LIST FROM [[Kosten $ 2026]]').ast.source.target).toBe('Kosten $ 2026');
    expect(parseQuery('LIST WHERE d = date($x)').error.code).toBe('invalidDate');
    expect(parseQuery('LIST WHERE d = dur($x)').error.code).toBe('invalidDuration');
    // `#a$b` bleibt ein Fehler, jetzt mit dem Code der Stelle.
    expect(parseQuery('#a$b').error.code).toBe('placeholderPosition');
  });
});

// --- Bindung (AK2) ------------------------------------------------------------

describe('Bindung im Hauptprozess (AK2)', () => {
  it('ein Wert wirkt wie das gleichlautende Literal, bei Listen als Mitgliedschaft', async () => {
    const b = await bereich();
    const offen = menge(b, 'LIST WHERE status = $status', { status: 'OFFEN' });
    expect(namen(offen)).toEqual(namen(menge(b, 'LIST WHERE status = "OFFEN"')));
    expect(namen(offen)).toEqual(['Alpha', 'Gamma']);
    expect(offen.state.hint).toBeNull();
    expect(namen(menge(b, 'LIST WHERE tags = $t', { t: 'rund' }))).toEqual(['Beta']);
    expect(namen(menge(b, 'LIST WHERE contains(tags, $t)', { t: 'demo' }))).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
    // Name ohne Rücksicht auf die Schreibung.
    expect(namen(menge(b, 'LIST WHERE status = $Status', { STATUS: 'erledigt' }))).toEqual([
      'Beta',
    ]);
    const buecher = menge(b, 'LIST RECORDS FROM "Bücher" WHERE autor = $a', { a: 'tolstoi' });
    expect(buecher.rows.map((r) => r.origin.id)).toEqual(['r-00002', 'r-00003']);
  });

  it('ein Wert wird nie als Abfrage-Text gelesen', async () => {
    const b = await bereich();
    for (const wert of ['offen" OR status = "erledigt', '$status', ') OR (1 = 1']) {
      const rs = menge(b, 'LIST WHERE status = $status', { status: wert });
      expect(rs.rows, wert).toEqual([]);
    }
    const { ast } = bindePlatzhalter(parseQuery('LIST WHERE status = $s').ast, { s: 'a" OR "b' });
    expect(ast.where.right).toEqual({ type: 'str', value: 'a" OR "b' });
    // Ohne Platzhalter kommt derselbe Baum zurück.
    const ohne = parseQuery('LIST WHERE status = "x"').ast;
    expect(bindePlatzhalter(ohne, { s: 'y' })).toEqual({ ast: ohne, hinweis: null });
    expect(bindePlatzhalter(ohne, { s: 'y' }).ast).toBe(ohne);
  });
});

// --- «alle» (AK3) -------------------------------------------------------------

describe('«alle»: die kleinste Bedingung wird erfüllt (AK3)', () => {
  const alle = (abfrage) => bindePlatzhalter(parseQuery(abfrage).ast, { s: null }).ast;
  const ERFUELLT = { type: 'always' };

  it('Vergleich, IN-Liste und Funktion samt NOT darüber werden zum Knoten «erfüllt»', () => {
    expect(alle('LIST WHERE status = $s').where).toEqual(ERFUELLT);
    expect(alle('LIST WHERE NOT status = $s').where).toEqual(ERFUELLT);
    expect(alle('LIST WHERE NOT NOT status = $s').where).toEqual(ERFUELLT);
    expect(alle('LIST WHERE prio IN ($s, 3)').where).toEqual(ERFUELLT);
    expect(alle('LIST WHERE contains(tags, $s)').where).toEqual(ERFUELLT);
    expect(alle('LIST WHERE a = 1 AND status = $s').where).toMatchObject({
      type: 'and',
      left: { type: 'cmp' },
      right: ERFUELLT,
    });
    // Ein NOT über einer zusammengesetzten Bedingung gehört nicht zur kleinsten.
    expect(alle('LIST WHERE NOT (a = 1 AND b = $s)').where).toMatchObject({
      type: 'not',
      operand: { type: 'and', left: { type: 'cmp' }, right: ERFUELLT },
    });
    expect(alle('LIST GROUP BY k HAVING count() > $s').having).toEqual(ERFUELLT);
    // Funktions- und Aggregat-Prüfung sehen ihn wie ein Literal ohne Feld-Bezug.
    expect(validateQuery(alle('LIST GROUP BY k HAVING count() > $s'))).toBeNull();
    expect(checkGroupedTable(alle('TABLE count() GROUP BY k HAVING count() > $s'))).toBeNull();
  });

  it('AND und OR rechnen normal; «alle» ist null, nie die Zeichenkette', async () => {
    const b = await bereich();
    const ohneFilter = namen(menge(b, 'LIST'));
    expect(ohneFilter).toHaveLength(5);
    expect(namen(menge(b, 'LIST WHERE prio = 3 OR status = $s', { s: null }))).toEqual(ohneFilter);
    expect(namen(menge(b, 'LIST WHERE NOT status = $s', { s: null }))).toEqual(ohneFilter);
    expect(namen(menge(b, 'LIST WHERE bereich = "Privat" AND status = $s', { s: null }))).toEqual([
      'Alpha',
    ]);
    expect(menge(b, 'LIST WHERE status = $s', { s: 'alle' }).rows).toEqual([]);
    const gruppen = menge(b, 'LIST GROUP BY status HAVING count() > $s', { s: null });
    expect(gruppen.groups).toEqual(menge(b, 'LIST GROUP BY status').groups);
    // Zwei Platzhalter: der eine gebunden, der andere «alle».
    const zwei = menge(b, 'LIST WHERE status = $s AND bereich = $b', { s: 'offen', b: null });
    expect(namen(zwei)).toEqual(['Alpha', 'Gamma']);
  });
});

// --- Außerhalb eines Dashboards und unbekannter Name (AK4) -------------------

describe('Außerhalb eines Dashboards und unbekannter Name (AK4)', () => {
  it('ohne Werte gilt jeder Platzhalter als «alle», mit Hinweis statt Fehler', async () => {
    const b = await bereich();
    const rs = menge(b, 'LIST WHERE status = $status');
    expect(namen(rs)).toEqual(namen(menge(b, 'LIST')));
    expect(rs.state.hint).toBe('placeholderOutside');
    const buecher = menge(b, 'LIST RECORDS FROM "Bücher" WHERE autor = $autor');
    expect(buecher.rows).toHaveLength(3);
    expect(buecher.state.hint).toBe('placeholderOutside');
    const text = anzeige({ resultSet: rs }).querySelector('.perspective-query-hint').textContent;
    expect(text).toBe(
      "Hinweis: Die Abfrage enthält Platzhalter; außerhalb eines Dashboards gelten sie als 'alle'",
    );
  });

  it('ein Name, den das Dashboard nicht kennt, gilt als «alle» und wird genannt', async () => {
    const b = await bereich();
    for (const werte of [{}, { andere: 'x' }]) {
      const rs = menge(b, 'LIST WHERE status = $status', werte);
      expect(rs.rows).toHaveLength(5);
      expect(rs.state).toMatchObject({ hint: 'placeholderUnknown', hintName: 'status' });
    }
    // Auch über einer leeren Menge erscheint der Hinweis vor «keine Treffer».
    const leer = menge(b, 'LIST WHERE status = $status AND prio > 99', {});
    expect(leer.rows).toEqual([]);
    const host = anzeige({ resultSet: leer });
    expect(host.querySelector('.perspective-query-hint').textContent).toBe(
      "Hinweis: Das Dashboard hat keinen Filter 'status'; der Platzhalter gilt deshalb als 'alle'",
    );
    expect(host.textContent).toContain(de['query.empty']);
  });

  it('ein Abfrage-Fehler geht dem Hinweis vor; ohne Platzhalter bleibt die Antwort wie bisher', async () => {
    const b = await bereich();
    const rs = antwort(b, 'LIST WHERE status = $s SORT gibtsnicht(1)').resultSet;
    expect(rs.state).toMatchObject({ hint: null, queryError: { code: 'unknownFunction' } });
    expect(antwort(b, 'LIST WHERE status = "offen"', {})).toEqual(
      antwort(b, 'LIST WHERE status = "offen"'),
    );
    // Der Platzhalter-Fehler der Stelle erscheint lokalisiert.
    const fehler = antwort(b, 'TABLE $x');
    expect(anzeige(fehler).textContent).toBe(
      'Ungültige Abfrage: Ein Platzhalter ($name) steht nur in WHERE oder HAVING (Position 6)',
    );
  });

  it('der Auswerter wertet einen nicht gebundenen Platzhalter als «alle» (Rückfall)', () => {
    const ast = parseQuery('LIST WHERE status = $s AND prio > 2').ast;
    expect(evaluateQuery(ast, { status: 'egal', prio: 3 })).toBe(true);
    expect(evaluateQuery(ast, { status: 'egal', prio: 1 })).toBe(false);
  });
});

// --- Gesamt-Wert in der Anzeige (V9, AK6) ------------------------------------

describe('Gesamt-Wert in der Anzeige (V9)', () => {
  it('die Tabelle des Gesamt-Werts zeigt ihre Zeile, auch ohne Treffer mit 0', async () => {
    const b = await bereich();
    const voll = anzeige(antwort(b, 'TABLE WITHOUT ID count() AS "Anzahl", sum(prio)'));
    expect([...voll.querySelectorAll('tbody tr')].map((tr) => tr.textContent)).toEqual(['513']);
    const leer = anzeige(antwort(b, 'TABLE WITHOUT ID count() AS "Anzahl" WHERE prio > 99'));
    expect([...leer.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['Anzahl']);
    expect([...leer.querySelectorAll('tbody tr')].map((tr) => tr.textContent)).toEqual(['0']);
    // Eine gruppierte Tabelle ohne Treffer zeigt weiterhin «keine Treffer».
    const gruppiert = anzeige(antwort(b, 'TABLE count() WHERE prio > 99 GROUP BY status'));
    expect(gruppiert.textContent).toBe(de['query.empty']);
  });
});

// --- Naht der Abfrage-Befüllung (AK8) -----------------------------------------

describe('Naht der Abfrage-Befüllung (AK8)', () => {
  function container(attrs) {
    const el = document.createElement('div');
    el.className = 'perspective-query';
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return el;
  }

  function kanal(b) {
    bruecke.runFrontmatterQuery = vi.fn((pfad, abfrage, lang, werte) =>
      Promise.resolve(antwort(b, abfrage, werte)),
    );
    return bruecke.runFrontmatterQuery;
  }

  it('data-fm-params reist zum Kanal; ohne die Angabe bleibt der Aufruf, wie er war', async () => {
    const b = await bereich();
    const run = kanal(b);
    const mit = container({
      'data-fm-query': 'LIST WHERE status = $status',
      'data-fm-params': JSON.stringify({ status: 'erledigt' }),
    });
    const ohne = container({ 'data-fm-query': 'LIST WHERE status = $status' });
    const kaputt = container({ 'data-fm-query': 'LIST', 'data-fm-params': '{nicht json' });
    befuelleAbfrageContainer(mit, b.abfragen);
    befuelleAbfrageContainer(ohne, b.abfragen);
    befuelleAbfrageContainer(kaputt, b.abfragen);
    await waitForFrontmatterQueriesIdle();
    expect(run.mock.calls.map((c) => [c[0], c[1], c[3]])).toEqual([
      [b.abfragen, 'LIST WHERE status = $status', { status: 'erledigt' }],
      [b.abfragen, 'LIST WHERE status = $status', undefined],
      [b.abfragen, 'LIST', {}],
    ]);
    expect([...mit.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Beta']);
    expect(mit.dataset.fmBase).toBe(b.abfragen);
    expect(ohne.querySelector('.perspective-query-hint')).not.toBeNull();
    expect(ohne.querySelectorAll('a')).toHaveLength(5);
  });

  it('data-fm-form setzt eine Vorgabe-Form gegen den Wunsch DISPLAY', async () => {
    const b = await bereich();
    kanal(b);
    const gesehen = [];
    const abmelden = registriereVorgabeForm('pqp-zahl', {
      isSuitable: (rs) => rs.type === 'table',
      render: (rs) => {
        gesehen.push(rs.wishes.display);
        const div = document.createElement('div');
        div.className = 'pqp-zahl';
        div.textContent = String(rs.rows.length);
        return div;
      },
    });
    try {
      expect(() => registriereVorgabeForm('PQP-Zahl', { isSuitable() {}, render() {} })).toThrow();
      const el = container({
        'data-fm-query': 'TABLE status DISPLAY tree BY status',
        'data-fm-form': 'pqp-zahl',
      });
      befuelleAbfrageContainer(el, b.abfragen);
      await waitForFrontmatterQueriesIdle();
      expect(el.querySelector('.pqp-zahl').textContent).toBe('5');
      expect(gesehen).toEqual([{ form: 'pqp-zahl', by: null }]);
      expect(el.querySelector('.perspective-query-hint')).toBeNull();
      // Passt die Form nicht, erscheint die Ausgabe ohne Angabe mit dem Hinweis.
      const liste = anzeige(antwort(b, 'LIST'), { vorgabeForm: 'pqp-zahl' });
      expect(liste.querySelector('.pqp-zahl')).toBeNull();
      expect(liste.querySelector('.perspective-query-hint').textContent).toContain('pqp-zahl');
      // Eine interne Form ist über DISPLAY nicht erreichbar.
      const ueberDisplay = anzeige(antwort(b, 'TABLE status DISPLAY pqp-zahl'));
      expect(ueberDisplay.querySelector('.pqp-zahl')).toBeNull();
      expect(ueberDisplay.querySelector('.perspective-query-hint').textContent).toBe(
        de['query.hint.displayFormUnknown'].replace('{name}', 'pqp-zahl'),
      );
      // Eine öffentliche Vorgabe läuft über das Verzeichnis der Formen.
      const unbekannt = anzeige(antwort(b, 'TABLE status DISPLAY tree BY status'), {
        vorgabeForm: 'gibtsnicht',
      });
      expect(unbekannt.querySelector('.perspective-query-hint').textContent).toBe(
        de['query.hint.displayFormUnknown'].replace('{name}', 'gibtsnicht'),
      );
    } finally {
      abmelden();
    }
  });
});

// --- Vorher-nachher über den Satz der Bestands-Abfragen (AK5) -----------------

const digest = (wert) =>
  crypto.createHash('sha256').update(JSON.stringify(wert)).digest('hex').slice(0, 12);

function geprueft(abfrage) {
  const p = parseQuery(abfrage);
  return {
    p,
    v: p.ok ? validateQuery(p.ast) : null,
    g: p.ok ? checkGroupedTable(p.ast) : null,
  };
}

function ausgewertet(b, abfrage) {
  let text = JSON.stringify(
    frontmatterQueryFor(b.abfragen, abfrage, undefined, taskEnv(), 'de-DE'),
  );
  for (const w of [b.root, b.wurzel].map((x) => JSON.stringify(x).slice(1, -1))) {
    text = text.split(w).join('<ROOT>');
  }
  return JSON.parse(text.replace(/\\\\/g, '/'));
}

// [Abfrage, Prüfsumme der Prüfung, Prüfsumme der Antwort], aufgenommen vor 4T-002511.
const KORPUS = [
  [
    'TABLE chapter AS "Ch.", topic AS "Topic"\nFROM #demo\nSORT chapter',
    '11f5b5bb7d25',
    'd0cde7364ab7',
  ],
  ['LIST FROM #planning SORT file.name', '2b9b98b4445d', '39ea5ed62c9e'],
  ['LIST topic WHERE topic = "syntax"', '1bce4a22829f', '7d28d0bbff0b'],
  ['LIST FROM [[00 Welcome]] SORT file.name', '5b6b6666f410', '392e7a9a2c94'],
  [
    'TABLE bold(title) AS "Page", topic AS "Topic"\nFROM [[]]\nSORT chapter',
    '45a0a7d2d4dd',
    '75747836b2f3',
  ],
  ['LIST FROM #demo WHERE chapter > this.chapter SORT chapter', '1ecfc5d15f78', '392e7a9a2c94'],
  [
    'TABLE WITHOUT ID file.link AS "Seite", chapter FROM #demo SORT chapter',
    'aa2bc1066ac1',
    'f9db67d4e32b',
  ],
  ['LIST FROM #demo SORT chapter COLUMNS 3', '40ae0bd7aa4b', '6c7a29eec671'],
  ['TABLE chapter FROM #demo SORT chapter COLUMNS 2', '93ea915dce97', 'ee700fc639ec'],
  [
    'TABLE prio * 2 AS "Doppelt", prio > 5, file.link, file.outlinks, file.tags, gibtsnicht FROM "Projekte" SORT file.name',
    '53c45c441fbb',
    '802b68a4d1fd',
  ],
  [
    'TABLE "Kap. " + bold(chapter) AS "Kapitel", bold(file.link) FROM #demo SORT chapter LIMIT 3',
    '05c1958a2c0a',
    '69092a4469b6',
  ],
  ['LIST file.outlinks FROM "Projekte" SORT file.name', '074d46fead4d', '0f47ed79a07f'],
  ['LIST FROM #demo GROUP BY chapter', '68143d60d26a', '8276085c568b'],
  [
    'TABLE count() AS "Anzahl", sum(chapter) AS "Kapitel" FROM #demo GROUP BY topic',
    '640a2bd8373b',
    '33f95b722006',
  ],
  ['LIST WHERE chapter > 100', 'ad7913906eb1', '392e7a9a2c94'],
  ['TABLE chapter WHERE chapter > 100', 'c78ace3b2b47', '975a3be5e750'],
  ['LIST BLOCKS', '3bedc107990a', '72a366eb53dd'],
  ['TABLE BLOCKS status, prio SORT prio', 'c685706d3b5e', '8f1fcee01496'],
  ['TABLE BLOCKS WITHOUT ID status', 'fc3984da46ec', '23fe1e2aa209'],
  ['TABLE TASKS description, line', '84082578393f', 'bc9bd4fa8a5b'],
  ['TABLE TASKS WITHOUT ID description', '8ab8545ab483', '3a2891cdcdbb'],
  ['LIST TASKS', '95aae348c7cb', 'befdbb1746c6'],
  ['LIST TASKS GROUP BY file.name', '4be50ca6ee2b', '63814441e278'],
  ['LIST WHERE (((', '3184b4ca5149', 'da79ea19e1a4'],
  ['LIST WHERE gibtsnicht(1)', '8a4bf319dde3', '1b81aef8037a'],
  ['LIST WHERE a = 1 WHERE b = 2', 'cf63b7d1dba6', 'abcdef03377f'],
  ['LIST SHORT', '877e778c7ee2', '220985264fe5'],
  ['LIST COLUMNS 9', '9c06602501c1', 'ebcf140e96d6'],
  ['LIST TASKS WHERE status.type = "TODO"', '277adea60df8', '417f5a4ab324'],
  ['LIST TASKS GROUP BY heading, priority', '9790339c2667', '7dd11cfbb30e'],
  ['LIST TASKS HIDE due, backlink, tags, count, id', '53f81918f46d', 'ced2858135ab'],
  ['LIST TASKS SHOW urgency HIDE backlink, created SHORT', '67b5bc52a29b', '90c869e40e5a'],
  ['LIST TASKS bold(heading) GROUP BY bold(heading)', 'a56a0842cc97', '70df2f1563a9'],
  ['LIST TASKS SORT description LIMIT 3', 'a0804551f1fc', '87268c3e93d4'],
  ['bereich = "Privat"', '801f98f8e58d', '4d8124a40e2c'],
  ['LIST BLOCKS WHERE status = "offen" SORT updated DESC', '785385dcbc6e', '72a366eb53dd'],
  [
    'TABLE BLOCKS status AS "Status", updated\nFROM "Projekte"\nWHERE prio > 2',
    '9361e1a1cc78',
    '5b8a7e19d4c5',
  ],
  [
    'TABLE RECORDS autor, seiten\nFROM "Bücher"\nWHERE seiten > 500\nSORT autor',
    '5e03a58c9c42',
    'e354b8721353',
  ],
  ['LIST RECORDS FROM "Bücher" WHERE autor = "Lem"', '56c7e01a70bb', '042179e0ac40'],
  ['FROM ("Projekte" OR #wichtig) AND -#archiv', 'a377d8c4aa18', 'dfca97c9f1f6'],
  [
    'LIST WHERE bereich = this.bereich AND file.path != this.file.path',
    'eab5eb546a1a',
    '392e7a9a2c94',
  ],
  [
    'TABLE RECORDS count() AS "Bücher", sum(seiten) AS "Seiten"\nFROM "Bücher"\nGROUP BY autor\nHAVING count() > 1\nSORT count() DESC, autor',
    '5439065f0ebf',
    'cdfb45a61792',
  ],
  ['LIST FROM #lesezeichen COLUMNS 3', '6ad603b3fb64', '5ca0472e0e61'],
  [
    'TABLE seiten AS "Seiten", preis AS "Preis"\nFROM "Bücher"\nSORT seiten\nDISPLAY bar',
    '053e583fed5e',
    'cf7289a8bd6b',
  ],
  ['LIST', '253e7d12318c', '8e31bae9afe8'],
  ['TABLE', '1b50c4553e4a', 'b96d172b3c96'],
  ['LIST WHERE bedingung', 'f6fe4fe49833', '7b04b94aa3fc'],
  ['TABLE WITHOUT ID …', '612fdb98c1f8', '1147cbd755d4'],
  ['TABLE sum(werte)', '76862785f7a3', '087a4379c960'],
  ['TABLE sum(werte) GROUP BY status', 'd68c62ec9b7e', 'f937dc85bc3a'],
  ['LIST GROUP BY status HAVING count() > 2', '7fb93901d7da', 'f2cf3b624705'],
  [
    '(bereich = "Privat" AND tags IN ("rot", "rund")) OR NOT status = "erledigt"',
    'bca3feb45677',
    '772a29ed8401',
  ],
  ['bereich != "Archiv"\nAND tags NOT IN ("intern", "entwurf")', '7f5793fd14e8', '5558677306bf'],
  ['bereich =', 'ab1ce8e8b3b7', '8619511e3b5b'],
  [
    'TABLE sum(punkte), count(punkte) WHERE file.name != "Abfragen"',
    '0a55b4eb2eb7',
    '9a9321446f2d',
  ],
  ['TABLE count()', '1bc1d7582b29', '36a9777900d9'],
  ['LIST count()', '0364487b5f09', '487db06d5027'],
  ['TABLE WITHOUT ID file.name, sum(werte)', 'b60da0e896e8', 'ad3e630b368b'],
  ['TABLE WITHOUT ID bereich, count(tags)', '9d05e57779b1', '932ea9a215fd'],
  [
    'TABLE RECORDS sum(seiten), count(titel) FROM "Bücher" WHERE autor = "Tolstoi"',
    '39bddca0f07b',
    'd5b63ffdd8a6',
  ],
  ['TABLE TASKS count(tags)', '43b3e23532e6', '12c8384107c7'],
  ['LIST WHERE contains(tags, "rot")', '88e9005b68d4', '4d8124a40e2c'],
  ['LIST WHERE NOT contains(tags, "rot") AND prio IN (3, 10)', 'a1b5ad1b05cf', '39ea5ed62c9e'],
  ['LIST WHERE status = "$x"', 'dc2f0d078bd0', '392e7a9a2c94'],
  ['LIST WHERE status = \'$status\' OR bereich = "a$b"', 'ac84b80355ad', '392e7a9a2c94'],
  ['LIST FROM [[Kosten $ 2026]]', '0e19530a728d', '392e7a9a2c94'],
  ['TABLE WITHOUT ID "$" + prio AS "Preis" FROM "Projekte"', '380bc0cf543d', '12a95aa48c90'],
];

describe('Vorher gleich nachher über den Satz der Bestands-Abfragen (AK5)', () => {
  it('keine Prüfung und keine Antwort einer Bestands-Abfrage hat sich geändert', async () => {
    const b = await bereich();
    const abweichend = KORPUS.filter(
      ([abfrage, vorPruefung, vorAntwort]) =>
        digest(geprueft(abfrage)) !== vorPruefung || digest(ausgewertet(b, abfrage)) !== vorAntwort,
    ).map(([abfrage]) => abfrage);
    expect(abweichend).toEqual([]);
  });

  it('der Satz ist nicht leer gelaufen und trifft die neuen Wege nicht', async () => {
    // Schwund-Schutz: Treffer auf allen vier Ebenen, gruppiert und ungruppiert,
    // gültige und ungültige Abfragen.
    const b = await bereich();
    const mengen = KORPUS.map(([abfrage]) => antwort(b, abfrage).resultSet);
    const ebenen = new Set(mengen.filter((rs) => rs.rows.length > 0).map((rs) => rs.scope));
    expect([...ebenen].sort()).toEqual(['blocks', 'files', 'records', 'tasks']);
    expect(mengen.some((rs) => Array.isArray(rs.groups) && rs.groups.length > 0)).toBe(true);
    expect(mengen.filter((rs) => rs.state.queryError).length).toBeGreaterThan(5);
    // Keine Abfrage des Satzes trägt einen Platzhalter oder ist eine Gesamt-Tabelle.
    for (const [abfrage] of KORPUS) {
      const r = parseQuery(abfrage);
      if (!r.ok) continue;
      expect(platzhalterDes(r.ast.where), abfrage).toEqual([]);
      expect(isTotalTable(r.ast), abfrage).toBe(false);
    }
  });
});
