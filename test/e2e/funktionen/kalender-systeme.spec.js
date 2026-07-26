// 4T-0544 (Epic 3E-0097): E2E-Funktions-Suite Kalender-Systeme —
// Einstellungs-Sektion der calendarSystems-Sektion der Bereichsdatei.
// KS-01: Kern-Durchlauf (Block anlegen → gregorianische Vorlage einfügen →
// Anwenden persistiert in die MDDA → Neustart-simuliertes Nachladen zeigt
// den Stand). KS-02: ohne Bereich zeigt die Sektion den Hinweis-Zustand.
// 4T-0546 (Epic 3E-0097): Wert-Syntax @{Kalendername: Wert} im Dokument.
// KS-03: Live-Badge mit Namens-Anzeige, Klick öffnet den vorbelegten
// Picker (Esc lässt unverändert, anderer Tag ersetzt an Ort und Stelle in
// kanonischer Form — Rundreise-Sicherheit); KS-04: Einfüge-Kommando per
// belegtem Kürzel schreibt den kanonischen Wert am Cursor (4T-0545:
// gemeinsamer Durchlauf Einfügen → Klick → Ändern deckt die Picker-API ab).
// describe-Titel tragen die Matrix-IDs (test/abdeckungs-matrix.json).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const PICKER = '#calendar-picker-popup';

function makeArea() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-kalender-area-'));
}

// Bereichs-Wurzel mit calendarSystems-Sektion (Fantasie-Kalender „Dreimond":
// drei Monate 30/30/35, Schalt-Regel alle 5 Jahre +2 auf den Spätmond,
// Neun-Tage-Zyklus, drei Epochen) plus Test-Dokument mit einem Wert.
function makeCalendarArea() {
  const areaRoot = makeArea();
  const calendarConfig = {
    blocks: [
      {
        id: 'welt',
        name: 'Welt',
        calendars: [
          {
            id: 'dreimond',
            name: 'Dreimond',
            levels: [
              { id: 'tag', name: 'Tag', section: 'Datum', start: 1 },
              {
                id: 'monat',
                name: 'Monat',
                section: 'Datum',
                start: 1,
                names: ['Frühmond', 'Mittmond', 'Spätmond'],
                rel: { type: 'lengths', table: [30, 30, 35] },
              },
              {
                id: 'jahr',
                name: 'Jahr',
                section: 'Datum',
                start: 1,
                rel: { type: 'leap', count: 3, rules: [{ cycle: 5 }], targetIndex: 2, extra: 2 },
              },
            ],
            cycles: [
              {
                id: 'woche',
                name: 'Neuntage',
                of: 'tag',
                length: 9,
                names: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'],
                anchor: { tuple: [1, 1, 1], position: 0 },
                numbering: { ruleIndex: 4 },
              },
            ],
            epochs: [
              { name: 'Erste Zeit', abbr: 'EZ', start: null },
              { name: 'Zweite Zeit', abbr: 'ZZ', start: [1, 1, 1] },
              { name: 'Dritte Zeit', abbr: 'DZ', start: [500, 2, 10] },
            ],
          },
        ],
      },
    ],
  };
  fs.writeFileSync(
    path.join(areaRoot, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { calendarSystems: calendarConfig } }, null, 2) +
      '\n',
    'utf8',
  );
  // Der Wert steht bewusst NICHT auf Zeile 1: die initiale Cursor-Zeile ist
  // aktiv und zeigt Roh-Text (activeLines-Guard der Badge-Dekoration).
  const docPath = path.join(areaRoot, 'werte.md');
  fs.writeFileSync(docPath, '# Werte\n\nEin Wert @{Dreimond: 500-2-09 ZZ} im Text.\n', 'utf8');
  return { areaRoot, docPath };
}

// Profil mit belegtem Kürzel für das Einfüge-Kommando (Muster journale.spec.js).
function makeUserData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-kalender-profile-'));
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({ hotkeys: { 'calendar.insertValue': 'Ctrl+Alt+9' } }),
    'utf8',
  );
  return dir;
}

