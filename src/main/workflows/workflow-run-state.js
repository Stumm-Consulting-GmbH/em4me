// 4T-002348 (Epic 3E-000184): Der Lauf-Stand eines Workflows im Abschnitt
// `workflow` seiner Begleitdatei (Story 4S-001106, AK5 des Tasks).
//
// **Ort nach der Ablage-Regel:** die vorhandene Begleitdatei `<Name>.mdd` neben
// der Workflow-Datei, kein neuer Datei-Typ und kein eigenes Protokoll-Dokument
// (Entscheidung 2d der Konzept-Stufe); der Weg durch die Ablage-Regel steht im
// Lösungs-Kapitel des Tasks und in der Architektur. Der Text der Workflow-Datei
// wird nie angefasst.
//
// **Schreibweg nach `writeBlockDataMutation`** (documents/block-data.js):
// Begleitdatei lesen oder leer anlegen, eine defekte nie überschreiben (der
// Pfad kommt in die Menge der ausgesetzten Dokumente, das Fenster bekommt die
// Defekt-Meldung), schreiben mit `ersetzeDateiOderWirf` und Selbst-Schreib-Marke.
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

// 4T-000947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
// Require-Cache).
const markSelfWriting = selbstSchreib.merke;

/** Die geschlossene Liste der Lauf-Ergebnisse. */
const RUN_STATUS = Object.freeze(['ok', 'failed', 'stopped', 'canceled']);
const CODE_RE = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;

/**
 * Prüft die Angaben eines Laufs aus dem Fenster (fail-closed).
 *
 * @param {*} run Nutzlast `{ status, line?, code?, startedAt? }`.
 * @returns {{status: string, line?: number, code?: string, startedAt?: number}|null}
 *   die bereinigten Angaben oder null bei ungültiger Form.
 */
function normalizeRun(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
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
  return sauber;
}

/**
 * Baut den Schreibweg des Lauf-Stands.
 *
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {Set<string>} deps.mddSuspendedPaths Ausgesetzte Dokumente (mdd-history.js).
 * @param {(p: string) => string} deps.mddKeyOf Schlüssel eines Dokuments.
 * @param {Function} deps.notifyMddDefect Defekt-Meldung an das auslösende Fenster.
 * @param {() => number} [deps.now] Uhr (für Prüffälle).
 * @returns {{recordRun: Function}}
 */
function createWorkflowRunState(deps) {
  const { mddSuspendedPaths, mddKeyOf, notifyMddDefect } = deps;
  const jetzt = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const nichtGesichert = { ok: false, code: 'runStateNotSaved' };

  /**
   * Zählt einen Lauf und hält ihn als letzten Lauf fest.
   *
   * @param {object|null} owner Fenster des Laufs (Empfänger einer Defekt-Meldung).
   * @param {string} workflowAbs absoluter Pfad der Workflow-Datei.
   * @param {object} run bereinigte Angaben aus `normalizeRun`.
   * @returns {Promise<{ok: true}|{ok: false, code: 'runStateNotSaved'}>}
   */
  async function recordRun(owner, workflowAbs, run) {
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
      mddStore.recordWorkflowRun(container, run, jetzt());
      await ersetzeDateiOderWirf(mddPath, mddStore.serializeContainer(container), {
        markSelfWriting,
      });
      return { ok: true };
    } catch (err) {
      console.error('[workflow] Lauf-Stand nicht gesichert:', mddPath, err && err.message);
      return nichtGesichert;
    }
  }

  return { recordRun };
}

module.exports = { RUN_STATUS, createWorkflowRunState, normalizeRun };
