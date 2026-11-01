// 4T-002258 (Epic 3E-000371): Im Live-Modus sortiert ein Klick auf einen
// Spaltenkopf der Datentabelle auch nach einem vorangehenden Zell-Klick, und das
// Raster bleibt stehen; je bei aus- und eingeschaltetem Bearbeiten. Eigene Datei
// mit eigener Fall-Familie (KZ-01 …), weil datentabelle.spec.js an seinem
// Zeilen-Budget steht.
//
// Gemessen am 2026-10-30: Der Zell-Klick legt die Auswahl des Browsers in die
// Zelle; die Änderung am Raster beim Sortieren ließ den Editor diese Auswahl als
// Schreibmarke am Anfang des Blocks lesen, und der Live-Modus zeigte den Block
// als Quelltext. Behoben in der Live-Einbettung (liveWidgetAuswahlFilter in
// live-interaction.js) für jede Block-Art. KZ-03 und KZ-04 sind die Gegenproben:
// Pfeiltasten betreten und verlassen den Block weiter, und das Ereignis-Widget
// sortiert nach einem Klick in sein Formular ebenso, ohne aufzuklappen.
//
// ANKER: Vor dem Kopf-Klick ist das Raster sichtbar, in Ausgangs-Reihenfolge,
// und die Zell-Eingabe ist geschlossen; ohne ihn wäre ein «Raster weg» kein
// Befund, sondern ein Nicht-Ergebnis.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'datentabelle-kopf-nach-zelle.md',
);
const QUELL_EDITOR = '.pane-group[data-pane="0"] .pane-source-editor';

// Text der Zeile unter der Schreibmarke (Zugang wie in datenbank-tabelle.spec.js).
async function schreibmarkenZeile(page) {
  return await page.evaluate((P) => {
    const el = document.querySelector(P);
    if (!el || !el.cmTile) return null;
    let tile = el.cmTile;
    while (tile.parent) tile = tile.parent;
    if (!tile || !tile.view) return null;
    const st = tile.view.state;
    return st.doc.lineAt(st.selection.main.head).text;
  }, SEL.editorContent0);
}

async function pruefeKopfNachZelle(page, { bearbeiten }) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await page.locator(SEL.viewBtn('live')).click();
  if (bearbeiten) {
    await page.locator(SEL.btnEdit).click();
    await expect(page.locator(QUELL_EDITOR)).not.toHaveClass(/read-only/);
  } else {
    await expect(page.locator(QUELL_EDITOR)).toHaveClass(/read-only/);
  }
  const widget = page.locator(`${SEL.editorContent0} .perspective-datatable`);
  await expect(widget.locator('.pdt-grid')).toBeVisible({ timeout: 15000 });
  const reihenfolge = () =>
    widget.locator('tbody tr').evaluateAll((z) => z.map((tr) => tr.dataset.dtRow).join(','));
  await expect.poll(reihenfolge).toBe('0,1');
  expect(await schreibmarkenZeile(page)).toBe('# Datentabelle Kopf nach Zelle');

  // Zell-Klick in «800»; bei eingeschaltetem Bearbeiten öffnet er die Eingabe,
  // Escape schließt sie wieder.
  await widget.locator('tr[data-dt-row="0"] td[data-dt-col="1"]').click();
  const eingabe = widget.locator('input.pdt-cell-input');
  if (bearbeiten) {
    await expect(eingabe).toBeVisible();
    await eingabe.press('Escape');
  }
  await expect(eingabe).toHaveCount(0);

  // Kopf-Klick auf «Betrag»: aufsteigend, «Strom» (Zeile 1) steht oben.
  await widget.locator('th.pdt-col[data-dt-col="1"]').click();
  await expect(widget).toHaveCount(1);
  await expect(widget.locator('.pdt-grid')).toBeVisible();
  await expect.poll(reihenfolge).toBe('1,0');
  await expect(widget.locator('th.pdt-col[data-dt-col="1"]')).toHaveClass(/pdt-sort-asc/);
  // Die Schreibmarke bleibt, wo sie war; gemessen sprang sie auf die
  // Fence-Zeile des Blocks.
  expect(await schreibmarkenZeile(page)).toBe('# Datentabelle Kopf nach Zelle');
  await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
}

test.describe('KZ-01: Live-Modus, Bearbeiten aus, Kopf-Klick nach Zell-Klick sortiert', () => {
  test('Raster bleibt stehen, Reihenfolge wechselt', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await pruefeKopfNachZelle(page, { bearbeiten: false });
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('KZ-02: Live-Modus, Bearbeiten ein, Kopf-Klick nach Zell-Klick und Escape sortiert', () => {
  test('Raster bleibt stehen, Reihenfolge wechselt', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await pruefeKopfNachZelle(page, { bearbeiten: true });
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('KZ-03: Gegenprobe Pfeiltasten durch ein Dokument mit Datentabelle', () => {
  test('betreten und verlassen den Block, auch nach Zell- und Kopf-Klick', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await pruefeKopfNachZelle(page, { bearbeiten: true });
      const widget = page.locator(`${SEL.editorContent0} .perspective-datatable`);
      // Nach dem Kopf-Klick liegt der Fokus im Editor; zwei Zeilen tiefer steht
      // die Schreibmarke auf der Fence-Zeile, und der Block zeigt den Quelltext.
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await expect.poll(() => schreibmarkenZeile(page)).toBe('```perspective-datatable');
      await expect(widget).toHaveCount(0);
      // Durch den Block hindurch bis hinter die schließende Fence: Das Raster
      // kehrt zurück.
      for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowDown');
      await expect.poll(() => schreibmarkenZeile(page)).toBe('');
      await expect(widget.locator('.pdt-grid')).toBeVisible();
      // Und zurück nach oben über den Block auf die Überschrift.
      for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowUp');
      await expect.poll(() => schreibmarkenZeile(page)).toBe('# Datentabelle Kopf nach Zelle');
      await expect(widget.locator('.pdt-grid')).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

const EREIGNISSE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'ereignisse.md');

test.describe('KZ-04: Gegenprobe Ereignis-Tabelle, Sortieren nach Klick in das Formular', () => {
  test('das Widget bleibt stehen, die Sortierung wechselt', async () => {
    const { app, page, userData } = await launchApp({ args: [EREIGNISSE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.viewBtn('live')).click();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(QUELL_EDITOR)).not.toHaveClass(/read-only/);
      const widget = page.locator(`${SEL.editorContent0} .perspective-events`);
      const kopf = widget.locator('th[data-ev-sort="date"]');
      // ANKER: Ausgangs-Sortierung absteigend nach Zeitpunkt (Vorbild EV-07).
      await expect(kopf).toHaveClass(/pev-sort-desc/, { timeout: 15000 });
      await widget.locator('.pev-form-text').click();
      await kopf.click();
      await expect(widget).toHaveCount(1);
      await expect(kopf).not.toHaveClass(/pev-sort-desc/);
      expect(await schreibmarkenZeile(page)).toBe('# Ereignis-Test');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
