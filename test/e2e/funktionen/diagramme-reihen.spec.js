// 4T-002026 (Epic 3E-000192): Ablauf-Fälle der Diagramme zu Datentabellen,
// die bis dahin nur auf der Unit-Ebene belegt waren — die Hinweise zu den
// Gründen «Tabelle anderer Art», «Spalte ohne Zahlen», «Zeile fehlt oder ist
// mehrdeutig» und «Kreis oder Donut mit mehr als einer Reihe» an der Stelle der
// Grafik, dazu Linie und Balken mit drei Reihen und die Beschriftung jedes
// Stücks von Kreis und Donut. Die Fall-Kennungen setzen die der Nachbar-Datei
// diagramme.spec.js fort (DG-15 …), die nahe an ihrem Zeilen-Budget steht.
//
// Gemessen wird an der Anzeige selbst: am Zustand des Containers, am Text des
// Hinweises und an den Texten und Farben der gezeichneten Grafik. Die Farben
// kommen aus den Schema-Daten des mitgelieferten hellen Standard-Schemas
// (src/shared/color-schemes.js), das jeder Fall als Ausgangs-Zustand herstellt
// und prüft. Kein Fall schreibt; jeder endet am unveränderten Inhalt der Datei.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { BASE_DEFAULTS } = require('../../../src/shared/color-schemes.js');

const HELL = [1, 2, 3, 4, 5].map((i) => BASE_DEFAULTS.light[`chart${i}`]);

const STANDARD = {
  language: 'de',
  themePref: 'light',
  colorSchemes: { custom: [], activeLight: 'standard-light', activeDark: 'standard-dark' },
};

// Zaun-Blöcke als Zeilen-Listen (Muster diagramme.spec.js).
const Z = '```';
const TABELLE = [
  `${Z}perspective-datatable`,
  'columns: Monat:text, Kategorie:text, Einnahmen:number, Ausgaben:number, Rücklage:number',
  '| Januar  | Laden  | 100 | 80 | 10 |',
  '| Februar | Laden  | 90  | 95 | 20 |',
  '| März    | Online | 120 | 70 | 30 |',
  '| April   | Online | 60  | 50 | 40 |',
  '| Mai     | Laden  | 75  | 65 | 50 |',
  Z,
  '^umsatz',
].join('\n');

function diagramm(...angaben) {
  return [`${Z}perspective-chart`, ...angaben, Z].join('\n');
}

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-diagramme-dr-'));
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

const LESE = `${SEL.markdownBody0} .perspective-chart`;
const LIVE = `${SEL.editorContent0} .perspective-chart`;

// Zustand, Grund und Hinweis aller Diagramm-Container einer Ansicht.
function hinweise(page, wurzel) {
  return page.locator(wurzel).evaluateAll((els) =>
    els.map((el) => ({
      zustand: el.dataset.chartState || null,
      grund: el.dataset.chartReason || null,
      anlass: el.dataset.chartDetail || null,
      titel: (el.querySelector('.perspective-chart-hint-title') || {}).textContent || null,
      text: (el.querySelector('.perspective-chart-hint-reason') || {}).textContent || null,
      grafik: Boolean(el.querySelector('svg')),
    })),
  );
}

