// 4T-002249 (Epic 3E-000262, F2 A, F3 A, S1, S2, S5, S11): Ablauf-Prüffälle der
// Listen-Maske, Familie DB-LIS nach dem Muster von `datenbank-abfrage-datei.spec.js`.
//
// **Warum es diese Fälle geben muss, obwohl die Unit-Fälle grün sind.** Die
// Listen-Maske verbindet Wege, die erst in der laufenden Anwendung
// zusammenstehen: die Auswertung des Abfrage-Blocks im Haupt-Prozess, die
// Auskunft des Kanals `database:liste` über den Index des gebundenen Bereichs
// und den Katalog der Masken-Dateien, das Einhängen des Gitters in die
// Befüllung der Lese- und der Live-Ansicht und den Klick, den die zentralen
// Klick-Handler beider Ansichten in die Maske weiterreichen.
//
// **DB-LIS-01** zeigt die Abfrage-Datei mit `editable: true` als Gitter mit
// Zähl-Zeile an der Stelle der Ergebnis-Tabelle, die Beschreibung darüber, in
// der Lese- und in der Live-Ansicht; die Spalten, die genau ein Feld nennen,
// sind als bearbeitbar gekennzeichnet, ein Pfad nicht. Dieselbe Abfrage-Datei
// ohne `editable` zeigt die Ergebnis-Tabelle wie bisher (Story AK1).
//
// **DB-LIS-02** zeigt den Klick auf eine Zeile, der in Lese- und Live-Ansicht
// die mit `form` benannte Maske öffnet und nicht die Standard-Maske (Story AK3),
// dazu das Blättern einer Tabelle mit 120 Datensätzen in Seiten zu 50 Zeilen
// mit Zähl-Zeile, Vor und Zurück (Story AK2), auch in der Live-Ansicht, ohne
// dass der Block zum Quelltext aufklappt.
//
// **DB-LIS-03** (4T-002250, F4 A, S3) ändert eine Zeile per Doppelklick und
// Eingabetaste, und der Wert steht in der Datei; eine verletzte Prüfregel
// markiert die Zelle, nennt den Satz in der Zeile, und nichts wird gespeichert;
// eine Zeile, deren Datensatz nach `editable` nicht änderbar ist, bietet kein
// «Bearbeiten» (Story AK1, AK3, AK4).
//
// **DB-LIS-04** (4T-002250, Vorbild DB-MAS-03) ändert die Datei zwischen
// Lesen und Speichern von außen: Speichern zeigt unter der Zeile die Wahl der
// Fremd-Änderung, und «Neu laden» zeigt den fremden Wert. Die Änderung von
// außen löst dabei die Index-Aktualisierung aus, die die Liste während der
// Bearbeitung nicht neu befüllen darf.
//
// **DB-LIS-05** (4T-002251, F1 A, F4 A, S11) legt mit `allow: [create, update,
// delete]` über «Neue Zeile» einen Datensatz an, der danach in der Datei steht,
// und löscht ihn mit «Ja, löschen» wieder; eine Zeile, deren Datensatz nicht
// änderbar ist, bietet kein «Löschen». Das Anlegen läuft zusätzlich in der
// Live-Ansicht. Eine Listen-Maske über «Library» mit `allow: [delete]` zeigt
// beim Löschen eines Buches mit Ausleihe den Lösch-Schutz unter der Zeile, und
// das Buch bleibt (Story AK1, AK2, AK4).
//
// **DB-LIS-06** (4T-002311, E12.4, S9) legt einen Steckbrief mit der
// Vorgabe-Rolle «assistant» an, die an «Fristen» allein ändern darf. Die
// Listen-Maske mit `allow: [create, update, delete]` bietet dann allein
// «Bearbeiten» an, weder «Neue Zeile» noch «Löschen» (Story AK3).
//
// **Der Bereich ist nach dem Demo-Bereich nachgebaut** («Library» und «Loans»
// mit dem Verweis-Feld `book`), wie in `datenbank-abfrage.spec.js`. Die Demo
// trägt noch keine Maske zu «Loans»; der Fall legt deshalb zwei an, die
// Standard-Maske und eine zweite, die die Abfrage-Datei nennt.
//
// **Sprache**: Das Profil der Ablauf-Prüffälle steht auf Deutsch (Vorbelegung
// in helpers/app.js). Übersetzte Texte der Oberfläche werden gegen die Menge
// der fünf Sprachfassungen geprüft.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { hauptSenden } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');
const { LOCALE_CODES } = require('../../../src/shared/locales.js');
// 4T-002250: Name und Ort der Sperr-Datei eines Datensatzes (Muster DB-MAS-04).
const { sperrDateiName } = require('../../../src/main/database/lock-store.js');
const { DEFAULT_LOCK_FOLDER_NAME } = require('../../../src/shared/database/lock-folder-name.js');

