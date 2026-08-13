// IPC-Kanal-Gruppe Dokument-Historie: Historisierungs-Schaltung samt
// Bereichs-Vorgabe, Revisionsliste und Rekonstruktion, dazu die beiden
// weiteren Sektionen der .mdd-Begleitdatei (Notiz und Block-Metadaten).
//
// Auszug aus main.js, 4T-0999 (Epic 3E-0196). Kanal-Gruppe: history:*,
// note:*, blockData:*.
//
// Eigener Zustand: keiner; die offenen Pakete und die Suspend-Markierung
// gehoeren dem Historien-Modul und kommen als Deps.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { isValidBlockAnchorId } = require('../../shared/block-anchors');
const { countChanges } = require('../../shared/line-diff');
const { sanitizeBlockValues } = require('../documents/block-data');
const selbstSchreib = require('../documents/self-write');

// 4T-0947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
// Require-Cache).
const markSelfWriting = selbstSchreib.merke;

/**
 * Registriert die Historien-, Notiz- und Block-Metadaten-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {object} deps.mddStore Container-Kern der Dokument-Historie.
 * @param {Map} deps.mddSuspendedPaths Ausgesetzte Protokollierung je Dokument.
 * @param {(p: string) => string} deps.mddPathFor Pfad der Begleitdatei.
 * @param {(p: string) => string} deps.mddKeyOf Schluessel eines Dokuments.
 * @param {Function} deps.resolveHistoryFor Aufloesung der Historisierungs-Schaltung.
 * @param {Function} deps.readPreviousTextFor Datei-Stand vor dem Ueberschreiben.
 * @param {Function} deps.notifyMddDefect Hinweis auf eine defekte Begleitdatei.
 * @param {Function} deps.readAreaHistoryDefault Bereichs-Vorgabe der Historisierung.
 * @param {Function} deps.writeBlockDataMutation Schreib-Rand der Block-Metadaten.
 * @param {(channel: string, ...args: any[]) => void} deps.broadcast Meldung an alle Fenster.
 */
