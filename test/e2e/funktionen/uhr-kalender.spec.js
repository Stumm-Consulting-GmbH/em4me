// 4T-0752 (Epic 3E-0146): E2E-Funktions-Suite — Monatskalender der Uhr.
//
// Die Navigations-Rechnung selbst prüft test/unit/clock-options.test.js, den
// Gitter-Aufbau test/unit/renderer/month-grid-view.test.js. Hier geht es um
// das, was nur die gebaute Anwendung zeigt: die fünfte Modus-Taste, das
// Zusammenspiel von Blättern und Beschriftung, die Jahres-Eingabe über die
// Ziffern-Steuerung und die abschaltbare Kalenderwochen-Spalte.
//
// UK-01: Die fünfte Modus-Taste öffnet den Kalender mit dem laufenden Monat.
// UK-02: Blättern um Monat und Jahr, Rückkehr über „Heute".
// UK-03: Direkte Jahres-Eingabe erreicht ein weit zurückliegendes Jahr.
// UK-04: Die Kalenderwochen-Spalte folgt der Einstellung.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

const CLOCK_BTN = '#btn-clock';
const SECTION = '.pane-group .sidebar-clock';
const MODE = (m) => `${SECTION} [data-clock-mode="${m}"]`;
const LABEL = `${SECTION} .clock-cal-label`;
const GRID = `${SECTION} .clock-calendar-grid`;
const DAYS = `${GRID} .clock-cal-day`;
const WEEK_CELLS = `${GRID} .calendar-week-col`;
const YEAR_EDIT = `${SECTION} .clock-cal-year`;
const YEAR_DIGITS = `${SECTION} .clock-cal-year-digit`;
const NAV = (n) => `${SECTION} .clock-calendar-nav .clock-cal-nav-btn >> nth=${n}`;
const TODAY_BTN = `${SECTION} .clock-cal-today`;
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

// Profil mit vorbefüllter config.json (Muster seedProfile in uhr-größen.spec).
function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-uhr-kalender-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

async function openMode(page, mode) {
  const section = page.locator(SECTION).first();
  for (let i = 0; i < 2; i++) {
    if (await section.isVisible()) break;
    await page.click(CLOCK_BTN);
    await page.waitForTimeout(150);
  }
  await expect(section).toBeVisible();
  await page.click(MODE(mode));
  await expect(page.locator(MODE(mode)).first()).toHaveAttribute('aria-pressed', 'true');
}

// Erwartete Beschriftung des laufenden Monats in der App-Sprache; so bleibt
// die Prüfung von der Sprache der Testumgebung unabhängig.
function currentMonthLabel(page) {
  return page.evaluate(() => {
    const now = new Date();
    return new Intl.DateTimeFormat(document.documentElement.lang, {
      month: 'long',
      year: 'numeric',
    }).format(new Date(now.getFullYear(), now.getMonth(), 1, 12));
  });
}

test.describe('UK-01: fuenfter Modus', () => {
  test('oeffnet den Kalender mit dem laufenden Monat und dem heutigen Tag', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openMode(page, 'calendar');
      await expect(page.locator(LABEL).first()).toHaveText(await currentMonthLabel(page));
      // Ein Monatsgitter traegt immer volle Wochen.
      const tage = await page.locator(DAYS).count();
      expect(tage % 7).toBe(0);
      expect(tage).toBeGreaterThanOrEqual(28);
      // Der heutige Tag ist genau einmal hervorgehoben.
      await expect(page.locator(`${DAYS}.today`)).toHaveCount(1);
      // Die Uhr-Anzeige ist im Kalender-Modus nicht sichtbar.
      await expect(page.locator(`${SECTION} .clock-face`)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('UK-02: blaettern', () => {
  test('Monat und Jahr in beide Richtungen, Rueckkehr ueber Heute', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openMode(page, 'calendar');
      const start = await page.locator(LABEL).first().textContent();

      // Reihenfolge der Navigations-Tasten: Jahr zurueck, Monat zurueck,
      // (Beschriftung), Monat vor, Jahr vor.
      await page.click(NAV(2)); // ein Monat vor
      const einMonat = await page.locator(LABEL).first().textContent();
      expect(einMonat).not.toBe(start);

      await page.click(NAV(1)); // ein Monat zurueck
      await expect(page.locator(LABEL).first()).toHaveText(start);

      await page.click(NAV(3)); // ein Jahr vor
      const einJahr = await page.locator(LABEL).first().textContent();
      expect(einJahr).not.toBe(start);
      // Gleicher Monat, anderes Jahr: die Jahreszahl unterscheidet sich.
      const jahrStart = Number(start.match(/\d{3,4}/)[0]);
      expect(Number(einJahr.match(/\d{3,4}/)[0])).toBe(jahrStart + 1);

      await page.click(TODAY_BTN);
      await expect(page.locator(LABEL).first()).toHaveText(start);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('UK-03: direkte Jahres-Eingabe', () => {
  test('erreicht ein weit zurueckliegendes Jahr ueber die Ziffern-Steuerung', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openMode(page, 'calendar');
      await page.click(LABEL);
      await expect(page.locator(YEAR_EDIT).first()).toBeVisible();
      await expect(page.locator(YEAR_DIGITS)).toHaveCount(4);

      // 1960 Stelle fuer Stelle; die Eingabe rueckt selbst weiter.
      for (const ziffer of ['1', '9', '6', '0']) await page.keyboard.press(ziffer);
      await page.keyboard.press('Enter');

      await expect(page.locator(LABEL).first()).toContainText('1960');
      // Die Eingabe klappt nach dem Uebernehmen zu; ihre Zellen bleiben im
      // DOM und werden nur ausgeblendet.
      await expect(page.locator(YEAR_EDIT).first()).toBeHidden();
      // Der heutige Tag liegt nicht in diesem Monat.
      await expect(page.locator(`${DAYS}.today`)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('UK-04: Kalenderwochen-Spalte', () => {
  test('ist voreingestellt sichtbar und laesst sich abschalten', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openMode(page, 'calendar');
      // Kopf-Ecke plus eine Zelle je Wochen-Zeile.
      const mitSpalte = await page.locator(WEEK_CELLS).count();
      expect(mitSpalte).toBeGreaterThan(1);

      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return page.locator(SETTINGS_PAGE).count();
        })
        .toBeGreaterThan(0);
      await page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="clock"]`).click();
      await page.locator('#settings-clock-calendar-week').click();
      await page.locator('#btn-settings-apply').click();

      await expect(page.locator(WEEK_CELLS)).toHaveCount(0);
      await expect(page.locator(GRID)).toHaveClass(/no-week-col/);
    } finally {
      await closeApp(app, userData);
    }
  });

  test('ein abgeschalteter Stand aus dem Store wirkt beim Start', async () => {
    const userData = seedProfile({
      language: 'de',
      clock: { options: { showCalendarWeek: false } },
    });
    const { app, page } = await launchApp({ userData, settings: null });
    try {
      await openMode(page, 'calendar');
      await expect(page.locator(WEEK_CELLS)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});
