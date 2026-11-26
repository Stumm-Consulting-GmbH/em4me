// 4T-002652 (Epic 3E-000416): Die Nachweis-Versuche N4 und N10 der
// Konzept-Stufe 4T-002645 als dauerhafter Wächter der Suite.
//
// **Befund der Konzept-Stufe** (zweiter und erster Nachweis-Lauf vom
// 2026-11-13 an der gebauten Programmdatei, Skripte und Protokolle unter
// Projektmanagement/Aufgaben/Anlagen/4T-002645/):
//
// - N4: Code im Programmfenster schrieb über den allgemeinen Einstellungs-Weg
//   die Liste der bestätigten Add-ons selbst.
// - N10: Code im Programmfenster legte über den Folien-Export und das
//   Speichern ein Add-on im Add-on-Ordner des Profils ab, bestätigte es und
//   schaltete es ein; beim nächsten Start lief es ohne Warn-Dialog.
//
// **Was Stufe 1 dagegen setzt und was hier geprüft wird.** Die Erlaubnis-
// Schlüssel weist der allgemeine Weg ab (4T-002649, Klasse 2 in
// src/main/app/settings-classes.js: Antwort `settings:permission`). Die
// erklärten Schreib-Kanäle weisen ein Ziel im Profil-Ordner ab, bevor ihr
// Handler läuft (4T-002648, src/main/ipc/channel-guard.js: Antwort
// `guard:protectedFolder`). Bestätigen geht nur über den Warn-Dialog des
// Hauptprozesses, Einschalten nur für ein bestätigtes Paket (4T-002650,
// src/main/ipc/extensions.js). Jeder Schritt von N10 wird einzeln versucht:
// Der zweite und dritte Schritt setzen ein Paket voraus, das schon im Ordner
// liegt, als hätte der erste Schritt auf anderem Weg Erfolg gehabt.
//
// **Gegenprobe.** Das Add-on des Versuchs setzt beim Start eine Marke im
// Fenster. Der letzte Fall belegt mit einer echten Bestätigung im Profil, dass
// die Marke anspringt; ohne ihn prüften die Fälle davor auch dann grün, wenn
// das Paket aus einem anderen Grund nie geladen würde.
//
// **Quellstand oder gebaute Programmdatei.** launchApp startet den Quellstand
// oder, mit der Umgebungs-Variable EM4ME_PROGRAMMDATEI, eine gebaute
// Programmdatei (4T-002068). Unter Windows läuft die Datei nur in der
// Prüfmaschine, nie am Rechner.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { oeffneEinstellungsSeite, bedieneBis } = require('../helpers/eingabe');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');

const ADDON_ID = 'nachweis-addon';
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const ADDON_ZEILE = `#settings-extensions-external-list [data-extension-id="${ADDON_ID}"]`;

const MANIFEST = {
  id: ADDON_ID,
  name: 'Nachweis',
  version: '1.0.0',
  apiVersion: '1.0.0',
  entry: 'einstieg.js',
  description: 'Nachweis-Versuch N10 der Konzept-Stufe 4T-002645',
};
// Die Marke liegt im Fenster und nicht auf der Platte, damit ihr Ausbleiben
// nicht an einem Schreib-Schutz hängt, sondern allein daran, ob das Add-on lief.
const EINSTIEG =
  'export default { activate() {\n' +
  '  globalThis.__nachweisAddonLief = (globalThis.__nachweisAddonLief || 0) + 1;\n' +
  '} };\n';

function neuesProfil() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-e2e-n10-'));
}

function addonOrdner(userData) {
  return path.join(userData, 'extensions', ADDON_ID);
}

// Legt das Paket von außen in den Add-on-Ordner, vor dem Start der Anwendung.
function legePaketAb(userData) {
  const ordner = addonOrdner(userData);
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(path.join(ordner, 'manifest.json'), JSON.stringify(MANIFEST, null, 2));
  fs.writeFileSync(path.join(ordner, 'einstieg.js'), EINSTIEG);
}

function profilDatei(userData) {
  const datei = path.join(userData, 'config.json');
  return fs.existsSync(datei) ? fs.readFileSync(datei, 'utf8') : '';
}

// Bereich «Erweiterungen (extern)» der Einstellungs-Seite öffnen (Muster und
// Begründung der zwei Hälften: EX-04 in funktionen/erweiterungen-extern.spec.js).
async function oeffneExterneErweiterungen(page) {
  const eintrag = page.locator(
    `${SETTINGS_PAGE} .settings-nav-entry[data-section-id="extensionsExternal"]`,
  );
  const liste = page.locator('#settings-extensions-external-list');
  await oeffneEinstellungsSeite(page);
  await bedieneBis(eintrag, () => liste.isVisible(), {
    zugriffsFristMs: 2000,
    zugriff: async (l) => {
      if (!(await l.isVisible())) await page.keyboard.press('Control+,');
      await l.click({ timeout: 2000 });
    },
  });
  await expect(liste).toBeVisible();
}

