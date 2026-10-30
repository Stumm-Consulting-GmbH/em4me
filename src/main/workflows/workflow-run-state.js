// 4T-002348 (Epic 3E-000184): Der Lauf-Stand eines Workflows im Abschnitt
// `workflow` seiner Begleitdatei (Story 4S-001106, AK5 des Tasks).
//
// **Ort nach der Ablage-Regel:** die vorhandene Begleitdatei `<Name>.mdd` neben
// der Workflow-Datei, kein neuer Datei-Typ und kein eigenes Protokoll-Dokument
// (Entscheidung 2d der Konzept-Stufe); der Weg durch die Ablage-Regel steht im
// Lösungs-Kapitel des Tasks und in der Architektur. Der Text der Workflow-Datei
// wird nie angefasst.
//
// **Stufe 2** (4T-002420, Epic 3E-000366, Story 4S-001131): dazu der
// Scharf-Zustand mit der Prüfsumme der Definition (`setArmed`, `armedStatus`),
// der nächste fällige Lauf (`setNextDue`), der verfallene Lauf
// (`recordSkipped`), die Herkunft je Lauf und das Journal des letzten Laufs
// (`recordRun`). Das Schema steht in mdd-store.js an `getWorkflowRun`. Seit
// 4T-002422 dazu `setArmedSchedule`, die Scharf-Schaltung samt erstem Termin in
// einer Änderung.
//
// **Schreibweg nach `writeBlockDataMutation`** (documents/block-data.js):
// Begleitdatei lesen oder leer anlegen, eine defekte nie überschreiben (der
// Pfad kommt in die Menge der ausgesetzten Dokumente, das Fenster bekommt die
// Defekt-Meldung), schreiben mit `ersetzeDateiOderWirf` und Selbst-Schreib-Marke.
// Eine Änderung, die den Container nicht verändert, schreibt nichts.
//
// **Ein Schreibfehler ändert das Ergebnis des Laufs nicht:** Der Lauf ist
// geschehen, nur seine Spur fehlt. Antwort `runStateNotSaved`, und der Grund
// geht über den Logger des Hauptprozesses ins Protokoll.
//
// Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { ersetzeDateiOderWirf } = require('../documents/atomic-write');
const mddStore = require('../documents/mdd-store');
const { mddPathFor } = require('../documents/document-parts-io');
const selbstSchreib = require('../documents/self-write');
const { isInsideArea } = require('../area/area-path');
const { lookupCommand } = require('../../shared/workflows/workflow-catalog.js');
const { definitionsPruefsumme } = require('./workflow-definition-hash.js');

// 4T-000947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
// Require-Cache).
const markSelfWriting = selbstSchreib.merke;

/** Die geschlossene Liste der Lauf-Ergebnisse. */
const RUN_STATUS = Object.freeze(['ok', 'failed', 'stopped', 'canceled']);
/** Die geschlossene Liste der Herkunft eines Laufs (Stufe 2, 2d). */
const RUN_ORIGINS = Object.freeze(['manual', 'schedule', 'catch-up']);
/** Die Zustände der Scharf-Schaltung (2e). */
const ARMED_STATUS = Object.freeze({
  armed: 'armed',
  notArmed: 'notArmed',
  definitionChanged: 'definitionChanged',
});
/**
 * Höchstzahl der Journal-Zeilen eines Laufs. Ein Verschieben eines Ordners
 * meldet jede bewegte Datei; darüber wird abgeschnitten und vermerkt, statt den
 * ganzen Lauf-Stand abzuweisen.
 */
const MAX_JOURNAL = 2000;
const MAX_PFAD = 4096;
const CODE_RE = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;

const istObjekt = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Eine Journal-Zeile aus dem Fenster: Zeile, Befehl des Katalogs, Pfad.
function journalZeile(e) {
  if (!istObjekt(e) || !Number.isInteger(e.line) || e.line < 1) return null;
  if (!lookupCommand(e.command)) return null;
  if (typeof e.path !== 'string' || e.path === '' || e.path.length > MAX_PFAD) return null;
  return { line: e.line, command: e.command, path: e.path };
}

