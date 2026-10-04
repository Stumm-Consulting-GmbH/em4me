// 4T-001925 (Epic 3E-000322): Regressions-Spec zum Doppelklick auf ein Bild der
// Live-Ansicht und zum Bild in einer eingebetteten Notiz.
//
// **Anlass.** Der Doppelklick-Weg ins Standardprogramm wurde für Editor und
// Live-Ansicht am 2026-07-29 eingeführt (4T-000790) und hat in der
// Live-Ansicht nie gewirkt: Die Bild-Elemente der Live-Ansicht liessen jedes
// Ereignis vom Editor ignorieren, der Doppelklick-Behandler lief deshalb nie.
// Geprüft war allein der Weg der gerenderten Ansicht (AN-09); gefunden am
// 2026-09-23 beim Bau des Ablauf-Falls VG-04 (Fehlerklasse L10/U3).
//
// DK-01: Bild als Markdown-Bild, Lese- und Bearbeiten-Zustand der Live-Ansicht;
//        Dokument und Schreibmarke bleiben unberührt, keine Vergrößerung.
// DK-02: die übrigen Orte eines Bildes in der Live-Ansicht — Bild-Einbettung
//        und Bild in einer Tabelle.
// DK-03: Daten-Quelle und Netz-Bild bleiben ohne Reaktion.
// DK-04: dieselbe Meldung wie im Bestand, wenn die Datei inzwischen fehlt.
// DK-05: Nebenbefund — ein Bild in einer eingebetteten Notiz eines anderen
//        Ordners wird gegen den Ordner der NOTIZ aufgelöst, nicht gegen den des
//        offenen Dokuments (Schaltfläche der Vergrößerung und Doppelklick).
//
// Der Weg ins Standardprogramm wird im Hauptprozess abgefangen (Muster AN-08
// in anlagen.spec.js): geprüft wird, DASS und WOMIT geöffnet wird.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');

// 1x1-PNG; hier zählt der geöffnete Pfad, nicht das Bild.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG = Buffer.from(PNG_BASE64, 'base64');

const DOKUMENT = [
  '# Bilder',
  '',
  'Ein Absatz zum Anklicken.',
  '',
  '![Symbol](bilder/symbol.png =40x)',
  '',
  '![[eingebettet.png|40]]',
  '',
  '| Spalte |',
  '|---|',
  '| ![In Tabelle](bilder/zelle.png =40x) |',
  '',
  `![Daten](data:image/png;base64,${PNG_BASE64} =40x)`,
  '',
  '![Netz](https://example.org/netz.png)',
  '',
  '![[notizen/Notiz]]',
  '',
].join('\n');

// Die Notiz liegt in einem Unterordner und verweist relativ zu SICH auf ihr
// Bild. Unter dem Ordner des Dokuments gibt es diesen Pfad bewusst nicht.
const NOTIZ = ['# Notiz', '', '![Notiz-Bild](bilder/notiz-bild.png =40x)', ''].join('\n');

function legeMaterialAn(prefix) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(workDir, 'bilder'));
  fs.mkdirSync(path.join(workDir, 'notizen', 'bilder'), { recursive: true });
  fs.writeFileSync(path.join(workDir, 'bilder', 'symbol.png'), PNG);
  fs.writeFileSync(path.join(workDir, 'bilder', 'zelle.png'), PNG);
  fs.writeFileSync(path.join(workDir, 'eingebettet.png'), PNG);
  fs.writeFileSync(path.join(workDir, 'notizen', 'bilder', 'notiz-bild.png'), PNG);
  fs.writeFileSync(path.join(workDir, 'notizen', 'Notiz.md'), NOTIZ, 'utf8');
  const file = path.join(workDir, 'Bilder.md');
  fs.writeFileSync(file, DOKUMENT, 'utf8');
  return { workDir, file };
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht rot machen */
  }
}

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
const LIVE = SEL.paneSource0;

// Öffnet das Dokument und wechselt in die Live-Ansicht (Lese-Zustand).
async function inLiveAnsicht(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await page.locator(SEL.viewBtn('live')).click();
  await expect(page.locator(`${LIVE} img[alt="Symbol"]`)).toBeVisible({ timeout: 5000 });
}

async function erwarteGeoeffnet(app, anzahl, pfad) {
  await expect.poll(async () => (await geoeffnete(app)).length, { timeout: 5000 }).toBe(anzahl);
  expect((await geoeffnete(app))[anzahl - 1]).toBe(pfad);
}

