// Epic 3E-000057: Logische Applikationen — Fenstertitel-Systematik und
// Mehrfachstart.
//
// LA-01 (4T-000318): Zwei Fenster derselben App tragen "(Fenster 1)"/"(Fenster 2)"
//        ohne App-Teil; nach dem Schließen des zweiten verschwindet der Suffix
//        (Nachrücken der app-lokalen Nummern).
// LA-02 (4T-000319): "Neue Applikation" (Kommando-/Menü-Pfad, identisch mit dem
//        EXE-Zweitstart ohne Argument) erzeugt eine zweite App — beide Fenster
//        tragen den App-Teil "(App 1)"/"(App 2)"; schließt App 1 komplett,
//        rückt App 2 zu App 1 nach und verliert den Suffix.
// LA-03 (4T-000320): Sitzungs-Wiederherstellung über Apps — zwei Apps überleben
//        Beenden und Neustart als zwei Apps (Titel-Systematik intakt).
// LA-04 (4T-001738): Der Menüpunkt «Neues Fenster» steht vor «Neue Applikation»
//        und öffnet ein zweites, leeres Fenster DERSELBEN Applikation; das erste
//        Fenster behält sein Dokument, und ein Reiter lässt sich in das neue
//        Fenster bewegen.
// LA-05 (4T-001738): Gehört die Applikation zu einem Arbeitsbereich, gehört das
//        neue Fenster ebenfalls dazu und wird mit ihm abgelegt.
// LA-06 (4T-001738): Ist die Applikation an einen Ordner gebunden, gilt die
//        Bindung im neuen Fenster, und der Fenstertitel weist sie aus.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

// 4T-001738: Ordner für eine Bereichs-Bindung (Muster makeAreaDir in
// bereiche.spec.js). Das neue Fenster erbt die Bindung seiner Applikation.
function makeAreaDir(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `em4me-la-bereich-${name}-`));
  fs.writeFileSync(path.join(dir, 'notiz.md'), '# Notiz\n\nInhalt.\n', 'utf8');
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Verzeichnis bleibt liegen; unkritisch.
  }
}

// 4T-001738: Menü-Inspektion. Die App setzt ihre Menüs PRO FENSTER
// (win.setMenu), Menu.getApplicationMenu() ist daher leer. Der Interceptor
// patcht setMenu des ersten Fensters und legt bei jedem Neubau alle
// Beschriftungen rekursiv in eine globale Main-Variable (Muster armMenuCapture
// in arbeitsbereiche.spec.js). Die Liste ist in Menü-Reihenfolge, weshalb sich
// die Reihenfolge zweier Einträge an ihren Positionen messen lässt.
async function armMenuCapture(app) {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.__menuCaptureArmed) return;
    win.__menuCaptureArmed = true;
    const orig = win.setMenu.bind(win);
    win.setMenu = (menu) => {
      const collect = (items) => {
        const out = [];
        for (const it of items || []) {
          if (it.label) out.push(it.label);
          if (it.submenu) out.push(...collect(it.submenu.items));
        }
        return out;
      };
      globalThis.__menuLabels = collect(menu ? menu.items : []);
      return orig(menu);
    };
  });
}

function capturedMenuLabels(app) {
  return app.evaluate(() => globalThis.__menuLabels || []);
}

// 4T-001738: Der Menü-Eintrag «Neues Fenster» aus dem Fenster GENAU DIESER
// Seite heraus. Gesendet wird über `app.browserWindow(page)` und nicht über
// einen Index in getAllWindows(), weil die Applikation danach zwei Fenster hat
// und der Absender die Applikation des neuen Fensters bestimmt (E5).
async function neuesFensterAusMenue(app, page) {
  const fenster = await app.browserWindow(page);
  await fenster.evaluate((w) => w.webContents.send('menu:newWindow'));
}

