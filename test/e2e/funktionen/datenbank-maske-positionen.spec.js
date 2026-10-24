// 4T-002253 (Epic 3E-000262, F5 A, S6, S7, S11; AK2 bis AK4): Der
// Positions-Bereich der Einzel-Maske in der realen Anordnung.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Kette reicht von der Masken-Datei über die Zerlegung im Haupt-Prozess, den
// Kanal `database:positionsliste` mit Katalog und Definition, die Auswertung
// der ergänzten Abfrage über den Index des gebundenen Bereichs und den Kanal
// `database:liste` bis zum Auftrag der Maske, der Kopf und Positionen in einem
// Zug schreibt oder gar nicht. Bereich, Index und Schreib-Schnittstelle gibt es
// erst in der laufenden Anwendung.
//
// **DB-MAS-12** (Sitzungs-Entscheidung S11) steht in einer eigenen Datei, weil
// die Masken-Datei `datenbank-maske.spec.js` an ihrem Zeilen-Budget steht. Der
// Bereich ist nach dem Demo-Bereich nachgebaut («Library» und «Loans» mit der
// Prüfregel `due >= lent`), mit einer Masken-Datei «Library Form», die den
// Positions-Bereich `{{list:Ausleihen}}` trägt, und der Abfrage-Datei
// «Ausleihen» mit allen drei Handgriffen.
//
// **Sprachfrei geprüft**: Geprüft wird an Klassen, Daten-Attributen und Daten
// des angelegten Bestands; der Satz der Abweisung gegen die fünf Sprachfassungen.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');
const { LOCALE_CODES } = require('../../../src/shared/locales.js');

const PANE = '.pane-group[data-pane="0"]';
const MASKE = `${PANE} .pane-system .db-form-page`;
const BLOCK_LESE = `${SEL.markdownBody0} .perspective-records`;
const BUCH = 'r-00001';

const LIBRARY = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: title',
  '  display: title',
  '  lastId: 2',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Zauberberg',
  '|- id="r-00002"',
  '| Anna Karenina',
  '```',
  '',
];

// «Loans» mit dem Verweis-Feld `book` und der Prüfregel der Demo.
const LOANS = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: book',
  '      type: record',
  '      options:',
  '        table: Library',
  '    - name: borrower',
  '    - name: lent',
  '      type: date',
  '    - name: due',
  '      type: date',
  '  display: borrower',
  '  checks:',
  '    - rule: due >= lent',
  '      message: Die Frist liegt vor dem Tag der Ausleihe.',
  '  lastId: 3',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| r-00001',
  '| Clara',
  '| 2026-09-01',
  '| 2026-09-15',
  '|- id="r-00002"',
  '| r-00002',
  '| Mia',
  '| 2026-09-03',
  '| 2026-09-17',
  '|- id="r-00003"',
  '| r-00001',
  '| Tom',
  '| 2026-09-05',
  '| 2026-09-19',
  '```',
  '',
];

const LIBRARY_FORM = [
  '---',
  'db-form:',
  '  table: Library',
  '---',
  '',
  '# Buch',
  '',
  '{{field:title}}',
  '',
  '{{list:Ausleihen}}',
  '',
];

const AUSLEIHEN = [
  '---',
  'db-query:',
  '  editable: true',
  '  allow: [create, update, delete]',
  '---',
  '',
  '# Ausleihen',
  '',
  '```perspective-query',
  'TABLE RECORDS borrower, lent, due FROM "Loans"',
  '```',
  '',
];

function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-maske-positionen-'));
  const datei = (name, zeilen) => {
    const pfad = path.join(wurzel, name);
    fs.writeFileSync(pfad, zeilen.join('\n'), 'utf8');
    return pfad;
  };
  datei('Datenbank.md', ['---', 'db-database:', '  name: Bibliothek', '---', '', 'Text.', '']);
  datei('Library Form.md', LIBRARY_FORM);
  datei('Ausleihen.md', AUSLEIHEN);
  return { wurzel, library: datei('Library.md', LIBRARY), loans: datei('Loans.md', LOANS) };
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufräumen darf den Lauf nicht kippen */
  }
}

// Die Datensätze einer Tabellen-Datei. Der Kopf bleibt außen vor, weil eine
// Neuanlage ihre Kennung beim Eröffnen zieht und `lastId` dabei fortschreibt
// (E5.1), auch wenn sie nie gespeichert wird.
function datensaetze(pfad) {
  const text = fs.readFileSync(pfad, 'utf8');
  return text.slice(text.indexOf('```perspective-records'));
}

