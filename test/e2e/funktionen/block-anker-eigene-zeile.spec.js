// 4T-002048 (Epic 3E-000192, Story 4S-000205): Ablauf-Prüfdatei der Block-Anker
// in einer eigenen Zeile. Eine Zeile, die allein aus `^name` besteht, erscheint
// in Lese-Ansicht, gerenderter Hälfte, Druck, PDF und Einbettung nicht als
// Text; der Anker bleibt Sprung- und Verweis-Ziel. describe-Titel tragen die
// Fall-Kennungen BZ-01 … und die Matrix-Kennung des Katalog-Eintrags
// `help.feature.blockAnchors`.
//
// **Gemessen wird am Lese-Ende** (Test-Strategie, Kapitel 5.3): am sichtbaren
// Text der gerenderten Ansicht, an den Elementen mit der Kennung, beim Druck
// und beim PDF am Zustand der Seite im Augenblick des Aufrufs (Muster
// diagramme-druck.spec.js: der Systemdialog ist nicht bedienbar), im
// Live-Modus an den Zeilen des Editors.
//
// Die Dokumente entstehen je Fall in einem eigenen Temp-Ordner; die Fälle
// schreiben nichts außer dem einen Zell-Wert in BZ-05. Der wird am Text des
// Editors gemessen, und der Fall endet an der Datei, die noch den Ausgangs-Text
// trägt (4T-002026).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { SEL } = require('../helpers/selectors');
const { mitApp, text, marke } = require('../helpers/diagramme-dialog');
const { erwarteDateiUnveraendert } = require('../helpers/dateien');
const { hauptLesen, hauptSenden } = require('../helpers/haupt-zugriff');

const Z = '```';
const BODY = SEL.markdownBody0;
const KENNUNGEN = ['umsatz', 'bild', 'fluss', 'liste', 'pipe', 'zitat', 'code'];
const SICHTBARER_ANKER = new RegExp(`\\^(${KENNUNGEN.join('|')})\\b`);

const FUELLUNG = Array.from({ length: 40 }, (_, i) => `Füll-Absatz ${i + 1}.`).join('\n\n');

const DOKUMENT = [
  '# Anker in eigener Zeile',
  '',
  'Sprung zum [[#^code|Code-Block]].',
  '',
  `${Z}perspective-datatable`,
  'columns: Monat:text, Umsatz:number',
  '| Januar  | 120 |',
  '| Februar | 99  |',
  Z,
  '^umsatz',
  '',
  `${Z}perspective-chart`,
  'table: ^umsatz',
  'type: bar',
  'labels: Monat',
  'values: Umsatz',
  Z,
  '^bild',
  '',
  `${Z}mermaid`,
  'graph TD; A-->B',
  Z,
  '^fluss',
  '',
  '- eins',
  '- zwei',
  '',
  '^liste',
  '',
  '| Spalte | Wert |',
  '|---|---|',
  '| a | 1 |',
  '^pipe',
  '',
  'Absatz nach der Tabelle.',
  '',
  '| Spalte | Wert |',
  '|---|---|',
  '| b | 2 |',
  '',
  'Absatz nach der Vergleichs-Tabelle.',
  '',
  '> Zitat',
  '> ^zitat',
  '',
  FUELLUNG,
  '',
  `${Z}js`,
  'const a = 1;',
  Z,
  '^code',
  '',
  'Zurück zur [[#^umsatz|Tabelle]].',
  '',
].join('\n');

// Sichtbarer Text und die Elemente mit Kennung der gerenderten Ansicht.
function gerendert(page) {
  return page.evaluate(
    ([sel, kennungen]) => {
      const body = document.querySelector(sel);
      const art = (id) => {
        const el = body.querySelector(`[id="${id}"]`);
        if (!el) return null;
        const klasse = ['perspective-datatable', 'perspective-chart', 'mermaid-block'].find((k) =>
          el.classList.contains(k),
        );
        return klasse || el.tagName.toLowerCase();
      };
      return {
        text: body.innerText,
        arten: Object.fromEntries(kennungen.map((k) => [k, art(k)])),
      };
    },
    [BODY, KENNUNGEN],
  );
}

