// 4T-002039 (Epic 3E-000258): Ablauf-Prüffälle der Datensatz-Ebene der
// Abfrage-Sprache, Familie DB-ABF nach dem Muster DB-MAS und DB-KON.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Kette reicht vom Abfrage-Block eines Dokuments über die Render-Pipeline des
// Anzeige-Prozesses, den Abfrage-Kanal und den Index des Bereichs bis zum
// Tabellen-Bestand, der die Tabellen-Datei frisch liest, und zurück in das DOM
// der Ansicht. Erst in der laufenden Anwendung stehen Programmsprache, Index,
// Befüllung und die Maske des Datensatzes zusammen.
//
// **DB-ABF-01** zeigt, dass eine Datensatz-Abfrage als Liste und als Tabelle
// erscheint: Treffer mit der Anzeige-Form des Datensatzes, Bedingung und
// Sortierung über Zahlen, die Spalte mit der Beschriftung der Tabelle in der
// Sprache der Oberfläche. Seit 4T-002040 dazu der Kopf «Datensatz» der ersten
// Spalte, der eigene Leer-Text der Ebene und der Klick auf einen Treffer, der in
// der Lese-, der geteilten und der Live-Ansicht die Maske des Datensatzes öffnet
// und kein Dokument (Entscheidung F1 Option A).
//
// **DB-ABF-02** (4T-002040) zeigt den Datensatz-Verweis in einer Spalte an den
// Tabellen «Loans» und «Library», nachgebaut nach dem Demo-Bereich: das Buch
// einer Ausleihe mit seinem Titel, leerer Verweis und Verweis ins Leere als
// leere Zelle, der Klick in die Maske des Buches. Dazu der ungespeicherte Stand
// einer offenen Tabelle (E25): Ein geänderter Titel erscheint sofort in der
// Ausgabe. Die Maske liest dagegen den gespeicherten Stand; das ist ihr
// Vertrag aus 4T-001938 (Anzeige und Erwartung aus demselben Stand) und hier
// als Verhalten festgehalten.
//
// **DB-ABF-03** (4T-002041) zeigt die Pfad-Navigation über ein Verweis-Feld (E6.2):
// Titel und Autor des Buches je Ausleihe, gleich ob die Ausleihe über die
// Kennung oder den Schlüssel-Wert verweist; die Gegenrichtung, also die
// Ausleihen eines Buches, über eine Bedingung auf dem Verweis-Feld mit Kennung
// und mit Schlüssel-Wert; dazu der ungespeicherte Stand der Ziel-Tabelle.
//
// **DB-ABF-04** (4T-002042) zeigt die transitive Hülle (E6.3) an einer Tabelle
// mit Selbstbezug: alle Nachkommen ohne das Ziel, dieselben gefiltert, alle
// Vorfahren, ein Kreis als Hinweis und kein Fehler, dazu der ungespeicherte Stand
// eines Eltern-Verweises. Die Demo-Tabelle mit Selbstbezug entsteht erst mit dem
// Handbuch-Vorgang; bis dahin legt der Fall seine Tabelle selbst an.
//
// **DB-ABF-05** (4T-002044) zeigt dieselbe Tabelle als Baum
// (`DISPLAY tree BY boss`) in der Lese-, der geteilten und der Live-Ansicht:
// Wurzeln, Einrückung, Kreis ohne Verlust, die Nachkommen-Menge mit den Kindern
// des Ziels als Wurzeln, der Klick auf einen Knoten in die Maske und ein
// ungespeicherter Eltern-Verweis, der den Knoten sofort umhängt.
//
// **DB-ABF-06** (4T-002078, Epic 3E-000259) zeigt die gruppierte Tabelle mit einer
// Zeile je Gruppe (F1 Option A): Bücher je Autor mit Anzahl und Seiten-Summe,
// vorn der Autor, in der Lese-, der geteilten und der Live-Ansicht; dazu die
// Ausleihen je Buch, deren Gruppen-Wert das Buch als Verweis ist, mit der Gruppe
// ohne Wert für leere und ins Leere zeigende Verweise. Der Klick auf das Buch
// öffnet in allen drei Ansichten seine Maske. Seit 4T-002079 dazu die Bedingung
// über die Gruppe: nur Autoren mit mehr als einem Buch (`HAVING count() > 1`) als
// Tabelle und als Liste, und eine ungespeicherte Änderung der Bedingung, der die
// Ausgabe sofort folgt.
//
// **Sprache**: Das Profil der Ablauf-Prüffälle steht auf Deutsch
// (Vorbelegung in helpers/app.js); die Beschriftung der Spalte ist deshalb die
// deutsche Fassung der Tabellen-Datei. Übersetzte Texte der Oberfläche werden
// gegen die Menge der fünf Sprachfassungen geprüft.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { hauptSenden } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');
const { LOCALE_CODES } = require('../../../src/shared/locales.js');

