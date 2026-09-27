// 4T-001939 (Epic 3E-000257, AK1, AK2 und AK5): Die Einzel-Maske eines
// Datensatzes in der realen Anordnung.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Maske ist ein neu eingeführtes, dauerhaft sichtbares Bedien-Element, und
// drei Zusagen lassen sich ausschließlich hier zeigen:
//
//   1. Die Kette reicht von der Tabellen-Datei über den Kanal `database:datensatz`
//      bis in das DOM der System-Seite. Der Kanal prüft den gebundenen Bereich
//      des Fensters, und den gibt es erst in der laufenden Anwendung.
//   2. Der Körper kommt über die Render-Pipeline des Anzeige-Prozesses, die
//      Feld-Elemente stehen an ihrer Stelle im Körper — das Zusammenspiel von
//      Markdown-Segment und Feld-Segment ist nur im echten Renderer zu sehen.
//   3. Die Neuanlage zieht ihre Kennung über die Schreib-Schnittstelle des
//      Haupt-Prozesses und öffnet die Maske leer mit genau dieser Kennung.
//
// **Der Aufbau ist nicht der Gegenstand** (test/README.md): Die Tabellen-Datei
// wird über den Weg geöffnet, den die Anwendung von außen anbietet, und die
// Übersicht über das allgemeine Seiten-Ereignis; geprüft werden die beiden
// Zugänge der Maske selbst.
//
// **Sprachfrei geprüft**: Ein frisches Profil steht auf Englisch. Geprüft wird
// an Klassen, Daten-Attributen und Daten des angelegten Bestands; wo ein
// übersetzter Text trägt, gegen die Menge der fünf Sprachfassungen.
//
// DB-MAS-02 und DB-MAS-03 (4T-001940) schreiben über die Schreib-Schnittstelle:
// Anlegen, Ändern, Abweisung am Feld, Löschen mit Rückfrage und die Wahl bei
// einer Fremd-Änderung. DB-MAS-04 (4T-001941) prüft die Sperre der Bearbeitung
// am echten Sperr-Ordner des Bereichs: Sie entsteht beim Bearbeiten und
// verschwindet beim Verwerfen und beim Schließen des Reiters; eine fremde,
// eine abgelaufene und eine leere Sperr-Datei ergeben den Konflikt-Block.
// DB-MAS-05 (4T-001942) prüft die Wertehilfe eines Verweis-Feldes an einer
// zweiten Tabelle, die auf «Kunden» verweist. DB-MAS-06 (4T-001943) schreibt die
// erzeugte Maske als Datei heraus, ergänzt die Datei von außen um eine
// Überschrift und prüft, dass die Maske sie beim nächsten Öffnen zeigt und nach
// dem Löschen der Datei wieder die erzeugte.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { LOCALE_CODES } = require('../../../src/shared/locales.js');
// 4T-001940: der Beleg der vorgefundenen Fassung, gelesen wie die Beleg-Ansicht.
const { belegeDesDatensatzes } = require('../../../src/main/database/change-log.js');
// 4T-001941: Name und Ort der Sperr-Datei eines Datensatzes, aus dem Sperr-Speicher
// selbst statt nachgeschrieben.
const { sperrDateiName } = require('../../../src/main/database/lock-store.js');
const { DEFAULT_LOCK_FOLDER_NAME } = require('../../../src/shared/database/lock-folder-name.js');

const PANE = '.pane-group[data-pane="0"]';
const MASKE = `${PANE} .pane-system .db-form-page`;
const UEBERSICHT = `${PANE} .pane-system .db-overview-page`;
const BLOCK_LESE = `${SEL.markdownBody0} .perspective-records`;
const KENNUNG = 'r-00001';
// Der Hochwasserstand der Tabelle steht auf 2; die Neuanlage zieht deshalb
// genau diese Kennung.
const KENNUNG_NEU = 'r-00003';
const FELDER = ['Name', 'Menge', 'Aktiv'];

function inAllenSprachen(key) {
  return LOCALE_CODES.map((code) => require(`../../../src/i18n/${code}.json`)[key]);
}

function tmpDir(praefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), praefix));
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufräumen darf den Lauf nicht kippen */
  }
}

