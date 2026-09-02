// 4T-000698 (Epic 3E-000141): E2E-Spec des sichtbaren Bedien-Orts zum Ein- und
// Ausklappen einer Sidebar-Spalte. Kürzel SC- (Sidebar-Collapse). Geprüft
// werden Kopf-Toggle am inneren Rand (Einzel-Panel und Reiter-Gruppe), der
// schmale Strich mit Hover-Icon im eingeklappten Zustand, der Menü-Kommando-
// Weg, die Unabhängigkeit je Editor-Spalte, das Mitwandern des Icons und die
// Persistenz über den Neustart. Der Unterbau (Zustand, Setter, Kommandos,
// Menü, Erweiterung) stammt aus 4T-000697.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');
const ZWEITE = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'zweite.md');

const LEFT = '.pane-group[data-pane="0"] .pane-sidebar-left';
const RIGHT = '.pane-group[data-pane="0"] .pane-sidebar-right';

// Profil-Verzeichnis mit vorbefüllter electron-store-config.json (Muster
// sidebar-layout.spec.js).
function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-sc-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Einstellungs-Seite und Bereich „Erweiterungen" öffnen (Muster
// erweiterungen.spec.js). Wird von SC-09 für den echten Nutzungspfad über den
// Erweiterungs-Schalter gebraucht.
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

