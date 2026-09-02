// Start-Ablauf des Main-Prozesses: Zustellung der Dateien aus Explorer- und
// CLI-Argumenten (Buch- und Regal-Dateien als eigene Applikationen, der Rest in
// die zuletzt fokussierte bereichslose Applikation) und der Rumpf von
// app.whenReady — Speicher laden, Pruefer starten, Theme vorbereiten, IPC
// registrieren, Sitzung und Entwuerfe wiederherstellen, Start-Dateien reichen.
//
// Auszug aus main.js, 4T-1000 (Epic 3E-0196). Rolle: Aufbau-Funktion ohne
// Lade-Zeit-Seiteneffekte; die App-Ereignisse selbst bleiben in main.js und
// leiten hierher weiter.
//
// Eigener Zustand: die Warteschlange der Zweitstart-Dateien. Sie liegt auf
// Modul-Ebene, weil die Fenster-Verwaltung ihren Getter schon bei der
// Verdrahtung braucht, also bevor createStartup laeuft. Der Behaelter behaelt
// dabei seine Identitaet; ersetzt wird er nie, nur befuellt und geleert.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { app, dialog, nativeTheme } = require('electron');
const { tForLocale } = require('../menu/menu');
const { loadStore } = require('./settings-store');
const { normalizeSavedApps, sitzungHatPanes } = require('./session-schema');
const { assignDraftsToApps } = require('../documents/draft-store');
const { isSamePath, areaFromRootPath } = require('../area/area-path');
const { konfiguriereBereichsSuche } = require('../area/area-search');
const netzPfade = require('../documents/network-paths');
const books = require('../books/books');
const shelves = require('../books/shelves');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');

// M-02 (4T-0173): second-instance-Dateien, die ankommen, bevor das erste
// Fenster ladefertig ist. Electron-IPC puffert nicht; ohne Queue verpufft
// der Send waehrend der Startphase der ersten Instanz.
const wartendeZweitstartDateien = [];

/**
 * Warteschlange der Zweitstart-Dateien (Behaelter mit fester Identitaet).
 *
 * @returns {string[]} Die Warteschlange selbst, keine Kopie.
 */
function gibWartendeZweitstartDateien() {
  return wartendeZweitstartDateien;
}

/**
 * Baut den Start-Ablauf auf.
 *
 * @param {object} deps Bezuege aus main.js und aus der Verdrahtung.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher.
 * @param {(store: object) => void} deps.setStore Geladenen Speicher an main.js melden.
 * @param {() => void} deps.registerIpc Registrierung aller IPC-Kanaele.
 * @param {(p: string) => boolean} deps.isMarkdownPath Markdown-Erkennung am Pfad.
 * @param {object} deps.appRegistry Registry der logischen Applikationen.
 * @param {Map} deps.windows Fenster-Register.
 * @param {(win: object) => void} deps.inDenVordergrund Fenster in den Vordergrund holen.
 * @param {() => object|null} deps.getActiveNonAreaWindow Zuletzt fokussiertes Fenster ohne Bereich.
 * @param {Function} deps.createWindow Fenster erzeugen.
 * @param {object[]} deps.workspacesState Arbeitsbereichs-Stand (Behaelter).
 * @param {Function} deps.setWorkspacesState Arbeitsbereichs-Stand setzen.
 * @param {() => number} deps.utcNowSeconds Zeitstempel in Sekunden (UTC).
 * @param {(appId: number) => void} deps.startAreaWatcher Bereichs-Watcher starten.
 * @param {Function} deps.openBookApp Buch als eigene Applikation oeffnen.
 * @param {Function} deps.restoreBookForApp Aktives Buch wiederherstellen.
 * @param {Function} deps.openShelfApp Regal als eigene Applikation oeffnen.
 * @param {Function} deps.restoreShelfForApp Aktives Regal wiederherstellen.
 * @param {(rootPath: string) => Promise<object|null>} deps.resolveAreaStartPage Start-Seite des Bereichs.
 * @param {Function} deps.readAllDrafts Entwuerfe lesen.
 * @param {Function} deps.removeDraftsByIds Entwuerfe entfernen.
 * @param {Function} deps.draftsToPayload Entwuerfe als Fenster-Nutzlast.
 * @param {object} deps.reminderChecker Erinnerungs-Pruefer.
 * @param {object} deps.alarmChecker Wecker-Pruefer.
 * @param {object} deps.timerChecker Timer-Pruefer.
 * @returns {{starteApp: Function, zweitInstanz: Function}} Einstiege der App-Ereignisse.
 */
