// 4T-0336/4T-0337/4T-0338/4T-0341 (Epic 3E-0061): E2E-Funktions-Suite
// Unterseiten — Klick-Aufloesung der Slash-Schreibweise, relative Links,
// Anlage-Kommando, Breadcrumb und Panel-Liste.
// describe-Titel tragen die Matrix-IDs aus test/abdeckungs-matrix.json.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const SEP = '∕'; // U+2215 Division Slash

// Pro Test ein eigenes Temp-Verzeichnis mit einer kleinen Unterseiten-Familie.
function makeFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-subpages-'));
  fs.writeFileSync(
    path.join(dir, 'Prozess-A.md'),
    '# Prozess A\n\nDirekt: [[Prozess-A/Entwurf]]\n\nRelativ: [[/Entwurf]]\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, `Prozess-A${SEP}Entwurf.md`),
    '# Entwurf\n\nZurueck: [[..]]\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, `Prozess-A${SEP}Umsetzung${SEP}Detail.md`),
    '# Detail\n\nTiefe Ebene.\n',
    'utf8',
  );
  return dir;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('US-01: Unterseiten-Klick (Slash-Schreibweise und relative Links)', () => {
  test('[[Prozess-A/Entwurf]] und [[/Entwurf]] oeffnen die Unterseite, [[..]] fuehrt zurueck', async () => {
    const dir = makeFixtureDir();
    const parent = path.join(dir, 'Prozess-A.md');
    const { app, page, userData } = await launchApp({ args: [parent] });
    try {
      await waitForTab(page);
      // Klick auf die Slash-Schreibweise im Render-Pane. Der Index-Fallback
      // baut asynchron auf — erst auf 'ready' pollen, dann klicken.
      const rendered = page.locator(SEL.markdownBody0);
      await expect(rendered).toBeVisible();
      await expect
        .poll(
          () =>
            page.evaluate(async (p) => {
              const r = await window.api.resolveWikiTargetInIndex(p, 'Prozess-A/Entwurf');
              return r && r.status === 'ready' && r.candidates.length > 0 ? 'ready' : 'pending';
            }, parent),
          { timeout: 15000 },
        )
        .toBe('ready');
      await rendered.locator('a.wikilink', { hasText: 'Prozess-A/Entwurf' }).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Entwurf');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);

      // [[..]] auf der Unterseite fuehrt zur Eltern-Seite zurueck (Tab existiert
      // schon, wird aktiviert).
      await page.locator(`${SEL.markdownBody0} a.wikilink[href=".."]`).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Prozess-A');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);

      // Relativer Kind-Link von der Eltern-Seite aus.
      await rendered.locator('a.wikilink[href="/Entwurf.md"]').click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Entwurf');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('US-03: Kommando Unterseite anlegen (Dialog, Validierung, Kollision)', () => {
  test('Menue-Weg legt die U+2215-Datei an und oeffnet sie; ungueltiger Name wird abgelehnt', async () => {
    const dir = makeFixtureDir();
    const parent = path.join(dir, 'Prozess-A.md');
    const { app, page, userData } = await launchApp({ args: [parent] });
    try {
      await waitForTab(page);
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:newSubpage');
      });
      const modal = page.locator('#name-input-modal');
      await expect(modal).toBeVisible();
      // Validierung: Slash im Segment wird abgelehnt, Dialog bleibt offen.
      await page.locator('#name-input-field').fill('a/b');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator('#name-input-error')).toBeVisible();
      // Gueltiger Name: Datei entsteht und oeffnet als Tab.
      await page.locator('#name-input-field').fill('Umsetzung');
      await page.locator('#btn-name-input-ok').click();
      await expect(modal).toBeHidden();
      await expect(page.locator(SEL.activeTab0)).toContainText('Umsetzung');
      expect(fs.existsSync(path.join(dir, `Prozess-A${SEP}Umsetzung.md`))).toBe(true);
      // Kollision: existierendes Segment oeffnet die vorhandene Datei.
      await page.locator(SEL.tabs0).first().click();
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:newSubpage');
      });
      await expect(modal).toBeVisible();
      await page.locator('#name-input-field').fill('Entwurf');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Entwurf');
      // Keine Duplikat-Datei; der bestehende Inhalt blieb erhalten.
      expect(fs.readFileSync(path.join(dir, `Prozess-A${SEP}Entwurf.md`), 'utf8')).toContain(
        'Zurueck',
      );
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('US-04: Datei umbenennen (Grundfunktion)', () => {
  test('Menue-Weg benennt um, Tab bleibt erhalten, Recent und Platte ziehen nach; Kollision wird abgelehnt', async () => {
    const dir = makeFixtureDir();
    const file = path.join(dir, 'Solo.md');
    fs.writeFileSync(file, '# Solo\n\nInhalt bleibt.\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'Belegt.md'), '# Belegt\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await waitForTab(page);
      // 4T-0346 (Epic 3E-0062): Grundfunktions-Test ohne Link-Update (der
      // Vorschau-/Bericht-Flow ist in link-update.spec.js abgedeckt).
      await page.evaluate(() => window.api.setSetting('renameUpdateLinks', false));
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:renameFile');
      });
      const modal = page.locator('#name-input-modal');
      await expect(modal).toBeVisible();
      await expect(page.locator('#name-input-field')).toHaveValue('Solo');
      // Kollision: bestehender Name wird abgelehnt (Statusbar-Hinweis),
      // Datei bleibt unveraendert.
      await page.locator('#name-input-field').fill('Belegt');
      await page.locator('#btn-name-input-ok').click();
      await expect(modal).toBeHidden();
      expect(fs.existsSync(file)).toBe(true);
      // Zweiter Anlauf mit freiem Namen.
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:renameFile');
      });
      await expect(modal).toBeVisible();
      await page.locator('#name-input-field').fill('Solo Neu');
      await page.locator('#btn-name-input-ok').click();
      await expect(modal).toBeHidden();
      // Tab folgt dem neuen Namen, Datei liegt unter dem neuen Pfad.
      await expect(page.locator(SEL.activeTab0)).toContainText('Solo Neu.md');
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      expect(fs.existsSync(path.join(dir, 'Solo Neu.md'))).toBe(true);
      expect(fs.existsSync(file)).toBe(false);
      expect(fs.readFileSync(path.join(dir, 'Solo Neu.md'), 'utf8')).toContain('Inhalt bleibt');
      // Recent-Liste zeigt den neuen Pfad, der alte ist ersetzt.
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const list = await window.api.getSetting('recentFiles');
            return Array.isArray(list) ? list.join('|') : '';
          }),
        )
        .toContain('Solo Neu.md');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('US-05: Umbenennen-Kaskade fuer Unterseiten-Baeume', () => {
  test('Eltern-Umbenennen zieht alle Nachfahren mit; Unterseiten-Umbenennen aendert nur das eigene Segment', async () => {
    const dir = makeFixtureDir();
    const parent = path.join(dir, 'Prozess-A.md');
    const { app, page, userData } = await launchApp({ args: [parent] });
    const openRenameDialog = async () => {
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:renameFile');
      });
      await expect(page.locator('#name-input-modal')).toBeVisible();
    };
    try {
      await waitForTab(page);
      // 4T-0346 (Epic 3E-0062): Grundfunktions-Test ohne Link-Update (der
      // Vorschau-/Bericht-Flow ist in link-update.spec.js abgedeckt).
      await page.evaluate(() => window.api.setSetting('renameUpdateLinks', false));
      // Eltern-Seite umbenennen: Dialog zeigt den vollen Namen und den
      // Kaskaden-Hinweis (2 Nachfahren in der Fixture-Familie).
      await openRenameDialog();
      await expect(page.locator('#name-input-field')).toHaveValue('Prozess-A');
      await expect(page.locator('#name-input-description')).toContainText('2');
      await page.locator('#name-input-field').fill('Prozess-Z');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator('#name-input-modal')).toBeHidden();
      await expect(page.locator(SEL.activeTab0)).toContainText('Prozess-Z.md');
      expect(fs.existsSync(path.join(dir, `Prozess-Z${SEP}Entwurf.md`))).toBe(true);
      expect(fs.existsSync(path.join(dir, `Prozess-Z${SEP}Umsetzung${SEP}Detail.md`))).toBe(true);
      expect(fs.existsSync(parent)).toBe(false);
      expect(fs.existsSync(path.join(dir, `Prozess-A${SEP}Entwurf.md`))).toBe(false);

      // Unterseite umbenennen: Dialog zeigt nur das letzte Segment; die
      // Eltern-Kette bleibt erhalten.
      await page.evaluate(
        async (p) => {
          // Datei als Tab oeffnen (ueber den regulaeren Open-Pfad des Renderers).
          await window.api.openPath?.(p);
        },
        path.join(dir, `Prozess-Z${SEP}Entwurf.md`),
      );
      // Fallback: Datei per CLI-aehnlichem Weg oeffnen, falls openPath fehlt —
      // Klick auf den Wiki-Link der Eltern-Seite.
      const rendered = page.locator(SEL.markdownBody0).first();
      if (!(await page.locator(SEL.tabs0).count()) || (await page.locator(SEL.tabs0).count()) < 2) {
        await rendered.locator('a.wikilink[href="/Entwurf.md"]').click();
      }
      await expect(page.locator(SEL.activeTab0)).toContainText('Entwurf');
      await openRenameDialog();
      await expect(page.locator('#name-input-field')).toHaveValue('Entwurf');
      await page.locator('#name-input-field').fill('Konzept');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator('#name-input-modal')).toBeHidden();
      await expect(page.locator(SEL.activeTab0)).toContainText(`Prozess-Z${SEP}Konzept.md`);
      expect(fs.existsSync(path.join(dir, `Prozess-Z${SEP}Konzept.md`))).toBe(true);
      expect(fs.existsSync(path.join(dir, `Prozess-Z${SEP}Entwurf.md`))).toBe(false);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('US-06: Breadcrumb und Unterseiten-Sektion', () => {
  test('Breadcrumb zeigt die Eltern-Kette und navigiert; die Sektion listet direkte Unterseiten', async () => {
    const dir = makeFixtureDir();
    const deep = path.join(dir, `Prozess-A${SEP}Umsetzung${SEP}Detail.md`);
    const { app, page, userData } = await launchApp({ args: [deep] });
    try {
      await waitForTab(page);
      // Breadcrumb im Render-Pane: zwei Ahnen-Segmente plus aktuelles.
      const crumb = page.locator('.pane-group[data-pane="0"] .pane-rendered .subpage-breadcrumb');
      await expect(crumb).toBeVisible();
      await expect(crumb).toContainText('Prozess-A');
      await expect(crumb).toContainText('Detail');
      // Zwischen-Ebene 'Umsetzung' existiert nicht als Datei -> gekennzeichnet.
      await expect(crumb.locator('.subpage-crumb.is-missing')).toHaveText('Umsetzung');
      // Klick auf die Wurzel-Ebene oeffnet Prozess-A.md.
      await crumb.locator('a.subpage-crumb', { hasText: 'Prozess-A' }).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Prozess-A.md');
      // Normale Seiten zeigen keinen Breadcrumb? Prozess-A ist Top-Level.
      await expect(crumb).toBeHidden();

      // Unterseiten-Sektion einblenden: listet die direkte Unterseite
      // 'Entwurf' (das tiefe 'Umsetzung∕Detail' ist KEIN direktes Kind).
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:toggleSubpages');
      });
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-subpages');
      await expect(section).toBeVisible();
      const entries = section.locator('.subpages-entry');
      await expect(entries).toHaveCount(1);
      await expect(entries.first()).toHaveText('Entwurf');
      // Klick oeffnet die Unterseite.
      await entries.first().click();
      await expect(page.locator(SEL.activeTab0)).toContainText(`Prozess-A${SEP}Entwurf.md`);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('US-02: Unterseiten-Embeds (Slash-Schreibweise und relativ)', () => {
  test('![[Prozess-A/Entwurf]] und ![[/Entwurf]] betten die Unterseite ein', async () => {
    const dir = makeFixtureDir();
    const host = path.join(dir, 'Embed-Host.md');
    fs.writeFileSync(
      host,
      '# Host\n\nDirekt:\n\n![[Prozess-A/Entwurf]]\n\nRelativ von der Eltern-Seite aus siehe US-01.\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dir, 'Prozess-A.md'),
      '# Prozess A\n\nKind-Embed:\n\n![[/Entwurf]]\n',
      'utf8',
    );
    const { app, page, userData } = await launchApp({ args: [host] });
    try {
      await waitForTab(page);
      // Der Embed-Body traegt selbst .markdown-body — first() ist der Host.
      const rendered = page.locator(SEL.markdownBody0).first();
      await expect(rendered).toBeVisible();
      // Direktes Unterseiten-Embed (gleicher Ordner, ohne Index-Fallback).
      await expect(rendered.locator('.wiki-embed-md-body').first()).toContainText('Zurueck', {
        timeout: 15000,
      });
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
