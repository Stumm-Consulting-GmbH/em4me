// 4T-002025 (Epic 3E-000192, Story 4S-001026): Ablauf-Prüfdatei der Diagramme
// zu Tabellen in Druck und PDF. describe-Titel tragen die Fall-Kennungen
// DD-01 ….
//
// **Was zugesichert wird:** Druck und PDF zeichnen jedes Diagramm in den
// Farben des HELLEN Farbschemas, auch bei dunkler Anzeige und auch dann, wenn
// seine Tabelle in einem anderen Dokument liegt und erst gelesen werden muss;
// danach steht die Anzeige wieder im aktiven Schema (print-preparation.js,
// `zeichneDiagrammeFuerAusgabe` und `waitForChartsIdle` aus chart-view.js).
//
// **Gemessen wird am Lese-Ende** (Test-Strategie, Kapitel 5.3): im PDF an den
// Füllfarben der entpackten Seiten-Inhalte (Muster PD-01 in
// pdf-export.spec.js; Chromium schreibt eine Füllfarbe als «r g b rg» mit
// Anteilen von 0 bis 1), beim Druck am Zustand der Seite im Augenblick des
// Druck-Aufrufs — der Systemdialog ist nicht bedienbar, `webContents.print`
// ist deshalb ersetzt (Muster drucken.spec.js) und liest vor der Rückmeldung
// den Zustand der Seite aus. Die Farbwerte kommen aus den Schema-Daten
// (src/shared/color-schemes.js), mit den mitgelieferten Standard-Schemata.
//
// **Warum der verzögerte Kanal:** Ohne ihn wäre die Lesung eines anderen
// Dokuments ein Rennen gegen die Ausgabe (Muster EB-08 in
// einbettungen.spec.js). Mit zwei Sekunden Verzögerung ist es eine
// Entscheidung: Wartet die Ausgabe nicht, steht das alte dunkle Bild im PDF —
// so am Bestand gemessen, bevor die Barriere angeschlossen war.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { erwarteDateiUnveraendert } = require('../helpers/dateien');
const { BASE_DEFAULTS } = require('../../../src/shared/color-schemes.js');
const { hauptLesen, hauptSenden } = require('../helpers/haupt-zugriff');

// Die ersten vier Reihen-Farben beider mitgelieferten Standard-Schemata.
const HELL = [1, 2, 3, 4].map((i) => BASE_DEFAULTS.light[`chart${i}`]);
const DUNKEL = [1, 2, 3, 4].map((i) => BASE_DEFAULTS.dark[`chart${i}`]);

const STANDARD = {
  language: 'de',
  colorSchemes: { custom: [], activeLight: 'standard-light', activeDark: 'standard-dark' },
};

const TABELLE = [
  '```perspective-datatable',
  'columns: Monat:text, Einnahmen:number, Ausgaben:number',
  '| Januar  | 100 | 80 |',
  '| Februar | 90  | 95 |',
  '| März    | 120 | 70 |',
  '```',
  '^umsatz',
].join('\n');

// Eine weitere Zeile, ungespeichert eingetippt: Der Kreis bekommt damit ein
// viertes Segment und die vierte Reihen-Farbe. Diese Farbe steht nur dann im
// PDF, wenn die Ausgabe den geschriebenen Stand zeigt.
const APRIL = '| April   | 50  | 40 |';

function diagramm(table, ...angaben) {
  return ['```perspective-chart', `table: ${table}`, ...angaben, '```'].join('\n');
}
const BALKEN = (t) => diagramm(t, 'type: bar', 'labels: Monat', 'values: Einnahmen, Ausgaben');
const LINIE = (t) => diagramm(t, 'type: line', 'labels: Monat', 'values: Einnahmen, Ausgaben');
const KREIS = (t) => diagramm(t, 'type: pie', 'labels: Monat', 'values: Einnahmen');
const RING = (t) => diagramm(t, 'type: donut', 'labels: Monat', 'values: Ausgaben');
const FEHLT = diagramm('^fehlt', 'type: bar', 'labels: Monat', 'values: Einnahmen');

