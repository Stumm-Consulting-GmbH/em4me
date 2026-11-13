// 4T-002348 (Epic 3E-000184): IPC-Kanal-Gruppe der Workflows — Ausführung der
// Datei-, Ordner-, Inhalts- und Dateikopf-Befehle im Hauptprozess, die Antwort
// eines Fensters auf einen Puffer-Auftrag und der Lauf-Stand.
//
// Seit 4T-002464 dazu die Fragen der Bedingungen und der Schleife
// `if-exists`, `if-missing`, `if-property` und `for-each` der Stufe 3
// (workflow-block-queries.js); sie lesen nur und antworten mit `value` bzw.
// `files`, Block und Wiederholung führt der Ablauf-Kern im Fenster aus.
//
// Seit 4T-002424 dazu die Pflege-Befehle `delete`, `add-tag`, `remove-tag` und
// `complete-task` der Stufe 2 (workflow-maintenance-steps.js, workflow-content-steps.js).
//
// Seit 4T-002544 dazu workflow:dbCatalog, die Auskunft über Tabellen, Felder
// und Abfrage-Dateien des Bereichs für die Prüfung der Datenbank-Befehle
// (workflow-db-auskunft.js); er liest nur. Bei ausgeschalteter Erweiterung
// «Datenbank» antwortet er mit `enabled: false` und leeren Listen.
//
// Seit 4T-002545 dazu die Schreib-Schritte `db-create`, `db-update` und
// `db-delete` über die Schreib-Schnittstelle der Datenbank
// (workflow-db-steps.js); `isValidStep` prüft dafür Tabelle und Datensatz,
// die Paare `feld="Wert"` und den Namen hinter `as` (E7). Seit 4T-002546 dazu
// `db-query` (workflow-db-query.js) mit dem Ziel `into` und `under`. Seit
// 4T-002547 dazu die Liste von `db-for-each` über denselben Kanal und
// `workflow:dbRead`, das Lesen eines Datensatzes je Wiederholung und eines
// Feldwerts für `{{db:…}}`; die Bereichs-Wurzel ist die des Absenders (V6).
// Seit 4T-002548 dazu `db-open`, `db-open-list` und `db-check`
// (workflow-db-masken.js): die beiden ersten antworten mit einem
// Fenster-Handgriff, `db-check` mit dem Text einer Benachrichtigung.
//
// Kanal-Gruppe: workflow:step, workflow:bufferEditDone, workflow:recordRun;
// dazu der ausgehende Auftrag workflow:bufferEdit (workflow-buffer-requests.js)
// und seit 4T-002421 die Kanäle des Laufs nach Zeitplan (workflow-schedule.js),
// seit 4T-002422 die Kanäle der Scharf-Schaltung (workflow-armed.js).
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
//   { ok: true, line, keyword, value }     — Antwort einer Bedingung (4T-002464);
//   { ok: true, line, keyword, files }     — Liste einer Schleife (4T-002464);
//   { ok: true, line, keyword, effect, record } — Datenbank-Schritt (4T-002545);
//   { ok: true, line, keyword, notify, effect } — `db-check` (4T-002548);
//   { ok: false, line, keyword, code, detail }.
// Texte zu den Codes entstehen in der Anzeige (4T-002350); hier gibt es keine.
//
// Eigener Zustand: die offenen Puffer-Aufträge (workflow-buffer-requests.js).
'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const { isInsideArea } = require('../area/area-path');
const { createDatabaseCatalogCache } = require('../database/table-catalog.js');
// 4T-002544: Auskunft über den Datenbank-Bestand für die Prüfung.
const { workflowDbAuskunft } = require('../workflows/workflow-db-auskunft.js');
const { lookupCommand } = require('../../shared/workflows/workflow-catalog.js');
const { createRenameCascade } = require('../documents/rename-cascade');
const { imWorkflowLauf } = require('../documents/self-write');
const { createBufferRequests } = require('../workflows/workflow-buffer-requests.js');
const {
  CONTENT_KEYWORDS,
  createWorkflowContentSteps,
} = require('../workflows/workflow-content-steps.js');
const { FILE_KEYWORDS, createWorkflowFileSteps } = require('../workflows/workflow-file-steps.js');
// 4T-002464: die Fragen der Bedingungen und der Schleife (Stufe 3).
const {
  QUERY_KEYWORDS,
  createWorkflowBlockQueries,
} = require('../workflows/workflow-block-queries.js');
// 4T-002545: die Schreib-Schritte der Datenbank (Stufe D).
const { DB_WRITE_KEYWORDS, createWorkflowDbSteps } = require('../workflows/workflow-db-steps.js');
const { createDbSchreibStand } = require('../workflows/workflow-db-schreibstand.js');
// 4T-002546: die Abfrage in eine Datei (Stufe D).
const { DB_QUERY_KEYWORDS, createWorkflowDbQuery } = require('../workflows/workflow-db-query.js');
// 4T-002548: die Masken- und Konsistenz-Befehle (Stufe D).
const { DB_FORM_KEYWORDS, createWorkflowDbMasken } = require('../workflows/workflow-db-masken.js');
// 4T-002424: die Pflege-Befehle `delete` und `complete-task` (Stufe 2).
const {
  MAINTENANCE_KEYWORDS,
  createWorkflowMaintenanceSteps,
} = require('../workflows/workflow-maintenance-steps.js');
const {
  createWorkflowRunState,
  journalImBereich,
  normalizeRun,
} = require('../workflows/workflow-run-state.js');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
// 4T-002426: Workflows zugestimmter verknüpfter Bereiche (Definition aus der Quelle).
const { createLinkedWorkflowSources } = require('../workflows/workflow-linked-sources.js');
const { WORKFLOWS_EXTENSION_ID } = require('../../shared/workflows/workflow-konstanten.js');
// 4T-002355: die Kanäle des Workflow-Ordners, hier mit angemeldet, damit die
// Verdrahtung in main.js unverändert bleibt.
const { registerWorkflowFolderIpc } = require('./workflow-folder.js');
// 4T-002350: der Lese-Kanal der Seite «Workflow-Läufe», ebenso mit angemeldet.
const { registerWorkflowRunsIpc } = require('./workflow-runs.js');
// 4T-002421: die Kanäle des Laufs nach Zeitplan, ebenso mit angemeldet.
const { registerWorkflowScheduleIpc } = require('./workflow-schedule.js');
// 4T-002422: die Kanäle der Scharf-Schaltung, ebenso mit angemeldet.
const { registerWorkflowArmedIpc } = require('./workflow-armed.js');
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
// 4T-002545: Höchstzahl der Paare einer Zeile; eine Tabelle mit mehr Feldern
// gibt es in der Praxis nicht, und die Grenze hält die Nutzlast klein.
const MAX_PAARE = 500;

