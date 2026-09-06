// 4T-001346 (Epic 3E-000239): E2E-Funktions-Specs des Zellsprungs in der
// gerenderten Pipe-Tabelle. Geprueft wird die Bewegung selbst — Tabulator vor
// und zurueck, die Zeilen-Grenzen, das Tabellen-Ende und die Pfeiltasten an den
// Zell-Raendern — an der Zelle, die dabei sichtbar zur bearbeiteten wird.
//
// Die Zellen der ersten Fixture-Tabelle in Dokument-Reihenfolge:
// 0 A, 1 B, 2 C (Kopf); 3 a1, 4 b1, 5 c1; 6 a2, 7 (leer), 8 c2.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'tabellen-klick.md');

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

async function liveBearbeiten(app, page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await sendMenuChannel(app, 'menu:viewChange', 'live');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

const ersteTabelle = (page) => page.locator(`${SEL.editorContent0} .cm-live-block table`).first();
const eingabe = (page) => page.locator('.cm-live-tabelle-eingabe');

// Index der bearbeiteten Zelle unter allen Zellen der Tabelle, oder -1.
async function markierteZelle(page) {
  return await ersteTabelle(page).evaluate((t) =>
    Array.from(t.querySelectorAll('th, td')).findIndex((c) =>
      c.classList.contains('cm-live-tabelle-bearbeitet'),
    ),
  );
}

// Zelle mit dem gegebenen Index oeffnen.
async function oeffneZelle(page, index) {
  await ersteTabelle(page).locator('th, td').nth(index).click();
  await expect(eingabe(page)).toBeVisible();
  await expect.poll(() => markierteZelle(page)).toBe(index);
}

async function spring(page, taste) {
  await page.keyboard.press(taste);
  await expect(eingabe(page)).toBeVisible();
}

test.describe('TS-01: Tabulator in derselben Zeile', () => {
  test('springt in die naechste Zelle (AK1, AK9)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await expect(ersteTabelle(page)).toBeVisible();
      await oeffneZelle(page, 4); // b1
      await spring(page, 'Tab');
      await expect.poll(() => markierteZelle(page)).toBe(5); // c1
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TS-02: Tabulator ueber die Zeilen-Grenze', () => {
  test('springt vom Zeilenende in die erste Zelle der naechsten Zeile (AK2)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await expect(ersteTabelle(page)).toBeVisible();
      await oeffneZelle(page, 5); // c1, letzte Zelle der ersten Datenzeile
      await spring(page, 'Tab');
      await expect.poll(() => markierteZelle(page)).toBe(6); // a2
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TS-03: Umschalt und Tabulator', () => {
  test('springt zurueck, am Zeilenanfang in die letzte Zelle der vorigen Zeile (AK3)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await expect(ersteTabelle(page)).toBeVisible();
      await oeffneZelle(page, 6); // a2, erste Zelle der zweiten Datenzeile
      await spring(page, 'Shift+Tab');
      await expect.poll(() => markierteZelle(page)).toBe(5); // c1
      await spring(page, 'Shift+Tab');
      await expect.poll(() => markierteZelle(page)).toBe(4); // b1
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TS-04: Ende der Tabelle', () => {
  test('legt in der letzten Zelle keine neue Zeile an (AK4)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await expect(ersteTabelle(page)).toBeVisible();
      const zeilenVorher = await ersteTabelle(page).evaluate(
        (t) => t.querySelectorAll('tbody tr').length,
      );
      await oeffneZelle(page, 8); // c2, letzte Zelle der Tabelle
      await spring(page, 'Tab');
      await expect.poll(() => markierteZelle(page)).toBe(8);
      expect(await ersteTabelle(page).evaluate((t) => t.querySelectorAll('tbody tr').length)).toBe(
        zeilenVorher,
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TS-05: Trennzeile und Kopfzeile', () => {
  test('der Sprung erreicht die Kopfzeile und ueberspringt die Trennzeile (AK6)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await expect(ersteTabelle(page)).toBeVisible();
      await oeffneZelle(page, 2); // Kopfzelle C
      await spring(page, 'Tab');
      // Ohne Zwischenstopp in der Trennzeile direkt in die erste Datenzeile.
      await expect.poll(() => markierteZelle(page)).toBe(3); // a1
      await spring(page, 'Shift+Tab');
      await expect.poll(() => markierteZelle(page)).toBe(2);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TS-06: Pfeiltasten an den Zell-Raendern', () => {
  test('bewegen im Zell-Text und treten an dessen Raendern ueber (AK5)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await expect(ersteTabelle(page)).toBeVisible();
      await oeffneZelle(page, 4); // b1
      // Schreibmarke ans Ende, dann ueber den rechten Rand.
      await page.keyboard.press('End');
      await spring(page, 'ArrowRight');
      await expect.poll(() => markierteZelle(page)).toBe(5); // c1
      // Von dort ueber den linken Rand zurueck — die Marke steht dann am ENDE
      // der vorigen Zelle, sonst liefe die Pfeiltaste nur von Anfang zu Anfang.
      await page.keyboard.press('Home');
      await spring(page, 'ArrowLeft');
      await expect.poll(() => markierteZelle(page)).toBe(4);
      const markePosition = await eingabe(page).evaluate((e) => e.selectionStart);
      expect(markePosition).toBe(2); // hinter "b1"
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TS-07: Pfeiltasten hoch und runter', () => {
  test('bleiben in der Spalte (AK5)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await expect(ersteTabelle(page)).toBeVisible();
      await oeffneZelle(page, 4); // b1
      await spring(page, 'ArrowDown');
      await expect.poll(() => markierteZelle(page)).toBe(7); // leere Zelle darunter
      await spring(page, 'ArrowUp');
      await expect.poll(() => markierteZelle(page)).toBe(4);
      await spring(page, 'ArrowUp');
      await expect.poll(() => markierteZelle(page)).toBe(1); // Kopfzelle B
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TS-08: Tabulator ausserhalb der Tabelle', () => {
  test('behaelt seine bisherige Wirkung (AK7)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      const absatz = page
        .locator(`${SEL.editorContent0} .cm-line`)
        .filter({ hasText: 'Absatz nach der Tabelle.' })
        .first();
      await absatz.click();
      await page.keyboard.press('Home');
      await page.keyboard.press('Tab');
      // Kein Zell-Editor, und die Zeile hat eine Einrueckung bekommen.
      await expect(eingabe(page)).toHaveCount(0);
      await expect
        .poll(async () =>
          page.evaluate(() =>
            Array.from(document.querySelectorAll('.cm-editor .cm-line')).some(
              (z) => z.textContent !== z.textContent.trimStart(),
            ),
          ),
        )
        .toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TS-09: Sprung uebernimmt die Eingabe', () => {
  test('der getippte Text steht nach dem Sprung im Quelltext (AK1, AK9)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await expect(ersteTabelle(page)).toBeVisible();
      await oeffneZelle(page, 4); // b1
      await page.keyboard.press('Control+a');
      await page.keyboard.type('gesprungen');
      await spring(page, 'Tab');
      await expect.poll(() => markierteZelle(page)).toBe(5);
      await expect
        .poll(async () =>
          ersteTabelle(page).evaluate(
            (t) => t.querySelectorAll('tbody tr')[0].querySelectorAll('td')[1].textContent,
          ),
        )
        .toBe('gesprungen');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
