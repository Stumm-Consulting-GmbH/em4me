// 4T-000282/4T-000283 (Epic 3E-000050): E2E-Funktions-Specs der Frontmatter-
// Anzeige — Render-Pane (Zeile, Pin) und Live-Modus (Block-Widget,
// Demaskierung) inklusive Paritäts-Abgleich der beiden Modi.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'frontmatter.md');

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

test.describe('FM-01: Frontmatter-Zeile im Render-Pane', () => {
  test('zusammengeklappte Zeile mit Feldanzahl, Klick pinnt das Klartext-YAML', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const block = page.locator(`${SEL.markdownBody0} .frontmatter-block`);
      await expect(block).toBeVisible();
      // Feldanzahl aus den geparsten Daten (titel, tags, zahl).
      const count = block.locator('.frontmatter-count');
      await expect(count).toHaveAttribute('data-fm-count', '3');
      await expect(count).not.toHaveText('');
      // Zusammengeklappt: YAML-<pre> hat Höhe 0.
      const yaml = block.locator('pre.frontmatter-yaml');
      await expect(yaml).not.toBeVisible();
      // Klick pinnt: Klasse is-pinned, YAML sichtbar mit Original-Inhalt.
      await block.locator('.frontmatter-header').click();
      await expect(block).toHaveClass(/is-pinned/);
      await expect(yaml).toBeVisible();
      await expect(yaml).toContainText('titel: Frontmatter-Fixture');
      // Kein ---Marker im Klartext-YAML.
      await expect(yaml).not.toContainText('---');
      // Erneuter Klick löst den Pin.
      await block.locator('.frontmatter-header').click();
      await expect(block).not.toHaveClass(/is-pinned/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('data-source-line der Body-Elemente zählt Gesamt-Dokument-Zeilen', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      // '# Frontmatter-Anzeige' steht in Zeile 7 des Gesamt-Dokuments
      // (5 Frontmatter-Zeilen + Leerzeile davor). Regression 4T-000282.
      const h1 = page.locator(`${SEL.markdownBody0} h1`);
      await expect(h1).toHaveAttribute('data-source-line', '7');
      const block = page.locator(`${SEL.markdownBody0} .frontmatter-block`);
      await expect(block).toHaveAttribute('data-source-line', '1');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FM-02: Frontmatter-Block-Widget im Live-Modus', () => {
  test('Widget maskiert die YAML-Zeilen, Pfeiltasten-Eintritt demaskiert, Verlassen maskiert', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      // Widget mit der zusammengeklappten Zeile ist da (auch bei
      // Initial-Cursor auf Position 0). Maskiert verschmelzen die fünf
      // Frontmatter-Zeilen zu EINER Editor-Zeile, die das Widget trägt;
      // demaskiert erscheinen die fünf dekorierten Quelltext-Zeilen.
      const widget = page.locator('.cm-live-frontmatter .frontmatter-block');
      await expect(widget).toBeVisible();
      await expect(page.locator('.cm-frontmatter-line')).toHaveCount(1);
      // Tastatur-Eintritt: Editor fokussieren, Cursor von Position 0 in
      // den Block bewegen — demaskiert zum editierbaren Quelltext mit
      // der bestehenden Zeilen-Dekoration.
      await editor.click({ position: { x: 5, y: 200 } });
      await page.keyboard.press('Control+Home');
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('.cm-frontmatter-line')).toHaveCount(5);
      await expect(page.locator('.cm-live-frontmatter')).toHaveCount(0);
      // Verlassen (Cursor ans Dokument-Ende) maskiert wieder.
      await page.keyboard.press('Control+End');
      await expect(page.locator('.cm-live-frontmatter .frontmatter-block')).toBeVisible();
      await expect(page.locator('.cm-frontmatter-line')).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('Parität: Live-Widget nutzt dasselbe Markup wie das Render-Pane', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      const widget = page.locator('.cm-live-frontmatter .frontmatter-block');
      await expect(widget).toBeVisible();
      // Gleiche Struktur-Klassen wie im Render-Pane (eine Markup-Quelle).
      await expect(widget.locator('.frontmatter-header')).toHaveCount(1);
      await expect(widget.locator('.frontmatter-count')).toHaveAttribute('data-fm-count', '3');
      await expect(widget.locator('pre.frontmatter-yaml')).toHaveCount(1);
      // Pin funktioniert im Widget wie im Render-Pane.
      await widget.locator('.frontmatter-header').click();
      await expect(widget).toHaveClass(/is-pinned/);
      await expect(widget.locator('pre.frontmatter-yaml')).toBeVisible();
      // Klick ins aufgeklappte YAML demaskiert zum Quelltext.
      await widget.locator('pre.frontmatter-yaml').click();
      await expect(page.locator('.cm-frontmatter-line').first()).toBeVisible();
      await expect(page.locator('.cm-live-frontmatter')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-000312 (Epic 3E-000055): dauerhaft ausgeklappte Frontmatter-Darstellung
// (Darstellungs-Schalter, Setting render.frontmatterExpanded). Wirkt im
// Render-Pane und im Live-Widget (gleiche Klassen) und damit im PDF.
test.describe('FM-03: Frontmatter dauerhaft ausgeklappt', () => {
  test('Schalter haelt das YAML ohne Hover offen, wirkt im Live-Widget und persistiert', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const block = page.locator(`${SEL.markdownBody0} .frontmatter-block`);
      await expect(block).toBeVisible();
      const yaml = block.locator('pre.frontmatter-yaml');
      // Default: zugeklappt.
      await expect(yaml).not.toBeVisible();

      // Einstellungs-Seite: Schalter im Bereich Darstellung aktivieren.
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return page.locator('.settings-page').count();
        })
        .toBeGreaterThan(0);
      await page.locator('#settings-frontmatter-expanded').check();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);

      // Render-Pane: YAML dauerhaft offen ohne Hover und ohne Pin.
      await expect(page.locator('html')).toHaveClass(/frontmatter-expanded/);
      await expect(yaml).toBeVisible();
      await expect(yaml).toContainText('titel: Frontmatter-Fixture');
      await expect(block).not.toHaveClass(/is-pinned/);
      // Persistiert im Store.
      await expect
        .poll(() => page.evaluate(() => window.api.getSetting('render.frontmatterExpanded')))
        .toBe(true);

      // Live-Modus: Widget-YAML ebenfalls offen.
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      const widget = page.locator('.cm-live-frontmatter .frontmatter-block');
      await expect(widget).toBeVisible();
      await expect(widget.locator('pre.frontmatter-yaml')).toBeVisible();

      // Print-Zustand (PDF): das YAML bleibt im Druck offen und ohne
      // Hoehen-Kappung (max-height none statt der 45vh-Hover-Grenze).
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const printMaxHeight = await page.evaluate(() => {
        document.documentElement.classList.add('printing');
        document.body.classList.add('printing');
        const el = document.querySelector(
          '.pane-group[data-pane="0"] .markdown-body pre.frontmatter-yaml',
        );
        const value = el ? getComputedStyle(el).maxHeight : null;
        document.body.classList.remove('printing');
        document.documentElement.classList.remove('printing');
        return value;
      });
      expect(printMaxHeight).toBe('none');

      // Schalter wieder aus: YAML klappt zu, Hover-/Pin-Verhalten zurueck.
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return page.locator('.settings-page').count();
        })
        .toBeGreaterThan(0);
      await page.locator('#settings-frontmatter-expanded').uncheck();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator('html')).not.toHaveClass(/frontmatter-expanded/);
      await expect(yaml).not.toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
