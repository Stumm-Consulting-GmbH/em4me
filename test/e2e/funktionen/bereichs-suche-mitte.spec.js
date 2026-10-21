// 4T-002217 (Epic 3E-000355): Bereichs-Suche — Lage des Treffers nach dem
// Sprung, je Ansicht und je Zustand der Ziel-Datei.
//
// ZUSICHERUNG, keine Behebung: Die Fälle sind am Stand ihrer Anlage grün. Sie
// halten das gemessene Verhalten fest (Messungen vom 2026-10-10 und
// 2026-10-17): Wo der Bereich rollen kann, steht der Treffer in der Mitte (0
// bis 1 Bildpunkt Abstand), am Anfang und Ende einer Datei am Rand und
// vollständig sichtbar — in «Quellcode», Live und «Gerendert», mit der
// Ziel-Datei schon offen und erst zu öffnen, beim Blättern über die
// Datei-Grenze in beide Richtungen und beim Klick in der Trefferliste. Vorher
// verlangten die Fälle nur «im sichtbaren Bereich» (BS-08 bis BS-11 in
// `bereichs-suche.spec.js`, seither ebenfalls auf die gemeinsame Lage-Rechnung
// umgestellt). Eigene Datei, weil die Nachbar-Datei sonst ihr Zeilen-Budget
// überschritte.
//
// Gemessen und hier festgehalten: Eine über die Suche erst geöffnete Datei
// erscheint in der Standard-Ansicht des Prüf-Profils («Gerendert»), auch wenn
// die Suche aus «Quellcode» oder Live kam; eine schon offene behält ihre.
// Die Lage-Rechnung folgt deshalb der aktiven Ansicht (`art: 'auto'`).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { warteAufTrefferliste } = require('../helpers/suche');
const { erwarteTrefferInDerMitte } = require('../helpers/treffer-lage');

const PANE = '.pane-group[data-pane="0"]';
const PANEL = `${PANE} .sidebar-searchresults`;
const BEGRIFF = 'Quittenmus';
const ANSICHTEN = { source: 'Quellcode', live: 'Live', rendered: 'Gerendert' };

// Prüf-Dokument der Messung: 400 Absätze, rund 23 Fensterhöhen, Suchwort in
// Absatz 5 (Roll-Lage am Anfang), 200 (Mitte erreichbar) und 395 (Ende). Der
// Titel steht in jeder Treffer-Zeile, damit die Lage-Prüfung beim Sprung über
// die Datei-Grenze auf den Treffer der richtigen Datei wartet.
// `kasten200`: Absatz 200 steht in einem eingeklappten Hinweis-Kasten (BS-15).
function langerText(titel, kasten200 = false) {
  const z = [`# ${titel}`, ''];
  for (let i = 1; i <= 400; i++) {
    const zeile = `Absatz ${i} in ${titel}: ${BEGRIFF}.`;
    if (i === 200 && kasten200) z.push('> [!note]- Eingeklappt', `> ${zeile}`, '');
    else if (i === 5 || i === 200 || i === 395) z.push(zeile, '');
    else z.push(`Absatz ${i}: Fülltext ohne Suchwort.`, '');
  }
  return z.join('\n');
}

const RAND = { 5: 'Anfang', 200: 'nein', 395: 'Ende' };

// Bereich mit zwei langen Dateien; die Treffer-Reihenfolge ist a-start (1 bis
// 3), b-zweite (4 bis 6), solange a-start die aktive Datei ist.
async function bereichsFall(zielOffen, modus, ablauf, { kasten = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-4t2217-bereich-'));
  fs.writeFileSync(path.join(dir, 'a-start.md'), langerText('A Start', kasten), 'utf8');
  fs.writeFileSync(path.join(dir, 'b-zweite.md'), langerText('B Zweite', kasten), 'utf8');
  // Ohne Datei-Argument starten, binden, dann öffnen (Reihenfolge nach
  // 4T-001689, siehe bindArea in bereichs-suche.spec.js).
  const { app, page, userData } = await launchApp();
  try {
    const res = await page.evaluate((p) => window.api.openAreaPath(p), dir);
    expect(res.boundExisting).toBe(true);
    await expect.poll(() => page.title()).toContain(`(Bereich ${path.basename(dir)})`);
    const liste = zielOffen
      ? [path.join(dir, 'b-zweite.md'), path.join(dir, 'a-start.md')]
      : [path.join(dir, 'a-start.md')];
    await oeffneDokumentImFenster(app, page, liste);
    if (zielOffen) {
      await page.locator(SEL.tabs0, { hasText: 'b-zweite' }).click();
      await ansichtSetzen(page, modus);
      await page.locator(SEL.tabs0, { hasText: 'a-start' }).click();
    }
    await ansichtSetzen(page, modus);
    if (modus !== 'rendered') {
      await page.locator(`${SEL.editorContent0} .cm-line`).first().click();
      await page.keyboard.press('Control+Home');
    }
    await page.keyboard.press('Control+f');
    await expect(page.locator(SEL.searchInput)).toBeVisible();
    await page.locator(SEL.searchInput).fill(BEGRIFF);
    await warteAufTrefferliste(page, { mindestens: 6, panel: PANEL });
    await expect(page.locator(SEL.searchCount)).toHaveText('1 / 6');
    await ablauf(page);
  } finally {
    await closeApp(app, userData, { force: true });
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Temp-Verzeichnis bleibt liegen; unkritisch.
    }
  }
}

