// @vitest-environment jsdom
// 4T-002515 (Epic 3E-000402): Kacheln eines Dashboards befüllen. Geprüft wird am
// Anzeige-Prozess, was jede Kachel-Art aus der Ergebnismenge ihrer Abfrage
// zeichnet (Konzept-Stufe 4T-002506, Abschnitt 1.6): die internen Formen
// `kennzahl`, `liste` und `tabelle` (`dashboard-formen.js`), Balken und Kreis
// über die Formen `bar` und `pie` der Abfrage samt Rückfall, der
// Befüllungs-Schritt (`dashboard-view.js`) am Markup des Blocks und die
// Befüllung der umgestellten Kacheln über die Abfrage-Befüllung mit einer
// Attrappe des Abfrage-Kanals: Werte der Filter, Fehler an seinem Platz und
// Live-Nachzug.
//
// Der Weg ist derselbe wie in frontmatter-query-view.test.js: Antworten aus den
// Aufbau-Funktionen des Format-Vertrags, `buildQueryListDom` mit Vorgabe-Form,
// der Übersetzer liest die erzeugte de.json, damit die Schlüssel mitgeprüft
// werden.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Attrappe des Abfrage-Kanals für die Fälle der Befüllung; die Fälle der Formen
// brauchen ihn nicht.
const kanal = vi.hoisted(() => ({ antworten: new Map(), aufrufe: [] }));
vi.mock('../../../src/renderer/modules/app/api.js', () => ({
  api: {
    runFrontmatterQuery: (basePath, query, locale, params) => {
      kanal.aufrufe.push({ basePath, query, params });
      return Promise.resolve(kanal.antworten.get(query.trim()));
    },
  },
  $: () => null,
}));

import {
  buildQueryListDom,
  applyFrontmatterQueriesIfPresent,
  waitForFrontmatterQueriesIdle,
  refreshVisibleFrontmatterQueries,
} from '../../../src/renderer/modules/query/frontmatter-query-view.js';
import {
  kennzahlAuswertung,
  kennzahlText,
} from '../../../src/renderer/modules/dashboard/dashboard-formen.js';
import {
  bereiteDashboardKachelnVor,
  vorbelegungenDes,
} from '../../../src/renderer/modules/dashboard/dashboard-view.js';
import { renderDashboardBlock } from '../../../src/shared/markdown/dashboard-block.js';
import {
  makeColumn,
  fileOrigin,
  recordOrigin,
  taskOrigin,
  makeTaskInfo,
  makeRow,
  makeGroup,
  makeWishes,
  makeState,
  makeResultSet,
} from '../../../src/shared/query/result-set.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const de = JSON.parse(readFileSync(path.join(dir, '../../../src/i18n/de.json'), 'utf8'));
const tStub = (key) => de[key] ?? key;

// --- Bausteine der Antworten --------------------------------------------------------

const spalte = (label) => makeColumn({ name: label, label, source: label });
const datei = (name) => fileOrigin(`/raum/${name}.md`, name);
const zeile = (name, values = []) => makeRow(values, datei(name));

function menge({
  scope = 'files',
  type = 'list',
  columns = [],
  rows = [],
  groups = null,
  groupColumns = null,
  wishes,
  hint = null,
} = {}) {
  return {
    resultSet: makeResultSet({
      scope,
      type,
      columns,
      rows,
      groups,
      groupColumns,
      wishes: makeWishes(wishes),
      state: makeState('ready', { hint, area: { root: '/raum', fileCount: 3 } }),
    }),
  };
}

// Gruppe der untersten Stufe mit Werten über der Gruppe.
function gruppe(value, rows, values) {
  const g = makeGroup(value, rows);
  if (values) g.values = values;
  return g;
}

// Die gruppierte Tabelle nach Status: offen (2 Treffer), erledigt (1 Treffer).
function nachStatus({ werte = [[2], [1]], spalten = [spalte('count()')], wishes } = {}) {
  return menge({
    type: 'table',
    columns: spalten,
    rows: [zeile('a', [null]), zeile('b', [null]), zeile('c', [null])],
    groups: [gruppe('offen', [0, 1], werte[0]), gruppe('erledigt', [2], werte[1])],
    groupColumns: [spalte('status')],
    wishes,
  });
}

