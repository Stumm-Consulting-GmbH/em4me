// 4T-002334 (Epic 3E-000264, S9): E2E-Funktions-Suite — das Masken-Dokument
// übersteht Beenden und Neustart mit demselben Profil.
//
// DB-SIT-01: Ein Buch in der Maske und zwei Dokumente sind offen; nach dem
//            Neustart steht die Maske mit demselben Datensatz an derselben
//            Stelle im Dokument-Streifen, und der aktive Reiter ist derselbe.
// DB-SIT-02: Zwischen Beenden und Neustart verschwindet der Datensatz aus der
//            Tabellen-Datei; die Maske kommt mit dem Hinweis und dem Handgriff
//            «Tabelle öffnen» zurück, der die Tabellen-Datei öffnet.
// DB-SIT-03: Beim Neustart ist die Erweiterung «Datenbank» aus; die Maske
//            fehlt, ihr Eintrag ruht und übersteht ein weiteres Sichern. Beim
//            nächsten Start mit eingeschalteter Erweiterung ist sie zurück.
//
// **Warum es diese Fälle geben muss, obwohl die Unit-Fälle grün sind.** Den
// Eintrag schreibt die Anzeige, der Haupt-Prozess legt ihn in der Sitzung ab
// und reicht ihn beim Start zurück, und die Wiederherstellung öffnet die Maske
// über den Kanal des Datensatzes. Die Unit-Fälle prüfen die Glieder einzeln;
// nur hier zeigt sich, dass die Kette über einen echten Neustart trägt.
//
// **Sprachfrei geprüft:** Titel und Kennung stammen aus den Daten des
// Demo-Bereichs (`src/demo/Library.md`), Knöpfe werden über ihre Klasse
// gefunden. Der Demo-Bereich entsteht über die Preload-Brücke in einem leeren
// Ordner (Muster `datenbank-suche.spec.js`); neu gestartet wird nach dem Muster
// von SM-09 (`app.quit()`, danach `launchApp({ userData })`).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { hauptSenden } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');

const PANE = '.pane-group[data-pane="0"]';
const MASKE = `${PANE} .pane-system .db-form-page`;
const KENNUNG = 'r-00003';
const BUCH = 'Solaris';
const WILLKOMMEN = '00 Welcome.md';
const ZWEITES = '01 Markdown Basics.md';

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

// Demo-Bereich in einem frischen, leeren Ordner anlegen und binden, danach die
// Startseite öffnen (Reihenfolge nach 4T-001689: erst binden, dann das Dokument).
async function starteDemoBereich(app, page) {
  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-db-sitzung-'));
  const ergebnis = await page.evaluate((p) => window.api.createDemoAreaAt(p), ziel);
  expect(ergebnis.ok).toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
  await oeffneDokumentImFenster(app, page, path.join(ziel, WILLKOMMEN));
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  return ziel;
}

// Das Buch über die Verdrahtungs-Schnittstelle der Maske öffnen und warten,
// bis sie den Datensatz zeigt.
async function oeffneBuchInMaske(page, ziel) {
  await page.evaluate(
    ({ filePath, recordId }) =>
      document.dispatchEvent(new CustomEvent('scg:open-form', { detail: { filePath, recordId } })),
    { filePath: path.join(ziel, 'Library.md'), recordId: KENNUNG },
  );
  const maske = page.locator(MASKE);
  await expect(maske).toBeVisible({ timeout: 20000 });
  await expect(maske.locator('.db-form-record')).toContainText(BUCH);
}

// Die Titel des Dokument-Streifens der ersten Spalte, in Streifen-Reihenfolge.
async function streifen(page) {
  return await page.locator(SEL.tabs0).locator('.tab-title').allTextContents();
}

const istMaske = (titel) => titel.includes(BUCH) || titel.includes(KENNUNG);

// Sauber beenden (before-quit persistiert die Sitzung) und warten, bis der
// Prozess wirklich weg ist (Muster SM-09).
async function beende(app) {
  await hauptSenden(app, ({ app: electronApp }) => electronApp.quit());
  await app.waitForEvent('close');
}

