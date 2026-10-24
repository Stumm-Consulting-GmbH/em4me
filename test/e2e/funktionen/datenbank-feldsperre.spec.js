// 4T-002312 (Epic 3E-000263, S9; AK1 bis AK3): DB-MAS-14 — das nach seiner
// Bedingung gesperrte Feld in der Einzel-Maske, in der realen Anordnung.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Sperre entsteht im Haupt-Prozess aus der Tabellen-Definition, reist als
// `gesperrteFelder` in der Antwort des Datensatz-Kanals in die Maske und wird
// dort im Modus «bearbeiten» lesend gezeichnet; die Unit-Fälle prüfen jede
// Station einzeln. Nur hier zeigt sich, dass die Kette im gebauten Programm
// trägt und dass die Sperre nach dem Speichern mit der nächsten Antwort
// wechselt (Story AK3), ohne eigenen Weg.
//
// **Eigene Datei**, weil `datenbank-maske.spec.js` am Zeilen-Budget steht;
// Aufbau nach dem Muster von `datenbank-berechtigung.spec.js`.
//
// **Sprachfrei geprüft:** Der Titel wird gegen alle fünf Sprachfassungen
// gemessen, die Werte stammen aus dem angelegten Bestand.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { LOCALE_CODES } = require('../../../src/shared/locales.js');

const PANE = '.pane-group[data-pane="0"]';
const SEITE = `${PANE} .pane-system .db-overview-page`;
const MASKE = `${PANE} .pane-system .db-form-page`;

function inAllenSprachen(key) {
  return LOCALE_CODES.map((code) => require(`../../../src/i18n/${code}.json`)[key]);
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

// Ein Bereich mit der Tabelle «Loans»: `borrower` fest gesperrt, `due` nur
// änderbar, solange die Ausleihe nicht zurückgegeben ist, `returned` frei. Der
// eine Datensatz ist zurückgegeben; die Bereichsdatei öffnet die Übersicht.
function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-db-feldsperre-'));
  fs.writeFileSync(
    path.join(wurzel, 'Datenbank.md'),
    ['---', 'db-database:', '  name: Bibliothek', '---', ''].join('\n'),
    'utf8',
  );
  const tabelle = path.join(wurzel, 'Loans.md');
  const zeilen = [
    '---',
    'db-table:',
    '  lastId: 1',
    '  fields:',
    '    - name: borrower',
    '      editable: false',
    '    - name: due',
    '      editable: NOT returned',
    '    - name: returned',
    '      type: boolean',
    '---',
    '',
    '```perspective-records',
    '|- id="r-00001"',
    '| Anna',
    '| 2026-10-30',
    '| x',
    '```',
    '',
  ];
  fs.writeFileSync(tabelle, zeilen.join('\n'), 'utf8');
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { database: { overviewOnOpen: true } } }),
    'utf8',
  );
  return { wurzel, tabelle };
}

async function bindeBereich(page, wurzel) {
  await expect
    .poll(async () => {
      const ergebnis = await page.evaluate((p) => window.api.openAreaPath(p), wurzel);
      return !!(ergebnis && ergebnis.ok !== false);
    })
    .toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
}

function feldIn(maske, name) {
  return maske.locator(`.db-form-field[data-field="${name}"]`);
}

test.describe('DB-MAS-14: Feld sichtbar, aber gesperrt (4T-002312)', () => {
  test('zeigt gesperrte Felder im Bearbeiten lesend und gibt das bedingte nach dem Speichern frei', async () => {
    const { wurzel, tabelle } = baueBereich();
    const { page, app, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await expect(page.locator(SEITE)).toBeVisible({ timeout: 20000 });

      await page.evaluate(
        ({ filePath, recordId }) => {
          document.dispatchEvent(
            new CustomEvent('scg:open-form', { detail: { filePath, recordId } }),
          );
        },
        { filePath: tabelle, recordId: 'r-00001' },
      );
      const maske = page.locator(MASKE);
      await expect(maske.locator('.db-form-edit')).toHaveCount(1, { timeout: 20000 });

      // AK1: Im Bearbeiten stehen die feste und die bedingte Sperre lesend mit
      // Titel, das freie Feld ist eine Eingabe.
      await maske.locator('.db-form-edit').click();
      await expect(feldIn(maske, 'returned').locator('.db-form-input')).toHaveCount(1, {
        timeout: 20000,
      });
      const titel = inAllenSprachen('database.form.feldNichtAenderbar');
      for (const name of ['borrower', 'due']) {
        const feld = feldIn(maske, name);
        await expect(feld).toHaveClass(/db-form-locked/);
        await expect(feld.locator('.db-form-input')).toHaveCount(0);
        expect(titel).toContain(await feld.getAttribute('title'));
      }
      await expect(feldIn(maske, 'borrower').locator('.db-form-value')).toHaveText('Anna');
      await expect(feldIn(maske, 'due').locator('.db-form-value')).toHaveText('2026-10-30');

      // AK3: «returned» zurücknehmen und speichern; die gesperrten Felder reisen
      // unverändert mit (AK2: nichts an ihnen wird geschrieben).
      await feldIn(maske, 'returned').locator('.db-form-input').uncheck();
      await maske.locator('.db-form-save').click();
      await expect(maske.locator('input, textarea')).toHaveCount(0, { timeout: 20000 });
      await expect
        .poll(() => fs.readFileSync(tabelle, 'utf8'))
        .toContain('|- id="r-00001"\n| Anna\n| 2026-10-30\n|\n');

      // Erneut «Bearbeiten»: Die Bedingung ist erfüllt, «due» ist frei; die feste
      // Sperre bleibt.
      await maske.locator('.db-form-edit').click();
      await expect(feldIn(maske, 'due').locator('.db-form-input')).toHaveCount(1, {
        timeout: 20000,
      });
      await expect(feldIn(maske, 'due')).not.toHaveClass(/db-form-locked/);
      await expect(feldIn(maske, 'borrower')).toHaveClass(/db-form-locked/);
      await expect(feldIn(maske, 'borrower').locator('.db-form-input')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
