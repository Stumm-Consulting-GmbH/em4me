// 4T-000295 (Epic 3E-000052): E2E-Funktions-Suite — Erweiterungs-System
// (EW-01 bis EW-03). Deckt den Bereich „Erweiterungen" der Einstellungs-
// Seite (Schalten mit sofortiger Wirkung und Persistenz), die dynamischen
// erweiterungs-eigenen Bereiche (Task-Status verschwindet und kehrt
// zurueck, Rueckfall auf den Bereich Erweiterungen) und die UI-Konsistenz
// beim Abschalten (Panel, Statusbar-Button, gefiltertes Kommando) ab.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { oeffneEinstellungsSeite } = require('../helpers/eingabe');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'erweiterungen.md');

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

async function openSettingsPageViaKeyboard(page) {
  await oeffneEinstellungsSeite(page);
}

async function openExtensionsSection(page) {
  await openSettingsPageViaKeyboard(page);
  await page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="extensions"]`).click();
  await expect(page.locator('#settings-extensions-list')).toBeVisible();
}

// OK klicken und den Abschluss abwarten: okSettingsPage schließt den Tab erst,
// wenn alle Bereiche angewandt UND persistiert sind. Die sichtbare Wirkung im
// Dokument tritt früher ein — wer nur darauf wartet und die App danach hart
// beendet (closeApp force), schneidet den Store-Schreibvorgang ab und liest
// nach dem Neustart den alten Wert.
async function confirmSettings(page) {
  await page.locator('#btn-settings-ok').click();
  await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
}

test.describe('EW-01: Erweiterung schalten wirkt sofort und persistiert', () => {
  test('KaTeX abschalten macht $…$ zu Klartext, Zustand überlebt den Neustart', async () => {
    const first = await launchApp({ args: [FIXTURE] });
    const userData = first.userData;
    try {
      const { page } = first;
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      const katex = page.locator(`${SEL.markdownBody0} .katex`);
      await expect(katex.first()).toBeVisible();

      await openExtensionsSection(page);
      await page.locator('#settings-extension-katex').uncheck();
      await confirmSettings(page);
      await expect(page.locator(`${SEL.markdownBody0} .katex`)).toHaveCount(0);
      await expect(page.locator(SEL.markdownBody0)).toContainText('$x^2$');

      // Wieder einschalten stellt das Rendering her.
      await openExtensionsSection(page);
      await expect(page.locator('#settings-extension-katex')).not.toBeChecked();
      await page.locator('#settings-extension-katex').check();
      await confirmSettings(page);
      await expect(page.locator(`${SEL.markdownBody0} .katex`).first()).toBeVisible();

      // Für den Persistenz-Teil erneut abschalten.
      await openExtensionsSection(page);
      await page.locator('#settings-extension-katex').uncheck();
      await confirmSettings(page);
      await expect(page.locator(`${SEL.markdownBody0} .katex`)).toHaveCount(0);
    } finally {
      await closeApp(first.app, null, { force: true });
    }
    // Neustart mit demselben Profil: KaTeX bleibt aus.
    const second = await launchApp({ args: [FIXTURE], userData });
    try {
      await expect(second.page.locator(SEL.tabs0).first()).toBeVisible();
      await expect(second.page.locator(`${SEL.markdownBody0} h1`)).toBeVisible();
      await expect(second.page.locator(`${SEL.markdownBody0} .katex`)).toHaveCount(0);
    } finally {
      await closeApp(second.app, userData, { force: true });
    }
  });
});

test.describe('EW-02: erweiterungs-eigener Bereich erscheint und verschwindet', () => {
  test('Task-Status-Bereich fällt mit der Erweiterung weg, offener Bereich fällt zurück', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openSettingsPageViaKeyboard(page);
      const taskStatesNav = page.locator(
        `${SETTINGS_PAGE} .settings-nav-entry[data-section-id="taskStates"]`,
      );
      await expect(taskStatesNav).toHaveCount(1);
      await taskStatesNav.click();
      await expect(page.locator('#settings-task-states-list')).toBeVisible();

      // Deaktivierung über den Broadcast-Pfad (wie aus einem anderen
      // Fenster): der offene Bereich verschwindet, die Seite fällt auf
      // den Bereich Erweiterungen zurück.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', ['task-states']));
      await expect(taskStatesNav).toHaveCount(0);
      await expect(
        page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="extensions"]`),
      ).toHaveClass(/active/);
      await expect(page.locator('#settings-extensions-list')).toBeVisible();

      // Wiedereinschalten bringt den Bereich zurück; die persistierten
      // Task-Status-Werte sind unangetastet.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', []));
      await expect(taskStatesNav).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('EW-03: Abschalten nimmt Panel, Button und Kommando sauber mit', () => {
  test('Tags aus: Panel und Statusbar-Button weg, Kürzel wirkungslos; Preference kehrt zurück', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      const tagsSection = page.locator('.pane-group[data-pane="0"] .sidebar-tags');
      const btnTags = page.locator('#btn-tags');
      // Panel einschalten (Preference wird persistiert).
      await btnTags.click();
      await expect(tagsSection).toBeVisible();

      await openExtensionsSection(page);
      await page.locator('#settings-extension-tags').uncheck();
      await confirmSettings(page);
      await expect(tagsSection).toBeHidden();
      await expect(btnTags).toBeHidden();
      // Gefiltertes Kommando: das Kürzel togglet nichts mehr.
      await page.keyboard.press('Control+Shift+T');
      await expect(tagsSection).toBeHidden();

      // Wiedereinschalten: Button kehrt zurück, die Sichtbarkeits-
      // Preference greift wieder (Panel erscheint ohne erneuten Toggle).
      await openExtensionsSection(page);
      await page.locator('#settings-extension-tags').check();
      await confirmSettings(page);
      await expect(btnTags).toBeVisible();
      await expect(tagsSection).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-001877 (Epic 3E-000187, Story 4S-000991): Abhaengigkeits-Schutz. Bis dahin
// pruefte EW-04 die umgekehrte Wirkung — Voraussetzung abschalten, Abhaengige
// wird gesperrt. Genau das ist abgeloest: Die Voraussetzung laesst sich nicht
// mehr abschalten, solange eine Abhaengige laeuft. Der Fall prueft deshalb die
// Sperre, die Einblendung mit den Anzeige-Namen der Abhaengigen (hier zwei in
// einem Satz) und die Freigabe nach dem Abwaehlen der letzten Abhaengigen.
test.describe('EW-04: Abhängigkeits-Schutz property-profiles ← events/database (4T-001877)', () => {
  test('gesperrter Schalter, Einblendung mit beiden Namen, Freigabe nach dem Abwählen', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openExtensionsSection(page);
      const baseRow = page.locator(
        '.settings-extension-row[data-extension-id="property-profiles"]',
      );
      const baseToggle = page.locator('#settings-extension-property-profiles');
      const requiredHint = baseRow.locator('.settings-extension-required-hint');

      // Ohne jeden Versuch erkennbar: gesperrter Schalter und ein Hinweis,
      // der beide Abhängigen mit ihrem Anzeige-Namen nennt.
      await expect(baseToggle).toBeChecked();
      await expect(baseToggle).toBeDisabled();
      await expect(requiredHint).toBeVisible();
      await expect(requiredHint).toContainText('Ereignisse');
      await expect(requiredHint).toContainText('Datenbank');

      // Der Versuch blendet denselben Sachverhalt in der Statusleiste ein und
      // lässt den Schalter unberührt; ein zweiter Versuch blendet erneut ein.
      const statusHint = page.locator('#statusbar-hint');
      await baseRow.click();
      await expect(statusHint).toHaveClass(/visible/);
      await expect(statusHint).toContainText('Ereignisse');
      await expect(statusHint).toContainText('Datenbank');
      await expect(baseToggle).toBeChecked();
      // Die Einblendung verschwindet von selbst (Vorgabe drei Sekunden); erst
      // danach belegt der zweite Versuch, dass er erneut einblendet.
      await expect(statusHint).not.toHaveClass(/visible/, { timeout: 15000 });
      await baseRow.click();
      await expect(statusHint).toHaveClass(/visible/);
      await expect(baseToggle).toBeChecked();

      // Erst die letzte abgewählte Abhängige gibt die Grundlage frei.
      await page.locator('#settings-extension-events').uncheck();
      await expect(baseToggle).toBeDisabled();
      await page.locator('#settings-extension-database').uncheck();
      await expect(baseToggle).toBeEnabled();
      await baseToggle.uncheck();
      await expect(baseToggle).not.toBeChecked();
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-001877 (Epic 3E-000187): der mitgebrachte Schalter-Stand. Er kann aus der
// Zeit vor der Umstellung oder aus einer eingespielten Einrichtung stammen:
// Grundlage abgeschaltet, Abhaengige als eingeschaltet gespeichert. Er wirkt
// unverändert weiter, nichts wird selbsttaetig umgeschaltet, und die Grundlage
// laesst sich jederzeit wieder einschalten.
test.describe('EW-05: mitgebrachter Stand mit abgeschalteter Grundlage (4T-001877)', () => {
  test('Abhängige wirkt als abgeschaltet und wird als solche ausgewiesen', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await page.evaluate(() =>
        window.api.setSetting('extensions.disabled', ['property-profiles']),
      );
      await openExtensionsSection(page);
      const eventsToggle = page.locator('#settings-extension-events');
      const eventsHint = page.locator(
        '.settings-extension-row[data-extension-id="events"] .settings-extension-dependency-hint',
      );
      await expect(eventsToggle).not.toBeChecked();
      await expect(eventsToggle).toBeDisabled();
      await expect(eventsHint).toBeVisible();

      // Die Grundlage ist NICHT gesperrt — sie lässt sich wieder einschalten,
      // und damit kehren beide zurück.
      const baseToggle = page.locator('#settings-extension-property-profiles');
      await expect(baseToggle).not.toBeChecked();
      await expect(baseToggle).toBeEnabled();
      await baseToggle.check();
      await expect(eventsToggle).toBeChecked();
      await expect(eventsHint).toHaveCount(0);
      // Und mit beiden zurück greift die Sperre wieder.
      await expect(baseToggle).toBeDisabled();
    } finally {
      await closeApp(app, userData);
    }
  });
});