// Die Tabelle des Gesamt-Werts (V9): WITHOUT ID, eine Gruppe ohne Wert und ohne
// Gruppen-Spalte.
function gesamt({ treffer = 2, werte = [1234.5], spalten = [spalte('sum(betrag)')] } = {}) {
  const rows = Array.from({ length: treffer }, (_, i) =>
    zeile(
      `d${i}`,
      spalten.map(() => null),
    ),
  );
  return menge({
    type: 'table',
    columns: spalten,
    rows,
    groups: [
      gruppe(
        null,
        rows.map((_, i) => i),
        werte,
      ),
    ],
    groupColumns: [],
    wishes: { withoutId: true },
  });
}

// Zeichen-Funktion der Diagramme und Schalt-Zustand ohne Brücke.
function diagrammKontext(aktiv = true) {
  const gezeichnet = [];
  return {
    gezeichnet,
    kontext: {
      locale: 'de-DE',
      isExtensionActive: () => aktiv,
      drawChart: (input) => {
        gezeichnet.push(input);
        return { status: 'drawn', svg: '<svg data-probe="1"></svg>' };
      },
    },
  };
}

function zeichne(payload, vorgabeForm, extra = {}) {
  const host = document.createElement('div');
  const { kontext } = diagrammKontext();
  host.appendChild(buildQueryListDom(payload, tStub, { ...kontext, ...extra, vorgabeForm }));
  return host;
}

const hinweisText = (host) => {
  const el = host.querySelector('.perspective-query-hint');
  return el ? el.textContent : null;
};
const werteDer = (host) =>
  [...host.querySelectorAll('.dashboard-kennzahl-wert')].map((el) => el.textContent);
const beschriftungen = (host) =>
  [...host.querySelectorAll('.dashboard-kennzahl-beschriftung')].map((el) => el.textContent);

// --- Kennzahl (AK1, AK2) --------------------------------------------------------------

