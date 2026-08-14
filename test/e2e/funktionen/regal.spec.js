// Epic 3E-0162 (4T-0867): E2E-Funktions-Suite „Bücherregale" — ein Regal als
// Gruppierung von Buch-Ordnern mit eigener Regal-Datei und Begleitdatei.
//
// RG-01 (4T-0867/4T-0868): Regal anlegen — Ordner, Regal-Datei und
//        Begleitdatei entstehen, das Regal ist aktiv, die Regal-Ansicht
//        öffnet als eigene Seite im Reiter-System.
// RG-02 (4T-0867): Regal öffnen per Pfad-Einstieg — der Zustand trägt
//        Zuordnung und Abschnitt „nicht zugeordnet"; Zuordnen und Lösen
//        wirken auf die Begleitdatei.
// RG-03 (4T-0867): Öffnen der Regal-Datei selbst macht das Regal aktiv
//        (Erkennung ohne Rückverweis); eine gewöhnliche Markdown-Datei
//        desselben Ordners macht kein Regal aktiv.
// RG-04 (4T-0867): Ein geöffnetes Regal übersteht Beenden und Neustart mit
//        demselben Profil (Sitzungs-Wiederherstellung).
// RG-05 (4T-0868): Regal-Ansicht — Kachel-Darstellung mit Platzhalter-Kachel,
//        Umschalter auf Zeilen (Kapitel-Anzahl, Autor, Beschreibung), der
//        Zustand wird je Regal gemerkt.
// RG-06 (4T-0868): Ein Buch öffnet sich aus beiden Darstellungen (Klick
//        öffnet die Buch-Datei als Reiter und macht das Buch aktiv).
// RG-07 (4T-0868): Abschnitt «nicht zugeordnet» mit Aufnahme-Aktion; das
//        aufgenommene Buch wandert in den Bestand.
// RG-09 (4T-0881): Menü-Zustand folgt dem Fenster-Kontext — «Bereich
// schließen» ist in Buch- und Regal-Fenstern deaktiviert und nur im echten
// Bereichs-Fenster aktiv; «Bücherregal schließen» bzw. «Buch schließen»
// tragen dort. RG-04 prüft seit 4T-0882 zusätzlich die sichtbare Regal-Seite
// nach dem Neustart (Befund c der Test-Iteration 0.104.0).
//
// RG-08 (4T-0873): Regal als Bereich mit striktem Routing (R1) — eine
//        Kapitel-Datei landet in der Buch-Applikation, die Regal-Datei
//        bleibt im Regal-Fenster.
//
// Seit 4T-0873 ist ein geöffnetes Regal eine eigene logische Applikation mit
// dem Regal-Ordner als Bereich; die Fälle starten deshalb ohne Start-Datei,
// damit die freie Start-Applikation zur Regal-Applikation wird.
//
// Alle Wege laufen über die dialogfreien Pfad-Einstiege des
// Preload-Namensraums `shelves` (openPath, createAt, assignBook,
// unassignBook); die nativen Ordner-Dialoge davor sind manueller Test
// (Muster buch.spec.js).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { menuZustand, menuEintrag } = require('../helpers/menu-zustand');
const { SHELF_SETTINGS_FILENAME } = require('../../../src/shared/books/shelf-core.js');
const {
  BOOK_SETTINGS_FILENAME,
  emptyBookContainer,
  serializeBookContainer,
} = require('../../../src/shared/books/book-core.js');

const PANE = '.pane-group[data-pane="0"]';
const VIEW = `${PANE} .pane-system .shelf-view-page`;

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-regal-'));
}

// Regal-Ordner samt Regal-Datei und Begleitdatei auf der Platte anlegen.
function makeShelfOnDisk(parent, name, books = []) {
  const shelfDir = path.join(parent, name);
  fs.mkdirSync(shelfDir);
  fs.writeFileSync(path.join(shelfDir, `${name}.md`), `# ${name}\n`, 'utf8');
  fs.writeFileSync(
    path.join(shelfDir, SHELF_SETTINGS_FILENAME),
    JSON.stringify({ schemaVersion: 1, shelf: { file: `${name}.md` }, books }, null, 2),
    'utf8',
  );
  return shelfDir;
}

