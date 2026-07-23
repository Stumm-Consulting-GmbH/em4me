// 4T-0170: Regressionstests fuer die Datenverlust-Fixes im Tab- und
// Fenster-Management (R4-01, R4-02, R4-03). R4-08 (Timing-Fenster im
// reloadFile-Roundtrip) ist nicht automatisierbar — manueller Pruefpfad
// im Task dokumentiert.
//
// Tab-Erzeugung laeuft ueber den gepufferten 'tab:appendFromOtherWindow'-
// Pfad (Modulkopf-Registrierung im Renderer, kein Event-Verlust waehrend
// init); 'menu:new' wuerde vor Abschluss der UI-Bindings verpuffen.
// closeApp mit force, weil die Tests absichtlich dirty Buffer hinterlassen
// (normaler Close-Pfad wuerde im nativen Speichern-Dialog haengen).
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke');
const BASIS = path.join(FIXTURES, 'basis.md');
const ZWEITE = path.join(FIXTURES, 'zweite.md');

// Schickt ein Tab-Payload an das erste Fenster (Pfad von tab:appendToWindow).
async function appendTab(app, payload) {
  await app.evaluate(({ BrowserWindow }, p) => {
    BrowserWindow.getAllWindows()[0].webContents.send('tab:appendFromOtherWindow', p);
  }, payload);
}

async function editorText(page) {
  return page.locator(SEL.editorContent0).innerText();
}

test.describe('R4-01: Tab-Transfer korrumpiert den aktiven Tab nicht', () => {
  test('Append auf Hintergrund-Tab lässt den Vordergrund-Tab unverändert', async () => {
    // basis.md ist Hintergrund-Tab, zweite.md aktiv.
    const { app, page, userData } = await launchApp({ args: [BASIS, ZWEITE] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/zweite/);

      // Transfer derselben basis.md (dirty Buffer) wie aus einem anderen Fenster.
      await appendTab(app, {
        path: path.resolve(BASIS),
        content: 'TRANSFER-BUFFER',
        dirty: true,
        settings: {},
      });

      // Der basis-Tab wird aktiv und traegt den Transfer-Buffer (dirty).
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/basis/);
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
      await page.locator(SEL.viewBtn('source')).click();
      expect(await editorText(page)).toContain('TRANSFER-BUFFER');

      // Der vorher aktive zweite-Tab ist unveraendert (Inhalt intakt, nicht dirty).
      await page.locator(SEL.tabs0).filter({ hasText: 'zweite' }).click();
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/zweite/);
      await page.locator(SEL.viewBtn('source')).click();
      const text = await editorText(page);
      expect(text).toContain('Zweite Datei');
      expect(text).not.toContain('TRANSFER-BUFFER');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1); // weiterhin nur basis
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('R4-02: Unbenannt-Tab überlebt das Verschieben zwischen Panes', () => {
  test('Unbenannt zu Unbenannt in Pane 2 — Inhalt bleibt erhalten', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await expect(page.locator(SEL.emptyState)).toBeVisible();

      // U1 mit Inhalt (dirty), U2 leer — beide ueber den gepufferten Append-Pfad.
      await appendTab(app, {
        path: null,
        content: 'INHALT-U1',
        dirty: true,
        settings: { viewMode: 'split' },
      });
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await appendTab(app, {
        path: null,
        content: '',
        dirty: false,
        settings: { viewMode: 'split' },
      });
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);

      // U2 (aktiv) nach rechts — Pane 2 entsteht mit U2.
      await page.keyboard.press('Control+Alt+ArrowRight');
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);

      // Zurueck zu U1 (Pane 0) und ebenfalls nach rechts verschieben.
      await page.locator(SEL.tabs0).first().click();
      await page.keyboard.press('Control+Alt+ArrowRight');

      // Vor dem Fix verschwand U1 (Duplikat-Match null === null).
      // Nach dem Fix: Pane 0 kollabiert, eine Pane mit beiden Unbenannt-Tabs.
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      expect(await editorText(page)).toContain('INHALT-U1');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('R4-03: Dirty Unbenannt-Tab in neues Fenster verschieben', () => {
  test('Inhalt ist im neuen Fenster vorhanden, Quell-Fenster leer', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await appendTab(app, {
        path: null,
        content: 'TRANSFER-INHALT',
        dirty: true,
        settings: { viewMode: 'split' },
      });
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);

      // Kontextmenue auf dem Tab: Solo-Fenster-Reihenfolge ist
      // [nach rechts, in neues Fenster verschieben, kopieren,
      // neue Gruppe (4T-0461, Epic 3E-0085), schliessen].
      await page.locator(SEL.tabs0).first().click({ button: 'right' });
      const menuItems = page.locator('#context-menu .context-menu-item');
      await expect(menuItems).toHaveCount(5);

      const newWindowPromise = app.waitForEvent('window');
      await menuItems.nth(1).click();
      const page2 = await newWindowPromise;

      // Neues Fenster traegt den Tab samt dirty Buffer.
      await expect(page2.locator(SEL.tabs0)).toHaveCount(1);
      await expect(page2.locator(SEL.dirtyTab0)).toHaveCount(1);
      await page2.locator(SEL.viewBtn('source')).click();
      expect(await page2.locator(SEL.editorContent0).innerText()).toContain('TRANSFER-INHALT');

      // Quell-Fenster ist leer (Tab wurde verschoben, nicht kopiert).
      await expect(page.locator(SEL.tabs0)).toHaveCount(0);
      await expect(page.locator(SEL.emptyState)).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
