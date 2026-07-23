// 4T-0315 (Epic 3E-0056): Regressionstest — das Submenü des Tab-
// Kontextmenüs („Verschieben in" / „Kopieren in") lag bei Tabs nahe dem
// rechten Fensterrand außerhalb des Fensters (öffnete stur rechts vom
// Eintrag, left: 100%, ohne Viewport-Prüfung) und war nicht bedienbar.
// Die Submenüs erscheinen nur im Multi-Window-Fall; der Test erzeugt
// deshalb ein zweites Fenster.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'frontmatter.md');

// Kontextmenü per synthetischem Event mit gezielter Klick-Position öffnen
// (die Menü-Position folgt event.clientX/clientY; der reale Tab sitzt
// links, der Fehler tritt aber an der Klick-Position am rechten Rand auf).
async function openTabContextMenuAt(page, clientX, clientY) {
  await page.evaluate(
    ({ x, y }) => {
      const tab = document.querySelector('.pane-group[data-pane="0"] .tabbar .tab');
      tab.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        }),
      );
    },
    { x: clientX, y: clientY },
  );
  await expect(page.locator('#context-menu .context-menu-item-submenu').first()).toBeVisible();
}

test.describe('S-03: Tab-Kontextmenü-Submenü bleibt im Fenster (4T-0315)', () => {
  test('am rechten Rand öffnet das Submenü links, in der Mitte rechts', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      // Zweites Fenster: erst damit zeigen die Tab-Kontextmenüs Submenüs.
      await expect
        .poll(async () => {
          const count = await app.evaluate(
            ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
          );
          if (count < 2) await page.evaluate(() => window.api.openNewWindow([]));
          return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
        })
        .toBe(2);

      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));

      // Fall 1: Klick nahe dem rechten Fensterrand — das Submenü muss nach
      // links ausweichen und vollständig im Fenster liegen.
      await openTabContextMenuAt(page, viewport.width - 8, 8);
      const moveItem = page.locator('#context-menu .context-menu-item-submenu').first();
      await moveItem.hover();
      const submenu = moveItem.locator('.context-menu-submenu');
      await expect(submenu).toBeVisible();
      await expect(submenu).toHaveClass(/context-menu-submenu-left/);
      const box = await submenu.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

      // Menü schließen (Klick außerhalb).
      await page.mouse.click(viewport.width / 2, viewport.height / 2);
      await expect(page.locator('#context-menu')).toBeHidden();

      // Fall 2 (Gegenprobe): Klick in der Fenstermitte — das Submenü
      // öffnet wie bisher rechts vom Eintrag.
      await openTabContextMenuAt(page, Math.round(viewport.width / 2), 8);
      const moveItem2 = page.locator('#context-menu .context-menu-item-submenu').first();
      await moveItem2.hover();
      const submenu2 = moveItem2.locator('.context-menu-submenu');
      await expect(submenu2).toBeVisible();
      await expect(submenu2).not.toHaveClass(/context-menu-submenu-left/);
      const box2 = await submenu2.boundingBox();
      expect(box2.x + box2.width).toBeLessThanOrEqual(viewport.width + 1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
