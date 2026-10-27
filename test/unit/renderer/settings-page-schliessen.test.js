// @vitest-environment jsdom
// 4T-001970 (Epic 3E-000341): Schließen der Einstellungs-Seite während der
// Übernahme. Abgetrennt aus settings-page.test.js mit 4T-002355 (Epic
// 3E-000184), als jene Datei das Zeilen-Budget der Prüfdateien erreichte; Inhalt
// unverändert, Aufbau (Brücken-Attrappe, Öffnen der Seite) wie dort.
import { describe, it, expect } from 'vitest';
import './api-stub.js';

const settingsPage = await import('../../../src/renderer/modules/settings/settings-page.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');

// Seiten-Lebenszyklus wie beim echten Öffnen: onOpen baut den frischen
// Entwurf (4T-000279), mount montiert das DOM.
function mountPage() {
  const pageDef = systemPages.systemPageById(settingsPage.SETTINGS_PAGE_ID);
  pageDef.onOpen();
  const container = document.createElement('div');
  document.body.appendChild(container);
  pageDef.mount(container);
  return container;
}

// 4T-001970 (Epic 3E-000341, Story 4S-000436 AK4): Die Seite wird geschlossen,
// während die Übernahme noch auf das Speichern wartet. Das Speichern ist hier
// zurückgehalten, bis der Fall es freigibt; das Schließen liegt damit sicher
// zwischen dem Start der Übernahme und ihrer ersten Fortsetzung. Der
// Ablauf-Fall test/e2e/regression/4t-001970-*.spec.js belegt dasselbe an der
// gebauten Oberfläche mit Strg+W.
const tasksModul = await import('../../../src/renderer/modules/tasks.js');
const farbModul = await import('../../../src/renderer/modules/color-schemes.js');