test.describe('DK-01: Doppelklick auf ein Bild der Live-Ansicht (4T-001925)', () => {
  test('öffnet das Bild im Standardprogramm, im Lese- wie im Bearbeiten-Zustand', async () => {
    const { workDir, file } = legeMaterialAn('dk01-');
    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await inLiveAnsicht(page);
      await fangeOeffnenAb(app);
      const bild = page.locator(`${LIVE} img[alt="Symbol"]`);
      const ziel = path.join(workDir, 'bilder', 'symbol.png');

      // Lese-Zustand.
      await expect(page.locator(SEL.paneSourceEditor0)).toHaveClass(/read-only/);
      await bild.dblclick();
      await erwarteGeoeffnet(app, 1, ziel);
      await expect(page.locator(FLAECHE)).toBeHidden();

      // Bearbeiten-Zustand: Schreibmarke und Dokument bleiben, wie sie sind.
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.paneSourceEditor0)).not.toHaveClass(/read-only/);
      const markeVorher = await page.evaluate(() => {
        const s = window.getSelection();
        return s ? `${s.anchorOffset}:${s.focusOffset}` : '';
      });
      await bild.dblclick();
      await erwarteGeoeffnet(app, 2, ziel);
      await expect(page.locator(FLAECHE)).toBeHidden();
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      const markeNachher = await page.evaluate(() => {
        const s = window.getSelection();
        return s ? `${s.anchorOffset}:${s.focusOffset}` : '';
      });
      expect(markeNachher).toBe(markeVorher);

      // Der einfache Klick bleibt ohne Weg nach aussen.
      await bild.click();
      await page.waitForTimeout(300);
      expect(await geoeffnete(app)).toHaveLength(2);
      await expect(page.locator(FLAECHE)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

test.describe('DK-02: Bild-Einbettung und Bild in einer Tabelle', () => {
  test('beide öffnen per Doppelklick im Standardprogramm', async () => {
    const { workDir, file } = legeMaterialAn('dk02-');
    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await inLiveAnsicht(page);
      await fangeOeffnenAb(app);

      const einbettung = page.locator(`${LIVE} img.wiki-embed-image`).first();
      await expect(einbettung).toBeVisible({ timeout: 5000 });
      await einbettung.dblclick();
      await erwarteGeoeffnet(app, 1, path.join(workDir, 'eingebettet.png'));

      const zelle = page.locator(`${LIVE} img[alt="In Tabelle"]`);
      await expect(zelle).toBeVisible({ timeout: 5000 });
      await zelle.dblclick();
      await erwarteGeoeffnet(app, 2, path.join(workDir, 'bilder', 'zelle.png'));
      await expect(page.locator(FLAECHE)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

test.describe('DK-03: Daten-Quelle und Netz-Bild', () => {
  test('bleiben per Doppelklick ohne Reaktion', async () => {
    const { workDir, file } = legeMaterialAn('dk03-');
    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await inLiveAnsicht(page);
      await fangeOeffnenAb(app);

      const daten = page.locator(`${LIVE} img[alt="Daten"]`);
      await expect(daten).toBeVisible({ timeout: 5000 });
      await daten.dblclick();
      // Ein Netz-Bild lädt im Prüflauf nicht; der Doppelklick trifft das
      // Element dennoch, weil der Browser Platz für den Alternativtext hält.
      const netz = page.locator(`${LIVE} img[alt="Netz"]`);
      await netz.dblclick({ force: true });
      await page.waitForTimeout(500);
      expect(await geoeffnete(app)).toEqual([]);
      expect(await externe(app)).toEqual([]);
      await expect(page.locator(FLAECHE)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

test.describe('DK-04: Meldung wie im Bestand', () => {
  test('fehlt die Datei inzwischen, erscheint die Meldung und nichts wird geöffnet', async () => {
    const { workDir, file } = legeMaterialAn('dk04-');
    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await inLiveAnsicht(page);
      await fangeOeffnenAb(app);
      fs.rmSync(path.join(workDir, 'bilder', 'symbol.png'));

      await page.locator(`${LIVE} img[alt="Symbol"]`).dblclick();
      const hinweis = page.locator('.statusbar-hint.visible');
      await expect(hinweis).toBeVisible({ timeout: 5000 });
      await expect(hinweis).toHaveClass(/error/);
      expect(await geoeffnete(app)).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

test.describe('DK-05: Bild in einer eingebetteten Notiz eines anderen Ordners', () => {
  test('wird gegen den Ordner der Notiz aufgelöst, in der gerenderten wie in der Live-Ansicht', async () => {
    const { workDir, file } = legeMaterialAn('dk05-');
    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await fangeOeffnenAb(app);
      const ziel = path.join(workDir, 'notizen', 'bilder', 'notiz-bild.png');

      // Gerenderte Ansicht: Vergrößerung, dann ihre Schaltfläche.
      const gerendert = page.locator(
        `${SEL.markdownBody0} .wiki-embed-md-body img[alt="Notiz-Bild"]`,
      );
      await expect(gerendert).toBeVisible({ timeout: 5000 });
      await gerendert.click();
      await expect(page.locator(FLAECHE)).toBeVisible();
      await page.locator(`${FLAECHE} .image-lightbox-open-external`).click();
      await erwarteGeoeffnet(app, 1, ziel);
      await page.keyboard.press('Escape');
      await expect(page.locator(FLAECHE)).toBeHidden();

      // Live-Ansicht: Doppelklick.
      await page.locator(SEL.viewBtn('live')).click();
      const live = page.locator(`${LIVE} .wiki-embed-md-body img[alt="Notiz-Bild"]`);
      await expect(live).toBeVisible({ timeout: 5000 });
      await live.dblclick();
      await erwarteGeoeffnet(app, 2, ziel);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});