const MASKE = '.pane-group[data-pane="0"] .pane-system .db-form-page';

function inAllenSprachen(key) {
  return LOCALE_CODES.map((code) => require(`../../../src/i18n/${code}.json`)[key]);
}

// Die Tabelle «Library»: Titel mit Beschriftung in zwei Sprachen und Seitenzahl
// als Zahl. Als Text läge «1000» vor «500» und fiele aus der Bedingung heraus.
const LIBRARY = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: title',
  '      label:',
  '        de: Titel',
  '        en: Title',
  '    - name: author',
  '    - name: pages',
  '      type: number',
  '  display: title',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Zauberberg',
  '| Mann',
  '| 1000',
  '|- id="r-00002"',
  '| Anna Karenina',
  '| Tolstoi',
  '| 864',
  '|- id="r-00003"',
  '| Kurz',
  '| Kafka',
  '| 120',
  '```',
  '',
].join('\n');

// Die Tabelle «Loans» mit der Verweis-Spalte «book» auf «Library»: ein Verweis
// mit Ziel, ein leerer und einer ins Leere. Die Anzeige-Form ist der Name.
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
  '|',
  '| Mia',
  '|- id="r-00003"',
  '| r-00099',
  '| Tom',
  '```',
  '',
].join('\n');

// Das Dokument mit drei Abfrage-Blöcken: eine Liste ohne SORT (Ordnung nach
// Anzeige-Form), eine Tabelle mit Bedingung und Sortierung, eine Abfrage ohne
// Treffer.
const ABFRAGEN = [
  '# Bibliothek',
  '',
  '```perspective-query',
  'LIST RECORDS author FROM "Library"',
  '```',
  '',
  '```perspective-query',
  'TABLE RECORDS title, pages FROM "Library" WHERE pages > 500 SORT pages DESC',
  '```',
  '',
  '```perspective-query',
  'LIST RECORDS FROM "Library" WHERE pages > 5000',
  '```',
  '',
].join('\n');

const AUSLEIHEN = [
  '# Ausleihen',
  '',
  '```perspective-query',
  'TABLE RECORDS book, borrower FROM "Loans"',
  '```',
  '',
].join('\n');

function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dbabf-'));
  const datei = (name, text) => {
    const pfad = path.join(wurzel, name);
    fs.writeFileSync(pfad, text, 'utf8');
    return pfad;
  };
  return {
    wurzel,
    library: datei('Library.md', LIBRARY),
    loans: datei('Loans.md', LOANS),
    abfragen: datei('Abfragen.md', ABFRAGEN),
    ausleihen: datei('Ausleihen.md', AUSLEIHEN),
  };
}

// 4T-002041: Für die Pfad-Navigation trägt die Bibliothek wie im Demo-Bereich den
// Titel als Schlüssel; eine Ausleihe verweist über den Schlüssel-Wert, die
// übrigen über die Kennung.
const LIBRARY_KEYED = LIBRARY.replace('  display: title', '  key: title\n  display: title');
const LOANS_PFADE = LOANS.replace(
  '|- id="r-00002"\n|\n| Mia',
  '|- id="r-00002"\n| Zauberberg\n| Mia',
).replace('| r-00099\n| Tom', '| r-00002\n| Tom');

const PFADE = [
  '# Pfade',
  '',
  '```perspective-query',
  'TABLE RECORDS book.title, book.author, borrower FROM "Loans"',
  '```',
  '',
  '```perspective-query',
  'LIST RECORDS FROM "Loans" WHERE book = "r-00001"',
  '```',
  '',
  '```perspective-query',
  'LIST RECORDS FROM "Loans" WHERE book = "Zauberberg"',
  '```',
  '',
].join('\n');

function baueBereichPfade() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dbabf-'));
  const datei = (name, text) => {
    const pfad = path.join(wurzel, name);
    fs.writeFileSync(pfad, text, 'utf8');
    return pfad;
  };
  return {
    wurzel,
    library: datei('Library.md', LIBRARY_KEYED),
    loans: datei('Loans.md', LOANS_PFADE),
    pfade: datei('Pfade.md', PFADE),
  };
}

