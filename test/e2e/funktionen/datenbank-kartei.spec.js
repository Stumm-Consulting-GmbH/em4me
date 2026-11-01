// 4T-002386 (Epic 3E-000265, Schritt 4; AK2, AK3, AK5): Tabellen in Kartei-Form
// in der realen Anordnung — die Übersicht der Datenbank nennt ihre Form, und die
// Konsistenz-Prüfung meldet einen Datensatz-Block in einer Kartei-Tabelle.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die Form
// reist vom Katalog über den Kanal der Übersicht bis in die Spalte «Form», der
// Befund von der Prüfung über den Kanal `database:konsistenz` bis in die
// Befund-Liste. Beide Kanäle brauchen den gebundenen Bereich des Fensters und
// die Sicht des Index, und die gibt es erst in der laufenden Anwendung.
//
// **Der Aufbau ist nicht der Gegenstand** (test/README.md): Der Bereich wird über
// den Weg gebunden, den die Anwendung von außen anbietet, und die Übersicht über
// das allgemeine Seiten-Ereignis geöffnet (Muster `datenbank-konsistenz.spec.js`).
//
// **Sprachfrei geprüft**: Ein frisches Profil steht auf Englisch. Geprüft wird an
// Klassen, Daten-Attributen und den Namen des angelegten Bestands; die Form an
// der Zahl der Karteikarten, die allein eine Kartei-Tabelle trägt.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { hauptSenden } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');

const PANE = '.pane-group[data-pane="0"]';
const UEBERSICHT = `${PANE} .pane-system .db-overview-page`;

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufräumen darf den Lauf nicht kippen */
  }
}

// Eine Kartei-Tabelle mit einem Feld und dem übergebenen Körper.
function karteiTabelle(koerper) {
  return [
    '---',
    'db-table:',
    '  storage: cards',
    '  fields:',
    '    - name: Name',
    '      type: string',
    '---',
    '',
    ...koerper,
    '',
  ].join('\n');
}

// Ein Datenbank-Bereich mit zwei Kartei-Tabellen in eigenen Ordnern: «Autoren»
// trägt freien Text, «Verlage» einen Datensatz-Block mit einer Zeile.
function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-kartei-'));
  fs.writeFileSync(
    path.join(wurzel, 'Datenbank.md'),
    ['---', 'db-database:', '  name: Verlag', '---', '', 'Beschreibung.', ''].join('\n'),
    'utf8',
  );
  for (const ordner of ['Autoren', 'Verlage']) fs.mkdirSync(path.join(wurzel, ordner));
  fs.writeFileSync(
    path.join(wurzel, 'Autoren', 'Autoren.md'),
    karteiTabelle(['Je Autor eine Karteikarte in diesem Ordner.']),
    'utf8',
  );
  const verlage = path.join(wurzel, 'Verlage', 'Verlage.md');
  const mitBlock = karteiTabelle(['```perspective-records', '|- id="r-00001"', '| Aufbau', '```']);
  fs.writeFileSync(verlage, mitBlock, 'utf8');
  return { wurzel, verlage, mitBlock };
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

async function oeffneUebersicht(page) {
  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent('scg:open-system-page', { detail: { pageId: 'database-overview' } }),
    );
  });
  const uebersicht = page.locator(UEBERSICHT);
  await expect(uebersicht).toBeVisible({ timeout: 20000 });
  return uebersicht;
}

// Die Übersicht holt ihre Auskunft beim Öffnen einmal; läuft der Bereichs-Index
// dann noch an, zeigt sie den Wartezustand und keine Tabellen. Bis beide
// Tabellen dastehen, wird deshalb über den Knopf «Aktualisieren» neu geholt.
async function warteAufTabellen(uebersicht) {
  const namen = uebersicht.locator('.db-overview-table-name');
  await expect
    .poll(
      async () => {
        if ((await namen.count()) === 2) return true;
        const neu = uebersicht.locator('.db-overview-refresh');
        if (await neu.isEnabled()) await neu.click();
        return false;
      },
      { timeout: 30000, intervals: [500] },
    )
    .toBe(true);
}