// Der Anfang des Satzes «Position {n}: …» in allen fünf Sprachfassungen.
function positionsAnfaenge(n) {
  return LOCALE_CODES.map((code) => {
    const satz = require(`../../../src/i18n/${code}.json`)['database.form.positionRow'];
    return satz.split('{text}')[0].replace('{n}', String(n)).trim();
  });
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

// Die Texte der Datensatz-Spalte des Positions-Bereichs, sortiert.
async function positionen(bereich) {
  const texte = await bereich
    .locator('tbody tr.db-list-row td.db-list-col-record')
    .allTextContents();
  return texte.map((t) => t.trim()).sort();
}

// Eröffnet im Positions-Bereich eine neue Zeile, füllt sie aus und merkt sie vor.
async function merkeNeueZeileVor(bereich, werte) {
  await bereich.locator('.db-list-new').click();
  const neu = bereich.locator('tbody tr.db-list-row-new');
  await expect(neu).toHaveClass(/db-list-row-editing/, { timeout: 20000 });
  for (const [feld, wert] of Object.entries(werte)) {
    await neu.locator(`.db-form-field[data-field="${feld}"] .db-form-input`).fill(wert);
  }
  await neu.locator('.db-list-save').click();
  await expect(neu).toHaveClass(/db-list-row-pending/, { timeout: 20000 });
  return neu;
}

test.describe('DB-MAS-12: Positions-Bereich mit gemeinsamem Speichern (4T-002253)', () => {
  test('zeigt allein die Ausleihen des Buchs, speichert eine neue mit Verweis und speichert bei einer abgewiesenen nichts', async () => {
    const { wurzel, library, loans } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneTabelle(app, page, library);
      await expect(page.locator(`${BLOCK_LESE} table.prc-table`)).toBeVisible({ timeout: 20000 });
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.api.databaseDatensaetze({ tabelle: 'Loans' })))
              .status,
          { timeout: 20000 },
        )
        .toBe('ready');

      // Die Maske zeigt den Körper der Datei, sobald der Katalog sie kennt.
      const maske = page.locator(MASKE);
      await expect(async () => {
        await oeffneMaskeFuer(page, library, BUCH);
        await expect(maske.locator('.db-form-source')).toHaveCount(1, { timeout: 1000 });
      }).toPass({ timeout: 20000 });

      // AK2: allein die Ausleihen dieses Buchs, im Lesen ohne Handgriffe.
      const bereich = maske.locator('.db-form-body .db-form-positions[data-form-list="Ausleihen"]');
      await expect(bereich.locator('table.db-list-table')).toBeVisible({ timeout: 20000 });
      await expect.poll(() => positionen(bereich), { timeout: 20000 }).toEqual(['Clara', 'Tom']);
      await expect(bereich.locator('.db-list-new, .db-list-edit')).toHaveCount(0);
      await expect(maske.locator('.db-form-hint')).toHaveCount(0);

      // AK3: im Bearbeiten eine neue Position, vorgemerkt; die Datei bleibt, bis
      // die Maske speichert, und danach trägt die Ausleihe die Kennung des Buchs.
      const vorher = datensaetze(loans);
      await maske.locator('.db-form-edit').click();
      await expect(bereich.locator('.db-list-new')).toHaveCount(1, { timeout: 20000 });
      await merkeNeueZeileVor(bereich, { borrower: 'Lena', lent: '2026-09-10', due: '2026-09-24' });
      expect(datensaetze(loans)).toBe(vorher);
      await maske.locator('.db-form-save').click();
      await expect
        .poll(() => fs.readFileSync(loans, 'utf8'), { timeout: 20000 })
        .toContain('|- id="r-00004"\n| r-00001\n| Lena\n');
      await expect(maske.locator('.db-form-edit')).toHaveCount(1, { timeout: 20000 });
      await expect
        .poll(() => positionen(bereich), { timeout: 20000 })
        .toEqual(['Clara', 'Lena', 'Tom']);

      // AK4: Eine Position mit der Frist vor der Ausleihe wird abgewiesen; die
      // Meldung nennt die Position, und keine Datei ändert sich.
      const gespeichert = datensaetze(loans);
      const buch = fs.readFileSync(library, 'utf8');
      await maske.locator('.db-form-edit').click();
      await expect(bereich.locator('.db-list-new')).toHaveCount(1, { timeout: 20000 });
      await merkeNeueZeileVor(bereich, {
        borrower: 'Falsch',
        lent: '2026-09-20',
        due: '2026-09-01',
      });
      await maske.locator('.db-form-save').click();
      const befund = maske.locator('.db-form-errors .db-form-error').first();
      await expect(befund).toBeVisible({ timeout: 20000 });
      const satz = (await befund.textContent()).trim();
      expect(positionsAnfaenge(1).some((anfang) => satz.startsWith(anfang))).toBe(true);
      expect(datensaetze(loans)).toBe(gespeichert);
      expect(fs.readFileSync(library, 'utf8')).toBe(buch);
      await expect(bereich.locator('tbody tr.db-list-row-pending')).toHaveCount(1);

      // «Verwerfen» stellt den gespeicherten Stand her.
      await maske.locator('.db-form-discard').click();
      await expect(maske.locator('.db-form-edit')).toHaveCount(1, { timeout: 20000 });
      await expect
        .poll(() => positionen(bereich), { timeout: 20000 })
        .toEqual(['Clara', 'Lena', 'Tom']);
      await expect(bereich.locator('tbody tr.db-list-row-pending')).toHaveCount(0);
      expect(datensaetze(loans)).toBe(gespeichert);

      // AK3 bei neuem Kopf: Buch und Ausleihe in einem Auftrag, die Ausleihe
      // trägt die beim Eröffnen gezogene Kennung des Buchs.
      await oeffneTabelle(app, page, library);
      const block = page.locator(BLOCK_LESE);
      await expect(block.locator('.prc-foot .prc-new-btn')).toHaveCount(1, { timeout: 20000 });
      await block.locator('.prc-foot .prc-new-btn').click();
      await expect(maske.locator('.db-form-record')).toContainText('r-00003', { timeout: 20000 });
      await expect(maske.locator('.db-form-edit')).toHaveCount(1, { timeout: 20000 });
      await expect(bereich.locator('table.db-list-table')).toBeVisible({ timeout: 20000 });
      await expect(bereich.locator('tbody tr.db-list-row')).toHaveCount(0);
      await maske.locator('.db-form-edit').click();
      await maske.locator('.db-form-field[data-field="title"] .db-form-input').fill('Neues Buch');
      await merkeNeueZeileVor(bereich, { borrower: 'Paul', lent: '2026-10-01', due: '2026-10-15' });
      await maske.locator('.db-form-save').click();
      await expect
        .poll(() => datensaetze(library), { timeout: 20000 })
        .toContain('|- id="r-00003"\n| Neues Buch');
      expect(datensaetze(loans)).toMatch(/\| r-00003\n\| Paul\n/);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
