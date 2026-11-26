// 4T-002823 (Epic 3E-000445, Story 4S-001197, AK2): Lücken der Abnahme von
// `db-query … into` — die Ausgaben einer geschriebenen Tabelle an der
// gestarteten Anwendung.
//
// **Warum es diesen Fall gibt, obwohl die Unit-Fälle grün sind.** Die Unit-
// Fälle in `test/unit/result-set-markdown.test.js` zeichnen die geschriebene
// Tabelle mit der Pipeline der Lese-Ansicht und prüfen das portable Markdown.
// Live-Ansicht, HTML-Export, PDF und Druck gibt es nur in der gestarteten
// Anwendung; die Abnahme des Vorhabens 3E-000431 hat sie für Werte mit
// senkrechtem Strich, Zeilenumbruch und HTML nicht geprüft.
//
// WF-DBQ-AUS-01: Eine Tabelle «Library» trägt drei Datensätze, deren Wert je
//   eine der drei Zeichenarten enthält, der Zeilenumbruch als Fortsetzungs-
//   zeile des Datensatz-Formats. Ein von Hand gestarteter Workflow schreibt
//   mit `db-query … into … under` dieselbe Abfrage in eine gewöhnliche Notiz
//   und in eine Notiz mit der Portable-Marke; nur in der zweiten zeichnet die
//   Lese-Ansicht Roh-HTML, deshalb laufen HTML-Export, PDF und Druck an ihr.
//   Erwartet ist in jeder Ausgabe genau eine Tabelle mit drei Zeilen zu je
//   zwei Zellen, der Wert als Text ohne Element (der Zeilenumbruch als
//   Leerzeichen) und die Überschrift «Danach» unter der Tabelle.
//
// **Wie PDF und Druck gemessen werden.** Der Text eines PDF ist ohne eigenen
// Leser nicht prüfbar, und der Druck geht an den Systemdialog. Beide Wege
// zeichnen aber unmittelbar vor der Übergabe das Dokument im Druck-Zustand;
// eine Hülle um `printToPDF` und ein Ersatz für `print` lesen in diesem
// Augenblick die Tabellen der aktiven Spalte. Das PDF selbst wird danach
// regulär geschrieben und nur auf seine Kennung geprüft.
//
// **Sprachfrei geprüft:** an Datensatz-Namen, Werten und Element-Namen.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { warteAufText } = require('../helpers/dateien');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const mddStore = require('../../../src/main/documents/mdd-store.js');

const PANE = '.pane-group[data-pane="0"]';
const MODAL = '#command-palette-modal';
const FILTER = '#command-palette-filter';
const ITEM = '.command-palette-item';
const PORTABLE_MARKE = '<!-- perspective-portable -->';

// Datensatz-Name, gespeicherter Wert, erwarteter Zell-Text.
const WERTE = [
  ['Html', '<b>fett</b> <img src=x onerror=y>', '<b>fett</b> <img src=x onerror=y>'],
  ['Strich', 'a | b', 'a | b'],
  ['Umbruch', 'Zeile 1\nZeile 2', 'Zeile 1 Zeile 2'],
];

const LIBRARY = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: name',
  '    - name: wert',
  '  display: name',
  `  lastId: ${WERTE.length}`,
  '---',
  '',
  '```perspective-records',
  ...WERTE.flatMap(([name, wert], i) => {
    const [erste, ...weitere] = wert.split('\n');
    return [`|- id="r-0000${i + 1}"`, `| ${name}`, `| ${erste}`, ...weitere];
  }),
  '```',
  '',
].join('\n');

const ABFRAGE = [
  '---',
  'db-query:',
  '---',
  '',
  '```perspective-query',
  'TABLE RECORDS wert',
  'FROM "Library"',
  '```',
  '',
].join('\n');

