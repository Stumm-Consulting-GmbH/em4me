// 4T-000526/4T-000527/4T-000528 (Epic 3E-000095): E2E-Funktions-Suite Erinnerungen.
//
// Das Erinnerungs-System meldet fällige ⏰-Anker auf Aufgaben-Zeilen der
// GEÖFFNETEN Bereiche. Die Specs binden die App per area:openPath an einen
// Bereichs-Fixture-Ordner (Muster bereiche.spec.js) und prüfen die
// nutzer-sichtbare Kette: Nachhol-Dialog, Erledigt, Später-erinnern (Snooze),
// Muten und Wiederauslösung, Panel-Gruppen sowie das Setzen-Kommando.
//
// ER-01: App mit Bereich → Nachhol-Dialog (catchUpTitle) mit den überfälligen
//        Ankern; der 2099-Anker ist NICHT dabei.
// ER-02: „Erledigt" im Dialog → Quelldatei-Zeile wird [x] (fs-Prüfung),
//        Eintrag verschwindet.
// ER-03: „Später erinnern" → „1 Stunde" → neuer ⏰-Wert in der Quelldatei
//        (nicht mehr der alte 2020-Wert), Eintrag verschwindet.
// ER-04: Escape mutet → Panel zeigt den Eintrag mit Klasse `muted` in der
//        Überfällig-Gruppe → 🔔 löst den Dialog erneut aus.
// ER-05: Panel-Gruppen Überfällig (2020) und Später (2099); Klick auf den
//        Haupt-Button öffnet die Quelldatei.
// ER-06: Kommando Strg+Alt+R auf einer Checkbox-Zeile im Quelltext-Edit-Modus
//        → Picker → bestätigen → Zeile trägt den ⏰-Marker.
// ER-07: Aus-Zustand (extensions.disabled ['reminders']) → trotz überfälligem
//        Anker kein Dialog; Statusbar-Button toggelt kein Panel.
// ER-08: Panel im Bereich OHNE offene Datei → Statusbar-Button blendet die
//        Sektion trotz Empty-State ein (bereichsweit, PO-Testbefund).
//
// Datums-Bezug: ausschließlich weit vergangene (2020) und weit zukünftige
// (2099) Fixture-Daten, nie der Kalendertag des Laufs (Stabilitätsregel 9);
// die Snooze-Werte (jetzt + Dauer) werden nur über Format-Regex und die
// Abwesenheit des alten 2020-Werts geprüft, nicht auf einen konkreten Wert.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const REMINDER = '⏰'; // Wecker-Marker
const REMINDER_VALUE_RE = /⏰ \d{4}-\d{2}-\d{2} \d{2}:\d{2}/;

const MODAL = '#reminders-modal';
const MODAL_TITLE = '#reminders-modal-title';
const MODAL_LIST = '#reminders-modal-list';
const CLOSE_BTN = '#btn-reminders-close';
const PICKER = '#date-picker-popup';

// --- Bereichs-Fixture --------------------------------------------------------------

// Bereichs-Ordner mit zwei Dateien: überfällige Anker (2020, mit und ohne
// Uhrzeit) und ein Zukunfts-Anker (2099). Anker-Beschreibungen ASCII-safe,
// damit die Text-Assertions unabhängig vom Konsolen-Encoding greifen.
function makeAreaDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-reminders-'));
  fs.writeFileSync(
    path.join(dir, 'overdue.md'),
    [
      '# Erinnerungen',
      '',
      `- [ ] Rueckruf Kunde ${REMINDER} 2020-01-01 08:00`,
      `- [ ] Bericht abgeben ${REMINDER} 2020-03-15`,
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'future.md'),
    ['# Zukunft', '', `- [ ] Jahresabschluss ${REMINDER} 2099-12-31 09:00`, ''].join('\n'),
    'utf8',
  );
  return dir;
}

function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-reminders-prof-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
  }
}

