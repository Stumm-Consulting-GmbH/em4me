// @vitest-environment jsdom
// 4T-002349 (Epic 3E-000184): Die Workflows des Workflow-Ordners als Kommandos
// (src/renderer/modules/workflows/workflow-commands.js).
//
// Jeder Workflow der Liste wird ein Registry-Kommando `workflow.<Pfad-Kennung>`
// mit seinem Namen als Bezeichnung (AK1); als Registry-Kommando ist er über die
// Kommando-Platzierung auf Statusleiste und Kontextmenü zu legen und unter
// «Einstellungen → Tastenkürzel» zu belegen (AK2, Muster
// test/unit/command-placement.test.js). Liste, Start und Statusleiste sind
// Attrappen.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const aus = new Set();
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => !aus.has(id),
}));
const renderCommandButtons = vi.fn();
vi.mock('../../../src/renderer/modules/command-placement.js', () => ({
  renderCommandButtons: () => renderCommandButtons(),
}));
let liste = { workflows: [] };
let zuhoerer = null;
vi.mock('../../../src/renderer/modules/workflows/workflow-folder-list.js', () => ({
  getWorkflowFolderList: async () => liste,
  onWorkflowFolderListChanged: (cb) => {
    zuhoerer = cb;
    return () => {};
  },
}));
const starteWorkflow = vi.fn(async () => true);
let laeuft = false;
const initWorkflowStart = vi.fn();
vi.mock('../../../src/renderer/modules/workflows/workflow-start.js', () => ({
  starteWorkflow: (...a) => starteWorkflow(...a),
  laeuftWorkflow: () => laeuft,
  initWorkflowStart: (...a) => initWorkflowStart(...a),
}));
const registriereStartKnopf = vi.fn();
vi.mock('../../../src/renderer/modules/workflows/workflow-start-knopf.js', () => ({
  registriereStartKnopf: () => registriereStartKnopf(),
}));

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { initWorkflowCommands, syncWorkflowCommands, zaehleWorkflows } =
  await import('../../../src/renderer/modules/workflows/workflow-commands.js');
const { pruefeWorkflow } =
  await import('../../../src/renderer/modules/workflows/workflow-pruefung.js');
const { COMMANDS, COMMAND_CATEGORIES, findBindingConflict, mergeBindings } =
  await import('../../../src/shared/commands/commands.js');
const { normalizeCommandPlacement, visibleContextMenuEntries } =
  await import('../../../src/shared/commands/command-placement.js');

const handler = {};
const wiring = {
  registerHandler: (id, fn) => {
    handler[id] = fn;
  },
  unregisterHandler: (id) => {
    delete handler[id];
  },
  refreshHotkeys: vi.fn(),
  executeCommand: vi.fn(),
  runMacro: vi.fn(),
};
const eintrag = (name, relPath) => ({
  kind: 'workflow',
  name,
  description: '',
  relPath,
  absPath: `C:/b/Workflows/${relPath}`,
});
const workflowKommandos = () => COMMANDS.filter((c) => c.id.startsWith('workflow.'));

liste = {
  workflows: [eintrag('Wochenrückblick anlegen', 'Wochenrückblick.md')],
};
initWorkflowCommands(wiring);
await vi.waitFor(() => expect(workflowKommandos()).toHaveLength(1));

beforeEach(() => {
  aus.clear();
  laeuft = false;
  starteWorkflow.mockClear();
  renderCommandButtons.mockClear();
  wiring.refreshHotkeys.mockClear();
});

describe('initWorkflowCommands', () => {
  it('verdrahtet Start und Knopf und holt die Liste', () => {
    expect(initWorkflowStart).toHaveBeenCalledWith({
      executeCommand: wiring.executeCommand,
      runMacro: wiring.runMacro,
    });
    expect(registriereStartKnopf).toHaveBeenCalled();
    expect(typeof zuhoerer).toBe('function');
  });

  it('jeder Workflow ist ein Kommando mit Kennung aus dem Pfad und Namen als Bezeichnung (AK1)', () => {
    const [cmd] = workflowKommandos();
    expect(cmd.id).toBe('workflow.Wochenr%C3%BCckblick.md');
    expect(i18n.t(cmd.labelKey)).toBe('Wochenrückblick anlegen');
    expect(cmd).toMatchObject({ dynamic: true, menu: false });
  });
});

