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
const { menuZustand, menuEintrag } = require('../helpers/menu-zustand');

const EXT_FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures', 'extensions');
// 4T-0826 (Epic 3E-0103): Das Referenz-Paket ist das real ausgelieferte
// Beispiel aus addon_examples/, keine Attrappe im Test-Ordner. Bricht die
// API, bricht sichtbar das veroeffentlichte Beispiel. Die Fehlerfall-Pakete
// bleiben Fixtures — sie sollen absichtlich kaputt sein.
const BEISPIEL_PAKET = path.resolve(__dirname, '..', '..', '..', 'addon_examples', 'notiz-merker');

function paketQuelle(name) {
  return name === 'notiz-merker' ? BEISPIEL_PAKET : path.join(EXT_FIXTURES, name);
}
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
    kopiereRekursiv(paketQuelle(name), path.join(userData, 'extensions', name));
  }
  if (storeSeed) {
    fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify(storeSeed, null, 2));
  }
  return userData;
}

const MERKER_SEED = {
  extensionsExternal: { enabled: ['notiz-merker'], trusted: { 'notiz-merker': '1.0.0' } },
};
const MERKER_PANEL = '.pane-group[data-pane="0"] .sidebar-section-ext-notiz-merker-merker';

test.describe('EX-01: aktivierte, bestätigte Erweiterung wird geladen und wirkt', () => {
  test('Referenz-Erweiterung: Markdown-Plugin, Panel und Kommando', async () => {
    const userData = prepareUserData({ packages: ['notiz-merker'], storeSeed: MERKER_SEED });
    const { app, page } = await launchApp({ args: [MD_FIXTURE], userData });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      // Render-Beitrag: '>>Text<<' wird zur Marke (vm-evaluiertes Plugin
      // in der Preload-Pipeline). Die Fixture trägt drei Merker.
      const marken = page.locator(`${SEL.markdownBody0} .ext-notiz-merker-marke`);
      await expect(marken).toHaveCount(3);
      await expect(marken.first()).toHaveText('mit dem Fachbereich abstimmen');
      // Sidebar-Panel: Sektion der Erweiterung ist in Pane 0 sichtbar und
      // listet die Merker in Dokument-Reihenfolge.
      const panel = page.locator(MERKER_PANEL);
      await expect(panel).toBeVisible();
      const eintraege = panel.locator('.ext-notiz-merker-eintrag');
      await expect(eintraege).toHaveCount(3);
      await expect(eintraege.nth(2)).toHaveText('Anhang ergaenzen');
      // Kommando mit Standard-Kürzel: springt zyklisch von Marke zu Marke.
      await page.keyboard.press('Control+Alt+M');
      await expect(marken.first()).toHaveClass(/ext-notiz-merker-aktiv/);
      await page.keyboard.press('Control+Alt+M');
      await expect(marken.nth(1)).toHaveClass(/ext-notiz-merker-aktiv/);
      await expect(marken.first()).not.toHaveClass(/ext-notiz-merker-aktiv/);
    } finally {
      await closeApp(app, userData);
    }
  });

  // 4T-0826: Das Panel koppelt über den Render-Andockpunkt der API v1.1 an
  // das Dokument. Der Klick-Weg und das Nachziehen der Liste sind der Kern
  // des Beispiels und damit der eigentliche Härtetest des Andockpunkts.
  test('Panel-Klick springt zur Stelle; die Liste zieht beim Ansichts-Wechsel nach', async () => {
    const userData = prepareUserData({ packages: ['notiz-merker'], storeSeed: MERKER_SEED });
    const { app, page } = await launchApp({ args: [MD_FIXTURE], userData });
    try {
      const panel = page.locator(MERKER_PANEL);
      await expect(panel.locator('.ext-notiz-merker-eintrag')).toHaveCount(3);
      await panel.locator('.ext-notiz-merker-eintrag').nth(1).click();
      await expect(page.locator(`${SEL.markdownBody0} .ext-notiz-merker-marke`).nth(1)).toHaveClass(
        /ext-notiz-merker-aktiv/,
      );

      // In der Quelltext-Ansicht gibt es keine gerenderte Ansicht; die
      // Liste ist leer und zeigt den Leerzustand.
      await page.locator(SEL.viewBtn('source')).click();
      await expect(panel.locator('.ext-notiz-merker-leer')).toBeVisible();
      await expect(panel.locator('.ext-notiz-merker-eintrag')).toHaveCount(0);

      // Zurück in die gerenderte Ansicht: Die Liste kommt wieder, obwohl
      // das Render-DOM dabei nicht neu gebaut wird (Skip-Cache).
      await page.locator(SEL.viewBtn('rendered')).click();
      await expect(panel.locator('.ext-notiz-merker-eintrag')).toHaveCount(3);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('EX-02: ohne Aktivierung wird nichts ausgeführt', () => {
  test('installiertes, aber nicht aktiviertes Paket bleibt wirkungslos', async () => {
    const userData = prepareUserData({ packages: ['notiz-merker'] });
    const { app, page } = await launchApp({ args: [MD_FIXTURE], userData });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await expect(page.locator(`${SEL.markdownBody0} h1`)).toBeVisible();
      // Kein Render-Beitrag: '>>Text<<' bleibt Klartext.
      await expect(page.locator(`${SEL.markdownBody0} .ext-notiz-merker-marke`)).toHaveCount(0);
      await expect(page.locator(SEL.markdownBody0)).toContainText('>>Quelle pruefen<<');
      // Kein Panel, kein Kommando.
      await expect(page.locator('.sidebar-section-ext-notiz-merker-merker')).toHaveCount(0);
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
    const userData = prepareUserData({ packages: ['notiz-merker'], storeSeed: MERKER_SEED });
    const { app, page } = await launchApp({ args: [MD_FIXTURE], userData });
    try {
      await expect(
        page.locator(`${SEL.markdownBody0} .ext-notiz-merker-marke`).first(),
      ).toBeVisible();
      await openExternalSection(page);
      const row = page.locator(
        '#settings-extensions-external-list [data-extension-id="notiz-merker"]',
      );
      await expect(row).toHaveAttribute('data-status', 'active');
      await expect(row).toContainText('Notiz-Merker');
      await expect(row).toContainText('1.0.0');
      // Deaktivieren wirkt sofort: Panel verschwindet, Status wechselt.
      await page.locator('#btn-ext-external-disable-notiz-merker').click();
      await expect(row).toHaveAttribute('data-status', 'inactive');
      await expect(page.locator('.sidebar-section-ext-notiz-merker-merker')).toHaveCount(0);
      // Render-Beitrag ist mit dem Pipeline-Neuaufbau verschwunden
      // (Settings-Tab schließen, Markdown-Tab zeigt Klartext).
      await page.locator('#btn-settings-cancel').click();
      await expect(page.locator(`${SEL.markdownBody0} .ext-notiz-merker-marke`)).toHaveCount(0);
      await expect(page.locator(SEL.markdownBody0)).toContainText('>>Quelle pruefen<<');
    } finally {
      await closeApp(app, userData);
    }
  });

  // 4T-0927 (Epic 3E-0016): Der Diagnose-Zugang ist seit dem Entfall des
  // Menueeintrags samt F12 der einzige Weg zu den Entwickler-Werkzeugen.
  // Geprueft wird beides zusammen, weil erst die Kombination die Zusicherung
  // traegt: Menue frei von Debug-Werkzeug, Zugang am neuen Ort wirksam.
  test('Diagnose-Zugang oeffnet die Werkzeuge; das Ansichtsmenue fuehrt sie nicht mehr', async () => {
    const userData = prepareUserData({ packages: ['notiz-merker'], storeSeed: MERKER_SEED });
    const { app, page } = await launchApp({ args: [MD_FIXTURE], userData });
    try {
      // Das Ansichtsmenue kennt den Eintrag nicht mehr — in keiner Schreibweise.
      // Leerer Titel-Teil: Ein-Fenster-Lage, jeder Titel enthaelt ihn (Muster
      // zweite-spalte.spec.js).
      const menu = await menuZustand(app, '');
      expect(menuEintrag(menu, 'Entwickler-Tools')).toBeNull();
      expect(menuEintrag(menu, 'Entwickler-Werkzeuge')).toBeNull();
      // Gegenprobe, dass die Erhebung ueberhaupt getragen hat: Der Nachbar im
      // selben Menue steht noch. Ohne sie prueften die zwei Zeilen daruber
      // auch dann gruen, wenn gar kein Menue erfasst wurde.
      expect(menuEintrag(menu, 'Kommando-Palette')).not.toBeNull();
      // Der Zugang steht am Ende des Bereichs und traegt seinen Hinweis.
      await openExternalSection(page);
      const knopf = page.locator('#btn-ext-external-devtools');
      await expect(knopf).toBeVisible();
      await expect(page.locator('.settings-extension-external-diagnose-hint')).toContainText(
        'Entwickler-Werkzeuge',
      );

      // Auslösen oeffnet die Werkzeuge genau dieses Fensters.
      const offenVorher = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((w) => w.webContents.isDevToolsOpened()),
      );
      expect(offenVorher).toBe(false);
      await knopf.click();
      await expect
        .poll(async () =>
          app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().some((w) => w.webContents.isDevToolsOpened()),
          ),
        )
        .toBe(true);
      // Dieselbe Schaltflaeche schliesst sie wieder — der Hinweis sagt das zu.
      await knopf.click();
      await expect
        .poll(async () =>
          app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().some((w) => w.webContents.isDevToolsOpened()),
          ),
        )
        .toBe(false);
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
