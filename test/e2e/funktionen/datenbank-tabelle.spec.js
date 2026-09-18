// 4T-001547 (Epic 3E-000251, E3.7): Der Datensatz-Block der Datenbank in der
// realen Anordnung — Lese-Ansicht und Änderungs-Modus.
//
// **Warum es diese Fälle geben muss, obwohl die Unit-Tests grün sind.** Zwei
// Zusagen dieses Vorgangs lassen sich ausschließlich hier nachweisen:
//
//   1. Die Spalten stehen im **Frontmatter** und nicht in der Fence. Im
//      Änderungs-Modus rendert das Live-Widget einen Block **isoliert**; ohne
//      den eigens mitgegebenen Vorspann sähe es die Definition nie und zeigte
//      eine Folge unbenannter Werte, während die Lese-Ansicht eine Tabelle
//      zeigt. Ein jsdom-Fall kann das nicht zeigen, weil er den Editor nicht
//      hat.
//   2. Die Darstellung hängt an einem eigenen Stylesheet. Ein Unit-Test liest
//      HTML als Zeichenkette und kennt die CSS-Kaskade nicht — genau die
//      Divergenz-Klasse, die den Abnahme-Befund von 1.116.0 verursacht hat.
'use strict';

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
  'datenbank-tabelle.md',
);

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('DB-01: Datensatz-Block rendert mit den Spalten aus dem Frontmatter', () => {
  test('Kopf aus der Definition, typisierte Zellen, Fehler-Zelle behält ihren Rohtext', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const block = page.locator(SEL.markdownBody0).locator('.perspective-records').first();
      await expect(block).toBeVisible();

      // Der Kopf kommt aus dem Frontmatter: `label` gewinnt, sonst der Name.
      const koepfe = block.locator('th.prc-head');
      await expect(koepfe).toHaveCount(4);
      await expect(koepfe.nth(0)).toHaveText('Name');
      await expect(koepfe.nth(1)).toHaveText('menge');

      // Vier Datensätze, jeder mit seiner Kennung an der Zeile.
      await expect(block.locator('tr.prc-row')).toHaveCount(4);
      await expect(block.locator('tr[data-rec-id="r-00001"]')).toHaveCount(1);

      // Typisiert dargestellt: Nachkommastellen aus der Definition, Haken
      // statt `x`.
      const erste = block.locator('tr.prc-row').first();
      await expect(erste.locator('td.prc-type-number')).toHaveText('12.50');
      await expect(erste.locator('td.prc-type-boolean')).not.toBeEmpty();

      // Die beiden unpassenden Werte behalten ihren Rohtext und sind
      // gekennzeichnet — kein stiller Verlust (E3.7).
      const fehler = block.locator('td.prc-error');
      await expect(fehler).toHaveCount(2);
      await expect(fehler.first()).toHaveText('zwoelf');
      await expect(fehler.nth(1)).toHaveText('2026-02-31');

      // Der Befund am unvollständigen vierten Datensatz wird gemeldet.
      await expect(block.locator('.prc-hint[data-rec-code="recordCellsMissing"]')).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('die Fehler-Zelle ist optisch hervorgehoben, nicht nur ausgezeichnet', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const zelle = page.locator(SEL.markdownBody0).locator('td.prc-error').first();
      await expect(zelle).toBeVisible();
      // Ohne das eigene Stylesheet bliebe die Zelle unauffällig; der Fall
      // prüft deshalb die gerechnete Farbe und nicht die Klasse.
      const hintergrund = await zelle.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(hintergrund).not.toBe('rgba(0, 0, 0, 0)');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DB-02: Änderungs-Modus zeigt dieselbe Tabelle', () => {
  test('das Live-Widget kennt die Definition seiner Datei und baut denselben Kopf', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('live')).click();
      const block = page.locator(`${SEL.editorContent0} .perspective-records`).first();
      await expect(block.locator('table.prc-table')).toBeVisible({ timeout: 15000 });

      // Derselbe Kopf wie in der Lese-Ansicht — der Nachweis, dass der
      // Vorspann beim isoliert gerenderten Block ankommt.
      const koepfe = block.locator('th.prc-head');
      await expect(koepfe).toHaveCount(4);
      await expect(koepfe.nth(0)).toHaveText('Name');
      await expect(block.locator('tr.prc-row')).toHaveCount(4);
      await expect(block.locator('tr.prc-row').first().locator('td.prc-type-number')).toHaveText(
        '12.50',
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
