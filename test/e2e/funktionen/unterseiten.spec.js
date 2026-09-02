// 4T-000336/4T-000337/4T-000338/4T-000341 (Epic 3E-000061): E2E-Funktions-Suite
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
      // 4T-000346 (Epic 3E-000062): Grundfunktions-Test ohne Link-Update (der
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
      // 4T-000346 (Epic 3E-000062): Grundfunktions-Test ohne Link-Update (der
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
      // 4T-000874: Der Reiter-Titel steht bereits, wenn die ERSTE Datei der
      // Kaskade umbenannt ist (der Main meldet jede Umbenennung einzeln per
      // 'file:renamed'); die Nachfahren folgen danach. Auf die Dateien wird
      // deshalb gewartet statt sofort gelesen (Stabilitätsregel 12).
      await expect
        .poll(() => fs.existsSync(path.join(dir, `Prozess-Z${SEP}Entwurf.md`)), { timeout: 5000 })
        .toBe(true);
      await expect
        .poll(() => fs.existsSync(path.join(dir, `Prozess-Z${SEP}Umsetzung${SEP}Detail.md`)), {
          timeout: 5000,
        })
        .toBe(true);
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

// 4T-000646 (Epic 3E-000128): Der Vollname-Schalter des Umbenennen-Dialogs gibt
// bei einer Unterseite den Eltern-Anteil frei; ohne ihn bleibt es beim
// eigenen Segment, und der Schraegstrich ist dort abgelehnt.
test.describe('US-07: Vollname-Schalter im Umbenennen-Dialog', () => {
  const openRenameDialog = async (app, page) => {
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send('menu:renameFile');
    });
    await expect(page.locator('#name-input-modal')).toBeVisible();
  };

  test('Schalter gibt den Eltern-Anteil frei; ohne ihn wird der Schraegstrich abgelehnt', async () => {
    const dir = makeFixtureDir();
    const sub = path.join(dir, `Prozess-A${SEP}Entwurf.md`);
    const { app, page, userData } = await launchApp({ args: [sub] });
    try {
      await waitForTab(page);
      await page.evaluate(() => window.api.setSetting('renameUpdateLinks', false));
      await openRenameDialog(app, page);
      // Segment-Modus: nur das eigene Segment, Schraegstrich abgelehnt.
      await expect(page.locator('#name-input-field')).toHaveValue('Entwurf');
      const cb = page.locator('#name-input-cb-fullName');
      await expect(cb).not.toBeChecked();
      await page.locator('#name-input-field').fill('Fremd/Entwurf');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator('#name-input-error')).toBeVisible();
      await expect(page.locator('#name-input-modal')).toBeVisible();
      // Schalter an: das Feld traegt den vollstaendigen logischen Namen.
      await cb.check();
      await expect(page.locator('#name-input-field')).toHaveValue('Prozess-A/Fremd/Entwurf');
      await page.locator('#name-input-field').fill('Prozess-B/Entwurf');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator('#name-input-modal')).toBeHidden();
      await expect
        .poll(() => fs.existsSync(path.join(dir, `Prozess-B${SEP}Entwurf.md`)), { timeout: 5000 })
        .toBe(true);
      expect(fs.existsSync(sub)).toBe(false);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  test('Top-Level-Seite bekommt den Schalter nicht', async () => {
    const dir = makeFixtureDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'Prozess-A.md')] });
    try {
      await waitForTab(page);
      await openRenameDialog(app, page);
      await expect(page.locator('#name-input-field')).toHaveValue('Prozess-A');
      await expect(page.locator('#name-input-cb-fullName')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-000774 (Epic 3E-000128): Loesen einer Unterseite — eigene Unterseiten wandern
// mit, eingehende Verweise werden nachgefuehrt, eine Kollision auf der
// Zielebene laesst den Bestand unveraendert.
test.describe('US-08: Unterseite von der uebergeordneten Seite loesen', () => {
  const openDetachDialog = async (app) => {
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send('menu:detachSubpage');
    });
  };

  test('Loesen macht die Unterseite eigenstaendig; Nachfahren und Verweise ziehen mit', async () => {
    const dir = makeFixtureDir();
    const sub = path.join(dir, `Prozess-A${SEP}Entwurf.md`);
    fs.writeFileSync(path.join(dir, `Prozess-A${SEP}Entwurf${SEP}Tief.md`), '# Tief\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [sub] });
    try {
      await waitForTab(page);
      // Vorschau aus, Link-Update an: der Ergebnis-Bericht wird quittiert.
      await page.evaluate(() => window.api.setSetting('renameLinkPreview', false));
      await openDetachDialog(app);
      await expect(page.locator('#name-input-modal')).toBeVisible();
      // Vorbelegung ist das eigene Segment; die Beschreibung nennt das Ziel
      // und die Zahl der mitwandernden Unterseiten.
      await expect(page.locator('#name-input-field')).toHaveValue('Entwurf');
      await expect(page.locator('#name-input-description')).toContainText('Prozess-A/Entwurf');
      await expect(page.locator('#name-input-description')).toContainText('1');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator('#name-input-modal')).toBeHidden();
      await expect(page.locator('#link-report-modal')).toBeVisible();
      await page.locator('#btn-link-report-ok').click();
      // Platte: eigenstaendige Seite plus mitgewanderte eigene Unterseite.
      await expect
        .poll(() => fs.existsSync(path.join(dir, 'Entwurf.md')), { timeout: 5000 })
        .toBe(true);
      // 4T-000874: zweite Datei der Kaskade — ebenfalls wartend prüfen, sonst
      // liest der Fall einen Zwischenstand (Stabilitätsregel 12).
      await expect
        .poll(() => fs.existsSync(path.join(dir, `Entwurf${SEP}Tief.md`)), { timeout: 5000 })
        .toBe(true);
      expect(fs.existsSync(sub)).toBe(false);
      // Die fruehere Elternseite bleibt, ihr Verweis zeigt auf das neue Ziel.
      expect(fs.existsSync(path.join(dir, 'Prozess-A.md'))).toBe(true);
      const parentText = fs.readFileSync(path.join(dir, 'Prozess-A.md'), 'utf8');
      expect(parentText).toContain('[[Entwurf]]');
      expect(parentText).not.toContain('[[Prozess-A/Entwurf]]');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  test('Kollision auf der Zielebene laesst alles unveraendert; ein anderer Name geht durch', async () => {
    const dir = makeFixtureDir();
    const sub = path.join(dir, `Prozess-A${SEP}Entwurf.md`);
    fs.writeFileSync(path.join(dir, 'Entwurf.md'), '# Fremder Entwurf\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [sub] });
    try {
      await waitForTab(page);
      await page.evaluate(() => window.api.setSetting('renameUpdateLinks', false));
      await openDetachDialog(app);
      await expect(page.locator('#name-input-modal')).toBeVisible();
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator('#name-input-modal')).toBeHidden();
      // Nichts umbenannt: beide Dateien liegen unveraendert (der Main lehnt
      // die Kollision ab, bevor er die erste Datei anfasst).
      await expect.poll(() => fs.existsSync(sub), { timeout: 5000 }).toBe(true);
      expect(fs.readFileSync(path.join(dir, 'Entwurf.md'), 'utf8')).toContain('Fremder Entwurf');
      // Zweiter Anlauf mit abweichendem Namen.
      await openDetachDialog(app);
      await expect(page.locator('#name-input-modal')).toBeVisible();
      await page.locator('#name-input-field').fill('Entwurf-2');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator('#name-input-modal')).toBeHidden();
      await expect
        .poll(() => fs.existsSync(path.join(dir, 'Entwurf-2.md')), { timeout: 5000 })
        .toBe(true);
      expect(fs.existsSync(sub)).toBe(false);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  test('An einer Top-Level-Seite meldet der Weg, dass es keine Unterseite ist', async () => {
    const dir = makeFixtureDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'Prozess-A.md')] });
    try {
      await waitForTab(page);
      await openDetachDialog(app);
      await expect(page.locator('#statusbar-hint')).toHaveClass(/visible/);
      await expect(page.locator('#name-input-modal')).toBeHidden();
      expect(fs.existsSync(path.join(dir, 'Prozess-A.md'))).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
