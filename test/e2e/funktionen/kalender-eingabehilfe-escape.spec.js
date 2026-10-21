// 4T-002212 (Epic 3E-000353): Escape-Taste der Eingabe-Hilfe eines Kalender-
// Werts nach jedem Handgriff, der das Fenster neu aufbaut. Der Neuaufbau
// entfernt das Bedienelement, das ihn ausgelöst hat; lag der Fokus danach auf
// dem Seitenkörper, erreichte die Escape-Taste den Tasten-Rückruf des Fensters
// nicht mehr, und die Eingabe-Hilfe blieb offen. Eigene Datei, weil
// kalender-systeme.spec.js ihr Zeilen-Budget ausschöpft; Bereich, Öffnen und
// Live-Ansicht folgen deren Muster (KS-03).
// describe-Titel tragen die Matrix-IDs (test/abdeckungs-matrix.json).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, APP_ROOT } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const PICKER = '#calendar-picker-popup';

// Bereich mit zwei mitgelieferten Vorlagen in einem Block (Entsprechungen und
// Kalender-Auswahl) und einem zweiten Block (Block-Auswahl). Die Vorlagen
// entstehen mit den deutschen Texten der Anwendung, damit Name und Wert im
// Dokument ihrer Schreibweise folgen.
function makeVorlagenArea() {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-kalender-escape-'));
  const de = require(path.join(APP_ROOT, 'src/i18n/de.json'));
  const t = (k) =>
    (de[k] !== undefined ? de[k] : k.split('.').reduce((o, p) => (o ? o[p] : undefined), de)) ?? k;
  const { findCalendarTemplate } = require(
    path.join(APP_ROOT, 'src/shared/calendar/calendar-templates.js'),
  );
  const vorlage = (id) => findCalendarTemplate(id).create(t);
  const greg = vorlage('gregorian');
  const config = {
    blocks: [
      { id: 'welt', name: 'Welt', calendars: [greg, vorlage('japanese')] },
      { id: 'zweit', name: 'Zweitblock', calendars: [vorlage('julian')] },
    ],
  };
  fs.writeFileSync(
    path.join(areaRoot, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { calendarSystems: config } }, null, 2) + '\n',
    'utf8',
  );
  // Der Wert steht nicht auf Zeile 1: die Zeile mit dem Cursor zeigt Roh-Text.
  fs.writeFileSync(
    path.join(areaRoot, 'werte.md'),
    `# Werte\n\nEin Wert @{${greg.name}: 2024-05-15 n. Chr.} im Text.\n`,
    'utf8',
  );
  return areaRoot;
}

async function sendMenuChannel(app, channel, ...args) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Bereich binden, Dokument aus dem Bereichs-Panel öffnen (die Liste beschriftet
// ohne Markdown-Endung), Live-Ansicht und Bearbeiten (Muster KS-03).
async function oeffneWerteLive(app, page, areaRoot) {
  await expect
    .poll(async () => {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
      return !!(result && result.ok !== false);
    })
    .toBe(true);
  await page
    .locator('.area-file-row', { hasText: /^werte$/ })
    .first()
    .click();
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await expect
    .poll(async () => {
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      return page.locator(SEL.editorContent0).isVisible();
    })
    .toBe(true);
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

// Jeder Handgriff baut das Fenster neu auf und entfernt dabei sein eigenes
// Bedienelement; die Auswahlfelder werden wie nach einer Maus-Auswahl über das
// Feld selbst bedient (das aufgeklappte Menü gehört dem Betriebssystem).
const auswahl = (id, wert) => async (page) => {
  await page.locator(id).focus();
  await page.locator(id).selectOption(wert);
};
const HANDGRIFFE = [
  {
    name: 'Klick auf eine Entsprechung',
    tu: (page) => page.locator(`${PICKER} .calendar-picker-conv`).first().click(),
  },
  { name: 'Block-Auswahl', tu: auswahl('#calendar-picker-block', 'zweit') },
  { name: 'Kalender-Auswahl', tu: auswahl('#calendar-picker-calendar', 'japanese') },
  { name: 'Epochen-Auswahl', tu: auswahl('#calendar-picker-epoch', '0') },
  { name: 'Navigations-Knopf ‹', tu: (page) => page.locator('#calendar-picker-prev').click() },
];

test.describe('KE-01: Escape schließt die Eingabe-Hilfe nach jedem Neuaufbau (4T-002212)', () => {
  test('nach Entsprechung, Block-, Kalender- und Epochen-Wechsel und Navigation schließt Escape, der Wert bleibt', async () => {
    const areaRoot = makeVorlagenArea();
    const { app, page, userData } = await launchApp();
    try {
      await oeffneWerteLive(app, page, areaRoot);
      const badge = page.locator('.cm-live-calendar-badge');
      await expect(badge).toHaveText('2024-Mai-15');

      for (const handgriff of HANDGRIFFE) {
        await badge.click();
        await expect(page.locator(PICKER)).toBeVisible();
        const einheit = page.locator('#calendar-picker-unit-label');
        const einheitVorher = await einheit.textContent();
        await handgriff.tu(page);
        // Warten auf den Neuaufbau selbst: die angezeigte Einheit hat gewechselt.
        await expect(einheit, handgriff.name).not.toHaveText(einheitVorher);
        await page.keyboard.press('Escape');
        await expect(page.locator(PICKER), handgriff.name).toBeHidden();
        await expect(badge, handgriff.name).toHaveText('2024-Mai-15');
      }
    } finally {
      // Kein Wert wird geändert; force schließt ohne Rückfrage wie in KS-03.
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(areaRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
      }
    }
  });
});
