// @vitest-environment jsdom
// 4T-002421 (Epic 3E-000366, Story 4S-001132): Der Empfänger des Laufs nach
// Zeitplan im Fenster (src/renderer/modules/workflows/workflow-zeitplan-lauf.js)
// und der Lauf mit Herkunft über den echten Start (workflow-start.js).
//
// Der Anspruch geht an das echte Zustell-Register des Hauptprozesses
// (`due-delivery.js`), damit «zwei Ansprüche, ein Start» am echten «der erste
// gewinnt» gemessen wird. Echt sind auch Start, Ablauf-Kern und die
// Fenster-Seite der Ausführung (`workflow-window.js`), damit der Fall mit dem
// offenen, ungespeicherten Reiter (AK8) über den echten Puffer-Weg läuft.
// Attrappen sind die Brücke zum Hauptprozess, die Reiter-Wege, die Statusleiste
// und der Schalt-Zustand der Erweiterung.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

const require = createRequire(import.meta.url);
const { createDueDelivery } = require('../../../src/main/checks/due-delivery.js');

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const aus = new Set();
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => !aus.has(id),
}));
const collectAnswers = vi.fn();
vi.mock('../../../src/renderer/modules/templates.js', () => ({
  collectAnswers: (...a) => collectAnswers(...a),
  folderDisplayFor: () => '',
  templateDocumentContext: () => ({ file: '', area: 'Bereich' }),
}));
const showStatusbarHint = vi.fn();
vi.mock('../../../src/renderer/modules/views/views.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scheduleAutoSave: () => {},
  showStatusbarHint: (...a) => showStatusbarHint(...a),
}));
vi.mock('../../../src/renderer/modules/tabs/tabs.js', async (importOriginal) => ({
  ...(await importOriginal()),
  openInPane: async (paneIdx) => paneIdx,
  closeTab: async () => true,
}));
vi.mock('../../../src/renderer/modules/editor/editor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  updateWindowTitle: () => {},
}));
vi.mock('../../../src/renderer/modules/views/tabbar.js', async (importOriginal) => ({
  ...(await importOriginal()),
  renderTabbar: () => {},
}));
vi.mock('../../../src/renderer/modules/workflows/workflow-folder-list.js', () => ({
  getWorkflowFolderList: async () => ({ workflows: [] }),
  onWorkflowFolderListChanged: () => () => {},
}));

const WURZEL = 'C:/Bereich';
const WF = 'C:/Bereich/Workflows/Probe.md';
const ZIEL = 'C:/Bereich/Ziel.md';
const dateien = {};
const schritte = [];
const laeufe = [];
const freigaben = [];
const abschluesse = [];
let schrittAntwort = null;
let register;

Object.assign(window.api, {
  dirname: (p) => p.slice(0, p.lastIndexOf('/')),
  readFile: vi.fn(async (p) =>
    p in dateien ? { ok: true, content: dateien[p] } : { ok: false, error: 'ENOENT' },
  ),
  writeFile: vi.fn(async () => ({ ok: true })),
  setIndexOverlay: async () => {},
  templatesRead: async (p) =>
    p in dateien ? { ok: true, content: dateien[p] } : { ok: false, error: 'x' },
  workflowStep: async (pfad, step) => {
    schritte.push({ pfad, step });
    if (schrittAntwort) return schrittAntwort(step);
    return {
      ok: true,
      line: step.line,
      keyword: step.keyword,
      effect: { kind: 'created', paths: [`${WURZEL}/${step.args[0]}`], via: 'disk' },
    };
  },
  workflowRecordRun: async (pfad, run) => {
    laeufe.push({ pfad, run });
    return { ok: true };
  },
  workflowScheduleClaim: async (key) => ({ granted: register.claim([key]).length === 1 }),
  workflowScheduleRelease: async (key) => {
    freigaben.push(key);
    return { released: !!register.release(key) };
  },
  workflowScheduleFinished: async (key) => {
    abschluesse.push(key);
    return { finished: true };
  },
});

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { paneEditors } = await import('../../../src/renderer/modules/editor/editor.js');
const { initWorkflowStart, laeuftWorkflow, starteWorkflow } =
  await import('../../../src/renderer/modules/workflows/workflow-start.js');
