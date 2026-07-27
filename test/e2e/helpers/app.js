// 4T-0166: Gemeinsamer E2E-Helper — App-Start mit isoliertem Temp-Profil.
//
// Jeder Lauf bekommt ein frisches userData-Verzeichnis (SCG_TEST_USER_DATA,
// siehe Hook in src/main/main.js). Damit beruehren Tests nie das echte
// Nutzer-Profil unter %APPDATA% und starten ohne Session-Restore-Altlast.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('@playwright/test');
const { PANEL_ACCESS, DEFAULT_PANEL_TOGGLE_ORDER } = require('../../../src/shared/panel-access.js');

// Projekt-Wurzel (test/e2e/helpers -> drei Ebenen hoch).
const APP_ROOT = path.resolve(__dirname, '..', '..', '..');

// 4T-0372 (Epic 3E-0069): Bereitschafts-Marker der Renderer-Init.
// applyPanelButtonOrder() sortiert die Statusbar-Panel-Buttons ganz am Ende
// von init() in die Modell-Reihenfolge; statisch steht in index.html ein
// anderer Button vorn. Der erste Button des Segments ist damit das spaeteste
// beobachtbare Init-Ergebnis und aus dem Zugangs-Modell abgeleitet (kein
// hartkodierter Wert, der bei Reihenfolge-Aenderungen still veraltet).
const FIRST_PANEL_BUTTON_ID = PANEL_ACCESS.find(
  (p) => p.id === DEFAULT_PANEL_TOGGLE_ORDER[0],
).buttonId;

/**
 * Wartet, bis die asynchrone Renderer-init() durchgelaufen ist.
 *
 * Hintergrund (4T-0372): waitForLoadState('domcontentloaded') deckt nur die
 * Listener auf Modulkopf-Ebene ab. init() laeuft danach mit vielen
 * await-Schritten weiter und registriert dort unter anderem den
 * reminders:due-Listener und die Panel-Sichtbarkeiten aus dem Store. Specs,
 * die unmittelbar nach dem Start einen Bereich binden (openAreaPath), lieferten
 * deshalb ein Rennen: fire-and-forget-Events des Main-Prozesses konnten
 * eintreffen, bevor ihr Listener existierte (ipcRenderer.on puffert nicht).
 * Das Rennen ging lange knapp zugunsten der Tests aus und kippte, als das
 * Renderer-Bundle um die Uhr-Module wuchs — betroffen waren ER-08
 * (Erinnerungen) und BIC-01 (Bereichs-Index-Cache).
 *
 * Bewusst weich: ein Ausbleiben des Markers laesst den Start NICHT scheitern,
 * damit dieser Helfer keine neue Fehlerquelle fuer Specs wird, die die
 * Statusbar gar nicht aufbauen. Der Test scheitert dann wie bisher an seiner
 * eigentlichen Assertion.
 */
async function waitForRendererInit(page) {
  try {
    await page.waitForFunction(
      (expected) => {
        const btn = document.querySelector('.statusbar .source-toggles > button');
        return !!btn && btn.id === expected;
      },
      FIRST_PANEL_BUTTON_ID,
      { timeout: 15000 },
    );
  } catch {
    // Marker nicht erreicht — bewusst kein harter Fehlschlag, siehe oben.
  }
}

// 4T-0751 (Epic 3E-0146): Vorbelegung des frischen Profils. Die Anwendung
// liefert seither Englisch als Voreinstellung aus; die Specs pruefen aber
// gegen deutsche Oberflaechen-Texte. Ohne diese Vorbelegung haetten sie die
// Sprache des Pruef-Rechners geerbt (auf einem englischsprachigen System
// waren sie schon vor der Umstellung rot). Deutsch statt Englisch, weil ein
// Umschreiben von rund zwanzig Spec-Dateien Aufwand ohne Gewinn waere; den
// ausgelieferten Zustand deckt die eigene Spec voreinstellungen.spec.js ab,
// die ohne Vorbelegung startet.
const DEFAULT_TEST_SETTINGS = { language: 'de' };

