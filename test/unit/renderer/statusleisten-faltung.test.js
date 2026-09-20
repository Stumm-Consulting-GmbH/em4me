// @vitest-environment jsdom
// 4T-001579 (Epic 3E-000283): Abbau-Reihenfolge der Statusleisten-Faltung.
// 4T-001580 (Epic 3E-000283): Vorgabewert und Werte-Bereich des Falt-Modus
// (zweite Prüfgruppe unten).
//
// Die Reihenfolge, in der Elemente bei knappem Platz ins Pull-up-Menü wandern,
// ist der eine Teil der Mechanik, der ohne Fenster und ohne Breiten-Messung
// entscheidbar ist: Sie hängt allein an den drei Zonen-Listen. Genau deshalb
// steht sie als reine Funktion im Modul und wird hier geprüft — die
// Sichtbarkeits-Wirkung selbst (welches Element bei welcher Breite
// verschwindet) braucht die reale Anordnung und liegt in
// `test/e2e/funktionen/statusleisten-faltung.spec.js`.
//
// Geprüft werden die drei Entscheidungen des Epics, die in der Reihenfolge
// sichtbar werden: E6 (Abbau in umgekehrter Anzeige-Reihenfolge), die
// Zonen-Zuordnung der beiden Menüs (Punkt 3 des Lösungsansatzes) und E3 (die
// mittlere Zone zuletzt, ihre Elemente ins rechte Menü).
//
// Die Elemente sind hier bewusst Zeichenketten und keine DOM-Knoten: Die
// Funktion reicht sie unverändert durch, und ein Test mit echten Knoten würde
// nur den Aufbau des Prüffalls prüfen.
import { describe, it, expect } from 'vitest';
import './api-stub.js';

const {
  abbauReihenfolge,
  STATUSBAR_COLLAPSE_ALWAYS,
  STATUSBAR_COLLAPSE_AUTO,
  STATUSBAR_COLLAPSE_MODES,
  STATUSBAR_COLLAPSE_MODE_KEY,
  getStatusbarCollapseMode,
  initStatusbarCollapseModeFromStore,
  normalisiereFaltModus,
  setStatusbarCollapseMode,
} = await import('../../../src/renderer/modules/statusbar-overflow.js');

// Kurzschreibweise der Erwartung: 'L:a' heißt «Element a wandert ins linke
// Menü».
function kurz(plan) {
  return plan.map((e) => `${e.ziel === 'links' ? 'L' : 'R'}:${e.element}`);
}

