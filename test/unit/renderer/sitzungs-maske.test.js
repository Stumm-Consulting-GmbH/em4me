// @vitest-environment jsdom
// 4T-002334 (Epic 3E-000264, E29.1 mit S4): Der Sitzungs-Eintrag des
// Masken-Dokuments (`app/sitzungs-maske.js`).
//
// Geprüft am Register mit einer Attrappe der Masken-Seite: Ihr Eintrag liefert
// den Gegenstand eines Zustands-Objekts, ihr Öffner legt den Reiter so an wie
// `openSystemPage` (am Streifen-Ende, aktiv). Gefragt wird, was in den
// Schnappschuss der Spalte geht, wo die Wiederherstellung den Reiter hinstellt,
// welcher Reiter danach aktiv ist und wie sich der ruhende Eintrag verhält.
// Dass die echte Maske nach einem Neustart zurückkommt, prüfen die Ablauf-Fälle
// DB-SIT-01 bis DB-SIT-03 (`datenbank-sitzung.spec.js`).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { registriereSystemSeite, systemTabsFuer, stelleMaskenWieder, uebergibRuhende } =
  await import('../../../src/renderer/modules/app/sitzungs-maske.js');

const SEITE = 'test-maske';
const LIBRARY = '/raum/Library.md';

const datei = (path) => ({ path, groupId: null });
const maskenReiter = () => ({ path: null, systemPage: SEITE, groupId: null });

let gegenstand;
let geoeffnet;
let oeffneVerhalten;

// Die Attrappe öffnet wie openSystemPage: in der aktiven Spalte, am Ende, aktiv.
function oeffneWieSystemSeite(state) {
  return async (eintrag) => {
    geoeffnet.push({ eintrag, spalte: state.activePaneIndex });
    if (oeffneVerhalten === 'aus') return;
    if (oeffneVerhalten === 'wirft') throw new Error('kaputt');
    const pane = state.panes[state.activePaneIndex];
    pane.tabs.push(maskenReiter());
    pane.activeIndex = pane.tabs.length - 1;
    gegenstand = { ...eintrag, neu: false };
  };
}

function registriere(state) {
  registriereSystemSeite(SEITE, {
    eintrag: () =>
      gegenstand && !gegenstand.neu && gegenstand.kennung
        ? { tabelle: gegenstand.tabelle, kennung: gegenstand.kennung, maske: gegenstand.maske }
        : null,
    oeffne: oeffneWieSystemSeite(state),
  });
}

function eintrag(teil = {}) {
  return {
    page: SEITE,
    position: 1,
    aktiv: false,
    tabelle: LIBRARY,
    kennung: 'r-00003',
    maske: null,
    ...teil,
  };
}

beforeEach(() => {
  gegenstand = null;
  geoeffnet = [];
  oeffneVerhalten = 'oeffnet';
});

describe('Eintrag im Schnappschuss', () => {
  it('nennt Position unter den Datei-Reitern, aktiven Reiter und Gegenstand', () => {
    const state = { panes: [], activePaneIndex: 0 };
    registriere(state);
    gegenstand = { tabelle: LIBRARY, kennung: 'r-00003', maske: 'Buch-Maske.md', neu: false };
    const pane = { tabs: [datei('/a.md'), maskenReiter(), datei('/b.md')], activeIndex: 1 };
    expect(systemTabsFuer(pane)).toEqual([
      {
        page: SEITE,
        position: 1,
        aktiv: true,
        tabelle: LIBRARY,
        kennung: 'r-00003',
        maske: 'Buch-Maske.md',
      },
    ]);
    pane.activeIndex = 2;
    expect(systemTabsFuer(pane)[0].aktiv).toBe(false);
  });

  it('eine Neuanlage und ein Gegenstand ohne Kennung werden nicht gesichert', () => {
    const state = { panes: [], activePaneIndex: 0 };
    registriere(state);
    const pane = { tabs: [datei('/a.md'), maskenReiter()], activeIndex: 0 };
    gegenstand = { tabelle: LIBRARY, kennung: 'r-00009', maske: null, neu: true };
    expect(systemTabsFuer(pane)).toEqual([]);
    gegenstand = { tabelle: LIBRARY, kennung: null, maske: null, neu: false };
    expect(systemTabsFuer(pane)).toEqual([]);
  });

  it('ohne System-Seite und für nicht angemeldete Seiten bleibt die Liste leer', () => {
    expect(systemTabsFuer({ tabs: [datei('/a.md')], activeIndex: 0 })).toEqual([]);
    const fremd = { tabs: [{ path: null, systemPage: 'settings' }], activeIndex: 0 };
    expect(systemTabsFuer(fremd)).toEqual([]);
    expect(systemTabsFuer(null)).toEqual([]);
  });
});

