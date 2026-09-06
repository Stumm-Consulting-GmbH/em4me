// @vitest-environment jsdom
// 4T-001350 (Epic 3E-000170): Der Umbenennen-Weg, adressiert ueber den PFAD.
//
// Geprueft wird die Naht, die dieser Task eingezogen hat, und nur sie: dass
// eine Datei OHNE offenen Reiter vollstaendig durch denselben Weg laeuft
// (AK3) und dass ein geaenderter offener Reiter derselben Datei vorher
// gesichert wird. Was danach kommt — Kollisions-Meldung, Verweis-Nachfuehrung,
// Vorschau — ist unveraenderter Bestand und in den E2E-Pruefungen des
// Menue-Wegs abgesichert; hier stuende es ein zweites Mal.
//
// Der Namens-Dialog ist ersetzt, weil er sonst auf eine Eingabe wartete, die
// in einem Unit-Lauf niemand macht.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';

vi.mock('../../../src/renderer/modules/dialogs/dialogs.js', () => ({
  showNameInputDialog: vi.fn(async () => ({
    value: 'Neuer Name',
    checkboxes: { updateLinks: false, showPreview: false },
  })),
}));

const gesichert = [];
vi.mock('../../../src/renderer/modules/views/save-export.js', () => ({
  saveTab: vi.fn(async (paneIdx, tabIdx) => {
    gesichert.push([paneIdx, tabIdx]);
    return true;
  }),
}));

const { renameFileAtPath } = await import('../../../src/renderer/modules/views/file-actions.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');

const PFAD = 'C:\\Bereich\\Ziel.md';
let aufrufe = [];

beforeEach(() => {
  aufrufe = [];
  gesichert.length = 0;
  window.api.renameFile = async (oldPath, newBasename, updateLinks) => {
    aufrufe.push({ oldPath, newBasename, updateLinks });
    return { ok: true, path: 'C:\\Bereich\\Neuer Name.md', renamedCount: 1, renamed: [] };
  };
  window.api.subpageDescendants = async () => ({ ok: true, files: [] });
  window.api.basename = (p) => String(p).split(/[\\/]/).pop();
  for (const pane of state.panes) pane.tabs.length = 0;
});

describe('renameFileAtPath (4T-001350)', () => {
  it('benennt eine Datei ohne offenen Reiter ueber ihren Pfad um', async () => {
    await renameFileAtPath(PFAD);
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].oldPath).toBe(PFAD);
    expect(aufrufe[0].newBasename).toBe('Neuer Name');
    expect(gesichert).toEqual([]);
  });

  it('sichert einen geaenderten offenen Reiter derselben Datei vorher', async () => {
    state.panes[0].tabs.push({ path: PFAD, dirty: true });
    await renameFileAtPath(PFAD);
    expect(gesichert).toEqual([[0, 0]]);
    expect(aufrufe).toHaveLength(1);
  });

  it('laesst einen ungeaenderten Reiter und fremde Dateien unberuehrt', async () => {
    state.panes[0].tabs.push({ path: PFAD, dirty: false });
    state.panes[0].tabs.push({ path: 'C:\\Bereich\\Andere.md', dirty: true });
    await renameFileAtPath(PFAD);
    expect(gesichert).toEqual([]);
    expect(aufrufe).toHaveLength(1);
  });

  it('ohne Pfad wird nichts umbenannt', async () => {
    await renameFileAtPath('');
    await renameFileAtPath(null);
    expect(aufrufe).toEqual([]);
  });
});
