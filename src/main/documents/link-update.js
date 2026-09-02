// Link-Update beim Umbenennen und Verschieben: Suchraum-Scan, Vorschau
// (Dry-Run) und das Anwenden der Umschreibungen auf die eingehenden Links,
// dazu die physische Umbenennung einer einzelnen Datei samt Nachzug.
//
// Auszug aus main.js, 4T-0998 (Epic 3E-0196). Der Rewrite-Kern selbst liegt
// unveraendert in shared/link-rewrite.js; hier bleiben Suchraum, Datei-I/O
// und die Kopplung an die Dokument-Historie. 4T-0999 (Epic 3E-0196) hat
// renameSingleFile aus dem IPC-Block nachgezogen: die Funktion hat zwei
// Aufrufer (Umbenennen-Kaskade und das Verschieben einer Kapitel-Datei) und
// gehoert deshalb in ein Logik-Modul, nicht in ein ipc-Modul.
//
// Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { computeLinkRewrites } = require('../../shared/link-rewrite');
const { isInsideArea } = require('../area/area-path');
const selbstSchreib = require('./self-write');

// 4T-0947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
// Require-Cache).
const markSelfWriting = selbstSchreib.merke;

/**
 * Baut die Link-Update-Strecke.
 *
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(p: string) => boolean} deps.isMarkdownPath Markdown-Endungs-Pruefung.
 * @param {Function} deps.resolveHistoryFor Aufloesung der Historisierungs-Schaltung.
 * @param {Function} deps.readPreviousTextFor Datei-Stand vor dem Ueberschreiben.
 * @param {Function} deps.recordMddOnSave Protokollierung einer Speicherung.
 * @param {Function} deps.moveWatchEntry Beobachtung ueber eine Bewegung mitfuehren.
 * @param {(p: string) => string} deps.mddPathFor Pfad der Begleitdatei.
 * @param {(p: string) => string} deps.mddKeyOf Schluessel eines Dokuments.
 * @param {Map} deps.mddOpenPackets Offene Historien-Pakete je Dokument.
 * @param {Set} deps.mddSuspendedPaths Ausgesetzte Protokollierung je Dokument.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher (Zuletzt-Liste).
 * @param {() => void} deps.applyMenuToAllWindows Menues aller Fenster neu bauen.
 * @param {(channel: string, ...args: any[]) => void} deps.broadcast Meldung an alle Fenster.
 * @param {object} deps.books Datei-Ebene des Buches (Nachtrag im Kapitel-Baum).
 * @param {(oldPath: string, newPath: string) => Promise<void>} deps.followAreaStartPage Nachtrag der Start-Seite.
 * @returns {object} Scan-, Vorschau-, Anwendungs- und Umbenennen-Funktionen.
 */
