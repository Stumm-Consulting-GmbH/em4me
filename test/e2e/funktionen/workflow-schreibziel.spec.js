// 4T-002812 (Epic 3E-000444): E2E-Funktions-Suite — wohin ein Text-Befehl
// eines Workflows schreibt, wenn das Ziel-Dokument im Fenster geöffnet ist
// (AK1 und AK2 des Tasks).
//
// **Der Fehler, den die Datei festhält.** Ein geöffnetes Dokument meldet
// seinen Stand an den Hauptprozess, sobald sein Editor ein Dokument bekommt,
// also schon beim Öffnen und bei jedem Reiter-Wechsel. Bis 4T-002812 galt
// jedes meldende Fenster als Halter des Stands: Ein Text-Befehl an ein
// unverändert geöffnetes Dokument ging ins Fenster statt in die Datei, und das
// Dokument stand danach als ungespeichert da. Seitdem trägt die Meldung das
// Merkmal «ungespeichert»; nur ein Fenster mit ungespeichertem Stand zieht den
// Befehl an.
//
//   WF-ZIEL-01  (AK1) Das Ziel ist unverändert geöffnet: Die Datei wird
//               geschrieben, der Reiter bleibt ohne Ungespeichert-Marke und
//               zeigt den neuen Stand.
//   WF-ZIEL-02  (AK2) Das Ziel ist geändert geöffnet: Der Befehl wirkt im
//               Editor, die Datei bleibt, der Reiter bleibt ungespeichert.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Meldung entsteht im Editor des Anzeige-Prozesses (Doc-Wechsel beim Öffnen),
// das Merkmal reist über die Prozess-Brücke, und das Nachladen des Reiters
// nach dem Schreiben geht über die Datei-Beobachtung. Die Unit-Fälle stellen
// jede dieser Nahtstellen einzeln; erst hier läuft die Kette am Stück.
//
// **Material.** Der Fall legt seinen Bereich selbst an (Muster
// workflow-geteilte-dokumente.spec.js): einen Workflow-Ordner in den
// Einstellungen des Bereichs und ein ungeteiltes Ziel-Dokument.
//
// **Sprachfrei geprüft:** Ergebnis an der Datei, an der Ungespeichert-Marke
// des Reiters und am Editor-Inhalt.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const PANE = '.pane-group[data-pane="0"]';
const ZIEL_TEXT = '# Doku\n\nErster Absatz.\n';

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufräumen darf den Lauf nicht kippen */
  }
}

const WORKFLOW = [
  '---',
  'workflow: true',
  'name: Ziel-Probe',
  '---',
  '',
  '```workflow',
  'append "Notizen/Doku.md" from-section "Ende"',
  '```',
  '',
  '## Ende',
  '',
  'Ende-Probe',
  '',
].join('\n');

// Ein Bereich mit Workflow-Ordner und einem ungeteilten Ziel-Dokument.
function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-ziel-'));
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { workflows: { folder: 'Workflows' } } }, null, 2),
    'utf8',
  );
  fs.mkdirSync(path.join(wurzel, 'Workflows'));
  fs.mkdirSync(path.join(wurzel, 'Notizen'));
  fs.writeFileSync(path.join(wurzel, 'Workflows', 'Ziel-Probe.md'), WORKFLOW, 'utf8');
  fs.writeFileSync(path.join(wurzel, 'Notizen', 'Doku.md'), ZIEL_TEXT, 'utf8');
  return wurzel;
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

// Das Ziel-Dokument öffnen und in der Quelltext-Ansicht zeigen: Sein Editor
// bekommt dabei das Dokument, und das Fenster meldet den Stand (unverändert).
async function oeffneZiel(app, page, ziel) {
  await oeffneDokumentImFenster(app, page, ziel);
  await page.locator(SEL.viewBtn('source')).click();
  await expect(page.locator(SEL.editorContent0)).toContainText('Erster Absatz.');
}

// Den Workflow öffnen und über den Knopf seiner Kopfzeile starten. Das
// Ziel-Dokument bleibt dabei als nicht aktiver Reiter derselben Spalte offen.
async function starteWorkflow(app, page, wurzel) {
  await oeffneDokumentImFenster(app, page, path.join(wurzel, 'Workflows', 'Ziel-Probe.md'));
  await page.locator(SEL.viewBtn('live')).click();
  const kopfzeile = page.locator(`${PANE} .pane-source .cm-wf-kopf`);
  await expect(kopfzeile).toHaveCount(1);
  await expect(kopfzeile.locator('.cm-wf-pruefung-ok')).toHaveCount(1);
  await kopfzeile.locator('.cm-wf-starten').click();
}

async function zeigeZiel(page) {
  await page.locator(SEL.tabs0).filter({ hasText: 'Doku' }).click();
  await expect(page.locator(SEL.activeTab0)).toContainText('Doku');
  await page.locator(SEL.viewBtn('source')).click();
}

test.describe('WF-ZIEL: Schreibziel eines Text-Befehls bei geöffnetem Dokument (4T-002812)', () => {
  test('WF-ZIEL-01: unverändert geöffnet — die Datei wird geschrieben, der Reiter lädt nach und bleibt gespeichert', async () => {
    const wurzel = baueBereich();
    const ziel = path.join(wurzel, 'Notizen', 'Doku.md');
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneZiel(app, page, ziel);
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      await starteWorkflow(app, page, wurzel);

      // Die Datei trägt die Zeile.
      await expect
        .poll(() => fs.readFileSync(ziel, 'utf8'), { timeout: 15000 })
        .toContain('Ende-Probe');
      expect(fs.readFileSync(ziel, 'utf8')).toMatch(/Erster Absatz\.\n\n?Ende-Probe\n?$/);
      // Kein Reiter ist ungespeichert, und das Ziel zeigt den neuen Stand.
      await zeigeZiel(page);
      await expect(page.locator(SEL.editorContent0)).toContainText('Ende-Probe', {
        timeout: 15000,
      });
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });

  test('WF-ZIEL-02: geändert geöffnet — der Befehl wirkt im Editor, die Datei bleibt', async () => {
    const wurzel = baueBereich();
    const ziel = path.join(wurzel, 'Notizen', 'Doku.md');
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneZiel(app, page, ziel);
      // Ungespeichert ändern: eine Zeile am Dateiende (Muster
      // rueckschreib-beobachtung.spec.js).
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
      await page.locator(`${SEL.editorContent0} .cm-line`).last().click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('Getippt');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
      await starteWorkflow(app, page, wurzel);

      // Der Befehl wirkt im ungespeicherten Stand des Reiters.
      await zeigeZiel(page);
      await expect(page.locator(SEL.editorContent0)).toContainText('Ende-Probe', {
        timeout: 15000,
      });
      await expect(page.locator(SEL.editorContent0)).toContainText('Getippt');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
      // Die Datei bleibt, wie sie war.
      expect(fs.readFileSync(ziel, 'utf8')).toBe(ZIEL_TEXT);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
