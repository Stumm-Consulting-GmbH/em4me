// 4T-0330 (Epic 3E-0059): Regressionstests zu den PO-Testbefunden der
// Release-Test-Iteration 0.39.0 — die Panel-Statusbar-Schalter gelten auch
// im Empty-State (keine Datei offen):
//
// R30-01: In einer leeren Bereichs-App lässt sich das Bereichs-Panel über
//         den Statusbar-Schalter aus- und wieder einblenden (vorher
//         erzwang der Empty-State die Anzeige am Schalter vorbei).
// R30-02: Eine ausgeschaltete Lesezeichen-Sektion bleibt im Empty-State
//         ausgeblendet, auch wenn Lesezeichen existieren (vorher erzwungen
//         sichtbar); der Schalter blendet sie dort ein und aus.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke');
const BASIS = path.join(FIXTURES, 'basis.md');

function sendMenuChannel(app, channel) {
  return app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel);
    },
    { channel },
  );
}

test.describe('R30-01: Bereichs-Panel-Schalter im Empty-State', () => {
  test('Panel lässt sich in der leeren Bereichs-App aus- und einblenden', async () => {
    const { app, page, userData } = await launchApp();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-r30-'));
    fs.writeFileSync(path.join(dir, 'notiz.md'), '# Notiz\n', 'utf8');
    try {
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(section).toBeVisible();

      const btn = page.locator('#btn-area');
      await btn.click();
      await expect(section).toBeHidden();
      await btn.click();
      await expect(section).toBeVisible();
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        /* Temp bleibt liegen; unkritisch. */
      }
    }
  });
});

test.describe('R30-02: Lesezeichen-Schalter im Empty-State', () => {
  test('ausgeschaltete Sektion bleibt trotz vorhandener Lesezeichen versteckt', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      // Lesezeichen anlegen — das erste Bookmark schaltet die Sektion
      // bewusst ein (4T-0075-Design).
      await sendMenuChannel(app, 'menu:bookmarkAdd');
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-bookmarks');
      await expect(section).toBeVisible();

      // Sektion bewusst AUS-schalten (Nutzer-Szenario des Befunds).
      const btn = page.locator('#btn-bookmarks');
      await btn.click();
      await expect(section).toBeHidden();

      // Tab schließen -> Empty-State: Sektion bleibt aus (vorher erzwungen an).
      await page.locator(`${SEL.activeTab0} .tab-close`).click();
      await expect(page.locator(SEL.emptyState)).toBeVisible();
      await expect(section).toBeHidden();

      // Schalter blendet die Sektion im Empty-State ein und wieder aus.
      await btn.click();
      await expect(section).toBeVisible();
      await btn.click();
      await expect(section).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});
