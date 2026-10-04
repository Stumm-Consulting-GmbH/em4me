// 4T-001728 (Epic 3E-000305): E2E-Funktions-Suite «Wecker und Timer in allen
// Fenstern».
//
// Ein abgelaufener Timer und ein fälliger Wecker melden sich in ALLEN offenen
// Fenstern; eine Bearbeitung in einem Fenster räumt die Meldung in allen
// übrigen. Aufbau wie in erinnerungen-alle-fenster.spec.js: Die Anwendung
// startet mit einer Datei (Fenster OHNE Bereich), weitere Fenster entstehen
// daraus; ein Fenster mit Bereich wird über seinen Titel benannt, nie abgezählt
// (Stabilitätsregel 15).
//
// UF-01: Timer — Meldung im Fenster ohne Bereich und im Bereichs-Fenster;
//        Escape (gilt als Bestätigen) in einem Fenster räumt beide und setzt den
//        Timer zurück (AK3, AK4, AK10 des Tasks).
// UF-02: Timer — ein Fenster schließt, die Meldung bleibt im anderen; ein danach
//        geöffnetes Fenster zeigt sie; «Erneut starten» dort räumt alle und
//        startet den Timer (AK4, AK13, AK14).
// UF-03: Wecker — Meldung in zwei Fenstern, «Schlummern» in einem räumt das
//        andere (AK2, AK4). Realer 30-Sekunden-Takt, deshalb langsam.
// UF-04: Abgeschaltete Erweiterung «Uhr»: kein Dialog in keinem Fenster (AK8).
// UF-05: Zwei zugleich abgelaufene Timer: je Fenster EIN Dialog mit beiden (AK15).
//
// Zeit-Bezug: Timer laufen wenige Sekunden; der Wecker steht auf der nächsten
// vollen Minute des Laufs (Muster WE-04).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');
const TIMER_DUE = '#timer-due-modal';
const ALARM_DUE = '#alarm-due-modal';
const ZEIT = { timeout: 15000 };

function bereich() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-uf-'));
  fs.writeFileSync(path.join(dir, 'notiz.md'), '# Notiz\n');
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
  }
}

async function starte(opts = {}) {
  const lauf = await launchApp({ args: [BASIS], ...opts });
  await expect.poll(() => lauf.page.title()).toContain('basis');
  return lauf;
}

async function oeffneBereich(app, von, dir) {
  const neu = app.waitForEvent('window');
  await von.evaluate((p) => window.api.openAreaPath(p), dir);
  const page = await neu;
  await page.waitForLoadState('domcontentloaded');
  await expect.poll(() => page.title()).toContain(`(Bereich ${path.basename(dir)})`);
  return page;
}

async function oeffneFenster(app, von) {
  const neu = app.waitForEvent('window');
  await von.evaluate(() => window.api.openNewWindow([], null));
  const page = await neu;
  await page.waitForLoadState('domcontentloaded');
  return page;
}

// Laufender Timer, der nach `restMs` abläuft (Muster seedRunningTimer, TS-04).
async function starteTimer(page, restMs) {
  await page.evaluate(
    (ms) =>
      window.api.setSetting('clock.timers', [
        { id: 't1', label: 'Tee', durationMs: ms, state: 'running', startedAt: Date.now() },
      ]),
    restMs,
  );
}

const timerZustand = (page) =>
  page.evaluate(async () => (await window.api.getSetting('clock.timers'))[0].state);

// --- UF-01 ---------------------------------------------------------------------------