// Bereich an die (leere) App binden; der Erinnerungs-Prüfer überwacht danach
// den Bereichs-Index und liefert die fälligen Anker an dieses Fenster.
async function bindArea(page, dir) {
  await page.evaluate((p) => window.api.openAreaPath(p), dir);
  await expect.poll(() => page.title()).toContain(`(Bereich ${path.basename(dir)})`);
}

// Datei über den Main-Kanal in das Bereichs-Fenster öffnen (Muster BE-08).
// Ein offener Tab ist Voraussetzung für die Panel-Sichtbarkeit (isAllEmpty).
async function openFileInArea(app, page, filePath) {
  await app.evaluate(({ BrowserWindow }, p) => {
    BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [p]);
  }, filePath);
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// --- ER-01: Nachhol-Dialog ---------------------------------------------------------

test.describe('ER-01: Erinnerungen — Nachhol-Dialog beim Öffnen eines Bereichs', () => {
  test('der Dialog trägt den Nachhol-Titel und listet nur die überfälligen Anker', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaDir();
    try {
      await bindArea(page, dir);

      // Der erste Prüf-Lauf nach Index-Aufbau liefert die überfälligen Anker
      // gesammelt (catchUp); ohne Tippen erscheint der Dialog sofort.
      await expect(page.locator(MODAL)).toBeVisible({ timeout: 15000 });
      await expect(page.locator(MODAL_TITLE)).toHaveText('Verpasste Erinnerungen');

      // Genau die beiden 2020-Anker, nicht der 2099-Anker.
      const items = page.locator(`${MODAL_LIST} li`);
      await expect(items).toHaveCount(2);
      await expect(page.locator(MODAL_LIST)).toContainText('Rueckruf Kunde');
      await expect(page.locator(MODAL_LIST)).toContainText('Bericht abgeben');
      await expect(page.locator(MODAL_LIST)).not.toContainText('Jahresabschluss');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

// --- ER-02: Erledigt im Dialog -----------------------------------------------------

test.describe('ER-02: Erinnerungen — „Erledigt" schreibt [x] und entfernt den Eintrag', () => {
  test('der erste Eintrag wird auf der Platte erledigt und verschwindet aus dem Dialog', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaDir();
    const overdue = path.join(dir, 'overdue.md');
    try {
      await bindArea(page, dir);
      await expect(page.locator(MODAL)).toBeVisible({ timeout: 15000 });
      const items = page.locator(`${MODAL_LIST} li`);
      await expect(items).toHaveCount(2);

      // „Erledigt" des ersten Eintrags (Rueckruf, 2020-01-01 08:00) klicken.
      await items.nth(0).locator('button', { hasText: 'Erledigt' }).click();

      // Die Quelldatei trägt Rueckruf als erledigt (Automatik-Datum hängt an).
      await expect
        .poll(() => fs.readFileSync(overdue, 'utf8'), { timeout: 15000 })
        .toMatch(/- \[x\] Rueckruf Kunde/);

      // Der Eintrag verschwindet aus dem Dialog (der zweite bleibt).
      await expect(items).toHaveCount(1);
      await expect(page.locator(MODAL_LIST)).toContainText('Bericht abgeben');
      await expect(page.locator(MODAL_LIST)).not.toContainText('Rueckruf Kunde');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

// --- ER-03: Später erinnern (Snooze) aus dem Dialog --------------------------------

// 4T-000526 (Epic 3E-000095): Snooze AUS DEM DIALOG heraus, zugleich Regressions-
// test für den Stacking-Fix: das Snooze-Kontextmenü (`.context-menu`) muss
// ÜBER dem Erinnerungs-Modal (`.bookmark-modal`, z-index 3000) liegen, sonst
// trifft der Klick auf eine Snooze-Option den verdeckten Schließen-Button des
// Modals (der Befund vor dem z-index-Fix auf 3300). Trifft der Klick die
// Option, ist das Menü sichtbar über dem Modal.
test.describe('ER-03: Erinnerungen — Snooze „1 Stunde" aus dem Dialog schreibt einen neuen ⏰-Wert', () => {
  test('die Snooze-Aktion ersetzt den 2020-Wert der Quell-Zeile durch jetzt + 1 h', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaDir();
    const overdue = path.join(dir, 'overdue.md');
    try {
      await bindArea(page, dir);
      // Dialog abwarten (überfällige Anker als Sammel-Liste). Die Ziel-Datei
      // overdue.md ist NICHT als Tab offen (nur der Bereich gebunden), der
      // Snooze-Schreibweg greift also über den Main auf die Platte (fs-Prüfung).
      await expect(page.locator(MODAL)).toBeVisible({ timeout: 15000 });
      const berichtItem = page.locator(`${MODAL_LIST} li`, { hasText: 'Bericht abgeben' }).first();
      await expect(berichtItem).toBeVisible();

      // „Später erinnern" → Kontextmenü (muss über dem Modal liegen) → „1 Stunde".
      await berichtItem.locator('button', { hasText: 'Später erinnern' }).click();
      await page
        .locator('#context-menu .context-menu-item', { hasText: '1 Stunde' })
        .first()
        .click();

      // Die Bericht-Zeile trägt jetzt einen frischen ⏰-Wert (jetzt + 1 h).
      // Positiv gepollt (bis der Main-Schreibweg vollständig gelandet ist):
      // der alte Wert '⏰ 2020-03-15' hat KEINEN Uhrzeit-Anteil und matcht die
      // Datums-Zeit-Regex nie; erst der Snooze-Wert (mit HH:MM) matcht. Damit
      // ist der Poll robust gegen transiente Teil-Lesungen während des
      // Schreibens und wert-unabhängig (deterministisch ohne Zeit-Mock).
      await expect
        .poll(
          () =>
            fs
              .readFileSync(overdue, 'utf8')
              .split('\n')
              .find((l) => l.includes('Bericht abgeben')) || '',
          { timeout: 15000 },
        )
        .toMatch(REMINDER_VALUE_RE);
      // Nach dem stabilen Endzustand: der alte 2020-Wert ist verschwunden.
      const berichtLine = fs
        .readFileSync(overdue, 'utf8')
        .split('\n')
        .find((l) => l.includes('Bericht abgeben'));
      expect(berichtLine).not.toContain('2020-03-15');

      // Der verschobene Eintrag verschwindet aus dem Dialog (onWritten →
      // removeItem); der zweite überfällige Anker bleibt.
      await expect(page.locator(MODAL_LIST)).not.toContainText('Bericht abgeben');
      await expect(page.locator(MODAL_LIST)).toContainText('Rueckruf Kunde');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

// --- ER-04: Muten und Wiederauslösung über das Panel -------------------------------

test.describe('ER-04: Erinnerungen — Escape mutet, Panel zeigt `muted`, 🔔 löst erneut aus', () => {
  test('gemuteter Eintrag steht in der Überfällig-Gruppe und ist wieder scharf schaltbar', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaDir();
    try {
      await bindArea(page, dir);
      // Erst den Dialog abwarten (Bereich allein, kein Tab), dann muten.
      await expect(page.locator(MODAL)).toBeVisible({ timeout: 15000 });
      await page.keyboard.press('Escape');
      await expect(page.locator(MODAL)).toBeHidden();

      // Für die Panel-Sichtbarkeit muss ein Dokument offen sein (isAllEmpty).
      await openFileInArea(app, page, path.join(dir, 'overdue.md'));

      // Panel über den Statusbar-Button einblenden.
      await page.locator('#btn-reminders').click();
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-reminders');
      await expect(section).toBeVisible();

      // Die gemuteten 2020-Anker erscheinen in der Überfällig-Gruppe mit
      // Klasse `muted`.
      const overdueHeader = section.locator('.reminders-group-header', { hasText: 'Überfällig' });
      await expect(overdueHeader).toBeVisible({ timeout: 15000 });
      const mutedEntries = section.locator('.reminders-entry.muted');
      await expect(mutedEntries.first()).toBeVisible({ timeout: 15000 });

      // 🔔 „Erneut auslösen" schaltet den Anker wieder scharf → der Dialog
      // erscheint erneut (mit einem Puffer für die Tipp-Ruhe nach dem
      // Datei-Öffnen).
      await mutedEntries.first().locator('.reminders-action-btn', { hasText: '🔔' }).click();
      await expect(page.locator(MODAL)).toBeVisible({ timeout: 15000 });
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

// --- ER-05: Panel-Gruppen und Quell-Öffnen -----------------------------------------

test.describe('ER-05: Erinnerungen — Panel-Gruppen Überfällig/Später und Quell-Öffnen', () => {
  test('beide Gruppen sind vorhanden; der Haupt-Button öffnet die Quelldatei', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaDir();
    try {
      await bindArea(page, dir);
      await expect(page.locator(MODAL)).toBeVisible({ timeout: 15000 });
      // Dialog wegklicken (mutet die überfälligen Anker; sie bleiben in der
      // Überfällig-Gruppe des Panels sichtbar).
      await page.locator(CLOSE_BTN).click();
      await expect(page.locator(MODAL)).toBeHidden();

      await openFileInArea(app, page, path.join(dir, 'overdue.md'));
      await page.locator('#btn-reminders').click();
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-reminders');
      await expect(section).toBeVisible();

      // Überfällig-Gruppe (2020-Anker) und Später-Gruppe (2099-Anker).
      await expect(
        section.locator('.reminders-group-header', { hasText: 'Überfällig' }),
      ).toBeVisible({ timeout: 15000 });
      const laterHeader = section.locator('.reminders-group-header', { hasText: 'Später' });
      await expect(laterHeader).toBeVisible({ timeout: 15000 });

      // Haupt-Button des Zukunfts-Eintrags öffnet future.md als Tab.
      const futureEntry = section
        .locator('.reminders-entry', { hasText: 'Jahresabschluss' })
        .first();
      await futureEntry.locator('.reminders-entry-main').click();
      await expect(
        page.locator('.pane-group[data-pane="0"] .tabbar .tab-title', { hasText: 'future.md' }),
      ).toBeVisible({ timeout: 15000 });
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

// --- ER-06: Kommando „Erinnerung setzen" -------------------------------------------

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Quell-Ansicht und Edit-Modus (Muster datums-picker.spec.js: enterEditSource).
async function enterEditSource(app, page) {
  await sendMenuChannel(app, 'menu:viewChange', 'source');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

// Kürzel gedrückt halten, bis der Picker sichtbar ist (Poll-Muster
// openPickerByKey der Datums-Picker-Suite; der globale Dispatcher reagiert
// erst nach dem Renderer-init).
async function openPickerByKey(page) {
  await expect
    .poll(async () => {
      if (await page.locator(PICKER).isVisible()) return true;
      await page.keyboard.press('Control+Alt+r');
      return page.locator(PICKER).isVisible();
    })
    .toBe(true);
}

test.describe('ER-06: Erinnerungen — Kommando Strg+Alt+R setzt den ⏰-Marker', () => {
  test('auf einer Checkbox-Zeile öffnet das Kürzel den Picker; bestätigen setzt den Marker', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-reminders-cmd-'));
    const datei = path.join(dir, 'aufgabe.md');
    fs.writeFileSync(datei, ['# Aufgabe', '', '- [ ] Termin vorbereiten', ''].join('\n'), 'utf8');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await enterEditSource(app, page);

      // Cursor in die Checkbox-Zeile setzen.
      await page
        .locator(`${SEL.editorContent0} .cm-line`, { hasText: 'Termin vorbereiten' })
        .click();
      await openPickerByKey(page);
      await expect(page.locator(PICKER)).toBeVisible();

      // Ohne Änderung bestätigen (Datum vorbelegt, Uhrzeit = Standard).
      await page.locator('#date-picker-ok').click();
      await expect(page.locator(PICKER)).toBeHidden();

      // Die Zeile trägt nun einen ⏰-Marker mit gültigem Datum.
      const line = page.locator(`${SEL.editorContent0} .cm-line`, {
        hasText: 'Termin vorbereiten',
      });
      await expect(line).toContainText(REMINDER);
      await expect(line).toContainText(/\d{4}-\d{2}-\d{2}/);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

// --- ER-07: Aus-Zustand ------------------------------------------------------------

test.describe('ER-07: Erinnerungen — deaktivierte Erweiterung liefert weder Dialog noch Panel', () => {
  test('trotz überfälligem Anker erscheint kein Dialog; Button ausgeblendet, Panel aus', async () => {
    const userData = seedProfile({ extensions: { disabled: ['reminders'] } });
    const dir = makeAreaDir();
    const { app, page } = await launchApp({ userData });
    try {
      await bindArea(page, dir);
      await openFileInArea(app, page, path.join(dir, 'overdue.md'));

      // Feste kurze Wartezeit für die Abwesenheits-Assertion: der Prüfer ist
      // im Aus-Zustand abgeschaltet (buildEnv.enabled false), es darf nie ein
      // Dialog kommen. (Einzige bewusste feste Wartezeit der Suite; ein
      // Ereignis, das nicht eintritt, lässt sich nicht per Polling abwarten.)
      await page.waitForTimeout(2000);
      await expect(page.locator(MODAL)).toBeHidden();

      // 4T-000568 (Epic 3E-000104): der Statusbar-Button ist bei deaktivierter
      // Erweiterung ausgeblendet (vorher sichtbar, aber wirkungslos); das
      // Panel bleibt aus.
      await expect(page.locator('#btn-reminders')).toBeHidden();
      await expect(page.locator('.pane-group[data-pane="0"] .sidebar-reminders')).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

// --- ER-08: Panel im Bereich OHNE offene Datei -------------------------------------

// 4T-000527 (PO-Testbefund 2026-07-11): Erinnerungen sind bereichsweit; das Panel
// muss in einem geöffneten Bereich auch OHNE offene Datei anzeigbar sein (vorher
// hing es an isAllEmpty und verschwand ohne Tab). Regressionstest: Bereich
// binden, KEINE Datei öffnen, Panel über den Statusbar-Button einblenden.
test.describe('ER-08: Erinnerungen — Panel im Bereich ohne offene Datei', () => {
  test('der Statusbar-Button blendet die Sektion auch ohne offenen Tab ein', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaDir();
    try {
      await bindArea(page, dir);
      // Nachhol-Dialog abwarten und wegklicken (mutet die überfälligen Anker;
      // sie bleiben in der Überfällig-Gruppe sichtbar). KEINE Datei öffnen.
      await expect(page.locator(MODAL)).toBeVisible({ timeout: 15000 });
      await page.locator(CLOSE_BTN).click();
      await expect(page.locator(MODAL)).toBeHidden();

      // Ohne offene Datei (Empty-State im Bereich) das Panel einblenden.
      await page.locator('#btn-reminders').click();
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-reminders');
      await expect(section).toBeVisible({ timeout: 15000 });
      // Es zeigt die bereichsweiten Erinnerungen (Überfällig-Gruppe der
      // gemuteten 2020-Anker), nicht den Bereichs-/Kein-Bereich-Hinweis.
      await expect(
        section.locator('.reminders-group-header', { hasText: 'Überfällig' }),
      ).toBeVisible({ timeout: 15000 });
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});
