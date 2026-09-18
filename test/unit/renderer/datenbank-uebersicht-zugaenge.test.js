// @vitest-environment jsdom
// 4T-001759 (Epic 3E-000253, AK4 und AK5): Die beiden Zugänge zur
// Übersichts-Seite und ihre Bedingung.
//
// Drei Aussagen, die auseinanderlaufen können und deshalb an einer Stelle
// geprüft werden:
//
//   1. Das Kommando steht in der Registry, trägt die Bedingung des gebundenen
//      Bereichs und hat einen Ausführungs-Pfad im Dispatcher. Ohne den fiele es
//      aus Kommando-Palette und belegtem Kürzel heraus, obwohl es im Menü steht.
//   2. Der Eintrag im Kontextmenü des Bereichs-Panels erscheint NUR, wo der
//      Bereich eine Datenbank führt — anders als seine beiden Nachbarn, die an
//      einer Erweiterung hängen.
//   3. Solange die Auskunft aussteht, erscheint er nicht. Das ist kein Mangel,
//      sondern die Linie aus 4T-001758: lieber später dazukommen als eine
//      Datenbank behaupten, die noch niemand gesehen hat.
//
// Der Menü-Eintrag im Ansichtsmenü ist hier NICHT gemessen: Er entsteht im
// Haupt-Prozess, und seine Bedingung hält `command-availability.test.js` gegen
// die Basislinie des gemessenen Menüs. Sichtbar gerendert zeigt ihn der
// E2E-Fall.
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';

let antwort = null;
const meldungen = [];
window.api.databaseOverview = async () => antwort;
window.api.onBacklinksInvalidated = (cb) => meldungen.push(cb);
window.api.reportMenuState = () => {};
window.api.reportPanes = () => {};