test.describe('LA-01: Fenstertitel innerhalb einer App (4T-000318)', () => {
  test('Fenster-Suffix ohne App-Teil, Suffix verschwindet beim Schließen', async () => {
    const { app, page, userData } = await launchApp();
    try {
      // Solo-Fenster: kein Suffix.
      await expect.poll(() => page.title()).toBe('EM4me');

      // Zweites Fenster in derselben App (regulärer IPC-Pfad "Neues Fenster").
      const win2Promise = app.waitForEvent('window');
      await page.evaluate(() => window.api.openNewWindow([], null));
      const page2 = await win2Promise;
      await page2.waitForLoadState('domcontentloaded');

      await expect.poll(() => page.title()).toContain('(Fenster 1)');
      await expect.poll(() => page2.title()).toContain('(Fenster 2)');
      // Eine einzige App: kein App-Teil im Suffix.
      expect(await page.title()).not.toContain('App');

      // Zweites Fenster schließen (regulärer Close-Pfad mit Renderer-Bestätigung).
      // getAllWindows garantiert keine Reihenfolge — das jüngste Fenster hat
      // die höchste webContents-ID.
      await app.evaluate(({ BrowserWindow }) => {
        const wins = BrowserWindow.getAllWindows();
        wins.sort((a, b) => a.webContents.id - b.webContents.id);
        wins[wins.length - 1].close();
      });
      await expect
        .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
        .toBe(1);

      // Suffix verschwindet beim verbleibenden Fenster.
      await expect.poll(() => page.title()).toBe('EM4me');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('LA-02: Neue Applikation und App-Nummern-Nachrücken (4T-000319)', () => {
  test('zweite App trägt App-Teil, Nummern rücken beim App-Schließen nach', async () => {
    const { app, page, userData } = await launchApp();
    try {
      // Zweite logische Applikation über den Kommando-Pfad (identisch mit
      // Menü-Eintrag "Datei -> Neue Applikation" und EXE-Zweitstart).
      const win2Promise = app.waitForEvent('window');
      await page.evaluate(() => window.api.newApplication());
      const page2 = await win2Promise;
      await page2.waitForLoadState('domcontentloaded');

      // Beide Apps solo-fenstrig: nur App-Teil, kein Fenster-Teil.
      await expect.poll(() => page.title()).toContain('(App 1)');
      await expect.poll(() => page2.title()).toContain('(App 2)');
      expect(await page.title()).not.toContain('Fenster');

      // App 1 komplett schließen (einziges Fenster, kleinste webContents-ID).
      await app.evaluate(({ BrowserWindow }) => {
        const wins = BrowserWindow.getAllWindows();
        wins.sort((a, b) => a.webContents.id - b.webContents.id);
        wins[0].close();
      });
      await expect
        .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
        .toBe(1);

      // Die verbliebene App rückt zu App 1 nach; solo ohne Suffix.
      await expect.poll(() => page2.title()).toBe('EM4me');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('LA-03: Sitzungs-Wiederherstellung über Apps (4T-000320)', () => {
  test('zwei Apps überleben Beenden und Neustart als zwei Apps', async () => {
    const first = await launchApp();
    const userData = first.userData;
    try {
      // Zweite App anlegen, dann sauber beenden (before-quit persistiert).
      const win2Promise = first.app.waitForEvent('window');
      await first.page.evaluate(() => window.api.newApplication());
      const page2 = await win2Promise;
      await page2.waitForLoadState('domcontentloaded');
      await expect.poll(() => first.page.title()).toContain('(App 1)');

      await first.app.evaluate(({ app }) => app.quit());
      await first.app.waitForEvent('close');

      // Neustart mit demselben Profil: beide Apps sind wieder da.
      const second = await launchApp({ userData });
      try {
        await expect
          .poll(() =>
            second.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
          )
          .toBe(2);
        const titles = async () => {
          const pages = second.app.windows();
          const list = await Promise.all(pages.map((p) => p.title()));
          return list.sort();
        };
        await expect.poll(titles).toEqual(['EM4me (App 1)', 'EM4me (App 2)']);
      } finally {
        await closeApp(second.app, null);
      }
    } finally {
      await closeApp(first.app, userData);
    }
  });
});

// 4T-001738 (Epic 3E-000308): Der Menüpunkt «Neues Fenster». Ein Lauf für alle
// vier Zusagen, weil sie nur zusammen etwas aussagen: Der Eintrag steht an der
// richtigen Stelle, er öffnet ein Fenster DERSELBEN Applikation, das neue
// Fenster ist leer, und das erste behält sein Dokument. Getrennt geprüft wäre
// jede Hälfte grün, während die andere die falsche Applikation bedient.
test.describe('LA-04: Menüpunkt «Neues Fenster» (4T-001738)', () => {
  test('steht vor «Neue Applikation» und öffnet ein leeres zweites Fenster derselben App', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect.poll(() => page.title()).toContain('basis');
      await armMenuCapture(app);

      // AK1/AK2: Beide Einträge stehen im Datei-Menü, «Neues Fenster» vor
      // «Neue Applikation». Gemessen an der Reihenfolge der Beschriftungen des
      // wirklich gesetzten Menüs, nicht am Quelltext.
      await expect.poll(() => capturedMenuLabels(app)).toContain('Neues Fenster');
      const labels = await capturedMenuLabels(app);
      expect(labels).toContain('Neue Applikation');
      expect(labels.indexOf('Neues Fenster')).toBeLessThan(labels.indexOf('Neue Applikation'));

      // AK3: Der Menü-Weg öffnet ein zweites Fenster.
      const win2Promise = app.waitForEvent('window');
      await neuesFensterAusMenue(app, page);
      const page2 = await win2Promise;
      await page2.waitForLoadState('domcontentloaded');
      await expect
        .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
        .toBe(2);

      // AK3: Dieselbe Applikation — der Titel trägt den Fenster-Teil und
      // KEINEN App-Teil. Genau daran unterscheidet sich der Eintrag von «Neue
      // Applikation», die zwei Apps erzeugt (LA-02).
      await expect.poll(() => page.title()).toContain('(Fenster 1)');
      await expect.poll(() => page2.title()).toContain('(Fenster 2)');
      expect(await page2.title()).not.toContain('App');

      // AK3, gegenständlich: Beide Fenster melden dieselbe Applikations-Kennung
      // und zählen sich zu zweit. Der Titel allein könnte auch bei zwei Apps
      // ohne Nummerierung so aussehen.
      const fenster = await page.evaluate(() => window.api.listWindows());
      expect(fenster).toHaveLength(2);
      expect(new Set(fenster.map((w) => w.appId)).size).toBe(1);
      expect(fenster.map((w) => w.totalCount)).toEqual([2, 2]);

      // AK4: Das neue Fenster trägt KEIN Dokument und zeigt den Start-Zustand —
      // genau das Bild eines frisch gestarteten Fensters (E5). Ein Reiter mit
      // Inhalt wäre der bestehende Weg über das Reiter-Kontextmenü.
      await expect(page2.locator(SEL.tabs0)).toHaveCount(0);
      await expect(page2.locator(SEL.emptyState)).toBeVisible();

      // AK10 als Regressionsprobe am ersten Fenster: Es behält sein Dokument.
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      expect(await page.title()).toContain('basis');

      // AK7: Das neue Fenster ist ein vollwertiges Mitglied der Applikation —
      // ein Reiter lässt sich hineinbewegen (derselbe Kanal, den das
      // Reiter-Kontextmenü benutzt).
      const zielFenster = await app.browserWindow(page2);
      const zielId = await zielFenster.evaluate((w) => w.webContents.id);
      const transfer = await page.evaluate(
        ({ id, p }) => window.api.appendTabToWindow(id, { path: p, content: '', dirty: false }),
        { id: zielId, p: BASIS },
      );
      expect(transfer.ok).toBe(true);
      await expect(page2.locator(SEL.tabs0)).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-001738 (Epic 3E-000308), AK6: Das Erbe des Arbeitsbereichs. Es ist der
// Teil, den der Kanal nicht selbst sichtbar macht — die Zugehörigkeit hängt an
// der Applikation, und das neue Fenster gehört ihr. Geprüft wird an der
// Ablage, weil dort steht, was einen Neustart überdauert.
test.describe('LA-05: Neues Fenster im Arbeitsbereich (4T-001738)', () => {
  test('das neue Fenster gehört zum Arbeitsbereich und wird mit ihm abgelegt', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      const gespeichert = await page.evaluate(() =>
        window.api.workspaceSaveAs({ name: 'Projekt Alpha', color: 'green' }),
      );
      expect(gespeichert.ok).toBe(true);
      await expect.poll(() => page.title()).toContain('(Arbeitsbereich Projekt Alpha)');

      const win2Promise = app.waitForEvent('window');
      await neuesFensterAusMenue(app, page);
      const page2 = await win2Promise;
      await page2.waitForLoadState('domcontentloaded');

      // Der Titel des neuen Fensters nennt denselben Arbeitsbereich; beide
      // Fenster tragen jetzt zusätzlich ihren Fenster-Teil.
      await expect.poll(() => page2.title()).toContain('(Arbeitsbereich Projekt Alpha, Fenster 2)');
      await expect.poll(() => page.title()).toContain('(Arbeitsbereich Projekt Alpha, Fenster 1)');

      // Und gegenständlich: BEIDE Fenster melden denselben Arbeitsbereich. Der
      // Titel ist die Anzeige, dies die Zuordnung, aus der die Ablage entsteht.
      await expect
        .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
        .toBe(2);
      const fenster = await page.evaluate(() => window.api.listWindows());
      expect(fenster).toHaveLength(2);
      expect(fenster.map((w) => w.workspaceName)).toEqual(['Projekt Alpha', 'Projekt Alpha']);
      expect(new Set(fenster.map((w) => w.appId)).size).toBe(1);

      // Der Arbeitsbereich selbst bleibt einer und offen — das neue Fenster
      // hat keinen zweiten Eintrag erzeugt.
      const liste = await page.evaluate(() => window.api.workspacesList());
      expect(liste).toHaveLength(1);
      expect(liste[0]).toMatchObject({ name: 'Projekt Alpha', open: true });
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-001738 (Epic 3E-000308), AK5: Die Ordner-Bindung reist mit. Sie hängt an
// derselben Stelle wie der Arbeitsbereich — an der Applikation —, wird aber
// anders angezeigt, und der Titel ist die Auskunft, an der der Anwender es
// sieht. Geprüft aus dem Bereichs-Fenster heraus, weil nur dessen Applikation
// gebunden ist.
test.describe('LA-06: Neues Fenster in einer gebundenen Applikation (4T-001738)', () => {
  test('das neue Fenster erbt die Ordner-Bindung, und der Titel weist sie aus', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    const dir = makeAreaDir('la06');
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);

      // Bereichs-App als eigene Applikation mit eigenem Fenster (die laufende
      // App trägt ein Dokument und übernimmt den Bereich deshalb nicht).
      const bereichKommt = app.waitForEvent('window');
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      const bereichsSeite = await bereichKommt;
      await bereichsSeite.waitForLoadState('domcontentloaded');
      await expect.poll(() => bereichsSeite.title()).toContain('(Bereich');

      // Zweites Fenster AUS dem Bereichs-Fenster heraus.
      const win2Promise = app.waitForEvent('window');
      await neuesFensterAusMenue(app, bereichsSeite);
      const page2 = await win2Promise;
      await page2.waitForLoadState('domcontentloaded');

      // Der Titel des neuen Fensters nennt denselben Bereich und den
      // Fenster-Teil; die Bindung ist damit sichtbar geerbt.
      const bereichsName = path.basename(dir);
      await expect.poll(() => page2.title()).toContain(`(Bereich ${bereichsName}, Fenster 2)`);

      // Gegenständlich: Beide Fenster der Bereichs-App melden denselben
      // gebundenen Ordner, und das Fenster der ungebundenen App nicht.
      const fenster = await page.evaluate(() => window.api.listWindows());
      expect(fenster).toHaveLength(3);
      const gebunden = fenster.filter((w) => w.areaPath === dir);
      expect(gebunden).toHaveLength(2);
      expect(new Set(gebunden.map((w) => w.appId)).size).toBe(1);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});
