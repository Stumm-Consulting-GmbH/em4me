// 4T-002348 (Epic 3E-000184): Die Inhalts- und Dateikopf-Befehle der Workflows
// im Hauptprozess — `append`, `insert`, `replace`, `set-property`,
// `remove-property` (Story 4S-001103) — samt dem Lesen der Quellen.
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
// Eigener Zustand: keiner.
'use strict';

const fs = require('node:fs/promises');
const { ersetzeDateiOderWirf } = require('../documents/atomic-write');
const { applyContentEdit } = require('../../shared/workflows/workflow-edit.js');
const { sectionBody } = require('../../shared/workflows/workflow-core.js');
const { pufferBesitzer } = require('../ipc/puffer-fenster.js');
const { resolveAreaPath } = require('./workflow-area-path.js');

const BOM_RE = new RegExp('^\uFEFF');

/** Die Befehle dieses Moduls. */
const CONTENT_KEYWORDS = Object.freeze([
  'append',
  'insert',
  'replace',
  'set-property',
  'remove-property',
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
    const gelesen = await readCurrentText(ctx.backlinks, ort.abs);
    return gelesen.ok
      ? gelesen
      : fehlschlag('sourceMissing', { path: source.path, fsCode: gelesen.fsCode });
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
 * @param {Function} deps.readPreviousTextFor Datei-Stand vor dem Überschreiben.
 * @param {Function} deps.recordMddOnSave Historien-Paket beim Speichern schreiben.
 * @param {{request: Function}} deps.bufferRequests Aufträge an ein fremdes Fenster.
 * @returns {{runContentStep: Function}}
 */
function createWorkflowContentSteps(deps) {
  const { windows, backlinks, resolveHistoryFor, readPreviousTextFor, recordMddOnSave } = deps;
  const { bufferRequests } = deps;

  async function schreibePlatte(ctx, abs, edit) {
    let roh;
    try {
      roh = await fs.readFile(abs, 'utf8');
    } catch (err) {
      return fehlschlag('targetMissing', { fsCode: fsCode(err) });
    }
    const ergebnis = applyContentEdit(roh, edit);
    if (!ergebnis.ok) return fehlschlag(ergebnis.code);
    if (!ergebnis.changed)
      return { ok: true, effect: { kind: 'unchanged', paths: [abs], via: 'disk' } };
    try {
      const recordHistory = (await resolveHistoryFor(ctx.owner, abs, ergebnis.text)).effective;
      const previousText = recordHistory ? await readPreviousTextFor(abs) : null;
      await ersetzeDateiOderWirf(abs, ergebnis.text);
      if (recordHistory) {
        const neu = ergebnis.text.replace(BOM_RE, '').replace(/\r\n/g, '\n');
        await recordMddOnSave(ctx.owner, abs, previousText, neu);
      }
    } catch (err) {
      return fehlschlag('writeFailed', { fsCode: fsCode(err) });
    }
    return { ok: true, effect: { kind: 'edited', paths: [abs], via: 'disk' } };
  }

  /**
   * Führt einen Inhalts- oder Dateikopf-Schritt aus.
   *
   * @param {object} ctx Lauf-Kontext: `root`, `owner`, `event`, `workflowAbs`, `backlinks`.
   * @param {object} step gefüllter Schritt aus `prepareRun`.
   * @returns {Promise<object>} `{ ok: true, effect }`, `{ ok: true, window }` oder
   *   `{ ok: false, code, detail }`.
   */
  async function runContentStep(ctx, step) {
    const ziel = await resolveAreaPath(ctx.root, step.args[0]);
    if (!ziel.ok) return ziel;
    let stat;
    try {
      stat = await fs.stat(ziel.abs);
    } catch (err) {
      return fehlschlag('targetMissing', { path: step.args[0], fsCode: fsCode(err) });
    }
    if (!stat.isFile()) return fehlschlag('notAFile', { path: step.args[0] });
    const gebildet = await bearbeitungFuer({ ...ctx, backlinks }, step);
    if (!gebildet.ok) return gebildet;
    const { edit } = gebildet;
    const besitzer = pufferBesitzer({ windows, backlinks }, ctx.event, ziel.abs);
    if (besitzer.art === 'absender') {
      return { ok: true, window: { action: 'editOwnBuffer', path: ziel.abs, edit } };
    }
    if (besitzer.art === 'anderes') {
      const antwort = await bufferRequests.request(besitzer.fenster, ziel.abs, edit);
      if (!antwort.ok) return fehlschlag(antwort.code || 'bufferUnavailable', { path: ziel.abs });
      const kind = antwort.changed === false ? 'unchanged' : 'edited';
      return { ok: true, effect: { kind, paths: [ziel.abs], via: 'otherBuffer' } };
    }
    return schreibePlatte(ctx, ziel.abs, edit);
  }

  return { runContentStep };
}

module.exports = { CONTENT_KEYWORDS, createWorkflowContentSteps, readCurrentText, readStepSource };
