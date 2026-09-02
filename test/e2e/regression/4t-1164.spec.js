// PP-12 (4T-001164, Epic 3E-000219, Story 4S-000831): Das Profil-Symbol bleibt
// sichtbar, wenn das Eigenschaften-Panel in einer Reiter-Gruppe liegt.
//
// Gemeldeter Ablauf (Release-Abnahme 1.116.0 am 2026-08-24): Der Product
// Owner sah die Symbole nirgends, waehrend alles Uebrige der Stufe hielt.
// Ursache war die Platzierung: Das Symbol sass im <header> der Sektion, und
// liegt das Panel mit einem anderen in EINEM Slot, setzt panels.js die Klasse
// `in-tab-group`, woraufhin sidebar.css genau diesen Kopf ausblendet
// (.sidebar-section.in-tab-group > .sidebar-section-header). Das Symbol fiel
// mit dem Kopf weg.
//
// Warum dieser Fall noetig ist, obwohl vier Pruefungen die Funktion
// abdeckten: Die vier aus 4T-001161 lesen ausschliesslich Quelltext als
// Zeichenkette (steht das Element im HTML, steht der Selektor in
// app-state.js, haengt die Anzeige hinter dem Erweiterungs-Gate). Sie
// belegen die VERDRAHTUNG, nicht die SICHTBARKEIT, und waren waehrend des
// gesamten Befunds gruen. Die allgemeine Lehre daraus ist als 4T-001167
// verortet.
//
// Der Fall stellt die Lage her, in der der Fehler auftrat, statt eines
// bequemeren Ersatz-Falls: Er prueft die beiden Vorbedingungen ausdruecklich
// (Gruppe gebildet, Kopf tatsaechlich ausgeblendet). Ohne sie waere er auch
// VOR dem Fix gruen gewesen und haette nichts gemessen.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const PANE0 = '.pane-group[data-pane="0"]';
const PANEL = `${PANE0} .sidebar-properties`;

// Bereich mit einem Profil, das ein Symbol traegt.
function makeArea() {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-1164-'));
  fs.mkdirSync(path.join(areaRoot, 'Profile'));
  fs.writeFileSync(
    path.join(areaRoot, 'Profile', 'Projekt.md'),
    [
      '---',
      'icon: 📁',
      'fields:',
      '  - name: status',
      '    values: [offen, erledigt]',
      '---',
      'Projekt-Profil mit Symbol.',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(areaRoot, 'Area_Settings.mdda'),
    JSON.stringify(
      {
        schemaVersion: 1,
        settings: {
          propertyProfiles: { folder: 'Profile', assignField: 'class', defaultProfile: null },
        },
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(areaRoot, 'Mit-Profil.md'),
    ['---', 'class: Projekt', '---', '', 'Inhalt.', ''].join('\n'),
    'utf8',
  );
  return areaRoot;
}

// Bereich an das Startfenster binden und die Datei ueber den Main-Kanal
// oeffnen (Muster eigenschafts-profile.spec.js).
async function bindAreaAndOpen(app, page, areaRoot, filePath) {
  await expect
    .poll(async () => {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
      return !!(result && result.ok !== false);
    })
    .toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
  await app.evaluate(({ BrowserWindow }, p) => {
    BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [p]);
  }, filePath);
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch offen: best effort */
  }
}

test.describe('PP-12: Profil-Symbol in der Reiter-Gruppe (4T-001164)', () => {
  test('Symbol sichtbar, obwohl der Sektions-Kopf der Gruppe ausgeblendet ist', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp({
      settings: {
        // Eine eigene Vorbelegung ersetzt DEFAULT_TEST_SETTINGS vollstaendig;
        // die Sprache gehoert deshalb ausdruecklich hierher, sonst traegt das
        // Fenster den englischen Titel und bindAreaAndOpen wartet vergeblich.
        language: 'de',
        sidebar: {
          layout: {
            left: [{ panels: ['properties', 'outline'], active: 'properties' }],
            right: [],
          },
        },
        properties: { visibleColumn0: true },
        outline: { visibleColumn0: true },
      },
    });
    try {
      await bindAreaAndOpen(app, page, areaRoot, path.join(areaRoot, 'Mit-Profil.md'));

      // Vorbedingungen des Falls — ohne sie misst er nichts.
      await expect(page.locator(`${PANEL}.in-tab-group`)).toHaveCount(1);
      await expect(page.locator(`${PANEL} .sidebar-section-header`)).toBeHidden();

      const badge = page.locator(`${PANEL} .properties-profile-badge`);
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText('📁');
      await expect(badge).toHaveAttribute('title', /Projekt/);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});
