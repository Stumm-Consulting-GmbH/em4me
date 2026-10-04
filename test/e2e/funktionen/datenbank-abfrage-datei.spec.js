// 4T-002081 (Epic 3E-000259): Ablauf-Prüffall der Abfrage-Datei, Familie DB-ABF
// nach dem Muster von `datenbank-abfrage.spec.js`.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Abfrage-Datei verbindet vier Wege, die erst in der laufenden Anwendung
// zusammenstehen: die Marke `db-query` im Frontmatter über den Index des
// Bereichs, den Katalog des Haupt-Prozesses und die Übersicht der Datenbank im
// Anzeige-Prozess; das Öffnen aus der Übersicht über das Reiter-System; die
// Auswertung des Abfrage-Blocks in der geöffneten Datei; und die Einbettung
// `![[…]]` in ein anderes Dokument, deren Abfrage-Blöcke mit dem eingebetteten
// Dokument als Bezug laufen.
//
// **DB-ABF-07** zeigt die Abfrage-Datei in allen vier Rollen (Story 4S-001040,
// AK1 bis AK4): Die Übersicht nennt sie im Abschnitt «Abfragen» mit Name und
// Ort, nicht aber ein Dokument mit Abfrage-Block ohne Marke; eine
// Abfrage-Datei ohne Block steht mit ihrem Befund unter den Fehlerlagen,
// benannt nach der Datei. «Öffnen» öffnet die Datei, und sie zeigt ihr
// Ergebnis samt ihrer Beschreibung. Eingebettet zeigt sie dasselbe Ergebnis,
// und `this.` meint dabei die Abfrage-Datei: Das einbettende Dokument trägt
// dieselbe Angabe mit einem Wert, unter dem kein Buch bliebe.
//
// **Sprache**: Das Profil der Ablauf-Prüffälle steht auf Deutsch (Vorbelegung
// in helpers/app.js). Übersetzte Texte der Oberfläche werden gegen die Menge
// der fünf Sprachfassungen geprüft, Inhalte über die Daten des Bestands.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { hauptSenden } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');
const { LOCALE_CODES } = require('../../../src/shared/locales.js');

// Wartezeiten als benannte Werte: Die Übersicht erscheint erst, wenn die
// System-Seite gebaut ist; ihr Abschnitt «Abfragen» steht erst, wenn der Index
// des frisch gebundenen Bereichs bereit ist, und bis dahin wird über
// «Aktualisieren» neu geholt.
const WARTE_UEBERSICHT_MS = 20000;
const WARTE_BESTAND_MS = 30000;
const POLL_TAKT_MS = 500;

const PANE = '.pane-group[data-pane="0"]';
const UEBERSICHT = `${PANE} .pane-system .db-overview-page`;

function inAllenSprachen(key) {
  return LOCALE_CODES.map((code) => require(`../../../src/i18n/${code}.json`)[key]);
}

// Der Steckbrief macht den Bereich zur Datenbank; erst dann zeigt die
// Übersicht ihre Abschnitte.
const STECKBRIEF = ['---', 'db-database:', '  name: Bibliothek', '---', '', 'Die Bibliothek.', ''];

// Die Tabelle «Library» wie in `datenbank-abfrage.spec.js`: Titel und
// Seitenzahl als Zahl.
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
  '|- id="r-00003"',
  '| Kurz',
  '| 120',
  '```',
  '',
];

// Die Abfrage-Datei: Marke, die Angabe `minpages` für den Selbstbezug, eine
// Beschreibung und genau ein Abfrage-Block.
const ABFRAGE_DATEI = [
  '---',
  'db-query:',
  'minpages: 500',
  '---',
  '',
  '# Dicke Bücher',
  '',
  'Bücher mit mehr Seiten als minpages, die dicksten zuerst.',
  '',
  '```perspective-query',
  'TABLE RECORDS title, pages FROM "Library" WHERE pages > this.minpages SORT pages DESC',
  '```',
  '',
];

// Das einbettende Dokument trägt `minpages` mit einem Wert, unter dem kein Buch
// bliebe. Meinte `this.` hier das einbettende Dokument, wäre die Tabelle leer.
const SAMMLUNG = ['---', 'minpages: 5000', '---', '', '# Sammlung', '', '![[Dicke Bücher]]', ''];

// Eine Abfrage-Datei ohne Block (Fehlerlage) und ein Dokument mit Block ohne
// Marke (kein Eintrag in der Übersicht).
const LEER = ['---', 'db-query:', '---', '', '# Noch leer', '', 'Hier fehlt der Block.', ''];
const NOTIZ = ['# Notiz', '', '```perspective-query', 'LIST RECORDS FROM "Library"', '```', ''];

