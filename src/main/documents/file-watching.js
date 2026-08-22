// Datei-Watching mit Refcounting ueber Fenster-IDs: Beobachtung anlegen und
// freigeben, Rueckfall auf den Abfrage-Betrieb bei Netz-Freigaben und der
// Umzug einer Beobachtung beim Umbenennen bzw. Verschieben.
//
// Auszug aus main.js, 4T-0998 (Epic 3E-0196).
//
// Eigentuemer-Zustand dieses Moduls:
//   watchers : Map<filePath, { watcher, owners: Set<webContents.id>, polling }>
//
// Fremder Zustand (die Fenster-Registry) kommt als Getter, weil die
// Fenster-Verwaltung ihrerseits unwatchAllForOwner braucht.
'use strict';

const chokidar = require('chokidar');
const netzPfade = require('./network-paths');
const selbstSchreib = require('./self-write');

// 4T-0947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
// Require-Cache).
const isOwnWriteState = selbstSchreib.istEigenerStand;

/**
 * Baut die Datei-Beobachtung.
 *
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {() => Map} deps.windows Fenster-Registry (Ziel der Meldungen).
 * @returns {object} Beobachtungs-API dieses Moduls.
 */
function createFileWatching(deps) {
  const { windows } = deps;

  // File-Watcher pro Datei mit Refcounting ueber Fenster-IDs.
  //   filePath -> { watcher, owners: Set<webContents.id> }
  const watchers = new Map();

  function watchFile(filePath, ownerId) {
    let entry = watchers.get(filePath);
    if (!entry) {
      // 4T-0946 (Story 4S-0005): Auf Netz-Freigaben kommen die nativen
      // Datei-Ereignisse unzuverlaessig; dort laeuft die Beobachtung im
      // Abfrage-Betrieb. Lokale Pfade behalten die nativen Ereignisse.
      const watcher = chokidar.watch(filePath, {
        awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
        ignoreInitial: true,
        ...netzPfade.watchOptionenFuer(filePath),
      });
      entry = { watcher, owners: new Set(), polling: !!netzPfade.istNetzPfad(filePath) };
      watchers.set(filePath, entry);

      watcher.on('change', async () => {
        // Eigene Schreibvorgaenge nicht als externer Change melden; eine
        // abweichende (echte externe) Aenderung im Self-Writing-Fenster
        // wird durchgelassen (M-15, 4T-0173).
        if (await isOwnWriteState(filePath)) return;
        for (const id of entry.owners) {
          const win = windows().get(id);
          if (win && !win.isDestroyed()) win.webContents.send('file:changed', filePath);
        }
      });
      watcher.on('unlink', () => {
        for (const id of entry.owners) {
          const win = windows().get(id);
          if (win && !win.isDestroyed()) win.webContents.send('file:removed', filePath);
        }
      });
      // W-04 (4T-0309): Watcher-Fehler behandeln (z.B. wegfallendes Netz-
      // laufwerk). Ohne Handler wuerde chokidars EventEmitter ein unbehandeltes
      // 'error'-Event werfen und koennte den Main-Prozess abbrechen; backlinks.js
      // behandelt denselben Fall bereits (B-21).
      watcher.on('error', (err) => {
        console.warn('Datei-Watcher-Fehler:', filePath, err && err.message);
        try {
          watcher.close();
        } catch {
          /* ignore */
        }
        watchers.delete(filePath);
      });
    }
    entry.owners.add(ownerId);
    // Die Laufwerks-Liste kommt aus einem fremden Prozess und liegt beim ersten
    // Oeffnen womoeglich noch nicht vor. Wer auf einem gemappten Netzlaufwerk
    // liegt, wird deshalb nachtraeglich umgestellt, sobald sie da ist — sonst
    // haette die Zusage von der Startreihenfolge abgehangen.
    netzPfade.beiErmittlung(() => stelleAufAbfrageUmFallsNoetig(filePath));
  }

  // Setzt einen bereits laufenden Beobachter neu auf, wenn sich herausstellt,
  // dass sein Pfad auf einer Netz-Freigabe liegt. Die Besitzer bleiben erhalten.
  function stelleAufAbfrageUmFallsNoetig(filePath) {
    const entry = watchers.get(filePath);
    if (!entry || entry.polling) return;
    if (!netzPfade.istNetzPfad(filePath)) return;
    const owners = entry.owners;
    try {
      entry.watcher.close();
    } catch {
      /* ein nicht schliessbarer Beobachter darf die Umstellung nicht verhindern */
    }
    watchers.delete(filePath);
    const ersterOwner = owners.values().next().value;
    if (ersterOwner === undefined) return;
    watchFile(filePath, ersterOwner);
    const neu = watchers.get(filePath);
    if (neu) for (const id of owners) neu.owners.add(id);
  }

  async function unwatchFile(filePath, ownerId) {
    const entry = watchers.get(filePath);
    if (!entry) return;
    entry.owners.delete(ownerId);
    if (entry.owners.size === 0) {
      await entry.watcher.close();
      watchers.delete(filePath);
      // 4T-0947: Mit dem Ende der Beobachtung wird der gemerkte Eigen-Stand
      // gegenstandslos — es kommt keine Meldung mehr, die er einordnen koennte.
      selbstSchreib.vergiss(filePath);
    }
  }

  async function unwatchAllForOwner(ownerId) {
    const toClose = [];
    for (const [p, entry] of watchers.entries()) {
      if (entry.owners.has(ownerId)) {
        entry.owners.delete(ownerId);
        if (entry.owners.size === 0) toClose.push(p);
      }
    }
    for (const p of toClose) {
      const entry = watchers.get(p);
      if (entry) {
        await entry.watcher.close();
        watchers.delete(p);
        selbstSchreib.vergiss(p);
      }
    }
  }

  async function unwatchAll() {
    for (const [p, entry] of watchers.entries()) {
      await entry.watcher.close();
      selbstSchreib.vergiss(p);
    }
    watchers.clear();
  }

  /**
   * Beobachtung einer Datei ueber eine Bewegung hinweg mitfuehren.
   *
   * Der Beobachter der alten Datei wird VOR der Bewegung geschlossen, damit
   * kein unlink-Ereignis ('file:removed') die Tabs als fehlend markiert; die
   * Besitzer werden danach auf den neuen Pfad umgemeldet. Scheitert die
   * Bewegung, kommt die alte Beobachtung zurueck und der Zustand bleibt
   * konsistent. 4T-0998: aus dem IPC-Block herausgeloest, der bis dahin selbst
   * in die watchers-Map griff; die Semantik ist unveraendert.
   *
   * @param {string} oldPath Bisheriger Pfad.
   * @param {string} newPath Neuer Pfad.
   * @param {() => Promise<{ok: boolean}>} performMove Die eigentliche Bewegung.
   * @returns {Promise<object>} Ergebnis von performMove, unveraendert.
   */
  async function moveWatchEntry(oldPath, newPath, performMove) {
    const watchEntry = watchers.get(oldPath);
    const watchOwners = watchEntry ? [...watchEntry.owners] : [];
    if (watchEntry) {
      try {
        await watchEntry.watcher.close();
      } catch {
        /* ignore */
      }
      watchers.delete(oldPath);
    }
    const result = await performMove();
    if (!result.ok) {
      for (const id of watchOwners) watchFile(oldPath, id);
      return result;
    }
    for (const id of watchOwners) watchFile(newPath, id);
    return result;
  }

  return {
    watchFile,
    unwatchFile,
    unwatchAllForOwner,
    unwatchAll,
    moveWatchEntry,
  };
}

module.exports = { createFileWatching };
