// 4T-0590/4T-0591 (Epic 3E-0109): E2E-Suite für das Tabellen-Kontextmenü.
// TK-01: Untermenü „Tabelle" erscheint nur mit Cursor in einer Tabelle,
// listet alle zwölf Operationen und dimmt geschützte Ziele und Ränder;
// TK-02: Zeile verschieben wirkt auf den Editor-Inhalt, ein einzelner
// Undo-Schritt stellt den Original-Text exakt wieder her; TK-03: Spalten-
// Ausrichtung schreibt die Trenn-Zeile um und zeigt das Häkchen der
// Ist-Ausrichtung; TK-04: deaktivierte Erweiterung table-tools blendet das
// Untermenü aus; TK-05: Kommando-Palette führt Tabellen-Operationen aus
// und dimmt sie außerhalb von Tabellen; TK-06: dasselbe Untermenü wirkt im
// perspective-table-Fence (Zeile verschieben, Ein-Schritt-Undo); TK-07:
// Spalten-Operationen werden bei colspan mit Statusbar-Hinweis abgelehnt.
// Die Operations-Semantik selbst ist unit-getestet
// (test/unit/table-edit.test.js, test/unit/perspective-table-edit.test.js).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
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
  'tabellen-kontextmenue.md',
);

const MENU = '#context-menu';
const item = (id) => `${MENU} [data-menu-id="${id}"]`;
const PALETTE_MODAL = '#command-palette-modal';
const PALETTE_FILTER = '#command-palette-filter';
const PALETTE_ITEM = '.command-palette-item';

const OP_IDS = [
  'table-align-left',
  'table-align-center',
  'table-align-right',
  'table-row-up',
  'table-row-down',
  'table-row-insert',
  'table-row-delete',
  'table-col-left',
  'table-col-right',
  'table-col-insert',
  'table-col-delete',
  'table-transpose',
];

function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-tabellenmenue-seed-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

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

// Rechtsklick auf eine Editor-Zeile (x:4 setzt den Cursor an den
// Zeilenanfang, also in die erste Spalte) und Untermenü „Tabelle" öffnen.
async function openTableSubmenu(page, lineText) {
  const editor = page.locator(SEL.editorContent0);
  const line = editor.locator('.cm-line', { hasText: lineText });
  await line.click({ button: 'right', position: { x: 4, y: 4 } });
  await expect(page.locator(MENU)).toBeVisible();
  await page.locator(item('table')).hover();
  await expect(page.locator(item('table-transpose'))).toBeVisible();
}

async function editorLines(page) {
  return page.locator(SEL.editorContent0).locator('.cm-line').allTextContents();
}

