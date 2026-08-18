// 4T-0632 (Epic 3E-0102): E2E-Funktions-Suite Demo-Area. Die mitgelieferten
// englischen Demo-Inhalte (src/demo) werden über den direkten Pfad-Einstieg
// der Preload-Brücke (window.api.createDemoAreaAt, identische Strecke wie der
// Menü-/Dialog-Weg ab der Ordner-Wahl) in einen leeren Ordner kopiert und als
// Bereich geöffnet. Native Dialog und Menü sind per Playwright nicht bedienbar.
//
// DA-01: Erstellen kopiert alle 15 Dateien und bindet das Fenster als Bereich.
// DA-02: nicht-leeres Ziel wird abgelehnt, der Ordner bleibt unverändert.
// DA-03: jede der 12 Demo-Markdown-Seiten öffnet linter-sauber.
// DA-04: die erste Abfrage (TABLE über #demo) liefert zwölf Treffer-Zeilen.
// DA-05: Erweiterung aus entfernt das Kommando aus der Kommando-Palette.
// describe-Titel tragen die Matrix-IDs F-132 (Funktion) und S-091 (Kommando).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

// Die zwölf Markdown-Seiten im Wurzelverzeichnis der Demo-Area (Reihenfolge
// wie im Bestand); dazu die Vorlage und die beiden Binär-Anlagen.
const MD_PAGES = [
  '00 Welcome.md',
  '01 Markdown Basics.md',
  '02 Extended Syntax.md',
  '03 Tables.md',
  '04 Links and Structure.md',
  '05 Properties and Profiles.md',
  '06 Tasks and Reminders.md',
  '07 Events and Journals.md',
  '08 Queries.md',
  '09 Diagrams and Formulas.md',
  '10 Attachments.md',
  '11 Templates.md',
];
const EXPECTED_FILES = [
  ...MD_PAGES,
  'Templates/Meeting Note.md',
  'attachments/demo-document.pdf',
  'attachments/demo-image.png',
];

const AREA_SECTION = '.pane-group[data-pane="0"] .sidebar-area';
const MODAL = '#command-palette-modal';
const FILTER = '#command-palette-filter';
const PALETTE_ITEM = '.command-palette-item';

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-demo-e2e-'));
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Windows-Handle des Bereichs-Watchers evtl. noch gesperrt: Temp-Rest ist unkritisch.
  }
}

// Demo-Area über die Preload-Brücke in einen frischen, leeren Temp-Ordner
// erstellen (Windows-Pfad als Argument-Parameter, nicht per Interpolation).
async function createDemoAreaAt(page, target) {
  return page.evaluate((p) => window.api.createDemoAreaAt(p), target);
}

// Kommando-Palette per Kürzel öffnen (Poll wie kommando-palette.spec.js: der
// globale Dispatcher reagiert erst nach dem Renderer-init).
async function openPaletteByKey(page) {
  await expect
    .poll(async () => {
      if (await page.locator(MODAL).isVisible()) return true;
      await page.keyboard.press('Control+k');
      return page.locator(MODAL).isVisible();
    })
    .toBe(true);
}

// Palette öffnen, nach einem Teilstring filtern, sichtbare Treffer zählen und
// wieder schließen. Für expect.poll geeignet, um die Broadcast-Latenz des
// Erweiterungs-Schalters zu absorbieren (die Palette baut ihre Liste beim
// Öffnen neu auf, nicht reaktiv).
async function paletteHitCount(page, needle) {
  await openPaletteByKey(page);
  await page.locator(FILTER).fill(needle);
  const count = await page.locator(PALETTE_ITEM).count();
  await page.keyboard.press('Escape');
  await expect(page.locator(MODAL)).toBeHidden();
  return count;
}

test.describe('DA-01: Demo-Area erstellen und öffnen (F-132)', () => {
  test('kopiert alle 15 Dateien in ein leeres Ziel und bindet das Fenster als Bereich', async () => {
    const { app, page, userData } = await launchApp();
    const target = mkTempDir();
    try {
      const result = await createDemoAreaAt(page, target);
      expect(result.ok).toBe(true);

      // Alle 15 mitgelieferten Dateien liegen im Zielordner (fs-Check).
      for (const rel of EXPECTED_FILES) {
        expect(fs.existsSync(path.join(target, ...rel.split('/'))), rel).toBe(true);
      }
      // Die Binär-Anlagen sind nicht leer (Kopie über Buffer, nicht Text).
      expect(fs.statSync(path.join(target, 'attachments', 'demo-image.png')).size).toBeGreaterThan(
        0,
      );
      expect(
        fs.statSync(path.join(target, 'attachments', 'demo-document.pdf')).size,
      ).toBeGreaterThan(0);

      // Das Fenster ist an den neuen Bereich gebunden (Titel-Suffix).
      await expect.poll(() => page.title()).toContain('(Bereich');
    } finally {
      await closeApp(app, userData);
      removeDir(target);
    }
  });
});