function createStartup(deps) {
  const {
    getStore,
    setStore,
    registerIpc,
    isMarkdownPath,
    appRegistry,
    windows,
    inDenVordergrund,
    getActiveNonAreaWindow,
    createWindow,
    workspacesState,
    setWorkspacesState,
    utcNowSeconds,
    startAreaWatcher,
    openBookApp,
    restoreBookForApp,
    openShelfApp,
    restoreShelfForApp,
    // 4T-1364 (Epic 3E-0171): Start-Seite des Bereichs.
    resolveAreaStartPage,
    readAllDrafts,
    removeDraftsByIds,
    draftsToPayload,
    reminderChecker,
    alarmChecker,
    timerChecker,
  } = deps;
  // Der Behaelter reist als Wert; ersetzt wird er nie (4T-0998-Konvention).
  const pendingSecondInstanceFiles = wartendeZweitstartDateien;
  // Extrahiert Datei-Argumente aus process.argv (Windows: "Öffnen mit").
  // M-03 (4T-0173): optionale Resolve-Basis. second-instance liefert das
  // Arbeitsverzeichnis der ZWEITEN Instanz mit; ohne Basis wuerden relative
  // CLI-Pfade gegen das CWD der ersten Instanz aufgeloest (falsche Datei).
  function extractFileArgs(argv, baseDir) {
    return argv
      .slice(1)
      .filter((a) => !a.startsWith('--') && !a.startsWith('-'))
      .map((a) => (baseDir ? path.resolve(baseDir, a) : path.resolve(a)))
      .filter(isMarkdownPath);
  }

  // 4T-0871/4T-0873 (Buch und Regal = Bereich): Buch- und Regal-Dateien aus
  // Explorer-/CLI-Argumenten herausloesen und als eigene Applikationen oeffnen
  // (Drei-Stufen-Muster); zurueck bleiben die gewoehnlichen Dateien fuer die
  // bestehende Zustellung. Bei abgeschalteter Buecher-Erweiterung bleibt die
  // Liste unveraendert.
  async function routeBookFileArgs(files) {
    const store = getStore();
    if (!isExtensionEnabled('books', store ? store.get('extensions.disabled') : [])) return files;
    const remaining = [];
    for (const f of files) {
      let bookDir;
      let shelfDir;
      try {
        bookDir = await books.detectBookDirFor(f);
        shelfDir = bookDir ? null : await shelves.detectShelfDirFor(f);
      } catch {
        bookDir = null;
        shelfDir = null;
      }
      if (bookDir) await openBookApp(bookDir, null);
      else if (shelfDir) await openShelfApp(shelfDir, null);
      else remaining.push(f);
    }
    return remaining;
  }

  // Zustellung der gewoehnlichen Zweitstart-Dateien (Explorer-Doppelklick,
  // CLI): in der zuletzt fokussierten Applikation OHNE Bereich oeffnen
  // (4T-0323 — Bereiche sind fix, Explorer-Dateien gehen nie in eine
  // Bereichs-App, seit 4T-0871 damit auch nie in eine Buch-App). Laufen nur
  // Bereichs-Apps, wird eine neue bereichslose Applikation angelegt.
  function deliverExternalFiles(files) {
    if (files.length === 0) return;
    const target = getActiveNonAreaWindow();
    if (target) {
      inDenVordergrund(target);
      if (target.webContents.isLoading()) {
        pendingSecondInstanceFiles.push(...files);
      } else {
        target.webContents.send('file:openExternal', files);
      }
    } else if (windows.size > 0) {
      // Nur Bereichs-Apps offen: neue bereichslose App; die Dateien werden
      // nach did-finish-load aus der Pending-Queue nachgereicht.
      pendingSecondInstanceFiles.push(...files);
      createWindow({});
    } else {
      // Noch kein Fenster registriert (frueher App-Start): nachreichen,
      // sobald das erste Fenster fertig geladen ist.
      pendingSecondInstanceFiles.push(...files);
    }
  }

  // 4T-0319 (Epic 3E-0057): Rumpf des second-instance-Ereignisses.
  function zweitInstanz(argv, workingDirectory) {
    // M-03 (4T-0173): relative Pfade gegen das CWD der zweiten Instanz aufloesen.
    const files = extractFileArgs(argv, workingDirectory || undefined);

    // 4T-0319 (Epic 3E-0057): EXE-Zweitstart OHNE Datei-Argument ist der
    // "Mehrfachstart" aus Nutzersicht — er legt eine neue logische Applikation
    // mit leerem Fenster an (statt wie vorher nur das bestehende zu fokussieren).
    if (files.length === 0) {
      if (windows.size > 0) {
        createWindow({});
      }
      return;
    }

    // Buch-Dateien zuerst (eigene Applikationen), der Rest ueber die
    // bestehende Zustellung. Fire-and-forget: der second-instance-Handler
    // selbst ist synchron.
    void routeBookFileArgs(files).then((rest) => deliverExternalFiles(rest));
  }

  // Rumpf von app.whenReady: Speicher, Pruefer, IPC, Sitzung, Start-Dateien.
  async function starteApp() {
    // 4T-0998: loadStore liegt in app/settings-store.js und gibt Store und den
    // normalisierten Arbeitsbereichs-Stand zurueck, statt fremde Modul-Variablen
    // zu setzen (Entwicklungsrichtlinien §1).
    const geladen = await loadStore({
      appDataDir: app.getPath('appData'),
      userDataDir: app.getPath('userData'),
    });
    setStore(geladen.store);
    const store = getStore();
    setWorkspacesState(geladen.workspaces);

    // 4T-0946 (Story 4S-0005): Die gemappten Netzlaufwerke frueh und nebenher
    // ermitteln. Bewusst ohne await: Die Abfrage startet einen fremden Prozess
    // und darf den Programmstart nicht bremsen; bis eine Datei geoeffnet ist,
    // liegt das Ergebnis in aller Regel vor, und andernfalls zieht die
    // Beobachtung selbst nach.
    netzPfade.ermittleNetzLaufwerke();

    // 4T-0030: Persistierten Theme-Pref VOR dem Erzeugen des ersten Fensters
    // anwenden, damit der Background-Color-Init in createWindow direkt korrekt
    // ist und kein Theme-Flash am Start sichtbar wird.
    const savedThemePref = store?.get('themePref');
    if (savedThemePref === 'light' || savedThemePref === 'dark' || savedThemePref === 'system') {
      nativeTheme.themeSource = savedThemePref;
    }

    registerIpc();

    // 4T-0615 (Epic 3E-0116): Ablage-Ort des Bereichs-Suchraum-Caches. Bewusst
    // im Nutzerdaten-Verzeichnis und nicht im Bereich des Anwenders (Muster
    // drafts/, extensions/): Der Cache verdoppelte dort dessen Text-Bestand und
    // liefe durch jede Ordner-Synchronisierung mit.
    konfiguriereBereichsSuche({
      cacheVerzeichnis: path.join(app.getPath('userData'), 'bereichs-suche'),
    });

    // 4T-0525 (Epic 3E-0095): Erinnerungs-Takt starten (Gates pro Lauf:
    // Erweiterungs-Zustand, Index-Bereitschaft; zusaetzlicher Anstoss ueber
    // den backlinks:invalidated-Broadcast).
    reminderChecker.start();
    // 4T-0637 (Epic 3E-0069): Wecker-Takt starten. Gate pro Lauf ist der
    // Erweiterungs-Zustand; der Bezugspunkt des Faelligkeits-Fensters wird
    // hier gesetzt, damit vergangene Weckzeiten nicht nachtraeglich feuern.
    alarmChecker.start();
    // 4T-0638 (Epic 3E-0069): Weckruf fuer den naechsten Timer-Ablauf setzen.
    // Ein beim Beenden laufender Timer wird damit direkt nach dem Start wieder
    // ueberwacht (die Restzeit rechnet sich aus dem gespeicherten Zeitstempel).
    timerChecker.start();

    // Sitzungs-Wiederherstellung ueber logische Applikationen (4T-0320).
    const restore = !!store.get('restoreSession');
    const savedApps = normalizeSavedApps(store.get('apps'));

    // 4T-0368: Entwuerfe frueh lesen (raeumt zugleich verwaiste Dateien) und den
    // tatsaechlich entstehenden Applikationen bereichs-treu zuordnen. Dazu wird
    // die Ziel-App-Liste vor der Fenster-Erzeugung bestimmt (inkl. Bereichs-
    // Existenz-Filter), damit die Zuordnung nicht auf uebersprungene Apps zielt.
    const allDrafts = await readAllDrafts();
    const targetApps = []; // [{ area: areaObj|null, windows: [...] }]
    const missingAreas = [];
    if (savedApps.length > 0 && restore) {
      // 4T-0322: Bereichs-Apps nur wiederherstellen, wenn der Bereichs-Ordner
      // noch existiert; fehlende Bereiche werden gesammelt gemeldet.
      for (const appEntry of savedApps) {
        const area = appEntry.area ? areaFromRootPath(appEntry.area.rootPath) : null;
        if (area) {
          try {
            const stat = await fs.stat(area.rootPath);
            if (!stat.isDirectory()) throw new Error('kein Ordner');
          } catch {
            missingAreas.push(area.rootPath);
            continue;
          }
        }
        // 4T-0843 (Epic 3E-0147): aktives Buch der App mitfuehren.
        targetApps.push({
          area,
          windows: appEntry.windows,
          bookDir: appEntry.book?.dir || null,
          shelfDir: appEntry.shelf?.dir || null,
        });
      }
    } else if (savedApps.length > 0 && !restore) {
      // restoreSession aus: nur EIN Fenster, Bounds des ersten persistierten
      // Fensters uebernehmen (UX-Kontinuitaet), aber ohne Tabs und Apps.
      const first = savedApps[0].windows[0];
      targetApps.push({
        area: null,
        windows: [{ bounds: first?.bounds || null, maximized: !!first?.maximized, panes: [] }],
      });
    }
    // 4T-0537 (Epic 3E-0098): bei aktiver Sitzungs-Wiederherstellung kommen
    // zusaetzlich die beim Beenden offenen Arbeitsbereiche zurueck (Workshop-
    // Punkt 6); fehlende Bereichs-Ordner laufen in dieselbe Sammel-Warnung,
    // der Ablage-Eintrag bleibt erhalten. Bei deaktivierter Wiederherstellung
    // bleibt es beim leeren Fenster, die Ablagen sind unberuehrt.
    if (restore) {
      for (const w of workspacesState) {
        if (!w.open) continue;
        const area = w.app.area ? areaFromRootPath(w.app.area.rootPath) : null;
        if (w.app.area && !area) continue;
        if (area) {
          try {
            const stat = await fs.stat(area.rootPath);
            if (!stat.isDirectory()) throw new Error('kein Ordner');
          } catch {
            missingAreas.push(area.rootPath);
            continue;
          }
        }
        const winList =
          w.app.windows.length > 0
            ? w.app.windows
            : [{ bounds: null, maximized: false, panes: [] }];
        w.lastOpenedAt = utcNowSeconds();
        targetApps.push({
          area,
          windows: winList,
          workspace: { id: w.id, name: w.name },
          bookDir: w.app.book?.dir || null,
          shelfDir: w.app.shelf?.dir || null,
        });
      }
    }
    // Kaltstart oder alle Bereichs-Apps uebersprungen: ein leeres bereichsloses
    // Fenster als Ziel (nimmt auch die Entwuerfe auf).
    if (targetApps.length === 0) {
      targetApps.push({ area: null, windows: [{ bounds: null, maximized: false, panes: [] }] });
    }

    // Entwuerfe zuordnen: byApp[i] trifft App i exakt (Arbeitsbereichs-
    // Entwuerfe nur ihren Arbeitsbereich, uebrige bereichs-treu auf
    // Nicht-Arbeitsbereichs-Apps, 4T-0539); leftover (bereichslos oder
    // Bereich nicht wiederhergestellt) kommt in die erste bereichslose
    // unbenannte App (verlustfrei, ggf. eine neue; PO-Entscheidung
    // 2026-07-08). unassigned (Arbeitsbereich geschlossen) bleibt liegen.
    const appTargets = targetApps.map((t) => ({
      rootPath: t.area ? t.area.rootPath : null,
      workspaceId: t.workspace ? t.workspace.id : null,
    }));
    const { byApp, leftover, unassigned } = assignDraftsToApps(allDrafts, appTargets, isSamePath);
    if (leftover.length > 0) {
      let idx = appTargets.findIndex((t) => !t.rootPath && !t.workspaceId);
      if (idx < 0) {
        targetApps.push({ area: null, windows: [{ bounds: null, maximized: false, panes: [] }] });
        byApp.push([]);
        idx = targetApps.length - 1;
      }
      byApp[idx].push(...leftover);
    }

    // Fenster erzeugen; das jeweils erste Fenster einer App bekommt ihre
    // Entwuerfe als initialDrafts (ueber window:initialState wiederhergestellt).
    for (let ai = 0; ai < targetApps.length; ai++) {
      const t = targetApps[ai];
      const appId = appRegistry.createApp(t.area || null);
      // 4T-0537: wiederhergestellte Arbeitsbereiche behalten ihre Zuordnung.
      if (t.workspace) appRegistry.setWorkspace(appId, t.workspace);
      if (t.area) startAreaWatcher(appId);
      // 4T-0843 (Epic 3E-0147): aktives Buch wiederherstellen (Story 4S-0752,
      // AK4). Fire-and-forget nach dem Muster der uebrigen Nachzuegler: die
      // Fenster entstehen synchron weiter, das Zustands-Paket erreicht sie
      // ueber books:stateChanged, sobald der Buch-Ordner gelesen ist.
      if (t.bookDir) void restoreBookForApp(appId, t.bookDir);
      // 4T-0867 (Epic 3E-0162): aktives Regal wiederherstellen (Story 4S-0760,
      // AK5), gleiches Fire-and-forget-Muster.
      if (t.shelfDir) void restoreShelfForApp(appId, t.shelfDir);
      const draftPayload = draftsToPayload(byApp[ai] || []);
      // 4T-1364 (Epic 3E-0171): Start-Seite des Bereichs. Sie greift nur, wo
      // NICHTS wiederherzustellen ist — die Sitzung hat Vorrang (Entscheidung
      // aus 4T-1363). Traegt die Bereichs-App gespeicherte Panes, bleibt es bei
      // ihnen; ist ihre Pane-Liste leer, tritt die Start-Seite an ihre Stelle.
      // Eine ins Leere zeigende Festlegung wird hier still uebergangen: Der
      // Programmstart hat mit den fehlenden Bereichs-Ordnern bereits eine
      // Sammel-Meldung, und ein zweiter Warn-Dialog beim Hochfahren waere
      // laestiger als nuetzlich.
      let startPanes = null;
      if (t.area && resolveAreaStartPage) {
        if (!sitzungHatPanes(t.windows)) {
          try {
            const resolved = await resolveAreaStartPage(t.area.rootPath);
            if (resolved && !resolved.missing)
              startPanes = [{ paths: [resolved.path], activeIndex: 0 }];
          } catch {
            /* defekte Bereichsdatei wirkt wie keine Festlegung */
          }
        }
      }
      for (let wi = 0; wi < t.windows.length; wi++) {
        const entry = t.windows[wi];
        const gespeichertePanes = Array.isArray(entry?.panes) ? entry.panes : [];
        createWindow({
          bounds: entry?.bounds || null,
          maximized: !!entry?.maximized,
          // Die Start-Seite bekommt nur das ERSTE Fenster der App: Sie ist der
          // Einstieg in den Bereich, nicht ein Tab je Fenster.
          initialPanes: wi === 0 && startPanes ? startPanes : gespeichertePanes,
          initialDrafts: wi === 0 ? draftPayload : [],
          appId,
        });
      }
    }
    if (windows.size === 0) createWindow();
    // 4T-0537: normalisierten Arbeitsbereichs-Stand samt aktualisierter
    // lastOpenedAt-Werte zurueckschreiben (Bounds/Panes folgen laufend ueber
    // persistAllWindows).
    store.set('workspaces', workspacesState);
    if (missingAreas.length > 0) {
      const locale = store.get('language') || (app.getLocale() || 'en').split('-')[0];
      dialog.showMessageBox({
        type: 'warning',
        title: tForLocale(locale, 'area.missingTitle'),
        message: tForLocale(locale, 'area.missingMessage'),
        detail: missingAreas.join('\n'),
        buttons: ['OK'],
      });
    }

    // 4T-0368: uebergebene Entwuerfe aus dem Speicher raeumen, damit die neue
    // Sitzung ihn beim naechsten App-Ende frisch fuellt. 4T-0539: selektiv —
    // Entwuerfe geschlossener Arbeitsbereiche (unassigned) bleiben liegen und
    // kommen erst mit dem Oeffnen ihres Arbeitsbereichs zurueck.
    if (allDrafts.length > unassigned.length) {
      const unassignedIds = new Set(unassigned.map((d) => d.id));
      await removeDraftsByIds(allDrafts.filter((d) => !unassignedIds.has(d.id)).map((d) => d.id));
    }

    // Beim Start uebergebene Dateien (Datei-Assoziation, "Öffnen mit") in das
    // erste Fenster OHNE Bereich reichen (4T-0323); stammen alle
    // wiederhergestellten Apps aus Bereichen, uebernimmt eine neue bereichslose
    // App die Dateien ueber die Pending-Queue. Buch-Dateien oeffnen seit
    // 4T-0871 zuerst als eigene Buch-Applikationen (routeBookFileArgs).
    const initialFiles = extractFileArgs(process.argv);
    if (initialFiles.length > 0) {
      const restFiles = await routeBookFileArgs(initialFiles);
      if (restFiles.length > 0) {
        const target = getActiveNonAreaWindow();
        if (target) {
          target.webContents.once('did-finish-load', () => {
            target.webContents.send('file:openExternal', restFiles);
          });
        } else {
          pendingSecondInstanceFiles.push(...restFiles);
          createWindow({});
        }
      }
    }
  }

  return { starteApp, zweitInstanz };
}

module.exports = { createStartup, gibWartendeZweitstartDateien };
