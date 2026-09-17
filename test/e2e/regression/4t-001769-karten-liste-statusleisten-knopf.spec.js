// 4T-001769 (Epic 3E-000290): Abnahme-Befund des Product Owners vom 2026-09-16
// an der gebauten Programmdatei T-1.135.0-202609151323 — «Die Karten-Liste kann
// ich über das Menü ein- und ausblenden, aber über die Statusleiste geht dies
// nicht. Die Schaltfläche ist da, reagiert aber nicht. Alles andere
// funktioniert.»
//
// **Was fehlte.** Die Statusleisten-Knöpfe der Panels bekommen ihren
// Klick-Zuhörer zentral in `src/renderer/modules/app/app-bindings.js`, je Panel
// eine Zeile. Für `#btn-canvas-list` gab es sie nicht; das Panel-Modul setzte
// nur den Zustand des Knopfes, nicht seine Wirkung. Der Menü-Weg läuft über den
// generischen Panel-Trigger `onMenuTogglePanel` und war deshalb heil — genau
// das beschreibt der Befund.
//
// **Warum dieser Prüffall gegen die echte Anwendung läuft und nicht in jsdom.**
// Die jsdom-Prüffälle des Vorgangs rufen `toggleCanvasListPanel` direkt auf.
// Damit prüfen sie, was der Toggle tut, und setzen voraus, dass ihn jemand
// ruft — die Schicht zwischen Prüfung und Wirkung. Sie liegt in einer zentralen
// Datei ausserhalb des Panel-Moduls und stand deshalb in keinem der Prüffälle.
// Geprüft wird hier der Weg des Anwenders: hinklicken und sehen, was passiert.
//
// Den Fall für JEDES Panel des Zugangs-Modells stellt PZ-10 in
// `test/e2e/funktionen/panel-zugänge.spec.js`; dieser Prüffall hält den
// Anlassfall an seiner eigenen Fläche fest, samt der Liste, die der Knopf
// sichtbar machen soll, und dem Gleichlauf beider Wege.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const PANE0 = '.pane-group[data-pane="0"]';
const CANVAS = `${PANE0} .canvas-view`;
const KNOPF = '#btn-canvas-list';
const PANEL = `${PANE0} .sidebar-canvaslist`;
const EINTRAEGE = `${PANEL} .canvas-liste-eintrag`;

function machVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-1769-'));
}

function raeumeAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// Eine Fläche mit zwei Karten: Ohne Elemente zeigte das Panel seinen Hinweis
// statt einer Liste, und der Fall könnte nicht zeigen, dass der Knopf das
// Gemeinte sichtbar macht.
function baueFlaeche(dir) {
  const flaeche = path.join(dir, 'Flaeche.md');
  fs.writeFileSync(
    flaeche,
    [
      '# Fläche',
      '',
      '```perspective-canvas',
      '!karte k1 x=0 y=0 b=240 h=120',
      'Erste Karte',
      '!karte k2 x=320 y=0 b=240 h=120',
      'Zweite Karte',
      '```',
      '',
    ].join('\n'),
    'utf8',
  );
  return flaeche;
}

async function sendeMenuKanal(app, kanal, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, nutzlast) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(nutzlast.kanal, ...nutzlast.args);
    },
    { kanal, args },
  );
}

async function oeffneFlaeche(app, page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await sendeMenuKanal(app, 'menu:viewChange', 'canvas');
  await expect(page.locator(CANVAS)).toBeVisible();
}

test.describe('4T-001769: Karten-Liste über den Statusleisten-Knopf (Abnahme 2026-09-16)', () => {
  test('der Knopf blendet die Liste ein und der zweite Klick wieder aus', async () => {
    const dir = machVerzeichnis();
    const flaeche = baueFlaeche(dir);
    const { app, page, userData } = await launchApp({ args: [flaeche] });
    try {
      await oeffneFlaeche(app, page);

      // Ausgangslage: Panel aus, Knopf nicht gedrückt.
      await expect(page.locator(PANEL)).toBeHidden();
      await expect(page.locator(KNOPF)).toHaveAttribute('aria-pressed', 'false');

      // Der Befund: ein Klick, und nichts geschah.
      await page.locator(KNOPF).click();
      await expect(page.locator(PANEL)).toBeVisible();
      await expect(page.locator(KNOPF)).toHaveAttribute('aria-pressed', 'true');
      // Und das Panel zeigt, was es zeigen soll — beide Karten der Fläche.
      await expect(page.locator(EINTRAEGE)).toHaveCount(2);
      await expect(page.locator(EINTRAEGE).first()).toContainText('Erste Karte');

      // Zweiter Klick: wieder aus.
      await page.locator(KNOPF).click();
      await expect(page.locator(PANEL)).toBeHidden();
      await expect(page.locator(KNOPF)).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });

  test('Menü-Weg und Knopf-Weg führen denselben Zustand', async () => {
    const dir = machVerzeichnis();
    const flaeche = baueFlaeche(dir);
    const { app, page, userData } = await launchApp({ args: [flaeche] });
    try {
      await oeffneFlaeche(app, page);
      await expect(page.locator(PANEL)).toBeHidden();

      // Einschalten über das Menü — dieser Weg war heil und bleibt der Beleg,
      // dass beide Wege auf denselben Zustand greifen.
      await sendeMenuKanal(app, 'menu:togglePanel', 'canvaslist');
      await expect(page.locator(PANEL)).toBeVisible();
      await expect(page.locator(KNOPF)).toHaveAttribute('aria-pressed', 'true');

      // Ausschalten über den Knopf: Der Knopf sieht den Zustand des Menü-Weges.
      await page.locator(KNOPF).click();
      await expect(page.locator(PANEL)).toBeHidden();
      await expect(page.locator(KNOPF)).toHaveAttribute('aria-pressed', 'false');

      // Und zurück: Einschalten über den Knopf, Ausschalten über das Menü.
      await page.locator(KNOPF).click();
      await expect(page.locator(PANEL)).toBeVisible();
      await sendeMenuKanal(app, 'menu:togglePanel', 'canvaslist');
      await expect(page.locator(PANEL)).toBeHidden();
      await expect(page.locator(KNOPF)).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});
