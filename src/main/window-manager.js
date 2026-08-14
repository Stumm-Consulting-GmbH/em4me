// Fenster-Verwaltung des Hauptprozesses: Multi-Window-Registry, Erzeugung
// eines Fensters samt seiner Ereignis-Verdrahtung, Fokus-Fuehrung, Broadcast
// an alle Fenster und die Schliess-Kaskade einer Applikation.
//
// Auszug aus main.js, 4T-0998 (Epic 3E-0196). Die Rumpf-Inhalte reisen
// unveraendert mit; geaendert sind allein die Naehte zu den Nachbar-Modulen,
// die frueher freie Variablen derselben Datei waren.
//
// Eigentuemer-Zustand dieses Moduls:
//   windows           : Map<webContents.id, BrowserWindow>
//   pendingInitPanes  : Map<webContents.id, panes-Array>
//     Wird beim Erstellen eines Fensters mit Pane-Inhalt gefuellt und beim
//     'did-finish-load' an den Renderer geschickt. Format identisch zum alten
//     'panes'-Settings-Schluessel: [{ paths, activeIndex, tabSettings }].
//   pendingInitDrafts : beim Start zugeteilte Entwuerfe pro Fenster
//   windowMeta        : Map<webContents.id, { activeTabName, tabCount }>
//   confirmedClosings : bereits abgenickte Fenster (Dirty-Dialog)
//   appLastFocused    : Map<appId, windowId>
//   lastFocusedId     : id des zuletzt fokussierten Fensters
//   isQuitting        : true ab 'before-quit'
//   cascadeCancel     : Abbruch-Haken der laufenden Schliess-Kaskade
//
// Fremder Zustand kommt ueber das Deps-Objekt: als Wert, wo das Eigentuemer-
// Modul frueher konstruiert wird (lastReportedPanes), sonst als GETTER
// (menuStates(), activeBooks(), activeShelves(), workspacesState()). Fenster-Verwaltung,
// Persistenz, Bereiche, Buecher und Menue brauchen einander wechselseitig;
// ein Wert zur Konstruktions-Zeit ergaebe dort einen Reihenfolge-Zyklus.
'use strict';

const path = require('node:path');
const { BrowserWindow, shell, nativeTheme } = require('electron');
const backlinks = require('./backlinks');

/**
 * Baut die Fenster-Verwaltung.
 *
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.appRegistry App-Registry (Fenster -> logische Applikation).
 * @param {boolean} deps.imTestlauf E2E-Lauf erkannt (Fenster ohne Fokus).
 * @param {() => object|null} deps.getStore Settings-Store (erst nach loadStore da).
 * @param {(bounds: object) => boolean} deps.isBoundsVisibleOnAnyDisplay Sichtbarkeits-Pruefung.
 * @param {(win: object) => void} deps.scheduleSaveBoundsAndPersist Debounced Bounds-Sicherung.
 * @param {() => void} deps.persistAllWindows Sitzungs-Persistenz aller Fenster.
 * @param {(id: number) => void} deps.clearSaveBoundsTimer Offenen Bounds-Timer verwerfen.
 * @param {Map} deps.lastReportedPanes Zuletzt gemeldete Pane-Struktur je Fenster.
 * @param {() => Map} deps.menuStates Menue-Zustand je Fenster.
 * @param {() => Map} deps.activeBooks Aktives Buch je Applikation.
 * @param {() => Map} deps.activeShelves Aktives Regal je Applikation.
 * @param {() => Array} deps.workspacesState Arbeitsbereichs-Ablage.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(win: object) => void} deps.updateCaptionColor Titelleisten-Farbe angleichen.
 * @param {() => void} deps.workspacesChanged Menues und Renderer nach Ablage-Aenderung.
 * @param {(appId: number) => void} deps.stopAreaWatcher Bereichs-Watcher beenden.
 * @param {(win: object) => void} deps.applyMenuToWindow Menue eines Fensters setzen.
 * @param {() => void} deps.broadcastDisplayInfo Anzeige-Infos verteilen.
 * @param {(id: number) => Promise<void>} deps.unwatchAllForOwner Datei-Watcher freigeben.
 * @param {() => string[]} deps.pendingSecondInstanceFiles Warteschlange der Zweitstart-Dateien.
 * @param {() => void} deps.onBacklinksInvalidated Anstoss nach Index-Invalidierung.
 * @returns {object} Fenster-API samt der Zustands-Behaelter dieses Moduls.
 */
