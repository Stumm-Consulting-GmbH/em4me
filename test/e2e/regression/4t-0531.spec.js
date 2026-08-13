// 4T-0531 (Epic 3E-0088): Start-Wiederherstellung der Panel-Sichtbarkeit.
// Die Init-Schleife in applyAllLayouts (views/pane-render.js) kannte nur die sieben
// älteren Panels; ein als sichtbar persistiertes Kalender-, Block-
// Eigenschaften-, Datei-Graph-, Bereichs- oder Unterseiten-Panel blieb nach
// dem Start verborgen, bis sein Toggle einmal feuerte. Der Fix wendet die
// Sichtbarkeit generisch über die Panel-Registry an; der Fall prüft zwei der
// zuvor fehlenden Panels direkt nach dem Start.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');
const LEFT = '.pane-group[data-pane="0"] .pane-sidebar-left';

// Profil-Verzeichnis mit vorbefüllter electron-store-config.json (Muster
// seedProfile in test/e2e/funktionen/sidebar-layout.spec.js).
function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-4t0531-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('4T-0531: persistierte Panel-Sichtbarkeit beim Start', () => {
  test('Kalender- und Block-Eigenschaften-Panel sind nach dem Start sichtbar', async () => {
    // 4T-0563 (Epic 3E-0102): explizites flaches Layout, damit calendar und
    // blockprops als Einzel-Slots links liegen (der neue Standard legt
    // blockprops rechts) — dieser Test prüft die Sichtbarkeits-
    // Wiederherstellung beim Start, nicht die Standard-Anordnung.
    const userData = seedProfile({
      calendar: { visibleColumn0: true },
      blockProps: { visibleColumn0: true },
      sidebar: {
        layout: {
          left: [
            { panels: ['calendar'], active: 'calendar' },
            { panels: ['blockprops'], active: 'blockprops' },
          ],
          right: [],
        },
      },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      // Beide Panels erscheinen ohne jeden Toggle-Klick direkt nach dem
      // Start (vor dem Fix blieben ihre Sektionen verborgen).
      await expect(page.locator(`${LEFT} .sidebar-calendar`)).toBeVisible();
      await expect(page.locator(`${LEFT} .sidebar-blockprops`)).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
