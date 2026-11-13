// 4T-002546 (Epic 3E-000368, Story 4S-001197): Der Workflow-Befehl `db-query`
// im Hauptprozess — eine Abfrage-Datei ausführen und ihr Ergebnis als
// Markdown-Tabelle in eine Datei schreiben (Db der Konzept-Runde 4T-002543,
// Ausführungs-Entscheidungen 1 und 7).
//
// **Ausführen wie die Lese-Ansicht:** Die Abfrage-Datei muss im Index die
// Marke `db-query` tragen; ihr einer Abfrage-Block wird gelesen wie für die
// Prüfung (`abfrageDesTextes`, ungespeicherter Stand vor der Platte) und über
// `frontmatterQueryFor` ausgeführt, mit der Abfrage-Datei als Träger, damit
// `this.<Angabe>` gilt wie in ihrer Lese-Ansicht. Aufgaben-Umgebung,
// Vorlagen-Ordner und Sprache sind dieselben wie beim Kanal der Ansicht
// (`ipc/index-views.js`). Vorher bringt der Schreib-Stand den Index auf den
// Stand der eigenen Schreibvorgänge, damit ein im selben Lauf geschriebener
// Datensatz im Ergebnis steht.
//
// **Schreiben wie die Datei- und Inhalts-Befehle:** Mit `under` ersetzt die
// Tabelle den Inhalt des Abschnitts (`replaceSection` über `runContentEdit`
// der Inhalts-Befehle: Weiche zum Editor-Puffer, Platte mit Historie und
// Lauf-Marke; fehlende oder mehrfache Überschrift wie bei `insert`); ohne
// `under` legt der Befehl die Datei an wie `create` (vorhandenes Ziel ist
// `targetExists`). Die Tabelle baut `result-set-markdown.js`.
//
// **Die Liste einer Schleife** (4T-002547, Story 4S-001198): `db-for-each`
// führt die Abfrage-Datei auf demselben Weg aus und liefert ihre Datensätze in
// der Reihenfolge der Abfrage, ohne zu schreiben; die Wiederholungen steuert
// der Ablauf-Kern, der jeden Datensatz über `workflow:dbRead` frisch liest.
//
// Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const { pathCompareKey } = require('../../shared/platform.js');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { resultSetMarkdown } = require('../../shared/query/result-set-markdown.js');
const { markierteDateien } = require('../database/table-catalog.js');
const { abfrageDesTextes } = require('../database/listen-auskunft.js');
const { LAGEN } = require('../database/record-auftrag-pruefung.js');
const { buildTaskEnv } = require('../index/task-env.js');
const { readCurrentText } = require('./workflow-content-steps.js');
const { resolveAreaPath } = require('./workflow-area-path.js');
const { DB_REJECTED } = require('./workflow-db-steps.js');
const { createDbSchreibStand } = require('./workflow-db-schreibstand.js');

/** Die Befehle dieses Moduls. */
const DB_QUERY_KEYWORDS = Object.freeze(['db-query', 'db-for-each']);

function fehlschlag(code, detail = {}) {
  return { ok: false, code, detail };
}

/**
 * Baut die Ausführung von `db-query`.
 *
 * @param {object} deps Abhängigkeiten aus main.js (`ipcDeps`).
 * @param {object} deps.backlinks Bereichs-Index (`ensureIndexForDemand`,
 *   `datenbankSicht`, `bufferTextFor`, `frontmatterQueryFor`).
 * @param {() => boolean} deps.datenbankAktiv Tor der Erweiterung «Datenbank».
 * @param {{runContentEdit: Function}} deps.inhaltsSchritte Inhalts-Befehle.
 * @param {{runFileStep: Function}} deps.dateiSchritte Datei-Befehle.
 * @param {(win: object, key: string) => string} deps.tForWindow Texte in der Sprache des Fensters.
 * @param {Map} [deps.menuStates] Zustand je Fenster mit `locale`.
 * @param {(win: object) => Promise<string|null>} [deps.resolveQueryTemplatesFolder]
 * @param {() => object|null} [deps.getStore] Einstellungs-Speicher (Aufgaben-Umgebung).
 * @param {object} [deps.schreibStand] Schreib-Stand der Datenbank-Befehle.
 * @returns {{runDbQueryStep: Function}}
 */
