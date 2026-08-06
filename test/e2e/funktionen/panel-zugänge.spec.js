// 4T-0568 (Epic 3E-0104): E2E-Funktions-Suite — vereinheitlichte
// Panel-Zugänge (PZ-01 bis PZ-04). Deckt das Panel-Untermenü des
// Ansichtsmenüs (alle Panels des Zugangs-Modells in Modell-Reihenfolge,
// keine Einzel-Panel-Einträge mehr auf Hauptmenü-Ebene), die identische
// Reihenfolge der Statusbar-Buttons, den zentralen Toggle-Kanal
// menu:togglePanel und das Erweiterungs-Gate (deaktivierte Erweiterungs-Panels
// verschwinden an beiden Orten) ab. Menü-Inspektion über den
// setMenu-Interceptor (Muster
// armMenuCapture in arbeitsbereiche.spec.js — Menu.getApplicationMenu()
// ist leer, die App setzt Fenster-Menüs über win.setMenu).
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { PANEL_ACCESS, DEFAULT_PANEL_TOGGLE_ORDER } = require('../../../src/shared/panel-access.js');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'erweiterungen.md');

// Sprachunabhängige Label-Auflösung: Panel-Titel und Untermenü-Label aller
// fünf Sprachen (die App startet je nach Profil-Sprache; die Zuordnung
// Label -> Panel-ID ist über alle Sprachen eindeutig).
const LOCALES = ['de', 'en', 'fr', 'es', 'it'];
const DICTS = LOCALES.map((loc) => require(`../../../src/i18n/${loc}.json`));
const PANELS_MENU_LABELS = DICTS.map((d) => d['menu.view.panels']);
const LABEL_TO_ID = new Map();
for (const dict of DICTS) {
  for (const p of PANEL_ACCESS) LABEL_TO_ID.set(dict[p.titleKey], p.id);
}
const FOLD_GUTTER_LABELS = new Set(DICTS.map((d) => d['menu.view.foldGutter']));

const BUTTON_ORDER = DEFAULT_PANEL_TOGGLE_ORDER.map(
  (id) => PANEL_ACCESS.find((p) => p.id === id).buttonId,
);

// 4T-0844 (Epic 3E-0147): Panel-Menge aus dem Zugangs-Modell abgeleitet statt
// hart gezählt. Jedes neue Panel (zuletzt das Inhaltsverzeichnis des Buches)
// hätte sonst drei Zahlen in dieser Datei still veralten lassen; die
// Prüf-Aussage bleibt dieselbe, weil die Reihenfolge-Zusicherung darunter
// weiterhin gegen das Modell steht.
const PANEL_COUNT = DEFAULT_PANEL_TOGGLE_ORDER.length;

// Wie viele Panel-Zugänge bleiben, wenn diese Erweiterungen abgeschaltet sind?
function panelCountWithoutExtensions(disabledIds) {
  const off = new Set(disabledIds);
  return PANEL_ACCESS.filter((p) => !off.has(p.extensionId)).length;
}

// Interceptor: fängt jeden Menü-Neubau des ersten Fensters ab und legt das
// Panel-Untermenü ({label, type, checked} je Eintrag) plus alle übrigen Labels
// des Ansichtsmenüs global ab.
//
// 4T-0887 (Epic 3E-0168): Seit der Menü-Neuordnung liegt das Panel-Untermenü
// nicht mehr direkt im Ansichtsmenü, sondern im Untermenü „Sidebar". Die
// Prüf-Aussage bleibt dieselbe und wird strukturunabhängig gefasst:
// viewLabels sammelt den GANZEN Teilbaum des Ansichtsmenüs, ausgenommen die
// Kinder des Panel-Untermenüs — dort und nur dort gehören Panel-Einträge hin.
async function armPanelMenuCapture(app) {
  await app.evaluate(({ BrowserWindow }, panelsLabels) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.__panelMenuCaptureArmed) return;
    win.__panelMenuCaptureArmed = true;
    const orig = win.setMenu.bind(win);
    win.setMenu = (menu) => {
      const found = { submenu: null, viewLabels: null };
      const sammle = (items) => {
        const out = [];
        for (const it of items || []) {
          out.push(it.label || '--sep--');
          if (!it.submenu) continue;
          const kids = it.submenu.items || [];
          if (panelsLabels.includes(it.label)) {
            found.submenu = kids.map((k) => ({
              label: k.label,
              type: k.type,
              checked: !!k.checked,
            }));
            continue;
          }
          out.push(...sammle(kids));
        }
        return out;
      };
      for (const top of (menu ? menu.items : []) || []) {
        const labels = sammle(top.submenu ? top.submenu.items : []);
        if (found.submenu) {
          found.viewLabels = labels;
          break;
        }
      }
      globalThis.__panelMenu = found;
      return orig(menu);
    };
  }, PANELS_MENU_LABELS);
}