describe('dashboard-formen: Kennzahl', () => {
  it('ungruppierte Liste: Zahl der Treffer als eine große Zahl (AK1)', () => {
    const host = zeichne(menge({ rows: [zeile('a'), zeile('b'), zeile('c')] }), 'kennzahl');
    expect(host.querySelector('.dashboard-kennzahl-einzeln')).not.toBeNull();
    expect(werteDer(host)).toEqual(['3']);
    expect(host.querySelector('.perspective-query-list')).toBeNull();
    expect(hinweisText(host)).toBeNull();
  });

  it('ungruppierte Tabelle: Zahl der Zeilen nach LIMIT, nicht die Werte', () => {
    const host = zeichne(
      menge({ type: 'table', columns: [spalte('seiten')], rows: [zeile('a', [80])] }),
      'kennzahl',
    );
    expect(werteDer(host)).toEqual(['1']);
  });

  it('gruppierte Liste: je Gruppe die Zahl ihrer Treffer mit Beschriftung (AK1)', () => {
    const payload = menge({
      rows: [zeile('a'), zeile('b'), zeile('c')],
      groups: [makeGroup('offen', [0, 1]), makeGroup(null, [2])],
    });
    const host = zeichne(payload, 'kennzahl');
    expect(host.querySelector('.dashboard-kennzahl-gruppen')).not.toBeNull();
    expect(werteDer(host)).toEqual(['2', '1']);
    expect(beschriftungen(host)).toEqual(['offen', de['query.group.none']]);
  });

  it('gruppierte Liste über zwei Stufen: Beschriftung aus beiden Gruppen-Werten', () => {
    const payload = menge({
      rows: [zeile('a'), zeile('b')],
      groups: [makeGroup('hoch', [0, 1], [makeGroup('offen', [0]), makeGroup('erledigt', [1])])],
    });
    const host = zeichne(payload, 'kennzahl');
    expect(beschriftungen(host)).toEqual(['hoch › offen', 'hoch › erledigt']);
    expect(werteDer(host)).toEqual(['1', '1']);
  });

  it('gruppierte Tabelle: je Gruppe der erste Spalten-Wert mit Zahl (AK1)', () => {
    const host = zeichne(
      nachStatus({
        spalten: [spalte('titel'), spalte('count()')],
        werte: [
          ['x', 2],
          ['y', 1],
        ],
      }),
      'kennzahl',
    );
    expect(werteDer(host)).toEqual(['2', '1']);
    expect(beschriftungen(host)).toEqual(['offen', 'erledigt']);
  });

  it('eine einzige Gruppe ergibt eine große Zahl ohne Beschriftung', () => {
    const payload = menge({
      type: 'table',
      columns: [spalte('count()')],
      rows: [zeile('a', [null])],
      groups: [gruppe('offen', [0], [7])],
      groupColumns: [spalte('status')],
    });
    const host = zeichne(payload, 'kennzahl');
    expect(host.querySelector('.dashboard-kennzahl-einzeln')).not.toBeNull();
    expect(werteDer(host)).toEqual(['7']);
    expect(beschriftungen(host)).toEqual([]);
  });

  it('Gesamt-Wert: sum(…) ohne Gruppierung in der Form der Oberflächen-Sprache (AK2)', () => {
    const host = zeichne(gesamt(), 'kennzahl');
    expect(werteDer(host)).toEqual(['1.234,5']);
    const en = zeichne(gesamt(), 'kennzahl', { locale: 'en-US' });
    expect(werteDer(en)).toEqual(['1,234.5']);
  });

  it('Gesamt-Wert: der erste messbare Wert, ein fehlender davor zählt nicht', () => {
    const host = zeichne(
      gesamt({ spalten: [spalte('sum(x)'), spalte('count()')], werte: [null, 4] }),
      'kennzahl',
    );
    expect(werteDer(host)).toEqual(['4']);
  });

  it('ohne Treffer steht 0 statt «keine Treffer», ungruppiert und gruppiert (AK2)', () => {
    for (const payload of [
      menge(),
      menge({ type: 'table', columns: [spalte('x')] }),
      menge({ groups: [] }),
      menge({
        type: 'table',
        columns: [spalte('count()')],
        groups: [],
        groupColumns: [spalte('s')],
      }),
    ]) {
      const host = zeichne(payload, 'kennzahl');
      expect(werteDer(host)).toEqual(['0']);
      expect(host.textContent).not.toContain(de['query.empty']);
    }
  });

  it('Übergabe D3: Gesamt-Tabelle ohne Treffer (null Zeilen, eine Gruppe) zeigt 0', () => {
    const host = zeichne(gesamt({ treffer: 0, werte: [null] }), 'kennzahl');
    expect(werteDer(host)).toEqual(['0']);
    const mitCount = zeichne(
      gesamt({ treffer: 0, spalten: [spalte('count()')], werte: [0] }),
      'kennzahl',
    );
    expect(werteDer(mitCount)).toEqual(['0']);
  });

  it('gruppierte Tabelle ohne Zahlen-Spalte: Hinweis kennzahlOhneZahl und Tabelle', () => {
    const host = zeichne(
      nachStatus({ spalten: [spalte('titel')], werte: [['x'], ['y']] }),
      'kennzahl',
    );
    expect(host.querySelector('.dashboard-kennzahl')).toBeNull();
    expect(hinweisText(host)).toBe(de['dashboard.hint.kennzahlOhneZahl']);
    expect(host.querySelectorAll('table.perspective-query-table tbody tr')).toHaveLength(2);
  });

  it('Datum und Dauer erscheinen in der Form der Sprache, Text als Zahl gelesen', () => {
    const ms = new Date(2026, 10, 3).getTime();
    expect(kennzahlText({ kind: 'date', ms }, 'de-DE')).toBe(
      new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(ms)),
    );
    const dauer = kennzahlText({ kind: 'dur', ms: 93600000 }, 'de-DE');
    // 26 Stunden: in den Wörtern der Sprache, wo die Laufzeit Intl.DurationFormat
    // kennt, sonst die kompakte Form der Abfrage (Befund B3-7).
    const erwartet =
      typeof Intl.DurationFormat === 'function'
        ? new Intl.DurationFormat('de-DE', { style: 'short' }).format({
            days: 1,
            hours: 2,
            minutes: 0,
            seconds: 0,
          })
        : '1d 2h';
    expect(dauer).toBe(erwartet);
    expect(kennzahlText('80', 'de-DE')).toBe('80');
    expect(kennzahlText('1500', 'de-DE')).toBe('1.500');
    expect(kennzahlText(null, 'de-DE')).toBe('–');
  });

  it('Gesamt-Wert aus min(…) über Daten ist eine Kennzahl', () => {
    const ms = new Date(2026, 0, 15).getTime();
    const payload = gesamt({ spalten: [spalte('min(faellig)')], werte: [{ kind: 'date', ms }] });
    expect(kennzahlAuswertung(payload.resultSet)).toEqual({
      eintraege: [{ wert: { kind: 'date', ms }, kette: null }],
    });
  });

  it('ein DISPLAY der Abfrage wird ohne Hinweis übergangen', () => {
    const payload = nachStatus({ wishes: { display: { form: 'bar', by: null } } });
    const { kontext, gezeichnet } = diagrammKontext();
    const host = document.createElement('div');
    host.appendChild(buildQueryListDom(payload, tStub, { ...kontext, vorgabeForm: 'kennzahl' }));
    expect(werteDer(host)).toEqual(['2', '1']);
    expect(gezeichnet).toHaveLength(0);
    expect(hinweisText(host)).toBeNull();
  });

  it('der Hinweis des Zustands steht über der Kennzahl', () => {
    const host = zeichne(menge({ rows: [zeile('a')], hint: 'placeholderOutside' }), 'kennzahl');
    expect(hinweisText(host)).toBe(de['query.hint.placeholderOutside']);
    expect(werteDer(host)).toEqual(['1']);
  });

  it('eine Listen-Maske der Datensatz-Ebene weicht der Kennzahl', () => {
    const payload = {
      ...menge({
        scope: 'records',
        type: 'table',
        columns: [spalte('name')],
        rows: [makeRow(['x'], recordOrigin('Kunden', 'k1'))],
      }),
      liste: { istListe: true },
    };
    const host = zeichne(payload, 'kennzahl');
    expect(host.querySelector('.db-list')).toBeNull();
    expect(werteDer(host)).toEqual(['1']);
  });

  it('interne Formen sind über DISPLAY nicht erreichbar', () => {
    const payload = menge({
      rows: [zeile('a')],
      wishes: { display: { form: 'kennzahl', by: null } },
    });
    const host = zeichne(payload, null);
    expect(host.querySelector('.dashboard-kennzahl')).toBeNull();
    expect(hinweisText(host)).toBe(
      de['query.hint.displayFormUnknown'].replace('{name}', 'kennzahl'),
    );
  });
});

