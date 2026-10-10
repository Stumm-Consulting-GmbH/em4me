// 4T-000544 (Epic 3E-000097): E2E-Funktions-Suite Kalender-Systeme —
// Einstellungs-Sektion der calendarSystems-Sektion der Bereichsdatei.
// KS-01: Kern-Durchlauf (Block anlegen → gregorianische Vorlage einfügen →
// Anwenden persistiert in die MDDA → Neustart-simuliertes Nachladen zeigt
// den Stand). KS-02: ohne Bereich zeigt die Sektion den Hinweis-Zustand.
// 4T-000546 (Epic 3E-000097): Wert-Syntax @{Kalendername: Wert} im Dokument.
// KS-03: Live-Badge mit Namens-Anzeige, Klick öffnet den vorbelegten
// Picker (Esc lässt unverändert, anderer Tag ersetzt an Ort und Stelle in
// kanonischer Form — Rundreise-Sicherheit); KS-04: Einfüge-Kommando per
// belegtem Kürzel schreibt den kanonischen Wert am Cursor (4T-000545:
// gemeinsamer Durchlauf Einfügen → Klick → Ändern deckt die Picker-API ab).
// 4T-001874 (Epic 3E-000323): KS-10: Dialog «Datum umrechnen» per belegtem
// Kürzel in einem Block mit gregorianischer und julianischer Vorlage — Liste
// «Entspricht», Meldung bei ungültigem Datum, Wechsel des Ausgangspunkts per
// Tastatur in beide Richtungen, Hinweis zur Block-Grenze, Escape ohne Änderung;
// 4T-002097: ohne Bearbeiten-Modus ist «Einfügen» deaktiviert, ausgewählter
// Text ist das Quelldatum, «Kopieren» füllt die Zwischenablage, «Einfügen»
// ersetzt die Auswahl (ein Rückgängig-Schritt) und eine Teil-Auswahl im
// Kalender-Datum das ganze Datum.
// describe-Titel tragen die Matrix-IDs (test/abdeckungs-matrix.json).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');

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

// 4T-000748 (Epic 3E-000138): Bereich mit einer abgeleiteten Zeitrechnung auf
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

