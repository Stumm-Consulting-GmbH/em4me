// 4T-002813 (Epic 3E-000444): E2E-Funktions-Suite — ein von Hand gestarteter
// Workflow hakt mit `complete-task` eine Aufgabe in einem späteren Teil eines
// in Teile zerlegten Dokuments ab, das in keinem Fenster geöffnet ist.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Der
// Lauf geht über beide Prozesse: Der Befehl findet die Aufgabe im
// Hauptprozess und antwortet mit dem Fenster-Handgriff `completeTask` (Pfad der
// Kopf-Datei, Zeile des ganzen Dokuments); das Fenster schaltet die Zeile wie
// in der Aufgaben-Abfrage um und schreibt sie, weil das Dokument nicht offen
// ist, über den Kanal `task:applyLineEdit` zurück. Die Unit-Fälle in
// `test/unit/aufgaben-zeile-geteilt.test.js` rufen den Kanal unmittelbar; erst
// hier läuft die Kette am Stück. Bis 4T-002813 las der Kanal allein die
// Kopf-Datei, und der Schritt scheiterte am Konflikt.
//
// **Material.** Der Fall legt seinen Bereich selbst an (Muster
// workflow-geteilte-dokumente.spec.js): einen Workflow-Ordner in den
// Einstellungen des Bereichs und ein Dokument aus zwei Teilen, gebaut über die
// Zuordnungs-Zeile des geteilten Moduls.
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
  'name: Abhak-Probe',
  '---',
  '',
  '```workflow',
  'complete-task "Notizen/Doku.md" "Milch holen"',
  '```',
  '',
].join('\n');

// Ein Bereich mit Workflow-Ordner und einem Dokument aus zwei Teilen; die
// Aufgabe liegt im zweiten Teil.
function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-abhaken-teile-'));
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { workflows: { folder: 'Workflows' } } }, null, 2),
    'utf8',
  );
  fs.mkdirSync(path.join(wurzel, 'Workflows'));
  fs.mkdirSync(path.join(wurzel, 'Notizen'));
  fs.writeFileSync(path.join(wurzel, 'Workflows', 'Abhak-Probe.md'), WORKFLOW, 'utf8');
  const teil = (rumpf, index) => writePartLine(rumpf, { index, base: 'Doku' }).text;
  fs.writeFileSync(
    path.join(wurzel, 'Notizen', 'Doku.md'),
    teil('# Anfang\n\n- [ ] Brot kaufen\n', 1),
  );
  fs.writeFileSync(
    path.join(wurzel, 'Notizen', ZWEITER),
    teil('# Mitte\n\n- [ ] Milch holen\n', 2),
  );
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

test.describe('ABHAKEN-TEILE-01: complete-task an einem geteilten Dokument (4T-002813)', () => {
  test('hakt die Aufgabe im zweiten Teil ab, die Kopf-Datei bleibt', async () => {
    const wurzel = baueBereich();
    const kopf = path.join(wurzel, 'Notizen', 'Doku.md');
    const zweiter = path.join(wurzel, 'Notizen', ZWEITER);
    const kopfVorher = fs.readFileSync(kopf, 'utf8');
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokumentImFenster(app, page, path.join(wurzel, 'Workflows', 'Abhak-Probe.md'));
      await page.locator(SEL.viewBtn('live')).click();
      const kopfzeile = page.locator(`${PANE} .pane-source .cm-wf-kopf`);
      await expect(kopfzeile).toHaveCount(1);
      await expect(kopfzeile.locator('.cm-wf-pruefung-ok')).toHaveCount(1);
      await kopfzeile.locator('.cm-wf-starten').click();

      await expect.poll(() => fs.readFileSync(zweiter, 'utf8')).toContain('- [x] Milch holen');
      expect(fs.readFileSync(zweiter, 'utf8')).not.toContain('- [ ] Milch holen');
      expect(fs.readFileSync(kopf, 'utf8')).toBe(kopfVorher);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
