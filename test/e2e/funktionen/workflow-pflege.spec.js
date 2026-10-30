// 4T-002424 (Epic 3E-000366): E2E-Funktions-Suite — Pflege-Befehle der
// Workflows an der gestarteten Anwendung: die eine Bestätigung vor einem Lauf
// mit `delete` und die Frage von `confirm` (Story 4S-001135, Regeln P1 und P4
// der Konzept-Runde 4T-002418).
//
// **Warum es diese Fälle geben muss, obwohl die Unit-Fälle grün sind.** Der
// Dialog ist der vorhandene Bestätigungs-Dialog der Anwendung im Fenster, der
// Papierkorb ein Aufruf im Hauptprozess; die jsdom-Fälle ersetzen jeweils den
// Nachbarn durch eine Attrappe. Erst hier läuft die Kette am Stück: Knopf über
// dem Block, Vorbereitung, Dialog, Schritt-Kanal, Hauptprozess.
//
// **Der Papierkorb ist eine Attrappe** im Hauptprozess (`shell.trashItem`
// ersetzt): Der Prüffall soll den Papierkorb des Rechners nicht füllen. Die
// Attrappe schreibt die Pfade mit; geprüft wird, dass der Hauptprozess genau
// diesen Weg nimmt. Ob die Ersetzung gegriffen hat, prüft der Fall vorher,
// damit er nie still den echten Papierkorb beschickt.
//
// **Sprachfrei geprüft:** Ergebnisse an den Dateien, der Dialog an seinen
// Elementen, der Hinweis an der Frage, die er wörtlich nennt.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');

const PANE = '.pane-group[data-pane="0"]';
const HINWEIS = '#statusbar-hint';
const DIALOG = '#link-preview-modal';
const DIALOG_LISTE = '#link-preview-list';
const JA = '#btn-link-preview-continue';
const NEIN = '#btn-link-preview-cancel';

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

function workflowText(name, zeilen) {
  return [
    '---',
    'workflow: true',
    `name: ${name}`,
    '---',
    '',
    '```workflow',
    ...zeilen,
    '```',
    '',
  ].join('\n');
}

// Ein Bereich mit Workflow-Ordner in seinen Einstellungen und einem Workflow.
function baueBereich(datei, name, zeilen) {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-pflege-'));
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { workflows: { folder: 'Workflows' } } }, null, 2),
    'utf8',
  );
  fs.mkdirSync(path.join(wurzel, 'Workflows'));
  fs.mkdirSync(path.join(wurzel, 'Notizen'));
  fs.writeFileSync(path.join(wurzel, 'Notizen', 'Weg.md'), '# Weg\n', 'utf8');
  fs.writeFileSync(path.join(wurzel, 'Workflows', datei), workflowText(name, zeilen), 'utf8');
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

// Den Workflow öffnen und auf den Knopf «Starten» der Kopfzeile warten.
async function oeffneWorkflow(app, page, datei) {
  await oeffneDokumentImFenster(app, page, datei);
  await page.locator(SEL.viewBtn('live')).click();
  const kopf = page.locator(`${PANE} .pane-source .cm-wf-kopf`);
  await expect(kopf).toHaveCount(1);
  await expect(kopf.locator('.cm-wf-pruefung-ok')).toHaveCount(1);
  return kopf.locator('.cm-wf-starten');
}

// Ersetzt den Papierkorb im Hauptprozess durch eine mitschreibende Attrappe.
async function papierkorbAttrappe(app) {
  await hauptSenden(app, ({ shell }) => {
    globalThis.__wfPapierkorb = [];
    const attrappe = async (p) => {
      globalThis.__wfPapierkorb.push(p);
    };
    attrappe.__wfAttrappe = true;
    shell.trashItem = attrappe;
  });
  await expect
    .poll(() => hauptLesen(app, ({ shell }) => shell.trashItem.__wfAttrappe === true))
    .toBe(true);
}

const imPapierkorb = (app) => hauptLesen(app, () => globalThis.__wfPapierkorb || []);

test.describe('WF-PFLEGE-01: eine Bestätigung vor einem Lauf mit delete (4T-002424)', () => {
  test('nennt das Ziel mit Pfad; «Nein» lässt keinen Schritt laufen, «Ja» legt in den Papierkorb', async () => {
    const wurzel = baueBereich('Aufraeumen.md', 'Aufraeumen', [
      'create "Notizen/Vorher.md"',
      'delete "Notizen/Weg.md"',
    ]);
    const { app, page, userData } = await launchApp();
    try {
      await papierkorbAttrappe(app);
      await bindeBereich(page, wurzel);
      const knopf = await oeffneWorkflow(
        app,
        page,
        path.join(wurzel, 'Workflows', 'Aufraeumen.md'),
      );

      // «Nein»: Der Dialog nennt das Ziel; kein Schritt läuft, auch der davor nicht.
      await knopf.click();
      await expect(page.locator(DIALOG)).toBeVisible();
      await expect(page.locator(DIALOG_LISTE)).toContainText('Notizen/Weg.md');
      await page.locator(NEIN).click();
      await expect(page.locator(DIALOG)).toBeHidden();
      await expect
        .poll(() => fs.existsSync(path.join(wurzel, 'Workflows', 'Aufraeumen.mdd')))
        .toBe(true);
      expect(fs.existsSync(path.join(wurzel, 'Notizen', 'Vorher.md'))).toBe(false);
      expect(await imPapierkorb(app)).toEqual([]);

      // «Ja»: Die Schritte laufen, das Ziel geht über den Papierkorb-Weg.
      await knopf.click();
      await expect(page.locator(DIALOG)).toBeVisible();
      await page.locator(JA).click();
      await expect.poll(() => fs.existsSync(path.join(wurzel, 'Notizen', 'Vorher.md'))).toBe(true);
      await expect.poll(() => imPapierkorb(app)).toEqual([path.join(wurzel, 'Notizen', 'Weg.md')]);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

test.describe('WF-PFLEGE-02: confirm fragt mit «Ja» und «Nein» (4T-002424)', () => {
  test('«Ja» läuft weiter; «Nein» beendet den Lauf in seiner Zeile ohne Fehlschlag', async () => {
    const wurzel = baueBereich('Frage.md', 'Frage', [
      'confirm "Wirklich weiter?"',
      'create "Notizen/Danach.md"',
    ]);
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      const knopf = await oeffneWorkflow(app, page, path.join(wurzel, 'Workflows', 'Frage.md'));
      const danach = path.join(wurzel, 'Notizen', 'Danach.md');

      await knopf.click();
      await expect(page.locator(DIALOG)).toBeVisible();
      await expect(page.locator(DIALOG)).toContainText('Wirklich weiter?');
      await page.locator(NEIN).click();
      await expect(page.locator(HINWEIS)).toContainText('Wirklich weiter?');
      await expect(page.locator(HINWEIS)).toContainText('7');
      expect(fs.existsSync(danach)).toBe(false);

      await knopf.click();
      await expect(page.locator(DIALOG)).toBeVisible();
      await page.locator(JA).click();
      await expect.poll(() => fs.existsSync(danach)).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
