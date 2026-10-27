// 4T-002348 (Epic 3E-000184): Die Kaskade des Umbenennens als aufrufbare
// Funktion — Unterseiten und Teile eines geteilten Dokuments ziehen mit, alle
// Ziele werden vor der ersten Bewegung geprüft, danach ziehen Zuordnungs-Zeilen
// und Verweise nach.
//
// **Warum ausgezogen.** Bis hierher stand die Kaskade im Rumpf des Kanals
// `file:rename` (src/main/ipc/rename.js). Der Workflow-Befehl `rename` und
// `move` brauchen dieselben Unterseiten, Teile und Verweise; eine zweite
// Fassung im Workflow-Modul liefe bei der nächsten Änderung auseinander. Der
// Kanal ruft seither diese Funktionen, sein Verhalten ist unverändert.
//
// **Verschieben** ist dieselbe Kaskade mit einem anderen Ziel-Ordner: Ein Paar
// behält seinen Ort relativ zur bewegten Datei, weil die Unterseiten-Suche den
// Ordner der Datei samt zwei Unterordner-Ebenen umfasst.
//
// Eigener Zustand: keiner. Die physische Bewegung je Datei bleibt
// `renameSingleFile` in documents/link-update.js.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
// 4T-001292 (Epic 3E-000224): Die Teile eines geteilten Dokuments ziehen beim
// Umbenennen mit, und ihre Zuordnungs-Zeile wird nachgezogen.
const { scanOwnParts, rewritePartBase } = require('./document-parts-io');
const { baseBasenameOf } = require('../../shared/document-parts');
// 4T-001789 (Epic 3E-000255): Die Fehlschlag-Kennungen des Mitziehens werden
// durchgereicht statt mit 'partial' ueberschrieben.
const { BEGLEIT_CODES } = require('./companion-files');
const selbstSchreib = require('./self-write');

// 4T-000947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
// Require-Cache).
const markSelfWriting = selbstSchreib.merke;

/**
 * Baut die Kaskade des Umbenennens.
 *
 * @param {object} deps Abhaengigkeiten aus main.js (dieselben Namen wie in rename.js).
 * @param {object} deps.subpages Namens-Logik der Unterseiten.
 * @param {(p: string) => boolean} deps.isMarkdownPath Markdown-Endungs-Pruefung.
 * @param {Function} deps.renameSingleFile Physische Umbenennung samt Nachzug.
 * @param {Function} deps.sendBookStateForDirs Zustands-Meldung betroffener Buecher.
 * @param {Function} deps.renamesFromPairs Rename-Paare in die Form des Rewrite-Kerns.
 * @param {Function} deps.applyLinkUpdatesForRename Eingehende Links anpassen.
 * @param {(channel: string, ...args: any[]) => void} deps.broadcast Meldung an alle Fenster.
 * @returns {object} `scanSubpageDescendants`, `cascadePairs`, `runCascade`.
 */
