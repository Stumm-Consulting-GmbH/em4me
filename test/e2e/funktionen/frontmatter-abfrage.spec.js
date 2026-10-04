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
