// Epic 3E-000059: Bereichs-Panel — Ordnerbaum und Dateiliste.
//
// BP-01 (4T-000327): In einer leeren Bereichs-App zeigt sich das Panel
//        automatisch; der Baum zeigt Wurzel und Unterordner, die Dateiliste
//        die Markdown-Dateien des gewählten Ordners (voller Pfad als
//        Tooltip); Ordner-Klick wechselt die Dateiliste; Datei-Klick öffnet
//        den Tab; der Statusbar-Toggle blendet das Panel aus und ein.
// BP-02 (4T-000328): extern angelegte Dateien erscheinen über den
//        Verzeichnis-Watcher automatisch im Panel.
// BP-03 (4T-000328): "Neue Datei in diesem Ordner" legt an und öffnet den
//        Tab; Namens-Kollision wird gemeldet statt zu überschreiben.
// BP-04 (4T-000347): In einer Bereichs-App findet das Backlinks-Panel Verweise
//        aus dem gesamten Bereichs-Baum (auch aus anderen Ordnern jenseits der
//        bisherigen Tiefen-Grenze); die Quelldatei zeigt den Ordner relativ
//        zur Bereichs-Wurzel als zweite Zeile.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

function makeAreaTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-bp-'));
  fs.writeFileSync(path.join(dir, 'alpha.md'), '# Alpha\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'beta.md'), '# Beta\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'notiz.txt'), 'keine Markdown-Datei\n', 'utf8');
  fs.mkdirSync(path.join(dir, 'Unterordner'));
  fs.writeFileSync(path.join(dir, 'Unterordner', 'gamma.md'), '# Gamma\n', 'utf8');
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Verzeichnis bleibt liegen; unkritisch.
  }
}

test.describe('BP-01: Bereichs-Panel (4T-000327)', () => {
  test('Baum, Dateiliste, Öffnen per Klick, Tooltip und Toggle', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaTree();
    try {
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      await expect.poll(() => page.title()).toContain('(Bereich');

      // Leere Bereichs-App: Panel automatisch sichtbar, Baum mit Wurzel
      // und Unterordner, Dateiliste des Wurzelordners ohne .txt-Datei.
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(section).toBeVisible();
      const dirRows = section.locator('.area-dir-row');
      await expect(dirRows).toHaveCount(2);
      await expect(dirRows.nth(0)).toHaveText(/▾?.*/);
      expect(await dirRows.nth(0).getAttribute('title')).toBe(dir);
      await expect(dirRows.nth(1)).toContainText('Unterordner');

      const fileRows = section.locator('.area-file-row');
      await expect(fileRows).toHaveCount(2);
      await expect(fileRows.nth(0)).toHaveText('alpha.md');
      await expect(fileRows.nth(1)).toHaveText('beta.md');
      expect(await fileRows.nth(0).getAttribute('title')).toBe(path.join(dir, 'alpha.md'));

      // Ordner-Klick wechselt die Dateiliste auf den Unterordner.
      await dirRows.nth(1).click();
      await expect(section.locator('.area-file-row')).toHaveCount(1);
      await expect(section.locator('.area-file-row').first()).toHaveText('gamma.md');
      await expect(section.locator('.area-files-title')).toHaveText('Unterordner');

      // Datei-Klick öffnet den Tab.
      await section.locator('.area-file-row').first().click();
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab')).toHaveCount(1);
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab .tab-title')).toHaveText(
        /gamma/,
      );

      // Panel bleibt nach dem Öffnen sichtbar (Bereichs-Fenster starten mit
      // sichtbarem Panel); der Statusbar-Toggle blendet aus und wieder ein.
      await expect(section).toBeVisible();
      const btn = page.locator('#btn-area');
      await btn.click();
      await expect(section).toBeHidden();
      await btn.click();
      await expect(section).toBeVisible();
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

test.describe('BP-02/BP-03: Watcher-Aktualisierung und neue Datei (4T-000328)', () => {
  test('externe Anlage erscheint automatisch; neue Datei anlegen und öffnen', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaTree();
    try {
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(section).toBeVisible();
      await expect(section.locator('.area-file-row')).toHaveCount(2);

      // BP-02: extern angelegte Datei erscheint ohne manuelles Zutun.
      fs.writeFileSync(path.join(dir, 'delta.md'), '# Delta\n', 'utf8');
      await expect(section.locator('.area-file-row')).toHaveCount(3);
      await expect(section.locator('.area-file-row').nth(2)).toHaveText('delta.md');

      // BP-03: neue Datei über den Kopf-Button anlegen (Endung wird ergänzt).
      await section.locator('.area-new-file-btn').click();
      const input = section.locator('.area-new-file-input');
      await expect(input).toBeVisible();
      await input.fill('epsilon');
      await input.press('Enter');
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab .tab-title')).toHaveText(
        /epsilon/,
      );
      expect(fs.existsSync(path.join(dir, 'epsilon.md'))).toBe(true);
      await expect(section.locator('.area-file-row')).toHaveCount(4);

      // Kollision: gleicher Name wird gemeldet, Datei bleibt unangetastet.
      await section.locator('.area-new-file-btn').click();
      const input2 = section.locator('.area-new-file-input');
      await input2.fill('epsilon.md');
      await input2.press('Enter');
      await expect(page.locator('#statusbar-hint')).toHaveClass(/visible/);
      await expect(section.locator('.area-file-row')).toHaveCount(4);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

test.describe('BP-04: Bereichsweiter Link-Index (4T-000347)', () => {
  test('Backlink aus anderem Ordner erscheint, Ordner relativ zur Wurzel', async () => {
    const { app, page, userData } = await launchApp();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-bi-'));
    fs.mkdirSync(path.join(dir, 'ziele'));
    fs.mkdirSync(path.join(dir, 'quellen'));
    fs.writeFileSync(path.join(dir, 'ziele', 'Ziel.md'), '# Ziel\n', 'utf8');
    fs.writeFileSync(
      path.join(dir, 'quellen', 'Quelle.md'),
      '# Quelle\n\nVerweis auf [[Ziel]].\n',
      'utf8',
    );
    try {
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      await expect.poll(() => page.title()).toContain('(Bereich');

      const section = page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(section).toBeVisible();

      // In den Ordner "ziele" wechseln und Ziel.md oeffnen.
      await section.locator('.area-dir-row', { hasText: 'ziele' }).click();
      await section.locator('.area-file-row', { hasText: 'Ziel.md' }).click();
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab')).toHaveCount(1);

      // Backlinks-Panel einblenden. Der bereichsweite Index findet die Quelle
      // aus dem anderen Ordner; bereichslos laege sie ausserhalb des Suchraums.
      await page.locator('#btn-backlinks').click();
      const bl = page.locator('.pane-group[data-pane="0"] .sidebar-backlinks');
      await expect(bl).toBeVisible();

      const group = bl.locator('.backlinks-group').first();
      await expect(group.locator('.backlinks-group-name')).toHaveText('Quelle.md', {
        timeout: 15000,
      });
      // Zweizeilig: Ordner relativ zur Bereichs-Wurzel (nicht absolut).
      await expect(group.locator('.backlinks-group-dir')).toHaveText('quellen');
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});