// 4T-001863 (Epic 3E-000307): Bereich mit einer selbst definierten Zeitrechnung,
// deren Ebenen, Woche und Quartal Einzahl und Mehrzahl tragen, einer Ableitung
// darauf und einem Dokument mit zwei Werten (Mehrzahl und Einzahl).
function makePluralArea() {
  const areaRoot = makeArea();
  const config = {
    blocks: [
      {
        id: 'welt',
        name: 'Welt',
        calendars: [
          {
            id: 'eigen',
            name: 'Eigen',
            levels: [
              { id: 'tag', name: 'Tag', namePlural: 'Tage', section: 'Datum', start: 1 },
              {
                id: 'monat',
                name: 'Monat',
                namePlural: 'Monate',
                section: 'Datum',
                start: 1,
                rel: { type: 'factor', count: 30 },
              },
              {
                id: 'jahr',
                name: 'Jahr',
                namePlural: 'Jahre',
                section: 'Datum',
                start: 1,
                rel: { type: 'factor', count: 12 },
              },
            ],
            cycles: [{ id: 'woche', name: 'Woche', namePlural: 'Wochen', of: 'tag', length: 6 }],
            groups: [
              { id: 'quartal', name: 'Quartal', namePlural: 'Quartale', of: 'monat', size: 3 },
            ],
          },
          { id: 'bauzeit', name: 'Bauzeit', derivedFrom: 'eigen', zero: [10, 1, 1] },
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
    path.join(areaRoot, 'mehrzahl.md'),
    '# Mehrzahl\n\nStand @{Bauzeit: 0-2-16} und später @{Bauzeit: 1-0-1}.\n',
    'utf8',
  );
  return { areaRoot };
}

// 4T-002003 (Epic 3E-000307): Bereich mit einer selbst definierten Zeitrechnung
// «Herrscher» (Tag, Monat zu 30 Tagen, Jahr zu 12 Monaten; Epochen Frühzeit,
// Mittelzeit, Neuzeit ab dem internen Jahr 20), zwei Dokumenten und einer
// Notiz. Nachgetragen wird im Fall die Spätzeit ab dem internen Jahr 40, also
// ab Neuzeit-Jahr 21. Betroffen sind fünf Werte in zwei Dokumenten: im ersten
// einer vor der neuen Grenze ohne Kürzel («6-03-07»), einer danach ohne Kürzel
// («25-02-03») und einer danach mit dem Kürzel der bisherigen Epoche
// («21-01-01 NZ»); im zweiten einer vor der Grenze, dazu einer in dessen
// Notiz. Der Wert mit «MZ» gehört einer früheren Epoche und bleibt, wie er ist.
function makeEpochGuardArea() {
  const areaRoot = makeArea();
  const config = {
    blocks: [
      {
        id: 'welt',
        name: 'Welt',
        calendars: [
          {
            id: 'herrscher',
            name: 'Herrscher',
            levels: [
              { id: 'tag', name: 'Tag', section: 'Datum', start: 1 },
              {
                id: 'monat',
                name: 'Monat',
                section: 'Datum',
                start: 1,
                rel: { type: 'factor', count: 30 },
              },
              {
                id: 'jahr',
                name: 'Jahr',
                section: 'Datum',
                start: 1,
                rel: { type: 'factor', count: 12 },
              },
            ],
            epochs: [
              { name: 'Frühzeit', abbr: 'FZ', start: null },
              { name: 'Mittelzeit', abbr: 'MZ', start: [10, 1, 1] },
              { name: 'Neuzeit', abbr: 'NZ', start: [20, 1, 1] },
            ],
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
  const erstes = path.join(areaRoot, 'erstes.md');
  const zweites = path.join(areaRoot, 'zweites.md');
  fs.writeFileSync(
    erstes,
    '# Erstes\n\nKrönung @{Herrscher: 6-03-07}, Gründung @{Herrscher: 25-02-03}, Wende @{Herrscher: 21-01-01 NZ}.\n',
    'utf8',
  );
  fs.writeFileSync(
    zweites,
    '# Zweites\n\nFrüher @{Herrscher: 2-01-01 MZ} und später @{Herrscher: 8-12-30}.\n',
    'utf8',
  );
  // Notiz in der Begleit-Datei des zweiten Dokuments (Form wie notizen-panel.spec.js).
  fs.writeFileSync(
    path.join(areaRoot, 'zweites.mdd'),
    JSON.stringify(
      {
        schemaVersion: 1,
        history: { anchors: [], packets: [] },
        notes: { text: 'Notiz @{Herrscher: 6-03-07}', updated: '2026-10-01T00:00:00Z' },
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  return { areaRoot, erstes, zweites };
}

async function sendMenuChannel(app, channel, ...args) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Test-Dokument aus dem Bereichs-Panel öffnen: openAreaPath setzt die Tabs
// des Fensters zurück, deshalb wird die Datei NACH dem Binden geöffnet.
// 4T-001775 (Epic 3E-000304): Die Dateiliste beschriftet ohne Markdown-Endung.
// Der Aufrufer nennt weiterhin den Dateinamen; gesucht wird die Beschriftung,
// und zwar exakt (ein Teilstring traefe auch einen laengeren Namen).
const ohneEndung = (name) => name.replace(/\.(md|markdown|mdown|mkd)$/i, '');

async function openDocFromAreaPanel(page, name) {
  await page
    .locator('.area-file-row', { hasText: new RegExp(`^${ohneEndung(name)}$`) })
    .first()
    .click();
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
  // 4T-000876: Oeffnen UND Klicken gehoeren in dieselbe Wiederhol-Bedingung.
  // Zwei Fehlerbilder treffen hier zusammen, und jede Haelfte allein laesst
  // das andere offen: Ein Tastendruck in JEDEM Durchlauf montiert die Seite
  // neu, waehrend der Poll ihre Sichtbarkeit gerade bejaht hat (der Klick
  // danach trifft ins Leere); ein Tastendruck NUR bei Unsichtbarkeit nimmt
  // dem Poll dagegen die Selbstheilung, wenn die Seite nach der Pruefung
  // ihren aktiven Reiter verliert und dauerhaft verborgen bleibt. Beides
  // zeigt sich als «element is not visible» bei aufgeloestem Locator.
  // Deshalb: oeffnen, solange verborgen — klicken, sobald sichtbar — und bei
  // einem gescheiterten Klick von vorn. Der Klick selbst ist idempotent
  // (Sektion aktivieren) und darf wiederholt werden.
  await expect
    .poll(async () => {
      if (!(await navEntry.isVisible())) {
        await page.keyboard.press('Control+,');
        return false;
      }
      try {
        await navEntry.click({ timeout: 2000 });
        return true;
      } catch {
        return false;
      }
    })
    .toBe(true);
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
      // 4T-001997 (Epic 3E-000307): Die Vorlage kommt seither aus dem
      // Aufklapp-Menü an der Stelle des früheren Knopfes.
      await page.locator('#settings-calsys-block-open-0').click();
      await page.locator('#settings-calsys-cal-template').selectOption('gregorian');
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

// 4T-000555 (Epic 3E-000100): Ohne gebundenen Bereich erscheint die Sektion
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

// 4T-000747 (Epic 3E-000138): Abgeleitete Zeitrechnung über die Einstellungen
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
      await hauptSenden(app, ({ ipcMain }) => {
        ipcMain.removeHandler('calendar:blockedDelete');
        ipcMain.handle('calendar:blockedDelete', () => true);
      });
      await openCalendarSection(page);

      await page.locator('#settings-calsys-block-add').click();
      await page.locator('#settings-calsys-block-name-0').fill('Projekte');
      await page.locator('#settings-calsys-block-open-0').click();
      await page.locator('#settings-calsys-cal-template').selectOption('gregorian');

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

// 4T-000748 (Epic 3E-000138): Der Wert einer abgeleiteten Zeitrechnung erscheint
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

// 4T-000943 (Epic 3E-000197): Der Kalender-Wert trug denselben Ausschluss der
// aktiven Zeile wie die ISO-Datums-Werte — steht der Cursor in der Zeile,
// war der Wert dort weder dekoriert noch erreichbar. Entscheidung des
// Product Owners vom 2026-09-01 (E2 im Epic): beide Wert-Arten bekommen den
// Zugang, damit zwischen ihnen keine Ungleichheit entsteht.
test.describe('KS-07: Zugang in der Zeile mit dem Cursor (4T-000943)', () => {
  test('einfacher Klick setzt den Cursor, Strg-Klick oeffnet den vorbelegten Picker', async () => {
    const { areaRoot } = makeCalendarArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openDocFromAreaPanel(page, 'werte.md');
      await enterEdit(app, page, 'live');

      // Ausgangslage: der Wert erscheint als Badge, die Zeile ist nicht aktiv.
      const badge = page.locator('.cm-live-calendar-badge');
      await expect(badge).toHaveText('500-Mittmond-09 ZZ');

      // Cursor in die Wert-Zeile setzen, ohne den Wert selbst zu treffen.
      const zeile = page.locator('.cm-line', { hasText: 'Ein Wert' });
      await zeile.click({ position: { x: 4, y: 6 } });
      await expect(page.locator(PICKER)).toBeHidden();

      // Die aktive Zeile zeigt Roh-Text; der Wert bleibt dort dekoriert.
      const wert = zeile.locator('.cm-live-calendar-value');
      await expect(wert).toBeVisible({ timeout: 15000 });

      await wert.click();
      await expect(page.locator(PICKER)).toBeHidden();

      await wert.click({ modifiers: ['Control'] });
      await expect(page.locator(PICKER)).toBeVisible();
      await expect(page.locator(`${PICKER} .calendar-picker-day.selected`)).toHaveText('9');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

// 4T-001863 (Epic 3E-000307): Auf einer selbst definierten Zeitrechnung zeigte
// das Abzeichen «2 Monat, 2 Woche, 4 Tag»; mit gepflegter Mehrzahl steht bei
// mehr als einer Einheit die Mehrzahl, bei genau einer die Einzahl.
test.describe('KS-08: Mehrzahl im Abzeichen einer selbst definierten Zeitrechnung', () => {
  test('Abzeichen zeigt Mehrzahl bei mehreren und Einzahl bei einer Einheit', async () => {
    const { areaRoot } = makePluralArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openDocFromAreaPanel(page, 'mehrzahl.md');
      await enterEdit(app, page, 'live');

      const badges = page.locator('.cm-live-calendar-badge');
      await expect(badges.first()).toHaveText('2 Monate, 2 Wochen, 4 Tage');
      await expect(badges.nth(1)).toHaveText('1 Jahr, 1 Tag');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

// 4T-002003 (Epic 3E-000307): Wer einer Zeitrechnung eine neue jüngste Epoche
// gibt, bekommt vor dem Speichern die Rückfrage; mit «sichern» schreibt das
// Programm jeden betroffenen Wert so um, dass er denselben Tag bezeichnet
// (Plan-Änderung vom 2026-10-01, «alle umschreiben»): vor der neuen Grenze mit
// dem Kürzel der bisherigen Epoche, ab ihr in der Jahreszählung der neuen —
// in beiden Dokumenten und in der Notiz.
//
// «Derselbe Tag» in der Lese-Ansicht heißt: Das Abzeichen zeigt die
// Schreibweise, unter der die NEUE Definition dieselben internen Koordinaten
// liest wie die alte unter der bisherigen. Die erwarteten Schreibweisen sind am
// geteilten Modul nachgerechnet (parseCanonical der alten gegen die neue
// Schreibweise ergibt dasselbe Tupel): «6-03-07» → «6-03-07 NZ», «25-02-03» →
// «5-02-03», «21-01-01 NZ» → «1-01-01». Ungesichert läse das Programm
// «6-03-07» und «25-02-03» als Spätzeit-Jahre, und «21-01-01 NZ» wäre ungültig.
test.describe('KS-09: Nachtragen einer Epoche sichert gespeicherte Werte', () => {
  test('Rückfrage mit sichern: Werte beiderseits der Grenze umgeschrieben, die Lese-Ansicht zeigt denselben Tag', async () => {
    const { areaRoot, erstes, zweites } = makeEpochGuardArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      // Rückfrage ersetzen (OS-Dialog ist in Playwright nicht bedienbar, Muster
      // KS-05): Sie hält die Angaben fest und antwortet «sichern».
      await hauptSenden(app, ({ ipcMain }) => {
        ipcMain.removeHandler('calendar:confirmEpochGuard');
        ipcMain.handle('calendar:confirmEpochGuard', (_event, daten) => {
          globalThis.__ks09Rueckfrage = daten;
          return 'sichern';
        });
      });

      // Vorher: Die Werte der jüngsten Epoche stehen in der Lese-Ansicht ohne
      // Kürzel, auch der, der es im Dokument trägt.
      await openDocFromAreaPanel(page, 'erstes.md');
      await expect
        .poll(async () => {
          await sendMenuChannel(app, 'menu:viewChange', 'rendered');
          return page.locator(SEL.markdownBody0).isVisible();
        })
        .toBe(true);
      const wert = page.locator(`${SEL.markdownBody0} .calendar-value`);
      await expect(wert).toHaveText(['6-03-07', '25-02-03', '21-01-01']);
      await expect(wert.first()).toHaveAttribute('title', 'Herrscher: 6-03-07');

      // Epoche «Spätzeit» ab dem internen Jahr 40 nachtragen und anwenden.
      await openCalendarSection(page);
      await page.locator('#settings-calsys-block-open-0').click();
      await page.locator('#settings-calsys-epoch-add-0').click();
      await page.locator('#settings-calsys-epoch-0-3-name').fill('Spätzeit');
      await page.locator('#settings-calsys-epoch-0-3-abbr').fill('SZ');
      await page.locator('#settings-calsys-epoch-0-3-start-0').fill('40');
      await page.locator('#settings-calsys-epoch-0-3-start-1').fill('1');
      await page.locator('#settings-calsys-epoch-0-3-start-2').fill('1');
      await page.locator('#btn-settings-apply').click();

      // Der Bericht folgt dem Schreiben; er nennt das Ergebnis und wird bestätigt.
      await expect(page.locator('#link-report-modal')).toBeVisible();
      await expect(page.locator('#link-report-title')).toHaveText('Gesicherte Datums-Werte');
      await page.locator('#btn-link-report-ok').click();
      await expect(page.locator('#link-report-modal')).toBeHidden();

      // Die Rückfrage kam mit den Zahlen für die Zeitrechnung «Herrscher»:
      // Dokument-Stellen plus Notiz-Stellen, die Notiz zählt zu ihrem Dokument.
      const rueckfrage = await hauptLesen(app, () => globalThis.__ks09Rueckfrage);
      expect(rueckfrage).toEqual({
        eintraege: [{ name: 'Herrscher', werte: 5, dokumente: 2 }],
        zaehlbar: true,
      });

      // Platte: die Definition trägt vier Epochen; vor der Grenze tragen die
      // Werte das Kürzel der Neuzeit, ab ihr die Jahreszählung der Spätzeit; der
      // Wert der Mittelzeit ist unverändert.
      const mddaPath = path.join(areaRoot, 'Area_Settings.mdda');
      await expect
        .poll(() => {
          try {
            const parsed = JSON.parse(fs.readFileSync(mddaPath, 'utf8'));
            return parsed.settings.calendarSystems.blocks[0].calendars[0].epochs.length;
          } catch {
            return 0;
          }
        })
        .toBe(4);
      await expect
        .poll(() => fs.readFileSync(erstes, 'utf8'))
        .toBe(
          '# Erstes\n\nKrönung @{Herrscher: 6-03-07 NZ}, Gründung @{Herrscher: 5-02-03}, Wende @{Herrscher: 1-01-01}.\n',
        );
      await expect
        .poll(() => fs.readFileSync(zweites, 'utf8'))
        .toBe(
          '# Zweites\n\nFrüher @{Herrscher: 2-01-01 MZ} und später @{Herrscher: 8-12-30 NZ}.\n',
        );
      await expect
        .poll(() => {
          try {
            const mdd = JSON.parse(fs.readFileSync(path.join(areaRoot, 'zweites.mdd'), 'utf8'));
            return mdd.notes.text;
          } catch {
            return null;
          }
        })
        .toBe('Notiz @{Herrscher: 6-03-07 NZ}');

      // Nachher: Einstellungen schließen; das offene Dokument hat den neuen
      // Stand nachgeladen, und die Lese-Ansicht zeigt für alle drei Werte
      // denselben Tag wie vorher, in der Schreibweise der neuen Definition.
      await page.locator('#btn-settings-ok').click();
      await expect
        .poll(async () => {
          await sendMenuChannel(app, 'menu:viewChange', 'rendered');
          return page.locator(SEL.markdownBody0).isVisible();
        })
        .toBe(true);
      await expect(wert).toHaveText(['6-03-07 NZ', '5-02-03', '1-01-01']);
      await expect(wert.first()).toHaveAttribute('title', 'Herrscher: 6-03-07 NZ');
      await expect(page.locator(`${SEL.markdownBody0} .calendar-value-invalid`)).toHaveCount(0);
      await expect(page.locator(`${SEL.markdownBody0} .calendar-value-unknown`)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

// 4T-001874 (Epic 3E-000323): Der Dialog «Datum umrechnen» zeigt einen Zeitpunkt
// in den übrigen Kalendern desselben Blocks; geschrieben wird nur über seine
// Tasten «Kopieren» und «Einfügen» (4T-002097). Der Block
// entsteht wie in KS-01 über die Einstellungen, mit zwei Einträgen des
// Aufklapp-Menüs «Vorlage einfügen …». Die Erwartungswerte sind am Kern
// gemessen (blockEquivalents mit beiden Vorlagen): gregorianisch 2026-10-03 ist
// julianisch 2026-09-20. Die Zeilen zeigen den Wert mit Monatsnamen; geprüft
// werden Jahr und Tag, der Monat bleibt frei. Das Feld trägt die kanonische
// Schreibweise und wird genau verglichen.
test.describe('KS-10: Datum umrechnen (S-159)', () => {
  test('Kürzel öffnet den Dialog, Entsprechung im Block, Wechsel per Tastatur, Escape ändert nichts, Auswahl als Quelle, Kopieren und Einfügen', async () => {
    const areaRoot = makeArea();
    const docText =
      '# Notiz\n\nKein Datum in dieser Zeile.\n\n2026-10-03\n\nAm @{Gregorianischer Kalender: 2026-10-03} war es.\n';
    const docPath = path.join(areaRoot, 'notiz.md');
    fs.writeFileSync(docPath, docText, 'utf8');
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-kalender-profile-'));
    fs.writeFileSync(
      path.join(userDataDir, 'config.json'),
      JSON.stringify({ hotkeys: { 'calendar.convert': 'Ctrl+Alt+9' } }),
      'utf8',
    );
    const { app, page, userData } = await launchApp({ userData: userDataDir });
    try {
      await bindArea(page, areaRoot);

      // Block mit zwei mitgelieferten Vorlagen anlegen und anwenden (KS-01).
      await openCalendarSection(page);
      const addBlock = page.locator('#settings-calsys-block-add');
      await expect(addBlock).toBeVisible();
      await addBlock.click();
      await page.locator('#settings-calsys-block-name-0').fill('Welt');
      await page.locator('#settings-calsys-block-open-0').click();
      await page.locator('#settings-calsys-cal-template').selectOption('gregorian');
      await expect(page.locator('#settings-calsys-cal-name-0')).toHaveValue(
        'Gregorianischer Kalender',
      );
      await page.locator('#settings-calsys-cal-template').selectOption('julian');
      await expect(page.locator('#settings-calsys-cal-name-1')).toHaveValue(
        'Julianischer Kalender',
      );
      await page.locator('#btn-settings-apply').click();
      const mddaPath = path.join(areaRoot, 'Area_Settings.mdda');
      await expect
        .poll(() => {
          try {
            const parsed = JSON.parse(fs.readFileSync(mddaPath, 'utf8'));
            const block = parsed.settings.calendarSystems.blocks[0];
            return block.calendars.map((c) => c.name).join(' | ');
          } catch {
            return 'keine Datei';
          }
        })
        .toBe('Gregorianischer Kalender | Julianischer Kalender');
      await page.locator('#btn-settings-ok').click();

      // Dokument öffnen; der Cursor steht auf keinem Wert, also ohne Vorbelegung.
      await openDocFromAreaPanel(page, 'notiz.md');
      await enterEdit(app, page, 'source');
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+Home');

      // 1. Kürzel drücken, bis der Dialog offen ist (Dispatcher erst nach init).
      const dialog = page.locator('.calendar-convert-modal');
      const oeffneDialog = () =>
        expect
          .poll(async () => {
            if (await dialog.isVisible()) return true;
            await page.keyboard.press('Control+Alt+9');
            return dialog.isVisible();
          })
          .toBe(true);
      await oeffneDialog();
      await expect(page.locator('#calendar-convert-title')).toHaveText('Datum umrechnen');
      const feld = page.locator('#calendar-convert-date');
      await expect(feld).toBeFocused();
      // Ein Block: keine Block-Auswahl.
      await expect(page.locator('#calendar-convert-block')).toHaveCount(0);

      // 2. Gregorianisch als Ausgangspunkt, Datum eintragen.
      const kalenderWahl = page.locator('#calendar-convert-calendar option:checked');
      await expect(kalenderWahl).toHaveText('Gregorianischer Kalender');
      await feld.fill('2026-10-03');
      const zeilen = page.locator('#calendar-convert-list .calendar-convert-entry');
      await expect(zeilen).toHaveCount(1);
      const julianisch = zeilen.filter({ hasText: 'Julianischer Kalender' });
      await expect(julianisch).toHaveText(/^Julianischer Kalender: 2026-[^-]+-20$/);
      await expect(page.locator('#calendar-convert-invalid')).toBeHidden();

      // 3. Ungültiges Datum: Meldung, keine Zeilen-Knöpfe.
      await feld.fill('2026-13-40');
      await expect(page.locator('#calendar-convert-invalid')).toBeVisible();
      await expect(page.locator('#calendar-convert-invalid')).toHaveText(
        'Kein gültiges Datum dieses Kalenders.',
      );
      await expect(zeilen).toHaveCount(0);

      // 4. Wieder gültig; die julianische Zeile per Tastatur auslösen.
      await feld.fill('2026-10-03');
      await expect(page.locator('#calendar-convert-invalid')).toBeHidden();
      await julianisch.focus();
      await expect(julianisch).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(kalenderWahl).toHaveText('Julianischer Kalender');
      await expect(feld).toHaveValue('2026-09-20');
      await expect(feld).toBeFocused();
      await expect(zeilen).toHaveCount(1);
      await expect(zeilen.first()).toHaveText(/^Gregorianischer Kalender: 2026-[^-]+-03$/);

      // 5. Die ständige Hinweis-Zeile zur Block-Grenze.
      await expect(page.locator('.calendar-convert-hint')).toBeVisible();
      await expect(page.locator('.calendar-convert-hint')).toContainText(
        'keine gemeinsame Zeit-Achse',
      );

      // 6. Escape schließt; das Dokument bleibt unverändert.
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      await expect(editor).toContainText('Kein Datum in dieser Zeile.');
      expect(fs.readFileSync(docPath, 'utf8')).toBe(docText);

      // 7. 4T-002097: ohne Bearbeiten-Modus ist «Einfügen» deaktiviert und nennt
      // den Grund; «Kopieren» bleibt möglich.
      const bearbeiten = page.locator(SEL.btnEdit);
      const quelltext = page.locator('.pane-group[data-pane="0"] .pane-source-editor');
      await bearbeiten.click();
      await expect(quelltext).toHaveClass(/read-only/);
      await oeffneDialog();
      const julZeile = page.locator('.calendar-convert-item', { hasText: 'Julianischer Kalender' });
      await expect(julZeile.locator('.calendar-convert-insert')).toBeDisabled();
      await expect(julZeile.locator('.calendar-convert-insert')).toHaveAttribute(
        'title',
        'Einfügen ist nur in einem Dokument im Bearbeiten-Modus möglich.',
      );
      await expect(julZeile.locator('.calendar-convert-copy')).toBeEnabled();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await bearbeiten.click();
      await expect(quelltext).not.toHaveClass(/read-only/);

      // 8. Ausgewählter Text ist das Quelldatum.
      await editor
        .locator('.cm-line', { hasText: /^2026-10-03$/ })
        .click({ position: { x: 4, y: 6 } });
      await page.keyboard.press('End');
      await page.keyboard.press('Shift+Home');
      await oeffneDialog();
      await expect(kalenderWahl).toHaveText('Gregorianischer Kalender');
      await expect(feld).toHaveValue('2026-10-03');

      // 9. «Kopieren» bestätigt, der Dialog bleibt offen, die Zwischenablage
      // trägt die Dokument-Form (Lesen wie editor-kontextmenue.spec.js).
      const kopieren = julZeile.locator('.calendar-convert-copy');
      await kopieren.click();
      await expect(kopieren).toHaveText('Kopiert');
      await expect(dialog).toBeVisible();
      await expect
        .poll(() => hauptLesen(app, ({ clipboard }) => clipboard.readText()))
        .toBe('@{Julianischer Kalender: 2026-09-20}');

      // 10. «Einfügen» ersetzt die Auswahl und schließt; ein Rückgängig stellt
      // den Text wieder her.
      await julZeile.locator('.calendar-convert-insert').click();
      await expect(dialog).toHaveCount(0);
      const datumsZeile = editor.locator('.cm-line').nth(4);
      await expect(datumsZeile).toHaveText('@{Julianischer Kalender: 2026-09-20}');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
      await page.keyboard.press('Control+z');
      await expect(datumsZeile).toHaveText('2026-10-03');

      // 11. Teil-Auswahl im Kalender-Datum (nur «10-03» des Werts): ersetzt wird
      // das ganze Datum, kein verschachteltes.
      // Klick an den Zeilen-Anfang: Ein Klick auf das Datum öffnete die
      // Eingabe-Hilfe (KS-07). Danach vom Zeilen-Ende vor die schließende Klammer.
      const satz = editor.locator('.cm-line', { hasText: 'war es.' });
      await satz.click({ position: { x: 4, y: 6 } });
      await page.keyboard.press('End');
      for (let i = 0; i <= ' war es.'.length; i++) await page.keyboard.press('ArrowLeft');
      for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');
      await oeffneDialog();
      await expect(feld).toHaveValue('2026-10-03');
      await julZeile.locator('.calendar-convert-insert').click();
      await expect(dialog).toHaveCount(0);
      await expect(satz).toHaveText('Am @{Julianischer Kalender: 2026-09-20} war es.');
    } finally {
      // Dirty Buffer (Einfügen ohne Speichern) — force-Exit ohne Dialog.
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});
