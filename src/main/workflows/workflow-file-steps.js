// 4T-002348 (Epic 3E-000184): Die Datei- und Ordner-Befehle der Workflows im
// Hauptprozess — `create`, `mkdir`, `rename`, `move`, `copy` sowie die
// Pfad-Prüfung der Fenster-Handgriffe `open` und `close` (Story 4S-001102).
//
// **Nichts wird überschrieben** (Entscheidung des Product Owners vom
// 2026-10-22): Ein vorhandenes Ziel von `create`, `copy`, `rename` und `move`
// lässt den Schritt mit `targetExists` scheitern. Die Entscheidungen vom
// 2026-10-23 (Empfehlungen E2 bis E4 pauschal übernommen): Ein fehlender
// Ziel-Ordner von `create`, `copy` und `move` wird innerhalb der Wurzel
// angelegt; `mkdir` auf einen vorhandenen Ordner und `close` auf ein nicht
// geöffnetes Dokument gelingen ohne Änderung; beim `move` einer Datei ziehen
// ihre Unterseiten mit.
//
// **Bestands-Bausteine:** Anlegen mit der Flagge `wx` wie `area:createFile`;
// Umbenennen und Verschieben einer Datei über die Kaskade aus
// `documents/rename-cascade.js` (Unterseiten, Teile, Verweise), einen Ordner
// je Datei über `renameSingleFile`, weil nur dieser Weg Beobachtung,
// Begleitdateien, Bücher und Start-Seite nachführt; Kopieren mit
// `COPYFILE_EXCL` und `kopiereBegleitdatei` aus `ipc/area-copy.js`, damit die
// Kopie aus dem Workflow dieselbe ist wie die aus dem Panel (der Abschnitt
// `workflow` der Begleitdatei reist dabei nicht mit).
//
// **Ordner-Lauf:** `node_modules` und Punkt-Einträge werden übersprungen wie
// in jedem Ordner-Lauf der Anwendung (unter ihnen der Sperr-Ordner der
// Datenbank); sie bleiben am alten Ort, und der Quell-Ordner bleibt dann
// stehen. Leere Quell-Ordner werden nicht-rekursiv entfernt.
//
// Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { kopiereBegleitdatei } = require('../ipc/area-copy');
const { readPartLine } = require('../../shared/document-parts');
const { checkFileName } = require('../../shared/workflows/workflow-paths.js');
const { isInsideArea, isSamePath } = require('../area/area-path');
const { BEGLEIT_CODES } = require('../documents/companion-files');
const { resolveAreaPath } = require('./workflow-area-path.js');
const { readStepSource } = require('./workflow-content-steps.js');

/** Die Befehle dieses Moduls. */
const FILE_KEYWORDS = Object.freeze(['create', 'mkdir', 'rename', 'move', 'copy', 'open', 'close']);

function fehlschlag(code, detail = {}) {
  return { ok: false, code, detail };
}

function fsCode(err) {
  return err && err.code ? err.code : null;
}

async function statOderNull(abs) {
  try {
    return await fs.stat(abs);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
}

// Ergebnis der Kaskade in die Codes der Workflows.
function kaskadenFehlschlag(res) {
  if (res.code === 'exists') return fehlschlag('targetExists', { path: res.conflictPath });
  const code = BEGLEIT_CODES.includes(res.code) ? res.code : 'partial';
  return fehlschlag(code, {
    renamedCount: res.renamedCount,
    totalCount: res.totalCount,
    failedPath: res.failedPath,
  });
}

// Alle Dateien und Ordner unterhalb von `wurzel`, ohne node_modules und
// Punkt-Einträge; Ordner in Lauf-Reihenfolge (Eltern vor Kindern).
async function ordnerInhalt(wurzel) {
  const dateien = [];
  const ordner = [];
  const queue = [wurzel];
  while (queue.length > 0) {
    const dir = queue.shift();
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        ordner.push(full);
        queue.push(full);
      } else if (entry.isFile()) {
        dateien.push(full);
      }
    }
  }
  return { dateien, ordner };
}