const ZIEL_RUMPF = '# Bericht\n\n## Werte\n\n## Danach\nbleibt\n';

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-dbq-ausgaben-'));
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { workflows: { folder: 'Workflows' } } }, null, 2),
    'utf8',
  );
  fs.mkdirSync(path.join(wurzel, 'Workflows'));
  fs.mkdirSync(path.join(wurzel, 'Daten'));
  fs.writeFileSync(path.join(wurzel, 'Daten', 'Library.md'), LIBRARY, 'utf8');
  fs.writeFileSync(path.join(wurzel, 'Werte.md'), ABFRAGE, 'utf8');
  const gewoehnlich = path.join(wurzel, 'Bericht.md');
  fs.writeFileSync(gewoehnlich, ZIEL_RUMPF, 'utf8');
  const portabel = path.join(wurzel, 'Portabel.md');
  fs.writeFileSync(portabel, `${PORTABLE_MARKE}\n\n${ZIEL_RUMPF}`, 'utf8');
  const probe = path.join(wurzel, 'Workflows', 'Ausgaben-Probe.md');
  fs.writeFileSync(
    probe,
    [
      '---',
      'workflow: true',
      'name: Ausgaben-Probe',
      '---',
      '',
      '```workflow',
      'db-query "Werte.md" into "Bericht.md" under "Werte"',
      'db-query "Werte.md" into "Portabel.md" under "Werte"',
      '```',
      '',
    ].join('\n'),
    'utf8',
  );
  return {
    wurzel,
    gewoehnlich,
    portabel,
    probe,
    stand: path.join(wurzel, 'Workflows', 'Ausgaben-Probe.mdd'),
  };
}

function laufStand(begleitdatei) {
  try {
    const parsed = mddStore.parseContainer(fs.readFileSync(begleitdatei, 'utf8'));
    return parsed.ok ? mddStore.getWorkflowRun(parsed.container) : null;
  } catch {
    return null;
  }
}

async function bindeBereich(page, wurzel) {
  await expect
    .poll(async () => {
      const ergebnis = await page.evaluate((p) => window.api.openAreaPath(p), wurzel);
      return !!(ergebnis && ergebnis.ok !== false);
    })
    .toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
}

// Läuft im Renderer: alle Tabellen unter dem Selektor, je Zeile des Rumpfs die
// Zellen mit Text und den Namen der Elemente darin, dazu je Tabelle der Text
// der nächsten Überschrift dahinter.
function leseTabellen(selektor) {
  return [...document.querySelectorAll(selektor)].map((tabelle) => {
    let danach = tabelle.nextElementSibling;
    while (danach && !/^H[1-6]$/.test(danach.tagName)) danach = danach.nextElementSibling;
    return {
      zeilen: [...tabelle.querySelectorAll('tbody tr')].map((tr) =>
        [...tr.children].map((td) => ({
          text: td.textContent.replace(/\s+/g, ' ').trim(),
          elemente: [...td.querySelectorAll('*')].map((e) => e.tagName.toLowerCase()),
        })),
      ),
      danach: danach ? danach.textContent.trim() : null,
    };
  });
}

const LESE_SKRIPT = (selektor) => `(${leseTabellen.toString()})(${JSON.stringify(selektor)})`;

// Der Druck zeigt die Lese-Ansicht der aktiven Spalte.
const DRUCK_SELEKTOR = '.pane-group.active-pane .pane-rendered .markdown-body table';

// Eine Ausgabe zeigt genau eine Tabelle: drei Zeilen zu je zwei Zellen, den
// Datensatz als Verweis und den Wert als Text ohne Element.
function erwarteTabelle(tabellen, ausgabe, { danach = true } = {}) {
  expect(tabellen, ausgabe).toHaveLength(1);
  const [{ zeilen, danach: ueberschrift }] = tabellen;
  expect(
    zeilen.map((z) => z.length),
    ausgabe,
  ).toEqual(WERTE.map(() => 2));
  const gelesen = zeilen
    .map(([treffer, wert]) => [treffer.text, wert.text, wert.elemente])
    .sort((a, b) => a[0].localeCompare(b[0]));
  expect(gelesen, ausgabe).toEqual(WERTE.map(([name, , text]) => [name, text, []]));
  if (danach) expect(ueberschrift, ausgabe).toBe('Danach');
}

async function pruefeAnsichten(app, page, datei, name) {
  await oeffneDokumentImFenster(app, page, datei);
  await page.locator(SEL.viewBtn('rendered')).click();
  await expect(page.locator(`${SEL.markdownBody0} table a.wikilink`)).toHaveCount(WERTE.length);
  erwarteTabelle(
    await page.evaluate(leseTabellen, `${SEL.markdownBody0} table`),
    `${name}, Lese-Ansicht`,
  );
  await page.locator(SEL.viewBtn('live')).click();
  await expect(page.locator(`${PANE} .pane-source table a.wikilink`)).toHaveCount(WERTE.length);
  // Die Live-Ansicht zeichnet die Tabelle als eigenes Element; die Zeilen
  // darum herum stehen im Editor, eine Überschrift als Nachbar gibt es nicht.
  erwarteTabelle(
    await page.evaluate(leseTabellen, `${PANE} .pane-source table`),
    `${name}, Live-Ansicht`,
    { danach: false },
  );
}

