// 4T-000759 (Epic 3E-000142): Suchergebnis-Panel — beide Bedien-Zugaenge und
// die Leerzustaende.
//
// Geprueft wird hier das Panel als solches (Paritaets-Konvention: Statusbar
// und Ansichtsmenue). Die Treffer selbst kommen mit der Anbindung an die
// Suchleiste in 4T-000760 und werden dort geprueft.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const PANEL = '.pane-group[data-pane="0"] .sidebar-searchresults';

// Deterministisches Ready-Signal: Erst mit der geladenen Datei verlaesst die
// App den Empty-State, in dem die Sidebar zugeklappt ist. Ein Klick davor
// setzt zwar den Schalter, das Panel bleibt aber unsichtbar und faellt beim
// naechsten Sidebar-Aufbau hinter den aktiven Reiter seiner Gruppe zurueck.
async function warteAufDokument(page) {
  await expect(page.locator(SEL.markdownBody0).getByText('Suchpanel-Test')).toBeVisible();
}

// Eine offene Datei, damit die Sidebar ueberhaupt sichtbar ist; im
// Empty-State ist sie zugeklappt (das gilt fuer alle Panels).
function makeWorkFile() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-such-panel-'));
  const workFile = path.join(workDir, 'arbeit.md');
  fs.writeFileSync(workFile, '# Suchpanel-Test\n\nInhalt.\n', 'utf8');
  return workFile;
}

test.describe('SP-01: Suchergebnis-Panel öffnen', () => {
  test('Statusbar-Schalter blendet das Panel ein und wieder aus', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await warteAufDokument(page);
      const panel = page.locator(PANEL);
      const btn = page.locator('#btn-search-results');
      await expect(btn).toHaveCount(1);
      await expect(panel).toBeHidden();

      await btn.click();
      await expect(panel).toBeVisible();
      await expect(btn).toHaveAttribute('aria-pressed', 'true');

      await btn.click();
      await expect(panel).toBeHidden();
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SP-02: Leerzustand ohne Suchbegriff', () => {
  test('das frisch geöffnete Panel nennt den Grund statt leer zu bleiben', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await warteAufDokument(page);
      await page.locator('#btn-search-results').click();
      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible();
      // Status-Zeile traegt einen Text (Leerzustand), die Trefferliste ist leer.
      const status = panel.locator('.search-results-status');
      await expect(status).not.toBeEmpty();
      await expect(panel.locator('.search-results-item')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});
