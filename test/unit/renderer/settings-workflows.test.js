// @vitest-environment jsdom
// 4T-002355 (Epic 3E-000184): Einstellungs-Abschnitte «Workflows» —
// anwendungsweiter Ordner und Bereichs-Übersteuerung (Story 4S-001109, AK1).
//
// Geprüft wird, was eine eigene Regel trägt: was als Änderung gilt, was beim
// Anwenden wohin geschrieben wird, und dass die Ordner-Auswahl im Bereich
// wurzel-relativ speichert. Die Brücke ist eine Attrappe auf window.api.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';

const modul = await import('../../../src/renderer/modules/settings/settings-workflows.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const {
  applyWorkflowsSection,
  dirtyWorkflowsAreaSection,
  dirtyWorkflowsSection,
  readWorkflowsFromConfig,
  renderWorkflowsAreaSection,
  renderWorkflowsSection,
} = modul;

beforeEach(() => {
  document.body.innerHTML = '';
  window.api.setSetting = vi.fn(async () => {});
  window.api.workflowSetAreaConfig = vi.fn(async () => ({ ok: true }));
  window.api.workflowGetConfig = vi.fn(async () => null);
  window.api.templatesChooseFolder = vi.fn(async () => ({ ok: false, canceled: true }));
  window.api.relative = (von, nach) => {
    const a = von.replace(/\\/g, '/');
    const b = nach.replace(/\\/g, '/');
    return b.startsWith(a + '/') ? b.slice(a.length + 1) : '../' + b;
  };
  state.areaPath = null;
});

async function entwurf(config) {
  window.api.workflowGetConfig = vi.fn(async () => config);
  const werte = await readWorkflowsFromConfig();
  return { workflows: werte.draft, workflowsSnapshot: werte.snapshot };
}

describe('readWorkflowsFromConfig', () => {
  it('bringt beide Ebenen in die Entwurfs-Form', async () => {
    const d = await entwurf({
      hasArea: true,
      areaName: 'Notizen',
      global: { folder: 'C:\\Global' },
      area: { folder: 'Abläufe' },
    });
    expect(d.workflows).toEqual({
      hasArea: true,
      areaName: 'Notizen',
      global: { folder: 'C:\\Global' },
      areaEnabled: true,
      area: { folder: 'Abläufe' },
    });
    expect(d.workflowsSnapshot).toEqual({ global: 'C:\\Global', area: { folder: 'Abläufe' } });
  });

  it('fällt bei fehlender Antwort auf leere Werte zurück', async () => {
    window.api.workflowGetConfig = vi.fn(async () => {
      throw new Error('kein Kanal');
    });
    const werte = await readWorkflowsFromConfig();
    expect(werte.draft).toMatchObject({
      hasArea: false,
      areaEnabled: false,
      global: { folder: '' },
    });
    expect(werte.snapshot).toEqual({ global: '', area: null });
  });
});

describe('Änderungs-Erkennung', () => {
  it('meldet eine Änderung des globalen Ordners, nicht bloße Leerzeichen', async () => {
    const d = await entwurf({ hasArea: false, global: { folder: 'C:\\Global' }, area: null });
    expect(dirtyWorkflowsSection(d)).toBe(false);
    d.workflows.global.folder = ' C:\\Global  ';
    expect(dirtyWorkflowsSection(d)).toBe(false);
    d.workflows.global.folder = 'C:\\Anders';
    expect(dirtyWorkflowsSection(d)).toBe(true);
  });

  it('meldet Ein- und Ausschalten der Bereichs-Konfiguration', async () => {
    const d = await entwurf({
      hasArea: true,
      areaName: 'N',
      global: null,
      area: { folder: 'Abläufe' },
    });
    expect(dirtyWorkflowsAreaSection(d)).toBe(false);
    d.workflows.areaEnabled = false;
    expect(dirtyWorkflowsAreaSection(d)).toBe(true);
  });

  it('wertet einen eingeschalteten Schalter ohne Ordner wie «nicht festgelegt»', async () => {
    const d = await entwurf({ hasArea: true, areaName: 'N', global: null, area: null });
    d.workflows.areaEnabled = true;
    expect(dirtyWorkflowsAreaSection(d)).toBe(false);
    d.workflows.area.folder = 'Abläufe';
    expect(dirtyWorkflowsAreaSection(d)).toBe(true);
  });
});

