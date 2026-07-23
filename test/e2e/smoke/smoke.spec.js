// 4T-0167: E2E-Smoke-Suite ueber die Kernablaeufe (SM-01 bis SM-09).
// Pflicht-Gate bei Renderer-/Main-Aenderungen im Review-Programm; die
// Szenario-IDs werden von der Abdeckungs-Matrix (4T-0195) referenziert.
//
// Menue-gebundene Aktionen ohne sichtbares UI-Element (Speichern) werden
// ueber den IPC-Kanal des Menue-Eintrags ausgeloest (webContents.send),
// exakt der Pfad, den der native Menue-Klick nimmt.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke');
const BASIS = path.join(FIXTURES, 'basis.md');
const ZWEITE = path.join(FIXTURES, 'zweite.md');

// Sendet einen Menue-IPC-Kanal an das erste Fenster (Pfad des Menue-Klicks).
async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Wartet, bis der per CLI uebergebene Tab offen ist. CLI-Dateien werden im
// Renderer bis initDone gepuffert und erst nach allen UI-Bindings geoeffnet
// (renderer.js init()); ein sichtbarer Tab garantiert damit, dass Statusbar-
// Klicks, Tastatur-Handler und Menue-IPC-Listener registriert sind.
async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('SM-01: Start und Fenster', () => {
  test('App startet, Titel und Statusbar da, keine Konsolen-Errors', async () => {
    const { app, page, userData } = await launchApp();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    try {
      await expect(page).toHaveTitle(/EM4me/);
      await expect(page.locator(SEL.statusbar)).toBeVisible();
      // Ohne Datei zeigt die App den Empty-State.
      await expect(page.locator(SEL.emptyState)).toBeVisible();
      expect(consoleErrors).toEqual([]);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SM-02: Datei öffnen und rendern', () => {
  test('Fixture per CLI öffnen, Reading-Modus zeigt gerenderte Inhalte', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      const body = page.locator(SEL.markdownBody0);
      await expect(page.locator(SEL.content0)).toHaveClass(/view-rendered/);
      await expect(body.locator('h1')).toHaveText('Smoke-Basis');
      await expect(body.locator('ul li')).toHaveCount(3);
      await expect(body.locator('table td').first()).toBeVisible();
      await expect(body.locator('pre code')).toBeVisible();
      await expect(body.locator(SEL.codeCopyButton)).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SM-03: Modi wechseln', () => {
  test('Source → Split → Live → Reading über die Statusbar-Buttons', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      const content = page.locator(SEL.content0);

      await page.locator(SEL.viewBtn('source')).click();
      await expect(content).toHaveClass(/view-source/);
      await expect(page.locator(SEL.paneSource0)).toBeVisible();
      await expect(page.locator(SEL.paneRendered0)).toBeHidden();

      await page.locator(SEL.viewBtn('split')).click();
      await expect(content).toHaveClass(/view-split/);
      await expect(page.locator(SEL.paneSource0)).toBeVisible();
      await expect(page.locator(SEL.paneRendered0)).toBeVisible();

      await page.locator(SEL.viewBtn('live')).click();
      await expect(content).toHaveClass(/view-live/);
      await expect(page.locator(SEL.paneSource0)).toBeVisible();
      await expect(page.locator(SEL.paneRendered0)).toBeHidden();

      await page.locator(SEL.viewBtn('rendered')).click();
      await expect(content).toHaveClass(/view-rendered/);
      await expect(page.locator(SEL.paneRendered0)).toBeVisible();
      await expect(page.locator(SEL.paneSource0)).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SM-04: Editieren und Speichern', () => {
  test('Tippen setzt Dirty, Speichern schreibt auf Platte und löscht Dirty', async () => {
    // Arbeitskopie, damit die Fixture unveraendert bleibt.
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-sm04-'));
    const workFile = path.join(workDir, 'arbeit.md');
    fs.copyFileSync(BASIS, workFile);

    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      // Erst auf den CLI-Tab warten (Muster SM-03): Statusbar-Klicks vor dem
      // Datei-Open gehen verloren, weil der oeffnende Tab mit dem
      // Default-Ansichtsmodus startet und fruehe Modus-Klicks ueberschreibt.
      await waitForTab(page);
      // In den Source-Modus und Edit-Modus (Statusbar-Buttons).
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toHaveAttribute('contenteditable', 'true');

      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('Neuer Smoke-Satz.');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);

      // Speichern ueber den Menue-IPC-Pfad (CmdOrCtrl+S haengt am nativen Menue).
      await sendMenuChannel(app, 'menu:save');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);

      const saved = fs.readFileSync(workFile, 'utf8');
      expect(saved).toContain('Neuer Smoke-Satz.');
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('SM-05: Tabs', () => {
  test('Zwei Dateien als zwei Tabs, Wechsel und Schließen', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS, ZWEITE] });
    try {
      const tabs = page.locator(SEL.tabs0);
      await expect(tabs).toHaveCount(2);
      // Zweite Datei ist nach dem Oeffnen aktiv.
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/zweite/);

      // Tab-Wechsel per Klick auf den ersten Tab.
      await tabs.first().click();
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/basis/);

      // Zweiten Tab ueber den Close-Button schließen.
      await tabs.nth(1).locator('.tab-close').click();
      await expect(tabs).toHaveCount(1);
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/basis/);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SM-06: Suche', () => {
  test('Strg+F öffnet, Begriff liefert Treffer, Esc schließt', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await page.keyboard.press('Control+f');
      await expect(page.locator(SEL.searchBar)).toBeVisible();

      await page.locator(SEL.searchInput).fill('Smoke');
      // Zaehler-Format "n / m" (renderer.js updateSearchCount); auf das
      // sichtbare Ergebnis warten, nicht auf den Debounce-Timer.
      await expect(page.locator(SEL.searchCount)).toHaveText(/\d+ \/ \d+/);

      await page.keyboard.press('Escape');
      await expect(page.locator(SEL.searchBar)).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SM-07: Hilfe öffnet das Handbuch', () => {
  // 4T-0216 (Epic 3E-0042): Das Hilfe-Modal ist durch das Handbuch im
  // Tab-System ersetzt — F1/Hilfe-Menue oeffnen die Ueberblicksseite als
  // read-only Tab (Einfach-Instanz: zweiter Aufruf aktiviert statt
  // dupliziert). Sprachneutrale Asserts (Tab-Anzahl, H1, Modus).
  test('Hilfe-Menü öffnet die Überblicksseite als Tab, ohne Duplikat', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      // F1 haengt als Accelerator am nativen Menue; synthetische Tastatur-
      // Events erreichen das Menue nicht zuverlaessig. Der Menue-Eintrag
      // sendet 'menu:openHelp' (src/main/menu.js) — gleicher Pfad hier.
      await sendMenuChannel(app, 'menu:openHelp');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await expect(page.locator(SEL.content0)).toHaveClass(/view-rendered/);
      await expect(page.locator(SEL.markdownBody0).locator('h1').first()).toBeVisible();
      // Read-only: der Edit-Stift ist fuer Handbuch-Tabs deaktiviert.
      await expect(page.locator(SEL.btnEdit)).toBeDisabled();
      // Einfach-Instanz: erneutes Oeffnen erzeugt keinen weiteren Tab.
      await sendMenuChannel(app, 'menu:openHelp');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SM-08: Theme', () => {
  test('Theme-Toggle wechselt data-theme am Dokument', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      const html = page.locator('html');
      // data-theme wird in init() asynchron gesetzt ('light'|'dark' aus
      // theme:current); auf den gesetzten Wert pollen statt sofort lesen.
      await expect.poll(async () => html.getAttribute('data-theme')).toMatch(/^(light|dark)$/);
      const before = await html.getAttribute('data-theme');

      // Zyklus Hell -> Dunkel -> System; je nach OS-Theme braucht der
      // sichtbare Wechsel bis zu drei Klicks (System kann == Start sein).
      const target = before === 'dark' ? 'light' : 'dark';
      let reached = false;
      for (let i = 0; i < 3 && !reached; i++) {
        await page.locator(SEL.btnTheme).click();
        reached = (await html.getAttribute('data-theme')) === target;
      }
      expect(reached).toBe(true);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SM-09: Session-Restore', () => {
  test('Nach Beenden und Neustart mit gleichem Profil ist die Datei wieder offen', async () => {
    const first = await launchApp({ args: [BASIS] });
    const userData = first.userData;
    try {
      await expect(first.page.locator(SEL.tabs0)).toHaveCount(1);
      // Sauber beenden (before-quit persistiert die Sitzung), dann warten,
      // bis der Prozess wirklich weg ist.
      await first.app.evaluate(({ app }) => app.quit());
      await first.app.waitForEvent('close');

      const second = await launchApp({ userData });
      try {
        await expect(second.page.locator(SEL.tabs0)).toHaveCount(1);
        await expect(second.page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/basis/);
      } finally {
        await closeApp(second.app, null);
      }
    } finally {
      await closeApp(first.app, userData);
    }
  });
});
