// 4T-002023 (Epic 3E-000192, Story 4S-001023): Ablauf-Prüfdatei der Diagramme,
// die eine Datentabelle in einem ANDEREN Dokument nennen (`table:
// [[Datei#^name]]`). describe-Titel tragen die Fall-Kennungen DF-01 ….
//
// Die Dokumente heißen nach ihrer Rolle: «Quelle» trägt die Datentabelle
// `^umsatz`, «Übersicht» das Diagramm auf sie, «Bericht» ein zweites. Gemessen
// wird an der gezeichneten Grafik selbst (Texte und ganzer Grafik-Text ohne die
// Kennungen der Ansicht, Muster diagramme.spec.js) und an der Einbettung
// desselben Ziels, die dem Diagramm gleich folgen muss (Entscheidungen des
// Product Owners vom 2026-09-29, «Beide folgen» und «Beide frischen auf»).
//
// Die Dokumente entstehen je Fall in einem eigenen Temp-Ordner, weil mehrere
// Fälle ungespeichert ändern oder von außen schreiben.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { erwarteDateiUnveraendert } = require('../helpers/dateien');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const TABELLE = [
  '```perspective-datatable',
  'columns: Monat:text, Einnahmen:number, Ausgaben:number, Saldo:number = Einnahmen - Ausgaben',
  '| Januar  | 100 | 80 |',
  '| Februar | 90  | 95 |',
  '| März    | 120 | 70 |',
  '```',
  '^umsatz',
].join('\n');

function diagramm(table, ...angaben) {
  return ['```perspective-chart', `table: ${table}`, ...angaben, '```'].join('\n');
}

const BALKEN = (table) =>
  diagramm(table, 'type: bar', 'title: Umsatz', 'labels: Monat', 'values: Einnahmen, Ausgaben');
const LINIE = (table) => diagramm(table, 'type: line', 'labels: Monat', 'values: Saldo');
const KREIS = (table) => diagramm(table, 'type: pie', 'labels: Monat', 'values: Einnahmen');
const RING = (table) => diagramm(table, 'type: donut', 'labels: Monat', 'values: Ausgaben');
const ZEILEN = (table) =>
  diagramm(table, 'type: bar', 'series: rows', 'labels: Monat', 'rows: Januar, März');

const FREMD = '[[Quelle#^umsatz]]';
const QUELLE = ['# Quelle', '', TABELLE, '', BALKEN('^umsatz'), ''].join('\n');

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-diagramme-df-'));
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

function schreibe(dir, name, text) {
  const datei = path.join(dir, ...name.split('/'));
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, text, 'utf8');
  return datei;
}

const P0 = SEL.pane(0);
const P1 = SEL.pane(1);
const LESE = (nr, pane = P0) => `${pane.markdownBody} .perspective-chart >> nth=${nr}`;
const LIVE = (nr, pane = P0) => `${pane.editorContent} .perspective-chart >> nth=${nr}`;

// Die Grafik eines Containers als Messwerte (Muster diagramme.spec.js).
function grafik(page, selektor) {
  return page.locator(selektor).evaluate((el) => {
    const svg = el.querySelector('svg');
    const texte = svg ? Array.from(svg.querySelectorAll('text')).map((t) => t.textContent) : [];
    const desc = svg ? svg.querySelector('desc') : null;
    const grund = el.querySelector('.perspective-chart-hint-reason');
    return {
      zustand: el.dataset.chartState || null,
      grundKennung: el.dataset.chartReason || null,
      grund: grund ? grund.textContent : null,
      ziel: el.dataset.chartTarget == null ? null : el.dataset.chartTarget,
      texte,
      beschreibung: desc ? desc.textContent : null,
      text: svg ? svg.outerHTML.replace(/ch-[a-z]\d*-\d+-/g, 'ID-') : null,
    };
  });
}

async function warteGezeichnet(page, selektor, anzahl = 1) {
  const container = selektor.split(' >> ')[0];
  await expect(page.locator(`${container}[data-chart-state="drawn"] svg`)).toHaveCount(anzahl, {
    timeout: 15000,
  });
}

// Ein Wert der Januar-Zeile im Quelltext der aktiven Spalte ändern, ohne zu
// speichern (Muster DG-05).
async function januarEinnahmen(page, editor, alt, neu) {
  const zeile = page.locator(`${editor} .cm-line`, { hasText: 'Januar' });
  await zeile.click();
  await page.keyboard.press('End');
  const rest = `${alt} | 80 |`;
  for (let i = 0; i < rest.length; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type(`${neu} | 80 |`);
}

async function bearbeiteQuelltext(page, pane) {
  await page.locator(SEL.viewBtn('source')).click();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator(pane.editorContent)).toHaveAttribute('contenteditable', 'true');
}

