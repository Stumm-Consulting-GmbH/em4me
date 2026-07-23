// 4T-0177: Regressionstests fuer die UI-Detail-Fixes: (a) S-01/S-02
// sichtbarer Tastatur-Fokus im Alias-Dialog, (b) R4-05 Bindings der
// zweiten Pane (Properties-Add, Tags-Filter), (c) M-06 Shift-Guard am
// Strg+F-Handler. R5-08 (Multi-Window-Snapshot) bleibt manueller
// Pruefpfad (zweites Fenster mit offenem Settings-Dialog).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

function makeWorkDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test.describe('S-01/S-02: Tastatur-Fokus im Alias-Dialog ist sichtbar', () => {
  test('Fokussierter Kandidat traegt Akzent-Outline und Toenung', async () => {
    const workDir = makeWorkDir('scg-md-s02-');
    fs.writeFileSync(path.join(workDir, 'eins.md'), '---\naliases: [MV]\n---\n# Eins\n', 'utf8');
    fs.writeFileSync(path.join(workDir, 'zwei.md'), '---\naliases: [MV]\n---\n# Zwei\n', 'utf8');
    const quelle = path.join(workDir, 'quelle.md');
    fs.writeFileSync(quelle, '# Quelle\n\nVerweis auf [[MV]].\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [quelle] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      // Index aufbauen (Alias-Resolution nutzt den Backlinks-Index).
      await page.locator('#btn-backlinks').click();
      await expect(page.locator('.pane-group[data-pane="0"] .sidebar-backlinks')).toBeVisible();

      // Klick auf den mehrdeutigen Alias-Link oeffnet den Dialog.
      await page.locator(SEL.markdownBody0).locator('a.wikilink').click();
      await expect(page.locator('#alias-modal')).toBeVisible();
      await expect(page.locator('#alias-candidates button')).toHaveCount(2);

      // Tastatur-Navigation: der fokussierte Kandidat ist visuell
      // unterscheidbar (vorher: outline none + transparente Flaeche).
      await page.keyboard.press('Tab');
      const style = await page.evaluate(() => {
        const el = document.activeElement;
        const cs = getComputedStyle(el);
        return {
          outlineWidth: cs.outlineWidth,
          outlineStyle: cs.outlineStyle,
          bg: cs.backgroundColor,
        };
      });
      expect(style.outlineStyle).toBe('solid');
      // computed width ist DPI-skaliert (z.B. 1.6px bei 125 %) — nur die
      // Existenz einer sichtbaren Outline zaehlt.
      expect(parseFloat(style.outlineWidth)).toBeGreaterThan(1);
      expect(style.bg).not.toBe('rgba(0, 0, 0, 0)'); // --bg-muted ist definiert
      await page.keyboard.press('Escape');
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('R4-05: Bindings der zweiten Pane funktionieren', () => {
  test('Properties-Add und Tags-Filter wirken in Pane 2', async () => {
    const workDir = makeWorkDir('scg-md-r405-');
    fs.writeFileSync(path.join(workDir, 'a.md'), '# A\n\n#alpha und #beta\n', 'utf8');
    fs.writeFileSync(path.join(workDir, 'b.md'), '---\ntitel: B\n---\n# B\n\n#alpha\n', 'utf8');

    const { app, page, userData } = await launchApp({
      args: [path.join(workDir, 'a.md'), path.join(workDir, 'b.md')],
    });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      // b.md (aktiv) nach rechts — Pane 2 entsteht und ist aktiv.
      await page.keyboard.press('Control+Alt+ArrowRight');
      const pane1 = page.locator('.pane-group[data-pane="1"]');
      await expect(pane1).toBeVisible();

      // Properties-Add in Pane 2: Button erzeugt ein Feld (vorher tot).
      await page.locator('#btn-properties').click();
      const addBtn = pane1.locator('.sidebar-properties .properties-add-btn');
      await expect(addBtn).toBeVisible();
      const fieldsBefore = await pane1.locator('.properties-field').count();
      await addBtn.click();
      await expect(pane1.locator('.properties-field')).toHaveCount(fieldsBefore + 1);

      // Tags-Filter in Pane 2: Index ueber das Backlinks-Panel aufbauen,
      // dann filtert die Tag-Liste auf die Eingabe (vorher toter Input).
      await page.locator('#btn-backlinks').click();
      await page.locator('#btn-tags').click();
      const tagsTree = pane1.locator('.sidebar-tags .tags-tree');
      await expect(tagsTree.locator('.tags-tree-item')).toHaveCount(2); // alpha, beta
      await pane1.locator('.sidebar-tags .tags-filter').fill('bet');
      await expect(tagsTree.locator('.tags-tree-item')).toHaveCount(1);
      await expect(tagsTree.locator('.tags-tree-name').first()).toHaveText(/beta/);
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('M-06: Strg+Umschalt+F öffnet nicht die Suche', () => {
  test('Fokus-Modus toggelt, Suchleiste bleibt zu', async () => {
    const FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke');
    const { app, page, userData } = await launchApp({ args: [path.join(FIXTURES, 'basis.md')] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.keyboard.press('Control+Shift+F');
      await expect(page.locator('body')).toHaveClass(/focus-mode/);
      await expect(page.locator(SEL.searchBar)).toBeHidden();
      // Zuruecksetzen (Esc verlaesst den Fokus-Modus).
      await page.keyboard.press('Escape');
      await expect(page.locator('body')).not.toHaveClass(/focus-mode/);
    } finally {
      await closeApp(app, userData);
    }
  });
});