// --- Liste und Tabelle (AK3) -------------------------------------------------------------

describe('dashboard-formen: Liste und Tabelle', () => {
  const html = (payload, vorgabe) => zeichne(payload, vorgabe).innerHTML;

  it('Liste zeigt dasselbe wie die Abfrage im Fließtext, mit Klick in die Datei', () => {
    const payload = menge({
      columns: [spalte('status')],
      rows: [zeile('a', ['offen']), zeile('b', ['zu'])],
    });
    expect(html(payload, 'liste')).toBe(html(payload, null));
    const host = zeichne(payload, 'liste');
    expect(host.querySelector('a[data-fm-path="/raum/a.md"]')).not.toBeNull();
  });

  it('Liste trägt die gruppierte Liste und die Aufgaben-Liste unverändert', () => {
    const gruppiert = menge({
      rows: [zeile('a'), zeile('b')],
      groups: [makeGroup('offen', [0]), makeGroup('zu', [1])],
    });
    expect(html(gruppiert, 'liste')).toBe(html(gruppiert, null));
    const aufgaben = menge({
      scope: 'tasks',
      rows: [
        makeRow(
          [],
          taskOrigin('/raum/A.md', 'A', 3, '- [ ] eins'),
          makeTaskInfo({ urgency: 1, blocked: false, duplicateId: false }),
        ),
      ],
    });
    expect(html(aufgaben, 'liste')).toBe(html(aufgaben, null));
  });

  it('Liste über TABLE: Hinweis und Tabelle', () => {
    const payload = menge({ type: 'table', columns: [spalte('x')], rows: [zeile('a', [1])] });
    const host = zeichne(payload, 'liste');
    expect(hinweisText(host)).toBe(
      de['query.hint.displayFormUnsuitable'].replace('{name}', 'liste'),
    );
    expect(host.querySelector('table.perspective-query-table')).not.toBeNull();
  });

  it('Tabelle zeigt dasselbe wie die Abfrage im Fließtext, ungruppiert und gruppiert', () => {
    const payload = menge({ type: 'table', columns: [spalte('x')], rows: [zeile('a', [1])] });
    expect(html(payload, 'tabelle')).toBe(html(payload, null));
    expect(
      zeichne(payload, 'tabelle').querySelector('a[data-fm-path="/raum/a.md"]'),
    ).not.toBeNull();
    expect(html(nachStatus(), 'tabelle')).toBe(html(nachStatus(), null));
  });

  it('Tabelle über LIST: Hinweis und Liste', () => {
    const host = zeichne(menge({ rows: [zeile('a')] }), 'tabelle');
    expect(hinweisText(host)).toBe(
      de['query.hint.displayFormUnsuitable'].replace('{name}', 'tabelle'),
    );
    expect(host.querySelector('ul.perspective-query-list')).not.toBeNull();
  });

  it('Tabelle des Gesamt-Werts ohne Treffer zeigt ihre eine Zeile', () => {
    const host = zeichne(
      gesamt({ treffer: 0, spalten: [spalte('count()')], werte: [0] }),
      'tabelle',
    );
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(host.querySelector('tbody td').textContent).toBe('0');
  });

  it('Tabelle und Liste ohne Treffer zeigen den Leer-Text wie im Fließtext', () => {
    expect(zeichne(menge(), 'liste').textContent).toBe(de['query.empty']);
    expect(zeichne(menge({ type: 'table', columns: [spalte('x')] }), 'tabelle').textContent).toBe(
      de['query.empty'],
    );
  });
});

