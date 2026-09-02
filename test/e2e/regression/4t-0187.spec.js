// 4T-000187: Nutzer-Feedback und Sidebar-Lücken — Regressionstests.
//
// NF-01: B-18 — Die Tag-Sidebar funktioniert OHNE jemals geöffnetes
//        Backlinks-Panel (Index-Lebenszyklus entkoppelt; vorher blieb sie
//        dauerhaft auf 'unavailable').
// NF-02: R4-10 — Fehlgeschlagenes Datei-Öffnen zeigt einen Statusbar-
//        Hinweis statt nur eines Konsolen-Logs.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'regression', '4t-0186.md');

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

test.describe('NF-01: Tag-Sidebar ohne Backlinks-Panel (B-18)', () => {
  test('Tags erscheinen in frischem Profil allein über die Tag-Sektion', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      // Nur die Tag-Sektion einblenden — das Backlinks-Panel bleibt zu.
      await sendMenuChannel(app, 'menu:toggleTags');
      const tagSection = page.locator('.pane-group[data-pane="0"] .sidebar-tags');
      await expect(tagSection).toBeVisible();
      // B-18: Der Bedarf stößt den Index-Aufbau an; nach dem Ready-
      // Broadcast erscheint der Tag aus der Fixture in der Liste.
      await expect(tagSection).toContainText('beispieltag', { timeout: 15000 });
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('NF-02: Feedback bei fehlgeschlagenem Öffnen (R4-10)', () => {
  test('Nicht existente CLI-Datei erzeugt einen Statusbar-Hinweis', async () => {
    const missing = path.resolve(
      __dirname,
      '..',
      '..',
      'fixtures',
      'regression',
      'gibt-es-nicht-4t0187.md',
    );
    const { app, page, userData } = await launchApp({ args: [missing] });
    try {
      const hint = page.locator('#statusbar-hint');
      await expect(hint).toContainText('gibt-es-nicht-4t0187.md', { timeout: 10000 });
    } finally {
      await closeApp(app, userData);
    }
  });
});
