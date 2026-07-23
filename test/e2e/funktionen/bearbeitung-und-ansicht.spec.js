// 4T-0195: E2E-Funktions-Suite — Gruppen Bearbeitung und Ansicht.
// describe-Titel tragen die Matrix-IDs aus test/abdeckungs-matrix.json.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'regression', '4t-0186.md');
const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');
// 4T-0640 (Epic 3E-0069): nummerierte und unnummerierte Liste fuer den
// Regressionstest zum Schreibschutz im Lesemodus.
const LISTEN = path.resolve(__dirname, '..', '..', 'fixtures', 'regression', '4t-0640.md');
// 4T-0599 (Epic 3E-0112): nummerierte Liste mit Unterpunkt plus zwei freie
// Textzeilen fuer die Struktur-Kommandos und ihren Rueckfall.
const LISTEN_STRUKTUR = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'listen-struktur.md',
);
// 4T-0655 (Epic 3E-0112): zwei durch eine Leerzeile getrennte Listen, beide
// bei 1 beginnend — Vorlage für die Nummerierungs-Invariante.
const LISTEN_NUMMERIERUNG = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'listen-nummerierung.md',
);
// 4T-0600 (Epic 3E-0112): verschachtelte nummerierte Liste mit gueltiger
// Einrueckung fuer den Listen-Ausstieg.
const LISTEN_AUSSTIEG = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'listen-ausstieg.md',
);
// 4T-0572 (Epic 3E-0105): Fixture mit dokument-gebundenen Editor-Ansicht-
// Schaltern im Frontmatter (alle drei entgegen den Defaults).
const EDITOR_VIEW_FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'editor-ansicht-frontmatter.md',
);

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