const ERWARTETE_ARTEN = {
  umsatz: 'perspective-datatable',
  bild: 'perspective-chart',
  fluss: 'mermaid-block',
  liste: 'p',
  pipe: 'p',
  zitat: 'p',
  code: 'pre',
};

async function warteAufAnsicht(page) {
  await expect(
    page.locator(`${BODY} .perspective-chart[data-chart-state="drawn"] svg`),
  ).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator(`${BODY} .mermaid-block svg`)).toHaveCount(1, { timeout: 20000 });
}

test.describe('BZ-01: Lese-Ansicht und gerenderte Hälfte (help.feature.blockAnchors)', () => {
  test('keine Kennung im sichtbaren Text, die Blöcke tragen sie, die Träger haben keine Höhe (AK1, AK2)', async () => {
    await mitApp({ 'Anker.md': DOKUMENT }, async ({ page }) => {
      for (const ansicht of ['rendered', 'split']) {
        await page.locator(SEL.viewBtn(ansicht)).click();
        await warteAufAnsicht(page);
        const stand = await gerendert(page);
        expect(stand.text, ansicht).not.toMatch(SICHTBARER_ANKER);
        expect(stand.arten, ansicht).toEqual(ERWARTETE_ARTEN);
        // Die Träger unter der Liste und der Tabelle: keine Höhe, und der
        // Abstand zum nächsten Block ist derselbe wie ohne Anker-Zeile.
        const lage = await page.evaluate((sel) => {
          const body = document.querySelector(sel);
          const r = (el) => el.getBoundingClientRect();
          const tabellen = body.querySelectorAll(':scope > table');
          const abstand = (t) =>
            r(
              t.nextElementSibling.matches('p[id]')
                ? t.nextElementSibling.nextElementSibling
                : t.nextElementSibling,
            ).top - r(t).bottom;
          return {
            hoehen: ['liste', 'pipe'].map((id) => r(body.querySelector(`[id="${id}"]`)).height),
            mitAnker: abstand(tabellen[0]),
            ohneAnker: abstand(tabellen[1]),
          };
        }, BODY);
        expect(lage.hoehen, ansicht).toEqual([0, 0]);
        expect(Math.abs(lage.mitAnker - lage.ohneAnker), ansicht).toBeLessThanOrEqual(0.5);
      }
    });
  });
});

test.describe('BZ-02: Sprung über einen Verweis (help.feature.blockAnchors)', () => {
  test('der Verweis auf die Kennung unter dem Code-Block und unter der Datentabelle führt zum Block (AK2)', async () => {
    await mitApp({ 'Anker.md': DOKUMENT }, async ({ page }) => {
      await warteAufAnsicht(page);
      const imBild = (id) =>
        page.evaluate(
          ([sel, i]) => {
            const el = document.querySelector(`${sel} [id="${i}"]`);
            const r = el.getBoundingClientRect();
            return r.top >= 0 && r.top < window.innerHeight;
          },
          [BODY, id],
        );
      expect(await imBild('code')).toBe(false);
      await page.locator(`${BODY} a.wikilink[href="#code"]`).click();
      await expect.poll(() => imBild('code'), { timeout: 10000 }).toBe(true);
      expect(await imBild('umsatz')).toBe(false);
      await page.locator(`${BODY} a.wikilink[href="#umsatz"]`).click();
      await expect.poll(() => imBild('umsatz'), { timeout: 10000 }).toBe(true);
    });
  });
});

// Zustand der gerenderten Ansicht der ersten Spalte im Augenblick des Aufrufs.
const ERFASSE = `(() => {
  const body = document.querySelector('.pane-group[data-pane="0"] .pane-rendered .markdown-body');
  return {
    text: body.textContent,
    ids: Array.from(body.querySelectorAll('[id]')).map((el) => el.id),
  };
})()`;

