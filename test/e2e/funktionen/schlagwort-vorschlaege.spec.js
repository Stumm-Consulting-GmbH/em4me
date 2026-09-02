// 4T-001357 (Epic 3E-000238): Reihenfolge der Schlagwort-Vorschläge.
//
// Gemessen wird an der **angezeigten** Liste, nicht an der Auswahl-Regel
// dahinter — dieselbe Ebene wie bei den Verweis-Zielen in
// verweis-vorschlaege.spec.js, und aus demselben Grund: Der Fehler entsteht
// erst im Zusammenspiel mit der Vervollständigungs-Bibliothek.
//
// describe-Titel tragen die Matrix-IDs aus test/abdeckungs-matrix.json (F-040).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const TOOLTIP = '.cm-tooltip-autocomplete';
const LABEL = '.cm-tooltip-autocomplete .cm-completionLabel';

// Ein Bereich, in dem `#bau-zzz` viermal und `#bau-aaa` einmal vorkommt.
//
// **Die beiden Namen sind gleich lang, und das ist der Kern der Vorrichtung.**
// Der erste Entwurf nahm verschieden lange Namen und war deshalb auch gegen
// den alten Code grün: Der Treffer-Vergleich der Bibliothek bevorzugt den
// kürzeren Namen und traf damit zufällig dieselbe Reihenfolge wie die
// Häufigkeit. Bei gleicher Länge liegen beide Treffer für sie gleichauf, der
// Gleichstand fällt ans Alphabet — und dort trennen sich alte und neue
// Ordnung. Aufgefallen ist das an der Rot-Probe, nicht am Nachdenken.
function baueBereich() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-schlagworte-'));
  const schreibe = (name, inhalt) => fs.writeFileSync(path.join(dir, `${name}.md`), inhalt, 'utf8');
  schreibe('Notiz', '# Notiz\n\nText ohne Schlagwort.\n');
  for (let i = 1; i <= 4; i++) schreibe(`Oft${i}`, `# Oft ${i}\n\nText #bau-zzz dazu.\n`);
  schreibe('Selten', '# Selten\n\nText #bau-aaa dazu.\n');
  return { dir, notiz: path.join(dir, 'Notiz.md') };
}

async function enterEditSource(app, page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send('menu:viewChange', 'source');
  });
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
  await page.keyboard.press('Control+End');
}

// B-18 (4T-000187): Der erste Trigger stößt den Index-Aufbau an und liefert noch
// 'indexing'. Nachtriggern, bis Vorschläge erscheinen; danach ist die Zeile
// wieder leer und der eigentliche Ablauf beginnt gegen einen fertigen Index.
async function waermeIndexAuf(page) {
  const tooltip = page.locator(TOOLTIP);
  await page.keyboard.type('\n#b');
  await expect
    .poll(
      async () => {
        if (await tooltip.first().isVisible()) return true;
        await page.keyboard.press('Backspace');
        await page.keyboard.type('b');
        return tooltip.first().isVisible();
      },
      { timeout: 30000, intervals: [400] },
    )
    .toBe(true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Backspace');
  await expect(tooltip.first()).toBeHidden();
}

test.describe('SV-01: Schlagwort-Vorschlaege folgen der Haeufigkeit (F-040)', () => {
  test('das haeufigere Schlagwort steht oben, obwohl es alphabetisch hinten steht', async () => {
    const { dir, notiz } = baueBereich();
    const { app, page, userData } = await launchApp({ args: [notiz] });
    try {
      await enterEditSource(app, page);
      await waermeIndexAuf(page);

      await page.keyboard.type('#bau');
      await expect(page.locator(TOOLTIP).first()).toBeVisible({ timeout: 10000 });

      // Erwartet ist die Häufigkeits-Folge. Stünde hier «bau-aaa» zuerst,
      // hätte die Bibliothek wieder selbst sortiert — der Befund aus 4T-001339.
      const beschriftungen = await page.locator(LABEL).allTextContents();
      expect(beschriftungen.slice(0, 2)).toEqual(['bau-zzz', 'bau-aaa']);
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
      }
    }
  });
});

test.describe('SV-02: die Liste verkleinert sich mit der Eingabe (F-040)', () => {
  test('ein weiteres Zeichen laesst nur noch das passende Schlagwort stehen', async () => {
    const { dir, notiz } = baueBereich();
    const { app, page, userData } = await launchApp({ args: [notiz] });
    try {
      await enterEditSource(app, page);
      await waermeIndexAuf(page);

      await page.keyboard.type('#bau');
      await expect(page.locator(LABEL)).toHaveCount(2, { timeout: 10000 });
      await page.keyboard.type('-a');
      await expect(page.locator(LABEL)).toHaveCount(1, { timeout: 10000 });
      expect(await page.locator(LABEL).first().textContent()).toBe('bau-aaa');

      // Und beim Löschen wächst sie wieder an.
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await expect(page.locator(LABEL)).toHaveCount(2, { timeout: 10000 });
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
      }
    }
  });
});