function createRenameCascade(deps) {
  const {
    subpages,
    isMarkdownPath,
    renameSingleFile,
    sendBookStateForDirs,
    renamesFromPairs,
    applyLinkUpdatesForRename,
    broadcast,
  } = deps;

  // 4T-000340: Nachfahren einer Seite im Suchraum finden — alle Markdown-
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

  /**
   * Die Paare einer Kaskade: die Datei selbst, ihre Unterseiten (4T-000340:
   * Praefix-Ersetzung des geaenderten Namens-Anteils) und ihre eigenen Teile.
   *
   * @param {string} absolute bisheriger Pfad der Datei.
   * @param {string} newPath neuer Pfad der Datei.
   * @param {{subpages?: boolean}} [opts] `subpages: false` laesst die Unterseiten aus.
   * @returns {Promise<{from: string, to: string}[]>}
   */
  async function cascadePairs(absolute, newPath, opts = {}) {
    const oldBase = path.parse(absolute).name;
    const newBase = path.parse(newPath).name;
    const vonOrdner = path.dirname(absolute);
    const nachOrdner = path.dirname(newPath);
    // Ein Mitzieher behaelt seinen Ort relativ zur Datei; beim Umbenennen ist
    // das sein eigener Ordner, wie bisher.
    const ziel = (datei, rest) => {
      const p = path.parse(datei);
      return path.join(nachOrdner, path.relative(vonOrdner, p.dir), newBase + rest + p.ext);
    };
    const pairs = [{ from: absolute, to: newPath }];
    if (opts.subpages !== false) {
      for (const d of await scanSubpageDescendants(absolute)) {
        pairs.push({ from: d, to: ziel(d, path.parse(d).name.slice(oldBase.length)) });
      }
    }
    // 4T-001292 (Epic 3E-000224): Die eigenen Teile eines geteilten Dokuments
    // ziehen mit. Sie tragen ein anderes Trennzeichen als die Unterseiten und
    // fallen deshalb NICHT in die Nachkommen-Suche oben — ohne diesen Zusatz
    // bliebe 'Notizen•part-00002.md' liegen, waehrend seine Kopf-Datei
    // 'Merkzettel.md' hiesse, und beide fänden nie wieder zueinander.
    for (const teil of await scanOwnParts(absolute)) {
      pairs.push({ from: teil, to: ziel(teil, path.parse(teil).name.slice(oldBase.length)) });
    }
    return pairs;
  }

  /**
   * Fuehrt eine Kaskade aus: Kollisions-Pruefung ueber ALLE Ziele vor der
   * ersten Umbenennung (reine Case-Aenderung auf NTFS bleibt erlaubt), dann je
   * Paar `renameSingleFile`; ein Teilfehler stoppt die Kaskade.
   *
   * @param {object|null} owner Fenster, dessen Bereich den Suchraum der Verweise bestimmt.
   * @param {{from: string, to: string}[]} pairs aus `cascadePairs`.
   * @param {{updateLinks?: boolean, anchorNew?: string, ensureDirs?: boolean}} [opts]
   *   `ensureDirs` legt fehlende Ziel-Ordner vor der Bewegung an (Verschieben).
   * @returns {Promise<object>} wie `file:rename` ohne `path`.
   */
  async function runCascade(owner, pairs, opts = {}) {
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
    // 4T-000847: Buch-Ordner, deren Begleitdatei mitgezogen wurde; ihr
    // Zustands-Broadcast läuft einmal am Ende statt je Datei der Kaskade.
    const bookDirs = [];
    for (const pair of pairs) {
      if (opts.ensureDirs) await fs.mkdir(path.dirname(pair.to), { recursive: true });
      const res = await renameSingleFile(pair.from, pair.to);
      if (!res.ok) {
        // Teilfehler: Kaskade stoppt; bereits umbenannte Dateien sind per
        // Broadcast konsistent nachgezogen, der Renderer meldet den Stand.
        await sendBookStateForDirs(bookDirs);
        // 4T-001789 (Epic 3E-000255): Scheitert das Mitziehen einer
        // Begleit-Datei, traegt der Fehlschlag seinen eigenen Grund.
        const begleit = BEGLEIT_CODES.includes(res.code);
        return {
          ok: false,
          error: res.error,
          code: begleit ? res.code : 'partial',
          renamedCount,
          totalCount: pairs.length,
          failedPath: pair.from,
          ...(res.companionPath ? { companionPath: res.companionPath } : {}),
          ...(res.from ? { from: res.from, to: res.to } : {}),
        };
      }
      if (res.bookDir) bookDirs.push(res.bookDir);
      renamedCount++;
    }
    await sendBookStateForDirs(bookDirs);
    // 4T-001292 (Epic 3E-000224): Die Zuordnungs-Zeile traegt den Grundnamen und
    // wird jetzt nachgezogen — in der Kopf-Datei wie in jedem Teil. Wer keine
    // Zuordnungs-Zeile traegt, wird uebergangen; baseBasenameOf liefert bei
    // einem Teil den Namen seiner Kopf-Datei und sonst den Namen selbst.
    for (const pair of pairs) {
      const neuerBase = baseBasenameOf(path.parse(pair.to).name);
      const res = await rewritePartBase([pair.to], neuerBase, { markSelfWriting });
      if (!res.ok) {
        console.error('[teile] Zuordnungs-Zeile nicht nachgezogen:', res.pfad, res.error);
      }
    }
    // 4T-000345 (Epic 3E-000062): eingehende Links auf die umbenannten Dateien
    // anpassen. Best-Effort nach vollzogener Umbenennung: ein Fehler hier
    // laesst das Ergebnis nicht scheitern.
    let linkUpdate = null;
    if (opts.updateLinks !== false) {
      try {
        linkUpdate = await applyLinkUpdatesForRename(
          owner,
          pairs,
          opts.anchorNew || (pairs[0] && pairs[0].to),
        );
        broadcast('linkUpdate:applied', {
          renames: renamesFromPairs(pairs),
          updated: linkUpdate.updated,
          failed: linkUpdate.failed,
        });
      } catch (err) {
        console.error('[link-update] fehlgeschlagen:', err && err.message ? err.message : err);
      }
    }
    return { ok: true, renamedCount, renamed: pairs.map((p) => p.to), linkUpdate };
  }

  return { scanSubpageDescendants, cascadePairs, runCascade };
}

module.exports = { createRenameCascade };
