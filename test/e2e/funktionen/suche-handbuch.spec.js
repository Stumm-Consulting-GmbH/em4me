// 4T-000760 (Epic 3E-000142): Suche über das ganze Handbuch.
//
// Kern der Zusage: Wer in einer Handbuch-Seite sucht, findet auch, was auf
// einer ANDEREN, nicht geöffneten Seite steht. Geprüft werden der
// Trefferraum, der Sprung aus der Liste, der Grenz-Durchlauf mit F3, das
// abgeschaltete Ersetzen und die Rückkehr zum Dokument-Verhalten.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const PANEL = '.pane-group[data-pane="0"] .sidebar-searchresults';

function makeWorkFile() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-suche-handbuch-'));
  const workFile = path.join(workDir, 'arbeit.md');
  // Der Begriff steht bewusst NICHT im Dokument: So ist jeder Treffer im
  // Handbuch-Raum eindeutig dem Handbuch zuzuordnen.
  fs.writeFileSync(workFile, '# Arbeitsdatei\n\nOhne den gesuchten Begriff.\n', 'utf8');
  return workFile;
}

async function openManualPage(page, pageId) {
  await page.evaluate((id) => {
    document.dispatchEvent(new CustomEvent('scg:open-manual-page', { detail: { pageId: id } }));
  }, pageId);
}

// Die Tastatur-Bindings stehen erst am Ende des asynchronen init(); ein
// sichtbarer Reiter ist das Bereitschafts-Signal (Muster der Smoke-Suite).
async function warteAufReiter(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

async function oeffneHandbuchSeite(page, pageId) {
  await openManualPage(page, pageId);
  await expect(page.locator(SEL.markdownBody0).locator('h1').first()).toBeVisible();
}

async function sucheOeffnen(page, begriff) {
  await page.keyboard.press('Control+f');
  const input = page.locator('#search-input');
  await expect(input).toBeVisible();
  await input.fill(begriff);
}

test.describe('SH-01: Trefferraum über alle Handbuch-Seiten', () => {
  test('findet Fundstellen auf Seiten, die gar nicht geöffnet sind', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      // Eine einzige Handbuch-Seite öffnen — nicht die, auf der die meisten
      // Treffer liegen.
      await warteAufReiter(page);
      await oeffneHandbuchSeite(page, 'overview');

      await sucheOeffnen(page, 'Vorlage');
      // Scope-Label nennt den Raum.
      await expect(page.locator('#search-scope')).toHaveText(/Handbuch/);

      // Die Trefferliste öffnet sich selbst und führt mehrere Gruppen.
      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible();
      const gruppen = panel.locator('.search-results-group');
      await expect.poll(async () => gruppen.count()).toBeGreaterThan(1);

      // Darunter die Seite «Vorlagen», die NICHT geöffnet ist.
      await expect(panel.getByText('Vorlagen', { exact: false }).first()).toBeVisible();

      // Der Zähler zählt über den ganzen Raum, nicht über die offene Seite.
      const zaehler = await page.locator('#search-count').textContent();
      expect(zaehler).toMatch(/\d+ \/ \d+/);
      expect(Number(zaehler.split('/')[1].trim())).toBeGreaterThan(5);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SH-02: Sprung aus der Trefferliste', () => {
  test('Klick öffnet die Ziel-Seite und hebt die Fundstelle hervor', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await warteAufReiter(page);
      await oeffneHandbuchSeite(page, 'overview');
      await sucheOeffnen(page, 'Vorlage');

      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible();
      const treffer = panel.locator('.search-results-item');
      await expect.poll(async () => treffer.count()).toBeGreaterThan(0);

      await treffer.first().click();
      // Die Ziel-Seite ist offen und zeigt die Fundstelle hervorgehoben.
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('mark.mdv-match-current')).toHaveCount(1);
      await expect(body.locator('mark.mdv-match-current')).toContainText(/Vorlage/i);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SH-03: F3 läuft über die Seitengrenze', () => {
  test('wiederholtes Weiterspringen erreicht eine zweite Seite', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await warteAufReiter(page);
      await oeffneHandbuchSeite(page, 'overview');
      await sucheOeffnen(page, 'Vorlage');

      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible();
      await expect
        .poll(async () => panel.locator('.search-results-item').count())
        .toBeGreaterThan(0);

      // Titel des ersten Ziels merken, dann so oft weiterspringen, bis ein
      // anderer Reiter aktiv ist. Die erste Gruppe hat begrenzt viele
      // Treffer; 30 Sprünge reichen sicher über ihre Grenze.
      await page.keyboard.press('F3');
      const ersterTitel = await page.locator(SEL.activeTab0).innerText();
      let gewechselt = false;
      for (let i = 0; i < 30 && !gewechselt; i++) {
        await page.keyboard.press('F3');
        const titel = await page.locator(SEL.activeTab0).innerText();
        if (titel !== ersterTitel) gewechselt = true;
      }
      expect(gewechselt, 'F3 hat die Seitengrenze nicht überschritten').toBe(true);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SH-04: Ersetzen bleibt im Handbuch abgeschaltet', () => {
  test('die Ersetzen-Bedienelemente sind deaktiviert', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await warteAufReiter(page);
      await oeffneHandbuchSeite(page, 'overview');
      // Ueber die Such-Leiste, nicht ueber den Ersetzen-Einstieg: Die
      // Bedienbarkeit der Ersetzen-Elemente haengt am Scope und nicht daran,
      // in welchem Modus die Leiste geoeffnet wurde (updateReplaceUiState
      // laeuft bei jedem Suchlauf).
      await sucheOeffnen(page, 'Vorlage');
      await expect(page.locator('#search-replace')).toBeDisabled();
      await expect(page.locator('#btn-search-replace')).toBeDisabled();
      await expect(page.locator('#btn-search-replace-all')).toBeDisabled();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SH-05: Rückkehr zum Dokument', () => {
  test('im Dokument-Reiter gilt wieder die Dokument-Suche', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await warteAufReiter(page);
      await oeffneHandbuchSeite(page, 'overview');
      await sucheOeffnen(page, 'Vorlage');
      await expect(page.locator('#search-scope')).toHaveText(/Handbuch/);

      // Zurück auf den Dokument-Reiter (der erste in der Leiste).
      await page.locator('.pane-group[data-pane="0"] .tab').first().click();
      await expect
        .poll(async () => page.locator('#search-scope').textContent())
        .not.toMatch(/Handbuch/);
      // Und die Trefferliste zeigt keine Handbuch-Treffer mehr.
      const panel = page.locator(PANEL);
      if (await panel.isVisible()) {
        await expect(panel.locator('.search-results-item')).toHaveCount(0);
      }
    } finally {
      await closeApp(app, userData);
    }
  });
});