// 4T-002042: Eine Hierarchie mit Selbstbezug. Clara ist die Wurzel, Jonas und Lea
// berichten an sie, Mats an Jonas. Nora steht allein; ihr Verweis zeigt ins Leere,
// bis der ungespeicherte Stand ihn auf Mats setzt. Ole und Pia verweisen
// aufeinander und bilden einen Kreis.
const STAFF = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: name',
  '    - name: boss',
  '      type: record',
  '      options:',
  '        table: Staff',
  '    - name: since',
  '      type: number',
  '  key: name',
  '  display: name',
  '---',
  '',
  '```perspective-records',
  ...[
    ['r-00001', 'Clara', '', '2005'],
    ['r-00002', 'Jonas', 'r-00001', '2012'],
    ['r-00003', 'Lea', 'r-00001', '2018'],
    ['r-00004', 'Mats', 'r-00002', '2020'],
    ['r-00005', 'Nora', 'r-0000', '2010'],
    ['r-00006', 'Ole', 'r-00007', '2016'],
    ['r-00007', 'Pia', 'r-00006', '2017'],
  ].flatMap(([id, ...zellen]) => [`|- id="${id}"`, ...zellen.map((z) => `| ${z}`.trimEnd())]),
  '```',
  '',
].join('\n');

// Vier Blöcke: alle Nachkommen, dieselben gefiltert, alle Vorfahren, ein Kreis.
const HIERARCHIE = [
  '# Hierarchie',
  '',
  '```perspective-query',
  'LIST RECORDS FROM descendants([[Staff#^r-00001]], boss)',
  '```',
  '',
  '```perspective-query',
  'LIST RECORDS FROM descendants([[Staff#^r-00001]], boss) WHERE since > 2015',
  '```',
  '',
  '```perspective-query',
  'LIST RECORDS FROM ancestors([[Staff#^r-00004]], boss)',
  '```',
  '',
  '```perspective-query',
  'LIST RECORDS FROM descendants([[Staff#^r-00006]], boss)',
  '```',
  '',
].join('\n');

function baueBereichHierarchie() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dbabf-'));
  const datei = (name, text) => {
    const pfad = path.join(wurzel, name);
    fs.writeFileSync(pfad, text, 'utf8');
    return pfad;
  };
  return {
    wurzel,
    staff: datei('Staff.md', STAFF),
    hierarchie: datei('Hierarchie.md', HIERARCHIE),
  };
}

// 4T-002044: Dieselbe Tabelle als Baum, einmal über die ganze Tabelle, einmal
// über die Nachkommen von Clara, die selbst nicht in der Menge ist.
const BAUM = [
  '# Baum',
  '',
  '```perspective-query',
  'LIST RECORDS FROM "Staff" DISPLAY tree BY boss',
  '```',
  '',
  '```perspective-query',
  'LIST RECORDS FROM descendants([[Staff#^r-00001]], boss) DISPLAY tree BY boss',
  '```',
  '',
].join('\n');

function baueBereichBaum() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dbabf-'));
  const datei = (name, text) => {
    const pfad = path.join(wurzel, name);
    fs.writeFileSync(pfad, text, 'utf8');
    return pfad;
  };
  return { wurzel, staff: datei('Staff.md', STAFF), baum: datei('Baum.md', BAUM) };
}

// Die Gestalt eines gezeichneten Baums: je Knoten eine Zeile, zwei Leerzeichen
// je Ebene, abgelesen an den verschachtelten Listen.
async function baumGestalt(baum) {
  return baum.evaluate((ul) => {
    const out = [];
    const lauf = (liste, tiefe) => {
      for (const li of liste.children) {
        out.push('  '.repeat(tiefe) + li.querySelector(':scope > a').textContent);
        const unter = li.querySelector(':scope > ul.perspective-query-subtree');
        if (unter) lauf(unter, tiefe + 1);
      }
    };
    lauf(ul, 0);
    return out;
  });
}

// 4T-002078: Für die Gruppierung hat Mann zwei Bücher, und Clara und Ute leihen
// beide den Zauberberg. Die Auswertung zählt und summiert je Autor und zählt die
// Ausleihen je Buch.
const LIBRARY_GRUPPEN = LIBRARY.replace(
  '```\n',
  ['|- id="r-00004"', '| Buddenbrooks', '| Mann', '| 750', '```', ''].join('\n'),
);
const LOANS_GRUPPEN = LOANS.replace(
  '```\n',
  ['|- id="r-00004"', '| r-00001', '| Ute', '```', ''].join('\n'),
);

const AUSWERTUNG = [
  '# Auswertung',
  '',
  '```perspective-query',
  'TABLE RECORDS count() AS "Anzahl", sum(pages) AS "Seiten" FROM "Library" GROUP BY author',
  '```',
  '',
  '```perspective-query',
  'TABLE RECORDS count() AS "Ausleihen" FROM "Loans" GROUP BY book',
  '```',
  '',
].join('\n');

// 4T-002079: nur Autoren mit mehr als einem Buch, als Tabelle und als Liste.
const MEHRFACH = [
  '# Mehrfach',
  '',
  '```perspective-query',
  'TABLE RECORDS count() AS "Anzahl", sum(pages) AS "Seiten" FROM "Library" GROUP BY author HAVING count() > 1',
  '```',
  '',
  '```perspective-query',
  'LIST RECORDS FROM "Library" GROUP BY author HAVING count() > 1',
  '```',
  '',
].join('\n');