// --- Balken und Kreis (AK4) ------------------------------------------------------------

describe('dashboard-formen: Balken und Kreis', () => {
  function mitDiagramm(payload, form, aktiv = true) {
    const { kontext, gezeichnet } = diagrammKontext(aktiv);
    const host = document.createElement('div');
    host.appendChild(buildQueryListDom(payload, tStub, { ...kontext, vorgabeForm: form }));
    return { host, gezeichnet };
  }

  it('Balken: je Gruppe ein Balken mit der Gruppe als Beschriftung', () => {
    const { host, gezeichnet } = mitDiagramm(nachStatus(), 'bar');
    expect(gezeichnet).toHaveLength(1);
    expect(gezeichnet[0].type).toBe('bar');
    expect(gezeichnet[0].categories).toEqual(['offen', 'erledigt']);
    expect(gezeichnet[0].series[0].values).toEqual([2, 1]);
    expect(host.querySelector('.perspective-query-chart')).not.toBeNull();
    expect(hinweisText(host)).toBeNull();
  });

  it('Kreis: je Gruppe ein Anteil', () => {
    const { gezeichnet } = mitDiagramm(nachStatus(), 'pie');
    expect(gezeichnet[0].type).toBe('pie');
    expect(gezeichnet[0].categories).toEqual(['offen', 'erledigt']);
  });

  it('Kreis über eine ungruppierte Abfrage ohne Zahl: Hinweis und Tabelle (AK4, Story AK5)', () => {
    const payload = menge({
      type: 'table',
      columns: [spalte('status')],
      rows: [zeile('a', ['offen'])],
    });
    const { host, gezeichnet } = mitDiagramm(payload, 'pie');
    expect(gezeichnet).toHaveLength(0);
    expect(hinweisText(host)).toBe(
      de['query.hint.displayFormChartNoNumbers'].replace('{name}', 'pie'),
    );
    expect(host.querySelector('table.perspective-query-table')).not.toBeNull();
  });

  it('Kreis über LIST: Grund «keine Tabelle» und Liste', () => {
    const { host } = mitDiagramm(menge({ rows: [zeile('a')] }), 'pie');
    expect(hinweisText(host)).toBe(
      de['query.hint.displayFormChartNotTable'].replace('{name}', 'pie'),
    );
    expect(host.querySelector('ul.perspective-query-list')).not.toBeNull();
  });

  it('Übergabe D6: negativer Anteil nennt seinen Grund', () => {
    const { host } = mitDiagramm(nachStatus({ werte: [[2], [-1]] }), 'pie');
    expect(hinweisText(host)).toBe(
      de['query.hint.displayFormChartNegative'].replace('{name}', 'pie'),
    );
    expect(host.querySelector('table.perspective-query-table')).not.toBeNull();
  });

  it('Übergabe D6: lauter Nullen nennen ihren Grund', () => {
    const { host } = mitDiagramm(nachStatus({ werte: [[0], [0]] }), 'pie');
    expect(hinweisText(host)).toBe(de['query.hint.displayFormChartZeros'].replace('{name}', 'pie'));
  });

  it('Übergabe D3: Gesamt-Tabelle ohne Treffer fällt bei Balken und Kreis ohne Absturz zurück', () => {
    const leer = () =>
      gesamt({ treffer: 0, spalten: [spalte('count()'), spalte('count()')], werte: [0, 0] });
    const kreis = mitDiagramm(leer(), 'pie');
    expect(hinweisText(kreis.host)).toBe(
      de['query.hint.displayFormChartZeros'].replace('{name}', 'pie'),
    );
    expect(kreis.host.querySelectorAll('tbody tr')).toHaveLength(1);
    const einzeln = mitDiagramm(
      gesamt({ treffer: 0, spalten: [spalte('count()')], werte: [0] }),
      'bar',
    );
    expect(hinweisText(einzeln.host)).toBe(
      de['query.hint.displayFormChartSingleColumn'].replace('{name}', 'bar'),
    );
    expect(einzeln.host.querySelectorAll('tbody tr')).toHaveLength(1);
    // Mit Beschriftung und Zahl bleibt ein Balken der Höhe 0 stehen, ohne Abbruch.
    const balken = mitDiagramm(leer(), 'bar');
    expect(balken.gezeichnet[0].series[0].values).toEqual([0]);
  });

  it('ausgeschaltete Diagramme: Hinweis und Tabelle', () => {
    const { host, gezeichnet } = mitDiagramm(nachStatus(), 'pie', false);
    expect(gezeichnet).toHaveLength(0);
    expect(hinweisText(host)).toBe(de['query.hint.displayFormOff'].replace('{name}', 'pie'));
  });
});

