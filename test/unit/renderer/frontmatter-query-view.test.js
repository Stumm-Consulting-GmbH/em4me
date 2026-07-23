// @vitest-environment jsdom
// 4T-0355 (Epic 3E-0065): buildQueryListDom erzeugt aus der Abfrage-IPC-Antwort
// das Listen-DOM der Frontmatter-Abfrage (perspective-query). Reine Funktion mit
// injiziertem t; deterministisch über alle Status- und Fehlerzustände prüfbar.
// Der t-Stub liest die echte de.json, damit Platzhalter-Ersetzung ({pos},
// {files}) und Key-Existenz gleich mitgetestet werden.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQueryListDom } from '../../../src/renderer/modules/frontmatter-query-view.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const de = JSON.parse(readFileSync(path.join(dir, '../../../src/i18n/de.json'), 'utf8'));
const tStub = (key) => de[key] ?? key;

function render(payload) {
  const host = document.createElement('div');
  host.appendChild(buildQueryListDom(payload, tStub));
  return host;
}

describe('frontmatter-query-view buildQueryListDom (4T-0355)', () => {
  it('ready mit Treffern: klickbare Eintraege in Eingabe-Reihenfolge mit data-fm-path', () => {
    const host = render({
      status: 'ready',
      files: [
        { name: 'Alpha', path: '/raum/Alpha.md' },
        { name: 'Ordner∕Unterseite', path: '/raum/Ordner∕Unterseite.md' },
      ],
    });
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
    const host = render({ status: 'ready', files: [] });
    expect(host.querySelector('.perspective-query-list')).toBeNull();
    const status = host.querySelector('.perspective-query-status');
    expect(status).not.toBeNull();
    expect(status.textContent).toBe(de['query.empty']);
    expect(status.classList.contains('perspective-query-error')).toBe(false);
  });

  it('queryError mit Position: Fehler-Marker, {pos} ersetzt, keine Liste', () => {
    const host = render({
      status: 'ready',
      files: [],
      queryError: { code: 'unexpectedChar', pos: 5, message: 'irrelevant deutsch' },
    });
    expect(host.querySelector('.perspective-query-list')).toBeNull();
    const err = host.querySelector('.perspective-query-status.perspective-query-error');
    expect(err).not.toBeNull();
    expect(err.textContent).toContain('5');
    expect(err.textContent).not.toContain('{pos}');
    // Die deutschsprachige message des Parsers wird nicht durchgereicht.
    expect(err.textContent).not.toContain('irrelevant');
  });

  it('queryError mit unbekanntem Code: Fallback auf den generischen Syntax-Text', () => {
    const host = render({
      status: 'ready',
      files: [],
      queryError: { code: 'voelligNeu', pos: -1 },
    });
    const err = host.querySelector('.perspective-query-error');
    expect(err).not.toBeNull();
    expect(err.textContent).toBe(de['query.syntax.syntax']);
  });

  it('oversized: Hinweis mit eingesetzter Dateizahl', () => {
    const host = render({ status: 'oversized', meta: { fileCount: 2500 } });
    const status = host.querySelector('.perspective-query-status');
    expect(status.textContent).toContain('2500');
    expect(status.textContent).not.toContain('{files}');
    expect(host.querySelector('.perspective-query-list')).toBeNull();
  });

  it('indexing / unavailable / error / loading: je ein lokalisierter Hinweis', () => {
    for (const [status, key] of [
      ['indexing', 'query.indexing'],
      ['unavailable', 'query.unavailable'],
      ['error', 'query.error'],
      ['loading', 'query.loading'],
    ]) {
      const host = render({ status });
      const node = host.querySelector('.perspective-query-status');
      expect(node, status).not.toBeNull();
      expect(node.textContent).toBe(de[key]);
      expect(host.querySelector('.perspective-query-list')).toBeNull();
    }
  });
});

// --- 4T-0404 (Epic 3E-0076): Tabellen-Ausgabe und LIST-Zusatzfeld -------------