// Buch-Ordner unterhalb des Regals (echte Buch-Begleitdatei, Buch-Erkennung).
function makeBookOnDisk(shelfDir, name) {
  const bookDir = path.join(shelfDir, name);
  fs.mkdirSync(bookDir);
  fs.writeFileSync(path.join(bookDir, `${name}.md`), '', 'utf8');
  fs.writeFileSync(
    path.join(bookDir, BOOK_SETTINGS_FILENAME),
    serializeBookContainer(emptyBookContainer(`${name}.md`)),
    'utf8',
  );
  return bookDir;
}

function shelfState(page) {
  return page.evaluate(() => window.api.shelves.getState());
}

// Datei über denselben Kanal öffnen wie Explorer-Doppelklick und
// Zuletzt-Liste; genau dieser Weg löst die Regal-Erkennung und seit 4T-0873
// das strikte Buch-Routing aus (Muster buch.spec.js, gepollt gegen ein noch
// ladendes Fenster).
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

// Dieselbe Zustellung, aber gezielt an EIN Fenster und ohne Erwartung an
// dessen Reiter: Beim strikten Routing (4T-0873) wandert der Reiter in ein
// anderes Fenster, im adressierten bleibt er also gerade nicht stehen.
//
// Das Ziel-Fenster wird über seinen Titel gewählt, nicht über
// `getAllWindows()[0]`: Sobald mehrere Fenster offen sind, ist diese
// Reihenfolge NICHT die Erzeugungsreihenfolge (Electron liefert sie nach
// Z-Order; im Diagnose-Lauf stand das zuletzt geöffnete Fenster vorn).
async function sendeAnFenster(app, titelTeil, filePath) {
  const zugestellt = await app.evaluate(
    ({ BrowserWindow }, { file, teil }) => {
      const win = BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.getTitle().includes(teil),
      );
      if (!win) return false;
      win.webContents.send('file:openExternal', [file]);
      return true;
    },
    { file: filePath, teil: titelTeil },
  );
  expect(zugestellt, `kein Fenster mit Titel-Teil «${titelTeil}»`).toBe(true);
}

// --- RG-01 --------------------------------------------------------------------

