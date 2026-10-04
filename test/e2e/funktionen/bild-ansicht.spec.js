// 4T-001870 (Epic 3E-000322): vergrößerte Darstellung eines Bildes der
// gerenderten Ansicht.
//
// VG-01: Öffnen, Größen-Regel, Abdunkelung und die drei Schließ-Wege.
// VG-02: Beschriftung, Orte des Bildes (Tabelle, Hinweis-Kasten, Abbildung,
//        Einbettung), Daten-Quelle, Bild als Verweis, nicht angezeigte Bilder
//        und die Zusatz-Taste.
// VG-03: Schaltfläche ins Standardprogramm (Erfolg und Fehlschlag), Tastatur.
// VG-04: geteilte Ansicht öffnet, Live-Ansicht nicht (weder Klick noch
//        Doppelklick); dort öffnet der Doppelklick das Standardprogramm.
// VG-05: abgeschaltete Erweiterungen «figures» und «wiki-embeds».
//
// Der Weg ins Standardprogramm wird im Hauptprozess abgefangen (Muster AN-08
// in anlagen.spec.js): geprüft wird, DASS und WOMIT geöffnet wird, nicht das
// Programm selbst.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');

// --- Bild-Material ---------------------------------------------------------
// Einfarbige PNG-Dateien in gewünschter Größe, ohne Fremd-Paket erzeugt. Die
// Größe ist der Gegenstand der Messung, die Farbe nur der Sichtbarkeit wegen.
const CRC_TAFEL = (() => {
  const tafel = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tafel[n] = c >>> 0;
  }
  return tafel;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TAFEL[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(typ, daten) {
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(daten.length);
  const typUndDaten = Buffer.concat([Buffer.from(typ, 'ascii'), daten]);
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE(crc32(typUndDaten));
  return Buffer.concat([laenge, typUndDaten, pruef]);
}

function png(breite, hoehe, [r, g, b]) {
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(breite, 0);
  kopf.writeUInt32BE(hoehe, 4);
  kopf[8] = 8; // Bit-Tiefe
  kopf[9] = 2; // Farbtyp RGB
  const zeile = Buffer.alloc(1 + breite * 3);
  for (let x = 0; x < breite; x += 1) {
    zeile[1 + x * 3] = r;
    zeile[2 + x * 3] = g;
    zeile[3 + x * 3] = b;
  }
  const roh = Buffer.concat(Array.from({ length: hoehe }, () => zeile));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', kopf),
    chunk('IDAT', zlib.deflateSync(roh)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const DATEN_BILD = png(60, 40, [20, 160, 60]).toString('base64');

const DOKUMENT = [
  '# Bilder',
  '',
  'Ein Absatz zum Anklicken.',
  '',
  '![Grundriss](bilder/gross.png)',
  '',
  '![](bilder/ohne-alt.png)',
  '',
  '![Symbol](bilder/klein.png)',
  '',
  '![Hoch](bilder/hoch.png)',
  '',
  '![Klein gesetzt](bilder/gross.png =200x)',
  '',
  '| Spalte |',
  '|---|',
  '| ![In Tabelle](bilder/klein.png) |',
  '',
  '> [!note]',
  '> ![Im Kasten](bilder/klein.png)',
  '',
  '![[eingebettet.png]]',
  '',
  '[![Als Verweis](bilder/klein.png)](https://example.org/)',
  '',
  '![Fehlt](bilder/gibt-es-nicht.png)',
  '',
  '[![Fehlt im Verweis](bilder/gibt-es-auch-nicht.png)](Ziel.md)',
  '',
  '![Netz](https://example.org/netz.png)',
  '',
  `![](data:image/png;base64,${DATEN_BILD})`,
  '',
  '[bericht](bilder/bericht.pdf)',
  '',
].join('\n');

function legeMaterialAn(prefix) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const bilder = path.join(workDir, 'bilder');
  fs.mkdirSync(bilder);
  fs.writeFileSync(path.join(bilder, 'gross.png'), png(1600, 1200, [200, 40, 40]));
  fs.writeFileSync(path.join(bilder, 'klein.png'), png(120, 80, [40, 80, 220]));
  fs.writeFileSync(path.join(bilder, 'ohne-alt.png'), png(300, 200, [230, 160, 20]));
  fs.writeFileSync(path.join(bilder, 'hoch.png'), png(200, 3000, [120, 40, 160]));
  fs.writeFileSync(path.join(bilder, 'bericht.pdf'), 'PDF', 'utf8');
  fs.writeFileSync(path.join(workDir, 'eingebettet.png'), png(400, 300, [30, 150, 150]));
  fs.writeFileSync(path.join(workDir, 'Ziel.md'), '# Ziel\n', 'utf8');
  const file = path.join(workDir, 'Bilder.md');
  fs.writeFileSync(file, DOKUMENT, 'utf8');
  return { workDir, file, bilder };
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht rot machen */
  }
}

// Fängt beide Wege nach außen im Hauptprozess ab und sammelt die Aufrufe.
async function fangeOeffnenAb(app) {
  await hauptSenden(app, ({ shell }) => {
    globalThis.__geoeffnet = [];
    globalThis.__extern = [];
    shell.openPath = async (p) => {
      globalThis.__geoeffnet.push(p);
      return '';
    };
    shell.openExternal = async (u) => {
      globalThis.__extern.push(u);
    };
  });
}
const geoeffnete = (app) => hauptLesen(app, () => globalThis.__geoeffnet || []);
const externe = (app) => hauptLesen(app, () => globalThis.__extern || []);

const FLAECHE = '#image-lightbox';
const FL_BILD = '#image-lightbox .image-lightbox-image';
const FL_TEXT = '#image-lightbox .image-lightbox-caption';
const FL_STANDARD = '#image-lightbox .image-lightbox-open-external';
const FL_SCHLIESSEN = '#image-lightbox .image-lightbox-close';

// Wartet, bis das Bild der Ansicht geladen ist: Erst dann gilt es als angezeigt.
async function geladen(locator) {
  await expect
    .poll(() => locator.evaluate((img) => img.complete && img.naturalWidth > 0), {
      timeout: 5000,
    })
    .toBe(true);
}

// Maße des Bildes in der Fläche samt Bühne und Fenster.
function miss(page) {
  return page.evaluate(() => {
    const img = document.querySelector('#image-lightbox .image-lightbox-image');
    const buehne = document.querySelector('#image-lightbox .image-lightbox-stage');
    const r = img.getBoundingClientRect();
    const s = buehne.getBoundingClientRect();
    return {
      breite: r.width,
      hoehe: r.height,
      links: r.left,
      oben: r.top,
      rechts: r.right,
      unten: r.bottom,
      natB: img.naturalWidth,
      natH: img.naturalHeight,
      buehne: { links: s.left, oben: s.top, breite: s.width, hoehe: s.height },
      fenster: { breite: window.innerWidth, hoehe: window.innerHeight },
    };
  });
}

// Größen-Regel (E10): nicht größer als die eigene Auflösung, vollständig im
// Fenster, Seitenverhältnis unverändert, und ein größeres Bild füllt die Bühne
// in einer Richtung aus.
function pruefeGroesse(m) {
  expect(m.breite).toBeLessThanOrEqual(m.natB + 0.5);
  expect(m.hoehe).toBeLessThanOrEqual(m.natH + 0.5);
  expect(m.links).toBeGreaterThanOrEqual(-0.5);
  expect(m.oben).toBeGreaterThanOrEqual(-0.5);
  expect(m.rechts).toBeLessThanOrEqual(m.fenster.breite + 0.5);
  expect(m.unten).toBeLessThanOrEqual(m.fenster.hoehe + 0.5);
  expect(Math.abs(m.breite / m.hoehe - m.natB / m.natH)).toBeLessThan(0.02);
  const groesser = m.natB > m.buehne.breite || m.natH > m.buehne.hoehe;
  if (groesser) {
    const fuelltBreite = Math.abs(m.breite - m.buehne.breite) <= 1.5;
    const fuelltHoehe = Math.abs(m.hoehe - m.buehne.hoehe) <= 1.5;
    expect(fuelltBreite || fuelltHoehe).toBe(true);
  }
}

test.describe('VG-01: Öffnen, Größe, Abdunkelung und die drei Schließ-Wege', () => {
  test('Klick öffnet, Größen-Regel hält, Klick daneben, Escape und «Schließen» schließen', async () => {
    const { workDir, file } = legeMaterialAn('vg01-');
    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await fangeOeffnenAb(app);
      const body = page.locator(SEL.markdownBody0);
      const flaeche = page.locator(FLAECHE);

      // AK15: kleines Bild in eigener Größe, mittig auf der Bühne.
      const symbol = body.locator('img[alt="Symbol"]');
      await geladen(symbol);
      await symbol.scrollIntoViewIfNeeded();
      // AK8: Fokus-Ziel und Scroll-Stand vor dem Öffnen festhalten. Der
      // vorbereitende Klick in den Text setzt den Fokus dorthin, wo auch der
      // Klick auf das Bild ihn lässt.
      await body.locator('p', { hasText: 'Ein Absatz zum Anklicken.' }).click();
      await symbol.scrollIntoViewIfNeeded();
      const vorher = await page.evaluate(() => {
        window.__fokusVorher = document.activeElement;
        return document.querySelector('.pane-group[data-pane="0"] .pane-rendered').scrollTop;
      });
      await symbol.click();
      await expect(flaeche).toBeVisible();
      await expect(page.locator(FL_TEXT)).toHaveText('Symbol');
      let m = await miss(page);
      expect(m.breite).toBeCloseTo(120, 0);
      expect(m.hoehe).toBeCloseTo(80, 0);
      const mitteBuehneX = m.buehne.links + m.buehne.breite / 2;
      const mitteBuehneY = m.buehne.oben + m.buehne.hoehe / 2;
      expect(Math.abs(m.links + m.breite / 2 - mitteBuehneX)).toBeLessThan(1.5);
      expect(Math.abs(m.oben + m.hoehe / 2 - mitteBuehneY)).toBeLessThan(1.5);
      expect(Math.abs(mitteBuehneX - m.fenster.breite / 2)).toBeLessThan(1.5);

      // AK3: Die Abdunkelung deckt das ganze Fenster, und Punkte über dem
      // sichtbaren Dokument und über der Reiterleiste treffen die Fläche statt
      // das Dokument darunter.
      const deckung = await page.evaluate(() => {
        const bd = document.querySelector('#image-lightbox .image-lightbox-backdrop');
        const r = bd.getBoundingClientRect();
        const farbe = getComputedStyle(bd).backgroundColor;
        const alpha = Number((farbe.match(/rgba?\(([^)]+)\)/)[1].split(',')[3] || '1').trim());
        const ansicht = document
          .querySelector('.pane-group[data-pane="0"] .pane-rendered')
          .getBoundingClientRect();
        const leiste = document
          .querySelector('.pane-group[data-pane="0"] .tabbar')
          .getBoundingClientRect();
        const punkte = [
          [ansicht.left + 12, ansicht.top + 12],
          [ansicht.left + ansicht.width / 2, ansicht.bottom - 12],
          [leiste.left + 20, leiste.top + leiste.height / 2],
        ];
        return {
          deckt: r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight,
          alpha,
          treffer: punkte.map(([x, y]) => {
            const el = document.elementFromPoint(x, y);
            return !!el && !!el.closest('#image-lightbox');
          }),
        };
      });
      expect(deckung.deckt).toBe(true);
      expect(deckung.alpha).toBeGreaterThan(0.5);
      expect(deckung.treffer).toEqual([true, true, true]);

      // AK4: Klick auf die abgedunkelte Fläche schließt.
      await page.mouse.click(8, 8);
      await expect(flaeche).toBeHidden();
      // AK8: Ansicht an derselben Stelle, Fokus zurück.
      const nachher = await page.evaluate(() => ({
        scroll: document.querySelector('.pane-group[data-pane="0"] .pane-rendered').scrollTop,
        fokusGleich: document.activeElement === window.__fokusVorher,
      }));
      expect(nachher.scroll).toBe(vorher);
      expect(nachher.fokusGleich).toBe(true);

      // AK2/AK21: großes Bild auf die Bühne verkleinert, vollständig, Verhältnis
      // gleich. AK5: Escape schließt.
      const gross = body.locator('img[alt="Grundriss"]');
      await geladen(gross);
      await gross.click();
      await expect(flaeche).toBeVisible();
      m = await miss(page);
      expect(m.natB).toBe(1600);
      pruefeGroesse(m);
      expect(m.breite).toBeLessThan(1600);
      // AK20: Fenster verkleinern — das Bild folgt nach derselben Regel.
      const vorGroesse = m;
      await hauptSenden(app, ({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].setSize(820, 620);
      });
      await expect
        .poll(() => page.evaluate(() => window.innerWidth), { timeout: 5000 })
        .toBeLessThan(vorGroesse.fenster.breite);
      await expect.poll(async () => (await miss(page)).breite).toBeLessThan(vorGroesse.breite);
      pruefeGroesse(await miss(page));
      await page.keyboard.press('Escape');
      await expect(flaeche).toBeHidden();

      // AK21: sehr hohes Bild vollständig sichtbar. AK6: «Schließen» schließt.
      const hoch = body.locator('img[alt="Hoch"]');
      await geladen(hoch);
      await hoch.click();
      await expect(flaeche).toBeVisible();
      m = await miss(page);
      expect(m.natH).toBe(3000);
      pruefeGroesse(m);
      await page.locator(FL_SCHLIESSEN).click();
      await expect(flaeche).toBeHidden();

      // AK22: Die Größen-Angabe der Bild-Syntax begrenzt die Vergrößerung nicht.
      const gesetzt = body.locator('img[alt="Klein gesetzt"]');
      await geladen(gesetzt);
      const imDokument = await gesetzt.evaluate((img) => img.getBoundingClientRect().width);
      expect(imDokument).toBeLessThanOrEqual(201);
      await gesetzt.click();
      await expect(flaeche).toBeVisible();
      m = await miss(page);
      expect(m.breite).toBeGreaterThan(imDokument + 50);
      pruefeGroesse(m);
      await page.keyboard.press('Escape');

      // Keiner der Wege hat etwas nach außen geöffnet.
      expect(await geoeffnete(app)).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

test.describe('VG-02: Beschriftung, Orte des Bildes und nicht angezeigte Bilder', () => {
  test('jedes angezeigte Bild öffnet mit eigener Beschriftung, nicht angezeigte bleiben wirkungslos', async () => {
    const { workDir, file } = legeMaterialAn('vg02-');
    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await fangeOeffnenAb(app);
      const body = page.locator(SEL.markdownBody0);
      const flaeche = page.locator(FLAECHE);

      // AK16/AK18/AK19: Tabelle, Hinweis-Kasten, Abbildung, Einbettung, ohne
      // Alternativtext — nacheinander, jede Öffnung mit eigenem Bild und Text.
      const faelle = [
        { sel: 'table img', text: 'In Tabelle' },
        { sel: '.callout img', text: 'Im Kasten' },
        { sel: 'figure img[alt="Grundriss"]', text: 'Grundriss' },
        { sel: 'img.wiki-embed-image', text: 'eingebettet.png' },
        { sel: 'img[data-src-original="bilder/ohne-alt.png"]', text: 'ohne-alt.png' },
      ];
      for (const fall of faelle) {
        const img = body.locator(fall.sel).first();
        await geladen(img);
        const quelle = await img.getAttribute('src');
        await img.click();
        await expect(flaeche).toBeVisible();
        await expect(page.locator(FL_TEXT)).toHaveText(fall.text);
        await expect(page.locator(FL_BILD)).toHaveAttribute('src', quelle);
        await expect(page.locator(FL_STANDARD)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(flaeche).toBeHidden();
      }

      // AK14/AK16: Daten-Quelle ohne Alternativtext — Vergrößerung ohne
      // Schaltfläche ins Standardprogramm und ohne Beschriftung.
      const daten = body.locator('img[src^="data:"]:not([data-src-original])');
      await geladen(daten);
      await daten.click();
      await expect(flaeche).toBeVisible();
      await expect(page.locator(FL_STANDARD)).toBeHidden();
      await expect(page.locator(FL_TEXT)).toBeHidden();
      await expect(page.locator(FL_SCHLIESSEN)).toBeVisible();
      await page.keyboard.press('Escape');

      // AK23: Bild als Verweis öffnet die Vergrößerung, nicht den Verweis.
      await body.locator('a[href="https://example.org/"] img').click();
      await expect(flaeche).toBeVisible();
      await expect(page.locator(FL_TEXT)).toHaveText('Als Verweis');
      await page.keyboard.press('Escape');

      // AK17: Klick mit Zusatz-Taste — ebenfalls die Vergrößerung, kein Weg
      // ins Standardprogramm.
      await body.locator('img[alt="Symbol"]').click({ modifiers: ['Control'] });
      await expect(flaeche).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(flaeche).toBeHidden();

      // AK11: fehlende Datei und Netz-Bild — keine Fläche, keine Wirkung.
      await body.locator('img[alt="Fehlt"]').click();
      await body.locator('img[alt="Netz"]').click();
      await page.waitForTimeout(300);
      await expect(flaeche).toBeHidden();
      expect(await page.locator(SEL.tabs0).count()).toBe(1);

      // AK11: fehlendes Bild in einem Verweis folgt dem Verweis.
      await body.locator('img[alt="Fehlt im Verweis"]').click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await expect(flaeche).toBeHidden();

      expect(await geoeffnete(app)).toEqual([]);
      expect(await externe(app)).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

test.describe('VG-03: Schaltfläche ins Standardprogramm und Tastatur', () => {
  test('öffnet die Bild-Datei, bleibt offen — auch im Fehlschlag —, Tabulator bleibt in der Fläche', async () => {
    const { workDir, file, bilder } = legeMaterialAn('vg03-');
    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await fangeOeffnenAb(app);
      const body = page.locator(SEL.markdownBody0);
      const flaeche = page.locator(FLAECHE);

      // AK10: Der Klick auf eine übrige Anlage öffnet sie unverändert.
      await body.locator('a[href="bilder/bericht.pdf"]').click();
      await expect
        .poll(() => geoeffnete(app), { timeout: 5000 })
        .toEqual([path.join(bilder, 'bericht.pdf')]);

      // AK7: Schaltfläche öffnet die Bild-Datei; die Vergrößerung bleibt offen.
      const symbol = body.locator('img[alt="Symbol"]');
      await geladen(symbol);
      await symbol.click();
      await expect(flaeche).toBeVisible();
      await page.locator(FL_STANDARD).click();
      await expect.poll(async () => (await geoeffnete(app)).length, { timeout: 5000 }).toBe(2);
      expect((await geoeffnete(app))[1]).toBe(path.join(bilder, 'klein.png'));
      await expect(flaeche).toBeVisible();

      // AK12: Fokus startet auf «Schließen», der Tabulator wechselt zwischen den
      // beiden Schaltflächen und verlässt die Fläche nicht.
      await page.locator(FL_SCHLIESSEN).focus();
      const fokus = () =>
        page.evaluate(() => {
          const el = document.activeElement;
          return el && el.closest('#image-lightbox') ? el.className : 'ausserhalb';
        });
      await page.keyboard.press('Tab');
      expect(await fokus()).toContain('image-lightbox-open-external');
      await page.keyboard.press('Tab');
      expect(await fokus()).toContain('image-lightbox-close');
      await page.keyboard.press('Shift+Tab');
      expect(await fokus()).toContain('image-lightbox-open-external');
      // Per Tastatur auslösbar: Enter auf «Im Standardprogramm öffnen».
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await geoeffnete(app)).length, { timeout: 5000 }).toBe(3);
      await expect(flaeche).toBeVisible();
      // Enter auf «Schließen» schließt.
      await page.keyboard.press('Tab');
      expect(await fokus()).toContain('image-lightbox-close');
      await page.keyboard.press('Enter');
      await expect(flaeche).toBeHidden();

      // AK7, Fehlschlag: Die Datei verschwindet nach dem Anzeigen. Die Meldung
      // erscheint wie bisher, die Vergrößerung bleibt offen.
      const grund = body.locator('img[alt="Grundriss"]');
      await geladen(grund);
      fs.rmSync(path.join(bilder, 'gross.png'));
      await grund.click();
      await expect(flaeche).toBeVisible();
      await page.locator(FL_STANDARD).click();
      const hinweis = page.locator('.statusbar-hint.visible');
      await expect(hinweis).toBeVisible({ timeout: 5000 });
      await expect(hinweis).toHaveClass(/error/);
      await expect(flaeche).toBeVisible();
      // Die Meldung steht über der Abdunkelung (E16).
      const ebene = await page.evaluate(() => {
        const h = document.querySelector('.statusbar-hint');
        return Number(getComputedStyle(h).zIndex);
      });
      expect(ebene).toBeGreaterThan(3000);
      expect(await geoeffnete(app)).toHaveLength(3);
      await page.keyboard.press('Escape');
      await expect(flaeche).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

test.describe('VG-04: geteilte Ansicht öffnet, Live-Ansicht nicht', () => {
  test('gerenderte Hälfte öffnet; Live-Ansicht: weder Klick noch Doppelklick öffnen eine Vergrößerung, der Doppelklick öffnet das Standardprogramm', async () => {
    const { workDir, file } = legeMaterialAn('vg04-');
    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await fangeOeffnenAb(app);
      const flaeche = page.locator(FLAECHE);

      // AK1: gerenderte Hälfte der Ansicht «Geteilt».
      await page.locator(SEL.viewBtn('split')).click();
      const imSplit = page.locator(`${SEL.markdownBody0} img[alt="Symbol"]`);
      await expect(page.locator(SEL.paneSource0)).toBeVisible();
      await geladen(imSplit);
      await imSplit.click();
      await expect(flaeche).toBeVisible();
      await expect(page.locator(FL_TEXT)).toHaveText('Symbol');
      await page.keyboard.press('Escape');
      await expect(flaeche).toBeHidden();

      // AK25: Live-Ansicht — weder der einfache noch der doppelte Klick auf ein
      // Bild öffnet eine Vergrößerung; der Klick-Pfad der gerenderten Ansicht
      // ist dort nicht eingehängt. Der Doppelklick öffnet das Bild dort seit
      // 4T-001925 unverändert im Standardprogramm (4S-000989, AK26); bis dahin
      // erreichte er seinen Behandler nie. Die Fälle dazu stehen in
      // test/e2e/regression/4t-001925-bild-doppelklick-live.spec.js.
      await page.locator(SEL.viewBtn('live')).click();
      const imLive = page.locator(`${SEL.paneSource0} img[data-src-original="bilder/klein.png"]`);
      await expect(imLive.first()).toBeVisible({ timeout: 5000 });
      await imLive.first().click();
      await page.waitForTimeout(300);
      await expect(flaeche).toBeHidden();
      expect(await geoeffnete(app)).toEqual([]);
      await imLive.first().dblclick();
      await expect
        .poll(() => geoeffnete(app), { timeout: 5000 })
        .toEqual([path.join(workDir, 'bilder', 'klein.png')]);
      await expect(flaeche).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

test.describe('VG-05: abgeschaltete Erweiterungen', () => {
  test('ohne «figures» bleibt jedes Bild vergrößerbar, ohne «wiki-embeds» entsteht keines', async () => {
    const { workDir, file } = legeMaterialAn('vg05-');
    const { app, page, userData } = await launchApp({
      args: [file],
      settings: { language: 'de', extensions: { disabled: ['figures', 'wiki-embeds'] } },
    });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      const body = page.locator(SEL.markdownBody0);
      const flaeche = page.locator(FLAECHE);
      // Ohne «figures» keine Abbildung — das Bild ist trotzdem vergrößerbar.
      await expect(body.locator('figure')).toHaveCount(0);
      const grund = body.locator('img[alt="Grundriss"]');
      await geladen(grund);
      await grund.click();
      await expect(flaeche).toBeVisible();
      await expect(page.locator(FL_TEXT)).toHaveText('Grundriss');
      await page.keyboard.press('Escape');
      await expect(flaeche).toBeHidden();
      // Ohne «wiki-embeds» entsteht aus der Einbettung kein Bild.
      await expect(body.locator('img.wiki-embed-image')).toHaveCount(0);
      await expect(body.locator('img[data-src-original$="eingebettet.png"]')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});
