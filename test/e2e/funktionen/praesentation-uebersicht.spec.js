// 4T-002284 (Epic 3E-000348): Ablauf-Faelle der Folien-Uebersicht, des
// Aufdeckens in der Vorfuehrung und der Verkleinerung uebervoller Folien
// (4T-002280) sowie der Marp-Datei mit Angaben je Folie (4T-002277) an der
// gestarteten Anwendung. Die Faelle ueber zwei Fenster stehen in
// praesentation-fenster.spec.js.
//
// **Warum gegen die echte Anwendung.** Die Uebersicht zeichnet jede Folie
// ueber die Pipeline der Flaeche (Preload-Bruecke mit der Markdown-Instanz),
// das Aufdecken greift ueber die Stelle `punkt` des Format-Kerns auf die `li`
// der gerenderten Folie zu, und die Verkleinerung misst den Inhalt im echten
// Layout — jsdom misst nicht (Vermutung in 4T-002280, hier am Chromium
// belegt).
//
// describe-Titel tragen die Matrix-IDs (test/abdeckungs-matrix.json, S-169 und
// F-347).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, warteAufDateiArgument } = require('../helpers/app');
const { pressUntil, pressUntilVisible, pressNachfassend } = require('../helpers/eingabe');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const FIXTURE_DIR = path.resolve(__dirname, '..', '..', 'fixtures', 'presentation');

const PANE0 = '.pane-group[data-pane="0"]';
const FLAECHE = `${PANE0} .pane-presentation .praesentation-flaeche`;
const ZAEHLER = `${FLAECHE} .praesentation-zaehler`;
const SLIDE = `${FLAECHE} .praesentation-buehne .presentation-slide`;
const ARTIKEL = `${FLAECHE} .praesentation-buehne .praesentation-folie`;
const HINWEISE = `${FLAECHE} .praesentation-hinweise`;
const RASTER = `${FLAECHE} .praesentation-uebersicht`;
const KACHEL = `${RASTER} .praesentation-uebersicht-kachel`;

const VIER_FOLIEN = [
  '---',
  'presentation: true',
  '---',
  '',
  '# Folie eins',
  '',
  '---',
  '',
  '## Folie zwei',
  '',
  '---',
  '',
  '## Folie drei',
  '',
  '---',
  '',
  '## Folie vier',
  '',
];

function machVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-2284-uebersicht-'));
}

function raeumeAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

function schreibe(dir, name, zeilen) {
  const datei = path.join(dir, name);
  fs.writeFileSync(datei, Array.isArray(zeilen) ? zeilen.join('\n') : zeilen, 'utf8');
  return datei;
}

async function oeffneFolien(page) {
  await pressUntilVisible(page, 'Control+8', page.locator(FLAECHE));
}

async function zaehlerIst(page, text) {
  return (await page.locator(ZAEHLER).textContent()) === text;
}

async function sendeMenue(app, kanal) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, k) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(k);
    },
    kanal,
  );
}

// Die Uebersicht ist ein Schalter: Ein zweites Senden schloesse sie wieder.
// Deshalb einmal senden, bis zur Frist auf die Wirkung warten und erst dann
// nachfassen (Form von pressNachfassend, Stabilitaetsregel 13).
async function oeffneUebersicht(app, page) {
  const offen = () => page.locator(RASTER).isVisible();
  for (let i = 0; i < 3 && !(await offen()); i++) {
    await sendeMenue(app, 'menu:presentationOverview');
    const bis = Date.now() + 2000;
    while (Date.now() < bis && !(await offen())) await page.waitForTimeout(50);
  }
  await expect(page.locator(RASTER)).toBeVisible();
}

function gewaehlt(page) {
  return page
    .locator(KACHEL)
    .evaluateAll((kacheln) => kacheln.findIndex((k) => k.getAttribute('aria-selected') === 'true'));
}