// Ein Datenbank-Bereich mit Steckbrief und einer Tabelle «Kunden» mit drei
// Feldern verschiedener Typen, eines davon Pflicht; «Menge» trägt seit
// 4T-001940 eine Prüfregel (größer als null) für die Abweisung am Feld.
//
// 4T-001942: Mit `verweis: true` bekommt «Kunden» den fachlichen Schlüssel und
// die Anzeige-Form «Name», und eine zweite Tabelle «Bestellungen» verweist über
// ihr Feld «Kunde» auf sie. Ohne die Angabe bleibt der Aufbau der Fälle
// DB-MAS-01 bis DB-MAS-04 Zeichen für Zeichen derselbe.
function baueBereich({ verweis = false } = {}) {
  const wurzel = tmpDir('em4me-maske-');
  fs.writeFileSync(
    path.join(wurzel, 'Datenbank.md'),
    ['---', 'db-database:', '  name: Mini-CRM', '---', '', 'Beschreibung.', ''].join('\n'),
    'utf8',
  );
  const tabelle = path.join(wurzel, 'Kunden.md');
  fs.writeFileSync(
    tabelle,
    [
      '---',
      'db-table:',
      '  lastId: 2',
      '  fields:',
      '    - name: Name',
      '      type: string',
      '      required: true',
      '    - name: Menge',
      '      type: number',
      "      check: 'value > 0'",
      '    - name: Aktiv',
      '      type: boolean',
      ...(verweis ? ['  key: Name', '  display: Name'] : []),
      '---',
      '',
      '```perspective-records',
      `|- id="${KENNUNG}"`,
      '| Anna Muster',
      '| 12',
      '| x',
      '|- id="r-00002"',
      '| Beat Beispiel',
      '| 3',
      '|',
      '```',
      '',
    ].join('\n'),
    'utf8',
  );
  if (!verweis) return { wurzel, tabelle };
  const bestellungen = path.join(wurzel, 'Bestellungen.md');
  fs.writeFileSync(
    bestellungen,
    [
      '---',
      'db-table:',
      '  lastId: 1',
      '  fields:',
      '    - name: Titel',
      '      type: string',
      '    - name: Kunde',
      '      type: record',
      '      options:',
      '        table: Kunden',
      '---',
      '',
      '```perspective-records',
      `|- id="${KENNUNG}"`,
      '| Erste Bestellung',
      // Die Kurzform der Kennung, wie sie von Hand in der Datei stehen darf.
      '| r-2',
      '```',
      '',
    ].join('\n'),
    'utf8',
  );
  return { wurzel, tabelle, bestellungen };
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
  await app.evaluate(({ BrowserWindow }, p) => {
    BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [p]);
  }, tabelle);
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('DB-MAS-01: Einzel-Maske aus der Zeile und Neuanlage aus der Übersicht (4T-001939)', () => {
  test('öffnen, Felder in Reihenfolge, bearbeiten und verwerfen, neu anlegen', async () => {
    const { wurzel, tabelle } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneTabelle(app, page, tabelle);

      // AK1: Zugang an der Datensatz-Zeile in der Lese-Ansicht.
      const block = page.locator(BLOCK_LESE);
      await expect(block.locator('table.prc-table')).toBeVisible({ timeout: 20000 });
      const zeile = block.locator(`tr.prc-row[data-rec-id="${KENNUNG}"]`);
      await expect(zeile.locator('.prc-open-btn')).toHaveCount(1);
      // Der Fuß mit «Neuer Datensatz» steht unter der Tabelle.
      await expect(block.locator('.prc-foot .prc-new-btn')).toHaveCount(1);
      await zeile.hover();
      await zeile.locator('.prc-open-btn').click();

      const maske = page.locator(MASKE);
      await expect(maske).toBeVisible({ timeout: 20000 });
      await expect(maske.locator('.db-form-heading')).toHaveText('Kunden');
      await expect(maske.locator('.db-form-record')).toContainText(KENNUNG);

      // AK1: alle Felder in Definitions-Reihenfolge, je mit Beschriftung.
      const felder = maske.locator('.db-form-field');
      await expect(felder).toHaveCount(FELDER.length);
      expect(await felder.evaluateAll((els) => els.map((e) => e.dataset.field))).toEqual(FELDER);
      expect(
        await felder.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))),
      ).toEqual(FELDER);
      // Die sichtbare Beschriftung steht im Markdown-Segment vor dem Feld.
      const beschriftungen = await maske
        .locator('.db-form-md strong')
        .evaluateAll((els) => els.map((e) => e.textContent.trim()));
      expect(beschriftungen).toEqual(FELDER.map((name) => `${name}:`));
      // Pflicht-Kennzeichnung am Pflicht-Feld und nur dort.
      await expect(maske.locator('.db-form-field.db-form-required')).toHaveCount(1);
      await expect(maske.locator('.db-form-field[data-field="Name"]')).toHaveClass(
        /db-form-required/,
      );

      // AK2: Beim Öffnen lesend — kein Eingabefeld, die Werte als Text.
      await expect(maske.locator('input, textarea')).toHaveCount(0);
      await expect(maske.locator('.db-form-field[data-field="Name"] .db-form-value')).toHaveText(
        'Anna Muster',
      );
      await expect(maske.locator('.db-form-field[data-field="Aktiv"] .db-form-value')).toHaveText(
        '✓',
      );
      // Die Aktionen des Lesens; «Belege» führt in die Beleg-Ansicht.
      await expect(maske.locator('.db-form-edit')).toHaveCount(1);
      await expect(maske.locator('.db-form-delete')).toHaveCount(1);
      await expect(maske.locator('.db-form-changelog')).toHaveCount(1);
      const bearbeitenText = await maske.locator('.db-form-edit').textContent();
      expect(inAllenSprachen('database.form.action.edit')).toContain(bearbeitenText);

      // AK2: «Bearbeiten» schaltet die Felder frei, in der Eingabe-Form ihres Typs.
      await maske.locator('.db-form-edit').click();
      await expect(maske.locator('.db-form-input')).toHaveCount(FELDER.length);
      const arten = await maske
        .locator('.db-form-input')
        .evaluateAll((els) => els.map((e) => e.type));
      expect(arten).toEqual(['text', 'number', 'checkbox']);
      const name = maske.locator('.db-form-field[data-field="Name"] .db-form-input');
      await expect(name).toHaveValue('Anna Muster');
      await expect(maske.locator('.db-form-field[data-field="Menge"] .db-form-input')).toHaveValue(
        '12',
      );
      await expect(
        maske.locator('.db-form-field[data-field="Aktiv"] .db-form-input'),
      ).toBeChecked();
      // Speichern ist bedienbar (4T-001940); geschrieben wird in DB-MAS-02.
      await expect(maske.locator('.db-form-save')).toBeEnabled();

      // AK2: «Verwerfen» setzt auf den gelesenen Stand zurück.
      await name.fill('Geändert');
      await maske.locator('.db-form-discard').click();
      await expect(maske.locator('input, textarea')).toHaveCount(0);
      await expect(maske.locator('.db-form-field[data-field="Name"] .db-form-value')).toHaveText(
        'Anna Muster',
      );
      // Die Datei ist unberührt geblieben.
      expect(fs.readFileSync(tabelle, 'utf8')).toContain('| Anna Muster');

      // AK5: «Neuer Datensatz» aus der Übersicht der Datenbank-Objekte.
      await page.evaluate(() => {
        document.dispatchEvent(
          new CustomEvent('scg:open-system-page', { detail: { pageId: 'database-overview' } }),
        );
      });
      const uebersicht = page.locator(UEBERSICHT);
      await expect(uebersicht).toBeVisible({ timeout: 20000 });
      const neu = uebersicht.locator('.db-overview-new-record');
      await expect(neu).toHaveCount(1, { timeout: 20000 });
      await neu.click();

      await expect(maske).toBeVisible({ timeout: 20000 });
      await expect(maske.locator('.db-form-record')).toContainText(KENNUNG_NEU);
      // Die Maske öffnet leer: dieselben Felder, keine Werte.
      await expect(maske.locator('.db-form-field')).toHaveCount(FELDER.length);
      const werte = await maske
        .locator('.db-form-value')
        .evaluateAll((els) => els.map((e) => e.textContent));
      expect(werte).toEqual(['', '', '']);
      // Die Kennung ist beim Eröffnen gezogen: Der Hochwasserstand steht in der Datei.
      await expect.poll(() => fs.readFileSync(tabelle, 'utf8')).toMatch(/lastId:\s*3\b/);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

// --- 4T-001940: Speichern aus der Maske --------------------------------------------

// Öffnet die Maske über die Verdrahtungs-Schnittstelle der Seite; der Zugang
// an der Zeile ist Gegenstand von DB-MAS-01 und hier nur Aufbau.
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

function feldIn(maske, name) {
  return maske.locator(`.db-form-field[data-field="${name}"]`);
}

// Ein Satz eines Schlüssels mit eingesetzten Angaben, in allen fünf Sprachen.
function saetze(key, werte) {
  return inAllenSprachen(key).map((text) =>
    Object.entries(werte).reduce((satz, [name, wert]) => satz.split(`{${name}}`).join(wert), text),
  );
}

// Ersetzt im Datei-Text genau eine Stelle, wie ein Editor von außen.
function aendereVonAussen(tabelle, alt, neu) {
  const text = fs.readFileSync(tabelle, 'utf8');
  expect(text.split(alt)).toHaveLength(2);
  fs.writeFileSync(tabelle, text.replace(alt, neu), 'utf8');
}

test.describe('DB-MAS-02: Anlegen, Ändern, Abweisung am Feld und Löschen aus der Maske (4T-001940)', () => {
  test('schreibt über die Schnittstelle und führt eine Abweisung zum Feld', async () => {
    const { wurzel, tabelle } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneTabelle(app, page, tabelle);
      await expect(page.locator(`${BLOCK_LESE} table.prc-table`)).toBeVisible({ timeout: 20000 });

      // AK1: Ändern schreibt, die Maske kehrt ins Lesen zurück und zeigt den Stand.
      const maske = await oeffneMaskeFuer(page, tabelle, KENNUNG);
      await maske.locator('.db-form-edit').click();
      await feldIn(maske, 'Name').locator('.db-form-input').fill('Anna Neu');
      await maske.locator('.db-form-save').click();
      await expect(maske.locator('input, textarea')).toHaveCount(0, { timeout: 20000 });
      await expect(feldIn(maske, 'Name').locator('.db-form-value')).toHaveText('Anna Neu');
      await expect.poll(() => fs.readFileSync(tabelle, 'utf8')).toContain('| Anna Neu');
      const belege = await belegeDesDatensatzes(tabelle, KENNUNG);
      expect(belege.ok).toBe(true);
      expect(belege.belege.map((b) => b.art)).toEqual(['update']);

      // AK3: leere Pflicht-Zelle — Meldung am Feld, Markierung, Fokus; nichts geschrieben.
      const vorher = fs.readFileSync(tabelle, 'utf8');
      await maske.locator('.db-form-edit').click();
      await feldIn(maske, 'Name').locator('.db-form-input').fill('');
      await maske.locator('.db-form-save').click();
      await expect(feldIn(maske, 'Name')).toHaveClass(/db-form-marked/, { timeout: 20000 });
      const pflicht = await feldIn(maske, 'Name').locator('.db-form-message').textContent();
      expect(saetze('database.auftrag.auftragPflichtAngabeFehlt', { feld: 'Name' })).toContain(
        pflicht,
      );
      await expect(feldIn(maske, 'Name').locator('.db-form-input')).toBeFocused();
      // Die Eingabe bleibt stehen, der Modus auch.
      await expect(maske.locator('.db-form-input')).toHaveCount(FELDER.length);
      expect(fs.readFileSync(tabelle, 'utf8')).toBe(vorher);

      // AK3: regelwidrige Zahl — die Prüfregel meldet am Feld «Menge».
      await feldIn(maske, 'Name').locator('.db-form-input').fill('Anna Neu');
      await feldIn(maske, 'Menge').locator('.db-form-input').fill('0');
      await maske.locator('.db-form-save').click();
      await expect(feldIn(maske, 'Menge')).toHaveClass(/db-form-marked/, { timeout: 20000 });
      const regel = await feldIn(maske, 'Menge').locator('.db-form-message').textContent();
      expect(regel).toContain('«0»');
      expect(regel).toContain('«Menge»');
      expect(regel).toContain('«value > 0»');
      await expect(feldIn(maske, 'Name')).not.toHaveClass(/db-form-marked/);
      await expect(feldIn(maske, 'Menge').locator('.db-form-input')).toBeFocused();
      expect(fs.readFileSync(tabelle, 'utf8')).toBe(vorher);
      await maske.locator('.db-form-discard').click();

      // AK1: Anlegen aus der Übersicht; der neue Datensatz steht mit seiner Kennung in der Datei.
      await page.evaluate(() => {
        document.dispatchEvent(
          new CustomEvent('scg:open-system-page', { detail: { pageId: 'database-overview' } }),
        );
      });
      const neu = page.locator(UEBERSICHT).locator('.db-overview-new-record');
      await expect(neu).toHaveCount(1, { timeout: 20000 });
      await neu.click();
      await expect(maske.locator('.db-form-record')).toContainText(KENNUNG_NEU, { timeout: 20000 });
      await maske.locator('.db-form-edit').click();
      await feldIn(maske, 'Name').locator('.db-form-input').fill('Carla Neu');
      await feldIn(maske, 'Menge').locator('.db-form-input').fill('5');
      await maske.locator('.db-form-save').click();
      await expect(maske.locator('input, textarea')).toHaveCount(0, { timeout: 20000 });
      await expect(feldIn(maske, 'Name').locator('.db-form-value')).toHaveText('Carla Neu');
      await expect.poll(() => fs.readFileSync(tabelle, 'utf8')).toContain(`|- id="${KENNUNG_NEU}"`);
      expect(fs.readFileSync(tabelle, 'utf8')).toContain('| Carla Neu');
      // Nach dem Anlegen ist der Datensatz ein gewöhnlicher: Löschen steht bereit.
      await expect(maske.locator('.db-form-delete')).toHaveCount(1);

      // AK5: Löschen fragt zurück; «Nein» lässt alles stehen.
      await maske.locator('.db-form-delete').click();
      const frage = maske.locator('.db-form-confirm-delete');
      await expect(frage).toHaveCount(1);
      expect(inAllenSprachen('database.form.confirmDelete')).toContain(
        await frage.locator('.db-form-confirm-text').textContent(),
      );
      await frage.locator('.db-form-delete-no').click();
      await expect(frage).toHaveCount(0);
      expect(fs.readFileSync(tabelle, 'utf8')).toContain(`|- id="${KENNUNG_NEU}"`);

      // AK5: «Ja» löscht und schließt die Maske.
      await maske.locator('.db-form-delete').click();
      await maske.locator('.db-form-confirm-delete .db-form-delete-yes').click();
      await expect(page.locator(MASKE)).toHaveCount(0, { timeout: 20000 });
      await expect
        .poll(() => fs.readFileSync(tabelle, 'utf8'))
        .not.toContain(`|- id="${KENNUNG_NEU}"`);
      const geloescht = await belegeDesDatensatzes(tabelle, KENNUNG_NEU);
      expect(geloescht.belege.map((b) => b.art)).toEqual(['create', 'delete']);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

test.describe('DB-MAS-03: Fremd-Änderung zwischen Lesen und Speichern (4T-001940)', () => {
  test('neu laden zeigt den vorgefundenen Stand, erzwingen belegt ihn, die harte Regel bleibt', async () => {
    const { wurzel, tabelle } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneTabelle(app, page, tabelle);
      await expect(page.locator(`${BLOCK_LESE} table.prc-table`)).toBeVisible({ timeout: 20000 });
      const maske = await oeffneMaskeFuer(page, tabelle, KENNUNG);

      // AK4: Die Datei ändert sich zwischen Lesen und Speichern; die Wahl öffnet sich.
      await maske.locator('.db-form-edit').click();
      await feldIn(maske, 'Menge').locator('.db-form-input').fill('20');
      aendereVonAussen(tabelle, '| 12\n', '| 14\n');
      await maske.locator('.db-form-save').click();
      const wahl = maske.locator('.db-form-stale');
      await expect(wahl).toHaveCount(1, { timeout: 20000 });
      await expect(maske.locator('.db-form-errors')).toHaveCount(0);
      expect(fs.readFileSync(tabelle, 'utf8')).toContain('| 14\n');

      // «Neu laden» verwirft die Bearbeitung und zeigt den vorgefundenen Stand.
      await wahl.locator('.db-form-stale-reload').click();
      await expect(maske.locator('input, textarea')).toHaveCount(0, { timeout: 20000 });
      await expect(feldIn(maske, 'Menge').locator('.db-form-value')).toHaveText('14');
      expect(fs.readFileSync(tabelle, 'utf8')).toContain('| 14\n');

      // «Erzwingen» schreibt die eigene Fassung und belegt die vorgefundene.
      await maske.locator('.db-form-edit').click();
      await feldIn(maske, 'Menge').locator('.db-form-input').fill('30');
      aendereVonAussen(tabelle, '| 14\n', '| 15\n');
      await maske.locator('.db-form-save').click();
      await expect(wahl).toHaveCount(1, { timeout: 20000 });
      await wahl.locator('.db-form-stale-force').click();
      await expect(maske.locator('input, textarea')).toHaveCount(0, { timeout: 20000 });
      await expect(feldIn(maske, 'Menge').locator('.db-form-value')).toHaveText('30');
      await expect.poll(() => fs.readFileSync(tabelle, 'utf8')).toContain('| 30\n');
      const belege = (await belegeDesDatensatzes(tabelle, KENNUNG)).belege;
      expect(belege.map((b) => b.art)).toEqual(['external', 'update']);
      expect(belege[0].felder).toEqual([{ name: 'Menge', alt: '14', neu: '15' }]);
      expect(belege[1].felder).toEqual([{ name: 'Menge', alt: '15', neu: '30' }]);

      // Eine harte Regel bleibt auch beim Erzwingen: Die Prüfregel läuft nach dem
      // Vergleich des vorgefundenen Stands und weist die erzwungene Fassung ab.
      await maske.locator('.db-form-edit').click();
      await feldIn(maske, 'Menge').locator('.db-form-input').fill('0');
      aendereVonAussen(tabelle, '| Anna Muster\n', '| Anna Fremd\n');
      await maske.locator('.db-form-save').click();
      await expect(wahl).toHaveCount(1, { timeout: 20000 });
      await wahl.locator('.db-form-stale-force').click();
      await expect(feldIn(maske, 'Menge')).toHaveClass(/db-form-marked/, { timeout: 20000 });
      expect(await feldIn(maske, 'Menge').locator('.db-form-message').textContent()).toContain(
        '«value > 0»',
      );
      await expect(maske.locator('.db-form-stale')).toHaveCount(0);
      const text = fs.readFileSync(tabelle, 'utf8');
      expect(text).toContain('| Anna Fremd\n');
      expect(text).toContain('| 30\n');
      expect((await belegeDesDatensatzes(tabelle, KENNUNG)).belege).toHaveLength(2);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

// --- 4T-001941: Sperre in der Maske -------------------------------------------------

function sperrDateiVon(wurzel) {
  const benannt = sperrDateiName(wurzel, { art: 'record', tabelle: 'Kunden.md', id: KENNUNG });
  return path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME, benannt.name);
}

// Eine Sperr-Datei, wie ein anderer Rechner sie hinterlassen hätte; ein Text
// wird unverändert geschrieben (die leere Sperr-Datei).
function legeFremdeSperre(pfad, inhalt) {
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  const text =
    typeof inhalt === 'string'
      ? inhalt
      : JSON.stringify({
          schemaVersion: 1,
          art: 'record',
          tabelle: 'Kunden.md',
          id: KENNUNG,
          ...inhalt,
        });
  fs.writeFileSync(pfad, text, 'utf8');
}

function isoVor(stunden) {
  return new Date(Date.now() - stunden * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Der Wortlaut «Halter unbekannt» je Sprache, mit der Frist von vier Stunden.
function halterUnbekanntSaetze() {
  return LOCALE_CODES.map((code) => {
    const dict = require(`../../../src/i18n/${code}.json`);
    const frist = dict['database.sperre.stunden'].split('{anzahl}').join('4');
    return dict['database.sperre.halterUnbekannt'].split('{frist}').join(frist);
  });
}

test.describe('DB-MAS-04: Sperre beim Bearbeiten, Konflikt und Halter unbekannt (4T-001941)', () => {
  test('nimmt und gibt die Sperre, zeigt fremde, abgelaufene und leere Sperren', async () => {
    const { wurzel, tabelle } = baueBereich();
    const sperrDatei = sperrDateiVon(wurzel);
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneTabelle(app, page, tabelle);
      await expect(page.locator(`${BLOCK_LESE} table.prc-table`)).toBeVisible({ timeout: 20000 });

      // AK2: Öffnen nimmt keine Sperre.
      const maske = await oeffneMaskeFuer(page, tabelle, KENNUNG);
      expect(fs.existsSync(sperrDatei)).toBe(false);

      // AK1: «Bearbeiten» nimmt die Sperre mit Benutzer, Rechner und Zeitpunkt.
      await maske.locator('.db-form-edit').click();
      await expect(maske.locator('.db-form-input')).toHaveCount(FELDER.length, { timeout: 20000 });
      await expect.poll(() => fs.existsSync(sperrDatei)).toBe(true);
      const eigene = JSON.parse(fs.readFileSync(sperrDatei, 'utf8'));
      expect(eigene.id).toBe(KENNUNG);
      expect(typeof eigene.benutzer).toBe('string');
      expect(typeof eigene.rechner).toBe('string');
      expect(Number.isFinite(Date.parse(eigene.zeitpunkt))).toBe(true);

      // AK1: «Verwerfen» gibt sie frei.
      await maske.locator('.db-form-discard').click();
      await expect(maske.locator('input, textarea')).toHaveCount(0);
      await expect.poll(() => fs.existsSync(sperrDatei)).toBe(false);

      // AK3: Eine fremde, frische Sperre — Benutzer und Rechner, allein «Nur lesen».
      legeFremdeSperre(sperrDatei, {
        benutzer: 'bert.fremd',
        rechner: 'FREMD-PC-7',
        zeitpunkt: isoVor(0),
      });
      const fremd = fs.readFileSync(sperrDatei, 'utf8');
      await maske.locator('.db-form-edit').click();
      const block = maske.locator('.db-form-lock');
      await expect(block).toHaveCount(1, { timeout: 20000 });
      await expect(block).toHaveAttribute('data-lock-kind', 'fremd');
      await expect(block.locator('.db-form-lock-text')).toContainText('bert.fremd');
      await expect(block.locator('.db-form-lock-text')).toContainText('FREMD-PC-7');
      await expect(block.locator('.db-form-lock-read')).toHaveCount(1);
      await expect(block.locator('.db-form-lock-break')).toHaveCount(0);
      await expect(maske.locator('input, textarea')).toHaveCount(0);
      await block.locator('.db-form-lock-read').click();
      await expect(block).toHaveCount(0);
      expect(fs.readFileSync(sperrDatei, 'utf8')).toBe(fremd);

      // AK3: Nach der Frist steht «Sperre brechen», und der Bruch führt ins Bearbeiten.
      legeFremdeSperre(sperrDatei, {
        benutzer: 'bert.fremd',
        rechner: 'FREMD-PC-7',
        zeitpunkt: isoVor(5),
      });
      await maske.locator('.db-form-edit').click();
      await expect(block.locator('.db-form-lock-break')).toHaveCount(1, { timeout: 20000 });
      await block.locator('.db-form-lock-break').click();
      await expect(maske.locator('.db-form-input')).toHaveCount(FELDER.length, { timeout: 20000 });
      await expect(block).toHaveCount(0);
      const gebrochen = JSON.parse(fs.readFileSync(sperrDatei, 'utf8'));
      expect(gebrochen.benutzer).toBe(eigene.benutzer);
      expect(gebrochen.rechner).toBe(eigene.rechner);
      await maske.locator('.db-form-discard').click();
      await expect.poll(() => fs.existsSync(sperrDatei)).toBe(false);

      // AK4: Eine leere Sperr-Datei ergibt den Wortlaut «Halter unbekannt».
      legeFremdeSperre(sperrDatei, '');
      await maske.locator('.db-form-edit').click();
      await expect(block).toHaveAttribute('data-lock-kind', 'unbekannt', { timeout: 20000 });
      const satz = await block.locator('.db-form-lock-text').textContent();
      expect(halterUnbekanntSaetze()).toContain(satz);
      await expect(block.locator('.db-form-lock-break')).toHaveCount(0);
      await block.locator('.db-form-lock-read').click();
      expect(fs.readFileSync(sperrDatei, 'utf8')).toBe('');
      fs.rmSync(sperrDatei);

      // AK1: Das Schließen des Reiters gibt die Sperre frei.
      await maske.locator('.db-form-edit').click();
      await expect.poll(() => fs.existsSync(sperrDatei)).toBe(true);
      // Der Reiter der Maske nennt die Kennung; der Reiter der Tabelle nicht.
      const reiter = page.locator(SEL.tabs0).filter({ hasText: KENNUNG });
      await expect(reiter).toHaveCount(1);
      await reiter.locator('.tab-close').click();
      await expect(reiter).toHaveCount(0);
      await expect(page.locator(MASKE)).toBeHidden();
      await expect.poll(() => fs.existsSync(sperrDatei)).toBe(false);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

// --- 4T-001942: Wertehilfe der Verweis-Felder ----------------------------------------

// Die Zeile eines Datensatzes in der Datei: Kennungs-Zeile und seine Zellen.
function zellenVon(text, kennung) {
  const zeilen = text.split('\n');
  const start = zeilen.indexOf(`|- id="${kennung}"`);
  const ende = zeilen.findIndex((z, i) => i > start && (z.startsWith('|-') || z.startsWith('```')));
  return zeilen.slice(start + 1, ende);
}

test.describe('DB-MAS-05: Wertehilfe eines Verweis-Feldes (4T-001942)', () => {
  test('zeigt Anzeige-Form und Kennung, trägt die Kennung ein und ersetzt einen Schlüssel-Wert', async () => {
    const { wurzel, tabelle, bestellungen } = baueBereich({ verweis: true });
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneTabelle(app, page, tabelle);
      await expect(page.locator(`${BLOCK_LESE} table.prc-table`)).toBeVisible({ timeout: 20000 });
      // Aufbau: Der Bereichs-Index kennt beide Tabellen; erst dann ist der Name
      // der Ziel-Tabelle auflösbar.
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.api.databaseDatensaetze({ tabelle: 'Kunden' })))
              .status,
          { timeout: 20000 },
        )
        .toBe('ready');

      // AK4: Lesend zeigt das Feld Anzeige-Form und Kennung, auch für die Kurzform.
      const maske = await oeffneMaskeFuer(page, bestellungen, KENNUNG);
      const kunde = feldIn(maske, 'Kunde');
      await expect(kunde.locator('.db-form-value')).toHaveText('Beat Beispiel (r-00002)');
      await expect(kunde.locator('.db-form-unresolved')).toHaveCount(0);

      // AK2: Die Wertehilfe zeigt Anzeige-Form und Kennung und grenzt beim Tippen ein.
      await maske.locator('.db-form-edit').click();
      const eingabe = kunde.locator('.db-form-input');
      await expect(eingabe).toHaveValue('r-2', { timeout: 20000 });
      await eingabe.fill('');
      await eingabe.focus();
      const liste = kunde.locator('.db-form-suggest');
      await expect(liste).toBeVisible();
      const punkte = liste.locator('.db-form-suggest-item');
      await expect(punkte).toHaveCount(2);
      await expect(punkte.nth(0).locator('.db-form-suggest-display')).toHaveText('Anna Muster');
      await expect(punkte.nth(0).locator('.db-form-suggest-id')).toHaveText(KENNUNG);
      await expect(punkte.nth(1).locator('.db-form-suggest-display')).toHaveText('Beat Beispiel');
      await eingabe.pressSequentially('anna');
      await expect(punkte).toHaveCount(1);

      // AK2: Die Auswahl trägt die Kennung ein; nach dem Speichern steht sie in der Zelle.
      await punkte.first().click();
      await expect(eingabe).toHaveValue(KENNUNG);
      await expect(liste).toBeHidden();
      await maske.locator('.db-form-save').click();
      await expect(maske.locator('input, textarea')).toHaveCount(0, { timeout: 20000 });
      await expect(kunde.locator('.db-form-value')).toHaveText(`Anna Muster (${KENNUNG})`);
      await expect
        .poll(() => zellenVon(fs.readFileSync(bestellungen, 'utf8'), KENNUNG))
        .toEqual(['| Erste Bestellung', `| ${KENNUNG}`]);

      // AK3: Ein Schlüssel-Wert von Hand bleibt stehen und wird beim Speichern
      // durch die Kennung ersetzt; auch mit der Tastatur bedienbar.
      await maske.locator('.db-form-edit').click();
      await eingabe.fill('');
      await eingabe.pressSequentially('Beat Beispiel');
      await eingabe.press('Escape');
      await expect(liste).toBeHidden();
      await expect(eingabe).toHaveValue('Beat Beispiel');
      await maske.locator('.db-form-save').click();
      await expect(maske.locator('input, textarea')).toHaveCount(0, { timeout: 20000 });
      await expect(kunde.locator('.db-form-value')).toHaveText('Beat Beispiel (r-00002)');
      await expect
        .poll(() => zellenVon(fs.readFileSync(bestellungen, 'utf8'), KENNUNG))
        .toEqual(['| Erste Bestellung', '| r-00002']);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

// --- 4T-001943: Masken-Datei ---------------------------------------------------------

// Die Folge der Blöcke im Körper der Maske: Feld-Elemente mit ihrem Namen,
// Überschriften mit ihrer Stufe, übrige Markdown-Blöcke als «md».
async function koerperFolge(maske) {
  return maske.locator('.db-form-body').evaluate((koerper) =>
    [...koerper.children].map((kind) => {
      if (kind.classList.contains('db-form-field')) return `feld:${kind.dataset.field}`;
      const titel = kind.querySelector('h1, h2, h3');
      return titel ? `${titel.tagName.toLowerCase()}:${titel.textContent.trim()}` : 'md';
    }),
  );
}

test.describe('DB-MAS-06: Maske als Datei herausschreiben und die Masken-Datei lesen (4T-001943)', () => {
  test('herausschreiben, Überschrift in der Datei sehen, nach dem Löschen wieder die erzeugte', async () => {
    const { wurzel, tabelle } = baueBereich();
    const maskenDatei = path.join(wurzel, 'Kunden Form.md');
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneTabelle(app, page, tabelle);
      await expect(page.locator(`${BLOCK_LESE} table.prc-table`)).toBeVisible({ timeout: 20000 });

      // AK1: Die erzeugte Maske bietet im Lesen den Handgriff an, und noch keine Quelle.
      const maske = await oeffneMaskeFuer(page, tabelle, KENNUNG);
      const handgriff = maske.locator('.db-form-write-file');
      await expect(handgriff).toHaveCount(1);
      expect(inAllenSprachen('database.form.action.writeFile')).toContain(
        await handgriff.textContent(),
      );
      await expect(maske.locator('.db-form-source')).toHaveCount(0);

      // AK1: Der Handgriff schreibt die Datei neben die Tabelle, mit Kennzeichnung
      // und dem erzeugten Körper.
      await handgriff.click();
      // Angelegt wird exklusiv und danach beschrieben; zwischen beidem ist die
      // Datei da und leer. Gewartet wird deshalb auf Inhalt, nicht auf Existenz.
      const liesMaske = () => {
        try {
          return fs.readFileSync(maskenDatei, 'utf8');
        } catch {
          return '';
        }
      };
      await expect.poll(() => liesMaske().length > 0, { timeout: 20000 }).toBe(true);
      const geschrieben = liesMaske();
      expect(geschrieben).toMatch(/^---\ntitle: Kunden Form\ndb-form:\n {2}table: Kunden\n---\n/);
      expect(geschrieben).toContain('**Name:** {{field:Name}}');
      expect(geschrieben).toContain('**Menge:** {{field:Menge}}');

      // Ein zweiter Klick überschreibt nichts.
      fs.writeFileSync(
        maskenDatei,
        geschrieben.replace('**Menge:**', '## Zwischentitel\n\n**Menge:**'),
        'utf8',
      );
      const gestaltet = fs.readFileSync(maskenDatei, 'utf8');
      await handgriff.click();
      await page.waitForTimeout(500);
      expect(fs.readFileSync(maskenDatei, 'utf8')).toBe(gestaltet);

      // AK3, AK5: Beim nächsten Öffnen zeigt die Maske den Körper der Datei; die
      // Überschrift steht zwischen den beiden Feldern, die Quelle im Kopf.
      await expect(async () => {
        await oeffneMaskeFuer(page, tabelle, KENNUNG);
        await expect(maske.locator('.db-form-source')).toHaveCount(1, { timeout: 1000 });
      }).toPass({ timeout: 20000 });
      expect(await koerperFolge(maske)).toEqual([
        'h1:Kunden',
        'feld:Name',
        'h2:Zwischentitel',
        'feld:Menge',
        'md',
        'feld:Aktiv',
      ]);
      await expect(maske.locator('.db-form-source')).toContainText('Kunden Form.md');
      await expect(maske.locator('.db-form-write-file')).toHaveCount(0);

      // AK5: Nach dem Löschen der Datei zeigt die Maske wieder die erzeugte.
      fs.rmSync(maskenDatei);
      await expect(async () => {
        await oeffneMaskeFuer(page, tabelle, KENNUNG);
        await expect(maske.locator('.db-form-source')).toHaveCount(0, { timeout: 1000 });
      }).toPass({ timeout: 20000 });
      expect(await koerperFolge(maske)).toEqual([
        'h1:Kunden',
        'feld:Name',
        'md',
        'feld:Menge',
        'md',
        'feld:Aktiv',
      ]);
      await expect(maske.locator('.db-form-write-file')).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
