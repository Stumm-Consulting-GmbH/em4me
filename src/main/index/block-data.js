// 4T-000977 (Epic 3E-000196): Block-Daten der .mdd-Begleitdatei, herausgelöst
// aus src/main/backlinks.js (dort Abschnitt 4T-000408). Reine Leser ohne
// Index-Zustand; die Eintrags-Pflege übernehmen build.js (Aufbau- und
// Watcher-Pfad) und lifecycle.js (updateBlockDataForFile).
//
// --- 4T-000408 (Epic 3E-000077): Block-Daten aus der .mdd-Begleitdatei ------------
// Datengrundlage der Block-Abfrage: die blockData-Sektion der .mdd wird beim
// Index-Aufbau pro Markdown-Datei mitgelesen (die .mdd liegt ausserhalb des
// Markdown-Watchers; Aenderungen ueber das Panel invalidieren per
// updateBlockDataForFile in lifecycle.js). Bewusst NICHT in Area_Cache.mdda
// persistiert: der komplette Zusatz-Pass kostet auch im pessimistischen
// Szenario (2000 Dateien, 300 .mdd a 100 KB) nur ~0,36 s einmalig pro
// Index-Aufbau (Messung 4T-000408); eine Cache-Aufnahme braeuchte dagegen
// eigene .mdd-mtime-Verfolgung plus Schema-Bump. Fehler-Isolation: eine
// defekte .mdd setzt nur die Block-Ebene dieser Datei aus (null), nie den
// uebrigen Index.

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { parseContainer, getAllBlockData } = require('../documents/mdd-store.js');

// Begleitdatei zum Dokument: gleicher Basisname, Endung .mdd (dieselbe
// Konvention wie mddPathFor in main.js; mdd-store bleibt bewusst path-frei).
function mddCompanionPath(mdPath) {
  const parsed = path.parse(mdPath);
  return path.join(parsed.dir, `${parsed.name}.mdd`);
}

// Normalisiert die rohe Anker-Map (Form von getAllBlockData) zur Index-Form:
// Array [{ anchor, values, updatedMs }], alphabetisch nach Anker (determinis-
// tische Basis-Ordnung der Treffer). Schluessel lowercase wie die Frontmatter-
// Properties (extractProperties); Werte typ-erhaltend (string/number/boolean,
// String-Listen), leere Strings und leere Listen entfallen wie dort.
function normalizeBlockEntries(rawMap) {
  const out = [];
  if (!rawMap || typeof rawMap !== 'object') return out;
  for (const id of Object.keys(rawMap)) {
    const entry = rawMap[id];
    if (!entry || typeof entry.values !== 'object' || entry.values === null) continue;
    const values = {};
    for (const key of Object.keys(entry.values)) {
      const v = entry.values[key];
      if (typeof v === 'string') {
        const t = v.trim();
        if (t) values[key.toLowerCase()] = t;
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        values[key.toLowerCase()] = v;
      } else if (Array.isArray(v)) {
        const arr = v
          .filter((x) => typeof x === 'string')
          .map((x) => x.trim())
          .filter(Boolean);
        if (arr.length) values[key.toLowerCase()] = arr;
      }
    }
    // updated ist UTC ISO-8601 mit 'Z' (Zeitstempel-Konvention) — Date.parse
    // statt parseIsoLocalMs, damit die Zone korrekt eingeht.
    const updatedMs = typeof entry.updated === 'string' ? Date.parse(entry.updated) : NaN;
    out.push({ anchor: id, values, updatedMs: Number.isFinite(updatedMs) ? updatedMs : null });
  }
  out.sort((a, b) => a.anchor.localeCompare(b.anchor));
  return out;
}

// Extrahiert die Block-Eintraege aus dem rohen .mdd-Inhalt. Die Substring-
// Vorpruefung erspart den JSON.parse grosser History-Container ohne blockData-
// Sektion (der haeufigste .mdd-Fall). null = keine Block-Daten (fehlende oder
// defekte Sektion/Datei).
function extractBlockEntries(raw) {
  if (typeof raw !== 'string' || !raw.includes('"blockData"')) return null;
  const parsed = parseContainer(raw);
  if (!parsed.ok) return null;
  const entries = normalizeBlockEntries(getAllBlockData(parsed.container));
  return entries.length > 0 ? entries : null;
}

// Async-Variante fuer den Initial-Aufbau (kein Sync-IO im Main-Loop).
async function readBlockDataAsync(mdPath) {
  let raw;
  try {
    raw = await fs.promises.readFile(mddCompanionPath(mdPath), 'utf8');
  } catch {
    return null; // keine .mdd (ENOENT) oder nicht lesbar
  }
  return extractBlockEntries(raw);
}

// Sync-Variante fuer den Watcher-Pfad (parseFile dort ist ebenfalls sync).
function readBlockDataSync(mdPath) {
  let raw;
  try {
    raw = fs.readFileSync(mddCompanionPath(mdPath), 'utf8');
  } catch {
    return null;
  }
  return extractBlockEntries(raw);
}

module.exports = {
  normalizeBlockEntries,
  extractBlockEntries,
  readBlockDataAsync,
  readBlockDataSync,
};
