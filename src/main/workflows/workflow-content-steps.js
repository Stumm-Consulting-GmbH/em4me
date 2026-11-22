// 4T-002348 (Epic 3E-000184): Die Inhalts- und Dateikopf-Befehle der Workflows
// im Hauptprozess — `append`, `insert`, `replace`, `set-property`,
// `remove-property` (Story 4S-001103) — samt dem Lesen der Quellen; seit
// 4T-002424 (Story 4S-001135) dazu `add-tag` und `remove-tag`, die über
// dieselbe Weiche zum Editor-Puffer laufen (Regeln P2 und P5).
//
// **Ablauf je Schritt:** Ziel auflösen und gegen die Bereichs-Wurzel prüfen,
// Quelle lesen, die Bearbeitung vollständig bilden (fertiger Text, damit das
// Fenster nichts mehr lesen muss), dann den Weg wählen (A3, S-c):
//   - kein ungespeicherter Stand: auf die Platte, mit Historie nach dem
//     Vorbild `task:applyLineEdit` und OHNE Selbst-Schreib-Marke, damit ein
//     ungeändert geöffnetes Dokument in jedem Fenster neu lädt;
//   - das startende Fenster hält den Stand: der Auftrag geht als Antwort zurück
//     und wird dort auf den Puffer angewendet (Datei unberührt);
//   - ein anderes Fenster hält ihn: Auftrag mit Kennung, Antwort und Frist über
//     `workflow-buffer-requests.js`; ohne Antwort wird NICHTS geschrieben.
// Die Regel, wer den Stand hält, ist die eine in `ipc/puffer-fenster.js`.
//
// **Quellen zur Laufzeit** (O1): `from-section` liest den aktuellen Stand des
// Workflow-Dokuments, `from-file` die Quell-Datei, jeweils den Puffer-Stand vor
// der Platte, weil der Anwender diesen Stand sieht und ihn auch der Index
// verwendet. `from-template` kommt als fertig gefüllter Text aus dem Fenster
// (S-d); der Hauptprozess liest und füllt keine Vorlage.
//
// **Lauf-Marke** (4T-002461, Story 4S-001144): Der Weg auf die Platte merkt den
// neuen Inhalt vor dem Schreiben als Lauf-Stand (`documents/self-write.js`,
// Abschnitt «Lauf-Marke»), damit er kein Ereignis `file-changed` auslöst; die
// Selbst-Schreib-Marke bleibt weiter aus. Die beiden Wege über einen
// Editor-Puffer schreiben keine Datei und lösen deshalb selbst nichts aus;
// speichert der Anwender den Stand später, ist das seine Handlung und löst
// `file-changed` aus wie jedes Speichern.
//
// **Ein Schreibweg für eine fertige Bearbeitung** (4T-002546): `runContentEdit`
// nimmt Ziel und fertige Bearbeitung und geht denselben Weg wie jeder
// Inhalts-Befehl (Ziel-Prüfung, Weiche zum Editor-Puffer, Platte mit Historie
// und Lauf-Marke); `db-query` schreibt darüber das Ergebnis einer Abfrage in
// einen Abschnitt (`replaceSection` in `workflow-edit.js`).
//
// **Geteilte Dokumente** (4T-002689, Story 4S-001215): Der Weg auf die Platte
// liest und schreibt über `workflow-platten-schreibweg.js`, also über den
// zusammengesetzten Stand aller Teile und mit denselben Bausteinen wie das
// Speichern von Hand; fehlt ein Teil, hält der Schritt mit `partsMissing` an.
// Ein Folgeteil als Ziel wird vor der Weiche auf die Kopf-Datei aufgelöst, und
// eine Quelle `from-file` wird als ganzes Dokument gelesen.
//
// **Regeln der Datenbank** (4T-002690, Story 4S-001215): Ist die Erweiterung
// «Datenbank» an, fällt vor jedem der drei Wege das Urteil
// `workflow-db-urteil.js` am Stand vor und nach der Bearbeitung. Auf der Platte
// urteilt der Schreibweg am zusammengesetzten Stand; hält ein Fenster den
// Stand, liest der Hauptprozess ihn dort, urteilt selbst und schickt die
// Bearbeitung mit dem gelesenen Stand als Erwartung (`bufferChanged`, wenn der
// Puffer inzwischen ein anderer ist). Ein Halt lässt Datei und Puffer unverändert.
//
// Eigener Zustand: keiner.
'use strict';