function baueBereichGruppen() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dbabf-'));
  const datei = (name, text) => {
    const pfad = path.join(wurzel, name);
    fs.writeFileSync(pfad, text, 'utf8');
    return pfad;
  };
  datei('Library.md', LIBRARY_GRUPPEN);
  datei('Loans.md', LOANS_GRUPPEN);
  return {
    wurzel,
    auswertung: datei('Auswertung.md', AUSWERTUNG),
    mehrfach: datei('Mehrfach.md', MEHRFACH),
  };
}

// Prüft beide gruppierten Tabellen an einem Ort (Lese-Fläche oder Editor) und
// liefert den Verweis auf das Buch der ersten Ausleihen-Gruppe.
async function gruppenTabellen(page, ort) {
  const tabellen = page.locator(`${ort} table.perspective-query-table`);
  await expect(tabellen).toHaveCount(2);
  const autoren = tabellen.nth(0);
  await expect(autoren.locator('thead th')).toHaveText(['author', 'Anzahl', 'Seiten']);
  const zeilen = autoren.locator('tbody tr');
  await expect(zeilen).toHaveCount(3);
  await expect(zeilen.nth(0).locator('td')).toHaveText(['Kafka', '1', '120']);
  await expect(zeilen.nth(1).locator('td')).toHaveText(['Mann', '2', '1750']);
  await expect(zeilen.nth(2).locator('td')).toHaveText(['Tolstoi', '1', '864']);
  // Eine Zeile je Gruppe: keine Treffer der einzelnen Bücher, keine Überschriften.
  await expect(autoren.locator('a.perspective-query-item')).toHaveCount(0);
  await expect(page.locator(`${ort} .perspective-query-group`)).toHaveCount(0);
  await expect(page.locator(`${ort} .perspective-query-error`)).toHaveCount(0);
  const ausleihen = tabellen.nth(1);
  await expect(ausleihen.locator('thead th')).toHaveText(['book', 'Ausleihen']);
  const buecher = ausleihen.locator('tbody tr td:first-child');
  await expect(buecher).toHaveCount(2);
  await expect(buecher.nth(0)).toHaveText('Zauberberg');
  expect(inAllenSprachen('query.group.none')).toContain(await buecher.nth(1).textContent());
  await expect(ausleihen.locator('tbody tr td:nth-child(2)')).toHaveText(['2', '2']);
  const buch = buecher.nth(0).locator('a.perspective-query-item');
  await expect(buch).toHaveAttribute('data-fm-record-id', 'r-00001');
  await expect(buch).not.toHaveAttribute('data-fm-path', /.*/);
  await expect(buecher.nth(1).locator('a')).toHaveCount(0);
  return buch;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufräumen darf den Lauf nicht kippen */
  }
}

// Die Maske liest über einen Kanal, der den gebundenen Bereich des Fensters
// prüft; der Bereich wird deshalb gebunden, bevor das Dokument aufgeht (Muster
// datenbank-maske.spec.js).
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

// Prüft, dass die Maske des genannten Datensatzes offen ist.
async function maskeZeigt(page, tabelle, anzeige) {
  const maske = page.locator(MASKE);
  await expect(maske).toBeVisible();
  await expect(maske.locator('.db-form-heading')).toHaveText(tabelle);
  await expect(maske.locator('.db-form-record')).toContainText(anzeige);
  return maske;
}

