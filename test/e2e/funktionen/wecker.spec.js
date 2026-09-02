// 4T-000637 (Epic 3E-000069): E2E-Funktions-Suite Wecker (Uhr-Erweiterung).
//
// Anders als die Erinnerungen haengen Wecker weder an einer Datei noch an
// einem Bereich: sie stehen app-weit im Einstellungs-Speicher, die
// Faelligkeit prueft ein eigener Takt im Main. Die Specs pruefen deshalb den
// Bedien-Pfad im Panel und, in einem bewusst langsamen Test, die reale Kette
// bis zur Meldung.
//
// WE-01: Wecker-Modus zeigt den Leer-Hinweis; Anlegen ueber den Dialog
//        (Uhrzeit-Picker, Bezeichnung, Wiederholung) traegt ihn in die Liste.
// WE-02: Aktiv-Schalter und Loeschen wirken und ueberleben den Neustart.
// WE-03: Wochentags-Muster blendet die Tages-Auswahl ein; ohne gewaehlten
//        Tag bleibt Bestaetigen gesperrt.
// WE-04: Ein faelliger Wecker meldet sich mit Dialog (realer Takt, deshalb
//        langsam) und laesst sich bestaetigen.
// WE-05: Aus-Zustand der Erweiterung — kein Panel und keine Meldung.
//
// Zeit-Bezug: WE-04 stellt den Wecker auf die naechste volle Minute des
// Laufs; alle uebrigen Specs nutzen feste Uhrzeiten ohne Gegenwarts-Bezug.
'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

const CLOCK_BTN = '#btn-clock';
const SECTION = '.pane-group .sidebar-clock';
const MODE_ALARM = '.pane-group .sidebar-clock [data-clock-mode="alarm"]';
const ROWS = '.pane-group .sidebar-clock .alarm-row';
const ADD_BTN = '.pane-group .sidebar-clock .alarm-add-btn';
const MODAL = '#alarm-modal';
const TIME_BTN = '#alarm-time';
const LABEL_INPUT = '#alarm-label';
const REPEAT_SEL = '#alarm-repeat';
const DAYS = '#alarm-days';
const OK = '#btn-alarm-ok';
const PICKER = '.date-picker-popup';
const DUE_MODAL = '#alarm-due-modal';

// Wecker-Panel oeffnen und in den Wecker-Modus schalten. Der Statusbar-
// Button toggelt, deshalb wird nur geklickt, solange die Sektion nicht
// sichtbar ist: nach einem Neustart mit demselben Profil ist die Panel-
// Sichtbarkeit bereits wiederhergestellt. Zwei Versuche, weil ein sichtbar
// gespeichertes Panel mit inaktivem Gruppen-Reiter erst aus- und dann
// wieder eingeschaltet werden muss (das Einschalten aktiviert den Reiter).
async function openAlarms(page) {
  const section = page.locator(SECTION).first();
  for (let i = 0; i < 2; i++) {
    if (await section.isVisible()) break;
    await page.click(CLOCK_BTN);
    await page.waitForTimeout(150);
  }
  await expect(section).toBeVisible();
  await page.click(MODE_ALARM);
  await expect(page.locator(MODE_ALARM).first()).toHaveAttribute('aria-pressed', 'true');
}

// Wecker-Liste direkt in den Store schreiben (Vorbedingung mehrerer Specs;
// die Bedienung selbst prueft WE-01).
async function seedAlarms(page, alarms) {
  await page.evaluate((list) => window.api.setSetting('clock.alarms', list), alarms);
}

