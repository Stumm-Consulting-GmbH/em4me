// 4T-002227 (Epic 3E-000356): Gemeinsame Helfer der Ablauf-Prüfungen zur Seite
// «Arbeitsbereiche». Zwei Prüfdateien brauchen sie — die Bestands-Fälle in
// `arbeitsbereiche.spec.js` (WS-05 bis WS-08, auf die Seite umgestellt) und die
// neuen Fälle in `arbeitsbereiche-seite.spec.js` —, und ein Weg zur Seite, der in
// beiden Dateien eigens stünde, liefe beim nächsten Umbau auseinander.
'use strict';

const { expect } = require('@playwright/test');
const { hauptSenden } = require('./haupt-zugriff');

// Die Seite steht im System-Bereich einer Spalte. Ohne Spalten-Bindung, weil
// die Seite in der aktiven Spalte entsteht und je Fenster höchstens einmal da
// ist (Muster der System-Seiten).
const SEITE = '.pane-system .workspaces-page';

/**
 * Öffnet die Seite über den Kanal des Menüpunkts «Datei → Arbeitsbereiche →
 * Arbeitsbereiche verwalten…» und wartet, bis sie steht.
 *
 * Gesendet wird an das Fenster GENAU DIESER Seite (`app.browserWindow(page)`),
 * nicht an `getAllWindows()[0]`: Mehrere Fälle legen Arbeitsbereiche mit eigenem
 * Fenster an, und ein Send an ein fremdes Fenster sähe aus wie eine kaputte
 * Oberfläche (Befund aus 4T-001753). Gepollt wird, weil ein Send vor dem Ende
 * der asynchronen Initialisierung verfällt; erneut gesendet wird nur, solange
 * die Seite fehlt — ein zweiter Send auf eine offene Seite aktivierte sie bloß.
 *
 * @param {import('@playwright/test').ElectronApplication} app
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>} die Seite
 */
async function oeffneArbeitsbereicheSeite(app, page) {
  const seite = page.locator(SEITE);
  const fenster = await app.browserWindow(page);
  await expect
    .poll(
      async () => {
        if ((await seite.count()) === 0) {
          await hauptSenden(fenster, (w) => w.webContents.send('menu:workspaceManage'));
        }
        return seite.count();
      },
      { intervals: [500, 500, 1000, 1000] },
    )
    .toBe(1);
  await expect(seite).toBeVisible();
  return seite;
}

/**
 * Öffnet die Kommando-Palette dieses Fensters (falls nötig), filtert nach
 * `text` und liefert die Zahl der Treffer. Für `expect.poll` gebaut: Solange
 * die Palette noch nicht steht, kommt -1 zurück, und der nächste Durchlauf
 * sendet erneut (Muster KP-02). Die Palette bleibt offen; der Fall schließt
 * sie selbst oder wählt den Treffer.
 *
 * @param {import('@playwright/test').ElectronApplication} app
 * @param {import('@playwright/test').Page} page
 * @param {string} text Filtertext, wie ihn ein Anwender tippt
 * @returns {Promise<number>} Zahl der Treffer oder -1
 */
async function paletteTreffer(app, page, text) {
  const modal = page.locator('#command-palette-modal');
  if (!(await modal.isVisible())) {
    const fenster = await app.browserWindow(page);
    await hauptSenden(fenster, (w) => w.webContents.send('menu:openCommandPalette'));
    if (!(await modal.isVisible())) return -1;
  }
  await page.locator('#command-palette-filter').fill(text);
  return page.locator('.command-palette-item').count();
}

module.exports = { SEITE, oeffneArbeitsbereicheSeite, paletteTreffer };
