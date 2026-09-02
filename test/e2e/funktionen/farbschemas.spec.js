// 4T-000466 (Epic 3E-000086): E2E-Funktions-Suite — Farbschemas. Deckt den
// Einstellungs-Bereich ab: Navigation zu Modus-Zuordnung und Slot-Editor,
// Anlegen eines eigenen Schemas, Live-Vorschau einer Slot-Farbe über die
// CSS-Variable am Wurzel-Element, Anwenden/Persistenz und Löschen mit Rückfall
// auf das Standard-Schema.
'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const {
  BUILTIN_SCHEMES,
  DEFAULT_LIGHT_ID,
  DEFAULT_DARK_ID,
} = require('../../../src/shared/color-schemes.js');

// 4T-000751 (Epic 3E-000146): Voreingestellt ist seither Bernstein, und dessen
// Akzent weicht von der Basis-Palette ab. Der erwartete Wert haengt am
// Anzeige-Modus, der dem Betriebssystem folgt (Vorzug 'system'); er wird
// deshalb zur Laufzeit aus dem Modell geholt statt als Literal gesetzt.
async function defaultAccent(page) {
  const dunkel = await page.evaluate(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  );
  const id = dunkel ? DEFAULT_DARK_ID : DEFAULT_LIGHT_ID;
  return BUILTIN_SCHEMES.find((s) => s.id === id).colors.accent;
}

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

async function openSettingsPageViaKeyboard(page) {
  await expect
    .poll(async () => {
      await page.keyboard.press('Control+,');
      return page.locator(SEL.tabs0).count();
    })
    .toBeGreaterThan(0);
}

async function openColorSchemesSection(page) {
  await openSettingsPageViaKeyboard(page);
  await expect(page.locator(SETTINGS_PAGE)).toBeVisible();
  await page
    .locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="colorSchemes"]`)
    .click();
  await expect(page.locator('.color-scheme-editor')).toBeVisible();
}

// Inline-Wert einer CSS-Variable am Wurzel-Element.
function rootVar(page, name) {
  return page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);
}

test.describe('FS-01: Farbschema-Bereich', () => {
  test('Navigation zeigt Modus-Zuordnung und nur-lesenden Standard-Editor', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openColorSchemesSection(page);
      await expect(page.locator('#settings-color-scheme-light')).toBeVisible();
      await expect(page.locator('#settings-color-scheme-dark')).toBeVisible();
      // Aktiv ist zunächst ein mitgeliefertes Schema (die Voreinstellung):
      // Farbwähler nur-lesend, kein Löschen-Knopf.
      await expect(page.locator('#settings-color-slot-accent')).toBeDisabled();
      await expect(page.locator('#settings-color-scheme-delete')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('FS-02: eigenes Schema — anlegen, Slot ändern, anwenden, löschen', () => {
  test('Slot-Farbe wirkt live über die CSS-Variable und bleibt nach Anwenden', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openColorSchemesSection(page);
      // Ohne eigenes Schema gilt die Voreinstellung; ihr Akzent weicht von der
      // Basis-Palette ab und steht deshalb inline am Wurzel-Element.
      const akzent = await defaultAccent(page);
      await expect.poll(() => rootVar(page, '--accent')).toBe(akzent);

      // Neu aus Vorlage: eigenes Schema wird aktiv und bearbeitbar.
      await page.locator('#settings-color-scheme-new').click();
      const accent = page.locator('#settings-color-slot-accent');
      await expect(accent).toBeEnabled();

      // Slot-Farbe setzen (color-Input über Event; fill() greift dort nicht).
      await accent.evaluate((el) => {
        el.value = '#ff0000';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      // Live-Vorschau: --accent am Wurzel-Element trägt die neue Farbe.
      await expect.poll(() => rootVar(page, '--accent')).toBe('#ff0000');

      // Anwenden persistiert; die Variable bleibt gesetzt.
      await page.locator('#btn-settings-apply').click();
      await expect.poll(() => rootVar(page, '--accent')).toBe('#ff0000');

      // Löschen des eigenen Schemas: Rückfall auf die Voreinstellung.
      await page.locator('#settings-color-scheme-delete').click();
      await expect.poll(() => rootVar(page, '--accent')).toBe(akzent);
      await page.locator('#btn-settings-apply').click();
      await expect.poll(() => rootVar(page, '--accent')).toBe(akzent);
    } finally {
      await closeApp(app, userData);
    }
  });
});