describe('frontmatter-query-view — TABLE und Zusatzfeld (4T-0404)', () => {
  const tablePayload = {
    status: 'ready',
    queryType: 'table',
    files: [
      { name: 'Alpha', path: '/raum/Alpha.md' },
      { name: 'Beta', path: '/raum/Beta.md' },
    ],
    table: {
      withoutId: false,
      headers: ['Status', 'file.mtime'],
      rows: [
        {
          name: 'Alpha',
          path: '/raum/Alpha.md',
          cells: [[{ text: 'offen' }], [{ text: '2026-07-01' }]],
        },
        {
          name: 'Beta',
          path: '/raum/Beta.md',
          cells: [[{ text: 'erledigt' }], [{ link: { path: '/raum/Ziel.md', name: 'Ziel' } }]],
        },
      ],
    },
  };

  it('TABLE: Kopfzeile mit Datei-Spalte, klickbare Datei-Links, Zell-Segmente', () => {
    const host = render(tablePayload);
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
    // Link-Segment in einer Zelle bleibt klickbar (data-fm-path).
    const cellLink = rows[1].querySelectorAll('td')[2].querySelector('a.perspective-query-item');
    expect(cellLink.textContent).toBe('Ziel');
    expect(cellLink.dataset.fmPath).toBe('/raum/Ziel.md');
  });

  it('TABLE WITHOUT ID: keine Datei-Spalte', () => {
    const payload = {
      ...tablePayload,
      table: { ...tablePayload.table, withoutId: true },
    };
    const host = render(payload);
    const headers = [...host.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Status', 'file.mtime']);
    expect(host.querySelectorAll('tbody tr')[0].querySelectorAll('td').length).toBe(2);
  });

  it('TABLE ohne Treffer: Leer-Hinweis statt Tabelle', () => {
    const host = render({
      status: 'ready',
      queryType: 'table',
      files: [],
      table: { withoutId: false, headers: ['Status'], rows: [] },
    });
    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelector('.perspective-query-status').textContent).toBe(de['query.empty']);
  });

  it('COLUMNS: Listen-Container trägt data-fm-columns (4T-0405)', () => {
    const files = [
      { name: 'Alpha', path: '/raum/Alpha.md' },
      { name: 'Beta', path: '/raum/Beta.md' },
    ];
    const host = render({ status: 'ready', queryType: 'list', layoutColumns: 3, files });
    expect(host.querySelector('.perspective-query-list').dataset.fmColumns).toBe('3');
    // Ohne COLUMNS (bzw. bei 1) kein Attribut.
    const plain = render({ status: 'ready', queryType: 'list', files });
    expect(plain.querySelector('.perspective-query-list').dataset.fmColumns).toBeUndefined();
    const one = render({ status: 'ready', queryType: 'list', layoutColumns: 1, files });
    expect(one.querySelector('.perspective-query-list').dataset.fmColumns).toBeUndefined();
  });

  it('Hinweis columnsIgnored: lokalisierter Text oberhalb der Tabelle (4T-0405)', () => {
    const host = render({ ...tablePayload, hint: 'columnsIgnored' });
    const hint = host.querySelector('.perspective-query-hint');
    expect(hint).not.toBeNull();
    expect(hint.textContent).toBe(de['query.hint.columnsIgnored']);
    // Das Ergebnis rendert trotzdem (Hinweis, kein Fehler).
    expect(host.querySelector('table.perspective-query-table')).not.toBeNull();
    // Unbekannte Hint-Codes werden ignoriert.
    const none = render({ ...tablePayload, hint: 'voelligNeu' });
    expect(none.querySelector('.perspective-query-hint')).toBeNull();
  });

  it('LIST-Zusatzfeld: gedämpfter Anhang mit Text- und Link-Segmenten', () => {
    const host = render({
      status: 'ready',
      queryType: 'list',
      files: [
        {
          name: 'Alpha',
          path: '/raum/Alpha.md',
          extra: [{ text: 'offen, ' }, { link: { path: '/raum/Ziel.md', name: 'Ziel' } }],
        },
        { name: 'Beta', path: '/raum/Beta.md' },
      ],
    });
    const lis = host.querySelectorAll('.perspective-query-list li');
    const extra = lis[0].querySelector('.perspective-query-extra');
    expect(extra).not.toBeNull();
    expect(extra.textContent).toBe('offen, Ziel');
    expect(extra.querySelector('a.perspective-query-item').dataset.fmPath).toBe('/raum/Ziel.md');
    // Ohne Zusatzfeld kein leerer Anhang.
    expect(lis[1].querySelector('.perspective-query-extra')).toBeNull();
  });
});

