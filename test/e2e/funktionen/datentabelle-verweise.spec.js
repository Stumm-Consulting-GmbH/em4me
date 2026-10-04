// 4T-002014 (Epic 3E-000332): Verweise und Schlagworte in Text-Zellen der
// Datentabelle — Anzeige und Klick in allen drei Ansichten, Vorrang des
// Verweises vor der Zell-Bearbeitung (Entscheidung F2 a des Product Owners vom
// 2026-09-28). describe-Titel tragen die Funktions-IDs (DV-01 …).
//
// Eigene Datei mit eigener Fall-Familie statt DT-17 und DT-18 in
// datentabelle.spec.js, wie der Plan des Tasks sie nannte: Jene Datei wurde
// gleichzeitig von einem zweiten Bearbeiter geändert, und parallele Arbeit
// verlangt disjunkte Datei-Mengen.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const PANE = '.pane-group[data-pane="0"]';

// Pro Fall ein Wegwerf-Ordner mit dem Ziel und dem Dokument mit Datentabelle.
// Der breite Spaltenkopf lässt rechts neben dem Verweis freien Platz in der
// Zelle, in den der Klick «daneben» trifft.
function makeFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-datentabelle-verweise-'));
  fs.writeFileSync(path.join(dir, 'Ziel.md'), '# Ziel\n\nZiel-Dokument.\n', 'utf8');
  fs.writeFileSync(
    path.join(dir, 'Dokument.md'),
    [
      '# Dokument',
      '',
      '```perspective-datatable',
      'columns: Verweis-Spalte-mit-breitem-Kopf:text, Betrag:number(2)',
      '| [[Ziel]] | 12.5 |',
      '| #projekt | 3 |',
      '```',
      '',
    ].join('\n'),
    'utf8',
  );
  return dir;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Zurück zum Reiter des Dokuments; seine Ansicht bleibt erhalten.
async function zurueckZumDokument(page) {
  await page.locator(SEL.tabs0).filter({ hasText: 'Dokument' }).click();
  await expect(page.locator(SEL.activeTab0)).toContainText('Dokument');
}

// Klick in den freien Teil der Zelle rechts neben dem Verweis.
async function klickDaneben(zelle) {
  const box = await zelle.boundingBox();
  await zelle.click({ position: { x: box.width - 6, y: box.height / 2 } });
}

test.describe('DV-01: Verweis in der Zelle in Lese-, geteilter und Live-Ansicht anklickbar, Klick daneben bearbeitet', () => {
  test('der Klick auf den Verweis oeffnet das Ziel, der Klick daneben die Bearbeitung', async () => {
    const dir = makeFixtureDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'Dokument.md')] });
    try {
      await waitForTab(page);

      // Lese-Ansicht (Voreinstellung einer geöffneten Datei).
      const lesen = page.locator(SEL.markdownBody0).locator('.perspective-datatable');
      const verweisLesen = lesen.locator('tr[data-dt-row="0"] td[data-dt-col="0"] a.wikilink');
      await expect(verweisLesen).toHaveText('Ziel');
      await verweisLesen.click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Ziel');

      // Geteilte Ansicht: Verweis folgt dem Klick, daneben öffnet die Zelle.
      await zurueckZumDokument(page);
      await page.locator(SEL.viewBtn('split')).click();
      const geteilt = page.locator(SEL.markdownBody0).locator('.perspective-datatable');
      const zelleGeteilt = geteilt.locator('tr[data-dt-row="0"] td[data-dt-col="0"]');
      await zelleGeteilt.locator('a.wikilink').click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Ziel');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      await zurueckZumDokument(page);
      const zelleWieder = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-datatable tr[data-dt-row="0"] td[data-dt-col="0"]');
      await expect(zelleWieder.locator('a.wikilink')).toBeVisible();
      await klickDaneben(zelleWieder);
      const eingabe = page.locator(SEL.markdownBody0).locator('input.pdt-cell-input');
      await expect(eingabe).toBeVisible();
      // Die Bearbeitung zeigt den geschriebenen Text, nicht die Anzeige.
      await expect(eingabe).toHaveValue('[[Ziel]]');
      await eingabe.press('Escape');
      await expect(zelleWieder.locator('a.wikilink')).toBeVisible();

      // Live-Ansicht: derselbe Verweis im Block-Widget.
      await page.locator(SEL.viewBtn('live')).click();
      const live = page.locator(`${SEL.editorContent0} .perspective-datatable`).first();
      const zelleLive = live.locator('tr[data-dt-row="0"] td[data-dt-col="0"]');
      await expect(zelleLive.locator('a.wikilink')).toBeVisible({ timeout: 15000 });
      await zelleLive.locator('a.wikilink').click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Ziel');
      await zurueckZumDokument(page);
      const zelleLiveWieder = page
        .locator(`${SEL.editorContent0} .perspective-datatable`)
        .first()
        .locator('tr[data-dt-row="0"] td[data-dt-col="0"]');
      await expect(zelleLiveWieder.locator('a.wikilink')).toBeVisible({ timeout: 15000 });
      await klickDaneben(zelleLiveWieder);
      const eingabeLive = page.locator(`${SEL.editorContent0} input.pdt-cell-input`);
      await expect(eingabeLive).toBeVisible();
      await expect(eingabeLive).toHaveValue('[[Ziel]]');
      await eingabeLive.press('Escape');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DV-02: Schlagwort in der Zelle oeffnet die Schlagwort-Uebersicht', () => {
  test('der Klick auf das Schlagwort zeigt die Uebersicht mit dem Schlagwort als Filter', async () => {
    const dir = makeFixtureDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'Dokument.md')] });
    try {
      await waitForTab(page);
      const schlagwort = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-datatable tr[data-dt-row="1"] td[data-dt-col="0"] a.tag-link');
      await expect(schlagwort).toHaveText('#projekt');
      await expect(schlagwort).toHaveAttribute('href', '#tag:projekt');
      await schlagwort.click();
      const uebersicht = page.locator(`${PANE} .sidebar-tags`);
      await expect(uebersicht).toBeVisible();
      await expect(uebersicht.locator('.tags-files-header-tag')).toHaveText('#projekt', {
        timeout: 15000,
      });
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
