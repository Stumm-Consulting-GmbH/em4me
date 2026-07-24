// 4T-0298 (Epic 3E-0053): E2E-Funktions-Suite — externe Erweiterungen,
// Lade- und Vertrauensmodell (EX-01 bis EX-03). Der Test-Helper legt die
// Fixture-Pakete vor dem App-Start in <userData>/extensions/ und seeded
// den Store-Zustand (enabled/trusted) direkt in config.json — der native
// Warn-Dialog selbst ist per E2E nicht klickbar und wird über die
// Unit-Tests des Hosts (Dialog-Ergebnis) plus manuellen Test abgedeckt.
// Der Default-Zustand der übrigen Suite (keine externen Erweiterungen)
// bleibt unberührt: jede Spec baut ihr eigenes Temp-Profil.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const EXT_FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures', 'extensions');
const MD_FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'erweiterungen-extern.md',
);

// 4T-0703 (Epic 3E-0101): Nicht fs.cpSync(..., { recursive: true }) verwenden —
// Node v22.18.0 stürzt unter Windows bei einem Nicht-ASCII-QUELLpfad hart und
// unfangbar im Prozess ab. Der öffentliche Klon liegt im Umlaut-Verzeichnis
// 0012_EM4me_Veröffentlichung, wodurch EXT_FIXTURES den Umlaut trägt. Die eigene
// Rekursion aus mkdirSync + copyFileSync trifft Umlaut-Pfade korrekt.
function kopiereRekursiv(quelle, ziel) {
  if (fs.lstatSync(quelle).isDirectory()) {
    fs.mkdirSync(ziel, { recursive: true });
    for (const kind of fs.readdirSync(quelle))
      kopiereRekursiv(path.join(quelle, kind), path.join(ziel, kind));
  } else {
    fs.copyFileSync(quelle, ziel);
  }
}

// Temp-Profil mit installierten Erweiterungs-Paketen und optionalem
// Store-Seed vorbereiten (launchApp übernimmt es via opts.userData).
function prepareUserData({ packages = [], storeSeed = null } = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-e2e-ext-'));
  for (const name of packages) {
    kopiereRekursiv(path.join(EXT_FIXTURES, name), path.join(userData, 'extensions', name));
  }
  if (storeSeed) {
    fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify(storeSeed, null, 2));
  }
  return userData;
}