test.describe('DA-02: Nicht-leeres Ziel wird abgelehnt (F-132)', () => {
  test('eine vorhandene Datei verhindert das Erstellen, das Ziel bleibt unverändert', async () => {
    const { app, page, userData } = await launchApp();
    const target = mkTempDir();
    fs.writeFileSync(path.join(target, 'vorhanden.md'), '# Bestand\n', 'utf8');
    try {
      const result = await createDemoAreaAt(page, target);
      expect(result).toEqual({ ok: false, error: 'not-empty' });
      // Danach weiterhin genau diese eine Datei; nichts hinzukopiert.
      expect(fs.readdirSync(target)).toEqual(['vorhanden.md']);
    } finally {
      await closeApp(app, userData);
      removeDir(target);
    }
  });
});

test.describe('DA-03: Demo-Seiten sind linter-sauber (F-132)', () => {
  test('jede der 12 Markdown-Seiten öffnet ohne Linter-Marker', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp();
    const target = mkTempDir();
    try {
      const result = await createDemoAreaAt(page, target);
      expect(result.ok).toBe(true);
      await expect.poll(() => page.title()).toContain('(Bereich');

      const section = page.locator(AREA_SECTION);
      await expect(section).toBeVisible();
      // Der Wurzelordner listet genau die zwölf Markdown-Seiten (Anlagen und
      // Vorlage liegen in Unterordnern, die Binär-Dateien sind kein Markdown).
      await expect(section.locator('.area-file-row')).toHaveCount(12);

      for (let i = 0; i < MD_PAGES.length; i++) {
        const name = MD_PAGES[i];
        await section.locator('.area-file-row', { hasText: name }).first().click();
        await expect(page.locator(SEL.tabs0)).toHaveCount(i + 1);

        // Quellcode-Ansicht: Lint-Lauf abwarten (300-ms-Debounce plus IPC),
        // dann dürfen keine Marker stehen. Während des Bereichs-Index-Aufbaus
        // unterdrückt die Wiki-Regel ihre Marker (kein Fehlalarm).
        await page.locator(SEL.viewBtn('source')).click();
        await expect(page.locator(SEL.editorContent0)).toBeVisible();
        await page.waitForTimeout(700);
        await expect(page.locator(`${SEL.paneSource0} .cm-linter-mark`)).toHaveCount(0);

        // Zurück in die Lese-Ansicht (nächste Seite öffnet frisch in Gerendert).
        await page.locator(SEL.viewBtn('rendered')).click();
      }
    } finally {
      await closeApp(app, userData);
      removeDir(target);
    }
  });
});

test.describe('DA-04: Abfrage liefert Treffer aus der Demo-Area (F-132)', () => {
  test('die erste TABLE-Abfrage über #demo rendert zwölf Treffer-Zeilen ohne Fehler', async () => {
    test.setTimeout(90000);
    const { app, page, userData } = await launchApp();
    const target = mkTempDir();
    try {
      const result = await createDemoAreaAt(page, target);
      expect(result.ok).toBe(true);

      const section = page.locator(AREA_SECTION);
      await expect(section).toBeVisible();
      await section.locator('.area-file-row', { hasText: '08 Queries.md' }).first().click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);

      // Erste perspective-query (TABLE ... FROM #demo SORT chapter): sobald der
      // Bereichs-Index steht, rendert die Tabelle eine Zeile je Demo-Seite.
      const table = page.locator(`${SEL.markdownBody0} table.perspective-query-table`).first();
      await expect(table).toBeVisible({ timeout: 30000 });
      await expect.poll(() => table.locator('tbody tr').count(), { timeout: 30000 }).toBe(12);

      // Kein Abfrage-Syntaxfehler in der gesamten Seite (pinnt die Query-Syntax
      // aller sieben Demo-Abfragen; 4T-1075 ergaenzte die Selbstbezugs-Quelle
      // FROM [[]] mit bold() und den this.-Praefix).
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-error`)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
      removeDir(target);
    }
  });
});

test.describe('DA-05: Erweiterung aus entfernt das Kommando aus der Palette (S-091)', () => {
  test('demo-area deaktiviert blendet area.createDemo aus; Gegenprobe zeigt es', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();

      // Gegenprobe: mit aktiver Erweiterung ist das Demo-Kommando auffindbar.
      expect(await paletteHitCount(page, 'Demo')).toBeGreaterThan(0);

      // Erweiterung deaktivieren (Broadcast-Pfad wie aus einem anderen Fenster);
      // der Poll absorbiert die Latenz bis zum Neuaufbau der Palette-Liste.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', ['demo-area']));
      await expect.poll(() => paletteHitCount(page, 'Demo'), { timeout: 15000 }).toBe(0);

      // Wieder aktivieren: der Eintrag kehrt zurück.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', []));
      await expect.poll(() => paletteHitCount(page, 'Demo'), { timeout: 15000 }).toBeGreaterThan(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});
