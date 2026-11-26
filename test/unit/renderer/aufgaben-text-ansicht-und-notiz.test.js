// @vitest-environment jsdom
// 4T-002822 (Epic 3E-000445, Story 4S-001197): Der Workflow-Befehl, der ein
// Abfrage-Ergebnis in eine Notiz schreibt (`result-set-markdown.js`), schreibt
// bei Aufgaben denselben Text, den die Abfrage-Ansicht zeigt (Punkt 51 der
// Entscheidungs-Runde vom 2026-11-22: «Die Notiz bekommt denselben Text wie die
// Abfrage-Ansicht»).
//
// **Vergleich statt fester Erwartung.** Je Form legt der Fall für dieselbe
// Ergebnismenge den Text der Ansicht (gezeichnet über den Einstieg der
// Befüllung, `buildQueryListDom`) neben den Text der geschriebenen Notiz
// (gezeichnet mit der Zeichen-Pipeline der Anwendung). Die Daten tragen
// Termin- und Prioritäts-Zeichen, den globalen Aufgaben-Filter und ein
// Schlagwort, also genau das, worin sich beide Wege vor 4T-002822 unterschieden.
// Gegenprobe am alten Stand: rot an jedem Fall außer dem Kopf der Liste.
//
// Beide Wege lesen die Einstellung zum globalen Filter: die Ansicht aus dem
// Marker-Kern (`configureTaskMarkers`, gesetzt wie aus den Einstellungen), der
// Schreiber aus seiner Umgebung (`aufgaben`), die der Hauptprozess aus
// derselben Einstellungs-Quelle füllt.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQueryListDom } from '../../../src/renderer/modules/query/frontmatter-query-view.js';
import { resultSetMarkdown } from '../../../src/shared/query/result-set-markdown.js';
import { taskDisplaySettings } from '../../../src/shared/query/result-display.js';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { configureTaskMarkers } from '../../../src/shared/markdown/plugins.js';
import {
  makeColumn,
  taskOrigin,
  makeRow,
  makeGroup,
  makeWishes,
  makeState,
  makeResultSet,
  validateResultSet,
} from '../../../src/shared/query/result-set.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const de = JSON.parse(readFileSync(path.join(dir, '../../../src/i18n/de.json'), 'utf8'));
const t = (key) => de[key] ?? key;

const FILTER = '#aufgabe';

// Drei Aufgaben in zwei Dateien: Termin, Priorität, Filter und Schlagwort im Text.
const ZEILEN = [
  ['Projekt', 3, `- [ ] ${FILTER} Bericht schreiben #arbeit 📅 2099-12-01 ⏫`],
  ['Projekt', 7, `- [x] Angebot prüfen ${FILTER} 🔼 ✅ 2099-11-02`],
  ['Haushalt', 2, '- [ ] Fenster putzen #zuhause ⏳ 2099-12-03'],
];

function zeilen() {
  return ZEILEN.map(([name, line, raw]) =>
    makeRow([], taskOrigin(`/raum/${name}.md`, name, line, raw), {
      urgency: 1,
      blocked: false,
      duplicateId: false,
    }),
  );
}

function menge(spec) {
  const rs = makeResultSet({ state: makeState('ready'), scope: 'tasks', ...spec });
  expect(validateResultSet(rs)).toEqual([]);
  return rs;
}

const liste = (wishes = makeWishes()) => menge({ type: 'list', rows: zeilen(), wishes });

function gruppierteListe() {
  return menge({
    type: 'list',
    rows: zeilen(),
    groups: [makeGroup('Haushalt', [2]), makeGroup('Projekt', [0, 1])],
    groupColumns: [makeColumn({ name: 'datei', label: 'Datei', source: 'file.name' })],
    wishes: makeWishes(),
  });
}

const tabelle = () =>
  menge({
    type: 'table',
    columns: [makeColumn({ name: 'status', label: 'Status', source: 'status' })],
    rows: zeilen().map((row, i) => ({ ...row, values: [i === 1 ? 'x' : ' '] })),
    wishes: makeWishes(),
  });

function einstellung(aufgaben) {
  configureTaskMarkers(aufgaben);
  return aufgaben;
}

afterEach(() => {
  configureTaskMarkers({});
});

// --- Ansicht ---------------------------------------------------------------

function ansicht(rs) {
  const host = document.createElement('div');
  host.appendChild(buildQueryListDom({ resultSet: rs }, t));
  return host;
}

const ansichtAufgaben = (host) =>
  [...host.querySelectorAll('.perspective-query-task-desc')].map((a) => a.textContent);

// --- Geschriebene Notiz ----------------------------------------------------

