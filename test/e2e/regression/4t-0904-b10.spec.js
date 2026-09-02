// B-10 (4T-000904, erhoben im Charter-Durchgang 4T-000899, Pruef-Runde 4): Bei
// offener Quelltext-Suche darf getippter Text nicht auf den Such-Treffer
// abwandern.
//
// Gemeldeter Ablauf (Product Owner, 2026-08-08): Suche offen mit einem
// Begriff, der genau einen Treffer hat; der Cursor steht in einer ANDEREN
// Zeile, dort wird getippt. Das erste Zeichen landet richtig, danach springt
// der Cursor auf den Treffer und alle weiteren Zeichen werden dort eingefuegt
// — aus «Termin» wurde ein «T» an der Cursor-Stelle und ein «ermin» mitten im
// Wort der Treffer-Zeile.
//
// Ursache: Eine Doc-Aenderung invalidiert die Such-Offsets und stoesst eine
// Neu-Ermittlung an. Diese waehlt mangels gueltigem Vorgaenger-Index den
// ersten sichtbaren Treffer und rief setCurrentMatch mit dessen Vorgabe
// scroll=true — das setzt dort die Selektion, also den Cursor des Anwenders.
//
// ZWEI Wege fuehren dorthin, und der erste Fix schloss nur einen: der
// verzoegerte Neuaufbau nach der Doc-Aenderung (scheduleSearchRefresh) UND
// die Render-Pipeline der Vorschau, die am Ende ebenfalls refresht und im
// geteilten Modus bei jedem Tastendruck laeuft. Deshalb pruefen die Faelle
// unten ALLE drei Editor-Modi und nicht nur den Quelltext.
//
// Der Test stellt den GEMELDETEN Ablauf nach (Szenario-Treue), nicht das
// Minimal-Szenario der Ursache: Die Pause nach dem ersten Zeichen ist noetig,
// weil der Neuaufbau hinter einem 150-ms-Debounce liegt — ein Mensch tippt
// langsamer als dieses Fenster, ein Playwright-type() ohne Pause nicht.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

// Der Suchbegriff steht ausschliesslich in der Treffer-Zeile; die Ziel-Zeile
// enthaelt ihn nicht, sonst waere nicht unterscheidbar, wo der Text landet.
const TREFFER_ZEILE = 'Faelligkeit steht in dieser Zeile';
const ZIEL_ZEILE = 'Notiz: ';
const INHALT = [
  '# Probe zu B-10',
  '',
  TREFFER_ZEILE,
  '',
  ZIEL_ZEILE,
  '',
  'Schluss der Datei.',
  '',
].join('\n');

// Der gemeldete Ablauf, ausgefuehrt in einem bestimmten Ansichts-Modus. Der
// Product Owner hat den Fehler in Quelltext, Geteilt UND Live gesehen; die
// erste Fassung dieser Spec prueft nur den Quelltext-Modus und war damit zu
// schmal (Befund vom 2026-08-10).
async function tippeBeiOffenerSuche(page, modus) {
  await page.locator(SEL.viewBtn(modus)).click();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');

  await page.keyboard.press('Control+f');
  await expect(page.locator(SEL.searchBar)).toBeVisible();
  await page.locator(SEL.searchInput).fill('Faelligkeit');
  await expect(page.locator(SEL.searchCount)).toHaveText(/1\s*\/\s*1/);

  const zielZeile = page.locator(`${SEL.editorContent0} .cm-line`, { hasText: ZIEL_ZEILE });
  await zielZeile.click();
  await page.keyboard.press('End');

  await page.keyboard.type('T');
  await page.waitForTimeout(400);
  await page.keyboard.type('ermin');

  return page.locator(SEL.editorContent0).innerText();
}

function pruefeText(text) {
  expect(text).toContain(`${ZIEL_ZEILE}Termin`);
  expect(text).toContain(TREFFER_ZEILE);
  expect(text).not.toContain('erminFaelligkeit');
  expect(text).not.toContain('Faelligkeitermin');
}

// Gegenprobe zur Fix-Richtung: Der Sprung MUSS den Cursor weiterhin bewegen.
// Ohne diesen Fall wuerde ein zu breiter Fix (Cursor-Bewegung ueberall
// abgeschaltet) unbemerkt durchgehen — die Zusicherung traegt nur in beide
// Richtungen (Muster ZS-08 der Zwei-Spalten-Spec).
const SPRUNG_INHALT = [
  '# Sprung-Gegenprobe',
  '',
  'Erstes Ankerwort steht hier oben.',
  '',
  ...Array.from({ length: 40 }, (_, i) => `Fuelltext Zeile ${i + 1}.`),
  '',
  'Zweites Ankerwort steht hier unten.',
  '',
].join('\n');

