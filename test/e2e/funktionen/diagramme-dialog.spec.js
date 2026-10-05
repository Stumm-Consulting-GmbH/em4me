// 4T-002024 (Epic 3E-000192, Story 4S-001024): Ablauf-Prüfdatei von «Diagramm
// zu dieser Tabelle einfügen» und «Diagramm bearbeiten» — Einfügen und
// Bearbeiten über den Dialog, Kommando-Palette und Menü der Anwendung während
// der Arbeit in einer Zelle, Tastatur, Rückgängig, Diagramm auf ein anderes
// Dokument, Meldung statt Dialog, große Tabelle und Bearbeiten, das während des
// offenen Dialogs ausgeschaltet wird. Die Lagen und Orte der Bedienung (Auswahl,
// gerenderte Hälfte, Lese-Ansicht, Bearbeiten aus, Erweiterung aus, Einbettung,
// zwei Spalten, eingerückter Block, Palette über dem Dialog, Escape) stehen in
// diagramme-bedienung.spec.js; beide teilen die Helfer in
// test/e2e/helpers/diagramme-dialog.js. describe-Titel tragen die
// Fall-Kennungen (hier DE-01, DE-02, DE-02b, DE-04, DE-08, DE-09, DE-10, DE-13,
// DE-14, DE-15, DE-20, DE-21, DE-22) und die Matrix-Kennungen S-157 («Diagramm zu
// dieser Tabelle einfügen»), S-158 («Diagramm bearbeiten»), F-332 (Funktion
// «Diagramm zu einer Datentabelle») und F-334 (Funktion «Diagramm einfügen und
// bearbeiten»).
//
// 4T-002072: Das Einfügen schreibt den Namen einer unbenannten Tabelle als
// erste Kopf-Zeile `table: tabelle-1` in ihren Block und das Diagramm mit
// `table: tabelle-1` ohne Dach-Zeichen (DE-01, DE-10, DE-20, neu DE-21).
//
// Jeder schreibende Fall misst am Text des Editors: Die Kommandos schreiben in
// den Puffer, nicht auf die Platte. Er endet an der Datei, die noch den
// Ausgangs-Text trägt (4T-002026). Das andere Dokument eines Diagramms (DE-08)
// wird ebenso an Puffer und Datei gemessen, weil es gerade unverändert bleiben
// muss. Die Dokumente entstehen je Fall in einem eigenen Temp-Ordner.
'use strict';

const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { SEL } = require('../helpers/selectors');
const { menuZustand, menuEintrag } = require('../helpers/menu-zustand');
const { erwarteDateiUnveraendert } = require('../helpers/dateien');
const { hauptSenden } = require('../helpers/haupt-zugriff');
const {
  P0,
  MENU,
  DIALOG,
  HINWEIS,
  EINFUEGEN,
  BEARBEITEN,
  Z,
  TABELLE,
  OHNE_NAME,
  EINGEFUEGT,
  MIT_DIAGRAMM,
  text,
  marke,
  quelltextZeilen,
  kontextmenue,
  zweiBilder,
  keinKontextmenue,
  palette,
  waehlbar,
  schreibeMenueMit,
  imMenue,
  LIVE_GITTER,
  LIVE_DIAGRAMM,
  GER_GITTER,
  GER_DIAGRAMM,
  oeffneLive,
  oeffneGeteilt,
  markeOben,
  datenzelle,
  rechtsklickUndEintrag,
  bestaetige,
  mitApp,
} = require('../helpers/diagramme-dialog');

// --- Fälle -------------------------------------------------------------------