test.describe('UF-01: Timer-Meldung in allen Fenstern, Escape räumt überall', () => {
  test('Fenster ohne Bereich und Bereichs-Fenster zeigen sie; Escape in einem räumt beide', async () => {
    const { app, page, userData } = await starte();
    const dir = bereich();
    try {
      const fensterA = await oeffneBereich(app, page, dir);
      await starteTimer(page, 2000);
      for (const p of [page, fensterA]) {
        await expect(p.locator(TIMER_DUE)).toBeVisible(ZEIT);
        await expect(p.locator('#timer-due-list')).toContainText('Tee');
      }
      await fensterA.locator(TIMER_DUE).press('Escape');
      for (const p of [page, fensterA]) await expect(p.locator(TIMER_DUE)).toBeHidden(ZEIT);
      // Bestätigen setzt den Timer genau einmal zurück.
      await expect.poll(() => timerZustand(page), ZEIT).toBe('idle');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

// --- UF-02 ---------------------------------------------------------------------------

test.describe('UF-02: Timer — geschlossenes und später geöffnetes Fenster', () => {
  test('die Meldung überlebt das Schließen eines Fensters und steht im neuen; «Erneut starten» räumt alle', async () => {
    const { app, page, userData } = await starte();
    const dir = bereich();
    try {
      await oeffneBereich(app, page, dir);
      await starteTimer(page, 2000);
      await expect(page.locator(TIMER_DUE)).toBeVisible(ZEIT);

      // Das Bereichs-Fenster schließt: Die Meldung im übrigen Fenster bleibt.
      await hauptSenden(
        app,
        ({ BrowserWindow }, teil) => {
          const win = BrowserWindow.getAllWindows().find((w) => w.getTitle().includes(teil));
          if (win) win.close();
        },
        `(Bereich ${path.basename(dir)})`,
      );
      await expect.poll(() => app.windows().length, ZEIT).toBe(1);
      await expect(page.locator(TIMER_DUE)).toBeVisible();

      // Ein erst jetzt geöffnetes Fenster holt die offene Meldung nach.
      const spaet = await oeffneFenster(app, page);
      await expect(spaet.locator(TIMER_DUE)).toBeVisible(ZEIT);
      await spaet.locator('#btn-timer-restart').click();
      for (const p of [page, spaet]) await expect(p.locator(TIMER_DUE)).toBeHidden(ZEIT);
      await expect.poll(() => timerZustand(page), ZEIT).toBe('running');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

// --- UF-03 ---------------------------------------------------------------------------

test.describe('UF-03: Wecker-Meldung in zwei Fenstern', () => {
  // Bewusst langsam: realer Takt des Weckers (30 Sekunden), Muster WE-04.
  test('beide Fenster zeigen den Wecker; «Schlummern» in einem räumt das andere', async () => {
    test.slow();
    const { app, page, userData } = await starte();
    try {
      const zweites = await oeffneFenster(app, page);
      const zeit = await page.evaluate(() => {
        const now = new Date();
        const ziel = new Date(now.getTime() + (now.getSeconds() > 40 ? 120000 : 60000));
        return `${String(ziel.getHours()).padStart(2, '0')}:${String(ziel.getMinutes()).padStart(2, '0')}`;
      });
      await page.evaluate(
        (time) =>
          window.api.setSetting('clock.alarms', [
            { id: 'a1', time, label: 'E2E', enabled: true, repeat: 'daily', days: [] },
          ]),
        zeit,
      );
      for (const p of [page, zweites]) {
        await expect(p.locator(ALARM_DUE)).toBeVisible({ timeout: 150000 });
        await expect(p.locator('#alarm-due-list')).toContainText(zeit);
      }
      await zweites.locator('#btn-alarm-snooze').click();
      for (const p of [page, zweites]) await expect(p.locator(ALARM_DUE)).toBeHidden(ZEIT);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- UF-04 ---------------------------------------------------------------------------

test.describe('UF-04: Abgeschaltete Erweiterung «Uhr»', () => {
  test('ein ablaufender Timer zeigt in keinem Fenster eine Meldung', async () => {
    const { app, page, userData } = await starte({
      settings: { language: 'de', extensions: { disabled: ['clock'] } },
    });
    try {
      const zweites = await oeffneFenster(app, page);
      await starteTimer(page, 1500);
      // Abwesenheit lässt sich nicht abwarten: feste Frist wie WE-05 und ER-07.
      await page.waitForTimeout(4000);
      for (const p of [page, zweites]) await expect(p.locator(TIMER_DUE)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- UF-05 ---------------------------------------------------------------------------

test.describe('UF-05: Zwei zugleich abgelaufene Timer', () => {
  test('jedes Fenster zeigt EINEN Dialog mit beiden Timern', async () => {
    const { app, page, userData } = await starte();
    try {
      const zweites = await oeffneFenster(app, page);
      await page.evaluate(() => {
        const jetzt = Date.now();
        const timer = (id, label) => ({
          id,
          label,
          durationMs: 2000,
          state: 'running',
          startedAt: jetzt,
        });
        return window.api.setSetting('clock.timers', [timer('t1', 'Tee'), timer('t2', 'Ei')]);
      });
      for (const p of [page, zweites]) {
        await expect(p.locator(TIMER_DUE)).toBeVisible(ZEIT);
        await expect(p.locator('#timer-due-list .alarm-due-row')).toHaveCount(2, ZEIT);
        await expect(p.locator(TIMER_DUE)).toHaveCount(1);
      }
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
