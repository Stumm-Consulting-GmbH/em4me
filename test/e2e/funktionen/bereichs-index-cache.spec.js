// Epic 3E-0062: Bereichs-Index-Persistenz (Area_Cache.mdda).
//
// BIC-01 (4T-0348): Beim Oeffnen eines Bereichs wird der Index proaktiv
//        aufgebaut und in Area_Cache.mdda persistiert, OHNE dass ein Dokument
//        oder Panel offen sein muss ("automatisch beim Start"). Die Cache-Datei
//        erscheint nicht in der Bereichs-Panel-Dateiliste. Nach Schliessen und
//        erneutem Oeffnen (Warmstart) liefert das Backlinks-Panel dieselben
//        Treffer wie beim Kaltstart (Funktions-Paritaet; der Zeitgewinn ist
//        bewusst kein Testkriterium).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

function makeAreaTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-bic-'));
  fs.writeFileSync(path.join(dir, 'Ziel.md'), '# Ziel\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'Quelle.md'), '# Quelle\n\nVerweis auf [[Ziel]].\n', 'utf8');
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Verzeichnis bleibt liegen; unkritisch.
  }
}

test.describe('BIC-01: Bereichs-Index-Cache (4T-0348)', () => {
  test('Cache entsteht proaktiv beim Oeffnen, nicht im Panel, Warmstart-Paritaet', async () => {
    const dir = makeAreaTree();
    const cachePath = path.join(dir, 'Area_Cache.mdda');

    // --- Kaltstart: nur den Bereich oeffnen, KEIN Dokument, KEIN Panel ---
    let session = await launchApp();
    try {
      await session.page.evaluate((p) => window.api.openAreaPath(p), dir);
      await expect.poll(() => session.page.title()).toContain('(Bereich');

      // Der Index wird proaktiv aufgebaut; die Cache-Datei entsteht ohne dass
      // ein Panel den Index anfordert (debounced nach dem Aufbau).
      await expect.poll(() => fs.existsSync(cachePath), { timeout: 15000 }).toBe(true);

      // Cache erscheint nicht in der Bereichs-Panel-Dateiliste (nur Markdown).
      const section = session.page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(section).toBeVisible();
      const fileTexts = await section.locator('.area-file-row').allTextContents();
      expect(fileTexts.some((t) => t.includes('Area_Cache'))).toBe(false);
      expect(fileTexts).toContain('Ziel.md');
      expect(fileTexts).toContain('Quelle.md');
    } finally {
      await closeApp(session.app, session.userData);
    }

    // Die Cache-Datei liegt im Bereichsordner und ueberlebt den App-Neustart.
    expect(fs.existsSync(cachePath)).toBe(true);

    // --- Warmstart: neues Profil, gleicher Bereichsordner (Cache vorhanden) ---
    session = await launchApp();
    try {
      await session.page.evaluate((p) => window.api.openAreaPath(p), dir);
      await expect.poll(() => session.page.title()).toContain('(Bereich');
      const section = session.page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(section).toBeVisible();
      await section.locator('.area-file-row', { hasText: 'Ziel.md' }).click();
      await session.page.locator('#btn-backlinks').click();
      const bl = session.page.locator('.pane-group[data-pane="0"] .sidebar-backlinks');
      // Funktions-Paritaet: derselbe Backlink wie beim Kaltstart.
      await expect(bl.locator('.backlinks-group-name')).toHaveText('Quelle.md', { timeout: 15000 });
    } finally {
      await closeApp(session.app, session.userData);
      removeDir(dir);
    }
  });
});
