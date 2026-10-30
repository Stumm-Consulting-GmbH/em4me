// 4T-002423 (Epic 3E-000366): E2E-Funktions-Suite — das Statusleisten-Element
// «Workflows» an der gestarteten Anwendung (Story 4S-001134, AK3 und AK4 des
// Tasks).
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Das
// Element liest über den Kanal `workflow:runs` den Scharf-Zustand gegen den
// aktuellen Text und den Lauf-Stand aus der Begleitdatei, zieht nach einem
// Lauf nach Zeitplan im Fenster nach und steht in der ausgelieferten Leiste;
// die Unit-Fälle sehen je eine Seite mit Attrappe.
//
// WF-SB-01: Ein scharfer Workflow mit einem Termin in der Vergangenheit läuft
//           beim Öffnen des Bereichs nach (Herkunft `catch-up`, ein Lauf nach
//           Zeitplan). Danach steht das Element mit Ergebnis-Zeichen, Name und
//           Uhrzeit; ein Klick öffnet die Seite «Workflow-Läufe». Ist der
//           Workflow nicht mehr scharf, verschwindet das Element beim nächsten
//           Nachziehen (hier: das Fenster bekommt den Fokus).
//
// Die Scharf-Schaltung steht wie in workflow-zeitplan.spec.js in der
// Begleitdatei (Prüfsumme über die Definition), damit der Fall nicht an den
// Bedienorten der Scharf-Schaltung hängt. Sprachfrei geprüft: Zeichen, Name
// und Uhrzeit im Element, die Seite über ihre Klasse.
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

const PANE = '.pane-group[data-pane="0"]';
const SEITE = `${PANE} .pane-system .wf-runs-page`;
const ELEMENT = '#statusbar-workflows';
const ZIEL = 'Leisten-Probe-Ziel.md';
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
  'name: Leisten-Probe',
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

function begleitPfad(workflow) {
  return path.join(path.dirname(workflow), 'Leisten-Probe.mdd');
}

// Ein Bereich mit dem scharfen Workflow, Termin in der Vergangenheit.
function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-leiste-'));
  fs.mkdirSync(path.join(wurzel, 'Workflows'));
  const workflow = path.join(wurzel, 'Workflows', 'Leisten-Probe.md');
  fs.writeFileSync(workflow, WORKFLOW, 'utf8');
  fs.writeFileSync(path.join(wurzel, ZIEL), '', 'utf8');
  const container = mddStore.emptyContainer();
  mddStore.setWorkflowArmed(container, { hash: definitionsPruefsumme(WORKFLOW) }, Date.now());
  mddStore.setWorkflowNextDue(container, '2020-01-01T08:00');
  fs.writeFileSync(begleitPfad(workflow), mddStore.serializeContainer(container), 'utf8');
  return { wurzel, workflow };
}

function laufStand(workflow) {
  try {
    const parsed = mddStore.parseContainer(fs.readFileSync(begleitPfad(workflow), 'utf8'));
    return parsed.ok ? mddStore.getWorkflowRun(parsed.container) : null;
  } catch {
    return null;
  }
}

function entschaerfe(workflow) {
  const parsed = mddStore.parseContainer(fs.readFileSync(begleitPfad(workflow), 'utf8'));
  mddStore.setWorkflowArmed(parsed.container, null);
  fs.writeFileSync(begleitPfad(workflow), mddStore.serializeContainer(parsed.container), 'utf8');
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

test.describe('WF-SB: Statusleisten-Element «Workflows» (4T-002423)', () => {
  test('WF-SB-01: zeigt den Lauf nach Zeitplan, öffnet die Seite, verschwindet ohne scharfen Workflow', async () => {
    test.setTimeout(120000);
    const { wurzel, workflow } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await warteAufRendererBereit(page);
      await bindeBereich(page, wurzel);
      // Der nachgeholte Lauf ist verbucht ...
      await expect
        .poll(() => {
          const stand = laufStand(workflow);
          return stand && stand.lastRun ? stand.lastRun.origin : null;
        }, TAKT_ZEIT)
        .toBe('catch-up');
      // ... und das Element zeigt ihn mit Zeichen, Name und Uhrzeit.
      const element = page.locator(ELEMENT);
      await expect(element).toBeVisible(TAKT_ZEIT);
      await expect(element).toHaveText(/^✓ Leisten-Probe \d{2}:\d{2}$/);
      await expect(element).toHaveAttribute('data-status', 'ok');

      await element.click();
      await expect(page.locator(SEITE)).toBeVisible();

      // Nicht mehr scharf: Beim nächsten Nachziehen verschwindet das Element.
      entschaerfe(workflow);
      await expect
        .poll(async () => {
          await page.evaluate(() => window.dispatchEvent(new Event('focus')));
          return element.isHidden();
        }, TAKT_ZEIT)
        .toBe(true);
    } finally {
      await closeApp(app, userData);
      removeDir(wurzel);
    }
  });
});
