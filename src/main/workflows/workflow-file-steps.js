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
// **Lauf-Marke** (4T-002461, Story 4S-001144): Jeder Schreibweg dieses Moduls
// merkt VOR dem Schreiben, was er schreibt (`documents/self-write.js`, Abschnitt
// «Lauf-Marke»): `create` den Inhalt, `copy` die Bytes der Quelle, `rename` und
// `move` je bewegter Datei Größe und Änderungszeit der Quelle am Ziel. So löst
// nichts davon ein Ereignis aus; die Meldung `file-moved` trägt zusätzlich das
// Kennzeichen aus dem Lauf-Zusammenhang des Schritt-Kanals.
//
// **Karteikarten** (4T-002691, Epic 3E-000415, Tc Option (a)): `copy` einer
// Karteikarte in den Ordner ihrer Tabelle geht über die Weiche des
// Bereichs-Panels (`workflow-kartei-weiche.js`) und bekommt so eine neue
// Kennung und einen Anlege-Beleg; ein belegter Name bleibt `targetExists`
// (keine freie Nummer wie im Panel, weil das Ziel im Workflow fest genannt
// ist). Mit Ziel außerhalb dieses Ordners bleibt sie eine gewöhnliche
// Datei-Kopie, weil dort kein Datensatz entsteht. `move` einer Karteikarte aus
// dem Ordner ihrer Tabelle hält an (`dbCardLeavesTable`), denn das käme einem
// Löschen ohne Prüfung gleich. `rename` mit Endungswechsel hält mit eigenen
// Codes an (`dbCardRenamedAway`, `dbRecordRenamedIn`); `rename` mit
// Markdown-Endung und alle Befehle auf
// ganze Ordner, Tabellen-Dateien und den Steckbrief bleiben wie von Hand.
// `create`, `copy` und `move` einer Markdown-Datei, deren Dateikopf eine
// Kennung `db-record` trägt, in den Ordner einer Kartei-Tabelle halten an
// (`dbRecordIntoTable`), denn das käme einem Anlegen ohne Prüfung gleich; den
// Ordner erkennt die Weiche (`karteiTabelleIn`). `db-query … into` ohne
// `under` läuft über `create` und ist damit erfasst.
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
const { merkeLaufBewegung, merkeLaufStand } = require('../documents/self-write');
const { resolveAreaPath } = require('./workflow-area-path.js');
const { readStepSource } = require('./workflow-content-steps.js');
const { createWorkflowKarteiWeiche } = require('./workflow-kartei-weiche.js');
const { tabellenName } = require('../database/table-catalog.js');

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
 * @param {object} [deps.karteiWeichen] 4T-002691: Weiche einer Karteikarte
 *   (`database/kartei-weichen.js`); ohne sie ist nichts eine Karteikarte.
 * @returns {{runFileStep: Function}}
 */
