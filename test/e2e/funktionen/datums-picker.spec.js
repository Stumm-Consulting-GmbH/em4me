// 4T-0486 (Epic 3E-0091): E2E-Funktions-Suite — Datums-/Uhrzeit-Picker.
// DP-01: Strg+Alt+T oeffnet den kombinierten Picker, Uebernehmen fuegt
// 'yyyy-MM-dd HH:mm' am Cursor ein; DP-02: Strg+Alt+D (nur Datum) — Uhrzeit-
// Schalter aus, Kalender-Tag anklicken, Einfuegen liefert exakt dessen
// data-iso; DP-03: Strg+Alt+U (nur Uhrzeit) — Datums-Schalter aus, Segmente
// per Ziffern-Tasten auf 07:05, Einfuegen '07:05' (Segment-Steuerung statt
// Freitext, PO-Befund Runde 1); DP-04: Schreib-Trigger ';;' oeffnet den
// Picker, Uebernehmen ersetzt beide Zeichen; DP-05: Trigger + Esc laesst die
// Zeichen stehen, in gewoehnlichem Fenced-Code loest ';;' nicht aus, in
// einem Perspective-Fence dagegen schon (4T-0641); DP-06: bei deaktivierter
// Erweiterung 'date-picker' oeffnet weder das Kuerzel noch der Trigger.
//
// 4T-0641 (Epic 3E-0069): Der Trigger war bis dahin ein Backslash-Doppel.
// Die Zeichenfolge kollidierte mit der Bedeutung des Backslash als
// Escape-Zeichen und wurde auf ';;' gewechselt (PO-Entscheidung 2026-07-20).
//
// 4T-0487 (Epic 3E-0091): klickbare Datums-/Uhrzeit-Werte (dateValuePlugin,
// Quelltext- UND Live-Modus im Edit-Modus; read-only keine Dekoration).
// DP-07: realer Klick auf einen Prosa-Datumswert im Live-Modus oeffnet den
// Picker vorbelegt (Datums-Schalter an, Uhrzeit aus, Tag .selected), ein
// anderer Tag ersetzt den Wert an Ort und Stelle; DP-08: Klick auf einen
// Kombi-Wert belegt beide Teile vor (Digit-Segmente gefuellt), geaenderte
// Uhrzeit wird uebernommen, Esc laesst unveraendert; DP-09: read-only keine
// Dekoration, im Edit-Modus kein klickbarer Wert in Fenced-Code oder im
// Marker-Schwanz einer Checkbox-Zeile, waehrend der Prosa-Wert dekoriert
// bleibt, und die deaktivierte Erweiterung entfernt jede Dekoration; DP-10:
// Klick-Reaktivierung auch im Quelltext-Modus (PO-Befund Runde 1).
// Asserts sind regex-/data-iso-basiert, also unabhaengig vom realen
// Tagesdatum. Matrix-IDs F-114 / S-079..081.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'datums-picker.md');