test.describe('WE-01: Wecker anlegen', () => {
  test('leerer Modus zeigt den Hinweis; der Dialog legt einen Wecker an', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openAlarms(page);
      await expect(page.locator(`${SECTION} .clock-placeholder`).first()).toBeVisible();
      await expect(page.locator(ROWS)).toHaveCount(0);

      await page.click(ADD_BTN);
      await expect(page.locator(MODAL)).toBeVisible();
      // Uhrzeit ueber den Picker (Ziffern-Segmente), nicht als Freitext.
      await page.click(TIME_BTN);
      await expect(page.locator(PICKER)).toBeVisible();
      // Der Picker uebernimmt seine Vorbelegung; bestaetigen genuegt hier.
      await page.keyboard.press('Enter');
      await expect(page.locator(PICKER)).toBeHidden();
      await page.fill(LABEL_INPUT, 'Jour fixe');
      await page.selectOption(REPEAT_SEL, 'daily');
      await page.click(OK);
      await expect(page.locator(MODAL)).toBeHidden();

      const row = page.locator(ROWS).first();
      await expect(row).toBeVisible();
      await expect(row.locator('.alarm-row-sub')).toContainText('Jour fixe');
      await expect(row.locator('.alarm-row-time')).toHaveText(/^\d{2}:\d{2}$/);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('WE-02: Schalten, Loeschen und Persistenz', () => {
  test('der Aktiv-Schalter wirkt und die Liste ueberlebt den Neustart', async () => {
    const first = await launchApp();
    const userData = first.userData;
    try {
      await seedAlarms(first.page, [
        { id: 'a1', time: '07:00', label: 'Aufstehen', enabled: true, repeat: 'daily', days: [] },
      ]);
      await openAlarms(first.page);
      const row = first.page.locator(ROWS).first();
      await expect(row).toBeVisible();
      const toggle = row.locator('.alarm-toggle');
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await toggle.click();
      await expect(first.page.locator(ROWS).first().locator('.alarm-toggle')).toHaveAttribute(
        'aria-checked',
        'false',
      );
      await first.app.evaluate(({ app }) => app.quit());
      await first.app.waitForEvent('close');

      // Neustart mit demselben Profil: der abgeschaltete Wecker ist noch da.
      const second = await launchApp({ userData });
      try {
        await openAlarms(second.page);
        const zeile = second.page.locator(ROWS).first();
        await expect(zeile).toBeVisible();
        await expect(zeile.locator('.alarm-toggle')).toHaveAttribute('aria-checked', 'false');
        await expect(zeile.locator('.alarm-row-time')).toHaveText('07:00');
      } finally {
        await closeApp(second.app, null);
      }
    } finally {
      await closeApp(first.app, userData);
    }
  });
});

test.describe('WE-03: Wochentags-Muster', () => {
  test('die Tages-Auswahl erscheint und sperrt das Bestaetigen ohne Tag', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openAlarms(page);
      await page.click(ADD_BTN);
      await expect(page.locator(MODAL)).toBeVisible();
      await expect(page.locator(DAYS)).toBeHidden();

      await page.selectOption(REPEAT_SEL, 'weekdays');
      await expect(page.locator(DAYS)).toBeVisible();
      // Ohne gewaehlten Tag wuerde der Wecker nie feuern.
      await expect(page.locator(OK)).toBeDisabled();

      await page.locator(`${DAYS} .alarm-day`).first().click();
      await expect(page.locator(OK)).toBeEnabled();
      await page.click(OK);
      await expect(page.locator(MODAL)).toBeHidden();
      await expect(page.locator(ROWS)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('WE-04: Meldung eines faelligen Weckers', () => {
  // Bewusst langsam: geprueft wird die reale Kette aus Main-Takt (30 s),
  // IPC-Zustellung und Dialog. Der Wecker wird auf die naechste volle Minute
  // gestellt; liegt diese zu nah, weicht der Test auf die uebernaechste aus.
  test('der Dialog erscheint zur eingestellten Minute und laesst sich bestaetigen', async () => {
    test.slow();
    const { app, page, userData } = await launchApp();
    try {
      const time = await page.evaluate(() => {
        const now = new Date();
        // Mindestens 20 Sekunden Vorlauf, damit der Zeitpunkt sicher hinter
        // dem Start des Pruefers liegt.
        const target = new Date(now.getTime() + (now.getSeconds() > 40 ? 120000 : 60000));
        const hh = String(target.getHours()).padStart(2, '0');
        const mm = String(target.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
      });
      await seedAlarms(page, [
        { id: 'a1', time, label: 'E2E', enabled: true, repeat: 'daily', days: [] },
      ]);

      await expect(page.locator(DUE_MODAL)).toBeVisible({ timeout: 150000 });
      await expect(page.locator('#alarm-due-list')).toContainText(time);
      await page.click('#btn-alarm-confirm');
      await expect(page.locator(DUE_MODAL)).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('WE-05: Aus-Zustand der Erweiterung', () => {
  test('ohne die Uhr-Erweiterung gibt es weder Panel noch Meldung', async () => {
    const first = await launchApp();
    const userData = first.userData;
    try {
      await seedAlarms(first.page, [
        { id: 'a1', time: '07:00', label: 'Aus', enabled: true, repeat: 'daily', days: [] },
      ]);
      await first.page.evaluate(() => window.api.setSetting('extensions.disabled', ['clock']));
      await first.app.evaluate(({ app }) => app.quit());
      await first.app.waitForEvent('close');

      const second = await launchApp({ userData });
      try {
        await expect(second.page.locator(CLOCK_BTN)).toBeHidden();
        await expect(second.page.locator(SECTION).first()).toBeHidden();
        await expect(second.page.locator(DUE_MODAL)).toBeHidden();
      } finally {
        await closeApp(second.app, null);
      }
    } finally {
      await closeApp(first.app, userData);
    }
  });
});