// 4T-002545 (E7): Die Paare `feld="Wert"` eines Datenbank-Schritts: Pflicht,
// wo das Schema sie verlangt, sonst verboten; je Paar ein Feld-Name ohne
// Gleichheitszeichen und ein Text, kein Feld doppelt (ohne Rücksicht auf die
// Schreibung, wie der Prüfer).
function paareGueltig(eintrag, pairs) {
  if (!eintrag.pairs) return pairs === undefined;
  if (!Array.isArray(pairs) || pairs.length === 0 || pairs.length > MAX_PAARE) return false;
  const gesehen = new Set();
  return pairs.every((paar) => {
    if (!istObjekt(paar) || !istText(paar.key, MAX_PFAD) || !istText(paar.value, MAX_TEXT)) {
      return false;
    }
    const name = paar.key.trim().toLowerCase();
    if (name === '' || paar.key.includes('=') || gesehen.has(name)) return false;
    gesehen.add(name);
    return true;
  });
}

// 4T-002546 (V6): Das Ziel `into` von `db-query`: Pflicht, wo das Schema es
// verlangt, sonst verboten; ein nicht leerer Pfad. Ob er im Bereich liegt,
// prüft der Schritt wie jeder Datei-Schritt (`resolveAreaPath`).
function zielGueltig(eintrag, target) {
  if (!eintrag.groups.target) return target === undefined || target === null;
  return istText(target, MAX_PFAD) && target.trim() !== '';
}