const { gleicheWurzel, initWorkflowZeitplanLauf, nimmFaelligkeitAn } =
  await import('../../../src/renderer/modules/workflows/workflow-zeitplan-lauf.js');

const W = (name, ...zeilen) =>
  [
    '---',
    'workflow: true',
    `name: ${name}`,
    'trigger: schedule',
    'schedule: every 30 minutes',
    '---',
    '',
    '```workflow',
    ...zeilen,
    '```',
    '',
  ].join('\n');

function faelligkeit(werte = {}) {
  const item = {
    key: `workflow:2026-10-28T08:00:${WF}`,
    root: WURZEL,
    path: WF,
    relPath: 'Workflows/Probe.md',
    name: 'Probe',
    origin: 'schedule',
    due: '2026-10-28T08:00',
    ...werte,
  };
  register.deliver({ catchUp: item.origin === 'catch-up', items: [item] });
  return item;
}

const hinweisTexte = () => showStatusbarHint.mock.calls.map((c) => c[1] && c[1].text);

beforeEach(() => {
  for (const k of Object.keys(dateien)) delete dateien[k];
  schritte.length = 0;
  laeufe.length = 0;
  freigaben.length = 0;
  abschluesse.length = 0;
  schrittAntwort = null;
  aus.clear();
  collectAnswers.mockReset();
  showStatusbarHint.mockReset();
  window.api.writeFile.mockClear();
  register = createDueDelivery({
    broadcast: () => {},
    dueChannel: 'workflow:due',
    handledChannel: 'workflow:dueHandled',
    keyOf: (item) => item.key,
    active: () => true,
    stillOpen: () => true,
  });
  state.areaPath = WURZEL;
  state.panes = [{ tabs: [], activeIndex: -1 }];
  state.activePaneIndex = 0;
  paneEditors.length = 0;
  initWorkflowStart({
    executeCommand: vi.fn(() => true),
    runMacro: vi.fn(async () => ({ ok: true })),
  });
  dateien[WF] = W('Probe', 'create "a.md"');
});

describe('Anspruch nach Bereich und Sperre (AK3, AK5)', () => {
  it('ein Fenster des Bereichs startet den Lauf mit der Herkunft schedule und meldet das Ende', async () => {
    const item = faelligkeit();
    expect(await nimmFaelligkeitAn(item)).toBe('gelaufen');
    expect(schritte.map((s) => s.step.keyword)).toEqual(['create']);
    expect(laeufe).toEqual([
      {
        pfad: WF,
        run: {
          status: 'ok',
          startedAt: expect.any(Number),
          origin: 'schedule',
          journal: [{ line: 9, command: 'create', path: `${WURZEL}/a.md` }],
        },
      },
    ]);
    expect(abschluesse).toEqual([item.key]);
    expect(collectAnswers).not.toHaveBeenCalled();
  });

  it('zwei Ansprüche auf dieselbe Fälligkeit ergeben genau einen Start', async () => {
    const item = faelligkeit();
    const erster = await nimmFaelligkeitAn(item);
    // Ein zweites Fenster desselben Bereichs kommt mit derselben Zustellung.
    const zweiter = await nimmFaelligkeitAn(item);
    expect([erster, zweiter]).toEqual(['gelaufen', 'vergeben']);
    expect(laeufe).toHaveLength(1);
    expect(abschluesse).toHaveLength(1);
  });

  it('ein Fenster eines anderen Bereichs oder ohne Bereich beansprucht nicht', async () => {
    const item = faelligkeit();
    state.areaPath = 'C:/Anderer';
    expect(await nimmFaelligkeitAn(item)).toBe('fremd');
    state.areaPath = null;
    expect(await nimmFaelligkeitAn(item)).toBe('fremd');
    expect(schritte).toEqual([]);
    // Die Fälligkeit ist weiter offen und für das Fenster des Bereichs frei.
    state.areaPath = WURZEL;
    expect(await nimmFaelligkeitAn(item)).toBe('gelaufen');
  });

  it('läuft im Fenster ein Workflow, wartet die Fälligkeit (kein Anspruch)', async () => {
    let weiter;
    schrittAntwort = (step) =>
      new Promise((resolve) => {
        weiter = () => resolve({ ok: true, line: step.line, keyword: step.keyword, effect: {} });
      });
    dateien['C:/Bereich/Hand.md'] = W('Hand', 'create "h.md"');
    const vonHand = starteWorkflow({ path: 'C:/Bereich/Hand.md' });
    await vi.waitFor(() => expect(schritte).toHaveLength(1));
    expect(laeuftWorkflow()).toBe(true);
    const item = faelligkeit();
    expect(await nimmFaelligkeitAn(item)).toBe('belegt');
    weiter();
    await vonHand;
    // Beim nächsten Takt (erneute Zustellung) ist das Fenster frei.
    schrittAntwort = null;
    expect(await nimmFaelligkeitAn(faelligkeit())).toBe('gelaufen');
  });

  it('kommt zwischen Anspruch und Start ein Lauf von Hand, wird der Anspruch zurückgegeben', async () => {
    let weiter;
    schrittAntwort = (step) =>
      new Promise((resolve) => {
        weiter = () => resolve({ ok: true, line: step.line, keyword: step.keyword, effect: {} });
      });
    dateien['C:/Bereich/Hand.md'] = W('Hand', 'create "h.md"');
    const item = faelligkeit();
    const echt = window.api.workflowScheduleClaim;
    let vonHand;
    window.api.workflowScheduleClaim = async (key) => {
      const antwort = await echt(key);
      vonHand = starteWorkflow({ path: 'C:/Bereich/Hand.md' });
      return antwort;
    };
    try {
      expect(await nimmFaelligkeitAn(item)).toBe('belegt');
    } finally {
      window.api.workflowScheduleClaim = echt;
    }
    expect(freigaben).toEqual([item.key]);
    expect(abschluesse).toEqual([]);
    await vi.waitFor(() => expect(schritte).toHaveLength(1));
    weiter();
    await vonHand;
  });
});

