// IPC-Kanal-Gruppe My Extended Memory: die von Hand gepflegte Gefaess-Liste —
// auslesen, eintragen (ueber den Vorschlag, ueber einen Pfad oder ueber den
// Ordner-Dialog), entfernen und der Vorschlag beim Eintragen.
//
// 4T-001598 (Epic 3E-000191, Story 4S-000906). Kanal-Gruppe: memory:*.
//
// Eigener Zustand: keiner. Die Liste liegt im Einstellungs-Speicher
// (Store-Schluessel `memoryEntries`), die Listen-Logik in memory-entries.js,
// die Erkennung der Gefaess-Art in memory-detect.js. Jede Aenderung meldet der
// Broadcast `memory:changed` an alle Fenster (Muster shelves:stateChanged),
// damit eine offene Seite ohne Nachfrage nachzieht.
//
// 4T-001600: Die Kennzahlen kommen aus dem Beschleuniger
// (`src/main/memory/memory-stats.js`, eigene Datei im Benutzerprofil). Dieses
// Modul liest sie in die Anzeige-Daten ein und stoesst die Erhebung an genau
// zwei Stellen an: beim Eintragen eines Gefaesses und auf ausdrueckliche
// Anforderung je Zeile (`memory:refresh`). Einen Hintergrund-Lauf und einen
// Index-Aufbau gibt es nicht.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeSavedWorkspaces } = require('../app/session-schema');
const { readShelfSettings } = require('../books/shelves');
const { readBookList } = require('../../shared/books/shelf-core.js');
const { createTaskStatusTypeResolver } = require('../../shared/markdown/plugins.js');
const { detectContainerKind } = require('../memory/memory-detect');
const { aktualisiereEintrag, entferneEintrag, ladeMemoryStats } = require('../memory/memory-stats');
const {
  addMemoryEntry,
  buildSuggestions,
  memoryKeyForPath,
  memoryKeyForWorkspace,
  normalizeMemoryEntries,
  removeMemoryEntry,
  sortMemoryEntries,
} = require('../memory/memory-entries');

const STORE_KEY = 'memoryEntries';