// 4T-002547 (V6): Eine Lese-Anfrage aus dem Fenster: ein Datensatz einer
// Schleife (`record`) oder ein Feldwert (`db`), jede Angabe ein nicht leerer Text.
function leseAnfrageGueltig(anfrage) {
  if (!istObjekt(anfrage)) return false;
  const angabe = (v) => istText(v, MAX_PFAD) && v.trim() !== '';
  if (anfrage.art === 'record') return angabe(anfrage.tabelle) && angabe(anfrage.kennung);
  if (anfrage.art === 'db') {
    return angabe(anfrage.table) && angabe(anfrage.record) && angabe(anfrage.field);
  }
  return false;
}

// Das Options-Wort einer Position (`positionGueltig` kennt beide Arten).
const POSITION_WORT = Object.freeze({ under: 'under', atStart: 'at-start' });

// 4T-002545 (E7): Der Name hinter `as` nur, wo das Schema ihn kennt.
function ergebnisGueltig(eintrag, result) {
  if (result === undefined) return true;
  return !!eintrag.groups.result && istText(result, MAX_PFAD) && result.trim() !== '';
}

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
  const bekannt = [
    ...FILE_KEYWORDS,
    ...CONTENT_KEYWORDS,
    ...MAINTENANCE_KEYWORDS,
    ...QUERY_KEYWORDS,
    ...DB_WRITE_KEYWORDS,
    ...DB_QUERY_KEYWORDS,
    ...DB_FORM_KEYWORDS,
  ];
  if (!bekannt.includes(step.keyword)) return false;
  const eintrag = lookupCommand(step.keyword);
  if (!eintrag || !Array.isArray(eintrag.args) || !Array.isArray(step.args)) return false;
  // 4T-002464: ein optionales Argument darf am Ende fehlen (Wert von if-property).
  const pflicht = eintrag.args.filter((spec) => !spec.optional).length;
  if (step.args.length < pflicht || step.args.length > eintrag.args.length) return false;
  const argsGueltig = step.args.every((wert, i) => {
    const spec = eintrag.args[i];
    if (spec.type === 'value') return istText(wert, MAX_TEXT) || Number.isFinite(wert);
    // 4T-002545: Tabelle und Datensatz sind Angaben in Pfad-Länge.
    const pfadArtig = ['path', 'name', 'pattern', 'table', 'record'].includes(spec.type);
    const max = pfadArtig ? MAX_PFAD : MAX_TEXT;
    return istText(wert, max) && !(spec.nonEmpty && wert.trim() === '');
  });
  if (!argsGueltig) return false;
  if (!paareGueltig(eintrag, step.pairs) || !ergebnisGueltig(eintrag, step.result)) return false;
  if (!zielGueltig(eintrag, step.target)) return false;
  const source = step.source === undefined ? null : step.source;
  const position = step.position === undefined ? null : step.position;
  if (!quelleGueltig(source) || !positionGueltig(position)) return false;
  if (eintrag.groups.source === 'required' && source === null) return false;
  if (!eintrag.groups.source && source !== null) return false;
  if (eintrag.groups.position === 'required' && position === null) return false;
  if (!eintrag.groups.position && position !== null) return false;
  // 4T-002546: Wo das Schema die Options-Wörter nennt, nur deren Positionen
  // (`db-query` kennt `under`, nicht `at-start`).
  return !(
    position !== null &&
    eintrag.options &&
    !eintrag.options.includes(POSITION_WORT[position.kind])
  );
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
 * @param {object} [deps.workflowScheduleChecker] Zeitplan-Prüfer (4T-002421).
 * @param {object} [deps.workflowScheduleDelivery] Zustell-Register der Fälligkeiten (4T-002421).
 * @param {(p: string) => Promise<void>} [deps.trashItem] Papierkorb für `delete`
 *   (Prüffälle; Vorgabe `shell.trashItem`, 4T-002424).
 */