function createWorkflowDbQuery(deps) {
  const { backlinks } = deps;
  const schreibStand = deps.schreibStand || createDbSchreibStand({ backlinks });

  function datenbankAn() {
    return typeof deps.datenbankAktiv === 'function' && deps.datenbankAktiv() === true;
  }

  // Die Sprache des Fensters wie bei `tForWindow`; ohne Angabe Englisch.
  function spracheVon(owner) {
    const zustaende = deps.menuStates instanceof Map ? deps.menuStates : null;
    const id = owner && owner.webContents ? owner.webContents.id : null;
    const zustand = zustaende && id !== null ? zustaende.get(id) : null;
    return (zustand && zustand.locale) || 'en';
  }

  function aufgabenUmgebung() {
    const store = typeof deps.getStore === 'function' ? deps.getStore() : null;
    if (!store) return buildTaskEnv({});
    return buildTaskEnv({
      disabledExtensions: store.get('extensions.disabled'),
      tasksConfig: store.get('tasksConfig'),
      taskStates: store.get('taskStates'),
    });
  }

  // Ist die Datei im Index eine Abfrage-Datei (Marke `db-query`)?
  function istAbfrageDatei(root, abs) {
    const lage = backlinks.datenbankSicht(null, root);
    if (!lage || !lage.sicht) return null;
    const schluessel = pathCompareKey(abs);
    return markierteDateien(lage.sicht).abfragen.some((p) => pathCompareKey(p) === schluessel);
  }

  // Die Abfrage ausführen: `{ ok, resultSet }` oder ein Fehlschlag.
  async function fuehreAus(ctx, quelle) {
    const ort = await resolveAreaPath(ctx.root, quelle);
    if (!ort.ok) return ort;
    const sender = ctx.event && ctx.event.sender ? ctx.event.sender.id : 'workflow';
    backlinks.ensureIndexForDemand(null, `${sender}:database`, ctx.root);
    if (!schreibStand.indexAufEigenenStand(ctx.root)) return fehlschlag('notReady');
    const abfrageDatei = istAbfrageDatei(ctx.root, ort.abs);
    if (abfrageDatei === null) return fehlschlag('notReady');
    if (!abfrageDatei) return fehlschlag('dbQueryFileMissing', { path: quelle });
    const text = await readCurrentText(backlinks, ort.abs);
    const abfrage = text.ok ? abfrageDesTextes(extractFrontmatter(text.text).body) : null;
    if (abfrage === null) return fehlschlag('dbQueryInvalid', { path: quelle });
    const templatesFolder =
      typeof deps.resolveQueryTemplatesFolder === 'function'
        ? await deps.resolveQueryTemplatesFolder(ctx.owner)
        : null;
    const antwort = backlinks.frontmatterQueryFor(
      ort.abs,
      abfrage,
      ctx.root,
      aufgabenUmgebung(),
      spracheVon(ctx.owner),
      templatesFolder,
    );
    const rs = antwort && antwort.resultSet;
    const status = rs && rs.state ? rs.state.status : null;
    if (status !== 'ready') return fehlschlag(status === 'error' ? 'unexpected' : 'notReady');
    if (rs.state.queryError) return fehlschlag('dbQueryInvalid', { path: quelle });
    return { ok: true, resultSet: rs };
  }

  /**
   * Führt `db-query` aus.
   *
   * @param {object} ctx Lauf-Kontext: `root`, `owner`, `event`, `workflowAbs`, `backlinks`.
   * @param {{line: number, blockLine: number, keyword: string, args: string[],
   *   target: string, position: {kind: 'under', heading: string}|null}} step
   * @returns {Promise<object>} das Ergebnis des Datei- oder Inhalts-Befehls.
   */
  async function runDbQueryStep(ctx, step) {
    if (step.keyword === 'db-for-each') return datensaetzeDerSchleife(ctx, step);
    if (!datenbankAn()) return fehlschlag(DB_REJECTED, { lagen: [{ code: LAGEN.erweiterungAus }] });
    const ausgefuehrt = await fuehreAus(ctx, String(step.args[0]));
    if (!ausgefuehrt.ok) return ausgefuehrt;
    const t = (key) => deps.tForWindow(ctx.owner, key);
    const tabelle = resultSetMarkdown(ausgefuehrt.resultSet, { t });
    const position = step.position;
    if (position && position.kind === 'under') {
      const edit = { op: 'replaceSection', heading: position.heading, text: tabelle };
      return deps.inhaltsSchritte.runContentEdit(ctx, step.target, edit);
    }
    return deps.dateiSchritte.runFileStep(ctx, {
      line: step.line,
      blockLine: step.blockLine,
      keyword: 'create',
      args: [step.target],
      source: { kind: 'template', text: tabelle },
      position: null,
    });
  }

  /**
   * 4T-002547 (Dc): Die Liste einer Schleife `db-for-each`: die Datensätze der
   * Abfrage-Datei in der Reihenfolge der Abfrage, beim Eintritt festgestellt.
   * Die Abfrage muss Datensätze liefern (`TABLE RECORDS`, nicht gruppiert).
   *
   * @returns {Promise<object>} `{ ok: true, records: [{ table, path, id }] }`
   *   mit `path` der Tabellen-Datei relativ zur Wurzel, sonst ein Fehlschlag.
   */
  async function datensaetzeDerSchleife(ctx, step) {
    if (!datenbankAn()) return fehlschlag(DB_REJECTED, { lagen: [{ code: LAGEN.erweiterungAus }] });
    const quelle = String(step.args[0]);
    const ausgefuehrt = await fuehreAus(ctx, quelle);
    if (!ausgefuehrt.ok) return ausgefuehrt;
    const rs = ausgefuehrt.resultSet;
    const gruppiert = Array.isArray(rs.groups) && rs.groups.length > 0;
    if (rs.scope !== 'records' || rs.type !== 'table' || gruppiert) {
      return fehlschlag('dbQueryNoRecords', { path: quelle });
    }
    const records = [];
    for (const row of rs.rows) {
      const o = row && row.origin;
      if (!o || o.kind !== 'record' || typeof o.id !== 'string' || typeof o.path !== 'string') {
        continue;
      }
      records.push({
        table: o.table,
        path: path.relative(ctx.root, o.path).split(path.sep).join('/'),
        id: o.id,
      });
    }
    return { ok: true, records };
  }

  return { runDbQueryStep };
}

module.exports = { DB_QUERY_KEYWORDS, createWorkflowDbQuery };
