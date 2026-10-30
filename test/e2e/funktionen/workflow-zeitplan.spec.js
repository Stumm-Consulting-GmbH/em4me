// 4T-002421 (Epic 3E-000366): E2E-Funktions-Suite — Lauf nach Zeitplan an der
// gestarteten Anwendung (Story 4S-001132, AK1 und AK3 des Tasks).
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Kette reicht über beide Prozesse und über mehrere Fenster: Zeitplan-Prüfer im
// Hauptprozess, Zustell-Register an alle Fenster, Anspruch genau eines Fensters,
// Lauf im Fenster, Schritt im Hauptprozess, Lauf-Stand in der Begleitdatei und
// das Fortschreiben von `nextDue`. Die Unit-Fälle sehen je eine Seite.
//
// **Die Uhr wird nicht gestellt**, weil die Anwendung keinen Weg dafür hat;
// gestellt wird der Termin in der Begleitdatei:
//
// WF-ZEIT-01: Ein scharfer Workflow mit einem Termin in der Vergangenheit läuft
//             beim Öffnen des Bereichs sofort genau einmal nach, mit der Herkunft
//             `catch-up`, und der Termin rückt in die Zukunft (AK2 der Story).
// WF-ZEIT-02: Zwei Fenster desselben Bereichs. Der Workflow ist scharf ohne
//             Termin; die erste Prüfung setzt ihn (Beleg, dass der Bereich unter
//             Beobachtung steht). Danach wird der Termin auf die laufende Minute
//             gesetzt; der nächste Takt (höchstens 30 Sekunden) startet genau
//             einen Lauf mit der Herkunft `schedule`, Zähler 1 (AK1, AK3).
//
// Sprachfrei geprüft: Dateien auf der Platte und Begleitdatei; der Hinweis der
// Statusleiste über den Namen des Workflows.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, warteAufRendererBereit } = require('../helpers/app');
const mddStore = require('../../../src/main/documents/mdd-store.js');
const {
  definitionsPruefsumme,
} = require('../../../src/main/workflows/workflow-definition-hash.js');
const { localNowString } = require('../../../src/shared/reminders.js');

const ZIEL = 'Zeitplan-Probe-Ziel.md';
const TAKT_ZEIT = { timeout: 75000 };

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
  'name: Zeitplan-Probe',
  'trigger: schedule',
  'schedule: every 2 hours',
  '---',
  '',
  '## Eintrag',
  '',
  'Lauf',
  '',
  '```workflow',
  `append "${ZIEL}" from-section "Eintrag"`,
  '```',
  '',
].join('\n');

// Ein Bereich mit dem Workflow, einer leeren Ziel-Datei und dem Lauf-Stand.
function baueBereich(nextDue) {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-zeitplan-'));
  fs.mkdirSync(path.join(wurzel, 'Workflows'));
  const workflow = path.join(wurzel, 'Workflows', 'Zeitplan-Probe.md');
  fs.writeFileSync(workflow, WORKFLOW, 'utf8');
  fs.writeFileSync(path.join(wurzel, ZIEL), '', 'utf8');
  const container = mddStore.emptyContainer();
  mddStore.setWorkflowArmed(container, { hash: definitionsPruefsumme(WORKFLOW) }, Date.now());
  if (nextDue) mddStore.setWorkflowNextDue(container, nextDue);
  fs.writeFileSync(begleitPfad(workflow), mddStore.serializeContainer(container), 'utf8');
  return { wurzel, workflow };
}

function begleitPfad(workflow) {
  return path.join(path.dirname(workflow), 'Zeitplan-Probe.mdd');
}

function laufStand(workflow) {
  try {
    const parsed = mddStore.parseContainer(fs.readFileSync(begleitPfad(workflow), 'utf8'));
    return parsed.ok ? mddStore.getWorkflowRun(parsed.container) : null;
  } catch {
    return null;
  }
}