// 4T-0748 (Epic 3E-0138): Bereich mit einer abgeleiteten Zeitrechnung auf
// der eingebauten Standard-Zeitrechnung plus Dokument mit zwei Werten.
function makeDerivedArea() {
  const areaRoot = makeArea();
  const config = {
    blocks: [
      {
        id: 'projekte',
        name: 'Projekte',
        calendars: [
          {
            id: 'hausbau',
            name: 'Hausbau',
            derivedFrom: '@standard',
            zero: [2023, 2, 28],
            labelBefore: 'vor Haus',
            labelAfter: 'nach Haus',
          },
        ],
      },
    ],
  };
  fs.writeFileSync(
    path.join(areaRoot, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { calendarSystems: config } }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(areaRoot, 'spanne.md'),
    '# Spanne\n\nBaubeginn @{Hausbau: 0-1-18} und davor @{Hausbau: 0-0-15 vor Haus}.\n',
    'utf8',
  );
  return { areaRoot };
}

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Test-Dokument aus dem Bereichs-Panel öffnen: openAreaPath setzt die Tabs
// des Fensters zurück, deshalb wird die Datei NACH dem Binden geöffnet.
async function openDocFromAreaPanel(page, name) {
  await page.locator('.area-file-row', { hasText: name }).first().click();
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Ansicht und Edit-Modus (Muster datums-picker.spec.js; der viewChange-
// Kanal wird gepollt — Menü-Listener frischer Fenster registrieren sich
// erst am Ende des asynchronen init()).
async function enterEdit(app, page, mode) {
  await expect
    .poll(async () => {
      await sendMenuChannel(app, 'menu:viewChange', mode);
      return page.locator(SEL.editorContent0).isVisible();
    })
    .toBe(true);
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// Bereich an das leere Startfenster binden (Muster journale.spec.js).
async function bindArea(page, areaRoot) {
  await expect
    .poll(async () => {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
      return !!(result && result.ok !== false);
    })
    .toBe(true);
}

// Einstellungs-Seite öffnen und zur Kalender-Sektion wechseln. Poll auf
// SICHTBARKEIT: der Kommando-Dispatcher steht erst am Ende des asynchronen
// init(), und nach dem Schließen bleibt die Seite als verstecktes DOM im
// System-Pane stehen (count > 0 reicht nicht als Offen-Beleg).
async function openCalendarSection(page) {
  const navEntry = page.locator(
    `${SETTINGS_PAGE} .settings-nav-entry[data-section-id="calendarSystems"]`,
  );
  await expect
    .poll(async () => {
      await page.keyboard.press('Control+,');
      return navEntry.isVisible();
    })
    .toBe(true);
  await navEntry.click();
}

test.describe('KS-01: Kern-Durchlauf der Einstellungs-Sektion', () => {
  test('Block anlegen, Vorlage einfügen, Anwenden persistiert, Nachladen zeigt den Stand', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openCalendarSection(page);

      // Übersicht: Block anlegen und benennen (Nachlade-Poll der Sektion).
      const addBlock = page.locator('#settings-calsys-block-add');
      await expect(addBlock).toBeVisible();
      await addBlock.click();
      await page.locator('#settings-calsys-block-name-0').fill('Welt');

      // Detail: gregorianische Vorlage einfügen — vollständige Definition,
      // Editor meldet keinen Ungültig-Hinweis, Vorschau zeigt den Anker.
      await page.locator('#settings-calsys-block-open-0').click();
      await page.locator('#settings-calsys-cal-template').click();
      await expect(page.locator('#settings-calsys-cal-name-0')).toHaveValue(
        'Gregorianischer Kalender',
      );
      await expect(page.locator('#settings-calsys-cal-invalid-0')).toBeHidden();
      await expect(page.locator('#settings-calsys-preview-0')).toContainText('Kanonisch:');

      // Anwenden persistiert die Sektion in die Bereichsdatei.
      await page.locator('#btn-settings-apply').click();
      const mddaPath = path.join(areaRoot, 'Area_Settings.mdda');
      await expect
        .poll(() => {
          try {
            const parsed = JSON.parse(fs.readFileSync(mddaPath, 'utf8'));
            const config = parsed.settings && parsed.settings.calendarSystems;
            if (!config) return 'keine Sektion';
            const cal = config.blocks[0] && config.blocks[0].calendars[0];
            return cal ? `${config.blocks[0].name}/${cal.levels.length}` : 'kein Kalender';
          } catch {
            return 'keine Datei';
          }
        })
        .toBe('Welt/6');

      // Neustart-simuliertes Nachladen: Seite schließen und neu öffnen —
      // die Übersicht zeigt den Block mit einem Kalender.
      await page.locator('#btn-settings-ok').click();
      await openCalendarSection(page);
      await expect(page.locator('#settings-calsys-block-name-0')).toHaveValue('Welt');
      await expect(page.locator('.settings-calsys-block-count')).toContainText('1');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

// 4T-0555 (Epic 3E-0100): Ohne gebundenen Bereich erscheint die Sektion
// gar nicht mehr in der Navigation (Gruppe „Aktueller Bereich" entfällt
// vollständig) — der frühere Hinweis-Zustand ist über die UI nicht mehr
// erreichbar.
test.describe('KS-02: Ohne Bereich fehlt die Sektion in der Navigation', () => {
  test('kein Bereich: kein Navigations-Eintrag, keine Bereichs-Gruppe', async () => {
    const { app, page, userData } = await launchApp();
    try {
      // Seite über das Kommando öffnen (Sichtbarkeits-Poll wie
      // openCalendarSection, aber ohne Sektions-Klick).
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return page.locator(SETTINGS_PAGE).isVisible();
        })
        .toBe(true);
      await expect(
        page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="calendarSystems"]`),
      ).toHaveCount(0);
      await expect(page.locator(`${SETTINGS_PAGE} [data-nav-group="area"]`)).toHaveCount(0);
      await expect(page.locator('#settings-calsys-block-add')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('KS-03: Wert-Badge im Live-Modus, Klick-Bearbeitung (S-090)', () => {
  test('Badge zeigt Namens-Form, Esc lässt unverändert, anderer Tag ersetzt kanonisch', async () => {
    const { areaRoot } = makeCalendarArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openDocFromAreaPanel(page, 'werte.md');
      await enterEdit(app, page, 'live');

      // Badge mit Namens-Anzeige (Paritaet zur Render-Spec-Quelle); die
      // Konfiguration kommt asynchron über den Bereichs-Wechsel nach.
      const badge = page.locator('.cm-live-calendar-badge');
      await expect(badge).toHaveText('500-Mittmond-09 ZZ');

      // Klick öffnet den vorbelegten Picker; Esc lässt den Wert stehen.
      await badge.click();
      await expect(page.locator(PICKER)).toBeVisible();
      await expect(page.locator(`${PICKER} .calendar-picker-day.selected`)).toHaveText('9');
      await page.keyboard.press('Escape');
      await expect(page.locator(PICKER)).toBeHidden();
      await expect(badge).toHaveText('500-Mittmond-09 ZZ');

      // Anderer Tag ersetzt an Ort und Stelle in kanonischer Form (Tag 5
      // bleibt in der Epoche ZZ — Tag 10 wäre bereits die DZ-Grenze). Nach
      // dem Übernehmen steht der Cursor im Wert (aktive Zeile zeigt
      // Roh-Text) — die Rundreise-Sicherheit ist direkt am Quelltext
      // ablesbar.
      await badge.click();
      await expect(page.locator(PICKER)).toBeVisible();
      await page
        .locator(`${PICKER} .calendar-picker-day:not(.other-month)`, { hasText: /^5$/ })
        .click();
      await page.locator('#calendar-picker-ok').click();
      await expect(page.locator(PICKER)).toBeHidden();
      await expect(page.locator(SEL.editorContent0)).toContainText(
        'Ein Wert @{Dreimond: 500-2-05 ZZ} im Text.',
      );
    } finally {
      // Der Test hinterlaesst absichtlich einen dirty Buffer (Ersetzen ohne
      // Speichern) — force-Exit ohne Speichern-Dialog (Helper-Doku).
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

test.describe('KS-04: Einfüge-Kommando schreibt den kanonischen Wert (S-090)', () => {
  test('belegtes Kürzel öffnet den Picker, Übernehmen fügt @{…} am Cursor ein', async () => {
    const { areaRoot } = makeCalendarArea();
    const userDataDir = makeUserData();
    const { app, page, userData } = await launchApp({ userData: userDataDir });
    try {
      await bindArea(page, areaRoot);
      await openDocFromAreaPanel(page, 'werte.md');
      await enterEdit(app, page, 'source');
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n');

      // Kürzel drücken, bis der Picker offen ist (Dispatcher erst nach init).
      await expect
        .poll(async () => {
          if (await page.locator(PICKER).isVisible()) return true;
          await page.keyboard.press('Control+Alt+9');
          return page.locator(PICKER).isVisible();
        })
        .toBe(true);

      // Übernehmen: Default-Auswahl ist der Block-Anker (Jahr 1 der ersten
      // Epoche in Minimal-Stellung) — kanonische Form am Cursor.
      await page.locator('#calendar-picker-ok').click();
      await expect(page.locator(PICKER)).toBeHidden();
      await expect(editor.locator('.cm-line').last()).toHaveText('@{Dreimond: 1-1-01 EZ}');
    } finally {
      // Dirty Buffer (Einfuegen ohne Speichern) — force-Exit ohne Dialog.
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

// 4T-0747 (Epic 3E-0138): Abgeleitete Zeitrechnung über die Einstellungen
// anlegen. Sie erbt ihre Struktur phasenverschoben vom Bezug; im Entwurf
// sind nur Name, Bezug, Nullpunkt, Tiefe und die Richtungs-Kürzel sichtbar.
// Geprüft werden zusätzlich der Hinweis am Bezug und die Löschsperre.
test.describe('KS-05: Abgeleitete Zeitrechnung anlegen und schützen', () => {
  test('Anlage persistiert, Bezug zeigt Hinweis, Löschen des Bezugs ist gesperrt', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      // Sperr-Meldung stubben (OS-Dialog ist in Playwright nicht bedienbar).
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('calendar:blockedDelete');
        ipcMain.handle('calendar:blockedDelete', () => true);
      });
      await openCalendarSection(page);

      await page.locator('#settings-calsys-block-add').click();
      await page.locator('#settings-calsys-block-name-0').fill('Projekte');
      await page.locator('#settings-calsys-block-open-0').click();
      await page.locator('#settings-calsys-cal-template').click();

      // Ableitung anlegen: Name, Bezug, Nullpunkt (Jahr, Monat, Tag).
      await page.locator('#settings-calsys-derived-add').click();
      await page.locator('#settings-calsys-cal-name-1').fill('Go-Live');
      await page
        .locator('#settings-calsys-derived-base-1')
        .selectOption({ label: 'Gregorianischer Kalender' });
      await page.locator('#settings-calsys-derived-zero-1-0').fill('2028');
      await page.locator('#settings-calsys-derived-zero-1-1').fill('7');
      await page.locator('#settings-calsys-derived-zero-1-2').fill('1');
      await page.locator('#settings-calsys-derived-before-1').fill('vor GL');

      // Vorschau: Der Nullpunkt ist 0-0-1 (Zählung vom Nullpunkt weg), die
      // Rückschau nennt das Bezugs-Datum. Der Beispiel-Wert steht nach der
      // Bezugs-Wahl bereits auf dem Nullpunkt.
      const preview = page.locator('#settings-calsys-preview-1');
      await expect(page.locator('#settings-calsys-preview-input-1')).toHaveValue('0-0-1');
      await expect(preview).toContainText('Kanonisch: 0-0-1');
      await expect(preview).toContainText('Spanne: 1 Tag');
      await expect(preview).toContainText('Gregorianischer Kalender: 2028-07-01');
      // Rückwärts zählt spiegelbildlich: 15 Tage vor dem Nullpunkt.
      await page.locator('#settings-calsys-preview-input-1').fill('0-0-15 vor GL');
      await expect(preview).toContainText('Gregorianischer Kalender: 2028-06-16');
      await expect(page.locator('#settings-calsys-cal-invalid-1')).toBeHidden();

      // Der Bezug weist auf seine Abhängige hin.
      await expect(page.locator('#settings-calsys-cal-dependents-0')).toContainText('Go-Live');

      // Anwenden persistiert die kurze Form (Bezug und Nullpunkt, keine
      // Abschrift der Ebenen).
      await page.locator('#btn-settings-apply').click();
      const mddaPath = path.join(areaRoot, 'Area_Settings.mdda');
      await expect
        .poll(() => {
          try {
            const parsed = JSON.parse(fs.readFileSync(mddaPath, 'utf8'));
            const cal = parsed.settings.calendarSystems.blocks[0].calendars[1];
            return cal ? `${cal.derivedFrom}/${cal.zero.join('-')}/${cal.levels ? 'x' : '-'}` : '?';
          } catch {
            return 'keine Datei';
          }
        })
        .toBe('gregorianischer-kalender/2028-7-1/-');

      // Löschsperre: Der Bezug bleibt trotz Klick auf Entfernen bestehen.
      await page.locator('#settings-calsys-cal-remove-0').click();
      await expect(page.locator('#settings-calsys-cal-name-0')).toHaveValue(
        'Gregorianischer Kalender',
      );
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

// 4T-0748 (Epic 3E-0138): Der Wert einer abgeleiteten Zeitrechnung erscheint
// als Zeitspanne; der Kurzhinweis nennt kanonischen Wert und Bezugs-Datum.
// Der Picker arbeitet in der Notation des Bezugs (Entscheidung 2a): sein
// Gitter zeigt den gregorianischen Monat, uebernommen wird die Zaehlung.
test.describe('KS-06: Zeitspanne im Dokument und Picker in Bezugs-Notation', () => {
  test('Badge zeigt die Spanne, Kurzhinweis den Bezug, Picker liefert die Zaehlung', async () => {
    const { areaRoot } = makeDerivedArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openDocFromAreaPanel(page, 'spanne.md');
      await enterEdit(app, page, 'live');

      const badges = page.locator('.cm-live-calendar-badge');
      await expect(badges.first()).toHaveText('1 Monat, 2 Wochen, 4 Tage');
      await expect(badges.nth(1)).toHaveText('2 Wochen, 1 Tag vor Haus');
      await expect(badges.first()).toHaveAttribute(
        'title',
        'Hausbau: 0-1-18\nGregorianischer Kalender: 2023-04-14',
      );

      // Klick oeffnet den Picker; sein Gitter steht im Bezug, also auf dem
      // 14. April 2023, nicht auf einer Zaehlung.
      await badges.first().click();
      await expect(page.locator(PICKER)).toBeVisible();
      await expect(page.locator(`${PICKER} .calendar-picker-day.selected`)).toHaveText('14');
      await expect(page.locator('#calendar-picker-unit-label')).toHaveText('April 2023');

      // Ein anderer Tag desselben Monats ersetzt den Wert in der Zaehlung.
      await page
        .locator(`${PICKER} .calendar-picker-day:not(.other-month)`, { hasText: /^15$/ })
        .click();
      await page.locator('#calendar-picker-ok').click();
      await expect(page.locator(PICKER)).toBeHidden();
      await expect(page.locator(SEL.editorContent0)).toContainText('@{Hausbau: 0-1-19}');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});
