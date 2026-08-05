// 4T-0620 (Epic 3E-0117): E2E-Funktions-Suite der Bereichs-Statistik.
// BS-01: Öffnen über den Menü-Kanal (read-only System-Seite, sechs
// Abschnitte, Zahlen treffen den angelegten Bestand); BS-02: erneutes
// Öffnen aktiviert den bestehenden Tab statt zu duplizieren; BS-03:
// Aktualisieren nach einer neuen Datei zeigt die erhöhte Zahl; BS-04: ohne
// Bereich lokalisierter Hinweis statt Seite; BS-05: Klick auf einen
// Dateinamen der Auffälligkeiten öffnet die Datei; BS-06: Erweiterung aus
// entfernt das Kommando. describe-Titel tragen die Matrix-ID
// (test/abdeckungs-matrix.json, S-118).
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

// Bereichs-Wurzel mit bekanntem Bestand:
//   3 Markdown-Dateien, 1 Unterordner, 1 Bild, 1 Begleitdatei zu Start.md.
//   Start -> Ziel (Wiki-Verweis), Ziel und Solo ohne ausgehende Verweise.
function makeArea() {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-stats-e2e-'));
  fs.writeFileSync(
    path.join(areaRoot, 'Start.md'),
    '---\ntags: [projekt]\n---\n\n# Start\n\nSiehe [[Ziel]].\n\n- [ ] offene Aufgabe\n',
    'utf8',
  );
  fs.writeFileSync(path.join(areaRoot, 'Ziel.md'), '# Ziel\n\nInhalt.\n', 'utf8');
  fs.writeFileSync(path.join(areaRoot, 'Solo.md'), '# Solo\n\nOhne Verweise.\n', 'utf8');
  fs.mkdirSync(path.join(areaRoot, 'Anlagen'));
  fs.writeFileSync(path.join(areaRoot, 'Anlagen', 'bild.png'), 'PNG-Attrappe', 'utf8');
  fs.writeFileSync(path.join(areaRoot, 'Start.mdd'), 'Begleit', 'utf8');
  return areaRoot;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// Bereich an das Fenster binden (Muster graphenansicht.spec.js).
async function bindArea(page, areaRoot) {
  await expect
    .poll(async () => {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
      return !!(result && result.ok !== false);
    })
    .toBe(true);
}

const STATS_PAGE = '.pane-group[data-pane="0"] .area-stats-page';

// Seite öffnen und auf erhobene Zahlen warten. Der Menü-Kanal wird per Poll
// wiederholt gesendet, weil der Listener erst am Ende des asynchronen
// init() registriert ist; der Bereichs-Index baut asynchron auf, deshalb
// wird zusätzlich auf einen Stand-Zeitstempel gewartet.
async function openStatsAndWait(app, page) {
  await expect
    .poll(async () => {
      if ((await page.locator(STATS_PAGE).count()) === 0) {
        await sendMenuChannel(app, 'menu:openAreaStats');
      }
      return page.locator(STATS_PAGE).count();
    })
    .toBe(1);
  await expect(page.locator(`${STATS_PAGE} .area-stats-stand`)).toBeVisible({ timeout: 15000 });
}

// Wert einer Kennzahlen-Zeile über ihre Beschriftung.
function figure(page, label) {
  return page.locator(`${STATS_PAGE} .area-stats-figures tr`, { hasText: label }).first();
}

test.describe('BS-01: Statistik-Seite öffnet als read-only Tab mit allen Abschnitten (S-118)', () => {
  test('zeigt sechs Abschnitte und Zahlen, die den Bestand treffen', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openStatsAndWait(app, page);

      // Read-only System-Seite: eigener Tab, View-Buttons deaktiviert.
      await expect(page.locator(SEL.content0)).toHaveClass(/view-system/);
      await expect(page.locator(SEL.btnEdit)).toBeDisabled();
      const areaName = path.basename(areaRoot);
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toHaveText(
        `Bereichs-Statistik: ${areaName}`,
      );

      // Sechs Abschnitte in der festgelegten Reihenfolge.
      await expect(page.locator(`${STATS_PAGE} .area-stats-section-title`)).toHaveCount(6);

      // Zahlen des angelegten Bestands: 3 Markdown-Dateien, 1 Bild als
      // einzige Nicht-Markdown-Datei, 1 Ordner. Die Begleitdatei zählt
      // ausdrücklich NICHT als Nicht-Markdown-Datei.
      await expect(figure(page, 'Markdown-Dateien')).toContainText('3');
      await expect(figure(page, 'Nicht-Markdown-Dateien')).toContainText('1');
      await expect(figure(page, 'Ordner')).toContainText('1');
      await expect(figure(page, 'Markdown-Dateien mit Begleitdatei')).toContainText('1 von 3');
      await expect(figure(page, 'Aufgaben')).toContainText('1');
      await expect(figure(page, 'Wiki-Verweise')).toContainText('1');

      // Häufigkeits-Tabelle der Tags: der eine Tag mit einer Datei.
      await expect(page.locator(`${STATS_PAGE} .area-stats-table`).first()).toBeVisible();
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

test.describe('BS-02/BS-03: Tab-Wiederverwendung und Aktualisieren (S-118)', () => {
  test('dupliziert den Tab nicht und zeigt nach dem Aktualisieren frische Zahlen', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openStatsAndWait(app, page);
      const tabCount = await page.locator(SEL.tabs0).count();

      // BS-02: erneutes Öffnen aktiviert den bestehenden Tab.
      await sendMenuChannel(app, 'menu:openAreaStats');
      await expect(page.locator(SEL.tabs0)).toHaveCount(tabCount);
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toContainText(
        'Bereichs-Statistik:',
      );

      // BS-03: neue Datei anlegen, dann aktualisieren.
      fs.writeFileSync(path.join(areaRoot, 'Neu.md'), '# Neu\n', 'utf8');
      await expect
        .poll(
          async () => {
            await page.locator(`${STATS_PAGE} .area-stats-refresh`).click();
            return figure(page, 'Markdown-Dateien').textContent();
          },
          { timeout: 20000 },
        )
        .toContain('4');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

test.describe('BS-05: Klick auf eine auffällige Datei öffnet sie (S-118)', () => {
  test('öffnet die Datei als eigenen Tab', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openStatsAndWait(app, page);
      const tabCount = await page.locator(SEL.tabs0).count();

      await page.locator(`${STATS_PAGE} .area-stats-file`).first().click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(tabCount + 1);
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toContainText('.md');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

test.describe('BS-04: ohne Bereich deaktiviert (S-118)', () => {
  test('Menü-Kanal ohne Bereich zeigt den lokalisierten Hinweis statt einer Seite', async () => {
    const { app, page, userData } = await launchApp();
    try {
      const hint = page.locator('#statusbar-hint');
      await expect
        .poll(async () => {
          if (!/visible/.test((await hint.getAttribute('class')) || '')) {
            await sendMenuChannel(app, 'menu:openAreaStats');
          }
          return (await hint.getAttribute('class')) || '';
        })
        .toMatch(/visible/);
      await expect(hint).toHaveClass(/error/);
      await expect(page.locator(STATS_PAGE)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('BS-06: Erweiterung aus entfernt den Kontextmenü-Zugang (S-118)', () => {
  test('das Bereichs-Panel zeigt beide Einträge, im Aus-Zustand nur den Graph', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    void app;
    try {
      await bindArea(page, areaRoot);
      const row = page.locator('.pane-group[data-pane="0"] .area-file-row', {
        hasText: 'Start.md',
      });
      await expect(row).toBeVisible();

      // Beide Erweiterungen aktiv: beide panel-weiten Einträge stehen da.
      await row.click({ button: 'right' });
      await expect(page.locator('#context-menu [data-menu-id="area-panel-graph"]')).toBeVisible();
      await expect(page.locator('#context-menu [data-menu-id="area-panel-stats"]')).toBeVisible();
      await page.keyboard.press('Escape');

      // Statistik-Erweiterung aus: nur der Graph-Eintrag bleibt. Das
      // Anwenden der Einstellung läuft asynchron, deshalb per Poll.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', ['area-stats']));
      await expect
        .poll(async () => {
          // 4T-0874: Vor jedem Versuch das ggf. offene Menue schliessen —
          // ein zweiter Rechtsklick bei offenem Menue trifft das Menue statt
          // die Zeile, und der Poll bliebe auf dem alten Stand stehen.
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
          await row.click({ button: 'right' });
          return page.locator('#context-menu [data-menu-id="area-panel-stats"]').count();
        })
        .toBe(0);
      await expect(page.locator('#context-menu [data-menu-id="area-panel-graph"]')).toBeVisible();
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});
