// 4T-001588 (Story 4S-000904, Epic 3E-000160): E2E-Funktions-Suite des
// Einlesens der eigenen Einstellungen.
//
// IM-01: Die Vorschau nennt je Datenart, was geschehen wird, und ein Abbruch
// lässt die Einrichtung unberührt; IM-02: die Übernahme behält den vorhandenen
// Eintrag und legt den eingelesenen mit Zusatz daneben, der Bericht nennt
// beides; IM-03: eine fremde Datei führt zu einer Meldung und zu keinem
// Schreibzugriff; IM-04: ein unbekannter Abschnitt steht in der Vorschau.
//
// **Der Öffnen-Dialog des Betriebssystems wird im Main gestubbt** (Muster
// stubMeldungen in bereichs-verknuepfungen.spec.js). Er ist per Playwright
// nicht bedienbar, und geprüft werden soll ohnehin nicht der Dialog, sondern
// was mit der gewählten Datei geschieht.
//
// describe-Titel tragen die Matrix-ID (test/abdeckungs-matrix.json, S-145).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { writeExchangeFile } = require('../../../src/shared/exchange-file.js');
const { EXCHANGE_KIND } = require('../../../src/shared/exchange-data-kinds.js');

const MODAL = '#setup-import-modal';
const ZEILEN = `${MODAL} .setup-import-rows li`;

// Eine eingerichtete Installation: ein eigenes Farbschema namens «Nacht», ein
// eigenes Kürzel. Die eingelesene Datei trägt denselben Schema-Namen — das ist
// die Konstellation, um die es geht.
const EINGERICHTET = {
  language: 'de',
  hotkeys: { 'file.save': 'Ctrl+S' },
  colorSchemes: {
    custom: [{ id: 'nacht', name: 'Nacht', base: 'dark', colors: {} }],
    activeLight: 'amber-light',
    activeDark: 'nacht',
  },
};

function tmpDatei(inhalt, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-import-'));
  const datei = path.join(dir, name || 'Einstellungen.md');
  fs.writeFileSync(datei, inhalt, 'utf8');
  return { dir, datei };
}

function austauschDatei(sections) {
  const gebaut = writeExchangeFile({ kind: EXCHANGE_KIND, sections });
  if (!gebaut.ok) throw new Error('Prüfdatei nicht baubar: ' + gebaut.error);
  return gebaut.text;
}

// Der native Öffnen-Dialog wird gestubbt und liefert immer denselben Pfad.
async function stubOeffnen(app, dateiPfad) {
  await app.evaluate(({ dialog }, pfad) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pfad] });
  }, dateiPfad);
}

async function sendMenuChannel(app, channel) {
  await app.evaluate(({ BrowserWindow }, kanal) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send(kanal, ...[]);
  }, channel);
}

// Der Menü-Listener ist erst am Ende des asynchronen init() registriert;
// deshalb wird der Kanal wiederholt gesendet, bis der Dialog steht (Muster
// oeffneAuswahl in einrichtungs-ausgabe.spec.js).
async function oeffneVorschau(app, page) {
  await expect
    .poll(async () => {
      if (await page.locator(MODAL).isHidden()) {
        await sendMenuChannel(app, 'menu:importSetup');
      }
      return page.locator(MODAL).isVisible();
    })
    .toBe(true);
}

function entferne(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Aufräumen darf den Fall nicht kippen. */
  }
}

test.describe('IM-01: Vorschau vor der Übernahme (S-145)', () => {
  test('nennt je Datenart die Wirkung, und ein Abbruch ändert nichts', async () => {
    const { dir, datei } = tmpDatei(
      austauschDatei([
        { name: 'hotkeys', value: { hotkeys: { 'file.save': 'Ctrl+Alt+S' } } },
        {
          name: 'colorSchemes',
          value: {
            colorSchemes: {
              custom: [{ id: 'nacht', name: 'Nacht', base: 'dark', colors: {} }],
              activeLight: 'amber-light',
              activeDark: 'nacht',
            },
          },
        },
      ]),
    );
    const { app, page, userData } = await launchApp({ settings: EINGERICHTET });
    try {
      await stubOeffnen(app, datei);
      await oeffneVorschau(app, page);

      await expect(page.locator('#setup-import-title')).toHaveText('Einstellungen importieren');
      const kuerzel = page.locator(ZEILEN, { hasText: 'Tastenkürzel' }).first();
      await expect(kuerzel.locator('.setup-import-action')).toHaveText('wird ersetzt');
      const schemas = page.locator(ZEILEN, { hasText: 'Farbschemas' }).first();
      await expect(schemas.locator('.setup-import-action')).toHaveText('1 Eintrag kommt hinzu');
      // Die Umbenennung steht namentlich darunter, nicht bloß als Zahl.
      await expect(schemas.locator('.setup-import-detail')).toHaveText(
        '‹Nacht› kommt als ‹Nacht (2)› hinzu',
      );

      // AK3: Ohne Bestätigung wird nichts geschrieben.
      await page.locator('#btn-setup-import-cancel').click();
      await expect(page.locator(MODAL)).toBeHidden();
      const kuerzelDanach = await page.evaluate(() => window.api.getSetting('hotkeys'));
      expect(kuerzelDanach).toEqual({ 'file.save': 'Ctrl+S' });
      const schemasDanach = await page.evaluate(() => window.api.getSetting('colorSchemes'));
      expect(schemasDanach.custom).toHaveLength(1);
    } finally {
      await closeApp(app, userData);
      entferne(dir);
    }
  });
});

