// B-08 (4T-0935, erhoben im Charter-Durchgang 4T-0899, Pruef-Runde 2): Die
// gerenderte Ansicht zeigt den geschriebenen Stand — auch dort, wo eine
// eingebettete Abfrage das Ergebnis darstellt.
//
// Gemeldeter Ablauf (Product Owner, 2026-08-08): Eine Datei im Quelltext
// aendern und NICHT speichern. Der gerenderte Bereich uebernimmt den neuen
// Stand sofort, die eingebettete Abfrage darin aber nicht — zwei Anteile
// derselben Ansicht zeigten zwei verschiedene Staende desselben Dokuments.
//
// Ursache: Der Markdown-Text kommt aus dem Editor-Puffer, die eingebetteten
// Konstrukte hingen am Index, und der kennt allein die Dateien auf der
// Platte. Der Fix legt eine Puffer-Overlay-Schicht neben den Index; die drei
// Verbraucher der gerenderten Ansicht lesen sie, die uebrigen nicht.
//
// Geprueft wird in der GETEILTEN Ansicht, weil dort Editor und Ergebnis
// gleichzeitig sichtbar sind — genau die Lage der Meldung (Stabilitaetsregel
// 16: der Ansichts-Modus ist Teil des Szenarios).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

// Fence-Body als Array gefuegt, damit die ```-Zaeune nicht mit dem
// JS-Template-Literal kollidieren (Muster frontmatter-abfrage.spec.js).
const QUERY_FENCE = ['```perspective-query', 'bereich = "Privat"', '```'].join('\n');
const TASK_FENCE = ['```perspective-query', 'LIST TASKS', '```'].join('\n');

function makeDir(praefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), praefix));
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// Datei oeffnen, geteilte Ansicht, Bearbeiten an.
async function oeffneGeteiltZumBearbeiten(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await page.locator(SEL.viewBtn('split')).click();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
}

test.describe('B-08: eingebettete Abfrage folgt dem ungespeicherten Stand', () => {
  test('Frontmatter-Aenderung ohne Speichern schlaegt in der Trefferliste durch', async () => {
    const dir = makeDir('scg-md-b08-fm-');
    const datei = path.join(dir, 'Uebersicht.md');
    // Die Datei erfuellt ihre eigene Abfrage zunaechst NICHT.
    fs.writeFileSync(datei, `---\nBereich: Beruf\n---\n# Uebersicht\n\n${QUERY_FENCE}\n`, 'utf8');
    fs.writeFileSync(path.join(dir, 'Alpha.md'), '---\nBereich: Privat\n---\n# Alpha\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [datei] });
    const items = page.locator(`${SEL.markdownBody0} a.perspective-query-item`);
    try {
      await oeffneGeteiltZumBearbeiten(page);
      // Anker: erst belegen, dass die Liste ueberhaupt etwas zeigt und die
      // eigene Datei NICHT enthaelt — sonst misst der Versuch nichts.
      await expect(items).toHaveCount(1, { timeout: 15000 });
      await expect(items.nth(0)).toHaveText('Alpha');

      // Frontmatter im Editor auf den Treffer-Wert aendern, NICHT speichern.
      const zeile = page.locator(`${SEL.editorContent0} .cm-line`, { hasText: 'Bereich: Beruf' });
      await zeile.click();
      await page.keyboard.press('End');
      for (let i = 0; i < 'Beruf'.length; i++) await page.keyboard.press('Backspace');
      await page.keyboard.type('Privat');
      // Der Reiter ist geaendert und ungespeichert.
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();

      // Jetzt gehoert die Datei selbst zur Treffer-Menge.
      await expect(items).toHaveCount(2, { timeout: 15000 });
      await expect(items.nth(1)).toHaveText('Uebersicht');

      // Rueckweg: Aenderung zuruecknehmen, die Liste faellt zurueck.
      await page.keyboard.press('Control+z');
      await expect(items).toHaveCount(1, { timeout: 15000 });
      await expect(items.nth(0)).toHaveText('Alpha');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  test('neue Aufgaben-Zeile ohne Speichern erscheint in LIST TASKS', async () => {
    const dir = makeDir('scg-md-b08-tasks-');
    const datei = path.join(dir, 'Aufgaben.md');
    fs.writeFileSync(datei, `# Aufgaben\n\n- [ ] Erste Aufgabe\n\n${TASK_FENCE}\n`, 'utf8');

    const { app, page, userData } = await launchApp({ args: [datei] });
    const descs = page.locator(
      `${SEL.markdownBody0} .perspective-query-tasks .perspective-query-task-desc`,
    );
    try {
      await oeffneGeteiltZumBearbeiten(page);
      await expect(descs).toHaveCount(1, { timeout: 15000 });
      await expect(descs.nth(0)).toHaveText('Erste Aufgabe');

      // Zweite Aufgabe schreiben, NICHT speichern.
      const zeile = page.locator(`${SEL.editorContent0} .cm-line`, { hasText: 'Erste Aufgabe' });
      await zeile.click();
      await page.keyboard.press('End');
      // Enter setzt die Aufgaben-Liste selbst fort («- [ ] » steht dann schon
      // da); nur die Beschreibung tippen, sonst entsteht ein doppelter Marker.
      await page.keyboard.press('Enter');
      await page.keyboard.type('Zweite Aufgabe');

      await expect(descs).toHaveCount(2, { timeout: 15000 });
      await expect(descs.nth(1)).toHaveText('Zweite Aufgabe');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
