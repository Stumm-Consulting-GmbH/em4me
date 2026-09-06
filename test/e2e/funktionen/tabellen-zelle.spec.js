// 4T-001345 (Epic 3E-000239): E2E-Funktions-Specs der stehenden Tabelle und
// ihrer Zell-Eingabe. Geprueft wird am laufenden Programm, was der Unit-Fall
// nicht erreicht: dass die Tabelle mit der Schreibmarke in ihr gerendert
// stehen bleibt und unveraendert aussieht, dass die bearbeitete Zelle ohne
// Layout-Sprung erkennbar ist, dass Getipptes an der richtigen Stelle des
// Quelltextes ankommt und dass die Wege daneben — Code-Block, Undo, Redo,
// Aenderungs-Zustand, Quelltext-Ansicht — unberuehrt bleiben.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'tabellen-klick.md');

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

async function liveBearbeiten(app, page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await sendMenuChannel(app, 'menu:viewChange', 'live');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

const ersteTabelle = (page) => page.locator(`${SEL.editorContent0} .cm-live-block table`).first();
const eingabe = (page) => page.locator('.cm-live-tabelle-eingabe');

async function editorZeilen(page) {
  return await page
    .locator(SEL.editorContent0)
    .evaluate((el) => Array.from(el.querySelectorAll('.cm-line')).map((z) => z.textContent));
}

async function datenZeile(page, index) {
  return await ersteTabelle(page).evaluate(
    (t, i) =>
      Array.from(t.querySelectorAll('tbody tr')[i].querySelectorAll('td')).map(
        (c) => c.textContent,
      ),
    index,
  );
}

// Zelle oeffnen, Inhalt vollstaendig ersetzen, uebernehmen.
async function schreibeZelle(page, zelle, text) {
  await zelle.click();
  await expect(eingabe(page)).toBeVisible();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect(eingabe(page)).toHaveCount(0);
}

test.describe('TZ-01: Tabelle bleibt bei stehender Schreibmarke', () => {
  test('die Tabelle bleibt gerendert und sieht unveraendert aus (AK1, AK2)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      const tabelle = ersteTabelle(page);
      await expect(tabelle).toBeVisible();
      const gestalt = async () =>
        await tabelle.evaluate((t) => ({
          zellen: Array.from(t.querySelectorAll('th, td')).map((c) => ({
            text: c.textContent,
            bearbeitet: c.classList.contains('cm-live-tabelle-bearbeitet'),
          })),
          breite: t.getBoundingClientRect().width,
          hoehe: t.getBoundingClientRect().height,
        }));
      const vorher = await gestalt();
      await page
        .locator(`${SEL.editorContent0} .cm-line`)
        .filter({ hasText: 'Absatz vor der Tabelle.' })
        .first()
        .click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      // AK1: kein Aufklappen in den Quelltext.
      await expect(tabelle).toBeVisible();
      const zeilen = await editorZeilen(page);
      expect(zeilen.some((z) => z.trim() === '| A | B | C |')).toBe(false);
      // 4T-001346: Der Pfeiltasten-Weg endet sichtbar in einer Zelle.
      await expect(eingabe(page)).toBeVisible();
      await expect(tabelle.locator('.cm-live-tabelle-bearbeitet')).toHaveCount(1);
      // AK2: dieselbe Darstellung wie ohne Schreibmarke in der Tabelle — kein
      // Wechsel des Mediums, kein Sprung im Layout. Gemeint ist ausdruecklich
      // nicht ein Zeichen-gleiches DOM: Die eine bearbeitete Zelle MUSS sich
      // abheben, das verlangt AK3. Verglichen wird deshalb alles ausser ihr.
      const nachher = await gestalt();
      expect(nachher.zellen).toHaveLength(vorher.zellen.length);
      expect(nachher.zellen.filter((z) => z.bearbeitet)).toHaveLength(1);
      for (let i = 0; i < nachher.zellen.length; i++) {
        if (nachher.zellen[i].bearbeitet) continue;
        expect(nachher.zellen[i].text, `Zelle ${i} hat sich geaendert`).toBe(vorher.zellen[i].text);
      }
      expect(Math.abs(nachher.breite - vorher.breite)).toBeLessThanOrEqual(1);
      expect(Math.abs(nachher.hoehe - vorher.hoehe)).toBeLessThanOrEqual(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TZ-02: Kennzeichnung der bearbeiteten Zelle', () => {
  test('die Zelle ist erkennbar, und die Tabelle springt beim Zellwechsel nicht (AK3)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      const tabelle = ersteTabelle(page);
      await expect(tabelle).toBeVisible();
      // Gemessen wird die Tabelle als Ganzes: Ein Sprung beim Oeffnen oder
      // Wechseln einer Zelle zeigte sich an ihrer Breite oder Hoehe. Die
      // Toleranz von einem Pixel ist die Rundung der Feld-Breite auf ganze
      // Pixel; ohne die Festlegung der Breite lag der Unterschied bei 142 px
      // (gemessen am 2026-09-04), also beim Doppelten der Tabellen-Breite.
      const masse = async () =>
        await tabelle.evaluate((t) => {
          const r = t.getBoundingClientRect();
          return { breite: r.width, hoehe: r.height, links: r.left, oben: r.top };
        });
      const nah = (ist, soll) => {
        for (const feld of Object.keys(soll)) {
          expect(Math.abs(ist[feld] - soll[feld]), `${feld} weicht ab`).toBeLessThanOrEqual(1);
        }
      };
      const vorher = await masse();

      const ersteZelle = tabelle.locator('tbody tr').first().locator('td').nth(0);
      await ersteZelle.click();
      await expect(eingabe(page)).toBeVisible();
      await expect(ersteZelle).toHaveClass(/cm-live-tabelle-bearbeitet/);
      const inErsterZelle = await masse();

      // Zellwechsel: zweite Zelle derselben Zeile.
      const zweiteZelle = tabelle.locator('tbody tr').first().locator('td').nth(1);
      await zweiteZelle.click();
      await expect(zweiteZelle).toHaveClass(/cm-live-tabelle-bearbeitet/);
      await expect(ersteZelle).not.toHaveClass(/cm-live-tabelle-bearbeitet/);
      const inZweiterZelle = await masse();

      nah(inErsterZelle, vorher);
      nah(inZweiterZelle, vorher);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TZ-03: Getippter Text im Quelltext', () => {
  test('der Text steht danach an der richtigen Stelle des Quelltextes (AK4)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      const tabelle = ersteTabelle(page);
      await expect(tabelle).toBeVisible();
      await schreibeZelle(
        page,
        tabelle.locator('tbody tr').first().locator('td').nth(1),
        'geaendert',
      );
      expect(await datenZeile(page, 0)).toEqual(['a1', 'geaendert', 'c1']);
      // Gegenprobe im Quelltext: nur die Zelle ist ersetzt, der Rest der
      // Tabelle steht Zeichen fuer Zeichen unveraendert.
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      const zeilen = await editorZeilen(page);
      expect(zeilen).toContain('| a1 | geaendert | c1 |');
      expect(zeilen).toContain('| A | B | C |');
      expect(zeilen).toContain('| --- | --- | --- |');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TZ-04: Pipe-Zeichen als Text', () => {
  test('ein getipptes Pipe-Zeichen zerstoert die Tabelle nicht (AK5)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      const tabelle = ersteTabelle(page);
      await expect(tabelle).toBeVisible();
      await schreibeZelle(page, tabelle.locator('tbody tr').first().locator('td').nth(1), 'a|b');
      // Die Tabelle hat weiterhin drei Spalten, und das Zeichen steht als Text
      // in der Zelle statt als Zell-Trenner zu wirken.
      const zellen = await datenZeile(page, 0);
      expect(zellen).toHaveLength(3);
      expect(zellen[1]).toBe('a|b');
      expect(zellen[2]).toBe('c1');
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      const zeilen = await editorZeilen(page);
      expect(zeilen.some((z) => z.includes('a\\|b'))).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TZ-05: Undo und Redo', () => {
  test('eine Zell-Aenderung ist ein Schritt (AK6)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      const tabelle = ersteTabelle(page);
      await expect(tabelle).toBeVisible();
      await schreibeZelle(
        page,
        tabelle.locator('tbody tr').first().locator('td').nth(1),
        'geaendert',
      );
      expect(await datenZeile(page, 0)).toEqual(['a1', 'geaendert', 'c1']);
      await page.keyboard.press('Control+z');
      await expect.poll(async () => (await datenZeile(page, 0))[1]).toBe('b1');
      // Der Rest des Dokuments ist dabei unberuehrt geblieben.
      expect(await datenZeile(page, 0)).toEqual(['a1', 'b1', 'c1']);
      await page.keyboard.press('Control+y');
      await expect.poll(async () => (await datenZeile(page, 0))[1]).toBe('geaendert');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TZ-06: Aenderungs-Zustand', () => {
  test('die Datei gilt nach einer Zell-Aenderung als geaendert (AK7)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      const tabelle = ersteTabelle(page);
      await expect(tabelle).toBeVisible();
      const schmutzigVorher = await page.evaluate(
        () => !!document.querySelector('.tab.dirty, .tab .tab-dirty'),
      );
      expect(schmutzigVorher).toBe(false);
      await schreibeZelle(
        page,
        tabelle.locator('tbody tr').first().locator('td').nth(1),
        'geaendert',
      );
      await expect
        .poll(async () =>
          page.evaluate(() => !!document.querySelector('.tab.dirty, .tab .tab-dirty')),
        )
        .toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TZ-07: Abbruch mit Escape', () => {
  test('Escape verwirft die Eingabe, ohne zu schreiben', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      const tabelle = ersteTabelle(page);
      await expect(tabelle).toBeVisible();
      const zelle = tabelle.locator('tbody tr').first().locator('td').nth(1);
      await zelle.click();
      await expect(eingabe(page)).toBeVisible();
      await page.keyboard.press('Control+a');
      await page.keyboard.type('verworfen');
      await page.keyboard.press('Escape');
      await expect(eingabe(page)).toHaveCount(0);
      expect(await datenZeile(page, 0)).toEqual(['a1', 'b1', 'c1']);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TZ-08: Andere Block-Konstrukte', () => {
  test('ein Code-Block klappt weiterhin auf (AK10)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      const codeWidget = page.locator(`${SEL.editorContent0} .cm-live-block pre`);
      await expect(codeWidget).toBeVisible();
      // Erreicht wird der Code-Block ueber die Tastatur: Sein Widget reicht
      // Zeiger-Ereignisse nicht an den Editor weiter, und das ist genau der
      // Bestandszustand, den dieser Fall bewahrt sehen will.
      await page
        .locator(`${SEL.editorContent0} .cm-line`)
        .filter({ hasText: 'Ein Code-Block als Gegenprobe' })
        .first()
        .click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      // Der Code-Block zeigt seinen Quelltext, sobald die Schreibmarke in ihm
      // steht — die Tabellen-Ausnahme greift nur fuer Tabellen.
      await expect
        .poll(async () => (await editorZeilen(page)).some((z) => z.trim() === '```js'))
        .toBe(true);
      // Die Tabelle daneben steht unveraendert gerendert.
      await expect(ersteTabelle(page)).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TZ-09: Quelltext-Ansicht', () => {
  test('der Tabellen-Quelltext steht unveraendert zur Verfuegung (AK11)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      const zeilen = await editorZeilen(page);
      expect(zeilen).toContain('| A | B | C |');
      expect(zeilen).toContain('| --- | --- | --- |');
      expect(zeilen).toContain('| a1 | b1 | c1 |');
      await expect(page.locator(`${SEL.editorContent0} .cm-live-block`)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
