// 4T-002689 (Epic 3E-000415, Story 4S-001215): E2E-Funktions-Suite — ein von
// Hand gestarteter Workflow hängt an ein in Teile zerlegtes Dokument an, und
// die Zeile steht am Ende des ganzen Dokuments (AK3, AK6 des Tasks).
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Der
// Lauf geht über beide Prozesse: Knopf der Kopfzeile und Lauf-Steuerung im
// Fenster, Schritt-Kanal `workflow:step`, Weiche zum Editor-Puffer und der
// Schreibweg geteilter Dokumente im Hauptprozess. Die Unit-Fälle in
// `test/unit/workflow-geteilte-dokumente.test.js` rufen den Hauptprozess-Teil
// unmittelbar; erst hier läuft die Kette am Stück.
//
// **Material.** Der Fall legt seinen Bereich selbst an (Muster
// workflow-start.spec.js): einen Workflow-Ordner in den Einstellungen des
// Bereichs und ein Dokument aus zwei Teilen, gebaut über die Zuordnungs-Zeile
// des geteilten Moduls. Das Dokument ist in keinem Fenster geöffnet, der
// Schritt nimmt also den Weg über die Platte.
//
// **Sprachfrei geprüft:** Ergebnis an den Dateien.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { writePartLine, PART_SEP, PART_INFIX } = require('../../../src/shared/document-parts.js');

const PANE = '.pane-group[data-pane="0"]';
const ZWEITER = `Doku${PART_SEP}${PART_INFIX}00002.md`;

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

const WORKFLOW = [
  '---',
  'workflow: true',
  'name: Teil-Probe',
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

// Ein Bereich mit Workflow-Ordner und einem Dokument aus zwei Teilen.
function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-teile-'));
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { workflows: { folder: 'Workflows' } } }, null, 2),
    'utf8',
  );
  fs.mkdirSync(path.join(wurzel, 'Workflows'));
  fs.mkdirSync(path.join(wurzel, 'Notizen'));
  fs.writeFileSync(path.join(wurzel, 'Workflows', 'Teil-Probe.md'), WORKFLOW, 'utf8');
  const teil = (rumpf, index) => writePartLine(rumpf, { index, base: 'Doku' }).text;
  fs.writeFileSync(path.join(wurzel, 'Notizen', 'Doku.md'), teil('# Anfang\n\nErster Teil.\n', 1));
  fs.writeFileSync(path.join(wurzel, 'Notizen', ZWEITER), teil('# Mitte\n\nZweiter Teil.\n', 2));
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

test.describe('WF-TEILE-01: Text-Befehl an einem geteilten Dokument (4T-002689)', () => {
  test('append aus der Kopfzeile landet am Ende des letzten Teils, der erste bleibt', async () => {
    const wurzel = baueBereich();
    const kopf = path.join(wurzel, 'Notizen', 'Doku.md');
    const zweiter = path.join(wurzel, 'Notizen', ZWEITER);
    const kopfVorher = fs.readFileSync(kopf, 'utf8');
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokumentImFenster(app, page, path.join(wurzel, 'Workflows', 'Teil-Probe.md'));
      await page.locator(SEL.viewBtn('live')).click();
      const kopfzeile = page.locator(`${PANE} .pane-source .cm-wf-kopf`);
      await expect(kopfzeile).toHaveCount(1);
      await expect(kopfzeile.locator('.cm-wf-pruefung-ok')).toHaveCount(1);
      await kopfzeile.locator('.cm-wf-starten').click();

      await expect.poll(() => fs.readFileSync(zweiter, 'utf8')).toContain('Ende-Probe');
      expect(fs.readFileSync(zweiter, 'utf8')).toMatch(/Zweiter Teil\.\n\n?Ende-Probe\n?$/);
      expect(fs.readFileSync(kopf, 'utf8')).toBe(kopfVorher);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