function capturedPanelMenu(app) {
  return app.evaluate(() => globalThis.__panelMenu || { submenu: null, viewLabels: null });
}

// Menü-Neubau anstoßen und auf den Capture warten: der zentrale Toggle-
// Kanal meldet nach jedem Schalten den Menü-State neu (an/aus lässt den
// Zustand unverändert). Frühe Sends an frische Fenster verfallen, deshalb
// gepollt (Muster addDraftTabTo in arbeitsbereiche.spec.js).
async function nudgeMenuRebuild(app) {
  await expect
    .poll(async () => {
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          win.webContents.send('menu:togglePanel', 'notes');
          win.webContents.send('menu:togglePanel', 'notes');
        }
      });
      const captured = await capturedPanelMenu(app);
      return captured.submenu ? captured.submenu.length : 0;
    })
    .toBeGreaterThan(0);
}

test.describe('PZ-01: Panel-Untermenü bündelt alle Panels in Modell-Reihenfolge', () => {
  test('Untermenü vollständig und geordnet, keine Einzel-Panel-Einträge im Hauptmenü', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await armPanelMenuCapture(app);
      await nudgeMenuRebuild(app);

      const { submenu, viewLabels } = await capturedPanelMenu(app);
      expect(submenu).toHaveLength(PANEL_COUNT);
      // Reihenfolge und Vollständigkeit: Labels auf Panel-IDs abgebildet.
      const ids = submenu.map((e) => LABEL_TO_ID.get(e.label));
      expect(ids).toEqual(DEFAULT_PANEL_TOGGLE_ORDER);
      // Alle Einträge sind Checkboxen (Häkchen-Semantik).
      for (const entry of submenu) expect(entry.type).toBe('checkbox');

      // Übriges Ansichtsmenü: die Editor-Toggles bleiben erreichbar
      // (Gliederung, seit 4T-0887 im Untermenü „Editor-Darstellung"), und
      // außerhalb des Panel-Untermenüs steht kein einziger Panel-Eintrag.
      expect(viewLabels).not.toBeNull();
      expect(viewLabels.some((l) => FOLD_GUTTER_LABELS.has(l))).toBe(true);
      for (const label of viewLabels) {
        expect(
          LABEL_TO_ID.has(label),
          `Panel-Eintrag '${label}' außerhalb des Panel-Untermenüs`,
        ).toBe(false);
      }
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('PZ-02: Statusbar-Leiste folgt derselben Reihenfolge', () => {
  test('die Panel-Buttons stehen in Modell-Reihenfolge im eigenen Segment', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      const ids = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.statusbar .source-toggles > button')).map(
          (b) => b.id,
        ),
      );
      expect(ids).toEqual(BUTTON_ORDER);
      // 4T-0576 (Epic 3E-0106): die drei Editor-Toggles sitzen seither in der
      // mittleren Statusbar-Zone, nicht mehr am Ende des Panel-Segments.
      const centerIds = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll('.statusbar .statusbar-center .editor-toggles > button'),
        ).map((b) => b.id),
      );
      expect(centerIds).toEqual(['btn-fold-gutter', 'btn-numbers', 'btn-wrap']);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('PZ-03: zentraler Toggle-Kanal menu:togglePanel', () => {
  test('Kanal toggelt das Panel und das Untermenü-Häkchen folgt', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await armPanelMenuCapture(app);

      const notesSection = page.locator('.pane-group[data-pane="0"] .sidebar-notes');
      await expect(notesSection).toBeHidden();
      // Gepollt senden (Muster addDraftTabTo): Einschalten über den Kanal.
      await expect
        .poll(async () => {
          await app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows()[0];
            if (win) win.webContents.send('menu:togglePanel', 'notes');
          });
          return notesSection.isVisible();
        })
        .toBe(true);

      // Häkchen im frisch gebauten Untermenü gesetzt (gepollt: der
      // Menü-Neubau läuft asynchron über den Meldepfad nach).
      await expect
        .poll(async () => {
          const { submenu } = await capturedPanelMenu(app);
          const entry = (submenu || []).find((e) => LABEL_TO_ID.get(e.label) === 'notes');
          return entry ? entry.checked : null;
        })
        .toBe(true);

      // Ausschalten über denselben Kanal.
      await expect
        .poll(async () => {
          await app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows()[0];
            if (win) win.webContents.send('menu:togglePanel', 'notes');
          });
          return notesSection.isHidden();
        })
        .toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// Die drei Erweiterungen, deren fünf Panels PZ-04 abschaltet; dieselbe Liste
// speist die Deaktivierung und die erwartete Rest-Menge.
const DISABLED_EXTENSIONS = ['wiki-links', 'graph-view', 'reminders'];

test.describe('PZ-04: deaktivierte Erweiterungs-Panels verschwinden an beiden Orten', () => {
  test('wiki-links, graph-view und reminders aus: fünf Panels ohne Button und ohne Untermenü-Eintrag', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await armPanelMenuCapture(app);
      await nudgeMenuRebuild(app);
      expect((await capturedPanelMenu(app)).submenu).toHaveLength(PANEL_COUNT);

      // Deaktivierung über den Broadcast-Pfad (Muster erweiterungen.spec.js).
      await page.evaluate(
        (ids) => window.api.setSetting('extensions.disabled', ids),
        DISABLED_EXTENSIONS,
      );

      // Statusbar: die fünf gebundenen Buttons sind ausgeblendet.
      for (const btnId of [
        'btn-subpages',
        'btn-filegraph',
        'btn-outgoing-links',
        'btn-backlinks',
        'btn-reminders',
      ]) {
        await expect(page.locator(`#${btnId}`)).toBeHidden();
      }
      // Untermenü: dieselben fünf Panels entfallen; die Rest-Menge kommt aus
      // dem Zugangs-Modell und nicht aus einer gepflegten Zahl.
      // 4T-0372 (Epic 3E-0069): das Uhr-Panel bleibt, seine Erweiterung ist
      // in diesem Fall nicht deaktiviert. 4T-0844 (Epic 3E-0147): ebenso das
      // Inhaltsverzeichnis des Buches, dessen Erweiterung hier an bleibt.
      await expect
        .poll(async () => {
          const { submenu } = await capturedPanelMenu(app);
          return submenu ? submenu.length : 0;
        })
        .toBe(panelCountWithoutExtensions(DISABLED_EXTENSIONS));
      const ids = (await capturedPanelMenu(app)).submenu.map((e) => LABEL_TO_ID.get(e.label));
      for (const gone of ['subpages', 'filegraph', 'outgoing', 'backlinks', 'reminders']) {
        expect(ids).not.toContain(gone);
      }
      // Gegenprobe: erweiterungs-gebundene Panels anderer Erweiterungen bleiben.
      expect(ids).toContain('book');
      expect(ids).toContain('clock');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-0569 (Epic 3E-0104): Einstellungs-Bereich „Panel-Reihenfolge".
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

async function openPanelOrderSection(page) {
  await expect
    .poll(async () => {
      await page.keyboard.press('Control+,');
      return page.locator(SETTINGS_PAGE).count();
    })
    .toBeGreaterThan(0);
  await page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="panelOrder"]`).click();
  await expect(page.locator(`${SETTINGS_PAGE} .panel-order-settings`)).toBeVisible();
}

function statusbarButtonIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.statusbar .source-toggles > button')).map((b) => b.id),
  );
}

test.describe('PZ-05: Einstellungs-Bereich Panel-Reihenfolge', () => {
  test('Umsortieren wirkt auf Statusbar und Untermenü, persistiert und lässt sich zurücksetzen', async () => {
    const first = await launchApp({ args: [FIXTURE] });
    const userData = first.userData;
    try {
      const { app, page } = first;
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await armPanelMenuCapture(app);

      await openPanelOrderSection(page);
      const rows = page.locator(`${SETTINGS_PAGE} .panel-order-list .sidebar-settings-row`);
      await expect(rows).toHaveCount(PANEL_COUNT);
      await expect(rows.nth(0)).toHaveAttribute('data-panel-id', 'bookmarks');
      // Erste Zeile: „Nach oben" deaktiviert, „Nach unten" aktiv.
      await expect(rows.nth(0).locator('.panel-order-up')).toBeDisabled();
      await expect(rows.nth(0).locator('.panel-order-down')).toBeEnabled();

      // Lesezeichen eine Position nach unten; Entwurfs-Semantik: die
      // Statusbar ändert sich erst bei OK.
      await rows.nth(0).locator('.panel-order-down').click();
      await expect(rows.nth(0)).toHaveAttribute('data-panel-id', 'area');
      expect((await statusbarButtonIds(page))[0]).toBe('btn-bookmarks');
      await page.locator('#btn-settings-ok').click();

      // Wirkung auf die Statusbar-Reihenfolge …
      await expect
        .poll(() => statusbarButtonIds(page))
        .toEqual(['btn-area', 'btn-bookmarks', ...BUTTON_ORDER.slice(2)]);
      // … und identisch auf das Untermenü.
      await expect
        .poll(async () => {
          const { submenu } = await capturedPanelMenu(app);
          return submenu ? submenu.map((e) => LABEL_TO_ID.get(e.label)).slice(0, 2) : [];
        })
        .toEqual(['area', 'bookmarks']);
      // Persistiert im Settings-Store.
      await expect
        .poll(() => page.evaluate(() => window.api.getSetting('panelToggle.order')))
        .toEqual(['area', 'bookmarks', ...DEFAULT_PANEL_TOGGLE_ORDER.slice(2)]);
    } finally {
      await closeApp(first.app, null, { force: true });
    }

    // Neustart mit demselben Profil: Reihenfolge bleibt erhalten; danach
    // Zurücksetzen auf die Standard-Reihenfolge.
    const second = await launchApp({ args: [FIXTURE], userData });
    try {
      const { page } = second;
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await expect
        .poll(() => statusbarButtonIds(page))
        .toEqual(['btn-area', 'btn-bookmarks', ...BUTTON_ORDER.slice(2)]);

      await openPanelOrderSection(page);
      await page.locator('#btn-panel-order-reset').click();
      const rows = page.locator(`${SETTINGS_PAGE} .panel-order-list .sidebar-settings-row`);
      await expect(rows.nth(0)).toHaveAttribute('data-panel-id', 'bookmarks');
      await page.locator('#btn-settings-ok').click();
      await expect.poll(() => statusbarButtonIds(page)).toEqual([...BUTTON_ORDER]);
    } finally {
      await closeApp(second.app, userData, { force: true });
    }
  });
});

// 4T-0887 (PO-Befund der Test-Iteration 0.105.0): Das Suchergebnisse-Panel
// zeigte nie ein Häkchen, weil sein Getter in der Roh-Sichtbarkeits-Tabelle
// des Renderers fehlte (unbekannte IDs liefern false). Der Fall prüft die
// Häkchen-Kopplung systematisch für JEDES Panel des Zugangs-Modells: Toggle
// über den zentralen Kanal muss den checked-Zustand im Menü kippen. Ein
// künftig vergessener Getter fällt damit sofort auf.
test.describe('PZ-06: jedes Panel koppelt sein Menü-Häkchen an den Toggle', () => {
  test('Toggle kippt checked für alle Panels, auch Suchergebnisse', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await armPanelMenuCapture(app);
      await nudgeMenuRebuild(app);

      const checkedOf = (submenu, id) => {
        const eintrag = (submenu || []).find((k) => LABEL_TO_ID.get(k.label) === id);
        return eintrag ? eintrag.checked : null;
      };

      for (const id of DEFAULT_PANEL_TOGGLE_ORDER) {
        const vorher = checkedOf((await capturedPanelMenu(app)).submenu, id);
        expect(vorher, `Panel ${id} fehlt im Untermenü`).not.toBeNull();
        await app.evaluate(({ BrowserWindow }, panelId) => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win) win.webContents.send('menu:togglePanel', panelId);
        }, id);
        await expect
          .poll(async () => checkedOf((await capturedPanelMenu(app)).submenu, id), {
            message: `Panel ${id}: Häkchen folgt dem Toggle nicht`,
          })
          .toBe(!vorher);
        // zurück in den Ausgangszustand, damit die Fälle unabhängig bleiben
        await app.evaluate(({ BrowserWindow }, panelId) => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win) win.webContents.send('menu:togglePanel', panelId);
        }, id);
        await expect
          .poll(async () => checkedOf((await capturedPanelMenu(app)).submenu, id))
          .toBe(vorher);
      }
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
