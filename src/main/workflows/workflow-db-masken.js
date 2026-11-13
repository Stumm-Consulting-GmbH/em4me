// 4T-002548 (Epic 3E-000368, Stories 4S-001201 und 4S-001202): Die Masken- und
// Konsistenz-Befehle der Workflows im Hauptprozess — `db-open`, `db-open-list`
// und `db-check` (Dg und De der Konzept-Runde 4T-002543, Ausführungs-
// Entscheidung 1).
//
// **Auflösung im Hauptprozess, Öffnen im Fenster.** Wie beim Befehl `open`
// prüft und löst der Hauptprozess auf und antwortet mit einem Fenster-
// Handgriff; das Fenster öffnet nur noch. Tabelle und Datensatz löst
// `db-open` über dieselben Funktionen auf wie die Schreib-Schritte
// (`aufloesung` aus `workflow-db-steps.js`, vor jeder Index-Frage auf dem Stand
// der eigenen Schreibvorgänge). Ohne Datensatz eröffnet der Schritt die
// Neuanlage über die Schreib-Schnittstelle (`eroeffneNeuanlage`), dieselbe
// Stelle, an der die Maske beim Kommando «Neuer Datensatz» das Recht `create`
// prüft und die Kennung zieht; das Fenster entscheidet nicht über Rechte. Das
// Ziehen schreibt den Hochwasserstand in die Kopf-Datei; deren neuer Inhalt
// bekommt danach die Lauf-Marke, damit er kein Ereignis auslöst
// (Ausführungs-Entscheidung 5; die Marke vergleicht den Inhalt, ohne Frist).
//
// **`db-open-list`** öffnet eine Abfrage-Datei wie `open` und läuft wie dieser
// auch ohne Zuschauer (De, Option a); der Hauptprozess prüft, dass die Datei im
// Index die Marke `db-query` trägt.
//
// **`db-check`** führt die Konsistenz-Prüfung der Übersicht aus
// (`pruefeKonsistenz`, nur lesend) und antwortet mit dem Text einer
// Benachrichtigung in der Sprache des Fensters (`notify`); der Ablauf-Kern
// meldet ihn wie `notify`. Ein Befund hält den Lauf nicht an; ein Fehler der
// Prüfung selbst ist der Fehlschlag `dbCheckFailed`.
//
// Eigener Zustand: keiner.
'use strict';

