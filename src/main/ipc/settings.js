// IPC-Kanal-Gruppe Einstellungen: Lesen und Schreiben des Einstellungs-
// Speichers, dazu die Zuletzt-Liste und der Theme-Vorzug.
//
// Auszug aus main.js, 4T-000999 (Epic 3E-000196). Kanal-Gruppe: settings:*,
// recent:push, theme:*.
//
// 4T-001588 (Epic 3E-000160): Die Verteilung jeder Aenderung an die offenen
// Fenster stand bis dahin im Rumpf von settings:set und liegt jetzt in
// settings-verteilung.js — unveraendert, aber mit zwei Aufrufern: diesem Kanal
// und dem Einlesen einer Austausch-Datei, das im Hauptprozess schreibt.
// Begruendung und Verhaltens-Zusicherung stehen dort.
//
// 4T-002649 (Epic 3E-000416): settings:set nimmt nur noch Schlüssel der
// Klasse 1 mit einem Wert der erklärten Art an (Tabelle in
// app/settings-classes.js). Die Abweisung ist `{ ok: false, error:
// 'settings:<Grund>' }`, der Erfolg `{ ok: true }`; bis dahin gab der Kanal
// nichts zurück, und der Anzeige-Code wertet die Antwort nirgends aus, ein
// abgewiesener Aufruf bleibt für ihn also folgenlos. Je Abweisung schreibt der
// Hauptprozess eine Warnung mit Schlüssel und Grund, nie mit dem Wert.
//
// 4T-002650 (Epic 3E-000416): Der Schalter «Skript-Blöcke ausführen» hat einen
// eigenen Kanal, `settings:setScriptsRun`. Das Einschalten bestätigt der
// Anwender in einem Dialog des Hauptprozesses (Wortlaut der Anforderung
// 4S-001212, Vorgabe «Abbrechen»), das Ausschalten braucht keine Bestätigung.
// Den allgemeinen Weg weist die Tabelle der Klassen für `scripts.run` ab.
//
// Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const { createSettingsVerteilung } = require('./settings-verteilung');
const { checkWindowWrite } = require('../app/settings-classes');

// 4T-002650: Schlüssel des Schalters «Skript-Blöcke ausführen».
const SCRIPTS_RUN_KEY = 'scripts.run';

// Länge des Schlüssels in der Warnung; ein fremder Aufrufer bestimmt ihn.
const MAX_LOGGED_KEY = 200;

function loggedKey(key) {
  return typeof key === 'string' ? key.slice(0, MAX_LOGGED_KEY) : `<${typeof key}>`;
}

/**
 * Registriert die Einstellungs-, Zuletzt-Listen- und Theme-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.BrowserWindow Electron-Fenster-Klasse (Broadcast-Weg von settings:set).
 * @param {object} deps.nativeTheme Electron-Theme-Objekt.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher (steht bei der Registrierung fest).
 * @param {() => void} deps.applyMenuToAllWindows Menues aller Fenster neu bauen.
 * @param {() => void} deps.updateAllCaptionColors Titelleisten aller Fenster umfaerben.
 * @param {object} deps.timerChecker Timer-Pruefer (Weckruf nach Listen-Aenderung).
 * @param {(filePath: string) => void} deps.pushRecent Eintrag in die Zuletzt-Liste.
 * @param {Function} deps.routeShelfFileToBookApp Regal-Routing einer geoeffneten Datei.
 * @param {Function} deps.bindBookIfBookFile Buch-Erkennung einer geoeffneten Datei.
 * @param {Function} deps.bindShelfIfShelfFile Regal-Erkennung einer geoeffneten Datei.
 * @param {(channel: string, ...args: any[]) => void} deps.broadcast Meldung an alle Fenster.
 * @param {(...args: unknown[]) => void} [deps.warn] Protokoll-Weg der Abweisungen.
 * @param {object} deps.dialog Electron-Dialog-Modul (Bestätigung der Skript-Blöcke).
 * @param {(win: object, key: string) => string} deps.tForWindow Übersetzung im Fenster-Kontext.
 */
