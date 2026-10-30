// @vitest-environment jsdom
// 4T-002423 (Epic 3E-000366, Entscheidung 2f, Story 4S-001134): Das
// Statusleisten-Element «Workflows»
// (src/renderer/modules/workflows/workflow-statusleiste.js).
//
// Geprüft wird, was ohne Fenster entscheidbar ist: Inhalt (Ergebnis-Zeichen,
// Name, Uhrzeit, Tooltip), Sichtbarkeit nach dem Scharf-Zustand der Workflows
// des Bereichs (Lebenszyklus), der gemerkte letzte Lauf nach Zeitplan, das
// Nachziehen nach einem verbuchten Lauf, der Klick und der Aus-Zustand. Der
// Lese-Kanal `workflow:runs` ist eine Attrappe mit dem Vertrag aus 4T-002422
// (`armed === 'armed'`) und 4T-002420 (`lastRun.origin`). Die Faltung prüft
// `statusleisten-faltung.test.js`, den Aus-Zustand am echten Schalter
// `workflow-aus-zustand.test.js`.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const aus = new Set();
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => !aus.has(id),
}));

const scharfZuhoerer = [];
vi.mock('../../../src/renderer/modules/workflows/workflow-scharf.js', () => ({
  onScharfGeaendert: (cb) => scharfZuhoerer.push(cb),
}));

let antwort = { ok: true, status: 'ready', workflows: [] };
const invalidiert = [];
Object.assign(window.api, {
  workflowRuns: vi.fn(async () => antwort),
  onBacklinksInvalidated: (cb) => invalidiert.push(cb),
});

// Die rechte Zone der Leiste mit einem vorhandenen Element; das Element
// «Workflows» legt das Modul selbst an.
document.body.innerHTML = `<footer class="statusbar"><div class="statusbar-right">
  <button id="statusbar-wordcount" type="button" hidden></button>
</div></footer>`;

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const modul = await import('../../../src/renderer/modules/workflows/workflow-statusleiste.js');
const {
  WORKFLOW_LAEUFE_KOMMANDO,
  aktualisiereWorkflowStatusleiste,
  ergebnisZeichen,
  hatScharfenWorkflow,
  initWorkflowStatusleiste,
  legeWorkflowStatusleisteAn,
  letzterZeitplanLauf,
  uhrzeitText,
  workflowStatusleisteZuruecksetzen,
} = modul;
const { laufVerbucht } =
  await import('../../../src/renderer/modules/workflows/workflow-lauf-stand.js');

const el = () => document.getElementById('statusbar-workflows');
const kommando = vi.fn();
initWorkflowStatusleiste({ executeCommand: kommando });

// Heute um hh:mm Ortszeit als UTC-Zeitpunkt der Begleitdatei.
function heute(h, m) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
const eintrag = (name, armed, lastRun = null, extra = {}) => ({
  name,
  absPath: `C:/b/Workflows/${name}.md`,
  relPath: `Workflows/${name}.md`,
  runs: lastRun ? 1 : 0,
  lastRun,
  armed,
  ...extra,
});
const lauf = (at, status = 'ok', origin = 'schedule', extra = {}) => ({
  at,
  status,
  origin,
  ...extra,
});

beforeEach(async () => {
  aus.clear();
  antwort = { ok: true, status: 'ready', workflows: [] };
  workflowStatusleisteZuruecksetzen();
  kommando.mockClear();
  window.api.workflowRuns.mockClear();
  await aktualisiereWorkflowStatusleiste();
});

