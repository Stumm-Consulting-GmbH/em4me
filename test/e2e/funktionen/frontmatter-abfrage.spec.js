// 4T-0355 (Epic 3E-0065): E2E-Funktions-Suite Frontmatter-Abfrage
// (perspective-query). Prüft die dynamische, klickbare Datei-Liste in der
// Render-Pane, die Live-Aktualisierung bei neuer passender Datei und die
// Parität im Live-Modus. describe-Titel tragen die Matrix-IDs (Eintrag in
// test/abdeckungs-matrix.json erfolgt mit dem Funktions-Katalog in 4T-0356).
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

// 4T-0404 (Epic 3E-0076): Tabellen-Ausgabe mit Sortierung (4T-0403). Eigene
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

// 4T-0405 (Epic 3E-0076): Mehrspalten-Layout der Ergebnis-Liste (COLUMNS n)
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
