// 4T-0520 (Epic 3E-0094): E2E-Funktions-Suite — Kommando-Platzierung.
// KP-01 platzierter Statusbar-Button führt sein Kommando aus (Store-Seed),
// KP-02 Anlage über den Einstellungs-Dialog (Drei-Schritt-Flow),
// KP-03 Hide-Liste blendet Standard-Buttons aus (DOM bleibt erhalten)
// und der Zurücksetzen-Knopf holt sie zurück, KP-04 Überlauf-Mehr-Menü
// am schmalen Fenster, KP-05 Aus-Zustand der Erweiterung (Standard-
// Statusbar, kein Einstellungs-Bereich, Konfiguration bleibt).
// 4T-0521: KP-06 nutzerdefinierte Kontextmenü-Sektion (Sektion am
// Menü-Ende, Ausführung, deaktivierter Eintrag bei Bereichs-Pflicht),
// KP-07 Live-Modus-Parität und Aus-Zustand der Sektion.
// 4T-0522: KP-08 Makro als platzierter Button (Ausführung und
// Abbruch-Hinweis), KP-09 Makro-Editor-Flow (Anlage, Schritte, Testlauf,
// Palette-Findbarkeit nach Anwenden).
// Store-Vorbelegung über seedProfile (Muster einstellungen-seite.spec.js).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'frontmatter.md');

function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-cmdplace-seed-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const SEGMENT_BUTTON = '#command-buttons .command-placement-button';
const MENU = '#context-menu';

// Menü-IPC-Kanal direkt senden (Muster editor-kontextmenue.spec.js).
async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

async function openSettingsPageViaKeyboard(page) {
  await expect
    .poll(async () => {
      await page.keyboard.press('Control+,');
      return page.locator(`${SETTINGS_PAGE}`).count();
    })
    .toBeGreaterThan(0);
}