function createWindowManager(deps) {
  const {
    appRegistry,
    imTestlauf,
    getStore,
    isBoundsVisibleOnAnyDisplay,
    scheduleSaveBoundsAndPersist,
    persistAllWindows,
    clearSaveBoundsTimer,
    lastReportedPanes,
    menuStates,
    activeBooks,
    activeShelves,
    workspacesState,
    areaOfWindow,
    updateCaptionColor,
    workspacesChanged,
    stopAreaWatcher,
    applyMenuToWindow,
    broadcastDisplayInfo,
    unwatchAllForOwner,
    pendingSecondInstanceFiles,
    onBacklinksInvalidated,
  } = deps;

  const windows = new Map();
  const pendingInitPanes = new Map();
  // 4T-0368: pro Fenster die beim Start zugeteilten Entwuerfe (Unbenannt-Tabs
  // mit Inhalt), analog pendingInitPanes; via window:initialState ausgeliefert.
  const pendingInitDrafts = new Map();
  let lastFocusedId = null;
  let isQuitting = false;

  // Fenster, die der Nutzer im Renderer schon abgenickt hat ("Speichern" /
  // "Verwerfen" bei dirtigen Tabs). Verhindert, dass der on('close')-Hook den
  // Dialog ein zweites Mal aufruft beim folgenden win.close().
  const confirmedClosings = new Set();

  // Zuletzt fokussiertes Fenster pro App — Ziel fuer "erneutes Oeffnen
  // fokussiert" (Workshop-Punkt 3: Fokus aufs zuletzt aktive Fenster).
  const appLastFocused = new Map(); // appId -> windowId

  // Pro Fenster vom Renderer gemeldete Anzeige-Infos fuer die Fenster-Liste
  // und das Titel-Suffix (4T-0012): aktiver Dateiname und Tab-Anzahl. Wird in
  // window:list ausgeliefert, damit das Tab-Kontextmenue eines anderen Fensters
  // Tooltips ohne Renderer-Round-Trip aufbauen kann.
  const windowMeta = new Map(); // ownerId -> { activeTabName, tabCount }

  // Holt ein Fenster in den Vordergrund. Im Testlauf ein No-op (Begruendung
  // bei IM_TESTLAUF in main.js): Genau dieser Sprung nach vorn ist es, der die
  // Eingaben des Anwenders abfaengt.
  function inDenVordergrund(win) {
    if (!win || win.isDestroyed() || imTestlauf) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  }

  // Liefert das aktuell „relevante" Fenster (zuletzt fokussiert, fallback: irgendeins).
  function getActiveWindow() {
    if (lastFocusedId && windows.has(lastFocusedId)) return windows.get(lastFocusedId);
    const first = windows.values().next();
    return first.done ? null : first.value;
  }

  // 4T-0323 (Epic 3E-0058): Datei-Argumente aus Explorer/CLI landen immer in
  // einer Applikation OHNE Bereich (Bereiche sind fix und werden nur innerhalb
  // der Applikation bedient): bevorzugt das zuletzt fokussierte bereichslose
  // Fenster, sonst irgendein bereichsloses; null, wenn nur Bereichs-Apps laufen.
  function getActiveNonAreaWindow() {
    const last = lastFocusedId != null ? windows.get(lastFocusedId) : null;
    if (last && !last.isDestroyed() && !areaOfWindow(last)) return last;
    for (const win of windows.values()) {
      if (!win.isDestroyed() && !areaOfWindow(win)) return win;
    }
    return null;
  }

  // Broadcast an alle aktiven Fenster.
  function broadcast(channel, ...args) {
    for (const win of windows.values()) {
      if (!win.isDestroyed()) win.webContents.send(channel, ...args);
    }
    // 4T-0525 (Epic 3E-0095): eine Index-Invalidierung stoesst zusaetzlich
    // einen Erinnerungs-Pruef-Lauf an — der Nachhol-Dialog erscheint damit
    // direkt nach dem Index-Aufbau statt erst mit dem naechsten 30-Sekunden-
    // Takt (der Lauf ist durch die ⏰-Vorpruefung billig und im Index-Fluss
    // bereits 200 ms debounced).
    if (channel === 'backlinks:invalidated') onBacklinksInvalidated();
  }

  // "Bereich schliessen" schliesst alle Fenster der Bereichs-App ueber den
  // regulaeren Close-Pfad (Speichern-Nachfragen pro Dokument). Sequenziell,
  // damit ein Nutzer-Abbruch (Speichern-Dialog -> Abbrechen) die Kaskade
  // stoppt; window:cancelClose meldet den Abbruch hierher.
  let cascadeCancel = null;

  function closeWindowAndWait(win) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        cascadeCancel = null;
        resolve(result);
      };
      cascadeCancel = () => finish(false);
      win.once('closed', () => finish(true));
      win.close();
    });
  }

  // Gemeinsamer Kaskaden-Kern fuer "Bereich schliessen" und "Arbeitsbereich
  // schliessen" (4T-0537): alle Fenster der App sequenziell ueber den
  // regulaeren Close-Pfad, Nutzer-Abbruch stoppt die Kaskade.
  async function closeAppWindows(appId) {
    for (const windowId of [...appRegistry.windowsOf(appId)]) {
      const win = windows.get(windowId);
      if (!win || win.isDestroyed()) continue;
      const closed = await closeWindowAndWait(win);
      if (!closed) return { ok: false, canceled: true };
    }
    return { ok: true };
  }

  async function closeAreaApp(appId) {
    if (!appRegistry.getArea(appId)) return { ok: false };
    return closeAppWindows(appId);
  }

  // Erstellt ein neues Fenster. opts:
  //   bounds, maximized   - Startposition/-groesse, optional
  //   initialPanes        - Pane-Snapshots ([{paths, activeIndex, tabSettings}, ...]),
  //                         die der Renderer beim Start uebernimmt. Bei Restore aus
  //                         der Sitzung gefuellt; bei "Tab in neues Fenster" mit
  //                         genau einer Pane und einem Tab; sonst leer.
  //   appId               - logische Applikation, zu der das Fenster gehoert
  //                         (4T-0318). Ohne gueltige appId wird eine neue App
  //                         angelegt (Kaltstart, "Neue Applikation").
  //   area                - Bereichs-Bindung { rootPath, name } fuer die NEU
  //                         angelegte App (4T-0322); ignoriert, wenn appId
  //                         eine bestehende App adressiert.
  function createWindow(opts = {}) {
    const useStored = isBoundsVisibleOnAnyDisplay(opts.bounds);

    const options = {
      width: 1200,
      height: 800,
      minWidth: 600,
      minHeight: 400,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
      icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        // 4T-0784 (Epic 3E-0156): Ein Fenster ohne Fokus gilt Chromium als im
        // Hintergrund und bekaeme gedrosselte Timer. Das aenderte das
        // Zeitverhalten und damit Testergebnisse. Nur im Testlauf abgeschaltet;
        // im Auslieferungs-Zustand bleibt die Drosselung, weil sie bei
        // Fenstern im Hintergrund Rechenzeit spart.
        ...(imTestlauf ? { backgroundThrottling: false } : {}),
        // 4T-0581 (Epic 3E-0107): Rechtschreibpruefung des Betriebssystems.
        // Der Wert steht bewusst FEST auf true und folgt NICHT dem Schalter:
        // Messung vom 2026-08-02 an Electron 33 — ein mit spellcheck:false
        // erzeugtes WebContents laesst sich spaeter durch nichts mehr zum
        // Pruefen bewegen, auch nicht durch setSpellCheckerEnabled(true).
        // Der eigentliche Schalter sitzt deshalb im Renderer am Content-
        // Attribut der Editor-Flaeche (editor.js, spellcheck-Compartment);
        // CodeMirror setzt dort von Haus aus spellcheck="false", der
        // Aus-Zustand ist damit exakt das Verhalten ohne diese Erweiterung.
        // Bewusst NICHT gesetzt wird die Pruefsprache: Electron uebernimmt
        // sie von selbst aus dem Betriebssystem, und jeder eigene
        // setSpellCheckerLanguages-Aufruf stoesst den Download eines
        // Woerterbuchs aus dem Netz an (Architekturentscheidung 6 des Epics,
        // Waechter in test/unit/spellcheck.test.js).
        spellcheck: true,
      },
    };
    // Workaround fuer Electron-Multi-Monitor-DPI-Bug (electron/electron Issues
    // #10862, #16444, #31999): bei Setups mit unterschiedlicher Per-Monitor-DPI
    // werden width/height beim BrowserWindow-Konstruktor sowie beim ersten
    // setBounds-Aufruf um den Skalierungsfaktor verzerrt, weil Electron sie in
    // DIPs des Quell- oder Primaermonitors interpretiert. Loesung: Fenster mit
    // Default-Optionen erzeugen (landet auf Primary), dann setBounds zweimal
    // hintereinander aufrufen. Der erste Aufruf verschiebt das Fenster auf den
    // Zielmonitor und triggert die DPI-Erkennung; der zweite Aufruf setzt die
    // Bounds mit der dann aktiven korrekten Ziel-DPI (4T-0025).
    const win = new BrowserWindow(options);
    const id = win.webContents.id;
    windows.set(id, win);
    lastFocusedId = id;
    const appId =
      opts.appId != null && appRegistry.hasApp(opts.appId)
        ? opts.appId
        : appRegistry.createApp(opts.area || null);
    appRegistry.assignWindow(id, appId);
    // 4T-0630 (Epic 3E-0102): Arbeitsbereichs-Farbe der Titelleiste sofort
    // nach der App-Zuordnung setzen — vor dem ready-to-show-Anzeigen, damit
    // der Sitzungs-Restore und workspace:create/open ohne Nachflackern
    // gefaerbt erscheinen ('Tab in neues Fenster' erbt ueber dieselbe Stelle).
    updateCaptionColor(win);

    if (useStored) {
      const targetBounds = {
        x: opts.bounds.x,
        y: opts.bounds.y,
        width: Math.max(opts.bounds.width, options.minWidth),
        height: Math.max(opts.bounds.height, options.minHeight),
      };
      win.setBounds(targetBounds);
      win.setBounds(targetBounds);
      if (opts.maximized) win.maximize();
    }

    applyMenuToWindow(win);

    const initPanes = Array.isArray(opts.initialPanes) ? opts.initialPanes : [];
    pendingInitPanes.set(id, initPanes);
    // Damit der Renderer den ersten 'reportPanes'-Push nicht versehentlich auf
    // einen veralteten Stand setzt, merken wir uns die initiale Pane-Struktur
    // sofort auch als "letzten gemeldeten Stand" dieses Fensters.
    lastReportedPanes.set(id, initPanes);
    // 4T-0368: beim Start zugeteilte Entwuerfe dieses Fensters (nur das erste
    // Fenster einer App bekommt welche; sonst leer).
    pendingInitDrafts.set(id, Array.isArray(opts.initialDrafts) ? opts.initialDrafts : []);

    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

    // 4T-0784 (Epic 3E-0156): Im E2E-Lauf ohne Fokus zeigen. showInactive()
    // bringt das Fenster auf den Bildschirm, ohne es zu aktivieren; es rendert
    // damit normal, nimmt aber keine Tastatureingaben entgegen.
    win.once('ready-to-show', () => (imTestlauf ? win.showInactive() : win.show()));

    // Initialen Zustand IMMER schicken — auch leer. So kann der Renderer
    // deterministisch darauf warten und entscheidet nicht selbst per Timeout,
    // wann er mit dem Rendern starten darf.
    // M-13 (4T-0173): 'on' statt 'once' — nach einem Renderer-Reload
    // (DevTools, Strg+R) blockierte der frisch geladene Renderer sonst
    // dauerhaft auf initialStatePromise (leeres Fenster). Beim erneuten Load
    // wird der zuletzt gemeldete Pane-Stand dieses Fensters gesendet.
    win.webContents.on('did-finish-load', () => {
      const pending = pendingInitPanes.get(id);
      const panes = pending !== undefined ? pending : lastReportedPanes.get(id) || [];
      // 4T-0368: Entwuerfe nur beim ERSTEN Load ausliefern (delete vor dem
      // naechsten did-finish-load nach einem Renderer-Reload), sonst wuerden sie
      // doppelt geoeffnet.
      const drafts = pendingInitDrafts.get(id) || [];
      pendingInitDrafts.delete(id);
      win.webContents.send('window:initialState', { panes, drafts });
      pendingInitPanes.delete(id);
      // M-02 (4T-0173): waehrend der Ladephase eingegangene second-instance-
      // Dateien jetzt nachreichen (Muster des Kaltstart-Pfads in whenReady).
      // 4T-0323: nur bereichslose Fenster leeren die Queue — sonst koennte
      // beim Restore ein frueher ladendes Bereichs-Fenster Explorer-Dateien
      // an sich ziehen.
      if (pendingSecondInstanceFiles().length > 0 && !areaOfWindow(win)) {
        const files = pendingSecondInstanceFiles().splice(0);
        win.webContents.send('file:openExternal', files);
      }
      // Erst NACH initialState die Display-Infos verteilen, damit das brandneue
      // Fenster bereits den Renderer-State (panes, Titel) aufbauen konnte und
      // direkt im Anschluss seine Nummer kennt. Alle anderen Fenster bekommen
      // die aktualisierte totalCount.
      broadcastDisplayInfo();
    });

    // Fokus tracken (fuer second-instance-Routing; seit 4T-0537 auch pro App
    // fuer das "erneutes Oeffnen fokussiert" der Arbeitsbereiche).
    win.on('focus', () => {
      lastFocusedId = id;
      const focusedAppId = appRegistry.appOf(id);
      if (focusedAppId != null) appLastFocused.set(focusedAppId, id);
    });

    // Bounds-Aenderungen debounced persistieren.
    win.on('move', () => scheduleSaveBoundsAndPersist(win));
    win.on('resize', () => scheduleSaveBoundsAndPersist(win));
    win.on('maximize', () => persistAllWindows());
    win.on('unmaximize', () => persistAllWindows());

    win.on('close', (e) => {
      // Dirty-Check: wenn der Renderer noch nicht bestaetigt hat, dass das
      // Schliessen OK ist, Frage an ihn weiterreichen. Beim App-Quit greift
      // dieselbe Logik pro Fenster.
      if (!confirmedClosings.has(win)) {
        e.preventDefault();
        if (!win.isDestroyed()) win.webContents.send('window:requestClose');
        return;
      }
      confirmedClosings.delete(win);
      clearSaveBoundsTimer(id);
      // Stand persistieren, solange dieses Fenster noch in der `windows`-Map
      // steht und nicht destroyed ist. Sonst geht beim Schliessen des letzten
      // Fensters die Position verloren, weil der nachgelagerte 'closed'-Handler
      // nur noch eine leere Map sehen wuerde (4T-0025).
      if (!isQuitting) persistAllWindows();
    });

    win.on('closed', async () => {
      windows.delete(id);
      // 4T-0537: Arbeitsbereichs-Zuordnung VOR removeWindow lesen — mit dem
      // letzten Fenster verschwindet die App samt Zuordnung aus der Registry.
      const appIdBefore = appRegistry.appOf(id);
      const wsBefore = appIdBefore != null ? appRegistry.getWorkspace(appIdBefore) : null;
      const removedAppId = appRegistry.removeWindow(id);
      // 4T-0328: verschwindet die App komplett, endet ihr Bereichs-Watcher.
      if (removedAppId != null && !appRegistry.hasApp(removedAppId)) {
        stopAreaWatcher(removedAppId);
        appLastFocused.delete(removedAppId);
        // 4T-0843 (Epic 3E-0147): Buch-Bindung der verschwundenen App loesen
        // (der persistierte Stand ist im 'close'-Handler bereits geschrieben).
        activeBooks().delete(removedAppId);
        // 4T-1031 (Epic 3E-0207): dasselbe fuer die Regal-Bindung. Sie fehlte
        // hier, und der Rest war kein blosser Speicher-Rest: `findAppByShelf`
        // sucht die laufende Regal-Applikation genau in dieser Map, fand die
        // tote App und liess das erneute Oeffnen den Zweig «Regal laeuft schon»
        // nehmen, statt ein Fenster zu bauen. Das Regal blieb damit bis zum
        // Neustart unerreichbar (Befund vom 2026-08-12, gemessen am
        // 2026-08-13). Von den fuenf App-gebundenen Behaeltern raeumten vier
        // auf; dieser war der einzige, der es nicht tat.
        activeShelves().delete(removedAppId);
        // 4T-0537: letztes Fenster eines Arbeitsbereichs ausserhalb des Quits
        // friert den Stand ein (Offen-Merker false; der 'close'-Handler hat den
        // Endstand bereits persistiert). Beim Quit bleibt der Merker true —
        // genau das oeffnet den Arbeitsbereich bei der Sitzungs-
        // Wiederherstellung wieder. Nur der 'workspaces'-Key wird geschrieben;
        // die apps/Bounds-Schutzlogik (4T-0025) bleibt unberuehrt.
        if (wsBefore && !isQuitting) {
          const wsEntry = workspacesState().find((w) => w.id === wsBefore.id);
          if (wsEntry) {
            wsEntry.open = false;
            const store = getStore();
            if (store) store.set('workspaces', workspacesState());
            workspacesChanged();
          }
        }
      }
      lastReportedPanes.delete(id);
      pendingInitPanes.delete(id);
      menuStates().delete(id);
      windowMeta.delete(id);
      if (lastFocusedId === id) {
        lastFocusedId = null;
        const first = windows.keys().next();
        if (!first.done) lastFocusedId = first.value;
      }
      await unwatchAllForOwner(id);
      // B-02 (4T-0175): Backlinks-Roots dieses Fensters freigeben, sonst
      // bleiben Indexe samt Watcher fuer die Prozess-Lebensdauer bestehen.
      backlinks.releaseAllForOwner(id);
      // Nur persistieren, wenn nach dem `windows.delete(id)` noch andere Fenster
      // uebrig sind. Sonst wuerde eine leere Liste die zuletzt gemerkten Bounds
      // des soeben geschlossenen letzten Fensters ueberschreiben (4T-0025; das
      // 'close'-Event hat den Stand inkl. dieses Fensters bereits persistiert).
      if (!isQuitting && windows.size > 0) {
        persistAllWindows();
        // Display-Nummern der verbliebenen Fenster ruecken nach; sinkt die Zahl
        // auf 1, wird der `(Fenster N)`-Suffix beim verbleibenden ausgeblendet.
        broadcastDisplayInfo();
      }
    });

    // Externe Links im Standardbrowser.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    // M-17 (4T-0176): Defense-in-Depth — keine In-Place-Navigation des
    // Renderers (setWindowOpenHandler deckt nur window.open ab). Der eigene
    // Erst-Load laeuft ueber loadFile, ein Renderer-Reload (Strg+R/DevTools)
    // loest kein will-navigate aus; pauschales preventDefault ist daher safe.
    win.webContents.on('will-navigate', (e) => e.preventDefault());

    // 4T-0582 (Epic 3E-0107): Vorschlags-Daten der Rechtschreibpruefung an den
    // Renderer weiterreichen. Chromium meldet das falsch geschriebene Wort und
    // seine Korrektur-Vorschlaege ausschliesslich hier im Main-Prozess; das
    // eigene HTML-Kontextmenue im Renderer kaeme sonst nicht an sie heran.
    //
    // Zeitliche Ordnung (gemessen am 2026-08-02): Das DOM-Ereignis contextmenu
    // laeuft zuerst im Renderer, dieses Ereignis danach; die Daten treffen
    // 0,3 bis 2,2 ms nach dem Menue-Aufbau im Renderer ein und damit im selben
    // Bild. Der Renderer baut das Menue deshalb sofort und ergaenzt die
    // Vorschlags-Sektion beim Eintreffen (editor-context-menu.js).
    //
    // Voraussetzung dafuer ist, dass der Renderer das DOM-Ereignis NICHT mit
    // preventDefault abbricht: ein Abbruch unterdrueckt dieses Ereignis
    // vollstaendig (ebenfalls gemessen). Ein natives Menue entsteht dadurch
    // nicht, weil Electron von sich aus keines anbietet.
    win.webContents.on('context-menu', (_e, params) => {
      if (win.isDestroyed()) return;
      win.webContents.send('spellcheck:context', {
        word: typeof params.misspelledWord === 'string' ? params.misspelledWord : '',
        suggestions: Array.isArray(params.dictionarySuggestions)
          ? params.dictionarySuggestions
          : [],
      });
    });

    return win;
  }

  // 4T-0322: laufende Bereich-Schliessen-Kaskade abbrechen (window:cancelClose).
  function cancelCascade() {
    if (cascadeCancel) cascadeCancel();
  }

  // Quit-Merker; ab 'before-quit' true, window:cancelClose setzt ihn zurueck.
  function setQuitting(value) {
    isQuitting = !!value;
  }

  return {
    windows,
    windowMeta,
    confirmedClosings,
    appLastFocused,
    inDenVordergrund,
    getActiveWindow,
    getActiveNonAreaWindow,
    broadcast,
    createWindow,
    closeAppWindows,
    closeAreaApp,
    cancelCascade,
    setQuitting,
  };
}

module.exports = { createWindowManager };