// --- 4T-0409 (Epic 3E-0077): Block-Treffer mit Anker-Sprung -------------------

describe('frontmatter-query-view — Block-Treffer (4T-0409)', () => {
  it('LIST: Block-Treffer tragen data-fm-anchor mit ^-Praefix', () => {
    const host = render({
      status: 'ready',
      queryType: 'list',
      files: [
        { name: 'Alpha#^a1', path: '/raum/Alpha.md', anchor: 'a1' },
        { name: 'Beta', path: '/raum/Beta.md' },
      ],
    });
    const items = host.querySelectorAll('a.perspective-query-item');
    expect(items[0].textContent).toBe('Alpha#^a1');
    expect(items[0].dataset.fmPath).toBe('/raum/Alpha.md');
    expect(items[0].dataset.fmAnchor).toBe('^a1');
    // Datei-Treffer ohne anchor bleiben ohne Attribut.
    expect(items[1].dataset.fmAnchor).toBeUndefined();
  });

  it('TABLE: Ziel-Spalte der Block-Zeilen traegt data-fm-anchor', () => {
    const host = render({
      status: 'ready',
      queryType: 'table',
      files: [{ name: 'Alpha#^a1', path: '/raum/Alpha.md', anchor: 'a1' }],
      table: {
        withoutId: false,
        headers: ['Status'],
        rows: [
          {
            name: 'Alpha#^a1',
            path: '/raum/Alpha.md',
            anchor: 'a1',
            cells: [[{ text: 'offen' }]],
          },
        ],
      },
    });
    const link = host.querySelector('tbody a.perspective-query-item');
    expect(link.textContent).toBe('Alpha#^a1');
    expect(link.dataset.fmAnchor).toBe('^a1');
  });
});

// --- 4T-0502 (Epic 3E-0096): Task-Trefferliste (TASKS-Scope) -----------------

describe('frontmatter-query-view — Task-Treffer (4T-0502)', () => {
  // Payload wie der Main-Query-Pfad (queryScope 'tasks', Treffer mit taskText,
  // line, path). Die View parst taskText mit dem Marker-Kern und baut die Optik.
  const DUE = '\u{1F4C5}';
  const tasksPayload = {
    status: 'ready',
    queryScope: 'tasks',
    files: [
      {
        name: 'Aufgaben',
        path: '/raum/Aufgaben.md',
        line: 5,
        taskText: `- [ ] Konzept schreiben ${DUE} 2099-01-01`,
      },
      {
        name: 'Aufgaben',
        path: '/raum/Aufgaben.md',
        line: 6,
        taskText: '- [x] Kickoff halten',
      },
      {
        name: 'Aufgaben',
        path: '/raum/Aufgaben.md',
        line: 7,
        taskText: '- [/] Review offen',
      },
    ],
  };

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
    const host = render({
      status: 'ready',
      queryScope: 'tasks',
      files: [{ name: 'Kaputt', path: '/raum/Kaputt.md', line: 3, taskText: 'kein Task hier' }],
    });
    const li = host.querySelector('li.perspective-query-task');
    expect(li.querySelector('.perspective-query-task-status')).toBeNull();
    const link = li.querySelector('a.perspective-query-item');
    expect(link.textContent).toBe('Kaputt');
    expect(link.dataset.fmPath).toBe('/raum/Kaputt.md');
  });

  it('queryError tasksScopeDisabled: lokalisierter Fehlertext, keine Liste', () => {
    const host = render({
      status: 'ready',
      files: [],
      queryError: { code: 'tasksScopeDisabled', pos: -1 },
    });
    expect(host.querySelector('.perspective-query-tasks')).toBeNull();
    const err = host.querySelector('.perspective-query-status.perspective-query-error');
    expect(err).not.toBeNull();
    expect(err.textContent).toBe(de['query.syntax.tasksScopeDisabled']);
  });
});