const EIGEN = ['# Diagramme', '', TABELLE, '', BALKEN('^umsatz'), '', KREIS('^umsatz'), ''].join(
  '\n',
);
const QUELLE = ['# Quelle', '', TABELLE, ''].join('\n');
const FREMD = '[[Quelle#^umsatz]]';

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-diagramme-dd-'));
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

function schreibe(dir, name, text) {
  const datei = path.join(dir, name);
  fs.writeFileSync(datei, text, 'utf8');
  return datei;
}

// --- PDF am Lese-Ende ---------------------------------------------------------

// Alle FlateDecode-Streams entpacken (Muster pdf-export.spec.js).
function pdfInhalte(buffer) {
  const raw = buffer.toString('latin1');
  const out = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      out.push(zlib.inflateSync(buffer.subarray(start, end)).toString('latin1'));
    } catch {
      // Nicht-Flate-Stream (Schriften, Bilder) — für die Farben ohne Belang.
    }
  }
  return out.join('\n');
}

// Die Füll- und Strichfarben des PDFs als Hex-Werte. Die Rückrechnung auf
// ganze Kanal-Werte macht die Prüfung unabhängig davon, wie viele
// Nachkommastellen Chromium schreibt.
function pdfFarben(buffer) {
  const kanal = (v) =>
    Math.round(parseFloat(v) * 255)
      .toString(16)
      .padStart(2, '0');
  const farben = new Set();
  const re = /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(?:rg|RG)\b/g;
  const inhalt = pdfInhalte(buffer);
  let m;
  while ((m = re.exec(inhalt)) !== null) farben.add(`#${kanal(m[1])}${kanal(m[2])}${kanal(m[3])}`);
  return farben;
}

// PDF-Ausgabe über das Menü, Zielpfad-Dialog gestellt (Muster EB-08).
async function exportierePdf(app, page, ziel) {
  await hauptSenden(
    app,
    ({ dialog }, z) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: z });
    },
    ziel,
  );
  await hauptSenden(app, ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:exportPdf');
  });
  await expect.poll(() => fs.existsSync(ziel), { timeout: 60000 }).toBe(true);
  await expect(page.locator('body.printing')).toHaveCount(0);
  const buffer = fs.readFileSync(ziel);
  expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  return pdfFarben(buffer);
}

// --- Druck: Zustand der Seite beim Druck-Aufruf -------------------------------

// Die Diagramme der gerenderten Ansicht der ersten Spalte, wie der Druck sie
// rastert (ein Live-Widget im Editor gehört nicht zum Druckbild).
const ERFASSE = `(() => ({
  theme: document.documentElement.getAttribute('data-theme'),
  bloecke: Array.from(
    document.querySelectorAll('.pane-group[data-pane="0"] .markdown-body .perspective-chart'),
  )
    .filter((el) => !el.closest('.cm-editor'))
    .map((el) => ({
      zustand: el.dataset.chartState || null,
      fuellungen: [...new Set(Array.from(el.querySelectorAll('path[fill]'))
        .map((p) => (p.getAttribute('fill') || '').toLowerCase())
        .filter((f) => f.startsWith('#')))],
      beschreibung: (el.querySelector('svg desc') || {}).textContent || null,
      hinweis: !!el.querySelector('.perspective-chart-hint'),
      umbruch: getComputedStyle(el).breakInside,
      // 4T-002026: die Zeile der ausgelassenen Werte samt Sichtbarkeit und Lage
      // unter der Grafik.
      auslass: (() => {
        const z = el.querySelector('.perspective-chart-omitted');
        const svg = el.querySelector('svg');
        if (!z) return null;
        const r = z.getBoundingClientRect();
        return {
          text: z.textContent,
          sichtbar: r.height > 0 && getComputedStyle(z).display !== 'none',
          unterDerGrafik: !!svg && r.top >= svg.getBoundingClientRect().bottom - 1,
        };
      })(),
    })),
  codeBloecke: document.querySelectorAll(
    '.pane-group[data-pane="0"] .markdown-body code.language-perspective-chart',
  ).length,
}))()`;

