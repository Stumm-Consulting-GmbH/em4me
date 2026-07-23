// 4T-0172: Regressionstests fuer die Properties-/Frontmatter-Fixes
// (R5-02 Parse-Fehler-Guard, R5-03 Flush des pending Debounce-Save).
// R5-10 (Duplikat-Keys) ist ueber den Save-Guard abgedeckt; das UI-Szenario
// (Key-Umbenennung auf bestehenden Namen) ist im Task als manueller
// Pruefpfad dokumentiert.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures', 'regression');

const PROPS = {
  panel: '.pane-group[data-pane="0"] .sidebar-properties',
  addBtn: '.pane-group[data-pane="0"] .sidebar-properties .properties-add-btn',
  parseError: '.pane-group[data-pane="0"] .sidebar-properties .properties-parse-error',
  valueInput:
    '.pane-group[data-pane="0"] .sidebar-properties .properties-field .properties-field-value input',
};

function makeWorkDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test.describe('R5-02: Defektes YAML — kein Feld hinzufügen, kein Frontmatter-Verlust', () => {
  test('Add-Button ist deaktiviert, Datei bleibt unverändert', async () => {
    const workDir = makeWorkDir('scg-md-r502-');
    const workFile = path.join(workDir, 'defekt.md');
    fs.copyFileSync(path.join(FIXTURES, 'fm-defekt.md'), workFile);
    const before = fs.readFileSync(workFile, 'utf8');

    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator('#btn-properties').click();
      await expect(page.locator(PROPS.panel)).toBeVisible();

      // Parse-Fehler sichtbar, Add-Button deaktiviert mit Begruendung.
      await expect(page.locator(PROPS.parseError)).toBeVisible();
      await expect(page.locator(PROPS.addBtn)).toBeDisabled();
      const title = await page.locator(PROPS.addBtn).getAttribute('title');
      expect(title && title.length).toBeTruthy();

      // Negativ-Fenster ueber Debounce (500 ms) + Auto-Save-Spielraum:
      // kein Pfad darf das defekte Frontmatter anfassen.
      await page.waitForTimeout(900);
      expect(fs.readFileSync(workFile, 'utf8')).toBe(before);
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('R5-03: Pending Property-Save überlebt den Tab-Wechsel', () => {
  test('Wert tippen, sofort Tab wechseln, zurück — Wert ist übernommen', async () => {
    const workDir = makeWorkDir('scg-md-r503-');
    const fileA = path.join(workDir, 'a.md');
    const fileB = path.join(workDir, 'b.md');
    fs.copyFileSync(path.join(FIXTURES, 'fm-a.md'), fileA);
    fs.copyFileSync(path.join(FIXTURES, 'fm-b.md'), fileB);

    const { app, page, userData } = await launchApp({ args: [fileA, fileB] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await page.locator('#btn-properties').click();
      await expect(page.locator(PROPS.panel)).toBeVisible();

      // Zu Datei A wechseln und den titel-Wert aendern.
      await page.locator(SEL.tabs0).filter({ hasText: 'a' }).first().click();
      const input = page.locator(PROPS.valueInput).first();
      await expect(input).toHaveValue('Alt');
      await input.fill('Neu');

      // Sofort (innerhalb des 500-ms-Debounce) zu B wechseln: der Flush
      // muss die Eingabe in den A-Tab schreiben, bevor die Felder-DOM
      // durch die B-Properties ersetzt wird.
      await page.locator(SEL.tabs0).filter({ hasText: 'b' }).click();
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/b/);

      // Zurueck zu A: der Wert ist uebernommen (Feld zeigt den neuen Stand).
      await page.locator(SEL.tabs0).filter({ hasText: 'a' }).first().click();
      await expect(page.locator(PROPS.valueInput).first()).toHaveValue('Neu');

      // Und der Tab traegt den Wert im Inhalt (dirty, da Auto-Save aus).
      await page.locator(SEL.viewBtn('source')).click();
      expect(await page.locator(SEL.editorContent0).innerText()).toContain('titel: Neu');
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});