test.describe('DE-01: Rechtsklick auf das Gitter im Live-Modus, Einfügen über den Dialog (S-157, F-332, F-334)', () => {
  test('Gitter bleibt, Schreibmarke bleibt, genau der eine Eintrag; danach Kopf-Zeile table: im Block, Diagramm-Block, beides gezeichnet (AK1, AK2, AK4, AK5, AK27)', async () => {
    await mitApp({ 'Umsatz.md': OHNE_NAME }, async ({ page, pfade }) => {
      await oeffneLive(page);
      await markeOben(page);
      const gitter = page.locator(LIVE_GITTER).first();
      // Datenzelle, Kopfzelle und der Rand rechts neben dem Gitter (Erhebung
      // P1, P2a, P2b): je dasselbe Menü, der Block bleibt Gitter.
      const rand = await gitter.evaluate((el) => {
        const g = el.querySelector('.pdt-grid').getBoundingClientRect();
        return { x: g.right + 6, y: g.top + 6 };
      });
      const ziele = [
        () => datenzelle(page, LIVE_GITTER).click({ button: 'right' }),
        () => gitter.locator('thead th:not(.pdt-row-del)').first().click({ button: 'right' }),
        () => page.mouse.click(rand.x, rand.y, { button: 'right' }),
      ];
      for (const ziel of ziele) {
        await ziel();
        await expect(page.locator(`${MENU} [data-menu-id="chart-insert"]`)).toBeVisible();
        expect(await kontextmenue(page)).toEqual([{ id: 'chart-insert', text: EINFUEGEN }]);
        await expect(page.locator(`${LIVE_GITTER} .pdt-grid`)).toBeVisible();
        expect(await quelltextZeilen(page)).toEqual([]);
        expect(await marke(page)).toBe(1);
        await page.keyboard.press('Escape');
        await expect(page.locator(MENU)).toBeHidden();
      }

      await rechtsklickUndEintrag(page, datenzelle(page, LIVE_GITTER), 'chart-insert');
      await page.locator(`${MENU} [data-menu-id="chart-insert"]`).click();
      const dialog = page.locator(DIALOG);
      await expect(dialog.locator('h2')).toHaveText(EINFUEGEN);
      // AK2, AK3: die Felder des Dialogs, als Werte nur die Zahl-Spalten.
      await expect(dialog.locator('#chart-dialog-type')).toHaveValue('bar');
      await expect(dialog.locator('#chart-dialog-labels')).toHaveValue('Monat');
      expect(
        await dialog
          .locator('.chart-dialog-liste input')
          .evaluateAll((els) => els.map((e) => e.value)),
      ).toEqual(['Einnahmen', 'Ausgaben']);
      await expect(dialog.locator('#chart-dialog-title')).toBeVisible();
      await bestaetige(page);

      await expect.poll(() => text(page)).toBe(EINGEFUEGT);
      await expect(page.locator(`${LIVE_GITTER} .pdt-grid`)).toBeVisible();
      await expect(page.locator(`${LIVE_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(1, {
        timeout: 15000,
      });
      expect(await quelltextZeilen(page)).toEqual([]);
      expect(await marke(page)).toBe(1);
      // C2: Das neue Diagramm ist ausgewählt.
      await expect(page.locator(LIVE_DIAGRAMM).first()).toHaveClass(/diagramm-gewaehlt/);
      // 4T-002026: Das Kommando schreibt in den Puffer, nicht auf die Platte.
      erwarteDateiUnveraendert(pfade[0], OHNE_NAME);
    });
  });
});

test.describe('DE-02: Kommando-Palette und Menü während der Arbeit in einer Zelle (S-157, F-332, F-334)', () => {
  test('Eingabe der Zelle wird übernommen, das Einfügen wirkt auf diese Tabelle (AK28)', async () => {
    await mitApp({ 'Umsatz.md': OHNE_NAME }, async ({ app, page, pfade }) => {
      await oeffneLive(page);
      await schreibeMenueMit(app);
      await markeOben(page);
      // Vorher: im Menü der Anwendung nicht wählbar.
      expect(menuEintrag(await menuZustand(app, ''), EINFUEGEN).enabled).toBe(false);

      // Klick in die Zelle: Das Menü wird ohne weiteren Anstoß neu gemeldet.
      await datenzelle(page, LIVE_GITTER, 1).click();
      await expect(page.locator('input.pdt-cell-input')).toBeFocused();
      await expect.poll(() => imMenue(app, EINFUEGEN)).toBe(true);
      await page.keyboard.press('Control+a');
      await page.keyboard.type('555');
      const eintraege = await palette(page, EINFUEGEN);
      expect(waehlbar(eintraege, EINFUEGEN)).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.locator(DIALOG)).toBeVisible();
      // Die Eingabe steht im Text, bevor der Dialog bestätigt wird.
      expect((await text(page)).split('\n')[4]).toBe('| Januar  | 555 | 80 |');
      await bestaetige(page);
      await expect
        .poll(() => text(page))
        .toBe(EINGEFUEGT.replace('| Januar  | 100 | 80 |', '| Januar  | 555 | 80 |'));
      await expect(page.locator(`${LIVE_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(1, {
        timeout: 15000,
      });
      // 4T-002026: Das Kommando schreibt in den Puffer, nicht auf die Platte.
      erwarteDateiUnveraendert(pfade[0], OHNE_NAME);
    });
  });

  test('Rechtsklick auf eine andere Zelle bei offener Eingabe: der Wert steht im Text, bevor der Dialog aufgeht, und das Bestätigen schreibt (AK28, PR-5)', async () => {
    await mitApp({ 'Umsatz.md': OHNE_NAME }, async ({ page, pfade }) => {
      await oeffneLive(page);
      await markeOben(page);
      await datenzelle(page, LIVE_GITTER, 1).click();
      await expect(page.locator('input.pdt-cell-input')).toBeFocused();
      await page.keyboard.press('Control+a');
      await page.keyboard.type('555');
      // Der Rechtsklick in das Eingabefeld selbst gehört dem Feld (V6): kein
      // Menü, die Eingabe bleibt offen, der Block Gitter.
      await page.locator('input.pdt-cell-input').click({ button: 'right' });
      await keinKontextmenue(page);
      await expect(page.locator('input.pdt-cell-input')).toBeFocused();
      await expect(page.locator('input.pdt-cell-input')).toHaveValue('555');
      expect(await quelltextZeilen(page)).toEqual([]);
      expect(await marke(page)).toBe(1);
      // Rechtsklick auf eine andere Zelle: das Menü mit dem Eintrag.
      await rechtsklickUndEintrag(page, datenzelle(page, LIVE_GITTER, 4), 'chart-insert');
      await page.locator(`${MENU} [data-menu-id="chart-insert"]`).click();
      await expect(page.locator(DIALOG)).toBeVisible();
      expect((await text(page)).split('\n')[4]).toBe('| Januar  | 555 | 80 |');
      await bestaetige(page);
      await expect
        .poll(() => text(page))
        .toBe(EINGEFUEGT.replace('| Januar  | 100 | 80 |', '| Januar  | 555 | 80 |'));
      await expect(page.locator(HINWEIS)).not.toHaveClass(/visible/);
      // 4T-002026: Das Kommando schreibt in den Puffer, nicht auf die Platte.
      erwarteDateiUnveraendert(pfade[0], OHNE_NAME);
    });
  });
});

test.describe('DE-02b: Menü der Anwendung während der Arbeit in einer Zelle (S-157, F-332, F-334)', () => {
  test('Ansicht › Diagramm › Einfügen mit offener Zell-Eingabe: der Wert wird zuerst übernommen, das Bestätigen schreibt (AK28)', async () => {
    await mitApp({ 'Umsatz.md': OHNE_NAME }, async ({ app, page, pfade }) => {
      await oeffneLive(page);
      await markeOben(page);
      await datenzelle(page, LIVE_GITTER, 1).click();
      await expect(page.locator('input.pdt-cell-input')).toBeFocused();
      await page.keyboard.press('Control+a');
      await page.keyboard.type('555');
      // Der Eintrag des nativen Menüs sendet diesen Kanal (src/main/menu/menu.js);
      // das Menü selbst erreicht der Ablauf-Test nicht. Der Fokus bleibt dabei
      // in der Zell-Eingabe, anders als bei Kontextmenü und Palette.
      await hauptSenden(app, ({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('menu:chartInsert');
      });
      await expect(page.locator(DIALOG)).toBeVisible();
      expect((await text(page)).split('\n')[4]).toBe('| Januar  | 555 | 80 |');
      await bestaetige(page);
      await expect
        .poll(() => text(page))
        .toBe(EINGEFUEGT.replace('| Januar  | 100 | 80 |', '| Januar  | 555 | 80 |'));
      // 4T-002026: Das Kommando schreibt in den Puffer, nicht auf die Platte.
      erwarteDateiUnveraendert(pfade[0], OHNE_NAME);
    });
  });
});

test.describe('DE-04: Rechtsklick auf das Diagramm im Live-Modus, Art umstellen (S-158, F-332, F-334)', () => {
  test('genau der eine Eintrag, kein Quelltext; nach dem Bestätigen sofort neu gezeichnet, übrige Zeilen byte-gleich (AK6, AK7, AK8, AK29)', async () => {
    await mitApp({ 'Umsatz.md': MIT_DIAGRAMM }, async ({ page, pfade }) => {
      await oeffneLive(page, { diagramme: 1 });
      await markeOben(page);
      await rechtsklickUndEintrag(page, page.locator(`${LIVE_DIAGRAMM} svg`).first(), 'chart-edit');
      expect(await kontextmenue(page)).toEqual([{ id: 'chart-edit', text: BEARBEITEN }]);
      expect(await quelltextZeilen(page)).toEqual([]);
      expect(await marke(page)).toBe(1);
      await expect(page.locator(`${LIVE_DIAGRAMM} svg desc`)).toHaveText(
        'Balkendiagramm mit 1 Datenreihe und 3 Rubriken',
      );

      await page.locator(`${MENU} [data-menu-id="chart-edit"]`).click();
      const dialog = page.locator(DIALOG);
      await expect(dialog.locator('h2')).toHaveText(BEARBEITEN);
      await expect(dialog.locator('.chart-dialog-tabelle')).toHaveText('Tabelle: umsatz');
      await expect(dialog.locator('#chart-dialog-type')).toHaveValue('bar');
      await dialog.locator('#chart-dialog-type').selectOption('line');
      await bestaetige(page);

      await expect.poll(() => text(page)).toBe(MIT_DIAGRAMM.replace('type: bar', 'type: line'));
      await expect(page.locator(`${LIVE_DIAGRAMM}[data-chart-state="drawn"] svg desc`)).toHaveText(
        'Liniendiagramm mit 1 Datenreihe und 3 Rubriken',
        { timeout: 15000 },
      );
      expect(await quelltextZeilen(page)).toEqual([]);
      await expect(page.locator(LIVE_DIAGRAMM).first()).toHaveClass(/diagramm-gewaehlt/);
      // 4T-002026: Das Kommando schreibt in den Puffer, nicht auf die Platte.
      erwarteDateiUnveraendert(pfade[0], MIT_DIAGRAMM);
    });
  });
});

test.describe('DE-08: Diagramm auf eine Tabelle in einem anderen Dokument bearbeiten (S-158, F-332, F-334)', () => {
  test('der Dialog zeigt dessen Spalten, auch eine dort ungespeichert ergänzte; das andere Dokument bleibt byte-gleich (AK9, AK13)', async () => {
    const quelle = ['# Quelle', '', ...TABELLE, '^umsatz', ''].join('\n');
    const uebersicht = [
      '# Übersicht',
      '',
      `${Z}perspective-chart`,
      'table: [[Quelle#^umsatz]]',
      'type: bar',
      'labels: Monat',
      'values: Einnahmen',
      Z,
      '',
    ].join('\n');
    await mitApp(
      { 'Übersicht.md': uebersicht, 'Quelle.md': quelle },
      async ({ page, pfade }) => {
        const [dateiU, dateiQ] = pfade;
        await expect(page.locator(P0.tabs)).toHaveCount(2);
        const reiterU = page.locator(P0.tabs, { hasText: 'Übersicht' }).first();
        const reiterQ = page.locator(P0.tabs, { hasText: 'Quelle' }).first();
        await reiterU.click();
        await page.locator(SEL.viewBtn('live')).click();
        await page.locator(SEL.btnEdit).click();
        await expect(page.locator(`${LIVE_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(
          1,
          {
            timeout: 15000,
          },
        );

        // 1. Quelle unverändert geöffnet.
        await rechtsklickUndEintrag(
          page,
          page.locator(`${LIVE_DIAGRAMM} svg`).first(),
          'chart-edit',
        );
        await page.locator(`${MENU} [data-menu-id="chart-edit"]`).click();
        const dialog = page.locator(DIALOG);
        await expect(dialog.locator('.chart-dialog-tabelle')).toHaveText(
          'Tabelle: umsatz im Dokument «Quelle»',
        );
        expect(
          await dialog
            .locator('#chart-dialog-labels option')
            .evaluateAll((els) => els.map((e) => e.value)),
        ).toEqual(['Monat', 'Einnahmen', 'Ausgaben']);
        await dialog.locator('#chart-dialog-type').selectOption('line');
        await bestaetige(page);
        await expect.poll(() => text(page)).toBe(uebersicht.replace('type: bar', 'type: line'));
        expect(fs.readFileSync(dateiQ, 'utf8')).toBe(quelle);
        await expect(reiterQ).not.toHaveClass(/dirty/);

        // 2. In der Quelle ungespeichert eine berechnete Spalte ergänzen.
        await reiterQ.click();
        await page.locator(SEL.viewBtn('source')).click();
        if (!(await page.locator(SEL.btnEdit).getAttribute('class')).includes('active')) {
          await page.locator(SEL.btnEdit).click();
        }
        await page.locator(`${P0.editorContent} .cm-line`, { hasText: 'columns:' }).click();
        await page.keyboard.press('End');
        await page.keyboard.type(', Rest:number = Einnahmen - Ausgaben');
        const pufferQ = quelle.replace(
          'Ausgaben:number',
          'Ausgaben:number, Rest:number = Einnahmen - Ausgaben',
        );
        await expect.poll(() => text(page)).toBe(pufferQ);
        await expect(reiterQ).toHaveClass(/dirty/);
        // Der Lese-Kanal kennt den ungespeicherten Stand (Anker wie in DF-07,
        // damit der Aufruf nicht vor der Meldung des Puffers liegt).
        await expect
          .poll(
            async () =>
              (await page.evaluate((f) => window.api.readChartTableDocument(f, 'Quelle'), dateiU))
                .content,
          )
          .toBe(pufferQ);

        await reiterU.click();
        await expect(page.locator(`${LIVE_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(
          1,
          {
            timeout: 15000,
          },
        );
        await rechtsklickUndEintrag(
          page,
          page.locator(`${LIVE_DIAGRAMM} svg`).first(),
          'chart-edit',
        );
        await page.locator(`${MENU} [data-menu-id="chart-edit"]`).click();
        await expect(dialog.locator('#chart-dialog-type')).toHaveValue('line');
        expect(
          await dialog
            .locator('.chart-dialog-liste label')
            .evaluateAll((els) => els.map((e) => e.textContent)),
        ).toEqual(['Einnahmen', 'Ausgaben', 'Restberechnet']);
        await dialog
          .locator('.chart-dialog-liste label', { hasText: 'Rest' })
          .locator('input')
          .check();
        await bestaetige(page);
        await expect
          .poll(() => text(page))
          .toBe(
            uebersicht
              .replace('type: bar', 'type: line')
              .replace('values: Einnahmen', 'values: Einnahmen, Rest'),
          );
        // Die Quelle: Puffer wie getippt, Datei unverändert.
        expect(fs.readFileSync(dateiQ, 'utf8')).toBe(quelle);
        await reiterQ.click();
        await expect.poll(() => text(page)).toBe(pufferQ);
        // 4T-002026: Auch die Übersicht ist nur im Puffer geändert.
        erwarteDateiUnveraendert(dateiU, uebersicht);
      },
      { args: (pfade) => pfade },
    );
  });
});

test.describe('DE-09: nur mit der Tastatur (S-157, S-158, F-332, F-334)', () => {
  test('Pfeiltasten in den Block, Palette, Dialog mit Tab, Enter und Escape (AK26, AK29)', async () => {
    await mitApp({ 'Umsatz.md': MIT_DIAGRAMM }, async ({ page, pfade }) => {
      await oeffneLive(page, { diagramme: 1 });
      await markeOben(page);
      await page.keyboard.press('Control+Home');
      // Pfeiltasten bis in den Diagramm-Block: sein Quelltext erscheint.
      await expect
        .poll(async () => {
          if ((await marke(page)) < 11) await page.keyboard.press('ArrowDown');
          return marke(page);
        })
        .toBeGreaterThanOrEqual(11);
      await expect.poll(() => quelltextZeilen(page)).toContain(`${Z}perspective-chart`);

      // Bearbeiten über die Palette, Art mit der Pfeiltaste, Enter bestätigt.
      const eintraege = await palette(page, BEARBEITEN);
      expect(waehlbar(eintraege, BEARBEITEN)).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.locator('#chart-dialog-type')).toBeFocused();
      // Tab bleibt im Dialog: Umschalt+Tab vom ersten Feld führt zum letzten Knopf.
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator(`${DIALOG} [data-aktion="bestaetigen"]`)).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#chart-dialog-type')).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await expect(page.locator('#chart-dialog-type')).toHaveValue('line');
      await page.keyboard.press('Enter');
      await expect(page.locator(DIALOG)).toHaveCount(0);
      await expect.poll(() => text(page)).toBe(MIT_DIAGRAMM.replace('type: bar', 'type: line'));
      await expect(page.locator(P0.editorContent)).toBeFocused();

      // Escape bricht ab, der Fokus kehrt in den Editor zurück.
      await palette(page, BEARBEITEN);
      await page.keyboard.press('Enter');
      await expect(page.locator('#chart-dialog-type')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator(DIALOG)).toHaveCount(0);
      await expect(page.locator(P0.editorContent)).toBeFocused();
      expect(await text(page)).toBe(MIT_DIAGRAMM.replace('type: bar', 'type: line'));

      // Einfügen: Pfeiltasten zurück in die Datentabelle, Palette, Enter, Enter.
      await expect
        .poll(async () => {
          if ((await marke(page)) > 8) await page.keyboard.press('ArrowUp');
          return marke(page);
        })
        .toBeLessThanOrEqual(8);
      await palette(page, EINFUEGEN);
      await page.keyboard.press('Enter');
      await expect(page.locator('#chart-dialog-type')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator(DIALOG)).toHaveCount(0);
      // AK20: das zweite Diagramm nennt denselben Namen, unmittelbar unter ihm;
      // 4T-002072: ohne Dach-Zeichen.
      await expect
        .poll(() => text(page))
        .toBe(
          MIT_DIAGRAMM.replace('type: bar', 'type: line').replace(
            '^umsatz\n',
            [
              '^umsatz',
              '',
              `${Z}perspective-chart`,
              'table: umsatz',
              'type: bar',
              'labels: Monat',
              'values: Einnahmen, Ausgaben',
              Z,
              '',
            ].join('\n'),
          ),
        );
      // 4T-002026: Das Kommando schreibt in den Puffer, nicht auf die Platte.
      erwarteDateiUnveraendert(pfade[0], MIT_DIAGRAMM);
    });
  });
});

test.describe('DE-10: Strg+Z nimmt Einfügen und Bearbeiten in je einem Schritt zurück (S-157, S-158, F-332, F-334)', () => {
  test('Kopf-Zeile table: und Block zusammen, die geänderte Art für sich (AK18, AK19)', async () => {
    await mitApp({ 'Umsatz.md': OHNE_NAME }, async ({ page, pfade }) => {
      await oeffneLive(page);
      await markeOben(page);
      await rechtsklickUndEintrag(page, datenzelle(page, LIVE_GITTER), 'chart-insert');
      await page.locator(`${MENU} [data-menu-id="chart-insert"]`).click();
      await bestaetige(page);
      await expect.poll(() => text(page)).toBe(EINGEFUEGT);
      await expect(page.locator(P0.editorContent)).toBeFocused();
      await page.keyboard.press('Control+z');
      await expect.poll(() => text(page)).toBe(OHNE_NAME);

      await rechtsklickUndEintrag(page, datenzelle(page, LIVE_GITTER), 'chart-insert');
      await page.locator(`${MENU} [data-menu-id="chart-insert"]`).click();
      await bestaetige(page);
      await expect.poll(() => text(page)).toBe(EINGEFUEGT);
      await expect(page.locator(`${LIVE_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(1, {
        timeout: 15000,
      });
      await rechtsklickUndEintrag(page, page.locator(`${LIVE_DIAGRAMM} svg`).first(), 'chart-edit');
      await page.locator(`${MENU} [data-menu-id="chart-edit"]`).click();
      await page.locator('#chart-dialog-type').selectOption('line');
      await bestaetige(page);
      await expect.poll(() => text(page)).toBe(EINGEFUEGT.replace('type: bar', 'type: line'));
      await expect(page.locator(P0.editorContent)).toBeFocused();
      await page.keyboard.press('Control+z');
      await expect.poll(() => text(page)).toBe(EINGEFUEGT);
      await page.keyboard.press('Control+z');
      await expect.poll(() => text(page)).toBe(OHNE_NAME);
      // 4T-002026: Das Kommando schreibt in den Puffer, nicht auf die Platte.
      erwarteDateiUnveraendert(pfade[0], OHNE_NAME);
    });
  });
});

test.describe('DE-13: Meldung statt Dialog bei einer Tabelle ohne Zahl-Spalte (S-157, F-332, F-334)', () => {
  test('kein Dialog, die Meldung nennt den Grund, nichts geschrieben (AK15)', async () => {
    const ohneZahl = [
      'Erster Absatz.',
      '',
      `${Z}perspective-datatable`,
      'columns: Name:text, Ort:text',
      '| Anna | Bonn |',
      Z,
      '',
    ].join('\n');
    await mitApp({ 'Liste.md': ohneZahl }, async ({ page }) => {
      await oeffneLive(page);
      await markeOben(page);
      await rechtsklickUndEintrag(page, datenzelle(page, LIVE_GITTER), 'chart-insert');
      await page.locator(`${MENU} [data-menu-id="chart-insert"]`).click();
      await expect(page.locator(HINWEIS)).toHaveText(
        'Zu dieser Tabelle lässt sich kein Diagramm einfügen. Die Tabelle hat keine Zahl-Spalte.',
      );
      await expect(page.locator(HINWEIS)).toHaveClass(/error/);
      await expect(page.locator(DIALOG)).toHaveCount(0);
      expect(await text(page)).toBe(ohneZahl);
    });
  });
});

test.describe('DE-14: der sichtbare Dialog bei einer großen Tabelle (S-157, F-332, F-334)', () => {
  test('Felder sichtbar, rollbare Zeilen-Liste im Fenster, Enter bei aufgeklappter Auswahl-Liste, Fokus-Rückgabe (AK2, AK26)', async () => {
    const zeilen = Array.from({ length: 300 }, (_, i) => `| Posten ${i + 1} | ${i + 1} |`);
    const gross = [
      'Erster Absatz.',
      '',
      `${Z}perspective-datatable`,
      'columns: Posten:text, Betrag:number',
      ...zeilen,
      Z,
      '',
    ].join('\n');
    await mitApp({ 'Gross.md': gross }, async ({ page }) => {
      await oeffneLive(page);
      await markeOben(page);
      await rechtsklickUndEintrag(page, datenzelle(page, LIVE_GITTER), 'chart-insert');
      await page.locator(`${MENU} [data-menu-id="chart-insert"]`).click();
      const dialog = page.locator(`${DIALOG} .chart-dialog-inhalt`);
      for (const beschriftung of [
        'Diagramm-Art',
        'Datenreihen aus',
        'Beschriftungs-Spalte',
        'Titel (optional)',
      ]) {
        await expect(dialog.getByText(beschriftung, { exact: true })).toBeVisible();
      }
      await dialog.locator('input[type="radio"][value="rows"]').check();
      await expect(dialog.locator('.chart-dialog-liste input')).toHaveCount(300);
      const mass = await page.evaluate(() => {
        const inhalt = document.querySelector('.chart-dialog-inhalt');
        const liste = document.querySelector('.chart-dialog-liste');
        const r = inhalt.getBoundingClientRect();
        return {
          oben: r.top,
          unten: r.bottom,
          fenster: window.innerHeight,
          listeRollt: liste.scrollHeight > liste.clientHeight,
          overflow: getComputedStyle(liste).overflowY,
        };
      });
      expect(mass.oben).toBeGreaterThanOrEqual(0);
      expect(mass.unten).toBeLessThanOrEqual(mass.fenster);
      expect(mass.listeRollt).toBe(true);
      expect(['auto', 'scroll']).toContain(mass.overflow);
      await expect(page.locator(`${DIALOG} [data-aktion="bestaetigen"]`)).toBeInViewport();

      // Enter bei aufgeklappter Auswahl-Liste der Art: wählt den Eintrag, der
      // Dialog bleibt offen.
      await page.locator('#chart-dialog-type').focus();
      await page.keyboard.press('Alt+ArrowDown');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      await zweiBilder(page);
      await expect(page.locator(DIALOG)).toBeVisible();
      expect(await text(page)).toBe(gross);

      // Abbrechen gibt den Fokus an den Editor zurück.
      await page.locator(`${DIALOG} [data-aktion="abbrechen"]`).click();
      await expect(page.locator(DIALOG)).toHaveCount(0);
      await expect(page.locator(P0.editorContent)).toBeFocused();
      expect(await text(page)).toBe(gross);
    });
  });
});

test.describe('DE-15: Bearbeiten ausgeschaltet, während der Dialog offen ist (S-158, F-332, F-334)', () => {
  test('Strg+E bei offenem Dialog, Bestätigen schreibt nichts und meldet den Grund (AK17, F1)', async () => {
    await mitApp({ 'Umsatz.md': MIT_DIAGRAMM }, async ({ page }) => {
      await oeffneLive(page, { diagramme: 1 });
      await markeOben(page);
      await rechtsklickUndEintrag(page, page.locator(`${LIVE_DIAGRAMM} svg`).first(), 'chart-edit');
      await page.locator(`${MENU} [data-menu-id="chart-edit"]`).click();
      await expect(page.locator(DIALOG)).toBeVisible();
      await page.locator('#chart-dialog-type').selectOption('line');
      await page.keyboard.press('Control+e');
      await expect(page.locator(SEL.btnEdit)).not.toHaveClass(/active/);
      await expect(page.locator(DIALOG)).toBeVisible();
      await bestaetige(page);
      await expect(page.locator(HINWEIS)).toHaveText(
        'Bearbeiten ist ausgeschaltet; das Dokument lässt sich hier nicht ändern.',
      );
      expect(await text(page)).toBe(MIT_DIAGRAMM);
    });
  });
});

// 4T-002048: In der gerenderten Hälfte und in der Lese-Ansicht erscheint der
// Name der Tabelle nicht als Text; die Kennung trägt der Container der
// Datentabelle. 4T-002072: Das Einfügen schreibt den Namen als Kopf-Zeile
// `table: tabelle-1` in den Block; auch sie erscheint nicht als Text.
test.describe('DE-20: nach dem Einfügen keine sichtbare Namens-Zeile (S-157, F-334)', () => {
  test('gerenderte Hälfte und Lese-Ansicht ohne «table: tabelle-1» und «^tabelle-1», die Kennung am Gitter (4T-002048 AK3, 4T-002072)', async () => {
    await mitApp({ 'Umsatz.md': OHNE_NAME }, async ({ page, pfade }) => {
      await oeffneGeteilt(page);
      await markeOben(page);
      await rechtsklickUndEintrag(page, datenzelle(page, GER_GITTER), 'chart-insert');
      await page.locator(`${MENU} [data-menu-id="chart-insert"]`).click();
      await bestaetige(page);
      await expect.poll(() => text(page)).toBe(EINGEFUEGT);
      for (const ansicht of ['split', 'rendered']) {
        if (ansicht === 'rendered') await page.locator(SEL.viewBtn('rendered')).click();
        await expect(page.locator(`${GER_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(1, {
          timeout: 15000,
        });
        const sichtbar = await page.locator(P0.markdownBody).first().innerText();
        expect(sichtbar, ansicht).not.toContain('^tabelle-1');
        expect(sichtbar, ansicht).not.toContain('table: tabelle-1');
        const ziel = page.locator(`${P0.markdownBody} [id="tabelle-1"]`);
        await expect(ziel, ansicht).toHaveCount(1);
        await expect(ziel, ansicht).toHaveClass(/perspective-datatable/);
      }
      // 4T-002026: Das Kommando schreibt in den Puffer, nicht auf die Platte.
      erwarteDateiUnveraendert(pfade[0], OHNE_NAME);
    });
  });
});

// 4T-002072: Der Name einer unbenannten Tabelle entsteht als erste Kopf-Zeile
// in ihrem Block; unter die Tabelle kommt keine Zeile, und ein Strg+Z nimmt
// Kopf-Zeile und Diagramm-Block zusammen zurück. Gemessen in der linken Hälfte
// der geteilten Ansicht, wo der Product Owner die Zeile sieht.
test.describe('DE-21: Einfügen an einer unbenannten Tabelle schreibt den Namen in den Block (S-157, F-334)', () => {
  test('erste Kopf-Zeile «table: tabelle-1», nichts unter der Tabelle, das Diagramm nennt den Namen ohne Dach-Zeichen; Strg+Z nimmt beides in einem Schritt zurück (4T-002072)', async () => {
    await mitApp({ 'Umsatz.md': OHNE_NAME }, async ({ page, pfade }) => {
      await oeffneGeteilt(page);
      await markeOben(page);
      await rechtsklickUndEintrag(page, datenzelle(page, GER_GITTER), 'chart-insert');
      await page.locator(`${MENU} [data-menu-id="chart-insert"]`).click();
      await bestaetige(page);
      await expect.poll(() => text(page)).toBe(EINGEFUEGT);
      const zeilen = (await text(page)).split('\n');
      // Z3 Öffner, Z4 Kopf-Zeile, Z9 Schluss-Zaun, Z10 leer, Z11 Diagramm.
      expect(zeilen[2]).toBe(`${Z}perspective-datatable`);
      expect(zeilen[3]).toBe('table: tabelle-1');
      expect(zeilen[8]).toBe(Z);
      expect(zeilen[9]).toBe('');
      expect(zeilen[10]).toBe(`${Z}perspective-chart`);
      expect(zeilen[11]).toBe('table: tabelle-1');
      expect(zeilen.filter((z) => z.includes('^tabelle-1'))).toEqual([]);
      await expect(
        page.locator(`${P0.editorContent} .cm-line`, { hasText: /^table: tabelle-1$/ }),
      ).toHaveCount(2);
      // Gitter und Diagramm stehen in der gerenderten Hälfte.
      await expect(page.locator(`${GER_GITTER} .pdt-grid`)).toBeVisible();
      await expect(page.locator(`${GER_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(1, {
        timeout: 15000,
      });

      // Ein Strg+Z im Editor nimmt Kopf-Zeile und Block zusammen zurück.
      await markeOben(page);
      await page.keyboard.press('Control+z');
      await expect.poll(() => text(page)).toBe(OHNE_NAME);
      await expect(page.locator(GER_DIAGRAMM)).toHaveCount(0, { timeout: 15000 });
      // 4T-002026: Das Kommando schreibt in den Puffer, nicht auf die Platte.
      erwarteDateiUnveraendert(pfade[0], OHNE_NAME);
    });
  });
});

// 4T-002026 (4S-001024 AK25): Was DE-02 im Live-Modus prüft, gilt ebenso in der
// gerenderten Hälfte der geteilten Ansicht. Dort steht das Gitter außerhalb des
// Editors, und die Lage «Tabelle angeklickt» kommt über eine andere Fokus-Führung
// an Kommando-Palette und Menü der Anwendung.
test.describe('DE-22: Kommando-Palette und Menü während der Arbeit in einer Zelle der gerenderten Hälfte (S-157, F-332, F-334)', () => {
  test('Klick in eine Zelle der geteilten Ansicht: Menü und Palette wählbar, die Eingabe wird übernommen, das Einfügen wirkt auf diese Tabelle (4S-001024 AK25)', async () => {
    await mitApp({ 'Umsatz.md': OHNE_NAME }, async ({ app, page, pfade }) => {
      await oeffneGeteilt(page);
      await schreibeMenueMit(app);
      await markeOben(page);
      // Vorher: im Menü der Anwendung nicht wählbar.
      expect(menuEintrag(await menuZustand(app, ''), EINFUEGEN).enabled).toBe(false);

      // Klick in eine Zelle der gerenderten Hälfte: Das Menü wird ohne weiteren
      // Anstoß neu gemeldet.
      await datenzelle(page, GER_GITTER, 1).click();
      await expect(page.locator(`${P0.markdownBody} input.pdt-cell-input`)).toBeFocused();
      await expect.poll(() => imMenue(app, EINFUEGEN)).toBe(true);
      await page.keyboard.press('Control+a');
      await page.keyboard.type('555');
      const eintraege = await palette(page, EINFUEGEN);
      expect(waehlbar(eintraege, EINFUEGEN)).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.locator(DIALOG)).toBeVisible();
      // Die Eingabe steht im Text, bevor der Dialog bestätigt wird.
      expect((await text(page)).split('\n')[4]).toBe('| Januar  | 555 | 80 |');
      await bestaetige(page);
      await expect
        .poll(() => text(page))
        .toBe(EINGEFUEGT.replace('| Januar  | 100 | 80 |', '| Januar  | 555 | 80 |'));
      await expect(page.locator(`${GER_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(1, {
        timeout: 15000,
      });
      // Das Kommando schreibt in den Puffer, nicht auf die Platte.
      erwarteDateiUnveraendert(pfade[0], OHNE_NAME);
    });
  });
});
