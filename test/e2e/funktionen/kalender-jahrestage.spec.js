// 4T-002446 (Epic 3E-000377): Bezugs-Auswahl und Wahl der Jahrestags-Regel
// einer abgeleiteten Zeitrechnung in den Einstellungen. Die Zeitrechnungen mit
// jährlich wechselndem Aufbau stehen als Bezug zur Wahl, der frühere Hinweis
// «Nicht als Bezug wählbar» fehlt; bei hebräischem Bezug, und nur dort,
// erscheint die Regel-Wahl, unter der Auswahl steht der Satz der geltenden
// Regel; die gewählte Regel wird gespeichert und nach dem Nachladen gezeigt.
// Eigene Datei, weil kalender-systeme.spec.js ihr Zeilen-Budget ausschöpft;
// Bereich, Öffnen der Sektion und Anwenden folgen deren Muster (KS-01, KS-05).
// describe-Titel tragen die Matrix-IDs (test/abdeckungs-matrix.json).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, APP_ROOT } = require('../helpers/app');

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

// Deutscher Katalog der Anwendung (gebaut mit dem Renderer-Bündel).
function satz(key) {
  const de = require(path.join(APP_ROOT, 'src/i18n/de.json'));
  return de[`settings.calendar.derivedRuleText.${key}`];
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// Bereich an das leere Startfenster binden (Muster kalender-systeme.spec.js).
async function bindArea(page, areaRoot) {
  await expect
    .poll(async () => {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
      return !!(result && result.ok !== false);
    })
    .toBe(true);
}

// Einstellungs-Seite öffnen und zur Kalender-Sektion wechseln: öffnen, solange
// verborgen, klicken, sobald sichtbar (Begründung in kalender-systeme.spec.js,
// 4T-000876).
async function openCalendarSection(page) {
  const navEntry = page.locator(
    `${SETTINGS_PAGE} .settings-nav-entry[data-section-id="calendarSystems"]`,
  );
  await expect
    .poll(async () => {
      if (!(await navEntry.isVisible())) {
        await page.keyboard.press('Control+,');
        return false;
      }
      try {
        await navEntry.click({ timeout: 2000 });
        return true;
      } catch {
        return false;
      }
    })
    .toBe(true);
}

test.describe('KJ-01: Bezug mit Jahres-Struktur und Jahrestags-Regel', () => {
  test('Bezug angeboten, Regel-Wahl nur hebräisch, Satz steht, Regel übersteht das Nachladen', async () => {
    const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-kalender-jahrestage-'));
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openCalendarSection(page);

      // Block mit der hebräischen und der persischen Vorlage.
      await page.locator('#settings-calsys-block-add').click();
      await page.locator('#settings-calsys-block-name-0').fill('Gedenken');
      await page.locator('#settings-calsys-block-open-0').click();
      await page.locator('#settings-calsys-cal-template').selectOption('hebrew');
      await expect(page.locator('#settings-calsys-cal-name-0')).toHaveValue('Hebräischer Kalender');
      await page.locator('#settings-calsys-cal-template').selectOption('persian');
      await expect(page.locator('#settings-calsys-cal-name-1')).toHaveValue('Persischer Kalender');

      // Ableitung anlegen: beide stehen als Bezug zur Wahl, ohne Hinweis.
      await page.locator('#settings-calsys-derived-add').click();
      await page.locator('#settings-calsys-cal-name-2').fill('Gedenktag');
      const bezug = page.locator('#settings-calsys-derived-base-2');
      await expect(bezug.locator('option')).toHaveText([
        '— bitte wählen —',
        'Standard-Zeitrechnung',
        'Hebräischer Kalender',
        'Persischer Kalender',
      ]);
      await expect(page.locator('#settings-calsys-derived-yearly-2')).toHaveCount(0);
      await expect(page.locator(SETTINGS_PAGE)).not.toContainText('Nicht als Bezug wählbar');

      // Persischer Bezug: keine Regel-Wahl, der Satz der persischen Regel.
      const regel = page.locator('#settings-calsys-derived-rule-2');
      const regelSatz = page.locator('#settings-calsys-derived-rule-hint-2');
      await bezug.selectOption({ label: 'Persischer Kalender' });
      await expect(regelSatz).toHaveText(
        'Der 30. Essfand fällt in Jahren ohne diesen Tag auf den 29. Essfand.',
      );
      await expect(regel).toHaveCount(0);

      // Hebräischer Bezug: Regel-Wahl mit Vorgabe «Jahrestag» und ihr Satz.
      await bezug.selectOption({ label: 'Hebräischer Kalender' });
      await expect(regel).toHaveValue('anniversary');
      await expect(regel.locator('option')).toHaveText(['Jahrestag', 'Jahrzeit (aschkenasisch)']);
      await expect(regelSatz).toHaveText(satz('hebrewAnniversary'));

      // Nullpunkt 10. Adar 5783 (Gemeinjahr); Jahrestag 5784 (Schaltjahr) mit
      // «Jahrestag» im Adar II, mit «Jahrzeit (aschkenasisch)» im Adar I.
      await page.locator('#settings-calsys-derived-zero-2-0').fill('5783');
      await page.locator('#settings-calsys-derived-zero-2-1').fill('6');
      await page.locator('#settings-calsys-derived-zero-2-2').fill('10');
      await page.locator('#settings-calsys-preview-input-2').fill('1-0-1');
      const vorschau = page.locator('#settings-calsys-preview-2');
      await expect(vorschau).toContainText('Hebräischer Kalender: 5784-06-10');
      await regel.selectOption({ label: 'Jahrzeit (aschkenasisch)' });
      await expect(regelSatz).toHaveText(satz('hebrewYahrzeit'));
      await expect(vorschau).toContainText('Hebräischer Kalender: 5784-05L-10');
      await expect(page.locator('#settings-calsys-derived-zero-2-1')).toHaveValue('6');

      // Anwenden speichert die Regel in der kurzen Form der Ableitung.
      await page.locator('#btn-settings-apply').click();
      const mddaPath = path.join(areaRoot, 'Area_Settings.mdda');
      await expect
        .poll(() => {
          try {
            const parsed = JSON.parse(fs.readFileSync(mddaPath, 'utf8'));
            const [heb, , abl] = parsed.settings.calendarSystems.blocks[0].calendars;
            return abl && abl.derivedFrom === heb.id
              ? `${abl.zero.join('-')}/${abl.anniversaryRule}`
              : '?';
          } catch {
            return 'keine Datei';
          }
        })
        .toBe('5783-6-10/yahrzeit');

      // Nachladen: Seite schließen und neu öffnen, die Regel steht.
      await page.locator('#btn-settings-ok').click();
      await openCalendarSection(page);
      await page.locator('#settings-calsys-block-open-0').click();
      await expect(page.locator('#settings-calsys-cal-name-2')).toHaveValue('Gedenktag');
      await expect(regel).toHaveValue('yahrzeit');
      await expect(regelSatz).toHaveText(satz('hebrewYahrzeit'));
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});