function registerHistoryIpc(handle, deps) {
  const {
    senderWindow,
    areaOfWindow,
    mddStore,
    mddSuspendedPaths,
    mddPathFor,
    mddKeyOf,
    resolveHistoryFor,
    readPreviousTextFor,
    notifyMddDefect,
    readAreaHistoryDefault,
    writeBlockDataMutation,
    broadcast,
  } = deps;

  // --- 4T-0332 (Epic 3E-0060): Historisierungs-Schaltung ---------------------

  // Zustand fuer die Statusbar: wirksame Einstellung samt Herkunft, dazu ob
  // eine .mdd existiert (aktiv/pausiert/inaktiv) und ob die Protokollierung
  // wegen defekter .mdd ausgesetzt ist.
  handle('history:getState', async (event, filePath, content) => {
    const owner = senderWindow(event);
    if (typeof filePath !== 'string' || !filePath) {
      const resolved = await resolveHistoryFor(owner, null, content);
      return { ...resolved, mddExists: false, suspended: false };
    }
    const absolute = path.resolve(filePath);
    const resolved = await resolveHistoryFor(owner, absolute, content);
    let mddExists = false;
    try {
      await fs.access(mddPathFor(absolute));
      mddExists = true;
    } catch {
      /* keine .mdd vorhanden */
    }
    return { ...resolved, mddExists, suspended: mddSuspendedPaths.has(mddKeyOf(absolute)) };
  });

  // Bereichs-Default lesen (null = nicht gesetzt, erben).
  handle('history:getAreaDefault', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { hasArea: false, value: null };
    const value = await readAreaHistoryDefault(area.rootPath);
    return { hasArea: true, value: value === undefined ? null : value };
  });

  // Bereichs-Default setzen (true/false) oder entfernen (null = erben).
  // Die Bereichsdatei entsteht erst beim ersten tatsaechlichen Setzen
  // (Epic-Entscheidung: nur bei Bedarf anlegen); eine defekte Bereichsdatei
  // wird nie ueberschrieben.
  handle('history:setAreaDefault', async (event, value) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const mddaPath = path.join(area.rootPath, mddStore.MDDA_FILENAME);
    try {
      let container = mddStore.emptySettingsContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddaPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseSettingsContainer(raw);
        if (!parsed.ok) return { ok: false, error: `mdda defekt: ${parsed.error}` };
        container = parsed.container;
      }
      if (value === true || value === false) container.settings.history = value;
      else delete container.settings.history;
      if (raw === null && value !== true && value !== false) {
        return { ok: true }; // erben ohne bestehende Datei: nichts anzulegen
      }
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // --- 4T-0333 (Epic 3E-0060): Historien-Ansicht ------------------------------

  // Revisionsliste eines Dokuments: Ausgangsstand (erster Anker) plus alle
  // Pakete mit Zeitstempeln, Ausloeser und Umfangs-Angabe. Ohne .mdd eine
  // leere Liste (die Ansicht zeigt dann den Leer-Zustand).
  handle('history:list', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
    const absolute = path.resolve(filePath);
    try {
      const raw = await fs.readFile(mddPathFor(absolute), 'utf8');
      const parsed = mddStore.parseContainer(raw);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const history = parsed.container.history;
      const initial = history.anchors.length > 0 ? { ts: history.anchors[0].ts } : null;
      const revisions = history.packets.map((p, i) => {
        const { added, removed } = countChanges(p.ops);
        return { seq: i, ts: p.ts, tsEnd: p.tsEnd, trigger: p.trigger, added, removed };
      });
      return { ok: true, initial, revisions };
    } catch (err) {
      if (err && err.code === 'ENOENT') return { ok: true, initial: null, revisions: [] };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // Rekonstruierter Stand einer Revision. seq: -1 = Ausgangsstand,
  // 0..n-1 = Stand nach Paket seq, 'current' = realer Datei-Inhalt
  // (BOM-/LF-normalisiert, fuer den Vergleich gegen den Ist-Stand).
  handle('history:getRevision', async (_event, filePath, seq) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
    const absolute = path.resolve(filePath);
    try {
      if (seq === 'current') {
        const text = await readPreviousTextFor(absolute);
        if (text === null) return { ok: false, error: 'file not readable' };
        return { ok: true, text };
      }
      const raw = await fs.readFile(mddPathFor(absolute), 'utf8');
      const parsed = mddStore.parseContainer(raw);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const n = Number(seq);
      if (!Number.isInteger(n) || n < -1 || n >= parsed.container.history.packets.length) {
        return { ok: false, error: 'invalid revision' };
      }
      return { ok: true, text: mddStore.reconstructRevision(parsed.container.history, n) };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // --- 4T-0358 (Epic 3E-0066): Dokument-Notiz ---------------------------------

  // Notiz eines Dokuments aus der `notes`-Sektion der .mdd lesen. Ohne .mdd
  // eine leere Notiz (null). Eine defekte .mdd meldet den Fehler, setzt die
  // Notiz aber NICHT aus — Lesen ist idempotent (wie history:list); der
  // Schreib-Pfad kümmert sich um das Aussetzen.
  handle('note:read', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
    const absolute = path.resolve(filePath);
    try {
      const raw = await fs.readFile(mddPathFor(absolute), 'utf8');
      const parsed = mddStore.parseContainer(raw);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, note: mddStore.getNote(parsed.container) };
    } catch (err) {
      if (err && err.code === 'ENOENT') return { ok: true, note: null };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // Notiz ersatzlos schreiben (keine Historie). Ohne .mdd wird sie mit einem
  // leeren Container angelegt; leerer Text entfernt die Sektion. Eine defekte
  // .mdd setzt die Notiz-Funktion aus (mddSuspendedPaths) und wird nie
  // überschrieben (Fehler-Prinzip der Historie). Ein transienter Schreibfehler
  // meldet nur den Fehler, ohne dauerhaftes Aussetzen (explizite Nutzer-Aktion,
  // erneut versuchbar). Nach dem Schreiben Broadcast 'note:changed' an alle
  // Fenster, damit Panels derselben Datei nachziehen (Datengrundlage 4T-0359).
  handle('note:write', async (event, filePath, text) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
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
      mddStore.setNote(container, text, Date.now());
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddPath, serialized);
      await fs.writeFile(mddPath, serialized, { encoding: 'utf8' });
      const note = mddStore.getNote(container);
      broadcast('note:changed', { path: absolute, note });
      return { ok: true, note };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // --- 4T-0363 (Epic 3E-0067): Block-Metadaten lesen/schreiben/umbenennen ------
  // blockData:read liefert die rohe Anker->{values,updated}-Map (idempotent, ohne
  // Aussetzen); write setzt die values eines Ankers (leeres Objekt entfernt den
  // Eintrag); rename verschiebt einen Anker-Schluessel (Umbenennen/Zuordnen). Die
  // Anker-ID-Syntax wird streng gegen die gemeinsame Quelle geprueft.
  handle('blockData:read', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
    const absolute = path.resolve(filePath);
    try {
      const raw = await fs.readFile(mddPathFor(absolute), 'utf8');
      const parsed = mddStore.parseContainer(raw);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, blockData: mddStore.getAllBlockData(parsed.container) };
    } catch (err) {
      if (err && err.code === 'ENOENT') return { ok: true, blockData: {} };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  handle('blockData:write', async (event, filePath, anchorId, values) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
    if (!isValidBlockAnchorId(anchorId)) return { ok: false, error: 'invalid anchor id' };
    return writeBlockDataMutation(event, filePath, (container) => {
      mddStore.setBlockData(container, anchorId, sanitizeBlockValues(values), Date.now());
    });
  });

  handle('blockData:rename', async (event, filePath, fromId, toId) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
    if (!isValidBlockAnchorId(fromId) || !isValidBlockAnchorId(toId)) {
      return { ok: false, error: 'invalid anchor id' };
    }
    return writeBlockDataMutation(event, filePath, (container) => {
      mddStore.renameBlockAnchor(container, fromId, toId, Date.now());
    });
  });
}

module.exports = { registerHistoryIpc };
