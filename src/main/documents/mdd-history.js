// Dokument-Historie (.mdd): Pfad-Regeln der Begleitdatei, Aufloesung der
// Drei-Ebenen-Schaltung (Datei > Bereich > App), Protokollierung beim
// Speichern und beim Oeffnen sowie die Defekt-Meldung an das Fenster.
//
// Auszug aus main.js, 4T-000998 (Epic 3E-000196). Der Container-Kern (Delta-
// Pakete, Anker, Hash-Abgleich) liegt unveraendert in mdd-store.js; hier
// bleiben Datei-Zugriff, Zeitfenster-Parameter und die Fenster-Hinweise.
//
// Eigentuemer-Zustand dieses Moduls:
//   mddOpenPackets   : offene Aenderungspakete pro Dokument (In-Memory;
//                      Schluessel = normalisierter Pfad). Die Zeitfenster-
//                      Entscheidung (max. Paket-Dauer, Inaktivitaets-Schluss)
//                      faellt beim naechsten Speichern in mdd-store.recordSave;
//                      es laufen keine Timer.
//   mddSuspendedPaths: Dokumente mit defekter .mdd — Protokollierung bis zum
//                      App-Neustart ausgesetzt, Hinweis an das ausloesende
//                      Fenster einmalig. Die defekte Datei wird nie
//                      ueberschrieben.
//
// Electron-frei: die Fenster kommen als Argumente herein.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { ersetzeDateiOderWirf } = require('./atomic-write');
// 4T-001276 (Epic 3E-000232, Befund B1): Der Schlüssel der Historisierungs-Datei
// entscheidet über Datei-Identität und fragt deshalb die zentrale Auskunft.
const { pathCompareKey } = require('../../shared/platform.js');
const mddStore = require('./mdd-store');
const saveGuard = require('./save-guard');
const selbstSchreib = require('./self-write');
const { ermittleHerkunft } = require('../herkunft');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter');
const { isInsideArea } = require('../area/area-path');

// 4T-000947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
// Require-Cache).
const markSelfWriting = selbstSchreib.merke;

/**
 * Baut die Datei-Ebene der Dokument-Historie.
 *
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {() => object|null} deps.getStore Settings-Store (erst nach loadStore da).
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(root: string) => Promise<boolean|undefined>} deps.readAreaHistoryDefault
 *   Historien-Default der Bereichsdatei (area-config.js).
 * @returns {object} Historien-API samt der Zustands-Behaelter dieses Moduls.
 */
