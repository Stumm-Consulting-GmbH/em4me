// @vitest-environment jsdom
// 4T-002355 (Epic 3E-000184): Die Handgriffe des Untermenüs «Datei → Workflows»
// im Fenster und «Neuer Workflow …» (src/renderer/modules/workflows/workflow-menue.js).
//
// Am Bedienweg: Die Meldung des Menüs startet einen Workflow (Task AK2), ruft die
// Seite «Workflow-Läufe», öffnet die Einstellungen des Bereichs (AK3) und legt
// einen Workflow an (AK5), mit und ohne festgelegten Ordner. Start, Dialoge,
// Einstellungs-Seite und Reiter sind Attrappen; die Brücke ist der Stub.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';

const aus = new Set();
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => !aus.has(id),
}));
vi.mock('../../../src/renderer/modules/command-placement.js', () => ({
  renderCommandButtons: () => {},
}));
const starteWorkflow = vi.fn(async () => true);
vi.mock('../../../src/renderer/modules/workflows/workflow-start.js', () => ({
  starteWorkflow: (...a) => starteWorkflow(...a),
}));
const openSettingsPage = vi.fn();
vi.mock('../../../src/renderer/modules/settings/settings-page.js', () => ({
  openSettingsPage: () => openSettingsPage(),
}));
const activateSection = vi.fn();
vi.mock('../../../src/renderer/modules/settings/settings-mount.js', () => ({
  activateSection: (id) => activateSection(id),
}));
const openInPane = vi.fn(async () => 0);
vi.mock('../../../src/renderer/modules/tabs/tabs.js', () => ({
  openInPane: (...a) => openInPane(...a),
}));
let nameAntwort = 'Wochenrückblick';
const showNameInputDialog = vi.fn(async () => nameAntwort);
vi.mock('../../../src/renderer/modules/dialogs/dialogs.js', () => ({
  showNameInputDialog: (o) => showNameInputDialog(o),
}));
const showStatusbarHint = vi.fn();
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (...a) => showStatusbarHint(...a),
}));

let menueZuhoerer = null;
const aufrufe = [];
let liste = null;
let wahl = null;
let gesetzt = { ok: true };
let angelegt = { ok: true, path: 'C:/b/Abläufe/Wochenrückblick.md' };
window.api.onWorkflowMenuAction = (cb) => (menueZuhoerer = cb);
window.api.workflowFolderList = async () => (aufrufe.push(['folderList']), liste);
window.api.templatesChooseFolder = async (zweck) => (aufrufe.push(['choose', zweck]), wahl);
window.api.workflowSetFolder = async (f) => (aufrufe.push(['setFolder', f]), gesetzt);
window.api.workflowCreate = async (n) => (aufrufe.push(['create', n]), angelegt);

const menue = await import('../../../src/renderer/modules/workflows/workflow-menue.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { COMMANDS } = await import('../../../src/shared/commands/commands.js');

const handler = {};
const wiring = {
  registerHandler: (id, fn) => (handler[id] = fn),
  unregisterHandler: (id) => delete handler[id],
  refreshHotkeys: vi.fn(),
  executeCommand: vi.fn(),
};
menue.initWorkflowMenue(wiring);

const mitOrdner = () => ({ ok: true, enabled: true, source: 'area', folder: 'C:/b/Abläufe' });
const warte = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  aus.clear();
  aufrufe.length = 0;
  for (const f of [
    starteWorkflow,
    openSettingsPage,
    activateSection,
    openInPane,
    showNameInputDialog,
    showStatusbarHint,
    wiring.executeCommand,
  ])
    f.mockClear();
  liste = mitOrdner();
  wahl = null;
  gesetzt = { ok: true };
  angelegt = { ok: true, path: 'C:/b/Abläufe/Wochenrückblick.md' };
  nameAntwort = 'Wochenrückblick';
  state.areaPath = 'C:/b';
  state.activePaneIndex = 0;
});

describe('Meldung des Menüs (Task AK2, AK3)', () => {
  it('ein Workflow-Eintrag startet seinen Workflow', () => {
    menueZuhoerer({ kind: 'start', path: 'C:/b/Abläufe/Woche.md' });
    expect(starteWorkflow).toHaveBeenCalledWith({ path: 'C:/b/Abläufe/Woche.md' });
  });

  it('«Workflow-Läufe anzeigen» ruft das Kommando der Seite', () => {
    menueZuhoerer({ kind: 'runs' });
    expect(wiring.executeCommand).toHaveBeenCalledWith(menue.WORKFLOW_RUNS_COMMAND_ID);
    expect(menue.WORKFLOW_RUNS_COMMAND_ID).toBe('ext.workflows.openRuns');
  });

  it('«Workflow-Ordner festlegen …» öffnet die Einstellungen beim Abschnitt des Bereichs', () => {
    menueZuhoerer({ kind: 'folder' });
    expect(openSettingsPage).toHaveBeenCalledTimes(1);
    expect(activateSection).toHaveBeenCalledWith('workflowsArea');
  });

  it('ohne Bereich beim anwendungsweiten Abschnitt', () => {
    state.areaPath = null;
    menueZuhoerer({ kind: 'folder' });
    expect(activateSection).toHaveBeenCalledWith('workflows');
  });

  it('übergeht unbekannte und unvollständige Meldungen', () => {
    menueZuhoerer({ kind: 'start' });
    menueZuhoerer({ kind: 'unbekannt' });
    menueZuhoerer(null);
    expect(starteWorkflow).not.toHaveBeenCalled();
    expect(wiring.executeCommand).not.toHaveBeenCalled();
  });
});

