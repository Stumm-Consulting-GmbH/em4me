// Epic 3E-000058: Bereiche — Öffnen, Automatik-Regeln, Schließen, Restore.
//
// BE-01 (4T-000322): Bereich in leerer App öffnen bindet die App (Titel
//        "(Bereich <Name>)", kein neues Fenster).
// BE-02 (4T-000322): Bereich öffnen bei geöffneter Datei erzeugt eine neue
//        Bereichs-Applikation; die Quell-App bleibt unverändert.
// BE-03 (4T-000322): derselbe Bereich erneut → Sprung statt Duplikat.
// BE-04 (4T-000322): Bereich schließen schließt die Fenster der Bereichs-App.
// BE-05 (4T-000322): die Bereichs-Bindung überlebt Beenden und Neustart.
// BE-06 (4T-000323): harte Grenze im Lese-Pfad — file:read weist Dateien
//        außerhalb des Bereichs ab (zweite Linie hinter den UI-Pfaden).
// BE-07 (4T-000323): Tab-Transfer in eine Bereichs-App wird für Dateien
//        außerhalb des Bereichs abgewiesen (reason 'outside-area').
// BE-08 (4T-000324): Außen-Link-Warnung — hinauszeigende Links tragen im
//        Render-Pane die Warn-Klasse samt Pfad-Tooltip; der Klick öffnet
//        nicht und meldet den Grund in der Statusbar.
// BE-09 (4T-000325): Zuletzt geöffnete Bereiche — jedes Öffnen pflegt die
//        Liste (jüngste zuerst, dedupliziert); der Menü-Klick selbst ist
//        natives Menü und manueller Test.
// Der native Ordner-Dialog (area:open), die Dialog-Vorbelegungen und der
// Zuletzt-geöffnet-Filter (natives Menü) sind manueller Test; die Specs
// nutzen den Pfad-Einstieg area:openPath (identische Strecke ab Ordner-Wahl).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

const FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke');
const BASIS = path.join(FIXTURES, 'basis.md');

function makeAreaDir(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `scg-md-bereich-${name}-`));
  fs.writeFileSync(path.join(dir, 'notiz.md'), '# Notiz\n\nInhalt.\n', 'utf8');
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Verzeichnis bleibt liegen; unkritisch.
  }
}

const windowCount = (app) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