test.describe('DB-ABF-01: Datensätze einer Tabelle als Liste und Tabelle, Klick in die Maske (4T-002039, 4T-002040)', () => {
  test('Anzeige-Form, Bedingung und Sortierung, Kopf «Datensatz», Klick in drei Ansichten', async () => {
    const { wurzel, abfragen } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokument(app, page, abfragen);
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();

      // Liste ohne SORT: nach Anzeige-Form, je Treffer das Zusatzfeld.
      const liste = page.locator(`${SEL.markdownBody0} ul.perspective-query-list`);
      const eintraege = liste.locator('li');
      await expect(eintraege).toHaveCount(3);
      await expect(liste.locator('a.perspective-query-item')).toHaveText([
        'Anna Karenina',
        'Kurz',
        'Zauberberg',
      ]);
      await expect(liste.locator('.perspective-query-extra')).toHaveText([
        'Tolstoi',
        'Kafka',
        'Mann',
      ]);

      // Tabelle mit Bedingung pages > 500 und SORT pages DESC: typ-gerecht,
      // die Spalte «title» trägt ihre deutsche Beschriftung, «pages» ohne
      // Beschriftung ihren Namen; die erste Spalte heißt «Datensatz».
      const tabelle = page.locator(`${SEL.markdownBody0} table.perspective-query-table`);
      await expect(tabelle).toBeVisible();
      const koepfe = tabelle.locator('thead th');
      await expect(koepfe).toHaveCount(3);
      expect(inAllenSprachen('query.table.recordColumn')).toContain(
        await koepfe.nth(0).textContent(),
      );
      await expect(koepfe.nth(1)).toHaveText('Titel');
      await expect(koepfe.nth(2)).toHaveText('pages');
      const zeilen = tabelle.locator('tbody tr');
      await expect(zeilen).toHaveCount(2);
      const treffer = tabelle.locator('tbody a.perspective-query-item');
      await expect(treffer).toHaveText(['Zauberberg', 'Anna Karenina']);
      await expect(zeilen.nth(0).locator('td').nth(2)).toHaveText('1000');
      await expect(zeilen.nth(1).locator('td').nth(2)).toHaveText('864');
      // Der Treffer trägt Tabelle und Kennung, keinen Pfad zum Tabellen-Dokument.
      await expect(treffer.nth(0)).toHaveAttribute('data-fm-record-id', 'r-00001');
      await expect(treffer.nth(0)).not.toHaveAttribute('data-fm-path', /.*/);

      // Die Abfrage ohne Treffer zeigt den Leer-Text der Datensatz-Ebene.
      const leer = page.locator(`${SEL.markdownBody0} .perspective-query-status`);
      await expect(leer).toHaveCount(1);
      expect(inAllenSprachen('query.emptyRecords')).toContain(await leer.textContent());

      // Kein Abfrage-Fehler in den Blöcken.
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-error`)).toHaveCount(0);

      // Lese-Ansicht: Der Klick auf einen Titel öffnet die Maske des Buches und
      // kein Dokument; neben dem Dokument steht allein der Reiter der Maske.
      await treffer.nth(0).click();
      const maske = await maskeZeigt(page, 'Library', 'Zauberberg');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);

      // Geteilte Ansicht: derselbe Klick in der Anzeige-Fläche.
      await zumDokument(page, 'Abfragen', 'split');
      const geteilt = page.locator(`${SEL.markdownBody0} table.perspective-query-table`);
      await geteilt.locator('a.perspective-query-item', { hasText: 'Anna Karenina' }).click();
      await maskeZeigt(page, 'Library', 'Anna Karenina');

      // Live-Ansicht: der Klick auf einen Listen-Treffer im Block.
      await zumDokument(page, 'Abfragen', 'live');
      const live = page.locator(`${SEL.editorContent0} ul.perspective-query-list`);
      await live.locator('a.perspective-query-item', { hasText: 'Kurz' }).click();
      await maskeZeigt(page, 'Library', 'Kurz');
      await expect(maske.locator('.db-form-record')).not.toContainText('Anna Karenina');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

test.describe('DB-ABF-02: Datensatz-Verweis in einer Spalte und ungespeicherter Stand (4T-002040)', () => {
  test('Buch einer Ausleihe mit Titel, leere Verweise ohne Klick-Ziel, Klick in die Maske, Titel aus dem Puffer', async () => {
    const { wurzel, library, ausleihen } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokument(app, page, ausleihen);

      // Zeilen nach Anzeige-Form der Ausleihe: Clara, Mia, Tom. Die Spalte
      // «book» zeigt den Titel des Buches; leer und ins Leere ohne Verweis.
      const tabelle = page.locator(`${SEL.markdownBody0} table.perspective-query-table`);
      await expect(tabelle).toBeVisible();
      const zeilen = tabelle.locator('tbody tr');
      await expect(zeilen).toHaveCount(3);
      await expect(zeilen.locator('td:first-child')).toHaveText(['Clara', 'Mia', 'Tom']);
      const buch = zeilen.locator('td:nth-child(2)');
      await expect(buch).toHaveText(['Zauberberg', '', '']);
      await expect(buch.nth(0).locator('a')).toHaveAttribute('data-fm-record-id', 'r-00001');
      await expect(buch.nth(1).locator('a')).toHaveCount(0);
      await expect(buch.nth(2).locator('a')).toHaveCount(0);
      await expect(tabelle).not.toContainText('[object Object]');

      // Der Klick auf das Buch öffnet die Maske des Buches, nicht der Ausleihe.
      await buch.nth(0).locator('a').click();
      await maskeZeigt(page, 'Library', 'Zauberberg');
      await page.locator(SEL.activeTab0).locator('.tab-close').click();
      await expect(page.locator(MASKE)).toBeHidden();

      // Ungespeicherter Stand (E25): Den Titel in der offenen Tabelle ändern,
      // NICHT speichern.
      await oeffneDokument(app, page, library);
      await zumDokument(page, 'Library', 'source');
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
      await page.locator(`${SEL.editorContent0} .cm-line`, { hasText: /^\| Zauberberg$/ }).click();
      await page.keyboard.press('End');
      await page.keyboard.insertText(' (Neuausgabe)');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      // Anker: Auf der Platte steht der alte Titel.
      expect(fs.readFileSync(library, 'utf8')).not.toContain('Neuausgabe');

      // Die Ausgabe folgt sofort dem geschriebenen Stand.
      await zumDokument(page, 'Ausleihen', 'rendered');
      await expect(buch.nth(0)).toHaveText('Zauberberg (Neuausgabe)');

      // Die Maske zeigt den gespeicherten Stand des Buches.
      await buch.nth(0).locator('a').click();
      const maske = await maskeZeigt(page, 'Library', 'Zauberberg');
      await expect(maske.locator('.db-form-record')).not.toContainText('Neuausgabe');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

test.describe('DB-ABF-03: Pfad über ein Verweis-Feld und Gegenrichtung (4T-002041)', () => {
  test('Titel und Autor des Buches je Ausleihe, Ausleihen eines Buches über Kennung und Schlüssel, Titel aus dem Puffer', async () => {
    const { wurzel, library, pfade } = baueBereichPfade();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokument(app, page, pfade);

      // Vorwärts: Zeilen nach Anzeige-Form der Ausleihe (Clara, Mia, Tom); die
      // Pfad-Spalten zeigen Titel und Autor des Buches, gleich ob die Ausleihe
      // über die Kennung (Clara, Tom) oder den Schlüssel-Wert (Mia) verweist.
      const tabelle = page.locator(`${SEL.markdownBody0} table.perspective-query-table`);
      await expect(tabelle).toBeVisible();
      const koepfe = tabelle.locator('thead th');
      await expect(koepfe).toHaveCount(4);
      await expect(koepfe.nth(1)).toHaveText('book.title');
      await expect(koepfe.nth(2)).toHaveText('book.author');
      const zeilen = tabelle.locator('tbody tr');
      await expect(zeilen.locator('td:first-child')).toHaveText(['Clara', 'Mia', 'Tom']);
      await expect(zeilen.locator('td:nth-child(2)')).toHaveText([
        'Zauberberg',
        'Zauberberg',
        'Anna Karenina',
      ]);
      await expect(zeilen.locator('td:nth-child(3)')).toHaveText(['Mann', 'Mann', 'Tolstoi']);
      // Ein Wert hinter dem Verweis ist ein gewöhnlicher Wert ohne Klick-Ziel.
      await expect(zeilen.locator('td:nth-child(2) a')).toHaveCount(0);

      // Rückwärts: die Ausleihen des Zauberbergs über seine Kennung und über
      // seinen Schlüssel-Wert, beide Male Clara und Mia.
      const listen = page.locator(`${SEL.markdownBody0} ul.perspective-query-list`);
      await expect(listen).toHaveCount(2);
      for (const i of [0, 1]) {
        await expect(listen.nth(i).locator('a.perspective-query-item')).toHaveText([
          'Clara',
          'Mia',
        ]);
      }
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-error`)).toHaveCount(0);
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-hint`)).toHaveCount(0);

      // Ungespeicherter Stand (E25): Titel des Buches in der offenen Tabelle
      // ändern, NICHT speichern.
      await oeffneDokument(app, page, library);
      await zumDokument(page, 'Library', 'source');
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
      await page
        .locator(`${SEL.editorContent0} .cm-line`, { hasText: /^\| Anna Karenina$/ })
        .click();
      await page.keyboard.press('End');
      await page.keyboard.insertText(' (Neu)');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      expect(fs.readFileSync(library, 'utf8')).not.toContain('(Neu)');

      // Die Pfad-Spalte folgt sofort dem geschriebenen Stand.
      await zumDokument(page, 'Pfade', 'rendered');
      await expect(zeilen.nth(2).locator('td').nth(1)).toHaveText('Anna Karenina (Neu)');
      await expect(zeilen.nth(0).locator('td').nth(1)).toHaveText('Zauberberg');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

test.describe('DB-ABF-04: Hierarchie über eine Tabelle mit Selbstbezug (4T-002042)', () => {
  test('Nachkommen ohne das Ziel, gefiltert, Vorfahren, Kreis mit Hinweis, ungespeicherter Eltern-Verweis', async () => {
    const { wurzel, staff, hierarchie } = baueBereichHierarchie();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokument(app, page, hierarchie);

      // Vier Listen, nach Anzeige-Form geordnet. Clara, das Ziel, steht nicht in
      // ihren eigenen Nachkommen; die gefilterte Fassung zeigt nur die, die seit
      // 2016 oder später dabei sind.
      const listen = page.locator(`${SEL.markdownBody0} ul.perspective-query-list`);
      await expect(listen).toHaveCount(4);
      const treffer = (i) => listen.nth(i).locator('a.perspective-query-item');
      await expect(treffer(0)).toHaveText(['Jonas', 'Lea', 'Mats']);
      await expect(treffer(1)).toHaveText(['Lea', 'Mats']);
      await expect(treffer(2)).toHaveText(['Clara', 'Jonas']);
      await expect(treffer(3)).toHaveText(['Pia']);
      await expect(treffer(0).nth(0)).toHaveAttribute('data-fm-record-id', 'r-00002');
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-error`)).toHaveCount(0);

      // Der Kreis zwischen Ole und Pia: ein Hinweis, kein Fehler, und nur an
      // diesem Block.
      const hinweise = page.locator(`${SEL.markdownBody0} .perspective-query-hint`);
      await expect(hinweise).toHaveCount(1);
      expect(inAllenSprachen('query.hint.recordHullCycle')).toContain(await hinweise.textContent());

      // Der Klick auf einen Nachkommen öffnet seine Maske wie jeder Treffer.
      await treffer(0).nth(2).click();
      await maskeZeigt(page, 'Staff', 'Mats');
      await page.locator(SEL.activeTab0).locator('.tab-close').click();
      await expect(page.locator(MASKE)).toBeHidden();

      // Ungespeicherter Stand (E25): Noras Verweis ins Leere wird zu Mats,
      // NICHT speichern.
      await oeffneDokument(app, page, staff);
      await zumDokument(page, 'Staff', 'source');
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
      await page.locator(`${SEL.editorContent0} .cm-line`, { hasText: /^\| r-0000$/ }).click();
      await page.keyboard.press('End');
      await page.keyboard.insertText('4');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      expect(fs.readFileSync(staff, 'utf8')).toContain('| r-0000\n');

      // Die Hierarchie folgt sofort: Nora ist jetzt Nachfahrin von Clara, die
      // gefilterte Fassung lässt sie aus (seit 2010).
      await zumDokument(page, 'Hierarchie', 'rendered');
      await expect(treffer(0)).toHaveText(['Jonas', 'Lea', 'Mats', 'Nora']);
      await expect(treffer(1)).toHaveText(['Lea', 'Mats']);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

