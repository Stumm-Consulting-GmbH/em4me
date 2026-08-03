// 4T-0855 (Epic 3E-0164): E2E-Spec des umschaltbaren Höhen-Modells der
// Reiter-Gruppen. Kürzel HM- (Höhen-Modell).
//
// Kern der Anforderung: Im Vorgabe-Modus „Höhe je Panel" hängt die Höhe am
// einzelnen Panel, sodass das Durchblättern einer Reiter-Gruppe die Blockhöhe
// ändert und die darunter liegenden Panels verschiebt. Im Modus „feste Höhe
// je Gruppe" bleibt die Blockhöhe beim Reiter-Wechsel gleich.
//
// Aufbau aller Fälle: oben eine Reiter-Gruppe aus zwei Panels, darunter ein
// Einzel-Panel. Das dritte Panel ist nötig, weil der jeweils letzte sichtbare
// Block einer Spalte bewusst immer auf Automatik läuft — eine Gruppe als
// letzter Block trüge nie eine fixierte Höhe.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

const LEFT = '.pane-group[data-pane="0"] .pane-sidebar-left';

function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-hm-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Gruppe [outline, bookmarks] über einem Einzel-Panel [notes].
// `heightMode` und die beiden Höhen-Ablagen kommen aus dem Profil.
function seedGruppe({ heightMode, panelHeights, groupHeights }) {
  return seedProfile({
    sidebar: {
      layout: {
        left: [
          { panels: ['outline', 'bookmarks'], active: 'outline' },
          { panels: ['notes'], active: 'notes' },
        ],
        right: [],
      },
      ...(heightMode ? { heightMode } : {}),
      ...(panelHeights ? { panelHeights } : {}),
      ...(groupHeights ? { groupHeights } : {}),
    },
    outline: { visibleColumn0: true },
    bookmarks: { visibleColumn0: true },
    notes: { visibleColumn0: true },
  });
}

// Höhe des Gruppen-Blocks, also der Sektion des gerade aktiven Reiters.
async function gruppenHoehe(page) {
  return page.evaluate((sel) => {
    const spalte = document.querySelector(sel);
    const sichtbar = Array.from(spalte.querySelectorAll('.sidebar-section.in-tab-group')).find(
      (el) => !el.classList.contains('tab-hidden'),
    );
    return sichtbar ? Math.round(sichtbar.getBoundingClientRect().height) : null;
  }, LEFT);
}

// Reiter der Gruppe anklicken und den Wechsel abwarten.
async function reiterKlicken(page, index) {
  const reiter = page.locator(`${LEFT} .sidebar-slot-tabs .sidebar-slot-tab`).nth(index);
  await expect(reiter).toBeVisible();
  await reiter.click();
}

test.describe('HM-01: Vorgabe „Höhe je Panel"', () => {
  test('der Reiter-Wechsel ändert die Blockhöhe, das Bestandsverhalten bleibt', async () => {
    const userData = seedGruppe({
      panelHeights: { outline: 200, bookmarks: 320 },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      await expect(page.locator(`${LEFT} .sidebar-slot-tabs`)).toBeVisible();

      const vorher = await gruppenHoehe(page);
      expect(vorher).toBe(200);

      await reiterKlicken(page, 1);
      const nachher = await gruppenHoehe(page);
      expect(nachher).toBe(320);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('HM-02: Modus „feste Höhe je Gruppe"', () => {
  test('der Reiter-Wechsel lässt die Blockhöhe unverändert', async () => {
    const userData = seedGruppe({
      heightMode: 'group',
      // Die Panel-Höhen sind bewusst verschieden und dürfen in diesem Modus
      // keine Wirkung haben; maßgeblich ist allein die Gruppen-Höhe, die
      // unter der ID des ersten Panels der Gruppe liegt.
      panelHeights: { outline: 200, bookmarks: 320 },
      groupHeights: { outline: 260 },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      await expect(page.locator(`${LEFT} .sidebar-slot-tabs`)).toBeVisible();

      const vorher = await gruppenHoehe(page);
      expect(vorher).toBe(260);

      await reiterKlicken(page, 1);
      const nachher = await gruppenHoehe(page);
      expect(nachher).toBe(260);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('HM-03: Einzeln stehende Panels', () => {
  test('verhalten sich in beiden Modi gleich', async () => {
    const messen = async (heightMode) => {
      const userData = seedProfile({
        sidebar: {
          layout: {
            left: [
              { panels: ['outline'], active: 'outline' },
              { panels: ['notes'], active: 'notes' },
            ],
            right: [],
          },
          ...(heightMode ? { heightMode } : {}),
          panelHeights: { outline: 240 },
        },
        outline: { visibleColumn0: true },
        notes: { visibleColumn0: true },
      });
      const { app, page } = await launchApp({ args: [BASIS], userData });
      try {
        await waitForTab(page);
        await expect(page.locator(`${LEFT} .sidebar-outline`)).toBeVisible();
        return await page.evaluate((sel) => {
          const el = document.querySelector(`${sel} .sidebar-outline`);
          return Math.round(el.getBoundingClientRect().height);
        }, LEFT);
      } finally {
        await closeApp(app, userData);
      }
    };

    const imPanelModus = await messen(null);
    const imGruppenModus = await messen('group');
    expect(imPanelModus).toBe(240);
    expect(imGruppenModus).toBe(imPanelModus);
  });
});
