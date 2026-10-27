// 4T-002348 (Epic 3E-000184): IPC-Kanal-Gruppe der Workflows — Ausführung der
// Datei-, Ordner-, Inhalts- und Dateikopf-Befehle im Hauptprozess, die Antwort
// eines Fensters auf einen Puffer-Auftrag und der Lauf-Stand.
//
// Kanal-Gruppe: workflow:step, workflow:bufferEditDone, workflow:recordRun;
// dazu der ausgehende Auftrag workflow:bufferEdit (workflow-buffer-requests.js).
// Im Aus-Zustand der Erweiterung «Workflows» verweigert workflow:step mit dem
// Code extensionOff (4T-002352).
//
// **Ein Kanal je Schritt.** Die Lauf-Steuerung (Schleife über die Schritte,
// Abbruch, Hinweis) liegt im Fenster (4T-002349); ein Schritt kommt gefüllt
// und geprüft aus `prepareRun` und wird hier dennoch fail-closed geprüft, weil
// der Kanal eine Vertrauens-Grenze ist: Form, erlaubte Schlüsselwörter, Zahl
// und Art der Argumente, Längen. Die Bereichs-Wurzel ist die des SENDENDEN
// Fensters, nie eine mitgeschickte.
//
// **Ergebnis je Schritt** (übertragbar, sprachneutral):
//   { ok: true, line, keyword, effect }    — im Hauptprozess ausgeführt;
//   { ok: true, line, keyword, window }    — Fenster-Handgriff (open, close,
//                                            Bearbeitung des eigenen Puffers);
//   { ok: false, line, keyword, code, detail }.
// Texte zu den Codes entstehen in der Anzeige (4T-002350); hier gibt es keine.
//
// Eigener Zustand: die offenen Puffer-Aufträge (workflow-buffer-requests.js).
'use strict';

const path = require('node:path');
const { isInsideArea } = require('../area/area-path');
const { lookupCommand } = require('../../shared/workflows/workflow-catalog.js');
const { createRenameCascade } = require('../documents/rename-cascade');
const { createBufferRequests } = require('../workflows/workflow-buffer-requests.js');
const {
  CONTENT_KEYWORDS,
  createWorkflowContentSteps,
} = require('../workflows/workflow-content-steps.js');
const { FILE_KEYWORDS, createWorkflowFileSteps } = require('../workflows/workflow-file-steps.js');
const { createWorkflowRunState, normalizeRun } = require('../workflows/workflow-run-state.js');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
const { WORKFLOWS_EXTENSION_ID } = require('../../shared/workflows/workflow-konstanten.js');
// 4T-002355: die Kanäle des Workflow-Ordners, hier mit angemeldet, damit die
// Verdrahtung in main.js unverändert bleibt.
const { registerWorkflowFolderIpc } = require('./workflow-folder.js');
// 4T-002350: der Lese-Kanal der Seite «Workflow-Läufe», ebenso mit angemeldet.
const { registerWorkflowRunsIpc } = require('./workflow-runs.js');
// 4T-002364: Nachzug der Belegungen beim Umbenennen und Verschieben, verteilt
// über dieselbe Verteilung wie settings:set und das Einlesen.
const { createSettingsVerteilung } = require('./settings-verteilung');
const {
  createWorkflowBindingFollow,
  ordnerAllerFenster,
} = require('../workflows/workflow-binding-follow.js');

// Längen-Grenzen der Nutzlast: Pfade wie im Dateisystem üblich, Texte so groß,
// dass eine Vorlage passt (Grenze der gelesenen Markdown-Texte, MAX_EMBED_BYTES).
const MAX_PFAD = 4096;
const MAX_TEXT = 4 * 1024 * 1024;

const istText = (v, max) => typeof v === 'string' && v.length <= max;
const istObjekt = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function quelleGueltig(source) {
  if (source === null) return true;
  if (!istObjekt(source)) return false;
  if (source.kind === 'template')
    return istText(source.path, MAX_PFAD) && istText(source.text, MAX_TEXT);
  if (source.kind === 'file') return istText(source.path, MAX_PFAD);
  return source.kind === 'section' && istText(source.name, MAX_PFAD);
}