function createLinkUpdate(deps) {
  const {
    areaOfWindow,
    isMarkdownPath,
    resolveHistoryFor,
    readPreviousTextFor,
    recordMddOnSave,
    moveWatchEntry,
    mddPathFor,
    mddKeyOf,
    mddOpenPackets,
    mddSuspendedPaths,
    getStore,
    applyMenuToAllWindows,
    broadcast,
    books,
    // 4T-1364 (Epic 3E-0171): Nachtrag der Start-Seiten-Festlegung.
    followAreaStartPage,
  } = deps;

  // 4T-0345 (Epic 3E-0062): Suchraum fuer das Link-Update beim Umbenennen. In
  // einer Bereichs-App der gesamte Bereichs-Baum (ohne Tiefen-Grenze), sonst der
  // Ordner der Ankerdatei plus zwei Unterordner-Ebenen wie der Backlinks-Scan.
  // Ignore-Regeln (node_modules, Punkt-Ordner) identisch. Der Index-Vorfilter als
  // Beschleunigung folgt mit dem bereichsweiten Index (4T-0347); hier deckt der
  // Voll-Scan den Suchraum verlaesslich ab.
  async function collectMarkdownFilesInScope(owner, anchorAbsolute) {
    const area = areaOfWindow(owner);
    let rootDir;
    let maxDepth;
    if (area && area.rootPath && isInsideArea(area.rootPath, anchorAbsolute)) {
      rootDir = area.rootPath;
      maxDepth = Infinity;
    } else {
      rootDir = path.dirname(anchorAbsolute);
      maxDepth = 2;
    }
    const out = [];
    const queue = [{ dir: rootDir, depth: 0 }];
    while (queue.length > 0) {
      const { dir, depth } = queue.shift();
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
          if (depth < maxDepth) queue.push({ dir: full, depth: depth + 1 });
        } else if (entry.isFile() && isMarkdownPath(entry.name)) {
          out.push(full);
        }
      }
    }
    return out;
  }

  // 4T-0345 (Epic 3E-0062): Rename-Paare (from/to absolut) in die renames-Form des
  // Rewrite-Kerns bringen (logischer Basename ohne Endung plus absolute Pfade).
  function renamesFromPairs(pairs) {
    return pairs.map((p) => ({
      oldBase: path.parse(p.from).name,
      newBase: path.parse(p.to).name,
      oldAbs: p.from,
      newAbs: p.to,
    }));
  }

  // 4T-0345 (Epic 3E-0062): eingehende Links auf alle umbenannten Dateien (pairs)
  // im Suchraum anpassen. Pro Kandidat frisch geparst; EOL/BOM des Original-Stands
  // bleiben erhalten (kein stilles Normalisieren fremder Dateien). Historisierung
  // wie beim regulaeren Speichern (Aufloesung Datei > Bereich > App), previousText
  // und newText LF-normalisiert symmetrisch zu file:read. Ein Fehler pro Datei
  // stoppt den Lauf nicht (Best-Effort, der Linter bleibt das Netz). `anchorNew`
  // ist der neue Pfad der Hauptdatei (Suchraum-Anker). Liefert
  // { updated:[{path,count}], failed:[{path,error}] }.
  async function applyLinkUpdatesForRename(owner, pairs, anchorNew) {
    const renames = renamesFromPairs(pairs);
    const candidates = await collectMarkdownFilesInScope(owner, anchorNew);
    const updated = [];
    const failed = [];
    for (const filePath of candidates) {
      let result;
      let raw;
      try {
        raw = await fs.readFile(filePath, 'utf8');
        result = computeLinkRewrites(raw, { renames, contextPath: filePath });
      } catch (err) {
        failed.push({ path: filePath, error: err && err.message ? err.message : String(err) });
        continue;
      }
      if (!result.changed) continue;
      // 4T-0847 (Epic 3E-0147): Ein Rewrite, der denselben Text ergibt, ist
      // keine Änderung. Beim reinen Umbenennen kam der Fall nicht vor (der
      // Basename ändert sich immer); das physische Verschieben einer
      // Kapitel-Datei lässt ihn genau eintreten, weil der Basename bleibt.
      // Ohne diesen Halt würde jede Datei mit einem Wiki-Link auf die bewegte
      // Datei unverändert neu geschrieben und historisiert.
      if (result.newContent === raw) continue;
      try {
        const recordHistory = (await resolveHistoryFor(owner, filePath, result.newContent))
          .effective;
        const previousText = recordHistory ? await readPreviousTextFor(filePath) : null;
        markSelfWriting(filePath, result.newContent);
        await fs.writeFile(filePath, result.newContent, { encoding: 'utf8' });
        if (recordHistory) {
          const newTextNorm = result.newContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
          await recordMddOnSave(owner, filePath, previousText, newTextNorm);
        }
        updated.push({ path: filePath, count: result.hits.length });
      } catch (err) {
        failed.push({ path: filePath, error: err && err.message ? err.message : String(err) });
      }
    }
    return { updated, failed };
  }

  // 4T-0345 (Epic 3E-0062): Dry-Run fuer die Vorschau (4T-0346). Ermittelt pro
  // Kandidat die Trefferzahl ohne zu schreiben. `pairs` sind die geplanten
  // Umbenennungen; die alten Dateien existieren zum Vorschau-Zeitpunkt noch,
  // deshalb ist der Suchraum-Anker der alte Pfad.
  async function computeLinkUpdatePreview(owner, pairs, anchorAbsolute) {
    const renames = renamesFromPairs(pairs);
    const candidates = await collectMarkdownFilesInScope(owner, anchorAbsolute);
    const items = [];
    for (const filePath of candidates) {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const result = computeLinkRewrites(raw, { renames, contextPath: filePath });
        if (result.changed) items.push({ path: filePath, count: result.hits.length });
      } catch {
        /* Lesefehler ueberspringen; die Vorschau ist Best-Effort */
      }
    }
    return items;
  }

  /**
   * Eine Datei physisch umbenennen bzw. verschieben und die main-seitigen
   * Konsumenten nachziehen: Beobachtung, .mdd-Begleitdatei, offene
   * Historien-Pakete samt Suspend-Markierung, Zuletzt-Liste und der Eintrag
   * im Kapitel-Baum eines Buches. Der Broadcast 'file:renamed' erreicht alle
   * Fenster. 4T-0999: aus dem IPC-Block herausgeloest; die Semantik ist
   * unveraendert.
   *
   * @param {string} absolute Bisheriger Pfad.
   * @param {string} newPath Neuer Pfad.
   * @returns {Promise<object>} { ok: true, bookDir } bzw. { ok: false, error }.
   */
  async function renameSingleFile(absolute, newPath) {
    // 4T-0998: Die Beobachtung reist ueber moveWatchEntry mit; die Semantik
    // ist unveraendert (Watcher der alten Datei VOR dem Rename schliessen,
    // damit kein unlink-Event ('file:removed') die Tabs als fehlend markiert;
    // die Owner danach auf den neuen Pfad ummelden, bei einem Fehler zurueck
    // auf den alten). Bis dahin griff dieser Block selbst in die watchers-Map.
    const bewegt = await moveWatchEntry(absolute, newPath, async () => {
      try {
        await fs.rename(absolute, newPath);
      } catch (err) {
        const msg = err && err.message ? String(err.message) : String(err);
        return { ok: false, error: msg };
      }
      return { ok: true };
    });
    if (!bewegt.ok) return bewegt;
    // .mdd-Begleitdatei mitziehen (3E-0060); Fehler sind nicht fatal —
    // der Hash-Abgleich der Historie faengt eine verwaiste .mdd ab.
    try {
      const oldMdd = mddPathFor(absolute);
      await fs.access(oldMdd);
      await fs.rename(oldMdd, mddPathFor(newPath));
    } catch {
      /* keine .mdd oder nicht verschiebbar */
    }
    // Offene Historien-Pakete und Suspend-Markierung auf den neuen Pfad.
    const oldKey = mddKeyOf(absolute);
    const newKey = mddKeyOf(newPath);
    if (mddOpenPackets.has(oldKey)) {
      mddOpenPackets.set(newKey, mddOpenPackets.get(oldKey));
      mddOpenPackets.delete(oldKey);
    }
    if (mddSuspendedPaths.has(oldKey)) {
      mddSuspendedPaths.delete(oldKey);
      mddSuspendedPaths.add(newKey);
    }
    // Recent-Files-Eintrag ersetzen (Position bleibt erhalten).
    // 4T-0999: Der Speicher entsteht erst mit loadStore, diese Fabrik aber
    // schon beim Programmstart — deshalb der Getter statt eines Werts.
    const store = getStore();
    if (store) {
      const recent = store.get('recentFiles', []);
      if (recent.includes(absolute)) {
        store.set(
          'recentFiles',
          recent.map((p) => (p === absolute ? newPath : p)),
        );
        applyMenuToAllWindows();
      }
    }
    broadcast('file:renamed', { oldPath: absolute, newPath });
    // 4T-0847 (Epic 3E-0147, Story 4S-0756): Ist die bewegte Datei Kapitel
    // eines Buches, fährt ihr Eintrag im Kapitel-Baum mit — beim Umbenennen
    // wie beim Verschieben, und unabhängig davon, ob das Buch gerade
    // geöffnet ist (die Zugehörigkeit hängt an der Begleitdatei, nicht am
    // Sitzungs-Zustand). Best-Effort nach vollzogener Bewegung: ein Fehler
    // hier lässt die Umbenennung nicht scheitern, sie ist bereits geschehen.
    // Den Zustands-Broadcast setzt der Aufrufer über sendBookStateForDirs,
    // damit eine Kaskade ihn einmal statt je Datei auslöst.
    let bookDir = null;
    try {
      const followed = await books.followChapterFileMove(absolute, newPath);
      if (followed.ok && followed.changed) bookDir = followed.bookDir;
      else if (!followed.ok) {
        console.error('[book-chapter] Nachtrag im Kapitel-Baum abgelehnt:', followed.error);
      }
    } catch (err) {
      console.error(
        '[book-chapter] Nachtrag im Kapitel-Baum fehlgeschlagen:',
        err && err.message ? err.message : err,
      );
    }
    // 4T-1364 (Epic 3E-0171): Ist die bewegte Datei die Start-Seite ihres
    // Bereichs, faehrt die Festlegung mit — gleiches Best-Effort-Muster wie der
    // Kapitel-Baum darueber. Eine eigene Nachfuehrungs-Mechanik entsteht dafuer
    // bewusst nicht (Entscheidung aus 4T-1363): Schlaegt der Nachtrag fehl,
    // faengt der Ungueltig-Fall beim naechsten Oeffnen den Rest ab.
    try {
      if (followAreaStartPage) await followAreaStartPage(absolute, newPath);
    } catch (err) {
      console.error(
        '[start-page] Nachtrag der Start-Seiten-Festlegung fehlgeschlagen:',
        err && err.message ? err.message : err,
      );
    }
    return { ok: true, bookDir };
  }

  return {
    collectMarkdownFilesInScope,
    renamesFromPairs,
    applyLinkUpdatesForRename,
    computeLinkUpdatePreview,
    renameSingleFile,
  };
}

module.exports = { createLinkUpdate };