/**
 * Baut die Ausführung der Datei- und Ordner-Befehle.
 *
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {(p: string) => boolean} deps.isMarkdownPath Markdown-Erkennung am Pfad.
 * @param {object} deps.cascade Kaskade aus `createRenameCascade`.
 * @param {Function} deps.renameSingleFile Physische Bewegung einer Datei samt Nachzug.
 * @param {Function} deps.sendBookStateForDirs Zustands-Meldung betroffener Bücher.
 * @param {Function} deps.applyLinkUpdatesForRename Eingehende Verweise anpassen.
 * @param {Function} deps.renamesFromPairs Paare in die Form des Rewrite-Kerns.
 * @param {(channel: string, ...args: any[]) => void} deps.broadcast Meldung an alle Fenster.
 * @returns {{runFileStep: Function}}
 */
function createWorkflowFileSteps(deps) {
  const { isMarkdownPath, cascade, renameSingleFile, sendBookStateForDirs } = deps;
  const { applyLinkUpdatesForRename, renamesFromPairs, broadcast } = deps;

  async function anlegen(ctx, step) {
    const ziel = await resolveAreaPath(ctx.root, step.args[0]);
    if (!ziel.ok) return ziel;
    const quelle = await readStepSource(ctx, step.source);
    if (!quelle.ok) return quelle;
    try {
      await fs.mkdir(path.dirname(ziel.abs), { recursive: true });
      await fs.writeFile(ziel.abs, quelle.text, { encoding: 'utf8', flag: 'wx' });
    } catch (err) {
      if (err && err.code === 'EEXIST') return fehlschlag('targetExists', { path: step.args[0] });
      return fehlschlag('writeFailed', { path: step.args[0], fsCode: fsCode(err) });
    }
    return { ok: true, effect: { kind: 'created', paths: [ziel.abs], via: 'disk' } };
  }

  async function ordnerAnlegen(ctx, step) {
    const ziel = await resolveAreaPath(ctx.root, step.args[0]);
    if (!ziel.ok) return ziel;
    const vorhanden = await statOderNull(ziel.abs);
    if (vorhanden && vorhanden.isDirectory()) {
      return { ok: true, effect: { kind: 'unchanged', paths: [ziel.abs], via: 'disk' } };
    }
    if (vorhanden) return fehlschlag('notAFolder', { path: step.args[0] });
    try {
      await fs.mkdir(ziel.abs, { recursive: true });
    } catch (err) {
      if (err && (err.code === 'EEXIST' || err.code === 'ENOTDIR')) {
        return fehlschlag('notAFolder', { path: step.args[0] });
      }
      return fehlschlag('writeFailed', { path: step.args[0], fsCode: fsCode(err) });
    }
    return { ok: true, effect: { kind: 'folderCreated', paths: [ziel.abs], via: 'disk' } };
  }

  // Ein Ordner wandert als Ganzes: je Datei `renameSingleFile` (Markdown zuerst,
  // damit die Begleitdateien mit ihrem Dokument reisen), danach ein Verweis-
  // Nachzug über alle Markdown-Paare und das Entfernen leerer Quell-Ordner.
  async function ordnerBewegen(ctx, von, nach, kind) {
    if (await statOderNull(nach)) return fehlschlag('targetExists', { path: nach });
    const { dateien, ordner } = await ordnerInhalt(von);
    const ziel = (p) => path.join(nach, path.relative(von, p));
    const reihe = [...dateien.filter(isMarkdownPath), ...dateien.filter((d) => !isMarkdownPath(d))];
    const mdPaare = [];
    const bookDirs = [];
    let bewegt = 0;
    await fs.mkdir(nach, { recursive: true });
    for (const dir of ordner) await fs.mkdir(ziel(dir), { recursive: true });
    for (const datei of reihe) {
      // Eine Begleitdatei ist mit ihrem Dokument schon gewandert.
      if (!(await statOderNull(datei))) continue;
      const res = await renameSingleFile(datei, ziel(datei));
      if (!res.ok) {
        await sendBookStateForDirs(bookDirs);
        const code = BEGLEIT_CODES.includes(res.code) ? res.code : 'partial';
        return fehlschlag(code, {
          renamedCount: bewegt,
          totalCount: reihe.length,
          failedPath: datei,
        });
      }
      if (res.bookDir) bookDirs.push(res.bookDir);
      if (isMarkdownPath(datei)) mdPaare.push({ from: datei, to: ziel(datei) });
      bewegt++;
    }
    await sendBookStateForDirs(bookDirs);
    let linkUpdate = null;
    if (mdPaare.length > 0) {
      try {
        linkUpdate = await applyLinkUpdatesForRename(ctx.owner, mdPaare, nach);
        broadcast('linkUpdate:applied', {
          renames: renamesFromPairs(mdPaare),
          updated: linkUpdate.updated,
          failed: linkUpdate.failed,
        });
      } catch (err) {
        console.error(
          '[workflow] Verweis-Nachzug fehlgeschlagen:',
          err && err.message ? err.message : err,
        );
      }
    }
    const geblieben = [];
    for (const dir of [...ordner].reverse().concat(von)) {
      try {
        await fs.rmdir(dir);
      } catch (err) {
        if (!err || (err.code !== 'ENOTEMPTY' && err.code !== 'EEXIST' && err.code !== 'EPERM')) {
          console.error('[workflow] Quell-Ordner nicht entfernt:', dir, err && err.message);
        }
        geblieben.push(dir);
      }
    }
    return {
      ok: true,
      effect: { kind, paths: [nach], via: 'disk', linkUpdate, remaining: geblieben },
    };
  }

  async function dateiBewegen(ctx, von, nach, kind) {
    const paare = await cascade.cascadePairs(von, nach);
    const res = await cascade.runCascade(ctx.owner, paare, { anchorNew: nach, ensureDirs: true });
    if (!res.ok) return kaskadenFehlschlag(res);
    return {
      ok: true,
      effect: { kind, paths: res.renamed, via: 'disk', linkUpdate: res.linkUpdate },
    };
  }

  async function umbenennen(ctx, step) {
    const quelle = await resolveAreaPath(ctx.root, step.args[0]);
    if (!quelle.ok) return quelle;
    const name = String(step.args[1]);
    if (checkFileName(name)) return fehlschlag('invalidStep', { name });
    const stat = await statOderNull(quelle.abs);
    if (!stat) return fehlschlag('sourceMissing', { path: step.args[0] });
    const relZiel = path.posix.join(path.posix.dirname(step.args[0]), name);
    const ziel = await resolveAreaPath(ctx.root, relZiel);
    if (!ziel.ok) return ziel;
    if (ziel.abs === quelle.abs) {
      return { ok: true, effect: { kind: 'unchanged', paths: [quelle.abs], via: 'disk' } };
    }
    if (stat.isDirectory()) return ordnerBewegen(ctx, quelle.abs, ziel.abs, 'renamed');
    if (!isSamePath(ziel.abs, quelle.abs) && (await statOderNull(ziel.abs))) {
      return fehlschlag('targetExists', { path: relZiel });
    }
    return dateiBewegen(ctx, quelle.abs, ziel.abs, 'renamed');
  }

  async function verschieben(ctx, step) {
    const quelle = await resolveAreaPath(ctx.root, step.args[0]);
    if (!quelle.ok) return quelle;
    const ordner = await resolveAreaPath(ctx.root, step.args[1]);
    if (!ordner.ok) return ordner;
    const stat = await statOderNull(quelle.abs);
    if (!stat) return fehlschlag('sourceMissing', { path: step.args[0] });
    const zielOrdner = await statOderNull(ordner.abs);
    if (zielOrdner && !zielOrdner.isDirectory())
      return fehlschlag('notAFolder', { path: step.args[1] });
    const ziel = path.join(ordner.abs, path.basename(quelle.abs));
    if (isSamePath(ziel, quelle.abs)) {
      return { ok: true, effect: { kind: 'unchanged', paths: [quelle.abs], via: 'disk' } };
    }
    if (stat.isDirectory() && isInsideArea(quelle.abs, ordner.abs)) {
      return fehlschlag('invalidStep', { path: step.args[1] });
    }
    if (await statOderNull(ziel)) return fehlschlag('targetExists', { path: ziel });
    await fs.mkdir(ordner.abs, { recursive: true });
    if (stat.isDirectory()) return ordnerBewegen(ctx, quelle.abs, ziel, 'moved');
    return dateiBewegen(ctx, quelle.abs, ziel, 'moved');
  }

  async function kopieren(ctx, step) {
    const quelle = await resolveAreaPath(ctx.root, step.args[0]);
    if (!quelle.ok) return quelle;
    const ziel = await resolveAreaPath(ctx.root, step.args[1]);
    if (!ziel.ok) return ziel;
    const stat = await statOderNull(quelle.abs);
    if (!stat) return fehlschlag('sourceMissing', { path: step.args[0] });
    if (!stat.isFile()) return fehlschlag('notAFile', { path: step.args[0] });
    if (isMarkdownPath(quelle.abs) && readPartLine(await fs.readFile(quelle.abs, 'utf8'))) {
      return fehlschlag('splitDocument', { path: step.args[0] });
    }
    try {
      await fs.mkdir(path.dirname(ziel.abs), { recursive: true });
      await fs.copyFile(quelle.abs, ziel.abs, fs.constants.COPYFILE_EXCL);
    } catch (err) {
      if (err && err.code === 'EEXIST') return fehlschlag('targetExists', { path: step.args[1] });
      return fehlschlag('writeFailed', { path: step.args[1], fsCode: fsCode(err) });
    }
    const begleit = await kopiereBegleitdatei(quelle.abs, ziel.abs);
    if (!begleit.ok) {
      // Nur die eben angelegte Kopie fällt weg, nie eine fremde Begleitdatei.
      await fs.rm(ziel.abs, { force: true });
      return fehlschlag('writeFailed', { path: step.args[1], companion: true });
    }
    return { ok: true, effect: { kind: 'copied', paths: [ziel.abs], via: 'disk' } };
  }

  async function fensterHandgriff(ctx, step) {
    const ziel = await resolveAreaPath(ctx.root, step.args[0]);
    if (!ziel.ok) return ziel;
    if (step.keyword === 'open') {
      const stat = await statOderNull(ziel.abs);
      if (!stat) return fehlschlag('fileMissing', { path: step.args[0] });
      if (!stat.isFile()) return fehlschlag('notAFile', { path: step.args[0] });
    }
    return { ok: true, window: { action: step.keyword, path: ziel.abs } };
  }

  const AUSFUEHRUNG = {
    create: anlegen,
    mkdir: ordnerAnlegen,
    rename: umbenennen,
    move: verschieben,
    copy: kopieren,
    open: fensterHandgriff,
    close: fensterHandgriff,
  };

  /**
   * Führt einen Datei- oder Ordner-Schritt aus.
   *
   * @param {object} ctx Lauf-Kontext: `root`, `owner`, `workflowAbs`, `backlinks`.
   * @param {object} step gefüllter Schritt aus `prepareRun`.
   * @returns {Promise<object>} `{ ok: true, effect }`, `{ ok: true, window }` oder
   *   `{ ok: false, code, detail }`.
   */
  async function runFileStep(ctx, step) {
    try {
      return await AUSFUEHRUNG[step.keyword](ctx, step);
    } catch (err) {
      console.error('[workflow] Schritt fehlgeschlagen:', step.keyword, err && err.message);
      return fehlschlag('writeFailed', { fsCode: fsCode(err) });
    }
  }

  return { runFileStep };
}

module.exports = { FILE_KEYWORDS, createWorkflowFileSteps };