// Schreibt die Vorbelegung in die config.json des Profils, bevor Electron
// startet. conf legt fehlende Defaults beim Start selbst nach, hier stehen
// deshalb nur die abweichenden Werte.
function seedSettings(userData, settings) {
  if (!settings) return;
  fs.mkdirSync(userData, { recursive: true });
  const datei = path.join(userData, 'config.json');
  let bestand;
  try {
    bestand = JSON.parse(fs.readFileSync(datei, 'utf8'));
  } catch {
    bestand = {};
  }
  fs.writeFileSync(datei, JSON.stringify({ ...bestand, ...settings }, null, 2), 'utf8');
}

/**
 * Startet die App mit frischem Temp-Profil.
 * @param {object} [opts]
 * @param {string[]} [opts.args]      Zusaetzliche CLI-Argumente (z.B. Dateipfad).
 * @param {string}   [opts.userData]  Bestehendes Profil-Verzeichnis wiederverwenden
 *                                    (Session-Restore-Tests); Default: frisches Temp-Verzeichnis.
 * @param {object|null} [opts.settings] Vorbelegung der config.json; Default
 *                                    DEFAULT_TEST_SETTINGS (Sprache Deutsch).
 *                                    null startet ohne jede Vorbelegung und
 *                                    zeigt damit den Auslieferungszustand.
 * @returns {Promise<{ app: import('@playwright/test').ElectronApplication,
 *                     page: import('@playwright/test').Page,
 *                     userData: string }>}
 */
async function launchApp(opts = {}) {
  const userData = opts.userData || fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-e2e-'));
  seedSettings(userData, 'settings' in opts ? opts.settings : DEFAULT_TEST_SETTINGS);
  const app = await electron.launch({
    args: ['.', ...(opts.args || [])],
    cwd: APP_ROOT,
    env: {
      ...process.env,
      SCG_TEST_USER_DATA: userData,
    },
  });
  const page = await app.firstWindow();
  // firstWindow() resolved, bevor das Renderer-Bundle geladen ist. Die
  // Modulkopf-IPC-Listener (z.B. tab:appendFromOtherWindow) existieren erst
  // nach der Modul-Ausfuehrung; type=module ist deferred und laeuft vor
  // DOMContentLoaded — danach gehen keine gesendeten Events mehr verloren.
  await page.waitForLoadState('domcontentloaded');
  // 4T-0372 (Epic 3E-0069): zusaetzlich das Ende der asynchronen init()
  // abwarten — Begruendung am Helfer waitForRendererInit.
  await waitForRendererInit(page);
  return { app, page, userData };
}

/**
 * Beendet die App und raeumt das Temp-Profil auf. Windows-robust: Datei-
 * Handles koennen kurz nach dem Schliessen noch gesperrt sein, deshalb
 * try/catch mit Retry-Optionen statt hartem Fehlschlag.
 *
 * opts.force: beendet per app.exit(0) ohne before-quit und ohne Dialoge.
 * Pflicht fuer Tests, die absichtlich dirty Buffer hinterlassen — der
 * normale Close-Pfad wuerde sonst im nativen Speichern-Dialog haengen
 * und den Worker-Teardown blockieren.
 */
async function closeApp(app, userData, opts = {}) {
  if (app) {
    try {
      if (opts.force) {
        await app
          .evaluate(({ app: electronApp }) => {
            electronApp.exit(0);
          })
          .catch(() => {});
      }
      await app.close();
    } catch {
      // App war bereits beendet (z.B. Session-Restore-Test mit eigenem Quit).
    }
  }
  if (userData) {
    try {
      fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Temp-Verzeichnis bleibt im OS-Temp liegen; unkritisch.
    }
  }
}

module.exports = { launchApp, closeApp, APP_ROOT };