describe('«Neuer Workflow …» (Task AK5)', () => {
  it('mit Ordner: fragt den Namen, legt an und öffnet die Datei', async () => {
    expect(await menue.neuerWorkflow()).toBe(true);
    expect(aufrufe).toEqual([['folderList'], ['create', 'Wochenrückblick']]);
    expect(showNameInputDialog).toHaveBeenCalledTimes(1);
    expect(openInPane).toHaveBeenCalledWith(0, ['C:/b/Abläufe/Wochenrückblick.md']);
  });

  it('ohne Ordner: fragt zuerst nach dem Ordner, hält ihn fest, dann den Namen', async () => {
    liste = { ok: true, enabled: true, source: 'none', folder: null };
    wahl = { ok: true, path: 'C:/b/Abläufe' };
    expect(await menue.neuerWorkflow()).toBe(true);
    expect(aufrufe).toEqual([
      ['folderList'],
      ['choose', 'workflows'],
      ['setFolder', 'C:/b/Abläufe'],
      ['create', 'Wochenrückblick'],
    ]);
  });

  it('Abbruch der Ordner-Wahl legt nichts an und fragt keinen Namen', async () => {
    liste = { ok: true, enabled: true, source: 'none', folder: null };
    expect(await menue.neuerWorkflow()).toBe(false);
    expect(showNameInputDialog).not.toHaveBeenCalled();
    expect(aufrufe.map((a) => a[0])).toEqual(['folderList', 'choose']);
  });

  it('ein nicht festgehaltener Ordner meldet sich in der Statusleiste', async () => {
    liste = { ok: true, enabled: true, source: 'none', folder: null };
    wahl = { ok: true, path: 'C:/b/Abläufe' };
    gesetzt = { ok: false, error: 'mdda defekt' };
    expect(await menue.neuerWorkflow()).toBe(false);
    expect(showStatusbarHint.mock.calls[0][0]).toBe('workflow.neu.ordnerNichtGesetzt');
  });

  it('Abbruch des Namens-Dialogs legt nichts an', async () => {
    nameAntwort = null;
    expect(await menue.neuerWorkflow()).toBe(false);
    expect(aufrufe.map((a) => a[0])).toEqual(['folderList']);
  });

  it('der Namens-Dialog weist einen leeren Namen ab', async () => {
    await menue.neuerWorkflow();
    const { validate } = showNameInputDialog.mock.calls[0][0];
    expect(validate('  ')).toBe('workflow.neu.nameLeer');
    expect(validate('W')).toBeNull();
  });

  it.each([
    ['exists', 'workflow.neu.existiert'],
    ['invalidName', 'areaPanel.newNameInvalid'],
    ['folderMissing', 'workflow.neu.ordnerFehlt'],
    ['writeFailed', 'workflow.neu.fehler'],
  ])('meldet den Code %s mit dem Hinweis %s und öffnet nichts', async (code, schluessel) => {
    angelegt = { ok: false, code };
    expect(await menue.neuerWorkflow()).toBe(false);
    expect(showStatusbarHint.mock.calls[0][0]).toBe(schluessel);
    expect(openInPane).not.toHaveBeenCalled();
  });

  it('bei abgeschalteter Erweiterung geschieht nichts', async () => {
    liste = { ok: true, enabled: false, source: 'none', folder: null };
    expect(await menue.neuerWorkflow()).toBe(false);
    expect(showNameInputDialog).not.toHaveBeenCalled();
  });

  it('die Meldung «new» des Menüs führt denselben Weg', async () => {
    menueZuhoerer({ kind: 'new' });
    await warte();
    await warte();
    expect(aufrufe).toEqual([['folderList'], ['create', 'Wochenrückblick']]);
  });
});

describe('Kommando «Neuer Workflow …»', () => {
  it('steht bei eingeschalteter Erweiterung in der Registry und führt den Weg aus', async () => {
    const cmd = COMMANDS.find((c) => c.id === menue.NEW_WORKFLOW_COMMAND_ID);
    expect(cmd).toMatchObject({ labelKey: 'workflow.menu.new', dynamic: true });
    handler[menue.NEW_WORKFLOW_COMMAND_ID]();
    await warte();
    await warte();
    expect(aufrufe[0]).toEqual(['folderList']);
  });

  it('verschwindet mit abgeschalteter Erweiterung', () => {
    aus.add('workflows');
    document.dispatchEvent(new Event('scg:extensions-changed'));
    expect(COMMANDS.some((c) => c.id === menue.NEW_WORKFLOW_COMMAND_ID)).toBe(false);
    expect(handler[menue.NEW_WORKFLOW_COMMAND_ID]).toBeUndefined();
    aus.clear();
    document.dispatchEvent(new Event('scg:extensions-changed'));
    expect(COMMANDS.some((c) => c.id === menue.NEW_WORKFLOW_COMMAND_ID)).toBe(true);
  });
});