function registerWorkflowsIpc(handle, deps) {
  const { senderWindow, areaOfWindow, backlinks } = deps;
  const bufferRequests = deps.workflowBufferRequests || createBufferRequests();
  const cascade = createRenameCascade(deps);
  const dateiSchritte = createWorkflowFileSteps({ ...deps, cascade });
  const inhaltsSchritte = createWorkflowContentSteps({ ...deps, bufferRequests });
  const pflegeSchritte = createWorkflowMaintenanceSteps(deps);
  const blockFragen = createWorkflowBlockQueries(deps);
  // 4T-002545: ein Schreib-Stand für alle Datenbank-Befehle, damit jede Index-Frage
  // die eigenen Schreibvorgänge sieht (db-query, db-for-each, {{db:…}} rufen ihn mit).
  const schreibStand = createDbSchreibStand({ backlinks });
  const datenbankSchritte = createWorkflowDbSteps({ ...deps, schreibStand });
  const datenbankAbfrage = createWorkflowDbQuery({
    ...deps,
    schreibStand,
    dateiSchritte,
    inhaltsSchritte,
  });
  const datenbankMasken = createWorkflowDbMasken({ ...deps, schreibStand, datenbankSchritte });
  const laufStand = createWorkflowRunState(deps);
  // 4T-002426 (Entscheidungen 2h und 1f): Fremd zugelassen ist allein die
  // DEFINITION eines Workflows aus einer zugestimmten Quelle, und nur im
  // Schritt-Kanal. Jedes Schritt-Ziel prüft resolveAreaPath weiter gegen die
  // eigene Wurzel (ctx.root); workflow:recordRun nimmt einen fremden Pfad nie an.
  const fremdeQuellen = deps.linkedWorkflowSources || createLinkedWorkflowSources(deps);
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
  async function kontext(event, workflowPath, { fremdeDefinition = false } = {}) {
    const owner = senderWindow(event);
    const area = owner ? areaOfWindow(owner) : null;
    if (!area || !area.rootPath) return { ok: false, code: 'noArea' };
    if (!istText(workflowPath, MAX_PFAD) || !path.isAbsolute(workflowPath)) {
      return { ok: false, code: 'invalidStep' };
    }
    const workflowAbs = path.resolve(workflowPath);
    if (!isInsideArea(area.rootPath, workflowAbs)) {
      const quelle = fremdeDefinition
        ? await fremdeQuellen.sourceFor(area.rootPath, workflowAbs)
        : null;
      if (!quelle) return { ok: false, code: 'outsideArea' };
    }
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
    const lage = await kontext(event, nutzlast.workflowPath, { fremdeDefinition: true });
    if (!lage.ok) return { ok: false, ...kopf, code: lage.code, detail: {} };
    // 4T-002461 (Story 4S-001144): Jeder Schritt läuft im Lauf-Zusammenhang
    // (documents/self-write.js, Abschnitt «Lauf-Marke»): Was er schreibt oder
    // bewegt, löst kein Ereignis aus, auch der Verweis-Nachzug einer Bewegung.
    const ergebnis = await imWorkflowLauf(() => {
      if (FILE_KEYWORDS.includes(step.keyword)) return dateiSchritte.runFileStep(lage.ctx, step);
      if (MAINTENANCE_KEYWORDS.includes(step.keyword)) {
        return pflegeSchritte.runMaintenanceStep(lage.ctx, step);
      }
      // 4T-002464: Fragen der Bedingungen und der Schleife, nur lesend.
      if (QUERY_KEYWORDS.includes(step.keyword)) return blockFragen.runQueryStep(lage.ctx, step);
      // 4T-002545: die Schreib-Schritte der Datenbank, im selben Lauf-Zusammenhang.
      if (DB_WRITE_KEYWORDS.includes(step.keyword)) {
        return datenbankSchritte.runDbStep(lage.ctx, step);
      }
      // 4T-002546: die Abfrage in eine Datei.
      if (DB_QUERY_KEYWORDS.includes(step.keyword)) {
        return datenbankAbfrage.runDbQueryStep(lage.ctx, step);
      }
      // 4T-002548: Masken öffnen und Konsistenz prüfen.
      if (DB_FORM_KEYWORDS.includes(step.keyword)) {
        return datenbankMasken.runDbFormStep(lage.ctx, step);
      }
      return inhaltsSchritte.runContentStep(lage.ctx, step);
    });
    return { ...kopf, ...ergebnis };
  });

  // 4T-002544 (Ausführungs-Entscheidung 4): Tabellen und Felder für die
  // Rückfrage des Prüfers. Eigener Kanal statt `database:overview`, weil
  // jener je Tabelle einen zweiten Aufruf verlangte und die Abfrage-Dateien
  // nicht auslegt. Das Tor der Datenbank fragt er je Aufruf frisch, wie die
  // Kanäle der Datenbank; ohne Tor gilt «aus».
  const katalogSpeicher = createDatabaseCatalogCache();
  handle('workflow:dbCatalog', async (event) => {
    const owner = senderWindow(event);
    const area = owner ? areaOfWindow(owner) : null;
    if (!area || !area.rootPath) return { ok: false, code: 'noArea' };
    const datenbankAn = typeof deps.datenbankAktiv === 'function' && deps.datenbankAktiv() === true;
    if (!datenbankAn) return { ok: true, enabled: false, tables: [], queries: [] };
    if (typeof backlinks.ensureIndexForDemand === 'function') {
      backlinks.ensureIndexForDemand(null, `${event.sender.id}:database`, area.rootPath);
    }
    const lage =
      typeof backlinks.datenbankSicht === 'function'
        ? backlinks.datenbankSicht(null, area.rootPath)
        : null;
    if (!lage || !lage.sicht) return { ok: false, code: 'notReady' };
    const auskunft = await workflowDbAuskunft({
      wurzel: area.rootPath,
      sicht: lage.sicht,
      fsp,
      cache: katalogSpeicher,
      bufferTextFor: backlinks.bufferTextFor,
    });
    return { ok: true, enabled: true, ...auskunft };
  });

  // 4T-002547 (Dc, Dd, V6): Datenbank-Werte eines Laufs, nur lesend. Der Kanal
  // prüft die Form selbst; Tabelle, Datensatz und Feld löst der Hauptprozess
  // gegen die Wurzel des sendenden Fensters auf.
  handle('workflow:dbRead', async (event, nutzlast) => {
    if (!erweiterungAn()) return { ok: false, code: 'extensionOff', detail: {} };
    const anfrage = istObjekt(nutzlast) ? nutzlast.anfrage : null;
    if (!leseAnfrageGueltig(anfrage)) return { ok: false, code: 'invalidStep', detail: {} };
    const lage = await kontext(event, nutzlast.workflowPath, { fremdeDefinition: true });
    if (!lage.ok) return { ok: false, code: lage.code, detail: {} };
    if (anfrage.art === 'record') {
      const { tabelle, kennung } = anfrage;
      return datenbankSchritte.readRecord(lage.ctx, { tabelle, kennung });
    }
    const { table, record, field } = anfrage;
    return datenbankSchritte.readValue(lage.ctx, { table, record, field });
  });

  handle('workflow:bufferEditDone', async (event, antwort) =>
    bufferRequests.answer(event, istObjekt(antwort) ? antwort : null),
  );

  // 4T-002420: Herkunft und Journal kommen mit; die Pfade des Journals werden
  // gegen die Bereichs-Wurzel des Absenders geprüft und relativ abgelegt.
  handle('workflow:recordRun', async (event, nutzlast) => {
    const run = normalizeRun(istObjekt(nutzlast) ? nutzlast.run : null);
    if (!run) return { ok: false, code: 'invalidStep' };
    const lage = await kontext(event, istObjekt(nutzlast) ? nutzlast.workflowPath : null);
    if (!lage.ok) return { ok: false, code: lage.code };
    const imBereich = journalImBereich(run, lage.ctx.root);
    if (!imBereich) return { ok: false, code: 'outsideArea' };
    return laufStand.recordRun(lage.ctx.owner, lage.ctx.workflowAbs, imBereich);
  });

  const ordnerDienst = registerWorkflowFolderIpc(handle, deps);
  registerWorkflowRunsIpc(handle, deps);
  registerWorkflowScheduleIpc(handle, deps);
  registerWorkflowArmedIpc(handle, deps);
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
