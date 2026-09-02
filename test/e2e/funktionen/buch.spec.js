// Epic 3E-000147 (4T-000842 bis 4T-000849): E2E-Funktions-Suite „Bücher" — ein Buch
// als erklärte Lese-Ordnung über gewöhnlichen Markdown-Dateien.
//
// BU-01 (4T-000843): Buch anlegen — Ordner, Buch-Datei und Begleitdatei
//        entstehen, das Panel zeigt das leere Buch, der Statusbar-Button ist
//        aktiv.
// BU-02 (4T-000844): Buch öffnen — das Inhaltsverzeichnis zeigt den Kapitel-Baum
//        in Lese-Reihenfolge samt Einrückung und den Abschnitt „nicht
//        eingehängt".
// BU-03 (4T-000844): Kapitel-Klick öffnet die Datei als Reiter, die
//        Lese-Markierung wandert mit dem aktiven Reiter.
// BU-04 (4T-000846): Leseführung folgt der Baum-Ordnung über Ordner-Grenzen; am
//        Ende gibt es eine Rückmeldung statt eines Umlaufs.
// BU-05 (4T-000845): Struktur-Pflege über die Baum-Operation und über die
//        Tastatur — Panel und Begleitdatei ziehen nach, keine Datei bewegt sich.
// BU-06 (4T-000847): Kapitel-Datei physisch verschieben — Baum-Eintrag und
//        eingehende Links einer dritten Datei ziehen nach.
// BU-07 (4T-000848): Am Dateisystem umbenanntes Kapitel wird als fehlend
//        markiert; die Neu-Zuordnung heilt den Baum.
// BU-08 (4T-000843): Eine Kapitel-Datei direkt zu öffnen macht kein Buch aktiv
//        (Erkennung allein über die Buch-Datei, Epic-Entscheidung 9).
// BU-09 (4T-000849): Erweiterung „Bücher" aus — Menü-Einträge, Statusbar-Button
//        und Panel entfallen, eine Buch-Datei öffnet gewöhnlich; das
//        Wiedereinschalten stellt alles her.
// BU-10 (4T-000871): Buch als Bereich — das zweite Buch öffnet als eigene
//        Applikation mit eigenem Fenster, jedes Fenster zeigt sein Buch,
//        erneutes Öffnen fokussiert, „Buch schließen" schließt die
//        Applikation, der Fenstertitel trägt den Buchnamen.
//
// Seit 4T-000871 gilt das Applikations-Modell (Buch = Bereich): «Buch öffnen»
// bindet eine freie Applikation oder öffnet eine neue; die Fälle BU-01 bis
// BU-07 starten deshalb ohne Start-Datei, damit die leere Start-Applikation
// zur Buch-Applikation wird und die Prüfungen im selben Fenster bleiben.
//
// Alle Wege laufen über die dialogfreien Pfad-Einstiege des Preload-Namensraums
// `books` (openPath, createAt, applyTreeOp, moveChapterFileTo, reassignChapter);
// die nativen Ordner- und Datei-Dialoge davor sind manueller Test.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { warteAufJson, warteAufText } = require('../helpers/dateien');
const { SEL } = require('../helpers/selectors');
const {
  makeTempDir,
  removeDir,
  makeBook,
  listFiles,
  settingsPathOf,
  declaredTopLevel,
} = require('../helpers/buch');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

const PANE = '.pane-group[data-pane="0"]';
const SECTION = `${PANE} .sidebar-book`;
const TREE = `${SECTION} .book-tree`;
const ROWS = `${TREE} .book-entry-row`;
const ROW_NAMES = `${ROWS} .book-entry-name`;
const UNLINKED = `${SECTION} .book-unlinked`;
const UNLINKED_NAMES = `${UNLINKED} .book-unlinked-list .book-entry-row .book-entry-name`;

const PALETTE = '#command-palette-modal';
const PALETTE_FILTER = '#command-palette-filter';
const PALETTE_ITEM = '.command-palette-item';

const SETTINGS_PAGE = `${PANE} .pane-system .settings-page`;

// --- Bedien-Helfer ------------------------------------------------------------

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Buch über den dialogfreien Pfad-Einstieg öffnen (Muster openAreaPath).
async function openBook(page, bookDir) {
  const result = await page.evaluate((dir) => window.api.books.openPath(dir), bookDir);
  expect(result).toMatchObject({ ok: true });
}

