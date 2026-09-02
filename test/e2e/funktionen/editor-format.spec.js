// 4T-000378 (Epic 3E-000071): E2E-Suite für die Zeichen-Format- und Link-
// Kommandos. Prüft den Hotkey-Pfad (Strg+B), den Menü-Pfad (Format-Submenü),
// das Toggle-Verhalten, das Wiki-Link-Einfügen, die Read-only-Abmeldung und
// den Schutz gegen Formatierung im Wiki-Link-Ziel. Die Toggle-Regeln selbst
// sind im Unit-Test markdown-format.test.js bewiesen.
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

test.describe('EF-01: Fett per Strg+B mit Toggle-Rücknahme', () => {
  test('Strg+B setzt und entfernt die Fett-Marker um die Selektion', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nFETTWORT');
      await page.keyboard.press('Shift+Home');
      await page.keyboard.press('Control+b');
      await expect(editor.locator('.cm-line', { hasText: '**FETTWORT**' })).toBeVisible();
      // Erneutes Strg+B nimmt das Format zurück (Toggle).
      await page.keyboard.press('Control+b');
      await expect(editor.locator('.cm-line', { hasText: '**FETTWORT**' })).toHaveCount(0);
      await expect(editor.locator('.cm-line', { hasText: 'FETTWORT' })).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EF-02: Kursiv über das Format-Submenü', () => {
  test('Rechtsklick, Format, Kursiv umschließt die Selektion', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nKURSIVWORT');
      await page.keyboard.press('Shift+Home');
      const line = editor.locator('.cm-line', { hasText: 'KURSIVWORT' });
      await line.click({ button: 'right', position: { x: 4, y: 4 } });
      await expect(page.locator(MENU)).toBeVisible();
      await page.locator(item('format')).hover();
      await page.locator(item('format-italic')).click();
      await expect(editor.locator('.cm-line', { hasText: '*KURSIVWORT*' })).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EF-03: Wiki-Link einfügen', () => {
  test('Link-Aktion fügt [[]] ein und setzt den Cursor für das Autocomplete dazwischen', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n');
      await editor.click({ button: 'right', position: { x: 4, y: 4 } });
      await expect(page.locator(MENU)).toBeVisible();
      await page.locator(item('link-wiki')).click();
      await expect(editor.locator('.cm-line', { hasText: '[[]]' })).toBeVisible();
      // Cursor steht zwischen den Klammern (Voraussetzung für den
      // Autocomplete-Anstoß): das getippte Zeichen landet innen.
      await page.keyboard.type('X');
      await expect(editor.locator('.cm-line', { hasText: '[[X]]' })).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EF-04: Read-only meldet Format- und Link-Aktionen ab', () => {
  test('ohne Edit-Modus erscheinen weder Format-Submenü noch Link-Aktionen', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).toHaveClass(
        /read-only/,
      );
      await page.locator(SEL.editorContent0).click({ button: 'right' });
      await expect(page.locator(MENU)).toBeVisible();
      await expect(page.locator(item('format'))).toHaveCount(0);
      await expect(page.locator(item('link-wiki'))).toHaveCount(0);
      await expect(page.locator(item('link-external'))).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EF-05: Kein Format im Wiki-Link-Ziel', () => {
  test('Strg+B auf ein Wort im Wiki-Link lässt den Link unverändert', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n[[WikiZiel]]');
      // „WikiZiel" im Link-Ziel markieren: Cursor steht hinter ]], zwei
      // Schritte vor die Klammern zurück, dann die acht Zeichen markieren.
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowLeft');
      await page.keyboard.press('Control+b');
      // Der Link bleibt unverändert, es werden keine Marker eingefügt.
      await expect(editor.locator('.cm-line', { hasText: '[[WikiZiel]]' })).toBeVisible();
      await expect(editor.locator('.cm-line', { hasText: '**WikiZiel**' })).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EF-06: Aufzählung über das Absatz-Submenü', () => {
  test('Absatz, Aufzählung setzt den Listen-Präfix auf die Cursor-Zeile', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nListenzeile');
      const line = editor.locator('.cm-line', { hasText: 'Listenzeile' });
      await line.click({ button: 'right', position: { x: 4, y: 4 } });
      await page.locator(item('paragraph')).hover();
      await page.locator(item('paragraph-bullet')).click();
      await expect(editor.locator('.cm-line', { hasText: '- Listenzeile' })).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EF-07: Überschrift mit Zustands-Häkchen', () => {
  test('Überschrift 2 setzen, Häkchen erscheint beim erneuten Öffnen', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nTitelzeile');
      await editor.locator('.cm-line', { hasText: 'Titelzeile' }).click({
        button: 'right',
        position: { x: 4, y: 4 },
      });
      await page.locator(item('paragraph')).hover();
      await page.locator(item('paragraph-heading2')).click();
      await expect(editor.locator('.cm-line', { hasText: '## Titelzeile' })).toBeVisible();
      // Menü erneut öffnen: Überschrift 2 trägt jetzt das Zustands-Häkchen.
      await editor.locator('.cm-line', { hasText: '## Titelzeile' }).click({
        button: 'right',
        position: { x: 6, y: 4 },
      });
      await page.locator(item('paragraph')).hover();
      await expect(page.locator(item('paragraph-heading2'))).toHaveClass(
        /context-menu-item-checked/,
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EF-08: Tabelle über das Einfügen-Submenü', () => {
  test('Einfügen, Tabelle fügt die Schablone ein', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await editor.click({ button: 'right', position: { x: 4, y: 4 } });
      await page.locator(item('insert')).hover();
      await page.locator(item('insert-table')).click();
      await expect(editor.locator('.cm-line', { hasText: '| --- | --- |' })).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