test.describe('DB-SIT-01: die Maske kehrt an ihre Stelle zurück (4T-002334)', () => {
  test('nach dem Neustart steht dasselbe Buch an derselben Stelle', async () => {
    test.setTimeout(240000);
    const first = await launchApp();
    const userData = first.userData;
    let ziel = null;
    let second = null;
    try {
      ziel = await starteDemoBereich(first.app, first.page);
      await oeffneBuchInMaske(first.page, ziel);
      await oeffneDokumentImFenster(first.app, first.page, path.join(ziel, ZWEITES));
      await expect(first.page.locator(MASKE)).not.toBeVisible();
      const vorher = await streifen(first.page);
      // Vorbedingung: Die Maske steht nicht am Ende, sonst prüfte der Fall die
      // Stelle nicht, an der die Wiederherstellung sie einsetzt.
      const stelle = vorher.findIndex(istMaske);
      expect(stelle).toBeGreaterThanOrEqual(0);
      expect(stelle).toBeLessThan(vorher.length - 1);
      const aktiv = await first.page.locator(SEL.activeTab0).locator('.tab-title').textContent();
      await beende(first.app);

      second = await launchApp({ userData });
      await expect.poll(() => streifen(second.page), { timeout: 30000 }).toEqual(vorher);
      await expect(second.page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(aktiv);
      // Der Reiter zeigt dasselbe Buch.
      await second.page.locator(SEL.tabs0).nth(stelle).click();
      const maske = second.page.locator(MASKE);
      await expect(maske).toBeVisible({ timeout: 20000 });
      await expect(maske.locator('.db-form-heading')).toHaveText('Library');
      await expect(maske.locator('.db-form-record')).toContainText(BUCH);
    } finally {
      if (second) await closeApp(second.app, null);
      await closeApp(first.app, userData);
      if (ziel) removeDir(ziel);
    }
  });
});

test.describe('DB-SIT-02: fehlt der Datensatz, bleibt die Maske mit Hinweis (4T-002334)', () => {
  test('nach dem Löschen des Datensatzes zeigt die Maske den Hinweis und «Tabelle öffnen»', async () => {
    test.setTimeout(240000);
    const first = await launchApp();
    const userData = first.userData;
    let ziel = null;
    let second = null;
    try {
      ziel = await starteDemoBereich(first.app, first.page);
      await oeffneBuchInMaske(first.page, ziel);
      await beende(first.app);

      // Den Block des Datensatzes aus der Tabellen-Datei entfernen.
      const tabelle = path.join(ziel, 'Library.md');
      const text = fs.readFileSync(tabelle, 'utf8');
      const ohne = text.replace(/\|- id="r-00003"\r?\n[\s\S]*?(?=\|- id="r-00004")/, '');
      expect(ohne).not.toBe(text);
      expect(ohne).not.toContain(`id="${KENNUNG}"`);
      fs.writeFileSync(tabelle, ohne, 'utf8');

      second = await launchApp({ userData });
      const maske = second.page.locator(MASKE);
      await expect(maske).toBeVisible({ timeout: 30000 });
      const lage = maske.locator('.db-form-lage');
      await expect(lage).toBeVisible({ timeout: 20000 });
      await expect(lage).toContainText(KENNUNG);
      await expect(lage).toContainText('Library');
      // Der Weg zur Tabelle: die Kopf-Datei kommt als Reiter dazu.
      const knopf = maske.locator('.db-form-actions .db-form-open-table');
      await expect(knopf).toBeVisible();
      await expect(maske.locator('.db-form-edit')).toHaveCount(0);
      const anzahl = await second.page.locator(SEL.tabs0).count();
      await knopf.click();
      await expect(second.page.locator(SEL.tabs0)).toHaveCount(anzahl + 1);
      await expect(second.page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(
        /^Library(\.md)?$/,
      );
    } finally {
      if (second) await closeApp(second.app, null);
      await closeApp(first.app, userData);
      if (ziel) removeDir(ziel);
    }
  });
});

test.describe('DB-SIT-03: bei ausgeschalteter Datenbank ruht der Eintrag (4T-002334)', () => {
  test('ohne Datenbank keine Maske, nach dem Wiedereinschalten ist sie zurück', async () => {
    test.setTimeout(300000);
    const first = await launchApp();
    const userData = first.userData;
    let ziel = null;
    let second = null;
    let third = null;
    try {
      ziel = await starteDemoBereich(first.app, first.page);
      await oeffneBuchInMaske(first.page, ziel);
      const vorher = await streifen(first.page);
      const stelle = vorher.findIndex(istMaske);
      expect(stelle).toBeGreaterThanOrEqual(0);
      await beende(first.app);

      // Zweiter Start mit ausgeschalteter Erweiterung (Profil-Vorbelegung).
      second = await launchApp({
        userData,
        settings: { language: 'de', extensions: { disabled: ['database'] } },
      });
      await expect(second.page.locator(SEL.tabs0).first()).toBeVisible({ timeout: 30000 });
      await expect.poll(() => streifen(second.page)).toEqual(vorher.filter((t) => !istMaske(t)));
      // Ein weiteres Dokument löst ein Sichern aus; der ruhende Eintrag fließt mit.
      await oeffneDokumentImFenster(second.app, second.page, path.join(ziel, ZWEITES));
      await expect(second.page.locator(SEL.tabs0)).toHaveCount(vorher.length);
      await beende(second.app);
      second = null;

      // Dritter Start mit eingeschalteter Erweiterung: die Maske ist zurück.
      third = await launchApp({
        userData,
        settings: { language: 'de', extensions: { disabled: [] } },
      });
      await expect
        .poll(async () => (await streifen(third.page)).findIndex(istMaske), { timeout: 30000 })
        .toBe(stelle);
      await expect(third.page.locator(SEL.tabs0)).toHaveCount(vorher.length + 1);
      await third.page.locator(SEL.tabs0).nth(stelle).click();
      const maske = third.page.locator(MASKE);
      await expect(maske).toBeVisible({ timeout: 20000 });
      await expect(maske.locator('.db-form-record')).toContainText(BUCH);
    } finally {
      if (third) await closeApp(third.app, null);
      if (second) await closeApp(second.app, null);
      await closeApp(first.app, userData);
      if (ziel) removeDir(ziel);
    }
  });
});