function createWorkflowFileSteps(deps) {
  const { isMarkdownPath, cascade, renameSingleFile, sendBookStateForDirs } = deps;
  const { applyLinkUpdatesForRename, renamesFromPairs, broadcast } = deps;
  const kartei = createWorkflowKarteiWeiche(deps);

  // 4T-002691: Liegt der Pfad im Ordner der Tabelle einer Karteikarte?
  function imOrdnerDerTabelle(karte, abs) {
    return isSamePath(path.dirname(abs), path.dirname(karte.tabelle));
  }

  // 4T-002691 (Punkt 3): Eine Markdown-Datei mit Kennung `db-record` im
  // Dateikopf entstünde im Ordner einer Kartei-Tabelle als Datensatz ohne
  // Prüfung; dann hält der Schritt an. Sonst null.
  async function hineinlegenHalt(text, zielAbs, angabe) {
    if (!isMarkdownPath(zielAbs)) return null;
    const tabelle = await kartei.tabelleBeimHineinlegen(text, zielAbs);
    if (tabelle === null) return null;
    return fehlschlag('dbRecordIntoTable', { path: angabe, table: tabellenName(tabelle) });
  }

  // 4T-002691, Review Runde 1, Nr. 2 (technische Festlegung der steuernden
  // Sitzung vom 2026-11-14 im Rahmen von Tc): `rename` kann die Endung
  // wechseln. Wird eine Karteikarte dabei zu einer Datei, die keine
  // Markdown-Datei ist, verlässt sie die Tabelle; wird
  // eine Datei mit Kennung zur Markdown-Datei im Kartei-Ordner, käme das einem
  // Anlegen gleich. Bleibt die Endung Markdown, läuft
  // `rename` einer Karteikarte im selben Ordner wie von Hand.
  //
  // Review Runde 2, Nr. 1: Die Datei bleibt dabei im selben Ordner; Grund des
  // Halts ist allein der Endungswechsel. Deshalb eigene Codes mit eigenem Satz
  // (`dbCardRenamedAway`, `dbRecordRenamedIn`) statt der Sätze des Verschiebens;
  // `name` ist der neue Name, wie der Schritt ihn nennt.
  async function umbenennenHalt(quelleAbs, zielAbs, angabe, name) {
    const karte = await kartei.karteikarteVon(quelleAbs);
    if (karte) {
      if (isMarkdownPath(zielAbs)) return null;
      return fehlschlag('dbCardRenamedAway', {
        path: angabe,
        table: tabellenName(karte.tabelle),
        name,
      });
    }
    if (isMarkdownPath(quelleAbs) || !isMarkdownPath(zielAbs)) return null;
    const text = await fs.readFile(quelleAbs, 'utf8');
    const tabelle = await kartei.tabelleBeimHineinlegen(text, zielAbs);
    if (tabelle === null) return null;
    return fehlschlag('dbRecordRenamedIn', { path: angabe, table: tabellenName(tabelle), name });
  }

  async function anlegen(ctx, step) {
    const ziel = await resolveAreaPath(ctx.root, step.args[0]);
    if (!ziel.ok) return ziel;
    const quelle = await readStepSource(ctx, step.source);
    if (!quelle.ok) return quelle;
    const halt = await hineinlegenHalt(quelle.text, ziel.abs, step.args[0]);
    if (halt) return halt;
    try {
      await fs.mkdir(path.dirname(ziel.abs), { recursive: true });
      merkeLaufStand(ziel.abs, quelle.text);
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
      await merkeLaufBewegung(datei, ziel(datei));
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
    for (const paar of paare) await merkeLaufBewegung(paar.from, paar.to);
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
    const halt = await umbenennenHalt(quelle.abs, ziel.abs, step.args[0], name);
    if (halt) return halt;
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
    // 4T-002691: Eine Karteikarte verlässt den Ordner ihrer Tabelle nicht ungeprüft.
    const karte = stat.isFile() ? await kartei.karteikarteVon(quelle.abs) : null;
    if (karte && !imOrdnerDerTabelle(karte, ziel)) {
      return fehlschlag('dbCardLeavesTable', {
        path: step.args[0],
        table: tabellenName(karte.tabelle),
      });
    }
    // 4T-002691: Eine Datei mit Kennung legt `move` nicht in einen Kartei-Ordner.
    // `move` behält den Namen samt Endung: Quelle und Ziel haben immer dieselbe
    // Endung, beide Prüfungen sind gleichwertig, und eine `.txt` wird dabei nie
    // eine Karteikarte (Klarstellung Review Runde 2, Nr. 2).
    if (stat.isFile() && !karte && isMarkdownPath(ziel)) {
      const text = await fs.readFile(quelle.abs, 'utf8');
      const halt = await hineinlegenHalt(text, ziel, step.args[0]);
      if (halt) return halt;
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
    // Review Runde 1, Nr. 1: Der Text wird auch gelesen, wenn allein das ZIEL
    // eine Markdown-Datei ist; eine `.txt` mit Kennung würde sonst als `.md`
    // ungeprüft zur Karteikarte.
    const mdQuelle = isMarkdownPath(quelle.abs);
    const text =
      mdQuelle || isMarkdownPath(ziel.abs) ? await fs.readFile(quelle.abs, 'utf8') : null;
    if (mdQuelle && readPartLine(text)) {
      return fehlschlag('splitDocument', { path: step.args[0] });
    }
    // 4T-002691: Eine Karteikarte in den Ordner ihrer Tabelle geht über die Weiche.
    const karte = await kartei.karteikarteVon(quelle.abs);
    if (karte && isMarkdownPath(ziel.abs) && imOrdnerDerTabelle(karte, ziel.abs)) {
      const kopiert = await kartei.kopiere(karte, ctx.root, ziel.abs, step.args[1]);
      if (kopiert.belegt) return fehlschlag('targetExists', { path: step.args[1] });
      if (!kopiert.ok) return kopiert;
      const neu = kartei.neuerKartenPfad(ziel.abs);
      // Begleitdatei wie im Panel (`area:copyFile`): Die Karte ist ein angelegter
      // Datensatz mit Anlege-Beleg und wird nicht am Datenbank-Weg vorbei
      // zurückgenommen, wenn allein die Begleitdatei scheitert.
      const begleit = await kopiereBegleitdatei(quelle.abs, neu);
      if (!begleit.ok)
        console.warn('[workflow] Begleitdatei der Karteikarte fehlt:', begleit.error);
      return { ok: true, effect: { kind: 'copied', paths: [neu], via: 'disk' } };
    }
    // 4T-002691: Jede andere Datei mit Kennung, auch eine Karteikarte in den
    // Ordner einer anderen Kartei-Tabelle, hält vor dem Kartei-Ordner an.
    if (text !== null) {
      const halt = await hineinlegenHalt(text, ziel.abs, step.args[0]);
      if (halt) return halt;
    }
    try {
      await fs.mkdir(path.dirname(ziel.abs), { recursive: true });
      merkeLaufStand(ziel.abs, await fs.readFile(quelle.abs));
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