function setzeTermin(workflow, nextDue) {
  const parsed = mddStore.parseContainer(fs.readFileSync(begleitPfad(workflow), 'utf8'));
  mddStore.setWorkflowNextDue(parsed.container, nextDue);
  fs.writeFileSync(begleitPfad(workflow), mddStore.serializeContainer(parsed.container), 'utf8');
}

const zeilenLauf = (wurzel) =>
  fs
    .readFileSync(path.join(wurzel, ZIEL), 'utf8')
    .split(/\r?\n/)
    .filter((z) => z.trim() === 'Lauf').length;

async function bindeBereich(page, wurzel) {
  await expect
    .poll(async () => {
      const ergebnis = await page.evaluate((p) => window.api.openAreaPath(p), wurzel);
      return !!(ergebnis && ergebnis.ok !== false);
    })
    .toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
}

test.describe('WF-ZEIT: Lauf nach Zeitplan (4T-002421)', () => {
  test('WF-ZEIT-01: verpasster Termin läuft beim Öffnen des Bereichs genau einmal nach', async () => {
    const { wurzel, workflow } = baueBereich('2020-01-01T08:00');
    const { app, page, userData } = await launchApp();
    try {
      await warteAufRendererBereit(page);
      await bindeBereich(page, wurzel);
      await expect.poll(() => zeilenLauf(wurzel), TAKT_ZEIT).toBe(1);
      await expect
        .poll(() => {
          const stand = laufStand(workflow);
          return stand && stand.nextDue > localNowString(new Date());
        }, TAKT_ZEIT)
        .toBe(true);
      const stand = laufStand(workflow);
      expect(stand.runs).toBe(1);
      expect(stand.lastRun).toMatchObject({ status: 'ok', origin: 'catch-up' });
      expect(stand.lastRun.journal).toEqual([{ line: 13, command: 'append', path: ZIEL }]);
      // Das startende Fenster meldet den nachgeholten Lauf mit seinem Namen.
      await expect(page.locator('#statusbar-hint')).toContainText('Zeitplan-Probe');
      expect(zeilenLauf(wurzel)).toBe(1);
    } finally {
      await closeApp(app, userData);
      removeDir(wurzel);
    }
  });

  test('WF-ZEIT-02: zur Fälligkeit genau ein Lauf, auch bei zwei Fenstern des Bereichs', async () => {
    test.setTimeout(150000);
    const { wurzel, workflow } = baueBereich(null);
    const { app, page, userData } = await launchApp();
    try {
      await warteAufRendererBereit(page);
      await bindeBereich(page, wurzel);
      // Zweites Fenster derselben Applikation, also desselben Bereichs.
      const neu = app.waitForEvent('window');
      await page.evaluate(() => window.api.openNewWindow([], null));
      const zweites = await neu;
      await zweites.waitForLoadState('domcontentloaded');
      await expect.poll(() => zweites.title()).toContain('(Bereich');
      // Die erste Prüfung des Bereichs setzt den fehlenden Termin.
      await expect.poll(() => !!(laufStand(workflow) || {}).nextDue, TAKT_ZEIT).toBe(true);
      expect(zeilenLauf(wurzel)).toBe(0);

      const termin = localNowString(new Date());
      setzeTermin(workflow, termin);
      await expect.poll(() => zeilenLauf(wurzel), TAKT_ZEIT).toBe(1);
      // Das Ende des Laufs schreibt den nächsten Termin fort (AK6 des Tasks).
      await expect
        .poll(() => {
          const stand = laufStand(workflow);
          return stand && stand.nextDue > termin;
        }, TAKT_ZEIT)
        .toBe(true);
      const stand = laufStand(workflow);
      expect(stand.runs).toBe(1);
      expect(stand.lastRun).toMatchObject({ status: 'ok', origin: 'schedule' });
      expect(zeilenLauf(wurzel)).toBe(1);
    } finally {
      await closeApp(app, userData);
      removeDir(wurzel);
    }
  });
});
