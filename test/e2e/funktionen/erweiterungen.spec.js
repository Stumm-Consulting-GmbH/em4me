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

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'erweiterungen.md');

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

async function openSettingsPageViaKeyboard(page) {
  await expect
    .poll(async () => {
      await page.keyboard.press('Control+,');
      return page.locator(`${SETTINGS_PAGE}`).count();
    })
    .toBeGreaterThan(0);
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

// 4T-000517 (Epic 3E-000092): events haengt an property-profiles — die Zeile
// der Ereignis-Erweiterung zeigt bei deaktivierter Voraussetzung den
// generischen Abhaengigkeits-Hinweis mit gesperrtem Schalter und kehrt
// mit der Voraussetzung zurueck (Draft-Ebene, ohne Anwenden).
test.describe('EW-04: Abhängigkeits-Hinweis events → property-profiles (4T-000517)', () => {
  test('property-profiles aus sperrt events mit Hinweis; Zustand kehrt zurück', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openExtensionsSection(page);
      const eventsToggle = page.locator('#settings-extension-events');
      const eventsHint = page.locator(
        '.settings-extension-row[data-extension-id="events"] .settings-extension-dependency-hint',
      );
      await expect(eventsToggle).toBeChecked();
      await expect(eventsHint).toHaveCount(0);

      await page.locator('#settings-extension-property-profiles').uncheck();
      await expect(eventsToggle).not.toBeChecked();
      await expect(eventsToggle).toBeDisabled();
      await expect(eventsHint).toBeVisible();

      // Voraussetzung wieder an: der eigene Schalt-Zustand kehrt zurück.
      await page.locator('#settings-extension-property-profiles').check();
      await expect(eventsToggle).toBeChecked();
      await expect(eventsToggle).toBeEnabled();
      await expect(eventsHint).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});
