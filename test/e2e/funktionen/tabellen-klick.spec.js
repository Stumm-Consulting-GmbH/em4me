// 4T-001344 (Epic 3E-000239): E2E-Funktions-Specs des Klicks in die gerenderte
// Pipe-Tabelle der Live-Ansicht. Geprueft wird am laufenden Programm, was der
// Unit-Fall nicht erreicht: dass der Klick die sichtbar getroffene Zelle meint,
// dass die Wege daneben unveraendert bleiben und dass die Lese-Ansicht
// unberuehrt ist.
//
// **Beobachtet wird an der gerenderten Tabelle, nicht am Quelltext.** Bis
// 4T-001345 klappte die Tabelle nach dem Klick in ihren Quelltext auf, und die
// Faelle lasen die Marke aus den Quelltext-Zeilen. Seit der Aufklapp-Ausnahme
// (Entscheidung E2 des Epics) bleibt die Tabelle stehen; die Marke steht damit
// in der gerenderten Zelle, und dort wird sie gelesen. Der gepruefte Sachverhalt
// ist derselbe geblieben: Der Klick trifft die Zelle, die er sichtbar trifft.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'tabellen-klick.md');
const MARKE = 'ZZMARKEZZ';

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Live-Ansicht mit eingeschaltetem Bearbeiten-Modus.
async function liveBearbeiten(app, page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await sendMenuChannel(app, 'menu:viewChange', 'live');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

// Fenster schmal stellen. Die breite Tabelle rollt nur, wenn sie breiter ist
// als der Bereich, in dem sie steht; auf einem grossen Bildschirm ist der
// Editor-Bereich sonst breiter als jede vertretbar grosse Fixture-Tabelle
// (gemessen am 2026-09-04: 2945 px Bereichs-Breite bei 2945 px Tabelle).
async function fensterSchmal(app, page) {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.setSize(900, 700);
  });
  await expect.poll(async () => await page.evaluate(() => window.innerWidth)).toBeLessThan(1000);
}

const liveTabellen = (page) => page.locator(`${SEL.editorContent0} .cm-live-block table`);

// Die Texte einer Zeile der gerenderten Tabelle. `zeile` ist 'kopf' oder der
// Index einer Datenzeile.
async function zellTexte(page, tabellenIndex, zeile) {
  return await liveTabellen(page)
    .nth(tabellenIndex)
    .evaluate((t, z) => {
      const zellen =
        z === 'kopf'
          ? t.querySelectorAll('thead th')
          : t.querySelectorAll('tbody tr')[z].querySelectorAll('td');
      return Array.from(zellen).map((c) => c.textContent);
    }, zeile);
}

// Die sichtbaren Editor-Zeilen als Text.
async function editorZeilen(page) {
  return await page
    .locator(SEL.editorContent0)
    .evaluate((el) => Array.from(el.querySelectorAll('.cm-line')).map((z) => z.textContent));
}

// Klick in eine Zelle, Marke tippen, Uebernahme mit Enter.
async function markiereZelle(page, zelle) {
  await zelle.click();
  await expect(page.locator('.cm-live-tabelle-eingabe')).toBeVisible();
  await page.keyboard.type(MARKE);
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-live-tabelle-eingabe')).toHaveCount(0);
}