async function druckeMitStub(app, page) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, erfasse) => {
      globalThis.__bzDruck = [];
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.print = (options, callback) => {
          win.webContents.executeJavaScript(erfasse).then(
            (stand) => {
              globalThis.__bzDruck.push(stand);
              callback(true, '');
            },
            (err) => {
              globalThis.__bzDruck.push({ fehler: String(err) });
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
    .poll(() => hauptLesen(app, () => globalThis.__bzDruck.length), { timeout: 30000 })
    .toBe(1);
  await expect(page.locator('body.printing')).toHaveCount(0);
  return hauptLesen(app, () => globalThis.__bzDruck[0]);
}

async function pdfMitErfassung(app, page, ziel) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, erfasse) => {
      globalThis.__bzPdf = [];
      for (const win of BrowserWindow.getAllWindows()) {
        const wc = win.webContents;
        if (!wc.__bzPdfOriginal) wc.__bzPdfOriginal = wc.printToPDF.bind(wc);
        wc.printToPDF = async (options) => {
          globalThis.__bzPdf.push(await wc.executeJavaScript(erfasse));
          return wc.__bzPdfOriginal(options);
        };
      }
    },
    ERFASSE,
  );
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
  expect(fs.readFileSync(ziel).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  const staende = await hauptLesen(app, () => globalThis.__bzPdf);
  expect(staende).toHaveLength(1);
  return staende[0];
}

test.describe('BZ-03: Druck und PDF (help.feature.blockAnchors)', () => {
  test('aus drei Ansichten steht beim Aufruf keine Kennung im Text, die Blöcke tragen sie (AK1)', async () => {
    await mitApp({ 'Anker.md': DOKUMENT }, async ({ app, page, dir, pfade }) => {
      await warteAufAnsicht(page);
      for (const ansicht of ['rendered', 'split', 'live']) {
        if (ansicht !== 'rendered') await page.locator(SEL.viewBtn(ansicht)).click();
        const druck = await druckeMitStub(app, page);
        expect(druck.text, ansicht).not.toMatch(SICHTBARER_ANKER);
        for (const k of KENNUNGEN) expect(druck.ids, `${ansicht}: ${k}`).toContain(k);
        const pdf = await pdfMitErfassung(app, page, path.join(dir, `${ansicht}.pdf`));
        expect(pdf.text, ansicht).not.toMatch(SICHTBARER_ANKER);
        for (const k of KENNUNGEN) expect(pdf.ids, `${ansicht}: ${k}`).toContain(k);
      }
      // Druck und PDF verändern das Dokument nicht.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      expect(fs.readFileSync(pfade[0], 'utf8')).toBe(DOKUMENT);
    });
  });
});

test.describe('BZ-04: Einbettung (help.feature.blockAnchors)', () => {
  test('ein eingebetteter Abschnitt zeigt keine Anker-Zeile, die Einbettung der Kennung zeigt den Code-Block (AK1, AK2)', async () => {
    const QUELLE = [
      '# Abschnitt',
      '',
      `${Z}js`,
      'let eingebettet = 1;',
      Z,
      '^code',
      '',
      '| A |',
      '|---|',
      '| 1 |',
      '^tab',
      '',
      '# Anderes',
      '',
      'Nicht eingebettet.',
      '',
    ].join('\n');
    const ZIEL = ['Vorher.', '', '![[Quelle#Abschnitt]]', '', '![[Quelle#^code]]', ''].join('\n');
    await mitApp({ 'Ziel.md': ZIEL, 'Quelle.md': QUELLE }, async ({ page }) => {
      const eingebettet = page.locator(`${BODY} .wiki-embed-md-body`);
      await expect(eingebettet).toHaveCount(2, { timeout: 15000 });
      await expect(eingebettet.nth(0).locator('pre')).toHaveCount(1);
      await expect(eingebettet.nth(1).locator('pre')).toContainText('let eingebettet = 1;');
      // Gemessen am eingebetteten Inhalt; die Kopfzeile der Einbettung nennt
      // ihr Ziel samt Kennung und ist nicht Gegenstand.
      const inhalte = await eingebettet.evaluateAll((els) => els.map((el) => el.innerText));
      for (const inhalt of inhalte) expect(inhalt).not.toMatch(/\^(code|tab)\b/);
      expect(inhalte.join('\n').match(/let eingebettet = 1;/g)).toHaveLength(2);
      expect(inhalte.join('\n')).not.toContain('Nicht eingebettet.');
    });
  });
});

test.describe('BZ-05: Live-Modus unter der gewöhnlichen Tabelle (help.feature.blockAnchors)', () => {
  test('Anker-Zeichen in der Zeile unter der Tabelle, keine Tabellenzeile mit Kennung, die Zell-Eingabe wirkt (AK8)', async () => {
    await mitApp({ 'Anker.md': DOKUMENT }, async ({ page, pfade }) => {
      await page.locator(SEL.viewBtn('live')).click();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.btnEdit)).toHaveClass(/active/);
      const tabelle = page
        .locator(`${SEL.editorContent0} .cm-live-block table`)
        .filter({ hasText: 'a' })
        .filter({ hasNotText: 'b' })
        .first();
      await expect(tabelle).toBeVisible({ timeout: 15000 });
      expect(await tabelle.locator('tbody tr').count()).toBe(1);
      await expect(tabelle).not.toContainText('^pipe');
      const zeichen = page.locator(
        `${SEL.editorContent0} .cm-live-block-anker[data-anker-id="pipe"]`,
      );
      await expect(zeichen).toHaveCount(1);
      // Die Zeile unter der Tabelle sieht aus wie die Anker-Zeile unter der
      // Liste: dieselben Klassen, allein das Anker-Zeichen als Text.
      const zeilen = await page.evaluate((sel) => {
        const zeile = (id) =>
          document
            .querySelector(`${sel} .cm-live-block-anker[data-anker-id="${id}"]`)
            .closest('.cm-line');
        return ['pipe', 'liste'].map((id) => ({
          klassen: zeile(id).className,
          text: zeile(id).textContent,
        }));
      }, SEL.editorContent0);
      expect(zeilen[0]).toEqual(zeilen[1]);
      expect(zeilen[0].text).toBe('◇');

      // Die Zell-Eingabe in dieser Tabelle schreibt an die richtige Stelle,
      // und die Anker-Zeile bleibt darunter stehen.
      await tabelle.locator('tbody td').first().click();
      await expect(page.locator('.cm-live-tabelle-eingabe')).toBeVisible();
      await page.keyboard.press('Control+a');
      await page.keyboard.type('neu');
      await page.keyboard.press('Enter');
      await expect(page.locator('.cm-live-tabelle-eingabe')).toHaveCount(0);
      await expect
        .poll(() => text(page))
        .toBe(DOKUMENT.replace('| a | 1 |\n^pipe', '| neu | 1 |\n^pipe'));
      await expect(zeichen).toHaveCount(1);
      // 4T-002026: Die Zell-Eingabe steht im Puffer, nicht auf der Platte.
      erwarteDateiUnveraendert(pfade[0], DOKUMENT);
    });
  });
});

