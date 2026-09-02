// IPC-Kanal-Gruppe Umbenennen und Unterseiten: die Kaskade ueber den
// Unterseiten-Baum, die Vorschau des Link-Updates und das Anlegen einer
// Unterseite.
//
// Auszug aus main.js, 4T-0999 (Epic 3E-0196). Kanal-Gruppe: file:rename,
// rename:linkUpdatePreview, subpage:*.
//
// Eigener Zustand: keiner. Die physische Umbenennung einer einzelnen Datei
// liegt als renameSingleFile in documents/link-update.js, weil die
// Buch-Handler sie ebenfalls brauchen.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
// 4T-1292 (Epic 3E-0224): Die Teile eines geteilten Dokuments ziehen beim
// Umbenennen mit, und ihre Zuordnungs-Zeile wird nachgezogen.
const { scanOwnParts, rewritePartBase } = require('../documents/document-parts-io');
const { isPartBasename, baseBasenameOf } = require('../../shared/document-parts');
const selbstSchreib = require('../documents/self-write');

// 4T-0947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
// Require-Cache), wie in ipc/files.js.
const markSelfWriting = selbstSchreib.merke;

/**
 * Registriert die Umbenennen- und Unterseiten-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {object} deps.subpages Namens-Logik der Unterseiten.
 * @param {(p: string) => boolean} deps.isMarkdownPath Markdown-Endungs-Pruefung.
 * @param {Function} deps.renameSingleFile Physische Umbenennung samt Nachzug.
 * @param {Function} deps.sendBookStateForDirs Zustands-Meldung betroffener Buecher.
 * @param {Function} deps.renamesFromPairs Rename-Paare in die Form des Rewrite-Kerns.
 * @param {Function} deps.applyLinkUpdatesForRename Eingehende Links anpassen.
 * @param {Function} deps.computeLinkUpdatePreview Dry-Run der Link-Anpassung.
 * @param {(channel: string, ...args: any[]) => void} deps.broadcast Meldung an alle Fenster.
 */