const { frischerDateizugriff } = require('../documents/frisch-lesen.js');
const { merkeLaufStand } = require('../documents/self-write.js');
const { erzeugeProfilFelderZugang } = require('../documents/profil-felder.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { markierteDateien } = require('../database/table-catalog.js');
const { pruefeKonsistenz } = require('../database/konsistenz-pruefung.js');
const { LAGEN } = require('../database/record-auftrag-pruefung.js');
const { resolveAreaPath } = require('./workflow-area-path.js');
const { DB_REJECTED } = require('./workflow-db-steps.js');

/** Die Befehle dieses Moduls. */
const DB_FORM_KEYWORDS = Object.freeze(['db-open', 'db-open-list', 'db-check']);

function fehlschlag(code, detail = {}) {
  return { ok: false, code, detail };
}

// Eine Abweisung der Schreib-Schnittstelle in übertragbarer Form.
function abgewiesen(lagen, ziel) {
  return fehlschlag(DB_REJECTED, { ...ziel, lagen: JSON.parse(JSON.stringify(lagen)) });
}

/**
 * Baut die Ausführung der Masken- und Konsistenz-Befehle.
 *
 * @param {object} deps Abhängigkeiten aus main.js (`ipcDeps`).
 * @param {object} deps.datenbankSchritte Das Schritt-Modul der Schreib-Befehle
 *   (`createWorkflowDbSteps`) mit seiner `aufloesung`.
 * @param {{eroeffneNeuanlage: Function}} deps.schreibSchnittstelle Die eine
 *   Schreib-Schnittstelle des Prozesses.
 * @param {object} deps.schreibStand Der Schreib-Stand der Datenbank-Befehle.
 * @param {(win: object, key: string) => string} deps.tForWindow Texte in der Sprache des Fensters.
 * @param {Function} [deps.resolveQueryTemplatesFolder] Vorlagen-Ordner des Fensters.
 * @param {Function} [deps.readAreaProfilesConfig] Profile des Bereichs (Karteikarten).
 * @param {object} [deps.fsp] Dateizugriff (Vorgabe: frisch lesend).
 * @param {Function} [deps.pruefeKonsistenz] Konsistenz-Prüfung (Prüffälle).
 * @param {Function} [deps.merkeLaufStand] Lauf-Marke (Prüffälle).
 * @returns {{runDbFormStep: Function}}
 */
function createWorkflowDbMasken(deps) {
  const fsp = deps.fsp || frischerDateizugriff;
  const pruefe =
    typeof deps.pruefeKonsistenz === 'function' ? deps.pruefeKonsistenz : pruefeKonsistenz;
  const merke = typeof deps.merkeLaufStand === 'function' ? deps.merkeLaufStand : merkeLaufStand;
  const { aufloesung } = deps.datenbankSchritte;
  const profilFelderFuer =
    typeof deps.readAreaProfilesConfig === 'function'
      ? erzeugeProfilFelderZugang({
          readAreaProfilesConfig: deps.readAreaProfilesConfig,
          getStore: deps.getStore,
        })
      : null;

  // `db-open`: mit Datensatz die Standard-Maske, ohne ihn eine Neuanlage.
  async function maskeOeffnen(ctx, step, sicht) {
    const ziel = { table: String(step.args[0]), record: step.args.length > 1 ? step.args[1] : '' };
    const tabelle = aufloesung.loeseTabelleAuf(ctx, sicht, ziel.table);
    if (!tabelle.ok) return tabelle;
    ziel.table = tabelle.name;
    if (step.args.length > 1) {
      const datensatz = await aufloesung.loeseDatensatzAuf(
        ctx,
        sicht,
        tabelle,
        String(step.args[1]),
        ziel,
      );
      if (!datensatz.ok) return datensatz;
      return { ok: true, window: dbOpen(tabelle, datensatz.kennung, false) };
    }
    const { schreibSchnittstelle } = deps;
    if (!schreibSchnittstelle || typeof schreibSchnittstelle.eroeffneNeuanlage !== 'function') {
      return fehlschlag('unexpected');
    }
    const eroeffnet = await schreibSchnittstelle.eroeffneNeuanlage(ctx.root, tabelle.rel);
    if (!eroeffnet || eroeffnet.ok !== true || typeof eroeffnet.kennung !== 'string') {
      const lagen =
        eroeffnet && Array.isArray(eroeffnet.lagen) && eroeffnet.lagen.length > 0
          ? eroeffnet.lagen
          : [{ code: (eroeffnet && eroeffnet.code) || LAGEN.unerwartet }];
      return abgewiesen(lagen, ziel);
    }
    await markiereKopf(ctx, tabelle.abs);
    return { ok: true, window: dbOpen(tabelle, eroeffnet.kennung, true) };
  }

  function dbOpen(tabelle, kennung, neu) {
    return { action: 'dbOpen', path: tabelle.abs, record: kennung, neu };
  }

  // Der neue Hochwasserstand in der Kopf-Datei: Lauf-Marke und Schreib-Stand.
  async function markiereKopf(ctx, kopf) {
    try {
      merke(kopf, await fsp.readFile(kopf, 'utf8'));
    } catch {
      // Unlesbar: Dann löst die Änderung ein Ereignis aus wie eine fremde.
    }
    deps.schreibStand.merkeGeschrieben(ctx.root, [kopf]);
  }

  // `db-open-list`: die Abfrage-Datei öffnen wie `open`.
  async function listeOeffnen(ctx, step, sicht) {
    const quelle = String(step.args[0]);
    const ort = await resolveAreaPath(ctx.root, quelle);
    if (!ort.ok) return ort;
    const schluessel = pathCompareKey(ort.abs);
    const istAbfrage = markierteDateien(sicht).abfragen.some(
      (p) => pathCompareKey(p) === schluessel,
    );
    if (!istAbfrage) return fehlschlag('dbQueryFileMissing', { path: quelle });
    return { ok: true, window: { action: 'open', path: ort.abs } };
  }

  // `db-check`: Konsistenz-Prüfung einer oder aller Tabellen, Ergebnis als Text.
  async function pruefen(ctx, step, sicht) {
    let tabelle = null;
    if (step.args.length > 0) {
      tabelle = aufloesung.loeseTabelleAuf(ctx, sicht, String(step.args[0]));
      if (!tabelle.ok) return tabelle;
    }
    let ergebnis;
    try {
      const vorlagenOrdner =
        typeof deps.resolveQueryTemplatesFolder === 'function'
          ? await deps.resolveQueryTemplatesFolder(ctx.owner)
          : null;
      const profilFelder = profilFelderFuer ? await profilFelderFuer(ctx.root) : null;
      ergebnis = await pruefe({
        fsp,
        wurzel: ctx.root,
        sicht,
        tabelle: tabelle ? tabelle.abs : null,
        vorlagenOrdner,
        profilFelder,
      });
    } catch {
      return fehlschlag('dbCheckFailed', { table: tabelle ? tabelle.name : '' });
    }
    if (!ergebnis || ergebnis.status === 'unavailable') return fehlschlag('notReady');
    if (ergebnis.status !== 'ready' || !Array.isArray(ergebnis.befunde)) {
      return fehlschlag('dbCheckFailed', { table: tabelle ? tabelle.name : '' });
    }
    return {
      ok: true,
      notify: benachrichtigung(ctx.owner, ergebnis, tabelle),
      effect: { kind: 'unchanged', paths: [] },
    };
  }

  // Der Text der Benachrichtigung: Zahl der Befunde und die Tabellen mit Befund
  // (bei einer genannten Tabelle diese), Einzahl und Mehrzahl getrennt.
  function benachrichtigung(owner, ergebnis, tabelle) {
    const t = (key) => deps.tForWindow(owner, `workflow.dbCheck.${key}`);
    const zahl = ergebnis.befunde.length;
    if (zahl === 0) return t('keine');
    const zeilen = Array.isArray(ergebnis.tabellen) ? ergebnis.tabellen : [];
    const namen = tabelle
      ? [tabelle.name]
      : zeilen.filter((z) => z && z.befunde > 0).map((z) => String(z.name));
    // Eingesetzt über eine Ersatz-Funktion: Ein Text-Argument von `replace` läse
    // `$$`, `$&` und `$'` in einem Tabellennamen als Ersatz-Muster.
    const liste = namen
      .map((name) => t('tabelle').replace('{name}', () => name))
      .join(t('trenner'));
    const art = zahl === 1 ? 'einer' : 'mehrere';
    const schluessel = namen.length > 0 ? art : `${art}OhneTabelle`;
    return t(schluessel)
      .replace('{n}', () => String(zahl))
      .replace('{tabellen}', () => liste);
  }

  const AUSFUEHRUNG = {
    'db-open': maskeOeffnen,
    'db-open-list': listeOeffnen,
    'db-check': pruefen,
  };

  /**
   * Führt einen Masken- oder Konsistenz-Befehl aus.
   *
   * @param {{root: string, owner?: object, event?: object}} ctx Bereich des sendenden Fensters.
   * @param {{keyword: string, args: string[]}} step geprüfter Schritt.
   * @returns {Promise<object>} `{ ok: true, window }` (`db-open`, `db-open-list`),
   *   `{ ok: true, notify, effect }` (`db-check`) oder `{ ok: false, code, detail }`.
   */
  async function runDbFormStep(ctx, step) {
    if (!aufloesung.datenbankAn()) {
      const ziel = { table: step.args.length > 0 ? String(step.args[0]) : '', record: '' };
      return abgewiesen([{ code: LAGEN.erweiterungAus }], ziel);
    }
    const sicht = aufloesung.sichtFuer(ctx);
    if (!sicht) return fehlschlag('notReady');
    return AUSFUEHRUNG[step.keyword](ctx, step, sicht);
  }

  return { runDbFormStep };
}

module.exports = { DB_FORM_KEYWORDS, createWorkflowDbMasken };
