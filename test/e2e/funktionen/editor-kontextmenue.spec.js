// 4T-0377 (Epic 3E-0071): E2E-Suite für das Editor-Kontextmenü.
// Grundgerüst-Task: Menü öffnet in Quelltext- und Live-Modus, Klipboard-
// Aktionen wirken (Kopieren/Einfügen-Roundtrip über das Electron-Klipboard),
// Read-only zeigt die Teilmenge, Menü schließt per Esc und Klick außerhalb.
// Die Format-/Absatz-/Einfüge-Einträge kommen in 4T-0378/4T-0379 dazu.
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

async function enterEditSource(app, page) {
  await sendMenuChannel(app, 'menu:viewChange', 'source');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

const MENU = '#context-menu';
const item = (id) => `${MENU} [data-menu-id="${id}"]`;

test.describe('EK-01: Editor-Kontextmenü öffnet im Quelltext-Modus', () => {
  test('Rechtsklick zeigt den Klipboard-Block mit allen vier Einträgen', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      await page.locator(SEL.editorContent0).click({ button: 'right' });
      await expect(page.locator(MENU)).toBeVisible();
      await expect(page.locator(item('cut'))).toBeVisible();
      await expect(page.locator(item('copy'))).toBeVisible();
      await expect(page.locator(item('paste'))).toBeVisible();
      await expect(page.locator(item('selectAll'))).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EK-02: Editor-Kontextmenü öffnet im Live-Modus', () => {
  test('Rechtsklick im Live-Modus öffnet dasselbe Menü', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await page.locator(SEL.editorContent0).click({ button: 'right' });
      await expect(page.locator(MENU)).toBeVisible();
      await expect(page.locator(item('copy'))).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EK-03: Read-only zeigt nur die Klipboard-Teilmenge', () => {
  test('ohne Edit-Modus erscheinen nur Kopieren und Alles auswählen', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      const source = page.locator('.pane-group[data-pane="0"] .pane-source-editor');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect(source).toHaveClass(/read-only/);
      await page.locator(SEL.editorContent0).click({ button: 'right' });
      await expect(page.locator(MENU)).toBeVisible();
      await expect(page.locator(item('copy'))).toBeVisible();
      await expect(page.locator(item('selectAll'))).toBeVisible();
      await expect(page.locator(item('cut'))).toHaveCount(0);
      await expect(page.locator(item('paste'))).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EK-04: Klipboard-Roundtrip über das Kontextmenü', () => {
  test('Kopieren schreibt die Selektion, Einfügen fügt den Klipboard-Text ein', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nKLIPBOARDPROBE');
      // Nur die neue Zeile selektieren (Shift+Home) und über das Menü kopieren.
      await page.keyboard.press('Shift+Home');
      const probe = editor.locator('.cm-line', { hasText: 'KLIPBOARDPROBE' });
      await probe.click({ button: 'right', position: { x: 4, y: 4 } });
      await page.locator(item('copy')).click();
      await expect
        .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
        .toBe('KLIPBOARDPROBE');

      // Klipboard extern setzen und über das Menü einfügen.
      await app.evaluate(({ clipboard }) => clipboard.writeText('EINGEFUEGT'));
      await editor.click({ button: 'right', position: { x: 4, y: 4 } });
      await page.locator(item('paste')).click();
      await expect(editor).toContainText('EINGEFUEGT');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EK-05: Menü schließt per Esc und Klick außerhalb', () => {
  test('Esc und Außenklick blenden das Menü aus', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click({ button: 'right' });
      await expect(page.locator(MENU)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(MENU)).toBeHidden();

      await editor.click({ button: 'right' });
      await expect(page.locator(MENU)).toBeVisible();
      // Klick außerhalb des Menüs (obere linke Ecke, Tabbar-Bereich).
      await page.mouse.click(6, 6);
      await expect(page.locator(MENU)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
