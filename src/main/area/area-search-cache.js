// 4T-1293 (Epic 3E-0224): Volltext-Cache der Bereichs-Suche.
//
// Herausgeschnitten aus area-search.js, weil deren Datei-Budget erreicht war
// und die Suche um die Zusammenführung geteilter Dokumente wachsen musste. Der
// Schnitt folgt der Fachlichkeit statt der Zeilenzahl: Wo der Cache liegt, in
// welchem Format er steht und wie er gelesen und geschrieben wird, gehört
// zusammen und ist von der Suche selbst unabhängig — jene fragt ihn nur nach
// dem Stand einer Datei.
//
// Format und Ablage sind unverändert übernommen (Architektur, Kapitel «Suche»):
// unkomprimiertes JSON unter <userData>/bereichs-suche/<hash>.json, je
// Bereichs-Wurzel eine Datei. Ein Fehlschlag ist nie fatal — der Cache ist ein
// Beschleuniger, und ohne ihn liest die Suche eben von der Platte.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CACHE_SCHEMA_VERSION = 1;

let cacheVerzeichnis = null;

// Wird vom Hauptprozess beim Start gesetzt; der Unit-Test setzt sein eigenes
// Verzeichnis. Ohne Konfiguration läuft die Suche ohne Persistenz weiter
// (Naht statt harter Electron-Abhängigkeit, Muster deps in area-stats.js).
function konfiguriereCache(optionen) {
  cacheVerzeichnis =
    optionen && typeof optionen.cacheVerzeichnis === 'string' ? optionen.cacheVerzeichnis : null;
}

function cachePfad(wurzel) {
  if (!cacheVerzeichnis) return null;
  const kennung = crypto
    .createHash('sha1')
    .update(path.resolve(wurzel).toLowerCase())
    .digest('hex')
    .slice(0, 16);
  return path.join(cacheVerzeichnis, `${kennung}.json`);
}

async function ladeCache(wurzel) {
  const pfad = cachePfad(wurzel);
  if (!pfad) return new Map();
  let roh;
  try {
    roh = await fs.promises.readFile(pfad, 'utf8');
  } catch {
    return new Map();
  }
  let container;
  try {
    container = JSON.parse(roh);
  } catch {
    return new Map();
  }
  if (!container || container.v !== CACHE_SCHEMA_VERSION || !Array.isArray(container.dateien)) {
    return new Map();
  }
  const map = new Map();
  for (const d of container.dateien) {
    if (!d || typeof d.rel !== 'string' || typeof d.text !== 'string') continue;
    map.set(d.rel, {
      text: d.text,
      mtimeMs: typeof d.mtimeMs === 'number' ? d.mtimeMs : 0,
      size: typeof d.size === 'number' ? d.size : 0,
    });
  }
  return map;
}

async function schreibeCache(wurzel, dateien) {
  const pfad = cachePfad(wurzel);
  if (!pfad) return;
  const container = {
    v: CACHE_SCHEMA_VERSION,
    wurzel: path.resolve(wurzel),
    dateien: [],
  };
  for (const [rel, eintrag] of dateien) {
    container.dateien.push({
      rel,
      mtimeMs: eintrag.mtimeMs,
      size: eintrag.size,
      text: eintrag.text,
    });
  }
  try {
    await fs.promises.mkdir(path.dirname(pfad), { recursive: true });
    await fs.promises.writeFile(pfad, JSON.stringify(container), 'utf8');
  } catch (err) {
    console.warn('Bereichs-Suche: Cache schreiben fehlgeschlagen:', pfad, err && err.message);
  }
}

module.exports = {
  CACHE_SCHEMA_VERSION,
  konfiguriereCache,
  cachePfad,
  ladeCache,
  schreibeCache,
};