function positionGueltig(position) {
  if (position === null) return true;
  if (!istObjekt(position)) return false;
  return (
    position.kind === 'atStart' ||
    (position.kind === 'under' && istText(position.heading, MAX_PFAD))
  );
}

/**
 * Prüft einen Schritt aus dem Fenster gegen den Katalog (fail-closed).
 *
 * @param {*} step Schritt aus `prepareRun`.
 * @returns {boolean} true, wenn der Hauptprozess ihn ausführen darf.
 */
function isValidStep(step) {
  if (!istObjekt(step) || !Number.isInteger(step.line) || step.line < 1) return false;
  const istDatei = FILE_KEYWORDS.includes(step.keyword);
  if (!istDatei && !CONTENT_KEYWORDS.includes(step.keyword)) return false;
  const eintrag = lookupCommand(step.keyword);
  if (!eintrag || !Array.isArray(step.args) || step.args.length !== eintrag.args.length)
    return false;
  const argsGueltig = eintrag.args.every((spec, i) => {
    const wert = step.args[i];
    if (spec.type === 'value') return istText(wert, MAX_TEXT) || Number.isFinite(wert);
    const max = spec.type === 'path' || spec.type === 'name' ? MAX_PFAD : MAX_TEXT;
    return istText(wert, max) && !(spec.nonEmpty && wert.trim() === '');
  });
  if (!argsGueltig) return false;
  const source = step.source === undefined ? null : step.source;
  const position = step.position === undefined ? null : step.position;
  if (!quelleGueltig(source) || !positionGueltig(position)) return false;
  if (eintrag.groups.source === 'required' && source === null) return false;
  if (!eintrag.groups.source && source !== null) return false;
  if (eintrag.groups.position === 'required' && position === null) return false;
  return !(!eintrag.groups.position && position !== null);
}

/**
 * Registriert die Workflow-Kanäle.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {Map} deps.windows Fenster-Register.
 * @param {object} deps.backlinks Bereichs-Index (Puffer-Stand und -Besitzer).
 * @param {object} deps.subpages Namens-Logik der Unterseiten.
 * @param {(p: string) => boolean} deps.isMarkdownPath Markdown-Erkennung am Pfad.
 * @param {Function} deps.renameSingleFile Physische Bewegung einer Datei samt Nachzug.
 * @param {Function} deps.sendBookStateForDirs Zustands-Meldung betroffener Bücher.
 * @param {Function} deps.renamesFromPairs Paare in die Form des Rewrite-Kerns.
 * @param {Function} deps.applyLinkUpdatesForRename Eingehende Verweise anpassen.
 * @param {(channel: string, ...args: any[]) => void} deps.broadcast Meldung an alle Fenster.
 * @param {Function} deps.resolveHistoryFor Auflösung der Historisierungs-Schaltung.
 * @param {Function} deps.readPreviousTextFor Datei-Stand vor dem Überschreiben.
 * @param {Function} deps.recordMddOnSave Historien-Paket beim Speichern schreiben.
 * @param {Set<string>} deps.mddSuspendedPaths Ausgesetzte Dokumente.
 * @param {(p: string) => string} deps.mddKeyOf Schlüssel eines Dokuments.
 * @param {Function} deps.notifyMddDefect Defekt-Meldung an ein Fenster.
 * @param {object} [deps.workflowBufferRequests] Auftrags-Verwaltung (für Prüffälle).
 * @param {() => object|null} [deps.getStore] Einstellungs-Speicher (Schalter der Erweiterung).
 * @param {(disabled: *) => boolean} [deps.workflowsEnabled] Schalter-Abfrage (Prüffälle).
 * @param {(fn: Function) => void} [deps.setFollowWorkflowBindings] Setzer der Verdrahtung
 *   für den Nachzug der Belegungen in renameSingleFile (app/wiring.js).
 */