test.describe('4T-002652: Nachweis-Versuche N4 und N10 der Konzept-Stufe scheitern', () => {
  test('N4: das Fenster setzt die Liste der bestätigten Add-ons nicht', async () => {
    const { app, page, userData } = await launchApp();
    try {
      const davor = await page.evaluate(() => window.api.getSetting('extensionsExternal.trusted'));
      // Der Versuch der Konzept-Stufe, dazu der übergeordnete Schlüssel und die
      // Liste der eingeschalteten Add-ons.
      for (const [schluessel, wert] of [
        ['extensionsExternal.trusted', { [ADDON_ID]: '9.9.9' }],
        ['extensionsExternal', { enabled: [ADDON_ID], trusted: { [ADDON_ID]: '9.9.9' } }],
        ['extensionsExternal.enabled', [ADDON_ID]],
      ]) {
        const antwort = await page.evaluate(
          ([k, v]) => window.api.setSetting(k, v),
          [schluessel, wert],
        );
        expect(antwort, schluessel).toEqual({ ok: false, error: 'settings:permission' });
      }
      expect(
        await page.evaluate(() => window.api.getSetting('extensionsExternal.trusted')),
      ).toEqual(davor);
      expect(profilDatei(userData)).not.toContain(ADDON_ID);
    } finally {
      await closeApp(app, userData);
    }
  });

  test('N10, erster Schritt: das Fenster legt kein Add-on im Profil-Ordner ab', async () => {
    const { app, page, userData } = await launchApp();
    const ordner = addonOrdner(userData);
    try {
      // Der Folien-Export legte im Versuch den Ordner an, das Speichern die Dateien.
      const ordnerAntwort = await page.evaluate(
        ([o]) => window.api.writeFolienHtml(o, 'unbenutzt', [{ name: 'index.html', text: '' }]),
        [ordner],
      );
      expect(ordnerAntwort).toEqual({ ok: false, error: 'guard:protectedFolder' });
      for (const [name, inhalt] of [
        ['manifest.json', JSON.stringify(MANIFEST, null, 2)],
        ['einstieg.js', EINSTIEG],
      ]) {
        const antwort = await page.evaluate(
          ([p, t]) => window.api.saveFile(p, t),
          [path.join(ordner, name), inhalt],
        );
        expect(antwort, name).toEqual({ ok: false, error: 'guard:protectedFolder' });
      }
      expect(fs.existsSync(ordner)).toBe(false);
    } finally {
      await closeApp(app, userData);
    }
  });

  test('N10, zweiter und dritter Schritt: ein abgelegtes Paket wird weder bestätigt noch eingeschaltet', async () => {
    const userData = neuesProfil();
    legePaketAb(userData);
    let { app, page } = await launchApp({ userData });
    try {
      const liste = await page.evaluate(() => window.api.scanExternalExtensions());
      expect(JSON.stringify(liste)).toContain(ADDON_ID);

      // Der allgemeine Weg weist Bestätigung und Einschalten ab.
      for (const [schluessel, wert] of [
        ['extensionsExternal.trusted', { [ADDON_ID]: '1.0.0' }],
        ['extensionsExternal.enabled', [ADDON_ID]],
      ]) {
        const antwort = await page.evaluate(
          ([k, v]) => window.api.setSetting(k, v),
          [schluessel, wert],
        );
        expect(antwort, schluessel).toEqual({ ok: false, error: 'settings:permission' });
      }
      // Der eigene Kanal schaltet ein unbestätigtes Paket nicht ein.
      expect(
        await page.evaluate((id) => window.api.setExternalExtensionEnabled(id, true), ADDON_ID),
      ).toEqual({ ok: false, error: 'extensions:notTrusted' });
      // Bestätigt wird nur über den Warn-Dialog des Hauptprozesses; hier
      // vertreten und mit «Abbrechen» beantwortet.
      await hauptSenden(app, ({ dialog }) => {
        globalThis.__n10Dialoge = 0;
        dialog.showMessageBox = async () => {
          globalThis.__n10Dialoge += 1;
          return { response: 1 };
        };
      });
      expect(
        await page.evaluate((id) => window.api.confirmExternalExtensionTrust(id), ADDON_ID),
      ).toBe(false);
      expect(await hauptLesen(app, () => globalThis.__n10Dialoge)).toBe(1);
      expect(profilDatei(userData)).not.toContain(`"${ADDON_ID}"`);
    } finally {
      await closeApp(app, null, { force: true });
    }

    // Zweiter Start mit demselben Profil: Das Paket steht in der Liste, läuft
    // aber nicht.
    ({ app, page } = await launchApp({ userData }));
    try {
      await oeffneExterneErweiterungen(page);
      const zeile = page.locator(ADDON_ZEILE);
      await expect(zeile).toBeVisible();
      await expect(zeile).not.toHaveAttribute('data-status', 'active');
      expect(await page.evaluate(() => globalThis.__nachweisAddonLief)).toBeUndefined();
      const zustand = await page.evaluate(async () => ({
        enabled: await window.api.getSetting('extensionsExternal.enabled'),
        trusted: await window.api.getSetting('extensionsExternal.trusted'),
      }));
      expect(zustand.enabled || []).not.toContain(ADDON_ID);
      expect(Object.keys(zustand.trusted || {})).not.toContain(ADDON_ID);
    } finally {
      await closeApp(app, userData);
    }
  });

  test('Gegenprobe: mit echter Bestätigung im Profil läuft dasselbe Paket und setzt die Marke', async () => {
    const userData = neuesProfil();
    legePaketAb(userData);
    const { app, page } = await launchApp({
      userData,
      settings: {
        language: 'de',
        extensionsExternal: { enabled: [ADDON_ID], trusted: { [ADDON_ID]: '1.0.0' } },
      },
    });
    try {
      await oeffneExterneErweiterungen(page);
      await expect(page.locator(ADDON_ZEILE)).toHaveAttribute('data-status', 'active');
      await expect.poll(() => page.evaluate(() => globalThis.__nachweisAddonLief)).toBe(1);
    } finally {
      await closeApp(app, userData);
    }
  });
});