test.describe('BZ-06: Block-Eigenschaften an Datentabelle, Diagramm, Mermaid und Code-Block (help.feature.blockAnchors)', () => {
  test('das Eigenschaften-Zeichen steht am Block der Kennung, auch nach dem Neu-Zeichnen', async () => {
    const mdd = {
      schemaVersion: 1,
      history: { anchors: [], packets: [] },
      blockData: {
        umsatz: { values: { Status: 'offen' }, updated: '2026-09-30T06:00:00Z' },
        bild: { values: { Status: 'fertig' }, updated: '2026-09-30T06:00:00Z' },
        fluss: { values: { Status: 'Entwurf' }, updated: '2026-09-30T06:00:00Z' },
        code: { values: { Status: 'geprüft' }, updated: '2026-09-30T06:00:00Z' },
      },
    };
    await mitApp(
      { 'Anker.md': DOKUMENT, 'Anker.mdd': JSON.stringify(mdd, null, 2) + '\n' },
      async ({ page }) => {
        await warteAufAnsicht(page);
        const zeichen = (id) =>
          page.locator(`${BODY} [id="${id}"] > .block-meta-indicator[data-anchor-id="${id}"]`);
        const alle = ['umsatz', 'bild', 'fluss', 'code'];
        for (const id of alle) await expect(zeichen(id), id).toHaveCount(1);
        // Das Mermaid-Diagramm des Anfangs wird markiert; nach dem Wechsel des
        // Farbschemas steht ein neu gezeichnetes an seiner Stelle.
        await page
          .locator(`${BODY} [id="fluss"] svg`)
          .evaluate((el) => el.setAttribute('data-bz-alt', '1'));
        // Neu-Zeichnen des Diagramms über den Wechsel des Farbschemas: Die
        // erste Reihen-Farbe wechselt auf die des dunklen Schemas.
        const ersteFarbe = () =>
          page.locator(`${BODY} [id="bild"] svg`).evaluate((el) =>
            Array.from(el.querySelectorAll('path[fill]'))
              .map((p) => (p.getAttribute('fill') || '').toLowerCase())
              .find((f) => f.startsWith('#')),
          );
        const vorher = await ersteFarbe();
        const anders =
          (await page.locator('html').getAttribute('data-theme')) === 'dark' ? 'light' : 'dark';
        await page.evaluate((t) => window.api.setThemePref(t), anders);
        await expect(page.locator('html')).toHaveAttribute('data-theme', anders);
        await expect.poll(ersteFarbe, { timeout: 15000 }).not.toBe(vorher);
        await expect(page.locator(`${BODY} [id="bild"][data-chart-state="drawn"] svg`)).toHaveCount(
          1,
        );
        await expect(page.locator(`${BODY} [id="fluss"] svg:not([data-bz-alt])`)).toHaveCount(1, {
          timeout: 15000,
        });
        for (const id of alle) await expect(zeichen(id), id).toHaveCount(1);
      },
    );
  });
});