describe('reine Teile', () => {
  it('Ergebnis-Zeichen je Status', () => {
    expect(['ok', 'failed', 'stopped', 'canceled', 'x'].map(ergebnisZeichen)).toEqual([
      '✓',
      '✗',
      '■',
      '–',
      '?',
    ]);
  });

  it('scharf zählt nur «armed» eigener Workflows', () => {
    expect(hatScharfenWorkflow([eintrag('A', 'armed')])).toBe(true);
    expect(hatScharfenWorkflow([eintrag('A', 'notArmed'), eintrag('B', 'definitionChanged')])).toBe(
      false,
    );
    expect(hatScharfenWorkflow([eintrag('F', 'armed', null, { foreign: true })])).toBe(false);
    expect(hatScharfenWorkflow([])).toBe(false);
  });

  it('der letzte Lauf nach Zeitplan ist der jüngste mit Herkunft schedule oder catch-up', () => {
    const liste = [
      eintrag('A', 'armed', lauf('2026-10-28T06:00:00Z')),
      eintrag('B', 'armed', lauf('2026-10-28T07:00:00Z', 'failed', 'catch-up')),
      eintrag('C', 'armed', lauf('2026-10-28T09:00:00Z', 'ok', 'manual')),
    ];
    expect(letzterZeitplanLauf(liste)).toMatchObject({ name: 'B' });
    expect(
      letzterZeitplanLauf([eintrag('C', 'armed', lauf('2026-10-28T09:00:00Z', 'ok', 'manual'))]),
    ).toBe(null);
  });

  it('Uhrzeit: heute nur die Uhrzeit, sonst mit Tag und Monat', () => {
    expect(uhrzeitText(heute(8, 5))).toBe('08:05');
    const gestern = new Date();
    gestern.setDate(gestern.getDate() - 1);
    gestern.setHours(8, 5, 0, 0);
    const text = uhrzeitText(gestern.toISOString());
    expect(text).toContain('08:05');
    expect(text).toContain(String(gestern.getDate()).padStart(2, '0'));
    expect(uhrzeitText('kaputt')).toBe('');
  });
});