// Texte und Farben der gezeichneten Grafik eines Containers: jeder Text samt
// Sichtbarkeit, die Füll- und die Strichfarben der Pfade.
function grafik(page, selektor) {
  return page.locator(selektor).evaluate((el) => {
    const svg = el.querySelector('svg');
    if (!svg) return { zustand: el.dataset.chartState || null, texte: [], fuellungen: [] };
    const farben = (attr) => [
      ...new Set(
        Array.from(svg.querySelectorAll(`path[${attr}]`))
          .map((p) => (p.getAttribute(attr) || '').toLowerCase())
          .filter((f) => /^#[0-9a-f]{6}$/.test(f)),
      ),
    ];
    const texte = Array.from(svg.querySelectorAll('text')).map((t) => {
      const r = t.getBoundingClientRect();
      const stil = getComputedStyle(t);
      return {
        text: t.textContent,
        sichtbar:
          r.width > 0 && r.height > 0 && stil.display !== 'none' && stil.visibility !== 'hidden',
      };
    });
    return {
      zustand: el.dataset.chartState || null,
      beschreibung: (svg.querySelector('desc') || {}).textContent || null,
      texte,
      fuellungen: farben('fill'),
      striche: farben('stroke'),
    };
  });
}

const sichtbareTexte = (g) => g.texte.filter((t) => t.sichtbar).map((t) => t.text);

async function starte(dir, text) {
  const datei = schreibe(dir, 'Diagramme.md', text);
  const gestartet = await launchApp({ args: [datei], settings: STANDARD });
  const { page } = gestartet;
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  // Ausgangs-Zustand: helles Standard-Schema, vorbelegt und an der Wurzel geprüft.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  return { ...gestartet, datei };
}

// Wartet, bis alle n Container einer Ansicht entschieden sind (gezeichnet oder
// mit Hinweis), und liefert ihre Hinweise.
async function entschieden(page, wurzel, n) {
  await expect
    .poll(
      async () =>
        (await hinweise(page, wurzel)).filter((h) => h.zustand === 'drawn' || h.titel).length,
      { timeout: 15000 },
    )
    .toBe(n);
  return hinweise(page, wurzel);
}

const TITEL = 'Das Diagramm kann nicht gezeichnet werden';

test.describe('DG-15: Tabelle anderer Art als Quelle (F-332)', () => {
  test('eine gewöhnliche Markdown-Tabelle und eine Perspective Table ergeben je den Hinweis, in Lese-Ansicht und Live-Modus (4S-001021 AK8)', async () => {
    const dir = makeDir();
    const text = [
      '# Andere Arten',
      '',
      '| Monat | Wert |',
      '|---|---|',
      '| Januar | 10 |',
      '| Februar | 20 |',
      '',
      '^pipe',
      '',
      `${Z}perspective-table`,
      '{| Monat || Wert |}',
      '| Januar | 10 |',
      Z,
      '^pt',
      '',
      diagramm('table: ^pipe', 'type: bar', 'labels: Monat', 'values: Wert'),
      '',
      diagramm('table: ^pt', 'type: line', 'labels: Monat', 'values: Wert'),
      '',
    ].join('\n');
    const { app, page, userData, datei } = await starte(dir, text);
    const erwartet = [
      {
        zustand: 'undrawable',
        grund: 'table-other-kind',
        anlass: 'pipe-table',
        titel: TITEL,
        text: 'Der Name «pipe» gehört nicht zu einer Datentabelle. Ein Diagramm zeigt nur die Werte einer Datentabelle.',
        grafik: false,
      },
      {
        zustand: 'undrawable',
        grund: 'table-other-kind',
        anlass: 'perspective-table',
        titel: TITEL,
        text: 'Der Name «pt» gehört nicht zu einer Datentabelle. Ein Diagramm zeigt nur die Werte einer Datentabelle.',
        grafik: false,
      },
    ];
    try {
      expect(await entschieden(page, LESE, 2)).toEqual(erwartet);
      await page.locator(SEL.viewBtn('live')).click();
      expect(await entschieden(page, LIVE, 2)).toEqual(erwartet);
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-16: Text-Spalte als Werte (F-332)', () => {
  test('der Hinweis nennt die Spalte ohne Zahlen, auch bei der Beschriftungs-Spalte als Werte, in Lese-Ansicht und Live-Modus (4S-001022 AK12)', async () => {
    const dir = makeDir();
    const text = [
      '# Werte',
      '',
      TABELLE,
      '',
      diagramm('table: ^umsatz', 'type: bar', 'labels: Monat', 'values: Einnahmen, Kategorie'),
      '',
      // Entscheidung vom 2026-09-30: Die Beschriftungs-Spalte Monat als
      // Werte-Spalte nennt denselben Grund wie jede andere Text-Spalte.
      diagramm('table: ^umsatz', 'type: bar', 'labels: Monat', 'values: Monat'),
      '',
    ].join('\n');
    const { app, page, userData, datei } = await starte(dir, text);
    const erwartet = ['Kategorie', 'Monat'].map((spalte) => ({
      zustand: 'undrawable',
      grund: 'values-not-numeric',
      anlass: spalte,
      titel: TITEL,
      text: `Die Spalte «${spalte}» ist keine Zahl-Spalte. Werte eines Diagramms kommen nur aus Zahl-Spalten.`,
      grafik: false,
    }));
    try {
      expect(await entschieden(page, LESE, 2)).toEqual(erwartet);
      await page.locator(SEL.viewBtn('live')).click();
      expect(await entschieden(page, LIVE, 2)).toEqual(erwartet);
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-17: Datenreihen aus Zeilen, genannter Eintrag mehrdeutig oder fehlend (F-332)', () => {
  test('je ein Hinweis mit dem Eintrag; die eindeutige Nennung daneben wird gezeichnet (4S-001022 AK13)', async () => {
    const dir = makeDir();
    // «Laden» steht in der Spalte Kategorie dreimal, «Juni» in der Spalte
    // Monat keinmal; «Januar, März» trifft je genau eine Zeile.
    const zeilen = (labels, rows) =>
      diagramm('table: ^umsatz', 'type: bar', 'series: rows', `labels: ${labels}`, `rows: ${rows}`);
    const text = [
      '# Zeilen',
      '',
      TABELLE,
      '',
      zeilen('Kategorie', 'Laden'),
      '',
      zeilen('Monat', 'Januar, Juni'),
      '',
      zeilen('Monat', 'Januar, März'),
      '',
    ].join('\n');
    const { app, page, userData, datei } = await starte(dir, text);
    const hinweis = (eintrag) => ({
      zustand: 'undrawable',
      grund: 'selection-invalid',
      anlass: eintrag,
      titel: TITEL,
      text: `Die Spalte oder Zeile «${eintrag}» fehlt in der Tabelle oder ist nicht eindeutig.`,
      grafik: false,
    });
    try {
      for (const [wurzel, ansicht] of [
        [LESE, 'rendered'],
        [LIVE, 'live'],
      ]) {
        if (ansicht === 'live') await page.locator(SEL.viewBtn('live')).click();
        const [mehrdeutig, fehlt, eindeutig] = await entschieden(page, wurzel, 3);
        expect(mehrdeutig, ansicht).toEqual(hinweis('Laden'));
        expect(fehlt, ansicht).toEqual(hinweis('Juni'));
        expect(eindeutig, ansicht).toMatchObject({ zustand: 'drawn', grafik: true, titel: null });
        const g = await grafik(page, `${wurzel} >> nth=2`);
        expect(sichtbareTexte(g), ansicht).toEqual(
          expect.arrayContaining(['Januar', 'März', 'Einnahmen', 'Ausgaben', 'Rücklage']),
        );
      }
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-18: Kreis und Donut mit mehr als einer Reihe (F-332)', () => {
  test('Donut mit zwei Werte-Spalten und Kreis mit zwei Zeilen ergeben je den Hinweis (4S-001022 AK16)', async () => {
    const dir = makeDir();
    const text = [
      '# Ein Kreis, eine Reihe',
      '',
      TABELLE,
      '',
      diagramm('table: ^umsatz', 'type: donut', 'labels: Monat', 'values: Einnahmen, Ausgaben'),
      '',
      diagramm('table: ^umsatz', 'type: pie', 'series: rows', 'labels: Monat', 'rows: Januar, Mai'),
      '',
    ].join('\n');
    const { app, page, userData, datei } = await starte(dir, text);
    const erwartet = {
      zustand: 'undrawable',
      grund: 'type-unsupported',
      anlass: 'multiple-series',
      titel: TITEL,
      text: 'Ein Kreis- oder Donut-Diagramm zeigt genau eine Datenreihe.',
      grafik: false,
    };
    try {
      expect(await entschieden(page, LESE, 2)).toEqual([erwartet, erwartet]);
      await page.locator(SEL.viewBtn('live')).click();
      expect(await entschieden(page, LIVE, 2)).toEqual([erwartet, erwartet]);
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-19: Linie und Balken mit drei Reihen (F-332)', () => {
  test('drei unterscheidbare Reihen-Farben und die drei Namen in der Legende, in Lese-Ansicht und Live-Modus (4S-001022 AK8)', async () => {
    const dir = makeDir();
    const drei = 'values: Einnahmen, Ausgaben, Rücklage';
    const text = [
      '# Drei Reihen',
      '',
      TABELLE,
      '',
      diagramm('table: ^umsatz', 'type: line', 'labels: Monat', drei),
      '',
      diagramm('table: ^umsatz', 'type: bar', 'labels: Monat', drei),
      '',
    ].join('\n');
    const { app, page, userData, datei } = await starte(dir, text);
    const namen = ['Einnahmen', 'Ausgaben', 'Rücklage'];
    try {
      for (const [wurzel, ansicht] of [
        [LESE, 'rendered'],
        [LIVE, 'live'],
      ]) {
        if (ansicht === 'live') await page.locator(SEL.viewBtn('live')).click();
        expect(await entschieden(page, wurzel, 2), ansicht).toMatchObject([
          { zustand: 'drawn' },
          { zustand: 'drawn' },
        ]);
        // Unterscheidbar: jede Reihe in ihrer eigenen Farbe des Schemas, die
        // Linie als Strich, der Balken als Fläche; eine vierte gibt es nicht.
        await expect
          .poll(
            async () => {
              const g = await grafik(page, `${wurzel} >> nth=0`);
              return HELL.filter((f) => g.striche.includes(f));
            },
            { message: ansicht },
          )
          .toEqual(HELL.slice(0, 3));
        await expect
          .poll(
            async () => {
              const g = await grafik(page, `${wurzel} >> nth=1`);
              return HELL.filter((f) => g.fuellungen.includes(f));
            },
            { message: ansicht },
          )
          .toEqual(HELL.slice(0, 3));
        const linie = await grafik(page, `${wurzel} >> nth=0`);
        const balken = await grafik(page, `${wurzel} >> nth=1`);
        expect(linie.beschreibung, ansicht).toBe('Liniendiagramm mit 3 Datenreihen und 5 Rubriken');
        expect(balken.beschreibung, ansicht).toBe(
          'Balkendiagramm mit 3 Datenreihen und 5 Rubriken',
        );
        // Der Name jeder Reihe steht sichtbar am Diagramm.
        for (const g of [linie, balken]) {
          expect(sichtbareTexte(g), ansicht).toEqual(expect.arrayContaining(namen));
        }
      }
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-20: Kreis und Donut beschriften jedes Stück (F-332)', () => {
  test('fünf Stücke in fünf Farben, jede Rubrik sichtbar beschriftet, in Lese-Ansicht und Live-Modus (4S-001022 AK9)', async () => {
    const dir = makeDir();
    const text = [
      '# Stücke',
      '',
      TABELLE,
      '',
      diagramm('table: ^umsatz', 'type: pie', 'labels: Monat', 'values: Einnahmen'),
      '',
      diagramm('table: ^umsatz', 'type: donut', 'labels: Monat', 'values: Rücklage'),
      '',
    ].join('\n');
    const { app, page, userData, datei } = await starte(dir, text);
    const monate = ['Januar', 'Februar', 'März', 'April', 'Mai'];
    try {
      for (const [wurzel, ansicht] of [
        [LESE, 'rendered'],
        [LIVE, 'live'],
      ]) {
        if (ansicht === 'live') await page.locator(SEL.viewBtn('live')).click();
        expect(await entschieden(page, wurzel, 2), ansicht).toMatchObject([
          { zustand: 'drawn' },
          { zustand: 'drawn' },
        ]);
        for (const nr of [0, 1]) {
          const sel = `${wurzel} >> nth=${nr}`;
          await expect
            .poll(
              async () => {
                const f = (await grafik(page, sel)).fuellungen;
                return HELL.filter((h) => f.includes(h));
              },
              { message: ansicht },
            )
            .toEqual(HELL);
          const g = await grafik(page, sel);
          const art = nr === 0 ? 'Kreisdiagramm' : 'Donut-Diagramm';
          expect(g.beschreibung, ansicht).toBe(`${art} mit 1 Datenreihe und 5 Rubriken`);
          // Jede Rubrik steht genau einmal als sichtbare Beschriftung da.
          const sichtbar = sichtbareTexte(g);
          for (const monat of monate) {
            expect(
              sichtbar.filter((t) => t === monat),
              `${ansicht} ${art} ${monat}`,
            ).toHaveLength(1);
          }
        }
      }
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// Paare sichtbarer Beschriftungen, die einander deutlich überdecken: Die
// Schnittfläche ist größer als ein Viertel der kleineren Fläche. Zwei
// Beschriftungen in benachbarten Zeilen berühren sich nur am Rand und zählen
// nicht; übereinander gezeichnete zählen.
function ueberdeckte(page, selektor) {
  return page.locator(selektor).evaluate((el) => {
    const boxen = Array.from(el.querySelectorAll('svg text'))
      .filter((t) => /^K\d{4}$/.test(t.textContent))
      .map((t) => t.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    let paare = 0;
    for (let i = 0; i < boxen.length; i++) {
      for (let j = i + 1; j < boxen.length; j++) {
        const a = boxen[i];
        const b = boxen[j];
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const klein = Math.min(a.width * a.height, b.width * b.height);
        if (w > 0 && h > 0 && w * h > klein / 4) paare++;
      }
    }
    return { beschriftungen: boxen.length, ueberdeckt: paare };
  });
}

test.describe('DG-21: Kreis mit sehr vielen Stücken (F-332)', () => {
  test('1500 Stücke werden gezeichnet, keine Beschriftung überdeckt eine andere, in Lese-Ansicht und Live-Modus', async () => {
    const dir = makeDir();
    const zeilen = Array.from(
      { length: 1500 },
      (_, i) => `| K${String(i + 1).padStart(4, '0')} | ${100 + ((i * 37) % 400)} |`,
    );
    const text = [
      '# Viele Stücke',
      '',
      `${Z}perspective-datatable`,
      'columns: Kennung:text, Wert:number',
      ...zeilen,
      Z,
      '^viele',
      '',
      diagramm('table: ^viele', 'type: pie', 'labels: Kennung', 'values: Wert'),
      '',
    ].join('\n');
    const { app, page, userData, datei } = await starte(dir, text);
    try {
      for (const [wurzel, ansicht] of [
        [LESE, 'rendered'],
        [LIVE, 'live'],
      ]) {
        if (ansicht === 'live') await page.locator(SEL.viewBtn('live')).click();
        await expect(page.locator(`${wurzel}[data-chart-state="drawn"] svg`)).toHaveCount(1, {
          timeout: 30000,
        });
        const g = await grafik(page, wurzel);
        expect(g.beschreibung, ansicht).toBe('Kreisdiagramm mit 1 Datenreihe und 1500 Rubriken');
        const b = await ueberdeckte(page, wurzel);
        // Gezeichnet werden nur die Beschriftungen, die Platz haben.
        expect(b.beschriftungen, ansicht).toBeGreaterThan(10);
        expect(b.beschriftungen, ansicht).toBeLessThan(1500);
        expect(b.ueberdeckt, ansicht).toBe(0);
      }
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
