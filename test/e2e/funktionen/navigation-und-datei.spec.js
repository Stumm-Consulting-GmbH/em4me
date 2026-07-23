// 4T-0195: E2E-Funktions-Suite — Gruppen Navigation sowie Datei/Sitzung.
// describe-Titel tragen die Matrix-IDs aus test/abdeckungs-matrix.json.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'regression', '4t-0186.md');
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

test.describe('FN-01: Outline-Sidebar (Toggle, Klick springt)', () => {
  test('Strg+Umschalt+I oeffnet die Outline, Klick scrollt den Editor', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await page.keyboard.press('Control+Shift+I');
      const outline = page.locator('.pane-group[data-pane="0"] .outline-tree');
      await expect(outline).toBeVisible();
      const entries = outline.locator('.outline-entry');
      await expect(entries).toHaveCount(2);
      await entries.nth(1).locator('.outline-label').click();
      await expect
        .poll(() =>
          // 4T-0361: '.pane-source' -> Haupt-Editor; die Notiz-CodeMirror-
          // Instanz (3E-0066/4T-0398) steht sonst als erster '.cm-scroller'
          // im DOM und scrollt nie.
          page.evaluate(() => {
            const sc = document.querySelector(
              '.pane-group[data-pane="0"] .pane-source .cm-scroller',
            );
            return sc ? sc.scrollTop : -1;
          }),
        )
        .toBeGreaterThan(50);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('FN-02: Folding (Region und alles)', () => {
  test('Strg+Umschalt+[ klappt die Region am Cursor ein', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      await editor.locator('.cm-line', { hasText: '# Erstes Heading' }).click();
      await page.keyboard.press('Control+Shift+[');
      await expect(
        page.locator('.pane-group[data-pane="0"] .cm-foldPlaceholder').first(),
      ).toBeVisible();
      await page.keyboard.press('Control+Shift+]');
      await expect(page.locator('.pane-group[data-pane="0"] .cm-foldPlaceholder')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });

  test('Strg+Alt+[ klappt alle Regionen ein (K-16)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+Alt+[');
      await expect(
        page.locator('.pane-group[data-pane="0"] .cm-foldPlaceholder').first(),
      ).toBeVisible();
      await page.keyboard.press('Control+Alt+]');
      await expect(page.locator('.pane-group[data-pane="0"] .cm-foldPlaceholder')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('FN-03: Lesezeichen (Strg+D, Stern-Status, Sidebar)', () => {
  test('Strg+D merkt die Datei, Stern wird aktiv, Sidebar zeigt den Eintrag', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      const star = page.locator('#btn-bookmarks');
      await expect(star).not.toHaveClass(/is-marked/);
      await page.keyboard.press('Control+d');
      await expect(star).toHaveClass(/is-marked/);
      // Beim ersten Bookmark blendet sich die Sektion automatisch ein.
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-bookmarks');
      await expect(section).toBeVisible();
      await expect(section).toContainText('basis');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('FN-04: Tag-Sidebar-Filter (lokale Query)', () => {
  test('Filter-Eingabe filtert die Tag-Liste ohne neuen Index-Aufbau', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:toggleTags');
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-tags');
      await expect(section).toBeVisible();
      await expect(section).toContainText('beispieltag', { timeout: 15000 });
      const filter = section.locator('input');
      await filter.fill('gibtesnicht');
      await expect(section).not.toContainText('beispieltag');
      await filter.fill('beispiel');
      await expect(section).toContainText('beispieltag');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('FD-01: Neuer Tab und Tab-Schliessen (Strg+W)', () => {
  test('menu:new erzeugt Unbenannt-Tab, Strg+W schliesst ihn', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await sendMenuChannel(app, 'menu:new');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await page.keyboard.press('Control+w');
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FD-02: Recent-Liste fuehrt geoeffnete Dateien', () => {
  test('CLI-geoeffnete Datei steht in recentFiles', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const list = await window.api.getSetting('recentFiles');
            return Array.isArray(list) ? list.join('|') : '';
          }),
        )
        .toContain('basis.md');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('FD-03: Auto-Save speichert nach Tipp-Pause', () => {
  test('mit aktivem Auto-Save landet die Aenderung auf der Platte', async () => {
    // Eigene Arbeitskopie, damit die Fixture unveraendert bleibt.
    const work = path.join(path.dirname(FIXTURE), 'tmp-autosave-4t0195.md');
    fs.writeFileSync(work, '# Autosave-Test\n\nStartinhalt\n');
    const { app, page, userData } = await launchApp({ args: [work] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:toggleAutoSave');
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await page.locator(SEL.btnEdit).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nNEUEZEILE-AUTOSAVE');
      await expect
        .poll(() => fs.readFileSync(work, 'utf8'), { timeout: 15000 })
        .toContain('NEUEZEILE-AUTOSAVE');
      // Tab ist nach Auto-Save nicht mehr dirty.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.unlinkSync(work);
      } catch {
        /* ignore */
      }
    }
  });
});

test.describe('FH-01: Renderer-gebundene Hotkeys (Tabs, Sidebars)', () => {
  test('Strg+Tab wechselt den Tab, Mittelklick schliesst', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS, FIXTURE] });
    try {
      await waitForTab(page);
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      const activeTitle = () => page.locator(SEL.activeTab0).textContent();
      const before = await activeTitle();
      await page.keyboard.press('Control+Tab');
      await expect.poll(activeTitle).not.toBe(before);
      // Mittelklick schliesst den aktiven (zweiten) Tab.
      await page.locator(SEL.tabs0).nth(1).click({ button: 'middle' });
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('Sidebar-Hotkeys (Strg+Umschalt+O/B/T, Strg+;, Strg+Umschalt+L) togglen die Sektionen', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const cases = [
        { key: 'Control+Shift+O', sel: '.sidebar-outgoing' },
        { key: 'Control+Shift+B', sel: '.sidebar-backlinks' },
        { key: 'Control+Shift+T', sel: '.sidebar-tags' },
        { key: 'Control+Shift+L', sel: '.sidebar-bookmarks' },
      ];
      for (const c of cases) {
        const section = page.locator(`.pane-group[data-pane="0"] ${c.sel}`);
        await expect(section).toBeHidden();
        await page.keyboard.press(c.key);
        await expect(section).toBeVisible();
        await page.keyboard.press(c.key);
        await expect(section).toBeHidden();
      }
      // Strg+; (Properties) ist ein Menue-Accelerator — identischer
      // IPC-Pfad des Menue-Klicks (Matrix-Markierung: ipc).
      const props = page.locator('.pane-group[data-pane="0"] .sidebar-properties');
      await expect(props).toBeHidden();
      await sendMenuChannel(app, 'menu:toggleProperties');
      await expect(props).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('FD-04: Word-Count-Dialog', () => {
  test('Klick auf die Statusbar-Anzeige oeffnet den Detail-Dialog', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await page.locator('#statusbar-wordcount').click();
      const modal = page.locator('#wordcount-modal');
      await expect(modal).toBeVisible();
      await expect(modal.locator('#wordcount-table-body tr').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(modal).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});
