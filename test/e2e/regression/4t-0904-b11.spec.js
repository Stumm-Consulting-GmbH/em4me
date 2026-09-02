// B-11 (4T-000904, Nebenbefund; erhoben im Charter-Durchgang 4T-000899,
// Pruef-Runde 4): Der Aufgaben-Dialog brach ohne bearbeitbaren Editor STILL
// ab, waehrend er auf einer Nicht-Task-Zeile einen Hinweis zeigt. Dieselbe
// Funktion schwieg also im einen Fall und erklaerte sich im anderen.
//
// Die Leitfrage der Pruef-Runde 4 lautete, ob eine Funktion den fehlenden
// Bezug verstaendlich meldet, statt zu schweigen. Genau das prueft dieser
// Fall — in beide Richtungen, damit ein zu breiter Fix (Hinweis immer oder
// nie) nicht durchgeht.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const INHALT = [
  '# Aufgaben',
  '',
  '- [ ] Erste Aufgabe',
  '',
  'Freitext-Zeile ohne Aufgabe.',
  '',
].join('\n');
const HINWEIS = '#statusbar-hint';
const DIALOG = '#task-dialog-modal';

function legeDatei() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-b11-'));
  const datei = path.join(dir, 'aufgaben.md');
  fs.writeFileSync(datei, INHALT, 'utf8');
  return { dir, datei };
}

test.describe('B-11: der Aufgaben-Dialog erklaert sich statt zu schweigen', () => {
  test('ohne Bearbeiten-Modus erscheint ein Hinweis statt eines stillen Abbruchs', async () => {
    const { dir, datei } = legeDatei();
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      // Quelltext-Ansicht OHNE Bearbeiten: der Editor ist read-only.
      await page.locator(SEL.viewBtn('source')).click();
      await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).toHaveClass(
        /read-only/,
      );

      await page.keyboard.press('Control+Alt+KeyA');

      await expect(page.locator(DIALOG)).toBeHidden();
      await expect(page.locator(HINWEIS)).not.toBeEmpty({ timeout: 5000 });
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });

  test('Gegenprobe: mit Bearbeiten-Modus oeffnet dasselbe Kuerzel den Dialog', async () => {
    const { dir, datei } = legeDatei();
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');

      await page.locator(`${SEL.editorContent0} .cm-line`, { hasText: 'Erste Aufgabe' }).click();
      await page.keyboard.press('Control+Alt+KeyA');

      await expect(page.locator(DIALOG)).toBeVisible({ timeout: 5000 });
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
});

// B-13 (4T-000904, vom Product Owner in der Test-Iteration zu B-11 gemeldet):
// Die fluechtige Meldung darf die Statusleiste weder verbreitern noch etwas in
// ihr verdecken. Zwei Versuche innerhalb der Leiste sind daran gescheitert
// (erst schob sie, dann verdeckte sie die Knoepfe der Mitte); die Entscheidung
// des Product Owners vom 2026-08-10 legt sie deshalb UEBER die Leiste.
//
// Der Fall prueft ALLE drei Richtungen. Die ersten beiden Fassungen dieser
// Zusicherung trugen nicht: Die eine mass die Position eines einzelnen Kindes
// (blieb auch ohne Fix gruen), die andere nur die Breite (liess die
// Ueberlagerung durch). Ein Fix, der ein Element aus dem Fluss nimmt, kann
// nicht mehr schieben, dafuer aber verdecken — beides gehoert geprueft.
test.describe('B-13: die Statusleisten-Meldung schiebt und verdeckt nichts', () => {
  test('Breite unveraendert, keine Ueberlappung, Lage mittig darueber', async () => {
    const { dir, datei } = legeDatei();
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.viewBtn('source')).click();
      const gruppe = page.locator('.statusbar-right');
      await expect(gruppe).toBeVisible();

      const vorher = await gruppe.evaluate((el) => Math.round(el.getBoundingClientRect().width));
      await page.keyboard.press('Control+Alt+KeyA');
      await expect(page.locator(HINWEIS)).not.toBeEmpty({ timeout: 5000 });
      await expect(page.locator(HINWEIS)).toHaveClass(/visible/);

      // 1. Nichts wird verschoben: die Zone behaelt ihre Breite.
      const waehrend = await gruppe.evaluate((el) => Math.round(el.getBoundingClientRect().width));
      expect(waehrend).toBe(vorher);

      const lage = await page.evaluate(() => {
        const hint = document.getElementById('statusbar-hint');
        const leiste = document.querySelector('.statusbar');
        if (!hint || !leiste) return null;
        const h = hint.getBoundingClientRect();
        const l = leiste.getBoundingClientRect();
        return {
          ueberlappt: h.right > l.left && h.left < l.right && h.bottom > l.top && h.top < l.bottom,
          darueber: Math.round(h.bottom) <= Math.round(l.top),
          hoehe: Math.round(h.height),
          // Abstand der beiden Mittelpunkte: mittig heisst nahe null.
          mittenVersatz: Math.abs(Math.round(h.left + h.width / 2 - (l.left + l.width / 2))),
        };
      });
      // 2. Nichts wird verdeckt: kein Schnitt mit der Leiste.
      expect(lage.ueberlappt).toBe(false);
      // 3. Und sie liegt tatsaechlich darueber, statt irgendwo zu stehen.
      expect(lage.darueber).toBe(true);
      expect(lage.hoehe).toBeGreaterThan(0);
      // 4. Und sie steht mittig, statt im Rand unterzugehen (PO-Entscheidung
      // vom 2026-08-10 nach dem ersten Blick auf die schwebende Fassung).
      expect(lage.mittenVersatz).toBeLessThanOrEqual(2);
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
});
