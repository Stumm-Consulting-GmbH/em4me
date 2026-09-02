// 4T-000351 (Epic 3E-000063): Render-Aktualisierung aus der Quelltext-Ansicht.
//
// PO-Fehlermeldung: In der reinen Quelltext-Ansicht eingegebene Aenderungen
// erschienen nach dem Wechsel in die gerenderte Ansicht nicht. Ursache:
// setViewMode synchronisierte beim Modus-Wechsel nur den Editor
// (syncEditorForPane), nie das Render-Pane; ausserhalb des Split-Modus laeuft
// kein schedulePreviewUpdate, also blieb das Render-DOM auf dem Stand des
// letzten Renders stehen. Fix: setViewMode ruft fuer Modi mit sichtbarem
// Render-Pane (Gerendert/Geteilt) renderPaneContent auf.
//
// RA-01: Text-Eingabe, Wechsel via Menue-Weg (menu:viewChange).
// RA-02: Block-Struktur-Aenderung, Wechsel via Statusbar-Button.
// RA-03: Nachbar-Pfad Split — die Vorschau zeigt die Aenderung beim Wechsel.
//
// Alle Wechsel-Wege (Menue, Statusbar-Button, Tastenkuerzel Strg+1-4) laufen
// durch denselben setViewMode-Pfad; Menue- und Statusbar-Weg decken ihn hier
// stellvertretend ab.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

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

// Source-Modus aktivieren und den Editor beschreibbar schalten.
async function enterEditSource(app, page) {
  await sendMenuChannel(app, 'menu:viewChange', 'source');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

test.describe('RA-01: Quelltext-Eingabe erscheint nach Wechsel in Gerendert (Menue-Weg)', () => {
  test('eingegebener Text ist im Render-Pane sichtbar', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      // Ausgangslage: Datei oeffnet gerendert; der Marker existiert noch nicht.
      await expect(page.locator(SEL.markdownBody0)).not.toContainText('Repro4T0351Text');
      await enterEditSource(app, page);
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n\nRepro4T0351Text\n');
      // Wechsel in die gerenderte Ansicht ueber den Menue-Weg.
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      await expect(page.locator(SEL.paneRendered0)).toBeVisible();
      await expect(page.locator(SEL.markdownBody0)).toContainText('Repro4T0351Text');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('RA-02: Block-Struktur-Aenderung erscheint nach Wechsel in Gerendert (Statusbar-Weg)', () => {
  test('neue Ueberschrift wird als Heading gerendert', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n\n## Repro4T0351Heading\n');
      // Wechsel ueber den Statusbar-Button (anderer Wechsel-Weg, gleicher
      // setViewMode-Pfad).
      await page.locator(SEL.viewBtn('rendered')).click();
      await expect(page.locator(SEL.paneRendered0)).toBeVisible();
      await expect(
        page.locator(`${SEL.markdownBody0} h2`, { hasText: 'Repro4T0351Heading' }),
      ).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('RA-03: Split-Ansicht zeigt die Quelltext-Aenderung beim Wechsel (Nachbar-Pfad)', () => {
  test('die geteilte Vorschau ist beim Wechsel bereits aktuell', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n\nRepro4T0351Split\n');
      await sendMenuChannel(app, 'menu:viewChange', 'split');
      await expect(page.locator(SEL.content0)).toHaveClass(/view-split/);
      await expect(page.locator(SEL.markdownBody0)).toContainText('Repro4T0351Split');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