async function enterEditSource(app, page) {
  await sendMenuChannel(app, 'menu:viewChange', 'source');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

test.describe('FB-01: Edit-Modus-Toggle (Strg+E)', () => {
  test('Strg+E schaltet den Edit-Modus um', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      const source = page.locator('.pane-group[data-pane="0"] .pane-source-editor');
      await expect(source).toHaveClass(/read-only/);
      // Strg+E ist ein Menue-Accelerator; der Test nutzt den identischen
      // IPC-Pfad des Menue-Klicks (Matrix-Markierung: ipc).
      await sendMenuChannel(app, 'menu:toggleEdit');
      await expect(source).not.toHaveClass(/read-only/);
      await sendMenuChannel(app, 'menu:toggleEdit');
      await expect(source).toHaveClass(/read-only/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FB-02: Listen-Indent (Tab/Umschalt+Tab)', () => {
  test('Tab rueckt ein Listenelement ein', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      // 4T-0661: Eingerueckt wird der ZWEITE Punkt — er hat einen Vorgaenger,
      // unter den er rutschen kann. Beim ersten Punkt einer Liste gibt es
      // keinen; dort ist Tab seit der Festlegung des Product Owners bewusst
      // wirkungslos (Gegenprobe unten).
      const line = editor.locator('.cm-line', { hasText: 'Aufgabe zwei' });
      await line.click();
      await page.keyboard.press('Tab');
      await expect(editor.locator('.cm-line', { hasText: 'Aufgabe zwei' })).toContainText(
        '- [x] Aufgabe zwei',
      );
      const text = await editor.locator('.cm-line', { hasText: 'Aufgabe zwei' }).textContent();
      expect(text.startsWith('  -')).toBe(true);
      await page.keyboard.press('Shift+Tab');
      const text2 = await editor.locator('.cm-line', { hasText: 'Aufgabe zwei' }).textContent();
      expect(text2.startsWith('- [x]')).toBe(true);
      // Gegenprobe: der erste Punkt bleibt unberuehrt.
      await editor.locator('.cm-line', { hasText: 'Aufgabe eins' }).click();
      await page.keyboard.press('Tab');
      const text3 = await editor.locator('.cm-line', { hasText: 'Aufgabe eins' }).textContent();
      expect(text3.startsWith('- [ ]')).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FB-03: Tabellen-Editor-Komfort (Tab springt, Enter neue Zeile)', () => {
  test('Tab springt in die naechste Zelle, Enter ergaenzt eine Tabellenzeile', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      const row = editor.locator('.cm-line', { hasText: '| 1 | 2 |' });
      await row.click();
      // Der Tabellen-Enter greift bewusst nur am Zeilenende.
      await page.keyboard.press('End');
      const before = await editor.locator('.cm-line').count();
      await page.keyboard.press('Enter');
      await expect.poll(() => editor.locator('.cm-line').count()).toBe(before + 1);
      // Die neue Zeile ist eine leere Tabellenzeile mit Pipes.
      await expect(editor.locator('.cm-line', { hasText: '| |' }).first()).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FB-04: Linter markiert bare URL', () => {
  test('bare URL bekommt einen Lint-Marker', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n\nSiehe https://example.org/pfad dazu.\n');
      await expect(page.locator('.cm-linter-bare-url').first()).toBeVisible({ timeout: 10000 });
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FB-05: Wiki-Autocomplete oeffnet bei [[', () => {
  test('[[ zeigt Vorschlagsliste', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n[[');
      // Der erste Trigger stoesst den Index-Aufbau an (B-18) und liefert
      // noch 'indexing'; nach kurzer Wartezeit triggert ein weiteres
      // Zeichen die Vorschlaege gegen den fertigen Index.
      await page.waitForTimeout(1200);
      // Prefix '4' matcht die Nachbar-Fixtures (4t-0186.md) im Suchraum.
      await page.keyboard.type('4');
      await expect(page.locator('.cm-tooltip-autocomplete').first()).toBeVisible({
        timeout: 10000,
      });
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FB-06: Undo/Redo', () => {
  test('Strg+Z nimmt Eingabe zurueck, Strg+Y stellt wieder her', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await page.keyboard.press('Control+End');
      await page.keyboard.type('UNDOTESTWORT');
      await expect(editor).toContainText('UNDOTESTWORT');
      await page.keyboard.press('Control+z');
      await expect(editor).not.toContainText('UNDOTESTWORT');
      await page.keyboard.press('Control+y');
      await expect(editor).toContainText('UNDOTESTWORT');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FB-07: Timestamp einfuegen (Strg+Umschalt+D)', () => {
  // 4T-0207 (Epic 3E-0015): Kommando edit.insertTimestamp — Lokalzeit-
  // Timestamp 'yyyy-mm-dd hh:mm' an der Cursor-Position. Format-Pruefung
  // per Regex statt exaktem Zeitvergleich (Minutenwechsel-robust).
  test('fuegt Timestamp ein, ersetzt Selektion, bleibt im Reading-Modus wirkungslos', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      // Einfuegen an der Cursor-Position (hinter einem Marker-Wort).
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nTSMARK ');
      await page.keyboard.press('Control+Shift+D');
      await expect(editor.locator('.cm-line', { hasText: 'TSMARK' })).toHaveText(
        /TSMARK \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
      );
      // Aktive Selektion wird ersetzt (Standard-Editor-Verhalten).
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nERSETZMICH');
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+End');
      await page.keyboard.press('Control+Shift+D');
      await expect(editor.locator('.cm-line', { hasText: 'ERSETZMICH' })).toHaveCount(0);
      // Reading-Modus: Kommando wirkungslos, Dokument unveraendert.
      const linesBefore = await editor.locator('.cm-line').count();
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      await expect(page.locator(SEL.paneRendered0)).toBeVisible();
      await page.keyboard.press('Control+Shift+D');
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect.poll(() => editor.locator('.cm-line').count()).toBe(linesBefore);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FB-08: Lesemodus schuetzt vor der Listen-Automatik', () => {
  // 4T-0640 (Epic 3E-0069): Regressionstest zum gemeldeten Fehler — Enter am
  // Ende des letzten Eintrags einer nummerierten Liste setzte im reinen
  // Lesemodus eine neue Nummer. Ursache war die Tastenbelegung aus
  // @codemirror/lang-markdown, deren Enter- und Backspace-Kommandos den
  // Schreibschutz nicht pruefen (die Standard-Kommandos tun es).
  test('Enter und Backspace veraendern das Dokument im Lesemodus nicht', async () => {
    const { app, page, userData } = await launchApp({ args: [LISTEN] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      const source = page.locator('.pane-group[data-pane="0"] .pane-source-editor');
      await expect(source).toHaveClass(/read-only/);
      const editor = page.locator(SEL.editorContent0);
      const zeilenVorher = await editor.locator('.cm-line').count();

      // Cursor ans Ende des letzten nummerierten Eintrags.
      await editor.locator('.cm-line', { hasText: 'Dritter Eintrag' }).click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      // Keine vierte Nummer, keine zusaetzliche Zeile, Tab nicht schmutzig.
      await expect(editor.locator('.cm-line', { hasText: '4.' })).toHaveCount(0);
      await expect.poll(() => editor.locator('.cm-line').count()).toBe(zeilenVorher);
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);

      // Backspace am Zeilenanfang trifft dieselbe Luecke (deleteMarkupBackward).
      await page.keyboard.press('Home');
      await page.keyboard.press('Backspace');
      await expect(editor.locator('.cm-line', { hasText: '3. Dritter Eintrag' })).toHaveCount(1);
      await expect.poll(() => editor.locator('.cm-line').count()).toBe(zeilenVorher);

      // Auch die Aufzaehlung ohne Nummerierung bleibt unveraendert.
      await editor.locator('.cm-line', { hasText: 'Beta' }).click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await expect.poll(() => editor.locator('.cm-line').count()).toBe(zeilenVorher);
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);

      // Gegenprobe: im Bearbeitungs-Modus setzt Enter die Nummer wie bisher.
      await page.locator(SEL.btnEdit).click();
      await expect(source).not.toHaveClass(/read-only/);
      await editor.locator('.cm-line', { hasText: 'Dritter Eintrag' }).click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await expect(editor.locator('.cm-line', { hasText: '4.' })).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FA-01: Zoom (Strg+Plus/0) mit Indikator', () => {
  test('Zoom vergroessert, Indikator erscheint, Strg+0 setzt zurueck', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      const indicator = page.locator('#zoom-indicator');
      await expect(indicator).toBeHidden();
      await page.keyboard.press('Control+NumpadAdd');
      await expect(indicator).toBeVisible();
      await expect(indicator).toContainText('110');
      await page.keyboard.press('Control+0');
      await expect(indicator).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('FA-02: Quellcode-Toggles (Wrap, Zeilennummern, Gliederungsspur)', () => {
  test('Statusbar-Buttons schalten Zeilennummern und Fold-Gutter', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      const gutterNumbers = page.locator('.pane-group[data-pane="0"] .cm-lineNumbers');
      const visibleBefore = await gutterNumbers.isVisible().catch(() => false);
      await page.locator('#btn-numbers').click();
      if (visibleBefore) {
        await expect(gutterNumbers).toBeHidden();
      } else {
        await expect(gutterNumbers).toBeVisible();
      }
      // Fold-Gutter-Toggle erzeugt/entfernt die Heading-Spur.
      const foldGutter = page.locator('.pane-group[data-pane="0"] .cm-headingGutter');
      const foldBefore = await foldGutter.isVisible().catch(() => false);
      await page.locator('#btn-fold-gutter').click();
      if (foldBefore) {
        await expect(foldGutter).toBeHidden();
      } else {
        await expect(foldGutter).toBeVisible();
      }
      // Wrap-Toggle schaltet die CodeMirror-Klasse um.
      // 4T-0361: '.pane-source' -> Haupt-Editor; ohne den Qualifier matcht
      // '.cm-content' auch die Notiz-CodeMirror-Instanz (3E-0066/4T-0398)
      // und bricht mit Playwright-Strict-Mode (zwei Treffer).
      const scroller = page.locator('.pane-group[data-pane="0"] .pane-source .cm-content');
      const wrapBefore = await scroller.evaluate((el) => el.classList.contains('cm-lineWrapping'));
      await page.locator('#btn-wrap').click();
      await expect
        .poll(() => scroller.evaluate((el) => el.classList.contains('cm-lineWrapping')))
        .toBe(!wrapBefore);
      // 4T-0572 (Epic 3E-0105, Weg A): Jedes Umschalten schreibt den Wert in
      // das Frontmatter des Dokuments — der Tab wird dirty, das Dokument
      // beginnt mit einem Frontmatter-Block mit den drei Schluesseln.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
      // Kurzes Dokument: alle Zeilen sind gerendert, textContent genuegt.
      const docText = await scroller.evaluate((el) => el.textContent);
      expect(docText.startsWith('---')).toBe(true);
      expect(docText).toContain('line-numbers:');
      expect(docText).toContain('fold-gutter:');
      expect(docText).toContain('word-wrap:');
    } finally {
      // 4T-0572: die Toggles hinterlassen absichtlich einen dirty Buffer.
      await closeApp(app, userData, { force: true });
    }
  });

  // 4T-0572 (Epic 3E-0105): Frontmatter-Vorgabe uebersteuert die globale
  // Voreinstellung schon beim Oeffnen (dokument-gebunden, portabel).
  test('Frontmatter-Schluessel steuern die Editor-Ansicht beim Oeffnen', async () => {
    const { app, page, userData } = await launchApp({ args: [EDITOR_VIEW_FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      // Fixture: line-numbers: false, fold-gutter: false, word-wrap: true —
      // jeweils entgegen den Defaults (Nummern an, Gliederung an, Umbruch aus).
      await expect(page.locator('.pane-group[data-pane="0"] .cm-lineNumbers')).toBeHidden();
      await expect(page.locator('.pane-group[data-pane="0"] .cm-headingGutter')).toBeHidden();
      const scroller = page.locator('.pane-group[data-pane="0"] .pane-source .cm-content');
      await expect
        .poll(() => scroller.evaluate((el) => el.classList.contains('cm-lineWrapping')))
        .toBe(true);
      // Reines Oeffnen aendert nichts: Tab bleibt sauber.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-0576 (Epic 3E-0106): Die drei Editor-Ansicht-Schalter und die vier
// Ansichts-Schalter bilden eine gemeinsame Gruppe in der mittleren
// Statusbar-Zone und sitzen in der Fenster-Mitte, nicht in der Mitte des
// Restplatzes. Gegenprobe mit breitem Fenster (viel Restplatz rechts).
test.describe('FA-06: Zentrierte Editor- und Ansicht-Schalter', () => {
  test('die sieben Schalter stehen als Gruppe in der Fenster-Mitte', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) win.setSize(1400, 800);
      });
      const readGeometry = () =>
        page.evaluate(() => {
          const box = (sel) => document.querySelector(sel).getBoundingClientRect();
          const bar = box('footer.statusbar');
          const center = box('.statusbar .statusbar-center');
          return {
            // Abstand der Gruppen-Mitte zur Leisten-Mitte.
            offset: Math.abs((center.left + center.right) / 2 - (bar.left + bar.right) / 2),
            ids: [
              ...document.querySelectorAll(
                '.statusbar-center .editor-toggles > button, .statusbar-center .view-toggle > button',
              ),
            ].map((b) => b.id || b.dataset.view),
            overlapsLeft: box('.statusbar-left').right > center.left,
            overlapsRight: box('.statusbar-right').left < center.right,
          };
        });
      // Nach dem Resize auf die neue Geometrie warten.
      await expect.poll(async () => (await readGeometry()).offset).toBeLessThanOrEqual(1);
      const geo = await readGeometry();
      // Genau die sieben Schalter in Anzeige-Reihenfolge.
      expect(geo.ids).toEqual([
        'btn-fold-gutter',
        'btn-numbers',
        'btn-wrap',
        'live',
        'source',
        'split',
        'rendered',
      ]);
      // Fenster-Mitte, nicht Rest-Platz-Mitte (Toleranz für Rundung).
      expect(geo.offset).toBeLessThanOrEqual(1);
      // Die Nachbar-Zonen überlappen die Gruppe nicht.
      expect(geo.overlapsLeft).toBe(false);
      expect(geo.overlapsRight).toBe(false);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('FA-03: Fokus-Modus (Strg+Umschalt+F)', () => {
  test('Fokus-Modus blendet Tabbar und Statusbar aus, Esc beendet', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await page.keyboard.press('Control+Shift+F');
      await expect(page.locator('body')).toHaveClass(/focus-mode/);
      await page.keyboard.press('Escape');
      await expect(page.locator('body')).not.toHaveClass(/focus-mode/);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('FA-04: Theme ueber Menue-Weg (Hell/Dunkel)', () => {
  test('menu:setTheme dark/light setzt data-theme', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:setTheme', 'dark');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
        .toBe('dark');
      await sendMenuChannel(app, 'menu:setTheme', 'light');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
        .toBe('light');
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-0599 (Epic 3E-0112): Struktur-Kommandos der Listen. Die reine Logik
// deckt test/unit/list-outline.test.js ab; hier zaehlen die Punkte, die nur
// gegen eine echte EditorView pruefbar sind: Tastenbindung, Atomaritaet des
// Rueckgaengig-Schritts und der Rueckfall auf die Standard-Belegung.
// Verglichen wird ueber die nicht-leeren Zeilen, damit die Leerzeilen der
// Fixture die Positionen nicht verschieben.
async function nonEmptyLines(editor) {
  const all = await editor.locator('.cm-line').allTextContents();
  return all.filter((text) => text.trim() !== '');
}
test.describe('FB-09: Listenpunkt samt Teilbaum verschieben (Alt+Pfeil)', () => {
  test('Alt+Pfeil ab bewegt den Ast, nummeriert neu und ist ein Undo-Schritt', async () => {
    const { app, page, userData } = await launchApp({ args: [LISTEN_STRUKTUR] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.locator('.cm-line', { hasText: 'Beta' }).first().click();
      await page.keyboard.press('Alt+ArrowDown');
      // Beta wandert samt Unterpunkt hinter Gamma; die Nummern ziehen nach.
      await expect
        .poll(async () => (await nonEmptyLines(editor)).slice(1, 5))
        .toEqual(['1. Alpha', '2. Gamma', '3. Beta', '  - Beta eins']);
      await page.keyboard.press('Control+z');
      await expect
        .poll(async () => (await nonEmptyLines(editor)).slice(1, 5))
        .toEqual(['1. Alpha', '2. Beta', '  - Beta eins', '3. Gamma']);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FB-10: Einruecken nimmt den Teilbaum mit', () => {
  test('Tab rueckt Punkt und Unterpunkt ein und nummeriert die Ebenen neu', async () => {
    const { app, page, userData } = await launchApp({ args: [LISTEN_STRUKTUR] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.locator('.cm-line', { hasText: 'Beta' }).first().click();
      await page.keyboard.press('Tab');
      await expect
        .poll(async () => (await nonEmptyLines(editor)).slice(1, 5))
        // 4T-0660: eingerueckt wird auf die Inhalts-Spalte des Vorgaengers
        // (unter "1. " drei Zeichen), sonst bliebe die Liste in der Anzeige
        // flach.
        .toEqual(['1. Alpha', '   1. Beta', '     - Beta eins', '2. Gamma']);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FB-11: Alt+Pfeil ausserhalb von Listen', () => {
  test('verschiebt die einzelne Zeile (Rueckfall auf die Standard-Belegung)', async () => {
    const { app, page, userData } = await launchApp({ args: [LISTEN_STRUKTUR] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.locator('.cm-line', { hasText: 'Freier Text zwei' }).click();
      await page.keyboard.press('Alt+ArrowUp');
      await expect
        .poll(async () => (await nonEmptyLines(editor)).slice(-2))
        .toEqual(['Freier Text zwei', 'Freier Text eins']);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-0655 (Epic 3E-0112): Nummerierungs-Invariante. Prüft den auslösenden
// Fall des Product Owners und die Umkehrung; die Korrektur muss Teil der
// Bearbeitung sein, also mit einem einzigen Rückgängig-Schritt verschwinden.
test.describe('FB-12: Nummerierung nach dem Verschmelzen zweier Listen', () => {
  test('Leerzeile loeschen zaehlt durch, ein Undo stellt beides her', async () => {
    const { app, page, userData } = await launchApp({ args: [LISTEN_NUMMERIERUNG] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      // Cursor an den Anfang der zweiten Liste, dann die Leerzeile davor
      // per Rueckschritt entfernen.
      await editor.locator('.cm-line', { hasText: 'Zweite Liste A' }).click();
      await page.keyboard.press('Home');
      await page.keyboard.press('Backspace');
      await expect
        .poll(async () => (await nonEmptyLines(editor)).slice(1))
        .toEqual([
          '1. Erste Liste A',
          '2. Erste Liste B',
          '3. Zweite Liste A',
          '4. Zweite Liste B',
        ]);
      await page.keyboard.press('Control+z');
      await expect
        .poll(async () => (await nonEmptyLines(editor)).slice(1))
        .toEqual([
          '1. Erste Liste A',
          '2. Erste Liste B',
          '1. Zweite Liste A',
          '2. Zweite Liste B',
        ]);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-0655: Zweiter Befund des Product Owners — Enter erzeugt einen neuen
// Punkt, dessen Marker anschliessend geloescht wird. Zurueck bleibt eine
// Leerzeile, die nach der Festlegung des Product Owners trennt: Beide Listen
// behalten ihre eigene Zaehlung, es entsteht keine Luecke.
test.describe('FB-13: Leerzeile mitten in der Liste haelt beide Zaehlungen', () => {
  test('nach Enter und Loeschen des Markers bleibt jede Liste bei ihren Nummern', async () => {
    const { app, page, userData } = await launchApp({ args: [LISTEN_NUMMERIERUNG] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.locator('.cm-line', { hasText: 'Erste Liste B' }).click();
      await page.keyboard.press('End');
      // Enter erzeugt ueber die Markdown-Belegung den naechsten Punkt; sein
      // Marker wird anschliessend wieder entfernt.
      await page.keyboard.press('Enter');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await expect
        .poll(async () => (await nonEmptyLines(editor)).slice(1))
        .toEqual([
          '1. Erste Liste A',
          '2. Erste Liste B',
          '1. Zweite Liste A',
          '2. Zweite Liste B',
        ]);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-0660: Die Anzeige folgt derselben Listen-Grenze wie der Quelltext. Ohne
// das Render-Plugin zaehlte sie ueber die Leerzeile hinweg bis 4 durch und
// wich damit vom Quelltext ab — der vom Product Owner gemeldete Fehler.
test.describe('FB-14: Anzeige beginnt nach der Leerzeile neu', () => {
  test('der erste Punkt der zweiten Liste traegt den Nummern-Neustart', async () => {
    const { app, page, userData } = await launchApp({ args: [LISTEN_NUMMERIERUNG] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('li')).toHaveCount(4);
      // Genau ein Neustart, und zwar am dritten Punkt.
      await expect(body.locator('li[value="1"]')).toHaveCount(1);
      await expect(body.locator('li').nth(2)).toHaveAttribute('value', '1');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-0661: Dieselbe Einrueck-Tiefe wie im Cursor-Fall, auch wenn mehrere
// Zeilen markiert sind. Vorher lief dort die zeilenweise Bestands-Logik mit
// fester Schrittweite, und die Verschachtelung blieb in der Anzeige flach.
test.describe('FB-15: Einruecken mit Markierung ueber mehrere Zeilen', () => {
  test('markierte Punkte rutschen auf die Inhalts-Spalte des Vorgaengers', async () => {
    const { app, page, userData } = await launchApp({ args: [LISTEN_STRUKTUR] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      // Von "Beta" bis "Gamma" markieren (drei Zeilen inklusive Unterpunkt).
      await editor.locator('.cm-line', { hasText: 'Beta' }).first().click();
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+ArrowDown');
      await page.keyboard.press('Shift+ArrowDown');
      await page.keyboard.press('Shift+End');
      await page.keyboard.press('Tab');
      await expect
        .poll(async () => (await nonEmptyLines(editor)).slice(1, 5))
        .toEqual(['1. Alpha', '   1. Beta', '     - Beta eins', '   2. Gamma']);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-0656: Tabulator ausserhalb von Listen und Tabellen. Ohne die Belegung
// war die Taste dort unbelegt, und der Fokus wanderte aus dem Editor heraus
// (Befund des Product Owners).
test.describe('FB-16: Tabulator rueckt ausserhalb von Listen ein', () => {
  test('Tab fuegt eine Einrueckung ein, Umschalt+Tab entfernt sie', async () => {
    const { app, page, userData } = await launchApp({ args: [LISTEN_STRUKTUR] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.locator('.cm-line', { hasText: 'Freier Text eins' }).click();
      await page.keyboard.press('Home');
      await page.keyboard.press('Tab');
      await expect
        .poll(async () => {
          const lines = await nonEmptyLines(editor);
          return lines[lines.length - 2];
        })
        .toMatch(/^\s+Freier Text eins$/);
      await page.keyboard.press('Shift+Tab');
      await expect
        .poll(async () => {
          const lines = await nonEmptyLines(editor);
          return lines[lines.length - 2];
        })
        .toBe('Freier Text eins');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-0600: Listen-Ausstieg. Die eingekaufte Automatik setzt Listen fort und
// rueckt auf leeren Unterpunkten korrekt aus (in der Anwendung gemessen); nur
// auf der obersten Ebene hinterliess sie eine Leerzeile plus einen weiteren
// leeren Punkt, statt die Liste zu beenden.
test.describe('FB-17: Enter auf leerem Punkt beendet die Liste', () => {
  test('Ausruecken je Ebene, dann sauberer Ausstieg ohne Rest-Punkt', async () => {
    const { app, page, userData } = await launchApp({ args: [LISTEN_AUSSTIEG] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor.locator('.cm-line', { hasText: 'Charlie' }).click();
      await page.keyboard.press('End');
      // Erstes Enter: neuer Punkt auf der Unter-Ebene.
      await page.keyboard.press('Enter');
      await expect
        .poll(async () => (await editor.locator('.cm-line').allTextContents())[5])
        .toBe('   3. ');
      // Zweites Enter: rueckt eine Ebene aus (Verhalten der Automatik).
      await page.keyboard.press('Enter');
      await expect
        .poll(async () => (await editor.locator('.cm-line').allTextContents())[5])
        .toBe('2. ');
      // Drittes Enter: beendet die Liste, ohne Rest-Punkt und ohne
      // zusaetzliche Leerzeile. Delta beginnt danach bei 1, weil die frisch
      // entstandene Leerzeile die Liste trennt (Regel aus 4T-0655/4T-0660).
      await page.keyboard.press('Enter');
      await expect
        .poll(async () => (await editor.locator('.cm-line').allTextContents()).slice(2, 7))
        .toEqual(['1. Alpha', '   1. Bravo', '   2. Charlie', '', '1. Delta']);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FA-05: Scroll-Sync-Toggle', () => {
  test('Statusbar-Button aktiviert die Scroll-Synchronisation', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'split');
      const btn = page.locator('#btn-scroll-sync');
      await expect(btn).not.toHaveClass(/active/);
      await btn.click();
      await expect(btn).toHaveClass(/active/);
    } finally {
      await closeApp(app, userData);
    }
  });
});
