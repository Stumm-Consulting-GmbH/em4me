// 4T-000355 (Epic 3E-000065): E2E-Funktions-Suite Frontmatter-Abfrage
// (perspective-query). Prüft die dynamische, klickbare Datei-Liste in der
// Render-Pane, die Live-Aktualisierung bei neuer passender Datei und die
// Parität im Live-Modus. describe-Titel tragen die Matrix-IDs (Eintrag in
// test/abdeckungs-matrix.json erfolgt mit dem Funktions-Katalog in 4T-000356).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

// Fence-Body als Array gefügt, damit die ```-Zäune nicht mit dem
// JS-Template-Literal kollidieren.
const QUERY_FENCE = ['```perspective-query', 'bereich = "Privat"', '```'].join('\n');

// Übersichts-Datei mit der Abfrage; ihr eigener Bereich (Index) erfüllt die
// Abfrage bewusst NICHT, damit die Trefferliste nur die Ziel-Dateien enthält.
function makeFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-fmquery-'));
  fs.writeFileSync(
    path.join(dir, 'Uebersicht.md'),
    `---\nBereich: Index\n---\n# Uebersicht\n\n${QUERY_FENCE}\n`,
    'utf8',
  );
  fs.writeFileSync(path.join(dir, 'Alpha.md'), '---\nBereich: Privat\n---\n# Alpha\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'Beta.md'), '---\nBereich: Privat\n---\n# Beta\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'Gamma.md'), '---\nBereich: Beruf\n---\n# Gamma\n', 'utf8');
  return dir;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

test.describe('FQ-01: Frontmatter-Abfrage — Liste, Klick, Live-Aktualisierung (Render-Pane)', () => {
  test('Liste zeigt nur Treffer, neue passende Datei erscheint automatisch, Klick öffnet das Ziel', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    const items = page.locator(`${SEL.markdownBody0} a.perspective-query-item`);
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();

      // Genau die zwei Bereich=Privat-Dateien; Gamma (Beruf) und Uebersicht
      // selbst (Index) fehlen. Der Index baut asynchron auf, deshalb warten.
      await expect(items).toHaveCount(2, { timeout: 15000 });
      await expect(items.nth(0)).toHaveText('Alpha');
      await expect(items.nth(1)).toHaveText('Beta');

      // Live-Aktualisierung: neue passende Datei schlägt ohne manuellen
      // Refresh auf die sichtbare Liste durch (Watcher -> Index -> Broadcast).
      fs.writeFileSync(path.join(dir, 'Delta.md'), '---\nBereich: Privat\n---\n# Delta\n', 'utf8');
      await expect(items).toHaveCount(3, { timeout: 15000 });
      await expect(items.nth(2)).toHaveText('Delta');

      // Klick öffnet die exakte Zieldatei über den absoluten Index-Pfad.
      await items.nth(0).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Alpha');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-000404 (Epic 3E-000076): Tabellen-Ausgabe mit Sortierung (4T-000403). Eigene
// Fixture mit TABLE-Fence und prio-Feldern; die Sortierung DESC muss die
// Zeilen-Reihenfolge bestimmen, der Datei-Link der ersten Spalte öffnet das Ziel.
const TABLE_FENCE = [
  '```perspective-query',
  'TABLE prio AS "Prio" WHERE bereich = "Privat" SORT prio DESC',
  '```',
].join('\n');

function makeTableFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-fmtable-'));
  fs.writeFileSync(
    path.join(dir, 'Uebersicht.md'),
    `---\nBereich: Index\n---\n# Uebersicht\n\n${TABLE_FENCE}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'Alpha.md'),
    '---\nBereich: Privat\nprio: 1\n---\n# Alpha\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'Beta.md'),
    '---\nBereich: Privat\nprio: 5\n---\n# Beta\n',
    'utf8',
  );
  return dir;
}

test.describe('FQ-03: Perspective-Abfrage — Tabellen-Ausgabe mit Sortierung', () => {
  test('TABLE rendert Kopfzeile und sortierte Zeilen, Datei-Klick öffnet das Ziel', async () => {
    const dir = makeTableFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      const table = page.locator(`${SEL.markdownBody0} table.perspective-query-table`);
      await expect(table).toBeVisible({ timeout: 15000 });

      // Kopfzeile: Datei-Spalte (lokalisiert, Default DE) plus Alias-Spalte.
      const headers = table.locator('thead th');
      await expect(headers).toHaveCount(2);
      await expect(headers.nth(0)).toHaveText('Datei');
      await expect(headers.nth(1)).toHaveText('Prio');

      // SORT prio DESC: Beta (5) vor Alpha (1); Zellwerte aus dem Frontmatter.
      const rowLinks = table.locator('tbody a.perspective-query-item');
      await expect(rowLinks).toHaveCount(2);
      await expect(rowLinks.nth(0)).toHaveText('Beta');
      await expect(rowLinks.nth(1)).toHaveText('Alpha');
      await expect(table.locator('tbody tr').nth(0).locator('td').nth(1)).toHaveText('5');

      // Klick über den bestehenden data-fm-path-Pfad öffnet die Datei.
      await rowLinks.nth(0).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Beta');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-000405 (Epic 3E-000076): Mehrspalten-Layout der Ergebnis-Liste (COLUMNS n)
// plus Hinweis-Pfad (COLUMNS bei TABLE ignoriert).
test.describe('FQ-04: Perspective-Abfrage — Mehrspalten-Layout und COLUMNS-Hinweis', () => {
  test('COLUMNS 3 setzt data-fm-columns und column-count; TABLE mit COLUMNS zeigt den Hinweis', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-fmcols-'));
    const listFence = [
      '```perspective-query',
      'LIST WHERE bereich = "Privat" COLUMNS 3',
      '```',
    ].join('\n');
    const tableFence = [
      '```perspective-query',
      'TABLE prio WHERE bereich = "Privat" COLUMNS 3',
      '```',
    ].join('\n');
    fs.writeFileSync(
      path.join(dir, 'Uebersicht.md'),
      `---\nBereich: Index\n---\n# Uebersicht\n\n${listFence}\n\n${tableFence}\n`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(dir, 'Alpha.md'),
      '---\nBereich: Privat\nprio: 1\n---\n# Alpha\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dir, 'Beta.md'),
      '---\nBereich: Privat\nprio: 2\n---\n# Beta\n',
      'utf8',
    );
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      const list = page.locator(`${SEL.markdownBody0} .perspective-query-list`);
      await expect(list).toBeVisible({ timeout: 15000 });
      await expect(list).toHaveAttribute('data-fm-columns', '3');
      // Die CSS-Regel greift real (column-count aus styles.css).
      const columnCount = await list.evaluate((el) => getComputedStyle(el).columnCount);
      expect(columnCount).toBe('3');

      // TABLE mit COLUMNS: Hinweis erscheint, Tabelle rendert einspaltig normal.
      const hint = page.locator(`${SEL.markdownBody0} .perspective-query-hint`);
      await expect(hint).toBeVisible({ timeout: 15000 });
      await expect(
        page.locator(`${SEL.markdownBody0} table.perspective-query-table`),
      ).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-002043 (Epic 3E-000258): Wahl der Darstellungsform. Eine unbekannte Form
// (hier ein Tippfehler) zeigt die Ausgabe ohne Angabe, also die Tabelle, mit
// einem Hinweis und ohne Fehler, in Lese- und Live-Ansicht. Wird die Angabe im
// Quelltext entfernt, folgt die Live-Ansicht ohne Speichern (Story AK6).
const DISPLAY_FENCE = [
  '```perspective-query',
  'TABLE prio AS "Prio" WHERE bereich = "Privat" SORT prio DESC',
  'DISPLAY sparkles',
  '```',
].join('\n');
const DE = require('../../../src/i18n/de.json');

test.describe('FQ-05: Perspective-Abfrage — unbekannte Darstellungsform mit Rückfall und Hinweis', () => {
  test('Tabelle mit Hinweis in Lese- und Live-Ansicht, ohne die Angabe die gewohnte Tabelle ohne Speichern', async () => {
    const dir = makeTableFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    fs.writeFileSync(
      uebersicht,
      `---\nBereich: Index\n---\n# Uebersicht\n\n${DISPLAY_FENCE}\n`,
      'utf8',
    );
    const hinweisText = DE['query.hint.displayFormUnknown'].replace('{name}', 'sparkles');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();

      // Lese-Ansicht: Hinweis über der Tabelle, darunter die Ausgabe ohne Angabe.
      const table = page.locator(`${SEL.markdownBody0} table.perspective-query-table`);
      await expect(table).toBeVisible();
      await expect(table.locator('tbody a.perspective-query-item')).toHaveText(['Beta', 'Alpha']);
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-hint`)).toHaveText(
        hinweisText,
      );
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-error`)).toHaveCount(0);

      // Live-Ansicht: dasselbe Bild im Block-Widget.
      await page.locator(SEL.viewBtn('live')).click();
      const liveTable = page.locator(`${SEL.editorContent0} table.perspective-query-table`);
      await expect(liveTable.locator('tbody a.perspective-query-item')).toHaveText([
        'Beta',
        'Alpha',
      ]);
      const liveHint = page.locator(`${SEL.editorContent0} .perspective-query-hint`);
      await expect(liveHint).toHaveText(hinweisText);

      // Die Angabe im Quelltext entfernen und NICHT speichern.
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
      await page
        .locator(`${SEL.editorContent0} .cm-line`, { hasText: /^DISPLAY sparkles$/ })
        .click();
      await page.keyboard.press('End');
      await page.keyboard.press('Shift+Home');
      await page.keyboard.press('Backspace');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      // Den Cursor aus dem Block nehmen, damit die Live-Ansicht ihn als Widget zeigt.
      await page.keyboard.press('Control+Home');
      expect(fs.readFileSync(uebersicht, 'utf8')).toContain('DISPLAY sparkles');

      // Live-Ansicht folgt dem ungespeicherten Stand: Tabelle ohne Hinweis. Das
      // Widget hängt Hinweis und Tabelle in einem Zug ein; steht die Tabelle, gilt
      // die Aussage über den Hinweis.
      await page.locator(SEL.viewBtn('live')).click();
      await expect(liveTable.locator('tbody a.perspective-query-item')).toHaveText([
        'Beta',
        'Alpha',
      ]);
      await expect(liveHint).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-002077 (Epic 3E-000259): gruppierte Liste über Dateien. Je Kapitel eine
// Überschrift mit den Treffern darunter, die Datei ohne Kapitel in der Gruppe
// «(ohne Wert)» zuletzt; dasselbe Bild in Lese-, geteilter und Live-Ansicht, und
// ein Klick auf einen Treffer öffnet die Datei.
const GROUP_FENCE = [
  '```perspective-query',
  'LIST WHERE bereich = "Privat" GROUP BY kapitel',
  '```',
].join('\n');

function makeGroupFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-fmgroup-'));
  fs.writeFileSync(
    path.join(dir, 'Uebersicht.md'),
    `---\nBereich: Index\n---\n# Uebersicht\n\n${GROUP_FENCE}\n`,
    'utf8',
  );
  const datei = (name, kapitel) => {
    const kopf = kapitel === null ? '' : `kapitel: ${kapitel}\n`;
    const text = `---\nBereich: Privat\n${kopf}---\n# ${name}\n`;
    fs.writeFileSync(path.join(dir, `${name}.md`), text, 'utf8');
  };
  datei('Alpha', 2);
  datei('Beta', 1);
  datei('Gamma', null);
  datei('Delta', 2);
  return dir;
}

// Das Bild der gruppierten Liste unter einem Wurzel-Selektor: Überschrift und
// Treffer je Gruppe der obersten Stufe.
async function gruppenBild(page, root) {
  const gruppen = page.locator(`${root} .perspective-query-group[data-level="0"]`);
  await expect(gruppen).toHaveCount(3);
  const bild = [];
  for (const gruppe of await gruppen.all()) {
    const titel = await gruppe.locator('.perspective-query-group-title').textContent();
    const treffer = await gruppe.locator('a.perspective-query-item').allTextContents();
    bild.push(`${titel}: ${treffer.join(', ')}`);
  }
  return bild;
}

test.describe('FQ-06: Perspective-Abfrage — gruppierte Liste über Dateien', () => {
  test('Überschriften mit Treffern in Lese-, geteilter und Live-Ansicht, Klick öffnet die Datei', async () => {
    const dir = makeGroupFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const erwartet = ['1: Beta', '2: Alpha, Delta', `${DE['query.group.none']}: Gamma`];
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();

      // Lese-Ansicht.
      expect(await gruppenBild(page, SEL.markdownBody0)).toEqual(erwartet);
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-error`)).toHaveCount(0);

      // Geteilte Ansicht: Quelltext daneben, die Vorschau zeigt dasselbe Bild.
      await page.locator(SEL.viewBtn('split')).click();
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      expect(await gruppenBild(page, SEL.markdownBody0)).toEqual(erwartet);

      // Live-Ansicht: dasselbe Bild im Block-Widget.
      await page.locator(SEL.viewBtn('live')).click();
      expect(await gruppenBild(page, SEL.editorContent0)).toEqual(erwartet);

      // Zurück in die Lese-Ansicht; der Klick auf einen Treffer öffnet die Datei.
      await page.locator(SEL.viewBtn('rendered')).click();
      const delta = page.locator(`${SEL.markdownBody0} a.perspective-query-item`, {
        hasText: 'Delta',
      });
      await delta.click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Delta');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('FQ-02: Frontmatter-Abfrage — Parität im Live-Modus', () => {
  test('Live-Modus zeigt dieselbe Trefferliste als Block-Widget', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      // In den Live-Modus wechseln (Statusbar-Umschalter).
      await page.locator(SEL.viewBtn('live')).click();
      const liveItems = page.locator(`${SEL.editorContent0} a.perspective-query-item`);
      await expect(liveItems).toHaveCount(2, { timeout: 15000 });
      await expect(liveItems.nth(0)).toHaveText('Alpha');
      await expect(liveItems.nth(1)).toHaveText('Beta');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// --- 4T-002173 (Epic 3E-000337): Diagramm-Darstellung einer Tabellen-Abfrage ---
// `DISPLAY bar` und `DISPLAY line` zeigen eine Tabellen-Abfrage als Balken- und
// Linien-Diagramm. Gemessen wird am sichtbaren Bild: Art am Container, Vorlese-
// Beschreibung der Grafik (Zahl der Reihen und Rubriken), Treffer-Namen als
// Beschriftung, Zeilen unter dem Bild, Hinweis über der Ausgabe und Farben im
// PDF. Die Abfrage-Datei trägt ihren eigenen Bereich «Index», damit nur die drei
// Bücher Treffer sind; sortiert nach Seiten: Gamma (80), Alpha (120), Beta (300).
const zlib = require('node:zlib');
const { oeffneEinstellungsSeite } = require('../helpers/eingabe');
const { BASE_DEFAULTS } = require('../../../src/shared/color-schemes.js');
const { hauptLesen, hauptSenden } = require('../helpers/haupt-zugriff');

const abfrage = (...zeilen) => ['```perspective-query', ...zeilen, '```'].join('\n');
const BUCH_ABFRAGE = (form) =>
  abfrage(
    'TABLE seiten AS "Seiten", preis AS "Preis", titel AS "Titel" WHERE bereich = "Buch" SORT seiten ASC',
    `DISPLAY ${form}`,
  );
const GRUPPEN_ABFRAGE = abfrage(
  'TABLE count() AS "Bücher", sum(seiten) AS "Seiten" WHERE bereich = "Buch" GROUP BY autor',
  'DISPLAY bar',
);
const LISTEN_ABFRAGE = abfrage('LIST WHERE bereich = "Buch"', 'DISPLAY bar');
const TEXT_ABFRAGE = abfrage('TABLE titel AS "Titel" WHERE bereich = "Buch"', 'DISPLAY bar');

function makeBuchFixtureDir(...bloecke) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-fmchart-'));
  const text = `---\nBereich: Index\n---\n# Uebersicht\n\n${bloecke.join('\n\n')}\n`;
  fs.writeFileSync(path.join(dir, 'Uebersicht.md'), text, 'utf8');
  const buch = (name, kopf) =>
    fs.writeFileSync(
      path.join(dir, `${name}.md`),
      `---\nBereich: Buch\n${kopf}---\n# ${name}\n`,
      'utf8',
    );
  buch('Alpha', 'seiten: 120\npreis: 10\nautor: Ada\ntitel: Erstes\n');
  buch('Beta', 'seiten: 300\npreis: 20\nautor: Ada\ntitel: Zweites\n');
  // Gamma ohne Preis: ein ausgelassener Wert in der Reihe «Preis».
  buch('Gamma', 'seiten: 80\nautor: Bo\ntitel: Drittes\n');
  return { dir, datei: path.join(dir, 'Uebersicht.md'), text };
}

// Das Bild eines Abfrage-Diagramms unter einem Wurzel-Selektor.
async function diagrammBild(page, root, nr = 0) {
  const bild = page.locator(`${root} .perspective-query-chart`).nth(nr);
  await expect(bild.locator('svg')).toBeVisible({ timeout: 15000 });
  return {
    art: await bild.getAttribute('data-query-chart'),
    beschreibung: await bild.locator('svg desc').textContent(),
    zeilen: await bild.locator('.perspective-chart-omitted').allTextContents(),
  };
}

const BUCH_ZEILEN = [
  DE['query.chart.skipped.one'].replace('{columns}', "'Titel'"),
  DE['query.chart.omitted.one'],
];

test.describe('FQ-07: Perspective-Abfrage — Balken und Linie in Lese-, geteilter und Live-Ansicht', () => {
  test('Balken je Treffer in drei Ansichten, ungespeichert auf Linie umgestellt folgt die Live-Ansicht', async () => {
    const { dir, datei, text } = makeBuchFixtureDir(BUCH_ABFRAGE('bar'));
    const balken = {
      art: 'bar',
      beschreibung: 'Balkendiagramm mit 2 Datenreihen und 3 Rubriken',
      zeilen: BUCH_ZEILEN,
    };
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();

      // Lese-Ansicht: das Diagramm statt der Tabelle, Treffer-Namen als Beschriftung.
      expect(await diagrammBild(page, SEL.markdownBody0)).toEqual(balken);
      const svg = page.locator(`${SEL.markdownBody0} .perspective-query-chart svg`);
      for (const name of ['Gamma', 'Alpha', 'Beta']) await expect(svg).toContainText(name);
      await expect(page.locator(`${SEL.markdownBody0} table.perspective-query-table`)).toHaveCount(
        0,
      );
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-hint`)).toHaveCount(0);
      // Kein Klick-Ziel im Bild (F3).
      await expect(
        page.locator(`${SEL.markdownBody0} .perspective-query-chart [data-fm-path]`),
      ).toHaveCount(0);

      // Geteilte Ansicht: dieselbe Grafik in der Vorschau.
      await page.locator(SEL.viewBtn('split')).click();
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      expect(await diagrammBild(page, SEL.markdownBody0)).toEqual(balken);

      // Live-Ansicht: dasselbe Bild im Block-Widget.
      await page.locator(SEL.viewBtn('live')).click();
      expect(await diagrammBild(page, SEL.editorContent0)).toEqual(balken);

      // Die Angabe im Quelltext auf «line» ändern und NICHT speichern.
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
      await page.locator(`${SEL.editorContent0} .cm-line`, { hasText: /^DISPLAY bar$/ }).click();
      await page.keyboard.press('End');
      await page.keyboard.press('Shift+Home');
      await page.keyboard.type('DISPLAY line');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      // Den Cursor aus dem Block nehmen, damit die Live-Ansicht ihn als Widget zeigt.
      await page.keyboard.press('Control+Home');

      await page.locator(SEL.viewBtn('live')).click();
      const live = page.locator(`${SEL.editorContent0} .perspective-query-chart`);
      await expect(live).toHaveAttribute('data-query-chart', 'line', { timeout: 15000 });
      expect(await diagrammBild(page, SEL.editorContent0)).toEqual({
        ...balken,
        art: 'line',
        beschreibung: 'Liniendiagramm mit 2 Datenreihen und 3 Rubriken',
      });
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('FQ-08: Perspective-Abfrage — gruppiertes Diagramm, Hinweis-Zeilen und Rückfall mit Grund', () => {
  test('je Gruppe eine Rubrik, Zeilen unter dem Bild, Liste und Tabelle ohne Zahl mit Hinweis', async () => {
    const { dir, datei } = makeBuchFixtureDir(
      GRUPPEN_ABFRAGE,
      BUCH_ABFRAGE('bar'),
      LISTEN_ABFRAGE,
      TEXT_ABFRAGE,
    );
    const { app, page, userData } = await launchApp({ args: [datei] });
    const bloecke = page.locator(`${SEL.markdownBody0} .perspective-query`);
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await expect(bloecke).toHaveCount(4, { timeout: 15000 });

      // Gruppiert: je Autor eine Rubrik, Anzahl und Seiten-Summe als Reihen, keine Zeile.
      expect(await diagrammBild(page, SEL.markdownBody0, 0)).toEqual({
        art: 'bar',
        beschreibung: 'Balkendiagramm mit 2 Datenreihen und 2 Rubriken',
        zeilen: [],
      });
      const gruppen = bloecke.nth(0).locator('svg');
      for (const name of ['Ada', 'Bo']) await expect(gruppen).toContainText(name);

      // Ungruppiert: übergangene Spalte und ausgelassener Wert, je eine Zeile unter dem Bild.
      expect((await diagrammBild(page, SEL.markdownBody0, 1)).zeilen).toEqual(BUCH_ZEILEN);

      // Liste: die gewohnte Liste mit dem Hinweis, dass ein Diagramm eine Tabelle braucht.
      await expect(bloecke.nth(2).locator('.perspective-query-hint')).toHaveText(
        DE['query.hint.displayFormChartNotTable'].replace('{name}', 'bar'),
      );
      await expect(bloecke.nth(2).locator('a.perspective-query-item')).toHaveCount(3);
      // Ohne Zahl-Spalte: die gewohnte Tabelle mit dem Hinweis auf die fehlende Zahl.
      await expect(bloecke.nth(3).locator('.perspective-query-hint')).toHaveText(
        DE['query.hint.displayFormChartNoNumbers'].replace('{name}', 'bar'),
      );
      await expect(bloecke.nth(3).locator('table.perspective-query-table')).toBeVisible();
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-chart`)).toHaveCount(2);
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-error`)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

const EINSTELLUNGEN = '.pane-group[data-pane="0"] .pane-system .settings-page';

// Den Schalter «Diagramm einer Abfrage» unter Einstellungen → Erweiterungen
// bedienen und mit OK bestätigen (Weg des Anwenders, Muster EW-01).
async function schalteAbfrageDiagramm(page, an) {
  await oeffneEinstellungsSeite(page);
  await page.locator(`${EINSTELLUNGEN} .settings-nav-entry[data-section-id="extensions"]`).click();
  await expect(page.locator('#settings-extensions-list')).toBeVisible();
  const schalter = page.locator('#settings-extension-query-chart');
  if (an) await schalter.check();
  else await schalter.uncheck();
  await page.locator('#btn-settings-ok').click();
  await expect(page.locator(EINSTELLUNGEN)).toBeHidden();
}

test.describe('FQ-09: Perspective-Abfrage — Diagramm-Darstellung ausgeschaltet und wieder an', () => {
  test('aus: die Tabelle mit dem Hinweis «ausgeschaltet»; wieder an: das Diagramm', async () => {
    const { dir, datei } = makeBuchFixtureDir(BUCH_ABFRAGE('bar'));
    const { app, page, userData } = await launchApp({ args: [datei] });
    const bild = page.locator(`${SEL.markdownBody0} .perspective-query-chart`);
    const tabelle = page.locator(`${SEL.markdownBody0} table.perspective-query-table`);
    const hinweis = page.locator(`${SEL.markdownBody0} .perspective-query-hint`);
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await expect(bild.locator('svg')).toBeVisible({ timeout: 15000 });

      await schalteAbfrageDiagramm(page, false);
      await expect(tabelle).toBeVisible({ timeout: 15000 });
      await expect(hinweis).toHaveText(DE['query.hint.displayFormOff'].replace('{name}', 'bar'));
      await expect(bild).toHaveCount(0);
      await expect(tabelle.locator('tbody a.perspective-query-item')).toHaveText([
        'Gamma',
        'Alpha',
        'Beta',
      ]);

      await schalteAbfrageDiagramm(page, true);
      await expect(bild.locator('svg')).toBeVisible({ timeout: 15000 });
      await expect(tabelle).toHaveCount(0);
      await expect(hinweis).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
      cleanupDir(dir);
    }
  });
});

// --- FQ-10: Druck und PDF hell bei dunklem Farbschema --------------------------
// Muster DD-01 in diagramme-druck.spec.js: im PDF an den Füllfarben der
// entpackten Seiten-Inhalte, beim Druck am Zustand der Seite im Augenblick des
// Druck-Aufrufs (ersetztes `webContents.print`). Die Farbwerte kommen aus den
// Schema-Daten mit den mitgelieferten Standard-Schemata. Zwei Reihen ergeben
// die ersten beiden Reihen-Farben.
const HELL = [1, 2].map((i) => BASE_DEFAULTS.light[`chart${i}`]);
const DUNKEL = [1, 2, 3, 4].map((i) => BASE_DEFAULTS.dark[`chart${i}`]);
const STANDARD_SCHEMATA = {
  language: 'de',
  colorSchemes: { custom: [], activeLight: 'standard-light', activeDark: 'standard-dark' },
};

// Füll- und Strichfarben des PDFs als Hex-Werte, aus allen entpackten
// FlateDecode-Streams (Muster pdf-export.spec.js).
function pdfFarben(buffer) {
  const raw = buffer.toString('latin1');
  const teile = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const ende = raw.indexOf('endstream', start);
    if (ende < 0) continue;
    try {
      teile.push(zlib.inflateSync(buffer.subarray(start, ende)).toString('latin1'));
    } catch {
      // Nicht-Flate-Stream (Schriften, Bilder) — für die Farben ohne Belang.
    }
  }
  const kanal = (v) =>
    Math.round(parseFloat(v) * 255)
      .toString(16)
      .padStart(2, '0');
  const farben = new Set();
  const farbe = /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(?:rg|RG)\b/g;
  const inhalt = teile.join('\n');
  while ((m = farbe.exec(inhalt)) !== null) {
    farben.add(`#${kanal(m[1])}${kanal(m[2])}${kanal(m[3])}`);
  }
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

// Füllfarben der Abfrage-Diagramme der gerenderten Ansicht der ersten Spalte,
// wie der Druck sie rastert (ein Live-Widget im Editor gehört nicht dazu).
const ERFASSE_ABFRAGE = `(() => ({
  theme: document.documentElement.getAttribute('data-theme'),
  fuellungen: [...new Set(Array.from(document.querySelectorAll(
    '.pane-group[data-pane="0"] .markdown-body .perspective-query-chart path[fill]'))
    .filter((p) => !p.closest('.cm-editor'))
    .map((p) => (p.getAttribute('fill') || '').toLowerCase())
    .filter((f) => f.startsWith('#')))],
}))()`;

async function druckeMitStub(app, page) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, erfasse) => {
      globalThis.__fqDruck = [];
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.print = (options, callback) => {
          win.webContents.executeJavaScript(erfasse).then(
            (stand) => {
              globalThis.__fqDruck.push(stand);
              callback(true, '');
            },
            (err) => {
              globalThis.__fqDruck.push({ fehler: String(err) });
              callback(true, '');
            },
          );
        };
      }
    },
    ERFASSE_ABFRAGE,
  );
  await hauptSenden(app, ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:print');
  });
  await expect
    .poll(() => hauptLesen(app, () => globalThis.__fqDruck.length), { timeout: 30000 })
    .toBe(1);
  await expect(page.locator('body.printing')).toHaveCount(0);
  return hauptLesen(app, () => globalThis.__fqDruck[0]);
}

// Erste Füllfarbe des Abfrage-Diagramms in einer Ansicht; Pfade ohne Füllung
// ('none', Achsen und Gitter) zählen nicht, wie in DD-01.
async function ersteFarbe(page, root) {
  const fuellungen = await page
    .locator(`${root} .perspective-query-chart path[fill]`)
    .evaluateAll((pfade) => pfade.map((p) => (p.getAttribute('fill') || '').toLowerCase()));
  return fuellungen.find((f) => f.startsWith('#')) || '-';
}

test.describe('FQ-10: Perspective-Abfrage — Diagramm in Druck und PDF hell bei dunklem Farbschema', () => {
  test('hell in Druck und PDF aus Lese- und Live-Ansicht, danach wieder dunkel', async () => {
    const { dir, datei } = makeBuchFixtureDir(BUCH_ABFRAGE('bar'));
    const { app, page, userData } = await launchApp({
      args: [datei],
      settings: STANDARD_SCHEMATA,
    });
    try {
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-chart svg`)).toBeVisible({
        timeout: 20000,
      });
      await page.evaluate(() => window.api.setThemePref('dark'));
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect.poll(() => ersteFarbe(page, SEL.markdownBody0)).toBe(DUNKEL[0]);

      for (const ansicht of ['rendered', 'live']) {
        if (ansicht === 'live') await page.locator(SEL.viewBtn('live')).click();
        const druck = await druckeMitStub(app, page);
        expect(druck.theme, ansicht).toBe('light');
        expect(
          HELL.filter((f) => druck.fuellungen.includes(f)),
          ansicht,
        ).toEqual(HELL);
        expect(
          DUNKEL.filter((f) => druck.fuellungen.includes(f)),
          ansicht,
        ).toEqual([]);

        const farben = await exportierePdf(app, page, path.join(dir, `${ansicht}.pdf`));
        expect(
          HELL.filter((f) => farben.has(f)),
          ansicht,
        ).toEqual(HELL);
        expect(
          DUNKEL.filter((f) => farben.has(f)),
          ansicht,
        ).toEqual([]);

        // Danach zeichnet die Anzeige wieder dunkel, im Live-Modus das Widget.
        const root = ansicht === 'live' ? SEL.editorContent0 : SEL.markdownBody0;
        await expect.poll(() => ersteFarbe(page, root)).toBe(DUNKEL[0]);
      }
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
