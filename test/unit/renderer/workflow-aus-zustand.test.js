// @vitest-environment jsdom
// 4T-002352 (Epic 3E-000184, Story 4S-001108): Der Aus-Zustand der Erweiterung
// «Workflows» über den ECHTEN Schalter (extension-lifecycle.js).
//
// **Warum zusätzlich zu den Aus-Fällen der einzelnen Module.** Die Prüfdateien
// von Hervorhebung, Kopfzeile, Kommandos, Seite und Start prüfen ihre Wache je
// über eine Attrappe des Schalt-Zustands, weil die Erweiterung bis zu diesem
// Task nicht registriert war: Der echte Lebenszyklus verwarf die unbekannte
// Kennung, und kein Schalter konnte die Workflows abschalten. Hier läuft der
// Weg am Stück: Registry, Normalisierung der Aus-Liste, Ereignis
// `scg:extensions-changed` und die Wachen der Module (AK3, AK4 und AK5 der
// Story). Attrappen sind allein die Nachbarn außerhalb des Schalters: die Liste
// des Workflow-Ordners, die Statusleisten-Knöpfe und der Start-Knopf.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const liste = {
  ok: true,
  enabled: true,
  workflows: [
    {
      kind: 'workflow',
      name: 'Wochenrückblick',
      description: '',
      relPath: 'Wochenrückblick.md',
      absPath: 'C:/b/Workflows/Wochenrückblick.md',
    },
  ],
};
vi.mock('../../../src/renderer/modules/workflows/workflow-folder-list.js', () => ({
  getWorkflowFolderList: async () => liste,
  onWorkflowFolderListChanged: () => () => {},
}));
vi.mock('../../../src/renderer/modules/command-placement.js', () => ({
  renderCommandButtons: () => {},
}));
vi.mock('../../../src/renderer/modules/workflows/workflow-start-knopf.js', () => ({
  registriereStartKnopf: () => {},
}));

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { applyExtensionsState, isExtensionActive } =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { workflowHervorhebung } =
  await import('../../../src/renderer/modules/workflows/workflow-hervorhebung.js');
const { workflowKopf } = await import('../../../src/renderer/modules/workflows/workflow-kopf.js');
const { liveRebuildEffect } = await import('../../../src/renderer/modules/live/live-shared.js');
const { initWorkflowCommands } =
  await import('../../../src/renderer/modules/workflows/workflow-commands.js');
const { oeffneWorkflowLaeufe } =
  await import('../../../src/renderer/modules/workflows/workflow-laeufe-seite.js');
const { starteWorkflow } =
  await import('../../../src/renderer/modules/workflows/workflow-start.js');
const { COMMANDS } = await import('../../../src/shared/commands/commands.js');

const handler = {};
initWorkflowCommands({
  registerHandler: (id, fn) => {
    handler[id] = fn;
  },
  unregisterHandler: (id) => {
    delete handler[id];
  },
  refreshHotkeys: () => {},
  executeCommand: vi.fn(),
  runMacro: vi.fn(),
});

const DATEI = [
  '---',
  'workflow: true',
  'name: Probe',
  '---',
  '',
  '```workflow',
  'create "{{folder}}/Neu.md"',
  'notify "fertig"',
  '```',
  '',
].join('\n');

const offen = [];
function sicht() {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc: DATEI,
      extensions: [markdown(), workflowHervorhebung, workflowKopf()],
    }),
    parent,
  });
  offen.push(view);
  return view;
}
const marken = (view) => view.dom.querySelectorAll('.cm-wf-keyword, .cm-wf-string').length;
const koepfe = (view) => view.dom.querySelectorAll('.cm-wf-kopf').length;
// Die Kommandos der Workflows: die dynamischen je Workflow und die beiden im
// Namensraum der Erweiterung (Seite «Workflow-Läufe», «Neuer Workflow …»).
const kommandos = () =>
  COMMANDS.filter((c) => c.id.startsWith('workflow.') || c.id.startsWith('ext.workflows.'))
    .map((c) => c.id)
    .sort();
const AN = [
  'ext.workflows.newWorkflow',
  'ext.workflows.openRuns',
  'workflow.Wochenr%C3%BCckblick.md',
];

async function schalte(aus) {
  await applyExtensionsState(aus, { persist: false });
}

afterEach(async () => {
  for (const v of offen.splice(0)) v.destroy();
  await schalte([]);
});

describe('Aus-Zustand der Workflows über den echten Schalter (4T-002352)', () => {
  it('der Schalter nimmt die Kennung an', async () => {
    expect(isExtensionActive('workflows')).toBe(true);
    await schalte(['workflows']);
    expect(isExtensionActive('workflows')).toBe(false);
  });

  it('AK3: im Editor keine Hervorhebung und keine Kopfzeile, also kein Knopf', async () => {
    const view = sicht();
    expect(marken(view)).toBeGreaterThan(0);
    expect(koepfe(view)).toBe(1);
    await schalte(['workflows']);
    view.dispatch({ effects: liveRebuildEffect.of(null) });
    expect(marken(view)).toBe(0);
    expect(koepfe(view)).toBe(0);
    // Der Text bleibt Zeichen für Zeichen stehen.
    expect(view.state.doc.toString()).toBe(DATEI);
  });

  it('AK4: keine Kommandos der Workflows; das Wiedereinschalten bringt sie zurück (AK5)', async () => {
    await vi.waitFor(() => expect(kommandos()).toEqual(AN));
    await schalte(['workflows']);
    await vi.waitFor(() => expect(kommandos()).toEqual([]));
    for (const id of AN) expect(handler[id], `${id} ohne Handler`).toBeUndefined();
    await schalte([]);
    await vi.waitFor(() => expect(kommandos()).toEqual(AN));
  });

  it('AK4: die Seite «Workflow-Läufe» öffnet nicht, und kein Lauf startet', async () => {
    await schalte(['workflows']);
    expect(oeffneWorkflowLaeufe()).toBe(false);
    expect(await starteWorkflow({ path: 'C:/b/Workflows/Wochenrückblick.md', text: DATEI })).toBe(
      false,
    );
  });

  it('AK5: nach dem Wiedereinschalten sind Hervorhebung und Kopfzeile wieder da', async () => {
    await schalte(['workflows']);
    const view = sicht();
    expect(marken(view)).toBe(0);
    await schalte([]);
    view.dispatch({ effects: liveRebuildEffect.of(null) });
    expect(marken(view)).toBeGreaterThan(0);
    expect(koepfe(view)).toBe(1);
  });
});
