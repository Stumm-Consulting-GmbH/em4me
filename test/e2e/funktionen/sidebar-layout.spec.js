// 4T-000288 (Epic 3E-000051): E2E-Layout-Spec der dynamischen Sidebar.
// Nicht-Default-Layouts werden über ein vorab geschriebenes Profil
// (electron-store config.json im Temp-userData) gesetzt — die
// Konfigurations-UI kommt erst mit 4T-000289.
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

// Profil-Verzeichnis mit vorbefüllter electron-store-config.json anlegen.
// Punkt-Keys (z.B. outline.visibleColumn0) liegen im Store verschachtelt.
function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-sl-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// 4T-000639 (Epic 3E-000069): Einstellungs-Seite über Strg+, öffnen. Mit Poll,
// weil launchApp nach domcontentloaded zurückkehrt, der Kommando-Dispatcher
// aber erst am Ende des asynchronen init() steht (Muster
// einstellungen-seite.spec.js).
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

async function openSettingsPage(page) {
  await expect
    .poll(async () => {
      await page.keyboard.press('Control+,');
      return page.locator(SETTINGS_PAGE).count();
    })
    .toBeGreaterThan(0);
}

test.describe('SL-01: Default-Layout und Breiten-Migration (outline.width)', () => {
  test('Legacy-Breite wird links übernommen, Sektionen stehen in heutiger Reihenfolge', async () => {
    const userData = seedProfile({
      outline: { width: 333, visibleColumn0: true },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      const left = page.locator(LEFT);
      await expect(left).toBeVisible();
      // Nur outline ist sichtbar geseedet; outline liegt im neuen Standard
      // links, rechts hat kein Panel sichtbaren Zustand -> Container versteckt.
      await expect(page.locator(RIGHT)).toBeHidden();
      // Migrierte Breite der linken Seite (Legacy-Key outline.width).
      await expect(left).toHaveCSS('width', '333px');
      // 4T-000563 (Epic 3E-000102): neue Standard-Anordnung. Die Struktur wird
      // sichtbarkeits-unabhängig geprüft — alle Sektionen sind gemäß Layout in
      // ihren Seiten-Container gehängt (auch wenn dieser mangels sichtbarem
      // Panel versteckt ist), die Gruppen-Zugehörigkeit trägt die Klasse
      // 'in-tab-group'. Die exakten Slot-Grenzen (drei Gruppen links, notes plus
      // zwei Gruppen rechts) pinnt der Unit-Test defaultSidebarLayout in
      // test/unit/renderer/sidebar-layout.test.js.
      const dom = await page.evaluate(() => {
        const read = (sel) => {
          const c = document.querySelector(sel);
          return Array.from(c.querySelectorAll('.sidebar-section')).map((el) => ({
            id: Array.from(el.classList)
              .find(
                (cl) => /^sidebar-/.test(cl) && cl !== 'sidebar-section' && cl !== 'sidebar-sep',
              )
              .replace('sidebar-', ''),
            group: el.classList.contains('in-tab-group'),
          }));
        };
        return {
          left: read('.pane-group[data-pane="0"] .pane-sidebar-left'),
          right: read('.pane-group[data-pane="0"] .pane-sidebar-right'),
        };
      });
      // Sektions-Reihenfolge je Seite.
      expect(dom.left.map((e) => e.id)).toEqual([
        'bookmarks',
        'area',
        // 4T-000844 (Epic 3E-000147): Inhaltsverzeichnis des Buches als dritter
        // Reiter der Ort-Gruppe.
        'book',
        'outline',
        'subpages',
        'filegraph',
        // 4T-000759 (Epic 3E-000142): Suchergebnis-Panel als vierter Reiter der
        // Finde-Gruppe.
        'searchresults',
        'calendar',
        'reminders',
        // 4T-000372 (Epic 3E-000069): Uhr-Panel als dritter Reiter der Zeit-Gruppe.
        'clock',
      ]);
      expect(dom.right.map((e) => e.id)).toEqual([
        'notes',
        'properties',
        'tags',
        'blockprops',
        'outgoing',
        'backlinks',
      ]);
      // Links sind alle zehn Panels Reiter-Gruppen-Mitglieder (drei Gruppen).
      expect(dom.left.every((e) => e.group)).toBe(true);
      // Rechts ist notes ein Einzel-Slot, die übrigen fünf bilden zwei Gruppen.
      expect(dom.right.find((e) => e.id === 'notes').group).toBe(false);
      expect(dom.right.filter((e) => e.id !== 'notes').every((e) => e.group)).toBe(true);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SL-02: Panels auf der rechten Seite', () => {
  test('Outline rechts: rechter Container sichtbar, linker bleibt versteckt', async () => {
    const userData = seedProfile({
      sidebar: {
        layout: { left: [], right: [{ panels: ['outline'], active: 'outline' }] },
      },
      outline: { visibleColumn0: true },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      const right = page.locator(RIGHT);
      await expect(right).toBeVisible();
      await expect(right.locator('.sidebar-outline')).toBeVisible();
      await expect(right.locator('.outline-tree .outline-entry').first()).toBeVisible();
      // Links ist kein Panel sichtbar -> Container und Splitter versteckt.
      await expect(page.locator(LEFT)).toBeHidden();
      await expect(page.locator('.pane-group[data-pane="0"] .sidebar-splitter-left')).toBeHidden();
      await expect(
        page.locator('.pane-group[data-pane="0"] .sidebar-splitter-right'),
      ).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SL-03: Geänderte Reihenfolge', () => {
  test('Konfigurierte Slot-Reihenfolge bestimmt die DOM-Reihenfolge', async () => {
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
      outline: { visibleColumn0: true },
      bookmarks: { visibleColumn0: true },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      await expect(page.locator(LEFT)).toBeVisible();
      const order = await page.evaluate(() => {
        const c = document.querySelector('.pane-group[data-pane="0"] .pane-sidebar-left');
        return Array.from(c.querySelectorAll('.sidebar-section')).map((el) =>
          Array.from(el.classList)
            .find((cl) => /^sidebar-/.test(cl) && cl !== 'sidebar-section' && cl !== 'sidebar-sep')
            .replace('sidebar-', ''),
        );
      });
      // Bookmarks vor Outline; die restlichen (unsichtbaren) Panels wurden
      // von der Normalisierung ans Ende der linken Seite ergänzt.
      expect(order.slice(0, 2)).toEqual(['bookmarks', 'outline']);
      await expect(page.locator(`${LEFT} .sidebar-bookmarks`)).toBeVisible();
      await expect(page.locator(`${LEFT} .sidebar-outline`)).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SL-04: Reiter-Gruppe mit Reiterwechsel', () => {
  test('Gruppe zeigt Reiterleiste, Klick wechselt das eingeblendete Panel', async () => {
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
      const tabs = page.locator(`${LEFT} .sidebar-slot-tabs .sidebar-slot-tab`);
      await expect(tabs).toHaveCount(2);
      await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator(`${LEFT} .sidebar-outline`)).toBeVisible();
      await expect(page.locator(`${LEFT} .sidebar-bookmarks`)).toHaveClass(/tab-hidden/);
      // Reiterwechsel auf Lesezeichen.
      await tabs.nth(1).click();
      await expect(page.locator(`${LEFT} .sidebar-bookmarks`)).not.toHaveClass(/tab-hidden/);
      await expect(page.locator(`${LEFT} .sidebar-outline`)).toHaveClass(/tab-hidden/);
      // 4T-000942 (Befund B-07): Der aktive Reiter gehoert seit der Modell-
      // Entscheidung vom 2026-08-10 zur Spalte und wird deshalb spaltenweise
      // persistiert; der Layout-Wert bleibt die Vorgabe und aendert sich
      // nicht mehr mit. Zuvor pruefte dieser Fall genau das Gegenteil.
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const wahl = await window.api.getSetting('sidebar.activeByColumn');
            return wahl && Array.isArray(wahl['0']) ? wahl['0'] : [];
          }),
        )
        .toContain('bookmarks');
      await expect(
        await page.evaluate(async () => {
          const layout = await window.api.getSetting('sidebar.layout');
          return layout.left[0].active;
        }),
      ).toBe('outline');
    } finally {
      await closeApp(app, userData);
    }
  });

  test('Statusbar-Toggle eines gruppierten Panels blendet ein und aktiviert den Reiter', async () => {
    const userData = seedProfile({
      sidebar: {
        layout: {
          left: [{ panels: ['outline', 'tags'], active: 'outline' }],
          right: [],
        },
      },
      outline: { visibleColumn0: true },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      // Nur Outline sichtbar -> ein Reiter.
      await expect(page.locator(`${LEFT} .sidebar-slot-tabs .sidebar-slot-tab`)).toHaveCount(1);
      // Tags einblenden (Standard-Kürzel) -> Reiter erscheint und ist aktiv.
      await page.keyboard.press('Control+Shift+T');
      const tagsTab = page.locator(
        `${LEFT} .sidebar-slot-tabs .sidebar-slot-tab[data-panel-id="tags"]`,
      );
      await expect(tagsTab).toBeVisible();
      await expect(tagsTab).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator(`${LEFT} .sidebar-tags`)).not.toHaveClass(/tab-hidden/);
      await expect(page.locator(`${LEFT} .sidebar-outline`)).toHaveClass(/tab-hidden/);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SL-05: Sichtbarkeits-Toggles wirken pro Pane', () => {
  test('Outline-Toggle der zweiten Pane lässt die erste unberührt', async () => {
    const userData = seedProfile({
      outline: { visibleColumn0: true, visibleColumn1: true },
    });
    const { app, page } = await launchApp({ args: [BASIS, ZWEITE], userData });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      // Aktiven Tab nach rechts verschieben -> Pane 2 entsteht und ist aktiv.
      await page.keyboard.press('Control+Alt+ArrowRight');
      const pane1Left = page.locator('.pane-group[data-pane="1"] .pane-sidebar-left');
      await expect(pane1Left).toBeVisible();
      await expect(page.locator(LEFT)).toBeVisible();
      // Toggle wirkt auf die aktive (zweite) Pane.
      await page.locator('#btn-outline').click();
      await expect(pane1Left).toBeHidden();
      await expect(page.locator(LEFT)).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-000289: Drag-and-Drop der Panels. Die Zonen-Logik wird über synthetische
// DragEvents geprüft (deterministisch, unabhängig von OS-Drag-Timing);
// dataTransfer wird pro Event frisch erzeugt — die Handler arbeiten auf dem
// Modul-Drag-Zustand, nicht auf den Payload-Daten.
async function syntheticPanelDrag(page, sourceSel, steps) {
  await page.evaluate(
    ({ sourceSel, steps }) => {
      const source = document.querySelector(sourceSel);
      const fire = (el, type, clientY) => {
        el.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            clientY: clientY || 0,
            dataTransfer: new DataTransfer(),
          }),
        );
      };
      fire(source, 'dragstart');
      for (const step of steps) {
        const target = document.querySelector(step.targetSel);
        const rect = target.getBoundingClientRect();
        const clientY = rect.top + rect.height * (step.relY == null ? 0.5 : step.relY);
        fire(target, 'dragover', clientY);
        if (step.drop) fire(target, 'drop', clientY);
      }
      fire(source, 'dragend');
    },
    { sourceSel, steps },
  );
}

test.describe('SL-07: Drag-and-Drop — Gruppe bilden und Reihenfolge ändern', () => {
  test('Header auf Sektions-Mitte gruppiert; oberes Drittel sortiert davor', async () => {
    // 4T-000563 (Epic 3E-000102): explizites flaches Layout (bookmarks und outline
    // als benachbarte Einzel-Slots links), damit die DnD-Semantik dieses Tests
    // unabhängig vom neuen Gruppen-Standard prüfbar bleibt.
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
      outline: { visibleColumn0: true },
      bookmarks: { visibleColumn0: true },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      await expect(page.locator(`${LEFT} .sidebar-outline`)).toBeVisible();
      // Outline-Header auf die Mitte der Bookmarks-Sektion -> Gruppe.
      await syntheticPanelDrag(page, `${LEFT} .sidebar-outline .sidebar-section-header`, [
        { targetSel: `${LEFT} .sidebar-bookmarks`, relY: 0.5, drop: true },
      ]);
      const tabs = page.locator(`${LEFT} .sidebar-slot-tabs .sidebar-slot-tab`);
      await expect(tabs).toHaveCount(2);
      // Das verschobene Panel ist aktiver Reiter.
      await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
      // Bookmarks-Reiter auf das obere Drittel der (sichtbaren, weil
      // aktiven) Outline-Sektion ziehen: eigener Slot davor — die Gruppe
      // löst sich zum Einzel-Slot auf.
      await syntheticPanelDrag(
        page,
        `${LEFT} .sidebar-slot-tabs .sidebar-slot-tab[data-panel-id="bookmarks"]`,
        [{ targetSel: `${LEFT} .sidebar-outline`, relY: 0.1, drop: true }],
      );
      await expect(page.locator(`${LEFT} .sidebar-slot-tabs`)).toHaveCount(0);
      const order = await page.evaluate(() => {
        const c = document.querySelector('.pane-group[data-pane="0"] .pane-sidebar-left');
        return Array.from(c.querySelectorAll('.sidebar-section'))
          .filter((el) => !el.hidden)
          .map((el) =>
            Array.from(el.classList)
              .find(
                (cl) => /^sidebar-/.test(cl) && cl !== 'sidebar-section' && cl !== 'sidebar-sep',
              )
              .replace('sidebar-', ''),
          );
      });
      expect(order).toEqual(['bookmarks', 'outline']);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SL-08: Drag-and-Drop — leerer Container und Ziel-Markierung', () => {
  test('Drop in den leeren rechten Container wechselt die Seite', async () => {
    // 4T-000563 (Epic 3E-000102): outline als Einzel-Slot links, rechte Seite
    // explizit leer (der neue Standard hätte rechts bereits Slots) — die
    // DnD-Semantik dieses Tests bleibt so unverändert prüfbar.
    const userData = seedProfile({
      sidebar: {
        layout: {
          left: [{ panels: ['outline'], active: 'outline' }],
          right: [],
        },
      },
      outline: { visibleColumn0: true },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      await expect(page.locator(RIGHT)).toBeHidden();
      await syntheticPanelDrag(page, `${LEFT} .sidebar-outline .sidebar-section-header`, [
        { targetSel: RIGHT, drop: true },
      ]);
      await expect(page.locator(RIGHT)).toBeVisible();
      await expect(page.locator(`${RIGHT} .sidebar-outline`)).toBeVisible();
      await expect(page.locator(LEFT)).toBeHidden();
      // Persistiert im globalen Layout.
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const layout = await window.api.getSetting('sidebar.layout');
            return layout.right.length === 1 ? layout.right[0].panels[0] : null;
          }),
        )
        .toBe('outline');
    } finally {
      await closeApp(app, userData);
    }
  });

  test('Während des Drags ist die Ziel-Zone visuell markiert; Esc räumt auf', async () => {
    // 4T-000563 (Epic 3E-000102): explizites flaches Layout (wie SL-07/SL-08a),
    // damit outline und bookmarks Einzel-Slots mit sichtbarem Sektions-Header
    // (Drag-Quelle) bzw. sichtbarer Sektion (Drop-Ziel) sind.
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
      outline: { visibleColumn0: true },
      bookmarks: { visibleColumn0: true },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      // Drag starten und über die Bookmarks-Sektion halten (ohne Drop).
      await page.evaluate(() => {
        const fire = (el, type, clientY) =>
          el.dispatchEvent(
            new DragEvent(type, {
              bubbles: true,
              cancelable: true,
              clientY: clientY || 0,
              dataTransfer: new DataTransfer(),
            }),
          );
        const header = document.querySelector(
          '.pane-group[data-pane="0"] .sidebar-outline .sidebar-section-header',
        );
        fire(header, 'dragstart');
        const target = document.querySelector('.pane-group[data-pane="0"] .sidebar-bookmarks');
        const rect = target.getBoundingClientRect();
        fire(target, 'dragover', rect.top + rect.height * 0.5);
      });
      await expect(page.locator('body')).toHaveClass(/panel-dragging/);
      await expect(page.locator(`${LEFT} .sidebar-bookmarks`)).toHaveClass(/is-panel-drop-into/);
      // Esc räumt den Drag-Zustand auf (Kaskade in app-init).
      await page.keyboard.press('Escape');
      await expect(page.locator('body')).not.toHaveClass(/panel-dragging/);
      await expect(page.locator(`${LEFT} .sidebar-bookmarks`)).not.toHaveClass(
        /is-panel-drop-into/,
      );
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SL-09: Layout-Broadcast über Fenster hinweg', () => {
  test('sidebar.layout-Änderung aus Fenster 1 wirkt in Fenster 2', async () => {
    const userData = seedProfile({
      outline: { visibleColumn0: true },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      const win2Promise = app.waitForEvent('window');
      // Fenster 2 mit Datei oeffnen — im Empty-State waere die Outline
      // zwangsweise unsichtbar und die Wirkung nicht pruefbar.
      await page.evaluate(
        (file) => window.api.openNewWindow([{ paths: [file], activeIndex: 0 }], null),
        BASIS,
      );
      const page2 = await win2Promise;
      await page2.waitForLoadState('domcontentloaded');
      await expect(
        page2.locator('.pane-group[data-pane="0"] .pane-sidebar-left .sidebar-outline'),
      ).toBeVisible();
      // Fenster 1: Outline per Drag auf die rechte Seite.
      await syntheticPanelDrag(page, `${LEFT} .sidebar-outline .sidebar-section-header`, [
        { targetSel: RIGHT, drop: true },
      ]);
      // Fenster 2 zieht über den Broadcast nach.
      await expect(
        page2.locator('.pane-group[data-pane="0"] .pane-sidebar-right .sidebar-outline'),
      ).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SL-06: Unabhängige Breiten je Seite', () => {
  test('Beide Seiten haben eigene, per Splitter ziehbare und persistierte Breiten', async () => {
    const userData = seedProfile({
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
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      const left = page.locator(LEFT);
      const right = page.locator(RIGHT);
      await expect(left).toHaveCSS('width', '300px');
      await expect(right).toHaveCSS('width', '220px');
      // Linken Splitter um 40 px nach rechts ziehen.
      const splitter = page.locator('.pane-group[data-pane="0"] .sidebar-splitter-left');
      const box = await splitter.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
      await expect(left).toHaveCSS('width', '340px');
      // Rechte Seite unberührt; neuer Wert persistiert.
      await expect(right).toHaveCSS('width', '220px');
      await expect
        .poll(() => page.evaluate(() => window.api.getSetting('sidebar.widthLeft')))
        .toBe(340);
      await expect
        .poll(() => page.evaluate(() => window.api.getSetting('sidebar.widthRight')))
        .toBe(220);
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-000475 (Epic 3E-000088): manuell einstellbare Panel-Höhen. Zwischen zwei
// gestapelten Blöcken entsteht ein Zieh-Griff (.sidebar-panel-resizer), der
// die Höhe des Blocks darüber steuert; die Höhe wird persistiert und über
// den Neustart wiederhergestellt, Doppelklick setzt sie zurück.
test.describe('SL-10: Manuell einstellbare Panel-Höhen', () => {
  test('Griff zieht die Höhe darüber, persistiert über Neustart, Doppelklick setzt zurück', async () => {
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
    let draggedHeight;
    // --- Erster Start: Griff ziehen und Persistenz prüfen. -------------------
    const first = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(first.page);
      const bookmarks = first.page.locator(`${LEFT} .sidebar-bookmarks`);
      const outline = first.page.locator(`${LEFT} .sidebar-outline`);
      await expect(bookmarks).toBeVisible();
      await expect(outline).toBeVisible();
      // Genau ein Griff zwischen den beiden sichtbaren Blöcken; er steuert
      // die Höhe des Blocks darüber (Lesezeichen).
      const resizer = first.page.locator(`${LEFT} .sidebar-panel-resizer`);
      await expect(resizer).toHaveCount(1);
      await expect(resizer).toHaveAttribute('data-panel-id', 'bookmarks');

      const startH = (await bookmarks.boundingBox()).height;
      const box = await resizer.boundingBox();
      // Griff 80 px nach oben ziehen → Lesezeichen-Sektion (Block darüber)
      // wird messbar niedriger. Nach unten ist der Block bereits nahe der
      // vollen Höhe; ein zu großer Wert würde durch flex-shrink wieder
      // eingepasst und wäre nicht beobachtbar.
      const targetH = startH - 80;
      await first.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await first.page.mouse.down();
      await first.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 80, { steps: 5 });
      await first.page.mouse.up();
      await expect(bookmarks).toHaveClass(/has-fixed-height/);
      const newH = (await bookmarks.boundingBox()).height;
      expect(newH).toBeLessThan(startH - 40);
      expect(Math.abs(newH - targetH)).toBeLessThan(8);
      // Persistiert als Objekt unter sidebar.panelHeights.
      draggedHeight = await first.page.evaluate(async () => {
        const h = await window.api.getSetting('sidebar.panelHeights');
        return h && typeof h.bookmarks === 'number' ? h.bookmarks : 0;
      });
      expect(Math.abs(draggedHeight - targetH)).toBeLessThan(8);
    } finally {
      // Profil behalten (kein userData-Cleanup) für den Neustart.
      await closeApp(first.app, null);
    }
    // --- Zweiter Start mit gleichem Profil: Höhe liegt wieder an. ------------
    const second = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(second.page);
      const bookmarks = second.page.locator(`${LEFT} .sidebar-bookmarks`);
      await expect(bookmarks).toBeVisible();
      await expect(bookmarks).toHaveClass(/has-fixed-height/);
      const restoredH = (await bookmarks.boundingBox()).height;
      // Wiederhergestellte Höhe entspricht dem persistierten Wert (± Rundung).
      expect(Math.abs(restoredH - draggedHeight)).toBeLessThan(4);
      // Doppelklick auf den Griff → Automatik, Klasse und persistierter Wert weg.
      const resizer = second.page.locator(`${LEFT} .sidebar-panel-resizer`);
      await resizer.dblclick();
      await expect(bookmarks).not.toHaveClass(/has-fixed-height/);
      await expect
        .poll(() =>
          second.page.evaluate(async () => {
            const h = await window.api.getSetting('sidebar.panelHeights');
            return h && Object.prototype.hasOwnProperty.call(h, 'bookmarks');
          }),
        )
        .toBe(false);
    } finally {
      await closeApp(second.app, userData);
    }
  });
});

// 4T-000634 (Epic 3E-000119): Regressionstest — das gezogene Panel folgt der
// Maus exakt (Starthöhe plus Delta), Nachbar-Panels bleiben unverändert.
// Vor dem Fix staucht der Flex-Algorithmus die gesetzte Höhe bei
// überfüllter Sidebar (flex-shrink auf .has-fixed-height) und verteilt das
// Defizit auf alle Blöcke der Seite: der gezogene Block wächst weniger als
// das Maus-Delta (oder schrumpft sogar), die Nachbarn ändern sich mit.
test.describe('SL-11: Höhen-Drag folgt der Maus 1:1, Nachbarn stabil', () => {
  test('gezogener Block wächst exakt um das Maus-Delta, Nachbar-Blöcke unverändert', async () => {
    const userData = seedProfile({
      sidebar: {
        layout: {
          left: [
            { panels: ['bookmarks'], active: 'bookmarks' },
            { panels: ['outline'], active: 'outline' },
            { panels: ['backlinks'], active: 'backlinks' },
          ],
          right: [],
        },
        // Drei fixierte Höhen, deren Summe die Sidebar sicher überfüllt —
        // vor dem Fix ist damit die Flex-Stauchung aktiv und beide
        // Fehl-Symptome beobachtbar.
        panelHeights: { bookmarks: 400, outline: 300, backlinks: 200 },
      },
      bookmarks: { visibleColumn0: true },
      outline: { visibleColumn0: true },
      backlinks: { visibleColumn0: true },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      // Fenster-Höhe festnageln, damit die Sidebar unabhängig von der
      // Bildschirmgröße kleiner als die Höhen-Summe (900px) bleibt.
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].setBounds({ x: 20, y: 20, width: 1100, height: 700 });
      });
      const bookmarks = page.locator(`${LEFT} .sidebar-bookmarks`);
      const outline = page.locator(`${LEFT} .sidebar-outline`);
      const backlinks = page.locator(`${LEFT} .sidebar-backlinks`);
      await expect(bookmarks).toBeVisible();
      await expect(outline).toBeVisible();
      const resizers = page.locator(`${LEFT} .sidebar-panel-resizer`);
      await expect(resizers).toHaveCount(2);
      const resizer = resizers.first();
      await expect(resizer).toHaveAttribute('data-panel-id', 'bookmarks');

      const startBookmarks = (await bookmarks.boundingBox()).height;
      const startOutline = (await outline.boundingBox()).height;
      const startBacklinks = (await backlinks.boundingBox()).height;
      const box = await resizer.boundingBox();
      // Griff 50 px nach unten ziehen: der Block darüber (Lesezeichen) muss
      // exakt um 50 px wachsen, Gliederung und Backlinks bleiben stehen.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 50, { steps: 5 });
      await page.mouse.up();

      const newBookmarks = (await bookmarks.boundingBox()).height;
      const newOutline = (await outline.boundingBox()).height;
      const newBacklinks = (await backlinks.boundingBox()).height;
      expect(Math.abs(newBookmarks - (startBookmarks + 50))).toBeLessThanOrEqual(2);
      expect(Math.abs(newOutline - startOutline)).toBeLessThanOrEqual(2);
      expect(Math.abs(newBacklinks - startBacklinks)).toBeLessThanOrEqual(2);
      // Persistierter Wert entspricht der neuen Ist-Höhe.
      const stored = await page.evaluate(async () => {
        const h = await window.api.getSetting('sidebar.panelHeights');
        return h && typeof h.bookmarks === 'number' ? h.bookmarks : 0;
      });
      expect(Math.abs(stored - newBookmarks)).toBeLessThanOrEqual(2);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SL-12: Panel-Überschriften wahlweise als Icon', () => {
  // 4T-000639 (Epic 3E-000069): Der Schalter im Bereich „Sidebar" tauscht Text-
  // gegen Icon-Überschriften — in Einzel-Panel-Köpfen UND in den Reitern
  // gruppierter Panels, nie gemischt. Im Icon-Zustand darf die Sidebar
  // schmaler gezogen werden (120 statt 180 Pixel).
  test('Köpfe und Reiter zeigen Symbole, der Name bleibt zugänglich', async () => {
    // Links die Kalender-Gruppe (calendar/reminders/clock) für die
    // Reiterleiste, rechts das Notizen-Panel — es liegt in der Standard-
    // Anordnung als EINZIGES in einem eigenen Slot und hat deshalb einen
    // sichtbaren Sektions-Kopf (in Gruppen ersetzt die Reiterleiste ihn).
    const userData = seedProfile({
      calendar: { visibleColumn0: true },
      notes: { visibleColumn0: true },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      const titel = page.locator(`${RIGHT} .sidebar-section-title`).first();
      const reiter = page.locator(`${LEFT} .sidebar-slot-tab`).first();
      await expect(titel).toBeVisible();
      // Ausgangslage: Text, kein Symbol.
      await expect(titel).not.toHaveClass(/icon-heading/);
      await expect(titel.locator('svg')).toHaveCount(0);
      const name = await titel.textContent();
      expect(name.trim().length).toBeGreaterThan(0);

      // Umgeschaltet wird über den echten Bedienweg: Einstellungs-Seite,
      // Bereich „Sidebar", Schalter. Er wirkt wie die Anordnung erst bei
      // Anwenden oder OK (PO-Festlegung 2026-07-20).
      const schalter = page.locator('#settings-sidebar-icon-headings');
      await openSettingsPage(page);
      await page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="sidebar"]`).click();
      await expect(schalter).toBeVisible();

      // Abbrechen verwirft die Wahl: der Kopf bleibt Text.
      await schalter.check();
      await page.locator('#btn-settings-cancel').click();
      await expect(titel).not.toHaveClass(/icon-heading/);

      // Anwenden setzt sie um.
      await openSettingsPage(page);
      await page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="sidebar"]`).click();
      await expect(schalter).not.toBeChecked();
      await schalter.check();
      await page.locator('#btn-settings-apply').click();
      await expect(titel).toHaveClass(/icon-heading/);
      await expect(titel.locator('svg')).toHaveCount(1);
      // Der Name bleibt über Tooltip und Screenreader-Label erhalten.
      await expect(titel).toHaveAttribute('title', name.trim());
      await expect(titel).toHaveAttribute('aria-label', name.trim());
      // Reiter folgen demselben Zustand, nicht gemischt.
      await expect(reiter).toHaveClass(/icon-heading/);
      await expect(reiter.locator('svg')).toHaveCount(1);

      // Zurückschalten über OK stellt den Text wieder her.
      await schalter.uncheck();
      await page.locator('#btn-settings-ok').click();
      await expect(titel).not.toHaveClass(/icon-heading/);
      await expect(titel).toHaveText(name.trim());
    } finally {
      await closeApp(app, userData);
    }
  });

  test('der Icon-Zustand überlebt den Neustart und lässt die Mindestbreite unberührt', async () => {
    const userData = seedProfile({
      outline: { visibleColumn0: true },
      sidebar: { iconHeadings: true, widthLeft: 300 },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      const left = page.locator(LEFT);
      await expect(left).toBeVisible();
      // Der gespeicherte Zustand wirkt direkt beim Start: Reiter mit Symbol.
      await expect(page.locator(`${LEFT} .sidebar-slot-tab`).first()).toHaveClass(/icon-heading/);
      // Die Untergrenze bleibt bei 180 Pixeln (PO-Festlegung 2026-07-20:
      // eine testweise Absenkung auf 120 wurde verworfen, weil Panel-Inhalte
      // wie die Modusleiste der Uhr auf diese Breite ausgelegt sind).
      const min = await page.evaluate(() => {
        const el = document.querySelector('.pane-group[data-pane="0"] .pane-sidebar-left');
        return getComputedStyle(el).minWidth;
      });
      expect(min).toBe('180px');
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-000682 (Epic 3E-000139): Der letzte sichtbare Block einer Seite hat keinen
// Höhen-Griff — der Griff steuert stets den Block darüber, hinter dem letzten
// folgt keiner mehr. Bis zu diesem Fix bekam er trotzdem eine fixierte Höhe
// (freezeSidePanelHeights friert beim Ziehen eines beliebigen Griffs alle
// Blöcke der Seite ein) und war danach nicht mehr verstellbar: Er stand
// dauerhaft auf der Höhe des ersten Ziehens und rollte, obwohl darunter
// beliebig viel Platz frei war. Befund des Product Owners am Uhr-Panel.
test.describe('SL-13: letzter Block ohne Griff läuft auf Automatik', () => {
  test('nimmt seine Inhaltshöhe trotz gespeicherter Höhe und rollt nicht', async () => {
    const userData = seedProfile({
      sidebar: {
        layout: {
          left: [
            { panels: ['bookmarks'], active: 'bookmarks' },
            { panels: ['clock'], active: 'clock' },
          ],
          right: [],
        },
        // Beide Blöcke tragen eine gespeicherte Höhe. Die des Uhr-Blocks ist
        // deutlich kleiner als sein Inhalt in der grossen Stufe.
        panelHeights: { bookmarks: 150, clock: 240 },
      },
      bookmarks: { visibleColumn0: true },
      clockPanel: { visibleColumn0: true },
      clock: { options: { analogSize: 'large', showWeek: true } },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      // Fenster gross genug, damit unter den beiden Bloecken Platz frei ist.
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].setBounds({ x: 20, y: 20, width: 1100, height: 900 });
      });
      const clock = page.locator(`${LEFT} .sidebar-clock`);
      const bookmarks = page.locator(`${LEFT} .sidebar-bookmarks`);
      await expect(clock).toBeVisible();
      await expect(bookmarks).toBeVisible();

      // Genau ein Griff, und der steuert den Block DARUEBER.
      const resizers = page.locator(`${LEFT} .sidebar-panel-resizer`);
      await expect(resizers).toHaveCount(1);
      await expect(resizers.first()).toHaveAttribute('data-panel-id', 'bookmarks');

      const mass = await page.evaluate(() => {
        const sec = document.querySelector(
          '.pane-group[data-pane="0"] .pane-sidebar-left .sidebar-clock',
        );
        const body = sec.querySelector('.sidebar-section-body');
        const bm = document.querySelector(
          '.pane-group[data-pane="0"] .pane-sidebar-left .sidebar-bookmarks',
        );
        const container = sec.parentElement;
        let belegt = 0;
        for (const kind of container.children) belegt += kind.getBoundingClientRect().height;
        return {
          uhrFixiert: sec.classList.contains('has-fixed-height'),
          uhrInline: sec.style.height,
          uhrHoehe: Math.round(sec.getBoundingClientRect().height),
          bodyClient: body.clientHeight,
          bodyScroll: body.scrollHeight,
          bmFixiert: bm.classList.contains('has-fixed-height'),
          bmHoehe: Math.round(bm.getBoundingClientRect().height),
          freierPlatz: Math.round(container.getBoundingClientRect().height - belegt),
        };
      });

      // Unter den Bloecken ist Platz frei — nur dann ist der Fall aussagekraeftig.
      expect(mass.freierPlatz).toBeGreaterThan(50);
      // Letzter Block: keine fixierte Hoehe, kein Rollbalken.
      expect(mass.uhrFixiert).toBe(false);
      expect(mass.uhrInline).toBe('');
      expect(mass.bodyScroll).toBeLessThanOrEqual(mass.bodyClient);
      expect(mass.uhrHoehe).toBeGreaterThan(240);
      // Der Block MIT Griff behaelt seine eingestellte Hoehe unveraendert.
      expect(mass.bmFixiert).toBe(true);
      expect(Math.abs(mass.bmHoehe - 150)).toBeLessThanOrEqual(2);
    } finally {
      await closeApp(app, userData);
    }
  });

  test('Ziehen legt fuer den letzten Block keinen gespeicherten Wert an', async () => {
    const userData = seedProfile({
      sidebar: {
        layout: {
          left: [
            { panels: ['bookmarks'], active: 'bookmarks' },
            { panels: ['clock'], active: 'clock' },
          ],
          right: [],
        },
      },
      bookmarks: { visibleColumn0: true },
      clockPanel: { visibleColumn0: true },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      const resizer = page.locator(`${LEFT} .sidebar-panel-resizer`).first();
      await expect(resizer).toBeVisible();
      const box = await resizer.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 5 });
      await page.mouse.up();

      const stored = await page.evaluate(() => window.api.getSetting('sidebar.panelHeights'));
      // Der gezogene Block ist gespeichert, der letzte Block bewusst nicht:
      // ein Wert fuer ihn liesse sich mangels Griff nie wieder aendern.
      expect(typeof stored.bookmarks).toBe('number');
      expect(stored.clock).toBeUndefined();
    } finally {
      await closeApp(app, userData);
    }
  });
});
