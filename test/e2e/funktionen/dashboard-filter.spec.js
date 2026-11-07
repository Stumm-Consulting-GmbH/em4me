// 4T-002516 (Epic 3E-000402): Ablauf-Prüffall der Filter am Kopf eines
// Dashboards, Familie DF (Matrix-Eintrag F-405, Story 4S-001186).
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Auswahl verbindet Wege, die erst in der laufenden Anwendung zusammenstehen:
// die Werte aus dem Bestand über den Kanal des Hauptprozesses und den Index des
// Ordners, die Bindung der Platzhalter beim Auswerten jeder Kachel, den
// Nachzug nach dem Speichern einer anderen Datei über die Index-Invalidierung
// und den Zustand je geöffnetem Dokument über Schließen und erneutes Öffnen. Dass
// die Auswahl keine Bearbeitung ist, zeigt allein die echte Reiter-Leiste.
//
// **DF-01** (AK1, AK2, AK4, AK5, AK6, AK7): zwei Filter, einer aus dem Bestand
// und einer aufgezählt mit Vorbelegung, dazu ein Filter über eine Eigenschaft,
// die nicht vorkommt. Kennzahl und Tabelle tragen die Platzhalter, eine zweite
// Kennzahl trägt keinen und bleibt unberührt. Eine andere Datei mit neuem Wert
// erscheint in der Auswahl, ohne dass das Dashboard neu geöffnet wird.
//
// **DF-02** (AK3, AK4): Eine geänderte Auswahl verfällt mit dem Schließen; nach
// erneutem Öffnen steht der Filter wieder auf seiner Vorbelegung.
//
// **Sprache**: Das Profil der Ablauf-Prüffälle steht auf Deutsch (Vorbelegung
// in helpers/app.js); der Eintrag «alle» wird gegen die Sprachdatei geprüft.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { hauptSenden } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');

// Der Index baut asynchron auf; Werte und Kacheln erscheinen erst danach.
const WARTE_BESTAND_MS = 20000;

const ALLE = require('../../../src/i18n/de.json')['dashboard.hint.filterAlle'];

// Fence-Rumpf als Array gefügt, damit die Zäune nicht mit dem JS-Text kollidieren.
const DASHBOARD = [
  '---',
  'Bereich: Index',
  '---',
  '# Dashboard',
  '',
  '```perspective-dashboard',
  '!filter status titel="Status"',
  '!filter prio titel="Priorität" vorbelegung=hoch',
  'hoch',
  'niedrig',
  '!filter fehlt titel="Fehlt"',
  '!kachel kennzahl titel="Anzahl"',
  'LIST FROM "Aufgaben" WHERE status = $status AND prio = $prio',
  '!kachel tabelle titel="Aufgaben"',
  'TABLE status FROM "Aufgaben" WHERE status = $status AND fehlt = $fehlt',
  '!kachel kennzahl titel="Gesamt"',
  'LIST FROM "Aufgaben"',
  '```',
  '',
].join('\n');

const AUFGABEN = [
  ['A', 'offen', 'hoch'],
  ['B', 'offen', 'niedrig'],
  ['C', 'zu', 'hoch'],
  ['D', 'zu', 'hoch'],
];

function aufgabe(status, prio) {
  return `---\nstatus: ${status}\nprio: ${prio}\n---\n# Aufgabe\n`;
}

function makeFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-dashfilter-'));
  fs.mkdirSync(path.join(dir, 'Aufgaben'));
  fs.writeFileSync(path.join(dir, 'Dashboard.md'), DASHBOARD, 'utf8');
  for (const [name, status, prio] of AUFGABEN) {
    fs.writeFileSync(path.join(dir, 'Aufgaben', `${name}.md`), aufgabe(status, prio), 'utf8');
  }
  return dir;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

const BLOCK = `${SEL.markdownBody0} .perspective-dashboard`;
// Über die Beschriftung, die das Feld umschließt: belegt zugleich die Zuordnung.
// Nicht genau, weil der Name eines umschlossenen Felds je nach Rechen-Regel den
// gewählten Eintrag mitführt.
const auswahl = (page, titel) => page.locator(BLOCK).getByLabel(titel);
const kachel = (page, titel) =>
  page.locator(`${BLOCK} .dashboard-kachel`).filter({
    has: page.locator('.dashboard-kachel-titel', { hasText: new RegExp(`^${titel}$`) }),
  });
const kennzahl = (page, titel) => kachel(page, titel).locator('.dashboard-kennzahl-wert');
const zeilen = (page) => kachel(page, 'Aufgaben').locator('tbody tr');
const eintraege = (select) => select.locator('option');

