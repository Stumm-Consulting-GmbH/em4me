// 4T-000418 (Epic 3E-000079): Perspective Datatable — Grid-Anzeige mit Typ-
// Symbolen, Fehler-Zellen, lokalisierter Aggregat-Zeile; Paritaet im
// Live-Modus. describe-Titel tragen die Funktions-IDs (DT-01 …); die
// Abdeckungs-Matrix-Eintraege liefert der Hilfe-/Handbuch-Task 4T-000422.
// 4T-000419: Grid-Editor (DT-04 …) — typ-validierte Zell-Eingabe, Boolean-
// Toggle, Zeilen-Aktionen, Rueckschreib-Kontrolle im Quelltext, Undo,
// zwei Tabellen im Dokument, Read-only-Reading.
// 4T-002013 (Epic 3E-000332): DT-16, ein Verweis in einer Text-Zelle steht
// unter den Rückverweisen des Ziels, und das Umbenennen des Ziels ändert die
// Zelle.
// 4T-001987 (Epic 3E-000332): DT-14 und DT-15, die Vorschlagsliste im
// Zell-Editor der Live- und der geteilten Ansicht.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { hauptSenden } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'datentabelle.md');

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('DT-01: Datentabelle rendert als typisiertes Grid', () => {
  test('Kopf mit Typ-Symbol, Zahl im Spalten-Format, Boolean-Checkbox, Fehler-Zelle mit Tooltip', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      const grids = body.locator('.perspective-datatable .pdt-grid');
      await expect(grids).toHaveCount(2);
      const first = grids.first();
      // Kopfzeile: Spaltenname plus dezentes Typ-Symbol.
      await expect(first.locator('th .pdt-type').first()).toHaveText('text');
      // Zahl gemaess Anzeige-Format number(2).
      await expect(first.locator('td[data-dt-col="1"]').first()).toHaveText('12.50');
      // Boolean als read-only Checkbox (bleibt disabled).
      const checkbox = first.locator('td[data-dt-col="2"] input[type="checkbox"]').first();
      await expect(checkbox).toBeChecked();
      await expect(checkbox).toBeDisabled();
      // Fehler-Zelle: Rohtext bleibt sichtbar, Tooltip ist lokalisiert (DE).
      const errorCell = first.locator('td.pdt-cell-error');
      await expect(errorCell).toHaveText('kaputt');
      await expect(errorCell).toHaveAttribute('title', /Zahl/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DT-02: Aggregat-Zeile rechnet und ist lokalisiert', () => {
  test('sum/avg/count mit lokalisierter Beschriftung; Fehler-Zelle fliesst nicht ein', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const foot = page.locator(SEL.markdownBody0).locator('.pdt-grid tfoot').first();
      const aggs = foot.locator('.pdt-agg');
      // Betrag: sum+avg (ohne die Fehler-Zelle: 12.5 - 3 = 9.5); Erledigt: count der x-Zellen.
      await expect(aggs).toHaveCount(3);
      await expect(aggs.nth(0)).toContainText('Summe');
      await expect(aggs.nth(0).locator('.pdt-agg-value')).toHaveText('9.50');
      await expect(aggs.nth(1)).toContainText('Durchschnitt');
      await expect(aggs.nth(1).locator('.pdt-agg-value')).toHaveText('4.75');
      await expect(aggs.nth(2)).toContainText('Anzahl');
      await expect(aggs.nth(2).locator('.pdt-agg-value')).toHaveText('2');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// Editor-Helfer: geteilte Ansicht aktivieren und Grid + Quelltext-Pane liefern.
async function openSplit(page) {
  await page.locator(SEL.viewBtn('split')).click();
  const grid = page.locator(SEL.markdownBody0).locator('.perspective-datatable[data-dt-index="0"]');
  await expect(grid.locator('.pdt-grid')).toBeVisible();
  return { grid, editor: page.locator(SEL.editorContent0) };
}

test.describe('DT-04: Zell-Eingabe mit Typ-Zwang schreibt in den Quelltext', () => {
  test('gueltiger Wert wird uebernommen (Quelltext, Anzeige, Aggregat, Dirty, Undo)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const { grid, editor } = await openSplit(page);
      await grid.locator('tr[data-dt-row="0"] td[data-dt-col="1"]').click();
      const input = grid.locator('input.pdt-cell-input');
      await expect(input).toBeVisible();
      await input.fill('20');
      await input.press('Enter');
      // Rueckschreib-Kontrolle: kanonischer Fence-Body im Quelltext.
      await expect(editor).toContainText(/\| Anna \| 20\s+\| x \|/);
      // Grid zeigt den Wert im Spalten-Format, Aggregat rechnet neu (20 - 3).
      const freshGrid = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-datatable[data-dt-index="0"]');
      await expect(freshGrid.locator('tr[data-dt-row="0"] td[data-dt-col="1"]')).toHaveText(
        '20.00',
      );
      await expect(freshGrid.locator('tfoot .pdt-agg-value').first()).toHaveText('17.00');
      // Dokument ist regulaer dirty.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
      // Undo laeuft ueber die Editor-Historie (Tastatur-Undo braucht den
      // Edit-Modus; die Grid-Uebernahme selbst laeuft wie der Checkbox-
      // Toggle auch ohne ihn).
      await page.locator(SEL.btnEdit).click();
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+z');
      await expect(editor).toContainText('12.5');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('ungueltiger Wert wird abgewiesen, Zelle bleibt im Edit-Modus, Esc verwirft', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const { grid, editor } = await openSplit(page);
      await grid.locator('tr[data-dt-row="0"] td[data-dt-col="1"]').click();
      const input = grid.locator('input.pdt-cell-input');
      await input.fill('abc');
      await input.press('Enter');
      // Abgewiesen: Input bleibt offen und ist als ungueltig markiert.
      await expect(input).toBeVisible();
      await expect(input).toHaveClass(/pdt-input-invalid/);
      await input.press('Escape');
      await expect(grid.locator('tr[data-dt-row="0"] td[data-dt-col="1"]')).toHaveText('12.50');
      // Quelltext unveraendert, kein Dirty.
      await expect(editor).toContainText('12.5');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DT-05: Boolean-Toggle direkt in der Zelle', () => {
  test('Klick auf die Boolean-Zelle toggelt x/leer im Quelltext', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const { grid, editor } = await openSplit(page);
      await grid.locator('tr[data-dt-row="1"] td[data-dt-col="2"]').click();
      const freshGrid = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-datatable[data-dt-index="0"]');
      await expect(
        freshGrid.locator('tr[data-dt-row="1"] td[data-dt-col="2"] input'),
      ).toBeChecked();
      await expect(editor).toContainText(/\| Bert \| -3\s+\| x \|/);
      // Anzahl-Aggregat (Erledigt:count) steigt von 2 auf 3.
      await expect(freshGrid.locator('tfoot .pdt-agg').nth(2)).toContainText('3');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DT-06: Zeilen hinzufuegen und loeschen, zwei Tabellen bleiben getrennt', () => {
  test('Zeile in Tabelle 2 anlegen und fuellen, Zeile loeschen; Tabelle 1 unveraendert', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const { editor } = await openSplit(page);
      const table2 = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-datatable[data-dt-index="1"]');
      await expect(table2.locator('.pdt-grid')).toBeVisible();
      // Zeile hinzufuegen: neue Zeile entsteht am Daten-Ende und oeffnet
      // die erste Zelle direkt zur Eingabe.
      await table2.locator('.pdt-add-btn').click();
      const freshTable2 = () =>
        page.locator(SEL.markdownBody0).locator('.perspective-datatable[data-dt-index="1"]');
      const input = freshTable2().locator('input.pdt-cell-input');
      await expect(input).toBeVisible();
      await input.fill('9');
      await input.press('Enter');
      await expect(editor).toContainText(/\| 9 \|/);
      await expect(freshTable2().locator('tbody tr')).toHaveCount(2);
      // Zeile loeschen (erste Zeile mit 7).
      await freshTable2().locator('tr[data-dt-row="0"] .pdt-del-btn').click({ force: true });
      await expect(freshTable2().locator('tbody tr')).toHaveCount(1);
      await expect(editor).not.toContainText('| 7 |');
      // Rueckschreiben trifft nur den zweiten Fence: Tabelle 1 unveraendert.
      await expect(editor).toContainText(/\| Anna \| 12.5\s+\| x \|/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DT-07: Reading bleibt read-only', () => {
  test('in der Reading-Ansicht gibt es keine Editier-Affordanzen und kein Edit-Input', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      // Default-Ansicht ist Reading; Grid sichtbar, Affordanzen versteckt.
      const grid = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-datatable[data-dt-index="0"]');
      await expect(grid.locator('.pdt-grid')).toBeVisible();
      await expect(grid.locator('.pdt-add-btn')).toBeHidden();
      await expect(grid.locator('.pdt-del-btn').first()).toBeHidden();
      await grid.locator('tr[data-dt-row="0"] td[data-dt-col="1"]').click();
      await expect(grid.locator('input.pdt-cell-input')).toHaveCount(0);
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DT-08: Bearbeitung im Live-Block-Widget', () => {
  test('Zell-Eingabe im Live-Modus aktualisiert Widget und Dokument', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('live')).click();
      const liveGrid = page.locator(`${SEL.editorContent0} .perspective-datatable`).first();
      await expect(liveGrid.locator('.pdt-grid')).toBeVisible({ timeout: 15000 });
      await liveGrid.locator('tr[data-dt-row="0"] td[data-dt-col="1"]').click();
      const input = page.locator(`${SEL.editorContent0} input.pdt-cell-input`);
      await expect(input).toBeVisible();
      await input.fill('15');
      await input.press('Enter');
      // Widget baut ueber die Doc-Aenderung neu: Wert und Summe frisch.
      const rebuilt = page.locator(`${SEL.editorContent0} .perspective-datatable`).first();
      await expect(rebuilt.locator('tr[data-dt-row="0"] td[data-dt-col="1"]')).toHaveText('15.00', {
        timeout: 15000,
      });
      await expect(rebuilt.locator('tfoot .pdt-agg-value').first()).toHaveText('12.00');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DT-09: Spaltenkopf-Klick sortiert die Ansicht typ-gerecht', () => {
  test('auf/ab/aufgehoben; der Quelltext bleibt unveraendert (kein Dirty)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      // Ansichts-Funktion wirkt auch in der Reading-Default-Ansicht.
      const grid = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-datatable[data-dt-index="0"]');
      await expect(grid.locator('.pdt-grid')).toBeVisible();
      const betragHeader = grid.locator('th.pdt-col[data-dt-col="1"]');
      const firstRowBetrag = grid
        .locator('tbody tr:not(.pdt-row-hidden)')
        .first()
        .locator('td[data-dt-col="1"]');
      // 1. Klick: aufsteigend (-3 zuerst; Fehler-Zelle 'kaputt' ans Ende).
      await betragHeader.click();
      await expect(betragHeader).toHaveClass(/pdt-sort-asc/);
      await expect(firstRowBetrag).toHaveText('-3.00');
      await expect(grid.locator('tbody tr').last().locator('td[data-dt-col="1"]')).toHaveText(
        'kaputt',
      );
      // 2. Klick: absteigend.
      await betragHeader.click();
      await expect(betragHeader).toHaveClass(/pdt-sort-desc/);
      await expect(firstRowBetrag).toHaveText('12.50');
      // 3. Klick: aufgehoben (Dokument-Reihenfolge, Anna zuerst).
      await betragHeader.click();
      await expect(betragHeader).not.toHaveClass(/pdt-sort-asc|pdt-sort-desc/);
      await expect(grid.locator('tbody tr').first()).toHaveAttribute('data-dt-row', '0');
      // Reine Ansicht: kein Dirty, nichts geschrieben.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-001286 (Epic 3E-000232): Der Filter-Umschalter darf keinen Spaltenkopf
// verdecken.
//
// Anlass ist die Schwester-Behebung 4T-001278: Dort lag `.pev-filter-toggle` der
// Ereignis-Ansicht absolut ueber der Ansichts-Leiste und fing deren Klicks ab —
// unter Linux, wo die breitere Schrift die Klick-Mitte des Nachbar-Knopfs unter
// ihn schob. `.pdt-filter-toggle` ist zeichengleich gebaut (`position: absolute;
// top: 2px; right: 0; opacity: 0; z-index: 1`, ohne `font: inherit`). Eine
// Ansichts-Leiste gibt es hier nicht, wohl aber die **klickbaren Spaltenkoepfe**
// darunter: Der Funktions-Katalog nennt beide nebeneinander («Klick auf den
// Spaltenkopf; Filter-Umschalter am rechten Tabellen-Rand»).
//
// Der Fall misst und klickt, wie in 4T-001278 begruendet: Die reine Geometrie
// liesse eine geaenderte Stapel-Reihenfolge durch, und der reine Klick sagt
// nichts ueber den Abstand. Im roten Fall gibt er die Zahlen aus, die die
// Ursachen-Kandidaten trennen — das erspart unter Linux eine eigene Nachmessung
// im Container.
test.describe('DT-12: Filter-Umschalter verdeckt keinen Spaltenkopf (4T-001286)', () => {
  test('Umschalter und rechtester Spaltenkopf ueberlappen nicht; der Sortier-Klick kommt an', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const tabelle = page.locator(SEL.markdownBody0).locator('.perspective-datatable').first();
      // Der Knopf traegt opacity: 0 und wird erst beim Ueberfahren sichtbar;
      // seine Klick-Flaeche besteht unabhaengig davon.
      await tabelle.hover();
      await expect(tabelle.locator('.pdt-filter-toggle')).toHaveCount(1);

      const mass = await tabelle.evaluate((el) => {
        const f = el.querySelector('.pdt-filter-toggle');
        const koepfe = [...el.querySelectorAll('.pdt-grid th.pdt-col')];
        const letzter = koepfe[koepfe.length - 1];
        const lies = (n) => {
          const r = n.getBoundingClientRect();
          const s = getComputedStyle(n);
          return {
            links: Math.round(r.left),
            rechts: Math.round(r.right),
            oben: Math.round(r.top),
            unten: Math.round(r.bottom),
            schrift: s.fontFamily,
            groesse: s.fontSize,
            zeiger: s.pointerEvents,
          };
        };
        return { filter: lies(f), kopf: lies(letzter), spalten: koepfe.length };
      });

      const waagerecht =
        mass.filter.links < mass.kopf.rechts && mass.kopf.links < mass.filter.rechts;
      const senkrecht = mass.filter.oben < mass.kopf.unten && mass.kopf.oben < mass.filter.unten;
      expect(
        waagerecht && senkrecht,
        `Filter-Umschalter verdeckt den rechtesten Spaltenkopf — der Sortier-Klick ` +
          `kann dort ausfallen.\nfilter: ${JSON.stringify(mass.filter)}\n` +
          `kopf  : ${JSON.stringify(mass.kopf)} (von ${mass.spalten} Spalten)`,
      ).toBe(false);

      // Beide Bedienelemente derselben Leiste setzen in derselben Schrift. Ein
      // <button> erbt sie NICHT von selbst — fehlt `font: inherit`, faellt er
      // auf die Vorgabe der Anzeige-Umgebung zurueck, und die Leiste laeuft in
      // zwei Rueckfallketten. Genau das war in 4T-001278 gemessen (Arial gegen
      // Segoe UI) und ist unabhaengig von einem Ueberlapp ein Mangel.
      expect(
        mass.filter.schrift,
        `Der Filter-Umschalter setzt in einer anderen Schrift als die Tabelle:\n` +
          `filter: ${mass.filter.schrift}\nkopf  : ${mass.kopf.schrift}`,
      ).toBe(mass.kopf.schrift);

      // Und der Klick muss ankommen: Playwright scheitert hier mit «intercepts
      // pointer events», wenn etwas davorliegt.
      const letzterKopf = tabelle.locator('.pdt-grid th.pdt-col').last();
      await letzterKopf.click({ timeout: 10000 });
      await expect(letzterKopf).toHaveClass(/pdt-sort-(asc|desc)/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DT-10: Filter-Zeile mit gefilterten Aggregaten und n-von-m-Zaehler', () => {
  test('Text-Filter reduziert die Ansicht, Editieren trifft die richtige Zeile, Zustand ueberlebt den Tab-Wechsel', async () => {
    const SECOND = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'mehrspalten.md');
    const { app, page, userData } = await launchApp({ args: [FIXTURE, SECOND] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      // Ersten Tab aktivieren und in die geteilte Ansicht wechseln.
      await page.locator(SEL.tabs0).nth(0).click();
      const { grid, editor } = await openSplit(page);
      // Filter-Zeile einblenden und nach 'ber' filtern.
      await grid.locator('.pdt-filter-toggle').click();
      const filterInput = grid.locator('.pdt-filter-row td[data-dt-col="0"] input');
      await filterInput.fill('ber');
      await expect(grid.locator('tbody tr:not(.pdt-row-hidden)')).toHaveCount(1);
      await expect(grid.locator('.pdt-filter-count')).toHaveText('1 von 3 Zeilen');
      // Gefilterte Aggregate: Summe ueber die sichtbare Zeile (-3).
      await expect(grid.locator('tfoot .pdt-agg-value').first()).toHaveText('-3.00');
      // Editieren in gefilterter Ansicht trifft die richtige Quelltext-Zeile.
      await grid.locator('tr[data-dt-row="1"] td[data-dt-col="1"]').click();
      const input = grid.locator('input.pdt-cell-input');
      await input.fill('5');
      await input.press('Enter');
      await expect(editor).toContainText(/\| Bert \| 5\s+\|/);
      // Filter-Zustand ueberlebt das Re-Render der Uebernahme.
      const fresh = () =>
        page.locator(SEL.markdownBody0).locator('.perspective-datatable[data-dt-index="0"]');
      await expect(fresh().locator('tbody tr:not(.pdt-row-hidden)')).toHaveCount(1);
      await expect(fresh().locator('tfoot .pdt-agg-value').first()).toHaveText('5.00');
      // Zustand ueberlebt den Tab-Wechsel (pro Tab im Renderer-Zustand).
      await page.locator(SEL.tabs0).nth(1).click();
      await page.locator(SEL.tabs0).nth(0).click();
      await expect(fresh().locator('.pdt-filter-row input').first()).toHaveValue('ber');
      await expect(fresh().locator('tbody tr:not(.pdt-row-hidden)')).toHaveCount(1);
      await expect(fresh().locator('.pdt-filter-count')).toHaveText('1 von 3 Zeilen');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DT-11: Berechnete Spalte rechnet pro Zeile und reagiert live (4T-000421)', () => {
  test('Formel-Werte im Grid; Eingabe in der Eingangs-Spalte aktualisiert den berechneten Wert', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const { grid } = await openSplit(page);
      // Doppelt = Betrag * 2: 12.5 -> 25.00; leere Eingabe (kaputt) bleibt leer.
      const computedCell = (row) => grid.locator(`tr[data-dt-row="${row}"] td[data-dt-col="3"]`);
      await expect(computedCell(0)).toHaveText('25.00');
      await expect(computedCell(0)).toHaveClass(/pdt-computed/);
      await expect(computedCell(2)).toHaveText('');
      // Berechnete Zellen sind read-only: Klick oeffnet kein Eingabefeld.
      await computedCell(0).click();
      await expect(grid.locator('input.pdt-cell-input')).toHaveCount(0);
      // Eingabe in der Eingangs-Spalte aktualisiert den berechneten Wert.
      await grid.locator('tr[data-dt-row="0"] td[data-dt-col="1"]').click();
      const input = grid.locator('input.pdt-cell-input');
      await input.fill('10');
      await input.press('Enter');
      const fresh = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-datatable[data-dt-index="0"]');
      await expect(fresh.locator('tr[data-dt-row="0"] td[data-dt-col="3"]')).toHaveText('20.00');
      // Berechnete Werte stehen nicht im Quelltext.
      await expect(page.locator(SEL.editorContent0)).not.toContainText('20.00');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DT-03: Live-Modus zeigt dasselbe Grid als Block-Widget', () => {
  test('nach Wechsel in den Live-Modus rendert das Grid mit Aggregat-Zeile im Editor', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('live')).click();
      const liveGrid = page.locator(`${SEL.editorContent0} .perspective-datatable .pdt-grid`);
      await expect(liveGrid.first()).toBeVisible({ timeout: 15000 });
      await expect(liveGrid.first().locator('td[data-dt-col="1"]').first()).toHaveText('12.50');
      // Aggregat-Beschriftung ist auch im Widget lokalisiert (applyTranslations).
      await expect(liveGrid.first().locator('.pdt-agg-label').first()).toHaveText('Summe');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- 4T-001313 (Epic 3E-000235): Spaltenkopf — Anzeigetext und Typangabe -------

const FIXTURE_KOPF = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'datentabelle-spaltenkopf.md',
);

test.describe('DT-13: Anzeige-Ueberschrift und abschaltbare Typangabe', () => {
  test('der Kopf zeigt den Anzeigetext, keine Typangabe und die Kennung im Merkzettel', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE_KOPF] });
    try {
      await waitForTab(page);
      const grid = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-datatable[data-dt-index="0"]');
      await expect(grid.locator('.pdt-grid')).toBeVisible();
      const kopf = grid.locator('th[data-dt-col="0"]');
      await expect(kopf.locator('.pdt-name')).toHaveText('Betrag (brutto, in Euro)');
      // Typangabe abgeschaltet: kein Typ-Feld im ganzen Kopf.
      await expect(grid.locator('th .pdt-type')).toHaveCount(0);
      // Die Kennung bleibt ueber den Merkzettel erreichbar; sie wird beim
      // Schreiben eines Ausdrucks gebraucht.
      await expect(kopf).toHaveAttribute('title', /Betrag/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('eine Zell-Aenderung schreibt Anzeigetext und Typ-Zeile unveraendert zurueck', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE_KOPF] });
    try {
      await waitForTab(page);
      const { grid, editor } = await openSplit(page);
      await grid.locator('tr[data-dt-row="0"] td[data-dt-col="0"]').click();
      const input = grid.locator('input.pdt-cell-input');
      await expect(input).toBeVisible();
      await input.fill('20');
      await input.press('Enter');
      // Der Wert ist uebernommen …
      await expect(editor).toContainText('| 20');
      // … und beide Kopf-Angaben stehen unveraendert im Quelltext. Das ist
      // der eigentliche Nachweis: Der Serialisierer schreibt den ganzen Block
      // neu, und ohne sie verloere ein Zellklick still die Beschriftung.
      await expect(editor).toContainText('Betrag "Betrag (brutto, in Euro)":number(2)');
      await expect(editor).toContainText('Gesamt "Gesamt = Betrag mal zwei":number(2)');
      await expect(editor).toContainText('types: hidden');
      // Der Ausdruck der berechneten Spalte spricht weiter die Kennung an.
      await expect(editor).toContainText('= Betrag * 2');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- 4T-002013 (Epic 3E-000332): Verweise in Text-Zellen im Verweis-Netz -------
//
// Geprüft wird die Kette vom Datei-Inhalt bis zur Bedienung an der realen
// Konstellation: ein Bereich auf der Platte, der Index des Hauptprozesses, das
// Rückverweis-Panel und das Umbenennen über das Kontextmenü mit Vorschau. Die
// Einzelregeln (Spalten-Typen, Kopfzeilen, Inline-Code) stehen auf der
// Unit-Ebene (datentabelle-zell-scan.test.js, link-rewrite.test.js).

// Datei-Zeile des Bereichs-Panels mit exakter Beschriftung (Muster
// bereichs-panel.spec.js: 'Ziel' steckt auch in 'Zielort').
function dateiZeile(section, beschriftung) {
  return section.locator('.area-file-row', { hasText: new RegExp(`^${beschriftung}$`) });
}

test.describe('DT-16: Rückverweis und Umbenennen aus einer Datentabellen-Zelle (4T-002013)', () => {
  test('das Ziel nennt die Tabelle unter seinen Rückverweisen, das Umbenennen ändert die Zelle', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-dt16-'));
    fs.writeFileSync(path.join(dir, 'Ziel.md'), '# Ziel\n', 'utf8');
    const quelle = [
      '# Quelle',
      '',
      '```perspective-datatable',
      'columns: Name:text, Betrag:number(2)',
      '| [[Ziel]] | 12.50 |',
      '```',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(dir, 'Quelle.md'), quelle, 'utf8');
    const { app, page, userData } = await launchApp();
    try {
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(section).toBeVisible();
      await expect(section.locator('.area-file-row')).toHaveCount(2);

      // AK1: Das Ziel führt die Tabelle unter seinen Rückverweisen. Vor
      // 4T-002013 blieb das Panel leer, weil der Index den Inhalt jedes
      // Code-Blocks übersprang.
      await dateiZeile(section, 'Ziel').click();
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab')).toHaveCount(1);
      await page.locator('#btn-backlinks').click();
      const bl = page.locator('.pane-group[data-pane="0"] .sidebar-backlinks');
      await expect(bl).toBeVisible();
      await expect(
        bl.locator('.backlinks-group').first().locator('.backlinks-group-name'),
      ).toHaveText('Quelle', { timeout: 15000 });

      // AK3: Umbenennen über das Kontextmenü. Die Vorschau nennt die Tabelle,
      // und danach steht der neue Name in der Zelle; die Zahl-Spalte bleibt.
      await dateiZeile(section, 'Ziel').click({ button: 'right' });
      await page.locator('#context-menu [data-menu-id="area-file-rename"]').click();
      await expect(page.locator('#name-input-modal')).toBeVisible();
      await page.locator('#name-input-field').fill('Zielort');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator('#link-preview-modal')).toBeVisible();
      await expect(page.locator('#link-preview-list')).toContainText('Quelle.md');
      await page.locator('#btn-link-preview-continue').click();
      await expect(page.locator('#link-report-modal')).toBeVisible();
      await page.locator('#btn-link-report-ok').click();

      expect(fs.existsSync(path.join(dir, 'Zielort.md'))).toBe(true);
      await expect
        .poll(() => fs.readFileSync(path.join(dir, 'Quelle.md'), 'utf8'))
        .toBe(quelle.replace('| [[Ziel]] |', '| [[Zielort]] |'));
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        // Temp-Verzeichnis bleibt liegen; unkritisch.
      }
    }
  });
});

// --- 4T-001987 (Epic 3E-000332): Vorschlagsliste im Zell-Editor ----------------
//
// Einträge, Reihenfolge und eingefügter Text sind auf der Unit-Ebene gegen die
// unveränderten Quellen geprüft (datentabelle-vorschlaege.test.js). Hier steht,
// was nur die laufende Anwendung zeigt: dass die Liste am Feld einer Text-Zelle
// in beiden bearbeitbaren Ansichten erscheint, dieselben Einträge zeigt wie die
// Liste des Editors im Fließtext, ganz zu sehen ist, Vorrang vor der
// Zell-Bedienung hat, solange sie offen ist, und dass der übernommene Verweis
// danach in der Zelle anklickbar ist. Aufbau und Aufwärmen des Index nach dem
// Muster von tabellen-zell-vorschlaege.spec.js.

const VL_LISTE = '.cm-live-tabelle-vorschlaege';
const VL_LABEL = `${VL_LISTE} .cm-completionLabel`;
const VL_EDITOR_LISTE = '.cm-tooltip-autocomplete:not(.cm-live-tabelle-vorschlaege)';

const VL_DOKUMENT = [
  '# Tabelle',
  '',
  '```perspective-datatable',
  'columns: Name:text, Betrag:number(2), Notiz:text',
  '| Anna | 12.5 | erste |',
  '| Bert | 3 | |',
  '```',
  '',
  'Fliesstext unter der Tabelle.',
  '',
  'Letzte Zeile.',
  '',
].join('\n');

// Vier Ziele mit gegenläufiger Alphabet- und Zeit-Folge, die Schlagworte eines
// häufig, eines selten (Muster TV-01).
function baueVorschlagsBereich() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dt-vorschlaege-'));
  const setzeZeit = (datei, tag) => {
    const zeit = new Date(Date.UTC(2020, 0, 1 + tag, 12, 0, 0));
    fs.utimesSync(datei, zeit, zeit);
  };
  const tabelle = path.join(dir, 'Tabelle.md');
  fs.writeFileSync(tabelle, VL_DOKUMENT, 'utf8');
  setzeZeit(tabelle, 0);
  ['Alpha', 'Beta', 'Gamma', 'Delta'].forEach((name, i) => {
    const datei = path.join(dir, `${name}.md`);
    const selten = name === 'Alpha' ? ' #bau-aaa' : '';
    fs.writeFileSync(datei, `# ${name}\n\nText #bau-zzz${selten} dazu.\n`, 'utf8');
    setzeZeit(datei, i + 1);
  });
  return { dir, tabelle };
}

function raeumeVorschlagsBereichAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

async function liveBearbeiten(app, page) {
  await waitForTab(page);
  await hauptSenden(app, ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send('menu:viewChange', 'live');
  });
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

const vlZeile = (page, text) =>
  page.locator(`${SEL.editorContent0} .cm-line`).filter({ hasText: text }).first();

// Der erste Aufruf stößt den Index-Aufbau an und liefert noch keine Vorschläge
// (B-18); aufgewärmt wird in der letzten Zeile, danach ist sie wieder leer.
async function waermeIndexAuf(page) {
  const liste = page.locator(VL_EDITOR_LISTE);
  await vlZeile(page, 'Letzte Zeile.').click();
  await page.keyboard.press('End');
  for (const [anfang, zeichen] of [
    ['[[', 'A'],
    ['#', 'b'],
  ]) {
    await page.keyboard.type(`\n${anfang}${zeichen}`);
    await expect
      .poll(
        async () => {
          if (await liste.first().isVisible()) return true;
          await page.keyboard.press('Backspace');
          await page.keyboard.type(zeichen);
          return liste.first().isVisible();
        },
        { timeout: 30000, intervals: [400] },
      )
      .toBe(true);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(liste.first()).toBeHidden();
  }
}

async function quelltext(page) {
  return await page.evaluate((P) => {
    const el = document.querySelector(P);
    if (!el || !el.cmTile) return null;
    let tile = el.cmTile;
    while (tile.parent) tile = tile.parent;
    return tile && tile.view ? tile.view.state.doc.toString() : null;
  }, SEL.editorContent0);
}

// Zelle öffnen und die Schreibmarke ans Ende ihres Textes setzen (das Feld
// öffnet mit markiertem Inhalt).
async function oeffneDtZelle(grid, zeile, spalte) {
  await grid.locator(`tr[data-dt-row="${zeile}"] td[data-dt-col="${spalte}"]`).click();
  const feld = grid.locator('input.pdt-cell-input');
  await expect(feld).toBeVisible();
  await feld.press('End');
  return feld;
}

test.describe('DT-14: Vorschlagsliste in der Text-Zelle der Live-Ansicht (4T-001987)', () => {
  test('nach [[ dieselben Ziele wie im Fliesstext, Uebernahme ins Feld, danach anklickbar (AK1, AK2, AK3)', async () => {
    const { dir, tabelle } = baueVorschlagsBereich();
    const { app, page, userData } = await launchApp({ args: [tabelle] });
    try {
      await liveBearbeiten(app, page);
      await waermeIndexAuf(page);
      const grid = () => page.locator(`${SEL.editorContent0} .perspective-datatable`).first();

      const feld = await oeffneDtZelle(grid(), 0, 0);
      await page.keyboard.type(' [[');
      await expect(page.locator(VL_LISTE)).toBeVisible({ timeout: 10000 });
      const inZelle = await page.locator(VL_LABEL).allTextContents();
      expect(inZelle.slice(0, 4)).toEqual(['Delta', 'Gamma', 'Beta', 'Alpha']);
      // Es ist die Liste der Zelle, nicht die des Editors.
      await expect(page.locator(VL_EDITOR_LISTE)).toHaveCount(0);

      // Pfeil runter wählt in der Liste; die Eingabetaste schreibt ins Feld,
      // die Zelle bleibt offen.
      const eintrag = (i) => page.locator(`${VL_LISTE} li`).nth(i);
      await expect(eintrag(0)).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('ArrowDown');
      await expect(eintrag(1)).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Enter');
      await expect(page.locator(VL_LISTE)).toHaveCount(0);
      await expect(feld).toHaveValue('Anna [[Gamma]]');
      await expect(grid().locator('td.pdt-editing')).toHaveCount(1);

      // Die zweite Eingabetaste übernimmt die Zelle in den Quelltext.
      await page.keyboard.press('Enter');
      await expect(page.locator(`${SEL.editorContent0} input.pdt-cell-input`)).toHaveCount(0);
      await expect.poll(() => quelltext(page)).toMatch(/\| Anna \[\[Gamma\]\]\s*\| 12\.5/);
      // Danach ist der Verweis in der Zelle anklickbar (4T-002014).
      const verweis = grid().locator('tr[data-dt-row="0"] td[data-dt-col="0"] a.wikilink');
      await expect(verweis).toHaveText('Gamma', { timeout: 15000 });

      // In der Zahl-Spalte erscheint auf [[ keine Liste (Story AK6).
      const zahl = await oeffneDtZelle(grid(), 0, 1);
      await expect(zahl).not.toHaveAttribute('aria-autocomplete', 'list');
      await page.keyboard.type('[[');
      await expect(zahl).toHaveValue('12.5[[');
      await expect(page.locator(VL_LISTE)).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(zahl).toHaveCount(0);

      // Gegenprobe im Fließtext: dieselbe Liste an derselben Zeichenfolge.
      await vlZeile(page, 'Fliesstext unter der Tabelle.').click();
      await page.keyboard.press('End');
      await page.keyboard.type(' [[');
      await expect(page.locator(VL_EDITOR_LISTE).first()).toBeVisible({ timeout: 10000 });
      const imText = await page.locator(`${VL_EDITOR_LISTE} .cm-completionLabel`).allTextContents();
      expect(inZelle).toEqual(imText);

      // Der Klick auf den übernommenen Verweis öffnet das Ziel.
      await page.keyboard.press('Escape');
      await verweis.click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Gamma');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeVorschlagsBereichAuf(dir);
    }
  });
});

test.describe('DT-15: Vorschlagsliste in der geteilten Ansicht, Tasten-Vorrang (4T-001987)', () => {
  test('# in der leeren letzten Zelle ganz sichtbar, Escape und Tabulator wie zugesagt (AK1, AK2, AK3)', async () => {
    const { dir, tabelle } = baueVorschlagsBereich();
    const { app, page, userData } = await launchApp({ args: [tabelle] });
    try {
      await liveBearbeiten(app, page);
      await waermeIndexAuf(page);
      const { grid } = await openSplit(page);

      // Letzte Zeile, letzte Spalte, leere Zelle.
      const feld = await oeffneDtZelle(grid, 1, 2);
      await expect(feld).toHaveValue('');
      // `#bau` statt `#b`, wie in TV-02: Auf `#b` bot die Quelle im ersten Lauf
      // zusätzlich ein Schlagwort `b` an, vermutlich aus dem Aufwärmen, das
      // `#b` tippt. Die Folge der beiden Schlagworte ist davon unberührt.
      await page.keyboard.type('#bau');
      const liste = page.locator(VL_LISTE);
      await expect(liste).toBeVisible({ timeout: 10000 });
      expect(await page.locator(VL_LABEL).allTextContents()).toEqual(['bau-zzz', 'bau-aaa']);
      // Ganz im Fenster und nicht verdeckt: In der Mitte und an zwei Ecken der
      // Liste liegt die Liste selbst.
      await expect(liste).toBeInViewport({ ratio: 1 });
      const sichtbar = await liste.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return [
          [r.left + r.width / 2, r.top + r.height / 2],
          [r.left + 4, r.top + 4],
          [r.right - 4, r.bottom - 4],
        ].every(([x, y]) => el.contains(document.elementFromPoint(x, y)));
      });
      expect(sichtbar).toBe(true);

      // Pfeil runter und Eingabetaste schreiben ins Feld, die zweite
      // Eingabetaste übernimmt die Zelle; das Schlagwort ist danach anklickbar.
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(liste).toHaveCount(0);
      await expect(feld).toHaveValue('#bau-aaa');
      await page.keyboard.press('Enter');
      await expect(grid.locator('input.pdt-cell-input')).toHaveCount(0);
      await expect(page.locator(SEL.editorContent0)).toContainText('#bau-aaa');
      const schlagwort = grid.locator('tr[data-dt-row="1"] td[data-dt-col="2"] a.tag-link');
      await expect(schlagwort).toHaveText('#bau-aaa');
      await expect(schlagwort).toHaveAttribute('href', '#tag:bau-aaa');

      // Escape schließt bei offener Liste nur die Liste; die Zelle bleibt offen.
      const erste = await oeffneDtZelle(grid, 0, 0);
      await page.keyboard.type(' #ba');
      await expect(liste).toBeVisible({ timeout: 10000 });
      await page.keyboard.press('Escape');
      await expect(liste).toHaveCount(0);
      await expect(grid.locator('tr[data-dt-row="0"] td[data-dt-col="0"].pdt-editing')).toHaveCount(
        1,
      );
      await expect(erste).toHaveValue('Anna #ba');

      // Erneut geöffnet: Der Tabulator schließt die Liste, übernimmt die
      // Zelle und öffnet die nächste.
      await page.keyboard.type('u');
      await expect(liste).toBeVisible({ timeout: 10000 });
      await page.keyboard.press('Tab');
      await expect(liste).toHaveCount(0);
      await expect(page.locator(SEL.editorContent0)).toContainText('Anna #bau');
      await expect(
        grid.locator('tr[data-dt-row="0"] td[data-dt-col="1"].pdt-editing input.pdt-cell-input'),
      ).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeVorschlagsBereichAuf(dir);
    }
  });
});
