// 4T-002422 (Epic 3E-000366): E2E-Funktions-Suite — die Scharf-Schaltung auf
// der Seite «Workflow-Läufe» in der realen Anordnung (Story 4S-001133, AK1,
// AK3 und AK5 des Tasks).
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Kette reicht über beide Prozesse: Schalter auf der Seite, Kommando im
// Fenster, Kanal `workflow:setArmed` mit Prüfen vor Laufen, Prüfsumme und
// erstem Termin, Lauf-Stand in der Begleitdatei, Lese-Kanal `workflow:runs`
// mit dem Zustand gegen den aktuellen Text und das Nachziehen der Seite. Kein
// jsdom-Fall sieht diese Kette am Stück.
//
// **Gemessen** wird: Scharf schalten auf der Seite, die Spalte «Scharf» zeigt
// den Schalter an, «Nächster Lauf» nennt den Termin 23:00 und die Begleitdatei
// trägt den Scharf-Zustand; nach einer Änderung im Block zeigt die Seite
// «Definition geändert» ohne nächsten Lauf; erneutes Scharf-Schalten und
// Entschärfen wirken über denselben Schalter.
//
// **Sprachfrei geprüft**, wo die Anwendung übersetzt: Zellen über ihre Klassen,
// der Termin über die Uhrzeit.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, warteAufRendererBereit } = require('../helpers/app');

const PANE = '.pane-group[data-pane="0"]';
const SEITE = `${PANE} .pane-system .wf-runs-page`;

function tmpDir(praefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), praefix));
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

const workflow = (meldung) =>
  [
    '---',
    'workflow: true',
    'name: Scharf-Probe',
    'trigger: schedule',
    'schedule: every day at 23:00',
    '---',
    '',
    '```workflow',
    `notify "${meldung}"`,
    '```',
    '',
  ].join('\n');

function baueBereich() {
  const wurzel = tmpDir('em4me-wf-scharf-');
  fs.mkdirSync(path.join(wurzel, 'Workflows'));
  fs.writeFileSync(
    path.join(wurzel, 'Workflows', 'Scharf-Probe.md'),
    workflow('Scharf-Probe'),
    'utf8',
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

test.describe('WF-SCHARF-01: Scharf-Schaltung auf der Seite «Workflow-Läufe» (4T-002422)', () => {
  test('scharf schalten, nächster Lauf, Definition geändert, erneut scharf, entschärfen', async () => {
    const wurzel = baueBereich();
    const datei = path.join(wurzel, 'Workflows', 'Scharf-Probe.md');
    const begleitdatei = path.join(wurzel, 'Workflows', 'Scharf-Probe.mdd');
    const { app, page, userData } = await launchApp();
    try {
      await warteAufRendererBereit(page);
      await bindeBereich(page, wurzel);
      const seite = page.locator(SEITE);
      await page.evaluate(() =>
        document.dispatchEvent(
          new CustomEvent('scg:open-system-page', { detail: { pageId: 'workflow-runs' } }),
        ),
      );
      await expect(seite).toBeVisible();
      const aktualisieren = page.locator(`${SEITE} .wf-runs-refresh`);
      await expect
        .poll(
          async () => {
            if (await aktualisieren.isEnabled()) await aktualisieren.click();
            return seite.locator('.wf-runs-name').count();
          },
          { timeout: 20000 },
        )
        .toBe(1);

      const zeile = seite.locator('tr', {
        has: page.locator('.wf-runs-name', { hasText: 'Scharf-Probe' }),
      });
      const schalter = zeile.locator('.wf-runs-arm');
      const naechster = zeile.locator('.wf-runs-next');

      // Vor der Scharf-Schaltung: Schalter aus, kein nächster Lauf.
      await expect(schalter).not.toBeChecked();
      await expect(naechster).toHaveText('');

      // Scharf schalten auf der Seite (AK1): Spalte zeigt es, Termin erscheint.
      await schalter.check();
      await expect(zeile.locator('.wf-runs-arm')).toBeChecked();
      await expect(zeile.locator('.wf-runs-next')).toContainText('23:00');
      await expect(zeile.locator('.wf-runs-armed')).toHaveAttribute('data-status', 'armed');
      // Der Scharf-Zustand liegt in der Begleitdatei, mit Prüfsumme und Termin.
      const stand = JSON.parse(fs.readFileSync(begleitdatei, 'utf8'));
      expect(stand.workflow.armed.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(stand.workflow.nextDue).toMatch(/T23:00$/);

      // Änderung im Block: «nicht scharf: Definition geändert», kein nächster Lauf (AK3).
      fs.writeFileSync(datei, workflow('Scharf-Probe geändert'), 'utf8');
      await aktualisieren.click();
      await expect(zeile.locator('.wf-runs-armed')).toHaveAttribute(
        'data-status',
        'definitionChanged',
      );
      await expect(zeile.locator('.wf-runs-armed-changed')).toBeVisible();
      await expect(zeile.locator('.wf-runs-arm')).not.toBeChecked();
      await expect(zeile.locator('.wf-runs-next')).toHaveText('');

      // Erneut scharf schalten, danach entschärfen (AK5): beides am selben Schalter.
      await zeile.locator('.wf-runs-arm').check();
      await expect(zeile.locator('.wf-runs-armed')).toHaveAttribute('data-status', 'armed');
      await expect(zeile.locator('.wf-runs-next')).toContainText('23:00');
      await zeile.locator('.wf-runs-arm').uncheck();
      await expect(zeile.locator('.wf-runs-armed')).toHaveAttribute('data-status', 'notArmed');
      await expect(zeile.locator('.wf-runs-next')).toHaveText('');
      // Der Start von Hand bleibt.
      await expect(zeile.locator('.wf-runs-start')).toBeVisible();
    } finally {
      await closeApp(app, userData);
      removeDir(wurzel);
    }
  });
});