const MASKE = '.pane-group[data-pane="0"] .pane-system .db-form-page';
// Die Liste erscheint erst, wenn der Index des frisch gebundenen Bereichs die
// Masken-Dateien kennt.
const WARTE_LISTE_MS = 20000;

// Ein Satz eines Schlüssels mit eingesetzten Angaben, in allen fünf Sprachen.
function saetze(key, werte = {}) {
  return LOCALE_CODES.map((code) => require(`../../../src/i18n/${code}.json`)[key]).map((text) =>
    Object.entries(werte).reduce((satz, [name, wert]) => satz.split(`{${name}}`).join(wert), text),
  );
}

const LIBRARY = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: title',
  '    - name: pages',
  '      type: number',
  '  display: title',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Zauberberg',
  '| 1000',
  '|- id="r-00002"',
  '| Anna Karenina',
  '| 864',
  '```',
  '',
];

// «Loans» mit dem Verweis-Feld `book` auf «Library»; Anzeige-Form ist der Name.
const LOANS = [
  '---',
  'db-table:',
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
  '|- id="r-00001"',
  '| r-00001',
  '| Clara',
  '|- id="r-00002"',
  '| r-00002',
  '| Mia',
  '|- id="r-00003"',
  '| r-00001',
  '| Tom',
  '```',
  '',
];

function maske(tabelle, titel) {
  return [
    '---',
    'db-form:',
    `  table: ${tabelle}`,
    '---',
    '',
    `# ${titel}`,
    '',
    '{{field:borrower}}',
    '',
  ];
}

// Die Listen-Maske: Angaben im Behälter, Beschreibung, ein Abfrage-Block mit
// zwei Feldern und einem Pfad über das Verweis-Feld.
function abfrageDatei(angaben, titel) {
  return [
    '---',
    'db-query:',
    ...angaben.map((z) => `  ${z}`),
    '---',
    '',
    `# ${titel}`,
    '',
    'Die Ausleihen zur Pflege, je Zeile mit dem Titel des Buches.',
    '',
    '```perspective-query',
    'TABLE RECORDS borrower, book, book.title FROM "Loans"',
    '```',
    '',
  ];
}

// Eine Tabelle mit 120 Datensätzen; die Anzeige-Form ordnet sie, weil die
// Abfrage keine Sortierung nennt.
function vieleDatensaetze() {
  const zeilen = [
    '---',
    'db-table:',
    '  fields:',
    '    - name: name',
    '  display: name',
    '---',
    '',
  ];
  zeilen.push('```perspective-records');
  for (let n = 1; n <= 120; n++) {
    zeilen.push(
      `|- id="r-${String(n).padStart(5, '0')}"`,
      `| Eintrag ${String(n).padStart(3, '0')}`,
    );
  }
  zeilen.push('```', '');
  return zeilen;
}

const VIELE_LISTE = [
  '---',
  'db-query:',
  '  editable: true',
  '---',
  '',
  '# Viele',
  '',
  '```perspective-query',
  'TABLE RECORDS name FROM "Viele"',
  '```',
  '',
];

// 4T-002250: «Fristen» nach dem Vorbild der Demo-Tabelle «Loans», mit der
// Prüfregel über zwei Felder und der Bedingung `editable`; Mia hat
// zurückgegeben, ihre Zeile ist nicht änderbar.
const FRISTEN = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: borrower',
  '    - name: lent',
  '      type: date',
  '    - name: due',
  '      type: date',
  '    - name: returned',
  '      type: boolean',
  '  display: borrower',
  '  checks:',
  '    - rule: due >= lent',
  '      message: Die Frist liegt vor dem Tag der Ausleihe.',
  '  editable: NOT returned',
  '  lastId: 3',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Clara',
  '| 2026-09-01',
  '| 2026-09-15',
  '|',
  '|- id="r-00002"',
  '| Mia',
  '| 2026-09-03',
  '| 2026-09-17',
  '| x',
  '|- id="r-00003"',
  '| Tom',
  '| 2026-09-05',
  '| 2026-09-19',
  '|',
  '```',
  '',
];

const FRISTEN_LISTE = [
  '---',
  'db-query:',
  '  editable: true',
  '---',
  '',
  '# Fristen',
  '',
  '```perspective-query',
  'TABLE RECORDS borrower, lent, due, returned FROM "Fristen"',
  '```',
  '',
];

