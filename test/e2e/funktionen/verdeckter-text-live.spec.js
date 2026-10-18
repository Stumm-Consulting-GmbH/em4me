// VT-01 (4T-002096, Story 4S-000122): Verdeckter Text (`||Text||`) bleibt im
// Live-Modus verdeckt, auch wenn er eingefärbte Bestandteile enthält.
//
// **Anlass.** Die Lese-Ansicht neutralisiert innere Elemente des verdeckten
// Textes (Farbe geerbt, kein eigener Hintergrund); im Live-Modus fehlte diese
// Regel. Eine innere Spanne mit eigener Schriftfarbe aus der Syntax-Einfärbung
// (Inline-Code, Verweis, Hervorhebung) blieb dadurch auf dem deckenden Kasten
// lesbar.
//
// **Ersatz-Zeilen, nicht die reale Zeile.** Die Zeile aus dem Befund des
// Product Owners liegt nicht vor; geprüft wird an nachgebauten Zeilen mit
// Inline-Code, Verweis und Hervorhebung im verdeckten Text und in einer
// Listenzeile. Der Nachweis an der realen Zeile gehört zur Abnahme.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const INHALT = [
  '# Verdeckter Text',
  '',
  'Text davor.',
  '',
  'Mit Code: ||Termin `ausmachen` heute||',
  '',
  'Mit Verweis: ||Siehe [Liste](https://example.com) dort||',
  '',
  'Mit Hervorhebung: ||ganz **wichtig** bleibt||',
  '',
  '- [ ] Aufgabe ||Termin `ausmachen`|| in der Liste',
  '',
  'Text danach.',
  '',
].join('\n');

function legeDateiAn() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-'));
  const file = path.join(dir, 'verdeckt.md');
  fs.writeFileSync(file, INHALT, 'utf8');
  return { dir, file };
}

// Farben jedes verdeckten Bereichs: Kasten-Hintergrund und die Schriftfarbe
// jedes Textknotens darin (am Eltern-Element des Knotens gemessen).
async function farben(page) {
  return page.locator(`${SEL.paneSource0} .cm-live-spoiler`).evaluateAll((spoiler) =>
    spoiler.map((el) => {
      const kasten = getComputedStyle(el).backgroundColor;
      const schriften = [];
      const lauf = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = lauf.nextNode(); n; n = lauf.nextNode()) {
        if (!n.textContent.trim()) continue;
        const stil = getComputedStyle(n.parentElement);
        schriften.push({ text: n.textContent, farbe: stil.color, grund: stil.backgroundColor });
      }
      return { text: el.textContent, kasten, schriften };
    }),
  );
}

test.describe('VT-01: Verdeckter Text bleibt im Live-Modus verdeckt (4T-002096)', () => {
  test('eingefärbte Bestandteile sind ohne Maus nicht lesbar, mit Maus darüber lesbar', async () => {
    const { dir, file } = legeDateiAn();
    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.viewBtn('live')).click();
      await expect(page.locator(SEL.content0)).toHaveClass(/view-live/);
      const spoiler = page.locator(`${SEL.paneSource0} .cm-live-spoiler`);
      await expect(spoiler).toHaveCount(4);
      // Die Maus aus dem Editor nehmen, damit kein Bereich aufgedeckt ist.
      await page.mouse.move(0, 0);

      for (const thema of ['light', 'dark']) {
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), thema);
        for (const bereich of await farben(page)) {
          // Ersatz-Zeilen tragen eingefärbte Bestandteile (mehr als eine Spanne).
          expect(bereich.schriften.length, bereich.text).toBeGreaterThan(1);
          for (const s of bereich.schriften) {
            expect(s.farbe, `${thema}: «${s.text}» in «${bereich.text}»`).toBe(bereich.kasten);
          }
        }
      }

      // Mit der Maus darauf ist der Bereich lesbar: Schrift und Kasten verschieden.
      await spoiler.first().hover();
      const aufgedeckt = (await farben(page))[0];
      expect(aufgedeckt.schriften.some((s) => s.farbe !== aufgedeckt.kasten)).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
