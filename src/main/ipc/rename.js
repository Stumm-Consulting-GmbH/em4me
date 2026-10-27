// IPC-Kanal-Gruppe Umbenennen und Unterseiten: die Kaskade ueber den
// Unterseiten-Baum, die Vorschau des Link-Updates und das Anlegen einer
// Unterseite.
//
// Auszug aus main.js, 4T-000999 (Epic 3E-000196). Kanal-Gruppe: file:rename,
// rename:linkUpdatePreview, subpage:*.
//
// Eigener Zustand: keiner. Die physische Umbenennung einer einzelnen Datei
// liegt als renameSingleFile in documents/link-update.js, weil die
// Buch-Handler sie ebenfalls brauchen; die Kaskade darueber seit 4T-002348
// in documents/rename-cascade.js.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { isPartBasename } = require('../../shared/document-parts');
// 4T-002348 (Epic 3E-000184): Die Kaskade (Unterseiten, Teile eines geteilten
// Dokuments, Kollisions-Pruefung, Zuordnungs-Zeilen, Verweis-Nachzug) liegt
// als Funktion in documents/rename-cascade.js, weil der Workflow-Befehl
// `rename` und `move` sie ebenfalls brauchen.
const { createRenameCascade } = require('../documents/rename-cascade');

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
  const kaskade = createRenameCascade({
    subpages,
    isMarkdownPath,
    renameSingleFile,
    sendBookStateForDirs,
    renamesFromPairs,
    applyLinkUpdatesForRename,
    broadcast,
  });

  // --- 4T-000339/4T-000340 (Epic 3E-000061): Datei umbenennen ------------------------
  // Benennt eine Markdown-Datei im selben Ordner um und kaskadiert ueber
  // ihren Unterseiten-Baum (4T-000340: Praefix-Ersetzung im Basename aller
  // Nachfahren, jede Datei in ihrem eigenen Ordner). Pro Datei ziehen die
  // Main-seitigen Konsumenten nach: Datei-Watcher (Owner-Transfer ohne
  // unlink-Rauschen), .mdd-Begleitdatei (3E-000060), offene Historien-
  // Pakete, Recent-Files-Liste. Der Broadcast 'file:renamed' erreicht alle
  // Fenster; der Renderer zieht Tabs, Lesezeichen, Per-Datei-Settings und
  // Sitzung nach. Kollisions-Pruefung ueber ALLE Ziele vor der ersten
  // Umbenennung (reine Case-Aenderung auf NTFS bleibt erlaubt); ein
  // Teilfehler stoppt die Kaskade und wird als 'partial' gemeldet.

  // 4T-000340: Nachfahren-Liste fuer den Dialog-Hinweis des Renderers.
  handle('subpage:descendants', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) return { ok: false, files: [] };
    try {
      const files = await kaskade.scanSubpageDescendants(path.resolve(filePath));
      // 4T-001292 (Epic 3E-000224, Auflage des Epics): Teil-Dateien erscheinen
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
    // 4T-002348 (Epic 3E-000184): Paare, Kollisions-Pruefung, Bewegung,
    // Zuordnungs-Zeilen und Verweis-Nachzug liegen in der ausgezogenen Kaskade;
    // der Workflow-Befehl `rename` nutzt dieselbe.
    const pairs = await kaskade.cascadePairs(absolute, newPath);
    // 4T-000345 (Epic 3E-000062): Standard aktiv; der Dialog aus 4T-000346
    // schaltet updateLinks um.
    const updateLinks = !(params && params.updateLinks === false);
    const res = await kaskade.runCascade(senderWindow(event), pairs, {
      updateLinks,
      anchorNew: newPath,
    });
    if (!res.ok) return res;
    // 4T-000346 (Epic 3E-000062): linkUpdate im Ergebnis, damit der ausloesende
    // Renderer den Bericht ohne den (an alle Fenster gehenden) Broadcast bauen
    // kann; { updated:[{path,count}], failed:[{path,error}] } oder null. `renamed`
    // traegt alle neuen Pfade (Hauptdatei plus Kaskaden-Nachfahren).
    return {
      ok: true,
      path: newPath,
      renamedCount: res.renamedCount,
      renamed: res.renamed,
      linkUpdate: res.linkUpdate,
    };
  });

  // 4T-000345 (Epic 3E-000062): Vorschau-Datenpfad fuer den Umbenennen-Dialog
  // (4T-000346). Dry-Run vor der Umbenennung: liefert die betroffenen Dateien mit
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
    for (const d of await kaskade.scanSubpageDescendants(absolute)) {
      const dParsed = path.parse(d);
      const rest = dParsed.name.slice(oldBase.length);
      pairs.push({ from: d, to: path.join(dParsed.dir, newBasename + rest + dParsed.ext) });
    }
    const owner = senderWindow(event);
    const items = await computeLinkUpdatePreview(owner, pairs, absolute);
    return { ok: true, items };
  });

  // 4T-000338 (Epic 3E-000061): Unterseite anlegen — baut den U+2215-Dateinamen
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