// Die Zeile einer Tabelle der Übersicht, gefunden an ihrem Namen.
function zeileVon(uebersicht, page, name) {
  return uebersicht.locator('tr').filter({
    has: page.locator('.db-overview-table-name', { hasText: name }),
  });
}

test.describe('DB-KAR-01: Kartei-Tabellen in Übersicht und Konsistenz-Prüfung (4T-002386)', () => {
  test('Form «Kartei» für beide, Befund allein für die Tabelle mit Datensatz-Block', async () => {
    const { wurzel, verlage, mitBlock } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      const uebersicht = await oeffneUebersicht(page);
      await warteAufTabellen(uebersicht);

      // AK3: Beide Tabellen stehen in der Kartei-Form mit 0 Karteikarten; der
      // Datensatz-Block der zweiten zählt nicht als Karteikarte.
      for (const name of ['Autoren', 'Verlage']) {
        const zeile = zeileVon(uebersicht, page, name);
        await expect(zeile).toHaveCount(1);
        const form = zeile.locator('.db-overview-table-storage');
        await expect(form.locator('.db-overview-card-count')).toHaveCount(1);
        await expect(form.locator('.db-overview-card-count')).toContainText('0');
      }

      // AK5: Die Prüfung aller Tabellen meldet genau einen Befund, den Block der
      // Tabelle «Verlage»; die Tabelle mit freiem Text bleibt ohne Befund.
      await uebersicht.locator('.db-overview-check').click();
      const abschnitt = uebersicht.locator('.db-consistency');
      await expect(abschnitt.locator('.db-consistency-summary')).toHaveCount(1, {
        timeout: 20000,
      });
      const befunde = abschnitt.locator('.db-consistency-finding');
      await expect(befunde).toHaveCount(1);
      await expect(befunde.first()).toHaveAttribute('data-code', 'konsistenzKarteiMitDatensaetzen');
      await expect(befunde.first().locator('.db-consistency-source')).toHaveText('Verlage');
      await expect(befunde.filter({ hasText: 'Autoren' })).toHaveCount(0);
      // Die Prüfung hat nichts geschrieben.
      expect(fs.readFileSync(verlage, 'utf8')).toBe(mitBlock);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

// 4T-002387 (Epic 3E-000265, Schritt 2; AK1, AK3, AK4): Ein Datenbank-Bereich
// mit der Kartei-Tabelle «Autoren», zwei Karteikarten und einem Dokument ohne
// Kennung im selben Ordner.
function baueBereichMitKarteikarten() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-kartei2-'));
  const lege = (rel, zeilen) => fs.writeFileSync(path.join(wurzel, rel), zeilen.join('\n'), 'utf8');
  lege('Datenbank.md', ['---', 'db-database:', '  name: Verlag', '---', '', 'Beschreibung.', '']);
  fs.mkdirSync(path.join(wurzel, 'Autoren'));
  // 4T-002389: Mit dem Hochwasserstand 2, weil die Konsistenz-Prüfung die
  // Karteikarten seit dem Schreibweg wie Datensätze prüft; ohne ihn käme der
  // Hinweis auf einen zu niedrigen Hochwasserstand als zweiter Befund hinzu.
  fs.writeFileSync(
    path.join(wurzel, 'Autoren', 'Autoren.md'),
    karteiTabelle(['Je Autor eine Karteikarte in diesem Ordner.']).replace(
      '  storage: cards',
      '  storage: cards\n  lastId: 2',
    ),
    'utf8',
  );
  for (const [datei, kennung, name] of [
    ['Ada Lovelace.md', 'r-00001', 'Ada Lovelace'],
    ['Alan Turing.md', 'r-00002', 'Alan Turing'],
  ]) {
    lege(path.join('Autoren', datei), ['---', `db-record: ${kennung}`, `Name: ${name}`, '---', '']);
  }
  lege(path.join('Autoren', 'Notiz.md'), ['---', 'Name: Notiz', '---', '', 'Ohne Kennung.', '']);
  return { wurzel };
}

test.describe('DB-KAR-02: Karteikarten in Übersicht und Konsistenz-Prüfung (4T-002387)', () => {
  test('die Übersicht zählt zwei Karteikarten, die Prüfung meldet das Dokument ohne Kennung', async () => {
    const { wurzel } = baueBereichMitKarteikarten();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      const uebersicht = await oeffneUebersicht(page);
      // Bis die eine Tabelle dasteht, wird wie in DB-KAR-01 neu geholt.
      const namen = uebersicht.locator('.db-overview-table-name');
      await expect
        .poll(
          async () => {
            if ((await namen.count()) === 1) return true;
            const neu = uebersicht.locator('.db-overview-refresh');
            if (await neu.isEnabled()) await neu.click();
            return false;
          },
          { timeout: 30000, intervals: [500] },
        )
        .toBe(true);

      // AK1, AK4: Die beiden Karteikarten zählen, das Dokument ohne Kennung nicht.
      const zahl = zeileVon(uebersicht, page, 'Autoren').locator('.db-overview-card-count');
      await expect(zahl).toHaveCount(1);
      await expect(zahl).toContainText('2');

      // AK3: Die Prüfung meldet genau einen Befund, das Dokument ohne Kennung.
      await uebersicht.locator('.db-overview-check').click();
      const abschnitt = uebersicht.locator('.db-consistency');
      await expect(abschnitt.locator('.db-consistency-summary')).toHaveCount(1, {
        timeout: 20000,
      });
      const befunde = abschnitt.locator('.db-consistency-finding');
      await expect(befunde).toHaveCount(1);
      await expect(befunde.first()).toHaveAttribute('data-code', 'konsistenzKarteiOhneKennung');
      await expect(befunde.first()).toContainText('Notiz');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

// 4T-002388 (Epic 3E-000265; AK1, AK2): Abfrage und Verweis über Karteikarten.
// Die Kartei-Tabelle «Autoren» mit Name und Zahl der Werke, zwei Karteikarten,
// eine Tabelle der Tabellen-Form «Ausleihe» mit einer Verweis-Spalte auf
// «Autoren» (Kennung, Kurzform und ein Ziel ins Leere) und ein Dokument mit
// zwei Abfrage-Blöcken.
function baueBereichMitAbfrage() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-kartei3-'));
  const lege = (rel, zeilen) => {
    const pfad = path.join(wurzel, rel);
    fs.writeFileSync(pfad, zeilen.join('\n'), 'utf8');
    return pfad;
  };
  lege('Datenbank.md', ['---', 'db-database:', '  name: Verlag', '---', '', 'Beschreibung.', '']);
  fs.mkdirSync(path.join(wurzel, 'Autoren'));
  lege(path.join('Autoren', 'Autoren.md'), [
    '---',
    'db-table:',
    '  storage: cards',
    '  fields:',
    '    - name: Name',
    '    - name: Werke',
    '      type: number',
    '  display: Name',
    '---',
    '',
    'Je Autor eine Karteikarte in diesem Ordner.',
    '',
  ]);
  for (const [datei, kennung, name, werke] of [
    ['Ada Lovelace.md', 'r-00001', 'Ada Lovelace', 3],
    ['Alan Turing.md', 'r-2', 'Alan Turing', 12],
  ]) {
    lege(path.join('Autoren', datei), [
      '---',
      `db-record: ${kennung}`,
      `Name: ${name}`,
      `Werke: ${werke}`,
      '---',
      '',
    ]);
  }
  lege('Ausleihe.md', [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Leser',
    '    - name: Autor',
    '      type: record',
    '      options:',
    '        table: Autoren',
    '  display: Leser',
    '---',
    '',
    '```perspective-records',
    '|- id="r-00001"',
    '| Eva',
    '| r-00001',
    '|- id="r-00002"',
    '| Max',
    '| r-2',
    '|- id="r-00003"',
    '| Zoe',
    '| r-00099',
    '```',
    '',
  ]);
  const abfragen = lege('Abfragen.md', [
    '# Abfragen',
    '',
    '```perspective-query',
    'TABLE RECORDS Name, Werke FROM "Autoren" SORT Werke DESC',
    '```',
    '',
    '```perspective-query',
    'TABLE RECORDS Autor FROM "Ausleihe"',
    '```',
    '',
  ]);
  return { wurzel, abfragen };
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

test.describe('DB-KAR-03: Abfrage und Verweis über Karteikarten (4T-002388)', () => {
  test('die Abfrage zeigt die Karteikarten als Zeilen, die Verweis-Spalte löst auf', async () => {
    const { wurzel, abfragen } = baueBereichMitAbfrage();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokument(app, page, abfragen);
      const tabellen = page.locator(`${SEL.markdownBody0} table.perspective-query-table`);
      await expect(tabellen).toHaveCount(2, { timeout: 20000 });

      // AK1: je Karteikarte eine Zeile, nach der Zahl der Werke absteigend.
      const autoren = tabellen.nth(0).locator('tbody tr');
      await expect(autoren).toHaveCount(2, { timeout: 20000 });
      await expect(autoren.locator('td:nth-child(2)')).toHaveText(['Alan Turing', 'Ada Lovelace']);
      await expect(autoren.locator('td:nth-child(3)')).toHaveText(['12', '3']);
      await expect(autoren.nth(0).locator('[data-fm-record-id]').first()).toHaveAttribute(
        'data-fm-record-id',
        'r-00002',
      );

      // AK2: Kennung und Kurzform treffen die Karteikarte, ein Ziel ins Leere
      // bleibt leer wie in der Tabellen-Form.
      const ausleihe = tabellen.nth(1).locator('tbody tr');
      await expect(ausleihe).toHaveCount(3);
      const autor = ausleihe.locator('td:nth-child(2)');
      await expect(autor).toHaveText(['Ada Lovelace', 'Alan Turing', '']);
      await expect(autor.nth(0).locator('a')).toHaveAttribute('data-fm-record-id', 'r-00001');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

// 4T-002389 (Epic 3E-000265, Schnitt 1; AK1, AK3, AK4): Anlegen und Ändern von
// Karteikarten über die Datenbank. Die Kartei-Tabelle «Autoren» mit dem
// Schlüssel-Feld «Name» und dem Feld «Ort», dazu die Karteikarte «Ada.md» mit
// einer Fluss-Liste unter den fremden Angaben und freiem Text.
const ADA = [
  '---',
  'db-record: r-00001',
  'tags: [a, b]',
  'Name: Ada Lovelace',
  'Ort: London',
  '---',
  '',
  'Freier Text über Ada.',
  '',
].join('\n');

function baueBereichZumAnlegen() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-kartei4-'));
  const lege = (rel, text) => {
    const pfad = path.join(wurzel, rel);
    fs.writeFileSync(pfad, text, 'utf8');
    return pfad;
  };
  lege(
    'Datenbank.md',
    ['---', 'db-database:', '  name: Verlag', '---', '', 'Beschreibung.', ''].join('\n'),
  );
  fs.mkdirSync(path.join(wurzel, 'Autoren'));
  const autoren = lege(
    path.join('Autoren', 'Autoren.md'),
    [
      '---',
      'db-table:',
      '  storage: cards',
      '  fields:',
      '    - name: Name',
      '    - name: Ort',
      '  key: Name',
      '  lastId: 1',
      '---',
      '',
      'Je Autor eine Karteikarte in diesem Ordner.',
      '',
    ].join('\n'),
  );
  const ada = lege(path.join('Autoren', 'Ada.md'), ADA);
  return { wurzel, autoren, ada };
}

// Wählt «Neue Karteikarte» in der Zeile der Tabelle und gibt den Schlüssel ein.
async function neueKarteikarte(uebersicht, page, schluessel) {
  await zeileVon(uebersicht, page, 'Autoren').locator('.db-overview-new-card').click();
  await expect(page.locator('#name-input-modal')).toBeVisible();
  await page.locator('#name-input-field').fill(schluessel);
  await page.locator('#btn-name-input-ok').click();
  await expect(page.locator('#name-input-modal')).toBeHidden();
}

// Die Zahl der Karteikarten in der Übersicht, neu geholt über «Aktualisieren».
async function warteAufZahl(uebersicht, page, erwartet) {
  const zahl = zeileVon(uebersicht, page, 'Autoren').locator('.db-overview-card-count');
  await expect
    .poll(
      async () => {
        const text = (await zahl.count()) === 1 ? await zahl.textContent() : '';
        if (text.includes(String(erwartet))) return true;
        const neu = uebersicht.locator('.db-overview-refresh');
        if (await neu.isEnabled()) await neu.click();
        return false;
      },
      { timeout: 30000, intervals: [500] },
    )
    .toBe(true);
}

test.describe('DB-KAR-04: Karteikarten anlegen und ändern (4T-002389)', () => {
  test('«Neue Karteikarte» legt die Datei an, eine Änderung schreibt allein ihr Feld, eine Dublette wird abgewiesen', async () => {
    const { wurzel, autoren, ada } = baueBereichZumAnlegen();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      const uebersicht = await oeffneUebersicht(page);
      await warteAufZahl(uebersicht, page, 1);

      // AK1: «Neue Karteikarte» legt «Grace Hopper.md» mit der nächsten Kennung
      // und leerem Feld-Gerüst an; die Übersicht zählt eine Karteikarte mehr.
      await neueKarteikarte(uebersicht, page, 'Grace Hopper');
      const grace = path.join(wurzel, 'Autoren', 'Grace Hopper.md');
      await expect.poll(() => fs.existsSync(grace), { timeout: 10000 }).toBe(true);
      expect(fs.readFileSync(grace, 'utf8')).toBe(
        ['---', 'db-record: r-00002', 'Name: Grace Hopper', 'Ort:', '---', ''].join('\n'),
      );
      // Die Tabellen-Datei folgt der Karteikarte in derselben Transaktion; gewartet
      // wird auf den Hochwasserstand selbst, nicht auf eine feste Pause.
      await expect
        .poll(() => fs.readFileSync(autoren, 'utf8').includes('lastId: 2'), { timeout: 10000 })
        .toBe(true);
      await warteAufZahl(uebersicht, page, 2);

      // AK3: Die Einzel-Maske liest die Karteikarte über ihren Kanal; geändert
      // wird über den Auftrags-Kanal, den die Maske beim Speichern benutzt.
      // Allein die Zeile des geänderten Feldes ändert sich.
      const gelesen = await page.evaluate(
        (t) => window.api.databaseDatensatz({ tabelle: t, kennung: 'r-00001', sprache: 'en' }),
        autoren,
      );
      expect(gelesen.status).toBe('ready');
      expect(gelesen.erwartet).toEqual({ Name: 'Ada Lovelace', Ort: 'London' });
      const geaendert = await page.evaluate(
        ({ t, erwartet }) =>
          window.api.databaseAuftrag({
            auftrag: {
              anweisungen: [
                { tabelle: t, art: 'update', id: 'r-00001', werte: { Ort: 'Ockham' }, erwartet },
              ],
            },
          }),
        { t: autoren, erwartet: gelesen.erwartet },
      );
      expect(geaendert.ok).toBe(true);
      expect(fs.readFileSync(ada, 'utf8')).toBe(ADA.replace('Ort: London', 'Ort: Ockham'));

      // AK4: Der Schlüssel «Ada Lovelace» ist an «Ada.md» vergeben; die neue
      // Karteikarte wird mit Grund abgewiesen, keine Datei entsteht.
      await neueKarteikarte(uebersicht, page, 'Ada Lovelace');
      const hinweis = page.locator('#statusbar-hint');
      await expect(hinweis).toHaveClass(/error/);
      await expect(hinweis).toContainText('Ada Lovelace');
      expect(fs.existsSync(path.join(wurzel, 'Autoren', 'Ada Lovelace.md'))).toBe(false);
      // Die Tabellen-Datei folgt der Karteikarte in derselben Transaktion; gewartet
      // wird auf den Hochwasserstand selbst, nicht auf eine feste Pause.
      await expect
        .poll(() => fs.readFileSync(autoren, 'utf8').includes('lastId: 2'), { timeout: 10000 })
        .toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

// 4T-002389 (Epic 3E-000265, Schnitt 2; AK2, AK4, AK5): Aufnehmen und Löschen.
// Der Bereich aus DB-KAR-02 (zwei Karteikarten, «Notiz.md» ohne Kennung), dazu
// die Tabelle «Ausleihe» der Tabellen-Form mit einem Verweis auf «Ada Lovelace».
//
// **Der Papierkorb im Prüfstand:** `shell.trashItem` wird im Haupt-Prozess durch
// ein Verschieben in einen Ordner neben dem Bereich ersetzt. Gerufen wird es
// über denselben Weg wie im Betrieb; ein Ablauf-Lauf legte sonst bei jedem Lauf
// Dateien in den Papierkorb des Rechners.
async function papierkorbNach(app, ordner) {
  fs.mkdirSync(ordner, { recursive: true });
  await hauptSenden(
    app,
    ({ shell }, ziel) => {
      const nfs = process.getBuiltinModule('node:fs');
      const npath = process.getBuiltinModule('node:path');
      shell.trashItem = async (p) => nfs.renameSync(p, npath.join(ziel, npath.basename(p)));
    },
    ordner,
  );
}

function legeAusleihe(wurzel) {
  const pfad = path.join(wurzel, 'Ausleihe.md');
  const zeilen = ['---', 'db-table:', '  fields:', '    - name: Leser', '    - name: Autor'];
  zeilen.push('      type: record', '      options:', '        table: Autoren', '  lastId: 1');
  zeilen.push('---', '', '```perspective-records', '|- id="r-00001"', '| Eva', '| r-00001');
  fs.writeFileSync(pfad, [...zeilen, '```', ''].join('\n'), 'utf8');
}

// Ein Löschen über den Auftrags-Kanal, wie die Einzel-Maske es nach der Rückfrage schickt.
function loesche(page, tabelle, kennung, erwartet) {
  return page.evaluate(
    ({ t, id, e }) =>
      window.api.databaseAuftrag({
        auftrag: { anweisungen: [{ tabelle: t, art: 'delete', id, erwartet: e }] },
      }),
    { t: tabelle, id: kennung, e: erwartet },
  );
}

test.describe('DB-KAR-05: Karteikarten aufnehmen und löschen (4T-002389)', () => {
  test('«Als Karteikarte aufnehmen» trägt die Kennung ein, das Löschen gibt die Karteikarte in den Papierkorb, eine verwiesene bleibt', async () => {
    const { wurzel } = baueBereichMitKarteikarten();
    legeAusleihe(wurzel);
    const korb = `${wurzel}-korb`;
    const autoren = path.join(wurzel, 'Autoren', 'Autoren.md');
    const { app, page, userData } = await launchApp();
    try {
      await papierkorbNach(app, korb);
      await bindeBereich(page, wurzel);
      const uebersicht = await oeffneUebersicht(page);
      await warteAufZahl(uebersicht, page, 2);

      // AK2: «Als Karteikarte aufnehmen» am Befund trägt die Kennung ein; die
      // Prüfung läuft erneut, und der Befund entfällt.
      await uebersicht.locator('.db-overview-check').click();
      const abschnitt = uebersicht.locator('.db-consistency');
      const befund = abschnitt.locator(
        '.db-consistency-finding[data-code="konsistenzKarteiOhneKennung"]',
      );
      await expect(befund).toHaveCount(1, { timeout: 20000 });
      await befund.locator('.db-consistency-adopt').click();
      const notiz = path.join(wurzel, 'Autoren', 'Notiz.md');
      await expect
        .poll(() => fs.readFileSync(notiz, 'utf8'), { timeout: 10000 })
        .toContain('db-record: r-00003');
      await expect(befund).toHaveCount(0, { timeout: 20000 });
      await warteAufZahl(uebersicht, page, 3);

      // AK5: Löschen über den Auftrags-Kanal. Karteikarte und Beleg-Datei sind
      // aus dem Bereichs-Ordner fort, die Belege samt Lösch-Beleg stehen an der Tabelle.
      const geloescht = await loesche(page, autoren, 'r-00003', { Name: 'Notiz' });
      expect(geloescht.ok).toBe(true);
      expect(fs.existsSync(notiz)).toBe(false);
      expect(fs.existsSync(path.join(wurzel, 'Autoren', 'Notiz.mddl'))).toBe(false);
      expect(fs.readdirSync(korb).sort()).toEqual(['Notiz.md', 'Notiz.mddl']);
      const tabellenBelege = fs.readFileSync(path.join(wurzel, 'Autoren', 'Autoren.mddl'), 'utf8');
      expect(tabellenBelege).toContain('kind="create"');
      expect(tabellenBelege).toContain('kind="delete"');
      await warteAufZahl(uebersicht, page, 2);

      // AK4: «Ada Lovelace» ist aus «Ausleihe» verwiesen; das Löschen wird
      // abgewiesen, und nichts verlässt den Ordner.
      const ada = path.join(wurzel, 'Autoren', 'Ada Lovelace.md');
      const abgewiesen = await loesche(page, autoren, 'r-00001', { Name: 'Ada Lovelace' });
      expect(abgewiesen.ok).toBe(false);
      expect(abgewiesen.code).toBe('auftragPruefBefund');
      expect(fs.existsSync(ada)).toBe(true);
      expect(fs.readdirSync(korb).sort()).toEqual(['Notiz.md', 'Notiz.mddl']);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
      removeDir(korb);
    }
  });
});

// 4T-002390 (Epic 3E-000265, Schritte 1, 3 und 4; AK1 bis AK4): Die Beleg-Datei
// neben der Karteikarte in der realen Anordnung. Eine Änderung über den
// Auftrags-Kanal legt «Ada.mddl» neben «Ada.md» an, die Beleg-Ansicht zeigt den
// Beleg, und das Umbenennen über den Weg des Bereichs-Panels (`renameFile`)
// nimmt die Beleg-Datei mit. Geöffnet wird die Ansicht über das
// Verdrahtungs-Ereignis wie in DB-BEL-01. 4T-002389 (Schnitt 2) ergänzt den
// Lösch-Teil: Belege samt Lösch-Beleg an der Tabelle, keine Beleg-Datei am alten
// Ort; der Papierkorb ist der Stummel aus DB-KAR-05.
const BELEG_SEITE = `${PANE} .pane-system .db-changelog-page`;

async function oeffneBelege(page, filePath, recordId) {
  await page.evaluate(
    (detail) => document.dispatchEvent(new CustomEvent('scg:open-change-log', { detail })),
    { filePath, recordId },
  );
  const seite = page.locator(BELEG_SEITE);
  await expect(seite).toBeVisible({ timeout: 20000 });
  return seite;
}

test.describe('DB-KAR-06: Änderungsbelege an der Karteikarte (4T-002390)', () => {
  test('die Änderung legt die Beleg-Datei neben der Karteikarte an, die Ansicht zeigt sie, das Umbenennen nimmt sie mit', async () => {
    const { wurzel, autoren, ada } = baueBereichZumAnlegen();
    const korb = `${wurzel}-korb`;
    const { app, page, userData } = await launchApp();
    try {
      await papierkorbNach(app, korb);
      await bindeBereich(page, wurzel);

      // AK1: Ändern über den Auftrags-Kanal der Maske; der Beleg entsteht neben
      // der Karteikarte, an der Tabelle entsteht keine Beleg-Datei.
      const gelesen = await page.evaluate(
        (t) => window.api.databaseDatensatz({ tabelle: t, kennung: 'r-00001', sprache: 'en' }),
        autoren,
      );
      expect(gelesen.status).toBe('ready');
      const geaendert = await page.evaluate(
        ({ t, erwartet }) =>
          window.api.databaseAuftrag({
            auftrag: {
              anweisungen: [
                { tabelle: t, art: 'update', id: 'r-00001', werte: { Ort: 'Ockham' }, erwartet },
              ],
            },
          }),
        { t: autoren, erwartet: gelesen.erwartet },
      );
      expect(geaendert.ok).toBe(true);
      const adaBelege = path.join(wurzel, 'Autoren', 'Ada.mddl');
      expect(fs.readFileSync(adaBelege, 'utf8')).toContain('kind="update"');
      expect(fs.existsSync(path.join(wurzel, 'Autoren', 'Autoren.mddl'))).toBe(false);

      // AK3: Die Beleg-Ansicht, aufgerufen mit Tabellen-Datei und Kennung wie aus
      // der Maske, zeigt den Beleg der Karteikarte.
      const seite = await oeffneBelege(page, autoren, 'r-00001');
      const eintraege = seite.locator('.db-changelog-entry');
      await expect(eintraege).toHaveCount(1);
      await expect(eintraege.first().locator('.db-changelog-field-name')).toHaveText('Ort');
      await expect(eintraege.first().locator('.db-changelog-value-new')).toContainText('Ockham');

      // AK2: Umbenennen über denselben Kanal wie das Bereichs-Panel; die
      // Beleg-Datei heißt danach wie die Karteikarte, die Kette ist unverändert.
      const kette = fs.readFileSync(adaBelege, 'utf8');
      const umbenannt = await page.evaluate(
        (p) => window.api.renameFile(p, 'Ada King', false),
        ada,
      );
      expect(umbenannt && umbenannt.ok).toBe(true);
      const kingBelege = path.join(wurzel, 'Autoren', 'Ada King.mddl');
      expect(fs.existsSync(adaBelege)).toBe(false);
      expect(fs.readFileSync(kingBelege, 'utf8')).toBe(kette);

      // Die Kennung führt weiter zur umbenannten Karteikarte und ihren Belegen.
      const antwort = await page.evaluate(
        (t) => window.api.databaseChangeLog({ filePath: t, recordId: 'r-00001' }),
        autoren,
      );
      expect(antwort.status).toBe('ready');
      expect(antwort.belege.map((b) => b.art)).toEqual(['update']);

      // AK4 (4T-002390): Löschen über die Datenbank; die Kette samt Lösch-Beleg
      // steht an der Tabelle, neben dem alten Ort liegt keine Beleg-Datei mehr.
      const geloescht = await loesche(page, autoren, 'r-00001', {
        Name: 'Ada Lovelace',
        Ort: 'Ockham',
      });
      expect(geloescht.ok).toBe(true);
      expect(fs.existsSync(kingBelege)).toBe(false);
      expect(fs.existsSync(path.join(wurzel, 'Autoren', 'Ada King.md'))).toBe(false);
      const nachher = await page.evaluate(
        (t) => window.api.databaseChangeLog({ filePath: t, recordId: 'r-00001' }),
        autoren,
      );
      expect(nachher.status).toBe('ready');
      expect(nachher.belege.map((b) => b.art)).toEqual(['update', 'delete']);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
      removeDir(korb);
    }
  });
});
