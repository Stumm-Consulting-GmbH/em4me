// 4T-001742 (Epic 3E-000309): Messung am laufenden Programm — zwei
// Applikationen auf demselben Bereichs-Ordner.
//
// BM-M1 misst die drei Punkte der Folgen-Analyse, die der Quellcode allein
// nicht beantwortet, und schreibt die Zahlen in die Test-Ausgabe (die Werte
// stehen im Lösungs-Kapitel des Tasks):
//   - AK4: Aufwand des zweiten Verzeichnis-Beobachters — Zahl der
//     Betriebssystem-Beobachter (FSEventWrap) vor und nach jeder
//     Bereichs-Applikation und die Einrichtungs-Dauer bis zum Plateau, an
//     einem Ordner mit 400 Dateien in 20 Unterordnern;
//   - AK6: Schreib-Zeitpunkte von Area_Cache.mdda bei gleichzeitiger Änderung
//     unter zwei Haltern, beim Abbau der einen und der anderen Applikation;
//   - AK8: die Fenstertitel beider Applikationen.
// Harte Zusicherungen gibt es nur für die Struktur (ein Index-Eintrag mit
// zwei Haltern, kein Abbau-Schreiben, solange ein Halter lebt); Zeiten sind
// maschinenabhängig und werden nur protokolliert (Muster perf/4t-0180).
//
// Die Konstellation entsteht über den Arbeitsbereichs-Weg, der schon vor dem
// Epic zwei Applikationen auf demselben Ordner erlaubt: Der Arbeitsbereich
// wird geschlossen, der Ordner als gewöhnlicher Bereich geöffnet und der
// Arbeitsbereich danach wieder geöffnet. «Arbeitsbereich öffnen» prüft nur,
// ob derselbe Arbeitsbereich läuft, nicht, ob sein Ordner schon läuft.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');
const ORDNER = 20;
const DATEIEN_JE_ORDNER = 20;

function makeGrosserBereich() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-bm-mess-'));
  for (let o = 0; o < ORDNER; o++) {
    const sub = path.join(dir, `Ordner-${String(o).padStart(2, '0')}`);
    fs.mkdirSync(sub);
    for (let d = 0; d < DATEIEN_JE_ORDNER; d++) {
      fs.writeFileSync(
        path.join(sub, `Notiz-${d}.md`),
        `# Notiz ${o}-${d}\n\nVerweis auf [[Notiz-${(d + 1) % DATEIEN_JE_ORDNER}]] #mess\n`,
        'utf8',
      );
    }
  }
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Verzeichnis bleibt liegen; unkritisch.
  }
}

const beobachter = (app) =>
  app.evaluate(() => process.getActiveResourcesInfo().filter((r) => r === 'FSEventWrap').length);

// Index-Eintrag der Wurzel aus dem Haupt-Prozess: Zahl der Einträge für den
// Ordner und die Halter-Schlüssel des einen Eintrags.
// Das Modul wird über seinen absoluten Pfad geladen und trifft damit dieselbe
// Instanz im Modul-Zwischenspeicher des Haupt-Prozesses.
const STORE = path.resolve(__dirname, '..', '..', '..', 'src', 'main', 'index', 'store.js');
const indexLage = (app, dir) =>
  app.evaluate(
    (_e, { wurzel, store }) => {
      const laden = process.getBuiltinModule('node:module').createRequire(store);
      const { indexes } = laden(store);
      const pfad = process.getBuiltinModule('node:path');
      const treffer = [...indexes.entries()].filter(
        ([k]) => pfad.resolve(k) === pfad.resolve(wurzel),
      );
      return {
        eintraege: treffer.length,
        halter: treffer.length ? [...treffer[0][1].ownerKeys].sort() : [],
        status: treffer.length ? treffer[0][1].status : null,
      };
    },
    { wurzel: dir, store: STORE },
  );