async function oeffneDatei(app, datei) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, p) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [p]);
    },
    datei,
  );
}

test.describe('DF-01: Dashboard-Filter (F-405) — Auswahl, Wirkung, Nachzug, keine Bearbeitung', () => {
  test('Filter aus Bestand und Aufzählung grenzen die Kacheln mit Platzhalter ein, ohne das Dokument zu ändern', async () => {
    const dir = makeFixtureDir();
    const datei = path.join(dir, 'Dashboard.md');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(BLOCK)).toBeVisible({ timeout: WARTE_BESTAND_MS });
      const status = auswahl(page, 'Status');
      const prio = auswahl(page, 'Priorität');
      const fehlt = auswahl(page, 'Fehlt');

      // AK1: Werte aus dem Bestand, «alle» zuerst; AK2: genau die aufgezählten.
      await expect(eintraege(status)).toHaveText([ALLE, 'offen', 'zu'], {
        timeout: WARTE_BESTAND_MS,
      });
      await expect(eintraege(prio)).toHaveText([ALLE, 'hoch', 'niedrig']);
      // AK6: Eine Eigenschaft ohne Vorkommen bietet nur «alle».
      await expect(eintraege(fehlt)).toHaveText([ALLE]);
      await expect(prio).toHaveValue('hoch');
      await expect(status).toHaveValue('');

      // Vorbelegung: Priorität hoch, Status alle -> A, C, D.
      await expect(kennzahl(page, 'Anzahl')).toHaveText('3', { timeout: WARTE_BESTAND_MS });
      await expect(zeilen(page)).toHaveCount(4);
      await expect(kennzahl(page, 'Gesamt')).toHaveText('4');

      // AK1 und AK6: Status offen grenzt Kennzahl und Tabelle ein, beide Filter
      // wirken zugleich auf die Kennzahl.
      await status.selectOption('offen');
      await expect(kennzahl(page, 'Anzahl')).toHaveText('1');
      await expect(zeilen(page)).toHaveCount(2);
      await prio.selectOption('');
      await expect(kennzahl(page, 'Anzahl')).toHaveText('2');
      // AK7: Die Kachel ohne Platzhalter bleibt unberührt.
      await expect(kennzahl(page, 'Gesamt')).toHaveText('4');

      // AK4: Die Auswahl ändert den Quelltext nicht und markiert nichts.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      expect(fs.readFileSync(datei, 'utf8')).toBe(DASHBOARD);

      // AK5: Eine andere Datei mit neuem Wert erscheint, ohne erneutes Öffnen;
      // die getroffene Auswahl bleibt.
      fs.writeFileSync(path.join(dir, 'Aufgaben', 'E.md'), aufgabe('wartet', 'hoch'), 'utf8');
      await expect(eintraege(status)).toHaveText([ALLE, 'offen', 'wartet', 'zu'], {
        timeout: WARTE_BESTAND_MS,
      });
      await expect(status).toHaveValue('offen');
      await expect(kennzahl(page, 'Gesamt')).toHaveText('5', { timeout: WARTE_BESTAND_MS });
      await expect(kennzahl(page, 'Anzahl')).toHaveText('2');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DF-02: Dashboard-Filter (F-405) — Vorbelegung nach Schließen und erneutem Öffnen', () => {
  test('eine geänderte Auswahl verfällt mit dem Schließen, die Vorbelegung gilt wieder', async () => {
    const dir = makeFixtureDir();
    const datei = path.join(dir, 'Dashboard.md');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      const prio = auswahl(page, 'Priorität');
      await expect(prio).toHaveValue('hoch', { timeout: WARTE_BESTAND_MS });
      await prio.selectOption('niedrig');
      await expect(kennzahl(page, 'Anzahl')).toHaveText('1', { timeout: WARTE_BESTAND_MS });
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);

      // Schließen ohne Rückfrage: Die Auswahl ist keine Bearbeitung.
      await page.locator(SEL.activeTab0).locator('.tab-close').click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(0);

      await oeffneDatei(app, datei);
      await expect(page.locator(SEL.activeTab0)).toContainText('Dashboard');
      await expect(auswahl(page, 'Priorität')).toHaveValue('hoch', { timeout: WARTE_BESTAND_MS });
      await expect(kennzahl(page, 'Anzahl')).toHaveText('3', { timeout: WARTE_BESTAND_MS });
      expect(fs.readFileSync(datei, 'utf8')).toBe(DASHBOARD);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
