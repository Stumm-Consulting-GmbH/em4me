// @vitest-environment jsdom
// 4T-002355 (Epic 3E-000184, Task AK6, Story 4S-001105 AK4): «Starten» im
// Kontextmenü einer Workflow-Datei im Bereichs-Panel.
//
// Am Bedienweg: Das Menü einer Datei-Zeile trägt «Starten» zuoberst, sobald der
// Hauptprozess die Datei als Workflow erkannt hat; der Klick startet den Lauf
// über den Start aus 4T-002349. Eine gewöhnliche Datei, eine Datei ohne
// Markdown-Endung, die abgeschaltete Erweiterung und ein inzwischen
// geschlossenes Menü bekommen den Eintrag nicht. Der Start ist eine Attrappe.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';

const aus = new Set();
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => !aus.has(id),
}));
const starteWorkflow = vi.fn(async () => true);
vi.mock('../../../src/renderer/modules/workflows/workflow-start.js', () => ({
  starteWorkflow: (...a) => starteWorkflow(...a),
}));

const workflows = new Set();
const gefragt = [];
window.api.workflowFileInfo = async (p) => {
  gefragt.push(p);
  return { ok: true, isWorkflow: workflows.has(p) };
};
window.api.reportMenuState = () => {};
window.api.reportPanes = () => {};

const menues = await import('../../../src/renderer/modules/area-panel-menus.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { hideContextMenu } =
  await import('../../../src/renderer/modules/dialogs/context-menu-utils.js');

const menu = () => document.getElementById('context-menu');
const ids = () => [...menu().children].map((e) => e.dataset.menuId || '---');
const ereignis = () => ({ preventDefault() {}, stopPropagation() {}, clientX: 10, clientY: 10 });

beforeEach(() => {
  aus.clear();
  workflows.clear();
  gefragt.length = 0;
  starteWorkflow.mockClear();
  state.areaPath = 'C:/b';
  if (!menu()) {
    const el = document.createElement('div');
    el.id = 'context-menu';
    document.body.appendChild(el);
  }
  menu().innerHTML = '';
  menu().hidden = true;
});

describe('«Starten» im Kontextmenü einer Datei-Zeile', () => {
  it('steht zuoberst bei einer Workflow-Datei, durch einen Trenner abgesetzt', async () => {
    workflows.add('C:/b/Hallo.md');
    await menues.showAreaFileContextMenu(ereignis(), 'C:/b/Hallo.md', () => {});
    expect(ids().slice(0, 2)).toEqual(['area-file-workflow-start', '---']);
    // Die übrigen Gruppen bleiben vollständig, die Datei-Verwaltung zuletzt.
    expect(ids().slice(-3)).toEqual(['area-file-copy', 'area-file-rename', 'area-file-delete']);
    expect(menu().children[0].textContent).toBeTruthy();
  });

  it('der Klick startet den Workflow der Datei und schließt das Menü', async () => {
    workflows.add('C:/b/Hallo.md');
    await menues.showAreaFileContextMenu(ereignis(), 'C:/b/Hallo.md', () => {});
    menu().children[0].click();
    expect(starteWorkflow).toHaveBeenCalledWith({ path: 'C:/b/Hallo.md' });
    expect(menu().hidden).toBe(true);
  });

  it('fehlt bei einer gewöhnlichen Markdown-Datei', async () => {
    await menues.showAreaFileContextMenu(ereignis(), 'C:/b/Notiz.md', () => {});
    expect(gefragt).toEqual(['C:/b/Notiz.md']);
    expect(ids()).not.toContain('area-file-workflow-start');
  });

  it('fragt bei einer Datei ohne Markdown-Endung gar nicht erst', async () => {
    await menues.showAreaFileContextMenu(ereignis(), 'C:/b/Bild.png', () => {});
    expect(gefragt).toEqual([]);
    expect(ids()).not.toContain('area-file-workflow-start');
  });

  it('fehlt bei abgeschalteter Erweiterung «Workflows»', async () => {
    aus.add('workflows');
    workflows.add('C:/b/Hallo.md');
    await menues.showAreaFileContextMenu(ereignis(), 'C:/b/Hallo.md', () => {});
    expect(gefragt).toEqual([]);
    expect(ids()).not.toContain('area-file-workflow-start');
  });

  it('kommt nicht in ein Menü, das vor der Antwort geschlossen wurde', async () => {
    workflows.add('C:/b/Hallo.md');
    const laeuft = menues.showAreaFileContextMenu(ereignis(), 'C:/b/Hallo.md', () => {});
    hideContextMenu();
    await laeuft;
    expect(ids()).toEqual([]);
  });

  it('kommt nicht in ein inzwischen neu aufgebautes Menü einer anderen Datei', async () => {
    workflows.add('C:/b/Hallo.md');
    const erstes = menues.showAreaFileContextMenu(ereignis(), 'C:/b/Hallo.md', () => {});
    const zweites = menues.showAreaFileContextMenu(ereignis(), 'C:/b/Notiz.md', () => {});
    await Promise.all([erstes, zweites]);
    expect(ids()).not.toContain('area-file-workflow-start');
  });
});