// Wartet, bis die Beobachter-Zahl eine Sekunde lang unverändert über dem
// Ausgangswert steht; liefert Zahl und Dauer seit `start`.
async function plateau(app, ausgang, start) {
  let letzte = -1;
  let seit = Date.now();
  for (let i = 0; i < 300; i++) {
    const n = await beobachter(app);
    if (n !== letzte) {
      letzte = n;
      seit = Date.now();
    } else if (n > ausgang && Date.now() - seit >= 1000) {
      return { zahl: n, ms: seit - start };
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return { zahl: letzte, ms: -1 };
}

// Schreib-Zeitpunkte der Zwischenspeicher-Datei aus Sicht des Test-Prozesses.
function cacheSpur(dir, t0) {
  const datei = path.join(dir, 'Area_Cache.mdda');
  const spur = [];
  let letzte = null;
  const timer = setInterval(() => {
    let m;
    try {
      m = fs.statSync(datei).mtimeMs;
    } catch {
      m = null;
    }
    if (m != null && m !== letzte) {
      if (letzte != null || spur.length === 0) spur.push(Math.round(Date.now() - t0));
      letzte = m;
    }
  }, 50);
  return { spur, stopp: () => clearInterval(timer) };
}

test.describe('BM-M1: zwei Applikationen auf demselben Ordner, gemessen (4T-001742)', () => {
  test('Beobachter, Zwischenspeicher und Titel', async () => {
    test.setTimeout(240_000);
    const dir = makeGrosserBereich();
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    const t0 = Date.now();
    const cache = cacheSpur(dir, t0);
    const marke = (text) => console.log(`[BM-M1] +${Date.now() - t0} ms ${text}`);
    try {
      await expect.poll(() => page.title()).toContain('basis');
      const b0 = await beobachter(app);
      marke(`Beobachter ohne Bereich: ${b0}`);

      // Erste Bereichs-Applikation (Datei offen -> neue App).
      let start = Date.now();
      const w2 = app.waitForEvent('window');
      expect((await page.evaluate((p) => window.api.openAreaPath(p), dir)).createdNew).toBe(true);
      const page2 = await w2;
      await page2.waitForLoadState('domcontentloaded');
      const p1 = await plateau(app, b0, start);
      marke(
        `erste Bereichs-App: Beobachter ${p1.zahl} (+${p1.zahl - b0}), Plateau nach ${p1.ms} ms`,
      );
      await expect.poll(async () => (await indexLage(app, dir)).status).toBe('ready');

      // Zur Arbeitsbereichs-Applikation machen, schließen, Ordner als
      // gewöhnlichen Bereich öffnen, Arbeitsbereich wieder öffnen.
      await page2.evaluate(() => window.api.workspaceSaveAs({ name: 'Messung', color: 'green' }));
      await expect.poll(() => page2.title()).toContain('Messung');
      await page2.evaluate(() => void window.api.workspaceClose()).catch(() => {});
      await expect
        .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
        .toBe(1);
      const w3 = app.waitForEvent('window');
      expect((await page.evaluate((p) => window.api.openAreaPath(p), dir)).createdNew).toBe(true);
      const pageP = await w3;
      await pageP.waitForLoadState('domcontentloaded');
      const bEinzeln = (await plateau(app, b0, Date.now())).zahl;
      marke(`eine Bereichs-App (gewöhnlich): Beobachter ${bEinzeln}`);

      start = Date.now();
      const w4 = app.waitForEvent('window');
      const offen = await page.evaluate(async () => {
        const list = await window.api.workspacesList();
        return window.api.workspaceOpen(list[0].id);
      });
      expect(offen.ok).toBe(true);
      const pageW = await w4;
      await pageW.waitForLoadState('domcontentloaded');
      const p2 = await plateau(app, bEinzeln, start);
      marke(
        `zweite App auf demselben Ordner: Beobachter ${p2.zahl} (+${p2.zahl - bEinzeln}), Plateau nach ${p2.ms} ms`,
      );

      // Ein Index-Eintrag, zwei Halter.
      const lage = await indexLage(app, dir);
      marke(`Index: ${lage.eintraege} Eintrag, Halter ${JSON.stringify(lage.halter)}`);
      expect(lage.eintraege).toBe(1);
      expect(lage.halter.filter((k) => k.startsWith('area:'))).toHaveLength(2);

      // AK8: Titel beider Fenster.
      await expect.poll(() => pageW.title()).toContain('Messung');
      const titel = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((w) => w.getTitle()),
      );
      marke(`Titel: ${JSON.stringify(titel)}`);

      // AK6: gleichzeitige Änderung unter zwei Haltern.
      await new Promise((r) => setTimeout(r, 4000));
      const vorAenderung = cache.spur.length;
      marke(`Zwischenspeicher-Schreibvorgänge bis hier: ${JSON.stringify(cache.spur)}`);
      fs.writeFileSync(
        path.join(dir, 'Ordner-00', 'Notiz-0.md'),
        '# Geändert\n\nNeu [[Notiz-3]]\n',
        'utf8',
      );
      marke('Datei außen geändert');
      await new Promise((r) => setTimeout(r, 6000));
      marke(`nach der Änderung: ${JSON.stringify(cache.spur.slice(vorAenderung))}`);

      // Abbau der Arbeitsbereichs-App: der andere Halter lebt -> kein Abbau.
      const vorAbbau1 = cache.spur.length;
      await pageW.evaluate(() => void window.api.workspaceClose()).catch(() => {});
      await expect
        .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
        .toBe(2);
      marke('Arbeitsbereichs-App geschlossen');
      await new Promise((r) => setTimeout(r, 5000));
      const nachAbbau1 = await indexLage(app, dir);
      marke(
        `nach Abbau der ersten: Index ${nachAbbau1.status}, Halter ${JSON.stringify(nachAbbau1.halter)}, Beobachter ${await beobachter(app)}, Schreibvorgänge ${JSON.stringify(cache.spur.slice(vorAbbau1))}`,
      );
      expect(nachAbbau1.status).toBe('ready');
      expect(cache.spur.length).toBe(vorAbbau1);

      // Abbau der zweiten: letzter Halter -> Abbau nach der Nachlaufzeit.
      const vorAbbau2 = cache.spur.length;
      const abbau2 = Date.now();
      await pageP.evaluate(() => void window.api.closeArea()).catch(() => {});
      await expect
        .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
        .toBe(1);
      marke('gewöhnliche Bereichs-App geschlossen');
      await expect
        .poll(async () => (await indexLage(app, dir)).eintraege, { timeout: 90_000 })
        .toBe(0);
      await new Promise((r) => setTimeout(r, 1000));
      marke(
        `Index abgebaut nach ${Date.now() - abbau2} ms; Schreibvorgänge ${JSON.stringify(cache.spur.slice(vorAbbau2))}, Beobachter ${await beobachter(app)}`,
      );
      expect(cache.spur.length).toBe(vorAbbau2 + 1);
    } finally {
      cache.stopp();
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});
