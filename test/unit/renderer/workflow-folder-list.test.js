// @vitest-environment jsdom
// 4T-002355 (Epic 3E-000184): Die Liste des Workflow-Ordners auf der Seite des
// Fensters — Abfrage, Meldung bei Änderung und Nachzug beim Bereichs-Wechsel
// (Story 4S-001109, AK6; Schnittstelle für 4T-002349).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';

let modul;
let meldeAenderung;

const LISTE = (namen) => ({
  ok: true,
  enabled: true,
  source: 'global',
  folder: 'C:\\Workflows',
  missing: false,
  items: namen.map((name) => ({ kind: 'workflow', name, relPath: `${name}.md` })),
  workflows: namen.map((name) => ({ kind: 'workflow', name, relPath: `${name}.md` })),
});

beforeEach(async () => {
  vi.resetModules();
  meldeAenderung = null;
  window.api.workflowFolderList = vi.fn(async () => LISTE(['Eins']));
  window.api.onWorkflowFolderChanged = vi.fn((cb) => {
    meldeAenderung = cb;
  });
  modul = await import('../../../src/renderer/modules/workflows/workflow-folder-list.js');
});

describe('workflow-folder-list', () => {
  it('ruht bis zur ersten Abfrage: kein Kanal, keine Anmeldung', async () => {
    expect(await modul.refreshWorkflowFolderList()).toBeNull();
    expect(window.api.workflowFolderList).not.toHaveBeenCalled();
    expect(window.api.onWorkflowFolderChanged).not.toHaveBeenCalled();
  });

  it('holt die Liste einmal und hält sie', async () => {
    const [a, b] = await Promise.all([
      modul.getWorkflowFolderList(),
      modul.getWorkflowFolderList(),
    ]);
    expect(a.workflows.map((w) => w.name)).toEqual(['Eins']);
    expect(b).toBe(a);
    expect(await modul.getWorkflowFolderList()).toBe(a);
    expect(window.api.workflowFolderList).toHaveBeenCalledTimes(1);
    expect(window.api.onWorkflowFolderChanged).toHaveBeenCalledTimes(1);
  });

  it('fragt bei einer Meldung des Hauptprozesses nach und ruft die Zuhörer', async () => {
    await modul.getWorkflowFolderList();
    const gehoert = [];
    const ab = modul.onWorkflowFolderListChanged((liste) =>
      gehoert.push(liste.workflows.map((w) => w.name)),
    );
    window.api.workflowFolderList = vi.fn(async () => LISTE(['Eins', 'Zwei']));
    meldeAenderung();
    await vi.waitFor(() => expect(gehoert).toEqual([['Eins', 'Zwei']]));
    expect((await modul.getWorkflowFolderList()).workflows).toHaveLength(2);
    ab();
    window.api.workflowFolderList = vi.fn(async () => LISTE([]));
    await modul.refreshWorkflowFolderList();
    expect(gehoert).toHaveLength(1);
  });

  it('liefert bei einer Fehl-Antwort eine leere Liste statt eines Wurfs', async () => {
    window.api.workflowFolderList = vi.fn(async () => {
      throw new Error('kein Kanal');
    });
    expect(await modul.getWorkflowFolderList()).toMatchObject({
      ok: false,
      workflows: [],
      items: [],
    });
  });
});