// Nachbesserung nach der unabhängigen Durchsicht vom 2026-09-30: die Tabelle im
// Zitat und im Hinweisblock (F2) und zwei Anker in einem Absatz (F1).
const NACHBESSERUNG = [
  'Zeile eins ^zwei-a',
  'Zeile zwei ^zwei-b',
  '',
  '> | Zitat | Wert |',
  '> |---|---|',
  '> | a | 1 |',
  '> ^im-zitat',
  '',
  '> [!note] Hinweis',
  '> | Hinweis | Wert |',
  '> |---|---|',
  '> | b | 2 |',
  '> ^im-hinweis',
  '',
  'Sprung zum [[#^zwei-b|zweiten Anker]].',
  '',
].join('\n');

test.describe('BZ-07: Tabelle im Zitat und im Hinweisblock, zwei Anker (help.feature.blockAnchors)', () => {
  test('keine Tabellenzeile mit Kennung, im Live-Modus das Anker-Zeichen; jede Kennung ist Ziel', async () => {
    await mitApp({ 'Nachbesserung.md': NACHBESSERUNG }, async ({ page }) => {
      await expect(page.locator(`${BODY} table`)).toHaveCount(2);
      const stand = await page.evaluate((sel) => {
        const body = document.querySelector(sel);
        return {
          text: body.innerText,
          zeilen: Array.from(body.querySelectorAll('table')).map(
            (t) => t.querySelectorAll('tbody tr').length,
          ),
          ids: ['zwei-a', 'zwei-b', 'im-zitat', 'im-hinweis'].map(
            (id) => !!body.querySelector(`[id="${id}"]`),
          ),
        };
      }, BODY);
      expect(stand.text).not.toMatch(/\^(zwei-a|zwei-b|im-zitat|im-hinweis)\b/);
      expect(stand.zeilen).toEqual([1, 1]);
      expect(stand.ids).toEqual([true, true, true, true]);
      // Der Verweis auf die zweite Kennung des Absatzes hat ein Ziel.
      await page.locator(`${BODY} a.wikilink[href="#zwei-b"]`).click();
      await expect(page.locator(`${BODY} [id="zwei-b"]`)).toHaveCount(1);

      // Live-Modus: Die Anker-Zeile steht außerhalb des Tabellen-Widgets und
      // trägt das Anker-Zeichen. (Dass das Widget einer Tabelle im Zitat sie
      // nicht als Tabelle zeigt, weil ihre Folgezeilen die Zitat-Präfixe
      // tragen, ist Bestand und nicht Gegenstand; gemessen am 2026-09-30.)
      await page.locator(SEL.viewBtn('live')).click();
      const widgets = page.locator(`${SEL.editorContent0} .cm-live-block`);
      await expect(widgets.first()).toBeVisible({ timeout: 15000 });
      for (const id of ['im-zitat', 'im-hinweis']) {
        await expect(
          page.locator(`${SEL.editorContent0} .cm-live-block-anker[data-anker-id="${id}"]`),
          id,
        ).toHaveCount(1);
        await expect(widgets.filter({ hasText: `^${id}` }), id).toHaveCount(0);
      }
    });
  });
});