async function druckeMitStub(app, page) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, erfasse) => {
      globalThis.__ddDruck = [];
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.print = (options, callback) => {
          win.webContents.executeJavaScript(erfasse).then(
            (stand) => {
              globalThis.__ddDruck.push(stand);
              callback(true, '');
            },
            (err) => {
              globalThis.__ddDruck.push({ fehler: String(err) });
              callback(true, '');
            },
          );
        };
      }
    },
    ERFASSE,
  );
  await hauptSenden(app, ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:print');
  });
  await expect
    .poll(() => hauptLesen(app, () => globalThis.__ddDruck.length), { timeout: 30000 })
    .toBe(1);
  await expect(page.locator('body.printing')).toHaveCount(0);
  return hauptLesen(app, () => globalThis.__ddDruck[0]);
}

// --- Anzeige ------------------------------------------------------------------

// Erste Füllfarbe jedes Diagramms einer Ansicht (Lese-Ansicht oder Editor).
function ersteFarben(page, ort) {
  const wurzel = ort === 'live' ? SEL.editorContent0 : SEL.markdownBody0;
  return page.evaluate(
    ([sel, live]) =>
      Array.from(document.querySelectorAll(`${sel} .perspective-chart`))
        .filter((el) => live || !el.closest('.cm-editor'))
        .map((el) => {
          const f = Array.from(el.querySelectorAll('path[fill]'))
            .map((p) => (p.getAttribute('fill') || '').toLowerCase())
            .find((x) => x.startsWith('#'));
          return `${el.dataset.chartState}:${f || '-'}`;
        }),
    [wurzel, ort === 'live'],
  );
}