async function openExtensionsSection(page) {
  await expect
    .poll(async () => {
      await page.keyboard.press('Control+,');
      return page.locator(SETTINGS_PAGE).count();
    })
    .toBeGreaterThan(0);
  await page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="extensions"]`).click();
  await expect(page.locator('#settings-extensions-list')).toBeVisible();
}

// Menü-Kommando-Weg: die beiden Toggle-Kommandos tragen kein Default-Kürzel,
// der Menü-Klick läuft über die fire-and-forget-IPC menu:toggleSidebar* an das
// aktive Fenster (Muster bestehender Menü-E2E-Specs; getApplicationMenu() ist
// leer).
async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Ein flaches Ein-Panel-Layout je Seite: outline links, bookmarks rechts.
// Beide Slots sind Einzel-Panels mit sichtbarem Sektions-Header (kein
// Reiter-Gruppen-Kopf). Feste Breiten für die deterministische Wiederherstellung.
const FLACHES_LAYOUT = {
  sidebar: {
    layout: {
      left: [{ panels: ['outline'], active: 'outline' }],
      right: [{ panels: ['bookmarks'], active: 'bookmarks' }],
    },
    widthLeft: 300,
    widthRight: 220,
  },
  outline: { visibleColumn0: true },
  bookmarks: { visibleColumn0: true },
};

test.describe('SC-01: Kopf-Toggle am inneren Rand des obersten Kopfs', () => {
  test('links rechtsbündig, rechts linksbündig und gespiegelt', async () => {
    const userData = seedProfile(FLACHES_LAYOUT);
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      await expect(page.locator(LEFT)).toBeVisible();
      await expect(page.locator(RIGHT)).toBeVisible();

      // Genau ein Toggle je Seite, im Kopf des obersten sichtbaren Slots.
      const leftToggle = page.locator(
        `${LEFT} .sidebar-outline .sidebar-section-header .sidebar-collapse-toggle`,
      );
      const rightToggle = page.locator(
        `${RIGHT} .sidebar-bookmarks .sidebar-section-header .sidebar-collapse-toggle`,
      );
      await expect(leftToggle).toHaveCount(1);
      await expect(rightToggle).toHaveCount(1);
      await expect(page.locator(`${LEFT} .sidebar-collapse-toggle`)).toHaveCount(1);
      await expect(page.locator(`${RIGHT} .sidebar-collapse-toggle`)).toHaveCount(1);

      // Innerer Rand (Variante B): links letztes Kopf-Kind, rechts erstes.
      const pos = await page.evaluate(
        ({ leftSel, rightSel }) => {
          const kidIndex = (sel) => {
            const h = document.querySelector(sel);
            const kids = Array.from(h.children);
            const idx = kids.findIndex((k) => k.classList.contains('sidebar-collapse-toggle'));
            return { idx, count: kids.length };
          };
          return {
            left: kidIndex(leftSel),
            right: kidIndex(rightSel),
          };
        },
        {
          leftSel: `${LEFT} .sidebar-outline .sidebar-section-header`,
          rightSel: `${RIGHT} .sidebar-bookmarks .sidebar-section-header`,
        },
      );
      expect(pos.left.idx).toBe(pos.left.count - 1); // links: ganz rechts (letztes Kind)
      expect(pos.right.idx).toBe(0); // rechts: ganz links (erstes Kind)

      // Rechte Spalte: Symbol gespiegelt (transform: scaleX(-1)).
      const mirrored = await page.evaluate((sel) => {
        const svg = document.querySelector(`${sel} .sidebar-collapse-toggle svg`);
        return getComputedStyle(svg).transform;
      }, RIGHT);
      expect(mirrored.startsWith('matrix(-1')).toBe(true);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SC-02: Kopf-Toggle in der Reiterleiste einer Gruppe', () => {
  test('oberster Slot ist eine Gruppe — Toggle sitzt in der Reiterleiste', async () => {
    const userData = seedProfile({
      sidebar: {
        layout: {
          left: [{ panels: ['outline', 'bookmarks'], active: 'outline' }],
          right: [],
        },
      },
      outline: { visibleColumn0: true },
      bookmarks: { visibleColumn0: true },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      await expect(page.locator(`${LEFT} .sidebar-slot-tabs`)).toHaveCount(1);
      // Das Toggle sitzt in der Reiterleiste (Kopf der Gruppe), nicht in einem
      // (ausgeblendeten) Sektions-Header.
      await expect(page.locator(`${LEFT} .sidebar-slot-tabs .sidebar-collapse-toggle`)).toHaveCount(
        1,
      );
      await expect(page.locator(`${LEFT} .sidebar-collapse-toggle`)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SC-03: Einklappen zum Strich, Hover-Icon, Ausklappen stellt wieder her', () => {
  test('Klick klappt ein, Strich-Icon erscheint bei Hover, Klick klappt aus', async () => {
    const userData = seedProfile(FLACHES_LAYOUT);
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      const left = page.locator(LEFT);
      await expect(left).toBeVisible();
      await expect(left).toHaveCSS('width', '300px');
      await expect(page.locator(`${LEFT} .sidebar-outline`)).toBeVisible();

      // Einklappen über den Kopf-Toggle.
      await page.locator(`${LEFT} .sidebar-collapse-toggle`).click();
      await expect(left).toHaveClass(/collapsed/);
      // Spalte ist nun ein schmaler Strich (feste Klassen-Breite, Inline-width
      // geräumt) und das Panel ist im Strich nicht mehr dargestellt.
      await expect(left).toHaveCSS('width', '8px');
      await expect(page.locator(`${LEFT} .sidebar-outline`)).toBeHidden();
      // Panel-Sichtbarkeit (Zustand) bleibt unangetastet.
      expect(await page.evaluate(() => window.api.getSetting('outline.visibleColumn0'))).toBe(true);

      // Der Strich-Button ist unsichtbar (opacity 0), bis der Strich überfahren
      // wird; dann erscheint er.
      const strip = page.locator(`${LEFT} .sidebar-collapse-strip`);
      await expect(strip).toHaveCount(1);
      expect(await strip.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
      await left.hover();
      await expect.poll(() => strip.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');

      // Klick auf den Strich-Button klappt wieder aus und stellt den Stand her.
      await strip.click({ position: { x: 4, y: 12 } });
      await expect(left).not.toHaveClass(/collapsed/);
      await expect(left).toHaveCSS('width', '300px');
      await expect(page.locator(`${LEFT} .sidebar-outline`)).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SC-04: Tooltip wechselt je Zustand', () => {
  test('Kopf-Toggle „einklappen", Strich-Button „ausklappen" — beide gesetzt und verschieden', async () => {
    const userData = seedProfile(FLACHES_LAYOUT);
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      const headToggle = page.locator(`${LEFT} .sidebar-collapse-toggle`);
      const collapseLabel = await headToggle.getAttribute('aria-label');
      expect(collapseLabel && collapseLabel.trim().length).toBeGreaterThan(0);
      // aria-label und Tooltip sind identisch (Barrierefreiheit-Anforderung).
      expect(await headToggle.getAttribute('title')).toBe(collapseLabel);

      await headToggle.click();
      await expect(page.locator(LEFT)).toHaveClass(/collapsed/);
      const strip = page.locator(`${LEFT} .sidebar-collapse-strip`);
      const expandLabel = await strip.getAttribute('aria-label');
      expect(expandLabel && expandLabel.trim().length).toBeGreaterThan(0);
      expect(await strip.getAttribute('title')).toBe(expandLabel);
      // Der Tooltip unterscheidet sich zwischen den beiden Zuständen.
      expect(expandLabel).not.toBe(collapseLabel);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SC-05: Menü-Kommando-Weg', () => {
  test('menu:toggleSidebarLeft klappt die linke Spalte ein und wieder aus', async () => {
    const userData = seedProfile(FLACHES_LAYOUT);
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      const left = page.locator(LEFT);
      await expect(left).not.toHaveClass(/collapsed/);
      await sendMenuChannel(app, 'menu:toggleSidebarLeft');
      await expect(left).toHaveClass(/collapsed/);
      await sendMenuChannel(app, 'menu:toggleSidebarLeft');
      await expect(left).not.toHaveClass(/collapsed/);
      await expect(left).toHaveCSS('width', '300px');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SC-06: Geteilte Ansicht — Kollaps je Editor-Spalte unabhängig', () => {
  test('Klick in Pane 0 lässt die linke Spalte von Pane 1 unberührt', async () => {
    const userData = seedProfile({
      sidebar: {
        layout: {
          left: [{ panels: ['outline'], active: 'outline' }],
          right: [],
        },
      },
      outline: { visibleColumn0: true, visibleColumn1: true },
    });
    const { app, page } = await launchApp({ args: [BASIS, ZWEITE], userData });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      // Aktiven Tab nach rechts verschieben -> Pane 1 entsteht.
      await page.keyboard.press('Control+Alt+ArrowRight');
      const pane1Left = page.locator('.pane-group[data-pane="1"] .pane-sidebar-left');
      await expect(pane1Left).toBeVisible();
      await expect(page.locator(LEFT)).toBeVisible();

      // Kopf-Toggle von Pane 0 klicken -> nur Pane 0 klappt ein.
      await page.locator(`${LEFT} .sidebar-collapse-toggle`).click();
      await expect(page.locator(LEFT)).toHaveClass(/collapsed/);
      await expect(pane1Left).not.toHaveClass(/collapsed/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SC-07: Icon wandert in den neuen obersten Kopf', () => {
  test('nach Ausblenden des obersten Panels sitzt das Toggle im nächsten Kopf', async () => {
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
      // Oberster sichtbarer Slot ist bookmarks -> Toggle in dessen Kopf.
      await expect(
        page.locator(`${LEFT} .sidebar-bookmarks .sidebar-section-header .sidebar-collapse-toggle`),
      ).toHaveCount(1);
      await expect(
        page.locator(`${LEFT} .sidebar-outline .sidebar-section-header .sidebar-collapse-toggle`),
      ).toHaveCount(0);

      // Bookmarks ausblenden -> neuer oberster sichtbarer Slot ist outline.
      await sendMenuChannel(app, 'menu:togglePanel', 'bookmarks');
      await expect(page.locator(`${LEFT} .sidebar-bookmarks`)).toBeHidden();
      await expect(
        page.locator(`${LEFT} .sidebar-outline .sidebar-section-header .sidebar-collapse-toggle`),
      ).toHaveCount(1);
      // Weiterhin genau ein Toggle in der Spalte (aus allen anderen Köpfen entfernt).
      await expect(page.locator(`${LEFT} .sidebar-collapse-toggle`)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SC-08: Kollaps-Zustand überlebt den Neustart', () => {
  test('linke Spalte bleibt nach Neustart mit gleichem Profil eingeklappt', async () => {
    const userData = seedProfile(FLACHES_LAYOUT);
    // --- Erster Start: einklappen. -----------------------------------------
    const first = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(first.page);
      await first.page.locator(`${LEFT} .sidebar-collapse-toggle`).click();
      await expect(first.page.locator(LEFT)).toHaveClass(/collapsed/);
      // Persistiert im globalen Setting.
      await expect
        .poll(() =>
          first.page.evaluate(async () => {
            const s = await window.api.getSetting('sidebarCollapsed');
            return !!(s && s.left && s.left[0]);
          }),
        )
        .toBe(true);
    } finally {
      // Profil behalten für den Neustart.
      await closeApp(first.app, null);
    }
    // --- Zweiter Start mit gleichem Profil: weiterhin eingeklappt. ----------
    const second = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(second.page);
      const left = second.page.locator(LEFT);
      await expect(left).toHaveClass(/collapsed/);
      await expect(left).toHaveCSS('width', '8px');
      // Ausklappen stellt die gespeicherte Breite wieder her.
      await second.page
        .locator(`${LEFT} .sidebar-collapse-strip`)
        .click({ position: { x: 4, y: 12 } });
      await expect(left).not.toHaveClass(/collapsed/);
      await expect(left).toHaveCSS('width', '300px');
    } finally {
      await closeApp(second.app, userData);
    }
  });
});

// 4T-000697 (Epic 3E-000141): PO-Befund vom 2026-07-23 — Der Schalt-Zustand der
// Erweiterung „Sidebar-Spalten einklappen" zog die Kopf-Icons nicht sofort
// nach. Die Icon-Injektion lebt im Render-Pfad renderSidebarSide, den der
// scg:extensions-changed-Handler (renderAllPanes) nicht anfasst; ohne
// aktivierenden/deaktivierenden Laufzeit-Hook blieben die Icons beim
// Deaktivieren stehen (verschwanden erst beim Anklicken) und fehlten beim
// Wieder-Aktivieren, bis eine andere Bedienung ein Rendern auslöste. Dieser
// Fall geht den echten Nutzungspfad über den Erweiterungs-Schalter der
// Einstellungs-Seite.
test.describe('SC-09: Erweiterungs-Schalter zieht die Kopf-Icons sofort nach', () => {
  test('Deaktivieren entfernt die Icons ohne Zutun, Aktivieren bringt sie zurück', async () => {
    const userData = seedProfile(FLACHES_LAYOUT);
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      const leftToggle = page.locator(`${LEFT} .sidebar-collapse-toggle`);
      const rightToggle = page.locator(`${RIGHT} .sidebar-collapse-toggle`);
      // Ausgangslage: je ein Kopf-Toggle links und rechts (Erweiterung aktiv).
      await expect(leftToggle).toHaveCount(1);
      await expect(rightToggle).toHaveCount(1);

      // Erweiterung über den Einstellungs-Schalter deaktivieren und anwenden.
      await openExtensionsSection(page);
      const applyBtn = page.locator('#btn-settings-apply');
      const toggle = page.locator('#settings-extension-sidebar-collapse');
      await expect(toggle).toBeChecked();
      await toggle.uncheck();
      await applyBtn.click();
      // Projekt-Lernpunkt: das Anwenden ist asynchron — erst wenn der
      // Anwenden-Button wieder deaktiviert ist, ist der Zustand angewandt und
      // persistiert; davor prüfen läuft auf einen Datenstands-Race.
      await expect(applyBtn).toBeDisabled();

      // Ohne weitere Interaktion sind beide Kopf-Icons aus dem DOM verschwunden.
      await expect(leftToggle).toHaveCount(0);
      await expect(rightToggle).toHaveCount(0);

      // Wieder aktivieren und anwenden — die Icons kehren ohne Zutun zurück.
      await expect(toggle).not.toBeChecked();
      await toggle.check();
      await applyBtn.click();
      await expect(applyBtn).toBeDisabled();
      await expect(leftToggle).toHaveCount(1);
      await expect(rightToggle).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
    }
  });
});