/**
 * Prüft die Angaben eines Laufs aus dem Fenster (fail-closed).
 *
 * **Herkunft** (Stufe 2): `manual`, `schedule` oder `catch-up`; fehlt sie, gilt
 * `manual`, weil der Start von Hand der einzige Absender ist, der sie nicht
 * mitschickt (der Start der Stufe 1). Ein anderer Wert weist den Lauf ab.
 * **Journal** (Stufe 2): optional; jede Zeile `{ line, command, path }` mit
 * einem Befehl des Katalogs, sonst wird der Lauf abgewiesen. Über `MAX_JOURNAL`
 * Zeilen wird abgeschnitten und `journalTruncated` gesetzt.
 *
 * @param {*} run Nutzlast `{ status, line?, code?, startedAt?, origin?, journal? }`.
 * @returns {{status: string, origin: string, line?: number, code?: string,
 *   startedAt?: number, journal?: object[], journalTruncated?: true}|null}
 *   die bereinigten Angaben oder null bei ungültiger Form.
 */
function normalizeRun(run) {
  if (!istObjekt(run)) return null;
  if (!RUN_STATUS.includes(run.status)) return null;
  const sauber = { status: run.status };
  // 4T-002350 (Nachzug vom 2026-10-23): `failed` darf ohne Zeile kommen (`line`
  // fehlt oder ist null), damit ein Befund der ganzen Datei wie «kein
  // workflow-Block» verbucht wird; `stopped` trägt immer eine Zeile, und eine
  // angegebene Zeile muss gültig sein.
  const ohneZeile = run.line === undefined || run.line === null;
  if (run.status === 'stopped' || (run.status === 'failed' && !ohneZeile)) {
    if (!Number.isInteger(run.line) || run.line < 1) return null;
    sauber.line = run.line;
  }
  if (run.status === 'failed') {
    if (typeof run.code !== 'string' || !CODE_RE.test(run.code)) return null;
    sauber.code = run.code;
  }
  if (run.startedAt !== undefined) {
    if (!Number.isFinite(run.startedAt) || run.startedAt < 0) return null;
    sauber.startedAt = run.startedAt;
  }
  const origin = run.origin === undefined ? 'manual' : run.origin;
  if (!RUN_ORIGINS.includes(origin)) return null;
  sauber.origin = origin;
  if (run.journal !== undefined) {
    if (!Array.isArray(run.journal)) return null;
    const zeilen = run.journal.slice(0, MAX_JOURNAL).map(journalZeile);
    if (zeilen.includes(null)) return null;
    sauber.journal = zeilen;
    if (run.journal.length > MAX_JOURNAL) sauber.journalTruncated = true;
  }
  return sauber;
}

/**
 * Bringt die Pfade des Journals in die Form der Begleitdatei: relativ zur
 * Bereichs-Wurzel mit `/`, damit das Journal mit dem Bereich umziehen kann.
 * Gemeldet werden absolute Pfade (die Wirkungen der Schritte); ein Pfad
 * außerhalb des Bereichs oder ein relativer weist den Lauf ab (fail-closed).
 *
 * @param {object} run bereinigte Angaben aus `normalizeRun`.
 * @param {string} root Bereichs-Wurzel des sendenden Fensters.
 * @returns {object|null} die Angaben mit relativen Journal-Pfaden oder null.
 */
function journalImBereich(run, root) {
  if (!Array.isArray(run.journal)) return run;
  const journal = [];
  for (const e of run.journal) {
    if (!path.isAbsolute(e.path) || !isInsideArea(root, e.path)) return null;
    const relativ = path.relative(path.resolve(root), path.resolve(e.path));
    journal.push({ ...e, path: relativ === '' ? '.' : relativ.split(path.sep).join('/') });
  }
  return { ...run, journal };
}

/**
 * Der Scharf-Zustand eines Workflows gegen seinen aktuellen Text (2e): scharf
 * nur, wenn die Prüfsumme der Definition zur Scharf-Schaltung passt.
 *
 * @param {{at: string, hash: string}|null} armed Feld `armed` aus `getWorkflowRun`.
 * @param {string} text aktueller Inhalt der Workflow-Datei.
 * @returns {'armed'|'notArmed'|'definitionChanged'}
 */