// Zweites Fenster derselben Applikation mit einer Datei als einzigem Reiter
// (Muster zweitesFensterMitDatei in rueckschreib-beobachtung.spec.js).
async function zweitesFensterMitDatei(app, page, datei) {
  const win2Promise = app.waitForEvent('window');
  await page.evaluate(() => window.api.openNewWindow([], null));
  const page2 = await win2Promise;
  await page2.waitForLoadState('domcontentloaded');
  await page2.waitForFunction(() => document.body.dataset.rendererReady === '1', undefined, {
    timeout: 20000,
  });
  await hauptSenden(
    app,
    ({ BrowserWindow }, f) => {
      const wins = BrowserWindow.getAllWindows();
      wins.sort((a, b) => a.webContents.id - b.webContents.id);
      const win = wins[wins.length - 1];
      if (win && !win.isDestroyed()) win.webContents.send('file:openExternal', [f]);
    },
    datei,
  );
  await expect(page2.locator(SEL.tabs0)).toHaveCount(1, { timeout: 20000 });
  return page2;
}

// Das Verzeichnis der Dokumente steht und beobachtet die Wurzel. Erst dann
// kann die Anwendung eine Änderung von außen bemerken.
async function warteVerzeichnisBereit(page, datei, name) {
  await expect
    .poll(
      async () =>
        (await page.evaluate(([f, n]) => window.api.resolveWikiTargetInIndex(f, n), [datei, name]))
          .status,
      { timeout: 15000 },
    )
    .toBe('ready');
}

// Von außen schreiben, bis die Anwendung es bemerkt hat. Der Beobachter des
// Verzeichnisses meldet eine Änderung erst, nachdem sein erster Durchlauf
// fertig ist; dessen Ende ist von außen nicht zu sehen. Ein erneutes Schreiben
// desselben Inhalts ist eine weitere Änderung und schließt diese Lücke, ohne
// eine Zeit zu raten.
async function schreibeVonAussen(datei, text, bemerkt) {
  await expect(async () => {
    fs.writeFileSync(datei, text, 'utf8');
    await bemerkt();
  }).toPass({ timeout: 30000, intervals: [1000, 2000, 3000] });
}