function registerWorkflowsIpc(handle, deps) {
  const { senderWindow, areaOfWindow, backlinks } = deps;
  const bufferRequests = deps.workflowBufferRequests || createBufferRequests();
  const cascade = createRenameCascade(deps);
  const dateiSchritte = createWorkflowFileSteps({ ...deps, cascade });
  const inhaltsSchritte = createWorkflowContentSteps({ ...deps, bufferRequests });
  const laufStand = createWorkflowRunState(deps);
  // 4T-002352: Schalter der Erweiterung «Workflows», je Aufruf frisch gelesen
  // (Muster datenbankAktiv in app/wiring.js); dieselbe Abfrage-Form wie im
  // Ordner-Dienst. Ohne Speicher (Prüffälle) gilt die leere Aus-Liste.
  const eingeschaltet =
    deps.workflowsEnabled || ((disabled) => isExtensionEnabled(WORKFLOWS_EXTENSION_ID, disabled));
  const erweiterungAn = () => {
    const store = typeof deps.getStore === 'function' ? deps.getStore() : null;
    return eingeschaltet(store ? store.get('extensions.disabled') : []);
  };

  // Bereichs-Wurzel des Absenders und Ort der Workflow-Datei darin.
  function kontext(event, workflowPath) {
    const owner = senderWindow(event);
    const area = owner ? areaOfWindow(owner) : null;
    if (!area || !area.rootPath) return { ok: false, code: 'noArea' };
    if (!istText(workflowPath, MAX_PFAD) || !path.isAbsolute(workflowPath)) {
      return { ok: false, code: 'invalidStep' };
    }
    const workflowAbs = path.resolve(workflowPath);
    if (!isInsideArea(area.rootPath, workflowAbs)) return { ok: false, code: 'outsideArea' };
    return { ok: true, ctx: { root: area.rootPath, owner, event, workflowAbs, backlinks } };
  }

  handle('workflow:step', async (event, nutzlast) => {
    const step = istObjekt(nutzlast) ? nutzlast.step : null;
    const kopf = {
      line: istObjekt(step) && Number.isInteger(step.line) ? step.line : null,
      keyword: istObjekt(step) && istText(step.keyword, 64) ? step.keyword : null,
    };
    // 4T-002352: Im Aus-Zustand führt der Kanal keinen Schritt aus. Er ist der
    // einzige, der im Auftrag eines Workflows Dateien und Dokumente ändert;
    // die Lese- und Einstellungs-Kanäle bleiben offen, weil sie nichts ändern
    // und Ordner-Festlegung wie Lauf-Stände erhalten bleiben sollen.
    if (!erweiterungAn()) return { ok: false, ...kopf, code: 'extensionOff', detail: {} };
    if (!isValidStep(step)) return { ok: false, ...kopf, code: 'invalidStep', detail: {} };
    const lage = kontext(event, nutzlast.workflowPath);
    if (!lage.ok) return { ok: false, ...kopf, code: lage.code, detail: {} };
    const ergebnis = FILE_KEYWORDS.includes(step.keyword)
      ? await dateiSchritte.runFileStep(lage.ctx, step)
      : await inhaltsSchritte.runContentStep(lage.ctx, step);
    return { ...kopf, ...ergebnis };
  });

  handle('workflow:bufferEditDone', async (event, antwort) =>
    bufferRequests.answer(event, istObjekt(antwort) ? antwort : null),
  );

  handle('workflow:recordRun', async (event, nutzlast) => {
    const run = normalizeRun(istObjekt(nutzlast) ? nutzlast.run : null);
    if (!run) return { ok: false, code: 'invalidStep' };
    const lage = kontext(event, istObjekt(nutzlast) ? nutzlast.workflowPath : null);
    if (!lage.ok) return { ok: false, code: lage.code };
    return laufStand.recordRun(lage.ctx.owner, lage.ctx.workflowAbs, run);
  });

  const ordnerDienst = registerWorkflowFolderIpc(handle, deps);
  registerWorkflowRunsIpc(handle, deps);
  // 4T-002364: Tastenkürzel und Plätze eines Workflows folgen seiner Bewegung
  // in der Anwendung; ohne Setzer (Prüffälle ohne Verdrahtung) entfällt das.
  if (typeof deps.setFollowWorkflowBindings === 'function') {
    const folge = createWorkflowBindingFollow({
      getStore: deps.getStore,
      verteileEinstellung: createSettingsVerteilung(deps),
      ordnerJeFenster: ordnerAllerFenster({
        windows: deps.windows,
        resolveForWindow: ordnerDienst.resolveForWindow,
      }),
    });
    deps.setFollowWorkflowBindings(folge.nachBewegung);
  }
}

module.exports = { registerWorkflowsIpc, isValidStep };
