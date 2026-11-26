// 4T-002620 (Epic 3E-000445): E2E-Funktions-Suite — der Skript-Schritt eines
// Workflows an der gestarteten Anwendung (Zusicherung von 4T-002465, AK5,
// Story 4S-001149).
//
// **Warum es diese Fälle geben muss, obwohl die Unit-Fälle grün sind.** Die
// Unit-Prüfung test/unit/renderer/workflow-skript-schritt.test.js ersetzt die
// Sandbox durch eine Attrappe, die Sandbox selbst belegt
// test/unit/script-sandbox-runtime.test.js. Erst hier läuft die Kette am Stück:
// Prüfung im Fenster mit der Einstellung «Skript-Blöcke ausführen», Lauf aus
// dem Knopf der Kopfzeile, Skript-Block der Workflow-Datei in der echten
// Sandbox, Ergebnis in den folgenden Zeilen und als Bedingung, Datei-Schritte
// im Hauptprozess.
//
// WF-SKRIPT-01: Einstellung an. `script … as` liefert 42 in den Namen einer
//   neu angelegten Datei; `if-script` trifft bei einem nicht leeren Text zu und
//   bei `false` nicht, jeweils mit `else`. Der Lauf endet mit «ok».
// WF-SKRIPT-02: Einstellung aus (Vorgabe). Die Prüfung meldet den Befund zur
//   ausgeschalteten Einstellung, und der Knopf «Starten» ist gesperrt. Dass ein
//   Lauf bei ausgeschalteter Einstellung nicht schreibt, belegt die Unit-Prüfung
//   des Skript-Schritts; der gesperrte Knopf bietet hier keinen Startweg.
//
// **Ergebnisse sprachfrei geprüft** an den Dateien und am Lauf-Stand der
// Begleitdatei, die Kopfzeile über ihre Klassen; den Befund nennt der Text der
// deutschen Fassung, in der die Anwendung im Test läuft.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const mddStore = require('../../../src/main/documents/mdd-store.js');
const DE_WORKFLOWS = require('../../../src/i18n/fragments/de/workflows.json');

const PANE = '.pane-group[data-pane="0"]';

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

const skript = (zeilen) => ['```perspective-script', ...zeilen, '```'].join('\n');

const WORKFLOW = [
  '---',
  'workflow: true',
  'name: Skript-Probe',
  '---',
  '',
  '```workflow',
  'mkdir "Ergebnis"',
  'script "Rechnung" as "wert"',
  'create "Ergebnis/Wert-{{script:wert}}.md"',
  'if-script "Ja"',
  '  create "Ergebnis/Ja.md"',
  'else',
  '  create "Ergebnis/Ja-falsch.md"',
  'end',
  'if-script "Nein"',
  '  create "Ergebnis/Nein-falsch.md"',
  'else',
  '  create "Ergebnis/Nein.md"',
  'end',
  '```',
  '',
  '## Rechnung',
  '',
  skript(['return 6 * 7;']),
  '',
  '## Ja',
  '',
  skript(["return 'ja';"]),
  '',
  '## Nein',
  '',
  skript(['return false;']),
  '',
].join('\n');

function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-skript-'));
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { workflows: { folder: 'Workflows' } } }),
    'utf8',
  );
  fs.mkdirSync(path.join(wurzel, 'Workflows'));
  const datei = path.join(wurzel, 'Workflows', 'Skript-Probe.md');
  fs.writeFileSync(datei, WORKFLOW, 'utf8');
  return { wurzel, datei, begleitdatei: path.join(wurzel, 'Workflows', 'Skript-Probe.mdd') };
}

// Profil mit eingeschalteter Einstellung «Skript-Blöcke ausführen» (Muster
// skript-bloecke.spec.js: electron-store liest config.json aus userData).
function profilMitSkripten() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-skript-profil-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ scripts: { run: true } }));
  return dir;
}

function laufStand(begleitdatei) {
  try {
    const parsed = mddStore.parseContainer(fs.readFileSync(begleitdatei, 'utf8'));
    return parsed.ok ? mddStore.getWorkflowRun(parsed.container) : null;
  } catch {
    return null;
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

async function oeffneLive(app, page, datei) {
  await oeffneDokumentImFenster(app, page, datei);
  await page.locator(SEL.viewBtn('live')).click();
  const kopf = page.locator(`${PANE} .pane-source .cm-wf-kopf`);
  await expect(kopf).toHaveCount(1);
  return kopf;
}

test.describe('WF-SKRIPT: Skript-Schritt in einem Workflow-Lauf (4T-002620)', () => {
  test('WF-SKRIPT-01: Ergebnis in der folgenden Zeile und als Bedingung', async () => {
    const { wurzel, datei, begleitdatei } = baueBereich();
    const profil = profilMitSkripten();
    const { app, page, userData } = await launchApp({ userData: profil });
    try {
      await bindeBereich(page, wurzel);
      const kopf = await oeffneLive(app, page, datei);
      await expect(kopf.locator('.cm-wf-pruefung-ok')).toHaveCount(1);
      const knopf = kopf.locator('.cm-wf-starten');
      await expect(knopf).toBeEnabled();
      await knopf.click();

      await expect.poll(() => (laufStand(begleitdatei) || {}).runs || 0).toBe(1);
      expect(laufStand(begleitdatei).lastRun).toMatchObject({ status: 'ok', origin: 'manual' });
      expect(fs.readdirSync(path.join(wurzel, 'Ergebnis')).sort()).toEqual([
        'Ja.md',
        'Nein.md',
        'Wert-42.md',
      ]);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
      removeDir(profil);
    }
  });

  test('WF-SKRIPT-02: Einstellung aus, die Prüfung sperrt den Start', async () => {
    const { wurzel, datei, begleitdatei } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      const kopf = await oeffneLive(app, page, datei);
      await expect(kopf.locator('.cm-wf-starten')).toBeDisabled();
      await expect(kopf.locator('.cm-wf-pruefung-ok')).toHaveCount(0);
      // Die Sperre kommt von der ausgeschalteten Einstellung: Der Befund steht
      // in der Liste der Prüfung (Titel der Anzeige).
      const befund = kopf.locator('.cm-wf-pruefung-befund');
      await expect(befund).toHaveCount(1);
      expect(await befund.getAttribute('title')).toContain(
        DE_WORKFLOWS['workflow.befund.scriptsDisabled'],
      );
      expect((laufStand(begleitdatei) || {}).runs || 0).toBe(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