const fs = require('node:fs/promises');
const { sectionBody } = require('../../shared/workflows/workflow-core.js');
const { pufferBesitzer } = require('../ipc/puffer-fenster.js');
const { resolveAreaPath } = require('./workflow-area-path.js');
const {
  createPlattenSchreibweg,
  kopfPfadVon,
  liesQuelle,
} = require('./workflow-platten-schreibweg.js');
const { createDbUrteil } = require('./workflow-db-urteil.js');
const { applyContentEdit } = require('../../shared/workflows/workflow-edit.js');

const BOM_RE = new RegExp('^\uFEFF');

/** Die Befehle dieses Moduls. */
const CONTENT_KEYWORDS = Object.freeze([
  'append',
  'insert',
  'replace',
  'set-property',
  'remove-property',
  'add-tag',
  'remove-tag',
]);

function fehlschlag(code, detail = {}) {
  return { ok: false, code, detail };
}

function fsCode(err) {
  return err && err.code ? err.code : null;
}

/**
 * Liest den aktuellen Stand einer Datei: den ungespeicherten Stand eines
 * Fensters, sonst die Platte; ohne Byte-Order-Zeichen.
 *
 * @param {object} backlinks Index mit `bufferTextFor`.
 * @param {string} abs absoluter Pfad.
 * @returns {Promise<{ok: true, text: string}|{ok: false, fsCode: string|null}>}
 */
async function readCurrentText(backlinks, abs) {
  const puffer =
    backlinks && typeof backlinks.bufferTextFor === 'function'
      ? backlinks.bufferTextFor(abs)
      : null;
  if (typeof puffer === 'string') return { ok: true, text: puffer.replace(BOM_RE, '') };
  try {
    return { ok: true, text: (await fs.readFile(abs, 'utf8')).replace(BOM_RE, '') };
  } catch (err) {
    return { ok: false, fsCode: fsCode(err) };
  }
}

/**
 * Der Text der Quelle eines Schritts (`from-template`, `from-file`, `from-section`).
 *
 * @param {object} ctx Lauf-Kontext (`root`, `workflowAbs`, `backlinks`).
 * @param {object|null} source Quelle aus `prepareRun`.
 * @returns {Promise<{ok: true, text: string}|{ok: false, code: string, detail: object}>}
 */
async function readStepSource(ctx, source) {
  if (!source) return { ok: true, text: '' };
  if (source.kind === 'template') return { ok: true, text: String(source.text) };
  if (source.kind === 'file') {
    const ort = await resolveAreaPath(ctx.root, source.path);
    if (!ort.ok) return ort;
    // 4T-002689 (Zweitblick, Runde 1): die Quelle als ganzes Dokument, auch wenn
    // sie geteilt ist; sonst käme allein die Kopf-Datei samt Zuordnungs-Zeile.
    return liesQuelle(ctx.backlinks, ctx.root, ort.abs, source.path);
  }
  const dokument = await readCurrentText(ctx.backlinks, ctx.workflowAbs);
  if (!dokument.ok) return fehlschlag('sourceMissing', { fsCode: dokument.fsCode });
  const abschnitt = sectionBody(dokument.text, source.name);
  return abschnitt.ok ? abschnitt : fehlschlag(abschnitt.code, { section: source.name });
}

// Die vollständige Bearbeitung eines Schritts für `applyContentEdit`.
async function bearbeitungFuer(ctx, step) {
  const [, a1, a2] = step.args;
  if (step.keyword === 'replace')
    return { ok: true, edit: { op: 'replace', search: a1, replacement: a2 } };
  if (step.keyword === 'set-property') {
    return { ok: true, edit: { op: 'setProperty', key: a1, value: a2 } };
  }
  if (step.keyword === 'remove-property')
    return { ok: true, edit: { op: 'removeProperty', key: a1 } };
  if (step.keyword === 'add-tag') return { ok: true, edit: { op: 'addTag', tag: a1 } };
  if (step.keyword === 'remove-tag') return { ok: true, edit: { op: 'removeTag', tag: a1 } };
  const quelle = await readStepSource(ctx, step.source);
  if (!quelle.ok) return quelle;
  if (step.keyword === 'append') return { ok: true, edit: { op: 'append', text: quelle.text } };
  return { ok: true, edit: { op: 'insert', position: step.position, text: quelle.text } };
}

