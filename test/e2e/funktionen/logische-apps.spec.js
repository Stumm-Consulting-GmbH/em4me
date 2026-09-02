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
'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

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