// 4T-002251: dieselbe Tabelle mit allen drei Handgriffen, und «Library» allein
// mit dem Löschen.
const FRISTEN_PFLEGE = [
  '---',
  'db-query:',
  '  editable: true',
  '  allow: [create, update, delete]',
  '---',
  '',
  '# Fristen pflegen',
  '',
  '```perspective-query',
  'TABLE RECORDS borrower, lent, due, returned FROM "Fristen"',
  '```',
  '',
];

const LIBRARY_LISTE = [
  '---',
  'db-query:',
  '  editable: true',
  '  allow: [delete]',
  '---',
  '',
  '# Bücher',
  '',
  '```perspective-query',
  'TABLE RECORDS title, pages FROM "Library"',
  '```',
  '',
];

function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dblis-'));
  const datei = (name, zeilen) => {
    const pfad = path.join(wurzel, name);
    fs.writeFileSync(pfad, zeilen.join('\n'), 'utf8');
    return pfad;
  };
  datei('Library.md', LIBRARY);
  datei('Loans.md', LOANS);
  datei('Loans Form.md', maske('Loans', 'Ausleihe'));
  datei('Loans Short Form.md', maske('Loans', 'Ausleihe kurz'));
  datei('Viele.md', vieleDatensaetze());
  const fristen = datei('Fristen.md', FRISTEN);
  return {
    fristen,
    fristenListe: datei('Fristen Liste.md', FRISTEN_LISTE),
    fristenPflege: datei('Fristen Pflege.md', FRISTEN_PFLEGE),
    libraryListe: datei('Library Liste.md', LIBRARY_LISTE),
    wurzel,
    liste: datei(
      'Ausleihen.md',
      abfrageDatei(['editable: true', 'form: Loans Short Form'], 'Ausleihen'),
    ),
    lesend: datei('Ausleihen lesend.md', abfrageDatei(['form: Loans Short Form'], 'Nur lesen')),
    viele: datei('Viele Liste.md', VIELE_LISTE),
  };
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

async function oeffneDokument(app, page, pfad) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, p) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [p]);
    },
    pfad,
  );
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Zurück zum Reiter des Dokuments und in die gewünschte Ansicht.
async function zumDokument(page, name, ansicht) {
  await page.locator(SEL.tabs0, { hasText: name }).first().click();
  await expect(page.locator(SEL.activeTab0)).toContainText(name);
  await page.locator(SEL.viewBtn(ansicht)).click();
}

// Die Zähl-Zeile einer Liste in einer der fünf Sprachfassungen.
async function erwarteZaehlung(liste, von, bis, gesamt) {
  const erwartet = saetze('database.list.count', { von, bis, gesamt });
  await expect
    .poll(async () => erwartet.includes(await liste.locator('.db-list-count').textContent()))
    .toBe(true);
}

// Die Texte der Datensatz-Spalte aller Zeilen des Gitters.
function ersteSpalte(liste) {
  return liste.locator('tbody tr.db-list-row td.db-list-col-record');
}

// Prüft, dass die genannte Masken-Datei den genannten Datensatz zeigt.
async function maskeZeigt(page, titel, anzeige, datei) {
  const offen = page.locator(MASKE);
  await expect(offen).toBeVisible();
  await expect(offen.locator('.db-form-heading')).toHaveText('Loans');
  await expect(offen.locator('.db-form-record')).toContainText(anzeige);
  await expect(offen.locator('.db-form-source')).toContainText(datei, { timeout: 20000 });
  await expect(offen.locator('.db-form-body h1')).toHaveText(titel);
}

