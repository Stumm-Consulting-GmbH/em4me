// 4T-001293 (Epic 3E-000224): Volltext-Cache der Bereichs-Suche.
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
const { ersetzeDateiOderWirf } = require('../documents/atomic-write');
const path = require('node:path');
const crypto = require('node:crypto');

// 4T-001609 (Epic 3E-000252): 1 -> 2. Seit dem Suchraum-Schnitt haelt der Cache
// TABELLEN-Dateien ohne den Inhalt ihres Datensatz-Blocks. Ein Cache aus der
// Zeit davor traegt die vollen Texte und wuerde beim Abgleich ueber
// Aenderungszeit und Groesse unveraendert weiterverwendet; die Erhoehung
// verwirft ihn, statt den eingesparten Speicher stillschweigend zurueckzugeben.
// 4T-001671 hebt die Version von 2 auf 3: Der Eintrag traegt seither die
// Ruecknahme-Karte. Ein Cache der Vorversion gilt damit als versionsfremd und
// wird einmalig neu aufgebaut — genau das, wofuer die Versions-Zahl da ist.
const CACHE_SCHEMA_VERSION = 3;

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
      // 4T-001609: Wurde der Datensatz-Block dieser Datei geleert? Daran haengt,
      // ob ein Offset im Suchtext zurueckzurechnen ist.
      bereinigt: d.bereinigt === true,
      // 4T-001671: die Ruecknahme-Karte dieser Bereinigung.
      karte: Array.isArray(d.karte) ? d.karte : null,
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
      ...(eintrag.bereinigt ? { bereinigt: true } : {}),
      ...(eintrag.karte && eintrag.karte.length > 0 ? { karte: eintrag.karte } : {}),
    });
  }
  try {
    await fs.promises.mkdir(path.dirname(pfad), { recursive: true });
    await ersetzeDateiOderWirf(pfad, JSON.stringify(container));
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
