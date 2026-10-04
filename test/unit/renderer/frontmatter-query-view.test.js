// @vitest-environment jsdom
// 4T-000355 (Epic 3E-000065): buildQueryListDom erzeugt aus der Abfrage-IPC-Antwort
// das Listen-DOM der Frontmatter-Abfrage (perspective-query). Reine Funktion mit
// injiziertem t; deterministisch über alle Status- und Fehlerzustände prüfbar.
// Der t-Stub liest die echte de.json, damit Platzhalter-Ersetzung ({pos},
// {files}) und Key-Existenz gleich mitgetestet werden.
//
// 4T-002034 (Epic 3E-000260): Zustände, Abfrage-Fehler, Liste und Tabelle lesen
// seit dem Nachzug allein die Ergebnismenge (`resultSet`). Die Fälle der Datei-
// und Block-Ebene bauen ihre Antwort deshalb über die Aufbau-Funktionen des
// Format-Vertrags statt aus den bisherigen Feldern (`files`, `table`, `meta`,
// `hint`, `layoutColumns`, `queryError`); Prüfaussagen und erwartete Texte sind
// unverändert. Seit 4T-002035 gilt das ebenso für die Fälle der Aufgaben-Liste
// (bisher `files`, `groups`, `taskLayout`, `totalCount`, `queryScope`): Treffer
// sind Zeilen mit Aufgaben-Herkunft, Gruppen eine Struktur über den Zeilen,
// das Layout sind Wünsche, die Treffer-Zahl ist die Zahl der Zeilen.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQueryListDom } from '../../../src/renderer/modules/query/frontmatter-query-view.js';
import {
  makeColumn,
  fileOrigin,
  blockOrigin,
  taskOrigin,
  recordOrigin,
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

function render(payload) {
  const host = document.createElement('div');
  host.appendChild(buildQueryListDom(payload, tStub));
  return host;
}

// --- Antworten mit Ergebnismenge (4T-002034) ----------------------------------

const spalte = (label) => makeColumn({ name: label, label, source: label });
const datei = (name) => fileOrigin(`/raum/${name}.md`, name);
const link = (name) => ({ kind: 'link', path: `/raum/${name}.md`, name });

// Antwort eines ausgewerteten Laufs: allein die Menge, keine bisherigen Felder.
function menge({
  scope = 'files',
  type = 'list',
  columns = [],
  rows = [],
  groups = null,
  wishes,
  hint,
} = {}) {
  return {
    resultSet: makeResultSet({
      scope,
      type,
      columns,
      rows,
      groups,
      wishes: makeWishes(wishes),
      state: makeState('ready', { hint: hint || null, area: { root: '/raum', fileCount: 3 } }),
    }),
  };
}

// 4T-002035: Zeile einer Aufgaben-Liste aus Herkunft (Pfad, Name, Zeile,
// Roh-Zeile) und Zusatzangaben; die Werte tragen ein Zusatzfeld, wenn gegeben.
function aufgabe({
  name = 'Aufgaben',
  path = '/raum/Aufgaben.md',
  line = 5,
  taskText,
  urgency = 1.95,
  blocked = false,
  duplicateId = false,
  values = [],
}) {
  return makeRow(
    values,
    taskOrigin(path, name, line, taskText),
    makeTaskInfo({ urgency, blocked, duplicateId }),
  );
}

// Antwort einer Aufgaben-Liste (LIST TASKS) allein aus der Menge.
const aufgabenListe = ({ rows, groups = null, wishes, columns = [] }) =>
  menge({ scope: 'tasks', type: 'list', rows, groups, wishes, columns });

// Antwort eines Zustands ohne ausgewertetes Ergebnis oder mit Abfrage-Fehler.
function zustand(status, extra) {
  return { resultSet: makeResultSet({ state: makeState(status, extra) }) };
}

describe('frontmatter-query-view buildQueryListDom (4T-000355)', () => {
  it('ready mit Treffern: klickbare Eintraege in Eingabe-Reihenfolge mit data-fm-path', () => {
    const host = render(
      menge({
        rows: [
          makeRow([], fileOrigin('/raum/Alpha.md', 'Alpha')),
          makeRow([], fileOrigin('/raum/Ordner∕Unterseite.md', 'Ordner∕Unterseite')),
        ],
      }),
    );
    const items = host.querySelectorAll('a.perspective-query-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('Alpha');
    expect(items[0].dataset.fmPath).toBe('/raum/Alpha.md');
    expect(items[0].getAttribute('title')).toBe('/raum/Alpha.md');
    expect(items[0].getAttribute('href')).toBe('#');
    // Reihenfolge bleibt wie geliefert (die Sortierung passiert im Main).
    expect(items[1].textContent).toBe('Ordner∕Unterseite');
    expect(items[1].dataset.fmPath).toBe('/raum/Ordner∕Unterseite.md');
  });

  it('ready ohne Treffer: lokalisierter Leer-Hinweis, keine Liste', () => {
    const host = render(menge());
    expect(host.querySelector('.perspective-query-list')).toBeNull();
    const status = host.querySelector('.perspective-query-status');
    expect(status).not.toBeNull();
    expect(status.textContent).toBe(de['query.empty']);
    expect(status.classList.contains('perspective-query-error')).toBe(false);
  });

  it('queryError mit Position: Fehler-Marker, {pos} ersetzt, keine Liste', () => {
    const host = render(
      zustand('ready', {
        queryError: { code: 'unexpectedChar', pos: 5, message: 'irrelevant deutsch' },
      }),
    );
    expect(host.querySelector('.perspective-query-list')).toBeNull();
    const err = host.querySelector('.perspective-query-status.perspective-query-error');
    expect(err).not.toBeNull();
    expect(err.textContent).toContain('5');
    expect(err.textContent).not.toContain('{pos}');
    // Die deutschsprachige message des Parsers wird nicht durchgereicht.
    expect(err.textContent).not.toContain('irrelevant');
  });

  it('queryError mit unbekanntem Code: Fallback auf den generischen Syntax-Text', () => {
    const host = render(
      zustand('ready', { queryError: { code: 'voelligNeu', message: '', pos: -1 } }),
    );
    const err = host.querySelector('.perspective-query-error');
    expect(err).not.toBeNull();
    expect(err.textContent).toBe(de['query.syntax.syntax']);
  });

  it('oversized: Hinweis mit eingesetzter Dateizahl', () => {
    const host = render(
      zustand('oversized', { area: { root: '/raum', fileCount: 2500, byteSize: 1 } }),
    );
    const status = host.querySelector('.perspective-query-status');
    expect(status.textContent).toContain('2500');
    expect(status.textContent).not.toContain('{files}');
    expect(host.querySelector('.perspective-query-list')).toBeNull();
  });

  it('indexing / unavailable / error aus der Menge: je ein lokalisierter Hinweis', () => {
    for (const [status, key] of [
      ['indexing', 'query.indexing'],
      ['unavailable', 'query.unavailable'],
      ['error', 'query.error'],
    ]) {
      const host = render(zustand(status));
      const node = host.querySelector('.perspective-query-status');
      expect(node, status).not.toBeNull();
      expect(node.textContent).toBe(de[key]);
      expect(host.querySelector('.perspective-query-list')).toBeNull();
    }
  });

  it('Zustände der Anzeige selbst (ohne Menge): Laden, pfadloser Reiter, Kanal-Fehler', () => {
    for (const [status, key] of [
      ['loading', 'query.loading'],
      ['unavailable', 'query.unavailable'],
      ['error', 'query.error'],
    ]) {
      const host = render({ status });
      const node = host.querySelector('.perspective-query-status');
      expect(node, status).not.toBeNull();
      expect(node.textContent).toBe(de[key]);
      expect(host.querySelector('.perspective-query-list')).toBeNull();
    }
  });

  it('Liste und Tabelle lesen allein die Menge, nicht die bisherigen Felder', () => {
    // Widersprechende bisherige Felder neben der Menge: gezeichnet wird die Menge.
    const host = render({
      ...menge({ rows: [makeRow([], datei('Alpha'))] }),
      status: 'ready',
      files: [{ name: 'Falsch', path: '/raum/Falsch.md' }],
      queryType: 'table',
      table: { withoutId: false, headers: ['Falsch'], rows: [] },
      layoutColumns: 5,
      hint: 'columnsIgnored',
    });
    const items = [...host.querySelectorAll('a.perspective-query-item')];
    expect(items.map((a) => a.textContent)).toEqual(['Alpha']);
    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelector('.perspective-query-hint')).toBeNull();
    expect(host.querySelector('.perspective-query-list').dataset.fmColumns).toBeUndefined();
  });
});

// --- 4T-000404 (Epic 3E-000076): Tabellen-Ausgabe und LIST-Zusatzfeld -------------

describe('frontmatter-query-view — TABLE und Zusatzfeld (4T-000404)', () => {
  // Datum als lokaler Zeitpunkt; die Darstellung zeigt ihn im ISO-Format.
  const JULI = { kind: 'date', ms: new Date(2026, 6, 1).getTime() };
  const tabelle = (wishes, hint) =>
    menge({
      type: 'table',
      columns: [spalte('Status'), spalte('file.mtime')],
      rows: [
        makeRow(['offen', JULI], datei('Alpha')),
        makeRow(['erledigt', link('Ziel')], datei('Beta')),
      ],
      wishes,
      hint,
    });

  it('TABLE: Kopfzeile mit Datei-Spalte, klickbare Datei-Links, Zell-Segmente', () => {
    const host = render(tabelle());
    const table = host.querySelector('table.perspective-query-table');
    expect(table).not.toBeNull();
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual([de['query.table.fileColumn'], 'Status', 'file.mtime']);
    const rows = table.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    const firstLink = rows[0].querySelector('a.perspective-query-item');
    expect(firstLink.textContent).toBe('Alpha');
    expect(firstLink.dataset.fmPath).toBe('/raum/Alpha.md');
    expect(rows[0].querySelectorAll('td')[1].textContent).toBe('offen');
    expect(rows[0].querySelectorAll('td')[2].textContent).toBe('2026-07-01');
    // Link-Segment in einer Zelle bleibt klickbar (data-fm-path).
    const cellLink = rows[1].querySelectorAll('td')[2].querySelector('a.perspective-query-item');
    expect(cellLink.textContent).toBe('Ziel');
    expect(cellLink.dataset.fmPath).toBe('/raum/Ziel.md');
  });

  it('TABLE: Überschrift aus dem Alias, sonst aus dem Quelltext', () => {
    const host = render(
      menge({
        type: 'table',
        columns: [
          makeColumn({ name: 'chapter', label: 'Ch.', alias: 'Ch.', source: 'chapter' }),
          makeColumn({ name: 'topic', label: 'topic', source: 'topic' }),
        ],
        rows: [makeRow([1, 'syntax'], datei('Alpha'))],
        wishes: { withoutId: true },
      }),
    );
    const headers = [...host.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Ch.', 'topic']);
  });

  it('TABLE WITHOUT ID: keine Datei-Spalte', () => {
    const host = render(tabelle({ withoutId: true }));
    const headers = [...host.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Status', 'file.mtime']);
    expect(host.querySelectorAll('tbody tr')[0].querySelectorAll('td').length).toBe(2);
  });

  it('TABLE ohne Treffer: Leer-Hinweis statt Tabelle', () => {
    const host = render(menge({ type: 'table', columns: [spalte('Status')] }));
    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelector('.perspective-query-status').textContent).toBe(de['query.empty']);
  });

  it('TABLE: nicht endliche Zahl, Liste und fehlender Wert wie bisher', () => {
    const host = render(
      menge({
        type: 'table',
        columns: [spalte('a'), spalte('b'), spalte('c')],
        rows: [makeRow([Infinity, ['x', 'y'], null], datei('Alpha'))],
        wishes: { withoutId: true },
      }),
    );
    const zellen = [...host.querySelectorAll('tbody td')].map((td) => td.textContent);
    expect(zellen).toEqual(['Infinity', 'x, y', '']);
  });

  it('COLUMNS: Listen-Container trägt data-fm-columns (4T-000405)', () => {
    const rows = [makeRow([], datei('Alpha')), makeRow([], datei('Beta'))];
    const host = render(menge({ rows, wishes: { layoutColumns: 3 } }));
    expect(host.querySelector('.perspective-query-list').dataset.fmColumns).toBe('3');
    // Ohne COLUMNS (bzw. bei 1) kein Attribut.
    const plain = render(menge({ rows }));
    expect(plain.querySelector('.perspective-query-list').dataset.fmColumns).toBeUndefined();
    const one = render(menge({ rows, wishes: { layoutColumns: 1 } }));
    expect(one.querySelector('.perspective-query-list').dataset.fmColumns).toBeUndefined();
  });

  it('Hinweis columnsIgnored: lokalisierter Text oberhalb der Tabelle (4T-000405)', () => {
    const host = render(tabelle({ layoutColumns: 3 }, 'columnsIgnored'));
    const hint = host.querySelector('.perspective-query-hint');
    expect(hint).not.toBeNull();
    expect(hint.textContent).toBe(de['query.hint.columnsIgnored']);
    // Das Ergebnis rendert trotzdem (Hinweis, kein Fehler).
    expect(host.querySelector('table.perspective-query-table')).not.toBeNull();
    // Unbekannte Hint-Codes werden ignoriert.
    const none = render(tabelle(undefined, 'voelligNeu'));
    expect(none.querySelector('.perspective-query-hint')).toBeNull();
  });

  it('LIST-Zusatzfeld: gedämpfter Anhang mit Text- und Link-Segmenten', () => {
    const host = render(
      menge({
        columns: [spalte('status')],
        rows: [makeRow([['offen', link('Ziel')]], datei('Alpha')), makeRow([null], datei('Beta'))],
      }),
    );
    const lis = host.querySelectorAll('.perspective-query-list li');
    const extra = lis[0].querySelector('.perspective-query-extra');
    expect(extra).not.toBeNull();
    expect(extra.textContent).toBe('offen, Ziel');
    expect(extra.querySelector('a.perspective-query-item').dataset.fmPath).toBe('/raum/Ziel.md');
    // Ohne Zusatzwert kein leerer Anhang.
    expect(lis[1].querySelector('.perspective-query-extra')).toBeNull();
  });
});

// --- 4T-000409 (Epic 3E-000077): Block-Treffer mit Anker-Sprung -------------------

describe('frontmatter-query-view — Block-Treffer (4T-000409)', () => {
  it('LIST: Block-Treffer tragen data-fm-anchor mit ^-Praefix', () => {
    const host = render(
      menge({
        scope: 'blocks',
        rows: [makeRow([], blockOrigin('/raum/Alpha.md', 'Alpha', 'a1'))],
      }),
    );
    const items = host.querySelectorAll('a.perspective-query-item');
    expect(items[0].textContent).toBe('Alpha#^a1');
    expect(items[0].dataset.fmPath).toBe('/raum/Alpha.md');
    expect(items[0].dataset.fmAnchor).toBe('^a1');
    // Datei-Treffer ohne Anker bleiben ohne Attribut.
    const datei_ = render(menge({ rows: [makeRow([], datei('Beta'))] }));
    expect(datei_.querySelector('a.perspective-query-item').dataset.fmAnchor).toBeUndefined();
  });

  it('TABLE: Ziel-Spalte der Block-Zeilen traegt data-fm-anchor', () => {
    const host = render(
      menge({
        scope: 'blocks',
        type: 'table',
        columns: [spalte('Status')],
        rows: [makeRow(['offen'], blockOrigin('/raum/Alpha.md', 'Alpha', 'a1'))],
      }),
    );
    const link_ = host.querySelector('tbody a.perspective-query-item');
    expect(link_.textContent).toBe('Alpha#^a1');
    expect(link_.dataset.fmAnchor).toBe('^a1');
  });

  it('TABLE TASKS: Ziel-Spalte traegt den Zeilen-Sprung data-fm-line', () => {
    const host = render(
      menge({
        scope: 'tasks',
        type: 'table',
        columns: [spalte('description')],
        rows: [
          makeRow(
            ['Konzept'],
            taskOrigin('/raum/Aufgaben.md', 'Aufgaben', 5, '- [ ] Konzept'),
            makeTaskInfo({ urgency: 1.234, blocked: false, duplicateId: false }),
          ),
        ],
      }),
    );
    const link_ = host.querySelector('tbody a.perspective-query-item');
    expect(link_.textContent).toBe('Aufgaben');
    expect(link_.dataset.fmLine).toBe('5');
    expect(link_.dataset.fmAnchor).toBeUndefined();
  });
});

// --- 4T-000502 (Epic 3E-000096): Task-Trefferliste (TASKS-Scope) -----------------

describe('frontmatter-query-view — Task-Treffer (4T-000502)', () => {
  // Menge wie der Main-Query-Pfad (Ebene 'tasks', Zeilen mit Aufgaben-Herkunft
  // aus Pfad, Zeile und Roh-Zeile). Die View parst die Roh-Zeile mit dem
  // Marker-Kern und baut die Optik.
  const DUE = '\u{1F4C5}';
  const tasksPayload = aufgabenListe({
    rows: [
      aufgabe({ line: 5, taskText: `- [ ] Konzept schreiben ${DUE} 2099-01-01` }),
      aufgabe({ line: 6, taskText: '- [x] Kickoff halten' }),
      aufgabe({ line: 7, taskText: '- [/] Review offen' }),
    ],
  });

  it('rendert eine perspective-query-tasks-Liste mit Status-Box, Link und data-fm-line', () => {
    const host = render(tasksPayload);
    const list = host.querySelector('ul.perspective-query-list.perspective-query-tasks');
    expect(list).not.toBeNull();
    const items = list.querySelectorAll('li.perspective-query-task');
    expect(items.length).toBe(3);

    // Erster Treffer: offene Aufgabe (Status-Box leer bei ' ').
    const first = items[0];
    const status0 = first.querySelector('.perspective-query-task-status');
    expect(status0.dataset.statusChar).toBe(' ');
    expect(status0.textContent).toBe('');
    const desc0 = first.querySelector('a.perspective-query-item.perspective-query-task-desc');
    expect(desc0.textContent).toBe('Konzept schreiben');
    expect(desc0.dataset.fmPath).toBe('/raum/Aufgaben.md');
    expect(desc0.dataset.fmLine).toBe('5');
    // Marker-Badge (task-marker-Klasse) fuer den Faellig-Termin.
    expect(first.querySelector('.task-marker')).not.toBeNull();
    // Gedaempfter Datei-Name als eigenes Segment.
    expect(first.querySelector('.perspective-query-task-file').textContent).toBe('Aufgaben');

    // Zweiter Treffer: erledigt (x -> Haken, li-Klasse task-done).
    const second = items[1];
    const status1 = second.querySelector('.perspective-query-task-status');
    expect(status1.dataset.statusChar).toBe('x');
    expect(status1.textContent).toBe('✓');
    expect(second.classList.contains('perspective-query-task-done')).toBe(true);

    // Dritter Treffer: erweiterter Status '/' -> das Zeichen selbst.
    const status2 = items[2].querySelector('.perspective-query-task-status');
    expect(status2.dataset.statusChar).toBe('/');
    expect(status2.textContent).toBe('/');
    expect(items[2].classList.contains('perspective-query-task-done')).toBe(false);
  });

  it('nicht parsebarer taskText faellt auf einen einfachen Datei-Link zurueck', () => {
    const host = render(
      aufgabenListe({
        rows: [
          aufgabe({ name: 'Kaputt', path: '/raum/Kaputt.md', line: 3, taskText: 'kein Task hier' }),
        ],
      }),
    );
    const li = host.querySelector('li.perspective-query-task');
    expect(li.querySelector('.perspective-query-task-status')).toBeNull();
    const link = li.querySelector('a.perspective-query-item');
    expect(link.textContent).toBe('Kaputt');
    expect(link.dataset.fmPath).toBe('/raum/Kaputt.md');
  });

  it('queryError tasksScopeDisabled: lokalisierter Fehlertext, keine Liste', () => {
    // 4T-002034: Der Abfrage-Fehler kommt aus der Ergebnismenge.
    const host = render(
      zustand('ready', { queryError: { code: 'tasksScopeDisabled', message: '', pos: -1 } }),
    );
    expect(host.querySelector('.perspective-query-tasks')).toBeNull();
    const err = host.querySelector('.perspective-query-status.perspective-query-error');
    expect(err).not.toBeNull();
    expect(err.textContent).toBe(de['query.syntax.tasksScopeDisabled']);
  });
});

// --- 4T-000503 (Epic 3E-000096): Gruppierung und Task-Layout (HIDE/SHOW/SHORT) ----

describe('frontmatter-query-view — Gruppierung und Layout (4T-000503)', () => {
  const DUE = '\u{1F4C5}';
  const HIGH = '\u{1F53A}';

  function taskFile(over) {
    return aufgabe({ line: 2, taskText: `- [ ] Aufgabe #tag ${DUE} 2099-01-01`, ...over });
  }
  // Treffer-Zahl der Anzeige ist die Zahl der Zeilen: n gleiche Aufgaben.
  const nAufgaben = (n) => Array.from({ length: n }, () => taskFile());

  it('gruppierte Ausgabe: verschachtelte perspective-query-group mit Titeln, group.none bei null', () => {
    const host = render(
      aufgabenListe({
        rows: [
          aufgabe({
            name: 'A',
            path: '/r/A.md',
            line: 3,
            taskText: `- [ ] Erste ${DUE} 2099-01-01 ${HIGH}`,
          }),
          aufgabe({ name: 'A', path: '/r/A.md', line: 9, taskText: '- [ ] Ohne Ueberschrift' }),
        ],
        groups: [makeGroup('Alpha', [0], [makeGroup('highest', [0])]), makeGroup(null, [1])],
      }),
    );
    // Zwei aeussere Gruppen (Alpha, Wert-lose), eine innere (highest).
    expect(host.querySelectorAll('.perspective-query-group[data-level="0"]').length).toBe(2);
    expect(host.querySelectorAll('.perspective-query-group[data-level="1"]').length).toBe(1);
    // Titel in Dokument-Reihenfolge; null -> lokalisiertes query.group.none.
    const titles = [...host.querySelectorAll('.perspective-query-group-title')].map(
      (n) => n.textContent,
    );
    expect(titles).toEqual(['Alpha', 'highest', de['query.group.none']]);
    // Innerste Ebene traegt die Task-Liste; die Wert-lose Gruppe ebenso.
    expect(host.querySelectorAll('ul.perspective-query-tasks').length).toBe(2);
    // Kein Leer-Hinweis: die Gruppen tragen die Treffer.
    expect(host.querySelector('.perspective-query-status')).toBeNull();
  });

  it('HIDE due/backlink/tags: die betroffenen Elemente entfallen', () => {
    // Ohne HIDE: Faellig-Badge, Datei-Backlink und Inline-Tag sind vorhanden.
    const full = render(aufgabenListe({ rows: [taskFile()] }));
    expect(full.querySelector('.task-marker-due')).not.toBeNull();
    expect(full.querySelector('.perspective-query-task-file')).not.toBeNull();
    expect(full.querySelector('.perspective-query-task-desc').textContent).toBe('Aufgabe #tag');

    const hidden = render(
      aufgabenListe({ rows: [taskFile()], wishes: { hide: ['due', 'backlink', 'tags'] } }),
    );
    expect(hidden.querySelector('.task-marker-due')).toBeNull();
    expect(hidden.querySelector('.perspective-query-task-file')).toBeNull();
    // Inline-Tag aus der Beschreibung entfernt.
    expect(hidden.querySelector('.perspective-query-task-desc').textContent).toBe('Aufgabe');
  });

  it('HIDE count: die Zaehler-Zeile entfaellt', () => {
    const withCount = render(aufgabenListe({ rows: nAufgaben(3) }));
    expect(withCount.querySelector('.perspective-query-task-count')).not.toBeNull();
    const hidden = render(aufgabenListe({ rows: nAufgaben(3), wishes: { hide: ['count'] } }));
    expect(hidden.querySelector('.perspective-query-task-count')).toBeNull();
  });

  it('Zaehler-Zeile: Singular bei 1, Plural mit {n} sonst', () => {
    const one = render(aufgabenListe({ rows: nAufgaben(1) }));
    expect(one.querySelector('.perspective-query-task-count').textContent).toBe(
      de['query.tasks.count.one'],
    );
    const many = render(aufgabenListe({ rows: nAufgaben(4) }));
    expect(many.querySelector('.perspective-query-task-count').textContent).toBe(
      de['query.tasks.count.other'].replace('{n}', '4'),
    );
  });

  it('SHORT: Badge zeigt nur das Symbol, der volle Wert wandert in den Tooltip', () => {
    const host = render(aufgabenListe({ rows: [taskFile()], wishes: { short: true } }));
    const badge = host.querySelector('.task-marker-due');
    expect(badge.textContent).toBe(DUE);
    expect(badge.title).toContain('2099-01-01');
    expect(badge.title).not.toBe('');
  });
});

// --- 4T-000504 (Epic 3E-000096): Rueckschreib-Aktionen an den Task-Treffern --------

describe('frontmatter-query-view — Aktions-Elemente der Task-Treffer (4T-000504)', () => {
  const DUE = '\u{1F4C5}';

  function datedFile(over) {
    return aufgabe({ line: 5, taskText: `- [ ] Konzept ${DUE} 2099-01-01`, ...over });
  }
  const liste = (...rows) => aufgabenListe({ rows });

  it('li traegt Treffer-Identitaet (data-task-path/-line/-text)', () => {
    const host = render(liste(datedFile()));
    const li = host.querySelector('li.perspective-query-task');
    expect(li.dataset.taskPath).toBe('/raum/Aufgaben.md');
    expect(li.dataset.taskLine).toBe('5');
    expect(li.dataset.taskText).toBe(`- [ ] Konzept ${DUE} 2099-01-01`);
  });

  it('Status-Box traegt data-task-action=toggle mit Titel', () => {
    const host = render(liste(datedFile()));
    const status = host.querySelector('.perspective-query-task-status');
    expect(status.dataset.taskAction).toBe('toggle');
    // Die Status-Optik nutzt das modul-interne t (im jsdom-Test ein
    // Passthrough auf den Key); der Titel bindet an taskQuery.toggle.
    expect(status.title).toBe('taskQuery.toggle');
  });

  it('Verschiebe-Knopf nur bei verwertbarem Termin-Feld, Bearbeiten-Knopf immer', () => {
    const withDate = render(liste(datedFile()));
    expect(
      withDate.querySelector('button.perspective-query-task-btn[data-task-action="postpone"]'),
    ).not.toBeNull();
    expect(
      withDate.querySelector('button.perspective-query-task-btn[data-task-action="edit"]'),
    ).not.toBeNull();

    // Treffer ohne Termin-Feld: kein Verschiebe-Knopf, Bearbeiten bleibt.
    const noDate = render(liste(datedFile({ taskText: '- [ ] Ohne Termin' })));
    expect(
      noDate.querySelector('button.perspective-query-task-btn[data-task-action="postpone"]'),
    ).toBeNull();
    expect(
      noDate.querySelector('button.perspective-query-task-btn[data-task-action="edit"]'),
    ).not.toBeNull();
  });

  it('HIDE postpone/edit blendet die jeweiligen Knoepfe aus', () => {
    const hideBoth = render(
      aufgabenListe({ rows: [datedFile()], wishes: { hide: ['postpone', 'edit'] } }),
    );
    expect(
      hideBoth.querySelector('button.perspective-query-task-btn[data-task-action="postpone"]'),
    ).toBeNull();
    expect(
      hideBoth.querySelector('button.perspective-query-task-btn[data-task-action="edit"]'),
    ).toBeNull();
    // Status-Box (Toggle) bleibt unabhaengig von HIDE erhalten.
    expect(hideBoth.querySelector('.perspective-query-task-status').dataset.taskAction).toBe(
      'toggle',
    );
  });
});

// --- 4T-000505 (Epic 3E-000096): Dringlichkeits-Badge (SHOW urgency) und globaler ---
// Abfrage-Fehler.
describe('frontmatter-query-view — Dringlichkeit und globale Abfrage (4T-000505)', () => {
  const DUE = '\u{1F4C5}';

  function urgencyFile(over) {
    return aufgabe({ line: 5, taskText: `- [ ] Konzept ${DUE} 2099-01-01`, urgency: 8.8, ...over });
  }
  const mitDringlichkeit = (row) => aufgabenListe({ rows: [row], wishes: { show: ['urgency'] } });

  it('SHOW urgency: Badge task-marker-urgency mit Blitz-Symbol und zwei Nachkommastellen', () => {
    const host = render(mitDringlichkeit(urgencyFile()));
    const badge = host.querySelector('.task-marker.task-marker-urgency');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('⚡ 8.80');
  });

  it('Dringlichkeit: erst auf zwei Stellen gerundet, dann gezeigt (4T-002035)', () => {
    // Die Menge trägt die Dringlichkeit ungerundet (Festlegung 4 des Epics).
    // Bei 0,015 unterscheiden sich «runden, dann zeigen» (0.02, wie bisher die
    // Auswertung rundete) und «ohne Rundung zeigen» (0.01).
    const host = render(mitDringlichkeit(urgencyFile({ urgency: 0.015 })));
    expect(host.querySelector('.task-marker-urgency').textContent).toBe('⚡ 0.02');
  });

  it('ohne SHOW ist der Dringlichkeits-Score standardmaessig verborgen', () => {
    const host = render(aufgabenListe({ rows: [urgencyFile()] }));
    expect(host.querySelector('.task-marker-urgency')).toBeNull();
  });

  it('SHOW urgency ohne Zahlwert erzeugt kein Badge', () => {
    // Ohne Zahl (defensiv, die Menge kommt über die Prozess-Grenze); direkt
    // gebaut, weil der Helfer eine fehlende Angabe mit seinem Standard füllt.
    const ohneZahl = makeRow(
      [],
      taskOrigin('/raum/Aufgaben.md', 'Aufgaben', 5, `- [ ] Konzept ${DUE} 2099-01-01`),
      makeTaskInfo({ urgency: undefined, blocked: false, duplicateId: false }),
    );
    const host = render(mitDringlichkeit(ohneZahl));
    expect(host.querySelector('.task-marker-urgency')).toBeNull();
  });

  it('queryError globalQueryInvalid: lokalisierter Fehlertext, keine Liste', () => {
    // 4T-002034: Der Abfrage-Fehler kommt aus der Ergebnismenge.
    const host = render(
      zustand('ready', { queryError: { code: 'globalQueryInvalid', message: '', pos: -1 } }),
    );
    const err = host.querySelector('.perspective-query-status.perspective-query-error');
    expect(err).not.toBeNull();
    expect(err.textContent).toBe(de['query.syntax.globalQueryInvalid']);
    expect(host.querySelector('.perspective-query-tasks')).toBeNull();
  });
});

// --- 4T-000508 (Epic 3E-000096): Blockiert- und Duplikat-Kennzeichnung -------------
// Die Flags kommen vorberechnet vom Main (Zusatzangaben der Zeile, seit
// 4T-002035 taskInfo.blocked / taskInfo.duplicateId); die
// View haengt dezente Badges an und setzt bei blocked eine li-Klasse. Bewusst
// schlichte taskText-Zeilen, damit die Marker-Badges der Segmente die Flag-
// Badges nicht ueberdecken (dependsOn-Segment -> task-marker-other, invalides
// Datum -> task-marker-invalid — hier beides nicht vorhanden).
describe('frontmatter-query-view — Blockiert und Duplikat (4T-000508)', () => {
  function taskFile(over) {
    return aufgabe({ line: 3, taskText: '- [ ] Dach', ...over });
  }
  const liste = (...rows) => aufgabenListe({ rows });

  it('blocked-Flag: Badge task-marker-blocked mit Titel und li-Klasse perspective-query-task-blocked', () => {
    const host = render(liste(taskFile({ blocked: true })));
    const li = host.querySelector('li.perspective-query-task');
    expect(li.classList.contains('perspective-query-task-blocked')).toBe(true);
    const badge = host.querySelector('.task-marker.task-marker-blocked');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('⛔');
    // Modul-internes t (jsdom-Passthrough) liefert den Key.
    expect(badge.title).toBe('taskQuery.blocked');
  });

  it('duplicateId-Flag: Badge task-marker-invalid mit Warnsymbol', () => {
    const host = render(liste(taskFile({ duplicateId: true })));
    const badge = host.querySelector('.task-marker.task-marker-invalid');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('⚠');
    expect(badge.title).toBe('taskQuery.duplicateId');
  });

  it('ohne Flags: weder Blockiert- noch Duplikat-Badge, keine blockiert-Klasse', () => {
    const host = render(liste(taskFile()));
    expect(host.querySelector('.task-marker-blocked')).toBeNull();
    expect(host.querySelector('.task-marker-invalid')).toBeNull();
    expect(
      host
        .querySelector('li.perspective-query-task')
        .classList.contains('perspective-query-task-blocked'),
    ).toBe(false);
  });
});

// --- 4T-001074 (Epic 3E-000211): Hervorhebung in Ergebnis-Spalten -----------------

describe('frontmatter-query-view — Hervorhebung (4T-001074)', () => {
  // 4T-002034: Der hervorgehobene Wert reist als Werte-Art `rich` in der Menge;
  // seine Anzeige-Stücke entstehen erst in der Darstellung.
  const hervorgehoben = (segs) => ({ kind: 'rich', segs });

  it('TABLE: markierte Segmente werden ausgezeichnet, unmarkierte bleiben Text', () => {
    const host = render(
      menge({
        type: 'table',
        columns: [spalte('Letzter Kontakt')],
        rows: [
          makeRow(
            [hervorgehoben([{ text: '2026-03-01 — ' }, { text: '48 Tage', bold: true }])],
            datei('Alpha'),
          ),
        ],
        wishes: { withoutId: true },
      }),
    );
    const zelle = host.querySelector('tbody td');
    // Der Text der Zelle bleibt vollstaendig und in Reihenfolge.
    expect(zelle.textContent).toBe('2026-03-01 — 48 Tage');
    // Nur der markierte Anteil steckt im Auszeichnungs-Element.
    const stark = zelle.querySelectorAll('strong');
    expect(stark.length).toBe(1);
    expect(stark[0].textContent).toBe('48 Tage');
  });

  it('TABLE: ein markierter Link bleibt ein klickbarer Link', () => {
    const host = render(
      menge({
        type: 'table',
        columns: [spalte('Ziel')],
        rows: [
          makeRow(
            [hervorgehoben([{ link: { path: '/raum/Ziel.md', name: 'Ziel' }, bold: true }])],
            datei('Alpha'),
          ),
        ],
        wishes: { withoutId: true },
      }),
    );
    const a = host.querySelector('tbody td strong a.perspective-query-item');
    expect(a).not.toBeNull();
    expect(a.dataset.fmPath).toBe('/raum/Ziel.md');
    expect(a.textContent).toBe('Ziel');
  });

  it('LIST-Zusatzfeld: die Markierung wirkt im Anhang', () => {
    const host = render(
      menge({
        columns: [spalte('status')],
        rows: [
          makeRow(
            [hervorgehoben([{ text: 'offen, ' }, { text: 'dringend', bold: true }])],
            datei('Alpha'),
          ),
        ],
      }),
    );
    const extra = host.querySelector('.perspective-query-extra');
    expect(extra.textContent).toBe('offen, dringend');
    expect(extra.querySelectorAll('strong').length).toBe(1);
    expect(extra.querySelector('strong').textContent).toBe('dringend');
  });

  it('Gruppen-Titel: labelSegs tragen die Markierung, ohne sie bleibt der Text', () => {
    // 4T-002035: Der Gruppen-Wert reist roh; ein hervorgehobener Wert ergibt
    // ausgezeichnete Anzeige-Stücke, ein Text-Wert reinen Text.
    const host = render(
      aufgabenListe({
        rows: [
          aufgabe({ name: 'A', path: '/r/A.md', line: 3, taskText: '- [ ] Erste' }),
          aufgabe({ name: 'B', path: '/r/B.md', line: 4, taskText: '- [ ] Zweite' }),
        ],
        groups: [
          makeGroup(hervorgehoben([{ text: 'Alpha', bold: true }]), [0]),
          makeGroup('Beta', [1]),
        ],
      }),
    );
    const titles = [...host.querySelectorAll('.perspective-query-group-title')];
    expect(titles.map((n) => n.textContent)).toEqual(['Alpha', 'Beta']);
    // Erste Gruppe ausgezeichnet, zweite unveraendert als reiner Text.
    expect(titles[0].querySelectorAll('strong').length).toBe(1);
    expect(titles[1].querySelectorAll('strong').length).toBe(0);
  });
});

// 4T-002039 (Epic 3E-000258): Datensatz-Ebene. Die Anzeige der Treffer samt
// Klick gehört zu 4T-002040; hier steht, dass eine Datensatz-Menge ohne Fehler
// als Liste und Tabelle erscheint, mit dem Anzeige-Namen des Datensatzes, dass
// der Hinweis des Aus-Zustands vor «keine Treffer» steht und dass die drei
// neuen Abfrage-Fehler ihren Text bekommen.
describe('frontmatter-query-view — Datensatz-Ebene (4T-002039)', () => {
  const satz = (id, display) => ({
    ...recordOrigin('Library', id),
    path: '/raum/Library.md',
    display,
  });

  it('Aus-Zustand: Hinweis vor «keine Treffer», kein Fehler', () => {
    const host = render(menge({ scope: 'records', hint: 'databaseOff' }));
    const hint = host.querySelector('.perspective-query-hint');
    expect(hint.textContent).toBe(de['query.hint.databaseOff']);
    const status = host.querySelector('.perspective-query-status');
    // 4T-002040: der eigene Leer-Text der Datensatz-Ebene.
    expect(status.textContent).toBe(de['query.emptyRecords']);
    // Reihenfolge: erst der Hinweis, dann der Leer-Text.
    expect(host.firstElementChild).toBe(hint);
    expect(host.querySelector('.perspective-query-error')).toBeNull();
  });

  it('die drei bestehenden Ebenen zeigen im Leer-Fall weiterhin keinen Hinweis', () => {
    const host = render(menge({ type: 'table', hint: 'columnsIgnored' }));
    expect(host.querySelector('.perspective-query-hint')).toBeNull();
    expect(host.querySelector('.perspective-query-status').textContent).toBe(de['query.empty']);
  });

  it('Liste und Tabelle zeigen den Anzeige-Namen, ohne ihn die Kennung', () => {
    const rows = [
      makeRow(['Mann'], satz('r-00001', 'Zauberberg')),
      makeRow([null], satz('r-00002', null)),
    ];
    const liste = render(menge({ scope: 'records', rows, columns: [spalte('Autor')] }));
    const items = [...liste.querySelectorAll('a.perspective-query-item')];
    expect(items.map((a) => a.textContent)).toEqual(['Zauberberg', 'r-00002']);
    const tab = render(
      menge({ scope: 'records', type: 'table', rows, columns: [spalte('Autor')] }),
    );
    // 4T-002040: Auf der Datensatz-Ebene heißt die erste Spalte «Datensatz».
    expect([...tab.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      de['query.table.recordColumn'],
      'Autor',
    ]);
    expect(tab.querySelector('tbody tr td a').textContent).toBe('Zauberberg');
    expect(tab.querySelector('tbody tr').lastElementChild.textContent).toBe('Mann');
  });

  it('4T-002041, 4T-002042: mehrdeutiger Verweis und Kreis zeigen den Hinweis über dem Ergebnis', () => {
    const rows = [makeRow([null], satz('r-00001', 'Zauberberg'))];
    const spalten = [spalte('Verlag')];
    for (const hinweis of ['recordRefAmbiguous', 'recordHullCycle']) {
      const host = render(
        menge({ scope: 'records', type: 'table', rows, columns: spalten, hint: hinweis }),
      );
      const hint = host.querySelector('.perspective-query-hint');
      expect(hint.textContent).toBe(de[`query.hint.${hinweis}`]);
      expect(host.firstElementChild).toBe(hint);
      expect(host.querySelector('table.perspective-query-table')).not.toBeNull();
    }
  });

  it('Abfrage-Fehler der Ebene: lokalisierte Texte, {name} eingesetzt', () => {
    const text = (queryError) =>
      render(zustand('ready', { queryError })).querySelector('.perspective-query-error')
        .textContent;
    expect(text({ code: 'recordsSourceMissing', message: 'x', pos: -1 })).toBe(
      de['query.syntax.recordsSourceMissing'],
    );
    expect(text({ code: 'recordsSourceInvalid', message: 'x', pos: -1, name: '#buch' })).toBe(
      de['query.syntax.recordsSourceInvalid'].replace('{name}', '#buch'),
    );
    // 4T-002042: dazu die drei Fehler der Hüllen-Formen.
    for (const code of ['recordsHighlight', 'hullTarget', 'hullField', 'recordHullScope']) {
      expect(text({ code, message: 'x', pos: -1 }), code).toBe(de[`query.syntax.${code}`]);
    }
  });
});

// 4T-002040 (Epic 3E-000258): Treffer und Verweise der Datensatz-Ebene tragen
// die Angaben des Datensatz-Klicks (Tabellen-Pfad und Kennung) und kein
// data-fm-path; ein Verweis zeigt die Anzeige-Form seines Ziels, ein leerer
// Verweis ist eine leere Zelle ohne Klick-Ziel. Den Klick selbst prüft
// datensatz-treffer-klick.test.js am Bedienweg.
describe('frontmatter-query-view — Datensatz-Treffer und -Verweise (4T-002040)', () => {
  const satz = (id, display) => ({
    ...recordOrigin('Library', id),
    path: '/raum/Library.md',
    display,
  });
  const verweis = (id, display, pfad = '/raum/Library.md') => ({
    kind: 'record',
    table: 'Library',
    id,
    display,
    ...(pfad ? { path: pfad } : {}),
  });
  const ziel = (a) => [a.dataset.fmRecordTable, a.dataset.fmRecordId, a.dataset.fmPath, a.title];

  it('Treffer: Tabellen-Pfad und Kennung statt data-fm-path, Titel in Verweis-Schreibweise', () => {
    const tab = render(
      menge({ scope: 'records', type: 'table', rows: [makeRow([], satz('r-1', 'Z'))] }),
    );
    const a = tab.querySelector('tbody td a.perspective-query-item');
    expect(ziel(a)).toEqual(['/raum/Library.md', 'r-1', undefined, 'Library#^r-1']);
    const liste = render(menge({ scope: 'records', rows: [makeRow([], satz('r-2', null))] }));
    const b = liste.querySelector('li a.perspective-query-item');
    expect([b.textContent, ...ziel(b)]).toEqual([
      'r-2',
      '/raum/Library.md',
      'r-2',
      undefined,
      'Library#^r-2',
    ]);
  });

  it('Verweis-Spalte: Anzeige-Form, sonst Kennung; leer und ohne Ziel ohne Klick-Ziel', () => {
    const rows = [
      makeRow([verweis('r-00001', 'Zauberberg')], satz('r-1', 'Clara')),
      makeRow([verweis('r-00002', '')], satz('r-2', 'Mia')),
      makeRow([null], satz('r-3', 'Tom')),
      makeRow([verweis('r-00003', 'Kurz', null)], satz('r-4', 'Uli')),
    ];
    const tab = render(menge({ scope: 'records', type: 'table', rows, columns: [spalte('Buch')] }));
    const zellen = [...tab.querySelectorAll('tbody tr')].map((tr) => tr.lastElementChild);
    expect(zellen.map((td) => td.textContent)).toEqual(['Zauberberg', 'r-00002', '', 'Kurz']);
    expect(zellen.map((td) => td.querySelectorAll('a').length)).toEqual([1, 1, 0, 0]);
    expect(ziel(zellen[0].querySelector('a'))).toEqual([
      '/raum/Library.md',
      'r-00001',
      undefined,
      'Library#^r-00001',
    ]);
    // Nie die Objekt-Form eines Werts.
    expect(tab.textContent).not.toContain('[object Object]');
    // Das Listen-Zusatzfeld nimmt denselben Weg.
    const liste = render(
      menge({ scope: 'records', rows: rows.slice(0, 1), columns: [spalte('Buch')] }),
    );
    const extra = liste.querySelector('.perspective-query-extra a');
    expect([extra.textContent, extra.dataset.fmRecordId]).toEqual(['Zauberberg', 'r-00001']);
  });

  it('Leer-Text und Spalten-Kopf je Ebene: Datensatz-Ebene eigen, Datei-Ebene unverändert', () => {
    const status = (scope) => render(menge({ scope })).querySelector('.perspective-query-status');
    expect(status('records').textContent).toBe(de['query.emptyRecords']);
    expect(status('files').textContent).toBe(de['query.empty']);
    const kopf = render(menge({ type: 'table', rows: [makeRow([], datei('Alpha'))] }));
    expect(kopf.querySelector('thead th').textContent).toBe(de['query.table.fileColumn']);
    expect(de['query.table.recordColumn']).toBe('Datensatz');
    expect(de['query.emptyRecords']).toBe('Kein Datensatz entspricht dieser Abfrage');
  });
});

// 4T-002077 (Epic 3E-000259): gruppierte Liste der Datei-, Block- und
// Datensatz-Ebene mit der Gruppen-Form der Aufgaben-Liste (4T-000503 oben). Je
// Ebene zwei Stufen, die Gruppe ohne Wert zuletzt, wie der Zeilen-Bau sie liefert;
// auf der Datensatz-Ebene ist der Gruppen-Wert ein Datensatz-Verweis.
describe('frontmatter-query-view — gruppierte Liste aller Ebenen (4T-002077)', () => {
  const autor = { kind: 'record', table: 'Authors', id: 'r-9', display: 'Le Guin', path: '/a.md' };
  const satz = (n) => ({ ...recordOrigin('L', `r-${n}`), path: '/raum/L.md', display: n });
  const block = (n) => blockOrigin(`/raum/${n}.md`, n, `b${n}`);
  const ebenen = { files: [datei, 'Eins'], blocks: [block, 'Eins'], records: [satz, autor] };
  it.each(Object.keys(ebenen))('%s: Überschriften je Stufe, Treffer wie ungruppiert', (scope) => {
    const [herkunft, wert] = ebenen[scope];
    const rows = ['A', 'B', 'C'].map((n) => makeRow([], herkunft(n)));
    const unter = [makeGroup('x', [0]), makeGroup(null, [1])];
    const groups = [makeGroup(wert, [0, 1], unter), makeGroup(null, [2])];
    const host = render(menge({ scope, rows, groups }));
    const stufe = (n) => host.querySelectorAll(`.perspective-query-group[data-level="${n}"]`);
    expect([stufe(0).length, stufe(1).length]).toEqual([2, 2]);
    const titel = [...host.querySelectorAll('.perspective-query-group-title')];
    const ohne = de['query.group.none'];
    expect(titel.map((n) => n.textContent)).toEqual([wert.display || wert, 'x', ohne, ohne]);
    const klickbar = titel[0].querySelectorAll('a[data-fm-record-id="r-9"]').length;
    expect(klickbar).toBe(scope === 'records' ? 1 : 0);
    // Treffer mit den Klick-Merkmalen der Liste, je Gruppe der untersten Stufe eine Liste.
    const li = (h) => [...h.querySelectorAll('li')].map((n) => n.outerHTML);
    expect(li(host)).toEqual(li(render(menge({ scope, rows }))));
    expect(host.querySelectorAll('.perspective-query-group > ul').length).toBe(3);
    // 4T-002078: die gruppierte Tabelle, je Gruppe eine Zeile mit dem Gruppen-Wert vorn.
    const tab = render(menge({ scope, type: 'table', rows, groups }));
    expect(tab.querySelector('tbody td').textContent).toBe(titel[0].textContent);
  });
});
