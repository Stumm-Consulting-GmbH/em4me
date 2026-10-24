// @vitest-environment jsdom
// 4T-002173 (Epic 3E-000337, Story 4S-001059 AK9): Aus-Zustand der Erweiterung
// «Diagramm einer Abfrage» (query-chart). Muster wie
// test/unit/render/extensions-aus-diagramm.test.js: an, aus, wieder an, und
// unbeteiligte Ausgaben bleiben unberührt. Das Abfrage-Diagramm ist kein
// Markdown-Konstrukt, sondern eine Form der Abfrage-Befüllung; geprüft wird
// deshalb am Einstieg der Befüllung (`buildQueryListDom`) mit dem echten
// Schalt-Zustand des Fensters (extension-lifecycle.js), nicht über die
// Render-Pipeline.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './api-stub.js';

const { buildQueryListDom } =
  await import('../../../src/renderer/modules/query/frontmatter-query-view.js');
const { applyExtensionsState, resetExtensionStateForTests, isExtensionActive } =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { disabledIdsForModeLevel } =
  await import('../../../src/shared/extensions/extensions-core.js');
const { makeColumn, fileOrigin, makeRow, makeWishes, makeState, makeResultSet } =
  await import('../../../src/shared/query/result-set.js');

const dir = path.dirname(fileURLToPath(import.meta.url));
const de = JSON.parse(readFileSync(path.join(dir, '../../../src/i18n/de.json'), 'utf8'));
const tStub = (key) => de[key] ?? key;

const spalte = (name) => makeColumn({ name, label: name, source: name });
const zeile = (name, wert) => makeRow([wert], fileOrigin(`/raum/${name}.md`, name));

function menge(display) {
  return makeResultSet({
    scope: 'files',
    type: 'table',
    columns: [spalte('Seiten')],
    rows: [zeile('Alpha', 120), zeile('Beta', 300)],
    wishes: makeWishes(display ? { display: { form: display } } : {}),
    state: makeState('ready', { area: { root: '/raum', fileCount: 2 } }),
  });
}

// Die Zeichen-Funktion als Attrappe; der Schalt-Zustand kommt aus dem Fenster.
const drawChart = (input) => ({ status: 'drawn', svg: '<svg></svg>', omitted: input.omitted });

function html(rs) {
  const host = document.createElement('div');
  host.appendChild(buildQueryListDom({ resultSet: rs }, tStub, { drawChart }));
  return host;
}

afterEach(() => {
  resetExtensionStateForTests();
});

describe('Erweiterungen: Aus-Zustand des Abfrage-Diagramms (4T-002173)', () => {
  it('query-chart: an das Diagramm, aus die Tabelle mit eigenem Hinweis, wieder an das Diagramm', async () => {
    const rs = menge('bar');
    const vorher = JSON.stringify(rs);
    expect(html(rs).querySelector('.perspective-query-chart')).not.toBeNull();

    await applyExtensionsState(['query-chart'], { persist: false });
    expect(isExtensionActive('query-chart')).toBe(false);
    const aus = html(rs);
    expect(aus.querySelector('.perspective-query-chart')).toBeNull();
    expect(aus.querySelector('.perspective-query-hint').textContent).toBe(
      de['query.hint.displayFormOff'].replace('{name}', 'bar'),
    );
    // Die Ausgabe darunter ist genau die ohne Angabe.
    aus.querySelector('.perspective-query-hint').remove();
    expect(aus.innerHTML).toBe(html(menge(null)).innerHTML);
    // Die Menge bleibt unverändert, ein Wiedereinschalten bringt das Diagramm zurück.
    expect(JSON.stringify(rs)).toBe(vorher);
    await applyExtensionsState([], { persist: false });
    expect(html(rs).querySelector('.perspective-query-chart')).not.toBeNull();
  });

  it('Einsteiger: aus über die Modus-Stufe; ab Fortgeschritten an', async () => {
    await applyExtensionsState(disabledIdsForModeLevel('beginner'), { persist: false });
    const einsteiger = html(menge('line'));
    expect(einsteiger.querySelector('.perspective-query-chart')).toBeNull();
    expect(einsteiger.querySelector('.perspective-query-hint').textContent).toBe(
      de['query.hint.displayFormOff'].replace('{name}', 'line'),
    );
    await applyExtensionsState(disabledIdsForModeLevel('advanced'), { persist: false });
    expect(html(menge('line')).querySelector('.perspective-query-chart')).not.toBeNull();
  });

  it('unabhängig von Datentabelle und Tabellen-Diagramm; andere Formen und Ausgaben unberührt', async () => {
    await applyExtensionsState(['perspective-datatable', 'perspective-chart'], { persist: false });
    expect(html(menge('bar')).querySelector('.perspective-query-chart')).not.toBeNull();
    await applyExtensionsState(['query-chart'], { persist: false });
    // Ohne Angabe bleibt die Tabelle ohne Hinweis; eine unbekannte Form behält ihren Hinweis.
    const ohne = html(menge(null));
    expect(ohne.querySelector('.perspective-query-hint')).toBeNull();
    expect(ohne.querySelector('table.perspective-query-table')).not.toBeNull();
    expect(html(menge('sparkles')).querySelector('.perspective-query-hint').textContent).toBe(
      de['query.hint.displayFormUnknown'].replace('{name}', 'sparkles'),
    );
  });
});
