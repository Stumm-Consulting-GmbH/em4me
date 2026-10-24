// 4T-002332 (Epic 3E-000264, S9): E2E-Funktions-Suite — Datensätze als Treffer
// der Bereichs-Suche, in der realen Anordnung des Demo-Bereichs.
//
// DB-SUC-01: Die Suche nach «Umberto» zeigt die Datensatz-Gruppe «Library» mit
//            zwei Zeilen, je mit Anzeige-Form, Feld und markiertem Fund.
// DB-SUC-02: Ein Klick auf die Zeile «The Name of the Rose» öffnet das Buch in
//            seiner Maske.
// DB-SUC-03: Im Ersetzen-Modus erscheint keine Datensatz-Gruppe.
//
// **Warum es diese Fälle geben muss, obwohl die Unit-Fälle grün sind.** Die
// Datensatz-Treffer entstehen im Haupt-Prozess aus Index und Tabellen-Leser und
// reisen über den Kanal der Bereichs-Suche in das Panel; der Klick führt über
// das Ereignis der Masken-Seite. Die Unit-Fälle prüfen beide Seiten getrennt,
// nur hier zeigt sich, dass die Verdrahtung im gebauten Ablauf trägt.
//
// **Sprachfrei geprüft:** Tabellen-Name, Anzeige-Form, Feld-Name und Fund
// stammen aus den Daten des Demo-Bereichs (`src/demo/Library.md`), nicht aus
// einer Beschriftung. Der Demo-Bereich entsteht über die Preload-Brücke in
// einem leeren Ordner (Muster `demo-area.spec.js`).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const PANE = '.pane-group[data-pane="0"]';
const PANEL = `${PANE} .sidebar-searchresults`;
const MASKE = `${PANE} .pane-system .db-form-page`;
const DATENSATZ_GRUPPE = `${PANEL} .search-results-group-records`;
const DATENSATZ_ZEILE = `${PANEL} .search-results-item-record`;
const BEGRIFF = 'Umberto';

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

// Demo-Bereich in einem frischen, leeren Ordner anlegen und binden, danach die
// Startseite im selben Fenster öffnen (Reihenfolge nach 4T-001689: erst binden,
// dann das Dokument).
async function starteDemoBereich(app, page) {
  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-db-suche-'));
  const ergebnis = await page.evaluate((p) => window.api.createDemoAreaAt(p), ziel);
  expect(ergebnis.ok).toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
  await oeffneDokumentImFenster(app, page, path.join(ziel, '00 Welcome.md'));
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  return ziel;
}

// Suchleiste öffnen (Strg+F, mit Strg+H die Ersetzen-Zeile) und den Begriff
// eingeben, bis die Datensatz-Gruppe da ist. Der Index des frisch gebundenen
// Bereichs entsteht nebenläufig; ein Suchlauf davor findet die Datensätze noch
// nicht, und erst eine neue Eingabe sucht erneut. Gewartet wird je Eingabe auf
// den Zustand selbst, nicht über eine feste Pause (test/README.md, 4T-001086).
async function sucheBisDatensaetze(page, taste) {
  await page.keyboard.press(taste);
  const eingabe = page.locator('#search-input');
  await expect(eingabe).toBeVisible();
  const gruppe = page.locator(DATENSATZ_GRUPPE);
  await expect
    .poll(
      async () => {
        await eingabe.fill('');
        await eingabe.fill(BEGRIFF);
        return expect(gruppe)
          .toHaveCount(1, { timeout: 5000 })
          .then(
            () => true,
            () => false,
          );
      },
      { timeout: 60000 },
    )
    .toBe(true);
}