describe('Element «Workflows» (AK3, AK4 des Tasks; AK2, AK5, AK6 der Story)', () => {
  it('steht verborgen am Anfang der rechten Zone, genau einmal', () => {
    const zone = document.querySelector('.statusbar-right');
    expect(zone.firstElementChild).toBe(el());
    expect(el().tagName).toBe('BUTTON');
    expect(el().getAttribute('aria-label')).toBe('Workflows');
    expect(legeWorkflowStatusleisteAn()).toBe(el());
    expect(document.querySelectorAll('#statusbar-workflows')).toHaveLength(1);
  });

  it('ohne scharfen Workflow steht es nicht', async () => {
    antwort.workflows = [eintrag('A', 'notArmed', lauf(heute(8, 0)))];
    await aktualisiereWorkflowStatusleiste();
    expect(el().hidden).toBe(true);
  });

  it('zeigt den letzten Lauf nach Zeitplan mit Zeichen, Name und Uhrzeit', async () => {
    antwort.workflows = [eintrag('Wochenrückblick', 'armed', lauf(heute(8, 0)))];
    await aktualisiereWorkflowStatusleiste();
    expect(el().hidden).toBe(false);
    expect(el().textContent).toBe('✓ Wochenrückblick 08:00');
    expect(el().title).toContain('Letzter Lauf nach Zeitplan: Wochenrückblick');
    expect(el().title).toContain('erfolgreich');
    expect(el().dataset.status).toBe('ok');
  });

  it('ein Fehlschlag erscheint als solcher, mit Zeile und Grund im Tooltip (AK6 der Story)', async () => {
    const fehl = lauf(heute(8, 0), 'failed', 'schedule', { line: 9, code: 'targetExists' });
    antwort.workflows = [eintrag('A', 'armed', fehl)];
    await aktualisiereWorkflowStatusleiste();
    expect(el().textContent).toBe('✗ A 08:00');
    expect(el().dataset.status).toBe('failed');
    expect(el().title).toContain('abgebrochen in Zeile 9');
  });

  it('scharf, aber noch kein Lauf nach Zeitplan: «Workflows»', async () => {
    antwort.workflows = [eintrag('A', 'armed', lauf(heute(8, 0), 'ok', 'manual'))];
    await aktualisiereWorkflowStatusleiste();
    expect(el().hidden).toBe(false);
    expect(el().textContent).toBe('Workflows');
    expect(el().title).toContain('noch nicht nach Zeitplan gelaufen');
    expect(el().dataset.status).toBeUndefined();
  });

  it('Lebenszyklus: erscheint mit der Scharf-Schaltung und verschwindet mit der letzten Entschärfung (AK5 der Story)', async () => {
    antwort.workflows = [eintrag('A', 'notArmed'), eintrag('B', 'notArmed')];
    await aktualisiereWorkflowStatusleiste();
    expect(el().hidden).toBe(true);
    antwort.workflows = [eintrag('A', 'armed'), eintrag('B', 'armed')];
    expect(scharfZuhoerer).toHaveLength(1);
    scharfZuhoerer[0]('C:/b/Workflows/A.md', { ok: true });
    await vi.waitFor(() => expect(el().hidden).toBe(false));
    antwort.workflows = [eintrag('A', 'notArmed'), eintrag('B', 'armed')];
    await aktualisiereWorkflowStatusleiste();
    expect(el().hidden).toBe(false);
    antwort.workflows = [eintrag('A', 'notArmed'), eintrag('B', 'notArmed')];
    await aktualisiereWorkflowStatusleiste();
    expect(el().hidden).toBe(true);
  });

  it('ein späterer Lauf von Hand verdrängt den gemerkten Lauf nach Zeitplan nicht', async () => {
    antwort.workflows = [eintrag('A', 'armed', lauf(heute(8, 0)))];
    await aktualisiereWorkflowStatusleiste();
    antwort.workflows = [
      eintrag('A', 'armed', lauf(heute(9, 0), 'failed', 'manual', { code: 'x' })),
    ];
    await aktualisiereWorkflowStatusleiste();
    expect(el().textContent).toBe('✓ A 08:00');
  });

  it('zieht nach einem verbuchten Lauf des Fensters nach', async () => {
    antwort.workflows = [eintrag('A', 'armed')];
    await aktualisiereWorkflowStatusleiste();
    expect(el().textContent).toBe('Workflows');
    antwort.workflows = [eintrag('A', 'armed', lauf(heute(10, 30)))];
    laufVerbucht(
      'C:/b/Workflows/A.md',
      { status: 'ok', startedAt: Date.now(), origin: 'schedule' },
      null,
    );
    await vi.waitFor(() => expect(el().textContent).toBe('✓ A 10:30'));
  });

  it('zieht nach einer Änderung im Bereichs-Index gebündelt nach', async () => {
    expect(invalidiert).toHaveLength(1);
    antwort.workflows = [eintrag('A', 'armed')];
    window.api.workflowRuns.mockClear();
    invalidiert[0]();
    invalidiert[0]();
    await vi.waitFor(() => expect(el().hidden).toBe(false));
    expect(window.api.workflowRuns).toHaveBeenCalledTimes(1);
  });

  it('während der Index aufgebaut wird, bleibt der Stand stehen; ohne Bereich verschwindet es', async () => {
    antwort.workflows = [eintrag('A', 'armed', lauf(heute(8, 0)))];
    await aktualisiereWorkflowStatusleiste();
    antwort = { ok: true, status: 'indexing', workflows: [] };
    await aktualisiereWorkflowStatusleiste();
    expect(el().textContent).toBe('✓ A 08:00');
    antwort = { ok: false, code: 'noArea' };
    await aktualisiereWorkflowStatusleiste();
    expect(el().hidden).toBe(true);
  });

  it('Klick öffnet die Seite «Workflow-Läufe» über ihr Kommando (AK4 des Tasks)', async () => {
    antwort.workflows = [eintrag('A', 'armed', lauf(heute(8, 0)))];
    await aktualisiereWorkflowStatusleiste();
    el().click();
    expect(WORKFLOW_LAEUFE_KOMMANDO).toBe('ext.workflows.openRuns');
    expect(kommando).toHaveBeenCalledWith('ext.workflows.openRuns');
  });

  it('im Aus-Zustand der Erweiterung steht es nicht und fragt nichts an (AK5 des Tasks)', async () => {
    antwort.workflows = [eintrag('A', 'armed', lauf(heute(8, 0)))];
    await aktualisiereWorkflowStatusleiste();
    expect(el().hidden).toBe(false);
    aus.add('workflows');
    window.api.workflowRuns.mockClear();
    document.dispatchEvent(new CustomEvent('scg:extensions-changed'));
    await vi.waitFor(() => expect(el().hidden).toBe(true));
    expect(window.api.workflowRuns).not.toHaveBeenCalled();
  });
});
