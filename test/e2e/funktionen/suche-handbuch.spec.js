// 4T-000760 (Epic 3E-000142): Suche über das ganze Handbuch.
//
// Kern der Zusage: Wer in einer Handbuch-Seite sucht, findet auch, was auf
// einer ANDEREN, nicht geöffneten Seite steht. Geprüft werden der
// Trefferraum, der Sprung aus der Liste, der Grenz-Durchlauf mit F3, das
// abgeschaltete Ersetzen und die Rückkehr zum Dokument-Verhalten; seit
// 4T-002099 zusätzlich, dass der Sprung die Fundstelle in den sichtbaren
// Bereich rollt (SH-06), und seit 4T-002107, dass die erste Eingabetaste
// nach dem Tippen den ersten Treffer zeigt statt ihn zu überspringen (SH-08).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { warteAufTrefferliste } = require('../helpers/suche');

const PANEL = '.pane-group[data-pane="0"] .sidebar-searchresults';

function makeWorkFile() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-suche-handbuch-'));
  const workFile = path.join(workDir, 'arbeit.md');
  // Der Begriff steht bewusst NICHT im Dokument: So ist jeder Treffer im
  // Handbuch-Raum eindeutig dem Handbuch zuzuordnen.
  fs.writeFileSync(workFile, '# Arbeitsdatei\n\nOhne den gesuchten Begriff.\n', 'utf8');
  return workFile;
}

async function openManualPage(page, pageId) {
  await page.evaluate((id) => {
    document.dispatchEvent(new CustomEvent('scg:open-manual-page', { detail: { pageId: id } }));
  }, pageId);
}

