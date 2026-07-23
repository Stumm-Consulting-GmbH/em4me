// 4T-0679 (Epic 3E-0139): E2E-Funktions-Suite Uhr-Größen — die digitale
// Anzeige folgt der Größen-Stufe.
//
// Die Faktoren selbst prüft test/unit/clock-options.test.js, das Setzen der
// CSS-Variable test/unit/renderer/clock-panel.test.js. Hier geht es um das,
// was nur ein echtes Chromium zeigt: die wirksame Schriftgröße nach dem
// Anwenden und das Umbruch-Verhalten in einer schmalen Spalte.
//
// UG-01: Die Größen-Auswahl steht im Block „Anzeige" und bleibt erreichbar,
//        wenn das Zifferblatt abgeschaltet ist.
// UG-02: Die Stufe bemisst die digitale Anzeige; Zeit, Datum und
//        Kalenderwoche wachsen gemeinsam.
// UG-03: In der schmalsten Spalte bleibt die große Stufe einzeilig und wird
//        beidseitig beschnitten, statt umzubrechen oder zu scrollen.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

const CLOCK_BTN = '#btn-clock';
const SECTION = '.pane-group .sidebar-clock';
const DIGITAL = `${SECTION} .clock-digital`;
const DATE = `${SECTION} .clock-date`;
const WEEK = `${SECTION} .clock-week`;
const SECTION_BODY = `${SECTION} .sidebar-section-body`;
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

// Profil-Verzeichnis mit vorbefüllter electron-store-config.json; Punkt-Keys
// liegen im Store verschachtelt (Muster seedProfile in sidebar-layout.spec).
function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-uhr-groessen-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

// Uhr-Panel einblenden (Muster openMode in timer-stoppuhr.spec.js): Der
// Toggle-Knopf steht erst am Ende des asynchronen init() bereit.
async function openClock(page) {
  const section = page.locator(SECTION).first();
  for (let i = 0; i < 2; i++) {
    if (await section.isVisible()) break;
    await page.click(CLOCK_BTN);
    await page.waitForTimeout(150);
  }
  await expect(section).toBeVisible();
}

// Einstellungs-Seite über das Kommando öffnen und den Uhr-Bereich wählen
// (Muster openColorSchemesSection in farbschemas.spec.js).
async function openClockSettings(page) {
  await expect
    .poll(async () => {
      await page.keyboard.press('Control+,');
      return page.locator(SETTINGS_PAGE).count();
    })
    .toBeGreaterThan(0);
  await page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="clock"]`).click();
  await expect(page.locator('#settings-clock-size')).toBeVisible();
}

// Wirksame Schriftgröße in Pixeln.
function fontSize(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? parseFloat(getComputedStyle(el).fontSize) : null;
  }, selector);
}

test.describe('UG-01: Größen-Auswahl im Block „Anzeige"', () => {
  test('bleibt erreichbar, wenn das Zifferblatt abgeschaltet ist', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openClockSettings(page);
      // Ausgangslage: Zifferblatt an, Analog-Block mit seinen eigenen Zeilen.
      await expect(page.locator('#settings-clock-dial')).toBeVisible();

      // Zifferblatt abschalten; der Bereich rendert neu.
      await page.locator('#settings-clock-analog').uncheck();
      await expect(page.locator('#settings-clock-dial')).toHaveCount(0);
      // Die Größen-Auswahl gehört seit 4T-0679 nicht mehr zum Analog-Block
      // und muss deshalb stehen bleiben — sie bemisst auch die Schrift.
      await expect(page.locator('#settings-clock-size')).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('UG-02: Stufe bemisst die digitale Anzeige', () => {
  test('Zeit, Datum und Kalenderwoche wachsen gemeinsam mit der Stufe', async () => {
    const userData = seedProfile({
      clock: { options: { analogSize: 'small', showWeek: true } },
    });
    const { app, page } = await launchApp({ userData });
    try {
      await openClock(page);
      const klein = {
        zeit: await fontSize(page, DIGITAL),
        datum: await fontSize(page, DATE),
        woche: await fontSize(page, WEEK),
      };
      // Die kleine Stufe ist das Schriftbild vor dem Epic (PO-Festlegung).
      expect(klein.zeit).toBeCloseTo(17, 1);
      expect(klein.datum).toBeCloseTo(12, 1);

      await openClockSettings(page);
      await page.selectOption('#settings-clock-size', 'large');
      await page.locator('#btn-settings-apply').click();

      await expect.poll(() => fontSize(page, DIGITAL)).toBeGreaterThan(klein.zeit);
      expect(await fontSize(page, DATE)).toBeGreaterThan(klein.datum);
      expect(await fontSize(page, WEEK)).toBeGreaterThan(klein.woche);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('UG-03: große Stufe in der schmalsten Spalte', () => {
  test('wird beidseitig beschnitten statt umzubrechen', async () => {
    // Schmalste Spalte (SIDEBAR_MIN_WIDTH) und der breiteste Zeit-Text, den
    // die Anwendung erzeugen kann: 12-Stunden-Format mit Sekunden, also elf
    // Zeichen wie „12:59:59 PM".
    const userData = seedProfile({
      sidebar: { widthLeft: 180, widthRight: 180 },
      clock: { options: { analogSize: 'large', hourFormat: 12, showSeconds: true } },
    });
    const { app, page } = await launchApp({ userData });
    try {
      await openClock(page);
      const mass = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        const stil = getComputedStyle(el);
        return {
          whiteSpace: stil.whiteSpace,
          overflow: stil.overflow,
          fontSize: parseFloat(stil.fontSize),
          hoehe: el.getBoundingClientRect().height,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        };
      }, DIGITAL);

      // Einzeilig: Ein Umbruch würde die Höhe mindestens verdoppeln.
      expect(mass.whiteSpace).toBe('nowrap');
      expect(mass.hoehe).toBeLessThan(mass.fontSize * 2);
      // Der Inhalt ist breiter als der sichtbare Bereich und wird gekappt.
      expect(mass.scrollWidth).toBeGreaterThan(mass.clientWidth);
      expect(mass.overflow).toBe('hidden');

      // Das Kappen bleibt in der Zeile: Der scrollende Sektions-Körper
      // bekommt dadurch keinen zweiten (waagerechten) Scrollbalken.
      const body = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      }, SECTION_BODY);
      expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth);
    } finally {
      await closeApp(app, userData);
    }
  });
});