function registerSettingsIpc(handle, deps) {
  const {
    nativeTheme,
    senderWindow,
    getStore,
    applyMenuToAllWindows,
    pushRecent,
    routeShelfFileToBookApp,
    bindBookIfBookFile,
    bindShelfIfShelfFile,
    broadcast,
    warn = console.warn,
    dialog,
    tForWindow,
  } = deps;
  // 4T-000999: registerIpc laeuft nach loadStore, der Speicher steht also fest.
  // Der Bezeichner bleibt `store`, damit die Handler-Rumpfe unveraendert sind.
  const store = getStore();
  // 4T-001588: dieselbe Verteilung, die auch das Einlesen benutzt.
  const verteileEinstellung = createSettingsVerteilung(deps);

  handle('settings:get', (_event, key) => store?.get(key));
  handle('settings:set', (event, key, value) => {
    // 4T-002649: erst die Klasse und die Art des Werts, dann der Speicher.
    const check = checkWindowWrite(key, value);
    if (!check.ok) {
      warn('Einstellung abgewiesen:', loggedKey(key), check.reason);
      return { ok: false, error: `settings:${check.reason}` };
    }
    store?.set(key, value);
    // 4T-001588 (Epic 3E-000160): Die Verteilung an die offenen Fenster liegt
    // seit dem Einlese-Weg in settings-verteilung.js — unveraendert, nur
    // erreichbar gemacht. Sie hat zwei Aufrufer: diesen Kanal und das
    // Einlesen einer Austausch-Datei, das im Hauptprozess schreibt und
    // dieselbe Verteilung braucht. Ein zweiter Verteil-Block waere ein
    // Doppel-Mechanismus ohne gemeinsame Heimat (Fehlerklasse L5).
    verteileEinstellung(key, value, event.sender);
    return { ok: true };
  });

  // 4T-002650 (Epic 3E-000416): Schalter «Skript-Blöcke ausführen». Antwort
  // `{ ok: true, enabled }` mit dem Stand nach dem Aufruf; nach «Abbrechen»
  // bleibt er, wie er war. Die Verteilung meldet ihn allen Fenstern.
  handle('settings:setScriptsRun', async (event, on) => {
    if (typeof on !== 'boolean') return { ok: false, error: 'settings:invalidValue' };
    const before = store?.get(SCRIPTS_RUN_KEY) === true;
    if (on && !before) {
      const owner = senderWindow(event);
      const t = (k) => tForWindow(owner, k);
      const result = await dialog.showMessageBox(owner || undefined, {
        type: 'warning',
        title: t('settings.runScriptBlocks.confirmTitle'),
        message: t('settings.runScriptBlocks.confirmMessage'),
        buttons: [
          t('settings.runScriptBlocks.confirmEnable'),
          t('settings.runScriptBlocks.confirmCancel'),
        ],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (result.response !== 0) return { ok: true, enabled: false };
    }
    if (on !== before) {
      store?.set(SCRIPTS_RUN_KEY, on);
      verteileEinstellung(SCRIPTS_RUN_KEY, on, event.sender);
    }
    return { ok: true, enabled: on };
  });

  // Renderer meldet ein aktives Datei-Oeffnen, damit der Pfad in die Recent-
  // Liste rutscht. Wird in openInPane aufgerufen, nicht beim Restore/Reload.
  handle('recent:push', (event, filePath) => {
    // W-21 (4T-000309): Typ-Guard — path.resolve(nichtString) wirft TypeError.
    if (typeof filePath !== 'string' || !filePath) return;
    const absolute = path.resolve(filePath);
    pushRecent(absolute);
    // 4T-000843 (Epic 3E-000147): Genau hier meldet der Renderer JEDES aktive
    // Datei-Oeffnen (Datei-Dialog, Explorer-Doppelklick, Zuletzt-Liste,
    // Klick im Panel), und nur das aktive, nicht Restore und Reload. Ist
    // die Datei die Buch-Datei ihres Ordners, wird das Buch zusaetzlich
    // aktiv (Story 4S-000752, AK2). Fire-and-forget: das Oeffnen wartet nicht
    // auf die Erkennung.
    //
    // 4T-000873 (Story 4S-000760, AK7): Zuerst das strikte Regal-Routing. Greift
    // es (Datei liegt in einem Buch des offenen Regals), ist die Datei damit
    // in der Buch-Applikation gelandet und die beiden Erkennungen unten
    // haetten im Regal-Fenster nichts mehr zu tun.
    const win = senderWindow(event);
    void routeShelfFileToBookApp(win, absolute).then((umgeleitet) => {
      if (umgeleitet) return;
      void bindBookIfBookFile(win, absolute);
      // 4T-000867 (Epic 3E-000162): dieselbe Erkennung fuer die Regal-Datei
      // (Story 4S-000760, AK2).
      void bindShelfIfShelfFile(win, absolute);
    });
  });

  handle('theme:current', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'));

  // 4T-000030: Theme-Vorzug auslesen/setzen. 'system' folgt dem OS, 'light'/'dark'
  // erzwingt das jeweilige Theme app-weit. Bei Aenderung wird nativeTheme.
  // themeSource gesetzt (loest implizit 'updated' aus, broadcast 'theme:changed'),
  // der Pref wird persistiert und an alle Fenster gebrodcastet, damit Menu-
  // Radios und Statusbar-Icon synchron bleiben.
  handle('theme:getPref', () => {
    const value = store?.get('themePref');
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  });
  handle('theme:setPref', (_event, value) => {
    const normalized =
      value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
    if (store) store.set('themePref', normalized);
    nativeTheme.themeSource = normalized;
    broadcast('theme:prefChanged', normalized);
    applyMenuToAllWindows();
  });
}

module.exports = { registerSettingsIpc };
