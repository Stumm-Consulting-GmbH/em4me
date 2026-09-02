// 4T-000751 (Epic 3E-000146): E2E-Funktions-Suite — Auslieferungs-Voreinstellungen.
// Deckt den Zustand ab, den ein Erstbenutzer vorfindet: englische Oberfläche
// und Bernstein als Farbschema. Die Specs starten deshalb bewusst OHNE die
// Vorbelegung des Start-Helfers (settings: null); alle übrigen Specs laufen
// mit deutscher Sprache, weil sie gegen deutsche Oberflächen-Texte prüfen.
//
// Zweiter Prüfgegenstand ist der Einmal-Schritt beim Start: Eine Installation
// mit Nutzungsspuren gilt als Bestand und wird auf die bisherigen
// Standard-Schemas festgeschrieben, damit die Umstellung sie nicht mitzieht.
//
// 4T-000644 (Epic 3E-000127): Genau weil hier ohne Vorbelegung gestartet wird,
// erleben diese beiden Fälle als einzige den echten Erststart und damit die
// automatisch anlaufende Produkt-Tour. Sie wird unmittelbar nach dem Start
// geschlossen; den Merker mitzugeben verbietet sich, weil er die frische
// Installation, die hier der Prüfgegenstand ist, gerade verfälschen würde.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, schliesseTour } = require('../helpers/app');
const {
  BUILTIN_SCHEMES,
  DEFAULT_LIGHT_ID,
  DEFAULT_DARK_ID,
  PREVIOUS_DEFAULT_LIGHT_ID,
} = require('../../../src/shared/color-schemes.js');

function rootVar(page, name) {
  return page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);
}

// Der Anzeige-Modus folgt dem Betriebssystem (Vorzug 'system'), und Bernstein
// trägt je Modus einen eigenen Akzent. Der erwartete Wert wird deshalb zur
// Laufzeit aus dem Modell geholt, sonst hinge die Prüfung am Hell-Dunkel-Stand
// des Prüf-Rechners.
async function defaultAccent(page) {
  const dunkel = await page.evaluate(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  );
  const id = dunkel ? DEFAULT_DARK_ID : DEFAULT_LIGHT_ID;
  return BUILTIN_SCHEMES.find((s) => s.id === id).colors.accent;
}

// Tolerant gegen den Moment, in dem die Datei gerade geschrieben wird: ein
// unlesbarer Stand liefert ein leeres Objekt, damit expect.poll weiter
// wiederholt statt am Lesefehler zu scheitern.
function readConfig(userData) {
  try {
    return JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

test.describe('VE-01: frische Installation', () => {
  test('startet englisch und in Bernstein', async () => {
    const { app, page, userData } = await launchApp({ settings: null });
    try {
      // 4T-000644: echter Erststart, also läuft die Produkt-Tour an; wegräumen,
      // bevor ihr Overlay die Prüfungen der Oberfläche verdeckt.
      await schliesseTour(page);
      // Sprache: das Dokument trägt das Sprach-Kürzel der geladenen
      // Übersetzung, die Auswahl in der Fußzeile zeigt denselben Wert.
      await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en');
      await expect(page.locator('#lang-select')).toHaveValue('en');

      // Farbschema: der Akzent der Voreinstellung steht inline am
      // Wurzel-Element, weil Bernstein von der Basis-Palette abweicht.
      const akzent = await defaultAccent(page);
      await expect.poll(() => rootVar(page, '--accent')).toBe(akzent);

      // Der Einmal-Schritt hat den Zustand persistiert.
      await expect
        .poll(() => readConfig(userData).colorSchemes?.activeLight)
        .toBe(DEFAULT_LIGHT_ID);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('VE-02: bestehende Installation', () => {
  test('mit Nutzungsspur bleibt auf dem bisherigen Standard-Schema', async () => {
    // Profil eines Bestandsnutzers nachstellen: kein colorSchemes-Stand, aber
    // eine Nutzungsspur und das materialisierte language: null, das jede vor
    // der Umstellung angelegte config.json trägt.
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-e2e-bestand-'));
    fs.writeFileSync(
      path.join(userData, 'config.json'),
      JSON.stringify({ language: null, recentFiles: ['C:/nicht/vorhanden.md'] }, null, 2),
      'utf8',
    );
    const { app, page } = await launchApp({ userData, settings: null });
    try {
      // 4T-000644: Ein vor der Tour angelegtes Profil kennt den Merker nicht,
      // die Tour läuft also auch hier an.
      await schliesseTour(page);
      // Kein inline gesetzter Akzent: Standard entspricht der Basis-Palette.
      await expect.poll(() => rootVar(page, '--accent')).toBe('');
      await expect
        .poll(() => readConfig(userData).colorSchemes?.activeLight)
        .toBe(PREVIOUS_DEFAULT_LIGHT_ID);
      // Die Sprache bleibt bei der Ableitung aus dem Betriebssystem; der
      // persistierte null-Wert wird nicht überschrieben.
      await expect.poll(() => readConfig(userData).language).toBeNull();
    } finally {
      await closeApp(app, userData);
    }
  });
});