function bookStateOf(page) {
  return page.evaluate(() => window.api.books.getState());
}

// Inhaltsverzeichnis einblenden. Der Statusbar-Button ist ein Umschalter,
// deshalb genau EIN Klick und danach auf die Sektion warten (die Wiederhol-
// Regel für Tastendrucke gilt für Umschalter ausdrücklich nicht).
// 4T-001190 (2026-08-25): Nicht auf Verdacht klicken. Der Umschalter entscheidet
// am Schalt-Zustand (getBookPanelVisible), isVisible() dagegen an einer
// Momentaufnahme des DOM. Im frisch geöffneten zweiten Fenster läuft das
// Rendern der Sidebar dem bereits geladenen Zustand hinterher; ein Klick in
// dieser Lücke schaltet das Panel AUS statt ein und es bleibt aus. Der Button
// meldet denselben Zustand wie der Umschalter (aria-pressed, gesetzt von
// updateBookToggleButton) — erst darauf warten, dann entscheiden.
async function showBookPanel(page) {
  const section = page.locator(SECTION);
  const btn = page.locator('#btn-book');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute('aria-pressed', /^(true|false)$/);
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
  await expect(section).toBeVisible();
}

// Buch-relative Pfade der Kapitel-Zeilen in Anzeige-Reihenfolge.
function chapterRowPaths(page) {
  return page.evaluate(
    (sel) => Array.from(document.querySelectorAll(sel)).map((el) => el.dataset.pfad),
    ROWS,
  );
}

// Namen des Abschnitts „nicht eingehängt", sortiert: ihre Reihenfolge kommt aus
// dem Datei-Bestand des Ordners und ist keine Zusicherung der Anwendung.
async function unlinkedNamesSorted(page) {
  const namen = await page.locator(UNLINKED_NAMES).allTextContents();
  return namen.slice().sort();
}

// Ein Registry-Kommando über die Kommando-Palette ausführen (Muster KP-04).
// Bewusst nicht über das Standard-Kürzel: die Leseführungs-Kommandos sind
// NICHT idempotent — ein zweiter Druck springt ein Kapitel weiter, weshalb die
// Wiederhol-Regel für Tastendrucke hier nicht anwendbar wäre. Das Öffnen der
// Palette dagegen ist ein No-op bei sichtbarem Modal und darf gepollt werden.
async function runCommandViaPalette(page, label) {
  await expect
    .poll(async () => {
      if (await page.locator(PALETTE).isVisible()) return true;
      await page.keyboard.press('Control+k');
      return page.locator(PALETTE).isVisible();
    })
    .toBe(true);
  await page.locator(PALETTE_FILTER).fill(label);
  await expect(page.locator(PALETTE_ITEM)).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator(PALETTE)).toBeHidden();
}

