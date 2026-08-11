// 4T-0166: Gemeinsamer E2E-Helper — App-Start mit isoliertem Temp-Profil.
//
// Jeder Lauf bekommt ein frisches userData-Verzeichnis (SCG_TEST_USER_DATA,
// siehe Hook in src/main/main.js). Damit beruehren Tests nie das echte
// Nutzer-Profil unter %APPDATA% und starten ohne Session-Restore-Altlast.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron, test } = require('@playwright/test');
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

// 4T-0901 (Epic 3E-0016): Zentrale Beobachtung der Konsole. Ein Fehler in der
// Entwickler-Konsole ist ein Fehler, auch wenn die Oberflaeche ihn nicht zeigt;
// bis hierher pruefte ihn genau ein Fall der Smoke-Suite, die uebrigen rund 570
// liefen daran vorbei.
//
// Der Zuhoerer haengt am 'window'-Ereignis der Anwendung und damit VOR
// firstWindow(). Der Befund aus 4T-0900 zeigte, warum das noetig ist: Der
// bisherige Fall registrierte ihn erst nach dem Hochfahren und blieb deshalb
// gruen, obwohl waehrend des Starts ein Fehler gemeldet wurde. Ueber dasselbe
// Ereignis werden auch weitere Fenster erfasst, ohne dass eine Spec etwas tun
// muss.
//
// Erfasst werden Konsolen-Eintraege vom Typ 'error' und unbehandelte Ausnahmen
// des Renderers ('pageerror'). Warnungen bleiben bewusst aussen vor: Ihr
// Rauschen wuerde den Waechter entwerten.
const KONSOLEN_AUSNAHMEN = require('../../konsolen-ausnahmen.json');

// Geduldet wird eine Meldung nur, wenn der Eintrag passt UND — sofern er eine
// Spec nennt — der Fall aus genau dieser Datei stammt. Ohne diese Bindung
// haette eine Ausnahme wie 'ERR_FILE_NOT_FOUND' projektweit gegolten und ein
// real fehlendes Symbol der Auslieferung mitverdeckt.
//
// Gefiltert wird erst bei der Auswertung, nicht im Ereignis-Zuhoerer: Dieser
// feuert auch ausserhalb eines laufenden Falls, wo die Spec-Zuordnung fehlt.
function istGeduldet(text, specDatei) {
  return KONSOLEN_AUSNAHMEN.eintraege.some(
    (e) => text.includes(e.enthaelt) && (!e.spec || specDatei.endsWith(e.spec)),
  );
}

function beobachteKonsole(app) {
  const funde = [];
  app.__konsolenFunde = funde;
  app.on('window', (page) => {
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      // Die Herkunft gehoert dazu: Eine Meldung wie 'Failed to load resource'
      // nennt die betroffene Adresse nicht im Text, und ohne sie ist nicht
      // entscheidbar, ob eine ausgelieferte Datei fehlt oder ein Testfall
      // absichtlich ins Leere greift.
      const ort = msg.location && msg.location() ? msg.location().url : '';
      funde.push(`${msg.text()}${ort ? ` [${ort}]` : ''}`);
    });
    page.on('pageerror', (err) => {
      // Die Meldung allein taugt zur Diagnose oft nicht: Bei einem
      // 'Cannot read properties of undefined' gibt es dutzende Kandidaten im
      // Renderer. Die erste Stapel-Zeile nennt die Stelle und macht aus dem
      // Raten ein Nachschlagen; der Rest des Stapels bliebe Rauschen.
      const stelle = (err && err.stack ? String(err.stack).split('\n')[1] : '') || '';
      const text = err && err.message ? err.message : String(err);
      funde.push(`pageerror: ${text}${stelle ? ` [${stelle.trim()}]` : ''}`);
    });
  });
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
  beobachteKonsole(app);
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
// 4T-0901: Auswertung am Ende eines Falls. Sie laeuft in closeApp, weil jede
// Spec ihn ohnehin im finally aufruft — so greift der Waechter, ohne dass eine
// Spec etwas dafuer tun muss.
//
// Ist der Fall bereits aus eigenem Grund rot, wird nur angehaengt statt
// geworfen: Ein Wurf aus dem finally-Block wuerde den urspruenglichen Fehler
// verdecken und die Diagnose verschlechtern.
function pruefeKonsolenFunde(app) {
  const roh = (app && app.__konsolenFunde) || [];
  if (roh.length === 0) return;
  let specDatei = '';
  try {
    specDatei = (test.info().file || '').replace(/\\/g, '/');
  } catch {
    // Ausserhalb eines laufenden Falls: keine Spec-Bindung, nichts geduldet.
  }
  const funde = roh.filter((f) => !istGeduldet(f, specDatei));
  if (funde.length === 0) return;
  const liste = funde.map((f, i) => `  ${i + 1}. ${f}`).join('\n');
  const meldung =
    `Konsolen-Fehler waehrend des Laufs (${funde.length}):\n${liste}\n` +
    'Beheben, oder bei einer Meldung von aussen einen begruendeten Eintrag in ' +
    'test/konsolen-ausnahmen.json aufnehmen.';
  let schonRot = false;
  try {
    schonRot = test.info().errors.length > 0;
  } catch {
    // Ausserhalb eines laufenden Falls (z.B. globaler Teardown): dann werfen.
  }
  if (schonRot) {
    test.info().annotations.push({ type: 'konsolen-fehler', description: meldung });
    return;
  }
  throw new Error(meldung);
}

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
  // Zuletzt, damit Beenden und Aufraeumen in jedem Fall gelaufen sind.
  pruefeKonsolenFunde(app);
}

module.exports = { launchApp, closeApp, APP_ROOT };