// Ist der Pfad gerade als Ordner erreichbar? Ein Fehlschlag ist kein Fehler,
// sondern die Antwort: der Eintrag bleibt stehen und wird gekennzeichnet (AK7).
async function istErreichbar(p) {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

// Zuordnung Buch-Ordner -> eingetragenes Regal, aufgebaut aus den Buch-Listen
// der EINGETRAGENEN Regale. Ein nicht erreichbares oder defektes Regal wird
// uebersprungen (dann fehlt die Zuordnung, statt dass der Abruf scheitert).
async function regalZuordnung(entries) {
  const karte = new Map();
  for (const regal of entries) {
    if (regal.kind !== 'shelf' || regal.path === null) continue;
    const settings = await readShelfSettings(regal.path);
    if (!settings.ok) continue;
    for (const dirName of readBookList(settings.container)) {
      const key = memoryKeyForPath(path.join(regal.path, dirName));
      if (key !== null && !karte.has(key)) karte.set(key, { key: regal.key, name: regal.name });
    }
  }
  return karte;
}

/**
 * Registriert die Kanaele der Gefaess-Liste.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.dialog Electron-Dialog-Modul (Ordner-Wahl beim Eintragen).
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher.
 * @param {(channel: string, ...args: any[]) => void} deps.broadcast Meldung an alle Fenster.
 * @param {object} deps.backlinks Index-Modul (Leser der Bereichs-Kennzahlen).
 * @param {(rootPath: string) => Promise<object|null>} deps.resolveAreaStartPage Start-Seite eines Bereichs.
 */
function registerMemoryIpc(handle, deps) {
  const { dialog, senderWindow, getStore, broadcast, backlinks, resolveAreaStartPage } = deps;

  const leseEintraege = () => normalizeMemoryEntries(getStore()?.get(STORE_KEY));
  const leseArbeitsbereiche = () => normalizeSavedWorkspaces(getStore()?.get('workspaces'));

  // Umgebung des Index-Lesers, wie sie areaStats:collect baut (index-views.js):
  // der Status-Typ-Aufloeser pro Lauf frisch, damit geaenderte Aufgaben-
  // Zustaende sofort wirken, und die Start-Seite, ohne die jede Datei ohne
  // eingehenden Verweis als Waise gilt. Gelesen wird ausschliesslich ein
  // bereits vorhandener Index; angebaut wird keiner.
  const erhebungsOptionen = async (entry) => {
    const optionen = {
      statsFor: backlinks ? backlinks.statsFor : undefined,
      env: { statusTypeOf: createTaskStatusTypeResolver(getStore()?.get('taskStates')) },
    };
    if (entry.kind !== 'area' || typeof resolveAreaStartPage !== 'function') return optionen;
    try {
      const treffer = await resolveAreaStartPage(entry.path);
      if (treffer && !treffer.missing) optionen.env.startPage = treffer.path;
    } catch {
      /* keine Start-Seite ermittelbar: die Waisen-Zahl faellt auf ihren Rueckfall */
    }
    return optionen;
  };

  // Erhebung eines einzelnen Eintrags samt Schreiben des Beschleunigers. Ein
  // Fehlschlag ist nie fatal: Die Liste steht auch ohne Kennzahlen.
  const erhebeEintrag = async (entry) => {
    try {
      return await aktualisiereEintrag(entry, await erhebungsOptionen(entry));
    } catch (err) {
      console.warn('Gefaess-Liste: Kennzahlen-Erhebung fehlgeschlagen:', entry.key, err?.message);
      return null;
    }
  };

  // Schreibt die Liste und meldet die Aenderung an alle Fenster. Die eine
  // Stelle, an der `memoryEntries` geschrieben wird.
  const schreibeEintraege = (entries) => {
    getStore()?.set(STORE_KEY, entries);
    broadcast('memory:changed');
  };

  // Anzeige-Daten der Seite. Erhoben wird hier nichts — die Kennzahlen kommen
  // gelesen aus dem Beschleuniger, damit das Oeffnen der Seite keinen Scan
  // ausloest; `reachable` ist eine einzelne stat-Abfrage je Ordner-Eintrag
  // und bei einem Arbeitsbereich null, weil er keinen eigenen Ort hat.
  handle('memory:getViewData', async () => {
    const entries = leseEintraege();
    const workspaces = leseArbeitsbereiche();
    const zuordnung = await regalZuordnung(entries);
    const kennzahlen = await ladeMemoryStats();
    const out = [];
    for (const eintrag of entries) {
      const ws =
        eintrag.kind === 'workspace'
          ? workspaces.find((w) => w.id === eintrag.workspaceId) || null
          : null;
      const stats = kennzahlen[eintrag.key] || null;
      out.push({
        ...eintrag,
        reachable: eintrag.kind === 'workspace' ? null : await istErreichbar(eintrag.path),
        stats:
          stats === null ? null : { stand: stats.stand, status: stats.status, werte: stats.werte },
        workspace:
          ws === null
            ? null
            : {
                area: ws.app.area ? ws.app.area.rootPath : null,
                book: ws.app.book ? ws.app.book.dir : null,
                shelf: ws.app.shelf ? ws.app.shelf.dir : null,
                windows: ws.app.windows.length,
                lastOpenedAt: ws.lastOpenedAt,
              },
        shelfOf: eintrag.kind === 'book' ? zuordnung.get(eintrag.key) || null : null,
      });
    }
    return { ok: true, entries: sortMemoryEntries(out) };
  });

  // Dialog-freier Pfad-Einstieg (Muster shelves:openPath): dieselbe Strecke ab
  // der Ordner-Wahl, damit beide Wege automatisiert pruefbar sind.
  const trageOrdnerEin = async (dirPath) => {
    const erkannt = await detectContainerKind(dirPath);
    if (!erkannt.ok) return { ok: false, error: erkannt.error };
    const result = addMemoryEntry(leseEintraege(), {
      kind: erkannt.kind,
      key: memoryKeyForPath(dirPath),
      path: dirPath,
      workspaceId: null,
      name: erkannt.name,
    });
    if (!result.ok) return result;
    schreibeEintraege(result.entries);
    // Erster der beiden Erhebungs-Zeitpunkte (AK6): einmal beim Eintragen, in
    // demselben Zug und nicht auf Vorrat. Die zweite Meldung zieht die offene
    // Seite auf die frischen Zahlen nach.
    await erhebeEintrag(result.entry);
    broadcast('memory:changed');
    return { ok: true, entry: result.entry };
  };

  handle('memory:addPath', (_event, dirPath) => trageOrdnerEin(dirPath));

  // "Gefaess eintragen…" ueber den Ordner-Dialog (Muster
  // templates:chooseFolder). Der Abbruch ist kein Fehler des Eintragens.
  handle('memory:addFromDialog', async (event) => {
    const owner = senderWindow(event);
    const result = await dialog.showOpenDialog(owner || undefined, {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true, error: 'canceled' };
    }
    return trageOrdnerEin(result.filePaths[0]);
  });

  // Arbeitsbereich eintragen: die Kennung muss in der Ablage stehen, der Name
  // kommt aus ihrem Eintrag (kein zweiter Namens-Ort).
  handle('memory:addWorkspace', (_event, id) => {
    const ws = leseArbeitsbereiche().find((w) => w.id === id);
    if (!ws) return { ok: false, error: 'unknown-workspace' };
    const result = addMemoryEntry(leseEintraege(), {
      kind: 'workspace',
      key: memoryKeyForWorkspace(ws.id),
      path: null,
      workspaceId: ws.id,
      name: ws.name,
    });
    if (!result.ok) return result;
    schreibeEintraege(result.entries);
    return { ok: true, entry: result.entry };
  });

  // Austragen wirkt nur auf den Eintrag; am Gefaess selbst wird nichts
  // angefasst. Ein Schluessel ohne Eintrag ist kein Fehler und loest keine
  // Meldung an die Fenster aus.
  handle('memory:remove', async (_event, key) => {
    const result = removeMemoryEntry(leseEintraege(), key);
    if (result.removed) {
      // Der Beschleuniger-Eintrag geht mit: Zahlen zu einem Gefaess, das nicht
      // mehr in der Liste steht, waeren Ballast und kaemen bei einem erneuten
      // Eintragen als alter Stand zurueck.
      await entferneEintrag(key);
      schreibeEintraege(result.entries);
    }
    return { ok: true, removed: result.removed };
  });

  // Zweiter Erhebungs-Zeitpunkt (AK5): die ausdrueckliche Anforderung je Zeile.
  // Ein nicht erreichbares Gefaess wird nicht erhoben — sein Eintrag behaelt
  // Zahlen und Stand und wechselt allein den Status (AK4).
  handle('memory:refresh', async (_event, key) => {
    const eintrag = leseEintraege().find((e) => e.key === key);
    if (!eintrag || eintrag.kind === 'workspace') return { ok: false, error: 'unknown-entry' };
    const stats = await erhebeEintrag(eintrag);
    broadcast('memory:changed');
    if (stats === null) return { ok: false, error: 'failed' };
    if (stats.status === 'unreachable') return { ok: false, error: 'unreachable' };
    // 'error' steht fuer eine gescheiterte Erhebung an einem erreichbaren
    // Gefaess (Lese-Fehler unter der Wurzel). Eigene Kennung statt
    // 'unreachable', weil die Lage eine andere ist; fuer den Anwender faellt
    // beides auf dieselbe Meldung zusammen.
    if (stats.status === 'error') return { ok: false, error: 'failed' };
    return { ok: true, entry: { ...eintrag, stats } };
  });

  // Vorschlag beim Eintragen: die drei Verlaufs-Listen und die vorhandenen
  // Arbeitsbereiche, ohne die bereits eingetragenen Gefaesse.
  handle('memory:suggestions', () => {
    const store = getStore();
    return {
      ok: true,
      suggestions: buildSuggestions({
        recentAreas: store?.get('recentAreas'),
        recentBooks: store?.get('recentBooks'),
        recentShelves: store?.get('recentShelves'),
        workspaces: leseArbeitsbereiche(),
        entries: leseEintraege(),
      }),
    };
  });
}

module.exports = { registerMemoryIpc };
