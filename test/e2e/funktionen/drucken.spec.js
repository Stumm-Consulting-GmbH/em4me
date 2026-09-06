// 4T-001479 (Epic 3E-000177): E2E-Funktions-Suite — Drucken (DR-01 bis DR-05).
//
// Der Druckdialog des Betriebssystems ist per Playwright nicht bedienbar — wie
// der Save-Dialog der PDF-Ausgabe. Die Specs ersetzen deshalb
// `webContents.print` im Main-Prozess durch einen Stub, der die uebergebenen
// Optionen mitschreibt und den Callback mit einem festen Ausgang bedient
// (Erfolg, Abbruch, Fehler). Der Dialog selbst bleibt manueller Test.
//
// Geprueft wird damit alles bis zum Dialog: dass der Weg ueberhaupt laeuft,
// dass er die Ansichts-Regel erbt, dass der Print-Zustand danach vollstaendig
// abgebaut ist und dass ein Abbruch nichts meldet.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'pdf-export.md');

// webContents.print im Main-Prozess ersetzen. Die Aufrufe landen in einem
// globalen Marker, damit die Ausloese-Schleife weiss, wann der Weg gelaufen
// ist — dieselbe Mechanik wie der Dialog-Zaehler in pdf-export.spec.js.
async function stubPrint(app, ausgang) {
  await app.evaluate(({ BrowserWindow }, payload) => {
    globalThis.__printCalls = [];
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.print = (options, callback) => {
        globalThis.__printCalls.push(options);
        callback(payload.success, payload.failureReason);
      };
    }
  }, ausgang);
}

function printCalls(app) {
  return app.evaluate(() => (globalThis.__printCalls || []).length);
}

function printOptions(app) {
  return app.evaluate(() => (globalThis.__printCalls || [])[0] || null);
}

// Kommando Strg+P mit Poll ausloesen, bis der Druck-Weg gelaufen ist (der
// Dispatcher ist erst nach dem asynchronen init() aktiv). WICHTIG: nach dem
// ersten Treffer NICHT weiter druecken — jeder weitere Druck startet einen
// neuen Lauf, dessen printing-Zustand die Statusbar verstecken wuerde.
async function triggerPrintOnce(page, app) {
  await expect
    .poll(
      async () => {
        await page.keyboard.press('Control+P');
        return printCalls(app);
      },
      { timeout: 30000 },
    )
    .toBeGreaterThan(0);
}

test.describe('DR-01: Druck aus der gerenderten Ansicht', () => {
  test('Systemdialog wird mit den Export-Einstellungen aufgerufen, Zustand danach sauber', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect(page.locator(`${SEL.markdownBody0} .mermaid-block svg`)).toBeVisible({
        timeout: 20000,
      });
      await stubPrint(app, { success: true });
      await triggerPrintOnce(page, app);

      // Vorbelegung aus den Export-Einstellungen (Vorgaben A4/Hochformat).
      const options = await printOptions(app);
      expect(options).toBeTruthy();
      expect(options.pageSize).toBe('A4');
      expect(options.landscape).toBe(false);
      expect(options.printBackground).toBe(true);
      expect(options.margins.marginType).toBe('custom');
      // Was der Systemdialog waehlt, wird nicht vorbelegt (Entscheidung E3).
      expect(options.deviceName).toBeUndefined();
      expect(options.copies).toBeUndefined();

      // Ruecknahme: Print-Zustand abgebaut, Erfolgs-Hinweis ohne Fehler-Marke.
      await expect(page.locator('body.printing')).toHaveCount(0);
      await expect(page.locator('#statusbar-hint')).not.toHaveClass(/error/);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('DR-02: Abbruch im Systemdialog', () => {
  test('Abbruch meldet keinen Fehler und laesst die Anwendung bedienbar', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await stubPrint(app, { success: false, failureReason: 'cancelled' });
      await triggerPrintOnce(page, app);

      await expect(page.locator('#statusbar-hint')).not.toHaveClass(/error/);
      await expect(page.locator('body.printing')).toHaveCount(0);
      // App bleibt bedienbar: Ansichts-Wechsel wirkt.
      await page.locator(SEL.viewBtn('source')).click();
      await expect(page.locator(SEL.content0)).toHaveClass(/view-source/);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('DR-03: Fehlschlag beim Drucken', () => {
  test('ein echter Fehler zeigt den roten Statusbar-Hinweis', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await stubPrint(app, { success: false, failureReason: 'Invalid printer settings' });
      await triggerPrintOnce(page, app);

      await expect(page.locator('#statusbar-hint.error.visible')).toBeVisible({ timeout: 15000 });
      // Print-Zustand ist trotz Fehler vollstaendig zurueckgenommen.
      await expect(page.locator('body.printing')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('DR-04: Druck aus der Quelltext-Ansicht', () => {
  test('der Druck folgt der aktiven Ansicht und stellt sie danach wieder her', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect(page.locator(`${SEL.markdownBody0} .mermaid-block svg`)).toBeVisible({
        timeout: 20000,
      });
      await page.locator(SEL.viewBtn('source')).click();
      await expect(page.locator(SEL.content0)).toHaveClass(/view-source/);

      await stubPrint(app, { success: true });
      await triggerPrintOnce(page, app);

      // Modus-Wiederherstellung: Quelltext-Ansicht wieder aktiv, Editor
      // sichtbar, Print-Zustand und Quelltext-Print-Block abgebaut.
      await expect(page.locator(SEL.content0)).toHaveClass(/view-source/);
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect(page.locator('body.printing')).toHaveCount(0);
      await expect(page.locator('body.printing-source')).toHaveCount(0);
      await expect(page.locator('.pdf-source-print')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('DR-05: Strg+P im Editor-Fokus (Messung zu 4T-000024)', () => {
  test('das Kuerzel greift auch, wenn die Schreibmarke im Editor steht', async () => {
    // Die Auflage aus Entscheidung E5 des Epics: 4T-000024 hat 2026 notiert,
    // CodeMirror greife Strg+P im Edit-Modus — deshalb war der PDF-Export auf
    // Strg+Umschalt+P ausgewichen. Dieser Fall misst es am laufenden Programm,
    // mit der Schreibmarke IM Editor statt nur im gerenderten Pane.
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await page.locator(SEL.viewBtn('source')).click();
      await expect(page.locator(SEL.content0)).toHaveClass(/view-source/);
      // Schreibmarke in den Editor setzen und den Fokus belegen.
      await page.locator(SEL.editorContent0).click();
      await expect
        .poll(async () => page.evaluate(() => !!document.activeElement?.closest?.('.cm-editor')))
        .toBe(true);

      await stubPrint(app, { success: true });
      await triggerPrintOnce(page, app);
      expect(await printCalls(app)).toBeGreaterThan(0);
      await expect(page.locator('body.printing')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});
