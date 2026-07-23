// 4T-0173: Regressionstests fuer die Main-Prozess-Fixes.
// Automatisiert: M-04 (BOM), M-13 (Renderer-Reload).
// Manuelle Pruefpfade (im Task dokumentiert): M-01 (Quit-Abbruch),
// M-02/M-03 (zweite Instanz), M-07 (minimiert schliessen), M-12
// (&-Dateiname im Recent-Menue), M-15 (externe Aenderung direkt nach
// Auto-Save), M-16 (Task-Kill).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

test.describe('M-04: UTF-8-BOM bricht Heading und Frontmatter nicht mehr', () => {
  test('BOM-Datei: Frontmatter erkannt, H1 gerendert', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-m04-'));
    const bomFile = path.join(workDir, 'bom.md');
    // BOM zur Laufzeit schreiben (als Repo-Fixture koennte ein Editor/Git
    // das BOM unbemerkt entfernen).
    fs.writeFileSync(bomFile, '﻿---\ntitel: BomTest\n---\n\n# BomHeading\n\nText.\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [bomFile] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      // Heading in Zeile 1 nach dem Frontmatter rendert als H1.
      await expect(page.locator(SEL.markdownBody0).locator('h1')).toHaveText('BomHeading');
      // Frontmatter wird erkannt: Properties zeigen das titel-Feld.
      await page.locator('#btn-properties').click();
      const valueInput = page
        .locator(
          '.pane-group[data-pane="0"] .sidebar-properties .properties-field .properties-field-value input',
        )
        .first();
      await expect(valueInput).toHaveValue('BomTest');
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('M-13: Renderer-Reload lässt das Fenster nicht leer zurück', () => {
  test('Nach page.reload() ist der Tab wieder da', async () => {
    const FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke');
    const { app, page, userData } = await launchApp({ args: [path.join(FIXTURES, 'basis.md')] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();

      // Reload wie ueber DevTools/Strg+R: did-finish-load feuert erneut;
      // der Main muss window:initialState erneut senden (vorher 'once').
      await page.reload();
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/basis/);
      await expect(page.locator(SEL.markdownBody0).locator('h1')).toHaveText('Smoke-Basis');
    } finally {
      await closeApp(app, userData);
    }
  });
});
