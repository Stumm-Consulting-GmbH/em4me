// 4T-0466 (Epic 3E-0086): E2E-Funktions-Suite — Farbschemas. Deckt den
// Einstellungs-Bereich ab: Navigation zu Modus-Zuordnung und Slot-Editor,
// Anlegen eines eigenen Schemas, Live-Vorschau einer Slot-Farbe über die
// CSS-Variable am Wurzel-Element, Anwenden/Persistenz und Löschen mit Rückfall
// auf das Standard-Schema.
'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

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
      // Aktiv ist zunächst das mitgelieferte Standard-Schema: Farbwähler
      // nur-lesend, kein Löschen-Knopf.
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
      // Ohne eigenes Schema ist --accent nicht inline gesetzt (Stylesheet gilt).
      await expect.poll(() => rootVar(page, '--accent')).toBe('');

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

      // Löschen des eigenen Schemas: Rückfall auf Standard, --accent geräumt.
      await page.locator('#settings-color-scheme-delete').click();
      await expect.poll(() => rootVar(page, '--accent')).toBe('');
      await page.locator('#btn-settings-apply').click();
      await expect.poll(() => rootVar(page, '--accent')).toBe('');
    } finally {
      await closeApp(app, userData);
    }
  });
});
