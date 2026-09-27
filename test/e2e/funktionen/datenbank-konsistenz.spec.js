// 4T-001944 (Epic 3E-000257, AK4): Die Konsistenz-Prüfung in der realen
// Anordnung — Aktion in der Übersicht der Datenbank, Befund-Liste, Sprung in die
// Maske und «keine Befunde» nach der Berichtigung.
//
// 4T-001945 (Epic 3E-000257, AK4): DB-KON-02 prüft in derselben Anordnung den
// Verwendungsnachweis — die Aktion je Tabelle in der Übersicht, «Verwendet von»
// im Kopf der Maske und den Sprung in die Maske des verweisenden Datensatzes.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Kette reicht von der Aktion der Übersichts-Seite über den Kanal
// `database:konsistenz`, der den gebundenen Bereich des Fensters und die Sicht
// des Index braucht, bis in die Befund-Liste und von dort in die Maske. Beides,
// Bereich und Index, gibt es erst in der laufenden Anwendung.
//
// **Der Aufbau ist nicht der Gegenstand** (test/README.md): Der Bereich wird
// über den Weg gebunden, den die Anwendung von außen anbietet, die Übersicht über
// das allgemeine Seiten-Ereignis geöffnet, und die Berichtigung schreibt die
// Prüfdatei selbst in die Dateien, statt sie über die Maske zu bedienen.
//
// **Sprachfrei geprüft**: Ein frisches Profil steht auf Englisch. Geprüft wird an
// Klassen, Daten-Attributen und Daten des angelegten Bestands.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

const PANE = '.pane-group[data-pane="0"]';
const MASKE = `${PANE} .pane-system .db-form-page`;
const UEBERSICHT = `${PANE} .pane-system .db-overview-page`;

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufräumen darf den Lauf nicht kippen */
  }
}

function kunden(zweiterName) {
  return [
    '---',
    'db-table:',
    '  lastId: 2',
    '  fields:',
    '    - name: Name',
    '      type: string',
    '  key: Name',
    '  display: Name',
    '---',
    '',
    '```perspective-records',
    '|- id="r-00001"',
    '| Anna Muster',
    '|- id="r-00002"',
    `| ${zweiterName}`,
    '```',
    '',
  ].join('\n');
}

function bestellungen(kunde) {
  return [
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
    '|- id="r-00001"',
    '| Erste Bestellung',
    `| ${kunde}`,
    '```',
    '',
  ].join('\n');
}

// Ein Datenbank-Bereich mit zwei gesetzten Befunden: «Kunden» vergibt den
// Schlüssel «Anna Muster» zweimal, «Bestellungen» verweist auf eine Kennung, die
// es nicht gibt.
function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-konsistenz-'));
  fs.writeFileSync(
    path.join(wurzel, 'Datenbank.md'),
    ['---', 'db-database:', '  name: Mini-CRM', '---', '', 'Beschreibung.', ''].join('\n'),
    'utf8',
  );
  const tabelle = path.join(wurzel, 'Kunden.md');
  fs.writeFileSync(tabelle, kunden('Anna Muster'), 'utf8');
  const verweis = path.join(wurzel, 'Bestellungen.md');
  fs.writeFileSync(verweis, bestellungen('r-00009'), 'utf8');
  return { wurzel, tabelle, verweis };
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
// dann noch an, zeigt sie den Wartezustand und keine Tabellen. Bis die Aktion
// dasteht, wird deshalb über den Knopf «Aktualisieren» neu geholt.
async function warteAufDatenbank(uebersicht) {
  const pruefen = uebersicht.locator('.db-overview-check');
  await expect
    .poll(
      async () => {
        if ((await pruefen.count()) > 0) return true;
        const neu = uebersicht.locator('.db-overview-refresh');
        if (await neu.isEnabled()) await neu.click();
        return false;
      },
      { timeout: 30000, intervals: [500] },
    )
    .toBe(true);
  return pruefen;
}

