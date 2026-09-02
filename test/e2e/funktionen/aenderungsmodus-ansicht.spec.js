// 4T-001341 (Epic 3E-000238): Ansicht beim Wechsel in den Bearbeiten-Modus.
//
// Bis 4T-001341 führte der Stift aus der Lese-Ansicht fest in die geteilte
// Ansicht. Gemessen wird hier die **Wirkung** des Stifts, nicht die Funktion
// dahinter — die Lehre aus 4T-001339, wo eine grüne Unit-Prüfung eine
// wirkungslose Regel deckte.
//
// describe-Titel tragen die Matrix-IDs aus test/abdeckungs-matrix.json (F-018).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

// Profil-Verzeichnis mit vorbefüllter electron-store-config (Muster
// seedProfile in einstellungen-seite.spec.js).
function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-editview-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('AM-01: der Stift folgt der eingestellten Ansicht', () => {
  test('mit «Live» führt der Wechsel in die Live-Ansicht statt in die geteilte', async () => {
    const userData = seedProfile({ app: { editViewMode: 'live' } });
    const gestartet = await launchApp({ args: [BASIS], userData });
    const { app, page } = gestartet;
    try {
      await waitForTab(page);
      const content = page.locator(SEL.content0);
      // Ausgangspunkt ist die Lese-Ansicht — nur dort wechselt der Stift.
      await page.locator(SEL.viewBtn('rendered')).click();
      await expect(content).toHaveClass(/view-rendered/);

      await page.locator(SEL.btnEdit).click();

      await expect(content).toHaveClass(/view-live/);
      // AK5: Der Tastatur-Fokus liegt danach im Editor.
      await expect(page.locator(SEL.editorContent0)).toBeFocused();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('AM-02: ohne Einstellung bleibt es bei der geteilten Ansicht', () => {
  test('ein Profil ohne den Wert verhält sich wie vor der Einstellung', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      const content = page.locator(SEL.content0);
      await page.locator(SEL.viewBtn('rendered')).click();
      await expect(content).toHaveClass(/view-rendered/);

      await page.locator(SEL.btnEdit).click();

      await expect(content).toHaveClass(/view-split/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('AM-03: in den Bearbeitungs-Ansichten wechselt der Stift keine Ansicht', () => {
  test('Quelltext bleibt Quelltext, auch bei eingestelltem «Live»', async () => {
    // AK4: Die Einstellung greift nur beim Wechsel aus der Lese-Ansicht. In den
    // drei Bearbeitungs-Ansichten schaltet der Stift allein den Editor frei —
    // dort gäbe es nichts zu wählen.
    const userData = seedProfile({ app: { editViewMode: 'live' } });
    const gestartet = await launchApp({ args: [BASIS], userData });
    const { app, page } = gestartet;
    try {
      await waitForTab(page);
      const content = page.locator(SEL.content0);
      await page.locator(SEL.viewBtn('source')).click();
      await expect(content).toHaveClass(/view-source/);

      await page.locator(SEL.btnEdit).click();

      await expect(content).toHaveClass(/view-source/);
      await expect(page.locator(SEL.editorContent0)).not.toHaveAttribute('aria-readonly', 'true');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('AM-04: die Einstellung überdauert den Neustart', () => {
  test('über die Einstellungs-Seite gesetzt, nach dem Neustart wirksam', async () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-editview-neustart-'));
    // Erster Lauf: Wert über die Seite setzen und anwenden.
    const erst = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(erst.page);
      // Der Kommando-Dispatcher ist erst am Ende des asynchronen init()
      // registriert (Muster openSettingsPageViaKeyboard).
      await expect
        .poll(async () => {
          await erst.page.keyboard.press('Control+,');
          return erst.page.locator('.settings-nav-entry[data-section-id="behavior"]').count();
        })
        .toBeGreaterThan(0);
      await erst.page.locator('.settings-nav-entry[data-section-id="behavior"]').click();
      const select = erst.page.locator('#settings-edit-view-mode');
      await expect(select).toBeVisible({ timeout: 15000 });
      await select.selectOption('source');
      await erst.page.locator('#btn-settings-apply').click();
      // Auf den Schreibvorgang warten statt auf eine Frist: Der Persist läuft
      // asynchron über die Prozessgrenze, und der erzwungene Abbruch unten
      // wäre sonst schneller als er.
      await expect
        .poll(() => {
          try {
            return JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8')).app
              ?.editViewMode;
          } catch {
            return undefined;
          }
        })
        .toBe('source');
    } finally {
      // Ohne userData, damit das Profil den ersten Lauf überlebt; der zweite
      // räumt es auf.
      await closeApp(erst.app, null, { force: true });
    }

    // Zweiter Lauf mit demselben Profil: der Stift folgt dem gespeicherten Wert.
    const zweit = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(zweit.page);
      const content = zweit.page.locator(SEL.content0);
      await zweit.page.locator(SEL.viewBtn('rendered')).click();
      await expect(content).toHaveClass(/view-rendered/);

      await zweit.page.locator(SEL.btnEdit).click();

      await expect(content).toHaveClass(/view-source/);
    } finally {
      await closeApp(zweit.app, userData, { force: true });
    }
  });
});
