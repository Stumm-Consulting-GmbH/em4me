// 4T-0624 (Epic 3E-0119): E2E-Funktions-Suite — benannte Sidebar-Varianten.
// SV-01 Speichern und Anwenden (Anordnung UND Panel-Sichtbarkeit),
// SV-02 Umbenennen/Überschreiben/Löschen inkl. Namens-Validierung,
// SV-03 Normalisierung alter Varianten beim Anwenden plus Persistenz über
// den Neustart. Die Verwaltung liegt im Einstellungs-Bereich „Sidebar"
// (Sofort-Wirkung, kein Bereichs-Entwurf).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');
const LEFT = '.pane-group[data-pane="0"] .pane-sidebar-left';
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const VARIANT_ROWS = `${SETTINGS_PAGE} .sidebar-variants-list .sidebar-variants-row`;

// Profil-Verzeichnis mit vorbefüllter electron-store-config.json (Muster
// seedProfile in sidebar-layout.spec.js; Punkt-Keys liegen verschachtelt).
function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-sv-seed-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0)).toHaveCount(1, { timeout: 15000 });
}

// Öffnet die Einstellungs-Seite über Strg+, mit Poll (Muster
// openSettingsPageViaKeyboard in einstellungen-seite.spec.js) und wechselt
// in den Bereich „Sidebar".
async function openSidebarSettings(page) {
  await expect
    .poll(async () => {
      await page.keyboard.press('Control+,');
      return page.locator(`${SETTINGS_PAGE} .settings-nav-entry`).count();
    })
    .toBeGreaterThan(0);
  await page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="sidebar"]`).click();
  await expect(page.locator(`${SETTINGS_PAGE} .sidebar-settings`)).toBeVisible();
}

// Namens-Dialog ausfüllen und bestätigen.
async function submitNameDialog(page, name) {
  await expect(page.locator('#name-input-modal')).toBeVisible();
  await page.locator('#name-input-field').fill(name);
  await page.locator('#btn-name-input-ok').click();
}

test.describe('SV-01: Variante speichern und anwenden', () => {
  test('Speichern friert Anordnung und Sichtbarkeit ein, Anwenden stellt beides wieder her', async () => {
    const userData = seedProfile({
      sidebar: {
        layout: {
          left: [
            { panels: ['bookmarks'], active: 'bookmarks' },
            { panels: ['outline'], active: 'outline' },
          ],
          right: [],
        },
      },
      bookmarks: { visibleColumn0: true },
      outline: { visibleColumn0: true },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      const outlineSection = page.locator(`${LEFT} .sidebar-outline`);
      await expect(outlineSection).toBeVisible();

      // Speichern über den Verwaltungs-Block (gleicher Weg wie das
      // Registry-Kommando sidebar.saveVariant → Namens-Dialog). Ohne
      // geöffneten Bereich existiert keine Bereichs-Gruppe (4T-0625).
      await openSidebarSettings(page);
      await expect(
        page.locator(`${SETTINGS_PAGE} .sidebar-variants-list[data-variant-scope="area"]`),
      ).toHaveCount(0);
      await page.locator('#btn-sidebar-variant-save').click();
      await submitNameDialog(page, 'Arbeit');
      await expect(page.locator(VARIANT_ROWS)).toHaveCount(1);
      await expect(page.locator(`${VARIANT_ROWS} .sidebar-settings-label`)).toHaveText('Arbeit');
      // Persistiert unter sidebar.layoutVariants (Layout + Sichtbarkeit).
      const stored = await page.evaluate(() => window.api.getSetting('sidebar.layoutVariants'));
      expect(stored.length).toBe(1);
      expect(stored[0].name).toBe('Arbeit');
      expect(stored[0].layout.left[0].panels).toEqual(['bookmarks']);
      expect(stored[0].visibility.outline[0]).toBe(true);

      // Anordnung und Sichtbarkeit verändern: Outline nach rechts (über
      // den Store-Broadcast-Pfad) und ausblenden (Statusbar-Toggle).
      await page.evaluate(() =>
        window.api.setSetting('sidebar.layout', {
          left: [{ panels: ['bookmarks'], active: 'bookmarks' }],
          right: [{ panels: ['outline'], active: 'outline' }],
        }),
      );
      await expect(
        page.locator('.pane-group[data-pane="0"] .pane-sidebar-right .sidebar-outline'),
      ).toBeVisible();
      await page.locator('#btn-outline').click();
      await expect(outlineSection).toBeHidden();

      // Anwenden stellt Anordnung UND Sichtbarkeit wieder her.
      await page.locator(`${VARIANT_ROWS} .sidebar-variants-apply`).click();
      await expect(outlineSection).toBeVisible();
      await expect
        .poll(async () => {
          const layout = await page.evaluate(() => window.api.getSetting('sidebar.layout'));
          return layout.left.map((slot) => slot.panels[0]).slice(0, 2);
        })
        .toEqual(['bookmarks', 'outline']);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SV-02: Umbenennen, Überschreiben, Löschen', () => {
  test('Lebenszyklus-Aktionen wirken sofort und validieren doppelte Namen', async () => {
    const userData = seedProfile({
      sidebar: {
        layoutVariants: [
          {
            id: 'v1',
            name: 'Alt',
            layout: { left: [{ panels: ['outline'], active: 'outline' }], right: [] },
            visibility: { outline: [true, false] },
          },
        ],
      },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      await openSidebarSettings(page);
      await expect(page.locator(VARIANT_ROWS)).toHaveCount(1);

      // Umbenennen (Dialog mit Vorbelegung).
      await page.locator(`${VARIANT_ROWS} .sidebar-variants-rename`).click();
      await expect(page.locator('#name-input-field')).toHaveValue('Alt');
      await submitNameDialog(page, 'Neu');
      await expect(page.locator(`${VARIANT_ROWS} .sidebar-settings-label`)).toHaveText('Neu');

      // Zweite Variante anlegen; Umbenennen auf vergebenen Namen wird
      // mit Inline-Fehler abgelehnt.
      await page.locator('#btn-sidebar-variant-save').click();
      await submitNameDialog(page, 'Zweite');
      await expect(page.locator(VARIANT_ROWS)).toHaveCount(2);
      await page
        .locator(VARIANT_ROWS, { hasText: 'Zweite' })
        .locator('.sidebar-variants-rename')
        .click();
      await submitNameDialog(page, 'Neu');
      await expect(page.locator('#name-input-error')).toBeVisible();
      await page.locator('#btn-name-input-cancel').click();

      // Überschreiben übernimmt die aktuelle (volle) Anordnung in die
      // geseedete Ein-Panel-Variante.
      await page
        .locator(VARIANT_ROWS, { hasText: 'Neu' })
        .locator('.sidebar-variants-overwrite')
        .click();
      await expect
        .poll(async () => {
          const stored = await page.evaluate(() => window.api.getSetting('sidebar.layoutVariants'));
          const variant = stored.find((v) => v.id === 'v1');
          const layout = variant.layout;
          return layout.left.length + layout.right.length;
        })
        .toBeGreaterThan(1);

      // Löschen entfernt die Zeile und den Store-Eintrag.
      await page
        .locator(VARIANT_ROWS, { hasText: 'Zweite' })
        .locator('.sidebar-variants-delete')
        .click();
      await expect(page.locator(VARIANT_ROWS)).toHaveCount(1);
      await expect
        .poll(async () => {
          const stored = await page.evaluate(() => window.api.getSetting('sidebar.layoutVariants'));
          return stored.length;
        })
        .toBe(1);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SV-03: Normalisierung und Neustart', () => {
  test('Alte Variante mit unbekannten und fehlenden Panels wird beim Anwenden robust normalisiert', async () => {
    const userData = seedProfile({
      sidebar: {
        layoutVariants: [
          {
            id: 'v-alt',
            name: 'Altbestand',
            // Unbekanntes Panel plus nur zwei bekannte Panels: die
            // Normalisierung beim Anwenden verwirft das unbekannte und
            // hängt alle fehlenden bekannten Panels an (kein Verlust).
            layout: {
              left: [{ panels: ['geist-panel', 'outline'], active: 'geist-panel' }],
              right: [{ panels: ['notes'], active: 'notes' }],
            },
            visibility: {},
          },
        ],
      },
    });
    // --- Erster Start: anwenden und Normalisierung prüfen. -------------------
    const first = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(first.page);
      await openSidebarSettings(first.page);
      await expect(first.page.locator(VARIANT_ROWS)).toHaveCount(1);
      await first.page.locator(`${VARIANT_ROWS} .sidebar-variants-apply`).click();
      await expect
        .poll(async () => {
          const layout = await first.page.evaluate(() => window.api.getSetting('sidebar.layout'));
          const ids = [];
          for (const side of ['left', 'right']) {
            for (const slot of layout[side]) ids.push(...slot.panels);
          }
          return {
            count: ids.length,
            unique: new Set(ids).size,
            ghost: ids.includes('geist-panel'),
          };
        })
        // 4T-0372 (Epic 3E-0069): 13 -> 14 durch das Uhr-Panel.
        .toEqual({ count: 14, unique: 14, ghost: false });
    } finally {
      // Profil behalten (kein userData-Cleanup) für den Neustart.
      await closeApp(first.app, null);
    }
    // --- Zweiter Start: Varianten-Liste überlebt den Neustart. ---------------
    const second = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(second.page);
      await openSidebarSettings(second.page);
      await expect(second.page.locator(VARIANT_ROWS)).toHaveCount(1);
      await expect(second.page.locator(`${VARIANT_ROWS} .sidebar-settings-label`)).toHaveText(
        'Altbestand',
      );
    } finally {
      await closeApp(second.app, userData);
    }
  });
});

// 4T-0625 (Epic 3E-0119): Bereichs-Varianten — Ablage in der
// sidebarLayouts-Sektion der Bereichsdatei; die Verwaltung liegt in der
// eigenen Einstellungs-Sektion „Sidebar-Varianten" der Navigations-Gruppe
// „Aktueller Bereich" (PO-Testbefund 0.77.0), nur bei geöffnetem Bereich
// sichtbar; fremde Sektionen bleiben beim Schreiben erhalten.
test.describe('SV-04: Bereichs-Varianten in der Bereichsdatei', () => {
  test('Bereichs-Sektion mit Anlegen, Anwenden und Löschen; mdda trägt die Sektion und behält fremde Sektionen', async () => {
    const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-sv-area-'));
    const mddaPath = path.join(areaRoot, 'Area_Settings.mdda');
    fs.writeFileSync(
      mddaPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          settings: {
            history: true,
            sidebarLayouts: [
              {
                id: 'av1',
                name: 'Bereichsblick',
                layout: {
                  left: [{ panels: ['outline'], active: 'outline' }],
                  right: [{ panels: ['notes'], active: 'notes' }],
                },
                visibility: { outline: [true, false] },
              },
            ],
          },
        },
        null,
        2,
      ),
      'utf8',
    );
    const { app, page, userData } = await launchApp();
    try {
      // Bereich an das leere Startfenster binden (Muster ES-13).
      await expect
        .poll(async () => {
          const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
          return !!(result && result.ok !== false);
        })
        .toBe(true);
      await openSidebarSettings(page);

      // Der allgemeine Sidebar-Bereich führt KEINE Bereichs-Liste; der
      // Save-Dialog bietet dort die Ziel-Checkbox (Menü-/Kommando-Weg).
      await expect(
        page.locator(`${SETTINGS_PAGE} .sidebar-variants-list[data-variant-scope="area"]`),
      ).toHaveCount(0);
      await page.locator('#btn-sidebar-variant-save').click();
      await expect(page.locator('#name-input-modal')).toBeVisible();
      await page.locator('#name-input-field').fill('Bereichsarbeit');
      await page.locator('#name-input-cb-area').check();
      await page.locator('#btn-name-input-ok').click();

      // Bereichs-Sektion „Sidebar-Varianten" in der Navigations-Gruppe
      // „Aktueller Bereich" öffnen: geseedete plus neue Variante.
      const areaNavEntry = page.locator(
        `${SETTINGS_PAGE} .settings-nav-group[data-nav-group="area"] .settings-nav-entry[data-section-id="sidebarVariants"]`,
      );
      await expect(areaNavEntry).toHaveCount(1);
      await areaNavEntry.click();
      const areaList = page.locator(
        `${SETTINGS_PAGE} .sidebar-variants-area .sidebar-variants-list[data-variant-scope="area"]`,
      );
      await expect(areaList).toHaveCount(1);
      const areaRows = areaList.locator('.sidebar-variants-row');
      await expect(areaRows).toHaveCount(2);
      await expect(areaRows.first().locator('.sidebar-settings-label')).toHaveText('Bereichsblick');

      // Eigener Speichern-Knopf der Bereichs-Sektion legt direkt im
      // Bereich ab (ohne Ziel-Checkbox im Dialog).
      await page.locator('#btn-sidebar-variant-save-area').click();
      await expect(page.locator('#name-input-modal')).toBeVisible();
      await expect(page.locator('#name-input-checkboxes')).toBeHidden();
      await page.locator('#name-input-field').fill('Dritte');
      await page.locator('#btn-name-input-ok').click();
      await expect(areaRows).toHaveCount(3);
      await page
        .locator(`${SETTINGS_PAGE} .sidebar-variants-row`, { hasText: 'Dritte' })
        .locator('.sidebar-variants-delete')
        .click();
      await expect(areaRows).toHaveCount(2);

      // Bereichsdatei: sidebarLayouts hat zwei Einträge, die fremde
      // history-Sektion bleibt erhalten.
      await expect
        .poll(() => {
          const parsed = JSON.parse(fs.readFileSync(mddaPath, 'utf8'));
          return {
            count: (parsed.settings.sidebarLayouts || []).length,
            history: parsed.settings.history,
          };
        })
        .toEqual({ count: 2, history: true });

      // Anwenden der geseedeten Bereichs-Variante wirkt auf das Layout.
      await areaRows.first().locator('.sidebar-variants-apply').click();
      await expect
        .poll(async () => {
          const layout = await page.evaluate(() => window.api.getSetting('sidebar.layout'));
          return layout.left.length > 0 ? layout.left[0].panels[0] : null;
        })
        .toBe('outline');

      // Löschen entfernt Zeile und mdda-Eintrag.
      await page
        .locator(`${SETTINGS_PAGE} .sidebar-variants-row`, { hasText: 'Bereichsarbeit' })
        .locator('.sidebar-variants-delete')
        .click();
      await expect(areaRows).toHaveCount(1);
      await expect
        .poll(() => {
          const parsed = JSON.parse(fs.readFileSync(mddaPath, 'utf8'));
          return (parsed.settings.sidebarLayouts || []).map((v) => v.name);
        })
        .toEqual(['Bereichsblick']);
    } finally {
      await closeApp(app, userData);
      fs.rmSync(areaRoot, { recursive: true, force: true });
    }
  });
});

// 4T-0626 (Epic 3E-0119): Ansichtsmenü-Untermenü „Sidebar-Anordnungen" —
// Aufbau (Standard-Anordnung, globale Varianten, Bereichs-Gruppe,
// Speichern-Eintrag), Anwenden über den Menü-Kanal und Menü-Frische ohne
// Neustart. Menü-Inspektion über den setMenu-Interceptor (Muster
// armPanelMenuCapture in panel-zugänge.spec.js; getApplicationMenu() ist
// leer, die App setzt Fenster-Menüs per win.setMenu).
const I18N_DIR = path.resolve(__dirname, '..', '..', '..', 'src', 'i18n');
const LOCALE_DICTS = ['de', 'en', 'fr', 'es', 'it'].map((l) =>
  JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${l}.json`), 'utf8')),
);
const LAYOUTS_LABELS = LOCALE_DICTS.map((d) => d['menu.view.sidebarLayouts']);
const STANDARD_LABELS = LOCALE_DICTS.map((d) => d['menu.view.sidebarLayoutStandard']);
const SAVE_LABELS = LOCALE_DICTS.map((d) => d['menu.view.sidebarLayoutSave']);