test.describe('TK-01: Klick in eine Datenzelle', () => {
  test('die Schreibmarke landet in der angeklickten Zelle (AK1, AK3)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      const tabelle = liveTabellen(page).first();
      await expect(tabelle).toBeVisible();
      await markiereZelle(page, tabelle.locator('tbody tr').first().locator('td').nth(1));
      const zellen = await zellTexte(page, 0, 0);
      expect(zellen[0]).toBe('a1');
      // Die Marke steht IN der Zelle, an der angeklickten Stelle des
      // Zell-Textes (AK3): Der Bestand der Zelle bleibt, die Marke kommt dazu.
      expect(zellen[1]).toContain(MARKE);
      expect(zellen[1].replace(MARKE, '')).toBe('b1');
      expect(zellen[2]).toBe('c1');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-02: Klick in eine Kopfzelle', () => {
  test('die Schreibmarke landet in der angeklickten Kopfzelle (AK2)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      const tabelle = liveTabellen(page).first();
      await expect(tabelle).toBeVisible();
      await markiereZelle(page, tabelle.locator('thead th').nth(2));
      const zellen = await zellTexte(page, 0, 'kopf');
      expect(zellen[0]).toBe('A');
      expect(zellen[1]).toBe('B');
      expect(zellen[2]).toContain(MARKE);
      expect(zellen[2].replace(MARKE, '')).toBe('C');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-03: Klick in eine leere Zelle', () => {
  test('die Schreibmarke landet in der leeren Zelle (AK4)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      const tabelle = liveTabellen(page).first();
      await expect(tabelle).toBeVisible();
      await markiereZelle(page, tabelle.locator('tbody tr').nth(1).locator('td').nth(1));
      const zellen = await zellTexte(page, 0, 1);
      expect(zellen[0]).toBe('a2');
      expect(zellen[1]).toBe(MARKE);
      expect(zellen[2]).toBe('c2');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-04: Klick neben die Tabelle', () => {
  test('der Absatz vor der Tabelle nimmt die Eingabe wie zuvor (AK5)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      const absatz = page
        .locator(`${SEL.editorContent0} .cm-line`)
        .filter({ hasText: 'Absatz vor der Tabelle.' })
        .first();
      await absatz.click();
      await page.keyboard.type(MARKE);
      const zeilen = await editorZeilen(page);
      const treffer = zeilen.filter((z) => z.includes(MARKE));
      expect(treffer).toHaveLength(1);
      expect(treffer[0]).toContain('Absatz vor der Tabelle.');
      // Die Tabelle bleibt unberuehrt und ohne geoeffnete Zelle stehen.
      await expect(liveTabellen(page).first()).toBeVisible();
      await expect(page.locator('.cm-live-tabelle-eingabe')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-05: Weg ueber die Pfeiltasten', () => {
  test('von ausserhalb fuehrt die Pfeiltaste weiterhin in die Tabelle (AK6)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await expect(liveTabellen(page).first()).toBeVisible();
      await page
        .locator(`${SEL.editorContent0} .cm-line`)
        .filter({ hasText: 'Absatz vor der Tabelle.' })
        .first()
        .click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      // In der Tabelle angekommen: Ihre Zeile ist die aktive Zeile des Editors.
      // Dass sie dabei gerendert stehen bleibt, ist Gegenstand von 4T-001345.
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const t = document.querySelector('.cm-editor .cm-live-block table');
            const zeile = t ? t.closest('.cm-line') : null;
            return !!zeile && zeile.classList.contains('cm-activeLine');
          }),
        )
        .toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-06: Lese-Ansicht', () => {
  test('ein Klick in die Tabelle der Lese-Ansicht setzt keine Schreibmarke (AK8)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const zelle = page
        .locator(`${SEL.markdownBody0} table tbody tr`)
        .first()
        .locator('td')
        .nth(1);
      await expect(zelle).toBeVisible();
      await zelle.click();
      await expect(page.locator(`${SEL.editorContent0} .cm-cursor-primary`)).toHaveCount(0);
      await expect(page.locator('.cm-live-tabelle-eingabe')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-07: Waagerecht gerollte Tabelle', () => {
  test('der Klick trifft die sichtbar angeklickte Zelle (AK9)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await fensterSchmal(app, page);
      const tabelle = liveTabellen(page).nth(1);
      await expect(tabelle).toBeVisible();
      // Die letzte Spalte liegt ausserhalb des sichtbaren Ausschnitts; der
      // Klick rollt waagerecht dorthin. Gerollt wird im Editor selbst, nicht
      // im Widget-Kasten: Ohne Zeilen-Umbruch ist die Editor-Zeile so breit
      // wie ihr Inhalt, und der Kasten waechst mit ihr (gemessen 2026-09-04).
      await tabelle.locator('tbody tr').first().locator('td').last().click();
      const gerollt = await page.evaluate(() => {
        const s = document.querySelector('.cm-editor .cm-scroller');
        return s ? s.scrollLeft : 0;
      });
      expect(gerollt, 'Ohne waagerechtes Rollen prueft der Fall AK9 nicht').toBeGreaterThan(0);
      await expect(page.locator('.cm-live-tabelle-eingabe')).toBeVisible();
      await page.keyboard.type(MARKE);
      await page.keyboard.press('Enter');
      const zellen = await zellTexte(page, 1, 0);
      expect(zellen).toHaveLength(30);
      expect(zellen[29]).toContain(MARKE);
      expect(zellen[29].replace(MARKE, '')).toBe('z30');
      expect(zellen[28]).toBe('z29');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