// --- HTML-Export (Muster html-export.spec.js) ---------------------------------

async function stubSpeichernDialog(app, ergebnis) {
  await hauptSenden(
    app,
    ({ dialog }, payload) => {
      globalThis.__dbqDialogAufrufe = 0;
      dialog.showSaveDialog = async () => {
        globalThis.__dbqDialogAufrufe += 1;
        return payload;
      };
    },
    ergebnis,
  );
}

function dialogAufrufe(app) {
  return hauptLesen(app, () => globalThis.__dbqDialogAufrufe || 0);
}

async function exportiereHtmlUeberPalette(page, app) {
  const vorher = await dialogAufrufe(app);
  await expect
    .poll(async () => {
      if (await page.locator(MODAL).isVisible()) return true;
      await hauptSenden(app, ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:openCommandPalette');
      });
      return page.locator(MODAL).isVisible();
    })
    .toBe(true);
  await page.locator(FILTER).fill('Als HTML exportieren');
  const eintrag = page.locator(ITEM).filter({
    has: page.locator('.command-palette-name', { hasText: /^Als HTML exportieren…$/ }),
  });
  await expect(eintrag).toHaveCount(1);
  await expect(eintrag).toHaveClass(/\bactive\b/);
  await page.keyboard.press('Enter');
  await expect(page.locator(MODAL)).toBeHidden();
  await expect.poll(() => dialogAufrufe(app), { timeout: 30000 }).toBe(vorher + 1);
}

function entitaetenAufloesen(text) {
  return text
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// Die Tabellen einer exportierten Datei in derselben Gestalt wie `leseTabellen`.
function tabellenAusHtml(html) {
  const koerper = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'));
  return [...koerper.matchAll(/<table[\s>][\s\S]*?<\/table>([\s\S]*?)(?=<table[\s>]|$)/g)].map(
    (m) => {
      const rumpf = m[0].slice(m[0].indexOf('<tbody'), m[0].indexOf('</tbody>'));
      const ueberschrift = m[1].match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/);
      return {
        zeilen: [...rumpf.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((z) =>
          [...z[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((zelle) => ({
            text: entitaetenAufloesen(zelle[1].replace(/<[^>]*>/g, ''))
              .replace(/\s+/g, ' ')
              .trim(),
            elemente: [...zelle[1].matchAll(/<([a-z][a-z0-9]*)[\s>/]/gi)].map((e) =>
              e[1].toLowerCase(),
            ),
          })),
        ),
        danach: ueberschrift
          ? entitaetenAufloesen(ueberschrift[1].replace(/<[^>]*>/g, '')).trim()
          : null,
      };
    },
  );
}

// --- PDF und Druck --------------------------------------------------------------

// Hülle um `printToPDF`: liest im Druck-Zustand die Tabellen, dann das Original.
async function umhuellePdf(app) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, skript) => {
      globalThis.__dbqPdfTabellen = null;
      for (const win of BrowserWindow.getAllWindows()) {
        const wc = win.webContents;
        const original = wc.printToPDF.bind(wc);
        wc.printToPDF = async (optionen) => {
          globalThis.__dbqPdfTabellen = await wc.executeJavaScript(skript);
          return original(optionen);
        };
      }
    },
    LESE_SKRIPT(DRUCK_SELEKTOR),
  );
}

// Ersatz für `print`: liest im Druck-Zustand die Tabellen und meldet Erfolg.
async function ersetzeDruck(app) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, skript) => {
      globalThis.__dbqDruckTabellen = null;
      globalThis.__dbqDruckAufrufe = 0;
      for (const win of BrowserWindow.getAllWindows()) {
        const wc = win.webContents;
        wc.print = (_optionen, callback) => {
          globalThis.__dbqDruckAufrufe += 1;
          wc.executeJavaScript(skript).then(
            (tabellen) => {
              globalThis.__dbqDruckTabellen = tabellen;
              callback(true, '');
            },
            () => callback(false, 'lesen'),
          );
        };
      }
    },
    LESE_SKRIPT(DRUCK_SELEKTOR),
  );
}

