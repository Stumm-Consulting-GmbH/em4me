// 4T-0480 (Epic 3E-0089): E2E-Funktions-Suite Kommando-Palette.
// KP-01: Strg+K oeffnet das Popup (Modal sichtbar, Filter fokussiert, Liste
// gefuellt), Esc schliesst es; KP-02: Oeffnen ueber den Menue-Kanal
// menu:openCommandPalette (Poll-Muster wie die Graph-Suite, weil der
// Listener erst am Ende des asynchronen init() steht); KP-03: Teilstring-
// Filter schrumpft die Liste auf den Treffer und zeigt dessen Kuerzel;
// KP-04: Enter fuehrt das gefilterte Kommando aus (Inhaltsverzeichnis-
// Sektion erscheint) und schliesst das Popup; KP-05: im Kontext nicht
// verfuegbare Kommandos (Bereichs-Graph ohne Bereich) sind gedimmt und per
// Klick nicht ausfuehrbar. describe-Titel tragen die Matrix-ID (S-078).
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'kommando-palette.md',
);

const MODAL = '#command-palette-modal';
const FILTER = '#command-palette-filter';
const ITEM = '.command-palette-item';
const OUTLINE = '.pane-group[data-pane="0"] .outline-tree';
// 4T-0781 (Epic 3E-0161): Sektion des Block-Eigenschaften-Panels.
const BLOCKPROPS = '.pane-group[data-pane="0"] .sidebar-blockprops';

// Menue-Klicks simulieren (Muster smoke.spec.js / graphenansicht.spec.js).
async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Palette per Kuerzel oeffnen; der Tastendruck wird per Poll wiederholt,
// weil der globale Dispatcher erst nach dem Renderer-init reagiert. Ein
// erneuter Druck bei offener Palette ist ein No-op (showCommandPalette
// bricht bei sichtbarem Modal ab).
async function openPaletteByKey(page) {
  await expect
    .poll(async () => {
      if (await page.locator(MODAL).isVisible()) return true;
      await page.keyboard.press('Control+k');
      return page.locator(MODAL).isVisible();
    })
    .toBe(true);
}

test.describe('KP-01: Strg+K oeffnet die Kommando-Palette, Esc schliesst (S-078)', () => {
  test('Modal sichtbar mit fokussiertem Filter und gefuellter Liste', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await openPaletteByKey(page);
      await expect(page.locator(MODAL)).toBeVisible();
      // Filter-Feld erhaelt den Fokus (setTimeout 0 nach dem Einblenden).
      await expect
        .poll(() => page.evaluate(() => document.activeElement && document.activeElement.id))
        .toBe('command-palette-filter');
      // Liste ist gefuellt (mindestens ein ausfuehrbares Kommando).
      expect(await page.locator(ITEM).count()).toBeGreaterThan(0);

      await page.keyboard.press('Escape');
      await expect(page.locator(MODAL)).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('KP-02: Oeffnen ueber den Menue-Kanal menu:openCommandPalette (S-078)', () => {
  test('Menue-Weg zeigt dasselbe Modal', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await expect
        .poll(async () => {
          if (await page.locator(MODAL).isVisible()) return true;
          await sendMenuChannel(app, 'menu:openCommandPalette');
          return page.locator(MODAL).isVisible();
        })
        .toBe(true);
      await expect(page.locator(MODAL)).toBeVisible();
      expect(await page.locator(ITEM).count()).toBeGreaterThan(0);

      await page.keyboard.press('Escape');
      await expect(page.locator(MODAL)).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('KP-03: Teilstring-Filter schrumpft die Liste und zeigt das Kuerzel (S-078)', () => {
  test('Filter „Inhaltsverzeichnis" trifft view.toggleOutline mit Strg+Umschalt+I', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await openPaletteByKey(page);

      const before = await page.locator(ITEM).count();
      await page.locator(FILTER).fill('Inhaltsverzeichnis');
      // Liste schrumpft auf den einen Treffer.
      await expect(page.locator(ITEM)).toHaveCount(1);
      expect(before).toBeGreaterThan(1);

      const hit = page.locator(ITEM).first();
      await expect(hit.locator('.command-palette-name')).toHaveText('Inhaltsverzeichnis');
      // Der Treffer zeigt das effektive Kuerzel als eigenes Element.
      await expect(hit.locator('.command-palette-shortcut')).toHaveText('Strg+Umschalt+I');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('KP-04: Enter fuehrt das gefilterte Kommando aus und schliesst (S-078)', () => {
  test('view.toggleOutline oeffnet die Inhaltsverzeichnis-Sektion', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      // Ausgangszustand: die Outline-Sektion ist nicht sichtbar.
      await expect(page.locator(OUTLINE)).toBeHidden();

      await openPaletteByKey(page);
      await page.locator(FILTER).fill('Inhaltsverzeichnis');
      await expect(page.locator(ITEM)).toHaveCount(1);
      await page.keyboard.press('Enter');

      // Popup ist zu und die Outline-Sektion erscheint.
      await expect(page.locator(MODAL)).toBeHidden();
      await expect(page.locator(OUTLINE)).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-0781 (Epic 3E-0161): Regressionstest zum Befund, dass drei Registry-
// Kommandos keinen Eintrag in der Dispatcher-Map hatten und deshalb ueber
// Palette und belegtes Kuerzel wirkungslos blieben. Geprueft wird die
// Wirkung am realen Bedienweg; die Vollstaendigkeit der Map selbst haelt der
// Waechter test/unit/renderer/kommando-dispatcher.test.js.
test.describe('KP-06: Kommandos ohne Standard-Kuerzel wirken ueber die Palette (S-078)', () => {
  test('view.toggleBlockProps oeffnet die Block-Eigenschaften-Sektion', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    void app;
    try {
      await waitForTab(page);
      await expect(page.locator(BLOCKPROPS)).toBeHidden();

      await openPaletteByKey(page);
      await page.locator(FILTER).fill('Block-Eigenschaften');
      await expect(page.locator(ITEM)).toHaveCount(1);
      await page.keyboard.press('Enter');

      await expect(page.locator(MODAL)).toBeHidden();
      await expect(page.locator(BLOCKPROPS)).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('KP-05: Nicht verfuegbare Kommandos sind gedimmt und nicht ausfuehrbar (S-078)', () => {
  test('Bereichs-Graph ohne Bereich traegt .unavailable und Klick schliesst nicht', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await openPaletteByKey(page);
      await page.locator(FILTER).fill('Bereichs-Graph');
      await expect(page.locator(ITEM)).toHaveCount(1);

      const graphItem = page.locator(ITEM).first();
      await expect(graphItem.locator('.command-palette-name')).toHaveText('Bereichs-Graph');
      // Ohne geoeffneten Bereich ist das Kommando gedimmt.
      await expect(graphItem).toHaveClass(/unavailable/);
      await expect(graphItem).toHaveAttribute('aria-disabled', 'true');

      // Klick auf den gedimmten Eintrag fuehrt nichts aus: Modal bleibt
      // offen, die Zeile bleibt sichtbar. force, weil Playwright den Klick
      // auf ein aria-disabled-Element sonst als „not enabled" abweist — der
      // Test prueft gerade, dass der Handler-Guard den Klick verwirft.
      await graphItem.click({ force: true });
      await expect(page.locator(MODAL)).toBeVisible();
      await expect(graphItem).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});