describe('Wiederherstellen', () => {
  it('öffnet in der Spalte, stellt an die Position und lässt den aktiven Reiter aktiv', async () => {
    const pane0 = { tabs: [datei('/x.md')], activeIndex: 0 };
    const pane1 = { tabs: [datei('/a.md'), datei('/b.md'), datei('/c.md')], activeIndex: 2 };
    const state = { panes: [pane0, pane1], activePaneIndex: 0 };
    registriere(state);
    await stelleMaskenWieder(1, [eintrag({ position: 1 })], state);
    expect(geoeffnet).toEqual([
      { eintrag: { tabelle: LIBRARY, kennung: 'r-00003', maske: null }, spalte: 1 },
    ]);
    expect(pane1.tabs.map((t) => t.path || t.systemPage)).toEqual([
      '/a.md',
      SEITE,
      '/b.md',
      '/c.md',
    ]);
    expect(pane1.tabs[pane1.activeIndex].path).toBe('/c.md');
    expect(pane1.selection).toEqual([pane1.tabs[pane1.activeIndex]]);
    // Die aktive Spalte ist danach wieder die vorherige.
    expect(state.activePaneIndex).toBe(0);
    // Der nächste Schnappschuss nennt dieselbe Stelle.
    expect(systemTabsFuer(pane1)).toEqual([eintrag({ position: 1 })]);
  });

  it('war die Maske der aktive Reiter, bleibt sie es', async () => {
    const pane = { tabs: [datei('/a.md'), datei('/b.md')], activeIndex: 0 };
    const state = { panes: [pane], activePaneIndex: 0 };
    registriere(state);
    await stelleMaskenWieder(0, [eintrag({ position: 0, aktiv: true })], state);
    expect(pane.tabs.map((t) => t.path || t.systemPage)).toEqual([SEITE, '/a.md', '/b.md']);
    expect(pane.activeIndex).toBe(0);
  });

  it('eine Position hinter dem Streifen stellt die Maske hinter den letzten Datei-Reiter', async () => {
    const pane = { tabs: [datei('/a.md')], activeIndex: 0 };
    const state = { panes: [pane], activePaneIndex: 0 };
    registriere(state);
    await stelleMaskenWieder(0, [eintrag({ position: 7 })], state);
    expect(pane.tabs.map((t) => t.path || t.systemPage)).toEqual(['/a.md', SEITE]);
  });

  it('eine Spalte, die nur die Maske trug, bekommt sie zurück', async () => {
    const pane = { tabs: [], activeIndex: -1 };
    const state = { panes: [{ tabs: [datei('/x.md')], activeIndex: 0 }, pane], activePaneIndex: 0 };
    registriere(state);
    await stelleMaskenWieder(1, [eintrag({ position: 0, aktiv: true })], state);
    expect(pane.tabs.map((t) => t.systemPage)).toEqual([SEITE]);
    expect(pane.activeIndex).toBe(0);
  });

  it('ungültige Einträge und fehlende Listen bleiben ohne Wirkung', async () => {
    const pane = { tabs: [datei('/a.md')], activeIndex: 0 };
    const state = { panes: [pane], activePaneIndex: 0 };
    registriere(state);
    await stelleMaskenWieder(0, undefined, state);
    await stelleMaskenWieder(0, [eintrag({ kennung: '' }), eintrag({ tabelle: 42 }), null], state);
    await stelleMaskenWieder(5, [eintrag()], state);
    expect(geoeffnet).toEqual([]);
    expect(systemTabsFuer(pane)).toEqual([]);
  });
});