// --- Befüllungs-Schritt am Markup (dashboard-view.js) -------------------------------------

const BLOCK = [
  '!filter status titel="Status" vorbelegung=offen',
  '!filter prio',
  'hoch',
  'niedrig',
  '!kachel kennzahl titel="Offen"',
  'LIST FROM "Aufgaben"',
  '!kachel liste',
  'LIST',
  '!zeile',
  '!kachel tabelle',
  'TABLE status',
  '!kachel balken',
  'TABLE count() GROUP BY status',
  '!kachel kreis',
  'TABLE count() GROUP BY status',
  '!kachel tabelle abfrage="Abfragen/Offen"',
  '!kachel text',
  'Nur Text',
].join('\n');

function dashboardIn(rumpf = BLOCK) {
  const host = document.createElement('div');
  host.innerHTML = renderDashboardBlock(rumpf, {
    lineStart: 1,
    lineEnd: 30,
    index: 0,
    L: (key) => key,
    enabled: () => true,
    env: { lang: 'de' },
  });
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  document.body.textContent = '';
  kanal.antworten.clear();
  kanal.aufrufe.length = 0;
  vi.useRealTimers();
});

describe('dashboard-view: Befüllungs-Schritt', () => {
  it('macht jede Daten-Kachel mit Abfrage zum Abfrage-Container mit Form und Werten', () => {
    const host = dashboardIn();
    expect(bereiteDashboardKachelnVor(host)).toBe(5);
    const kacheln = [...host.querySelectorAll('.perspective-query')];
    expect(kacheln.map((el) => el.dataset.fmForm)).toEqual([
      'kennzahl',
      'liste',
      'tabelle',
      'bar',
      'pie',
    ]);
    expect(kacheln[0].dataset.fmQuery).toBe('LIST FROM "Aufgaben"');
    for (const el of kacheln) {
      expect(JSON.parse(el.dataset.fmParams)).toEqual({ status: 'offen', prio: null });
    }
  });

  it('die Kachel mit Abfrage-Datei und die Text-Kachel bleiben, wie sie sind', () => {
    const host = dashboardIn();
    bereiteDashboardKachelnVor(host);
    const datei = host.querySelector('[data-dashboard-abfrage]');
    expect(datei.classList.contains('perspective-query')).toBe(false);
    expect(datei.dataset.fmQuery).toBeUndefined();
    expect(host.querySelector('.dashboard-text').classList.contains('perspective-query')).toBe(
      false,
    );
  });

  it('ist idempotent und setzt ohne Filter ein leeres Objekt', () => {
    const host = dashboardIn('!kachel liste\nLIST');
    expect(bereiteDashboardKachelnVor(host)).toBe(1);
    expect(bereiteDashboardKachelnVor(host)).toBe(0);
    expect(host.querySelector('.perspective-query').dataset.fmParams).toBe('{}');
    expect(vorbelegungenDes(host.querySelector('.perspective-dashboard'))).toEqual({});
  });

  it('übergeht einen Container ohne Abfrage-Suche', () => {
    expect(bereiteDashboardKachelnVor(null)).toBe(0);
    expect(bereiteDashboardKachelnVor({})).toBe(0);
  });
});