async function dunkel(page) {
  await page.evaluate(() => window.api.setThemePref('dark'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
}

// Der Lese-Kanal des anderen Dokuments antwortet erst nach zwei Sekunden, mit
// der Antwort, die der echte Kanal gerade gegeben hat (Puffer vor Platte).
async function verzoegereLesekanal(app, antwort) {
  await hauptSenden(
    app,
    async ({ ipcMain }, a) => {
      ipcMain.removeHandler('chart:readTableDocument');
      ipcMain.handle('chart:readTableDocument', async () => {
        await new Promise((r) => setTimeout(r, 2000));
        return a;
      });
    },
    antwort,
  );
}

// Eine Zeile unter «März» ungespeichert eintippen, im Editor der Spalte.
async function tippeApril(page, editor) {
  await page.locator(`${editor} .cm-line`, { hasText: 'März' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(APRIL);
}

async function bearbeite(page, ansicht, pane = SEL.pane(0)) {
  await page.locator(SEL.viewBtn(ansicht)).click();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator(pane.editorContent)).toHaveAttribute('contenteditable', 'true');
}

test.describe('DD-01: PDF und Druck aus drei Ansichten bei dunklem Farbschema (F-332)', () => {
  test('hell im PDF, keine dunkle Reihen-Farbe, der geschriebene Stand in PDF und Druck, danach wieder dunkel', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramme.md', EIGEN);
    const { app, page, userData } = await launchApp({ args: [datei], settings: STANDARD });
    try {
      await expect(page.locator(`${SEL.markdownBody0} .perspective-chart svg`)).toHaveCount(2, {
        timeout: 20000,
      });
      await dunkel(page);
      await expect
        .poll(() => ersteFarben(page, 'rendered'))
        .toEqual([`drawn:${DUNKEL[0]}`, `drawn:${DUNKEL[0]}`]);

      for (const ansicht of ['rendered', 'split', 'live']) {
        if (ansicht === 'split') {
          // AK9: in der geteilten Ansicht ungespeichert eine Zeile ergänzen.
          await bearbeite(page, 'split');
          await tippeApril(page, SEL.editorContent0);
          await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
        } else if (ansicht !== 'rendered') {
          await page.locator(SEL.viewBtn(ansicht)).click();
        }
        // 4T-002026 (4S-001026 AK9): Der Druck zeigt den geschriebenen Stand —
        // ab der geteilten Ansicht mit der ungespeicherten vierten Zeile.
        const rubriken = ansicht === 'rendered' ? 3 : 4;
        const druck = await druckeMitStub(app, page);
        expect(
          druck.bloecke.map((b) => b.beschreibung),
          ansicht,
        ).toEqual([
          `Balkendiagramm mit 2 Datenreihen und ${rubriken} Rubriken`,
          `Kreisdiagramm mit 1 Datenreihe und ${rubriken} Rubriken`,
        ]);
        const farben = await exportierePdf(app, page, path.join(dir, `${ansicht}.pdf`));
        // AK2, AK3, AK15: das Diagramm steht im PDF, in den hellen Farben.
        expect(
          HELL.slice(0, 3).filter((f) => farben.has(f)),
          ansicht,
        ).toEqual(HELL.slice(0, 3));
        expect(
          DUNKEL.filter((f) => farben.has(f)),
          ansicht,
        ).toEqual([]);
        // AK9: das vierte Segment des ungespeicherten Stands, ab der
        // geteilten Ansicht.
        expect(farben.has(HELL[3]), ansicht).toBe(ansicht !== 'rendered');

        // AK16: danach zeichnet die Anzeige wieder dunkel, im Live-Modus
        // auch das Widget im Editor.
        await expect
          .poll(() => ersteFarben(page, ansicht))
          .toEqual([`drawn:${DUNKEL[0]}`, `drawn:${DUNKEL[0]}`]);
      }
      // 4T-002026: Die Zeile April steht im Puffer, nicht auf der Platte.
      erwarteDateiUnveraendert(datei, EIGEN);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DD-02: Druck und PDF aus drei Ansichten, Zustand beim Aufruf (F-332)', () => {
  test('hell gezeichnet, Hinweis statt Grafik in Druck und PDF, anderes Dokument fertig gelesen, Umbruch-Schutz', async () => {
    const dir = makeDir();
    const dateiQ = schreibe(dir, 'Quelle.md', QUELLE);
    const datei = schreibe(
      dir,
      'Bericht.md',
      ['# Bericht', '', TABELLE, '', BALKEN('^umsatz'), '', FEHLT, '', BALKEN(FREMD), ''].join(
        '\n',
      ),
    );
    const { app, page, userData } = await launchApp({ args: [datei], settings: STANDARD });
    try {
      await expect(
        page.locator(`${SEL.markdownBody0} .perspective-chart[data-chart-state="drawn"] svg`),
      ).toHaveCount(2, { timeout: 20000 });
      await dunkel(page);
      const dunkelStand = [`drawn:${DUNKEL[0]}`, 'undrawable:-', `drawn:${DUNKEL[0]}`];
      await expect.poll(() => ersteFarben(page, 'rendered')).toEqual(dunkelStand);
      await verzoegereLesekanal(app, { ok: true, path: dateiQ, content: QUELLE, quelle: 'platte' });

      for (const ansicht of ['rendered', 'split', 'live']) {
        if (ansicht !== 'rendered') await page.locator(SEL.viewBtn(ansicht)).click();
        const stand = await druckeMitStub(app, page);
        expect(stand.theme, ansicht).toBe('light');
        const [eigen, fehlt, fremd] = stand.bloecke;
        expect(stand.bloecke, ansicht).toHaveLength(3);
        // AK1, AK3: gezeichnet, in den hellen Farben, keine dunkle darunter.
        expect(eigen.zustand, ansicht).toBe('drawn');
        expect(eigen.fuellungen, ansicht).toEqual(HELL.slice(0, 2));
        // AK10: das Diagramm auf das andere Dokument ist fertig gelesen und
        // hell gezeichnet, nicht das alte Bild einer laufenden Lesung.
        expect(fremd.zustand, ansicht).toBe('drawn');
        expect(fremd.fuellungen, ansicht).toEqual(HELL.slice(0, 2));
        // AK7: an der Stelle des nicht zeichenbaren Diagramms der Hinweis.
        expect(fehlt.zustand, ansicht).toBe('undrawable');
        expect(fehlt.hinweis, ansicht).toBe(true);
        expect(fehlt.fuellungen, ansicht).toEqual([]);
        // Kein Diagramm wird über zwei Seiten zerschnitten.
        for (const b of stand.bloecke) expect(b.umbruch, ansicht).toBe('avoid');

        // 4T-002026 (4S-001026 AK7): beim Aufruf der PDF-Erzeugung ebenso der
        // Hinweis an der Stelle des nicht zeichenbaren Diagramms.
        const pdf = await pdfMitErfassung(app, page, path.join(dir, `${ansicht}.pdf`));
        expect(pdf.stand.theme, ansicht).toBe('light');
        expect(
          pdf.stand.bloecke.map((b) => [b.zustand, b.hinweis]),
          ansicht,
        ).toEqual([
          ['drawn', false],
          ['undrawable', true],
          ['drawn', false],
        ]);
        expect(pdf.stand.bloecke[1].fuellungen, ansicht).toEqual([]);

        // AK16: zurück in der dunklen Anzeige, auch das andere Dokument.
        await expect
          .poll(() => ersteFarben(page, 'rendered'), { timeout: 15000 })
          .toEqual(dunkelStand);
      }
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DD-03: PDF mit einem Diagramm auf ein anderes, ungespeichert geändertes Dokument (F-332)', () => {
  test('der Kanal antwortet verzögert; das PDF trägt das helle Bild des geschriebenen Stands', async () => {
    const dir = makeDir();
    const dateiQ = schreibe(dir, 'Quelle.md', QUELLE);
    const uebersicht = ['# Übersicht', '', KREIS(FREMD), ''].join('\n');
    const dateiU = schreibe(dir, 'Übersicht.md', uebersicht);
    const { app, page, userData } = await launchApp({
      args: [dateiU, dateiQ],
      settings: STANDARD,
    });
    const P1 = SEL.pane(1);
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      // Die Quelle nach rechts; links bleibt die Übersicht in der Lese-Ansicht.
      await page.locator(SEL.tabs0, { hasText: 'Quelle' }).first().click();
      await page.keyboard.press('Control+Alt+ArrowRight');
      await expect(page.locator(P1.tabs)).toHaveCount(1);
      await dunkel(page);

      // Rechts ungespeichert eine Zeile ergänzen; links folgt der Kreis mit
      // einem vierten Segment.
      await bearbeite(page, 'source', P1);
      await tippeApril(page, P1.editorContent);
      await expect(page.locator(P1.dirtyTab).first()).toBeVisible();
      // Das vierte Segment in der dunklen Anzeige der Übersicht.
      const vierSegmente = () =>
        page.evaluate(
          ([sel, farbe]) =>
            Array.from(document.querySelectorAll(`${sel} .perspective-chart path[fill]`)).some(
              (p) => (p.getAttribute('fill') || '').toLowerCase() === farbe,
            ),
          [SEL.markdownBody0, DUNKEL[3]],
        );
      await expect.poll(vierSegmente, { timeout: 15000 }).toBe(true);

      // Die Antwort des echten Kanals ist der geschriebene Stand; von hier an
      // kommt genau sie, aber erst nach zwei Sekunden.
      const antwort = await page.evaluate(
        (f) => window.api.readChartTableDocument(f, 'Quelle'),
        dateiU,
      );
      expect(antwort.content).toContain('April');
      await verzoegereLesekanal(app, antwort);

      await page.locator(SEL.tabs0).first().click();
      const farben = await exportierePdf(app, page, path.join(dir, 'aus.pdf'));
      // AK10, AK3, AK9: hell, mit dem vierten Segment des geschriebenen Stands.
      expect(HELL.filter((f) => farben.has(f))).toEqual(HELL);
      expect(DUNKEL.filter((f) => farben.has(f))).toEqual([]);
      // Die Ausgabe hat die Übersicht nicht verändert, die Quelle nicht
      // gespeichert.
      expect(fs.readFileSync(dateiU, 'utf8')).toBe(uebersicht);
      expect(fs.readFileSync(dateiQ, 'utf8')).toBe(QUELLE);
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      // AK16: wieder dunkel, nachdem der Kanal auch der Anzeige geantwortet hat.
      await expect.poll(vierSegmente, { timeout: 15000 }).toBe(true);
      await expect
        .poll(() => ersteFarben(page, 'rendered'), { timeout: 15000 })
        .toEqual([`drawn:${DUNKEL[0]}`]);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DD-04: vier Arten, mehrere Reihen, mehrere Diagramme in einem Dokument (F-332)', () => {
  test('Druck und PDF geben jedes Diagramm an seiner Stelle hell aus', async () => {
    const dir = makeDir();
    const text = [
      '# Alle Arten',
      '',
      TABELLE,
      '',
      BALKEN('^umsatz'),
      '',
      LINIE('^umsatz'),
      '',
      KREIS('^umsatz'),
      '',
      RING('^umsatz'),
      '',
    ].join('\n');
    const datei = schreibe(dir, 'Arten.md', text);
    const { app, page, userData } = await launchApp({ args: [datei], settings: STANDARD });
    try {
      await expect(page.locator(`${SEL.markdownBody0} .perspective-chart svg`)).toHaveCount(4, {
        timeout: 20000,
      });
      await dunkel(page);
      const stand = await druckeMitStub(app, page);
      // AK11, AK14: vier Grafiken in der Reihenfolge des Dokuments, zwei mit
      // zwei Datenreihen, alle hell.
      expect(stand.bloecke.map((b) => b.beschreibung)).toEqual([
        'Balkendiagramm mit 2 Datenreihen und 3 Rubriken',
        'Liniendiagramm mit 2 Datenreihen und 3 Rubriken',
        'Kreisdiagramm mit 1 Datenreihe und 3 Rubriken',
        'Donut-Diagramm mit 1 Datenreihe und 3 Rubriken',
      ]);
      for (const b of stand.bloecke) {
        expect(b.zustand).toBe('drawn');
        expect(b.fuellungen.filter((f) => DUNKEL.includes(f))).toEqual([]);
      }
      expect(stand.bloecke[0].fuellungen).toEqual(HELL.slice(0, 2));
      expect(stand.bloecke[2].fuellungen).toEqual(HELL.slice(0, 3));

      const farben = await exportierePdf(app, page, path.join(dir, 'aus.pdf'));
      expect(HELL.slice(0, 3).filter((f) => farben.has(f))).toEqual(HELL.slice(0, 3));
      expect(DUNKEL.filter((f) => farben.has(f))).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DD-05: Erweiterung ausgeschaltet (F-332)', () => {
  test('Druck und PDF zeigen den Block als gewöhnlichen Code-Block', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramme.md', EIGEN);
    const { app, page, userData } = await launchApp({
      args: [datei],
      settings: { ...STANDARD, extensions: { disabled: ['perspective-chart'] } },
    });
    try {
      await expect(
        page.locator(`${SEL.markdownBody0} code.language-perspective-chart`),
      ).toHaveCount(2, { timeout: 20000 });
      await dunkel(page);
      const stand = await druckeMitStub(app, page);
      // AK13: kein Diagramm, zwei Code-Blöcke.
      expect(stand.bloecke).toEqual([]);
      expect(stand.codeBloecke).toBe(2);
      const farben = await exportierePdf(app, page, path.join(dir, 'aus.pdf'));
      expect([...HELL, ...DUNKEL].filter((f) => farben.has(f))).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DD-06: Druck und PDF verändern das Dokument nicht (F-332)', () => {
  test('byte-gleich und nicht als geändert markiert, aus dem Live-Modus', async () => {
    const dir = makeDir();
    const dateiQ = schreibe(dir, 'Quelle.md', QUELLE);
    const datei = schreibe(
      dir,
      'Bericht.md',
      ['# Bericht', '', EIGEN, '', BALKEN(FREMD), ''].join('\n'),
    );
    const vorher = fs.readFileSync(datei);
    const vorherQ = fs.readFileSync(dateiQ);
    const { app, page, userData } = await launchApp({ args: [datei], settings: STANDARD });
    try {
      await expect(
        page.locator(`${SEL.markdownBody0} .perspective-chart[data-chart-state="drawn"] svg`),
      ).toHaveCount(3, { timeout: 20000 });
      await dunkel(page);
      await page.locator(SEL.viewBtn('live')).click();
      await druckeMitStub(app, page);
      await exportierePdf(app, page, path.join(dir, 'aus.pdf'));
      // AK12: beide Dokumente byte-gleich, kein Reiter als geändert markiert.
      expect(fs.readFileSync(datei).equals(vorher)).toBe(true);
      expect(fs.readFileSync(dateiQ).equals(vorherQ)).toBe(true);
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      await expect(page.locator(SEL.content0)).toHaveClass(/view-live/);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// --- 4T-002026: Zeile der ausgelassenen Werte in Druck und PDF ----------------

// Der PDF-Weg im Hauptprozess, ergänzt um die Erfassung der Seite im
// Augenblick des Aufrufs; das PDF entsteht danach unverändert über den
// ursprünglichen Aufruf.
async function pdfMitErfassung(app, page, ziel) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, erfasse) => {
      globalThis.__ddPdf = [];
      for (const win of BrowserWindow.getAllWindows()) {
        const wc = win.webContents;
        if (!wc.__ddPdfOriginal) wc.__ddPdfOriginal = wc.printToPDF.bind(wc);
        wc.printToPDF = async (options) => {
          globalThis.__ddPdf.push(await wc.executeJavaScript(erfasse));
          return wc.__ddPdfOriginal(options);
        };
      }
    },
    ERFASSE,
  );
  const farben = await exportierePdf(app, page, ziel);
  const staende = await hauptLesen(app, () => globalThis.__ddPdf);
  expect(staende).toHaveLength(1);
  return { stand: staende[0], farben };
}

test.describe('DD-07: Zeile der ausgelassenen Werte in Druck und PDF (F-332)', () => {
  test('aus drei Ansichten steht die Zeile sichtbar unter der Grafik, wie am Bildschirm (4S-001025 AK10)', async () => {
    const dir = makeDir();
    // Eine leere Zelle und ein Text in einer Zahl-Spalte: zwei ausgelassene Werte.
    const luecken = TABELLE.replace('| Januar  | 100 | 80 |', '| Januar  |     | 80 |').replace(
      '| März    | 120 | 70 |',
      '| März    | 120 | viel |',
    );
    const text = ['# Lücken', '', luecken, '', BALKEN('^umsatz'), ''].join('\n');
    const datei = schreibe(dir, 'Luecken.md', text);
    const ZWEI = '2 Werte wurden ausgelassen, weil ihre Zellen leer oder nicht lesbar sind.';
    const zeile = { text: ZWEI, sichtbar: true, unterDerGrafik: true };
    const { app, page, userData } = await launchApp({ args: [datei], settings: STANDARD });
    try {
      await expect(
        page.locator(`${SEL.markdownBody0} .perspective-chart .perspective-chart-omitted`),
      ).toHaveText(ZWEI, { timeout: 20000 });
      for (const ansicht of ['rendered', 'split', 'live']) {
        if (ansicht !== 'rendered') await page.locator(SEL.viewBtn(ansicht)).click();
        const druck = await druckeMitStub(app, page);
        expect(druck.bloecke, ansicht).toHaveLength(1);
        expect(druck.bloecke[0].zustand, ansicht).toBe('drawn');
        expect(druck.bloecke[0].auslass, ansicht).toEqual(zeile);

        const pdf = await pdfMitErfassung(app, page, path.join(dir, `${ansicht}.pdf`));
        expect(pdf.stand.bloecke, ansicht).toHaveLength(1);
        expect(pdf.stand.bloecke[0].zustand, ansicht).toBe('drawn');
        expect(pdf.stand.bloecke[0].auslass, ansicht).toEqual(zeile);
        // Das Diagramm selbst steht im PDF, in den hellen Farben.
        expect(
          HELL.slice(0, 2).filter((f) => pdf.farben.has(f)),
          ansicht,
        ).toEqual(HELL.slice(0, 2));
      }
      // Druck und PDF verändern das Dokument nicht.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