test.describe('DB-KON-01: Konsistenz-Prüfung in der Übersicht (4T-001944)', () => {
  test('Aktion, Befund-Liste, Sprung in die Maske, keine Befunde nach der Berichtigung', async () => {
    const { wurzel, tabelle, verweis } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      const uebersicht = await oeffneUebersicht(page);

      // AK4: die Aktion im Kopf und je Tabellen-Zeile.
      const pruefen = await warteAufDatenbank(uebersicht);
      await expect(pruefen).toHaveCount(1);
      await expect(uebersicht.locator('.db-overview-check-table')).toHaveCount(2);
      await pruefen.click();

      // AK4: Zusammenfassung, Zähler je Tabelle und die Liste der Befunde.
      const abschnitt = uebersicht.locator('.db-consistency');
      await expect(abschnitt.locator('.db-consistency-summary')).toHaveCount(1, {
        timeout: 20000,
      });
      await expect(abschnitt.locator('.db-consistency-counts tbody tr')).toHaveCount(2);
      const befunde = abschnitt.locator('.db-consistency-finding');
      // Die Dublette ergibt je beteiligtem Datensatz einen Befund.
      await expect(befunde).toHaveCount(3);
      const arten = await befunde.evaluateAll((els) => els.map((e) => e.dataset.code).sort());
      expect(arten).toEqual([
        'konsistenzSchluesselDoppelt',
        'konsistenzSchluesselDoppelt',
        'konsistenzVerweisZielFehlt',
      ]);
      const dublette = befunde.filter({
        has: page.locator('.db-consistency-open', { hasText: 'r-00002' }),
      });
      await expect(dublette.locator('.db-consistency-open')).toHaveText('Anna Muster (r-00002)');
      await expect(dublette.locator('.db-consistency-text')).toContainText('r-00001');
      await expect(dublette.locator('.db-consistency-text')).toContainText('r-00002');
      const insLeere = befunde.filter({ hasText: 'r-00009' });
      await expect(insLeere).toHaveCount(1);

      // AK4: Der Befund mit Kennung führt in die Maske seines Datensatzes.
      await insLeere.locator('.db-consistency-open').click();
      const maske = page.locator(MASKE);
      await expect(maske).toBeVisible({ timeout: 20000 });
      await expect(maske.locator('.db-form-heading')).toHaveText('Bestellungen');
      await expect(maske.locator('.db-form-field[data-field="Kunde"]')).toHaveCount(1);
      // Die Prüfung hat nichts geschrieben.
      expect(fs.readFileSync(verweis, 'utf8')).toBe(bestellungen('r-00009'));

      // Die Berichtigung durch die Prüfdatei; danach meldet die nächste Prüfung
      // keine Befunde mehr.
      fs.writeFileSync(tabelle, kunden('Beat Beispiel'), 'utf8');
      fs.writeFileSync(verweis, bestellungen('r-00001'), 'utf8');
      const wieder = await oeffneUebersicht(page);
      await wieder.locator('.db-overview-check').click();
      await expect(wieder.locator('.db-consistency-none')).toHaveCount(1, { timeout: 20000 });
      await expect(wieder.locator('.db-consistency-finding')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

// --- 4T-001945: Verwendungsnachweis ----------------------------------------------------------

// Öffnet die Maske über die Verdrahtungs-Schnittstelle der Seite (Muster
// `datenbank-maske.spec.js`); der Zugang ist hier nur Aufbau.
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

test.describe('DB-KON-02: Verwendungsnachweis in Übersicht und Maske (4T-001945)', () => {
  test('Aktion je Tabelle, Liste in der Maske, Sprung in die Maske des Verwenders', async () => {
    const { wurzel, tabelle, verweis } = baueBereich();
    // Ein Bestand ohne Befunde: Die Bestellung zeigt auf «Anna Muster».
    fs.writeFileSync(tabelle, kunden('Beat Beispiel'), 'utf8');
    fs.writeFileSync(verweis, bestellungen('r-00001'), 'utf8');
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      const uebersicht = await oeffneUebersicht(page);
      await warteAufDatenbank(uebersicht);

      // AK4: die Aktion je Tabellen-Zeile; gelesen wird erst auf Anforderung.
      await expect(uebersicht.locator('.db-overview-usage')).toHaveCount(2);
      await expect(uebersicht.locator('.db-usage')).toHaveCount(0);
      const zeileKunden = uebersicht.locator('tr', {
        has: page.locator('.db-overview-table-name', { hasText: /^Kunden$/ }),
      });
      await zeileKunden.locator('.db-overview-usage').click();
      const abschnitt = uebersicht.locator('.db-usage');
      const verwender = abschnitt.locator('.db-usage-table');
      await expect(verwender).toHaveCount(1, { timeout: 20000 });
      await expect(verwender.locator('.db-usage-table-name')).toHaveText('Bestellungen');
      await expect(verwender.locator('.db-usage-table-columns')).toHaveText('Kunde');
      await expect(abschnitt.locator('.db-usage-form')).toHaveCount(0);

      // «Bestellungen» benutzt niemand.
      const zeileBestellungen = uebersicht.locator('tr', {
        has: page.locator('.db-overview-table-name', { hasText: /^Bestellungen$/ }),
      });
      await zeileBestellungen.locator('.db-overview-usage').click();
      await expect(uebersicht.locator('.db-usage-none')).toHaveCount(1, { timeout: 20000 });
      await expect(uebersicht.locator('.db-usage-table')).toHaveCount(0);

      // AK4: die Aktion im Kopf der Maske; die Liste nennt die Bestellung.
      const maske = await oeffneMaskeFuer(page, tabelle, 'r-00001');
      await expect(maske.locator('.db-form-heading')).toHaveText('Kunden');
      await expect(maske.locator('.db-form-usage')).toHaveCount(0);
      await maske.locator('.db-form-usage-action').click();
      const eintrag = maske.locator('.db-form-usage-entry');
      await expect(eintrag).toHaveCount(1, { timeout: 20000 });
      await expect(eintrag).toHaveAttribute('data-table', 'Bestellungen');
      await expect(eintrag).toHaveAttribute('data-field', 'Kunde');
      // «Bestellungen» hat weder Anzeige-Form noch Schlüssel: Die Kennung steht allein.
      await expect(eintrag.locator('.db-form-usage-open')).toHaveText('r-00001');

      // AK4: Der genannte Datensatz führt in seine Maske.
      await eintrag.locator('.db-form-usage-open').click();
      await expect(maske.locator('.db-form-heading')).toHaveText('Bestellungen', {
        timeout: 20000,
      });
      await expect(maske.locator('.db-form-field[data-field="Kunde"]')).toHaveCount(1);
      // Beim Umbinden ist die Liste des vorigen Datensatzes verworfen.
      await expect(maske.locator('.db-form-usage')).toHaveCount(0);
      // Gelesen, nicht geschrieben.
      expect(fs.readFileSync(verweis, 'utf8')).toBe(bestellungen('r-00001'));
      expect(fs.readFileSync(tabelle, 'utf8')).toBe(kunden('Beat Beispiel'));
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