function registerRenameIpc(handle, deps) {
  const {
    senderWindow,
    subpages,
    isMarkdownPath,
    renameSingleFile,
    sendBookStateForDirs,
    renamesFromPairs,
    applyLinkUpdatesForRename,
    computeLinkUpdatePreview,
    broadcast,
  } = deps;

  // --- 4T-0339/4T-0340 (Epic 3E-0061): Datei umbenennen ------------------------
  // Benennt eine Markdown-Datei im selben Ordner um und kaskadiert ueber
  // ihren Unterseiten-Baum (4T-0340: Praefix-Ersetzung im Basename aller
  // Nachfahren, jede Datei in ihrem eigenen Ordner). Pro Datei ziehen die
  // Main-seitigen Konsumenten nach: Datei-Watcher (Owner-Transfer ohne
  // unlink-Rauschen), .mdd-Begleitdatei (3E-0060), offene Historien-
  // Pakete, Recent-Files-Liste. Der Broadcast 'file:renamed' erreicht alle
  // Fenster; der Renderer zieht Tabs, Lesezeichen, Per-Datei-Settings und
  // Sitzung nach. Kollisions-Pruefung ueber ALLE Ziele vor der ersten
  // Umbenennung (reine Case-Aenderung auf NTFS bleibt erlaubt); ein
  // Teilfehler stoppt die Kaskade und wird als 'partial' gemeldet.

  // 4T-0340: Nachfahren einer Seite im Suchraum finden — alle Markdown-
  // Dateien, deren Basename mit '<Name>∕' beginnt. Suchraum und Ignore-
  // Regeln wie der Backlinks-Index (Ordner der Datei plus zwei Unterordner-
  // Ebenen; node_modules und Punkt-Ordner bleiben draussen); Vergleich
  // NFC-normalisiert und case-insensitiv wie die Wiki-Aufloesung.
  async function scanSubpageDescendants(absolute) {
    const rootDir = path.dirname(absolute);
    const prefixKey = subpages
      .childPrefix(path.parse(absolute).name)
      .normalize('NFC')
      .toLowerCase();
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
          if (depth < 2) queue.push({ dir: full, depth: depth + 1 });
        } else if (entry.isFile() && isMarkdownPath(entry.name)) {
          const nameKey = path.parse(entry.name).name.normalize('NFC').toLowerCase();
          if (nameKey.startsWith(prefixKey)) out.push(full);
        }
      }
    }
    return out;
  }

  // 4T-0340: Nachfahren-Liste fuer den Dialog-Hinweis des Renderers.
  handle('subpage:descendants', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) return { ok: false, files: [] };
    try {
      const files = await scanSubpageDescendants(path.resolve(filePath));
      // 4T-1292 (Epic 3E-0224, Auflage des Epics): Teil-Dateien erscheinen
      // NICHT in der Unterseiten-Sektion. Sie sind keine eigenen Dokumente,
      // sondern Bruchstuecke eines einzigen.
      //
      // Der Filter ist noetig, obwohl die Teile ein eigenes Trennzeichen
      // tragen: Ist eine UNTERSEITE geteilt, beginnt ihr Teil
      // ('Eltern∕Kind•part-00002') sehr wohl mit dem Unterseiten-Praefix der
      // Elternseite und faellt damit in deren Nachkommen-Liste. Gefiltert wird
      // hier und nicht in scanSubpageDescendants, weil das Umbenennen die
      // Teile im Gegenteil MITNEHMEN muss — Anzeige und Kaskade brauchen
      // dieselbe Suche, aber verschiedene Ergebnisse.
      return { ok: true, files: files.filter((f) => !isPartBasename(path.parse(f).name)) };
    } catch {
      return { ok: false, files: [] };
    }
  });

  handle('file:rename', async (event, params) => {
    const oldPath = params && params.oldPath;
    const newBasename =
      typeof (params && params.newBasename) === 'string' ? params.newBasename.trim() : '';
    if (typeof oldPath !== 'string' || !oldPath) return { ok: false, error: 'invalid path' };
    const vErr = subpages.basenameValidationError(newBasename);
    if (vErr) return { ok: false, error: 'invalid name', code: vErr };
    const absolute = path.resolve(oldPath);
    const parsed = path.parse(absolute);
    const ext = parsed.ext || '.md';
    const newPath = path.join(parsed.dir, newBasename + ext);
    if (newPath === absolute) return { ok: true, path: absolute, unchanged: true };
    // 4T-0340: Unterseiten-Baum ermitteln und Ziel-Paare bilden
    // (Praefix-Ersetzung des geaenderten Namens-Anteils).
    const oldBase = parsed.name;
    const pairs = [{ from: absolute, to: newPath }];
    for (const d of await scanSubpageDescendants(absolute)) {
      const dParsed = path.parse(d);
      const rest = dParsed.name.slice(oldBase.length); // beginnt mit U+2215
      pairs.push({ from: d, to: path.join(dParsed.dir, newBasename + rest + dParsed.ext) });
    }
    // 4T-1292 (Epic 3E-0224): Die eigenen Teile eines geteilten Dokuments
    // ziehen mit. Sie tragen ein anderes Trennzeichen als die Unterseiten und
    // fallen deshalb NICHT in die Nachkommen-Suche oben — ohne diesen Zusatz
    // bliebe 'Notizen•part-00002.md' liegen, waehrend seine Kopf-Datei
    // 'Merkzettel.md' hiesse, und beide fänden nie wieder zueinander.
    for (const teil of await scanOwnParts(absolute)) {
      const tParsed = path.parse(teil);
      const rest = tParsed.name.slice(oldBase.length); // beginnt mit U+2022
      pairs.push({ from: teil, to: path.join(tParsed.dir, newBasename + rest + tParsed.ext) });
    }
    // Kollisions-Pruefung ueber alle Ziele VOR der ersten Umbenennung.
    for (const pair of pairs) {
      if (pair.to.toLowerCase() === pair.from.toLowerCase()) continue;
      try {
        await fs.access(pair.to);
        return { ok: false, error: 'exists', code: 'exists', conflictPath: pair.to };
      } catch {
        /* Ziel frei */
      }
    }
    let renamedCount = 0;
    // 4T-0847: Buch-Ordner, deren Begleitdatei mitgezogen wurde; ihr
    // Zustands-Broadcast läuft einmal am Ende statt je Datei der Kaskade.
    const bookDirs = [];
    for (const pair of pairs) {
      const res = await renameSingleFile(pair.from, pair.to);
      if (!res.ok) {
        // Teilfehler: Kaskade stoppt; bereits umbenannte Dateien sind per
        // Broadcast konsistent nachgezogen, der Renderer meldet den Stand.
        await sendBookStateForDirs(bookDirs);
        return {
          ok: false,
          error: res.error,
          code: 'partial',
          renamedCount,
          totalCount: pairs.length,
          failedPath: pair.from,
        };
      }
      if (res.bookDir) bookDirs.push(res.bookDir);
      renamedCount++;
    }
    await sendBookStateForDirs(bookDirs);
    // 4T-1292 (Epic 3E-0224): Die Zuordnungs-Zeile traegt den Grundnamen und
    // wird jetzt nachgezogen — in der Kopf-Datei wie in jedem Teil. Sie ist die
    // Wahrheit (F2), der Dateiname allein genuegt nicht: Ohne den Nachzug
    // zeigten die Teile auf ein Dokument, das es unter diesem Namen nicht mehr
    // gibt, und der Lese-Weg fuegte sie nicht mehr zusammen.
    //
    // Erfasst werden alle umbenannten Dateien; wer keine Zuordnungs-Zeile
    // traegt, wird uebergangen. Damit sind auch die Teile einer geteilten
    // UNTERSEITE abgedeckt, deren Grundname sich ebenfalls geaendert hat — ihr
    // neuer Grundname steht in ihrem eigenen neuen Dateinamen.
    for (const pair of pairs) {
      // baseBasenameOf liefert bei einem Teil seinen Grundnamen und sonst den
      // Namen selbst — fuer die Kopf-Datei ist das ihr neuer Name, fuer einen
      // Teil der neue Name seiner Kopf-Datei.
      const neuerBase = baseBasenameOf(path.parse(pair.to).name);
      const res = await rewritePartBase([pair.to], neuerBase, { markSelfWriting });
      if (!res.ok) {
        console.error('[teile] Zuordnungs-Zeile nicht nachgezogen:', res.pfad, res.error);
      }
    }
    // 4T-0345 (Epic 3E-0062): eingehende Links auf die umbenannten Dateien
    // anpassen (Standard aktiv; der Dialog aus 4T-0346 schaltet updateLinks um).
    // Best-Effort nach vollzogener Umbenennung: ein Fehler hier laesst das
    // Rename-Ergebnis nicht scheitern.
    const updateLinks = !(params && params.updateLinks === false);
    let linkUpdate = null;
    if (updateLinks) {
      try {
        const owner = senderWindow(event);
        linkUpdate = await applyLinkUpdatesForRename(owner, pairs, newPath);
        broadcast('linkUpdate:applied', {
          renames: renamesFromPairs(pairs),
          updated: linkUpdate.updated,
          failed: linkUpdate.failed,
        });
      } catch (err) {
        console.error('[link-update] fehlgeschlagen:', err && err.message ? err.message : err);
      }
    }
    // 4T-0346 (Epic 3E-0062): linkUpdate im Ergebnis, damit der ausloesende
    // Renderer den Bericht ohne den (an alle Fenster gehenden) Broadcast bauen
    // kann; { updated:[{path,count}], failed:[{path,error}] } oder null. `renamed`
    // traegt alle neuen Pfade (Hauptdatei plus Kaskaden-Nachfahren).
    return {
      ok: true,
      path: newPath,
      renamedCount,
      renamed: pairs.map((p) => p.to),
      linkUpdate,
    };
  });

  // 4T-0345 (Epic 3E-0062): Vorschau-Datenpfad fuer den Umbenennen-Dialog
  // (4T-0346). Dry-Run vor der Umbenennung: liefert die betroffenen Dateien mit
  // Trefferzahl, ohne zu schreiben. Die alten Dateien existieren noch, deshalb
  // ist der Suchraum-Anker der alte Pfad. Die Dirty-Kennzeichnung ergaenzt der
  // Renderer aus seinen offenen Tabs (der Main fuehrt keinen Dirty-Status).
  handle('rename:linkUpdatePreview', async (event, params) => {
    const oldPath = params && params.oldPath;
    const newBasename =
      typeof (params && params.newBasename) === 'string' ? params.newBasename.trim() : '';
    if (typeof oldPath !== 'string' || !oldPath) return { ok: false, error: 'invalid path' };
    if (subpages.basenameValidationError(newBasename)) return { ok: false, error: 'invalid name' };
    const absolute = path.resolve(oldPath);
    const parsed = path.parse(absolute);
    const ext = parsed.ext || '.md';
    const newPath = path.join(parsed.dir, newBasename + ext);
    const oldBase = parsed.name;
    const pairs = [{ from: absolute, to: newPath }];
    for (const d of await scanSubpageDescendants(absolute)) {
      const dParsed = path.parse(d);
      const rest = dParsed.name.slice(oldBase.length);
      pairs.push({ from: d, to: path.join(dParsed.dir, newBasename + rest + dParsed.ext) });
    }
    const owner = senderWindow(event);
    const items = await computeLinkUpdatePreview(owner, pairs, absolute);
    return { ok: true, items };
  });

  // 4T-0338 (Epic 3E-0061): Unterseite anlegen — baut den U+2215-Dateinamen
  // aus aktiver Datei und Segment und legt die Datei an, ohne Bestehendes
  // zu ueberschreiben ('wx'-Flag). Existiert das Ziel, meldet der Handler
  // das als existed=true (der Renderer oeffnet dann die vorhandene Datei).
  handle('subpage:create', async (_event, params) => {
    const basePath = params && params.basePath;
    const segment = typeof (params && params.segment) === 'string' ? params.segment.trim() : '';
    if (typeof basePath !== 'string' || !basePath) return { ok: false, error: 'invalid base' };
    const vErr = subpages.segmentValidationError(segment);
    if (vErr) return { ok: false, error: 'invalid segment', code: vErr };
    const dir = path.dirname(basePath);
    const ownBase = path.basename(basePath).replace(/\.(md|markdown|mdown|mkd)$/i, '');
    const target = path.join(dir, subpages.childPrefix(ownBase) + segment + '.md');
    try {
      await fs.writeFile(target, '', { flag: 'wx' });
      return { ok: true, path: target, existed: false };
    } catch (err) {
      if (err && err.code === 'EEXIST') return { ok: true, path: target, existed: true };
      const msg = err && err.message ? String(err.message) : String(err);
      return { ok: false, error: msg };
    }
  });
}

module.exports = { registerRenameIpc };