test.describe('RG-01: Regal anlegen (4T-0867)', () => {
  test('Ordner, Regal-Datei und Begleitdatei entstehen; das Regal ist aktiv', async () => {
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const shelfDir = path.join(parent, 'Bibliothek');
    try {
      const created = await page.evaluate(
        (payload) => window.api.shelves.createAt(payload.parentDir, payload.name),
        { parentDir: parent, name: 'Bibliothek' },
      );
      expect(created.ok).toBe(true);
      // Dateisystem: Ordner, leere Regal-Datei, Begleitdatei benennt sie.
      expect(fs.existsSync(path.join(shelfDir, 'Bibliothek.md'))).toBe(true);
      const settings = JSON.parse(
        fs.readFileSync(path.join(shelfDir, SHELF_SETTINGS_FILENAME), 'utf8'),
      );
      expect(settings.shelf.file).toBe('Bibliothek.md');
      expect(settings.books).toEqual([]);
      // Zustand: aktiv und leer; die Regal-Ansicht öffnet als eigene Seite
      // im Reiter-System (4T-0868, Story S-0761 AK1). Die freie
      // Start-Applikation wurde zur Regal-Applikation, ihr Fenstertitel
      // trägt den Regal-Namen (4T-0873).
      await expect
        .poll(async () => (await shelfState(page)).active?.shelfFileName)
        .toBe('Bibliothek.md');
      await expect(page.locator(`${PANE} .pane-system .shelf-view-page`)).toBeVisible();
      await expect(page.locator(`${PANE} .shelf-view-heading`)).toHaveText('Bibliothek');
      await expect.poll(() => page.title()).toContain('(Bücherregal Bibliothek)');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- RG-02 --------------------------------------------------------------------

test.describe('RG-02: Regal öffnen und Bücher zuordnen (4T-0867)', () => {
  test('Zustand trägt Zuordnung und „nicht zugeordnet"; Zuordnen und Lösen wirken', async () => {
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const shelfDir = makeShelfOnDisk(parent, 'Bibliothek');
    makeBookOnDisk(shelfDir, 'Reise nach Ithaka');
    makeBookOnDisk(shelfDir, 'Kochbuch');
    try {
      const opened = await page.evaluate((dir) => window.api.shelves.openPath(dir), shelfDir);
      expect(opened.ok).toBe(true);
      let state = await shelfState(page);
      expect(state.active.books).toEqual([]);
      expect(state.active.unassigned.sort()).toEqual(['Kochbuch', 'Reise nach Ithaka']);
      // Zuordnen: wandert aus „nicht zugeordnet" in die Liste, persistiert.
      const assigned = await page.evaluate(
        (name) => window.api.shelves.assignBook(name),
        'Reise nach Ithaka',
      );
      expect(assigned.ok).toBe(true);
      state = await shelfState(page);
      expect(state.active.books).toEqual(['Reise nach Ithaka']);
      expect(state.active.unassigned).toEqual(['Kochbuch']);
      const settings = JSON.parse(
        fs.readFileSync(path.join(shelfDir, SHELF_SETTINGS_FILENAME), 'utf8'),
      );
      expect(settings.books).toEqual(['Reise nach Ithaka']);
      // Lösen: zurück nach „nicht zugeordnet", der Ordner bleibt unberührt.
      const unassigned = await page.evaluate(
        (name) => window.api.shelves.unassignBook(name),
        'Reise nach Ithaka',
      );
      expect(unassigned.ok).toBe(true);
      state = await shelfState(page);
      expect(state.active.books).toEqual([]);
      expect(state.active.unassigned.sort()).toEqual(['Kochbuch', 'Reise nach Ithaka']);
      expect(fs.existsSync(path.join(shelfDir, 'Reise nach Ithaka', 'Reise nach Ithaka.md'))).toBe(
        true,
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- RG-03 --------------------------------------------------------------------

test.describe('RG-03: Erkennung der Regal-Datei (4T-0867)', () => {
  test('Regal-Datei macht das Regal aktiv, eine gewöhnliche Datei nicht', async () => {
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const shelfDir = makeShelfOnDisk(parent, 'Bibliothek');
    fs.writeFileSync(path.join(shelfDir, 'Notiz.md'), 'nur eine Notiz\n', 'utf8');
    try {
      // Gewöhnliche Datei desselben Ordners: kein Regal aktiv.
      await openExternally(app, page, path.join(shelfDir, 'Notiz.md'));
      expect((await shelfState(page)).active).toBe(null);
      // Die benannte Regal-Datei: Regal aktiv (Erkennung ohne Rückverweis).
      await openExternally(app, page, path.join(shelfDir, 'Bibliothek.md'));
      await expect
        .poll(async () => (await shelfState(page)).active?.shelfFileName)
        .toBe('Bibliothek.md');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- RG-05 --------------------------------------------------------------------

test.describe('RG-05: Kacheln, Zeilen und gemerkter Umschalter (4T-0868)', () => {
  test('Platzhalter-Kachel, Zeilen-Angaben und Modus-Persistenz je Regal', async () => {
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const shelfDir = makeShelfOnDisk(parent, 'Bibliothek', ['Reise nach Ithaka']);
    const buchDir = makeBookOnDisk(shelfDir, 'Reise nach Ithaka');
    fs.writeFileSync(
      path.join(buchDir, 'Reise nach Ithaka.md'),
      '---\nauthor: K. P. Kavafis\ndescription: Eine Heimkehr in Etappen.\n---\n',
      'utf8',
    );
    fs.writeFileSync(path.join(buchDir, 'Kapitel 1.md'), '', 'utf8');
    fs.writeFileSync(
      path.join(buchDir, 'Book_Settings.mdda'),
      JSON.stringify(
        {
          schemaVersion: 1,
          book: { file: 'Reise nach Ithaka.md' },
          chapters: [{ path: 'Kapitel 1.md', children: [] }],
        },
        null,
        2,
      ),
      'utf8',
    );
    try {
      await page.evaluate((dir) => window.api.shelves.openPath(dir), shelfDir);
      // Kachel-Darstellung (Default): Platzhalter-Kachel trägt den Titel,
      // weil kein Bild-Verweis gesetzt ist (PO-Entscheidung).
      await expect(page.locator(VIEW)).toBeVisible();
      await expect(
        page.locator(`${VIEW} .shelf-view-grid .shelf-view-placeholder-title`),
      ).toHaveText('Reise nach Ithaka');
      // Umschalter auf Zeilen: Kapitel-Anzahl, Autor und Beschreibung.
      await page.locator(`${VIEW} .shelf-view-toggle-button`, { hasText: 'Zeilen' }).click();
      await expect(page.locator(`${VIEW} .shelf-view-rows`)).toBeVisible();
      await expect(page.locator(`${VIEW} .shelf-view-row-meta`)).toHaveText('1 Kapitel');
      await expect(page.locator(`${VIEW} .shelf-view-row-author`)).toHaveText('K. P. Kavafis');
      await expect(page.locator(`${VIEW} .shelf-view-row-description`)).toHaveText(
        'Eine Heimkehr in Etappen.',
      );
      // Persistenz je Regal: Seite schließen und erneut öffnen — der
      // Zeilen-Modus ist gemerkt.
      // Das Seiten-DOM bleibt im verborgenen Container stehen (Muster der
      // übrigen System-Seiten); entscheidend ist, dass die Seite zu ist.
      await page.locator(SEL.activeTab0).locator('.tab-close').click();
      await expect(page.locator(VIEW)).toBeHidden();
      await page.evaluate((dir) => window.api.shelves.openPath(dir), shelfDir);
      await expect(page.locator(`${VIEW} .shelf-view-rows`)).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- RG-06 --------------------------------------------------------------------

test.describe('RG-06: Buch öffnet aus der Ansicht als eigene Applikation (4T-0868/4T-0871)', () => {
  test('Klick auf die Kachel öffnet die Buch-Applikation im eigenen Fenster', async () => {
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const shelfDir = makeShelfOnDisk(parent, 'Bibliothek', ['Reise nach Ithaka']);
    makeBookOnDisk(shelfDir, 'Reise nach Ithaka');
    try {
      await page.evaluate((dir) => window.api.shelves.openPath(dir), shelfDir);
      await expect(page.locator(`${VIEW} .shelf-view-tile`)).toBeVisible();
      const fensterVorher = app.windows().length;
      await page.locator(`${VIEW} .shelf-view-tile`).click();
      // 4T-0871 (Buch = Bereich): Das Buch öffnet als eigene Applikation mit
      // eigenem Fenster; das Regal-Fenster bleibt als Übersicht stehen.
      await expect.poll(() => app.windows().length).toBe(fensterVorher + 1);
      const page2 = app.windows().find((p) => p !== page);
      await expect
        .poll(() => page2.locator(`${SEL.tabs0} .tab-title`).allTextContents())
        .toContain('Reise nach Ithaka.md');
      await expect
        .poll(async () => {
          const state = await page2.evaluate(() => window.api.books.getState());
          return state.active?.bookFileName ?? null;
        })
        .toBe('Reise nach Ithaka.md');
      // Das Regal-Fenster selbst trägt kein aktives Buch.
      const regalFensterBuch = await page.evaluate(() => window.api.books.getState());
      expect(regalFensterBuch.active).toBe(null);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- RG-07 --------------------------------------------------------------------

test.describe('RG-07: Aufnahme aus «nicht zugeordnet» (4T-0868)', () => {
  test('Der Abschnitt zeigt das Buch, die Aufnahme verschiebt es in den Bestand', async () => {
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const shelfDir = makeShelfOnDisk(parent, 'Bibliothek');
    makeBookOnDisk(shelfDir, 'Kochbuch');
    try {
      await page.evaluate((dir) => window.api.shelves.openPath(dir), shelfDir);
      await expect(page.locator(`${VIEW} .shelf-view-section-title`)).toHaveText(
        'Nicht zugeordnet',
      );
      await page
        .locator(`${VIEW} .shelf-view-section .shelf-view-action`, { hasText: 'Aufnehmen' })
        .click();
      // Zuordnung persistiert (stateChanged lädt die Seite nach): der
      // Abschnitt verschwindet, das Buch steht im Bestand.
      await expect(page.locator(`${VIEW} .shelf-view-section`)).toHaveCount(0);
      await expect(page.locator(`${VIEW} .shelf-view-grid .shelf-view-tile-title`)).toHaveText(
        'Kochbuch',
      );
      const settings = JSON.parse(
        fs.readFileSync(path.join(shelfDir, SHELF_SETTINGS_FILENAME), 'utf8'),
      );
      expect(settings.books).toEqual(['Kochbuch']);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- RG-08 --------------------------------------------------------------------

test.describe('RG-08: Striktes Routing der Regal-Applikation (4T-0873)', () => {
  test('Eine Kapitel-Datei landet in der Buch-Applikation, die Regal-Datei bleibt', async () => {
    // Variante R1 (PO-Entscheidung vom 2026-08-04): Das Regal-Fenster hält
    // ausschließlich die Regal-Ebene; jeder Griff in ein Buch — Buch-Datei
    // wie Kapitel-Datei — führt in die Buch-Applikation.
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const shelfDir = makeShelfOnDisk(parent, 'Bibliothek', ['Reise nach Ithaka']);
    const buchDir = makeBookOnDisk(shelfDir, 'Reise nach Ithaka');
    const kapitel = path.join(buchDir, 'Kapitel 1.md');
    fs.writeFileSync(kapitel, '# Kapitel 1\n', 'utf8');
    try {
      await page.evaluate((dir) => window.api.shelves.openPath(dir), shelfDir);
      await expect(page.locator(VIEW)).toBeVisible();
      await expect.poll(() => page.title()).toContain('(Bücherregal Bibliothek)');
      const fensterVorher = app.windows().length;

      // Kapitel-Datei im Regal-Fenster öffnen: sie wandert in die
      // Buch-Applikation und öffnet dort neben der Buch-Datei.
      await sendeAnFenster(app, 'Bücherregal Bibliothek', kapitel);
      await expect.poll(() => app.windows().length).toBe(fensterVorher + 1);
      const buchSeite = app.windows().find((p) => p !== page);
      await expect.poll(() => buchSeite.title()).toContain('(Buch Reise nach Ithaka)');
      await expect
        .poll(() => buchSeite.locator(`${SEL.tabs0} .tab-title`).allTextContents())
        .toContain('Kapitel 1.md');
      await expect
        .poll(async () => {
          const state = await buchSeite.evaluate(() => window.api.books.getState());
          return state.active?.bookFileName ?? null;
        })
        .toBe('Reise nach Ithaka.md');
      // Im Regal-Fenster ist das Kapitel nicht (mehr) offen.
      await expect
        .poll(() => page.locator(`${SEL.tabs0} .tab-title`).allTextContents())
        .not.toContain('Kapitel 1.md');

      // Gegenprobe: Die Regal-Datei selbst gehört zur Regal-Ebene und bleibt
      // im Regal-Fenster; kein weiteres Fenster entsteht.
      await sendeAnFenster(app, 'Bücherregal Bibliothek', path.join(shelfDir, 'Bibliothek.md'));
      await expect
        .poll(() => page.locator(`${SEL.tabs0} .tab-title`).allTextContents())
        .toContain('Bibliothek.md');
      expect(app.windows().length).toBe(fensterVorher + 1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- RG-09 --------------------------------------------------------------------

test.describe('RG-09: Menü-Zustand folgt dem Fenster-Kontext (4T-0881)', () => {
  test('«Bereich schließen» nur im Bereichs-Fenster, Buch/Regal haben ihre eigenen Punkte', async () => {
    // Befunde a und b der PO-Test-Iteration 0.104.0: In Buch- und
    // Regal-Fenstern war «Bereich schließen» aktiv, weil der Menü-Zustand nur
    // die (intern vorhandene) Bereichs-Bindung fragte. Der Fall stellt alle
    // drei Fenstertypen in einer Sitzung und prüft die Menü-Punkte je Fenster.
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const shelfDir = makeShelfOnDisk(parent, 'Bibliothek', ['Reise nach Ithaka']);
    const buchDir = makeBookOnDisk(shelfDir, 'Reise nach Ithaka');
    const kapitel = path.join(buchDir, 'Kapitel 1.md');
    fs.writeFileSync(kapitel, '# Kapitel 1\n', 'utf8');
    const areaDir = path.join(parent, 'Projektordner');
    fs.mkdirSync(areaDir);
    try {
      // Regal-Fenster (freie Start-App wird zur Regal-Applikation).
      await page.evaluate((dir) => window.api.shelves.openPath(dir), shelfDir);
      await expect(page.locator(VIEW)).toBeVisible();
      await expect.poll(() => page.title()).toContain('(Bücherregal Bibliothek)');

      // Buch-Fenster über das strikte Routing (Muster RG-08).
      const fensterVorher = app.windows().length;
      await sendeAnFenster(app, 'Bücherregal Bibliothek', kapitel);
      await expect.poll(() => app.windows().length).toBe(fensterVorher + 1);
      const buchSeite = app.windows().find((p) => p !== page);
      await expect.poll(() => buchSeite.title()).toContain('(Buch Reise nach Ithaka)');

      // Echtes Bereichs-Fenster als Gegenprobe.
      const areaPromise = app.waitForEvent('window');
      await page.evaluate((p) => window.api.openAreaPath(p), areaDir);
      const areaSeite = await areaPromise;
      await areaSeite.waitForLoadState('domcontentloaded');
      await expect.poll(() => areaSeite.title()).toContain('(Bereich Projektordner)');

      // Regal-Fenster: «Bereich schließen» aus, «Bücherregal schließen» an.
      const regalMenu = await menuZustand(app, 'Bücherregal Bibliothek');
      expect(menuEintrag(regalMenu, 'Bereich schließen')?.enabled).toBe(false);
      expect(menuEintrag(regalMenu, 'Bücherregal schließen')?.enabled).toBe(true);
      expect(menuEintrag(regalMenu, 'Buch schließen')?.enabled).toBe(false);

      // Buch-Fenster: «Bereich schließen» aus, «Buch schließen» an.
      const buchMenu = await menuZustand(app, 'Buch Reise nach Ithaka');
      expect(menuEintrag(buchMenu, 'Bereich schließen')?.enabled).toBe(false);
      expect(menuEintrag(buchMenu, 'Buch schließen')?.enabled).toBe(true);

      // Bereichs-Fenster: «Bereich schließen» bleibt aktiv.
      const bereichMenu = await menuZustand(app, 'Bereich Projektordner');
      expect(menuEintrag(bereichMenu, 'Bereich schließen')?.enabled).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- RG-04 --------------------------------------------------------------------

test.describe('RG-04: Sitzungs-Wiederherstellung (4T-0867)', () => {
  test('Ein geöffnetes Regal übersteht Beenden und Neustart mit demselben Profil', async () => {
    const parent = makeTempDir();
    const shelfDir = makeShelfOnDisk(parent, 'Bibliothek', []);
    const first = await launchApp();
    const userData = first.userData;
    try {
      const opened = await first.page.evaluate((dir) => window.api.shelves.openPath(dir), shelfDir);
      expect(opened.ok).toBe(true);
      await expect
        .poll(async () => (await shelfState(first.page)).active?.shelfFileName)
        .toBe('Bibliothek.md');
      // Sauber beenden (before-quit persistiert die Sitzung), dann Neustart
      // mit demselben Profil (Muster SM-09).
      await first.app.evaluate(({ app }) => app.quit());
      await first.app.waitForEvent('close');

      const second = await launchApp({ userData });
      try {
        await expect
          .poll(async () => (await shelfState(second.page)).active?.shelfFileName)
          .toBe('Bibliothek.md');
        // 4T-0882 (Regressionsfall, Befund c der Test-Iteration 0.104.0):
        // Die Bindung allein genügt nicht — das wiederhergestellte Fenster
        // zeigt die Regal-Seite, kein leeres Fenster. Vor dem Fix stellte
        // restoreShelfForApp nur die Bindung her (kein shelves:openPage).
        await expect(second.page.locator(VIEW)).toBeVisible();
      } finally {
        await closeApp(second.app, null);
      }
    } finally {
      try {
        fs.rmSync(userData, { recursive: true, force: true });
      } catch {
        // Windows-Dateisperren: Rest räumt das Betriebssystem-Temp auf.
      }
    }
  });

  test('Mehr-Fenster-Sitzung: die Regal-Seite ist nach dem Neustart wieder da (4T-0882)', async () => {
    // PO-Befund vom 2026-08-05 am realen Profil (zweiter Anlauf von 4T-0882):
    // In einer Sitzung mit Regal-App UND Buch-App blieb das
    // wiederhergestellte Regal-Fenster leer, während der kleine Einzel-Fall
    // oben grün lief — die Öffnen-Meldung des Mains ging als Push über
    // Prozess- und Lade-Grenzen verloren. Seither zieht der Renderer-Init den
    // Zustand selbst (Pull); dieser Fall stellt das Mehr-Fenster-Szenario.
    const parent = makeTempDir();
    const shelfDir = makeShelfOnDisk(parent, 'Bibliothek', ['Reise nach Ithaka']);
    const buchDir = makeBookOnDisk(shelfDir, 'Reise nach Ithaka');
    const kapitel = path.join(buchDir, 'Kapitel 1.md');
    fs.writeFileSync(kapitel, '# Kapitel 1\n', 'utf8');
    const first = await launchApp();
    const userData = first.userData;
    try {
      await first.page.evaluate((dir) => window.api.shelves.openPath(dir), shelfDir);
      await expect(first.page.locator(VIEW)).toBeVisible();
      const fensterVorher = first.app.windows().length;
      await sendeAnFenster(first.app, 'Bücherregal Bibliothek', kapitel);
      await expect.poll(() => first.app.windows().length).toBe(fensterVorher + 1);
      const buchSeite = first.app.windows().find((p) => p !== first.page);
      await expect.poll(() => buchSeite.title()).toContain('(Buch Reise nach Ithaka)');

      await first.app.evaluate(({ app }) => app.quit());
      await first.app.waitForEvent('close');

      const second = await launchApp({ userData });
      try {
        await expect.poll(() => second.app.windows().length).toBe(2);
        let regalSeite = null;
        await expect
          .poll(async () => {
            const titel = [];
            for (const w of second.app.windows()) {
              const t = await w.title();
              titel.push(t);
              if (t.includes('Bücherregal Bibliothek')) regalSeite = w;
            }
            return titel.join(' | ');
          })
          .toContain('Bücherregal Bibliothek');
        await expect(regalSeite.locator(VIEW)).toBeVisible();
        // Die Buch-Applikation ist ebenfalls wieder da.
        await expect
          .poll(async () => {
            const titel = [];
            for (const w of second.app.windows()) titel.push(await w.title());
            return titel.join(' | ');
          })
          .toContain('(Buch Reise nach Ithaka)');
      } finally {
        await closeApp(second.app, null, { force: true });
      }
    } finally {
      try {
        fs.rmSync(userData, { recursive: true, force: true });
      } catch {
        // Windows-Dateisperren: Rest räumt das Betriebssystem-Temp auf.
      }
    }
  });
});

// --- RG-10 --------------------------------------------------------------------

test.describe('RG-10: Erneutes Öffnen nach dem Schließen (4T-1031)', () => {
  test('Ein geschlossenes Regal lässt sich in derselben Sitzung wieder öffnen', async () => {
    // Regressionsfall zum Befund vom 2026-08-12: Der closed-Pfad löste die
    // Buch-Bindung der verschwundenen Applikation, die Regal-Bindung aber
    // nicht. Der stehen bleibende Eintrag war kein bloßer Speicher-Rest — die
    // Suche nach der laufenden Regal-Applikation fand die tote App, und das
    // erneute Öffnen meldete Erfolg, ohne ein Fenster zu bauen. Das Regal war
    // damit bis zum Neustart der Anwendung unerreichbar.
    const { app, page, userData } = await launchApp();
    const parent = makeTempDir();
    const shelfDir = makeShelfOnDisk(parent, 'Bibliothek', []);
    const areaDir = path.join(parent, 'Projektordner');
    fs.mkdirSync(areaDir);
    try {
      // Regal in der freien Start-Applikation öffnen.
      await page.evaluate((dir) => window.api.shelves.openPath(dir), shelfDir);
      await expect(page.locator(VIEW)).toBeVisible();

      // Ein zweites Fenster, damit der Prozess das Schließen des
      // Regal-Fensters überlebt: Ohne jedes Fenster beendet sich die
      // Anwendung, und dann kann der Fall gar nicht auftreten. Genau diese
      // Bedingung macht ihn im Alltag selten und beim Suchen schwer.
      const bereichKommt = app.waitForEvent('window');
      await page.evaluate((p) => window.api.openAreaPath(p), areaDir);
      const bereichSeite = await bereichKommt;
      await bereichSeite.waitForLoadState('domcontentloaded');
      await expect.poll(() => bereichSeite.title()).toContain('(Bereich Projektordner)');

      // Regal über den regulären Weg schließen; das Bereichs-Fenster bleibt.
      // Der Aufruf schließt das Fenster, das ihn absetzt, deshalb darf auf
      // seine Rückkehr nicht gewartet werden: Ein `await page.evaluate(…)`
      // scheitert mit «Target page, context or browser has been closed», weil
      // die Seite vor der Antwort verschwindet. Der Aufruf wird deshalb erst
      // nach der Rückkehr des evaluate ausgelöst.
      await page.evaluate(() => {
        setTimeout(() => window.api.shelves.close(), 0);
      });
      await expect.poll(() => app.windows().length).toBe(1);

      // Dasselbe Regal erneut öffnen: Es bekommt wieder ein Fenster mit der
      // Regal-Seite. Vor dem Fix blieb es bei dem einen Bereichs-Fenster,
      // während der Aufruf `ok` meldete.
      const regalKommt = app.waitForEvent('window');
      const erneut = await bereichSeite.evaluate(
        (dir) => window.api.shelves.openPath(dir),
        shelfDir,
      );
      expect(erneut.ok).toBe(true);
      const regalSeite = await regalKommt;
      await regalSeite.waitForLoadState('domcontentloaded');
      await expect.poll(() => regalSeite.title()).toContain('(Bücherregal Bibliothek)');
      await expect(regalSeite.locator(VIEW)).toBeVisible();
      expect(app.windows().length).toBe(2);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
