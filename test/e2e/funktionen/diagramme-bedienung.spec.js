// 4T-002024 (Epic 3E-000192, Story 4S-001024): Ablauf-Prüfdatei der Lagen und
// Orte, an denen «Diagramm zu dieser Tabelle einfügen» und «Diagramm
// bearbeiten» angeboten werden — Auswahl und Hervorhebung des Diagramms im
// Live-Modus, gerenderte Hälfte der geteilten Ansicht, Lese-Ansicht, Bearbeiten
// aus, Erweiterung aus, Einbettung, zwei Spalten mit der Meldung an das Menü der
// Anwendung, Kommando-Palette über dem offenen Dialog, eingerückter Block und
// Escape nach geschlossener Palette. Aus diagramme-dialog.spec.js geschnitten
// (Budget der Datei-Größe); die Helfer liegen in
// test/e2e/helpers/diagramme-dialog.js. describe-Titel tragen die
// Fall-Kennungen (hier DE-03, DE-05, DE-06, DE-07, DE-11, DE-12, DE-16 bis
// DE-19) und die Matrix-Kennungen S-157, S-158, F-332 und F-334.
// 4T-002072: Das Einfügen schreibt den Namen als erste Kopf-Zeile
// `table: tabelle-1` in den Block (DE-18, und über EINGEFUEGT DE-05).
'use strict';