test.describe('DB-ABF-05: Hierarchie als Baum (4T-002044)', () => {
  test('Baum in Lese-, geteilter und Live-Ansicht, Klick in die Maske, ungespeicherter Eltern-Verweis hängt um', async () => {
    const { wurzel, staff, baum } = baueBereichBaum();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokument(app, page, baum);

      // Lese-Ansicht: zwei Bäume statt Listen. Wurzeln sind, wer keinen Eltern-
      // Datensatz in der Menge hat (Clara, Nora mit dem Verweis ins Leere); Ole
      // und Pia bilden einen Kreis und stehen trotzdem je einmal da. In der
      // Nachkommen-Menge fehlt Clara, Jonas und Lea werden Wurzeln.
      const baeume = page.locator(`${SEL.markdownBody0} ul.perspective-query-tree`);
      await expect(baeume).toHaveCount(2);
      const ganz = ['Clara', '  Jonas', '    Mats', '  Lea', 'Nora', 'Ole', '  Pia'];
      await expect.poll(() => baumGestalt(baeume.nth(0))).toEqual(ganz);
      await expect.poll(() => baumGestalt(baeume.nth(1))).toEqual(['Jonas', '  Mats', 'Lea']);
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-hint`)).toHaveCount(0);
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-error`)).toHaveCount(0);

      // Ein Knoten trägt die Angaben eines Datensatz-Treffers; der Klick öffnet
      // seine Maske und kein Dokument.
      const knoten = (i, name) =>
        baeume.nth(i).locator('a.perspective-query-item', { hasText: name });
      await expect(knoten(0, 'Mats')).toHaveAttribute('data-fm-record-id', 'r-00004');
      await knoten(0, 'Mats').click();
      await maskeZeigt(page, 'Staff', 'Mats');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await page.locator(SEL.activeTab0).locator('.tab-close').click();
      await expect(page.locator(MASKE)).toBeHidden();

      // Geteilte Ansicht: dieselben Bäume in der Anzeige-Fläche.
      await zumDokument(page, 'Baum', 'split');
      await expect(baeume).toHaveCount(2);
      await expect.poll(() => baumGestalt(baeume.nth(0))).toEqual(ganz);

      // Live-Ansicht: dieselben Bäume, derselbe Klick.
      await zumDokument(page, 'Baum', 'live');
      const live = page.locator(`${SEL.editorContent0} ul.perspective-query-tree`);
      await expect(live).toHaveCount(2);
      await expect.poll(() => baumGestalt(live.nth(0))).toEqual(ganz);
      await live.nth(0).locator('a.perspective-query-item', { hasText: 'Pia' }).click();
      await maskeZeigt(page, 'Staff', 'Pia');
      await page.locator(SEL.activeTab0).locator('.tab-close').click();
      await expect(page.locator(MASKE)).toBeHidden();

      // Ungespeicherter Stand (E25): Noras Verweis ins Leere wird zu Mats,
      // NICHT speichern.
      await oeffneDokument(app, page, staff);
      await zumDokument(page, 'Staff', 'source');
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
      await page.locator(`${SEL.editorContent0} .cm-line`, { hasText: /^\| r-0000$/ }).click();
      await page.keyboard.press('End');
      await page.keyboard.insertText('4');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      expect(fs.readFileSync(staff, 'utf8')).toContain('| r-0000\n');

      // Beide Bäume hängen Nora sofort unter Mats.
      await zumDokument(page, 'Baum', 'rendered');
      await expect
        .poll(() => baumGestalt(baeume.nth(0)))
        .toEqual(['Clara', '  Jonas', '    Mats', '      Nora', '  Lea', 'Ole', '  Pia']);
      await expect
        .poll(() => baumGestalt(baeume.nth(1)))
        .toEqual(['Jonas', '  Mats', '    Nora', 'Lea']);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

test.describe('DB-ABF-06: Gruppierte Tabelle mit Aggregaten, Buch als Gruppen-Wert (4T-002078)', () => {
  test('Bücher je Autor mit Anzahl und Seiten-Summe in drei Ansichten, Klick auf das Buch öffnet die Maske', async () => {
    const { wurzel, auswertung } = baueBereichGruppen();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokument(app, page, auswertung);
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();

      // Lese-Ansicht: je Autor eine Zeile, der Klick auf das Buch öffnet die
      // Maske des Buches und kein Dokument.
      await (await gruppenTabellen(page, SEL.markdownBody0)).click();
      await maskeZeigt(page, 'Library', 'Zauberberg');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await page.locator(SEL.activeTab0).locator('.tab-close').click();
      await expect(page.locator(MASKE)).toBeHidden();

      // Geteilte Ansicht: dieselben Tabellen in der Anzeige-Fläche.
      await zumDokument(page, 'Auswertung', 'split');
      await (await gruppenTabellen(page, SEL.markdownBody0)).click();
      await maskeZeigt(page, 'Library', 'Zauberberg');
      await page.locator(SEL.activeTab0).locator('.tab-close').click();
      await expect(page.locator(MASKE)).toBeHidden();

      // Live-Ansicht: dieselben Tabellen in den Blöcken, derselbe Klick.
      await zumDokument(page, 'Auswertung', 'live');
      await (await gruppenTabellen(page, SEL.editorContent0)).click();
      await maskeZeigt(page, 'Library', 'Zauberberg');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });

  // 4T-002079: HAVING behält nur die Gruppen, für die die Bedingung gilt, in der
  // Tabelle und in der Liste; die Ausgabe folgt einer ungespeicherten Änderung
  // der Bedingung.
  test('nur Autoren mit mehr als einem Buch: HAVING in Tabelle und Liste, ungespeicherte Bedingung (4T-002079)', async () => {
    const { wurzel, mehrfach } = baueBereichGruppen();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokument(app, page, mehrfach);
      const body = page.locator(SEL.markdownBody0);
      await expect(body).toBeVisible();

      // Tabelle: allein Mann mit zwei Büchern; Kafka und Tolstoi fallen weg.
      const tabelle = body.locator('table.perspective-query-table');
      await expect(tabelle.locator('thead th')).toHaveText(['author', 'Anzahl', 'Seiten']);
      await expect(tabelle.locator('tbody tr')).toHaveCount(1);
      await expect(tabelle.locator('tbody tr td')).toHaveText(['Mann', '2', '1750']);
      // Liste: eine Gruppe «Mann» mit seinen beiden Büchern.
      const gruppen = body.locator('.perspective-query-group');
      await expect(gruppen).toHaveCount(1);
      await expect(gruppen.locator('.perspective-query-item')).toHaveText([
        'Buddenbrooks',
        'Zauberberg',
      ]);
      await expect(body.locator('.perspective-query-error')).toHaveCount(0);

      // Die Bedingung der Tabelle ungespeichert auf «> 0» setzen: alle drei Autoren.
      await zumDokument(page, 'Mehrfach', 'source');
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
      await page.locator(`${SEL.editorContent0} .cm-line`, { hasText: /^TABLE RECORDS/ }).click();
      await page.keyboard.press('End');
      await page.keyboard.press('Backspace');
      await page.keyboard.insertText('0');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      expect(fs.readFileSync(mehrfach, 'utf8')).toContain('HAVING count() > 1');
      await zumDokument(page, 'Mehrfach', 'rendered');
      await expect(tabelle.locator('tbody tr td:first-child')).toHaveText([
        'Kafka',
        'Mann',
        'Tolstoi',
      ]);
      await expect(gruppen).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