async function ansichtSetzen(page, modus) {
  await page.locator(SEL.viewBtn(modus)).click();
  await expect(page.locator(SEL.viewBtn(modus))).toHaveClass(/active/);
  if (modus === 'rendered') return;
  const inhalt = page.locator(SEL.editorContent0);
  if ((await inhalt.getAttribute('contenteditable')) !== 'true') {
    await page.locator(SEL.btnEdit).click();
  }
  await expect(inhalt).toHaveAttribute('contenteditable', 'true');
}

// Erwartete Ansicht nach dem Sprung: die Ausgangs-Datei behält ihre, die
// zweite Datei hat ihre, wenn sie offen war, sonst die Standard-Ansicht.
function ansichtNach(datei, zielOffen, modus) {
  return datei === 'A Start' || zielOffen ? modus : 'rendered';
}

async function lageNach(page, { griff, zaehler, datei, absatz, zielOffen, modus }) {
  await expect(page.locator(SEL.searchCount)).toHaveText(zaehler, { timeout: 15000 });
  await expect(page.locator('.view-toggle .view-btn.active').first()).toHaveAttribute(
    'data-view',
    ansichtNach(datei, zielOffen, modus),
  );
  await erwarteTrefferInDerMitte(page, {
    art: 'auto',
    rand: RAND[absatz],
    zeileEnthaelt: `Absatz ${absatz} in ${datei}:`,
    schritt: `${griff} -> ${zaehler}`,
  });
}

test.describe('BS-13: Blättern im Bereich — Treffer im mittleren Drittel, auch über die Datei-Grenze (4T-002217)', () => {
  // Vorwärts durch alle sechs Treffer (F3 über die Grenze), vom letzten zum
  // ersten (Datei-Grenze rückwärts), zurück zum letzten und rückwärts wieder
  // über die Grenze in die Ausgangs-Datei.
  const SCHRITTE = [
    ['Enter', '1 / 6', 'A Start', 5],
    ['Enter', '2 / 6', 'A Start', 200],
    ['Enter', '3 / 6', 'A Start', 395],
    ['F3', '4 / 6', 'B Zweite', 5],
    ['Enter', '5 / 6', 'B Zweite', 200],
    ['Enter', '6 / 6', 'B Zweite', 395],
    ['Enter', '1 / 6', 'A Start', 5],
    ['Shift+F3', '6 / 6', 'B Zweite', 395],
    ['Shift+Enter', '5 / 6', 'B Zweite', 200],
    ['Shift+Enter', '4 / 6', 'B Zweite', 5],
    ['Shift+Enter', '3 / 6', 'A Start', 395],
  ];
  for (const [modus, name] of Object.entries(ANSICHTEN)) {
    for (const zielOffen of [false, true]) {
      test(`4T-002217: ${name}, zweite Datei ${zielOffen ? 'schon offen' : 'erst zu öffnen'} — jeder Sprung vor und zurück`, async () => {
        test.setTimeout(150000);
        await bereichsFall(zielOffen, modus, async (page) => {
          for (const [griff, zaehler, datei, absatz] of SCHRITTE) {
            await page.keyboard.press(griff);
            await lageNach(page, { griff, zaehler, datei, absatz, zielOffen, modus });
          }
        });
      });
    }
  }
});

