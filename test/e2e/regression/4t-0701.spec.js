// 4T-0701 (Epic 3E-0161): Der OK-Zyklus der Einstellungs-Seite darf keine
// Seite schliessen, die waehrend des Anwendens erneut angefordert wurde.
//
// Gemeldeter Ablauf (Fall KS-01 der Kalender-Spec, ueber Wochen intermittierend
// rot): die Seite mit OK schliessen und SOFORT wieder oeffnen, ohne dazwischen
// zu warten. okSettingsPage wartet auf applySettingsPage() und schliesst erst
// danach; der Klick kehrt bereits waehrend dieses Wartens zurueck. Die
// Oeffnungs-Anforderung fiel damit in das offene Fenster, und die verspaetete
// Fortsetzung schloss die Seite, die der Nutzer gerade angefordert hatte:
// Spalte 0 wurde leer, die view-system-Ansicht fiel weg, und die
// Navigations-Eintraege blieben als unsichtbares DOM stehen (Fehlerbild
// «element is not visible» bei aufgeloestem Locator).
//
// Der Ablauf ist hier deterministisch erzwungen statt auf Zeit gespielt: Klick
// und Oeffnungs-Anforderung liegen im selben synchronen Block. Die Anforderung
// kommt damit IMMER vor der Fortsetzung des OK-Zyklus an, denn die Fortsetzung
// hinter einem await laeuft fruehestens im naechsten Microtask.
'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const APPLY = `${SETTINGS_PAGE} #btn-settings-apply`;
const OK = `${SETTINGS_PAGE} #btn-settings-ok`;
const SHOW_FRONTMATTER = `${SETTINGS_PAGE} #settings-show-frontmatter`;

// Oeffnen mit Sichtbarkeits-Poll: der Kommando-Dispatcher steht erst am Ende
// der asynchronen init() (Stabilitaetsregel 13; Tastendruck nur, solange die
// Seite verborgen ist).
async function oeffneEinstellungen(page) {
  await expect
    .poll(async () => {
      if (await page.locator(SETTINGS_PAGE).isVisible()) return true;
      await page.keyboard.press('Control+,');
      return page.locator(SETTINGS_PAGE).isVisible();
    })
    .toBe(true);
}

// Eine ungesicherte Aenderung setzen. Sie ist die Voraussetzung des
// Fortschritts-Belegs weiter unten: Nur mit ihr steht «Anwenden» vor dem
// OK-Klick auf aktiv, und der Wechsel auf inaktiv belegt danach, dass
// applySettingsPage vollstaendig durchgelaufen ist (refreshSettingsButtons ist
// dort die letzte Anweisung, unmittelbar vor der Schliess-Entscheidung).
async function setzeAenderung(page) {
  await page.locator(SHOW_FRONTMATTER).click();
  await expect(page.locator(APPLY)).toBeEnabled();
}

test.describe('4T-0701: OK-Zyklus der Einstellungs-Seite und Sofort-Wiederoeffnen', () => {
  test('waehrend des Anwendens erneut angefordert: die Seite bleibt offen', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await oeffneEinstellungen(page);
      await setzeAenderung(page);

      await page.evaluate(() => {
        document.getElementById('btn-settings-ok').click();
        // Dieselbe Anforderung, die Strg+, ausloest: der zentrale
        // Kommando-Dispatcher haengt am keydown des Fensters und ruft fuer
        // app.openSettings openSettingsPage() auf.
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true }),
        );
      });

      // Der OK-Zyklus ist vollstaendig durch (siehe setzeAenderung).
      await expect(page.locator(APPLY)).toBeDisabled();
      // Die angeforderte Seite ist offen — und Spalte 0 hat ihren Reiter
      // behalten. Ohne den Fix ist beides verloren: kein Reiter, kein
      // sichtbares Seiten-DOM.
      await expect(page.locator(SETTINGS_PAGE)).toBeVisible();
      await expect(page.locator(SEL.pane(0).tabs)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
    }
  });

  // Gegenprobe: Die Absicherung darf den Normalfall nicht aushebeln — ohne
  // zwischenzeitliche Anforderung schliesst OK die Seite wie bisher.
  test('ohne Wiederoeffnen schliesst OK die Seite', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await oeffneEinstellungen(page);
      await setzeAenderung(page);
      await page.locator(OK).click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
      await expect(page.locator(SEL.pane(0).tabs)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});