test.describe('EX-01: aktivierte, bestätigte Erweiterung wird geladen und wirkt', () => {
  test('Referenz-Erweiterung: Markdown-Plugin, Panel und Kommando', async () => {
    const userData = prepareUserData({
      packages: ['beispiel'],
      storeSeed: {
        extensionsExternal: { enabled: ['beispiel'], trusted: { beispiel: '1.0.0' } },
      },
    });
    const { app, page } = await launchApp({ args: [MD_FIXTURE], userData });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      // Render-Beitrag: ':-)' wird zum Smiley-Span (vm-evaluiertes Plugin
      // in der Preload-Pipeline).
      await expect(page.locator(`${SEL.markdownBody0} .ext-beispiel-smiley`).first()).toBeVisible();
      // Sidebar-Panel: Sektion der Erweiterung ist in Pane 0 sichtbar.
      const panel = page.locator('.pane-group[data-pane="0"] .sidebar-section-ext-beispiel-demo');
      await expect(panel).toBeVisible();
      await expect(panel.locator('.ext-beispiel-info')).toContainText('Beispiel-Erweiterung');
      // Kommando mit Standard-Kürzel: der Panel-Zähler zählt hoch.
      const counter = panel.locator('.ext-beispiel-counter');
      await expect(counter).toHaveText('0');
      await page.keyboard.press('Control+Alt+9');
      await expect(counter).toHaveText('1');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('EX-02: ohne Aktivierung wird nichts ausgeführt', () => {
  test('installiertes, aber nicht aktiviertes Paket bleibt wirkungslos', async () => {
    const userData = prepareUserData({ packages: ['beispiel'] });
    const { app, page } = await launchApp({ args: [MD_FIXTURE], userData });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await expect(page.locator(`${SEL.markdownBody0} h1`)).toBeVisible();
      // Kein Render-Beitrag: ':-)' bleibt Klartext.
      await expect(page.locator(`${SEL.markdownBody0} .ext-beispiel-smiley`)).toHaveCount(0);
      await expect(page.locator(SEL.markdownBody0)).toContainText(':-)');
      // Kein Panel, kein Kommando.
      await expect(page.locator('.sidebar-section-ext-beispiel-demo')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('EX-03: Fehler-Isolation und Kompatibilitätsprüfung', () => {
  test('werfende Erweiterung wird deaktiviert, inkompatible nie geladen — App läuft', async () => {
    const userData = prepareUserData({
      packages: ['defekt', 'inkompatibel'],
      storeSeed: {
        extensionsExternal: {
          enabled: ['defekt', 'inkompatibel'],
          trusted: { defekt: '1.0.0', inkompatibel: '1.0.0' },
        },
      },
    });
    const { app, page } = await launchApp({ args: [MD_FIXTURE], userData });
    try {
      // Kein Absturz: das Fenster rendert normal.
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await expect(page.locator(`${SEL.markdownBody0} h1`)).toBeVisible();
      // Die inkompatible Erweiterung wurde nie ausgeführt.
      const markerSet = await page.evaluate(() => 'inkompatibelGeladen' in document.body.dataset);
      expect(markerSet).toBe(false);
      // Die werfende Erweiterung ist automatisch deaktiviert, der
      // Fehlertext persistiert (Anzeige im Einstellungs-Bereich).
      await expect
        .poll(async () =>
          page.evaluate(() => window.api.getSetting('extensionsExternal.lastError')),
        )
        .toMatchObject({ defekt: expect.stringContaining('Absichtlich defekt') });
      const enabled = await page.evaluate(() =>
        window.api.getSetting('extensionsExternal.enabled'),
      );
      expect(enabled).not.toContain('defekt');
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-0300: Verwaltungs-Bereich „Erweiterungen (extern)" der Einstellungs-
// Seite. Der Aktivieren-Pfad läuft über den nativen Warn-Dialog und ist
// per E2E nicht klickbar (Unit-Tests plus manueller Test); hier die
// dialog-freien Flüsse: Liste mit Status/Fehlertext und Deaktivieren mit
// sofortiger Wirkung.
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

async function openExternalSection(page) {
  await expect
    .poll(async () => {
      await page.keyboard.press('Control+,');
      return page.locator(SETTINGS_PAGE).count();
    })
    .toBeGreaterThan(0);
  await page
    .locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="extensionsExternal"]`)
    .click();
  await expect(page.locator('#settings-extensions-external-list')).toBeVisible();
}

test.describe('EX-04: Verwaltungs-Bereich listet und deaktiviert sofort', () => {
  test('aktive Erweiterung wird gelistet; Deaktivieren wirkt ohne Anwenden/OK', async () => {
    const userData = prepareUserData({
      packages: ['beispiel'],
      storeSeed: {
        extensionsExternal: { enabled: ['beispiel'], trusted: { beispiel: '1.0.0' } },
      },
    });
    const { app, page } = await launchApp({ args: [MD_FIXTURE], userData });
    try {
      await expect(page.locator(`${SEL.markdownBody0} .ext-beispiel-smiley`).first()).toBeVisible();
      await openExternalSection(page);
      const row = page.locator('#settings-extensions-external-list [data-extension-id="beispiel"]');
      await expect(row).toHaveAttribute('data-status', 'active');
      await expect(row).toContainText('Beispiel-Erweiterung');
      await expect(row).toContainText('1.0.0');
      // Deaktivieren wirkt sofort: Panel verschwindet, Status wechselt.
      await page.locator('#btn-ext-external-disable-beispiel').click();
      await expect(row).toHaveAttribute('data-status', 'inactive');
      await expect(page.locator('.sidebar-section-ext-beispiel-demo')).toHaveCount(0);
      // Render-Beitrag ist mit dem Pipeline-Neuaufbau verschwunden
      // (Settings-Tab schließen, Markdown-Tab zeigt Klartext).
      await page.locator('#btn-settings-cancel').click();
      await expect(page.locator(`${SEL.markdownBody0} .ext-beispiel-smiley`)).toHaveCount(0);
      await expect(page.locator(SEL.markdownBody0)).toContainText(':-)');
    } finally {
      await closeApp(app, userData);
    }
  });

  test('Fehler-Erweiterung zeigt Status und Fehlertext im Bereich', async () => {
    const userData = prepareUserData({
      packages: ['defekt'],
      storeSeed: {
        extensionsExternal: { enabled: ['defekt'], trusted: { defekt: '1.0.0' } },
      },
    });
    const { app, page } = await launchApp({ userData });
    try {
      await openExternalSection(page);
      const row = page.locator('#settings-extensions-external-list [data-extension-id="defekt"]');
      await expect(row).toHaveAttribute('data-status', 'error');
      await expect(row.locator('.settings-extension-external-error')).toContainText(
        'Absichtlich defekt',
      );
    } finally {
      await closeApp(app, userData);
    }
  });
});