function armedStatus(armed, text) {
  if (!armed) return ARMED_STATUS.notArmed;
  const hash = definitionsPruefsumme(text);
  return hash !== null && hash === armed.hash ? ARMED_STATUS.armed : ARMED_STATUS.definitionChanged;
}

/**
 * Baut den Schreibweg des Lauf-Stands.
 *
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {Set<string>} deps.mddSuspendedPaths Ausgesetzte Dokumente (mdd-history.js).
 * @param {(p: string) => string} deps.mddKeyOf Schlüssel eines Dokuments.
 * @param {Function} deps.notifyMddDefect Defekt-Meldung an das auslösende Fenster.
 * @param {() => number} [deps.now] Uhr (für Prüffälle).
 * @returns {{recordRun: Function, setArmed: Function, setArmedSchedule: Function,
 *   setNextDue: Function, recordSkipped: Function}}
 */
function createWorkflowRunState(deps) {
  const { mddSuspendedPaths, mddKeyOf, notifyMddDefect } = deps;
  const jetzt = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const nichtGesichert = { ok: false, code: 'runStateNotSaved' };

  // Liest die Begleitdatei, wendet die Änderung an und schreibt sie zurück.
  async function aendere(owner, workflowAbs, aenderung) {
    const absolute = path.resolve(workflowAbs);
    const key = mddKeyOf(absolute);
    if (mddSuspendedPaths.has(key)) {
      console.error('[workflow] Lauf-Stand nicht gesichert, Begleitdatei ausgesetzt:', absolute);
      return nichtGesichert;
    }
    const mddPath = mddPathFor(absolute);
    try {
      let container = mddStore.emptyContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddPath, 'utf8');
      } catch (err) {
        if (!err || err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseContainer(raw);
        if (!parsed.ok) {
          mddSuspendedPaths.add(key);
          notifyMddDefect(owner, absolute, parsed.error);
          console.error('[workflow] Lauf-Stand nicht gesichert, Begleitdatei defekt:', mddPath);
          return nichtGesichert;
        }
        container = parsed.container;
      }
      const vorher = mddStore.serializeContainer(container);
      aenderung(container, jetzt());
      const nachher = mddStore.serializeContainer(container);
      if (nachher === vorher) return { ok: true };
      await ersetzeDateiOderWirf(mddPath, nachher, { markSelfWriting });
      return { ok: true };
    } catch (err) {
      console.error('[workflow] Lauf-Stand nicht gesichert:', mddPath, err && err.message);
      return nichtGesichert;
    }
  }

  /**
   * Zählt einen Lauf und hält ihn mit Herkunft und Journal als letzten Lauf fest.
   *
   * @param {object|null} owner Fenster des Laufs (Empfänger einer Defekt-Meldung).
   * @param {string} workflowAbs absoluter Pfad der Workflow-Datei.
   * @param {object} run bereinigte Angaben aus `normalizeRun` (Journal-Pfade
   *   aus `journalImBereich`).
   * @returns {Promise<{ok: true}|{ok: false, code: 'runStateNotSaved'}>}
   */
  function recordRun(owner, workflowAbs, run) {
    return aendere(owner, workflowAbs, (container, nowMs) =>
      mddStore.recordWorkflowRun(container, run, nowMs),
    );
  }

  /**
   * Schaltet einen Workflow scharf (`{ hash }` mit der Prüfsumme der Definition
   * aus `definitionsPruefsumme`) oder nimmt die Scharf-Schaltung zurück (null).
   *
   * @param {object|null} owner Fenster (Empfänger einer Defekt-Meldung).
   * @param {string} workflowAbs absoluter Pfad der Workflow-Datei.
   * @param {{hash: string}|null} armed Prüfsumme oder null.
   * @returns {Promise<{ok: true}|{ok: false, code: 'runStateNotSaved'}>}
   */
  function setArmed(owner, workflowAbs, armed) {
    if (armed !== null && !(istObjekt(armed) && mddStore.isWorkflowDefinitionHash(armed.hash))) {
      throw new TypeError('setArmed: { hash } mit SHA-256 hexadezimal oder null erwartet');
    }
    return aendere(owner, workflowAbs, (container, nowMs) =>
      mddStore.setWorkflowArmed(container, armed, nowMs),
    );
  }

  /**
   * Die Scharf-Schaltung als eine Änderung (4T-002422, Entscheidung 2e):
   * `{ hash, nextDue }` setzt Scharf-Zustand und ersten Termin zusammen, null
   * nimmt beide zurück. Eine Änderung statt zweier, damit der Zeitplan-Prüfer
   * nie einen scharfen Stand ohne Termin oder einen Termin ohne Scharf-Zustand
   * zwischen zwei Schreibvorgängen liest.
   *
   * @param {object|null} owner Fenster (Empfänger einer Defekt-Meldung).
   * @param {string} workflowAbs absoluter Pfad der Workflow-Datei.
   * @param {{hash: string, nextDue: string}|null} schaltung Prüfsumme und erster
   *   Termin als Wanduhr-Zeit, oder null.
   * @returns {Promise<{ok: true}|{ok: false, code: 'runStateNotSaved'}>}
   */
  function setArmedSchedule(owner, workflowAbs, schaltung) {
    const gueltig =
      schaltung === null ||
      (istObjekt(schaltung) &&
        mddStore.isWorkflowDefinitionHash(schaltung.hash) &&
        mddStore.isWorkflowWallTime(schaltung.nextDue));
    if (!gueltig) {
      throw new TypeError('setArmedSchedule: { hash, nextDue } oder null erwartet');
    }
    return aendere(owner, workflowAbs, (container, nowMs) => {
      mddStore.setWorkflowArmed(container, schaltung && { hash: schaltung.hash }, nowMs);
      mddStore.setWorkflowNextDue(container, schaltung ? schaltung.nextDue : null);
    });
  }

  /**
   * Setzt den nächsten fälligen Lauf oder nimmt ihn zurück (null).
   *
   * @param {object|null} owner Fenster (Empfänger einer Defekt-Meldung).
   * @param {string} workflowAbs absoluter Pfad der Workflow-Datei.
   * @param {string|null} nextDue lokale Wanduhr-Zeit `JJJJ-MM-TTTHH:MM` oder null.
   * @returns {Promise<{ok: true}|{ok: false, code: 'runStateNotSaved'}>}
   */
  function setNextDue(owner, workflowAbs, nextDue) {
    if (nextDue !== null && !mddStore.isWorkflowWallTime(nextDue)) {
      throw new TypeError('setNextDue: Wanduhr-Zeit JJJJ-MM-TTTHH:MM oder null erwartet');
    }
    return aendere(owner, workflowAbs, (container) =>
      mddStore.setWorkflowNextDue(container, nextDue),
    );
  }

  /**
   * Vermerkt einen mit `missed: skip` verfallenen Lauf und setzt in derselben
   * Änderung den nächsten künftigen Termin (2d).
   *
   * @param {object|null} owner Fenster (Empfänger einer Defekt-Meldung).
   * @param {string} workflowAbs absoluter Pfad der Workflow-Datei.
   * @param {{due: string, nextDue: string|null}} verfall verfallene Fälligkeit
   *   und nächster Termin, beide als Wanduhr-Zeit.
   * @returns {Promise<{ok: true}|{ok: false, code: 'runStateNotSaved'}>}
   */
  function recordSkipped(owner, workflowAbs, verfall) {
    const gueltig =
      istObjekt(verfall) &&
      mddStore.isWorkflowWallTime(verfall.due) &&
      (verfall.nextDue === null || mddStore.isWorkflowWallTime(verfall.nextDue));
    if (!gueltig) {
      throw new TypeError('recordSkipped: { due, nextDue } als Wanduhr-Zeiten erwartet');
    }
    return aendere(owner, workflowAbs, (container, nowMs) =>
      mddStore.recordWorkflowSkipped(container, verfall, nowMs),
    );
  }

  return { recordRun, setArmed, setArmedSchedule, setNextDue, recordSkipped };
}

module.exports = {
  ARMED_STATUS,
  MAX_JOURNAL,
  RUN_ORIGINS,
  RUN_STATUS,
  armedStatus,
  createWorkflowRunState,
  journalImBereich,
  normalizeRun,
};