async function openSettingsSection(page, sectionId) {
  await expect
    .poll(async () => {
      await page.keyboard.press('Control+,');
      return page.locator(SETTINGS_PAGE).count();
    })
    .toBeGreaterThan(0);
  await page
    .locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="${sectionId}"]`)
    .click();
}

// OK klicken und den Abschluss abwarten (Muster confirmSettings in
// erweiterungen.spec.js).
async function confirmSettings(page) {
  await page.locator('#btn-settings-ok').click();
  await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
}

// Menü-Inspektion über den setMenu-Interceptor: Menu.getApplicationMenu() ist
// leer, die App setzt Fenster-Menüs über win.setMenu (Muster armMenuCapture in
// arbeitsbereiche.spec.js).
async function armMenuCapture(app) {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.__buchMenuCaptureArmed) return;
    win.__buchMenuCaptureArmed = true;
    const orig = win.setMenu.bind(win);
    win.setMenu = (menu) => {
      const collect = (items) => {
        const out = [];
        for (const it of items || []) {
          if (it.label) out.push(it.label);
          if (it.submenu) out.push(...collect(it.submenu.items));
        }
        return out;
      };
      globalThis.__buchMenuLabels = collect(menu ? menu.items : []);
      return orig(menu);
    };
  });
}

function capturedMenuLabels(app) {
  return app.evaluate(() => globalThis.__buchMenuLabels || []);
}

// Menü-Neubau anstoßen und auf den Capture warten: der Interceptor greift erst
// beim NÄCHSTEN setMenu, das aktuelle Menü steht schon. Der zentrale
// Toggle-Kanal meldet nach jedem Schalten den Menü-State neu (an/aus lässt den
// Zustand unverändert). Frühe Sends an frische Fenster verfallen, deshalb
// gepollt (Muster nudgeMenuRebuild in panel-zugänge.spec.js).
async function nudgeMenuRebuild(app) {
  await expect
    .poll(async () => {
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          win.webContents.send('menu:togglePanel', 'notes');
          win.webContents.send('menu:togglePanel', 'notes');
        }
      });
      return (await capturedMenuLabels(app)).length;
    })
    .toBeGreaterThan(0);
}

// Datei über denselben Kanal öffnen wie Explorer-Doppelklick und Zuletzt-Liste;
// genau dieser Weg meldet das aktive Öffnen an den Main-Prozess und löst die
// Buch-Erkennung aus. Gepollt gesendet, weil frühe Sends an ein noch ladendes
// Fenster verfallen (Electron-IPC puffert nicht).
async function openExternally(app, page, filePath) {
  const name = path.basename(filePath);
  await expect
    .poll(async () => {
      await app.evaluate(({ BrowserWindow }, file) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('file:openExternal', [file]);
      }, filePath);
      return page.locator(`${SEL.tabs0} .tab-title`).allTextContents();
    })
    .toContain(name);
}

// --- BU-01 --------------------------------------------------------------------

test.describe('BU-01: Buch anlegen (4T-000843)', () => {
  test('Ordner, Buch-Datei und Begleitdatei entstehen; Panel und Statusbar folgen', async () => {
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const bookDir = path.join(parent, 'Chronik');
    try {
      const created = await page.evaluate(
        (payload) => window.api.books.createAt(payload.parentDir, payload.name),
        { parentDir: parent, name: 'Chronik' },
      );
      expect(created).toMatchObject({ ok: true });

      // Datei-Ebene: Ordner, leere Buch-Datei und Begleitdatei, die sie benennt.
      expect(fs.existsSync(bookDir)).toBe(true);
      expect(fs.existsSync(path.join(bookDir, 'Chronik.md'))).toBe(true);
      const container = await warteAufJson(settingsPathOf(bookDir));
      expect(container).toEqual({
        schemaVersion: 1,
        book: { file: 'Chronik.md' },
        chapters: [],
      });

      // Die Buch-Datei öffnet als Reiter; die freie Start-Applikation wurde
      // zur Buch-Applikation (4T-000871).
      await waitForTab(page);
      await expect(page.locator(`${SEL.tabs0} .tab-title`)).toContainText(['Chronik']);
      await expect.poll(() => page.title()).toContain('(Buch Chronik)');

      // Panel: kein Leer-Hinweis mehr, aber noch kein Kapitel; der Abschnitt
      // „nicht eingehängt" bleibt weg, weil der Ordner nur die Buch-Datei hält.
      await showBookPanel(page);
      await expect(page.locator(`${SECTION} .book-empty`)).toBeHidden();
      await expect(page.locator(`${SECTION} .book-main`)).toBeVisible();
      await expect(page.locator(`${TREE} .book-chapters-empty`)).toBeVisible();
      await expect(page.locator(ROWS)).toHaveCount(0);
      await expect(page.locator(UNLINKED)).toBeHidden();

      // Statusbar-Button ist als aktiv markiert.
      await expect(page.locator('#btn-book')).toHaveClass(/active/);
      await expect(page.locator('#btn-book')).toHaveAttribute('aria-pressed', 'true');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(parent);
    }
  });
});

// --- BU-02 --------------------------------------------------------------------

test.describe('BU-02: Buch öffnen zeigt das Inhaltsverzeichnis (4T-000844)', () => {
  test('Kapitel-Baum in Lese-Reihenfolge samt Einrückung und Abschnitt „nicht eingehängt"', async () => {
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const bookDir = makeBook(parent);
    try {
      await openBook(page, bookDir);
      await waitForTab(page);
      await showBookPanel(page);

      // Lese-Reihenfolge: ein Kapitel steht vor seinen Unterkapiteln, danach
      // folgen seine Geschwister. Die Ordner-Lage von Heimkehr.md (Teil2/)
      // spielt dabei keine Rolle.
      await expect(page.locator(ROW_NAMES)).toHaveText(['Aufbruch', 'Heimkehr', 'Schluss']);
      expect(await chapterRowPaths(page)).toEqual([
        'Aufbruch.md',
        'Teil2/Heimkehr.md',
        'Schluss.md',
      ]);

      // Die Tiefe zeigt sich als Einrückung (6 + Tiefe * 14 Pixel).
      const einzug = await page.evaluate(
        (sel) => Array.from(document.querySelectorAll(sel)).map((el) => el.style.paddingLeft),
        ROWS,
      );
      expect(einzug).toEqual(['6px', '20px', '6px']);

      // Voller buch-relativer Pfad als Tooltip.
      await expect(page.locator(`${ROWS}[data-pfad="Teil2/Heimkehr.md"]`)).toHaveAttribute(
        'title',
        'Teil2/Heimkehr.md',
      );

      // Abschnitt „nicht eingehängt": die Markdown-Datei ohne Baum-Eintrag.
      // Die Buch-Datei selbst erscheint dort nie.
      await expect(page.locator(UNLINKED)).toBeVisible();
      await expect(page.locator(`${UNLINKED} .book-unlinked-title`)).toHaveText('Nicht eingehängt');
      await expect(page.locator(UNLINKED_NAMES)).toHaveText(['Anhang']);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(parent);
    }
  });
});

// --- BU-03 --------------------------------------------------------------------

test.describe('BU-03: Kapitel-Klick öffnet den Reiter, die Lese-Markierung wandert (4T-000844)', () => {
  test('Klick öffnet die Kapitel-Datei; die markierte Zeile folgt dem aktiven Reiter', async () => {
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const bookDir = makeBook(parent);
    try {
      await openBook(page, bookDir);
      await waitForTab(page);
      await showBookPanel(page);

      // Der aktive Reiter ist die Buch-Datei; sie ist kein Kapitel, deshalb ist
      // keine Zeile markiert.
      await expect(page.locator(`${ROWS}.active`)).toHaveCount(0);

      await page.locator(`${ROWS}[data-pfad="Aufbruch.md"]`).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Aufbruch');
      await expect(page.locator(`${ROWS}.active`)).toHaveCount(1);
      await expect(page.locator(`${ROWS}.active`)).toHaveAttribute('data-pfad', 'Aufbruch.md');

      // Die Markierung wandert mit: ein zweites Kapitel aus dem Unterordner.
      await page.locator(`${ROWS}[data-pfad="Teil2/Heimkehr.md"]`).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Heimkehr');
      await expect(page.locator(`${ROWS}.active`)).toHaveCount(1);
      await expect(page.locator(`${ROWS}.active`)).toHaveAttribute(
        'data-pfad',
        'Teil2/Heimkehr.md',
      );
      // Die Kapitel-Datei liegt physisch im Unterordner.
      expect(fs.existsSync(path.join(bookDir, 'Teil2', 'Heimkehr.md'))).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(parent);
    }
  });
});

// --- BU-04 --------------------------------------------------------------------

test.describe('BU-04: Leseführung über Kapitel-Grenzen (4T-000846)', () => {
  test('Vor und zurück folgen der Baum-Ordnung; am Ende gibt es eine Rückmeldung statt Umlauf', async () => {
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const bookDir = makeBook(parent);
    try {
      await openBook(page, bookDir);
      await waitForTab(page);
      await showBookPanel(page);
      await page.locator(`${ROWS}[data-pfad="Aufbruch.md"]`).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Aufbruch');

      // Vorwärts über die Ordner-Grenze hinweg: Aufbruch -> Teil2/Heimkehr.
      await runCommandViaPalette(page, 'Nächstes Kapitel');
      await expect(page.locator(SEL.activeTab0)).toContainText('Heimkehr');
      await expect(page.locator(`${ROWS}.active`)).toHaveAttribute(
        'data-pfad',
        'Teil2/Heimkehr.md',
      );

      // Weiter zum letzten Kapitel der obersten Ebene.
      await runCommandViaPalette(page, 'Nächstes Kapitel');
      await expect(page.locator(SEL.activeTab0)).toContainText('Schluss');
      // Der Vorwärts-Knopf im Panel-Kopf ist am Ende der Lese-Ordnung gesperrt.
      await expect(page.locator(`${SECTION} .book-next`)).toBeDisabled();
      await expect(page.locator(`${SECTION} .book-prev`)).toBeEnabled();

      // Am Ende kein Umlauf, sondern eine Rückmeldung in der Hinweis-Zeile.
      await runCommandViaPalette(page, 'Nächstes Kapitel');
      await expect(page.locator('#statusbar-hint')).toHaveText('Ende des Buches erreicht');
      await expect(page.locator(SEL.activeTab0)).toContainText('Schluss');

      // Zurück folgt derselben Ordnung.
      await runCommandViaPalette(page, 'Vorheriges Kapitel');
      await expect(page.locator(SEL.activeTab0)).toContainText('Heimkehr');

      // Es sind genau die Buch-Datei und die drei Kapitel offen — die
      // Leseführung öffnet keinen Reiter doppelt.
      await expect(page.locator(SEL.tabs0)).toHaveCount(4);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(parent);
    }
  });
});

// --- BU-05 --------------------------------------------------------------------

test.describe('BU-05: Struktur-Pflege ändert nur die Deklaration (4T-000845)', () => {
  test('Baum-Operation und Alt+Pfeil wirken auf Panel und Begleitdatei; keine Datei bewegt sich', async () => {
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const bookDir = makeBook(parent);
    const dateienVorher = listFiles(bookDir);
    try {
      await openBook(page, bookDir);
      await waitForTab(page);
      await showBookPanel(page);
      await expect(page.locator(ROW_NAMES)).toHaveText(['Aufbruch', 'Heimkehr', 'Schluss']);

      // Weg 1: eine Baum-Operation, wie sie die Ablage eines Zuges auslöst.
      const verschoben = await page.evaluate(() =>
        window.api.books.applyTreeOp({
          type: 'moveWithinLevel',
          path: 'Aufbruch.md',
          direction: 'down',
        }),
      );
      expect(verschoben).toMatchObject({ ok: true });

      // Panel: Aufbruch samt Unterkapitel steht jetzt hinter Schluss.
      await expect(page.locator(ROW_NAMES)).toHaveText(['Schluss', 'Aufbruch', 'Heimkehr']);
      // Begleitdatei: dieselbe Aussage, samt erhaltenem Unterbaum.
      await expect.poll(() => declaredTopLevel(bookDir)).toEqual(['Schluss.md', 'Aufbruch.md']);
      const nachOp = await warteAufJson(settingsPathOf(bookDir));
      expect(nachOp.chapters[1].children).toEqual([{ path: 'Teil2/Heimkehr.md', children: [] }]);

      // Weg 2 über die Oberfläche: Alt+Pfeil am fokussierten Eintrag. Der
      // Druck darf wiederholt werden, weil die Operation am oberen Rand der
      // Ebene folgenlos bleibt (moveWithinLevel meldet dort changed:false);
      // der Fokus wird je Runde neu gesetzt, weil der Neuaufbau der Zeilen ihn
      // sonst verlieren könnte.
      await expect
        .poll(async () => {
          const erste = await page.locator(ROWS).first().getAttribute('data-pfad');
          if (erste === 'Aufbruch.md') return erste;
          await page.locator(`${ROWS}[data-pfad="Aufbruch.md"]`).focus();
          await page.keyboard.press('Alt+ArrowUp');
          return page.locator(ROWS).first().getAttribute('data-pfad');
        })
        .toBe('Aufbruch.md');
      await expect(page.locator(ROW_NAMES)).toHaveText(['Aufbruch', 'Heimkehr', 'Schluss']);
      await expect.poll(() => declaredTopLevel(bookDir)).toEqual(['Aufbruch.md', 'Schluss.md']);

      // Kern-Zusicherung der Struktur-Pflege: Es wurde keine Datei angelegt,
      // gelöscht oder bewegt.
      expect(listFiles(bookDir)).toEqual(dateienVorher);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(parent);
    }
  });
});

// --- BU-06 --------------------------------------------------------------------

test.describe('BU-06: Kapitel-Datei verschieben führt Baum und Links nach (4T-000847)', () => {
  test('Datei liegt physisch neu, der Baum-Eintrag folgt, Wiki- und Markdown-Link bleiben gültig', async () => {
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const bookDir = makeBook(parent);
    // Dritte Datei mit beiden Link-Formen auf das zu bewegende Kapitel.
    const quellen = path.join(bookDir, 'Quellen.md');
    fs.writeFileSync(
      quellen,
      '# Quellen\n\nWiki: [[Schluss]]\nMd: [Schluss](Schluss.md)\n',
      'utf8',
    );
    try {
      // Der Suchraum des Link-Updates ist der Bereich der App. Seit 4T-000871
      // ist die Buch-Applikation selbst auf den Buch-Ordner gebunden — der
      // Suchraum ist damit der ganze Buch-Baum samt Quellen.md.
      await openBook(page, bookDir);
      await expect.poll(() => page.title()).toContain('(Buch Reise)');
      await waitForTab(page);
      await showBookPanel(page);
      await expect(page.locator(ROW_NAMES)).toHaveText(['Aufbruch', 'Heimkehr', 'Schluss']);

      const bewegt = await page.evaluate(
        (payload) => window.api.books.moveChapterFileTo(payload.relPath, payload.targetDir),
        { relPath: 'Schluss.md', targetDir: path.join(bookDir, 'Teil2') },
      );
      expect(bewegt).toMatchObject({ ok: true, relPath: 'Teil2/Schluss.md' });

      // Physisch neu, alter Ort leer.
      expect(fs.existsSync(path.join(bookDir, 'Teil2', 'Schluss.md'))).toBe(true);
      expect(fs.existsSync(path.join(bookDir, 'Schluss.md'))).toBe(false);

      // Baum-Eintrag folgt, die Baum-Position bleibt (weiterhin zweites
      // Kapitel der obersten Ebene).
      await expect
        .poll(() => declaredTopLevel(bookDir))
        .toEqual(['Aufbruch.md', 'Teil2/Schluss.md']);
      await expect
        .poll(() => chapterRowPaths(page))
        .toEqual(['Aufbruch.md', 'Teil2/Heimkehr.md', 'Teil2/Schluss.md']);
      // Der Abschnitt „nicht eingehängt" führt weiterhin nur Anhang und die
      // verweisende Datei, nicht das bewegte Kapitel.
      await expect.poll(() => unlinkedNamesSorted(page)).toEqual(['Anhang', 'Quellen']);

      // Eingehende Links der dritten Datei zeigen weiter auf das Kapitel: der
      // Wiki-Link löst über den Namen auf und bleibt unverändert, das relative
      // Markdown-Ziel wird auf die neue Lage umgeschrieben.
      const text = await warteAufText(quellen, 'Teil2/Schluss.md');
      expect(text).toContain('Wiki: [[Schluss]]');
      expect(text).toContain('Md: [Schluss](Teil2/Schluss.md)');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(parent);
    }
  });
});

// --- BU-07 --------------------------------------------------------------------

test.describe('BU-07: Reparatur eines fehlenden Kapitels (4T-000848)', () => {
  test('Am Dateisystem umbenanntes Kapitel ist markiert; die Neu-Zuordnung heilt den Baum', async () => {
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const bookDir = makeBook(parent);
    try {
      await openBook(page, bookDir);
      await waitForTab(page);
      await showBookPanel(page);
      await expect(page.locator(ROW_NAMES)).toHaveText(['Aufbruch', 'Heimkehr', 'Schluss']);

      // Änderung an der Anwendung vorbei: die Kapitel-Datei wird umbenannt.
      fs.renameSync(path.join(bookDir, 'Schluss.md'), path.join(bookDir, 'Schlusswort.md'));

      // Zustand neu einlesen (derselbe Weg wie „Buch öffnen").
      await openBook(page, bookDir);

      // Der Baum-Eintrag bleibt an seiner Stelle, ist aber als fehlend
      // markiert; die umbenannte Datei erscheint als nicht eingehängt.
      const fehlend = page.locator(`${ROWS}[data-pfad="Schluss.md"]`);
      await expect(fehlend).toHaveClass(/missing/);
      await expect(fehlend.locator('.book-entry-missing-mark')).toHaveText('!');
      await expect(fehlend).toHaveAttribute('title', 'Schluss.md (fehlt)');
      await expect.poll(() => unlinkedNamesSorted(page)).toEqual(['Anhang', 'Schlusswort']);

      // Zuordnung auf die neue Datei: repariert wird allein die Deklaration.
      const zugeordnet = await page.evaluate(
        (payload) => window.api.books.reassignChapter(payload.missingPath, payload.newPath),
        { missingPath: 'Schluss.md', newPath: 'Schlusswort.md' },
      );
      expect(zugeordnet).toMatchObject({ ok: true, relPath: 'Schlusswort.md' });

      // Der Baum führt jetzt die neue Datei an derselben Position, ohne
      // Fehl-Markierung; „nicht eingehängt" schrumpft entsprechend.
      await expect
        .poll(() => chapterRowPaths(page))
        .toEqual(['Aufbruch.md', 'Teil2/Heimkehr.md', 'Schlusswort.md']);
      await expect(page.locator(`${ROWS}.missing`)).toHaveCount(0);
      await expect.poll(() => unlinkedNamesSorted(page)).toEqual(['Anhang']);
      await expect.poll(() => declaredTopLevel(bookDir)).toEqual(['Aufbruch.md', 'Schlusswort.md']);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(parent);
    }
  });
});

// --- BU-08 --------------------------------------------------------------------

test.describe('BU-08: Kapitel-Datei direkt öffnen macht kein Buch aktiv (4T-000843)', () => {
  test('Ein Kapitel öffnet gewöhnlich; erst die Buch-Datei bindet das Buch', async () => {
    const parent = makeTempDir();
    const bookDir = makeBook(parent);
    const { app, page, userData } = await launchApp({ args: [path.join(bookDir, 'Aufbruch.md')] });
    try {
      await waitForTab(page);
      await expect(page.locator(SEL.activeTab0)).toContainText('Aufbruch');

      // Die Erkennung läuft ausschließlich über die von der Begleitdatei
      // benannte Buch-Datei; eine Kapitel-Datei trifft sie nicht.
      expect(await bookStateOf(page)).toEqual({ active: null });
      // Ohne Buch bleibt das Panel beim Leer-Hinweis stehen.
      await showBookPanel(page);
      await expect(page.locator(`${SECTION} .book-empty`)).toBeVisible();
      await expect(page.locator(`${SECTION} .book-main`)).toBeHidden();

      // Gegenprobe im selben Fenster: dieselbe Strecke mit der Buch-Datei
      // bindet das Buch sehr wohl. Ohne sie bliebe offen, ob oben überhaupt
      // eine Erkennung stattgefunden hat.
      await openExternally(app, page, path.join(bookDir, 'Reise.md'));
      await expect
        .poll(async () => {
          const state = await bookStateOf(page);
          return state.active ? state.active.bookFileName : null;
        })
        .toBe('Reise.md');
      await expect(page.locator(ROW_NAMES)).toHaveText(['Aufbruch', 'Heimkehr', 'Schluss']);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(parent);
    }
  });
});

// --- BU-09 --------------------------------------------------------------------

test.describe('BU-09: Erweiterung „Bücher" schalten (4T-000849)', () => {
  test('Aus: Menü, Button und Panel entfallen, die Buch-Datei öffnet gewöhnlich; Ein stellt alles her', async () => {
    const parent = makeTempDir();
    const bookDir = makeBook(parent);
    const bookFile = path.join(bookDir, 'Reise.md');
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await armMenuCapture(app);
      await nudgeMenuRebuild(app);
      await expect(page.locator('#btn-book')).toBeVisible();
      await expect.poll(() => capturedMenuLabels(app)).toContain('Buch öffnen…');
      // Panel einblenden, damit sein Verschwinden anschließend eine Aussage ist.
      await showBookPanel(page);

      // --- Aus ---------------------------------------------------------------
      await openSettingsSection(page, 'extensions');
      await page.locator('#settings-extension-books').uncheck();
      await confirmSettings(page);

      await expect(page.locator('#btn-book')).toBeHidden();
      await expect(page.locator(SECTION)).toBeHidden();
      await expect.poll(() => capturedMenuLabels(app)).not.toContain('Buch öffnen…');
      const labelsAus = await capturedMenuLabels(app);
      expect(labelsAus).not.toContain('Neues Buch…');
      expect(labelsAus).not.toContain('Buch schließen');
      // 4T-000888 (Epic 3E-000168): Die beiden Zuletzt-Listen tragen keine eigene
      // Kommando-ID und hängen im Menü am Öffnen-Kommando — im Aus-Zustand
      // verschwinden sie deshalb mit den übrigen Einträgen.
      expect(labelsAus).not.toContain('Zuletzt geöffnete Bücher');
      expect(labelsAus).not.toContain('Zuletzt geöffnete Bücherregale');

      // Die Buch-Datei öffnet wie jede andere Markdown-Datei: ein Reiter, aber
      // kein aktives Buch.
      await openExternally(app, page, bookFile);
      expect(await bookStateOf(page)).toEqual({ active: null });

      // --- Wieder ein --------------------------------------------------------
      await openSettingsSection(page, 'extensions');
      await page.locator('#settings-extension-books').check();
      await confirmSettings(page);

      await expect(page.locator('#btn-book')).toBeVisible();
      await expect.poll(() => capturedMenuLabels(app)).toContain('Buch öffnen…');
      // 4T-000888: mit dem Einschalten sind auch die beiden Zuletzt-Listen zurück.
      const labelsEin = await capturedMenuLabels(app);
      expect(labelsEin).toContain('Zuletzt geöffnete Bücher');
      expect(labelsEin).toContain('Zuletzt geöffnete Bücherregale');

      // Das Buch öffnet jetzt wieder als Buch — seit 4T-000871 als eigene
      // Applikation mit eigenem Fenster, weil diese App fremde Reiter trägt.
      // Das Panel des neuen Fensters zeigt den unveränderten Kapitel-Baum:
      // die Daten blieben unangetastet.
      const fensterVorher = app.windows().length;
      await openBook(page, bookDir);
      await expect.poll(() => app.windows().length).toBe(fensterVorher + 1);
      const page2 = app.windows().find((p) => p !== page);
      await expect
        .poll(async () => {
          const state = await bookStateOf(page2);
          return state.active ? state.active.readingOrder : null;
        })
        .toEqual(['Aufbruch.md', 'Teil2/Heimkehr.md', 'Schluss.md']);
      await showBookPanel(page2);
      await expect(page2.locator(ROW_NAMES)).toHaveText(['Aufbruch', 'Heimkehr', 'Schluss']);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(parent);
    }
  });
});

// --- BU-10 --------------------------------------------------------------------

test.describe('BU-10: Buch als Bereich — eigene Applikation je Buch (4T-000871)', () => {
  test('Zweites Buch öffnet eigenes Fenster, jedes zeigt sein Buch; Schließen schließt die Applikation', async () => {
    // Regressionstest zum PO-Befund vom 2026-08-04 (EXE 0.104.0.1169): Nach
    // dem Öffnen zweier Bücher zeigte das eine Panel die Kapitel des anderen
    // Buches. Im Applikations-Modell ist das strukturell ausgeschlossen.
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const buchA = makeBook(parent, 'Reise');
    const buchB = makeBook(parent, 'Logbuch');
    try {
      // Buch A bindet die freie Start-Applikation; der Titel trägt den
      // Buchnamen (Detail-Entscheidung 4 des PO).
      await openBook(page, buchA);
      await waitForTab(page);
      await expect.poll(() => page.title()).toContain('(Buch Reise)');

      // Buch B öffnet als EIGENE Applikation mit eigenem Fenster.
      const fensterVorher = app.windows().length;
      await openBook(page, buchB);
      await expect.poll(() => app.windows().length).toBe(fensterVorher + 1);
      const page2 = app.windows().find((p) => p !== page);
      await expect.poll(() => page2.title()).toContain('(Buch Logbuch)');

      // Jedes Fenster zeigt sein eigenes Buch — genau der Befund-Fall.
      await expect
        .poll(async () => (await bookStateOf(page)).active?.bookFileName)
        .toBe('Reise.md');
      await expect
        .poll(async () => (await bookStateOf(page2)).active?.bookFileName)
        .toBe('Logbuch.md');

      // Erneutes Öffnen von Buch B fokussiert die laufende Applikation,
      // statt ein drittes Fenster zu öffnen (Bereichs-Muster).
      await openBook(page, buchB);
      expect(app.windows().length).toBe(fensterVorher + 1);

      // «Buch schließen» schließt die Buch-Applikation samt Fenster
      // (Detail-Entscheidung 1 des PO). Fire-and-forget im Renderer, weil
      // das eigene Fenster mit dem Aufruf verschwindet.
      await page2.evaluate(() => {
        void window.api.books.close();
      });
      await expect.poll(() => app.windows().length).toBe(fensterVorher);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(parent);
    }
  });
});