describe('Schließen während der Übernahme (4T-001970, Epic 3E-000341)', () => {
  const seite = () => systemPages.systemPageById(settingsPage.SETTINGS_PAGE_ID);
  const zustand = () => settingsPage.settingsPageStateForTests();
  const takt = () => new Promise((resolve) => setTimeout(resolve, 0));

  // Hält jeden Speicher-Aufruf an den Hauptprozess zurück. freigebenBis gibt
  // die wartenden Aufrufe frei, bis der übergebene Lauf beendet ist.
  function halteSpeichernZurueck() {
    const original = window.api.setSetting;
    const wartend = [];
    const geschrieben = [];
    window.api.setSetting = (key, value) =>
      new Promise((resolve) => wartend.push(() => resolve(geschrieben.push([key, value]))));
    return {
      geschrieben,
      async freigebenBis(lauf) {
        let fertig = false;
        const ende = () => (fertig = true);
        lauf.then(ende, ende);
        for (let runde = 0; !fertig; runde++) {
          if (runde > 500) throw new Error('Übernahme endet nicht');
          while (wartend.length > 0) wartend.shift()();
          await takt();
        }
        await takt();
      },
      zurueck: () => (window.api.setSetting = original),
    };
  }

  // Seite öffnen und die Nachlade-Strecke abwarten: Mit geladener Darstellung
  // wartet schon der erste Abschnitt auf das Speichern.
  async function oeffne() {
    const container = mountPage();
    await takt();
    return container;
  }

  it('Anwenden übernimmt auch die Abschnitte hinter dem ersten Wartepunkt', async () => {
    document.body.innerHTML = '';
    await oeffne();
    const vorher = tasksModul.tasksConfig.hideGlobalFilter;
    zustand().draft.tasks.hideGlobalFilter = !vorher;
    const speicher = halteSpeichernZurueck();
    try {
      const lauf = settingsPage.applySettingsPage();
      seite().onClose();
      expect(zustand().draft).toBe(null);
      await speicher.freigebenBis(lauf);
      expect(await lauf).toBe(true);
      expect(tasksModul.tasksConfig.hideGlobalFilter).toBe(!vorher);
      const aufgaben = speicher.geschrieben.filter(([key]) => key === 'tasksConfig');
      expect(aufgaben.at(-1)[1].hideGlobalFilter).toBe(!vorher);
    } finally {
      speicher.zurueck();
      tasksModul.applyTasksConfig({ ...tasksModul.tasksConfig, hideGlobalFilter: vorher });
    }
  });

  it('das Zurücksetzen der Vorschau wartet auf das Ende der Übernahme', async () => {
    document.body.innerHTML = '';
    await oeffne();
    const ausgang = structuredClone(farbModul.getColorSchemeState());
    const ziel = ausgang.activeLight === 'sepia-light' ? 'standard-light' : 'sepia-light';
    const draft = zustand().draft;
    draft.colorSchemes = { ...draft.colorSchemes, activeLight: ziel };
    farbModul.setColorSchemeState(draft.colorSchemes); // Live-Vorschau
    const speicher = halteSpeichernZurueck();
    try {
      const lauf = settingsPage.applySettingsPage();
      seite().onClose();
      // Während des Speicherns bleibt die Vorschau stehen ...
      expect(farbModul.getColorSchemeState().activeLight).toBe(ziel);
      await speicher.freigebenBis(lauf);
      // ... und danach ist das Zurücksetzen wirkungslos: Der Vergleichsstand
      // trägt inzwischen den gespeicherten Stand.
      expect(farbModul.getColorSchemeState().activeLight).toBe(ziel);
      expect(speicher.geschrieben.some(([key]) => key === 'colorSchemes')).toBe(true);
    } finally {
      speicher.zurueck();
      farbModul.setColorSchemeState(ausgang);
    }
  });

  it('eine währenddessen neu geöffnete, unberührte Seite baut ihren Entwurf danach neu auf', async () => {
    document.body.innerHTML = '';
    await oeffne();
    const vorher = tasksModul.tasksConfig.hideGlobalFilter;
    zustand().draft.tasks.hideGlobalFilter = !vorher;
    const speicher = halteSpeichernZurueck();
    try {
      const lauf = settingsPage.applySettingsPage();
      seite().onClose();
      document.body.innerHTML = '';
      mountPage();
      // Der neue Entwurf entsteht aus dem Laufzeit-Zustand vor der Übernahme.
      const neu = zustand().draft;
      expect(neu.tasks.hideGlobalFilter).toBe(vorher);
      await speicher.freigebenBis(lauf);
      expect(zustand().draft).not.toBe(neu);
      expect(zustand().draft.tasks.hideGlobalFilter).toBe(!vorher);
      expect(settingsPage.isSettingsPageDirty()).toBe(false);
    } finally {
      speicher.zurueck();
      seite().onClose();
      tasksModul.applyTasksConfig({ ...tasksModul.tasksConfig, hideGlobalFilter: vorher });
    }
  });

  it('eine währenddessen neu geöffnete, schon geänderte Seite behält ihren Entwurf', async () => {
    document.body.innerHTML = '';
    await oeffne();
    const vorher = tasksModul.tasksConfig.hideGlobalFilter;
    zustand().draft.tasks.hideGlobalFilter = !vorher;
    const speicher = halteSpeichernZurueck();
    try {
      const lauf = settingsPage.applySettingsPage();
      seite().onClose();
      document.body.innerHTML = '';
      const container = mountPage();
      const neu = zustand().draft;
      const schalter = container.querySelector('#settings-show-frontmatter');
      schalter.checked = !schalter.checked;
      schalter.dispatchEvent(new Event('change', { bubbles: true }));
      await speicher.freigebenBis(lauf);
      // Die Eingabe des Anwenders geht vor; verworfen wird nichts.
      expect(zustand().draft).toBe(neu);
      expect(neu.showFrontmatter).toBe(schalter.checked);
    } finally {
      speicher.zurueck();
      seite().onClose();
      tasksModul.applyTasksConfig({ ...tasksModul.tasksConfig, hideGlobalFilter: vorher });
    }
  });
});