describe('Abbau-Reihenfolge der Statusleiste (4T-001579)', () => {
  it('ohne Elemente bleibt der Plan leer', () => {
    expect(abbauReihenfolge({ links: [], mitte: [], rechts: [] })).toEqual([]);
    expect(abbauReihenfolge({})).toEqual([]);
    expect(abbauReihenfolge(null)).toEqual([]);
  });

  it('baut jede Zone von hinten nach vorn ab (E6) und wechselt links/rechts ab', () => {
    const plan = abbauReihenfolge({
      links: ['l1', 'l2', 'l3'],
      mitte: [],
      rechts: ['r1', 'r2', 'r3'],
    });
    expect(kurz(plan)).toEqual(['L:l3', 'R:r3', 'L:l2', 'R:r2', 'L:l1', 'R:r1']);
  });

  it('lässt die längere Seite allein weiterlaufen, wenn die andere erschöpft ist', () => {
    const plan = abbauReihenfolge({ links: ['l1', 'l2', 'l3'], mitte: [], rechts: ['r1'] });
    expect(kurz(plan)).toEqual(['L:l3', 'R:r1', 'L:l2', 'L:l1']);
  });

  it('klappt die mittlere Zone zuletzt zusammen und gibt sie ins rechte Menü (E3)', () => {
    const plan = abbauReihenfolge({
      links: ['l1'],
      mitte: ['m1', 'm2'],
      rechts: ['r1'],
    });
    expect(kurz(plan)).toEqual(['L:l1', 'R:r1', 'R:m2', 'R:m1']);
    // Kein Element der Mitte steht vor einem Element der Seiten.
    const ersteMitte = plan.findIndex((e) => String(e.element).startsWith('m'));
    const letzteSeite = plan.map((e) => String(e.element).startsWith('m')).lastIndexOf(false);
    expect(ersteMitte).toBeGreaterThan(letzteSeite);
  });

  it('enthält jedes Element genau einmal', () => {
    const zonen = { links: ['a', 'b'], mitte: ['c'], rechts: ['d', 'e', 'f'] };
    const plan = abbauReihenfolge(zonen);
    expect(plan).toHaveLength(6);
    expect([...plan.map((e) => e.element)].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('lässt die übergebenen Listen unverändert', () => {
    const zonen = { links: ['l1', 'l2'], mitte: ['m1'], rechts: ['r1'] };
    abbauReihenfolge(zonen);
    expect(zonen).toEqual({ links: ['l1', 'l2'], mitte: ['m1'], rechts: ['r1'] });
  });
});

// 4T-001580 (Epic 3E-000283): Vorgabewert und Werte-Bereich des Falt-Modus.
//
// Der Vorgabewert (AK2) ist die eine Zusicherung der Einstellung, die ohne
// Fenster und ohne Einstellungs-Seite entscheidbar ist: Sie hängt allein am
// Laufzeit-Zustand des Moduls und an der Rückfall-Regel. Die sichtbare Wirkung
// beider Werte prüfen SF-11 bis SF-13 in
// `test/e2e/funktionen/statusleisten-faltung.spec.js`.
describe('Falt-Modus der Statusleiste (4T-001580)', () => {
  it('kennt genau die zwei Werte des Epics — kein «nie»', () => {
    expect(STATUSBAR_COLLAPSE_MODES).toEqual([STATUSBAR_COLLAPSE_AUTO, STATUSBAR_COLLAPSE_ALWAYS]);
    expect(STATUSBAR_COLLAPSE_AUTO).toBe('auto');
    expect(STATUSBAR_COLLAPSE_ALWAYS).toBe('always');
    expect(STATUSBAR_COLLAPSE_MODE_KEY).toBe('statusbar.collapseMode');
  });

  it('gilt vor dem Laden des Speichers als «automatisch» (AK2)', () => {
    expect(getStatusbarCollapseMode()).toBe(STATUSBAR_COLLAPSE_AUTO);
  });

  it('bleibt bei leerem Speicher auf «automatisch» (AK2)', async () => {
    // Der Stub liefert für jeden Schlüssel `undefined` — das ist der
    // unberührte Auslieferungs-Zustand.
    expect(await initStatusbarCollapseModeFromStore()).toBe(STATUSBAR_COLLAPSE_AUTO);
    expect(getStatusbarCollapseMode()).toBe(STATUSBAR_COLLAPSE_AUTO);
  });

  it('fällt für jeden Wert außer «always» auf die Vorgabe zurück', () => {
    expect(normalisiereFaltModus('always')).toBe(STATUSBAR_COLLAPSE_ALWAYS);
    for (const wert of ['auto', 'nie', 'never', '', null, undefined, 0, 1, {}, ['always']]) {
      expect(normalisiereFaltModus(wert), `Wert ${JSON.stringify(wert)}`).toBe(
        STATUSBAR_COLLAPSE_AUTO,
      );
    }
  });

  it('übernimmt einen gesetzten Wert, persistiert ihn und normalisiert Unfug', async () => {
    const geschrieben = [];
    const vorher = window.api.setSetting;
    window.api.setSetting = async (key, value) => {
      geschrieben.push([key, value]);
    };
    try {
      expect(await setStatusbarCollapseMode('always')).toBe(STATUSBAR_COLLAPSE_ALWAYS);
      expect(getStatusbarCollapseMode()).toBe(STATUSBAR_COLLAPSE_ALWAYS);
      expect(geschrieben).toEqual([[STATUSBAR_COLLAPSE_MODE_KEY, STATUSBAR_COLLAPSE_ALWAYS]]);
      // Ein unveränderter Modus ist ein No-op und schreibt nicht erneut.
      await setStatusbarCollapseMode('always');
      expect(geschrieben).toHaveLength(1);
      // Ein unbrauchbarer Wert landet auf der Vorgabe, nicht im Nirgendwo.
      expect(await setStatusbarCollapseMode('nie')).toBe(STATUSBAR_COLLAPSE_AUTO);
      expect(geschrieben[1]).toEqual([STATUSBAR_COLLAPSE_MODE_KEY, STATUSBAR_COLLAPSE_AUTO]);
      // Und `persist: false` (Empfang des Fenster-Broadcasts) schreibt nicht.
      await setStatusbarCollapseMode('always', { persist: false });
      expect(getStatusbarCollapseMode()).toBe(STATUSBAR_COLLAPSE_ALWAYS);
      expect(geschrieben).toHaveLength(2);
    } finally {
      window.api.setSetting = vorher;
      await setStatusbarCollapseMode(STATUSBAR_COLLAPSE_AUTO, { persist: false });
    }
  });
});
