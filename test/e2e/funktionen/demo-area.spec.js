// 4T-000632 (Epic 3E-000102): E2E-Funktions-Suite Demo-Area. Die mitgelieferten
// englischen Demo-Inhalte (src/demo) werden über den direkten Pfad-Einstieg
// der Preload-Brücke (window.api.createDemoAreaAt, identische Strecke wie der
// Menü-/Dialog-Weg ab der Ordner-Wahl) in einen leeren Ordner kopiert und als
// Bereich geöffnet. Native Dialog und Menü sind per Playwright nicht bedienbar.
//
// DA-01: Erstellen kopiert den mitgelieferten Bestand und bindet das Fenster.
// DA-02: nicht-leeres Ziel wird abgelehnt, der Ordner bleibt unverändert.
// DA-03: jede Demo-Markdown-Seite des Bestands öffnet linter-sauber.
// DA-04: die erste Abfrage (TABLE über #demo) liefert eine Zeile je Demo-Seite
//        mit diesem Schlagwort.
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

// 4T-001091 (Epic 3E-000127): Die Markdown-Seiten im Wurzelverzeichnis der
// Demo-Area werden aus dem BESTAND gelesen statt hier ein zweites Mal
// aufgezählt. Grund ist der Befund dieses Vorgangs: Die frühere Kopie der
// Liste war beim Ausbau der Sammlung (4T-000645) nicht mitgewachsen, und die
// harte Erwartung «genau zwölf Zeilen» ließ DA-03 abbrechen, bevor die
// Linter-Prüfung überhaupt lief. Damit blieben gerade die neuen Seiten
// ungeprüft. Eine zweite Liste desselben Bestands läuft unweigerlich
// auseinander; die kuratierte Soll-Liste mit ihrem bewussten Nachzug bleibt
// beim Unit-Wächter test/unit/demo-area.test.js, der sie gegen den realen
// Bestand hält.
const DEMO_DIR = path.resolve(__dirname, '..', '..', '..', 'src', 'demo');
const MD_PAGES = fs
  .readdirSync(DEMO_DIR, { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.md'))
  .map((e) => e.name)
  .sort();
// 4T-001552 (Epic 3E-000251): Auch die Trefferzahl der Demo-Abfrage wird aus dem
// BESTAND gerechnet statt als Literal geführt. Derselbe Befund wie bei MD_PAGES
// oben, hier ein zweites Mal eingetreten: Die Demo-Datenbank `Library.md` aus
// 4T-001551 traegt das Schlagwort `demo` und hob die Trefferzahl von 12 auf 13,
// worauf DA-04 rot lief, obwohl nichts kaputt war. Die Abfrage lautet
// `TABLE ... FROM #demo`, also ist ihre Quelle genau die Menge der Demo-Seiten
// mit diesem Schlagwort (Registerklasse L10/U2, verortete Massnahme 4T-001541).
function hatDemoSchlagwort(name) {
  const text = fs.readFileSync(path.join(DEMO_DIR, name), 'utf8');
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fm) return false;
  const inline = /^tags:\s*\[(.*)\]\s*$/m.exec(fm[1]);
  if (inline) {
    return inline[1]
      .split(',')
      .map((s) => s.trim())
      .includes('demo');
  }
  // Block-Form: `tags:` gefolgt von eingerueckten `- wert`-Zeilen.
  const block = /^tags:\s*$\n((?:[ \t]+-.*\n?)+)/m.exec(fm[1] + '\n');
  if (!block) return false;
  return block[1]
    .split('\n')
    .map((z) => z.replace(/^[ \t]*-\s*/, '').trim())
    .includes('demo');
}
const DEMO_TAGGED = MD_PAGES.filter(hatDemoSchlagwort);

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

// 4T-001775 (Epic 3E-000304): Die Dateiliste beschriftet ohne Markdown-Endung.
// Gesucht wird EXAKT: Der Demo-Bestand traegt Unterseiten, und 'Milky Way' ist
// nach der Kuerzung Teilstring von 'Milky Way∕Sun' — eine Teilstring-Suche
// waere hier mehrdeutig. Sonderzeichen der regulaeren Ausdruecke werden
// maskiert, weil die Namen aus dem Bestand kommen und nicht aus dem Test.
function areaZeileExakt(section, dateiname) {
  const muster = dateiname
    .replace(/\.(md|markdown|mdown|mkd)$/i, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return section.locator('.area-file-row', { hasText: new RegExp(`^${muster}$`) });
}

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
  test('kopiert den mitgelieferten Bestand in ein leeres Ziel und bindet das Fenster', async () => {
    const { app, page, userData } = await launchApp();
    const target = mkTempDir();
    try {
      const result = await createDemoAreaAt(page, target);
      expect(result.ok).toBe(true);

      // Jede mitgelieferte Datei liegt im Zielordner (fs-Check). Geprüft wird
      // die Existenz, nicht die Anzahl; die Vollzähligkeit gegen den Bestand
      // hält der Unit-Wächter test/unit/demo-area.test.js.
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
  test('jede Markdown-Seite des Bestands öffnet ohne Linter-Marker', async () => {
    // Die Schranke folgt der Zahl der Seiten: Jede wird einzeln geöffnet,
    // in die Quellcode-Ansicht geschaltet und nach dem Lint-Lauf geprüft.
    test.setTimeout(240000);
    const { app, page, userData } = await launchApp();
    const target = mkTempDir();
    try {
      const result = await createDemoAreaAt(page, target);
      expect(result.ok).toBe(true);
      await expect.poll(() => page.title()).toContain('(Bereich');

      const section = page.locator(AREA_SECTION);
      await expect(section).toBeVisible();
      // Der Wurzelordner listet genau die Markdown-Seiten des Bestands
      // (Anlagen und Vorlage liegen in Unterordnern, die Binär-Dateien sind
      // kein Markdown). Die Zahl kommt aus dem Bestand, damit sie mit ihm
      // wächst; eine feste Zahl hatte den Fall bereits einmal blockiert.
      await expect(section.locator('.area-file-row')).toHaveCount(MD_PAGES.length);

      for (let i = 0; i < MD_PAGES.length; i++) {
        const name = MD_PAGES[i];
        await areaZeileExakt(section, name).first().click();
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
  test('die erste TABLE-Abfrage über #demo rendert eine Zeile je Demo-Seite mit diesem Schlagwort, ohne Fehler', async () => {
    test.setTimeout(90000);
    const { app, page, userData } = await launchApp();
    const target = mkTempDir();
    try {
      const result = await createDemoAreaAt(page, target);
      expect(result.ok).toBe(true);

      const section = page.locator(AREA_SECTION);
      await expect(section).toBeVisible();
      await areaZeileExakt(section, '08 Queries.md').first().click();
      // 4T-001366 (Epic 3E-000171): ZWEI Reiter, nicht einer — die Demo-Area traegt
      // seither eine Start-Seite (00 Welcome.md), die sich beim Oeffnen des
      // Bereichs von selbst zeigt; der Klick legt den zweiten daneben. Die
      // Zaehlung ist hier die Warte-Bedingung dafuer, dass die geklickte Datei
      // offen ist, nicht der Pruef-Gegenstand dieses Falls.
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);

      // Erste perspective-query (TABLE ... FROM #demo SORT chapter): sobald der
      // Bereichs-Index steht, rendert die Tabelle eine Zeile je Demo-Seite mit
      // dem Schlagwort `demo`. Der Erwartungswert kommt aus dem Bestand, nicht
      // aus einer Zahl im Code; die Gegenprobe darauf, dass die Ableitung
      // ueberhaupt greift, ist die Untergrenze darunter.
      expect(DEMO_TAGGED.length).toBeGreaterThan(1);
      const table = page.locator(`${SEL.markdownBody0} table.perspective-query-table`).first();
      await expect(table).toBeVisible({ timeout: 30000 });
      await expect
        .poll(() => table.locator('tbody tr').count(), { timeout: 30000 })
        .toBe(DEMO_TAGGED.length);

      // Kein Abfrage-Syntaxfehler in der gesamten Seite (pinnt die Query-Syntax
      // aller sieben Demo-Abfragen; 4T-001075 ergaenzte die Selbstbezugs-Quelle
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
