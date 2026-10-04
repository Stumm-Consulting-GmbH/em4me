// Epic 3E-000309 (4T-001743): Einen laufenden Bereich zusätzlich öffnen.
//
// Die Konstellation ist echt: zwei Applikationen auf DEMSELBEN Ordner, die
// erste an einen Arbeitsbereich gebunden. Die Nachfrage ist ein Dialog des
// Haupt-Prozesses; er wird im Haupt-Prozess beantwortet (Muster BV-02 in
// bereichs-verknuepfungen.spec.js), jeder Aufruf wird mitgeschrieben.
//
// BM-01: Nachfrage auf dem Pfad-Weg — Abbrechen ohne Wirkung (auch nicht auf
//        die Zuletzt-Liste), Wechseln ohne neues Fenster, Zusätzlich öffnen
//        mit eigener Applikation ohne Arbeitsbereich und eigener
//        Reiter-Menge; dieselbe Nachfrage auf dem Menü-Weg (Ordner-Dialog)
//        und aus der Zuletzt-Liste; läuft der Ordner danach auch ohne
//        Arbeitsbereich, springt ein weiteres Öffnen ohne Nachfrage; harte Bereichsgrenzen in beiden
//        Applikationen; «Bereich schließen» in der zweiten schließt nur sie,
//        die erste behält Dokument, Beobachter und Index.
// BM-02: Nach dem Neustart kehren beide Applikationen desselben Ordners als
//        zwei zurück.
// BM-03: Regression — ohne Arbeitsbereich springt die Anwendung ohne
//        Nachfrage in das laufende Fenster; ein nicht laufender Bereich
//        öffnet unverändert (leere Applikation wird gebunden).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');
const NACHFRAGE_TITEL = 'Bereich läuft bereits';
const TABS0 = '.pane-group[data-pane="0"] .tabbar .tab';
const STORE = path.resolve(__dirname, '..', '..', '..', 'src', 'main', 'index', 'store.js');

function makeAreaDir(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `em4me-bm-${name}-`));
  fs.writeFileSync(path.join(dir, 'erste.md'), '# Erste\n\nInhalt.\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'zweite.md'), '# Zweite\n\nInhalt.\n', 'utf8');
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Verzeichnis bleibt liegen; unkritisch.
  }
}

