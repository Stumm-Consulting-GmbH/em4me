// 4T-002350 (Epic 3E-000184): E2E-Funktions-Suite — die Seite «Workflow-Läufe»
// in der realen Anordnung (Story 4S-001106, AK2 und AK3 des Tasks).
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Seite ist ein neu eingeführtes, dauerhaft sichtbares Bedienelement; die
// Entwicklungsrichtlinien (Kapitel 10) verlangen dafür einen Fall, der sie
// sichtbar rendert. Und die Kette, die sie trägt, reicht über beide Prozesse:
// Knopf «Starten» auf der Seite, Lauf im Fenster, Schritte im Hauptprozess,
// Lauf-Stand in der Begleitdatei, Index-Sicht und Lese-Kanal, Nachziehen der
// Seite. Kein jsdom-Fall sieht diese Kette am Stück.
//
// **Gemessen** wird der Abbruch im dritten Schritt: Die beiden ersten Schritte
// sind ausgeführt (Dateien auf der Platte), die Statusleiste nennt die Zeile
// des dritten Schritts im Dokument, und die Seite zeigt für diesen Workflow
// dieselbe Zeile, den Zähler 1 und daneben einen nie gelaufenen Workflow ohne
// letzten Lauf. Der Eintrag im Ansichtsmenü entsteht mit dem Menü der Workflows
// (4T-002355) und wird dort geprüft; hier öffnet das Kommando die Seite.
//
// **Sprachfrei geprüft**, wo die Anwendung übersetzt: Zeilen über ihre Klassen
// und den Pfad, die Zeile als Zahl im Text.
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

// Ein Bereich mit zwei Workflows: «Abbruch» legt zwei Dateien an und öffnet
// dann eine, die es nicht gibt (Zeile 9 im Dokument), «Ruhig» ist nie gelaufen.
function baueBereich() {
  const wurzel = tmpDir('em4me-wf-laeufe-');
  const workflow = (name, zeilen) =>
    ['---', 'workflow: true', `name: ${name}`, '---', '', '```workflow', ...zeilen, '```', ''].join(
      '\n',
    );
  fs.mkdirSync(path.join(wurzel, 'Workflows'));
  fs.writeFileSync(
    path.join(wurzel, 'Workflows', 'Abbruch.md'),
    workflow('Abbruch', [
      'create "Workflow-Test-1.md"',
      'create "Workflow-Test-2.md"',
      'open "Workflow-Fehlt.md"',
    ]),
    'utf8',
  );
  fs.writeFileSync(path.join(wurzel, 'Ruhig.md'), workflow('Ruhig', ['notify "still"']), 'utf8');
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

test.describe('WF-LAEUFE-01: Seite «Workflow-Läufe» (4T-002350)', () => {
  test('Abbruch im dritten Schritt: Statusleiste und Seite zeigen dieselbe Zeile', async () => {
    const wurzel = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      // Die Seite meldet sich erst im Verlauf der Fenster-Initialisierung an
      // (initWorkflowLaeufe, gerufen aus initMacros); ein Öffnen davor verpufft.
      // Deshalb erst auf das Bereit-Zeichen des Renderers warten (Befund des
      // Epic-Abschluss-Tests vom 2026-10-23).
      await warteAufRendererBereit(page);
      await bindeBereich(page, wurzel);
      // Die Seite über ihre Kennung öffnen (Verdrahtung scg:open-system-page).
      const seite = page.locator(SEITE);
      await page.evaluate(() =>
        document.dispatchEvent(
          new CustomEvent('scg:open-system-page', { detail: { pageId: 'workflow-runs' } }),
        ),
      );
      await expect(seite).toBeVisible();
      // Die Liste kommt aus dem Index, deshalb das großzügige Zeitlimit; solange
      // er noch aufbaut, holt «Aktualisieren» den Stand neu. Geklickt wird nur
      // der freie Knopf, damit ein laufender Abruf den Poll nicht blockiert.
      const aktualisieren = page.locator(`${SEITE} .wf-runs-refresh`);
      await expect
        .poll(
          async () => {
            if (await aktualisieren.isEnabled()) await aktualisieren.click();
            return seite.locator('.wf-runs-name').count();
          },
          { timeout: 20000 },
        )
        .toBe(2);

      // Vor dem Lauf: beide ohne letzten Lauf, Zähler 0.
      const zeileAbbruch = seite.locator('tr', {
        has: page.locator('.wf-runs-name', { hasText: 'Abbruch' }),
      });
      const zeileRuhig = seite.locator('tr', {
        has: page.locator('.wf-runs-name', { hasText: 'Ruhig' }),
      });
      await expect(zeileAbbruch.locator('.wf-runs-count')).toHaveText('0');
      await expect(zeileAbbruch.locator('.wf-runs-never')).toHaveCount(1);

      // Knopf «Starten» der Zeile (AK4 des Tasks).
      await zeileAbbruch.locator('.wf-runs-start').click();

      // Statusleiste: Abbruch mit der Zeile des dritten Schritts.
      const hinweis = page.locator('#statusbar-hint');
      await expect(hinweis).toHaveClass(/visible/);
      await expect(hinweis).toContainText('9');
      await expect(hinweis).toHaveClass(/error/);

      // Die beiden ersten Schritte sind ausgeführt.
      await expect.poll(() => fs.existsSync(path.join(wurzel, 'Workflow-Test-1.md'))).toBe(true);
      await expect.poll(() => fs.existsSync(path.join(wurzel, 'Workflow-Test-2.md'))).toBe(true);

      // Die Seite zieht nach: Zähler 1, Ergebnis mit derselben Zeile, als Abbruch markiert.
      await expect(zeileAbbruch.locator('.wf-runs-count')).toHaveText('1');
      const ergebnis = zeileAbbruch.locator('.wf-runs-result');
      await expect(ergebnis).toHaveAttribute('data-status', 'failed');
      await expect(ergebnis).toContainText('9');
      await expect(zeileAbbruch.locator('.wf-runs-time')).not.toHaveText('');
      // Derselbe Grund wie im Hinweis: Der Text der Seite steht am Ende des Hinweises.
      const textSeite = (await ergebnis.textContent()).trim();
      const textHinweis = (await hinweis.textContent()).trim();
      const grundSeite = textSeite.slice(textSeite.indexOf('9'));
      expect(textHinweis.endsWith(grundSeite)).toBe(true);

      // Der nie gelaufene Workflow steht weiter ohne letzten Lauf.
      await expect(zeileRuhig.locator('.wf-runs-count')).toHaveText('0');
      await expect(zeileRuhig.locator('.wf-runs-never')).toHaveCount(1);

      // Der Lauf-Stand liegt in der Begleitdatei, nicht im Text der Workflow-Datei.
      const begleit = JSON.parse(
        fs.readFileSync(path.join(wurzel, 'Workflows', 'Abbruch.mdd'), 'utf8'),
      );
      expect(begleit.workflow).toMatchObject({ runs: 1, lastRun: { status: 'failed', line: 9 } });
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