describe('applyWorkflowsSection — wohin geschrieben wird (AK1)', () => {
  it('schreibt den globalen Ordner getrimmt in den Einstellungs-Speicher', async () => {
    const d = await entwurf({ hasArea: false, global: null, area: null });
    d.workflows.global.folder = '  C:\\Workflows ';
    await applyWorkflowsSection(d);
    expect(window.api.setSetting).toHaveBeenCalledWith('workflows.folder', 'C:\\Workflows');
    expect(window.api.workflowSetAreaConfig).not.toHaveBeenCalled();
    expect(d.workflowsSnapshot).toEqual({ global: 'C:\\Workflows', area: null });
  });

  it('schreibt den Bereichs-Ordner über den Kanal der Bereichsdatei und entfernt ihn beim Ausschalten', async () => {
    const d = await entwurf({ hasArea: true, areaName: 'N', global: null, area: null });
    d.workflows.areaEnabled = true;
    d.workflows.area.folder = 'Abläufe ';
    await applyWorkflowsSection(d);
    expect(window.api.workflowSetAreaConfig).toHaveBeenLastCalledWith({ folder: 'Abläufe' });
    expect(d.workflowsSnapshot.area).toEqual({ folder: 'Abläufe' });
    d.workflows.areaEnabled = false;
    await applyWorkflowsSection(d);
    expect(window.api.workflowSetAreaConfig).toHaveBeenLastCalledWith(null);
    expect(d.workflowsSnapshot.area).toBeNull();
    expect(window.api.setSetting).not.toHaveBeenCalled();
  });

  it('behält bei abgelehntem Schreiben den alten Stand als Vergleich', async () => {
    const d = await entwurf({
      hasArea: true,
      areaName: 'N',
      global: null,
      area: { folder: 'Alt' },
    });
    window.api.workflowSetAreaConfig = vi.fn(async () => ({ ok: false, error: 'mdda defekt' }));
    d.workflows.area.folder = 'Neu';
    await applyWorkflowsSection(d);
    expect(d.workflowsSnapshot.area).toEqual({ folder: 'Alt' });
    expect(dirtyWorkflowsAreaSection(d)).toBe(true);
  });

  it('schreibt nichts ohne Änderung', async () => {
    const d = await entwurf({
      hasArea: true,
      areaName: 'N',
      global: { folder: 'G' },
      area: { folder: 'B' },
    });
    await applyWorkflowsSection(d);
    expect(window.api.setSetting).not.toHaveBeenCalled();
    expect(window.api.workflowSetAreaConfig).not.toHaveBeenCalled();
  });
});

describe('Darstellung und Ordner-Auswahl', () => {
  it('zeigt den globalen Ordner und übernimmt die Auswahl absolut', async () => {
    const d = await entwurf({ hasArea: false, global: { folder: 'C:\\Alt' }, area: null });
    renderWorkflowsSection(document.body, d);
    const eingabe = document.getElementById('settings-workflows-global-folder');
    expect(eingabe.value).toBe('C:\\Alt');
    window.api.templatesChooseFolder = vi.fn(async () => ({ ok: true, path: 'C:\\Neu' }));
    document.getElementById('settings-workflows-global-folder-browse').click();
    await vi.waitFor(() => expect(eingabe.value).toBe('C:\\Neu'));
    expect(window.api.templatesChooseFolder).toHaveBeenCalledWith('workflows');
    expect(d.workflows.global.folder).toBe('C:\\Neu');
  });

  it('zeigt im Bereich den Schalter und erst eingeschaltet die Ordner-Zeile', async () => {
    const d = await entwurf({ hasArea: true, areaName: 'Notizen', global: null, area: null });
    renderWorkflowsAreaSection(document.body, d);
    expect(document.getElementById('settings-workflows-area-enabled').checked).toBe(false);
    expect(document.getElementById('settings-workflows-area-folder')).toBeNull();
    document.body.innerHTML = '';
    d.workflows.areaEnabled = true;
    renderWorkflowsAreaSection(document.body, d);
    expect(document.getElementById('settings-workflows-area-folder')).not.toBeNull();
  });

  it('speichert eine Auswahl innerhalb des Bereichs wurzel-relativ, außerhalb absolut', async () => {
    state.areaPath = 'C:\\Bereich';
    const d = await entwurf({
      hasArea: true,
      areaName: 'Notizen',
      global: null,
      area: { folder: '' },
    });
    d.workflows.areaEnabled = true;
    renderWorkflowsAreaSection(document.body, d);
    const eingabe = document.getElementById('settings-workflows-area-folder');
    window.api.templatesChooseFolder = vi.fn(async () => ({
      ok: true,
      path: 'C:\\Bereich\\Abläufe',
    }));
    document.getElementById('settings-workflows-area-folder-browse').click();
    await vi.waitFor(() => expect(eingabe.value).toBe('Abläufe'));
    window.api.templatesChooseFolder = vi.fn(async () => ({ ok: true, path: 'D:\\Woanders' }));
    document.getElementById('settings-workflows-area-folder-browse').click();
    await vi.waitFor(() => expect(eingabe.value).toBe('D:\\Woanders'));
  });

  it('zeichnet ohne Bereich nichts', async () => {
    const d = await entwurf({ hasArea: false, global: null, area: null });
    renderWorkflowsAreaSection(document.body, d);
    expect(document.body.children).toHaveLength(0);
  });
});