const POPUP = '#date-picker-popup';
const DATE_TIME_RE = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/;

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Quell-Ansicht und Edit-Modus (Muster editor-format.spec.js).
async function enterEditSource(app, page) {
  await sendMenuChannel(app, 'menu:viewChange', 'source');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

// Live-Ansicht mit editierbarem Editor (Muster enterEditSource, aber View
// 'live'). Das dateValuePlugin dekoriert nur editierbare Ansichten
// (readOnly-Guard), deshalb brauchen die Klick-Tests den Edit-Modus.
async function enterEditLive(app, page) {
  await sendMenuChannel(app, 'menu:viewChange', 'live');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

// Edit-Modus sicherstellen, ohne ihn versehentlich wegzutoggeln (btnEdit ist
// ein Toggle; nach einem Settings-Tab-Zwischenspiel kann der Tab seinen
// Edit-Modus behalten haben).
async function ensureEditable(page) {
  const source = page.locator('.pane-group[data-pane="0"] .pane-source-editor');
  if (await source.evaluate((el) => el.classList.contains('read-only'))) {
    await page.locator(SEL.btnEdit).click();
  }
  await expect(source).not.toHaveClass(/read-only/);
}

// Cursor ans Dokument-Ende und eine frische Leerzeile anlegen, damit das
// Ergebnis isoliert in der letzten Editor-Zeile steht.
async function gotoFreshLastLine(page) {
  const editor = page.locator(SEL.editorContent0);
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n');
  return editor;
}

async function lastLineText(editor) {
  return (await editor.locator('.cm-line').last().textContent()).trim();
}

// Kuerzel gedrueckt halten, bis der Picker sichtbar ist (der globale
// Dispatcher reagiert erst nach dem Renderer-init; Poll-Muster wie
// kommando-palette.spec.js).
async function openPickerByKey(page, combo) {
  await expect
    .poll(async () => {
      if (await page.locator(POPUP).isVisible()) return true;
      await page.keyboard.press(combo);
      return page.locator(POPUP).isVisible();
    })
    .toBe(true);
}

test.describe('DP-01: Strg+Alt+T fuegt Datum und Uhrzeit ein (S-079)', () => {
  test('Popup oeffnet, Uebernehmen schreibt yyyy-MM-dd HH:mm', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = await gotoFreshLastLine(page);

      await openPickerByKey(page, 'Control+Alt+t');
      await expect(page.locator(POPUP)).toBeVisible();
      await page.locator('#date-picker-ok').click();
      await expect(page.locator(POPUP)).toBeHidden();

      expect(await lastLineText(editor)).toMatch(DATE_TIME_RE);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DP-02: Strg+Alt+D fuegt nur das Datum ein (S-080)', () => {
  test('Uhrzeit-Schalter aus; Kalender-Tag landet als reines data-iso', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = await gotoFreshLastLine(page);

      await openPickerByKey(page, 'Control+Alt+d');
      await expect(page.locator('#date-picker-toggle-time')).not.toBeChecked();
      await expect(page.locator('#date-picker-toggle-date')).toBeChecked();

      // Einen im Monat liegenden Tag waehlen und dessen ISO-Wert merken.
      const day = page.locator(`${POPUP} button.date-picker-day:not(.other-month)`).first();
      const iso = await day.getAttribute('data-iso');
      await day.click();
      await page.locator('#date-picker-ok').click();
      await expect(page.locator(POPUP)).toBeHidden();

      expect(await lastLineText(editor)).toBe(iso);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DP-03: Strg+Alt+U fuegt nur die Uhrzeit ein (S-081)', () => {
  test('Datums-Schalter aus; Segmente auf 07:05 liefern 07:05', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = await gotoFreshLastLine(page);

      await openPickerByKey(page, 'Control+Alt+u');
      await expect(page.locator('#date-picker-toggle-date')).not.toBeChecked();
      await expect(page.locator('#date-picker-toggle-time')).toBeChecked();

      // Segment-Steuerung (PO-Befund Runde 1): erste Stelle anklicken, dann
      // die vier Ziffern tippen — jede Ziffer setzt die Stelle und rueckt
      // automatisch zur naechsten weiter.
      await page.locator(`${POPUP} .date-picker-time-digit[data-seg="0"]`).click();
      await page.keyboard.type('0705');
      await page.locator('#date-picker-ok').click();
      await expect(page.locator(POPUP)).toBeHidden();

      expect(await lastLineText(editor)).toBe('07:05');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DP-04: Schreib-Trigger ersetzt die beiden Zeichen (F-114)', () => {
  test("';;' oeffnet den Picker, Uebernehmen ersetzt die beiden Zeichen", async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = await gotoFreshLastLine(page);

      // Zwei Semikolons tippen: das zweite oeffnet den kombinierten Picker.
      await page.keyboard.type(';;');
      await expect(page.locator(POPUP)).toBeVisible();
      await page.locator('#date-picker-ok').click();
      await expect(page.locator(POPUP)).toBeHidden();

      const text = await lastLineText(editor);
      expect(text).not.toContain(';');
      expect(text).toMatch(DATE_TIME_RE);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DP-05: Abbruch und Ausschluss-Kontext (F-114)', () => {
  test('Esc laesst die Zeichen stehen; Code gesperrt, Perspective-Fence erlaubt', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = await gotoFreshLastLine(page);

      // Trigger, dann Abbruch: die beiden Zeichen bleiben unveraendert.
      await page.keyboard.type(';;');
      await expect(page.locator(POPUP)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(POPUP)).toBeHidden();
      expect(await lastLineText(editor)).toBe(';;');

      // In der gefencten Code-Zeile loest der Trigger nicht aus.
      await editor.locator('.cm-line', { hasText: 'codezeile im Fenced-Block' }).click();
      await page.keyboard.press('End');
      await page.keyboard.type(';;');
      await page.waitForTimeout(150);
      await expect(page.locator(POPUP)).toBeHidden();

      // 4T-0641 (Epic 3E-0069): Im Perspective-Fence dagegen schon — er ist
      // technisch Code, fuer den Nutzer aber eine Tabelle mit Inhaltszellen.
      await editor.locator('.cm-line', { hasText: 'zelle mit datum' }).click();
      await page.keyboard.press('End');
      await page.keyboard.type(';;');
      await expect(page.locator(POPUP)).toBeVisible();
      await page.locator('#date-picker-ok').click();
      await expect(page.locator(POPUP)).toBeHidden();
      const zelle = editor.locator('.cm-line', { hasText: 'zelle mit datum' });
      await expect(zelle).toContainText(/\d{4}-\d{2}-\d{2}/);
      await expect(zelle).not.toContainText(';;');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DP-06: Aus-Zustand der Erweiterung date-picker (F-114)', () => {
  test('deaktiviert oeffnet weder das Kuerzel noch der Trigger', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
    try {
      await waitForTab(page);

      // Erweiterung ueber den Settings-Store abschalten (Muster EW-02,
      // erweiterungen.spec.js). Ueber die Einstellungs-Seite bestaetigen, dass
      // der Aus-Zustand angewendet ist (retry-Assertion wartet auf den
      // Broadcast), dann die Seite unveraendert schliessen (Abbrechen loest
      // kein erneutes Anwenden und keinen Panes-Re-Mount aus).
      await page.evaluate(() => window.api.setSetting('extensions.disabled', ['date-picker']));
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return page.locator(SETTINGS_PAGE).count();
        })
        .toBeGreaterThan(0);
      await page
        .locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="extensions"]`)
        .click();
      await expect(page.locator('#settings-extension-date-picker')).not.toBeChecked();
      // Abbrechen schliesst den Einstellungs-Tab (das inaktive .settings-page-
      // Element bleibt verwaist im DOM, deshalb ueber die Tab-Anzahl pruefen).
      await page.locator('#btn-settings-cancel').click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);

      await enterEditSource(app, page);
      const editor = await gotoFreshLastLine(page);

      // Kuerzel: mehrfach druecken, danach darf kein Popup existieren.
      for (let i = 0; i < 5; i++) await page.keyboard.press('Control+Alt+t');
      await page.waitForTimeout(150);
      await expect(page.locator(POPUP)).toBeHidden();

      // Schreib-Trigger: die beiden Zeichen bleiben stehen, kein Popup.
      await page.keyboard.type(';;');
      await page.waitForTimeout(150);
      await expect(page.locator(POPUP)).toBeHidden();
      expect(await lastLineText(editor)).toBe(';;');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-0487 (Epic 3E-0091): klickbare Datums-/Uhrzeit-Werte im Live-Modus.
// Die Dekoration .cm-live-date-value sitzt im .cm-content; ein realer Klick
// oeffnet den vorbelegten Picker, Uebernehmen ersetzt exakt den Bereich.
const DATE_VALUE = `${SEL.editorContent0} .cm-live-date-value`;

test.describe('DP-07: Klick auf einen Prosa-Datumswert oeffnet vorbelegt und ersetzt an Ort (F-114)', () => {
  test('Datums-Schalter an, Uhrzeit aus, Tag vorgewaehlt; anderer Tag ersetzt den Wert', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditLive(app, page);
      const editor = page.locator(SEL.editorContent0);

      // Prosa-Zeile mit dem festen Datum 2026-03-05 (nicht Zeile 1, damit die
      // Dekoration nicht als aktive Cursor-Zeile ausgeblendet ist).
      const prosaLine = editor.locator('.cm-line', { hasText: 'Fester Termin' });
      const prosaValue = prosaLine.locator('.cm-live-date-value');
      await expect(prosaValue).toBeVisible({ timeout: 15000 });
      await prosaValue.click();

      await expect(page.locator(POPUP)).toBeVisible();
      await expect(page.locator('#date-picker-toggle-date')).toBeChecked();
      await expect(page.locator('#date-picker-toggle-time')).not.toBeChecked();
      await expect(
        page.locator(`${POPUP} button.date-picker-day[data-iso="2026-03-05"]`),
      ).toHaveClass(/selected/);

      // Anderen Tag im selben Monat waehlen und uebernehmen.
      await page.locator(`${POPUP} button.date-picker-day[data-iso="2026-03-12"]`).click();
      await page.locator('#date-picker-ok').click();
      await expect(page.locator(POPUP)).toBeHidden();

      await expect(prosaLine).toContainText('2026-03-12');
      await expect(prosaLine).not.toContainText('2026-03-05');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DP-08: Klick auf einen Kombi-Wert belegt beide Teile vor (F-114)', () => {
  test('Digit-Segmente vorbelegt; geaenderte Uhrzeit uebernommen, Esc laesst unveraendert', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditLive(app, page);
      const editor = page.locator(SEL.editorContent0);

      const comboLine = editor.locator('.cm-line', { hasText: 'Kombiniert' });
      const comboValue = comboLine.locator('.cm-live-date-value');
      await expect(comboValue).toBeVisible({ timeout: 15000 });
      await comboValue.click();

      await expect(page.locator(POPUP)).toBeVisible();
      await expect(page.locator('#date-picker-toggle-date')).toBeChecked();
      await expect(page.locator('#date-picker-toggle-time')).toBeChecked();
      // Vorbelegung 14:30 in den vier Digit-Segmenten (PO-Befund Runde 1).
      await expect(page.locator(`${POPUP} .date-picker-time-digit`)).toHaveText([
        '1',
        '4',
        '3',
        '0',
      ]);

      // Uhrzeit ueber die Segmente auf 15:45 stellen (Auto-Weiterruecken).
      await page.locator(`${POPUP} .date-picker-time-digit[data-seg="0"]`).click();
      await page.keyboard.type('1545');
      await page.locator('#date-picker-ok').click();
      await expect(page.locator(POPUP)).toBeHidden();
      await expect(comboLine).toContainText('2026-03-05 15:45');

      // Abbruch-Fall: Cursor von der Kombi-Zeile wegsetzen (aktive Zeile
      // blendet die Dekoration aus), dann erneut klicken und mit Esc abbrechen.
      await editor.locator('.cm-line', { hasText: 'Datums-Picker' }).click();
      const comboValue2 = comboLine.locator('.cm-live-date-value');
      await expect(comboValue2).toBeVisible();
      await comboValue2.click();
      await expect(page.locator(POPUP)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(POPUP)).toBeHidden();
      await expect(comboLine).toContainText('2026-03-05 15:45');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DP-09: Ausschluesse der Datums-Dekoration (F-114)', () => {
  test('read-only ohne Dekoration; kein Wert in Code oder im Marker-Schwanz', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      // Lese-Modus (read-only): das dateValuePlugin dekoriert nicht.
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).toHaveClass(
        /read-only/,
      );
      await expect(page.locator(DATE_VALUE)).toHaveCount(0);

      // Edit-Modus: der Prosa-Wert ist dekoriert (Anker fuer den fertig
      // gerechneten Dekorations-Pass).
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(DATE_VALUE).filter({ hasText: '2026-03-05' }).first()).toBeVisible({
        timeout: 15000,
      });

      // Datum im Fenced-Code (2026-03-09): kein klickbarer Wert.
      await expect(page.locator(DATE_VALUE).filter({ hasText: '2026-03-09' })).toHaveCount(0);
      // Termin-Marker der Checkbox-Zeile (2026-03-07, tasks-Erweiterung aktiv):
      // der Marker-Schwanz traegt bereits die Badge-Dekoration.
      await expect(page.locator(DATE_VALUE).filter({ hasText: '2026-03-07' })).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('deaktivierte Erweiterung date-picker entfernt jede Dekoration', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
    try {
      await waitForTab(page);
      await enterEditLive(app, page);
      await expect(page.locator(DATE_VALUE).first()).toBeVisible({ timeout: 15000 });

      // Erweiterung ueber den Settings-Store abschalten (Muster DP-06) und den
      // angewendeten Aus-Zustand ueber die Einstellungs-Seite bestaetigen.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', ['date-picker']));
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return page.locator(SETTINGS_PAGE).count();
        })
        .toBeGreaterThan(0);
      await page
        .locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="extensions"]`)
        .click();
      await expect(page.locator('#settings-extension-date-picker')).not.toBeChecked();
      await page.locator('#btn-settings-cancel').click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);

      // Zurueck in den editierbaren Live-Modus (der Aus-Zustand darf nicht
      // vom readOnly-Guard ueberdeckt sein): keine Datums-Werte mehr.
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await ensureEditable(page);
      await expect(page.locator(DATE_VALUE)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DP-10: Klick-Reaktivierung im Quelltext-Modus (F-114)', () => {
  // PO-Befund Runde 1: die Klick-Reaktivierung wirkt auch im Quelltext-
  // Modus, nicht nur im Live-Modus (dateValuePlugin als Basis-Extension).
  test('Prosa-Wert in der Source-Ansicht dekoriert; Klick oeffnet vorbelegt und ersetzt', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);

      const prosaLine = editor.locator('.cm-line', { hasText: 'Fester Termin' });
      const prosaValue = prosaLine.locator('.cm-live-date-value');
      await expect(prosaValue).toBeVisible({ timeout: 15000 });
      await prosaValue.click();

      await expect(page.locator(POPUP)).toBeVisible();
      await expect(page.locator('#date-picker-toggle-date')).toBeChecked();
      await expect(page.locator('#date-picker-toggle-time')).not.toBeChecked();
      await expect(
        page.locator(`${POPUP} button.date-picker-day[data-iso="2026-03-05"]`),
      ).toHaveClass(/selected/);

      await page.locator(`${POPUP} button.date-picker-day[data-iso="2026-03-12"]`).click();
      await page.locator('#date-picker-ok').click();
      await expect(page.locator(POPUP)).toBeHidden();

      await expect(prosaLine).toContainText('2026-03-12');
      await expect(prosaLine).not.toContainText('2026-03-05');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