// 4T-002072 (Epic 3E-000192): Der Name einer Datentabelle in ihrer Kopf-Angabe
// `table: Umsatz` ist eine Block-Kennung wie eine Anker-Zeile: Sprung,
// Einbettung und Rückverweise erreichen die Tabelle, ohne dass unter ihr eine
// Zeile `^Umsatz` steht. Die Füll-Absätze schieben die Tabelle aus dem Bild,
// damit der Sprung messbar ist.
const KOPF_DOKUMENT = [
  '# Kopf-Name',
  '',
  'Sprung zur [[#^Umsatz|Tabelle]].',
  '',
  FUELLUNG,
  '',
  `${Z}perspective-datatable`,
  'table: Umsatz',
  'columns: Monat:text, Umsatz:number',
  '| Januar  | 120 |',
  '| Februar | 99  |',
  Z,
  '',
  'Schluss.',
  '',
].join('\n');
const KOPF_ZEILE = KOPF_DOKUMENT.split('\n').indexOf('table: Umsatz') + 1;
const VERWEIS = ['# Verweis', '', 'Siehe [[Kopf#^Umsatz]].', '', '![[Kopf#^Umsatz]]', ''].join(
  '\n',
);

// Schreibmarke des Editors der ersten Spalte an den Dokument-Anfang.
function markeAnDenAnfang(page) {
  return page.evaluate((sel) => {
    let tile = document.querySelector(sel).cmTile;
    while (tile.parent) tile = tile.parent;
    tile.view.dispatch({ selection: { anchor: 0 } });
  }, SEL.editorContent0);
}

