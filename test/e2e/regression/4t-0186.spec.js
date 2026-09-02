// 4T-000186: Modus-Konsistenz Live/Render/Reading — Regressionstests.
//
// MK-01: K-02 — In-Dokument-Anker-Klick im Live-Modus springt zur
//        Heading-Zeile im Editor (lief vorher ins unsichtbare Render-DOM).
// MK-02: K-11 — Task-Checkbox im Reading-Modus toggelt den Quelltext
//        (Dirty-Flag), Paritaet zum Live-Modus.
// MK-03: K-09 — Tag-Klick im Live-Modus blendet die Tag-Sidebar ein
//        (vorher nur im Render-Pane klickbar).
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

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('MK-01: Anker-Sprung im Live-Modus (K-02)', () => {
  test('Klick auf [[#Ziel-Abschnitt]] setzt den Cursor auf die Heading-Zeile', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      // Wiki-Link-Decoration abwarten (Cursor steht initial auf Zeile 1,
      // der Link liegt auf Zeile 3 und ist damit dekoriert).
      const link = page.locator('.cm-live-wikilink').first();
      await expect(link).toBeVisible();
      // 4T-000361: '.pane-source' qualifiziert den Haupt-Editor. Seit 3E-000066
      // (Notizen-Panel, 4T-000398) steht eine zweite, unsichtbare CodeMirror-
      // Instanz (Notiz-Feld) im DOM vor dem Editor; ein generischer
      // '.cm-scroller' traefe sonst die nicht scrollende Notiz-Instanz.
      const scrollBefore = await page.evaluate(() => {
        const sc = document.querySelector('.pane-group[data-pane="0"] .pane-source .cm-scroller');
        return sc ? sc.scrollTop : -1;
      });
      expect(scrollBefore).toBe(0);
      await link.click();
      // K-02: Editor scrollt zur Heading-Zeile weit unten im Dokument
      // (vorher verpuffte der Klick im unsichtbaren Render-DOM) und die
      // Ziel-Zeile ist im Viewport gerendert.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const sc = document.querySelector(
              '.pane-group[data-pane="0"] .pane-source .cm-scroller',
            );
            return sc ? sc.scrollTop : -1;
          }),
        )
        .toBeGreaterThan(100);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const lines = document.querySelectorAll(
              '.pane-group[data-pane="0"] .pane-source .cm-line',
            );
            const sc = document.querySelector(
              '.pane-group[data-pane="0"] .pane-source .cm-scroller',
            );
            const rect = sc.getBoundingClientRect();
            for (const l of lines) {
              if (!l.textContent.includes('## Ziel-Abschnitt')) continue;
              const r = l.getBoundingClientRect();
              if (r.top >= rect.top && r.bottom <= rect.bottom) return true;
            }
            return false;
          }),
        )
        .toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('MK-02: Task-Toggle im Reading-Modus (K-11)', () => {
  test('Checkbox-Klick toggelt den Quelltext und setzt das Dirty-Flag', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await expect(page.locator(SEL.content0)).toHaveClass(/view-rendered/);
      const firstBox = page.locator(`${SEL.markdownBody0} input[type="checkbox"]`).first();
      await expect(firstBox).toBeVisible();
      await expect(firstBox).not.toBeChecked();
      await firstBox.click();
      await expect(firstBox).toBeChecked();
      // Quelltext-Aenderung schlaegt als Dirty-Markierung durch.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('MK-03: Tag-Klick im Live-Modus (K-09)', () => {
  test('Klick auf #beispieltag blendet die Tag-Sidebar ein', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      const tagSection = page.locator('.pane-group[data-pane="0"] .sidebar-tags');
      await expect(tagSection).toBeHidden();
      const tag = page.locator('.cm-live-tag').first();
      await expect(tag).toBeVisible();
      await tag.click();
      await expect(tagSection).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