test.describe('BE-01: Bereich in leerer App öffnen (4T-000322)', () => {
  test('bindet die App: Bereichs-Titel, kein neues Fenster', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaDir('be01');
    try {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), dir);
      expect(result.boundExisting).toBe(true);
      await expect.poll(() => page.title()).toContain(`(Bereich ${path.basename(dir)})`);
      expect(await windowCount(app)).toBe(1);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

test.describe('BE-02 bis BE-04: Bereich bei geöffneter Datei, Doppel-Öffnung, Schließen', () => {
  test('neue Bereichs-App, Sprung statt Duplikat, Schließen der Bereichs-App', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    const dir = makeAreaDir('be02');
    try {
      // Datei ist offen (CLI-Pfad), die App gilt als belegt.
      await expect.poll(() => page.title()).toContain('basis');

      // BE-02: Bereich öffnen erzeugt eine NEUE Applikation mit Bereich.
      const winPromise = app.waitForEvent('window');
      const result = await page.evaluate((p) => window.api.openAreaPath(p), dir);
      expect(result.createdNew).toBe(true);
      const page2 = await winPromise;
      await page2.waitForLoadState('domcontentloaded');
      await expect.poll(() => page2.title()).toContain(`(Bereich ${path.basename(dir)})`);
      // Quell-App bleibt bereichslos (App-Teil ja, Bereichs-Teil nein).
      expect(await page.title()).not.toContain('Bereich');
      expect(await windowCount(app)).toBe(2);

      // BE-03: derselbe Bereich erneut → Sprung in die laufende Bereichs-App.
      const again = await page.evaluate((p) => window.api.openAreaPath(p), dir);
      expect(again.focusedExisting).toBe(true);
      expect(await windowCount(app)).toBe(2);

      // BE-04: Bereich schließen schließt alle Fenster der Bereichs-App.
      await page2.evaluate(() => {
        window.api.closeArea();
      });
      await expect.poll(() => windowCount(app)).toBe(1);
      await expect.poll(() => page.title()).toContain('basis');
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

test.describe('BE-06/BE-07: Harte Bereichsgrenzen (4T-000323)', () => {
  test('file:read und Tab-Transfer weisen Dateien außerhalb des Bereichs ab', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    const dir = makeAreaDir('be06');
    try {
      await expect.poll(() => page.title()).toContain('basis');

      // Bereichs-App als zweite App erzeugen.
      const winPromise = app.waitForEvent('window');
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      const page2 = await winPromise;
      await page2.waitForLoadState('domcontentloaded');
      await expect.poll(() => page2.title()).toContain('(Bereich');

      // BE-06: Lesen innerhalb ok, außerhalb abgewiesen (zweite Linie).
      const inside = await page2.evaluate(
        (p) => window.api.readFile(p),
        path.join(dir, 'notiz.md'),
      );
      expect(inside.ok).toBe(true);
      const outside = await page2.evaluate((p) => window.api.readFile(p), BASIS);
      expect(outside.ok).toBe(false);
      expect(outside.error).toBe('outside-area');

      // BE-07: Tab-Transfer der Außen-Datei in die Bereichs-App abgewiesen.
      const areaWindowId = await page.evaluate(async () => {
        const list = await window.api.listWindows();
        const target = list.find((w) => w.areaName);
        return target ? target.id : null;
      });
      expect(areaWindowId).not.toBeNull();
      const transfer = await page.evaluate(
        ({ id, p }) => window.api.appendTabToWindow(id, { path: p, content: '', dirty: false }),
        { id: areaWindowId, p: BASIS },
      );
      expect(transfer.ok).toBe(false);
      expect(transfer.reason).toBe('outside-area');
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

test.describe('BE-08: Außen-Link-Warnung (4T-000324)', () => {
  test('Marker im Render-Pane, Klick öffnet nicht und meldet den Grund', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-bereich-be08-'));
    const dir = path.join(parent, 'Bereich');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(parent, 'aussen.md'), '# Außen\n', 'utf8');
    fs.writeFileSync(
      path.join(dir, 'start.md'),
      '# Start\n\n[Raus](../aussen.md) und [Drin](innen.md)\n',
      'utf8',
    );
    fs.writeFileSync(path.join(dir, 'innen.md'), '# Innen\n', 'utf8');
    const { app, page, userData } = await launchApp();
    try {
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      await expect.poll(() => page.title()).toContain('(Bereich');
      // Datei über den Main-Kanal in das Bereichs-Fenster öffnen.
      await app.evaluate(
        ({ BrowserWindow }, p) => {
          BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [p]);
        },
        path.join(dir, 'start.md'),
      );

      const outsideLink = page.locator('.markdown-body a.outside-area-link');
      await expect(outsideLink).toHaveCount(1);
      await expect(outsideLink).toHaveText('Raus');
      const title = await outsideLink.getAttribute('title');
      expect(title).toContain('aussen.md');

      // Klick öffnet nicht (weiterhin ein Tab) und meldet den Grund.
      await outsideLink.click();
      await expect(page.locator('#statusbar-hint')).toHaveClass(/visible/);
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab')).toHaveCount(1);

      // Innen-Link bleibt unmarkiert und öffnet normal.
      const insideLink = page.locator('.markdown-body a:not(.outside-area-link)', {
        hasText: 'Drin',
      });
      await expect(insideLink).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
      removeDir(parent);
    }
  });
});

test.describe('BE-09: Zuletzt geöffnete Bereiche (4T-000325)', () => {
  test('Liste wird bei jedem Öffnen gepflegt (jüngste zuerst, ohne Duplikate)', async () => {
    const { app, page, userData } = await launchApp();
    const dirA = makeAreaDir('be09a');
    const dirB = makeAreaDir('be09b');
    try {
      await page.evaluate((p) => window.api.openAreaPath(p), dirA);
      await expect
        .poll(() => page.evaluate(() => window.api.getSetting('recentAreas')))
        .toEqual([dirA]);

      // Zweiter Bereich (aus der Bereichs-App heraus -> neue App).
      const winPromise = app.waitForEvent('window');
      await page.evaluate((p) => window.api.openAreaPath(p), dirB);
      await winPromise;
      await expect
        .poll(() => page.evaluate(() => window.api.getSetting('recentAreas')))
        .toEqual([dirB, dirA]);

      // Ersten Bereich erneut öffnen: Sprung plus Nach-vorn-Rücken, kein Duplikat.
      await page.evaluate((p) => window.api.openAreaPath(p), dirA);
      await expect
        .poll(() => page.evaluate(() => window.api.getSetting('recentAreas')))
        .toEqual([dirA, dirB]);
    } finally {
      await closeApp(app, userData);
      removeDir(dirA);
      removeDir(dirB);
    }
  });
});

test.describe('BE-05: Bereichs-Bindung überlebt den Neustart (4T-000322)', () => {
  test('Bereich wird mit der Sitzung wiederhergestellt', async () => {
    const first = await launchApp();
    const userData = first.userData;
    const dir = makeAreaDir('be05');
    try {
      await first.page.evaluate((p) => window.api.openAreaPath(p), dir);
      await expect.poll(() => first.page.title()).toContain(`(Bereich ${path.basename(dir)})`);

      await first.app.evaluate(({ app }) => app.quit());
      await first.app.waitForEvent('close');

      const second = await launchApp({ userData });
      try {
        await expect.poll(() => second.page.title()).toContain(`(Bereich ${path.basename(dir)})`);
      } finally {
        await closeApp(second.app, null);
      }
    } finally {
      await closeApp(first.app, userData);
      removeDir(dir);
    }
  });
});
