// 4T-000171: Regressionstests fuer die Suchen/Ersetzen-Fixes (R5-01, R5-04,
// R5-09). R5-05/R5-06 (KaTeX-/SVG-Filter im TreeWalker) sind reine
// Filter-Erweiterungen und ueber den Snapshot-/Render-Pfad in 3E-000041
// breiter abgedeckt; hier zaehlt der Korruptions- und UI-Zustands-Schutz.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke');
const BASIS = path.join(FIXTURES, 'basis.md');

test.describe('R5-01: Ersetzen nach Zwischen-Tippen nutzt keine veralteten Offsets', () => {
  test('Alle ersetzen nach Editor-Eingabe ersetzt exakt die echten Vorkommen', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-r501-'));
    const workFile = path.join(workDir, 'ersetzen.md');
    fs.writeFileSync(workFile, 'alpha eins\nalpha zwei\nalpha drei\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');

      // Replace-Modus oeffnen (Strg+H, Renderer-Handler im Edit-Modus).
      await page.keyboard.press('Control+h');
      await expect(page.locator(SEL.searchBar)).toBeVisible();
      await page.locator(SEL.searchInput).fill('alpha');
      await expect(page.locator(SEL.searchCount)).toHaveText(/3/);
      await page.locator('#search-replace').fill('beta');

      // Zwischen-Tippen am Dokument-Anfang verschiebt alle Offsets um sechs
      // Zeichen UND erhoeht die Trefferzahl auf 4 — der Zaehler-Wechsel auf
      // "/ 4" ist das eindeutige sichtbare Signal, dass der re-aufgebaute
      // Treffer-Stand (nicht der alte) vorliegt.
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+Home');
      await page.keyboard.type('alpha ');
      await expect(page.locator(SEL.searchCount)).toHaveText(/\/ 4/);

      await page.locator('#btn-search-replace-all').click();

      // Exakt die vier alpha-Vorkommen ersetzt, kein Fremdtext zerstoert
      // (der alte Bug haette mit sechs Zeichen Versatz korrumpiert).
      const text = await page.locator(SEL.editorContent0).innerText();
      expect(text).toContain('beta beta eins');
      expect(text).toContain('beta zwei');
      expect(text).toContain('beta drei');
      expect(text).not.toContain('alpha');
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('R5-04: Such-Debounce überlebt das Schließen nicht', () => {
  test('Tippen und sofort Esc — keine Highlights nach Ablauf des Debounce', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.keyboard.press('Control+f');
      await expect(page.locator(SEL.searchBar)).toBeVisible();

      // fill loest das input-Event (Debounce-Start) aus; sofort schliessen.
      await page.locator(SEL.searchInput).fill('Smoke');
      await page.keyboard.press('Escape');
      await expect(page.locator(SEL.searchBar)).toBeHidden();

      // Negativ-Fenster: bewusst ueber die Debounce-Dauer (150 ms) hinaus
      // warten und die Abwesenheit nachlaufender Highlights pruefen.
      await page.waitForTimeout(350);
      await expect(page.locator('.mdv-match')).toHaveCount(0);
      await expect(page.locator(SEL.searchBar)).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('R5-09: Replace-UI ist außerhalb von Source+Edit deaktiviert', () => {
  test('Wechsel von Source+Edit nach Reading disabled die Replace-Bedienelemente', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await page.keyboard.press('Control+h');
      await expect(page.locator(SEL.searchBar)).toBeVisible();

      // Im Source+Edit-Kontext bedienbar.
      await expect(page.locator('#btn-search-replace')).toBeEnabled();
      await expect(page.locator('#btn-search-replace-all')).toBeEnabled();

      // Wechsel in den Reading-Modus: Replace wird deaktiviert, Tooltip nennt
      // den Grund. Ueber den Menue-IPC-Pfad, weil die geoeffnete Suchleiste
      // die Statusbar-View-Buttons ueberdeckt (Pointer-Interception).
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('menu:viewChange', 'rendered');
      });
      await expect(page.locator('#btn-search-replace')).toBeDisabled();
      await expect(page.locator('#btn-search-replace-all')).toBeDisabled();
      await expect(page.locator('#search-replace')).toBeDisabled();
      const title = await page.locator('#btn-search-replace').getAttribute('title');
      expect(title && title.length).toBeTruthy();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