// Index des Eintrags der Trefferliste, der in der Gruppe der Datei `datei`
// steht und `text` enthält (Muster der Mess-Prüfdatei vom 2026-10-17).
function eintragIndex(page, datei, text) {
  return page.evaluate(
    ({ panel, g, t }) => {
      const liste = document.querySelector(panel + ' .search-results-list');
      let inGruppe = false;
      for (const el of liste.children) {
        if (el.classList.contains('search-results-group')) {
          inGruppe = el.textContent.includes(g);
          continue;
        }
        if (
          inGruppe &&
          el.classList.contains('search-results-item') &&
          el.textContent.includes(t)
        ) {
          return el.dataset.index;
        }
      }
      return null;
    },
    { panel: PANEL, g: datei, t: text },
  );
}

test.describe('BS-14: Klick in der Trefferliste — Treffer im mittleren Drittel (4T-002217)', () => {
  // Die zweite Datei ist erst zu öffnen: Der zweite Klick öffnet sie.
  const KLICKS = [
    ['a-start', 'A Start', 200],
    ['b-zweite', 'B Zweite', 200],
    ['a-start', 'A Start', 200],
    ['b-zweite', 'B Zweite', 395],
    ['a-start', 'A Start', 5],
  ];
  for (const [modus, name] of Object.entries(ANSICHTEN)) {
    test(`4T-002217: ${name}, zweite Datei erst zu öffnen — jeder Klick, hin und zurück, auch auf Treffer am Anfang und Ende`, async () => {
      test.setTimeout(150000);
      await bereichsFall(false, modus, async (page) => {
        for (const [gruppe, datei, absatz] of KLICKS) {
          const idx = await eintragIndex(page, gruppe, `Absatz ${absatz} in`);
          expect(idx, `Eintrag ${gruppe} Absatz ${absatz}`).not.toBeNull();
          const zaehler = `${Number(idx) + 1} / 6`;
          await page.locator(`${PANEL} .search-results-item[data-index="${idx}"]`).click();
          await lageNach(page, {
            griff: `Klick ${gruppe} Absatz ${absatz}`,
            zaehler,
            datei,
            absatz,
            zielOffen: false,
            modus,
          });
        }
      });
    });
  }
});

// Behebung (4T-002217, Vorlage P1 vom 2026-10-17): Absatz 200 beider Dateien
// steht in einem eingeklappten Hinweis-Kasten. In «Gerendert» blieb ein solcher
// Treffer unsichtbar (Messung vom 2026-10-17); der Sprung öffnet den Kasten und
// holt den Treffer in die Mitte, in der offenen Ausgangs-Datei wie in der erst
// zu öffnenden zweiten. Der Kasten bleibt beim Weiterblättern offen.
// Rot-Probe am unveränderten Stand: rot.
const KASTEN = `${PANE} .pane-rendered details`;

test.describe('BS-15: Treffer in einem eingeklappten Hinweis-Kasten (4T-002217)', () => {
  // Griff, Zähler, Datei, Absatz, Kasten danach offen.
  const SCHRITTE = [
    ['Enter', '1 / 6', 'A Start', 5, false],
    ['Enter', '2 / 6', 'A Start', 200, true],
    ['Enter', '3 / 6', 'A Start', 395, true],
    ['F3', '4 / 6', 'B Zweite', 5, false],
    ['Enter', '5 / 6', 'B Zweite', 200, true],
    ['Enter', '6 / 6', 'B Zweite', 395, true],
    ['Shift+Enter', '5 / 6', 'B Zweite', 200, true],
  ];
  test('4T-002217: Gerendert, zweite Datei erst zu öffnen — der Sprung öffnet den Kasten in beiden Dateien und zeigt den Treffer in der Mitte, vor und zurück', async () => {
    test.setTimeout(150000);
    const ablauf = async (page) => {
      await expect(page.locator(KASTEN)).toHaveCount(1);
      await expect(page.locator(KASTEN)).not.toHaveAttribute('open', '');
      for (const [griff, zaehler, datei, absatz, offen] of SCHRITTE) {
        await page.keyboard.press(griff);
        const modus = 'rendered';
        await lageNach(page, { griff, zaehler, datei, absatz, zielOffen: false, modus });
        if (offen) await expect(page.locator(KASTEN)).toHaveAttribute('open', '');
        else await expect(page.locator(KASTEN)).not.toHaveAttribute('open', '');
      }
    };
    await bereichsFall(false, 'rendered', ablauf, { kasten: true });
  });
});