test.describe('IM-02: Übernahme mit Namens-Kollision (S-145)', () => {
  test('behält das eigene Schema und legt das eingelesene mit Zusatz daneben', async () => {
    const { dir, datei } = tmpDatei(
      austauschDatei([
        { name: 'hotkeys', value: { hotkeys: { 'file.save': 'Ctrl+Alt+S' } } },
        {
          name: 'colorSchemes',
          value: {
            colorSchemes: {
              custom: [{ id: 'nacht', name: 'Nacht', base: 'dark', colors: {} }],
              activeLight: 'amber-light',
              activeDark: 'nacht',
            },
          },
        },
      ]),
    );
    const { app, page, userData } = await launchApp({ settings: EINGERICHTET });
    try {
      await stubOeffnen(app, datei);
      await oeffneVorschau(app, page);
      await page.locator('#btn-setup-import-confirm').click();

      // Der Bericht steht als zweite Phase im selben Rahmen.
      await expect(page.locator('#setup-import-title')).toHaveText('Einstellungen importiert');
      await expect(page.locator(ZEILEN, { hasText: 'Farbschemas' }).first()).toContainText(
        'Nacht (2)',
      );
      await page.locator('#btn-setup-import-confirm').click();
      await expect(page.locator(MODAL)).toBeHidden();

      const schemas = await page.evaluate(() => window.api.getSetting('colorSchemes'));
      expect(schemas.custom).toHaveLength(2);
      // Der eigene Eintrag: unverändert, Feld für Feld.
      expect(schemas.custom[0]).toEqual(EINGERICHTET.colorSchemes.custom[0]);
      expect(schemas.custom[1].name).toBe('Nacht (2)');
      // Und die ersetzte Datenart ist tatsächlich ersetzt.
      const kuerzel = await page.evaluate(() => window.api.getSetting('hotkeys'));
      expect(kuerzel).toEqual({ 'file.save': 'Ctrl+Alt+S' });
    } finally {
      await closeApp(app, userData);
      entferne(dir);
    }
  });
});

test.describe('IM-03: fremde Datei (S-145)', () => {
  test('meldet den Grund und schreibt nichts', async () => {
    const { dir, datei } = tmpDatei('# Eine gewöhnliche Notiz\n\nMit Text.\n', 'Notiz.md');
    const { app, page, userData } = await launchApp({ settings: EINGERICHTET });
    try {
      await stubOeffnen(app, datei);
      // Wie beim Öffnen der Vorschau: Der Menü-Listener steht erst am Ende des
      // asynchronen init(), der Kanal wird deshalb wiederholt gesendet.
      await expect
        .poll(async () => {
          const klasse = await page.locator('#statusbar-hint').getAttribute('class');
          if (!/visible/.test(klasse || '')) await sendMenuChannel(app, 'menu:importSetup');
          return page.locator('#statusbar-hint').getAttribute('class');
        })
        .toMatch(/visible/);
      await expect(page.locator('#statusbar-hint')).toHaveText(
        'Das ist keine Einstellungs-Datei von EM4me',
      );
      // Kein Dialog, kein Schreibzugriff.
      await expect(page.locator(MODAL)).toBeHidden();
      const kuerzel = await page.evaluate(() => window.api.getSetting('hotkeys'));
      expect(kuerzel).toEqual({ 'file.save': 'Ctrl+S' });
    } finally {
      await closeApp(app, userData);
      entferne(dir);
    }
  });
});

test.describe('IM-04: unbekannter Abschnitt (S-145)', () => {
  test('wird in der Vorschau als übersprungen benannt statt weggelassen', async () => {
    const { dir, datei } = tmpDatei(
      austauschDatei([
        { name: 'hotkeys', value: { hotkeys: { 'file.save': 'Ctrl+Alt+S' } } },
        { name: 'erfundeneDatenart', value: { irgendwas: 1 } },
      ]),
    );
    const { app, page, userData } = await launchApp({ settings: EINGERICHTET });
    try {
      await stubOeffnen(app, datei);
      await oeffneVorschau(app, page);
      const fremd = page.locator(ZEILEN, { hasText: 'erfundeneDatenart' }).first();
      await expect(fremd).toHaveCount(1);
      await expect(fremd.locator('.setup-import-action')).toHaveText(
        'übersprungen (unbekannter Abschnitt)',
      );
      await page.locator('#btn-setup-import-cancel').click();
    } finally {
      await closeApp(app, userData);
      entferne(dir);
    }
  });
});
