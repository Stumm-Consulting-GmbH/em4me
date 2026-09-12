// 4T-001598 (Epic 3E-000191, Story 4S-000906): Listen-Logik der eingetragenen
// Gefaesse (My Extended Memory).
//
// Electron-frei und rein (unit-testbar): kein Datei-Zugriff, kein Store, keine
// Uhr ausser der einen Zeitstempel-Funktion. Der Modul-Schnitt folgt
// src/main/area/area-path.js — die Persistenz liegt im Store, die Erkennung
// einer Gefaess-Art in memory-detect.js, hier steht allein, wie die Liste
// aussieht und wie sie sich aendert.
//
// Der Schluessel eines Eintrags entscheidet ueber die Dedup: fuer Ordner die
// normalisierte Pfad-Form aus area-path.js (dieselbe, nach der die
// recent-Listen deduplizieren — keine zweite Wahrheit ueber Pfad-Gleichheit),
// fuer Arbeitsbereiche ihre Kennung mit Praefix. Beide Raeume koennen sich
// deshalb nicht ueberschneiden.
'use strict';

const path = require('node:path');
const { normalizeForCompare, areaFromRootPath } = require('../area/area-path');

// Die vier Gefaess-Arten in ihrer Anzeige-Reihenfolge (Vertrag von
// memory:getViewData): erst der Arbeitsbereich als Klammer, dann die Gefaesse
// von gross nach klein.
const MEMORY_KINDS = ['workspace', 'area', 'book', 'shelf'];
const KIND_SET = new Set(MEMORY_KINDS);

// Zeitstempel des Eintragens: UTC nach ISO 8601, sekundengenau (Konvention des
// Projekts fuer persistierte Zeitangaben, Muster standJetzt in area-stats.js).
// Die lokale Darstellung macht die Seite.
function standJetzt() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Schluessel eines Ordner-Gefaesses (Bereich, Buch, Regal). null bei einem
// Wert, der kein Pfad ist.
function memoryKeyForPath(p) {
  return normalizeForCompare(p);
}

// Schluessel eines Arbeitsbereichs. Das Praefix haelt den Kennungs-Raum vom
// Pfad-Raum getrennt.
function memoryKeyForWorkspace(id) {
  return typeof id === 'string' && id !== '' ? `workspace:${id}` : null;
}

function textOrNull(wert) {
  return typeof wert === 'string' && wert.trim() !== '' ? wert.trim() : null;
}

// Defensive Normalisierung eines gespeicherten Eintrags. Ein Eintrag ohne
// gueltige Art oder ohne Schluessel faellt heraus; alles Uebrige wird auf die
// Vertrags-Form gebracht. Es findet KEIN Datei-Zugriff statt: ein Eintrag,
// dessen Pfad gerade nicht erreichbar ist, bleibt unveraendert stehen (AK7).
function normalizeMemoryEntry(saved) {
  if (!saved || typeof saved !== 'object') return null;
  const kind = KIND_SET.has(saved.kind) ? saved.kind : null;
  const key = textOrNull(saved.key);
  if (kind === null || key === null) return null;
  const pfad = textOrNull(saved.path);
  const workspaceId = textOrNull(saved.workspaceId);
  if (kind === 'workspace' && workspaceId === null) return null;
  if (kind !== 'workspace' && pfad === null) return null;
  const name = textOrNull(saved.name) || (pfad !== null ? path.basename(pfad) : key);
  return {
    kind,
    key,
    path: kind === 'workspace' ? null : path.resolve(pfad),
    workspaceId: kind === 'workspace' ? workspaceId : null,
    name,
    addedAt: textOrNull(saved.addedAt),
  };
}

// Die gespeicherte Liste als normalisierter Bestand; doppelte Schluessel
// verlieren (erster Eintrag gewinnt, Muster normalizeSavedWorkspaces).
function normalizeMemoryEntries(saved) {
  if (!Array.isArray(saved)) return [];
  const out = [];
  const gesehen = new Set();
  for (const eintrag of saved) {
    const normalisiert = normalizeMemoryEntry(eintrag);
    if (normalisiert === null || gesehen.has(normalisiert.key)) continue;
    gesehen.add(normalisiert.key);
    out.push(normalisiert);
  }
  return out;
}