function entitaetenAufloesen(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

const text = (html) => entitaetenAufloesen(html.replace(/<[^>]*>/g, '')).trim();

// Kopf und Zeilen der geschriebenen Tabelle, wie die Notiz sie zeigt.
function notiz(rs, aufgaben) {
  const md = resultSetMarkdown(rs, { t, aufgaben });
  const html = renderMarkdown(md, 'de', { frontmatterBlock: false });
  const kopf = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
  const rumpf = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'));
  const zeilenHtml = [...rumpf.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((z) => z[1]),
  );
  return { md, kopf, zeilen: zeilenHtml };
}

// Die Treffer-Zellen der Aufgaben, ohne die Zwischenzeilen der Gruppen.
const notizAufgaben = (n) =>
  n.zeilen.filter((z) => !/^(?:› )*<strong>/.test(z[0])).map((z) => text(z[0]));

describe('Aufgaben-Text: Notiz gleich Ansicht (4T-002822)', () => {
  it('Liste: ohne Termin- und Prioritäts-Zeichen, globaler Filter ausgeblendet', () => {
    const aufgaben = einstellung({ globalFilter: FILTER, hideGlobalFilter: true });
    const erwartet = ansichtAufgaben(ansicht(liste()));
    expect(erwartet).toEqual([
      'Bericht schreiben #arbeit',
      'Angebot prüfen',
      'Fenster putzen #zuhause',
    ]);
    expect(notizAufgaben(notiz(liste(), aufgaben))).toEqual(erwartet);
  });

  it('Liste: globaler Filter sichtbar, wenn die Einstellung ihn nicht ausblendet', () => {
    const aufgaben = einstellung({ globalFilter: FILTER, hideGlobalFilter: false });
    const erwartet = ansichtAufgaben(ansicht(liste()));
    expect(erwartet[0]).toBe(`${FILTER} Bericht schreiben #arbeit`);
    expect(notizAufgaben(notiz(liste(), aufgaben))).toEqual(erwartet);
  });

  it('Liste mit HIDE tags: ohne Schlagworte, wie die Ansicht', () => {
    const aufgaben = einstellung({ globalFilter: FILTER, hideGlobalFilter: true });
    const rs = () => liste(makeWishes({ hide: ['tags'] }));
    const erwartet = ansichtAufgaben(ansicht(rs()));
    expect(erwartet).toEqual(['Bericht schreiben', 'Angebot prüfen', 'Fenster putzen']);
    expect(notizAufgaben(notiz(rs(), aufgaben))).toEqual(erwartet);
  });

  it('ohne Einstellung im Schreiber bleibt der Filter stehen, wie in der Ansicht ohne Einstellung', () => {
    configureTaskMarkers({});
    const erwartet = ansichtAufgaben(ansicht(liste()));
    expect(notizAufgaben(notiz(liste(), undefined))).toEqual(erwartet);
  });

  it('gruppierte Liste: je Gruppe dieselben Aufgaben-Texte wie die Ansicht', () => {
    const aufgaben = einstellung({ globalFilter: FILTER, hideGlobalFilter: true });
    const erwartet = ansichtAufgaben(ansicht(gruppierteListe()));
    expect(erwartet).toEqual([
      'Fenster putzen #zuhause',
      'Bericht schreiben #arbeit',
      'Angebot prüfen',
    ]);
    expect(notizAufgaben(notiz(gruppierteListe(), aufgaben))).toEqual(erwartet);
  });

  it('Tabelle: Treffer-Spalte mit dem Datei-Namen und ihrem Kopf, wie die Ansicht', () => {
    const aufgaben = einstellung({ globalFilter: FILTER, hideGlobalFilter: true });
    const host = ansicht(tabelle());
    const kopfAnsicht = [...host.querySelectorAll('thead th')].map((th) => th.textContent);
    const trefferAnsicht = [...host.querySelectorAll('tbody tr')].map(
      (tr) => tr.querySelector('td').textContent,
    );
    expect(trefferAnsicht).toEqual(['Projekt', 'Projekt', 'Haushalt']);
    const n = notiz(tabelle(), aufgaben);
    expect(n.kopf).toEqual(kopfAnsicht);
    expect(n.zeilen.map((z) => text(z[0]))).toEqual(trefferAnsicht);
    // Der Treffer ist wie bei einer Datei ein Verweis auf sie.
    expect(n.md).toContain('| [[Projekt]] |');
  });
});

// Zweitblick zu 3E-000445, Runde 1: Ansicht (`normalizeTasksConfig`) und
// Schreiber (`workflow-db-query.js`) lesen die beiden Einstellungen über diese
// eine Regel, statt sie je für sich nachzubilden.
describe('Einstellungen des Aufgaben-Texts: gemeinsame Einlese-Regel', () => {
  it('liest Filter und Ausblenden aus dem gespeicherten Stand', () => {
    expect(taskDisplaySettings({ globalFilter: '  #aufgabe ', hideGlobalFilter: 1 })).toEqual({
      globalFilter: '#aufgabe',
      hideGlobalFilter: true,
    });
  });

  it('fällt bei fehlendem oder schiefem Stand auf die Vorgabe zurück', () => {
    const vorgabe = { globalFilter: '', hideGlobalFilter: false };
    expect(taskDisplaySettings(null)).toEqual(vorgabe);
    expect(taskDisplaySettings('kaputt')).toEqual(vorgabe);
    expect(taskDisplaySettings({ globalFilter: 7 })).toEqual(vorgabe);
  });
});