test.describe('DB-LIS-01: Listen-Maske als Gitter in Lese- und Live-Ansicht (4T-002249)', () => {
  test('Gitter mit Zähl-Zeile an der Stelle der Ergebnis-Tabelle, Beschreibung darüber, ohne editable die Ergebnis-Tabelle', async () => {
    const { wurzel, liste, lesend } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokument(app, page, liste);
      const koerper = page.locator(SEL.markdownBody0);
      const gitter = koerper.locator('.db-list');
      await expect(gitter.locator('table.db-list-table')).toBeVisible({ timeout: WARTE_LISTE_MS });
      await erwarteZaehlung(gitter, '1', '3', '3');
      await expect(koerper.locator('table.perspective-query-table')).toHaveCount(0);

      // Die Beschreibung steht über der Liste, die Datei bleibt ein Dokument.
      const beschreibung = koerper.locator('p', { hasText: 'Die Ausleihen zur Pflege' });
      await expect(beschreibung).toBeVisible();
      const darueber = await beschreibung.evaluate(
        (p) =>
          !!(
            p.compareDocumentPosition(document.querySelector('.markdown-body .db-list')) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ),
      );
      expect(darueber).toBe(true);

      // Kopf: Datensatz, zwei Felder, ein Pfad; Felder bearbeitbar gekennzeichnet.
      // 4T-002250: Ohne `allow` ist `update` erlaubt, am Ende steht die Aktions-Spalte.
      const koepfe = gitter.locator('thead th');
      await expect(koepfe).toHaveCount(5);
      await expect(koepfe.nth(4)).toHaveClass(/db-list-col-actions/);
      expect(saetze('query.table.recordColumn')).toContain(await koepfe.nth(0).textContent());
      await expect(koepfe.nth(1)).toHaveText('borrower');
      await expect(koepfe.nth(1)).toHaveClass(/db-list-col-field/);
      await expect(koepfe.nth(2)).toHaveClass(/db-list-col-field/);
      await expect(koepfe.nth(3)).toHaveText('book.title');
      await expect(koepfe.nth(3)).toHaveClass(/db-list-col-readonly/);
      await expect(ersteSpalte(gitter)).toHaveText(['Clara', 'Mia', 'Tom']);
      const zeile = gitter.locator('tbody tr.db-list-row').nth(0);
      await expect(zeile.locator('td').nth(3)).toHaveText('Zauberberg');
      // Bis 50 Zeilen kein Blättern.
      await expect(gitter.locator('.db-list-nav')).toHaveCount(0);

      // Live-Ansicht: dasselbe Gitter im Block, die Beschreibung darüber.
      await zumDokument(page, 'Ausleihen', 'live');
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toContainText('Die Ausleihen zur Pflege');
      const live = editor.locator('.db-list');
      await expect(live.locator('table.db-list-table')).toBeVisible({ timeout: WARTE_LISTE_MS });
      await erwarteZaehlung(live, '1', '3', '3');
      await expect(ersteSpalte(live)).toHaveText(['Clara', 'Mia', 'Tom']);

      // Ohne `editable` die Ergebnis-Tabelle wie bisher.
      await oeffneDokument(app, page, lesend);
      await expect(page.locator(SEL.activeTab0)).toContainText('Ausleihen lesend');
      await page.locator(SEL.viewBtn('rendered')).click();
      const tabelle = page.locator(`${SEL.markdownBody0} table.perspective-query-table`);
      await expect(tabelle).toBeVisible();
      await expect(tabelle.locator('tbody tr')).toHaveCount(3);
      await expect(page.locator(`${SEL.markdownBody0} .db-list`)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

test.describe('DB-LIS-02: Klick in die benannte Maske und Blättern (4T-002249)', () => {
  test('Zeile öffnet die mit form benannte Maske in Lese- und Live-Ansicht, 120 Datensätze in Seiten zu 50', async () => {
    const { wurzel, liste, viele } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokument(app, page, liste);

      // Lese-Ansicht: Klick auf die Zeile öffnet «Loans Short Form», nicht die
      // Standard-Maske «Loans Form».
      const gitter = page.locator(`${SEL.markdownBody0} .db-list`);
      await expect(gitter.locator('table.db-list-table')).toBeVisible({ timeout: WARTE_LISTE_MS });
      await expect(gitter.locator('tbody tr.db-list-row').nth(1)).toHaveAttribute(
        'data-fm-record-maske',
        /Loans Short Form\.md$/,
      );
      await ersteSpalte(gitter).nth(1).click();
      await maskeZeigt(page, 'Ausleihe kurz', 'Mia', 'Loans Short Form.md');

      // Live-Ansicht: derselbe Klick.
      await zumDokument(page, 'Ausleihen', 'live');
      const live = page.locator(`${SEL.editorContent0} .db-list`);
      await expect(live.locator('table.db-list-table')).toBeVisible({ timeout: WARTE_LISTE_MS });
      await ersteSpalte(live).nth(2).click();
      await maskeZeigt(page, 'Ausleihe kurz', 'Tom', 'Loans Short Form.md');

      // Blättern: 120 Datensätze, Seiten zu 50 Zeilen.
      await oeffneDokument(app, page, viele);
      await expect(page.locator(SEL.activeTab0)).toContainText('Viele Liste');
      await page.locator(SEL.viewBtn('rendered')).click();
      const seite = page.locator(`${SEL.markdownBody0} .db-list`);
      await expect(seite.locator('table.db-list-table')).toBeVisible({ timeout: WARTE_LISTE_MS });
      await erwarteZaehlung(seite, '1', '50', '120');
      await expect(ersteSpalte(seite)).toHaveCount(50);
      await expect(ersteSpalte(seite).first()).toHaveText('Eintrag 001');
      const zurueck = seite.locator('.db-list-prev');
      const vor = seite.locator('.db-list-next');
      expect(saetze('database.list.prev')).toContain(await zurueck.textContent());
      expect(saetze('database.list.next')).toContain(await vor.textContent());
      await expect(zurueck).toBeDisabled();
      await vor.click();
      await erwarteZaehlung(seite, '51', '100', '120');
      await expect(ersteSpalte(seite).first()).toHaveText('Eintrag 051');
      await seite.locator('.db-list-next').click();
      await erwarteZaehlung(seite, '101', '120', '120');
      await expect(ersteSpalte(seite)).toHaveCount(20);
      await expect(seite.locator('.db-list-next')).toBeDisabled();
      await seite.locator('.db-list-prev').click();
      await erwarteZaehlung(seite, '51', '100', '120');

      // Live-Ansicht: Vor blättert, und der Block bleibt die Liste.
      await zumDokument(page, 'Viele Liste', 'live');
      const liveSeite = page.locator(`${SEL.editorContent0} .db-list`);
      await expect(liveSeite.locator('table.db-list-table')).toBeVisible({
        timeout: WARTE_LISTE_MS,
      });
      await erwarteZaehlung(liveSeite, '1', '50', '120');
      await liveSeite.locator('.db-list-next').click();
      await erwarteZaehlung(liveSeite, '51', '100', '120');
      await expect(ersteSpalte(liveSeite).first()).toHaveText('Eintrag 051');
      await expect(page.locator(SEL.editorContent0)).not.toContainText('TABLE RECORDS name');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

// --- 4T-002250: Zeilen ändern ------------------------------------------------------------

// Die Zelle eines Feldes in einer Zeile: Spalten Datensatz, borrower, lent, due,
// returned, Aktionen.
const FRISTEN_SPALTE = { borrower: 1, lent: 2, due: 3, returned: 4 };

function sperrDateiVon(wurzel, id) {
  const benannt = sperrDateiName(wurzel, { art: 'record', tabelle: 'Fristen.md', id });
  return path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME, benannt.name);
}

function zelleIn(zeile, feld) {
  return zeile.locator('td').nth(FRISTEN_SPALTE[feld]);
}

async function oeffneFristen(app, page, bereich) {
  await bindeBereich(page, bereich.wurzel);
  await oeffneDokument(app, page, bereich.fristenListe);
  await expect(page.locator(SEL.activeTab0)).toContainText('Fristen Liste');
  const gitter = page.locator(`${SEL.markdownBody0} .db-list`);
  await expect(gitter.locator('table.db-list-table')).toBeVisible({ timeout: WARTE_LISTE_MS });
  await expect(ersteSpalte(gitter)).toHaveText(['Clara', 'Mia', 'Tom']);
  return gitter;
}

test.describe('DB-LIS-03: Zeile ändern, Abweisung an der Zelle, lesende Zeile (4T-002250)', () => {
  test('Doppelklick und Eingabetaste schreiben den Wert in die Datei, eine Prüfregel weist an der Zelle ab', async () => {
    const bereich = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      const gitter = await oeffneFristen(app, page, bereich);
      const zeilen = gitter.locator('tbody tr.db-list-row');

      // Lesende Zeile: Mia hat zurückgegeben und bekommt kein «Bearbeiten».
      await expect(zeilen.nth(1)).toHaveClass(/db-list-row-readonly/, { timeout: WARTE_LISTE_MS });
      await expect(zeilen.nth(1).locator('.db-list-edit')).toHaveCount(0);
      await expect(zeilen.nth(0).locator('.db-list-edit')).toHaveCount(1);
      await expect(zeilen.nth(2).locator('.db-list-edit')).toHaveCount(1);
      expect(saetze('database.list.edit')).toContain(
        await zeilen.nth(0).locator('.db-list-edit').textContent(),
      );

      // Doppelklick in «due» beginnt die Bearbeitung; die Maske öffnet nicht.
      const clara = zeilen.nth(0);
      await zelleIn(clara, 'due').dblclick();
      await expect(clara).toHaveClass(/db-list-row-editing/, { timeout: 20000 });
      await expect(page.locator(MASKE)).toHaveCount(0);
      const due = clara.locator('.db-form-field[data-field="due"] .db-form-input');
      await expect(due).toHaveValue('2026-09-15');
      await expect(zelleIn(clara, 'borrower').locator('.db-form-input')).toHaveValue('Clara');
      // Blättern und «Bearbeiten» der übrigen Zeilen sind angehalten; die Sperre steht.
      await expect(zeilen.nth(2).locator('.db-list-edit')).toBeDisabled();
      const sperrDatei = sperrDateiVon(bereich.wurzel, 'r-00001');
      expect(fs.existsSync(sperrDatei)).toBe(true);

      await due.fill('2026-09-30');
      await due.press('Enter');
      await expect
        .poll(() => fs.readFileSync(bereich.fristen, 'utf8'), { timeout: 20000 })
        .toContain('| 2026-09-30\n');
      await expect(gitter.locator('tbody tr.db-list-row-editing')).toHaveCount(0, {
        timeout: 20000,
      });
      await expect(gitter.locator('input')).toHaveCount(0);
      await expect.poll(() => fs.existsSync(sperrDatei)).toBe(false);
      expect(fs.readFileSync(bereich.fristen, 'utf8')).not.toContain('| 2026-09-15\n');

      // Prüfregel-Verletzung: «due» vor «lent». Die Zelle ist markiert, der Satz
      // steht in der Zeile, und die Datei bleibt, wie sie war.
      const nochmal = gitter.locator('tbody tr.db-list-row').nth(0);
      await nochmal.locator('.db-list-edit').click();
      await expect(nochmal).toHaveClass(/db-list-row-editing/, { timeout: 20000 });
      const due2 = nochmal.locator('.db-form-field[data-field="due"] .db-form-input');
      await due2.fill('2026-08-01');
      await nochmal.locator('.db-list-save').click();
      await expect(nochmal.locator('.db-form-field[data-field="due"]')).toHaveClass(
        /db-form-rejected/,
        { timeout: 20000 },
      );
      await expect(nochmal.locator('td.db-list-actions .db-form-errors')).toContainText(
        'Die Frist liegt vor dem Tag der Ausleihe.',
      );
      await expect(nochmal).toHaveClass(/db-list-row-editing/);
      const text = fs.readFileSync(bereich.fristen, 'utf8');
      expect(text).toContain('| 2026-09-30\n');
      expect(text).not.toContain('2026-08-01');

      // Escape verwirft; die Zeile kehrt ins Lesen zurück.
      await due2.press('Escape');
      await expect(nochmal).not.toHaveClass(/db-list-row-editing/);
      await expect(gitter.locator('input')).toHaveCount(0);
      await expect.poll(() => fs.existsSync(sperrDatei)).toBe(false);
      expect(fs.readFileSync(bereich.fristen, 'utf8')).not.toContain('2026-08-01');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(bereich.wurzel);
    }
  });
});

test.describe('DB-LIS-04: Fremd-Änderung zwischen Lesen und Speichern (4T-002250)', () => {
  test('Speichern zeigt die Wahl unter der Zeile, «Neu laden» zeigt den fremden Wert', async () => {
    const bereich = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      const gitter = await oeffneFristen(app, page, bereich);
      const clara = gitter.locator('tbody tr.db-list-row').nth(0);
      await clara.locator('.db-list-edit').click();
      await expect(clara).toHaveClass(/db-list-row-editing/, { timeout: 20000 });
      await clara
        .locator('.db-form-field[data-field="borrower"] .db-form-input')
        .fill('Clara Meins');

      // Die Datei ändert sich von außen; die Bearbeitung bleibt dabei stehen.
      const vorher = fs.readFileSync(bereich.fristen, 'utf8');
      expect(vorher.split('| Clara\n')).toHaveLength(2);
      fs.writeFileSync(bereich.fristen, vorher.replace('| Clara\n', '| Clara Fremd\n'), 'utf8');
      await page.waitForTimeout(1500);
      await expect(clara).toHaveClass(/db-list-row-editing/);
      await expect(
        clara.locator('.db-form-field[data-field="borrower"] .db-form-input'),
      ).toHaveValue('Clara Meins');

      await clara.locator('.db-list-save').click();
      const wahl = gitter.locator('tr.db-list-row-block .db-form-stale');
      await expect(wahl).toHaveCount(1, { timeout: 20000 });
      expect(fs.readFileSync(bereich.fristen, 'utf8')).toContain('| Clara Fremd\n');
      expect(fs.readFileSync(bereich.fristen, 'utf8')).not.toContain('Clara Meins');

      // «Neu laden» verwirft den Entwurf und zeigt den vorgefundenen Stand.
      await wahl.locator('.db-form-stale-reload').click();
      await expect(gitter.locator('input')).toHaveCount(0, { timeout: 20000 });
      await expect(gitter.locator('tr.db-list-row-block')).toHaveCount(0);
      await expect(ersteSpalte(gitter)).toHaveText(['Clara Fremd', 'Mia', 'Tom'], {
        timeout: 20000,
      });
      await expect(zelleIn(gitter.locator('tbody tr.db-list-row').nth(0), 'borrower')).toHaveText(
        'Clara Fremd',
      );
      expect(fs.readFileSync(bereich.fristen, 'utf8')).not.toContain('Clara Meins');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(bereich.wurzel);
    }
  });
});

// --- 4T-002251: Anlegen und Löschen -------------------------------------------------------

// Die Zeile eines Datensatzes nach dem Text seiner Datensatz-Spalte.
function zeileVon(page, gitter, anzeige) {
  return gitter
    .locator('tbody tr.db-list-row')
    .filter({ has: page.locator('td.db-list-col-record', { hasText: anzeige }) });
}

// Eröffnet eine Neuanlage und füllt ihre Zeile aus; gespeichert wird danach.
async function fuelleNeueZeile(gitter, werte) {
  await gitter.locator('.db-list-new').click();
  const neu = gitter.locator('tbody tr.db-list-row-new');
  await expect(neu).toHaveClass(/db-list-row-editing/, { timeout: 20000 });
  expect(saetze('database.list.newRow')).toContain(
    await neu.locator('td.db-list-col-record').textContent(),
  );
  for (const [feld, wert] of Object.entries(werte)) {
    await neu.locator(`.db-form-field[data-field="${feld}"] .db-form-input`).fill(wert);
  }
  return neu;
}

test.describe('DB-LIS-05: Anlegen und Löschen, Lösch-Schutz unter der Zeile (4T-002251)', () => {
  test('«Neue Zeile» schreibt den Datensatz in die Datei, «Ja, löschen» entfernt ihn, ein Buch mit Ausleihe bleibt', async () => {
    const bereich = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, bereich.wurzel);
      await oeffneDokument(app, page, bereich.fristenPflege);
      await expect(page.locator(SEL.activeTab0)).toContainText('Fristen Pflege');
      const gitter = page.locator(`${SEL.markdownBody0} .db-list`);
      await expect(gitter.locator('table.db-list-table')).toBeVisible({ timeout: WARTE_LISTE_MS });
      await expect(ersteSpalte(gitter)).toHaveText(['Clara', 'Mia', 'Tom']);
      expect(saetze('database.list.new')).toContain(
        await gitter.locator('.db-list-new').textContent(),
      );

      // Mia ist nicht änderbar und bietet kein «Löschen», die übrigen schon.
      const zeilen = gitter.locator('tbody tr.db-list-row');
      await expect(zeilen.nth(1)).toHaveClass(/db-list-row-readonly/, { timeout: WARTE_LISTE_MS });
      await expect(zeilen.nth(1).locator('.db-list-delete')).toHaveCount(0);
      await expect(zeilen.nth(0).locator('.db-list-delete')).toHaveCount(1);
      expect(saetze('database.list.delete')).toContain(
        await zeilen.nth(0).locator('.db-list-delete').textContent(),
      );

      // Anlegen: die neue Zeile oben, ausgefüllt und gespeichert.
      const neu = await fuelleNeueZeile(gitter, {
        borrower: 'Lena',
        lent: '2026-09-10',
        due: '2026-09-24',
      });
      await expect(zeilen.first()).toHaveClass(/db-list-row-new/);
      await expect(gitter.locator('.db-list-new')).toBeDisabled();
      await neu.locator('.db-list-save').click();
      await expect
        .poll(() => fs.readFileSync(bereich.fristen, 'utf8'), { timeout: 20000 })
        .toContain('| Lena\n');
      expect(fs.readFileSync(bereich.fristen, 'utf8')).toContain('|- id="r-00004"');
      await expect(gitter.locator('tbody tr.db-list-row-new')).toHaveCount(0, { timeout: 20000 });
      await expect(zeileVon(page, gitter, 'Lena')).toHaveCount(1, { timeout: 20000 });
      await expect(ersteSpalte(gitter)).toHaveCount(4);

      // Löschen: Rückfrage unter der Zeile, «Ja, löschen», Datensatz aus der Datei.
      await zeileVon(page, gitter, 'Lena').locator('.db-list-delete').click();
      const frage = gitter.locator('tr.db-list-row-block .db-form-confirm-delete');
      await expect(frage).toHaveCount(1, { timeout: 20000 });
      expect(saetze('database.form.confirmDelete')).toContain(
        await frage.locator('.db-form-confirm-text').textContent(),
      );
      await frage.locator('.db-form-delete-yes').click();
      await expect
        .poll(() => fs.readFileSync(bereich.fristen, 'utf8'), { timeout: 20000 })
        .not.toContain('Lena');
      await expect(ersteSpalte(gitter)).toHaveText(['Clara', 'Mia', 'Tom'], { timeout: 20000 });
      await expect(gitter.locator('tr.db-list-row-block')).toHaveCount(0);
      await expect.poll(() => fs.existsSync(sperrDateiVon(bereich.wurzel, 'r-00004'))).toBe(false);

      // Live-Ansicht: dasselbe Anlegen, gespeichert mit der Eingabetaste.
      await zumDokument(page, 'Fristen Pflege', 'live');
      const live = page.locator(`${SEL.editorContent0} .db-list`);
      await expect(live.locator('table.db-list-table')).toBeVisible({ timeout: WARTE_LISTE_MS });
      // Die Prüfregel der Tabelle verlangt beide Tage.
      const liveNeu = await fuelleNeueZeile(live, {
        borrower: 'Live',
        lent: '2026-09-11',
        due: '2026-09-25',
      });
      await liveNeu.locator('.db-form-field[data-field="borrower"] .db-form-input').press('Enter');
      await expect
        .poll(() => fs.readFileSync(bereich.fristen, 'utf8'), { timeout: 20000 })
        .toContain('| Live\n');
      await expect(live.locator('tbody tr.db-list-row-new')).toHaveCount(0, { timeout: 20000 });
      await expect(page.locator(SEL.editorContent0)).not.toContainText('TABLE RECORDS borrower');

      // Lösch-Schutz: Auf «Zauberberg» verweisen noch Ausleihen; das Buch bleibt.
      await oeffneDokument(app, page, bereich.libraryListe);
      await expect(page.locator(SEL.activeTab0)).toContainText('Library Liste');
      await page.locator(SEL.viewBtn('rendered')).click();
      const buecher = page.locator(`${SEL.markdownBody0} .db-list`);
      await expect(buecher.locator('table.db-list-table')).toBeVisible({ timeout: WARTE_LISTE_MS });
      await expect(buecher.locator('.db-list-edit')).toHaveCount(0);
      await expect(buecher.locator('.db-list-new')).toHaveCount(0);
      const zauberberg = zeileVon(page, buecher, 'Zauberberg');
      await zauberberg.locator('.db-list-delete').click();
      const ja = buecher.locator('tr.db-list-row-block .db-form-delete-yes');
      await expect(ja).toHaveCount(1, { timeout: 20000 });
      await ja.click();
      const befund = buecher.locator('tr.db-list-row-block .db-form-errors');
      await expect(befund).toBeVisible({ timeout: 20000 });
      await expect(befund).toContainText('Loans');
      await expect(zauberberg).toHaveCount(1);
      const library = fs.readFileSync(path.join(bereich.wurzel, 'Library.md'), 'utf8');
      expect(library).toContain('| Zauberberg');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(bereich.wurzel);
    }
  });
});

// 4T-002311: der Steckbrief mit der Vorgabe-Rolle, die an «Fristen» allein ändern darf.
const STECKBRIEF_NUR_AENDERN = [
  '---',
  'db-database:',
  '  name: Bibliothek',
  '  roles:',
  '    librarian: all',
  '    assistant:',
  '      Fristen: [update]',
  '  defaultRole: assistant',
  '---',
  '',
];

test.describe('DB-LIS-06: Schnitt aus allow und Rolle (4T-002311)', () => {
  test('allow [create, update, delete] und Rolle nur update: allein «Bearbeiten»', async () => {
    const bereich = baueBereich();
    const steckbrief = STECKBRIEF_NUR_AENDERN.join('\n');
    fs.writeFileSync(path.join(bereich.wurzel, 'Datenbank.md'), steckbrief, 'utf8');
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, bereich.wurzel);
      await oeffneDokument(app, page, bereich.fristenPflege);
      await expect(page.locator(SEL.activeTab0)).toContainText('Fristen Pflege');
      const gitter = page.locator(`${SEL.markdownBody0} .db-list`);
      await expect(gitter.locator('table.db-list-table')).toBeVisible({ timeout: WARTE_LISTE_MS });
      await expect(ersteSpalte(gitter)).toHaveText(['Clara', 'Mia', 'Tom']);
      // Clara und Tom bieten «Bearbeiten»; Mia bleibt nach der Bedingung lesend.
      await expect(gitter.locator('.db-list-edit')).toHaveCount(2, { timeout: WARTE_LISTE_MS });
      await expect(gitter.locator('.db-list-new')).toHaveCount(0);
      await expect(gitter.locator('.db-list-delete')).toHaveCount(0);
      expect(saetze('database.list.edit')).toContain(
        await gitter.locator('.db-list-edit').first().textContent(),
      );
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(bereich.wurzel);
    }
  });
});
