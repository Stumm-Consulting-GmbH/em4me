// 4T-002252 (Epic 3E-000262, F6 A, S1, S8, S11; AK1 bis AK3): Werte und
// Bedingungen der Einzel-Maske über Verweis-Pfade in der realen Anordnung.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Kette reicht von der Masken-Datei über die Zerlegung im Haupt-Prozess, die
// Naht der Maske im Anzeige-Prozess und den Kanal `database:ausdruecke` bis zum
// Index-Leser der verwiesenen Tabelle und zurück in das DOM der System-Seite.
// Der Kanal prüft den gebundenen Bereich des Fensters und liest über den Index
// des Bereichs; beides gibt es erst in der laufenden Anwendung.
//
// DB-MAS-11 (Sitzungs-Entscheidung S11) steht in einer eigenen Datei, weil die
// Masken-Datei `datenbank-maske.spec.js` an ihrem Zeilen-Budget steht. Der
// Bereich ist nach dem Demo-Bereich nachgebaut («Library» und «Loans», Muster
// `datenbank-liste.spec.js`), mit einer Masken-Datei «Loans Form», die den Titel
// des Buchs als Wert und einen Bereich mit Bedingung über das Buch trägt.
//
// **Sprachfrei geprüft**: Geprüft wird an Klassen, Daten-Attributen und Daten
// des angelegten Bestands.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const PANE = '.pane-group[data-pane="0"]';
const MASKE = `${PANE} .pane-system .db-form-page`;
const BLOCK_LESE = `${SEL.markdownBody0} .perspective-records`;
const KENNUNG = 'r-00001';

const LIBRARY = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: title',
  '    - name: onloan',
  '      type: boolean',
  '  display: title',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Zauberberg',
  '| x',
  '|- id="r-00002"',
  '| Anna Karenina',
  '|',
  '```',
  '',
];

// «Loans» mit dem Verweis-Feld `book` auf «Library»; Anzeige-Form ist der Name.
const LOANS = [
  '---',
  'db-table:',
  '  lastId: 1',
  '  fields:',
  '    - name: book',
  '      type: record',
  '      options:',
  '        table: Library',
  '    - name: borrower',
  '  display: borrower',
  '---',
  '',
  '```perspective-records',
  `|- id="${KENNUNG}"`,
  '| r-00001',
  '| Clara',
  '```',
  '',
];

// Die Masken-Datei: der Titel des Buchs als Wert, ein Bereich nach dem Buch.
const LOANS_FORM = [
  '---',
  'db-form:',
  '  table: Loans',
  '---',
  '',
  '# Ausleihe',
  '',
  '{{field:book}}',
  '',
  '{{value:book.title}}',
  '',
  '{{field:borrower}}',
  '',
  '{{when:book.onloan}}',
  'Ausgeliehen.',
  '{{end}}',
  '',
];

function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-maske-pfade-'));
  const datei = (name, zeilen) => {
    const pfad = path.join(wurzel, name);
    fs.writeFileSync(pfad, zeilen.join('\n'), 'utf8');
    return pfad;
  };
  datei('Datenbank.md', ['---', 'db-database:', '  name: Bibliothek', '---', '', 'Text.', '']);
  datei('Library.md', LIBRARY);
  datei('Loans Form.md', LOANS_FORM);
  return { wurzel, loans: datei('Loans.md', LOANS) };
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufräumen darf den Lauf nicht kippen */
  }
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

async function oeffneTabelle(app, page, tabelle) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, p) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [p]);
    },
    tabelle,
  );
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

async function oeffneMaskeFuer(page, tabelle, kennung) {
  await page.evaluate(
    ({ filePath, recordId }) => {
      document.dispatchEvent(new CustomEvent('scg:open-form', { detail: { filePath, recordId } }));
    },
    { filePath: tabelle, recordId: kennung },
  );
  const maske = page.locator(MASKE);
  await expect(maske.locator('.db-form-edit')).toHaveCount(1, { timeout: 20000 });
  return maske;
}

test.describe('DB-MAS-11: Wert und Bedingung über einen Verweis-Pfad (4T-002252)', () => {
  test('zeigt den Titel des Buchs, folgt der Wahl eines anderen Buchs ohne Speichern und bleibt bei leerem Verweis leer', async () => {
    const { wurzel, loans } = baueBereich();
    const tabellenText = fs.readFileSync(loans, 'utf8');
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneTabelle(app, page, loans);
      await expect(page.locator(`${BLOCK_LESE} table.prc-table`)).toBeVisible({ timeout: 20000 });
      // Aufbau: Der Bereichs-Index kennt die Ziel-Tabelle.
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.api.databaseDatensaetze({ tabelle: 'Library' })))
              .status,
          { timeout: 20000 },
        )
        .toBe('ready');

      // Die Maske zeigt den Körper der Datei, sobald der Katalog sie kennt.
      const maske = page.locator(MASKE);
      await expect(async () => {
        await oeffneMaskeFuer(page, loans, KENNUNG);
        await expect(maske.locator('.db-form-source')).toHaveCount(1, { timeout: 1000 });
      }).toPass({ timeout: 20000 });

      // AK1, AK2 (Lesen): Titel des verwiesenen Buchs, Bereich nach dem Buch sichtbar.
      const titel = maske.locator('.db-form-body .db-form-computed');
      const bereich = maske.locator('.db-form-body .db-form-section');
      await expect(titel).toHaveCount(1);
      await expect(titel).toHaveText('Zauberberg', { timeout: 20000 });
      await expect(titel).not.toHaveClass(/db-form-computed-empty/);
      await expect(bereich).toBeVisible();
      await expect(maske.locator('.db-form-hint')).toHaveCount(0);

      // AK1, AK2 (Bearbeiten): Ein anderes Buch über die Wertehilfe; Titel und
      // Bereich folgen ohne Speichern.
      await maske.locator('.db-form-edit').click();
      const buch = maske.locator('.db-form-field[data-field="book"]');
      const eingabe = buch.locator('.db-form-input');
      await expect(eingabe).toHaveValue(KENNUNG, { timeout: 20000 });
      await eingabe.fill('');
      await eingabe.focus();
      await eingabe.pressSequentially('anna');
      const punkte = buch.locator('.db-form-suggest .db-form-suggest-item');
      await expect(punkte).toHaveCount(1);
      await punkte.first().click();
      await expect(eingabe).toHaveValue('r-00002');
      await expect(titel).toHaveText('Anna Karenina');
      await expect(bereich).toBeHidden();

      // AK3: Ein leerer Verweis ergibt eine leere, markierte Stelle ohne Meldung.
      await eingabe.fill('');
      await eingabe.press('Escape');
      await expect(titel).toHaveText('');
      await expect(titel).toHaveClass(/db-form-computed-empty/);
      await expect(bereich).toBeHidden();
      await expect(maske.locator('.db-form-hint')).toHaveCount(0);

      // Nichts ist gespeichert worden; Verwerfen kehrt zum gespeicherten Stand zurück.
      expect(fs.readFileSync(loans, 'utf8')).toBe(tabellenText);
      await maske.locator('.db-form-discard').click();
      await expect(maske.locator('input, textarea')).toHaveCount(0, { timeout: 20000 });
      await expect(titel).toHaveText('Zauberberg');
      await expect(bereich).toBeVisible();
      expect(fs.readFileSync(loans, 'utf8')).toBe(tabellenText);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