describe('Lauf ohne Zuschauer', () => {
  it('ein nachgeholter Lauf meldet «Workflow ‹Name› nachgeholt»', async () => {
    const item = faelligkeit({ origin: 'catch-up' });
    expect(await nimmFaelligkeitAn(item)).toBe('gelaufen');
    expect(laeufe[0].run.origin).toBe('catch-up');
    expect(hinweisTexte()).toEqual(['Workflow ‹Probe› nachgeholt']);
  });

  it('ein gescheiterter Lauf meldet den Abbruch, nicht «nachgeholt», und schließt trotzdem ab', async () => {
    schrittAntwort = (step) => ({
      ok: false,
      line: step.line,
      keyword: step.keyword,
      code: 'targetExists',
      detail: { path: 'a.md' },
    });
    const item = faelligkeit({ origin: 'catch-up' });
    expect(await nimmFaelligkeitAn(item)).toBe('gescheitert');
    expect(laeufe[0].run).toMatchObject({ status: 'failed', line: 9, origin: 'catch-up' });
    expect(hinweisTexte().some((t) => t.includes('nachgeholt'))).toBe(false);
    expect(abschluesse).toEqual([item.key]);
  });

  it('eine Eingabe aus einer eingesetzten Vorlage beendet den Lauf ohne Dialog mit Grund', async () => {
    dateien['Notiz.md'] = 'Thema: {{prompt:Thema?}}\n';
    dateien[WF] = W('Probe', 'create "a.md" from-template "Notiz.md"');
    const item = faelligkeit();
    expect(await nimmFaelligkeitAn(item)).toBe('gescheitert');
    expect(collectAnswers).not.toHaveBeenCalled();
    expect(schritte).toEqual([]);
    expect(laeufe[0].run).toMatchObject({
      status: 'failed',
      line: 9,
      code: 'manualOnly',
      origin: 'schedule',
    });
    expect(hinweisTexte()[0]).toContain('Nur von Hand');
    expect(abschluesse).toEqual([item.key]);
  });

  it('eine Eingabe in einer Befehls-Zeile beendet den Lauf mit ihrer Zeile', async () => {
    dateien[WF] = W('Probe', 'create "a.md"', 'create "{{prompt:Name?}}.md"');
    expect(await nimmFaelligkeitAn(faelligkeit())).toBe('gescheitert');
    expect(collectAnswers).not.toHaveBeenCalled();
    expect(laeufe[0].run).toMatchObject({ status: 'failed', line: 10, code: 'manualOnly' });
    expect(schritte).toEqual([]);
  });

  it('derselbe Workflow von Hand fragt weiterhin und schickt keine Herkunft', async () => {
    dateien[WF] = W('Probe', 'create "{{prompt:Name?}}.md"');
    collectAnswers.mockImplementation(async (inputs) =>
      Object.fromEntries(inputs.map((i) => [i.key, 'x'])),
    );
    expect(await starteWorkflow({ path: WF })).toBe(true);
    expect(collectAnswers).toHaveBeenCalledTimes(1);
    expect(laeufe[0].run.origin).toBeUndefined();
  });
});