test.describe('TK-01: Untermenü „Tabelle" nur in Tabellen, mit Kontext-Dimmung (F-142)', () => {
  test('in der Tabelle alle zwölf Operationen, außerhalb keine Sektion', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);

      // Außerhalb der Tabelle: Menü ohne Tabellen-Sektion.
      const editor = page.locator(SEL.editorContent0);
      await editor
        .locator('.cm-line', { hasText: 'Ein Absatz ohne Tabelle.' })
        .click({ button: 'right', position: { x: 4, y: 4 } });
      await expect(page.locator(MENU)).toBeVisible();
      await expect(page.locator(item('copy'))).toBeVisible();
      await expect(page.locator(item('table'))).toHaveCount(0);
      await page.keyboard.press('Escape');

      // In der ersten Datenzeile: alle zwölf Einträge, Ränder gedimmt.
      await openTableSubmenu(page, 'a1');
      for (const id of OP_IDS) {
        await expect(page.locator(item(id))).toHaveCount(1);
      }
      // Erste Datenzeile: nach oben gedimmt, nach unten aktiv; erste
      // Spalte: nach links gedimmt.
      await expect(page.locator(item('table-row-up'))).toHaveClass(/disabled/);
      await expect(page.locator(item('table-row-down'))).not.toHaveClass(/disabled/);
      await expect(page.locator(item('table-col-left'))).toHaveClass(/disabled/);
      await expect(page.locator(item('table-col-right'))).not.toHaveClass(/disabled/);
      await page.keyboard.press('Escape');

      // Kopfzeile: Zeilen-Verschieben und -Löschen gedimmt, Einfügen aktiv.
      await openTableSubmenu(page, '| A | B');
      await expect(page.locator(item('table-row-up'))).toHaveClass(/disabled/);
      await expect(page.locator(item('table-row-delete'))).toHaveClass(/disabled/);
      await expect(page.locator(item('table-row-insert'))).not.toHaveClass(/disabled/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-02: Zeile verschieben mit Ein-Schritt-Undo (F-142)', () => {
  test('Zeile nach oben tauscht die Datenzeilen, Strg+Z stellt exakt wieder her', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);

      await openTableSubmenu(page, 'a2');
      await page.locator(item('table-row-up')).click();
      let lines = await editorLines(page);
      const idxA2 = lines.findIndex((l) => l.includes('a2'));
      const idxA1 = lines.findIndex((l) => l.includes('a1'));
      expect(idxA2).toBeGreaterThan(-1);
      expect(idxA2).toBeLessThan(idxA1);

      // Ein einzelner Undo-Schritt stellt den unformatierten Original-Text
      // wieder her (die Operation war eine Transaktion).
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+z');
      lines = await editorLines(page);
      expect(lines).toContain('| a1 | b1 | c1 |');
      expect(lines).toContain('| a2 | b2 | c2 |');
      expect(lines.findIndex((l) => l.includes('a1'))).toBeLessThan(
        lines.findIndex((l) => l.includes('a2')),
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-03: Spalten-Ausrichtung mit Häkchen (F-142)', () => {
  test('Rechtsbündig schreibt die Trenn-Zeile um und zeigt das Häkchen', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);

      await openTableSubmenu(page, 'a1');
      await page.locator(item('table-align-right')).click();
      const lines = await editorLines(page);
      const sep = lines.find((l) => l.includes('--:'));
      expect(sep).toBeTruthy();
      expect(sep.indexOf('--:')).toBeLessThan(sep.indexOf('---'));

      // Erneut geöffnet zeigt der Eintrag die Ist-Ausrichtung als Häkchen.
      await openTableSubmenu(page, 'a1');
      await expect(page.locator(item('table-align-right'))).toHaveClass(
        /context-menu-item-checked/,
      );
      await expect(page.locator(item('table-align-left'))).not.toHaveClass(
        /context-menu-item-checked/,
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-04: Erweiterung table-tools aus blendet das Untermenü aus (F-142)', () => {
  test('mit deaktivierter Erweiterung fehlt die Tabellen-Sektion', async () => {
    const userDataSeed = seedProfile({ extensions: { disabled: ['table-tools'] } });
    const { app, page, userData } = await launchApp({
      args: [FIXTURE],
      userData: userDataSeed,
    });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor
        .locator('.cm-line', { hasText: 'a1' })
        .click({ button: 'right', position: { x: 4, y: 4 } });
      await expect(page.locator(MENU)).toBeVisible();
      await expect(page.locator(item('copy'))).toBeVisible();
      await expect(page.locator(item('table'))).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-05: Kommando-Palette führt Tabellen-Operationen aus und dimmt außerhalb (F-142)', () => {
  test('Transponieren über die Palette wirkt; außerhalb der Tabelle gedimmt', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);

      // Cursor in die Tabelle, Palette öffnen, Transponieren ausführen.
      await editor.locator('.cm-line', { hasText: 'a1' }).click({ position: { x: 4, y: 4 } });
      await expect
        .poll(async () => {
          if (await page.locator(PALETTE_MODAL).isVisible()) return true;
          await page.keyboard.press('Control+k');
          return page.locator(PALETTE_MODAL).isVisible();
        })
        .toBe(true);
      await page.locator(PALETTE_FILTER).fill('transponieren');
      await expect(page.locator(PALETTE_ITEM)).toHaveCount(1);
      await expect(page.locator(PALETTE_ITEM).first()).not.toHaveClass(/unavailable/);
      await page.keyboard.press('Enter');
      await expect(page.locator(PALETTE_MODAL)).toBeHidden();
      const lines = await editorLines(page);
      expect(lines.some((l) => l.includes('a1') && l.includes('a2'))).toBe(true);

      // Cursor außerhalb der Tabelle: derselbe Eintrag ist gedimmt.
      await editor
        .locator('.cm-line', { hasText: 'Text danach.' })
        .click({ position: { x: 4, y: 4 } });
      await expect
        .poll(async () => {
          if (await page.locator(PALETTE_MODAL).isVisible()) return true;
          await page.keyboard.press('Control+k');
          return page.locator(PALETTE_MODAL).isVisible();
        })
        .toBe(true);
      await page.locator(PALETTE_FILTER).fill('transponieren');
      await expect(page.locator(PALETTE_ITEM)).toHaveCount(1);
      await expect(page.locator(PALETTE_ITEM).first()).toHaveClass(/unavailable/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-06: Untermenü und Zeilen-Operationen im perspective-table-Fence (F-142)', () => {
  test('Zeile nach oben verschiebt den |-Abschnitt, Strg+Z stellt wieder her', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);

      await openTableSubmenu(page, 'p1b');
      await page.locator(item('table-row-up')).click();
      let lines = await editorLines(page);
      expect(lines.findIndex((l) => l.includes('p1b'))).toBeLessThan(
        lines.findIndex((l) => l.includes('p1a')),
      );

      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+z');
      lines = await editorLines(page);
      expect(lines.findIndex((l) => l.includes('p1a'))).toBeLessThan(
        lines.findIndex((l) => l.includes('p1b')),
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-07: Span-Ablehnung mit Statusbar-Hinweis (F-142)', () => {
  test('Spalten-Operation bei colspan ändert nichts und zeigt den Hinweis', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);

      const before = await editorLines(page);
      await openTableSubmenu(page, 's1');
      await page.locator(item('table-col-right')).click();
      const hint = page.locator('#statusbar-hint');
      await expect(hint).toHaveClass(/visible/);
      await expect(hint).toContainText('colspan');
      expect(await editorLines(page)).toEqual(before);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
