// @vitest-environment jsdom
// 4T-002460 (Epic 3E-000367, Story 4S-001143): Der Empfänger des Laufs nach
// Ereignis im Fenster (`nimmEreignisAn` in
// src/renderer/modules/workflows/workflow-zeitplan-lauf.js) und der Lauf mit
// Herkunft `event` über den echten Start (workflow-start.js).
//
// Der Anspruch geht an das echte Zustell-Register des Hauptprozesses
// (`due-delivery.js`), damit «zwei Ansprüche, ein Start» am echten «der erste
// gewinnt» gemessen wird. Echt sind auch Start, Ablauf-Kern und die
// Fenster-Seite der Ausführung (`workflow-window.js`), damit der Fall mit dem
// offenen, ungespeicherten Reiter (A3) über den echten Puffer-Weg läuft.
// Attrappen sind die Brücke zum Hauptprozess, die Reiter-Wege, die Statusleiste
// und der Schalt-Zustand der Erweiterung; `folderDisplayFor` bildet den Pfad
// wurzel-relativ ab wie im Bestand.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

const require = createRequire(import.meta.url);
const { createDueDelivery } = require('../../../src/main/checks/due-delivery.js');

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const WURZEL = 'C:/Bereich';

const aus = new Set();
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => !aus.has(id),
}));
const collectAnswers = vi.fn();
vi.mock('../../../src/renderer/modules/templates.js', () => ({
  collectAnswers: (...a) => collectAnswers(...a),
  folderDisplayFor: (p) => (p.startsWith('C:/Bereich/') ? p.slice('C:/Bereich/'.length) : p),
  templateDocumentContext: () => ({ file: 'Aktiv.md', area: 'Bereich' }),
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

const WF = 'C:/Bereich/Workflows/Eingang.md';
const ZIEL = 'C:/Bereich/Protokoll.md';
const dateien = {};
const schritte = [];
const laeufe = [];
const freigaben = [];
const abschluesse = [];
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
  workflowEventClaim: async (key) => ({ granted: register.claim([key]).length === 1 }),
  workflowEventRelease: async (key) => {
    freigaben.push(key);
    return { released: !!register.release(key) };
  },
  workflowEventFinished: async (key) => {
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
const { initWorkflowZeitplanLauf, nimmEreignisAn } =
  await import('../../../src/renderer/modules/workflows/workflow-zeitplan-lauf.js');

const W = (name, event, ...zeilen) =>
  [
    '---',
    'workflow: true',
    `name: ${name}`,
    'trigger: event',
    `event: ${event}`,
    '---',
    '',
    '```workflow',
    ...zeilen,
    '```',
    '',
  ].join('\n');

let folge = 0;
function faelligkeit(event, werte = {}) {
  folge += 1;
  const item = {
    key: `event:${folge}:${WF}`,
    root: WURZEL,
    path: WF,
    relPath: 'Workflows/Eingang.md',
    name: 'Eingang',
    origin: 'event',
    event: { file: null, from: null, task: null, ...event },
    ...werte,
  };
  register.deliver({ catchUp: false, items: [item] });
  return item;
}

const angelegt = () => schritte.map((s) => s.step.args[0]);

beforeEach(() => {
  for (const k of Object.keys(dateien)) delete dateien[k];
  schritte.length = 0;
  laeufe.length = 0;
  freigaben.length = 0;
  abschluesse.length = 0;
  aus.clear();
  collectAnswers.mockReset();
  showStatusbarHint.mockReset();
  register = createDueDelivery({
    broadcast: () => {},
    dueChannel: 'workflow:eventDue',
    handledChannel: 'workflow:eventDueHandled',
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
});

describe('Anspruch nach Bereich (AK3)', () => {
  it('ein Fenster des Bereichs startet mit der Herkunft event und verbucht das Ereignis', async () => {
    dateien[WF] = W('Eingang', 'file-created in "Eingang"', 'create "Log/{{file}}.md"');
    const item = faelligkeit({ type: 'file-created', file: `${WURZEL}/Eingang/Probe.txt` });
    expect(await nimmEreignisAn(item)).toBe('gelaufen');
    expect(angelegt()).toEqual(['Log/Eingang/Probe.txt.md']);
    expect(laeufe).toEqual([
      {
        pfad: WF,
        run: {
          status: 'ok',
          startedAt: expect.any(Number),
          origin: 'event',
          event: { type: 'file-created', file: `${WURZEL}/Eingang/Probe.txt` },
          journal: [{ line: 9, command: 'create', path: `${WURZEL}/Log/Eingang/Probe.txt.md` }],
        },
      },
    ]);
    expect(abschluesse).toEqual([item.key]);
    expect(collectAnswers).not.toHaveBeenCalled();
  });

  it('zwei Ansprüche auf dieselbe Fälligkeit ergeben genau einen Start', async () => {
    dateien[WF] = W('Eingang', 'file-created', 'create "a.md"');
    const item = faelligkeit({ type: 'file-created', file: `${WURZEL}/x.txt` });
    const [erster, zweiter] = await Promise.all([nimmEreignisAn(item), nimmEreignisAn(item)]);
    // Der zweite Aufruf desselben Fensters ist belegt; ein zweites Fenster
    // bekäme «vergeben». Beides zusammen: genau ein Lauf.
    expect([erster, zweiter].filter((a) => a === 'gelaufen')).toHaveLength(1);
    expect(await nimmEreignisAn(item)).toBe('vergeben');
    expect(laeufe).toHaveLength(1);
  });

  it('ein Fenster eines anderen Bereichs oder ohne Bereich beansprucht nicht', async () => {
    dateien[WF] = W('Eingang', 'file-created', 'create "a.md"');
    const item = faelligkeit({ type: 'file-created', file: `${WURZEL}/x.txt` });
    state.areaPath = 'C:/Anderer';
    expect(await nimmEreignisAn(item)).toBe('fremd');
    state.areaPath = null;
    expect(await nimmEreignisAn(item)).toBe('fremd');
    expect(schritte).toEqual([]);
    state.areaPath = WURZEL;
    expect(await nimmEreignisAn(item)).toBe('gelaufen');
  });

  it('läuft im Fenster ein Workflow, bleibt die Fälligkeit stehen (kein Anspruch)', async () => {
    let weiter;
    const echt = window.api.workflowStep;
    window.api.workflowStep = (pfad, step) =>
      new Promise((resolve) => {
        schritte.push({ pfad, step });
        weiter = () => resolve({ ok: true, line: step.line, keyword: step.keyword, effect: {} });
      });
    try {
      dateien['C:/Bereich/Hand.md'] = W('Hand', 'file-created', 'create "h.md"').replace(
        'trigger: event\nevent: file-created',
        'trigger: manual',
      );
      const vonHand = starteWorkflow({ path: 'C:/Bereich/Hand.md' });
      await vi.waitFor(() => expect(schritte).toHaveLength(1));
      expect(laeuftWorkflow()).toBe(true);
      dateien[WF] = W('Eingang', 'file-created', 'create "a.md"');
      const item = faelligkeit({ type: 'file-created', file: `${WURZEL}/x.txt` });
      expect(await nimmEreignisAn(item)).toBe('belegt');
      expect(register.openItems().items.map((i) => i.key)).toEqual([item.key]);
      weiter();
      await vonHand;
    } finally {
      window.api.workflowStep = echt;
    }
  });

  it('ungültige Zustellungen und der Aus-Zustand starten nichts', async () => {
    dateien[WF] = W('Eingang', 'file-created', 'create "a.md"');
    expect(await nimmEreignisAn({ key: 'k', root: WURZEL, path: WF, origin: 'event' })).toBe(
      'ungueltig',
    );
    const unbekannt = faelligkeit({ type: 'file-deleted', file: `${WURZEL}/x.txt` });
    expect(await nimmEreignisAn(unbekannt)).toBe('ungueltig');
    aus.add('workflows');
    expect(
      await nimmEreignisAn(faelligkeit({ type: 'file-created', file: `${WURZEL}/x.txt` })),
    ).toBe('aus');
    expect(schritte).toEqual([]);
  });

  it('die Einrichtung meldet den Empfang an und holt den offenen Stand nach', async () => {
    dateien[WF] = W('Eingang', 'file-created', 'create "a.md"');
    const item = faelligkeit({ type: 'file-created', file: `${WURZEL}/x.txt` });
    const echt = window.api.workflowEventOpen;
    window.api.workflowEventOpen = async () => register.openItems();
    try {
      await initWorkflowZeitplanLauf();
      expect(typeof window.__workflowEventDueHandler).toBe('function');
      await vi.waitFor(() => expect(abschluesse).toEqual([item.key]));
    } finally {
      window.api.workflowEventOpen = echt;
    }
  });
});

describe('Platzhalter nach 3l (AK7)', () => {
  it('file-moved: {{file}} ist der neue Pfad, {{from}} der alte', async () => {
    dateien[WF] = W('Eingang', 'file-moved in "Archiv"', 'create "Log/{{from}} nach {{file}}"');
    const item = faelligkeit({
      type: 'file-moved',
      file: `${WURZEL}/Archiv/Notiz.md`,
      from: `${WURZEL}/Notiz.md`,
    });
    expect(await nimmEreignisAn(item)).toBe('gelaufen');
    expect(angelegt()).toEqual(['Log/Notiz.md nach Archiv/Notiz.md']);
    expect(laeufe[0].run.event).toEqual({
      type: 'file-moved',
      file: `${WURZEL}/Archiv/Notiz.md`,
      from: `${WURZEL}/Notiz.md`,
    });
  });

  it('task-done: {{file}} ist die Datei der Aufgabe, {{task}} der Aufgaben-Text', async () => {
    dateien[WF] = W('Eingang', 'task-done', 'create "Erledigt/{{task}} aus {{file}}"');
    const item = faelligkeit({
      type: 'task-done',
      file: `${WURZEL}/Wochenplan.md`,
      task: 'Bericht schreiben',
    });
    expect(await nimmEreignisAn(item)).toBe('gelaufen');
    expect(angelegt()).toEqual(['Erledigt/Bericht schreiben aus Wochenplan.md']);
    expect(laeufe[0].run.event).toEqual({
      type: 'task-done',
      file: `${WURZEL}/Wochenplan.md`,
      task: 'Bericht schreiben',
    });
  });

  it('reminder-due: {{file}} ist die Datei der Erinnerung, nicht das aktive Dokument', async () => {
    dateien[WF] = W('Eingang', 'reminder-due', 'create "Besprechung zu {{file}}"');
    const item = faelligkeit({ type: 'reminder-due', file: `${WURZEL}/Termine.md` });
    expect(await nimmEreignisAn(item)).toBe('gelaufen');
    expect(angelegt()).toEqual(['Besprechung zu Termine.md']);
  });

  it('area-opened: keine Datei; der Lauf läuft ohne {{file}} und verbucht das Ereignis ohne Datei', async () => {
    dateien[WF] = W('Eingang', 'area-opened', 'create "Tagesnotiz.md"');
    const item = faelligkeit({ type: 'area-opened' });
    expect(await nimmEreignisAn(item)).toBe('gelaufen');
    expect(laeufe[0].run).toMatchObject({ origin: 'event', event: { type: 'area-opened' } });
  });

  it('eine Eingabe beendet den Ereignis-Lauf ohne Dialog mit «Nur von Hand»', async () => {
    dateien[WF] = W('Eingang', 'file-created', 'create "{{prompt:Name?}}.md"');
    const item = faelligkeit({ type: 'file-created', file: `${WURZEL}/x.txt` });
    expect(await nimmEreignisAn(item)).toBe('gescheitert');
    expect(collectAnswers).not.toHaveBeenCalled();
    expect(schritte).toEqual([]);
    expect(laeufe[0].run).toMatchObject({ status: 'failed', origin: 'event' });
    expect(abschluesse).toEqual([item.key]);
  });
});

describe('Offener, ungespeicherter Reiter (A3)', () => {
  it('die Änderung eines Ereignis-Laufs geht in den Puffer, die Platte bleibt', async () => {
    const platte = '# Protokoll\n';
    const ziel = { path: ZIEL, content: '# Protokoll\nungespeichert\n', originalContent: platte };
    ziel.dirty = true;
    state.panes = [
      { tabs: [{ path: 'C:/Bereich/Anderes.md', content: '' }, ziel], activeIndex: 0 },
    ];
    dateien[ZIEL] = platte;
    dateien['Eintrag.md'] = 'Datei eingegangen';
    dateien[WF] = W(
      'Eingang',
      'file-created in "Eingang"',
      'append "Protokoll.md" from-template "Eintrag.md"',
    );
    // So antwortet der Hauptprozess, wenn das startende Fenster den Puffer hält.
    const echt = window.api.workflowStep;
    window.api.workflowStep = async (pfad, step) => {
      schritte.push({ pfad, step });
      return {
        ok: true,
        line: step.line,
        keyword: step.keyword,
        window: {
          action: 'editOwnBuffer',
          path: ZIEL,
          edit: { op: 'append', text: 'Datei eingegangen' },
        },
      };
    };
    try {
      const item = faelligkeit({ type: 'file-created', file: `${WURZEL}/Eingang/Probe.txt` });
      expect(await nimmEreignisAn(item)).toBe('gelaufen');
    } finally {
      window.api.workflowStep = echt;
    }
    expect(ziel.content).toBe('# Protokoll\nungespeichert\nDatei eingegangen\n');
    expect(ziel.dirty).toBe(true);
    expect(dateien[ZIEL]).toBe(platte);
    expect(window.api.writeFile).not.toHaveBeenCalled();
    expect(laeufe[0].run).toMatchObject({
      origin: 'event',
      journal: [{ line: 9, command: 'append', path: ZIEL }],
    });
  });
});

describe('Brems-Meldung der Not-Bremse (4T-002461, AK4)', () => {
  it('kein Lauf: Hinweis in der Statusleiste und Benachrichtigung mit dem Grund, genau ein Fenster', async () => {
    const systemNotify = vi.fn(async () => true);
    window.api.systemNotify = systemNotify;
    dateien[WF] = W('Eingang', 'file-created in "Eingang"', 'create "Antwort.md"');
    const item = faelligkeit(
      { type: 'file-created', file: `${WURZEL}/Eingang/x.txt` },
      { brake: { limit: 20, minutes: 5 } },
    );
    expect(await nimmEreignisAn(item)).toBe('gelaufen');
    expect(await nimmEreignisAn(item)).toBe('vergeben');
    expect(schritte).toEqual([]);
    // Den Grund im Lauf-Stand hat der Hauptprozess geschrieben, nicht das Fenster.
    expect(laeufe).toEqual([]);
    expect(abschluesse).toEqual([item.key]);
    expect(showStatusbarHint).toHaveBeenCalledTimes(1);
    expect(showStatusbarHint.mock.calls[0][0]).toBe('workflow.lauf.bremse');
    expect(showStatusbarHint.mock.calls[0][1]).toMatchObject({ error: true });
    expect(systemNotify).toHaveBeenCalledTimes(1);
    expect(systemNotify.mock.calls[0][0]).toMatchObject({
      title: 'Eingang',
      meldung: { art: 'workflow', keys: [`workflow:bremse:${item.key}`] },
    });
    delete window.api.systemNotify;
  });

  it('eine Brems-Meldung ohne gültige Angaben wird abgewiesen', async () => {
    const item = faelligkeit({ type: 'file-created', file: `${WURZEL}/x.txt` }, { brake: {} });
    expect(await nimmEreignisAn(item)).toBe('ungueltig');
    expect(showStatusbarHint).not.toHaveBeenCalled();
  });
});