// --- 4T-0503 (Epic 3E-0096): Gruppierung und Task-Layout (HIDE/SHOW/SHORT) ----

describe('frontmatter-query-view — Gruppierung und Layout (4T-0503)', () => {
  const DUE = '\u{1F4C5}';
  const HIGH = '\u{1F53A}';

  function taskFile(over) {
    return {
      name: 'Aufgaben',
      path: '/raum/Aufgaben.md',
      line: 2,
      taskText: `- [ ] Aufgabe #tag ${DUE} 2099-01-01`,
      ...over,
    };
  }

  it('gruppierte Ausgabe: verschachtelte perspective-query-group mit Titeln, group.none bei null', () => {
    const host = render({
      status: 'ready',
      queryScope: 'tasks',
      totalCount: 2,
      taskLayout: { hide: [], show: [], short: false },
      groups: [
        {
          label: 'Alpha',
          groups: [
            {
              label: 'highest',
              items: [
                {
                  name: 'A',
                  path: '/r/A.md',
                  line: 3,
                  taskText: `- [ ] Erste ${DUE} 2099-01-01 ${HIGH}`,
                },
              ],
            },
          ],
        },
        {
          label: null,
          items: [{ name: 'A', path: '/r/A.md', line: 9, taskText: '- [ ] Ohne Ueberschrift' }],
        },
      ],
    });
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
    // Kein Leer-Hinweis, obwohl files fehlt: die Gruppen tragen die Treffer.
    expect(host.querySelector('.perspective-query-status')).toBeNull();
  });

  it('HIDE due/backlink/tags: die betroffenen Elemente entfallen', () => {
    // Ohne HIDE: Faellig-Badge, Datei-Backlink und Inline-Tag sind vorhanden.
    const full = render({ status: 'ready', queryScope: 'tasks', files: [taskFile()] });
    expect(full.querySelector('.task-marker-due')).not.toBeNull();
    expect(full.querySelector('.perspective-query-task-file')).not.toBeNull();
    expect(full.querySelector('.perspective-query-task-desc').textContent).toBe('Aufgabe #tag');

    const hidden = render({
      status: 'ready',
      queryScope: 'tasks',
      taskLayout: { hide: ['due', 'backlink', 'tags'], show: [], short: false },
      files: [taskFile()],
    });
    expect(hidden.querySelector('.task-marker-due')).toBeNull();
    expect(hidden.querySelector('.perspective-query-task-file')).toBeNull();
    // Inline-Tag aus der Beschreibung entfernt.
    expect(hidden.querySelector('.perspective-query-task-desc').textContent).toBe('Aufgabe');
  });

  it('HIDE count: die Zaehler-Zeile entfaellt', () => {
    const withCount = render({
      status: 'ready',
      queryScope: 'tasks',
      totalCount: 3,
      files: [taskFile()],
    });
    expect(withCount.querySelector('.perspective-query-task-count')).not.toBeNull();
    const hidden = render({
      status: 'ready',
      queryScope: 'tasks',
      totalCount: 3,
      taskLayout: { hide: ['count'], show: [], short: false },
      files: [taskFile()],
    });
    expect(hidden.querySelector('.perspective-query-task-count')).toBeNull();
  });

  it('Zaehler-Zeile: Singular bei 1, Plural mit {n} sonst', () => {
    const one = render({
      status: 'ready',
      queryScope: 'tasks',
      totalCount: 1,
      files: [taskFile()],
    });
    expect(one.querySelector('.perspective-query-task-count').textContent).toBe(
      de['query.tasks.count.one'],
    );
    const many = render({
      status: 'ready',
      queryScope: 'tasks',
      totalCount: 4,
      files: [taskFile()],
    });
    expect(many.querySelector('.perspective-query-task-count').textContent).toBe(
      de['query.tasks.count.other'].replace('{n}', '4'),
    );
  });

  it('SHORT: Badge zeigt nur das Symbol, der volle Wert wandert in den Tooltip', () => {
    const host = render({
      status: 'ready',
      queryScope: 'tasks',
      taskLayout: { hide: [], show: [], short: true },
      files: [taskFile()],
    });
    const badge = host.querySelector('.task-marker-due');
    expect(badge.textContent).toBe(DUE);
    expect(badge.title).toContain('2099-01-01');
    expect(badge.title).not.toBe('');
  });
});

