// 4T-001354 und 4T-001355 (Epic 3E-000240): Darstellung der Aufgaben-Zeilen im
// Live-Modus. Regressionstests zu zwei Befunden des Product Owners vom
// 2026-09-01 an seinem taeglichen Arbeits-Dokument.
//
// **Eine Ursache, zwei Befunde.** Der haengende Einzug aus `4T-001312` setzt auf
// jeder Listen-Zeile einen negativen Erst-Zeilen-Einzug. `text-indent` vererbt
// sich und wirkt auf jedem Block-Container — also auch auf den eingebetteten
// inline-block-Kaesten der Zeile. Die Marker-Plakette schrieb ihr Datum
// dadurch mitten in den Zeilen-Text, und das erweiterte Status-Zeichen stand
// links neben seinem Kaestchen statt darin.
//
// **Szenario-Treue** (test/README.md): Die Fixture traegt die Original-Zeilen
// der Meldung, nicht das Minimal-Szenario der Ursache.
//
// **Warum beide Faelle den Einzug mitpruefen.** Ohne die Gegen-Zusicherung,
// dass die Zeile den negativen Einzug weiterhin traegt, wuerden die Faelle
// auch dann gruen, wenn jemand den haengenden Einzug schlicht entfernte — sie
// pruefen den Ruecksetzer auf den Nachkommen, nicht die Abwesenheit des
// Einzugs.
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
  'aufgaben-darstellung.md',
);

// Plaketten einer Wurzel samt der Frage, ob ihr Inhalt in der eigenen Box
// liegt. Gemessen wird ueber die Rechtecke des Inhalts und nicht ueber den
// berechneten Stilwert: Ein gesetzter Wert beweist nicht, dass die Darstellung
// ihm folgt (Muster aus zeilenumbruch.spec.js).
async function plaketten(page, wurzel) {
  return await page.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(`${sel} .task-marker`)) {
      const box = el.getBoundingClientRect();
      const r = document.createRange();
      r.selectNodeContents(el);
      const stuecke = [...r.getClientRects()].filter((x) => x.width > 0);
      if (!stuecke.length) continue;
      const inhaltLinks = Math.min(...stuecke.map((x) => x.left));
      const zeile = el.closest('.cm-line') || el.closest('li') || el.parentElement;
      out.push({
        text: el.textContent,
        zeile: zeile ? zeile.textContent : '',
        // Positiv = der Inhalt steht links ausserhalb seiner eigenen Box.
        ueberstandLinks: Math.round((box.left - inhaltLinks) * 100) / 100,
      });
    }
    return out;
  }, wurzel);
}

// Einzugs- und Marker-Lage je Editor-Zeile.
async function zeilenLage(page) {
  return await page.evaluate(() => {
    const zahl = (wert) => Math.round(parseFloat(wert) * 100) / 100 || 0;
    return [...document.querySelectorAll('.cm-editor .cm-line')].map((zeile) => {
      const marker = zeile.querySelector('.cm-live-task-marker');
      return {
        text: zeile.textContent,
        eingerueckt: zeile.classList.contains('cm-haengender-einzug'),
        zeilenEinzug: zahl(getComputedStyle(zeile).textIndent),
        marker: marker
          ? {
              klasse: marker.className,
              zeichen: marker.getAttribute('data-live-task-state'),
              einzugKasten: zahl(getComputedStyle(marker, '::before').textIndent),
            }
          : null,
      };
    });
  });
}

async function inLiveModus(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await page.locator(SEL.viewBtn('live')).click();
  await expect(page.locator(`${SEL.paneSource0} .cm-live-task-marker-badge`).first()).toBeVisible({
    timeout: 15000,
  });
}

