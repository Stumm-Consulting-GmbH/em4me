// IPC-Kanal-Gruppe Einstellungen: Lesen und Schreiben des Einstellungs-
// Speichers samt der Verteilung jeder Aenderung an die offenen Fenster, dazu
// die Zuletzt-Liste und der Theme-Vorzug.
//
// Auszug aus main.js, 4T-0999 (Epic 3E-0196). Kanal-Gruppe: settings:*,
// recent:push, theme:*.
//
// Eigener Zustand: keiner. Der Broadcast-Weg von settings:set laeuft bewusst
// weiterhin ueber BrowserWindow.getAllWindows() und nicht ueber broadcast();
// eine Angleichung waere eine Verhaltens-Aenderung (4T-0999, Stolperstein 1).
'use strict';

const path = require('node:path');
const { SPELLCHECK_KEY } = require('../../shared/spellcheck');
const { CLOCK_ALARMS_KEY } = require('../../shared/clock/clock-alarms.js');
const { CLOCK_TIMERS_KEY } = require('../../shared/clock/clock-timers.js');

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
    BrowserWindow,
    nativeTheme,
    senderWindow,
    getStore,
    applyMenuToAllWindows,
    updateAllCaptionColors,
    timerChecker,
    pushRecent,
    routeShelfFileToBookApp,
    bindBookIfBookFile,
    bindShelfIfShelfFile,
    broadcast,
  } = deps;
  // 4T-0999: registerIpc laeuft nach loadStore, der Speicher steht also fest.
  // Der Bezeichner bleibt `store`, damit die Handler-Rumpfe unveraendert sind.
  const store = getStore();

  handle('settings:get', (_event, key) => store?.get(key));
  handle('settings:set', (event, key, value) => {
    store?.set(key, value);
    // 4T-0581 (Epic 3E-0107): Schalter der Rechtschreibpruefung an alle
    // Fenster verteilen (Muster 'taskStates', einschliesslich des Senders —
    // der Empfangspfad rekonfiguriert die Editor-Compartments idempotent).
    if (key === SPELLCHECK_KEY) {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('spellcheck:changed', value === true);
      }
    }
    // Menue-relevante Settings spiegeln sich in den Haekchen wider. Bei einem
    // Wechsel in einem Fenster muessen alle Fenster-Menues angepasst werden.
    if (key === 'restoreSession' || key === 'autoSave') applyMenuToAllWindows();
    // M-08 (4T-0185): Sprachwechsel an alle anderen offenen Fenster
    // verteilen — vorher wirkte er nur im ausloesenden Fenster, die
    // uebrigen blieben bis zum Neustart in der alten Sprache. Das
    // ausloesende Fenster hat lokal bereits umgeschaltet.
    if (key === 'language') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.webContents !== event.sender) {
          w.webContents.send('language:changed', value);
        }
      }
    }
    // 4T-0204: Task-Status-Set an alle Fenster broadcasten (auch an den
    // Sender — der Empfangspfad konfiguriert idempotent Pipeline und
    // Live-Modus und rendert offene Tabs neu).
    if (key === 'taskStates') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('taskStates:changed', value);
      }
    }
    // 4T-0612 (Epic 3E-0115, PO-Testbefund EXE 0.91.0.919): Der globale
    // (allgemeine) Lesezeichen-Baum liegt im Store und erreichte andere Fenster
    // bisher nicht — nur die BEREICHS-Lesezeichen synchronisierten ueber
    // 'bookmarks:changed'. Den Wechsel jetzt an die uebrigen Fenster verteilen
    // (Muster 'language:changed', ohne das ausloesende Fenster — das hat seinen
    // Baum bereits im Speicher aktualisiert und gerendert). Der Empfangspfad
    // uebernimmt den Baum und rendert den allgemeinen Abschnitt neu.
    if (key === 'bookmarksTree') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.webContents !== event.sender) {
          w.webContents.send('bookmarksTree:changed', value);
        }
      }
    }
    // 4T-0498 (Epic 3E-0090): Aufgaben-Konfiguration (Global Filter,
    // Automatiken, Einfuege-Position) an alle Fenster broadcasten (auch an
    // den Sender — Muster taskStates).
    if (key === 'tasksConfig') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('tasksConfig:changed', value);
      }
    }
    // 4T-0528 (Epic 3E-0095): Erinnerungs-Konfiguration (Default-Uhrzeit,
    // Snooze-Optionen, System-Notification) an alle Fenster; der Main-
    // Pruefer liest pro Lauf ohnehin frisch aus dem Store.
    if (key === 'remindersConfig') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('remindersConfig:changed', value);
      }
    }
    // 4T-0284 (Epic 3E-0050): Frontmatter-Anzeige an alle Fenster
    // broadcasten (auch an den Sender — der Empfangspfad konfiguriert
    // idempotent die Pipeline, invalidiert den Render-Cache und rendert
    // offene Tabs neu).
    if (key === 'render.showFrontmatter') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('frontmatterDisplay:changed', value);
      }
    }
    // 4T-0471 (Epic 3E-0087): Ueberschriften-Nummerierung (Objekt { enabled,
    // startLevel }) an alle Fenster broadcasten (auch an den Sender — der
    // Empfangspfad konfiguriert idempotent die Pipeline, invalidiert den
    // Render-Cache und rendert offene Tabs neu; Live und Outline ziehen mit).
    if (key === 'render.headingNumbering') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('headingNumbering:changed', value);
      }
    }
    // 4T-0312 (Epic 3E-0055): dauerhaft ausgeklappte Frontmatter-Darstellung
    // an alle Fenster broadcasten (auch an den Sender — der Empfangspfad
    // toggelt idempotent eine Root-Klasse).
    if (key === 'render.frontmatterExpanded') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('frontmatterExpanded:changed', value);
      }
    }
    // 4T-0414 (Epic 3E-0078): Skript-Block-Schalter an alle Fenster
    // broadcasten (auch an den Sender — der Empfangspfad wendet idempotent
    // an, ein unveraenderter Zustand ist dort ein No-op).
    if (key === 'scripts.run') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('perspectiveScripts:changed', value);
      }
    }
    // 4T-0292 (Epic 3E-0052): Erweiterungs-Schalt-Zustand an alle Fenster
    // broadcasten (auch an den Sender — der Empfangspfad wendet mit
    // persist:false an, ein unveraenderter Zustand ist dort ein No-op).
    // Menues neu bauen, damit Eintraege deaktivierter Erweiterungen
    // verschwinden (Filterung ueber die Kommando-Registry).
    if (key === 'extensions.disabled') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('extensions:changed', value);
      }
      applyMenuToAllWindows();
      // 4T-0630 (Epic 3E-0102): Erweiterung 'workspaces' aus -> Standard-
      // Titelleiste; ein -> Arbeitsbereichs-Farbe wieder anwenden.
      updateAllCaptionColors();
    }
    // 4T-0298 (Epic 3E-0053): Schalt-Zustand der EXTERNEN Erweiterungen an
    // alle Fenster broadcasten (auch an den Sender — der Empfangspfad laedt
    // Store-Stand und Scan neu und gleicht idempotent an). Die Enabled-Liste
    // wird vom Host immer als LETZTER Schluessel persistiert (nach trusted/
    // lastError), damit der Broadcast den fertigen Zustand sieht.
    if (key === 'extensionsExternal.enabled') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('extensionsExternal:changed', value);
      }
    }
    // 4T-0289 (Epic 3E-0051): Sidebar-Layout an alle Fenster broadcasten
    // (auch an den Sender — der Empfangspfad wendet mit persist:false an,
    // ein unveraendertes Layout ist dort ein No-op).
    if (key === 'sidebar.layout') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('sidebarLayout:changed', value);
      }
    }
    // 4T-0624 (Epic 3E-0119): globale Sidebar-Varianten an alle Fenster
    // broadcasten (Muster sidebar.layout: auch an den Sender, der
    // Empfangspfad normalisiert und persistiert nicht erneut).
    if (key === 'sidebar.layoutVariants') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('sidebarLayoutVariants:changed', value);
      }
    }
    // 4T-0569 (Epic 3E-0104): Panel-Toggle-Reihenfolge an alle Fenster
    // broadcasten (Muster sidebar.layout: auch an den Sender, Empfang mit
    // persist:false; die Statusbar-Anordnung und das Panel-Untermenue der
    // anderen Fenster ziehen sofort nach).
    if (key === 'panelToggle.order') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('panelToggleOrder:changed', value);
      }
    }
    // 4T-0520 (Epic 3E-0094): Kommando-Platzierung (eigene Statusbar-
    // Buttons, Kontextmenue-Sektion, Makros, Hide-Liste) an alle Fenster
    // broadcasten (Muster panelToggle.order: auch an den Sender, Empfang
    // mit persist:false; ein unveraenderter Stand ist dort ein No-op).
    if (key === 'commandPlacement') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('commandPlacement:changed', value);
      }
    }
    // 4T-0607 (Epic 3E-0114): Format-Toolbar-Belegung an alle Fenster
    // broadcasten (Muster commandPlacement).
    if (key === 'formatToolbar') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('formatToolbar:changed', value);
      }
    }
    // 4T-0372 (Epic 3E-0069): Uhr-Anzeige-Optionen an alle Fenster
    // broadcasten (Muster formatToolbar).
    if (key === 'clock.options') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('clock:changed', value);
      }
    }
    // 4T-0637 (Epic 3E-0069): Wecker-Liste an alle Fenster broadcasten
    // (Muster clock.options). Der Pruefer liest pro Lauf ohnehin frisch aus
    // dem Store und braucht kein eigenes Signal.
    if (key === CLOCK_ALARMS_KEY) {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('clockAlarms:changed', value);
      }
    }
    // 4T-0638 (Epic 3E-0069): Timer-Liste broadcasten und den Weckruf des
    // Pruefers nachziehen — ein neu gestarteter oder pausierter Timer
    // verschiebt den naechsten Ablauf.
    if (key === CLOCK_TIMERS_KEY) {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('clockTimers:changed', value);
      }
      timerChecker.reschedule();
    }
    // Die Stoppuhr hat keine Faelligkeit und braucht deshalb nur den
    // Broadcast.
    if (key === 'clock.stopwatch') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('clockStopwatch:changed', value);
      }
    }
    // 4T-0639 (Epic 3E-0069): Panel-Ueberschriften als Icon — an alle
    // Fenster ausser dem Ausloeser (der hat lokal bereits umgeschaltet).
    if (key === 'sidebar.iconHeadings') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.webContents !== event.sender) {
          w.webContents.send('sidebarIconHeadings:changed', value);
        }
      }
    }
    // 4T-0855 (Epic 3E-0164): Hoehen-Modell der Sidebar-Bloecke — an alle
    // Fenster ausser dem Ausloeser (Muster iconHeadings oben).
    if (key === 'sidebar.heightMode') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.webContents !== event.sender) {
          w.webContents.send('sidebarHeightMode:changed', value);
        }
      }
    }
    // 4T-0208: Hotkey-Overrides an alle Fenster broadcasten (auch an den
    // Sender — Empfang baut Dispatcher-Map und Editor-Keymap idempotent
    // neu) und die Menue-Accelerators aller Fenster aktualisieren.
    if (key === 'hotkeys') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('hotkeys:changed', value);
      }
      applyMenuToAllWindows();
    }
    // 4T-0018: appearance.*-Aenderung an alle Fenster broadcasten, damit
    // Schriftart und -groesse sofort ueberall greifen.
    if (typeof key === 'string' && key.startsWith('appearance.')) {
      const payload = {
        editorFont: store?.get('appearance.editorFont') || undefined,
        editorSize: store?.get('appearance.editorSize') || undefined,
        renderFont: store?.get('appearance.renderFont') || undefined,
        renderSize: store?.get('appearance.renderSize') || undefined,
        // 4T-0383 (Epic 3E-0072): Inhalts-Breite in Prozent; ungesetzt
        // (Alt-Profile) faellt der Empfaenger auf den Default zurueck.
        contentWidth: store?.get('appearance.contentWidth') || undefined,
        // 4T-0575 (Epic 3E-0106): Ecken-Form der Reiter. Bewusst als echter
        // Boolean statt nach dem ||-undefined-Muster darueber: der
        // Snapshot-Merge des Empfaengers (mergeAppearanceSnapshot) filtert
        // undefined heraus, ein Abschalten wuerde dort sonst nicht ankommen
        // und ein offener Einstellungs-Entwurf die Rundung zurueckdrehen.
        roundedTabs: store?.get('appearance.roundedTabs') === true,
        // 4T-0577 (Epic 3E-0106): Hervorhebung der Cursor-Zeile, ebenfalls
        // als echter Boolean (Default an, nur explizites false schaltet ab).
        highlightActiveLine: store?.get('appearance.highlightActiveLine') !== false,
      };
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('appearance:changed', payload);
      }
    }
    // 4T-0465 (Epic 3E-0086): Farbschema-Zustand (Objekt { custom, activeLight,
    // activeDark }) an alle Fenster broadcasten (auch an den Sender — der
    // Empfangspfad normalisiert und wendet idempotent an).
    if (key === 'colorSchemes') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('colorScheme:changed', value);
      }
    }
  });

  // Renderer meldet ein aktives Datei-Oeffnen, damit der Pfad in die Recent-
  // Liste rutscht. Wird in openInPane aufgerufen, nicht beim Restore/Reload.
  handle('recent:push', (event, filePath) => {
    // W-21 (4T-0309): Typ-Guard — path.resolve(nichtString) wirft TypeError.
    if (typeof filePath !== 'string' || !filePath) return;
    const absolute = path.resolve(filePath);
    pushRecent(absolute);
    // 4T-0843 (Epic 3E-0147): Genau hier meldet der Renderer JEDES aktive
    // Datei-Oeffnen (Datei-Dialog, Explorer-Doppelklick, Zuletzt-Liste,
    // Klick im Panel), und nur das aktive, nicht Restore und Reload. Ist
    // die Datei die Buch-Datei ihres Ordners, wird das Buch zusaetzlich
    // aktiv (Story 4S-0752, AK2). Fire-and-forget: das Oeffnen wartet nicht
    // auf die Erkennung.
    //
    // 4T-0873 (Story 4S-0760, AK7): Zuerst das strikte Regal-Routing. Greift
    // es (Datei liegt in einem Buch des offenen Regals), ist die Datei damit
    // in der Buch-Applikation gelandet und die beiden Erkennungen unten
    // haetten im Regal-Fenster nichts mehr zu tun.
    const win = senderWindow(event);
    void routeShelfFileToBookApp(win, absolute).then((umgeleitet) => {
      if (umgeleitet) return;
      void bindBookIfBookFile(win, absolute);
      // 4T-0867 (Epic 3E-0162): dieselbe Erkennung fuer die Regal-Datei
      // (Story 4S-0760, AK2).
      void bindShelfIfShelfFile(win, absolute);
    });
  });

  handle('theme:current', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'));

  // 4T-0030: Theme-Vorzug auslesen/setzen. 'system' folgt dem OS, 'light'/'dark'
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