// --- Befüllung über die Abfrage-Befüllung (AK5, AK6) -------------------------------------

describe('dashboard-view: Befüllung der Kacheln', () => {
  const listeMit = (...namen) => menge({ rows: namen.map((n) => zeile(n)) });
  const fehler = () => ({
    resultSet: makeResultSet({
      state: makeState('ready', {
        queryError: { code: 'unexpectedEnd', message: 'x', pos: 4 },
        area: { root: '/raum', fileCount: 3 },
      }),
    }),
  });

  it('Kachel mit Syntax-Fehler zeigt den Hinweis an ihrem Platz, die übrigen bleiben (AK6)', async () => {
    const host = dashboardIn('!kachel kennzahl\nLIST WHERE\n!kachel liste\nLIST');
    kanal.antworten.set('LIST WHERE', fehler());
    kanal.antworten.set('LIST', listeMit('a', 'b'));
    bereiteDashboardKachelnVor(host);
    applyFrontmatterQueriesIfPresent(host, '/raum/Dashboard.md');
    await waitForFrontmatterQueriesIdle();
    const [erste, zweite] = host.querySelectorAll('.dashboard-kachel');
    // Ohne geladene Sprachdatei liefert die Übersetzung der Befüllung den Schlüssel.
    expect(erste.querySelector('.perspective-query-error').textContent).toMatch(
      /unexpectedEnd|Position 4/,
    );
    expect(erste.querySelector('.dashboard-kennzahl')).toBeNull();
    expect(zweite.querySelectorAll('a.perspective-query-item')).toHaveLength(2);
    expect(kanal.aufrufe.map((a) => a.params)).toEqual([{}, {}]);
  });

  it('reicht die Vorbelegungen der Filter an den Abfrage-Kanal', async () => {
    const host = dashboardIn('!filter status vorbelegung=offen\n!kachel kennzahl\nLIST');
    kanal.antworten.set('LIST', listeMit('a'));
    bereiteDashboardKachelnVor(host);
    applyFrontmatterQueriesIfPresent(host, '/raum/Dashboard.md');
    await waitForFrontmatterQueriesIdle();
    expect(kanal.aufrufe[0]).toEqual({
      basePath: '/raum/Dashboard.md',
      query: 'LIST',
      params: { status: 'offen' },
    });
    expect(host.querySelector('.dashboard-kennzahl-wert').textContent).toBe('1');
  });

  it('zieht beim Index-Nachzug nach, ohne dass das Dokument neu gerendert wird (AK5)', async () => {
    const host = dashboardIn('!kachel kennzahl\nLIST');
    kanal.antworten.set('LIST', listeMit('a'));
    bereiteDashboardKachelnVor(host);
    applyFrontmatterQueriesIfPresent(host, '/raum/Dashboard.md');
    await waitForFrontmatterQueriesIdle();
    expect(host.querySelector('.dashboard-kennzahl-wert').textContent).toBe('1');

    vi.useFakeTimers();
    kanal.antworten.set('LIST', listeMit('a', 'b', 'c'));
    refreshVisibleFrontmatterQueries();
    vi.advanceTimersByTime(200);
    vi.useRealTimers();
    await waitForFrontmatterQueriesIdle();
    expect(host.querySelector('.dashboard-kennzahl-wert').textContent).toBe('3');
  });
});