test.describe('AD-01: Marker-Plakette am Ende der Aufgaben-Zeile', () => {
  test('die Plakette schreibt ihr Datum hinter den Zeilen-Text, nicht in ihn', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await inLiveModus(page);

      const gemessen = await plaketten(page, SEL.paneSource0);
      // Beide Original-Zeilen der Meldung tragen ihre Plakette.
      expect(gemessen.map((p) => p.text)).toEqual(['✅ 2026-09-01', '✅ 2026-09-01']);

      for (const p of gemessen) {
        // Der Inhalt darf nicht links aus seiner eigenen Box herausragen.
        // Vor der Behebung waren es 41,16 px — die 6 Zeichenbreiten des
        // Einzugs abzueglich des Innenabstands der Plakette.
        expect(p.ueberstandLinks).toBeLessThanOrEqual(0.5);
      }

      // AK2: Der Zeilen-Text steht vollstaendig; die Plakette ersetzt allein
      // ihr eigenes Marker-Segment. Das faengt zugleich den zweiten
      // Ursachen-Kandidaten ab, eine falsch zurueckgerechnete Segment-Position.
      //
      // Das Trenn-Leerzeichen vor dem Marker gehoert zum Rohtext des Segments
      // (parseTaskLine setzt die Zeile aus Beschreibung, Segment-Rohtexten und
      // Zeilenende-Weissraum zusammen) und liegt damit im ersetzten Bereich;
      // den sichtbaren Abstand traegt der linke Aussenabstand der Plakette.
      const lagen = await zeilenLage(page);
      const erste = lagen.find((z) => z.text.includes('Offenes vom letzten Tag'));
      const zweite = lagen.find((z) => z.text.includes('01 Eingang'));
      expect(erste.text).toBe('- [x] Offenes vom letzten Tag übertragen✅ 2026-09-01');
      expect(zweite.text).toBe('- [x] Ordner „01 Eingang" prüfen (siehe unten)✅ 2026-09-01');

      // Gegen-Zusicherung: Der haengende Einzug wirkt auf der Zeile weiter.
      expect(erste.eingerueckt).toBe(true);
      expect(erste.zeilenEinzug).toBeLessThan(0);
      expect(zweite.zeilenEinzug).toBeLessThan(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-001355: Die zweite Wirkung derselben Ursache. Der Eingriff liegt in
// 4T-001354; hier steht seine Absicherung am Status-Kaestchen.
//
// Gemessen wird der geerbte Einzug am Kasten selbst und nicht die Lage seines
// Zeichens: Das Zeichen ist Inhalt eines Pseudo-Elements und hat im DOM kein
// Rechteck, das sich auslesen liesse. Der Darstellungs-Nachweis kommt aus der
// Test-Iteration an der gebauten Programmdatei (Entscheidung des Product
// Owners vom 2026-09-01).
test.describe('AD-02: Erweitertes Status-Zeichen im Kaestchen', () => {
  test('der negative Zeilen-Einzug erreicht das Status-Kaestchen nicht', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await inLiveModus(page);
      const lagen = await zeilenLage(page);

      // Beide Listen-Arten (AK2 des Tasks): die zwei nummerierten
      // Original-Zeilen der Meldung und die Aufzaehlungs-Zeile.
      const status = lagen.filter((z) => z.marker && z.marker.zeichen === '/');
      expect(status).toHaveLength(3);

      for (const z of status) {
        // Ein Kasten je Zeile, nicht zwei: Die Dekoration wird nicht
        // zerschnitten (Ursachen-Kandidat A des Tasks).
        expect(z.marker.klasse).toContain('cm-live-task-state');
        // Der Kasten des Status-Zeichens darf den Einzug der Zeile nicht
        // erben; sonst rueckt sein Zeichen aus ihm heraus nach links.
        expect(z.marker.einzugKasten).toBe(0);
        // Gegen-Zusicherung: Die Zeile selbst traegt ihn weiterhin.
        expect(z.eingerueckt).toBe(true);
        expect(z.zeilenEinzug).toBeLessThan(0);
      }

      // AK4: Die beiden Basis-Zustaende bleiben unveraendert dekoriert.
      const erledigt = lagen.filter((z) => z.marker && z.marker.zeichen === null);
      expect(erledigt).toHaveLength(2);
      for (const z of erledigt) {
        expect(z.marker.klasse).toContain('cm-live-task-checked');
        expect(z.marker.einzugKasten).toBe(0);
      }
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('AD-03: Gerenderte Ansicht bleibt unberuehrt', () => {
  test('die Plakette der gerenderten Ansicht steht ebenfalls in ihrer Box', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('.task-marker').first()).toBeVisible({ timeout: 15000 });

      // AK6: Der haengende Einzug ist auf `.cm-editor` gescopet — die
      // gerenderte Ansicht kann ihn nicht erben. Hier wird das gemessen
      // statt behauptet.
      const gemessen = await plaketten(page, SEL.markdownBody0);
      expect(gemessen.length).toBeGreaterThan(0);
      for (const p of gemessen) {
        expect(p.ueberstandLinks).toBeLessThanOrEqual(0.5);
      }
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
