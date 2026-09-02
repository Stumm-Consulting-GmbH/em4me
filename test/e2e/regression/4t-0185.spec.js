// 4T-000185: i18n-Luecken — Regressionstests.
//
// L-01: M-08 — Sprachwechsel-Broadcast erreicht ein zweites Fenster
//       (vorher blieb es bis zum Neustart in der alten Sprache). Prueft
//       zugleich K-20: der Lesezeichen-Tooltip nennt den Hotkey und
//       erscheint nach dem Broadcast englisch.
// Die Main-seitigen Strings (M-09 Open-Dialog, M-10 DevTools-Label)
// werden als Unit-Test geprueft (test/unit/i18n.test.js, tForLocale mit
// gemocktem electron) — native OS-Dialoge sind nicht automatisierbar.
'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

test.describe('L-01: Sprachwechsel-Broadcast (M-08, K-20)', () => {
  test('settings:set("language") aus Fenster 1 schaltet Fenster 2 um', async () => {
    const { app, page, userData } = await launchApp();
    try {
      // Zweites Fenster ueber den regulaeren IPC-Pfad oeffnen.
      const win2Promise = app.waitForEvent('window');
      await page.evaluate(() => window.api.openNewWindow([], null));
      const page2 = await win2Promise;
      await page2.waitForLoadState('domcontentloaded');
      // Beide Fenster starten deutsch (Default ohne gesetzte Sprache).
      await expect.poll(() => page2.evaluate(() => document.documentElement.lang)).toBe('de');

      // Sprachwechsel in Fenster 1 ueber den Settings-Pfad ausloesen.
      await page.evaluate(() => window.api.setSetting('language', 'en'));

      // M-08: Fenster 2 uebernimmt die Sprache ohne Neustart.
      await expect.poll(() => page2.evaluate(() => document.documentElement.lang)).toBe('en');
      // K-20: Tooltip traegt den Hotkey, lokalisiert (EN-Modifier).
      await expect
        .poll(() =>
          page2.evaluate(() => {
            const btn = document.getElementById('btn-bookmarks');
            return btn ? btn.title : '';
          }),
        )
        .toBe('Show/hide bookmarks panel (Ctrl+Shift+L)');
    } finally {
      await closeApp(app, userData);
    }
  });
});
