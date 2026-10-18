// 4T-000595/4T-000596 (Epic 3E-000111): Inline-Berechnungen {= Ausdruck =} —
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
      // qualifiziert gegen die zweite CodeMirror-Instanz, 4T-000361).
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

// IB-05 (4T-002095, Story 4S-000168 AK8): Die Markierung bleibt über einem
// Rechen-Ausdruck sichtbar. CodeMirror zeichnet die Markierung als Ebene UNTER
// dem Text; ein deckender Hintergrund des Ausdrucks verdeckte sie. Geprüft
// wird bei markiertem Text, dass die Markierungs-Ebene steht und der
// Hintergrund des Ausdrucks durchscheint, im Quelltext- und im Live-Modus, in
// hellem und dunklem Erscheinungsbild.
function deckkraft(farbe) {
  // Chromium liefert rgb(…)/rgba(…) oder für color-mix color(srgb … / a).
  const schraeg = /\/\s*([\d.]+)\s*\)$/.exec(farbe);
  if (schraeg) return parseFloat(schraeg[1]);
  const rgba = /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/.exec(farbe);
  if (rgba) return parseFloat(rgba[1]);
  return farbe === 'transparent' ? 0 : 1;
}

test.describe('IB-05: Markierung über dem Rechen-Ausdruck sichtbar (4T-002095)', () => {
  test('Quelltext und Live-Modus, hell und dunkel: der Ausdruck verdeckt die Markierung nicht', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const marker = page.locator(`${SEL.paneSource0} .cm-inline-calc-marker`).first();
      const pruefe = async () => {
        await expect(marker).toBeVisible();
        await expect(
          page.locator(`${SEL.paneSource0} .cm-selectionBackground`).first(),
        ).toBeAttached();
        for (const thema of ['light', 'dark']) {
          await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), thema);
          const farbe = await marker.evaluate((el) => getComputedStyle(el).backgroundColor);
          expect(deckkraft(farbe), `${thema}: ${farbe}`).toBeLessThan(1);
        }
      };

      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+a');
      await pruefe();

      // Live-Modus: Markierung aufheben (sonst ist jede Zeile aktiv und zeigt
      // den Roh-Ausdruck), Klick ins Ergebnis-Widget deckt den Ausdruck auf,
      // dann die Zeile markieren.
      await page.keyboard.press('Control+Home');
      await page.locator(SEL.viewBtn('live')).click();
      await page
        .locator(`${SEL.paneSource0} .cm-inline-calc`)
        .filter({ hasText: '14' })
        .first()
        .click();
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+End');
      await pruefe();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
