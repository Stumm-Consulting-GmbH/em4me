// 4T-0331 (Epic 3E-0060): Kern der Dokument-Historie — Container-Format der
// Markdown-Data-Datei (.mdd), Aenderungspakete mit zeilenbasierten Deltas,
// Anker-Snapshots, Hash-Absicherung und Rekonstruktion.
//
// Electron-frei und ohne Datei-Zugriff (rein auf Objekten/Strings), damit
// vollstaendig unit-testbar; Lesen/Schreiben der Dateien uebernimmt main.js.
// Node-Abhaengigkeit nur node:crypto (SHA-256).
//
// Container-Format (JSON): { schemaVersion: 1, history: { anchors, packets } }
// plus optionale Sektion `notes` (Dokument-Notiz, 4T-0358). Unbekannte
// Sektionen bleiben beim Schreiben erhalten (Vorwaerts-Kompatibilitaet fuer
// weitere Inhalte; Epic-Entscheidung).
//
// - Anker: { ts, baseSeq, text, hash } — voller Stand. `baseSeq` ist die
//   Anzahl der Pakete, die in diesem Stand bereits enthalten sind (0 =
//   Ausgangsstand vor dem ersten Paket). Der erste Eintrag einer Historie
//   ist immer ein Anker; danach alle ANCHOR_EVERY Pakete ein weiterer.
// - Paket: { ts, tsEnd, trigger, ops, hashAfter } plus optionales `comment`
//   (Schema sieht es vor, v1 laesst es ungenutzt). `ts` ist der Beginn des
//   Pakets, `tsEnd` die letzte darin zusammengefasste Speicherung (beide
//   UTC ISO-8601, sekundengenau). `trigger`: 'edit' (regulaeres Editieren)
//   oder 'external' (Fremd-Aenderung bzw. Aufholen nach Pause).
//   `hashAfter` ist der SHA-256 des LF-normalisierten Nachher-Stands —
//   der Abgleich gegen die reale Datei erkennt Fremd-Aenderungen, bevor
//   die Delta-Kette inkonsistent wuerde.
'use strict';

const crypto = require('node:crypto');
const { diffLines, applyOps } = require('../shared/line-diff');

const MDD_SCHEMA_VERSION = 1;
// Anker-Abstand: alle N Pakete ein voller Stand. Begrenzt Rekonstruktions-
// Aufwand und den Schadens-Radius einer defekten Stelle auf ein Segment.
const ANCHOR_EVERY = 20;

function hashText(text) {
  return crypto
    .createHash('sha256')
    .update(String(text ?? ''), 'utf8')
    .digest('hex');
}