test.describe('DF-01: Diagramm zu einer Tabelle in einem anderen Dokument, drei Ansichten (F-332)', () => {
  test('vier Arten, Spalten und Zeilen, gleiche Grafik wie im eigenen Dokument, zweites Dokument', async () => {
    const dir = makeDir();
    schreibe(dir, 'Quelle.md', QUELLE);
    const uebersicht = [
      '# Übersicht',
      '',
      BALKEN(FREMD),
      '',
      LINIE(FREMD),
      '',
      KREIS(FREMD),
      '',
      RING(FREMD),
      '',
      ZEILEN(FREMD),
      '',
    ].join('\n');
    const dateiU = schreibe(dir, 'Übersicht.md', uebersicht);
    const dateiB = schreibe(dir, 'Bericht.md', ['# Bericht', '', BALKEN(FREMD), ''].join('\n'));
    const dateiQ = path.join(dir, 'Quelle.md');
    const { app, page, userData } = await launchApp({ args: [dateiQ, dateiB, dateiU] });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(3);
      // Bezug: dasselbe Diagramm im eigenen Dokument der Tabelle.
      await page.locator(P0.tabs, { hasText: 'Quelle' }).first().click();
      await warteGezeichnet(page, LESE(0));
      const eigenes = await grafik(page, LESE(0));

      await page.locator(P0.tabs, { hasText: 'Übersicht' }).first().click();
      await warteGezeichnet(page, LESE(0), 5);
      const lese = [];
      for (let nr = 0; nr < 5; nr++) lese.push(await grafik(page, LESE(nr)));
      for (const g of lese) expect(g.zustand).toBe('drawn');
      // AK1: die Werte der Tabelle — Zeichen für Zeichen die Grafik, die das
      // eigene Dokument zeigt.
      expect(lese[0].text).toBe(eigenes.text);
      expect(lese[0].ziel).toBe(dateiQ);
      expect(lese[0].beschreibung).toBe('Balkendiagramm mit 2 Datenreihen und 3 Rubriken');
      expect(lese[1].beschreibung).toBe('Liniendiagramm mit 1 Datenreihe und 3 Rubriken');
      for (const g of lese.slice(0, 4)) {
        expect(g.texte.join(' ')).toMatch(/Januar/);
      }
      // AK2, Datenreihen aus Zeilen: die Zahl-Spalten sind die Rubriken.
      expect(lese[4].texte).toEqual(expect.arrayContaining(['Januar', 'März', 'Saldo']));
      // Vier verschiedene Arten, vier verschiedene Grafiken.
      expect(new Set(lese.slice(0, 4).map((g) => g.text)).size).toBe(4);

      // AK2: geteilte Ansicht und Live-Modus zeigen dieselben Grafiken.
      await page.locator(SEL.viewBtn('split')).click();
      await warteGezeichnet(page, LESE(0), 5);
      for (let nr = 0; nr < 5; nr++) {
        expect((await grafik(page, LESE(nr))).text).toBe(lese[nr].text);
      }
      await page.locator(SEL.viewBtn('live')).click();
      await warteGezeichnet(page, LIVE(0), 5);
      for (let nr = 0; nr < 5; nr++) {
        expect((await grafik(page, LIVE(nr))).text).toBe(lese[nr].text);
      }

      // AK3: ein zweites Diagramm in einem dritten Dokument nennt dieselbe Tabelle.
      await page.locator(SEL.viewBtn('rendered')).click();
      await page.locator(P0.tabs, { hasText: 'Bericht' }).first().click();
      await warteGezeichnet(page, LESE(0));
      expect((await grafik(page, LESE(0))).text).toBe(lese[0].text);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DF-02: das Diagramm folgt dem ungespeicherten Stand im selben Fenster (F-332)', () => {
  test('Wert in der Quelle ändern, Diagramm folgt; Schließen ohne Speichern zeigt wieder die Datei', async () => {
    const dir = makeDir();
    const dateiQ = schreibe(dir, 'Quelle.md', QUELLE);
    const dateiU = schreibe(dir, 'Übersicht.md', ['# Übersicht', '', BALKEN(FREMD), ''].join('\n'));
    const vorherQ = fs.statSync(dateiQ).mtimeMs;
    const { app, page, userData } = await launchApp({ args: [dateiU, dateiQ] });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);
      // Die Quelle nach rechts; links bleibt die Übersicht in der Lese-Ansicht.
      await page.locator(P0.tabs, { hasText: 'Quelle' }).first().click();
      await page.keyboard.press('Control+Alt+ArrowRight');
      await expect(page.locator(P1.tabs)).toHaveCount(1);
      await warteGezeichnet(page, LESE(0));
      const gespeichert = await grafik(page, LESE(0));
      expect(gespeichert.texte).not.toContain('5000');

      // AK4: rechts schreiben, NICHT speichern; links ohne Griff in die Spalte.
      await bearbeiteQuelltext(page, P1);
      await januarEinnahmen(page, P1.editorContent, '100', '5000');
      await expect(page.locator(P1.dirtyTab).first()).toBeVisible();
      await expect.poll(async () => (await grafik(page, LESE(0))).texte).toContain('5000');
      // AK7: Die Quelle auf der Platte ist unverändert, die Übersicht nicht
      // ungespeichert, und das Diagramm hat an der Quelle nichts geändert.
      expect(fs.readFileSync(dateiQ, 'utf8')).toBe(QUELLE);
      await expect(page.locator(P0.dirtyTab)).toHaveCount(0);

      // AK6: die Quelle ohne Speichern schließen («Verwerfen», nativ gestellt).
      await hauptSenden(app, ({ dialog }) => {
        dialog.showMessageBox = async () => ({ response: 1 });
      });
      await page.locator(P1.activeTab).locator('.tab-close').click();
      await expect
        .poll(async () => (await grafik(page, LESE(0))).text, { timeout: 15000 })
        .toBe(gespeichert.text);
      expect(fs.readFileSync(dateiQ, 'utf8')).toBe(QUELLE);
      expect(fs.statSync(dateiQ).mtimeMs).toBe(vorherQ);
      await expect(page.locator(P0.dirtyTab)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DF-03: Diagramm und Einbettung folgen einer Änderung in einem anderen Fenster (F-332)', () => {
  test('Lese-Ansicht, geteilte Ansicht und Live-Modus im ersten Fenster, getippt im zweiten', async () => {
    const dir = makeDir();
    const dateiQ = schreibe(dir, 'Quelle.md', QUELLE);
    const dateiU = schreibe(
      dir,
      'Übersicht.md',
      ['# Übersicht', '', BALKEN(FREMD), '', '![[Quelle#^umsatz]]', ''].join('\n'),
    );
    const { app, page, userData } = await launchApp({ args: [dateiU] });
    const einbettung = `${P0.markdownBody} .wiki-embed-md-body`;
    const liveEinbettung = `${P0.paneSource} .cm-live-embed .wiki-embed-md-body`;
    try {
      await warteGezeichnet(page, LESE(0));
      const gespeichert = await grafik(page, LESE(0));
      await expect(page.locator(einbettung).first()).toContainText('100', { timeout: 15000 });

      const page2 = await zweitesFensterMitDatei(app, page, dateiQ);
      await bearbeiteQuelltext(page2, P0);
      await januarEinnahmen(page2, P0.editorContent, '100', '5000');
      await expect(page2.locator(P0.dirtyTab).first()).toBeVisible();

      // Erstes Fenster, Lese-Ansicht: beide folgen, ohne Griff in dieses Fenster.
      await expect.poll(async () => (await grafik(page, LESE(0))).texte).toContain('5000');
      await expect(page.locator(einbettung).first()).toContainText('5000', { timeout: 15000 });

      // 4T-002026 (4S-001023 AK11): Erstes Fenster, geteilte Ansicht — die
      // gerenderte Hälfte zeigt Diagramm und Einbettung mit dem neuen Wert.
      await page.locator(SEL.viewBtn('split')).click();
      await warteGezeichnet(page, LESE(0));
      await expect.poll(async () => (await grafik(page, LESE(0))).texte).toContain('5000');
      await expect(page.locator(einbettung).first()).toContainText('5000', { timeout: 15000 });

      // Erstes Fenster auf Live; im zweiten zurück auf den gespeicherten Wert.
      await page.locator(SEL.viewBtn('live')).click();
      await warteGezeichnet(page, LIVE(0));
      await expect(page.locator(liveEinbettung).first()).toContainText('5000', {
        timeout: 15000,
      });
      await januarEinnahmen(page2, P0.editorContent, '5000', '100');
      await expect
        .poll(async () => (await grafik(page, LIVE(0))).text, { timeout: 15000 })
        .toBe(gespeichert.text);
      await expect(page.locator(liveEinbettung).first()).not.toContainText('5000', {
        timeout: 15000,
      });
      // AK7: die Quelle ist weiter nur im zweiten Fenster ungespeichert.
      expect(fs.readFileSync(dateiQ, 'utf8')).toBe(QUELLE);
      await expect(page.locator(P0.dirtyTab)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DF-04: Änderung der Quelle von außen, Quelle nicht geöffnet (F-332)', () => {
  test('Diagramm und Einbettung zeigen den neuen Stand, in Lese-Ansicht und Live-Modus', async () => {
    const dir = makeDir();
    const dateiQ = schreibe(dir, 'Quelle.md', QUELLE);
    const dateiU = schreibe(
      dir,
      'Übersicht.md',
      ['# Übersicht', '', BALKEN(FREMD), '', '![[Quelle#^umsatz]]', ''].join('\n'),
    );
    const { app, page, userData } = await launchApp({ args: [dateiU] });
    const einbettung = `${P0.markdownBody} .wiki-embed-md-body`;
    const liveEinbettung = `${P0.paneSource} .cm-live-embed .wiki-embed-md-body`;
    try {
      await warteGezeichnet(page, LESE(0));
      const gespeichert = await grafik(page, LESE(0));
      await warteVerzeichnisBereit(page, dateiU, 'Quelle');

      const geaendert = QUELLE.replace('| Januar  | 100 |', '| Januar  | 5000 |');
      await schreibeVonAussen(dateiQ, geaendert, async () => {
        await expect.poll(async () => (await grafik(page, LESE(0))).texte).toContain('5000');
        await expect(page.locator(einbettung).first()).toContainText('5000');
      });

      await page.locator(SEL.viewBtn('live')).click();
      await warteGezeichnet(page, LIVE(0));
      await expect(page.locator(liveEinbettung).first()).toContainText('5000', {
        timeout: 15000,
      });
      await schreibeVonAussen(dateiQ, QUELLE, async () => {
        await expect.poll(async () => (await grafik(page, LIVE(0))).text).toBe(gespeichert.text);
        await expect(page.locator(liveEinbettung).first()).not.toContainText('5000');
      });
      // Das Dokument mit dem Diagramm wurde dafür nicht neu geöffnet.
      await expect(page.locator(P0.tabs)).toHaveCount(1);
      await expect(page.locator(P0.dirtyTab)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DF-05: Hinweis statt Grafik, wenn Dokument oder Tabelle fehlt (F-332)', () => {
  test('fehlendes Dokument, fehlende Tabelle, verknüpfter Bereich, Name nur im Code-Block', async () => {
    const dir = makeDir();
    const dateiQ = schreibe(dir, 'Quelle.md', QUELLE);
    schreibe(
      dir,
      'Code.md',
      ['# Code', '', '```text', 'Beispiel ^umsatz', '```', '', 'Keine Tabelle.', ''].join('\n'),
    );
    // Ein Ziel, das nur über die Namens-Suche erreichbar ist (Unterordner).
    schreibe(dir, 'daten/Tief.md', ['# Tief', '', TABELLE, ''].join('\n'));
    const dateiU = schreibe(
      dir,
      'Übersicht.md',
      [
        '# Übersicht',
        '',
        BALKEN('[[Fehlt#^umsatz]]'),
        '',
        BALKEN('[[Quelle#^anders]]'),
        '',
        BALKEN('[[@zt:Quelle#^umsatz]]'),
        '',
        BALKEN('[[Code#^umsatz]]'),
        '',
        BALKEN('[[Tief#^umsatz]]'),
        '',
      ].join('\n'),
    );
    const vorherQ = fs.statSync(dateiQ).mtimeMs;
    const { app, page, userData } = await launchApp({ args: [dateiU] });
    const erwartet = [
      ['document-missing', 'Fehlt'],
      ['table-missing', 'anders'],
      ['document-missing', '@zt:Quelle'],
      ['table-missing', 'umsatz'],
    ];
    try {
      // Das Ziel im Unterordner wird gezeichnet, sobald das Verzeichnis bereit
      // ist, ohne Neu-Öffnen (Ausführungs-Entscheidung 6).
      await expect
        .poll(async () => (await grafik(page, LESE(4))).zustand, { timeout: 15000 })
        .toBe('drawn');
      for (const [nr, [kennung, name]] of erwartet.entries()) {
        const g = await grafik(page, LESE(nr));
        expect(g.zustand, `Diagramm ${nr}`).toBe('undrawable');
        expect(g.grundKennung, `Diagramm ${nr}`).toBe(kennung);
        expect(g.grund, `Diagramm ${nr}`).toContain(name);
        expect(g.text).toBeNull();
      }
      // 4T-002023 (Wortlaut): Fehlt die Tabelle im anderen Dokument, nennt der
      // Satz dieses Dokument statt «in diesem Dokument».
      expect((await grafik(page, LESE(1))).grund).toBe(
        'Eine Tabelle mit dem Namen «anders» kommt im Dokument «Quelle» nicht vor.',
      );
      expect((await grafik(page, LESE(3))).grund).toBe(
        'Eine Tabelle mit dem Namen «umsatz» kommt im Dokument «Code» nicht vor.',
      );
      // Dieselben Gründe im Live-Modus.
      await page.locator(SEL.viewBtn('live')).click();
      await warteGezeichnet(page, LIVE(4));
      for (const [nr, [kennung]] of erwartet.entries()) {
        await expect.poll(async () => (await grafik(page, LIVE(nr))).grundKennung).toBe(kennung);
      }
      expect(fs.statSync(dateiQ).mtimeMs).toBe(vorherQ);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// Kurz: Der Text ist niedriger als der Sichtbereich — genau dort bleibt eine
// nicht gemeldete Höhen-Änderung unbemerkt (live-widget-hoehe.js).
const KURZ = ['# Übersicht', '', BALKEN(FREMD), '', 'Zeile unter dem Diagramm.', ''].join('\n');

// Lage der Zeile unter dem Diagramm gegen ihre Zeilennummer, dazu die Höhe des
// Diagramm-Widgets. Zeile 11: Überschrift, Leerzeile, sieben Zeilen des
// Diagramm-Blocks, Leerzeile. Die Nummer steht dort, wo der Editor die Zeile
// vermutet; liegt sie neben der Zeile, hat er eine Höhen-Änderung verpasst.
function lage(page) {
  return page.evaluate((P) => {
    let zeile = null;
    for (const l of document.querySelectorAll(`${P} .cm-line`)) {
      if (l.textContent.includes('Zeile unter dem Diagramm.')) zeile = l;
    }
    let nummer = null;
    for (const g of document.querySelectorAll(`${P} .cm-lineNumbers .cm-gutterElement`)) {
      if (g.textContent.trim() === '11') nummer = g;
    }
    const widget = document.querySelector(`${P} .cm-live-block .perspective-chart`);
    return {
      abstand:
        zeile && nummer
          ? Math.abs(nummer.getBoundingClientRect().top - zeile.getBoundingClientRect().top)
          : null,
      hoehe: widget ? widget.closest('.cm-live-block').getBoundingClientRect().height : null,
    };
  }, P0.paneSource);
}

async function zeilennummernAn(page) {
  if ((await page.locator(`${P0.paneSource} .cm-lineNumbers`).count()) === 0) {
    await page.locator('#btn-numbers').click();
  }
  await expect(page.locator(`${P0.paneSource} .cm-lineNumbers`)).toHaveCount(1);
}

test.describe('DF-06: Live-Modus meldet die Höhe nach dem Nachladen (F-332)', () => {
  test('nach verzögertem Lesen liegt die Zeilennummer an ihrer Zeile', async () => {
    const dir = makeDir();
    const dateiQ = schreibe(dir, 'Quelle.md', QUELLE);
    const dateiU = schreibe(dir, 'Übersicht.md', KURZ);
    const { app, page, userData } = await launchApp();
    try {
      // Der Lese-Kanal antwortet erst nach 1,5 s, wie bei einem großen oder
      // langsam erreichbaren Dokument. Das Widget hängt damit sicher niedrig
      // im Editor, bevor die Grafik es wachsen lässt (Muster EB-08).
      await hauptSenden(
        app,
        async ({ ipcMain }, daten) => {
          ipcMain.removeHandler('chart:readTableDocument');
          ipcMain.handle('chart:readTableDocument', async () => {
            await new Promise((r) => setTimeout(r, 1500));
            return { ok: true, path: daten.pfad, content: daten.text, quelle: 'platte' };
          });
        },
        { pfad: dateiQ, text: QUELLE },
      );
      await page.waitForFunction(() => document.body.dataset.rendererReady === '1', undefined, {
        timeout: 20000,
      });
      await hauptSenden(
        app,
        ({ BrowserWindow }, f) => {
          BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [f]);
        },
        dateiU,
      );
      await expect(page.locator(P0.tabs)).toHaveCount(1);
      await page.locator(SEL.viewBtn('live')).click();
      await zeilennummernAn(page);
      await expect(
        page.locator(`${LIVE(0).split(' >> ')[0]}[data-chart-state="pending"]`),
      ).toHaveCount(1);
      await warteGezeichnet(page, LIVE(0));
      expect((await lage(page)).hoehe).toBeGreaterThan(100);
      await expect.poll(async () => (await lage(page)).abstand).toBeLessThan(1.5);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  test('beim Auffrischen nach einer Änderung in der Quelle springt die Höhe nicht', async () => {
    const dir = makeDir();
    const dateiQ = schreibe(dir, 'Quelle.md', QUELLE);
    const dateiU = schreibe(dir, 'Übersicht.md', KURZ);
    const { app, page, userData } = await launchApp({ args: [dateiU, dateiQ] });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);
      await page.locator(P0.tabs, { hasText: 'Quelle' }).first().click();
      await page.keyboard.press('Control+Alt+ArrowRight');
      await expect(page.locator(P1.tabs)).toHaveCount(1);
      await page.locator(P0.tabs).first().click();
      await page.locator(SEL.viewBtn('live')).click();
      await zeilennummernAn(page);
      await warteGezeichnet(page, LIVE(0));
      await expect.poll(async () => (await lage(page)).abstand).toBeLessThan(1.5);
      const vorher = await lage(page);
      expect(vorher.hoehe).toBeGreaterThan(100);

      // Beim Auffrischen nach einer Änderung in der Quelle bleibt das Widget
      // stehen: Jede Probe je Bild hat mindestens die Höhe von vorher. Die
      // Reihe läuft, bis die Grafik gewechselt hat, und noch 30 Bilder danach;
      // ohne Wechsel wäre die Messung leer und der Fall rot.
      //
      // Der Lese-Kanal antwortet dafür erst nach 0,8 s: Eine schnelle Antwort
      // kommt vor dem nächsten Bild und verdeckte, was der neu gebaute Widget
      // bis dahin zeigt. Er liefert den Stand, den der Prüffall vorgibt; das
      // Tippen in der Quelle ist allein der Anstoß des Auffrischens.
      await hauptSenden(
        app,
        async ({ ipcMain }, daten) => {
          globalThis.__dfStand = daten.text;
          ipcMain.removeHandler('chart:readTableDocument');
          ipcMain.handle('chart:readTableDocument', async () => {
            await new Promise((r) => setTimeout(r, 800));
            return { ok: true, path: daten.pfad, content: globalThis.__dfStand, quelle: 'puffer' };
          });
        },
        { pfad: dateiQ, text: QUELLE.replace('| Januar  | 100 |', '| Januar  | 2500 |') },
      );
      await page.locator(P1.tabs).first().click();
      await bearbeiteQuelltext(page, P1);
      const proben = page.evaluate(
        (P) =>
          new Promise((fertig) => {
            const grafikText = () => {
              const svg = document.querySelector(`${P} .cm-live-block .perspective-chart svg`);
              return svg ? svg.outerHTML.replace(/ch-[a-z]\d*-\d+-/g, 'ID-') : '';
            };
            const anfang = grafikText();
            const hoehen = [];
            const start = performance.now();
            let danach = -1;
            const bild = () => {
              const w = document.querySelector(`${P} .cm-live-block .perspective-chart`);
              hoehen.push(w ? w.closest('.cm-live-block').getBoundingClientRect().height : 0);
              if (danach < 0 && grafikText() !== anfang) danach = 0;
              if (danach >= 0) danach += 1;
              if (danach > 30 || performance.now() - start > 10000) {
                fertig({ hoehen, gewechselt: danach > 0 });
              } else requestAnimationFrame(bild);
            };
            requestAnimationFrame(bild);
          }),
        P0.paneSource,
      );
      await januarEinnahmen(page, P1.editorContent, '100', '2500');
      const { hoehen, gewechselt } = await proben;
      expect(gewechselt).toBe(true);
      expect(Math.min(...hoehen)).toBeGreaterThan(vorher.hoehe - 1);
      await expect.poll(async () => (await lage(page)).abstand).toBeLessThan(1.5);
      // 4T-002026: Getippt, nicht gespeichert — beide Dateien wie zu Beginn.
      erwarteDateiUnveraendert(dateiQ, QUELLE);
      erwarteDateiUnveraendert(dateiU, KURZ);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DF-07: nicht aktiver Reiter im Live-Modus zeigt beim Zurückkehren den neuen Stand (F-332)', () => {
  test('Übersicht liegt hinter einem anderen Reiter, während die Quelle geändert wird', async () => {
    const dir = makeDir();
    const dateiQ = schreibe(dir, 'Quelle.md', QUELLE);
    const dateiU = schreibe(dir, 'Übersicht.md', ['# Übersicht', '', BALKEN(FREMD), ''].join('\n'));
    const dateiN = schreibe(dir, 'Notiz.md', '# Notiz\n\nNichts weiter.\n');
    const { app, page, userData } = await launchApp({ args: [dateiU, dateiN, dateiQ] });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(3);
      await page.locator(P0.tabs, { hasText: 'Quelle' }).first().click();
      await page.keyboard.press('Control+Alt+ArrowRight');
      await expect(page.locator(P1.tabs)).toHaveCount(1);
      await page.locator(P0.tabs, { hasText: 'Übersicht' }).first().click();
      await page.locator(SEL.viewBtn('live')).click();
      await warteGezeichnet(page, LIVE(0));
      expect((await grafik(page, LIVE(0))).texte).not.toContain('5000');

      // Die Übersicht tritt hinter einen anderen Reiter derselben Spalte.
      await page.locator(P0.tabs, { hasText: 'Notiz' }).first().click();
      await expect(page.locator(`${P0.editorContent} .perspective-chart`)).toHaveCount(0);

      // Rechts ändern, nicht speichern; der Lese-Kanal kennt danach den neuen
      // Stand (Anker, damit die Rückkehr nicht vor der Meldung liegt).
      await page.locator(P1.tabs).first().click();
      await bearbeiteQuelltext(page, P1);
      await januarEinnahmen(page, P1.editorContent, '100', '5000');
      await expect
        .poll(
          async () =>
            (await page.evaluate((f) => window.api.readChartTableDocument(f, 'Quelle'), dateiU))
              .content,
        )
        .toContain('| 5000 |');

      // Zurück zur Übersicht: Das Diagramm zeigt den neuen Stand.
      await page.locator(P0.tabs, { hasText: 'Übersicht' }).first().click();
      await expect.poll(async () => (await grafik(page, LIVE(0))).texte).toContain('5000');
      // 4T-002026: Getippt, nicht gespeichert.
      erwarteDateiUnveraendert(dateiQ, QUELLE);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DF-08: zweites Fenster ohne Speichern geschlossen, erstes zeigt wieder die Datei (F-332)', () => {
  test('Diagramm und Einbettung im ersten Fenster folgen dem Verwerfen beim Schließen des Fensters', async () => {
    const dir = makeDir();
    const dateiQ = schreibe(dir, 'Quelle.md', QUELLE);
    const dateiU = schreibe(
      dir,
      'Übersicht.md',
      ['# Übersicht', '', BALKEN(FREMD), '', '![[Quelle#^umsatz]]', ''].join('\n'),
    );
    const { app, page, userData } = await launchApp({ args: [dateiU] });
    const einbettung = `${P0.markdownBody} .wiki-embed-md-body`;
    try {
      await warteGezeichnet(page, LESE(0));
      const gespeichert = await grafik(page, LESE(0));
      const page2 = await zweitesFensterMitDatei(app, page, dateiQ);
      await bearbeiteQuelltext(page2, P0);
      await januarEinnahmen(page2, P0.editorContent, '100', '5000');
      await expect.poll(async () => (await grafik(page, LESE(0))).texte).toContain('5000');
      await expect(page.locator(einbettung).first()).toContainText('5000', { timeout: 15000 });

      // Das zweite Fenster schließen und im Rückfrage-Dialog «Nicht speichern»
      // wählen (nativ, deshalb gestellt).
      await hauptSenden(app, ({ dialog }) => {
        dialog.showMessageBox = async () => ({ response: 1 });
      });
      await hauptSenden(app, ({ BrowserWindow }) => {
        const wins = BrowserWindow.getAllWindows();
        wins.sort((a, b) => a.webContents.id - b.webContents.id);
        wins[wins.length - 1].close();
      });
      await expect.poll(() => app.windows().length, { timeout: 15000 }).toBe(1);

      await expect
        .poll(async () => (await grafik(page, LESE(0))).text, { timeout: 15000 })
        .toBe(gespeichert.text);
      await expect(page.locator(einbettung).first()).not.toContainText('5000', {
        timeout: 15000,
      });
      expect(fs.readFileSync(dateiQ, 'utf8')).toBe(QUELLE);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DF-09: Diagramm in einer eingebetteten Notiz folgt im Live-Modus (F-332)', () => {
  test('die Notiz trägt ein Diagramm auf die Quelle; die Quelle wird ungespeichert geändert', async () => {
    const dir = makeDir();
    const dateiQ = schreibe(dir, 'Quelle.md', QUELLE);
    schreibe(dir, 'Notiz.md', ['# Notiz', '', BALKEN(FREMD), ''].join('\n'));
    const dateiU = schreibe(dir, 'Übersicht.md', '# Übersicht\n\n![[Notiz]]\n');
    const { app, page, userData } = await launchApp({ args: [dateiU, dateiQ] });
    const imEmbed = `${P0.paneSource} .cm-live-embed .perspective-chart`;
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);
      await page.locator(P0.tabs, { hasText: 'Quelle' }).first().click();
      await page.keyboard.press('Control+Alt+ArrowRight');
      await expect(page.locator(P1.tabs)).toHaveCount(1);
      await page.locator(P0.tabs).first().click();
      await page.locator(SEL.viewBtn('live')).click();
      await warteGezeichnet(page, imEmbed);
      expect((await grafik(page, imEmbed)).texte).not.toContain('5000');

      await page.locator(P1.tabs).first().click();
      await bearbeiteQuelltext(page, P1);
      await januarEinnahmen(page, P1.editorContent, '100', '5000');
      await expect.poll(async () => (await grafik(page, imEmbed)).texte).toContain('5000');
      // 4T-002026: Getippt, nicht gespeichert.
      erwarteDateiUnveraendert(dateiQ, QUELLE);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-002072 (Epic 3E-000192): Die Tabelle in der Quelle trägt ihren Namen in
// der Kopf-Angabe `table: Umsatz` und keine Zeile darunter; die Übersicht
// nennt sie als `[[Quelle#^Umsatz]]`, das Diagramm wie die Einbettung.
const QUELLE_KOPF = [
  '# Quelle',
  '',
  TABELLE.replace(
    '```perspective-datatable\n',
    '```perspective-datatable\ntable: Umsatz\n',
  ).replace('\n^umsatz', ''),
  '',
].join('\n');
const KOPF = '[[Quelle#^Umsatz]]';

test.describe('DF-10: Diagramm und Einbettung auf den Kopf-Namen einer Tabelle im anderen Dokument (F-332)', () => {
  test('ungespeicherter Stand im selben Fenster', async () => {
    const dir = makeDir();
    const dateiQ = schreibe(dir, 'Quelle.md', QUELLE_KOPF);
    const dateiU = schreibe(dir, 'Übersicht.md', ['# Übersicht', '', BALKEN(KOPF), ''].join('\n'));
    const { app, page, userData } = await launchApp({ args: [dateiU, dateiQ] });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);
      await page.locator(P0.tabs, { hasText: 'Quelle' }).first().click();
      await page.keyboard.press('Control+Alt+ArrowRight');
      await expect(page.locator(P1.tabs)).toHaveCount(1);
      await warteGezeichnet(page, LESE(0));
      const g = await grafik(page, LESE(0));
      expect(g.ziel).toBe(dateiQ);
      expect(g.beschreibung).toBe('Balkendiagramm mit 2 Datenreihen und 3 Rubriken');
      expect(g.texte).not.toContain('5000');

      await bearbeiteQuelltext(page, P1);
      await januarEinnahmen(page, P1.editorContent, '100', '5000');
      await expect(page.locator(P1.dirtyTab).first()).toBeVisible();
      await expect.poll(async () => (await grafik(page, LESE(0))).texte).toContain('5000');
      expect(fs.readFileSync(dateiQ, 'utf8')).toBe(QUELLE_KOPF);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  test('Änderung in einem zweiten Fenster, die Einbettung zeigt das Gitter und folgt', async () => {
    const dir = makeDir();
    const dateiQ = schreibe(dir, 'Quelle.md', QUELLE_KOPF);
    const dateiU = schreibe(
      dir,
      'Übersicht.md',
      ['# Übersicht', '', BALKEN(KOPF), '', '![[Quelle#^Umsatz]]', ''].join('\n'),
    );
    const { app, page, userData } = await launchApp({ args: [dateiU] });
    const einbettung = `${P0.markdownBody} .wiki-embed-md-body`;
    try {
      await warteGezeichnet(page, LESE(0));
      await expect(page.locator(`${einbettung} .pdt-grid`).first()).toBeVisible({
        timeout: 15000,
      });
      await expect(page.locator(einbettung).first()).toContainText('100');
      await expect(page.locator(einbettung).first()).not.toContainText('table: Umsatz');
      // 4T-002072, Nachbesserung F2: Die Kopie trägt den Namen nicht als id.
      await expect(page.locator(`${einbettung} [id="Umsatz"]`)).toHaveCount(0);

      const page2 = await zweitesFensterMitDatei(app, page, dateiQ);
      await bearbeiteQuelltext(page2, P0);
      await januarEinnahmen(page2, P0.editorContent, '100', '5000');
      await expect(page2.locator(P0.dirtyTab).first()).toBeVisible();
      await expect.poll(async () => (await grafik(page, LESE(0))).texte).toContain('5000');
      await expect(page.locator(einbettung).first()).toContainText('5000', { timeout: 15000 });
      expect(fs.readFileSync(dateiQ, 'utf8')).toBe(QUELLE_KOPF);
      await expect(page.locator(P0.dirtyTab)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