// Die Tastatur-Bindings stehen erst am Ende des asynchronen init(); ein
// sichtbarer Reiter ist das Bereitschafts-Signal (Muster der Smoke-Suite).
async function warteAufReiter(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

async function oeffneHandbuchSeite(page, pageId) {
  await openManualPage(page, pageId);
  await expect(page.locator(SEL.markdownBody0).locator('h1').first()).toBeVisible();
}

async function sucheOeffnen(page, begriff) {
  await page.keyboard.press('Control+f');
  const input = page.locator('#search-input');
  await expect(input).toBeVisible();
  await input.fill(begriff);
}

test.describe('SH-01: Trefferraum über alle Handbuch-Seiten', () => {
  test('findet Fundstellen auf Seiten, die gar nicht geöffnet sind', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      // Eine einzige Handbuch-Seite öffnen — nicht die, auf der die meisten
      // Treffer liegen.
      await warteAufReiter(page);
      await oeffneHandbuchSeite(page, 'overview');

      await sucheOeffnen(page, 'Vorlage');
      // Scope-Label nennt den Raum.
      await expect(page.locator('#search-scope')).toHaveText(/Handbuch/);

      // Die Trefferliste öffnet sich selbst und führt mehrere Gruppen.
      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible();
      const gruppen = panel.locator('.search-results-group');
      await expect.poll(async () => gruppen.count()).toBeGreaterThan(1);

      // Darunter die Seite «Vorlagen», die NICHT geöffnet ist.
      await expect(panel.getByText('Vorlagen', { exact: false }).first()).toBeVisible();

      // Der Zähler zählt über den ganzen Raum, nicht über die offene Seite.
      const zaehler = await page.locator('#search-count').textContent();
      expect(zaehler).toMatch(/\d+ \/ \d+/);
      expect(Number(zaehler.split('/')[1].trim())).toBeGreaterThan(5);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SH-02: Sprung aus der Trefferliste', () => {
  test('Klick öffnet die Ziel-Seite und hebt die Fundstelle hervor', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await warteAufReiter(page);
      await oeffneHandbuchSeite(page, 'overview');
      await sucheOeffnen(page, 'Vorlage');

      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible();
      const treffer = panel.locator('.search-results-item');
      await expect.poll(async () => treffer.count()).toBeGreaterThan(0);

      await treffer.first().click();
      // Die Ziel-Seite ist offen und zeigt die Fundstelle hervorgehoben.
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('mark.mdv-match-current')).toHaveCount(1);
      await expect(body.locator('mark.mdv-match-current')).toContainText(/Vorlage/i);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SH-03: F3 läuft über die Seitengrenze', () => {
  test('wiederholtes Weiterspringen erreicht eine zweite Seite', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await warteAufReiter(page);
      await oeffneHandbuchSeite(page, 'overview');
      await sucheOeffnen(page, 'Vorlage');

      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible();
      // 4T-001496: Zustand statt Ereignis — die Status-Zeile meldet die
      // abgeschlossene Suche, die Liste allein waere nur ihr Vorbote.
      await warteAufTrefferliste(page);

      // Titel des ersten Ziels merken, dann so oft weiterspringen, bis ein
      // anderer Reiter aktiv ist. Die erste Gruppe hat begrenzt viele
      // Treffer; 30 Sprünge reichen sicher über ihre Grenze.
      await page.keyboard.press('F3');
      const ersterTitel = await page.locator(SEL.activeTab0).innerText();
      let gewechselt = false;
      for (let i = 0; i < 30 && !gewechselt; i++) {
        await page.keyboard.press('F3');
        const titel = await page.locator(SEL.activeTab0).innerText();
        if (titel !== ersterTitel) gewechselt = true;
      }
      expect(gewechselt, 'F3 hat die Seitengrenze nicht überschritten').toBe(true);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SH-04: Ersetzen bleibt im Handbuch abgeschaltet', () => {
  test('die Ersetzen-Bedienelemente sind deaktiviert', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await warteAufReiter(page);
      await oeffneHandbuchSeite(page, 'overview');
      // Ueber die Such-Leiste, nicht ueber den Ersetzen-Einstieg: Die
      // Bedienbarkeit der Ersetzen-Elemente haengt am Scope und nicht daran,
      // in welchem Modus die Leiste geoeffnet wurde (updateReplaceUiState
      // laeuft bei jedem Suchlauf).
      await sucheOeffnen(page, 'Vorlage');
      await expect(page.locator('#search-replace')).toBeDisabled();
      await expect(page.locator('#btn-search-replace')).toBeDisabled();
      await expect(page.locator('#btn-search-replace-all')).toBeDisabled();
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-002099: Liegt die aktuelle Fundstelle im sichtbaren Bereich der
// Lese-Ansicht? SH-02 prüfte nur, DASS sie hervorgehoben ist — ein Sprung,
// der die Seite öffnet und markiert, aber nicht hinrollt, blieb dort grün.
async function aktuelleFundstelleSichtbar(page) {
  return page.evaluate(() => {
    const pane = document.querySelector('.pane-group[data-pane="0"]');
    const roll = pane && pane.querySelector('.pane-rendered');
    const mark = roll && roll.querySelector('mark.mdv-match-current');
    if (!mark) return false;
    const r = mark.getBoundingClientRect();
    const c = roll.getBoundingClientRect();
    return r.top >= c.top && r.bottom <= c.bottom;
  });
}

async function aktiverReiterTitel(page) {
  return (await page.locator(SEL.activeTab0).innerText()).replace('×', '').trim();
}

// Begriff aus dem unteren Drittel der Seite «Funktionen», abgelesen am
// Funktions-Katalog (Gruppe «Ansicht», Zeile 237 von 289 des erzeugten
// Markdown) und im ganzen deutschen Handbuch genau einmal vorhanden.
const FUNKTIONEN_UNTEN = 'Abgerundete Tab-Ecken';

test.describe('SH-06: Sprung rollt zur Fundstelle (4T-002099)', () => {
  test('4T-002099: Klick auf einen Treffer weit unten auf «Funktionen» bringt die Fundstelle in den sichtbaren Bereich', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await warteAufReiter(page);
      await oeffneHandbuchSeite(page, 'overview');
      await sucheOeffnen(page, FUNKTIONEN_UNTEN);
      await warteAufTrefferliste(page);

      const panel = page.locator(PANEL);
      await panel.locator('.search-results-item').first().click();

      await expect.poll(async () => aktiverReiterTitel(page)).toBe('Funktionen');
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('mark.mdv-match-current')).toHaveCount(1);
      await expect(body.locator('mark.mdv-match-current')).toHaveText(FUNKTIONEN_UNTEN);
      // Die Fundstelle steht in einer Tabellen-Zeile und muss sichtbar sein.
      await expect(body.locator('td mark.mdv-match-current')).toHaveCount(1);
      await expect.poll(async () => aktuelleFundstelleSichtbar(page)).toBe(true);
      // Und sie bleibt es, auch nachdem die Ansicht ihren Render-Zyklus
      // abgeschlossen hat (die Roll-Lage wurde vorher nachträglich überschrieben).
      await page.waitForTimeout(500);
      expect(await aktuelleFundstelleSichtbar(page)).toBe(true);
      await expect(page.locator('#search-count')).toHaveText('1 / 1');
    } finally {
      await closeApp(app, userData);
    }
  });

  test('4T-002099: Weiter-Sprung (F3) auf der offenen Seite «Funktionen» bringt jede Fundstelle in den sichtbaren Bereich', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await warteAufReiter(page);
      await oeffneHandbuchSeite(page, 'functions');
      // «Bereichs-Panel» steht auf «Funktionen» mehrfach, alle Fundstellen
      // liegen tief unterhalb des ersten Bildschirms (Gruppen Ansicht und
      // Navigation); weitere stehen auf anderen Seiten.
      await sucheOeffnen(page, 'Bereichs-Panel');
      await warteAufTrefferliste(page, { mindestens: 3 });
      const gesamt = Number((await page.locator('#search-count').textContent()).split('/')[1]);

      // 4T-002107: Der erste Druck zeigt den nach dem Tippen als aktuell
      // gemeldeten Treffer «1 / n»; bis dahin übersprang er ihn und begann bei
      // «2 / n». Die Zählung beginnt deshalb bei 1.
      for (let schritt = 1; schritt <= 4; schritt++) {
        await page.keyboard.press('F3');
        await expect(page.locator('#search-count')).toHaveText(`${schritt} / ${gesamt}`);
        expect(await aktiverReiterTitel(page)).toBe('Funktionen');
        await expect
          .poll(async () => aktuelleFundstelleSichtbar(page), {
            message: `Fundstelle ${schritt} nicht im sichtbaren Bereich`,
          })
          .toBe(true);
        await page.waitForTimeout(300);
        expect(await aktuelleFundstelleSichtbar(page)).toBe(true);
      }
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-002107: «Die erste Eingabetaste soll zum ersten Treffer springen»
// (Entscheidung des Product Owners vom 2026-10-03). Gemessen vorher auf genau
// dieser Seite: nach dem Tippen «1 / 27», erste Eingabetaste «2 / 27» — der
// erste Treffer wurde nie gezeigt.
test.describe('SH-08: Die erste Eingabetaste zeigt den ersten Treffer (4T-002107)', () => {
  test('4T-002107: Tippen bewegt nichts, die erste Eingabetaste zeigt «1 / n», die zweite «2 / n»', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await warteAufReiter(page);
      await oeffneHandbuchSeite(page, 'functions');
      await sucheOeffnen(page, 'Bereichs-Panel');
      await warteAufTrefferliste(page, { mindestens: 3 });
      const zaehler = page.locator('#search-count');
      const gesamt = Number((await zaehler.textContent()).split('/')[1]);
      await expect(zaehler).toHaveText(`1 / ${gesamt}`);
      // Der erste Treffer steht auf der offenen Seite, ist markiert, aber
      // nicht angerollt: Das Tippen bewegt nichts.
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('mark.mdv-match-current')).toHaveCount(1);
      expect(await aktuelleFundstelleSichtbar(page)).toBe(false);

      await page.keyboard.press('Enter');
      await expect
        .poll(async () => aktuelleFundstelleSichtbar(page), {
          message: 'Die erste Eingabetaste zeigt den ersten Treffer nicht',
        })
        .toBe(true);
      await expect(zaehler).toHaveText(`1 / ${gesamt}`);
      expect(await aktiverReiterTitel(page)).toBe('Funktionen');

      await page.keyboard.press('Enter');
      await expect(zaehler).toHaveText(`2 / ${gesamt}`);
      await expect.poll(async () => aktuelleFundstelleSichtbar(page)).toBe(true);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SH-05: Rückkehr zum Dokument', () => {
  test('im Dokument-Reiter gilt wieder die Dokument-Suche', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await warteAufReiter(page);
      await oeffneHandbuchSeite(page, 'overview');
      await sucheOeffnen(page, 'Vorlage');
      await expect(page.locator('#search-scope')).toHaveText(/Handbuch/);

      // Zurück auf den Dokument-Reiter (der erste in der Leiste).
      await page.locator('.pane-group[data-pane="0"] .tab').first().click();
      await expect
        .poll(async () => page.locator('#search-scope').textContent())
        .not.toMatch(/Handbuch/);
      // Und die Trefferliste zeigt keine Handbuch-Treffer mehr.
      const panel = page.locator(PANEL);
      if (await panel.isVisible()) {
        await expect(panel.locator('.search-results-item')).toHaveCount(0);
      }
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-002129: Ein Sprung, der ausgelöst wird, solange der Suchlauf eines neuen
// Begriffs noch aussteht oder läuft, geht nicht verloren. Gemessen am gebauten
// Programm: «Bereichs-Panel» getippt und binnen etwa 0,3 Sekunden zweimal die
// Eingabetaste — «1 / 27» statt «2 / 27». Der Lauf im Handbuch ist asynchron;
// der Sprung bediente den alten Bestand, das eintreffende Ergebnis setzte ihn
// zurück. Jetzt wird er vorgemerkt und auf dem Ergebnis DIESES Laufs ausgeführt.
test.describe('SH-09: Sprung während des Suchlaufs (4T-002129)', () => {
  for (const druecke of [2, 1]) {
    test(`4T-002129: neuer Begriff, sofort ${druecke}× Eingabetaste — «${druecke} / n», gezeigt und nach einer Sekunde unverändert`, async () => {
      test.setTimeout(120000);
      const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
      try {
        await warteAufReiter(page);
        await oeffneHandbuchSeite(page, 'functions');
        await page.keyboard.press('Control+f');
        await expect(page.locator('#search-input')).toBeVisible();
        await page.keyboard.type('Bereichs-Panel', { delay: 20 });
        for (let i = 0; i < druecke; i++) await page.keyboard.press('Enter');
        await warteAufTrefferliste(page, { mindestens: 3 });
        // Eine Abwesenheit braucht ein Zeitfenster: Der Rückfall käme mit dem
        // Ergebnis des Laufs.
        await page.waitForTimeout(1000);
        await expect(page.locator('#search-count')).toHaveText(
          new RegExp('^' + druecke + ' / \\d+$'),
        );
        await expect.poll(async () => aktuelleFundstelleSichtbar(page)).toBe(true);
        expect(await aktiverReiterTitel(page)).toBe('Funktionen');
      } finally {
        await closeApp(app, userData);
      }
    });
  }
});
