// Block-Metadaten (blockData-Sektion der .mdd): Bereinigung der ueber IPC
// eingehenden Werte und der gemeinsame Schreib-Pfad der Mutationen.
//
// Auszug aus main.js, 4T-0998 (Epic 3E-0196). Muster des Notiz-Datenpfads
// (note:read/note:write): Lesen ist idempotent und setzt bei defekter .mdd
// nichts aus; Schreiben legt die .mdd bei Bedarf an, respektiert
// mddSuspendedPaths und broadcastet 'blockData:changed' fuer die
// Mehrfenster-Synchronisation. Der Anker-Abgleich (aktiv vs. verwaist)
// passiert im Renderer gegen den Live-Editor-Text; Main liefert die rohe
// Anker->Daten-Map.
//
// Eigener Zustand: keiner. Die Suspend-Menge gehoert der Dokument-Historie
// (mdd-history.js) und kommt als Behaelter herein.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const mddStore = require('./mdd-store');
const backlinks = require('../backlinks');
const selbstSchreib = require('./self-write');

// 4T-0947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
// Require-Cache).
const markSelfWriting = selbstSchreib.merke;

// Saeubert das ueber IPC eingehende values-Objekt: nur string/number/boolean und
// String-Arrays (multistring). Verschachtelte Objekte und nicht-stringbare
// Array-Elemente werden verworfen — konsistent zur Abfragbarkeit der Frontmatter-
// Properties (extractProperties in backlinks.js). Werte bleiben typ-erhaltend,
// damit die Renderer-Inferenz den Typ ableitet (keine Typ-Persistenz).
// 4T-1187 (Epic 3E-0221, E11): Höchst-Tiefe verschachtelter Block-Werte.
//
// Der Wert kommt über die IPC-Grenze herein, und diese Funktion ist ihr
// Filter. Das Definitions-Format kennt bewusst keinen Tiefen-Deckel (4T-1141:
// «ein Deckel wäre eine neue, nicht entschiedene Verhaltens-Zusage») — an
// einer Prozess-Grenze ist eine unbegrenzte Rekursion auf fremder Eingabe
// aber kein vertretbares Risiko. Zehn Ebenen liegen so weit über jedem realen
// Aufbau, dass die Grenze nie im Weg steht; was tiefer liegt, entfällt still
// wie jeder andere nicht übernehmbare Wert.
const BLOCK_WERT_MAX_TIEFE = 10;

// Werte einer Block-Eigenschaft säubern.
//
// 4T-1187: Seit den strukturierten Feld-Typen kommen auch verschachtelte Werte
// durch — ein Objekt mit benannten Kind-Feldern und eine Liste gleichartiger
// Objekte. Die Entscheidung des Product Owners vom 2026-08-25 verlangt genau
// das: Beide Eigenschafts-Panels bedienen die Objekt-Typen, das Block-Panel
// speichert sie in der Begleitdatei.
//
// **Der Bereichs-Index bleibt davon unberührt**, und das ist ebenso Teil der
// Entscheidung: `normalizeBlockEntries` in src/main/index/block-data.js lässt
// weiterhin nur flache Werte durch. Ein strukturierter Wert an einem Absatz ist
// damit gespeichert und anzeigbar, aber nicht Gegenstand einer Block-Abfrage —
// dieselbe bewusst gewählte Grenze wie bei den abgeleiteten Werten (E1).
function sanitizeBlockValues(values, tiefe = 0) {
  if (values === null || typeof values !== 'object' || Array.isArray(values)) return {};
  const out = {};
  for (const key of Object.keys(values)) {
    const sauber = sanitizeBlockWert(values[key], tiefe);
    if (sauber !== undefined) out[key] = sauber;
  }
  return out;
}

// Ein einzelner Wert: Skalar, Liste oder verschachtelte Struktur.
// `undefined` = nicht übernehmbar (der Aufrufer lässt den Schlüssel weg).
function sanitizeBlockWert(v, tiefe) {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v === null || typeof v !== 'object') return undefined;
  if (tiefe >= BLOCK_WERT_MAX_TIEFE) return undefined;
  if (Array.isArray(v)) {
    // Eine Liste trägt entweder Zeichenketten (der Bestands-Fall) oder
    // Objekte (eine Objekt-Liste). Gemischte Listen behalten, was übernehmbar
    // ist — dieselbe Haltung wie bisher beim Zeichenketten-Filter.
    const liste = [];
    for (const item of v) {
      const sauber = sanitizeBlockWert(item, tiefe + 1);
      if (sauber !== undefined) liste.push(sauber);
    }
    return liste;
  }
  return sanitizeBlockValues(v, tiefe + 1);
}

/**
 * Baut den Schreib-Pfad der Block-Metadaten.
 *
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des IPC-Absenders.
 * @param {Set<string>} deps.mddSuspendedPaths Ausgesetzte Dokumente (mdd-history.js).
 * @param {(p: string) => string} deps.mddPathFor Begleitdatei zum Dokument.
 * @param {(p: string) => string} deps.mddKeyOf Normalisierter Schluessel eines Pfads.
 * @param {Function} deps.notifyMddDefect Defekt-Meldung an das ausloesende Fenster.
 * @param {Function} deps.broadcast Broadcast an alle Fenster.
 * @returns {object} sanitizeBlockValues und writeBlockDataMutation.
 */
function createBlockData(deps) {
  const { senderWindow, mddSuspendedPaths, mddPathFor, mddKeyOf, notifyMddDefect, broadcast } =
    deps;

  // Gemeinsamer Schreib-Pfad fuer blockData:write/rename: .mdd lesen bzw. leer
  // anlegen, Mutation anwenden, serialisieren, selbst-markiert schreiben,
  // 'blockData:changed' broadcasten. Fehler-Prinzip exakt wie note:write: eine
  // defekte .mdd setzt die Funktion aus (mddSuspendedPaths) und wird nie
  // ueberschrieben; ein transienter Schreibfehler meldet nur den Fehler.
  async function writeBlockDataMutation(event, filePath, mutate) {
    const owner = senderWindow(event);
    const absolute = path.resolve(filePath);
    const key = mddKeyOf(absolute);
    if (mddSuspendedPaths.has(key)) return { ok: false, error: 'suspended' };
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
          return { ok: false, error: parsed.error };
        }
        container = parsed.container;
      }
      mutate(container);
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddPath, serialized);
      await fs.writeFile(mddPath, serialized, { encoding: 'utf8' });
      const blockData = mddStore.getAllBlockData(container);
      // 4T-0408 (Epic 3E-0077): Block-Ebene des Abfrage-Index nachziehen — die
      // .mdd liegt ausserhalb des Markdown-Watchers, dieser Schreibpfad ist ihr
      // Invalidierungs-Weg (loest den backlinks:invalidated-Broadcast aus, der
      // sichtbare Abfrage-Container neu befuellt).
      backlinks.updateBlockDataForFile(absolute, blockData);
      broadcast('blockData:changed', { path: absolute, blockData });
      return { ok: true, blockData };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  }

  return { writeBlockDataMutation };
}

module.exports = { createBlockData, sanitizeBlockValues };
