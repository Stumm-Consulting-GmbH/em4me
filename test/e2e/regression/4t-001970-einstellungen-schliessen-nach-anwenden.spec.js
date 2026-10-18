// 4T-001970 (Epic 3E-000341): Die Einstellungs-Seite übernimmt nach
// «Anwenden» alle Abschnitte, auch wenn sie unmittelbar danach geschlossen
// wird.
//
// **Befund.** In der Windows-Voll-Suite der Release-Strecke vom 2026-09-28
// scheiterte DB-BER-01 unter Last mit einem Programmfehler der Oberfläche
// («Cannot read properties of null (reading 'tasks')», unbehandelte
// Promise-Ablehnung). applySettingsPage übernimmt die Abschnitte nacheinander
// und wartet zwischen ihnen; der Entwurf wurde bei jedem Abschnitt neu aus dem
// Seiten-Zustand gelesen, und der Schließ-Haken setzt ihn auf null. Jeder
// Abschnitt hinter dem ersten Wartepunkt bekam damit null, und die Übernahme
// brach ab — für den Anwender gingen die Änderungen still verloren.
//
// **Deterministisch statt auf Zeit gespielt** (Muster 4t-0701.spec.js): Klick
// auf «Anwenden» und Strg+W liegen im selben synchronen Block von
// page.evaluate. Das Schließen des Reiters wartet selbst nur auf eine
// Rückfrage ohne Hauptprozess und kommt damit vor der ersten Antwort des
// Hauptprozesses auf das Speichern des Abschnitts «Darstellung» an. Der
// Frontmatter-Schalter stellt dort zusätzlich einen eigenen Wartepunkt her;
// der Schalter «Filter ausblenden» liegt im Abschnitt «Aufgaben», weit hinter
// «Darstellung» in der Reihenfolge. Die Rot-Probe gegen die Fassung vor der
// Behebung scheiterte genau am zweiten Abschnitt («Farbschemas»).
//
// Zwei Belege: der gespeicherte Wert der Aufgaben-Einstellung samt Rücklesen
// auf der wieder geöffneten Seite (AK1) und die Konsolen-Prüfung von closeApp
// (AK2), die den Programmfehler sonst als Konsolen-Fund meldet.
'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const SHOW_FRONTMATTER = `${SETTINGS_PAGE} #settings-show-frontmatter`;
const HIDE_FILTER = `${SETTINGS_PAGE} #settings-tasks-hide-filter`;
const NAV_TASKS = `${SETTINGS_PAGE} .settings-nav-entry[data-section-id="tasks"]`;

// Öffnen mit Sichtbarkeits-Poll (Muster 4t-0701.spec.js): Der
// Kommando-Dispatcher steht erst am Ende der asynchronen init().
async function oeffneEinstellungen(page) {
  await expect
    .poll(async () => {
      if (await page.locator(SETTINGS_PAGE).isVisible()) return true;
      await page.keyboard.press('Control+,');
      return page.locator(SETTINGS_PAGE).isVisible();
    })
    .toBe(true);
}

test.describe('4T-001970: Einstellungs-Seite unmittelbar nach Anwenden geschlossen', () => {
  test('alle Abschnitte sind übernommen, ohne Konsolen-Fehler', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await oeffneEinstellungen(page);
      // Abschnitt «Darstellung» (aktiv beim Öffnen): Frontmatter-Anzeige aus.
      await expect(page.locator(SHOW_FRONTMATTER)).toBeChecked();
      await page.locator(SHOW_FRONTMATTER).uncheck();
      // Abschnitt «Aufgaben»: Filter-Text in Anzeigen ausblenden.
      await page.locator(NAV_TASKS).click();
      await expect(page.locator(HIDE_FILTER)).not.toBeChecked();
      await page.locator(HIDE_FILTER).check();

      await page.evaluate(() => {
        document.getElementById('btn-settings-apply').click();
        // Dieselbe Anforderung, die Strg+W auslöst: Der zentrale
        // Kommando-Dispatcher hängt am keydown des Fensters und schließt für
        // tab.close den aktiven Reiter sofort.
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true }),
        );
      });
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();

      // AK1: Die Übernahme ist im Hintergrund vollständig durchgelaufen —
      // auch der Abschnitt «Aufgaben» hinter dem ersten Wartepunkt. Weich
      // geprüft: Ein harter Fehlschlag hier würde vom Konsolen-Fund aus
      // closeApp im finally verdeckt, ein weicher steht schon im Fall-Ergebnis,
      // und closeApp hängt den Konsolen-Fund dann nur an. So bleiben beide
      // Belege sichtbar.
      const weich = expect.configure({ soft: true });
      await weich
        .poll(() => page.evaluate(() => window.api.getSetting('tasksConfig')))
        .toMatchObject({ hideGlobalFilter: true });
      await weich
        .poll(() => page.evaluate(() => window.api.getSetting('render.showFrontmatter')))
        .toBe(false);

      // Rücklesen auf der wieder geöffneten Seite (Muster ES-09).
      await oeffneEinstellungen(page);
      await expect(page.locator(SHOW_FRONTMATTER)).not.toBeChecked();
      await page.locator(NAV_TASKS).click();
      await expect(page.locator(HIDE_FILTER)).toBeChecked();
    } finally {
      // AK2: closeApp wertet die Konsolen-Funde des Laufs aus.
      await closeApp(app, userData);
    }
  });
});