describe('Ruhender Eintrag', () => {
  it('öffnet die Seite nicht (Erweiterung aus), ruht der Eintrag und die Datei-Reiter bleiben', async () => {
    const pane = { tabs: [datei('/a.md'), datei('/b.md')], activeIndex: 1 };
    const state = { panes: [pane], activePaneIndex: 0 };
    registriere(state);
    oeffneVerhalten = 'aus';
    await stelleMaskenWieder(0, [eintrag({ position: 1, aktiv: true })], state);
    expect(pane.tabs.map((t) => t.path)).toEqual(['/a.md', '/b.md']);
    expect(pane.activeIndex).toBe(1);
    // Er fließt in jeden folgenden Schnappschuss, nie als aktiver Reiter.
    expect(systemTabsFuer(pane)).toEqual([eintrag({ position: 1, aktiv: false })]);
    expect(systemTabsFuer(pane)).toEqual([eintrag({ position: 1, aktiv: false })]);
  });

  it('ein Fehler beim Öffnen kostet keine Datei-Reiter und lässt den Eintrag ruhen', async () => {
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pane = { tabs: [datei('/a.md')], activeIndex: 0 };
    const state = { panes: [pane], activePaneIndex: 0 };
    registriere(state);
    oeffneVerhalten = 'wirft';
    await stelleMaskenWieder(0, [eintrag({ position: 0 })], state);
    expect(pane.tabs.map((t) => t.path)).toEqual(['/a.md']);
    expect(state.activePaneIndex).toBe(0);
    expect(systemTabsFuer(pane)).toEqual([eintrag({ position: 0 })]);
    expect(warnung).toHaveBeenCalled();
    warnung.mockRestore();
  });

  it('eine nicht angemeldete Seite ruht ebenfalls', async () => {
    const pane = { tabs: [datei('/a.md')], activeIndex: 0 };
    const state = { panes: [pane], activePaneIndex: 0 };
    await stelleMaskenWieder(0, [eintrag({ page: 'unbekannte-seite', position: 0 })], state);
    expect(systemTabsFuer(pane)).toEqual([eintrag({ page: 'unbekannte-seite', position: 0 })]);
  });

  it('entfällt, sobald die Seite in der Spalte offen ist', async () => {
    const pane = { tabs: [datei('/a.md'), datei('/b.md')], activeIndex: 0 };
    const state = { panes: [pane], activePaneIndex: 0 };
    registriere(state);
    oeffneVerhalten = 'aus';
    await stelleMaskenWieder(0, [eintrag({ position: 2 })], state);
    // Die Maske öffnet später in dieser Spalte für einen anderen Datensatz.
    pane.tabs.push(maskenReiter());
    gegenstand = { tabelle: LIBRARY, kennung: 'r-00001', maske: null, neu: false };
    expect(systemTabsFuer(pane)).toEqual([
      eintrag({ position: 2, kennung: 'r-00001', aktiv: false }),
    ]);
    // Nach dem Schließen der Maske kehrt der ruhende Eintrag nicht zurück.
    pane.tabs.pop();
    expect(systemTabsFuer(pane)).toEqual([]);
  });

  it('ist die Seite schon in einer anderen Spalte offen, ruht der Eintrag ohne Öffnen', async () => {
    const pane0 = { tabs: [datei('/x.md'), maskenReiter()], activeIndex: 0 };
    const pane1 = { tabs: [datei('/a.md')], activeIndex: 0 };
    const state = { panes: [pane0, pane1], activePaneIndex: 0 };
    registriere(state);
    await stelleMaskenWieder(1, [eintrag({ position: 0 })], state);
    expect(geoeffnet).toEqual([]);
    expect(pane1.tabs.map((t) => t.path)).toEqual(['/a.md']);
    expect(systemTabsFuer(pane1)).toEqual([eintrag({ position: 0 })]);
  });

  it('hängt an der Spalte, nicht an ihrer Nummer', async () => {
    const leer = { tabs: [], activeIndex: -1 };
    const pane = { tabs: [datei('/a.md')], activeIndex: 0 };
    const state = { panes: [leer, pane], activePaneIndex: 0 };
    registriere(state);
    oeffneVerhalten = 'aus';
    await stelleMaskenWieder(1, [eintrag({ position: 1 })], state);
    // Zusammenlegen wie in restorePanes: die rechte Spalte rückt nach links.
    state.panes = [pane];
    expect(systemTabsFuer(state.panes[0])).toEqual([eintrag({ position: 1 })]);
    expect(systemTabsFuer(leer)).toEqual([]);
  });

  it('wandert mit dem Zusammenlegen in die verbleibende Spalte, hinter ihre Datei-Reiter', async () => {
    // Die rechte Spalte trug nur die Maske; die Erweiterung ist beim Start aus.
    const links = { tabs: [datei('/a.md'), datei('/b.md')], activeIndex: 0 };
    const rechts = { tabs: [], activeIndex: -1 };
    const state = { panes: [links, rechts], activePaneIndex: 0 };
    registriere(state);
    oeffneVerhalten = 'aus';
    await stelleMaskenWieder(1, [eintrag({ position: 0, aktiv: true })], state);
    expect(rechts.tabs).toEqual([]);
    // Zusammenlegen wie in restorePanes: die leere Spalte entfällt.
    uebergibRuhende(rechts, links);
    state.panes.pop();
    expect(systemTabsFuer(links)).toEqual([eintrag({ position: 2, aktiv: false })]);
    expect(systemTabsFuer(rechts)).toEqual([]);
    // Beim nächsten Start mit eingeschalteter Erweiterung kommt sie dort zurück.
    oeffneVerhalten = 'oeffnet';
    const neu = { tabs: [datei('/a.md'), datei('/b.md')], activeIndex: 0 };
    const zweiterStart = { panes: [neu], activePaneIndex: 0 };
    registriere(zweiterStart);
    await stelleMaskenWieder(0, systemTabsFuer(links), zweiterStart);
    expect(neu.tabs.map((t) => t.path || t.systemPage)).toEqual(['/a.md', '/b.md', SEITE]);
    expect(neu.tabs[neu.activeIndex].path).toBe('/a.md');
  });
});