async function openCommandPlacementSection(page) {
  await openSettingsPageViaKeyboard(page);
  await page
    .locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="commandPlacement"]`)
    .click();
}

test.describe('KP-01: platzierter Button führt sein Kommando aus', () => {
  test('Seed-Button erscheint mit Tooltip und toggelt den Edit-Modus', async () => {
    const userData = seedProfile({
      commandPlacement: {
        statusbar: [{ commandId: 'view.toggleEdit', icon: 'star', label: 'Schreiben' }],
        contextMenu: [],
        macros: [],
        hiddenButtons: [],
      },
    });
    const { app, page } = await launchApp({ args: [FIXTURE], userData });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      const btn = page.locator(`${SEGMENT_BUTTON}[data-command-id="view.toggleEdit"]`);
      await expect(btn).toBeVisible();
      // Tooltip: Anzeigename plus Original-Kommando-Label in Klammern.
      await expect(btn).toHaveAttribute('title', /^Schreiben \(/);
      await expect(page.locator(SEL.btnEdit)).not.toHaveClass(/active/);
      await btn.click();
      await expect(page.locator(SEL.btnEdit)).toHaveClass(/active/);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('KP-02: Anlage über den Einstellungs-Dialog', () => {
  test('Drei-Schritt-Flow legt einen Statusbar-Button an', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openCommandPlacementSection(page);
      await page.locator('#btn-command-placement-add-statusbar').click();
      const modal = page.locator('#command-placement-modal');
      await expect(modal).toBeVisible();
      // Schritt 1: Kommando per Filter-Suche wählen.
      await page.locator('#command-placement-filter').fill('Kommando-Palette');
      await page
        .locator('#command-placement-command-list button[data-command-id="app.commandPalette"]')
        .click();
      // Schritt 2: Icon wählen.
      await page.locator('#command-placement-icon-grid button[data-icon-id="play"]').click();
      // Schritt 3: optionaler Anzeigename.
      await page.locator('#command-placement-name').fill('Palette');
      await page.locator('#btn-command-placement-ok').click();
      await expect(modal).toBeHidden();
      // Eintrag steht im Entwurf; Anwenden macht ihn wirksam.
      await expect(
        page.locator(
          `${SETTINGS_PAGE} [data-placement-list="statusbar"] .command-placement-row[data-command-id="app.commandPalette"]`,
        ),
      ).toHaveCount(1);
      await page.locator('#btn-settings-apply').click();
      const btn = page.locator(`${SEGMENT_BUTTON}[data-command-id="app.commandPalette"]`);
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute('title', /^Palette \(/);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('KP-03: Hide-Liste über die Render-Logik', () => {
  test('Seed blendet Standard-Buttons aus, Zurücksetzen holt sie zurück', async () => {
    const userData = seedProfile({
      commandPlacement: {
        statusbar: [],
        contextMenu: [],
        macros: [],
        hiddenButtons: ['panel:outline', 'right:theme'],
      },
    });
    const { app, page } = await launchApp({ userData });
    try {
      // Ausgeblendet, aber im DOM (Reihenfolge-Asserts der PZ-Suite und
      // Wieder-Einblenden bleiben stabil).
      await expect(page.locator('#btn-outline')).toBeHidden();
      await expect(page.locator('#btn-theme')).toBeHidden();
      await expect(page.locator('#btn-outline')).toHaveCount(1);
      // Nicht gelistete Elemente bleiben sichtbar.
      await expect(page.locator('#btn-edit')).toBeVisible();
      // Zurücksetzen über den Einstellungs-Bereich.
      await openCommandPlacementSection(page);
      await page.locator('#btn-command-placement-hide-reset').click();
      await page.locator('#btn-settings-apply').click();
      await expect(page.locator('#btn-outline')).toBeVisible();
      await expect(page.locator('#btn-theme')).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('KP-04: Überlauf-Mehr-Menü am schmalen Fenster', () => {
  test('überzählige Buttons wandern ins Mehr-Menü und bleiben ausführbar', async () => {
    const entries = [];
    for (let i = 0; i < 14; i++) {
      entries.push({ commandId: 'view.toggleEdit', icon: 'star', label: `Button ${i + 1}` });
    }
    const userData = seedProfile({
      commandPlacement: { statusbar: entries, contextMenu: [], macros: [], hiddenButtons: [] },
    });
    const { app, page } = await launchApp({ args: [FIXTURE], userData });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.setBounds({ x: 20, y: 20, width: 860, height: 600 });
      });
      const moreBtn = page.locator('#btn-command-overflow');
      await expect(moreBtn).toBeVisible();
      // Mindestens ein Segment-Button ist eingelagert (hidden), der Rest
      // bleibt sichtbar.
      const hiddenCount = await page.locator(`${SEGMENT_BUTTON}[hidden]`).count();
      expect(hiddenCount).toBeGreaterThan(0);
      // Menü öffnet und führt den eingelagerten Eintrag aus.
      await moreBtn.click();
      const menuItem = page.locator(
        '#context-menu [data-menu-id="command-overflow-view.toggleEdit"]',
      );
      await expect(menuItem.first()).toBeVisible();
      await menuItem.first().click();
      await expect(page.locator(SEL.btnEdit)).toHaveClass(/active/);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('KP-05: Aus-Zustand der Erweiterung', () => {
  test('Standard-Statusbar ohne eigene Buttons, Bereich ausgeblendet, Konfiguration bleibt', async () => {
    const userData = seedProfile({
      commandPlacement: {
        statusbar: [{ commandId: 'view.toggleEdit', icon: 'star', label: null }],
        contextMenu: [],
        macros: [],
        hiddenButtons: ['right:theme'],
      },
      extensions: { disabled: ['command-placement'] },
    });
    const { app, page } = await launchApp({ userData });
    try {
      // Keine eigenen Buttons, Hide-Liste inaktiv.
      await expect(page.locator(SEGMENT_BUTTON)).toHaveCount(0);
      await expect(page.locator('#btn-theme')).toBeVisible();
      // Einstellungs-Bereich ist gefiltert.
      await openSettingsPageViaKeyboard(page);
      await expect(
        page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="commandPlacement"]`),
      ).toHaveCount(0);
      // Wieder einschalten: Konfiguration wirkt sofort (Broadcast-Pfad).
      await page.evaluate(() => window.api.setSetting('extensions.disabled', []));
      await expect(page.locator(SEGMENT_BUTTON)).toHaveCount(1);
      await expect(page.locator('#btn-theme')).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('KP-06: nutzerdefinierte Kontextmenü-Sektion', () => {
  test('Sektion am Menü-Ende, Ausführung, Bereichs-Kommando deaktiviert', async () => {
    const userData = seedProfile({
      commandPlacement: {
        statusbar: [],
        contextMenu: [
          { commandId: 'view.toggleEdit', icon: 'pencil', label: 'Modus wechseln' },
          { commandId: 'journal.openToday', icon: 'calendar', label: null },
        ],
        macros: [],
        hiddenButtons: [],
      },
    });
    const { app, page } = await launchApp({ args: [FIXTURE], userData });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await page.locator(SEL.editorContent0).click({ button: 'right' });
      await expect(page.locator(MENU)).toBeVisible();
      const customItem = page.locator(`${MENU} [data-menu-id="command-custom-view.toggleEdit"]`);
      await expect(customItem).toBeVisible();
      await expect(customItem).toHaveText(/Modus wechseln/);
      // Icon aus dem kuratierten Set steht vor dem Label.
      await expect(customItem.locator('.context-menu-icon svg')).toHaveCount(1);
      // Bereichs-Kommando ohne gebundenen Bereich: deaktiviert, nicht weg.
      const areaItem = page.locator(`${MENU} [data-menu-id="command-custom-journal.openToday"]`);
      await expect(areaItem).toBeVisible();
      await expect(areaItem).toHaveClass(/disabled/);
      // Ausführung über den Eintrag: Edit-Modus toggelt an.
      await expect(page.locator(SEL.btnEdit)).not.toHaveClass(/active/);
      await customItem.click();
      await expect(page.locator(MENU)).toBeHidden();
      await expect(page.locator(SEL.btnEdit)).toHaveClass(/active/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('KP-07: Kontextmenü-Sektion im Live-Modus und Aus-Zustand', () => {
  test('Live-Modus zeigt die Sektion, deaktivierte Erweiterung entfernt sie', async () => {
    const userData = seedProfile({
      commandPlacement: {
        statusbar: [],
        contextMenu: [{ commandId: 'view.toggleEdit', icon: 'pencil', label: null }],
        macros: [],
        hiddenButtons: [],
      },
    });
    const { app, page } = await launchApp({ args: [FIXTURE], userData });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await page.locator(SEL.editorContent0).click({ button: 'right' });
      const customItem = page.locator(`${MENU} [data-menu-id="command-custom-view.toggleEdit"]`);
      await expect(customItem).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(MENU)).toBeHidden();
      // Erweiterung abschalten: Sektion entfällt komplett, das übrige
      // Menü bleibt (Klipboard-Block).
      await page.evaluate(() =>
        window.api.setSetting('extensions.disabled', ['command-placement']),
      );
      await page.locator(SEL.editorContent0).click({ button: 'right' });
      await expect(page.locator(MENU)).toBeVisible();
      await expect(page.locator(`${MENU} [data-menu-id="copy"]`)).toBeVisible();
      await expect(customItem).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('KP-08: Makro als platzierter Button', () => {
  test('Makro-Button führt die Sequenz aus, fehlschlagender Schritt zeigt den Hinweis', async () => {
    const userData = seedProfile({
      commandPlacement: {
        statusbar: [
          { commandId: 'macro.m1', icon: 'play', label: null },
          { commandId: 'macro.m2', icon: 'cross', label: null },
        ],
        contextMenu: [],
        macros: [
          {
            id: 'm1',
            name: 'Ablauf',
            icon: 'play',
            steps: [{ type: 'command', commandId: 'view.toggleEdit' }],
          },
          {
            id: 'm2',
            name: 'Kaputt',
            icon: 'cross',
            steps: [{ type: 'command', commandId: 'journal.openToday' }],
          },
        ],
        hiddenButtons: [],
      },
    });
    const { app, page } = await launchApp({ args: [FIXTURE], userData });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      // Makro-Kommandos sind registriert: beide Buttons erscheinen, der
      // Tooltip zeigt den Makro-Namen (Laufzeit-Label).
      const okBtn = page.locator(`${SEGMENT_BUTTON}[data-command-id="macro.m1"]`);
      await expect(okBtn).toBeVisible();
      await expect(okBtn).toHaveAttribute('title', 'Ablauf');
      await okBtn.click();
      await expect(page.locator(SEL.btnEdit)).toHaveClass(/active/);
      // Abbruch-Fall: Bereichs-Kommando ohne Bereich bricht mit
      // Statusbar-Hinweis ab (Fehler-Stil, Makro-Name im Text).
      await page.locator(`${SEGMENT_BUTTON}[data-command-id="macro.m2"]`).click();
      const hint = page.locator('#statusbar-hint');
      await expect(hint).toHaveClass(/visible/);
      await expect(hint).toHaveClass(/error/);
      await expect(hint).toContainText('Kaputt');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('KP-09: Makro-Editor in den Einstellungen', () => {
  test('Anlage, Schritte, Testlauf des Entwurfs und Palette-Findbarkeit nach Anwenden', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openCommandPlacementSection(page);
      // Makro anlegen: Name ist Pflicht (OK erst mit Name aktiv).
      await page.locator('#btn-command-placement-add-macro').click();
      const modal = page.locator('#command-placement-modal');
      await expect(modal).toBeVisible();
      await expect(page.locator('#btn-command-placement-ok')).toBeDisabled();
      await page.locator('#command-placement-name').fill('Doppel-Tab');
      await page.locator('#command-placement-icon-grid button[data-icon-id="plus"]').click();
      await page.locator('#btn-command-placement-ok').click();
      await expect(modal).toBeHidden();
      const macroRow = page.locator('.command-placement-macro-row[data-macro-id="m1"]');
      await expect(macroRow).toBeVisible();
      // Zwei Kommando-Schritte über den Schritt-Dialog anlegen.
      const stepsBox = page.locator('.command-placement-steps[data-macro-id="m1"]');
      for (let i = 0; i < 2; i++) {
        await stepsBox.locator('.macro-add-command').click();
        await page.locator('#command-placement-filter').fill('Neue Datei');
        await page
          .locator('#command-placement-command-list button[data-command-id="file.newTab"]')
          .click();
        await page.locator('#btn-command-placement-ok').click();
        await expect(modal).toBeHidden();
      }
      await expect(stepsBox.locator('.command-placement-step-row')).toHaveCount(2);
      // Testlauf des Entwurfs: zwei neue Tabs entstehen (Settings-Tab + 2);
      // der zuletzt geöffnete Tab ist danach aktiv.
      await macroRow.locator('.macro-test').click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(3);
      // Zurück zum Einstellungs-Tab (erster Tab), dann Anwenden: das
      // registriert das Makro als Kommando — in der Palette findbar.
      await page.locator(SEL.tabs0).first().click();
      await expect(page.locator('#btn-settings-apply')).toBeVisible();
      await page.locator('#btn-settings-apply').click();
      // Anwenden läuft asynchron; erst der Dirty-Reset (Button wieder
      // inaktiv) garantiert die Makro-Registrierung — die Palette baut
      // ihre Einträge einmalig beim Öffnen.
      await expect(page.locator('#btn-settings-apply')).toBeDisabled();
      await page.keyboard.press('Control+k');
      const palette = page.locator('#command-palette-modal');
      await expect(palette).toBeVisible();
      await page.locator('#command-palette-filter').fill('Doppel-Tab');
      await expect(
        page.locator('#command-palette-list .command-palette-item', { hasText: 'Doppel-Tab' }),
      ).toHaveCount(1);
      await page.keyboard.press('Escape');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
