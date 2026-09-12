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
// Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const { createSettingsVerteilung } = require('./settings-verteilung');

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
  } = deps;
  // 4T-000999: registerIpc laeuft nach loadStore, der Speicher steht also fest.
  // Der Bezeichner bleibt `store`, damit die Handler-Rumpfe unveraendert sind.
  const store = getStore();
  // 4T-001588: dieselbe Verteilung, die auch das Einlesen benutzt.
  const verteileEinstellung = createSettingsVerteilung(deps);

  handle('settings:get', (_event, key) => store?.get(key));
  handle('settings:set', (event, key, value) => {
    store?.set(key, value);
    // 4T-001588 (Epic 3E-000160): Die Verteilung an die offenen Fenster liegt
    // seit dem Einlese-Weg in settings-verteilung.js — unveraendert, nur
    // erreichbar gemacht. Sie hat zwei Aufrufer: diesen Kanal und das
    // Einlesen einer Austausch-Datei, das im Hauptprozess schreibt und
    // dieselbe Verteilung braucht. Ein zweiter Verteil-Block waere ein
    // Doppel-Mechanismus ohne gemeinsame Heimat (Fehlerklasse L5).
    verteileEinstellung(key, value, event.sender);
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
