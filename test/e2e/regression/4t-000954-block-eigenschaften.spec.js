// 4T-000954 (Epic 3E-000198): Block-Eigenschaften auf dem GESCHRIEBENEN Stand —
// Befund E-09 der Erhebung 4T-000936.
//
// Der Befund war am Code belegt und nicht gemessen; die Erhebung sagt das
// ausdrücklich. Diese Datei holt die Messung nach und ist zugleich der Prüffall
// aus AK3.
//
// Die Eigenheit des Falls: Die Eigenschaften liegen in der Begleitdatei, der
// Anker dagegen im Dokument. Ungespeichert ist also nicht die Eigenschaft,
// sondern ihr Bezugspunkt. Der Ablauf des Anwenders lautet deshalb: einen Anker
// frisch tippen, für den die Begleitdatei bereits Eigenschaften führt — und
// sehen, ob sie ohne Speichern erscheinen.
//
// **Ergebnis der Messung (2026-09-06): Der Befund besteht nicht.** Beide
// Darstellungen zeigen die Eigenschaften ohne Speichern. Die Fälle bleiben
// trotzdem stehen — als Zusicherung dessen, was gemessen wurde; ohne sie
// wäre die nächste Sitzung wieder auf die Code-Bewertung angewiesen, die den
// Befund seinerzeit hervorgebracht hat.
//
// Gemessen wird an den WERTEN der Eingabefelder und nicht am Text des
// Panels: Schlüssel und Wert einer Eigenschaft stehen in `input`-Elementen
// und tauchen im `textContent` ihres Containers nicht auf. Die erste Fassung
// prüfte den Text und war deshalb rot, obwohl das Panel das Richtige
// anzeigte — ein Fehlschlag aus dem falschen Grund wiegt so schwer wie ein
// Erfolg aus dem falschen Grund.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FELDER = '.pane-group[data-pane="0"] .block-props-fields';
const ANKERWAHL = '.pane-group[data-pane="0"] .block-props-anchor-select';
const INDIKATOR = '.pane-group[data-pane="0"] .pane-rendered .block-meta-indicator';

// Die Werte der Eigenschafts-Zeilen. Sie stehen in Eingabefeldern, nicht im
// Text des Containers — siehe der Hinweis im Kopf.
function feldWerte(page) {
  return page
    .locator(FELDER)
    .evaluate((el) => [...el.querySelectorAll('input, textarea')].map((e) => e.value));
}

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

// Eine Datei samt Begleitdatei, deren blockData den Anker `^probe` mit einer
// Eigenschaft führt. Der Anker steht im Dokument NOCH NICHT — genau das ist die
// Vorrichtung: Er wird im Test getippt und nicht gespeichert.
function baueDatei(dir) {
  const datei = path.join(dir, 'Notiz.md');
  fs.writeFileSync(datei, '# Notiz\n\nErster Absatz.\n', 'utf8');
  const mdd = JSON.stringify({
    schemaVersion: 1,
    history: { anchors: [], packets: [] },
    blockData: {
      probe: { values: { status: 'gemessen' }, updated: '2026-09-06T08:00:00Z' },
    },
  });
  fs.writeFileSync(path.join(dir, 'Notiz.mdd'), mdd, 'utf8');
  return datei;
}

async function bearbeitenAn(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await page.locator(SEL.viewBtn('split')).click();
  const huelle = page.locator(SEL.paneSourceEditor0);
  await expect(huelle).toBeVisible();
  if (await huelle.evaluate((el) => el.classList.contains('read-only'))) {
    await page.locator(SEL.btnEdit).click();
  }
  await expect(huelle).not.toHaveClass(/read-only/);
}

test.describe('BE: Block-Eigenschaften auf geschriebenem Stand (4T-000954)', () => {
  test('E-09 ein frisch getippter Anker bringt seine Eigenschaften mit', async () => {
    const dir = makeDir('scg-md-be09-');
    const datei = baueDatei(dir);

    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await bearbeitenAn(page);
      await page.locator('#btn-blockprops').click();

      // Anker der Messung: Das Panel ist da und kennt den Anker noch NICHT —
      // er steht ja weder im Dokument noch sonstwo im Text.
      await expect(page.locator(ANKERWAHL)).toBeVisible({ timeout: 20000 });
      await expect(page.locator(ANKERWAHL)).not.toContainText('probe');

      // Den Anker frisch tippen, NICHT speichern.
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n\nZweiter Absatz. ^probe');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();

      // Auf der Platte steht der Anker nicht.
      expect(fs.readFileSync(datei, 'utf8')).not.toContain('^probe');

      // Der Anker ist zugeordnet und nicht mehr verwaist …
      await expect(page.locator(ANKERWAHL)).toHaveValue('probe', { timeout: 15000 });

      // … und seine Eigenschaften aus der Begleitdatei stehen im Panel.
      await expect
        .poll(() => feldWerte(page), { timeout: 15000, intervals: [300] })
        .toEqual(expect.arrayContaining(['status', 'gemessen']));
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // Zweite Darstellung derselben Daten: der Indikator in der gerenderten
  // Spalte. Er hängt an einem anderen Weg als das Panel (Post-Prozessor der
  // Render-Pipeline statt Panel-Kontext) und ist deshalb eigens zu messen.
  test('E-09 der Indikator erscheint am frisch getippten Anker', async () => {
    const dir = makeDir('scg-md-be09b-');
    const datei = baueDatei(dir);

    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await bearbeitenAn(page);

      // Anker der Messung: Ohne den Anker im Text gibt es keinen Indikator.
      await expect(page.locator(SEL.markdownBody0).first()).toContainText('Erster Absatz', {
        timeout: 15000,
      });
      expect(await page.locator(INDIKATOR).count()).toBe(0);

      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n\nZweiter Absatz. ^probe');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();

      await expect(page.locator(INDIKATOR).first()).toBeVisible({ timeout: 15000 });
      expect(fs.readFileSync(datei, 'utf8')).not.toContain('^probe');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