const fensterZahl = (app) =>
  hauptLesen(app, ({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

// Dialoge des Haupt-Prozesses abfangen: Die Nachfrage bekommt die gesetzte
// Antwort, jeder andere Hinweis «OK». Der Ordner-Dialog liefert den Ordner.
async function dialogeAbfangen(app, ordner) {
  await hauptSenden(
    app,
    ({ dialog }, { ordner: o, titel }) => {
      globalThis.__bmFragen = [];
      globalThis.__bmAntwort = 2;
      dialog.showMessageBox = async (a, b) => {
        const opts = b || a || {};
        if (opts.title === titel) {
          globalThis.__bmFragen.push({
            message: opts.message,
            detail: opts.detail,
            buttons: opts.buttons,
          });
          return { response: globalThis.__bmAntwort };
        }
        return { response: 0 };
      };
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [o] });
    },
    { ordner, titel: NACHFRAGE_TITEL },
  );
}
const antwortSetzen = (app, r) =>
  hauptSenden(
    app,
    (_e, wert) => {
      globalThis.__bmAntwort = wert;
    },
    r,
  );
// Ein Aufruf im Haupt-Prozess kurz nach einem Menü-Send kann seine Rückmeldung
// verlieren («Execution context was destroyed», ohne Produkt-Befund). 4T-001813
// hat die Ursache gemessen und den früheren Behelf hauptEval (bis zu drei
// Wiederholungen nach fester Pause, auch für Befehle) durch den geteilten
// Baustein ersetzt: Abfragen über hauptLesen, Befehle über hauptSenden.
const fragen = (app) => hauptLesen(app, () => globalThis.__bmFragen || []);

async function titelAlle(app) {
  return hauptLesen(app, ({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => w.getTitle()),
  );
}

// Menü des Fensters mit `teil` im Titel beim nächsten Neubau festhalten und den
// Zuletzt-Eintrag des Ordners anklicken (natives Menü: Muster menu-zustand.js).
async function zuletztEintragKlicken(app, teil, ordner) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, t) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.getTitle().includes(t));
      if (!win || win.__bmArmed) return;
      win.__bmArmed = true;
      const orig = win.setMenu.bind(win);
      win.setMenu = (menu) => {
        globalThis.__bmMenue = menu;
        return orig(menu);
      };
    },
    teil,
  );
  await expect
    .poll(async () => {
      await hauptSenden(
        app,
        ({ BrowserWindow }, t) => {
          const win = BrowserWindow.getAllWindows().find((w) => w.getTitle().includes(t));
          if (win) {
            win.webContents.send('menu:togglePanel', 'notes');
            win.webContents.send('menu:togglePanel', 'notes');
          }
        },
        teil,
      );
      return hauptLesen(app, () => !!globalThis.__bmMenue);
    })
    .toBe(true);
  // Befehl und gebrauchte Rückgabe in zwei Zugriffen mit demselben Rumpf:
  // Erst wird gelesen, ob der Eintrag im festgehaltenen Menü steht (Abfrage,
  // wiederholbar), dann wird er angeklickt (Befehl, nie doppelt). Gesucht wird
  // in beiden im selben festgehaltenen Menü; geprüft wird damit derselbe Weg
  // wie zuvor in einem Zugriff.
  const eintragImMenue = (_e, { o, klicken }) => {
    const suche = (items) => {
      for (const it of items || []) {
        if (it.toolTip === o) return it;
        const tiefer = it.submenu ? suche(it.submenu.items) : null;
        if (tiefer) return tiefer;
      }
      return null;
    };
    const eintrag = suche(globalThis.__bmMenue.items);
    if (!eintrag) return false;
    if (klicken) eintrag.click();
    return true;
  };
  expect(await hauptLesen(app, eintragImMenue, { o: ordner, klicken: false })).toBe(true);
  await hauptSenden(app, eintragImMenue, { o: ordner, klicken: true });
}

// 4T-001689: Der frühere eigene Helfer dateiInFenster ist als
// oeffneDokumentImFenster nach helpers/app.js gehoben. Er sendet die Nachricht
// jetzt GENAU EINMAL nach der Bereitschaft des Fensters statt im Poll erneut:
// file:openExternal ist nicht idempotent, eine zweite, überlappende Sendung
// legte einen zweiten Eintrag derselben Datei an (rueckschreib-beobachtung.spec.js).

// Vorbereitung: basis.md offen, der Ordner als zweite Applikation, die per
// «Als Arbeitsbereich speichern» zum Arbeitsbereich «Alpha» wird.
async function arbeitsbereichAufOrdner(app, page, dir) {
  await expect.poll(() => page.title()).toContain('basis');
  const w = app.waitForEvent('window');
  expect((await page.evaluate((p) => window.api.openAreaPath(p), dir)).createdNew).toBe(true);
  const pageW = await w;
  await pageW.waitForLoadState('domcontentloaded');
  await pageW.evaluate(() => window.api.workspaceSaveAs({ name: 'Alpha', color: 'green' }));
  await expect.poll(() => pageW.title()).toContain('Arbeitsbereich Alpha');
  return pageW;
}