describe('Offener, ungespeicherter Reiter (AK8)', () => {
  it('die Änderung eines Laufs nach Zeitplan geht in den Puffer, die Platte bleibt', async () => {
    const platte = '# Ziel\n';
    const ziel = { path: ZIEL, content: '# Ziel\nungespeichert\n', originalContent: platte };
    ziel.dirty = true;
    state.panes = [
      { tabs: [{ path: 'C:/Bereich/Anderes.md', content: '' }, ziel], activeIndex: 0 },
    ];
    dateien[ZIEL] = platte;
    dateien['Lauf.md'] = 'Lauf';
    dateien[WF] = W('Probe', 'append "Ziel.md" from-template "Lauf.md"');
    // So antwortet der Hauptprozess, wenn das startende Fenster den Puffer hält.
    schrittAntwort = (step) => ({
      ok: true,
      line: step.line,
      keyword: step.keyword,
      window: { action: 'editOwnBuffer', path: ZIEL, edit: { op: 'append', text: 'Lauf' } },
    });
    expect(await nimmFaelligkeitAn(faelligkeit())).toBe('gelaufen');
    expect(ziel.content).toBe('# Ziel\nungespeichert\nLauf\n');
    expect(ziel.dirty).toBe(true);
    expect(dateien[ZIEL]).toBe(platte);
    expect(window.api.writeFile).not.toHaveBeenCalled();
    expect(laeufe[0].run.journal).toEqual([{ line: 9, command: 'append', path: ZIEL }]);
  });
});

describe('Aus-Zustand und Einrichtung (AK7)', () => {
  it('im Aus-Zustand beansprucht das Fenster nichts', async () => {
    aus.add('workflows');
    expect(await nimmFaelligkeitAn(faelligkeit())).toBe('aus');
    expect(schritte).toEqual([]);
    expect(laeufe).toEqual([]);
  });

  it('die Einrichtung meldet den Zuhörer an und holt den offenen Stand nach', async () => {
    const item = faelligkeit();
    window.api.workflowScheduleOpen = async () => register.openItems();
    await initWorkflowZeitplanLauf();
    await vi.waitFor(() => expect(abschluesse).toEqual([item.key]));
    expect(typeof window.__workflowDueHandler).toBe('function');
    // Eine spätere Zustellung kommt über den Zuhörer.
    const zweite = faelligkeit({ key: 'workflow:2026-10-28T08:30:x', due: '2026-10-28T08:30' });
    window.__workflowDueHandler({ catchUp: false, items: [zweite] });
    await vi.waitFor(() => expect(abschluesse).toEqual([item.key, zweite.key]));
  });

  it('ungültige Zustellungen werden übergangen', async () => {
    expect(await nimmFaelligkeitAn(null)).toBe('ungueltig');
    expect(await nimmFaelligkeitAn({ key: 'k', root: WURZEL, path: WF, origin: 'manual' })).toBe(
      'ungueltig',
    );
  });
});

describe('gleicheWurzel', () => {
  it('ohne Rücksicht auf Trenner, Schluss-Trenner und Schreibweise', () => {
    expect(gleicheWurzel('C:\\Bereich\\', 'c:/bereich')).toBe(true);
    expect(gleicheWurzel('C:/Bereich', 'C:/Bereich2')).toBe(false);
    expect(gleicheWurzel(null, 'C:/Bereich')).toBe(false);
  });
});