const helfer = await import('../../../src/renderer/modules/database/datenbank-bereich.js');
const menues = await import('../../../src/renderer/modules/area-panel-menus.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { commandHandlers } = await import('../../../src/renderer/modules/app/app-commands.js');
// 4T-001761 (Epic 3E-000253): Der Schalt-Zustand kommt über den ECHTEN
// Lebenszyklus und nicht über eine Attrappe (Muster memory-page.test.js) — er
// ist genau der Weg, den auch die Einstellungs-Seite geht.
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');

function bereit(istDatenbank) {
  return {
    status: 'ready',
    istDatenbankBereich: istDatenbank,
    steckbrief: istDatenbank ? { name: 'Mini-CRM' } : null,
    tabellen: [],
    hints: [],
  };
}

// Das Kontextmenü der freien Panel-Fläche bauen und seine Einträge auslesen.
function panelMenueEintraege() {
  document.getElementById('context-menu').innerHTML = '';
  menues.showAreaPanelContextMenu({ preventDefault() {}, clientX: 10, clientY: 10 });
  return [...document.getElementById('context-menu').querySelectorAll('.context-menu-item')].map(
    (e) => e.dataset.menuId,
  );
}

beforeEach(() => {
  helfer.verwirfDatenbankAuskunft({ bereichsWechsel: true });
  lebenszyklus.resetExtensionStateForTests();
  state.areaPath = 'C:\\Ablage\\Kunden';
  antwort = bereit(true);
});

describe('Kommando der Übersichts-Seite (4T-001759, AK4)', () => {
  it('steht in der Registry mit Menü-Eintrag und der Bedingung des Bereichs', () => {
    const cmd = COMMANDS.find((c) => c.id === 'database.openOverview');
    expect(cmd).toBeTruthy();
    expect(cmd.menu).toBe(true);
    expect(cmd.availability).toBe('area');
    expect(cmd.labelKey).toBe('menu.view.databaseOverview');
    expect(cmd.descKey).toBe('help.shortcut.databaseOverview');
    expect(cmd.categoryKey).toBe('help.group.view');
    // Ohne Vorbelegung: Das Kürzel bleibt dem Anwender überlassen, wie bei den
    // beiden Nachbar-Seiten.
    expect(cmd.defaultBindings).toEqual([]);
  });

  it('hat einen Ausführungs-Pfad für Palette und belegtes Kürzel', () => {
    expect(typeof commandHandlers['database.openOverview']).toBe('function');
  });
});

describe('Zugang im Kontextmenü des Bereichs-Panels (AK4, AK5)', () => {
  it('erscheint, sobald der Bereich eine Datenbank führt', async () => {
    await helfer.datenbankAuskunft();
    expect(panelMenueEintraege()).toContain('area-panel-database-overview');
  });

  it('fehlt in einem Bereich ohne Datenbank', async () => {
    antwort = bereit(false);
    await helfer.datenbankAuskunft();
    const eintraege = panelMenueEintraege();
    expect(eintraege).not.toContain('area-panel-database-overview');
    // Gegenbeleg: Die Nachbar-Einträge stehen, das Menü ist also gebaut.
    expect(eintraege).toContain('area-panel-stats');
  });

  it('fehlt, solange die Auskunft aussteht', () => {
    expect(panelMenueEintraege()).not.toContain('area-panel-database-overview');
  });

  it('fehlt ohne gebundenen Bereich', async () => {
    await helfer.datenbankAuskunft();
    state.areaPath = null;
    expect(panelMenueEintraege()).toEqual([]);
  });

  it('überlebt eine Index-Meldung, statt bei jedem Speichern zu verschwinden', async () => {
    await helfer.datenbankAuskunft();
    expect(meldungen.length).toBeGreaterThan(0);
    for (const cb of meldungen) cb();
    // Die gehaltene Auskunft ist verworfen, die synchrone Antwort bleibt: Ein
    // Menü-Eintrag, der nach jedem Speichern verschwände, wäre schlechter als
    // einer, der einen Augenblick lang einen alten Stand zeigt.
    expect(panelMenueEintraege()).toContain('area-panel-database-overview');
  });

  it('fällt mit dem Bereichs-Wechsel weg', async () => {
    await helfer.datenbankAuskunft();
    helfer.verwirfDatenbankAuskunft({ bereichsWechsel: true });
    expect(helfer.istDatenbankBereichSofort()).toBe(false);
    expect(panelMenueEintraege()).not.toContain('area-panel-database-overview');
  });
});

// 4T-001761 (Epic 3E-000253, AK4): Derselbe Eintrag im Aus-Zustand der
// Erweiterung. Er trägt seither ZWEI Bedingungen — den Bestand (oben) und den
// Schalter (hier) —, und beide Fälle stehen nebeneinander, weil eine erfüllte
// Bedingung leicht die andere verdeckt.
describe('Zugang im Kontextmenü im Aus-Zustand (4T-001761, AK4)', () => {
  it('entfällt, obwohl der Bereich eine Datenbank führt', async () => {
    await helfer.datenbankAuskunft();
    // Nicht-Vakuitäts-Probe: eingeschaltet steht der Eintrag.
    expect(panelMenueEintraege()).toContain('area-panel-database-overview');

    await lebenszyklus.applyExtensionsState(['database'], { persist: false });
    const eintraege = panelMenueEintraege();
    expect(eintraege).not.toContain('area-panel-database-overview');
    // Gegenbeleg: Die Nachbar-Einträge bleiben, das Menü ist also gebaut und
    // die Datenbank zieht keine andere Funktion mit.
    expect(eintraege).toContain('area-panel-stats');
    expect(eintraege).toContain('area-panel-graph');
  });

  it('entfällt auch transitiv über die Eigenschafts-Profile', async () => {
    await helfer.datenbankAuskunft();
    await lebenszyklus.applyExtensionsState(['property-profiles'], { persist: false });
    expect(panelMenueEintraege()).not.toContain('area-panel-database-overview');
  });

  it('kehrt mit dem Wiedereinschalten zurück', async () => {
    await helfer.datenbankAuskunft();
    await lebenszyklus.applyExtensionsState(['database'], { persist: false });
    await lebenszyklus.applyExtensionsState([], { persist: false });
    expect(panelMenueEintraege()).toContain('area-panel-database-overview');
  });
});