test.describe('PR-16: Folien-Übersicht öffnen und eine Folie wählen (S-169)', () => {
  test('Raster mit nummerierten Kacheln, Klick, Pfeil und Enter wechseln zur Folie, Esc schließt ohne Wechsel', async () => {
    const dir = machVerzeichnis();
    const datei = schreibe(dir, 'Vortrag.md', VIER_FOLIEN);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 4');

      // --- Oeffnen: vier Kacheln mit Nummer und Folie, Auswahl auf der ersten
      await oeffneUebersicht(app, page);
      await expect(page.locator(FLAECHE)).toHaveClass(/praesentation-flaeche--uebersicht/);
      await expect(page.locator(KACHEL)).toHaveCount(4);
      await expect(page.locator(`${KACHEL} .praesentation-uebersicht-nummer`)).toHaveText([
        '1',
        '2',
        '3',
        '4',
      ]);
      await expect(page.locator(KACHEL).nth(2).locator('h2')).toHaveText('Folie drei');
      expect(await gewaehlt(page)).toBe(0);

      // --- Klick auf die Flaeche der dritten Kachel (Stabilitaetsregel 34) --
      const box = await page.locator(KACHEL).nth(2).boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const getroffen = await page.evaluate(
        ([px, py, sel]) => {
          const el = document.elementFromPoint(px, py);
          const kachel = el && el.closest(sel);
          return kachel ? [...document.querySelectorAll(sel)].indexOf(kachel) : -1;
        },
        [x, y, KACHEL],
      );
      expect(getroffen).toBe(2);
      await page.mouse.click(x, y);
      await expect(page.locator(RASTER)).toHaveCount(0);
      await expect(page.locator(ZAEHLER)).toHaveText('3 / 4');
      await expect(page.locator(`${ARTIKEL} h2`)).toHaveText('Folie drei');

      // --- Tastatur: Auswahl steht auf der gezeigten Folie, Pfeil und Enter -
      await oeffneUebersicht(app, page);
      await expect.poll(() => gewaehlt(page)).toBe(2);
      await pressNachfassend(page, 'ArrowRight', async () => (await gewaehlt(page)) === 3);
      await page.keyboard.press('Enter');
      await expect(page.locator(RASTER)).toHaveCount(0);
      await expect(page.locator(ZAEHLER)).toHaveText('4 / 4');

      // --- Esc schliesst ohne Wechsel --------------------------------------
      await oeffneUebersicht(app, page);
      await pressNachfassend(page, 'ArrowLeft', async () => (await gewaehlt(page)) === 2);
      await pressUntil(page, 'Escape', async () => !(await page.locator(RASTER).isVisible()));
      await expect(page.locator(FLAECHE)).not.toHaveClass(/praesentation-flaeche--uebersicht/);
      await expect(page.locator(ZAEHLER)).toHaveText('4 / 4');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

// Zahl der zugedeckten Listen-Punkte der gezeigten Folie.
function verborgene(page) {
  return page.locator(`${ARTIKEL} li[data-aufdeck-verborgen]`).count();
}

async function istVorfuehrung(page) {
  return page.locator('body').evaluate((b) => b.classList.contains('presentation-vorfuehrung'));
}

test.describe('PR-17: Aufdecken in der Vorführung und Verkleinerung übervoller Folien (S-169)', () => {
  test('*-Liste deckt Schritt für Schritt auf, rückwärts betreten vollständig; die übervolle Folie ist verkleinert statt markiert', async () => {
    const dir = machVerzeichnis();
    const zeilen = Array.from({ length: 18 }, (_, i) => `- Zeile ${i + 1} der vollen Folie`);
    const datei = schreibe(dir, 'Aufdecken.md', [
      '---',
      'presentation: true',
      '---',
      '',
      '# Liste',
      '',
      '* erster Punkt',
      '* zweiter Punkt',
      '* dritter Punkt',
      '',
      '---',
      '',
      '## Danach',
      '',
      '---',
      '',
      '## Übervoll',
      '',
      ...zeilen,
      '',
    ]);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 3');
      // In der Ansicht ist die Liste vollstaendig.
      await expect(page.locator(`${ARTIKEL} li`)).toHaveCount(3);
      expect(await verborgene(page)).toBe(0);

      // --- Vorfuehrung: die gezeigte Folie beginnt zugedeckt ----------------
      await pressUntil(page, 'F5', () => istVorfuehrung(page));
      await expect.poll(() => verborgene(page)).toBe(3);
      await expect(page.locator(`${ARTIKEL} li`).first()).toBeHidden();
      // Jeder Schritt deckt genau einen Punkt auf, die Folie bleibt.
      await pressNachfassend(page, 'ArrowRight', async () => (await verborgene(page)) === 2);
      await expect(page.locator(`${ARTIKEL} li`).first()).toBeVisible();
      await expect(page.locator(`${ARTIKEL} li`).nth(1)).toBeHidden();
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 3');
      await pressNachfassend(page, 'ArrowRight', async () => (await verborgene(page)) === 1);
      await pressNachfassend(page, 'ArrowRight', async () => (await verborgene(page)) === 0);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 3');
      // Erst nach dem letzten Schritt die naechste Folie.
      await pressNachfassend(page, 'ArrowRight', () => zaehlerIst(page, '2 / 3'));
      // Rueckwaerts betreten: vollstaendig.
      await pressNachfassend(page, 'ArrowLeft', () => zaehlerIst(page, '1 / 3'));
      expect(await verborgene(page)).toBe(0);
      // Zurueck deckt den zuletzt aufgedeckten Punkt wieder zu.
      await pressNachfassend(page, 'ArrowLeft', async () => (await verborgene(page)) === 1);
      await expect(page.locator(`${ARTIKEL} li`).nth(2)).toBeHidden();
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 3');
      await pressNachfassend(page, 'Escape', async () => !(await istVorfuehrung(page)));
      // Nach dem Ende ist die Folie wieder vollstaendig.
      await expect.poll(() => verborgene(page)).toBe(0);

      // --- Verkleinerung: Faktor zwischen 0,5 und 1, keine Markierung -------
      await pressUntil(page, 'End', () => zaehlerIst(page, '3 / 3'));
      await expect(page.locator(`${ARTIKEL} h2`)).toHaveText('Übervoll');
      await expect(page.locator(ARTIKEL)).toHaveAttribute('data-verkleinerung', /^0\.\d{4}$/);
      const faktor = Number(await page.locator(ARTIKEL).getAttribute('data-verkleinerung'));
      expect(faktor).toBeGreaterThanOrEqual(0.5);
      expect(faktor).toBeLessThan(1);
      await expect(page.locator(SLIDE)).not.toHaveClass(/presentation-slide--ueberlauf/);
      // Der verkleinerte Inhalt passt: die letzte Zeile liegt innerhalb der Folie.
      const lage = await page.locator(SLIDE).evaluate((slide) => {
        const letzte = slide.querySelector('.praesentation-folie li:last-child');
        const s = slide.getBoundingClientRect();
        const l = letzte.getBoundingClientRect();
        return { folieUnten: s.bottom, zeileUnten: l.bottom };
      });
      expect(lage.zeileUnten).toBeLessThanOrEqual(lage.folieUnten + 0.5);
      // Die kurze Folie bleibt unverkleinert.
      await pressUntil(page, 'Home', () => zaehlerIst(page, '1 / 3'));
      await expect(page.locator(ARTIKEL)).not.toHaveAttribute('data-verkleinerung', /.*/);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

// Eine Slot-Variable, wie sie an der gezeigten Folie steht.
function slotVariable(page, name) {
  return page.locator(SLIDE).evaluate((slide, n) => slide.style.getPropertyValue(n).trim(), name);
}

// Stand der gezeigten Folie: erste Ueberschrift, Hintergrund, Textfarbe,
// Fusszeile, sichtbare Seitenzahl.
async function folienStand(page) {
  return page.locator(SLIDE).evaluate((slide) => {
    const kopf = slide.querySelector('.praesentation-folie h1, .praesentation-folie h2');
    const fuss = slide.querySelector('.presentation-slide-fuss');
    const nummer = slide.querySelector('.presentation-slide-nummer');
    const sichtbar = (el) => Boolean(el) && getComputedStyle(el).display !== 'none' && !el.hidden;
    return {
      ueberschrift: kopf ? kopf.textContent.trim() : null,
      hintergrund: slide.style.getPropertyValue('--slide-background').trim(),
      text: slide.style.getPropertyValue('--slide-text').trim(),
      fuss: sichtbar(fuss) ? fuss.textContent.trim() : '',
      nummer: sichtbar(nummer) ? nummer.textContent.trim() : '',
    };
  });
}

test.describe('PR-18: Marp-Datei mit Angaben je Folie, headingDivider und Aufdeck-Listen (F-347)', () => {
  test('sechs Folien, Gestaltung je Folie, Seitenzahlen nach paginate, Befunde in der Hinweis-Zeile', async () => {
    const dir = machVerzeichnis();
    const datei = path.join(dir, 'marp-angaben-je-folie.md');
    fs.copyFileSync(path.join(FIXTURE_DIR, 'marp-angaben-je-folie.md'), datei);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 6');
      const staende = [];
      for (let i = 1; i <= 6; i += 1) {
        if (i > 1) await pressNachfassend(page, 'ArrowRight', () => zaehlerIst(page, `${i} / 6`));
        await expect(page.locator(ZAEHLER)).toHaveText(`${i} / 6`);
        staende.push(await folienStand(page));
        if (i === 2) {
          // Aufdeck-Liste: in der Ansicht vollstaendig, die `-`-Liste ist
          // eine eigene, normale Liste.
          await expect(page.locator(`${ARTIKEL} li`)).toHaveCount(4);
          expect(await verborgene(page)).toBe(0);
        }
        if (i === 6) {
          // Unbekanntes Theme und ungueltiger Wert dieser Folie als Hinweis.
          await expect(page.locator(HINWEISE)).toBeVisible();
          await expect(page.locator(HINWEISE)).toContainText('gaia');
          await expect(page.locator(HINWEISE)).toContainText('accent');
          expect(await slotVariable(page, '--slide-accent')).toBe('#4ea2ff');
        }
      }
      expect(staende).toEqual([
        {
          ueberschrift: 'Titel der Präsentation',
          hintergrund: '#ffffff',
          text: '#1f1f1f',
          fuss: '',
          nummer: '',
        },
        {
          ueberschrift: 'Nur diese Folie ist rot',
          hintergrund: '#c0392b',
          text: '#1f1f1f',
          fuss: '',
          nummer: '2',
        },
        {
          ueberschrift: 'Ab hier dunkel',
          hintergrund: '#1e1e1e',
          text: '#eeeeee',
          fuss: 'Ab hier dunkel',
          nummer: '3',
        },
        {
          ueberschrift: 'Neue Folie durch die Überschrift',
          hintergrund: '#1e1e1e',
          text: '#eeeeee',
          fuss: 'Ab hier dunkel',
          nummer: '',
        },
        {
          ueberschrift: 'Nur hier im Akzent-Theme',
          hintergrund: '#0a66c2',
          text: '#eeeeee',
          fuss: 'Ab hier dunkel',
          nummer: '4',
        },
        {
          ueberschrift: 'Wieder dunkel',
          hintergrund: '#1e1e1e',
          text: '#eeeeee',
          fuss: 'Ab hier dunkel',
          nummer: '5',
        },
      ]);
      // Notizen und Steuer-Kommentare stehen auf keiner Folie.
      await expect(page.locator(FLAECHE)).not.toContainText('Begrüßen');
      await expect(page.locator(FLAECHE)).not.toContainText('headingDivider');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});