test.describe('DB-SUC-01: Datensätze als Gruppe hinter den Dokumenten (4T-002332)', () => {
  test('zeigt die Gruppe «Library» mit Anzeige-Form, Feld und markiertem Fund', async () => {
    test.setTimeout(180000);
    const { app, page, userData } = await launchApp();
    let ziel = null;
    try {
      ziel = await starteDemoBereich(app, page);
      await sucheBisDatensaetze(page, 'Control+f');

      // Die Datensatz-Gruppe steht hinter allen Dokument-Gruppen.
      const koepfe = page.locator(`${PANEL} .search-results-group`);
      const arten = await koepfe.evaluateAll((els) =>
        els.map((el) => el.classList.contains('search-results-group-records')),
      );
      expect(arten[arten.length - 1]).toBe(true);
      expect(arten.indexOf(true)).toBe(arten.length - 1);

      const gruppe = page.locator(DATENSATZ_GRUPPE);
      await expect(gruppe.locator('.search-results-group-title')).toHaveText('Library');
      await expect(gruppe.locator('.search-results-group-count')).toHaveText('2');
      await expect(gruppe.locator('.search-results-group-kind')).toHaveCount(1);

      // Zwei Zeilen, je «Anzeige-Form · Feld: » vor dem Ausschnitt.
      const zeilen = page.locator(DATENSATZ_ZEILE);
      await expect(zeilen).toHaveCount(2);
      const metas = await zeilen
        .locator('.search-results-record-meta')
        .evaluateAll((els) => els.map((el) => el.textContent));
      expect(metas.sort()).toEqual([
        "Foucault's Pendulum · author: ",
        'The Name of the Rose · author: ',
      ]);
      const funde = await zeilen
        .locator('mark.search-results-match')
        .evaluateAll((els) => els.map((el) => el.textContent));
      expect(funde).toEqual([BEGRIFF, BEGRIFF]);
      for (const text of await zeilen.allTextContents()) expect(text).toContain('Umberto Eco');

      // Die Datei «Library» selbst ist kein Dokument-Treffer: Der Name steht
      // nur in ihren Datensatz-Zeilen, und diese sind aus dem Text-Suchraum
      // genommen.
      const dokumentTitel = await page
        .locator(
          `${PANEL} .search-results-group:not(.search-results-group-records) .search-results-group-title`,
        )
        .allTextContents();
      expect(dokumentTitel).not.toContain('Library');
    } finally {
      await closeApp(app, userData);
      if (ziel) removeDir(ziel);
    }
  });
});

test.describe('DB-SUC-02: der Klick öffnet die Maske des Datensatzes (4T-002332)', () => {
  test('ein Klick auf «The Name of the Rose» öffnet das Buch in seiner Maske', async () => {
    test.setTimeout(180000);
    const { app, page, userData } = await launchApp();
    let ziel = null;
    try {
      ziel = await starteDemoBereich(app, page);
      await sucheBisDatensaetze(page, 'Control+f');
      await expect(page.locator(MASKE)).toHaveCount(0);

      await page.locator(DATENSATZ_ZEILE, { hasText: 'The Name of the Rose' }).click();

      const maske = page.locator(MASKE);
      await expect(maske).toBeVisible({ timeout: 20000 });
      await expect(maske.locator('.db-form-heading')).toHaveText('Library');
      await expect(maske.locator('.db-form-record')).toContainText('The Name of the Rose');
    } finally {
      await closeApp(app, userData);
      if (ziel) removeDir(ziel);
    }
  });
});

test.describe('DB-SUC-03: im Ersetzen-Modus keine Datensatz-Gruppe (4T-002332)', () => {
  test('die Ersetzen-Zeile blendet Datensatz-Gruppe und -Zeilen aus', async () => {
    test.setTimeout(180000);
    const { app, page, userData } = await launchApp();
    let ziel = null;
    try {
      ziel = await starteDemoBereich(app, page);
      // Erst ohne Ersetzen bis zur Datensatz-Gruppe: So ist belegt, dass es sie
      // für diesen Begriff gibt, bevor ihr Fehlen etwas aussagt.
      await sucheBisDatensaetze(page, 'Control+f');
      await page.keyboard.press('Control+h');
      await expect(page.locator('#search-replace')).toBeEnabled();
      await expect(page.locator(`${PANEL} .search-results-list`)).toHaveClass(/auswahl-modus/);
      await expect(page.locator(DATENSATZ_GRUPPE)).toHaveCount(0);
      await expect(page.locator(DATENSATZ_ZEILE)).toHaveCount(0);
      // Kein Ankreuzfeld steht für einen Datensatz: Der Begriff steht nur in
      // Datensätzen, also gibt es keines.
      await expect(page.locator(`${PANEL} .search-results-check`)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      if (ziel) removeDir(ziel);
    }
  });
});
