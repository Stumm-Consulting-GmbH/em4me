// @vitest-environment jsdom
// 4T-002544 (Epic 3E-000368): Die Rückfragen des Prüfers nach Tabellen und
// Feldern auf der Seite des Fensters
// (src/renderer/modules/workflows/workflow-db-rueckfrage.js).
//
// Geprüft wird das Muster der Workflow-Namen: ohne Auskunft keine Antwort (die
// Prüfung entfällt), nach der Auskunft die Antworten der Attrappe, ein Neu-
// Rechnen der Kopfzeilen bei neuer Auskunft und das Nachholen nach einer
// Index-Meldung.
//
// Review-Runde 1 zu 3E-000368: Jeder Fall lädt die Module frisch
// (`vi.resetModules`, Muster `workflow-folder-list.test.js`), mit frischen
// Attrappen, und stellt seinen Ausgangszustand selbst her (Stabilitätsregel 1
// in test/README.md).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';

const ansichten = vi.hoisted(() => []);
vi.mock('../../../src/renderer/modules/editor/editor.js', () => ({ paneEditors: ansichten }));

const BIBLIOTHEK = {
  ok: true,
  enabled: true,
  tables: [{ name: 'Library', path: 'Library.md', fields: ['title', 'pages'] }],
  queries: [],
};

let antwort;
let meldeIndex;
let modul;
let pruefung;

const warte = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  vi.resetModules();
  ansichten.length = 0;
  ansichten.push({ dispatch: vi.fn() });
  antwort = BIBLIOTHEK;
  meldeIndex = null;
  window.api.workflowDbCatalog = vi.fn(async () => antwort);
  window.api.onBacklinksInvalidated = (cb) => {
    meldeIndex = cb;
  };
  modul = await import('../../../src/renderer/modules/workflows/workflow-db-rueckfrage.js');
  pruefung = await import('../../../src/renderer/modules/workflows/workflow-pruefung.js');
  modul.initWorkflowDbRueckfrage();
});

// Die erste Auskunft holen und abwarten.
async function ersteAuskunft() {
  modul.dbTableRueckfrage('Library');
  await warte();
}

describe('Rückfragen nach Tabellen und Feldern', () => {
  it('meldet sich an, antwortet ohne Auskunft mit null und danach aus der Auskunft', async () => {
    expect(pruefung.aktuelleRueckfragen().dbTable).toBe(modul.dbTableRueckfrage);
    expect(pruefung.aktuelleRueckfragen().dbQuery).toBe(modul.dbQueryRueckfrage);
    expect(modul.dbTableRueckfrage('Library')).toBeNull();
    await warte();
    expect(modul.dbTableRueckfrage('Library')).toEqual({
      state: 'known',
      name: 'Library',
      path: 'Library.md',
      fields: ['title', 'pages'],
    });
    expect(modul.dbQueryRueckfrage('Q.md')).toEqual({ state: 'missing' });
    // Neue Auskunft: Die Kopfzeilen rechnen neu.
    expect(ansichten[0].dispatch).toHaveBeenCalledTimes(1);
    expect(window.api.workflowDbCatalog).toHaveBeenCalledTimes(1);
  });

  it('holt nach einer Index-Meldung neu und schweigt bei gleicher Auskunft', async () => {
    await ersteAuskunft();
    expect(window.api.workflowDbCatalog).toHaveBeenCalledTimes(1);
    expect(ansichten[0].dispatch).toHaveBeenCalledTimes(1);
    meldeIndex();
    modul.dbTableRueckfrage('Library');
    await warte();
    expect(window.api.workflowDbCatalog).toHaveBeenCalledTimes(2);
    expect(ansichten[0].dispatch).toHaveBeenCalledTimes(1);
  });

  it('verwirft die Auskunft bei ausgeschalteter Datenbank', async () => {
    await ersteAuskunft();
    expect(modul.dbTableRueckfrage('Library')).not.toBeNull();
    antwort = { ok: true, enabled: false, tables: [], queries: [] };
    meldeIndex();
    modul.dbTableRueckfrage('Library');
    await warte();
    expect(modul.dbTableRueckfrage('Library')).toBeNull();
    expect(ansichten[0].dispatch).toHaveBeenCalledTimes(2);
  });
});
