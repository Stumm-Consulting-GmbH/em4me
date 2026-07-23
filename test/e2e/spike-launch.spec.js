// 4T-0166: Spike Playwright-Electron — startet die echte App (Dev-Stand),
// prueft das erste Fenster und schliesst sauber. Bleibt als dauerhafte
// Smoke-Basis liegen; die breitere Smoke-Suite liegt unter test/e2e/smoke/.
'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/app');

test.describe('Spike: App-Start (Playwright-Electron)', () => {
  test('App startet, Fenster traegt den Produktnamen, sauberes Beenden', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await expect(page).toHaveTitle(/EM4me/);
      // Renderer ist hochgekommen: Statusbar existiert im DOM.
      await expect(page.locator('footer.statusbar')).toBeAttached();
    } finally {
      await closeApp(app, userData);
    }
  });
});