test.describe('BZ-08: Name einer Datentabelle in der Zeile table: (help.feature.blockAnchors)', () => {
  test('Sprung in drei Ansichten auf die Zeile der Angabe, Einbettung zeigt das Gitter, Rückverweise nennen das andere Dokument', async () => {
    await mitApp(
      { 'Kopf.md': KOPF_DOKUMENT, 'Verweis.md': VERWEIS },
      async ({ page, pfade }) => {
        const kopf = page.locator(SEL.tabs0, { hasText: 'Kopf' }).first();
        await kopf.click();
        const tabelle = `${BODY} .perspective-datatable[id="Umsatz"]`;
        const imBild = () =>
          page.evaluate((sel) => {
            const r = document.querySelector(sel).getBoundingClientRect();
            return r.top >= 0 && r.top < window.innerHeight;
          }, tabelle);
        // Lese-Ansicht: die Kennung am Container, die Angabe kein Text.
        await expect(page.locator(`${tabelle} .pdt-grid`)).toBeVisible({ timeout: 15000 });
        await expect(page.locator(BODY)).not.toContainText('table: Umsatz');
        expect(await imBild()).toBe(false);
        await page.locator(`${BODY} a.wikilink[href="#Umsatz"]`).click();
        await expect.poll(imBild, { timeout: 10000 }).toBe(true);

        // Geteilte Ansicht: die gerenderte Hälfte springt, der Editor setzt die
        // Schreibmarke auf die Zeile der Angabe.
        await page.locator(SEL.viewBtn('split')).click();
        await expect(page.locator(`${tabelle} .pdt-grid`)).toBeVisible({ timeout: 15000 });
        await markeAnDenAnfang(page);
        expect(await marke(page)).toBe(1);
        await page.locator(`${BODY} a.wikilink[href="#Umsatz"]`).click();
        await expect.poll(() => marke(page), { timeout: 10000 }).toBe(KOPF_ZEILE);
        await expect.poll(imBild, { timeout: 10000 }).toBe(true);

        // Live-Modus: kein Anker-Zeichen, der Sprung klappt den Block auf der
        // Zeile der Angabe auf.
        await page.locator(SEL.viewBtn('live')).click();
        await markeAnDenAnfang(page);
        await expect(page.locator(`${SEL.editorContent0} .cm-live-block .pdt-grid`)).toBeVisible({
          timeout: 15000,
        });
        await expect(page.locator(`${SEL.editorContent0} .cm-live-block-anker`)).toHaveCount(0);
        await page
          .locator(`${SEL.editorContent0} .cm-live-wikilink`, { hasText: 'Tabelle' })
          .click();
        await expect.poll(() => marke(page), { timeout: 10000 }).toBe(KOPF_ZEILE);
        await expect(
          page.locator(`${SEL.editorContent0} .cm-line`, { hasText: 'table: Umsatz' }),
        ).toHaveCount(1);
        await expect(page.locator(`${SEL.editorContent0} .cm-live-block-anker`)).toHaveCount(0);

        // Einbettung im anderen Dokument: das Gitter, ohne die Kopf-Zeile.
        await page.locator(SEL.viewBtn('rendered')).click();
        await page.locator(SEL.tabs0, { hasText: 'Verweis' }).first().click();
        const eingebettet = page.locator(`${BODY} .wiki-embed-md-body`);
        await expect(eingebettet.locator('.pdt-grid')).toBeVisible({ timeout: 15000 });
        await expect(eingebettet).toContainText('120');
        await expect(eingebettet).not.toContainText('table: Umsatz');
        // Nachbesserung F2: Die Kopie trägt den Namen nicht als id; ein Sprung
        // auf `[[#^Umsatz]]` kann nur die Tabelle selbst treffen.
        await expect(eingebettet.locator('[id="Umsatz"]')).toHaveCount(0);
        // Der Index kennt die Kennung: der Verweis gilt als bestehend.
        await expect
          .poll(
            () =>
              page.evaluate((f) => window.api.resolveWikiTargets(f, ['Kopf#^Umsatz']), pfade[1]),
            { timeout: 20000 },
          )
          .toMatchObject({ status: 'ready', existing: ['Kopf#^Umsatz'], brokenAnchor: [] });
        // Rückverweise der Tabelle nennen das verweisende Dokument.
        await kopf.click();
        await page.locator('#btn-backlinks').click();
        await expect(page.locator('.pane-group[data-pane="0"] .backlinks-results')).toContainText(
          'Verweis',
          { timeout: 20000 },
        );
      },
      { args: (p) => p },
    );
  });
});