// --- 4T-0504 (Epic 3E-0096): Rueckschreib-Aktionen an den Task-Treffern --------

describe('frontmatter-query-view — Aktions-Elemente der Task-Treffer (4T-0504)', () => {
  const DUE = '\u{1F4C5}';

  function datedFile(over) {
    return {
      name: 'Aufgaben',
      path: '/raum/Aufgaben.md',
      line: 5,
      taskText: `- [ ] Konzept ${DUE} 2099-01-01`,
      ...over,
    };
  }

  it('li traegt Treffer-Identitaet (data-task-path/-line/-text)', () => {
    const host = render({ status: 'ready', queryScope: 'tasks', files: [datedFile()] });
    const li = host.querySelector('li.perspective-query-task');
    expect(li.dataset.taskPath).toBe('/raum/Aufgaben.md');
    expect(li.dataset.taskLine).toBe('5');
    expect(li.dataset.taskText).toBe(`- [ ] Konzept ${DUE} 2099-01-01`);
  });

  it('Status-Box traegt data-task-action=toggle mit Titel', () => {
    const host = render({ status: 'ready', queryScope: 'tasks', files: [datedFile()] });
    const status = host.querySelector('.perspective-query-task-status');
    expect(status.dataset.taskAction).toBe('toggle');
    // Die Status-Optik nutzt das modul-interne t (im jsdom-Test ein
    // Passthrough auf den Key); der Titel bindet an taskQuery.toggle.
    expect(status.title).toBe('taskQuery.toggle');
  });

  it('Verschiebe-Knopf nur bei verwertbarem Termin-Feld, Bearbeiten-Knopf immer', () => {
    const withDate = render({ status: 'ready', queryScope: 'tasks', files: [datedFile()] });
    expect(
      withDate.querySelector('button.perspective-query-task-btn[data-task-action="postpone"]'),
    ).not.toBeNull();
    expect(
      withDate.querySelector('button.perspective-query-task-btn[data-task-action="edit"]'),
    ).not.toBeNull();

    // Treffer ohne Termin-Feld: kein Verschiebe-Knopf, Bearbeiten bleibt.
    const noDate = render({
      status: 'ready',
      queryScope: 'tasks',
      files: [datedFile({ taskText: '- [ ] Ohne Termin' })],
    });
    expect(
      noDate.querySelector('button.perspective-query-task-btn[data-task-action="postpone"]'),
    ).toBeNull();
    expect(
      noDate.querySelector('button.perspective-query-task-btn[data-task-action="edit"]'),
    ).not.toBeNull();
  });

  it('HIDE postpone/edit blendet die jeweiligen Knoepfe aus', () => {
    const hideBoth = render({
      status: 'ready',
      queryScope: 'tasks',
      taskLayout: { hide: ['postpone', 'edit'], show: [], short: false },
      files: [datedFile()],
    });
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

// --- 4T-0505 (Epic 3E-0096): Dringlichkeits-Badge (SHOW urgency) und globaler ---
// Abfrage-Fehler.
describe('frontmatter-query-view — Dringlichkeit und globale Abfrage (4T-0505)', () => {
  const DUE = '\u{1F4C5}';

  function urgencyFile(over) {
    return {
      name: 'Aufgaben',
      path: '/raum/Aufgaben.md',
      line: 5,
      taskText: `- [ ] Konzept ${DUE} 2099-01-01`,
      urgency: 8.8,
      ...over,
    };
  }

  it('SHOW urgency: Badge task-marker-urgency mit Blitz-Symbol und zwei Nachkommastellen', () => {
    const host = render({
      status: 'ready',
      queryScope: 'tasks',
      taskLayout: { hide: [], show: ['urgency'], short: false },
      files: [urgencyFile()],
    });
    const badge = host.querySelector('.task-marker.task-marker-urgency');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('⚡ 8.80');
  });

  it('ohne SHOW ist der Dringlichkeits-Score standardmaessig verborgen', () => {
    const host = render({
      status: 'ready',
      queryScope: 'tasks',
      files: [urgencyFile()],
    });
    expect(host.querySelector('.task-marker-urgency')).toBeNull();
  });

  it('SHOW urgency ohne Zahlwert erzeugt kein Badge', () => {
    const host = render({
      status: 'ready',
      queryScope: 'tasks',
      taskLayout: { hide: [], show: ['urgency'], short: false },
      files: [urgencyFile({ urgency: undefined })],
    });
    expect(host.querySelector('.task-marker-urgency')).toBeNull();
  });

  it('queryError globalQueryInvalid: lokalisierter Fehlertext, keine Liste', () => {
    const host = render({
      status: 'ready',
      files: [],
      queryError: { code: 'globalQueryInvalid', pos: -1 },
    });
    const err = host.querySelector('.perspective-query-status.perspective-query-error');
    expect(err).not.toBeNull();
    expect(err.textContent).toBe(de['query.syntax.globalQueryInvalid']);
    expect(host.querySelector('.perspective-query-tasks')).toBeNull();
  });
});

// --- 4T-0508 (Epic 3E-0096): Blockiert- und Duplikat-Kennzeichnung -------------
// Die Flags kommen vorberechnet vom Main (file.blocked / file.duplicateId); die
// View haengt dezente Badges an und setzt bei blocked eine li-Klasse. Bewusst
// schlichte taskText-Zeilen, damit die Marker-Badges der Segmente die Flag-
// Badges nicht ueberdecken (dependsOn-Segment -> task-marker-other, invalides
// Datum -> task-marker-invalid — hier beides nicht vorhanden).
describe('frontmatter-query-view — Blockiert und Duplikat (4T-0508)', () => {
  function taskFile(over) {
    return {
      name: 'Aufgaben',
      path: '/raum/Aufgaben.md',
      line: 3,
      taskText: '- [ ] Dach',
      ...over,
    };
  }

  it('blocked-Flag: Badge task-marker-blocked mit Titel und li-Klasse perspective-query-task-blocked', () => {
    const host = render({
      status: 'ready',
      queryScope: 'tasks',
      files: [taskFile({ blocked: true })],
    });
    const li = host.querySelector('li.perspective-query-task');
    expect(li.classList.contains('perspective-query-task-blocked')).toBe(true);
    const badge = host.querySelector('.task-marker.task-marker-blocked');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('⛔');
    // Modul-internes t (jsdom-Passthrough) liefert den Key.
    expect(badge.title).toBe('taskQuery.blocked');
  });

  it('duplicateId-Flag: Badge task-marker-invalid mit Warnsymbol', () => {
    const host = render({
      status: 'ready',
      queryScope: 'tasks',
      files: [taskFile({ duplicateId: true })],
    });
    const badge = host.querySelector('.task-marker.task-marker-invalid');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('⚠');
    expect(badge.title).toBe('taskQuery.duplicateId');
  });

  it('ohne Flags: weder Blockiert- noch Duplikat-Badge, keine blockiert-Klasse', () => {
    const host = render({
      status: 'ready',
      queryScope: 'tasks',
      files: [taskFile()],
    });
    expect(host.querySelector('.task-marker-blocked')).toBeNull();
    expect(host.querySelector('.task-marker-invalid')).toBeNull();
    expect(
      host
        .querySelector('li.perspective-query-task')
        .classList.contains('perspective-query-task-blocked'),
    ).toBe(false);
  });
});
