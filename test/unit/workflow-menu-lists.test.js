// 4T-002355 (Epic 3E-000184): Der Zwischenstand der Workflow-Liste je Fenster
// für das Untermenü «Datei → Workflows» (Task AK4, Story 4S-001109 AK6).
//
// Geprüft wird, wann die Liste gelesen und das Menü neu gebaut wird: beim ersten
// Aufbau, bei jeder Meldung des Dienstes, bei jeder Abfrage des Fensters — und
// nur, wenn sich die Liste geändert hat.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWorkflowMenuLists } = require('../../src/main/workflows/workflow-menu-lists.js');

function fenster(id) {
  const haken = [];
  return {
    zerstoert: false,
    isDestroyed() {
      return this.zerstoert;
    },
    webContents: { id, once: (ereignis, fn) => haken.push([ereignis, fn]) },
    zerstoere() {
      this.zerstoert = true;
      for (const [ereignis, fn] of haken) if (ereignis === 'destroyed') fn();
    },
  };
}

function welt() {
  const listen = new Map(); // Fenster-Kennung -> nächste Antwort
  const zuhoerer = [];
  const gelesen = [];
  const dienst = {
    folderListFor: async (win) => {
      gelesen.push(win.webContents.id);
      return listen.get(win.webContents.id);
    },
    onChange: (cb) => zuhoerer.push(cb),
  };
  const a = fenster(1);
  const b = fenster(2);
  const windows = new Map([
    [1, a],
    [2, b],
  ]);
  const gebaut = [];
  const lists = createWorkflowMenuLists({
    dienst,
    windows,
    applyMenuToWindow: (win) => gebaut.push(win.webContents.id),
  });
  const melde = (ids) => zuhoerer.forEach((cb) => cb(ids));
  return { lists, listen, gelesen, gebaut, melde, a, b };
}

const warte = () => new Promise((r) => setTimeout(r, 0));
const liste = (namen) => ({ ok: true, enabled: true, items: namen.map((name) => ({ name })) });

describe('Liste je Fenster für den Menü-Aufbau', () => {
  it('fehlt beim ersten Aufbau, wird gelesen und baut das Menü dieses Fensters neu', async () => {
    const w = welt();
    w.listen.set(1, liste(['A']));
    expect(w.lists.listFor(1)).toBeNull();
    await warte();
    expect(w.gelesen).toEqual([1]);
    expect(w.gebaut).toEqual([1]);
    expect(w.lists.listFor(1)).toEqual(liste(['A']));
    // Ein zweiter Aufbau liest nicht noch einmal.
    expect(w.gelesen).toEqual([1]);
  });

  it('liest während eines laufenden Lesens kein zweites Mal', async () => {
    const w = welt();
    w.listen.set(1, liste(['A']));
    w.lists.listFor(1);
    w.lists.listFor(1);
    await warte();
    expect(w.gelesen).toEqual([1]);
  });

  it('liest nach einer Meldung des Dienstes neu und baut nur bei Änderung neu', async () => {
    const w = welt();
    w.listen.set(1, liste(['A']));
    w.listen.set(2, liste([]));
    w.lists.listFor(1);
    w.lists.listFor(2);
    await warte();
    w.gebaut.length = 0;
    // Anlegen einer Datei im Ordner von Fenster 1; Fenster 2 unverändert.
    w.listen.set(1, liste(['A', 'B']));
    w.melde([1, 2]);
    await warte();
    expect(w.gebaut).toEqual([1]);
    expect(w.lists.listFor(1)).toEqual(liste(['A', 'B']));
  });

  it('übernimmt die Antwort einer Abfrage des Fensters (merke), etwa nach einem Bereichs-Wechsel', () => {
    const w = welt();
    w.lists.merke(w.a, liste(['X']));
    expect(w.gebaut).toEqual([1]);
    w.lists.merke(w.a, liste(['X']));
    expect(w.gebaut).toEqual([1]);
    expect(w.lists.listFor(1)).toEqual(liste(['X']));
    expect(w.gelesen).toEqual([]);
  });

  it('vergisst die Liste eines geschlossenen Fensters und übergeht es bei Meldungen', async () => {
    const w = welt();
    w.lists.merke(w.a, liste(['X']));
    w.a.zerstoere();
    w.melde([1]);
    await warte();
    expect(w.gelesen).toEqual([]);
    expect(w.lists.listFor(1)).toBeNull();
  });

  it('ein fehlgeschlagenes Lesen hinterlässt keinen Stand und baut nichts', async () => {
    const w = welt();
    w.listen.set(1, undefined);
    expect(w.lists.listFor(1)).toBeNull();
    await warte();
    expect(w.gebaut).toEqual([]);
  });
});