function createMddHistory(deps) {
  const { getStore, areaOfWindow, readAreaHistoryDefault } = deps;

  const mddOpenPackets = new Map();
  const mddSuspendedPaths = new Set();

  function isMddPath(p) {
    if (!p) return false;
    const ext = path.extname(p).toLowerCase();
    return ext === '.mdd' || ext === '.mdda' || ext === '.mddb';
  }

  // Begleitdatei zum Dokument: gleicher Basisname, Endung .mdd (PO-Konzept).
  function mddPathFor(mdPath) {
    const parsed = path.parse(mdPath);
    return path.join(parsed.dir, `${parsed.name}.mdd`);
  }

  function mddKeyOf(p) {
    return pathCompareKey(path.resolve(p));
  }

  // Wirksame Historisierung fuer ein Dokument (4T-000332): die eine Aufloesung
  // der Drei-Ebenen-Schaltung. Datei-Ebene aus dem YAML des Inhalts, Bereichs-
  // Ebene aus der Bereichsdatei (nur wenn das Dokument im Bereich des Fensters
  // liegt), App-Ebene aus dem Store. Liefert { effective, source }.
  async function resolveHistoryFor(owner, absolute, content) {
    const store = getStore();
    let fileValue;
    const fm = extractFrontmatter(String(content || ''));
    if (fm && fm.data && typeof fm.data.history === 'boolean') fileValue = fm.data.history;
    let areaValue;
    if (fileValue === undefined) {
      const area = areaOfWindow(owner);
      if (area && absolute && isInsideArea(area.rootPath, absolute)) {
        areaValue = await readAreaHistoryDefault(area.rootPath);
      }
    }
    return mddStore.resolveHistoryEnabled({
      fileValue,
      areaValue,
      appValue: !!(store && store.get('historyEnabled')),
    });
  }

  function historyTimingMs() {
    const store = getStore();
    const maxMin = Number(store && store.get('historyMaxPacketMinutes')) || 5;
    const inactMin = Number(store && store.get('historyInactivityMinutes')) || 2;
    return { maxPacketMs: maxMin * 60_000, inactivityMs: inactMin * 60_000 };
  }

  // Datei-Stand vor dem Ueberschreiben (Basis des Deltas und Eingang des
  // Hash-Abgleichs), BOM-/LF-normalisiert symmetrisch zu file:read.
  // null = Datei existiert noch nicht (neues Dokument).
  // 4T-000945 (Story 4S-000786): Der Lesevorgang liegt jetzt im save-guard-Modul,
  // weil Stand lesen und Stand vergleichen dieselbe Sache sind. Hier bleibt der
  // Rueckfall auf null fuer die Historien-Aufrufer, die keinen Fehler brauchen.
  async function readPreviousTextFor(absolute) {
    const stand = await saveGuard.readDiskState(absolute);
    return stand.ok ? stand.text : null;
  }

  // Protokolliert eine Speicherung in der .mdd. Schreib-Reihenfolge der
  // Epic-Entscheidung: erst .md (Aufrufer), dann .mdd (hier). Fehler der
  // Historie lassen das Speichern selbst nie scheitern; eine defekte .mdd
  // setzt die Protokollierung fuer das Dokument aus statt sie zu
  // ueberschreiben.
  //
  // 4T-001524 (Epic 3E-000169): Seit dem bereichsweiten Ersetzen SAGT die
  // Funktion zusaetzlich, ob sie ihre Arbeit getan hat ({ ok } bzw.
  // { ok: false, grund }). Der Rueckgabewert aendert fuer die bisherigen
  // Aufrufer nichts — sie werten ihn nicht aus, und das bleibt richtig: Beim
  // gewoehnlichen Speichern ist die Datei schon geschrieben, wenn diese Zeile
  // laeuft. Die Ersetzen-Strecke ruft sie dagegen VOR dem Schreiben und darf
  // nur schreiben, wenn der Vor-Stand wirklich weggelegt wurde; ohne ein
  // Ergebnis muesste sie die Zusicherung aus dem Nicht-Wissen behaupten.
  async function recordMddOnSave(owner, absolute, previousText, newText) {
    const key = mddKeyOf(absolute);
    // Ausgesetzt heisst: Es wird nichts protokolliert. Fuer das gewoehnliche
    // Speichern ist das der gewollte Schutz der defekten .mdd, fuer einen
    // Aufrufer mit Sicherungs-Pflicht ein Fehlschlag.
    if (mddSuspendedPaths.has(key)) return { ok: false, grund: 'ausgesetzt' };
    const mddPath = mddPathFor(absolute);
    try {
      let container = mddStore.emptyContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseContainer(raw);
        if (!parsed.ok) {
          mddSuspendedPaths.add(key);
          notifyMddDefect(owner, absolute, parsed.error);
          return { ok: false, grund: 'defekt' };
        }
        container = parsed.container;
      }
      const result = mddStore.recordSave(container, {
        previousText,
        newText,
        nowMs: Date.now(),
        openPacket: mddOpenPackets.get(key) || null,
        // 4T-001439: Wer hat gespeichert, und auf welchem Rechner? Ermittelt
        // wird hier und nicht im Container-Modul, das bewusst ohne Zugriff auf
        // das System auskommt. Abgelesen bei jedem Speichern statt einmal beim
        // Start, damit ein Benutzer-Wechsel zur Laufzeit richtig ankommt.
        herkunft: ermittleHerkunft(),
        ...historyTimingMs(),
      });
      if (result.openPacket) mddOpenPackets.set(key, result.openPacket);
      else mddOpenPackets.delete(key);
      if (result.changed) {
        const serialized = mddStore.serializeContainer(container);
        await ersetzeDateiOderWirf(mddPath, serialized, { markSelfWriting });
      }
      // Auch ein `changed === false` ist ein Erfolg: Dann steht der Stand
      // bereits im Container, und genau das ist die Zusicherung.
      return { ok: true };
    } catch (err) {
      // Unerwarteter Fehler (IO, defekte Delta-Kette): aussetzen statt bei
      // jedem Speichern erneut fehlzuschlagen. Beim gewoehnlichen Speichern ist
      // das Dokument zu diesem Zeitpunkt bereits geschrieben.
      mddSuspendedPaths.add(key);
      notifyMddDefect(owner, absolute, err && err.message ? err.message : String(err));
      return { ok: false, grund: 'fehler' };
    }
  }

  function notifyMddDefect(owner, absolute, detail) {
    console.error('[mdd] Protokollierung ausgesetzt fuer', absolute, '—', detail);
    if (owner && !owner.isDestroyed()) {
      owner.webContents.send('mdd:defect', { path: absolute });
    }
  }

  // Hash-Abgleich beim Oeffnen: eine Fremd-Aenderung seit der letzten
  // Protokollierung wird sofort als external-Paket festgehalten, nicht erst
  // beim naechsten Speichern. Idempotent bei passendem Stand; ohne .mdd gibt
  // es nichts abzugleichen.
  async function recordMddExternalOnOpen(owner, absolute, currentText) {
    const key = mddKeyOf(absolute);
    if (mddSuspendedPaths.has(key)) return;
    const mddPath = mddPathFor(absolute);
    try {
      let raw;
      try {
        raw = await fs.readFile(mddPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
        return;
      }
      const parsed = mddStore.parseContainer(raw);
      if (!parsed.ok) {
        mddSuspendedPaths.add(key);
        notifyMddDefect(owner, absolute, parsed.error);
        return;
      }
      if (mddStore.recordExternalIfNeeded(parsed.container, currentText, Date.now())) {
        mddOpenPackets.delete(key);
        const serialized = mddStore.serializeContainer(parsed.container);
        await ersetzeDateiOderWirf(mddPath, serialized, { markSelfWriting });
      }
    } catch (err) {
      mddSuspendedPaths.add(key);
      notifyMddDefect(owner, absolute, err && err.message ? err.message : String(err));
    }
  }

  return {
    mddOpenPackets,
    mddSuspendedPaths,
    isMddPath,
    mddPathFor,
    mddKeyOf,
    resolveHistoryFor,
    historyTimingMs,
    readPreviousTextFor,
    recordMddOnSave,
    notifyMddDefect,
    recordMddExternalOnOpen,
  };
}

module.exports = { createMddHistory };