const { test, expect } = require('@playwright/test');
const { SEL } = require('../helpers/selectors');
const { pressUntilVisible } = require('../helpers/eingabe');
const { menuZustand, menuEintrag } = require('../helpers/menu-zustand');
const { erwarteDateiUnveraendert } = require('../helpers/dateien');
const {
  P0,
  MENU,
  DIALOG,
  PALETTE,
  EINFUEGEN,
  BEARBEITEN,
  Z,
  TABELLE,
  TABELLE_BENANNT,
  OHNE_NAME,
  EINGEFUEGT,
  DIAGRAMM,
  MIT_DIAGRAMM,
  text,
  marke,
  quelltextZeilen,
  kontextmenue,
  zweiBilder,
  keinKontextmenue,
  palette,
  waehlbar,
  schliessePalette,
  lageImEditor,
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

test.describe('DE-03: Klick auf das Diagramm im Live-Modus (S-158, F-332, F-334)', () => {
  test('hervorgehoben, gezeichnet, Schreibmarke und Höhe unverändert; Escape hebt auf (AK29, AK16)', async () => {
    await mitApp({ 'Umsatz.md': MIT_DIAGRAMM }, async ({ app, page }) => {
      await oeffneLive(page, { diagramme: 1 });
      await schreibeMenueMit(app);
      if ((await page.locator(`${P0.paneSource} .cm-lineNumbers`).count()) === 0) {
        await page.locator('#btn-numbers').click();
      }
      await expect(page.locator(`${P0.paneSource} .cm-lineNumbers`)).toHaveCount(1);
      await markeOben(page);
      await expect.poll(async () => (await lageImEditor(page)).abstand).toBeLessThan(1.5);
      const vorher = await lageImEditor(page);
      expect(vorher.umriss).toBe('none');

      await page.locator(`${LIVE_DIAGRAMM} svg`).first().click();
      await expect(page.locator(LIVE_DIAGRAMM).first()).toHaveClass(/diagramm-gewaehlt/);
      await expect(page.locator(`${LIVE_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(1);
      expect(await quelltextZeilen(page)).toEqual([]);
      expect(await marke(page)).toBe(1);
      const gewaehlt = await lageImEditor(page);
      expect(gewaehlt.umriss).toBe('solid');
      expect(gewaehlt.hoehe).toBe(vorher.hoehe);
      expect(gewaehlt.abstand).toBeLessThan(1.5);
      await expect(page.locator(`${P0.editorContent}`)).toBeFocused();
      // AK16: «Diagramm bearbeiten» im Menü der Anwendung wählbar, Einfügen nicht.
      await expect.poll(() => imMenue(app, BEARBEITEN)).toBe(true);
      expect(await imMenue(app, EINFUEGEN)).toBe(false);
      const eintraege = await palette(page, 'Diagramm');
      expect(waehlbar(eintraege, BEARBEITEN)).toBe(true);
      expect(waehlbar(eintraege, EINFUEGEN)).toBe(false);
      await schliessePalette(page);

      // Escape im Editor hebt die Auswahl auf.
      await page.locator(`${LIVE_DIAGRAMM} svg`).first().click();
      await expect(page.locator(P0.editorContent)).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator(LIVE_DIAGRAMM).first()).not.toHaveClass(/diagramm-gewaehlt/);
      await expect.poll(() => imMenue(app, BEARBEITEN)).toBe(false);
      expect(await text(page)).toBe(MIT_DIAGRAMM);
    });
  });
});

test.describe('DE-05: gerenderte Hälfte der geteilten Ansicht, Tabelle und Diagramm (S-157, S-158, F-332, F-334)', () => {
  test('Rechtsklick zeigt je den passenden Eintrag, Quelltext-Hälfte unverändert; Einfügen und Abbrechen (AK30, AK11, AK12)', async () => {
    await mitApp({ 'Umsatz.md': OHNE_NAME }, async ({ page, pfade }) => {
      await oeffneGeteilt(page);
      await markeOben(page);
      await rechtsklickUndEintrag(page, datenzelle(page, GER_GITTER), 'chart-insert');
      expect(await kontextmenue(page)).toEqual([{ id: 'chart-insert', text: EINFUEGEN }]);
      expect(await marke(page)).toBe(1);

      // Abbrechen ändert nichts (AK11).
      await page.locator(`${MENU} [data-menu-id="chart-insert"]`).click();
      await expect(page.locator(DIALOG)).toBeVisible();
      await page.locator(`${DIALOG} [data-aktion="abbrechen"]`).click();
      await expect(page.locator(DIALOG)).toHaveCount(0);
      expect(await text(page)).toBe(OHNE_NAME);

      await rechtsklickUndEintrag(page, datenzelle(page, GER_GITTER), 'chart-insert');
      await page.locator(`${MENU} [data-menu-id="chart-insert"]`).click();
      await bestaetige(page);
      await expect.poll(() => text(page)).toBe(EINGEFUEGT);
      await expect(page.locator(`${GER_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(1, {
        timeout: 15000,
      });
      await expect(page.locator(`${GER_GITTER} .pdt-grid`)).toBeVisible();
      // Fokus nach dem Dialog: die erste Zelle des neu gebauten Gitters.
      await expect(page.locator(`${GER_GITTER} td.pdt-cell`).first()).toBeFocused();

      await rechtsklickUndEintrag(page, page.locator(`${GER_DIAGRAMM} svg`).first(), 'chart-edit');
      expect(await kontextmenue(page)).toEqual([{ id: 'chart-edit', text: BEARBEITEN }]);
      await page.locator(`${MENU} [data-menu-id="chart-edit"]`).click();
      await expect(page.locator(DIALOG)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(DIALOG)).toHaveCount(0);
      expect(await text(page)).toBe(EINGEFUEGT);
      // 4T-002026: Das Kommando schreibt in den Puffer, nicht auf die Platte.
      erwarteDateiUnveraendert(pfade[0], OHNE_NAME);
    });
  });
});

test.describe('DE-06: Lese-Ansicht ohne Menü (S-157, S-158, F-332, F-334)', () => {
  test('Rechtsklick auf Datentabelle und Diagramm zeigt kein Kontextmenü, beide Kommandos nicht wählbar (AK31, AK17)', async () => {
    await mitApp({ 'Umsatz.md': MIT_DIAGRAMM }, async ({ page }) => {
      // Die Schreibmarke steht im Diagramm-Block: Allein die Ansicht hält die
      // Kommandos dann aus der Wahl.
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(`${P0.editorContent} .cm-line`, { hasText: 'type: bar' }).click();
      await expect.poll(() => marke(page)).toBe(13);
      await page.locator(SEL.viewBtn('rendered')).click();
      await expect(page.locator(SEL.btnEdit)).not.toHaveClass(/active/);
      await expect(page.locator(`${GER_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(1, {
        timeout: 15000,
      });
      await datenzelle(page, GER_GITTER).click({ button: 'right' });
      await keinKontextmenue(page);
      await page.locator(`${GER_DIAGRAMM} svg`).first().click({ button: 'right' });
      await keinKontextmenue(page);
      const eintraege = await palette(page, 'Diagramm');
      expect(waehlbar(eintraege, EINFUEGEN)).toBe(false);
      expect(waehlbar(eintraege, BEARBEITEN)).toBe(false);
      await schliessePalette(page);
      expect(await text(page)).toBe(MIT_DIAGRAMM);
    });
  });
});

test.describe('DE-07: Bearbeiten aus im Live-Modus und in der geteilten Ansicht (S-157, S-158, F-332, F-334)', () => {
  test('kein Menü, Block bleibt gezeichnet, nichts geschrieben (AK17, Entscheidung C3)', async () => {
    await mitApp({ 'Umsatz.md': MIT_DIAGRAMM }, async ({ page }) => {
      await oeffneLive(page, { bearbeiten: false, diagramme: 1 });
      await markeOben(page);
      await datenzelle(page, LIVE_GITTER).click({ button: 'right' });
      await keinKontextmenue(page);
      await page.locator(`${LIVE_DIAGRAMM} svg`).first().click({ button: 'right' });
      await keinKontextmenue(page);
      // F5: ohne Änderbarkeit weder Auswahl noch Hervorhebung, bei Klick wie
      // bei Rechtsklick.
      await page.locator(`${LIVE_DIAGRAMM} svg`).first().click();
      await zweiBilder(page);
      await expect(page.locator('.diagramm-gewaehlt')).toHaveCount(0);
      await expect(page.locator(`${LIVE_GITTER} .pdt-grid`)).toBeVisible();
      await expect(page.locator(`${LIVE_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(1);
      expect(await quelltextZeilen(page)).toEqual([]);
      const live = await palette(page, 'Diagramm');
      expect(waehlbar(live, EINFUEGEN)).toBe(false);
      expect(waehlbar(live, BEARBEITEN)).toBe(false);
      await schliessePalette(page);

      await oeffneGeteilt(page, { bearbeiten: false, diagramme: 1 });
      await expect(page.locator(SEL.btnEdit)).not.toHaveClass(/active/);
      await datenzelle(page, GER_GITTER).click({ button: 'right' });
      await keinKontextmenue(page);
      await page.locator(`${GER_DIAGRAMM} svg`).first().click({ button: 'right' });
      await keinKontextmenue(page);
      expect(await text(page)).toBe(MIT_DIAGRAMM);
    });
  });

  test('Bearbeiten ausgeschaltet, während das Diagramm gewählt ist: die Hervorhebung verschwindet (F5)', async () => {
    await mitApp({ 'Umsatz.md': MIT_DIAGRAMM }, async ({ page }) => {
      await oeffneLive(page, { diagramme: 1 });
      await markeOben(page);
      await page.locator(`${LIVE_DIAGRAMM} svg`).first().click();
      await expect(page.locator(LIVE_DIAGRAMM).first()).toHaveClass(/diagramm-gewaehlt/);
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.btnEdit)).not.toHaveClass(/active/);
      await expect(page.locator('.diagramm-gewaehlt')).toHaveCount(0);
      const eintraege = await palette(page, 'Diagramm');
      expect(waehlbar(eintraege, BEARBEITEN)).toBe(false);
      await schliessePalette(page);
      // Wieder an: Die alte Auswahl kehrt nicht zurück.
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.btnEdit)).toHaveClass(/active/);
      await zweiBilder(page);
      await expect(page.locator('.diagramm-gewaehlt')).toHaveCount(0);
    });
  });
});

test.describe('DE-11: Erweiterung aus (S-157, S-158, F-332, F-334)', () => {
  test('keine Kommandos in Palette und Menü, Rechtsklick auf die Datentabelle wie ohne die Erweiterung (AK22, Entscheidung C4)', async () => {
    await mitApp({ 'Umsatz.md': MIT_DIAGRAMM }, async ({ app, page }) => {
      await page.evaluate(() =>
        window.api.setSetting('extensions.disabled', ['perspective-chart']),
      );
      await page.locator(SEL.viewBtn('live')).click();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(`${LIVE_GITTER} .pdt-grid`)).toBeVisible({ timeout: 15000 });
      // Das Diagramm ist ein gewöhnlicher Code-Block.
      await expect(page.locator(LIVE_DIAGRAMM)).toHaveCount(0);
      await markeOben(page);

      await pressUntilVisible(page, 'Control+k', page.locator(PALETTE));
      await page.locator('#command-palette-filter').fill('Diagramm');
      await expect(page.locator('.command-palette-item', { hasText: EINFUEGEN })).toHaveCount(0);
      await expect(page.locator('.command-palette-item', { hasText: BEARBEITEN })).toHaveCount(0);
      await schliessePalette(page);
      const menu = await menuZustand(app, '');
      expect(menuEintrag(menu, EINFUEGEN)).toBeNull();
      expect(menuEintrag(menu, BEARBEITEN)).toBeNull();

      // Rechtsklick wie am Bestand: allgemeines Menü des Editors ohne Eintrag.
      await datenzelle(page, LIVE_GITTER).click({ button: 'right' });
      await expect(page.locator(MENU)).toBeVisible();
      const eintraege = await kontextmenue(page);
      expect(eintraege.length).toBeGreaterThan(1);
      expect(eintraege.filter((e) => e.id && e.id.startsWith('chart-'))).toEqual([]);
      await page.keyboard.press('Escape');
      expect(await text(page)).toBe(MIT_DIAGRAMM);
    });
  });
});

test.describe('DE-12: Diagramm in einer Einbettung (S-158, F-332, F-334)', () => {
  test('kein Eintrag, im Live-Modus und in der gerenderten Hälfte', async () => {
    const notiz = ['# Notiz', '', ...TABELLE, '^umsatz', '', ...DIAGRAMM, ''].join('\n');
    // Der Gastgeber trägt in denselben Zeilen dieselbe Tabelle und dasselbe
    // Diagramm wie die eingebettete Notiz: Zeile und Inhalt eines eingebetteten
    // Blocks passen dann auch zum Gastgeber, und allein die Regel der passiven
    // Orte hält den Eintrag fern (Umsetzungsplan, Abschnitt 4).
    const haupt = [
      '# Haupt',
      '',
      ...TABELLE,
      '^umsatz',
      '',
      ...DIAGRAMM,
      '',
      '![[Notiz]]',
      '',
      'Schluss.',
      '',
    ].join('\n');
    await mitApp({ 'Haupt.md': haupt, 'Notiz.md': notiz }, async ({ page }) => {
      const imEmbedLive = `${P0.paneSource} .cm-live-embed .perspective-chart`;
      await page.locator(SEL.viewBtn('live')).click();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(`${imEmbedLive}[data-chart-state="drawn"] svg`)).toHaveCount(1, {
        timeout: 15000,
      });
      await expect(page.locator(`${LIVE_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(2, {
        timeout: 15000,
      });
      await page.locator(`${imEmbedLive} svg`).first().click({ button: 'right' });
      await zweiBilder(page);
      const live = (await kontextmenue(page)) || [];
      expect(live.filter((e) => e.id && e.id.startsWith('chart-'))).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.locator('.diagramm-gewaehlt')).toHaveCount(0);

      // Gegenprobe: das eigene Diagramm des Gastgebers bekommt den Eintrag.
      await rechtsklickUndEintrag(
        page,
        page
          .locator(
            `${P0.editorContent} .perspective-chart:not(.cm-live-embed .perspective-chart) svg`,
          )
          .first(),
        'chart-edit',
      );
      await page.keyboard.press('Escape');

      await page.locator(SEL.viewBtn('split')).click();
      const imEmbed = `${P0.markdownBody} .wiki-embed-md-body .perspective-chart`;
      await expect(page.locator(`${imEmbed}[data-chart-state="drawn"] svg`)).toHaveCount(1, {
        timeout: 15000,
      });
      await page.locator(`${imEmbed} svg`).first().click({ button: 'right' });
      await keinKontextmenue(page);
      await page.locator(`${P0.markdownBody} .wiki-embed-md-body td.pdt-cell`).first().click({
        button: 'right',
      });
      await keinKontextmenue(page);
      // Gegenprobe in der gerenderten Hälfte: das eigene Diagramm.
      await rechtsklickUndEintrag(
        page,
        page
          .locator(
            `${P0.markdownBody} .perspective-chart:not(.wiki-embed-md-body .perspective-chart) svg`,
          )
          .first(),
        'chart-edit',
      );
      await page.keyboard.press('Escape');
      expect(await text(page)).toBe(haupt);
    });
  });
});

test.describe('DE-16: zwei Spalten, Auswahl in der nicht aktiven (S-158, F-332, F-334)', () => {
  test('Klick auf das Diagramm der anderen Spalte, dann Escape: das Menü der Anwendung sperrt «Diagramm bearbeiten» wieder (AK16, F2)', async () => {
    const zweites = MIT_DIAGRAMM.replace('Erster Absatz.', 'Zweites Dokument.');
    await mitApp(
      { 'Links.md': MIT_DIAGRAMM, 'Rechts.md': zweites },
      async ({ app, page }) => {
        const P1 = SEL.pane(1);
        await expect(page.locator(P0.tabs)).toHaveCount(2);
        // «Rechts» in die zweite Spalte, dort Live-Modus mit Bearbeiten.
        await page.locator(P0.tabs, { hasText: 'Rechts' }).first().click();
        await page.keyboard.press('Control+Alt+ArrowRight');
        await expect(page.locator(P1.tabs)).toHaveCount(1);
        await page.locator(P1.tabs).first().click();
        await page.locator(SEL.viewBtn('live')).click();
        await page.locator(SEL.btnEdit).click();
        await expect(
          page.locator(`${P1.editorContent} .perspective-chart[data-chart-state="drawn"] svg`),
        ).toHaveCount(1, { timeout: 15000 });
        // Linke Spalte aktiv, ebenfalls Live-Modus mit Bearbeiten.
        await page.locator(P0.tabs).first().click();
        await oeffneLive(page, { diagramme: 1 });
        await markeOben(page);
        await schreibeMenueMit(app);
        // Klick auf das Diagramm der rechten, nicht aktiven Spalte.
        await page.locator(`${P1.editorContent} .perspective-chart svg`).first().click();
        await expect(page.locator(`${P1.editorContent} .perspective-chart`).first()).toHaveClass(
          /diagramm-gewaehlt/,
        );
        await expect.poll(() => imMenue(app, BEARBEITEN)).toBe(true);
        await page.keyboard.press('Escape');
        await expect(page.locator('.diagramm-gewaehlt')).toHaveCount(0);
        await expect.poll(() => imMenue(app, BEARBEITEN)).toBe(false);
      },
      { args: (pfade) => pfade },
    );
  });
});

test.describe('DE-17: Kommando-Palette über dem offenen Dialog (S-158, F-332, F-334)', () => {
  test('Enter in der Palette bestätigt den Dialog nicht, holt ihn nach vorn; nichts geschrieben (F3)', async () => {
    await mitApp({ 'Umsatz.md': MIT_DIAGRAMM }, async ({ page }) => {
      await oeffneLive(page, { diagramme: 1 });
      await markeOben(page);
      await rechtsklickUndEintrag(page, page.locator(`${LIVE_DIAGRAMM} svg`).first(), 'chart-edit');
      await page.locator(`${MENU} [data-menu-id="chart-edit"]`).click();
      await expect(page.locator(DIALOG)).toBeVisible();
      await page.locator('#chart-dialog-type').selectOption('line');
      await pressUntilVisible(page, 'Control+k', page.locator(PALETTE));
      await page.locator('#command-palette-filter').fill(BEARBEITEN);
      await expect(page.locator('.command-palette-item', { hasText: BEARBEITEN })).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(page.locator(PALETTE)).toBeHidden();
      await zweiBilder(page);
      await expect(page.locator(DIALOG)).toBeVisible();
      await expect(page.locator(DIALOG)).toHaveCount(1);
      // Der zweite Aufruf holt den offenen Dialog nach vorn: Fokus auf seinem
      // ersten Feld, der gewählte Stand bleibt.
      await expect(page.locator('#chart-dialog-type')).toBeFocused();
      await expect(page.locator('#chart-dialog-type')).toHaveValue('line');
      expect(await text(page)).toBe(MIT_DIAGRAMM);
      await page.locator(`${DIALOG} [data-aktion="abbrechen"]`).click();
      await expect(page.locator(DIALOG)).toHaveCount(0);
      expect(await text(page)).toBe(MIT_DIAGRAMM);
    });
  });
});

test.describe('DE-18: Datentabelle in einem Listenpunkt, gerenderte Hälfte (S-157, F-332, F-334)', () => {
  test('Rechtsklick zeigt den Eintrag, Einfügen schreibt eingerückt, den Namen als Kopf-Zeile im Block (F4, 4T-002072)', async () => {
    const liste = [
      'Erster Absatz.',
      '',
      '- Punkt',
      '',
      ...TABELLE.map((z) => `  ${z}`),
      '',
      'Letzter Absatz.',
      '',
    ].join('\n');
    const erwartet = [
      'Erster Absatz.',
      '',
      '- Punkt',
      '',
      ...TABELLE_BENANNT.map((z) => `  ${z}`),
      '',
      `  ${Z}perspective-chart`,
      '  table: tabelle-1',
      '  type: bar',
      '  labels: Monat',
      '  values: Einnahmen, Ausgaben',
      `  ${Z}`,
      '',
      'Letzter Absatz.',
      '',
    ].join('\n');
    await mitApp({ 'Liste.md': liste }, async ({ page, pfade }) => {
      await oeffneGeteilt(page);
      await markeOben(page);
      await rechtsklickUndEintrag(page, datenzelle(page, GER_GITTER), 'chart-insert');
      await page.locator(`${MENU} [data-menu-id="chart-insert"]`).click();
      await bestaetige(page);
      await expect.poll(() => text(page)).toBe(erwartet);
      await expect(page.locator(`${GER_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(1, {
        timeout: 15000,
      });
      await rechtsklickUndEintrag(page, page.locator(`${GER_DIAGRAMM} svg`).first(), 'chart-edit');
      await page.locator(`${MENU} [data-menu-id="chart-edit"]`).click();
      await page.locator('#chart-dialog-type').selectOption('line');
      await bestaetige(page);
      await expect.poll(() => text(page)).toBe(erwartet.replace('  type: bar', '  type: line'));
      // 4T-002026: Das Kommando schreibt in den Puffer, nicht auf die Platte.
      erwarteDateiUnveraendert(pfade[0], liste);
    });
  });
});

test.describe('DE-19: Escape nach geschlossener Palette (S-158, F-332, F-334)', () => {
  test('der Fokus steht auf der Seite, Escape hebt die Auswahl trotzdem auf (F6)', async () => {
    await mitApp({ 'Umsatz.md': MIT_DIAGRAMM }, async ({ page }) => {
      await oeffneLive(page, { diagramme: 1 });
      await markeOben(page);
      await page.locator(`${LIVE_DIAGRAMM} svg`).first().click();
      await expect(page.locator(LIVE_DIAGRAMM).first()).toHaveClass(/diagramm-gewaehlt/);
      await palette(page, BEARBEITEN);
      await schliessePalette(page);
      // Die erste Escape-Taste gehörte der Palette; die Auswahl steht noch.
      await expect(page.locator(LIVE_DIAGRAMM).first()).toHaveClass(/diagramm-gewaehlt/);
      await page.keyboard.press('Escape');
      await expect(page.locator('.diagramm-gewaehlt')).toHaveCount(0);
      expect(await text(page)).toBe(MIT_DIAGRAMM);
    });
  });
});