function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dbabfdatei-'));
  const datei = (name, zeilen) => {
    const pfad = path.join(wurzel, name);
    fs.mkdirSync(path.dirname(pfad), { recursive: true });
    fs.writeFileSync(pfad, zeilen.join('\n'), 'utf8');
    return pfad;
  };
  return {
    wurzel,
    steckbrief: datei('Datenbank.md', STECKBRIEF),
    library: datei('Library.md', LIBRARY),
    abfrage: datei(path.join('Abfragen', 'Dicke Bücher.md'), ABFRAGE_DATEI),
    sammlung: datei('Sammlung.md', SAMMLUNG),
    leer: datei('Leer.md', LEER),
    notiz: datei('Notiz.md', NOTIZ),
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

// Die Übersicht über das Ereignis der System-Seiten öffnen (Muster
// datenbank-konsistenz.spec.js) und warten, bis ihr Abschnitt «Abfragen» die
// beiden Abfrage-Dateien führt.
async function oeffneUebersicht(page) {
  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent('scg:open-system-page', { detail: { pageId: 'database-overview' } }),
    );
  });
  const uebersicht = page.locator(UEBERSICHT);
  await expect(uebersicht).toBeVisible({ timeout: WARTE_UEBERSICHT_MS });
  const namen = uebersicht.locator('.db-overview-query-name');
  await expect
    .poll(
      async () => {
        if ((await namen.count()) === 2) return true;
        const neu = uebersicht.locator('.db-overview-refresh');
        if (await neu.isEnabled()) await neu.click();
        return false;
      },
      { timeout: WARTE_BESTAND_MS, intervals: [POLL_TAKT_MS] },
    )
    .toBe(true);
  return uebersicht;
}

// Die Zeilen einer Ergebnis-Tabelle als Paare aus Titel und Seitenzahl.
async function tabellenZeilen(tabelle) {
  const zeilen = tabelle.locator('tbody tr');
  await expect(zeilen).toHaveCount(2);
  return [
    [
      await zeilen.nth(0).locator('td').nth(1).textContent(),
      await zeilen.nth(0).locator('td').nth(2).textContent(),
    ],
    [
      await zeilen.nth(1).locator('td').nth(1).textContent(),
      await zeilen.nth(1).locator('td').nth(2).textContent(),
    ],
  ];
}

test.describe('DB-ABF-07: Abfrage-Datei in Übersicht, geöffnet und eingebettet (4T-002081)', () => {
  test('Abschnitt «Abfragen» mit Ort und Fehlerlage, «Öffnen» zeigt das Ergebnis, eingebettet mit der Abfrage-Datei als Bezug', async () => {
    const { wurzel, sammlung } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);

      // Übersicht: zwei Abfrage-Dateien nach Pfad, die Notiz ohne Marke fehlt.
      const uebersicht = await oeffneUebersicht(page);
      const titel = await uebersicht.locator('.db-overview-section-title').allTextContents();
      const abschnittsNamen = inAllenSprachen('database.overview.section.queries');
      expect(titel.some((t) => abschnittsNamen.includes(t))).toBe(true);
      await expect(uebersicht.locator('.db-overview-query-name')).toHaveText([
        'Dicke Bücher',
        'Leer',
      ]);
      const orte = uebersicht.locator('.db-overview-query-location');
      await expect(orte.nth(0)).toHaveText('Abfragen');
      expect(inAllenSprachen('database.overview.queryRoot')).toContain(
        await orte.nth(1).textContent(),
      );
      await expect(uebersicht).not.toContainText('Notiz');

      // Fehlerlage: die Datei ohne Block, benannt nach der Datei, im Klartext.
      const fehler = uebersicht.locator('.db-overview-issue');
      await expect(fehler).toHaveCount(1);
      await expect(fehler.locator('.db-overview-issue-source')).toHaveText('Leer.md');
      expect(inAllenSprachen('database.hint.queryOhneFence')).toContain(
        await fehler.locator('.db-overview-issue-text').textContent(),
      );

      // «Öffnen» öffnet die Abfrage-Datei in einem eigenen Reiter; sie zeigt
      // ihre Beschreibung und ihr Ergebnis.
      const offen = uebersicht.locator('tr', {
        has: page.locator('.db-overview-query-name', { hasText: 'Dicke Bücher' }),
      });
      expect(inAllenSprachen('database.overview.queryOpen')).toContain(
        await offen.locator('.db-overview-query-open').textContent(),
      );
      await offen.locator('.db-overview-query-open').click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Dicke Bücher');
      const koerper = page.locator(SEL.markdownBody0);
      await expect(koerper).toContainText('Bücher mit mehr Seiten als minpages');
      const geoeffnet = koerper.locator('table.perspective-query-table');
      await expect(geoeffnet).toBeVisible();
      expect(await tabellenZeilen(geoeffnet)).toEqual([
        ['Zauberberg', '1000'],
        ['Anna Karenina', '864'],
      ]);
      await expect(koerper.locator('.perspective-query-error')).toHaveCount(0);

      // Eingebettet: dasselbe Ergebnis. Das einbettende Dokument trägt
      // minpages 5000; das Ergebnis zeigt, dass `this.` die Abfrage-Datei meint.
      await oeffneDokument(app, page, sammlung);
      await expect(page.locator(SEL.activeTab0)).toContainText('Sammlung');
      const einbettung = page.locator(`${SEL.markdownBody0} .wiki-embed-md-body`);
      await expect(einbettung).toContainText('Bücher mit mehr Seiten als minpages');
      const eingebettet = einbettung.locator('table.perspective-query-table');
      await expect(eingebettet).toBeVisible();
      expect(await tabellenZeilen(eingebettet)).toEqual([
        ['Zauberberg', '1000'],
        ['Anna Karenina', '864'],
      ]);
      await expect(einbettung.locator('.perspective-query-error')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
