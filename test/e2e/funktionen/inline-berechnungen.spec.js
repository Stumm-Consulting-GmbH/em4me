// 4T-0595/4T-0596 (Epic 3E-0111): Inline-Berechnungen {= Ausdruck =} —
// End-to-End über die drei Ansichten. IB-01: Render-Pane zeigt das Ergebnis
// als Span (Fehler als ⚠︎ mit Fehler-Klasse); IB-02: Quelltext-Modus zeigt
// den Roh-Ausdruck und färbt das Konstrukt (.cm-inline-calc-marker);
// IB-03: Live-Modus zeigt auf inaktiven Zeilen das Ergebnis-Widget
// (.cm-inline-calc), ein Klick aufs Widget setzt den Cursor ins Konstrukt
// und deckt den Roh-Ausdruck auf; IB-04: deaktivierte Erweiterung lässt die
// Syntax in allen Ansichten als Fließtext stehen. Die Rechen-Semantik selbst
// ist unit-getestet (test/unit/render/inline-calc.test.js); der
// Abdeckungs-Matrix-Eintrag liegt bei help.feature.inlineCalc (F-143).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'inline-berechnungen.md',
);

function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-inline-calc-seed-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('IB-01: Render-Pane zeigt das Ergebnis mit Tooltip (F-143)', () => {
  test('Ergebnis-Span, Datums-Arithmetik und Fehler-Zeichen', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      // Ergebnis statt Roh-Ausdruck, Ausdruck als Tooltip.
      const sum = body.locator('.inline-calc', { hasText: '14' });
      await expect(sum).toBeVisible();
      await expect(sum).toHaveAttribute('title', '2+3*4');
      await expect(body).not.toContainText('{= 2+3*4 =}');
      // Datums-Arithmetik.
      await expect(body.locator('.inline-calc', { hasText: '2026-01-31' })).toBeVisible();
      // Fehler-Konstrukt: dezentes Zeichen mit Fehler-Klasse und
      // lokalisiertem Tooltip (data-i18n-title über applyTranslations).
      const err = body.locator('.inline-calc-error');
      await expect(err).toBeVisible();
      await expect(err).toContainText('⚠');
      await expect(err).toHaveAttribute('title', /Rechenausdruck/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('IB-02: Quelltext-Modus zeigt den Roh-Ausdruck eingefärbt (F-143)', () => {
  test('Editor enthält {= 2+3*4 =} und mindestens einen .cm-inline-calc-marker', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('source')).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      // Der Quelltext behält den Ausdruck (keine Ersetzung).
      await expect(editor).toContainText('{= 2+3*4 =}');
      // Dezente Einfärbung des Konstrukts im Haupt-Editor (.pane-source
      // qualifiziert gegen die zweite CodeMirror-Instanz, 4T-0361).
      const marker = page.locator(`${SEL.paneSource0} .cm-inline-calc-marker`);
      await expect(marker.first()).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('IB-03: Live-Modus deckt auf der Cursor-Zeile auf (F-143)', () => {
  test('inaktive Zeile zeigt das Ergebnis-Widget, Klick deckt den Ausdruck auf', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('live')).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      // Cursor steht initial auf Zeile 1 — die Rechen-Zeilen sind inaktiv
      // und zeigen Widgets: Ergebnis, Fehler-Zeichen, Datum.
      const widgets = page.locator(`${SEL.paneSource0} .cm-inline-calc`);
      const sum = widgets.filter({ hasText: '14' }).first();
      await expect(sum).toBeVisible();
      await expect(page.locator(`${SEL.paneSource0} .cm-inline-calc-error`).first()).toBeVisible();
      await expect(widgets.filter({ hasText: '2026-01-31' }).first()).toBeVisible();
      // Der Roh-Ausdruck ist auf der inaktiven Zeile ersetzt.
      await expect(editor).not.toContainText('{= 2+3*4 =}');
      // Klick aufs Widget setzt den Cursor ins Konstrukt: die Zeile wird
      // aktiv, der Roh-Ausdruck erscheint, das Ergebnis-Widget verschwindet.
      await sum.click();
      await expect(editor).toContainText('{= 2+3*4 =}');
      await expect(widgets.filter({ hasText: '14' })).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('IB-04: Erweiterung inline-calc aus lässt die Syntax Fließtext (F-143)', () => {
  test('Render-Pane zeigt den Marker-Text, kein Ergebnis-Span', async () => {
    const userDataSeed = seedProfile({ extensions: { disabled: ['inline-calc'] } });
    const { app, page, userData } = await launchApp({
      args: [FIXTURE],
      userData: userDataSeed,
    });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      await expect(body).toContainText('{= 2+3*4 =}');
      await expect(body.locator('.inline-calc')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