test.describe('BM-01: Nachfrage und zweite Applikation auf demselben Ordner (4T-001743)', () => {
  test('Abbrechen, Wechseln, Zusätzlich öffnen, drei Wege, Grenzen und Schließen', async () => {
    const dir = makeAreaDir('bm01');
    const name = path.basename(dir);
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      const pageW = await arbeitsbereichAufOrdner(app, page, dir);
      await oeffneDokumentImFenster(app, pageW, path.join(dir, 'erste.md'));
      await dialogeAbfangen(app, dir);
      await page.evaluate((p) => window.api.setSetting('recentAreas', ['C:\\Anderswo', p]), dir);

      // Abbrechen: keine Wirkung, auch nicht auf die Zuletzt-Liste.
      await antwortSetzen(app, 2);
      const abbruch = await page.evaluate((p) => window.api.openAreaPath(p), dir);
      expect(abbruch).toEqual({ ok: false, canceled: true });
      expect(await fragen(app)).toHaveLength(1);
      const frage = (await fragen(app))[0];
      expect(frage.message).toContain(name);
      expect(frage.detail).toContain('Alpha');
      expect(frage.buttons).toEqual([
        'Zum laufenden Fenster wechseln',
        'Zusätzlich öffnen',
        'Abbrechen',
      ]);
      expect(await fensterZahl(app)).toBe(2);
      expect(await page.evaluate(() => window.api.getSetting('recentAreas'))).toEqual([
        'C:\\Anderswo',
        dir,
      ]);

      // Menü-Weg (Ordner-Dialog) und Zuletzt-Liste zeigen dieselbe Nachfrage
      // (jeweils Abbrechen).
      const basisFenster = await app.browserWindow(page);
      await hauptSenden(basisFenster, (w) => w.webContents.send('menu:openArea'));
      await expect.poll(async () => (await fragen(app)).length).toBe(2);
      await zuletztEintragKlicken(app, 'basis', dir);
      await expect.poll(async () => (await fragen(app)).length).toBe(3);
      expect(await fensterZahl(app)).toBe(2);

      // Wechseln: Sprung in die laufende Applikation, kein neues Fenster.
      await antwortSetzen(app, 0);
      const wechsel = await page.evaluate((p) => window.api.openAreaPath(p), dir);
      expect(wechsel.focusedExisting).toBe(true);
      expect(await fensterZahl(app)).toBe(2);
      expect((await page.evaluate(() => window.api.getSetting('recentAreas')))[0]).toBe(dir);

      // Zusätzlich öffnen: eigene Applikation auf demselben Ordner.
      await antwortSetzen(app, 1);
      const neu = app.waitForEvent('window');
      const zusatz = await page.evaluate((p) => window.api.openAreaPath(p), dir);
      expect(zusatz.createdNew).toBe(true);
      expect(zusatz.openedAdditional).toBe(true);
      const pageZ = await neu;
      await pageZ.waitForLoadState('domcontentloaded');
      await expect.poll(() => pageZ.title()).toContain(`(Bereich ${name})`);
      expect(await pageZ.title()).not.toContain('Arbeitsbereich');
      expect(await pageW.title()).toContain(`Arbeitsbereich Alpha, Bereich ${name}`);
      expect(await fensterZahl(app)).toBe(3);
      expect(await fragen(app)).toHaveLength(5);

      // Läuft der Ordner jetzt auch ohne Arbeitsbereich, springt ein weiteres
      // Öffnen dorthin, ohne Nachfrage (E10).
      const danach = await page.evaluate((p) => window.api.openAreaPath(p), dir);
      expect(danach.focusedExisting).toBe(true);
      expect(await fragen(app)).toHaveLength(5);
      expect(await fensterZahl(app)).toBe(3);

      // Getrennte Reiter-Mengen.
      await oeffneDokumentImFenster(app, pageZ, path.join(dir, 'zweite.md'));
      await expect(pageW.locator(TABS0)).toHaveCount(1);
      await expect(pageW.locator(TABS0)).toContainText('erste');
      await expect(pageZ.locator(TABS0)).toContainText('zweite');

      // Harte Bereichsgrenzen in beiden Applikationen.
      for (const p of [pageW, pageZ]) {
        const aussen = await p.evaluate((f) => window.api.readFile(f), BASIS);
        expect(aussen.error).toBe('outside-area');
        const innen = await p.evaluate((f) => window.api.readFile(f), path.join(dir, 'erste.md'));
        expect(innen.ok).toBe(true);
      }

      // «Bereich schließen» in der zweiten schließt nur sie.
      await pageW.evaluate(() => {
        window.__bmAenderungen = 0;
        window.api.onAreaChanged(() => {
          window.__bmAenderungen += 1;
        });
      });
      await pageZ.evaluate(() => void window.api.closeArea()).catch(() => {});
      await expect.poll(() => fensterZahl(app)).toBe(2);
      await expect(pageW.locator(TABS0)).toContainText('erste');
      expect(await pageW.title()).toContain('Arbeitsbereich Alpha');

      // Beobachter und Index der ersten Applikation bleiben.
      fs.writeFileSync(path.join(dir, 'dritte.md'), '# Dritte\n', 'utf8');
      await expect.poll(() => pageW.evaluate(() => window.__bmAenderungen)).toBeGreaterThan(0);
      const index = await hauptLesen(
        app,
        (_e, { wurzel, store }) => {
          const laden = process.getBuiltinModule('node:module').createRequire(store);
          const pfad = process.getBuiltinModule('node:path');
          const { indexes } = laden(store);
          const e = [...indexes.entries()].find(([k]) => pfad.resolve(k) === pfad.resolve(wurzel));
          return e ? { status: e[1].status, halter: [...e[1].ownerKeys] } : null;
        },
        { wurzel: dir, store: STORE },
      );
      expect(index.status).toBe('ready');
      expect(index.halter.filter((k) => k.startsWith('area:'))).toHaveLength(1);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

test.describe('BM-02: zwei Applikationen desselben Ordners nach dem Neustart (4T-001743)', () => {
  test('kehren als zwei zurück und verschmelzen nicht', async () => {
    const dir = makeAreaDir('bm02');
    const name = path.basename(dir);
    const first = await launchApp({ args: [BASIS] });
    const userData = first.userData;
    try {
      await arbeitsbereichAufOrdner(first.app, first.page, dir);
      await dialogeAbfangen(first.app, dir);
      await antwortSetzen(first.app, 1);
      const neu = first.app.waitForEvent('window');
      await first.page.evaluate((p) => window.api.openAreaPath(p), dir);
      const pageZ = await neu;
      await expect.poll(() => pageZ.title()).toContain(`(Bereich ${name})`);

      await hauptSenden(first.app, ({ app }) => app.quit());
      await first.app.waitForEvent('close');

      const second = await launchApp({ userData });
      try {
        await expect
          .poll(async () => {
            const titel = await titelAlle(second.app);
            return titel.filter((t) => t.includes(`Bereich ${name}`)).length;
          })
          .toBe(2);
        const titel = await titelAlle(second.app);
        expect(
          titel.filter((t) => t.includes(`Arbeitsbereich Alpha, Bereich ${name}`)),
        ).toHaveLength(1);
        expect(titel.filter((t) => t.includes(`(Bereich ${name})`))).toHaveLength(1);
      } finally {
        await closeApp(second.app, null, { force: true });
      }
    } finally {
      await closeApp(first.app, userData, { force: true });
      removeDir(dir);
    }
  });
});

test.describe('BM-03: Regression ohne Arbeitsbereich und nicht laufender Bereich (4T-001743)', () => {
  test('Sprung ohne Nachfrage; nicht laufender Bereich bindet die leere Applikation', async () => {
    const dir = makeAreaDir('bm03');
    const leer = await launchApp();
    try {
      await dialogeAbfangen(leer.app, dir);
      const gebunden = await leer.page.evaluate((p) => window.api.openAreaPath(p), dir);
      expect(gebunden.boundExisting).toBe(true);
      const erneut = await leer.page.evaluate((p) => window.api.openAreaPath(p), dir);
      expect(erneut.focusedExisting).toBe(true);
      expect(await fensterZahl(leer.app)).toBe(1);
      expect(await fragen(leer.app)).toHaveLength(0);
    } finally {
      await closeApp(leer.app, leer.userData, { force: true });
      removeDir(dir);
    }
  });
});