// Zeitstempel gemaess Konvention: UTC ISO-8601, sekundengenau.
function isoSeconds(dateMs) {
  return new Date(dateMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function emptyContainer() {
  return { schemaVersion: MDD_SCHEMA_VERSION, history: { anchors: [], packets: [] } };
}

// Parst und validiert einen Container. Liefert { ok, container } bzw.
// { ok: false, error } — eine defekte Datei fuehrt beim Aufrufer zu
// ausgesetzter Protokollierung, nie zu Absturz oder Ueberschreiben.
function parseContainer(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch (err) {
    return { ok: false, error: `JSON: ${err && err.message ? err.message : 'Parse-Fehler'}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Container ist kein Objekt' };
  }
  if (parsed.schemaVersion !== MDD_SCHEMA_VERSION) {
    return { ok: false, error: `unbekannte schemaVersion: ${parsed.schemaVersion}` };
  }
  const h = parsed.history;
  if (!h || typeof h !== 'object' || !Array.isArray(h.anchors) || !Array.isArray(h.packets)) {
    return { ok: false, error: 'history-Sektion fehlt oder ist defekt' };
  }
  return { ok: true, container: parsed };
}

// Serialisierung lesbar eingerueckt: die .mdd ist bewusst sichtbar und
// transparent (Epic-Entscheidung), Einsehbarkeit schlaegt Kompaktheit.
function serializeContainer(container) {
  return JSON.stringify(container, null, 2) + '\n';
}

// --- 4T-0332 (Epic 3E-0060): Bereichsdatei und Einstellungs-Hierarchie -------

// Fester Dateiname der Bereichsdatei im Bereichs-Wurzelordner
// (PO-Entscheidung: produktneutral und umbenennungsfest; die eigene Endung
// .mdda schliesst Kollisionen mit Markdown-Dateien aus). 4T-0352 (Epic
// 3E-0064): Umbenennung von .mddb auf .mdda ("Markdown Data Area"); der
// Altname bleibt fuer die stille Einmal-Migration und die uebergangsweise
// Erkennung erhalten.
const MDDA_FILENAME = 'Area_Settings.mdda';
const LEGACY_MDDB_FILENAME = 'Area_Settings.mddb';

// Container der Bereichsdatei: gleiches Muster wie die .mdd, Sektion
// `settings` statt `history` (v1 nur der Historisierungs-Default).
function emptySettingsContainer() {
  return { schemaVersion: MDD_SCHEMA_VERSION, settings: {} };
}

function parseSettingsContainer(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch (err) {
    return { ok: false, error: `JSON: ${err && err.message ? err.message : 'Parse-Fehler'}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Container ist kein Objekt' };
  }
  if (parsed.schemaVersion !== MDD_SCHEMA_VERSION) {
    return { ok: false, error: `unbekannte schemaVersion: ${parsed.schemaVersion}` };
  }
  if (!parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings)) {
    return { ok: false, error: 'settings-Sektion fehlt oder ist defekt' };
  }
  return { ok: true, container: parsed };
}

// --- 4T-0348 (Epic 3E-0062): Bereichs-Index-Cache (Area_Cache.mdda) -----------

// Eigene Cache-Datei im Bereichs-Wurzelordner, getrennt von Area_Settings.mdda
// (Architektur-Entscheidung des Epics): der Link-Index ist regenerierbarer
// Cache, die Bereichsdatei traegt Nutzer-Einstellungen. Die Trennung vermeidet
// Schreib-Churn an der Einstellungs-Datei; Loeschen der Cache-Datei ist
// gefahrlos (Neuaufbau beim naechsten Bereichs-Oeffnen).
const MDDA_CACHE_FILENAME = 'Area_Cache.mdda';

// 4T-0354 (Epic 3E-0065): Eigene schemaVersion NUR für den Area-Cache, entkoppelt
// von MDD_SCHEMA_VERSION (die auch History-.mdd und Settings trägt). Der Cache ist
// regenerierbar; das Anheben dieser Version verwirft ihn und baut ihn neu auf
// (hier: Ergänzung der Frontmatter-Properties), ohne History oder Settings zu
// invalidieren. Version 2: Properties-Map im parsed-Objekt. Version 3
// (4T-0502, Epic 3E-0096): Task-Zeilen-Liste im parsed-Objekt — Alt-Caches
// ohne sie müssen verworfen werden, sonst lieferte der Warmstart leere
// Task-Treffer für unveränderte Dateien.
const MDDA_CACHE_SCHEMA_VERSION = 3;

// Format: { schemaVersion, linkIndex: { files: { <relPath>: { mtimeMs, size,
// hash, parsed } } } }. `parsed` traegt das Datei-Parse-Ergebnis (hits,
// aliases, headings, blockIds, tags); md-Link-Ziele liegen relativ zur Wurzel
// (Umzugs-Toleranz; die Transformation macht der Aufrufer backlinks.js, der die
// Wurzel und die hits-Struktur kennt, damit dieses Modul path-frei bleibt).
function emptyCacheContainer() {
  return { schemaVersion: MDDA_CACHE_SCHEMA_VERSION, linkIndex: { files: {} } };
}

function parseCacheContainer(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch (err) {
    return { ok: false, error: `JSON: ${err && err.message ? err.message : 'Parse-Fehler'}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Container ist kein Objekt' };
  }
  if (parsed.schemaVersion !== MDDA_CACHE_SCHEMA_VERSION) {
    return { ok: false, error: `unbekannte schemaVersion: ${parsed.schemaVersion}` };
  }
  const li = parsed.linkIndex;
  if (
    !li ||
    typeof li !== 'object' ||
    !li.files ||
    typeof li.files !== 'object' ||
    Array.isArray(li.files)
  ) {
    return { ok: false, error: 'linkIndex-Sektion fehlt oder ist defekt' };
  }
  return { ok: true, container: parsed };
}

// Serialisierung KOMPAKT (ohne Einrueckung), bewusst anders als die lesbaren
// .mdd-/Settings-Container: die Cache-Datei ist Maschinen-Artefakt, Groesse
// schlaegt Einsehbarkeit.
function serializeCacheContainer(container) {
  return JSON.stringify(container) + '\n';
}

// Die eine Aufloesung der Drei-Ebenen-Schaltung (Epic-Entscheidung):
// Datei (YAML `history`) schlaegt Bereich (Area_Settings.mdda) schlaegt
// App-Einstellung; nicht gesetzt heisst erben. Rein und unit-testbar;
// die Ebenen-Werte beschafft main.js.
function resolveHistoryEnabled({ fileValue, areaValue, appValue }) {
  if (typeof fileValue === 'boolean') return { effective: fileValue, source: 'file' };
  if (typeof areaValue === 'boolean') return { effective: areaValue, source: 'area' };
  return { effective: !!appValue, source: 'app' };
}

// Revisionsliste fuer Anzeige und Rekonstruktion: Eintrag -1 ist der
// Ausgangsstand (erster Anker), 0..n-1 sind die Staende nach Paket i.
function revisionCount(history) {
  return history.packets.length;
}

// Rekonstruiert den Stand nach Paket `seq` (0-basiert); seq === -1 liefert
// den Ausgangsstand. Wirft bei defekter Kette (applyOps-Validierung).
function reconstructRevision(history, seq) {
  if (history.anchors.length === 0) {
    throw new Error('mdd: Historie ohne Anker');
  }
  const wanted = seq + 1; // Anzahl anzuwendender Pakete
  let anchor = null;
  for (const a of history.anchors) {
    if (a.baseSeq <= wanted && (!anchor || a.baseSeq > anchor.baseSeq)) anchor = a;
  }
  if (!anchor) {
    throw new Error(`mdd: kein Anker fuer Revision ${seq}`);
  }
  let text = anchor.text;
  for (let i = anchor.baseSeq; i < wanted; i++) {
    const packet = history.packets[i];
    if (!packet) throw new Error(`mdd: Paket ${i} fehlt`);
    text = applyOps(text, packet.ops);
  }
  return text;
}

// Juengster protokollierter Stand (Text + Hash); null bei leerer Historie.
function lastRecordedState(history) {
  if (history.anchors.length === 0) return null;
  const lastSeq = history.packets.length - 1;
  const lastPacket = lastSeq >= 0 ? history.packets[lastSeq] : null;
  // Hash liegt am Paket bzw. Anker; Text nur bei Bedarf rekonstruieren.
  if (lastPacket) {
    return {
      hash: lastPacket.hashAfter,
      getText: () => reconstructRevision(history, lastSeq),
    };
  }
  const anchor = history.anchors[0];
  return { hash: anchor.hash, getText: () => anchor.text };
}

// Haengt bei Abweichung zwischen protokolliertem Stand und realem Datei-
// Inhalt ein Aufhol-Paket (`external`) an: Fremd-Aenderungen und Pausen
// brechen die Kette nicht, sondern werden Teil der Historie. Liefert true,
// wenn ein Paket entstanden ist.
function recordExternalIfNeeded(container, diskText, nowMs) {
  const history = container.history;
  const last = lastRecordedState(history);
  if (!last) return false;
  const diskHash = hashText(diskText);
  if (diskHash === last.hash) return false;
  const baseText = last.getText();
  const ops = diffLines(baseText, diskText);
  const ts = isoSeconds(nowMs);
  maybeAddAnchor(history, baseText, nowMs);
  history.packets.push({ ts, tsEnd: ts, trigger: 'external', ops, hashAfter: diskHash });
  return true;
}

// Anker werden VOR dem Anfuegen des naechsten Pakets gesetzt (Text = Stand
// nach allen bisherigen, finalen Paketen). So entsteht nie ein Anker auf
// einem noch offenen Paket, dessen Delta beim Coalescing weiter veraendert
// wird — der Anker-Text bliebe sonst als veralteter Stand zurueck.
function maybeAddAnchor(history, stateAfterAllPackets, nowMs) {
  const count = history.packets.length;
  const lastAnchor = history.anchors[history.anchors.length - 1];
  if (count > 0 && count % ANCHOR_EVERY === 0 && (!lastAnchor || lastAnchor.baseSeq < count)) {
    history.anchors.push({
      ts: isoSeconds(nowMs),
      baseSeq: count,
      text: stateAfterAllPackets,
      hash: hashText(stateAfterAllPackets),
    });
  }
}

// Kern-Schritt beim Speichern. Eingaben: Container, Datei-Inhalt vor dem
// Speichern (null, wenn die Datei neu ist), der gespeicherte neue Inhalt,
// die Uhrzeit sowie der In-Memory-Zustand des offenen Pakets. Zeitlogik
// ueber injizierte Uhrzeit (nowMs), damit unit-testbar.
//
// Paket-Bildung (Coalescing, PO-Entscheidung): Folge-Speicherungen werden
// in das offene Paket gemergt, solange weder die maximale Paket-Dauer
// (seit Paket-Beginn) noch der Inaktivitaets-Schluss (seit der letzten
// Speicherung) ueberschritten ist. Beide Grenzen werden beim naechsten
// Speichern geprueft; es laufen keine Timer.
//
// Rueckgabe: { changed, openPacket } — `openPacket` ist der neue In-Memory-
// Zustand ({ baseText, startedMs, lastMs } oder null), `changed` sagt, ob
// der Container geschrieben werden muss.
function recordSave(container, opts) {
  const { previousText, newText, nowMs, maxPacketMs, inactivityMs } = opts;
  let openPacket = opts.openPacket || null;
  const history = container.history;
  let changed = false;

  // Erste protokollierte Speicherung: Anker mit dem Ausgangsstand
  // (Datei-Inhalt vor dem Speichern; leer bei neuer Datei).
  if (history.anchors.length === 0) {
    const baseText = previousText ?? '';
    history.anchors.push({
      ts: isoSeconds(nowMs),
      baseSeq: 0,
      text: baseText,
      hash: hashText(baseText),
    });
    openPacket = null;
    changed = true;
  } else if (previousText !== null && previousText !== undefined) {
    // Hash-Abgleich gegen den realen Datei-Stand vor dem Speichern.
    if (recordExternalIfNeeded(container, previousText, nowMs)) {
      openPacket = null; // Fremd-Stand beendet ein offenes Paket
      changed = true;
    }
  }

  // Coalescing nur in das Paket, das dieser In-Memory-Zustand selbst
  // angelegt hat (`seq`-Besitz) — nie in ein fremdes oder aelteres Paket.
  const canCoalesce =
    openPacket &&
    openPacket.seq === history.packets.length - 1 &&
    history.packets.length > 0 &&
    history.packets[history.packets.length - 1].trigger === 'edit' &&
    nowMs - openPacket.startedMs < maxPacketMs &&
    nowMs - openPacket.lastMs < inactivityMs;

  if (canCoalesce) {
    const ops = diffLines(openPacket.baseText, newText);
    const lastIdx = history.packets.length - 1;
    if (ops.length === 0) {
      // Innerhalb des Fensters auf den Basis-Stand zurueckgekehrt: das
      // Paket waere leer und entfaellt (samt eines dadurch verwaisten
      // Ankers); das Fenster ist damit geschlossen.
      history.packets.pop();
      while (
        history.anchors.length > 1 &&
        history.anchors[history.anchors.length - 1].baseSeq > history.packets.length
      ) {
        history.anchors.pop();
      }
      return { changed: true, openPacket: null };
    }
    const packet = history.packets[lastIdx];
    packet.ops = ops;
    packet.tsEnd = isoSeconds(nowMs);
    packet.hashAfter = hashText(newText);
    return { changed: true, openPacket: { ...openPacket, lastMs: nowMs } };
  }

  // Neues Paket gegen den Datei-Stand vor dem Speichern.
  const baseState = lastRecordedState(history);
  const baseText = baseState ? baseState.getText() : '';
  const ops = diffLines(baseText, newText);
  if (ops.length === 0) {
    // Inhalt unveraendert (z.B. Speichern ohne Aenderung): kein Paket.
    return { changed, openPacket: null };
  }
  const ts = isoSeconds(nowMs);
  maybeAddAnchor(history, baseText, nowMs);
  history.packets.push({ ts, tsEnd: ts, trigger: 'edit', ops, hashAfter: hashText(newText) });
  const seq = history.packets.length - 1;
  return {
    changed: true,
    openPacket: { baseText, seq, startedMs: nowMs, lastMs: nowMs },
  };
}

// --- 4T-0358 (Epic 3E-0066): Dokument-Notiz -----------------------------------

// Optionale `notes`-Sektion des Containers: EINE Markdown-fähige Notiz pro
// Dokument (PO-Entscheidung), v1 als { text, updated }. Bewusst getrennt von
// `history` und ohne eigene Historie — es zählt immer der aktuelle Stand.
// getNote/setNote sind tolerant: `parseContainer` validiert die Sektion nicht,
// eine fehlende oder defekte `notes`-Sektion setzt nur die Notiz aus, nie die
// Historie.

// Liefert die Notiz als { text, updated } oder null, wenn keine wohlgeformte
// Notiz vorliegt (fehlend, kein Objekt oder `text` kein String). `updated` ist
// null, falls der Zeitstempel fehlt oder kein String ist.
function getNote(container) {
  const notes = container && container.notes;
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return null;
  if (typeof notes.text !== 'string') return null;
  return { text: notes.text, updated: typeof notes.updated === 'string' ? notes.updated : null };
}

// Setzt die Notiz ersatzlos (keine Historie). Leerer oder reiner Whitespace-
// Text entfernt die Sektion; der gespeicherte Text bleibt sonst unveraendert
// (nur die Leer-Pruefung trimmt). `updated` ist UTC ISO-8601 sekundengenau
// (Zeitstempel-Konvention). Gibt den Container zurueck.
function setNote(container, text, nowMs) {
  const value = String(text ?? '');
  if (value.trim() === '') {
    delete container.notes;
  } else {
    container.notes = { text: value, updated: isoSeconds(nowMs) };
  }
  return container;
}

// --- 4T-0363 (Epic 3E-0067): Block-Metadaten ----------------------------------

// Optionale `blockData`-Sektion des Containers: strukturierte Metadaten pro
// Block-Anker (`^id`), analog zur Frontmatter-Ebene, aber pro Block. Schema
// (Konzept-Entscheidung 2, 4T-0362):
//   blockData: { <ankerId>: { values: { <schluessel>: wert }, updated } }
// `updated` je Anker in UTC ISO-8601 sekundengenau; keine Typ-Persistenz (Typen
// per Wert-Inferenz auf Renderer-Seite, wie bei den Frontmatter-Properties).
// Bewusst getrennt von `history`/`notes` und ohne eigene Historie — es zaehlt
// der aktuelle Stand. Fehler-Isolation nach dem `notes`-Muster: parseContainer
// validiert die Sektion nicht, eine fehlende oder defekte `blockData`-Sektion
// setzt nur die Block-Metadaten aus, nie die Historie. Die Anker-ID-Syntax
// pruefen die Aufrufer (main.js/Renderer ueber src/shared/block-anchors.js);
// dieses Modul bleibt bewusst path- und markdown-frei.

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Liefert den Eintrag eines Ankers als { values, updated } oder null, wenn kein
// wohlgeformter Eintrag vorliegt. `updated` ist null, falls der Zeitstempel
// fehlt oder kein String ist. Tolerant (Fehler-Isolation).
function getBlockData(container, anchorId) {
  const section = container && container.blockData;
  if (!isPlainObject(section)) return null;
  const entry = section[anchorId];
  if (!isPlainObject(entry) || !isPlainObject(entry.values)) return null;
  return {
    values: entry.values,
    updated: typeof entry.updated === 'string' ? entry.updated : null,
  };
}

// Liefert alle wohlgeformten Anker-Eintraege als { <id>: { values, updated } }.
// Defekte Einzel-Eintraege werden uebersprungen (nicht der ganze Container).
// Leeres Objekt bei fehlender oder defekter Sektion.
function getAllBlockData(container) {
  const section = container && container.blockData;
  const out = {};
  if (!isPlainObject(section)) return out;
  for (const id of Object.keys(section)) {
    const entry = section[id];
    if (!isPlainObject(entry) || !isPlainObject(entry.values)) continue;
    out[id] = {
      values: entry.values,
      updated: typeof entry.updated === 'string' ? entry.updated : null,
    };
  }
  return out;
}

// Anker-IDs, die derzeit Block-Metadaten tragen (nur wohlgeformte Eintraege).
function blockAnchorIdsWithData(container) {
  return Object.keys(getAllBlockData(container));
}

// Setzt die `values` eines Ankers ersatzlos (keine Historie) und aktualisiert
// `updated`. Ein leeres values-Objekt (keine Schluessel) entfernt den Anker-
// Eintrag; eine dadurch leer gewordene Sektion wird ganz entfernt (Muster
// `notes`). Ein leerer/kein Anker-Schluessel wird ignoriert. Gibt den Container
// zurueck.
function setBlockData(container, anchorId, values, nowMs) {
  if (typeof anchorId !== 'string' || anchorId.length === 0) return container;
  const clean = isPlainObject(values) ? values : {};
  if (Object.keys(clean).length === 0) {
    if (isPlainObject(container.blockData)) {
      delete container.blockData[anchorId];
      if (Object.keys(container.blockData).length === 0) delete container.blockData;
    }
    return container;
  }
  if (!isPlainObject(container.blockData)) container.blockData = {};
  container.blockData[anchorId] = { values: clean, updated: isoSeconds(nowMs) };
  return container;
}

// Benennt den Anker-Schluessel `fromId` auf `toId` um (verschiebt den Eintrag).
// Dient dem Umbenennen-Kommando und dem Zuordnen verwaister Daten (Konzept-
// Entscheidung 3). `updated` wird neu gesetzt (Schreibvorgang). Existiert kein
// wohlgeformter Eintrag unter `fromId` oder ist `toId` leer/gleich `fromId`,
// passiert nichts; ein bestehender `toId`-Eintrag wird ueberschrieben (das Panel
// bietet das Zuordnen nur zu Ankern ohne Daten an). Gibt den Container zurueck.
function renameBlockAnchor(container, fromId, toId, nowMs) {
  const section = container && container.blockData;
  if (!isPlainObject(section)) return container;
  if (typeof toId !== 'string' || toId.length === 0 || fromId === toId) return container;
  const entry = section[fromId];
  if (!isPlainObject(entry) || !isPlainObject(entry.values)) return container;
  delete section[fromId];
  section[toId] = { values: entry.values, updated: isoSeconds(nowMs) };
  return container;
}

module.exports = {
  MDD_SCHEMA_VERSION,
  MDDA_CACHE_SCHEMA_VERSION,
  ANCHOR_EVERY,
  hashText,
  isoSeconds,
  emptyContainer,
  parseContainer,
  serializeContainer,
  revisionCount,
  reconstructRevision,
  lastRecordedState,
  recordExternalIfNeeded,
  recordSave,
  // 4T-0358 (Epic 3E-0066): Dokument-Notiz.
  getNote,
  setNote,
  // 4T-0363 (Epic 3E-0067): Block-Metadaten.
  getBlockData,
  getAllBlockData,
  blockAnchorIdsWithData,
  setBlockData,
  renameBlockAnchor,
  MDDA_FILENAME,
  LEGACY_MDDB_FILENAME,
  emptySettingsContainer,
  parseSettingsContainer,
  resolveHistoryEnabled,
  // 4T-0348 (Epic 3E-0062): Bereichs-Index-Cache.
  MDDA_CACHE_FILENAME,
  emptyCacheContainer,
  parseCacheContainer,
  serializeCacheContainer,
};