// Traegt ein Gefaess ein. Ergebnis:
//   { ok: true, entries, entry }
//   { ok: false, error: 'invalid' }    kein verwertbarer Eintrag
//   { ok: false, error: 'duplicate' }  dasselbe Gefaess steht schon in der Liste
// Die Dedup laeuft ueber den Schluessel und damit ueber die normalisierte
// Pfad-Form: derselbe Ordner in anderer Schreibweise erzeugt keinen zweiten
// Eintrag (AK3).
function addMemoryEntry(list, entry) {
  const bestand = normalizeMemoryEntries(list);
  const neu = normalizeMemoryEntry(entry);
  if (neu === null) return { ok: false, error: 'invalid' };
  if (bestand.some((e) => e.key === neu.key)) return { ok: false, error: 'duplicate' };
  const eingetragen = { ...neu, addedAt: neu.addedAt || standJetzt() };
  return { ok: true, entries: [...bestand, eingetragen], entry: eingetragen };
}

// Entfernt den Eintrag mit diesem Schluessel. `removed` sagt, ob ueberhaupt
// etwas entfernt wurde; das Gefaess selbst bleibt unberuehrt.
function removeMemoryEntry(list, key) {
  const bestand = normalizeMemoryEntries(list);
  const schluessel = textOrNull(key);
  const entries = schluessel === null ? bestand : bestand.filter((e) => e.key !== schluessel);
  return { ok: true, entries, removed: entries.length !== bestand.length };
}

// Anzeige-Reihenfolge des Vertrags: nach Art in der Reihenfolge von
// MEMORY_KINDS, innerhalb nach Name. localeCompare ohne feste Locale, weil der
// Hauptprozess die Sprache der Anzeige nicht kennt; die Seite sortiert nicht
// nach.
function sortMemoryEntries(list) {
  return [...list].sort((a, b) => {
    const art = MEMORY_KINDS.indexOf(a.kind) - MEMORY_KINDS.indexOf(b.kind);
    if (art !== 0) return art;
    return String(a.name).localeCompare(String(b.name));
  });
}

function vorschlagAusPfaden(liste, eingetragen) {
  const out = [];
  const gesehen = new Set();
  for (const p of Array.isArray(liste) ? liste : []) {
    const key = memoryKeyForPath(p);
    if (key === null || eingetragen.has(key) || gesehen.has(key)) continue;
    gesehen.add(key);
    const area = areaFromRootPath(p);
    out.push({ key, path: area.rootPath, name: area.name });
  }
  return out;
}

// Vorschlag beim Eintragen (AK5): die drei Verlaufs-Listen und die vorhandenen
// Arbeitsbereiche, ohne was bereits eingetragen ist. Die Verlaeufe sind
// Bequemlichkeit und keine Quelle — ihre Kappung auf zehn Eintraege begrenzt
// deshalb den Vorschlag, nicht die Liste.
function buildSuggestions({ recentAreas, recentBooks, recentShelves, workspaces, entries } = {}) {
  const eingetragen = new Set(normalizeMemoryEntries(entries).map((e) => e.key));
  const arbeitsbereiche = [];
  for (const ws of Array.isArray(workspaces) ? workspaces : []) {
    if (!ws || typeof ws !== 'object') continue;
    const key = memoryKeyForWorkspace(ws.id);
    if (key === null || eingetragen.has(key)) continue;
    eingetragen.add(key);
    arbeitsbereiche.push({ key, workspaceId: ws.id, name: textOrNull(ws.name) || ws.id });
  }
  return {
    workspaces: arbeitsbereiche,
    areas: vorschlagAusPfaden(recentAreas, eingetragen),
    books: vorschlagAusPfaden(recentBooks, eingetragen),
    shelves: vorschlagAusPfaden(recentShelves, eingetragen),
  };
}

module.exports = {
  MEMORY_KINDS,
  standJetzt,
  memoryKeyForPath,
  memoryKeyForWorkspace,
  normalizeMemoryEntries,
  addMemoryEntry,
  removeMemoryEntry,
  sortMemoryEntries,
  buildSuggestions,
};
