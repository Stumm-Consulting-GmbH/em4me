// 4T-0607 (Epic 3E-0114): E2E-Suite der Format-Toolbar. Prüft die
// Sichtbarkeits-Logik (nur Edit-Modus), die Kommando-Ausführung mit
// Gedrückt-Zustand (Zeichen-Format und Absatz), das Überschrift-Menü,
// den Überlauf bei schmalen Panes und den Aus-Zustand der Erweiterung
// 'toolbar'. Die Belegungs-Normalisierung und die Zustands-Kerne sind in
// format-toolbar.test.js und markdown-format.test.js unit-bewiesen.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

const TOOLBAR = '#format-toolbar-0';
const btn = (commandId) => `${TOOLBAR} [data-command-id="${commandId}"]`;
const MENU = '#context-menu';
const item = (id) => `${MENU} [data-menu-id="${id}"]`;
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-formattoolbar-seed-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

// Menü-IPC-Kanal direkt senden (Muster editor-format.spec.js).
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

test.describe('FT-01: Sichtbarkeit folgt dem Edit-Zustand des Tabs', () => {
  test('Toolbar erscheint erst mit Edit-Modus und verschwindet in der Lese-Ansicht', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      // Lese-Ansicht (rendered): keine Toolbar.
      await expect(page.locator(TOOLBAR)).toBeHidden();
      // Quelltext-Ansicht ohne Edit-Modus (read-only): weiterhin keine.
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect(page.locator(TOOLBAR)).toBeHidden();
      // Edit-Modus an: Toolbar mit Standard-Belegung sichtbar.
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(TOOLBAR)).toBeVisible();
      await expect(page.locator(btn('format.bold'))).toBeVisible();
      // Zurück in die Lese-Ansicht: Edit-Modus endet, Toolbar verschwindet.
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      await expect(page.locator(TOOLBAR)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FT-02: Format-Kommando mit Gedrückt-Zustand', () => {
  test('Fett-Button setzt Marker, zeigt gedrückt und nimmt per Toggle zurück', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nFETTWORT');
      await page.keyboard.press('Shift+Home');
      const bold = page.locator(btn('format.bold'));
      await expect(bold).toHaveAttribute('aria-pressed', 'false');
      await bold.click();
      await expect(editor.locator('.cm-line', { hasText: '**FETTWORT**' })).toBeVisible();
      // Cursor steht im formatierten Bereich: Button gedrückt.
      await expect(bold).toHaveClass(/active/);
      await expect(bold).toHaveAttribute('aria-pressed', 'true');
      // Erneuter Klick entfernt das Format, Button löst.
      await bold.click();
      await expect(editor.locator('.cm-line', { hasText: '**FETTWORT**' })).toHaveCount(0);
      await expect(bold).not.toHaveClass(/active/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FT-03: Absatz-Kommando mit Zustands-Anzeige', () => {
  test('Aufzählungs-Button setzt den Listen-Präfix und zeigt den Zeilen-Zustand', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nListenzeile');
      const bullet = page.locator(btn('paragraph.bulletList'));
      await expect(bullet).toHaveAttribute('aria-pressed', 'false');
      await bullet.click();
      await expect(editor.locator('.cm-line', { hasText: '- Listenzeile' })).toBeVisible();
      await expect(bullet).toHaveClass(/active/);
      // Tooltip trägt das Kommando-Label der Registry.
      await expect(bullet).toHaveAttribute('title', /Aufzählung/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FT-04: Überschrift-Menü', () => {
  test('Dropdown setzt Überschrift 2 und zeigt danach Häkchen und Gedrückt-Zustand', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nTitelzeile');
      const headings = page.locator(`${TOOLBAR} [data-special="headings"]`);
      await headings.click();
      await expect(page.locator(MENU)).toBeVisible();
      await page.locator(item('format-toolbar-heading2')).click();
      await expect(editor.locator('.cm-line', { hasText: '## Titelzeile' })).toBeVisible();
      await expect(headings).toHaveClass(/active/);
      // Menü erneut öffnen: Ebene 2 trägt das Zustands-Häkchen.
      await headings.click();
      await expect(page.locator(item('format-toolbar-heading2'))).toHaveClass(
        /context-menu-item-checked/,
      );
      await page.keyboard.press('Escape');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FT-05: Überlauf bei schmaler Pane', () => {
  test('im schmalen Geteilt-Modus wandern Einträge ins Mehr-Menü und bleiben ausführbar', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      // Schmales Fenster plus Geteilt-Ansicht: die Editor-Spalte ist zu
      // schmal für die Standard-Belegung.
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.setBounds({ width: 640, height: 600 });
      });
      await sendMenuChannel(app, 'menu:viewChange', 'split');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(TOOLBAR)).toBeVisible();
      const more = page.locator('#btn-format-toolbar-more-0');
      await expect(more).toBeVisible();
      // Mindestens ein Eintrag ist eingelagert (hidden).
      await expect(page.locator(`${TOOLBAR} .format-toolbar-item[hidden]`).first()).toHaveCount(1);
      // Der Tabellen-Eintrag (letzter der Standard-Belegung) liegt im
      // Mehr-Menü und öffnet dort den Raster-Picker (4T-0608); die
      // Auswahl fügt die Tabelle ein.
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await more.click();
      await expect(page.locator(MENU)).toBeVisible();
      await page.locator(item('format-toolbar-overflow-insert.table')).click();
      const picker = page.locator('#table-grid-picker');
      await expect(picker).toBeVisible();
      await picker.locator('.table-grid-cell[data-rows="2"][data-cols="2"]').click();
      await expect(editor.locator('.cm-line', { hasText: '| --- | --- |' })).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FT-06: Erweiterung toolbar aus', () => {
  test('ohne Erweiterung keine Leiste im Edit-Modus; Wiedereinschalten wirkt sofort', async () => {
    const userData = seedProfile({ extensions: { disabled: ['toolbar'] } });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      await expect(page.locator(TOOLBAR)).toBeHidden();
      // Wiedereinschalten über den Settings-Broadcast-Pfad.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', []));
      await expect(page.locator(TOOLBAR)).toBeVisible();
      await expect(page.locator(btn('format.bold'))).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FT-07: Tabellen-Raster-Picker', () => {
  test('Raster 3 × 4 fügt die Pipe-Tabelle ein; Undo nimmt sie in einem Schritt zurück', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.locator(btn('insert.table')).click();
      const picker = page.locator('#table-grid-picker');
      await expect(picker).toBeVisible();
      // Überstreichen markiert Zeilen mal Spalten mit Live-Beschriftung.
      const cell = picker.locator('.table-grid-cell[data-rows="3"][data-cols="4"]');
      await cell.hover();
      await expect(picker.locator('.table-grid-picker-label')).toHaveText('3 × 4');
      await cell.click();
      await expect(picker).toBeHidden();
      // 3 Zeilen (inklusive Kopf) mal 4 Spalten.
      await expect(
        editor.locator('.cm-line', { hasText: '| --- | --- | --- | --- |' }),
      ).toBeVisible();
      await expect(editor.locator('.cm-line', { hasText: '|  |  |  |  |' })).toHaveCount(3);
      // Undo nimmt die ganze Tabelle in einem Schritt zurück.
      await page.keyboard.press('Control+z');
      await expect(
        editor.locator('.cm-line', { hasText: '| --- | --- | --- | --- |' }),
      ).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FT-08: Belegung konfigurieren', () => {
  test('Umsortieren und Entfernen wirken nach Anwenden; Zurücksetzen stellt den Standard her', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const firstButton = page.locator(`${TOOLBAR} .format-toolbar-button`).first();
      await expect(firstButton).toHaveAttribute('data-command-id', 'format.bold');
      // Einstellungs-Seite öffnen (Poll-Muster) und zum Bereich wechseln.
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return page.locator(SETTINGS_PAGE).count();
        })
        .toBeGreaterThan(0);
      await page
        .locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="formatToolbar"]`)
        .click();
      const list = page.locator('[data-placement-list="formattoolbar"]');
      await expect(list).toBeVisible();
      // Fett eine Position nach unten, Durchgestrichen entfernen.
      await list.locator('.command-placement-row').first().locator('.format-toolbar-down').click();
      await list
        .locator('.command-placement-row[data-command-id="format.strikethrough"]')
        .locator('.format-toolbar-remove')
        .click();
      await page.locator('#btn-settings-apply').click();
      await expect(page.locator('#btn-settings-apply')).toBeDisabled();
      // Zurück zum Datei-Tab: Reihenfolge und Entfernung wirken sofort.
      await page.locator(SEL.tabs0).first().click();
      await expect(page.locator(TOOLBAR)).toBeVisible();
      await expect(page.locator(btn('format.strikethrough'))).toHaveCount(0);
      await expect(page.locator(`${TOOLBAR} .format-toolbar-button`).first()).toHaveAttribute(
        'data-command-id',
        'format.italic',
      );
      // Zurücksetzen stellt die Standard-Belegung wieder her.
      await page.locator(SEL.tabs0).nth(1).click();
      await expect(list).toBeVisible();
      await page.locator('#btn-format-toolbar-reset').click();
      await page.locator('#btn-settings-apply').click();
      await expect(page.locator('#btn-settings-apply')).toBeDisabled();
      await page.locator(SEL.tabs0).first().click();
      await expect(page.locator(btn('format.strikethrough'))).toBeVisible();
      await expect(page.locator(`${TOOLBAR} .format-toolbar-button`).first()).toHaveAttribute(
        'data-command-id',
        'format.bold',
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FT-09: Belegung überlebt den Neustart', () => {
  test('geseedete Belegung erscheint nach dem Start mit Anzeigenamen im Tooltip', async () => {
    const userData = seedProfile({
      formatToolbar: {
        entries: [
          { type: 'command', commandId: 'format.bold', icon: 'bold', label: 'B' },
          { type: 'separator' },
          { type: 'headings' },
        ],
      },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      await expect(page.locator(`${TOOLBAR} .format-toolbar-item`)).toHaveCount(3);
      const bold = page.locator(btn('format.bold'));
      await expect(bold).toBeVisible();
      // Tooltip: Anzeigename plus Original-Kommando-Label in Klammern.
      await expect(bold).toHaveAttribute('title', /^B \(/);
      await expect(page.locator(`${TOOLBAR} [data-special="headings"]`)).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
