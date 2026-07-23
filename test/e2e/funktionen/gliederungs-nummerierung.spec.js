// 4T-0470/4T-0471 (Epic 3E-0087): E2E der Gliederungs-Nummerierung.
//
// Deckt die Anzeige der Nummern und das Verschwinden der Marker in allen
// Renderer-Wegen ab (Render-Pane, Gliederungs-Ansicht, Live-Modus) sowie die
// globale Einstellung, die live umschaltet.
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
  'gliederungs-nummerierung.md',
);
const PLAIN = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'ueberschriften-ohne-frontmatter.md',
);

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

test.describe('GN-01: Nummern im Render-Pane', () => {
  test('Frontmatter-Schalter nummeriert; ausgenommene Ueberschrift ohne Nummer, Marker unsichtbar', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('h1', { hasText: 'Erstes Kapitel' })).toBeVisible();
      const numbers = body.locator('.heading-number');
      await expect(numbers).toHaveCount(3);
      await expect(numbers.nth(0)).toHaveText('1');
      await expect(numbers.nth(1)).toHaveText('1.1');
      await expect(numbers.nth(2)).toHaveText('1.2');
      // Marker {-} verschwindet aus der Anzeige.
      await expect(body).not.toContainText('{-}');
      // Ausgenommene Ueberschrift bleibt ohne Nummer.
      const excluded = body.locator('h2', { hasText: 'Ausgenommen' });
      await expect(excluded.locator('.heading-number')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('GN-02: Nummern in der Gliederungs-Ansicht', () => {
  test('Outline zeigt dieselben Nummern; ausgenommener Eintrag ohne Nummer', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await page.keyboard.press('Control+Shift+I');
      const outline = page.locator('.pane-group[data-pane="0"] .outline-tree');
      await expect(outline).toBeVisible();
      const numbers = outline.locator('.outline-number');
      await expect(numbers).toHaveCount(3);
      await expect(numbers.nth(0)).toHaveText('1');
      await expect(numbers.nth(1)).toHaveText('1.1');
      const excludedEntry = outline.locator('.outline-entry', { hasText: 'Ausgenommen' });
      await expect(excludedEntry).toBeVisible();
      await expect(excludedEntry.locator('.outline-number')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('GN-03: Nummern im Live-Modus', () => {
  test('Live-Modus zeigt Nummern-Widgets vor den Ueberschriften', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      const numbers = page.locator('.cm-live-heading-number');
      await expect(numbers.first()).toBeVisible();
      await expect(numbers).toHaveCount(3);
      await expect(numbers.nth(0)).toHaveText('1');
      await expect(numbers.nth(2)).toHaveText('1.2');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('GN-04: Globale Einstellung wirkt live', () => {
  test('ohne Frontmatter aktiviert die Einstellung die Nummerierung und schaltet sie wieder aus', async () => {
    const { app, page, userData } = await launchApp({ args: [PLAIN] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('h1', { hasText: 'Alpha' })).toBeVisible();
      // Default aus: keine Nummern.
      await expect(body.locator('.heading-number')).toHaveCount(0);
      // Einstellung an (Broadcast -> Re-Render).
      await page.evaluate(() =>
        window.api.setSetting('render.headingNumbering', { enabled: true, startLevel: 1 }),
      );
      await expect(body.locator('.heading-number')).toHaveCount(3);
      await expect(body.locator('.heading-number').nth(0)).toHaveText('1');
      await expect(body.locator('.heading-number').nth(1)).toHaveText('1.1');
      // Einstellung wieder aus: Nummern verschwinden.
      await page.evaluate(() =>
        window.api.setSetting('render.headingNumbering', { enabled: false, startLevel: 1 }),
      );
      await expect(body.locator('.heading-number')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