test.describe('WF-DBQ-AUS: Ausgaben einer mit db-query geschriebenen Tabelle (4T-002823)', () => {
  test('WF-DBQ-AUS-01: Strich, Zeilenumbruch und HTML in Lese- und Live-Ansicht, HTML-Export, PDF und Druck', async () => {
    test.setTimeout(180000);
    const b = baueBereich();
    const exportOrdner = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-dbq-export-'));
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, b.wurzel);
      await oeffneDokumentImFenster(app, page, b.probe);
      await page.locator(SEL.viewBtn('live')).click();
      const kopf = page.locator(`${PANE} .pane-source .cm-wf-kopf`);
      await expect(kopf).toHaveCount(1);
      await expect(kopf.locator('.cm-wf-pruefung-ok')).toHaveCount(1);
      await kopf.locator('.cm-wf-starten').click();
      await expect.poll(() => (laufStand(b.stand) || {}).runs || 0, { timeout: 30000 }).toBe(1);
      expect(laufStand(b.stand).lastRun).toMatchObject({ status: 'ok' });

      // In beiden Notizen genau eine Tabelle unter «Werte», der Rest bleibt.
      for (const datei of [b.gewoehnlich, b.portabel]) {
        const text = fs.readFileSync(datei, 'utf8');
        expect(text.split(/\r?\n/).filter((z) => z === '| --- | --- |')).toHaveLength(1);
        expect(text).toMatch(/\|\r?\n\r?\n## Danach\r?\nbleibt/);
      }

      await pruefeAnsichten(app, page, b.gewoehnlich, 'gewöhnliche Notiz');
      await pruefeAnsichten(app, page, b.portabel, 'Notiz mit Portable-Marke');

      // Die Ausgaben gehen von der Lese-Ansicht der Notiz mit Portable-Marke aus.
      await page.locator(SEL.viewBtn('rendered')).click();
      await expect(page.locator(`${SEL.markdownBody0} table`)).toHaveCount(1);

      const htmlZiel = path.join(exportOrdner, 'portabel.html');
      await stubSpeichernDialog(app, { canceled: false, filePath: htmlZiel });
      await exportiereHtmlUeberPalette(page, app);
      const html = await warteAufText(htmlZiel, '</html>', { timeout: 30000 });
      erwarteTabelle(tabellenAusHtml(html), 'HTML-Export');

      const pdfZiel = path.join(exportOrdner, 'portabel.pdf');
      await stubSpeichernDialog(app, { canceled: false, filePath: pdfZiel });
      await umhuellePdf(app);
      // Strg+Umschalt+P genau so oft, bis der Export-Weg läuft (Muster
      // pdf-export.spec.js): jeder weitere Druck startete einen neuen Export.
      await expect
        .poll(
          async () => {
            await page.keyboard.press('Control+Shift+P');
            return dialogAufrufe(app);
          },
          { timeout: 30000 },
        )
        .toBeGreaterThan(0);
      await expect
        .poll(() => hauptLesen(app, () => globalThis.__dbqPdfTabellen), { timeout: 30000 })
        .not.toBeNull();
      erwarteTabelle(await hauptLesen(app, () => globalThis.__dbqPdfTabellen), 'PDF');
      await expect
        .poll(
          () => {
            try {
              return fs.readFileSync(pdfZiel).subarray(0, 5).toString('latin1');
            } catch {
              return '';
            }
          },
          { timeout: 30000 },
        )
        .toBe('%PDF-');
      await expect(page.locator('body')).not.toHaveClass(/\bprinting\b/);

      await ersetzeDruck(app);
      // Strg+P genau so oft, bis der Druck-Weg läuft (Muster drucken.spec.js).
      await expect
        .poll(
          async () => {
            await page.keyboard.press('Control+P');
            return hauptLesen(app, () => globalThis.__dbqDruckAufrufe || 0);
          },
          { timeout: 30000 },
        )
        .toBeGreaterThan(0);
      await expect
        .poll(() => hauptLesen(app, () => globalThis.__dbqDruckTabellen), { timeout: 30000 })
        .not.toBeNull();
      erwarteTabelle(await hauptLesen(app, () => globalThis.__dbqDruckTabellen), 'Druck');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(b.wurzel);
      removeDir(exportOrdner);
    }
  });
});