test.describe('B-10: Tippen bei offener Suche schreibt an der Cursor-Stelle', () => {
  test('Gegenprobe: F3 bewegt den Cursor weiterhin auf den naechsten Treffer', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-b10-sprung-'));
    const workFile = path.join(workDir, 'sprung.md');
    fs.writeFileSync(workFile, SPRUNG_INHALT, 'utf8');

    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');

      // Cursor bewusst an den Dokument-Anfang, weit weg vom zweiten Treffer.
      await page.locator(`${SEL.editorContent0} .cm-line`).first().click();
      await page.keyboard.press('Control+Home');

      await page.keyboard.press('Control+f');
      await expect(page.locator(SEL.searchBar)).toBeVisible();
      await page.locator(SEL.searchInput).fill('Ankerwort');
      await expect(page.locator(SEL.searchCount)).toHaveText(/\/\s*2/);

      // Gemessen wird der Bildlauf, nicht das Tippen: Nach F3 behaelt die
      // Suchleiste bewusst den Tastatur-Fokus (R5-13), ein getipptes Zeichen
      // ginge also ins Suchfeld und wuerde nichts ueber den Cursor aussagen.
      // Selektion und Bildlauf setzt setCurrentMatch im SELBEN dispatch; ein
      // nachweislicher Bildlauf belegt damit, dass der Zweig gelaufen ist.
      const scrollOben = await page
        .locator(`${SEL.paneSource0} .cm-scroller`)
        .evaluate((el) => el.scrollTop);
      expect(scrollOben).toBe(0);

      await page.keyboard.press('F3');
      await expect(page.locator(`${SEL.editorContent0} .cm-search-match-current`)).toHaveCount(1);
      await expect
        .poll(async () =>
          page.locator(`${SEL.paneSource0} .cm-scroller`).evaluate((el) => el.scrollTop),
        )
        .toBeGreaterThan(0);
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });

  for (const modus of ['split', 'live']) {
    test(`${modus}: mehrere Zeichen landen vollstaendig in der Ziel-Zeile`, async () => {
      const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `scg-md-b10-${modus}-`));
      const workFile = path.join(workDir, 'suche-und-tippen.md');
      fs.writeFileSync(workFile, INHALT, 'utf8');

      const { app, page, userData } = await launchApp({ args: [workFile] });
      try {
        await expect(page.locator(SEL.tabs0).first()).toBeVisible();
        pruefeText(await tippeBeiOffenerSuche(page, modus));
      } finally {
        await closeApp(app, userData, { force: true });
        try {
          fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        } catch {}
      }
    });
  }

  test('mehrere Zeichen landen vollstaendig in der Ziel-Zeile, der Treffer bleibt unberuehrt', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-b10-'));
    const workFile = path.join(workDir, 'suche-und-tippen.md');
    fs.writeFileSync(workFile, INHALT, 'utf8');

    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');

      // Suche oeffnen; der Begriff hat genau einen Treffer.
      await page.keyboard.press('Control+f');
      await expect(page.locator(SEL.searchBar)).toBeVisible();
      await page.locator(SEL.searchInput).fill('Faelligkeit');
      await expect(page.locator(SEL.searchCount)).toHaveText(/1\s*\/\s*1/);

      // Cursor ans Ende der Ziel-Zeile setzen, die den Begriff nicht enthaelt.
      const zielZeile = page.locator(`${SEL.editorContent0} .cm-line`, { hasText: ZIEL_ZEILE });
      await zielZeile.click();
      await page.keyboard.press('End');

      // Erstes Zeichen, dann warten: Genau in dieser Pause lief der
      // Neuaufbau, der den Cursor auf den Treffer zog.
      await page.keyboard.type('T');
      await page.waitForTimeout(400);
      await page.keyboard.type('ermin');

      // Der ganze Text steht in der Ziel-Zeile ...
      const text = await page.locator(SEL.editorContent0).innerText();
      expect(text).toContain(`${ZIEL_ZEILE}Termin`);
      // ... und die Treffer-Zeile ist unveraendert.
      expect(text).toContain(TREFFER_ZEILE);
      expect(text).not.toContain('erminFaelligkeit');
      expect(text).not.toContain('Faelligkeitermin');
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});