describe('syncWorkflowCommands', () => {
  it('zwei gleichnamige Workflows in Unterordnern sind zwei Kommandos (AK8 der Story)', () => {
    syncWorkflowCommands({
      workflows: [eintrag('Start', 'A/Start.md'), eintrag('Start', 'B/Start.md')],
    });
    expect(workflowKommandos().map((c) => c.id)).toEqual([
      'workflow.A%2FStart.md',
      'workflow.B%2FStart.md',
    ]);
    expect(zaehleWorkflows('Start')).toBe(2);
  });

  it('entfernt verschwundene Kommandos samt Handler und baut Statusleiste und Kürzel nach', () => {
    syncWorkflowCommands({ workflows: [eintrag('X', 'X.md')] });
    syncWorkflowCommands({ workflows: [] });
    expect(workflowKommandos()).toEqual([]);
    expect(handler['workflow.X.md']).toBeUndefined();
    expect(renderCommandButtons).toHaveBeenCalledTimes(2);
    expect(wiring.refreshHotkeys).toHaveBeenCalledTimes(2);
  });

  it('folgt der Liste, die der Ordner meldet', () => {
    zuhoerer({ workflows: [eintrag('Neu', 'Neu.md')] });
    expect(workflowKommandos().map((c) => c.id)).toEqual(['workflow.Neu.md']);
  });

  it('ohne Erweiterung gibt es keine Workflow-Kommandos', () => {
    aus.add('workflows');
    syncWorkflowCommands({ workflows: [eintrag('X', 'X.md')] });
    expect(workflowKommandos()).toEqual([]);
  });

  it('übergeht unvollständige Einträge und eine fehlende Liste', () => {
    syncWorkflowCommands({ workflows: [{ name: 'X' }, null, eintrag('Y', 'Y.md')] });
    expect(workflowKommandos().map((c) => c.id)).toEqual(['workflow.Y.md']);
    syncWorkflowCommands(null);
    expect(workflowKommandos()).toEqual([]);
  });
});

describe('Ausführung und Platzierung', () => {
  it('die Wahl des Kommandos startet den Workflow über seinen Pfad', () => {
    syncWorkflowCommands({ workflows: [eintrag('X', 'X.md')] });
    expect(handler['workflow.X.md']()).toBeUndefined();
    expect(starteWorkflow).toHaveBeenCalledWith({ path: 'C:/b/Workflows/X.md' });
  });

  it('während eines Laufs meldet der Handler false (Makro-Schritt scheitert)', () => {
    syncWorkflowCommands({ workflows: [eintrag('X', 'X.md')] });
    laeuft = true;
    expect(handler['workflow.X.md']()).toBe(false);
    expect(starteWorkflow).toHaveBeenCalled();
  });

  it('lässt sich auf Statusleiste und ins Kontextmenü legen (AK2)', () => {
    syncWorkflowCommands({ workflows: [eintrag('X', 'X.md')] });
    const platzierung = normalizeCommandPlacement({
      statusbar: [{ commandId: 'workflow.X.md' }],
      contextMenu: [{ commandId: 'workflow.X.md' }, { commandId: 'workflow.Weg.md' }],
    });
    expect(platzierung.statusbar.map((e) => e.commandId)).toEqual(['workflow.X.md']);
    const bekannt = new Set(COMMANDS.map((c) => c.id));
    expect(
      visibleContextMenuEntries(platzierung.contextMenu, new Set(), bekannt).map(
        (e) => e.commandId,
      ),
    ).toEqual(['workflow.X.md']);
  });

  it('lässt sich unter «Einstellungen → Tastenkürzel» belegen (AK2)', () => {
    syncWorkflowCommands({ workflows: [eintrag('X', 'X.md')] });
    const cmd = COMMANDS.find((c) => c.id === 'workflow.X.md');
    expect(COMMAND_CATEGORIES).toContain(cmd.categoryKey);
    expect(mergeBindings({ 'workflow.X.md': 'Ctrl+Alt+W' })['workflow.X.md']).toEqual([
      'Ctrl+Alt+W',
    ]);
    expect(
      findBindingConflict({ 'workflow.X.md': 'Ctrl+Alt+W' }, 'file.save', 'Ctrl+Alt+W'),
    ).toEqual({
      type: 'command',
      commandId: 'workflow.X.md',
    });
  });

  it('die Prüfung kennt die Workflow-Namen der Liste', () => {
    syncWorkflowCommands({
      workflows: [eintrag('B', 'B.md'), eintrag('C', 'x/C.md'), eintrag('C', 'y/C.md')],
    });
    const W = (zeile) =>
      ['---', 'workflow: true', 'name: A', '---', '', '```workflow', zeile, '```', ''].join('\n');
    expect(pruefeWorkflow(W('workflow "B"')).findings).toEqual([]);
    expect(pruefeWorkflow(W('workflow "C"')).findings.map((f) => f.code)).toEqual([
      'workflowAmbiguous',
    ]);
    expect(pruefeWorkflow(W('workflow "D"')).findings.map((f) => f.code)).toEqual([
      'workflowUnknown',
    ]);
  });
});