// Interceptor: fängt jeden Menü-Neubau des ersten Fensters ab und legt die
// Einträge des Untermenüs „Sidebar-Anordnungen" global ab.
async function armVariantsMenuCapture(app) {
  await app.evaluate(({ BrowserWindow }, layoutsLabels) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.__variantsMenuCaptureArmed) return;
    win.__variantsMenuCaptureArmed = true;
    const orig = win.setMenu.bind(win);
    win.setMenu = (menu) => {
      const walk = (items) => {
        for (const it of items || []) {
          if (!it.submenu) continue;
          const kids = it.submenu.items || [];
          if (layoutsLabels.includes(it.label)) {
            globalThis.__variantsMenu = kids.map((k) => ({
              label: k.label || '--sep--',
              type: k.type,
              enabled: k.enabled !== false,
            }));
          }
          walk(kids);
        }
      };
      walk(menu ? menu.items : []);
      return orig(menu);
    };
  }, LAYOUTS_LABELS);
}

function capturedVariantsMenu(app) {
  return app.evaluate(() => globalThis.__variantsMenu || null);
}

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

test.describe('SV-05: Ansichtsmenü-Untermenü Sidebar-Anordnungen', () => {
  test('Untermenü-Aufbau mit Gruppen, Anwenden per Menü-Kanal, Frische ohne Neustart', async () => {
    const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-sv-menu-area-'));
    fs.writeFileSync(
      path.join(areaRoot, 'Area_Settings.mdda'),
      JSON.stringify(
        {
          schemaVersion: 1,
          settings: {
            sidebarLayouts: [
              {
                id: 'av1',
                name: 'Bereichsblick',
                layout: { left: [{ panels: ['notes'], active: 'notes' }], right: [] },
                visibility: {},
              },
            ],
          },
        },
        null,
        2,
      ),
      'utf8',
    );
    const userData = seedProfile({
      sidebar: {
        layoutVariants: [
          {
            id: 'gv1',
            name: 'Konzeptarbeit',
            layout: { left: [{ panels: ['outline'], active: 'outline' }], right: [] },
            visibility: {},
          },
        ],
      },
    });
    const { app, page } = await launchApp({ userData });
    try {
      await armVariantsMenuCapture(app);
      // Menü-Neubau anstoßen: die Einstellungs-Seite öffnen löst einen
      // Menü-State-Report aus (Poll deckt die Init-Wartezeit ab).
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return capturedVariantsMenu(app);
        })
        .not.toBeNull();

      // Aufbau ohne Bereich: Standard-Anordnung, Trenner, globale
      // Variante, Trenner, Speichern-Eintrag — keine Bereichs-Gruppe.
      let menu = await capturedVariantsMenu(app);
      expect(STANDARD_LABELS).toContain(menu[0].label);
      expect(menu.map((e) => e.label)).toContain('Konzeptarbeit');
      expect(menu.map((e) => e.label)).not.toContain('Bereichsblick');
      expect(SAVE_LABELS).toContain(menu[menu.length - 1].label);
      expect(menu.filter((e) => e.type === 'separator').length).toBe(2);

      // Anwenden über den Menü-Kanal (Pfad des nativen Menü-Klicks).
      await sendMenuChannel(app, 'menu:applySidebarVariant', { scope: 'global', id: 'gv1' });
      await expect
        .poll(async () => {
          const layout = await page.evaluate(() => window.api.getSetting('sidebar.layout'));
          return layout && layout.left.length > 0 ? layout.left[0].panels[0] : null;
        })
        .toBe('outline');

      // Menü-Frische: Speichern über den Menü-Kanal (Namens-Dialog) —
      // die neue Variante erscheint ohne Neustart im Untermenü.
      await sendMenuChannel(app, 'menu:saveSidebarVariant');
      await submitNameDialog(page, 'Frisch');
      await expect
        .poll(async () => {
          const m = await capturedVariantsMenu(app);
          return m.map((e) => e.label);
        })
        .toContain('Frisch');

      // Bereich binden: Bereichs-Gruppe (deaktivierter Kopf mit
      // Bereichs-Namen plus Bereichs-Variante) erscheint ohne Neustart.
      await expect
        .poll(async () => {
          const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
          return !!(result && result.ok !== false);
        })
        .toBe(true);
      await expect
        .poll(async () => {
          const m = await capturedVariantsMenu(app);
          return m.map((e) => e.label);
        })
        .toContain('Bereichsblick');
      menu = await capturedVariantsMenu(app);
      const header = menu.find((e) => e.label.includes(path.basename(areaRoot)));
      expect(header).toBeTruthy();
      expect(header.enabled).toBe(false);
      expect(menu.filter((e) => e.type === 'separator').length).toBe(3);
    } finally {
      await closeApp(app, userData);
      fs.rmSync(areaRoot, { recursive: true, force: true });
    }
  });
});