/**
 * Baut die Ausführung der Inhalts- und Dateikopf-Befehle.
 *
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {Map} deps.windows Fenster-Register.
 * @param {object} deps.backlinks Bereichs-Index (Puffer-Stand und -Besitzer).
 * @param {Function} deps.resolveHistoryFor Auflösung der Historisierungs-Schaltung.
 * @param {Function} deps.recordMddOnSave Historien-Paket beim Speichern schreiben.
 * @param {{request: Function, read?: Function}} deps.bufferRequests Aufträge an ein
 *   Fenster; `read` braucht der Weg mit Urteil (4T-002690).
 * @param {() => boolean} [deps.datenbankAktiv] 4T-002690: Tor der Erweiterung «Datenbank».
 * @param {object} [deps.karteiWeichen] 4T-002690: Weiche des Bereichs-Panels.
 * @param {object} [deps.dbUrteil] 4T-002690: ein fertiges Urteil (Prüffälle).
 * @returns {{runContentStep: Function, runContentEdit: Function}}
 */
function createWorkflowContentSteps(deps) {
  const { windows, backlinks, resolveHistoryFor, recordMddOnSave } = deps;
  const { bufferRequests } = deps;
  // 4T-002689: der Platten-Weg über den Schreibweg geteilter Dokumente.
  const platte = createPlattenSchreibweg({ resolveHistoryFor, recordMddOnSave });
  // 4T-002690: das Urteil der Datenbank vor allen drei Wegen.
  const urteil = deps.dbUrteil || createDbUrteil(deps);

  /**
   * Führt einen Inhalts- oder Dateikopf-Schritt aus.
   *
   * @param {object} ctx Lauf-Kontext: `root`, `owner`, `event`, `workflowAbs`, `backlinks`.
   * @param {object} step gefüllter Schritt aus `prepareRun`.
   * @returns {Promise<object>} `{ ok: true, effect }`, `{ ok: true, window }` oder
   *   `{ ok: false, code, detail }`.
   */
  async function runContentStep(ctx, step) {
    const ziel = await zielDatei(ctx, step.args[0]);
    if (!ziel.ok) return ziel;
    const gebildet = await bearbeitungFuer({ ...ctx, backlinks }, step);
    if (!gebildet.ok) return gebildet;
    return wendeAn(ctx, ziel, gebildet.edit, step.keyword);
  }

  // Das Ziel eines Schritts: im Bereich und eine vorhandene Datei.
  async function zielDatei(ctx, relPfad) {
    const ziel = await resolveAreaPath(ctx.root, relPfad);
    if (!ziel.ok) return ziel;
    let stat;
    try {
      stat = await fs.stat(ziel.abs);
    } catch (err) {
      return fehlschlag('targetMissing', { path: relPfad, fsCode: fsCode(err) });
    }
    if (!stat.isFile()) return fehlschlag('notAFile', { path: relPfad });
    // 4T-002689: der genannte Pfad reist mit, für den Satz eines Halts.
    return { ...ziel, rel: relPfad };
  }

  /**
   * 4T-002546: Wendet eine fertige Bearbeitung auf eine Datei des Bereichs an,
   * über denselben Weg wie ein Inhalts-Befehl.
   *
   * @param {object} ctx Lauf-Kontext wie bei `runContentStep`.
   * @param {string} relPfad Ziel relativ zur Bereichs-Wurzel.
   * @param {object} edit Bearbeitung für `applyContentEdit`.
   * @returns {Promise<object>} wie `runContentStep`.
   */
  async function runContentEdit(ctx, relPfad, edit) {
    const ziel = await zielDatei(ctx, relPfad);
    if (!ziel.ok) return ziel;
    // 4T-002690: Der Befehl für den Satz eines Halts kommt aus dem Lauf-Kontext
    // (`ctx.befehl`, gesetzt im Schritt-Kanal), weil der Aufrufer, etwa
    // `db-query … into`, nur die fertige Bearbeitung reicht.
    return wendeAn(ctx, ziel, edit, typeof ctx.befehl === 'string' ? ctx.befehl : edit.op);
  }

  // 4T-002690: Das Urteil der Datenbank zu einem Stand vor und nach der
  // Bearbeitung, mit dem Befehl des Schritts und dem Pfad in der Form des Workflows.
  function pruefeFuer(ctx, ziel, befehl) {
    return (abs, alt, neu) =>
      urteil.urteile({ abs, alterText: alt, neuerText: neu, befehl, anzeige: ziel.rel });
  }

  // Die Weiche zum Editor-Puffer, sonst die Platte.
  async function wendeAn(ctx, genannt, edit, befehl) {
    // 4T-002689 (Zweitblick, Runde 1): Ein Folgeteil als Ziel meint das ganze
    // Dokument. Aufgelöst wird VOR der Weiche, damit alle drei Wege nach
    // demselben Pfad fragen, unter dem ein Fenster das Dokument führt (der
    // Kopf-Datei); sonst fände die Weiche einen ungespeicherten Stand nicht, und
    // die Platte überschriebe ihn.
    // Sicherheits-Review, Runde 1: Die Auflösung prüft die Grenze selbst und
    // hält mit outsideArea an, bevor ein Pfad an ein Fenster oder die Platte geht.
    const aufgeloest = await kopfPfadVon(ctx.root, genannt.abs, genannt.rel);
    if (!aufgeloest.ok) return aufgeloest;
    const kopf = aufgeloest.kopf;
    const ziel = kopf === genannt.abs ? genannt : { ...genannt, abs: kopf };
    const besitzer = pufferBesitzer({ windows, backlinks }, ctx.event, ziel.abs);
    // 4T-002690: Mit der Erweiterung «Datenbank» fällt das Urteil vor jedem der
    // drei Wege; ohne sie bleiben die Wege, wie sie waren (Befund 7).
    const pruefe = urteil.aktiv() ? pruefeFuer(ctx, ziel, befehl) : null;
    if (pruefe && besitzer.art !== 'keiner') {
      return fensterMitUrteil(ctx, ziel, edit, besitzer, pruefe);
    }
    if (besitzer.art === 'absender') {
      return { ok: true, window: { action: 'editOwnBuffer', path: ziel.abs, edit } };
    }
    if (besitzer.art === 'anderes') {
      const antwort = await bufferRequests.request(besitzer.fenster, ziel.abs, edit);
      return antwortDesFensters(antwort, ziel.abs);
    }
    return platte.schreibeBearbeitung(ctx, ziel, edit, pruefe ? { pruefe } : {});
  }

  function antwortDesFensters(antwort, abs) {
    if (!antwort.ok) return fehlschlag(antwort.code || 'bufferUnavailable', { path: abs });
    const kind = antwort.changed === false ? 'unchanged' : 'edited';
    return { ok: true, effect: { kind, paths: [abs], via: 'otherBuffer' } };
  }

  // 4T-002690 (Weg (i) des Tasks): Ein Fenster hält den Stand. Der Hauptprozess
  // liest ihn dort, bildet den neuen Stand mit derselben Regel wie das Fenster,
  // urteilt und schickt die Bearbeitung erst bei Freigabe, mit dem gelesenen
  // Stand als Erwartung: Hat sich der Puffer seither geändert, wendet das
  // Fenster nichts an und meldet `bufferChanged`.
  async function fensterMitUrteil(ctx, ziel, edit, besitzer, pruefe) {
    const fenster = besitzer.art === 'absender' ? ctx.owner : besitzer.fenster;
    if (!fenster || !fenster.webContents)
      return fehlschlag('bufferUnavailable', { path: ziel.abs });
    const gelesen = await bufferRequests.read(fenster, ziel.abs);
    if (!gelesen.ok) return fehlschlag(gelesen.code || 'bufferUnavailable', { path: ziel.abs });
    const ergebnis = applyContentEdit(gelesen.text, edit);
    if (!ergebnis.ok) return fehlschlag(ergebnis.code, { path: ziel.abs });
    if (ergebnis.changed) {
      const entscheid = await pruefe(ziel.abs, gelesen.text, ergebnis.text);
      if (!entscheid.ok) return entscheid;
    }
    if (besitzer.art === 'absender') {
      const handgriff = { action: 'editOwnBuffer', path: ziel.abs, edit, expected: gelesen.text };
      return { ok: true, window: handgriff };
    }
    const antwort = await bufferRequests.request(besitzer.fenster, ziel.abs, edit, {
      expected: gelesen.text,
    });
    return antwortDesFensters(antwort, ziel.abs);
  }

  return { runContentStep, runContentEdit };
}

module.exports = { CONTENT_KEYWORDS, createWorkflowContentSteps, readCurrentText, readStepSource };
