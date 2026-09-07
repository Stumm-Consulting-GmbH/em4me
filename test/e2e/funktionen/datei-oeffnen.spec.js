// 4T-001501 (Epic 3E-000174): E2E-Funktions-Suite des schnellen Datei-Oeffnens.
// DO-01: Strg+T oeffnet das Overlay im Datei-Modus (eigener Titel, fokussiertes
// Eingabefeld, gefuellte Liste), Esc schliesst; DO-02: Oeffnen ueber den
// Menue-Kanal menu:quickOpen (Poll-Muster der Palette-Suite, weil der Listener
// erst am Ende des asynchronen init() steht); DO-03: Namens-Eingabe schrumpft
// die Liste, Enter oeffnet die Datei in einem neuen Reiter; DO-04: eine Eingabe
// ohne Treffer zeigt den Hinweis statt der zuletzt gezeigten Zeilen.
// describe-Titel tragen die Matrix-ID (S-143).
//
// Der Suchraum ist hier bewusst der OHNE-Bereich-Fall: Die App startet mit
// einer einzelnen Datei, und der Index nimmt deren Nachbarschaft. Genau diese
// Lage deckt kein anderer Fall der Suite ab, und sie ist die, in der ein
// Bereichs-gebundener Zugang faelschlich leer bliebe.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'datei-oeffnen.md');

// 4T-001514: Bereichs-Ordner fuer DO-05 (Muster bereiche.spec.js).
function makeAreaDir(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `scg-md-do-${name}-`));
  fs.writeFileSync(path.join(dir, 'Protokoll.md'), '# Protokoll\n\nInhalt.\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'Zwischenstand.md'), '# Zwischenstand\n\nInhalt.\n', 'utf8');
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Verzeichnis bleibt liegen; unkritisch.
  }
}

const MODAL = '#command-palette-modal';
const TITEL = '#command-palette-title';
const FILTER = '#command-palette-filter';
const ITEM = '.command-palette-item';
const LEER = '.template-picker-empty';

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Overlay per Kuerzel oeffnen. Wie bei der Palette wird der Tastendruck
// gepollt, weil der globale Dispatcher erst nach dem Renderer-init reagiert.
// Zusaetzlich wird auf eine gefuellte Liste gewartet: Die Namensquelle stoesst
// den Index-Aufbau erst mit der ersten Abfrage an, und bis er steht, meldet sie
// «wird noch eingelesen» — ein Zustand, der von selbst vergeht.
async function oeffneDateiModus(page) {
  await expect
    .poll(async () => {
      if (!(await page.locator(MODAL).isVisible())) {
        await page.keyboard.press('Control+t');
        return 0;
      }
      const n = await page.locator(ITEM).count();
      if (n === 0) {
        // Index noch nicht bereit: schliessen und erneut oeffnen, damit die
        // Quelle ein zweites Mal gefragt wird.
        await page.keyboard.press('Escape');
        return 0;
      }
      return n;
    })
    .toBeGreaterThan(0);
}

test.describe('DO-01: Strg+T oeffnet den Datei-Modus, Esc schliesst (S-143)', () => {
  test('eigener Titel, fokussiertes Eingabefeld, gefuellte Liste', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await oeffneDateiModus(page);
      await expect(page.locator(MODAL)).toBeVisible();
      // Der Titel unterscheidet den Datei- vom Kommando-Modus: dasselbe Modal,
      // zwei Beschriftungen.
      await expect(page.locator(TITEL)).toHaveText('Datei öffnen');
      await expect
        .poll(() => page.evaluate(() => document.activeElement && document.activeElement.id))
        .toBe('command-palette-filter');

      await page.keyboard.press('Escape');
      await expect(page.locator(MODAL)).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('DO-02: Oeffnen ueber den Menue-Kanal menu:quickOpen (S-143)', () => {
  test('Menue-Weg zeigt dasselbe Modal im Datei-Modus', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await expect
        .poll(async () => {
          if (await page.locator(MODAL).isVisible()) return true;
          await sendMenuChannel(app, 'menu:quickOpen');
          return page.locator(MODAL).isVisible();
        })
        .toBe(true);
      await expect(page.locator(TITEL)).toHaveText('Datei öffnen');

      await page.keyboard.press('Escape');
      await expect(page.locator(MODAL)).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('DO-03: Namens-Eingabe filtert, Enter oeffnet die Datei (S-143)', () => {
  test('„kommando-palette" trifft die Nachbardatei und oeffnet sie', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await oeffneDateiModus(page);
      await page.locator(FILTER).fill('kommando-palette');
      // Genau ein Treffer: Der Name ist in der Nachbarschaft eindeutig.
      await expect(page.locator(ITEM)).toHaveCount(1);
      await expect(page.locator(ITEM).first()).toContainText('kommando-palette');

      await page.keyboard.press('Enter');
      await expect(page.locator(MODAL)).toBeHidden();
      // Die Datei ist in einem Reiter offen — der Nachweis, dass aus dem Namen
      // ein Pfad geworden ist.
      await expect(page.locator(SEL.tabs0).filter({ hasText: 'kommando-palette' })).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('DO-04: Eingabe ohne Treffer zeigt den Hinweis (S-143)', () => {
  test('leere Liste statt der zuletzt gezeigten Zeilen', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await oeffneDateiModus(page);
      await page.locator(FILTER).fill('gibtesganzsichernicht');
      await expect(page.locator(ITEM)).toHaveCount(0);
      await expect(page.locator(LEER)).toHaveText('Keine Datei passt zur Eingabe.');

      await page.keyboard.press('Escape');
      await expect(page.locator(MODAL)).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('DO-05: Bereich ohne offene Datei traegt den Namensraum (S-143)', () => {
  // 4T-001514: Regression aus der Abnahme vom 2026-09-06. Der Zugang war in
  // einem frisch geoeffneten Bereich ohne Reiter gesperrt — also genau dort,
  // wo er am meisten wert ist: Man hat den Bereich eben geoeffnet und sucht die
  // erste Datei. Der Fall laeuft bewusst OHNE CLI-Argument, damit kein Reiter
  // offen ist.
  test('Strg+T findet und oeffnet eine Datei, ohne dass ein Reiter offen ist', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaDir('do05');
    try {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), dir);
      expect(result.boundExisting).toBe(true);
      await expect.poll(() => page.title()).toContain(`(Bereich ${path.basename(dir)})`);
      // Kein Reiter offen — die Ausgangslage des Befunds.
      expect(await page.locator(SEL.tabs0).count()).toBe(0);

      await oeffneDateiModus(page);
      await expect(page.locator(MODAL)).toBeVisible();
      await page.locator(FILTER).fill('protokoll');
      await expect(page.locator(ITEM)).toHaveCount(1);

      await page.keyboard.press('Enter');
      await expect(page.locator(MODAL)).toBeHidden();
      // Aus dem Namen ist ein Pfad geworden, obwohl es keinen Datei-Bezug gab.
      await expect(page.locator(SEL.tabs0).filter({ hasText: 'Protokoll' })).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});
