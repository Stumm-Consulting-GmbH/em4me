// 4T-0455 (Epic 3E-0084): E2E-Funktions-Suite Bereichs-Graph-Tab.
// GA-01: Öffnen über den Menü-Kanal (read-only System-Seite, Knoten-Zähler,
// alle Bereichs-Dateien als Knoten) und Klick-Navigation zum Nachbarn;
// GA-02: Richtungs-Filter (Erreichbarkeits-Sicht relativ zur beim Öffnen
// aktiven Datei) wirkt auf die Knoten-Menge; GA-03: erneutes Öffnen
// aktiviert den bestehenden Tab statt zu duplizieren; GA-04: ohne Bereich
// lokalisierter Hinweis statt Seite. describe-Titel tragen die Matrix-ID
// (test/abdeckungs-matrix.json, S-076).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

// Menü-Klicks simulieren (Muster smoke.spec.js).
async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Bereichs-Wurzel mit bekanntem Link-Bild:
//   Alpha -> Beta, Quelle -> Alpha, Solo ohne Links.
// Ausgehend von Alpha erreichbar: Alpha, Beta; eingehend: Alpha, Quelle.
function makeArea() {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-graph-area-'));
  fs.writeFileSync(path.join(areaRoot, 'Alpha.md'), '# Alpha\n\nSiehe [[Beta]].\n', 'utf8');
  fs.writeFileSync(path.join(areaRoot, 'Beta.md'), '# Beta\n\nInhalt.\n', 'utf8');
  fs.writeFileSync(path.join(areaRoot, 'Quelle.md'), '# Quelle\n\nZu [[Alpha]].\n', 'utf8');
  fs.writeFileSync(path.join(areaRoot, 'Solo.md'), '# Solo\n\nOhne Links.\n', 'utf8');
  return areaRoot;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// Bereich an das Fenster binden (Muster journale.spec.js).
async function bindArea(page, areaRoot) {
  await expect
    .poll(async () => {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
      return !!(result && result.ok !== false);
    })
    .toBe(true);
}

const GRAPH_PAGE = '.pane-group[data-pane="0"] .graph-page';

// Datei über die Dateiliste des Bereichs-Panels öffnen (der Bereich wird an
// das leere Startfenster gebunden — mit offener Datei erzeugte area:openPath
// ein neues Fenster; Muster journale.spec.js).
async function openAreaFile(page, name) {
  const row = page.locator('.pane-group[data-pane="0"] .area-file-row', { hasText: name });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toHaveText(name);
}

// Graph öffnen und auf den fertig geladenen Stand warten. Der Menü-Kanal
// wird per Poll wiederholt gesendet, weil der Listener erst am Ende des
// asynchronen init() registriert ist (Muster pressUntilVisible der
// Journal-Suite); der Bereichs-Index baut asynchron, der Invalidations-
// Broadcast lädt debounced nach.
async function openGraphAndWait(app, page, expectedNodes) {
  await expect
    .poll(async () => {
      if ((await page.locator(GRAPH_PAGE).count()) === 0) {
        await sendMenuChannel(app, 'menu:openAreaGraph');
      }
      return page.locator(GRAPH_PAGE).count();
    })
    .toBe(1);
  await expect
    .poll(async () => page.locator(`${GRAPH_PAGE} .graph-node`).count(), { timeout: 15000 })
    .toBe(expectedNodes);
}

test.describe('GA-01: Bereichs-Graph öffnet als read-only Tab mit Klick-Navigation (S-076)', () => {
  test('zeigt alle Bereichs-Dateien, Zähler und öffnet per Knoten-Klick', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openAreaFile(page, 'Alpha.md');
      await openGraphAndWait(app, page, 4);

      // Read-only System-Seite: zweiter Tab, View-Buttons deaktiviert.
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await expect(page.locator(SEL.content0)).toHaveClass(/view-system/);
      await expect(page.locator(SEL.btnEdit)).toBeDisabled();
      // Tab-Titel trägt den Bereichs-Namen.
      const areaName = path.basename(areaRoot);
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toHaveText(`Graph: ${areaName}`);
      // Steuerleiste: Knoten-Zähler nennt alle vier Dateien.
      await expect(page.locator(`${GRAPH_PAGE} .graph-node-count`)).toHaveText('4 Dateien');
      // Doppel-Pfeil gibt es hier nicht, aber Kanten mit End-Marker.
      await expect(page.locator(`${GRAPH_PAGE} .graph-edge`)).toHaveCount(2);

      // Klick auf den Beta-Knoten öffnet die Datei als eigenen Tab.
      // Events direkt auf den Knoten dispatchen: ein Koordinaten-Klick kann
      // im dichten Layout das Label eines Nachbar-Knotens treffen.
      const betaNode = page.locator(`${GRAPH_PAGE} .graph-node`, { hasText: 'Beta' });
      await betaNode.dispatchEvent('mousedown', { button: 0, clientX: 10, clientY: 10 });
      await betaNode.dispatchEvent('mouseup', { button: 0, clientX: 10, clientY: 10 });
      await expect(page.locator(SEL.tabs0)).toHaveCount(3);
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toHaveText('Beta.md');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

test.describe('GA-02/GA-03: Richtungs-Filter und Tab-Wiederverwendung (S-076)', () => {
  test('filtert relativ zur aktiven Datei und dupliziert den Tab nicht', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openAreaFile(page, 'Alpha.md');
      await openGraphAndWait(app, page, 4);

      // GA-02: ausgehend von Alpha erreichbar sind Alpha und Beta.
      await page.locator(`${GRAPH_PAGE} .graph-direction`).selectOption('out');
      await expect(page.locator(`${GRAPH_PAGE} .graph-node`)).toHaveCount(2);
      await expect(page.locator(`${GRAPH_PAGE} .graph-node`, { hasText: 'Beta' })).toHaveCount(1);
      await expect(page.locator(`${GRAPH_PAGE} .graph-node-count`)).toHaveText('2 Dateien');

      // Eingehend: Alpha und Quelle.
      await page.locator(`${GRAPH_PAGE} .graph-direction`).selectOption('in');
      await expect(page.locator(`${GRAPH_PAGE} .graph-node`)).toHaveCount(2);
      await expect(page.locator(`${GRAPH_PAGE} .graph-node`, { hasText: 'Quelle' })).toHaveCount(1);

      // Zurück auf beide: voller Graph.
      await page.locator(`${GRAPH_PAGE} .graph-direction`).selectOption('both');
      await expect(page.locator(`${GRAPH_PAGE} .graph-node`)).toHaveCount(4);

      // GA-03: erneutes Öffnen aktiviert den bestehenden Tab (kein Duplikat).
      await page.locator(`${SEL.tabs0}`, { hasText: 'Alpha.md' }).click();
      await sendMenuChannel(app, 'menu:openAreaGraph');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toContainText('Graph:');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

test.describe('GA-04: ohne Bereich deaktiviert (S-076)', () => {
  test('Menü-Kanal ohne Bereich zeigt den lokalisierten Hinweis statt einer Seite', async () => {
    const { app, page, userData } = await launchApp();
    try {
      // Kanal per Poll senden (Listener-Registrierung am init-Ende).
      const hint = page.locator('#statusbar-hint');
      await expect
        .poll(async () => {
          if (!/visible/.test((await hint.getAttribute('class')) || '')) {
            await sendMenuChannel(app, 'menu:openAreaGraph');
          }
          return (await hint.getAttribute('class')) || '';
        })
        .toMatch(/visible/);
      await expect(hint).toHaveClass(/error/);
      await expect(page.locator(GRAPH_PAGE)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

// --- 4T-0456 (Epic 3E-0084): Datei-Graph-Panel --------------------------------

const PANEL = '.pane-group[data-pane="0"] .sidebar-filegraph';

test.describe('GA-06: Datei-Graph-Panel — folgt der Datei, Tiefe und Richtung wirken (S-077)', () => {
  test('zeigt das Umfeld, folgt dem Tab-Wechsel und navigiert per Klick', async () => {
    const areaRoot = makeArea();
    // Kette für die Tiefen-Prüfung: Quelle -> Alpha -> Beta.
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openAreaFile(page, 'Quelle.md');

      // Panel über den Menü-Kanal einschalten (Poll: Listener am init-Ende).
      const panel = page.locator(PANEL);
      await expect
        .poll(async () => {
          if (await panel.isHidden()) await sendMenuChannel(app, 'menu:toggleFileGraph');
          return panel.isVisible();
        })
        .toBe(true);

      // Tiefe 1 ausgehend von Quelle: Quelle und Alpha.
      await expect
        .poll(async () => page.locator(`${PANEL} .graph-node`).count(), { timeout: 15000 })
        .toBe(2);
      await expect(page.locator(`${PANEL} .graph-node-active`)).toHaveCount(1);

      // Tiefe 2: die Kette Quelle -> Alpha -> Beta wird sichtbar.
      await page.locator(`${PANEL} .filegraph-depth`).selectOption('2');
      await expect(page.locator(`${PANEL} .graph-node`)).toHaveCount(3);

      // Richtung eingehend: niemand verlinkt auf Quelle — Einzel-Knoten
      // mit lokalisiertem Hinweis.
      await page.locator(`${PANEL} .filegraph-direction`).selectOption('in');
      await expect(page.locator(`${PANEL} .graph-node`)).toHaveCount(1);
      await expect(page.locator(`${PANEL} .filegraph-note`)).toBeVisible();
      await page.locator(`${PANEL} .filegraph-direction`).selectOption('both');

      // Tab-Wechsel: Panel folgt zur neuen aktiven Datei (Beta hat mit
      // Tiefe 2 beide Nachbarn der Kette: Alpha und Quelle).
      await openAreaFile(page, 'Beta.md');
      await expect(page.locator(`${PANEL} .graph-node`)).toHaveCount(3);
      const active = page.locator(`${PANEL} .graph-node-active`);
      await expect(active).toHaveCount(1);
      await expect(active.locator('.graph-label')).toHaveText('Beta');

      // Klick auf den Alpha-Knoten springt zum offenen Alpha... bzw.
      // öffnet die Datei (Quelle und Beta sind offen, Alpha nicht).
      const alphaNode = page.locator(`${PANEL} .graph-node`, { hasText: 'Alpha' });
      await alphaNode.dispatchEvent('mousedown', { button: 0, clientX: 10, clientY: 10 });
      await alphaNode.dispatchEvent('mouseup', { button: 0, clientX: 10, clientY: 10 });
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toHaveText('Alpha.md');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

// 4T-0455 (PO-Befund der Release-Test-Iteration 0.57.0): Teilen sich zwei
// System-Tabs eine Pane (Graph und Einstellungen), zeigte der Tab-Wechsel
// die jeweils andere Seite weiter an (Mount-Guard ohne Container-Besitz-
// Prüfung). Regressionstest am realen Nutzungspfad: nur Tabs wechseln.
test.describe('GA-07: Graph- und Einstellungs-Tab in derselben Spalte (Regression)', () => {
  test('Tab-Wechsel zwischen zwei System-Seiten zeigt jeweils die richtige Seite', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openGraphAndWait(app, page, 4);

      // Einstellungen als zweiten System-Tab in derselben Spalte öffnen.
      await page.keyboard.press('Control+,');
      const settingsPage = page.locator('.pane-group[data-pane="0"] .settings-page');
      await expect(settingsPage).toBeVisible();
      await expect(page.locator(GRAPH_PAGE)).toHaveCount(0);

      // Zurück zum Graph-Tab: der Graph erscheint wieder (nicht die
      // stehengebliebene Einstellungs-Seite).
      await page.locator(`${SEL.tabs0}`, { hasText: 'Graph:' }).click();
      await expect(page.locator(GRAPH_PAGE)).toBeVisible();
      await expect(page.locator(`${GRAPH_PAGE} .graph-node`)).toHaveCount(4);
      await expect(settingsPage).toHaveCount(0);

      // Und wieder zu den Einstellungen: Formular statt Graph.
      await page.locator(`${SEL.tabs0}`, { hasText: 'Einstellungen' }).click();
      await expect(settingsPage).toBeVisible();
      await expect(page.locator(GRAPH_PAGE)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

test.describe('GA-05: Kontextmenü des Bereichs-Panels öffnet den Graph (S-076)', () => {
  test('Rechtsklick auf das Bereichs-Panel zeigt den Eintrag und öffnet den Tab', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      // Bereichs-Panel ist in Bereichs-Apps in Spalte 0 default-sichtbar.
      const areaSection = page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(areaSection).toBeVisible();
      await areaSection.click({ button: 'right' });
      const item = page.locator('#context-menu .context-menu-item', {
        hasText: 'Bereichs-Graph',
      });
      await expect(item).toBeVisible();
      await item.click();
      await expect(page.locator(GRAPH_PAGE)).toBeVisible();
      // Leeres Bereichs-Fenster: der Graph ist der erste (einzige) Tab.
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});
