// 4T-000447 (Epic 3E-000083): Profil-Katalog — liest die Profil-Dateien des
// konfigurierten Profil-Ordners (flacher Scan, Profile liegen direkt im
// Ordner) und parst ihre Feld-Definitionen aus dem Frontmatter.
//
// Cache pro Profil-Datei mit mtime+size-Revalidierung bei jedem Zugriff:
// Änderungen an Profil-Dateien wirken ohne Neustart (Akzeptanzkriterium
// des Tasks), auch externe Edits ohne Watcher-Kopplung — der stat-Abgleich
// ist die strengere Form der im Task skizzierten Broadcast-Invalidierung
// (Muster des Warmstart-Abgleichs im Bereichs-Index-Cache). Nur veränderte
// Dateien werden erneut gelesen und geparst; verschwundene Dateien werden
// aus dem Cache geräumt.
//
// 4T-001157 (Epic 3E-000219, E12): **Der zweite Eingang.** Eine Werte-Notiz
// (`valuesFrom.note` einer Definition) ist eine zweite Datei, die dieser
// Abgleich bisher nicht sah. Sie bekommt keinen neuen Mechanismus, sondern
// denselben: dieselbe Cache-Map, derselbe mtime- und Größen-Vergleich, nur
// auf eine Datei mehr angewandt. Damit gilt die Zusage «wirkt ohne Neustart»
// für beide Datei-Arten aus einer Quelle — so in E12 ausdrücklich
// mitentschieden («Der Mechanismus existiert, er bekommt einen zweiten
// Eingang»).
//
// Electron-frei, Dateizugriff injiziert (Vorbild templates.js/entriesInRange):
// main.js bindet fs/promises, die Tests ein Fake-Dateisystem.
'use strict';

const path = require('node:path');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter');
const { parseProfileFields, parseProfileHeritage } = require('../../shared/property-profiles');
const { isInsideArea } = require('../area/area-path');
// 4T-001203 (Epic 3E-000121): Cache-Schluessel folgen der Dateisystem-Eigenschaft
// (kleingeschrieben nur, wo die Plattform die Schreibung nicht unterscheidet);
// auf Linux fielen sonst zwei verschiedene Pfade auf einen Eintrag zusammen.
const { pathCompareKey } = require('../../shared/platform.js');

// Eigener Cache pro Aufrufer (main.js hält einen prozessweiten; Tests je
// einen frischen). Map pathCompareKey(absPath) ->
// { mtimeMs, size, fields, errors, parent, exclude }.
function createProfileCatalogCache() {
  return new Map();
}

// 4T-001157 (Epic 3E-000219, E12): Werte-Notiz lesen — ein Wert je Zeile.
// Leerzeilen und Randleerraum entfallen, Doppelte zählen einmal; ein
// Metadaten-Block der Notiz gehört NICHT zum Vorrat (er beschreibt die
// Notiz, er ist kein Wert). Liefert null, wenn nichts Verwertbares
// übrigbleibt — der Aufrufer macht daraus den leeren Vorrat mit Hinweis.
function parseWerteNotiz(raw) {
  const ohneBom = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  // `body` ist der Inhalt ohne Metadaten-Block; ohne Block ist er der ganze
  // Text (die Funktion liefert ihn dann unverändert zurück).
  const { body } = extractFrontmatter(ohneBom);
  const werte = [];
  for (const zeile of String(body).split(/\r?\n/)) {
    const wert = zeile.trim();
    if (wert === '' || werte.includes(wert)) continue;
    werte.push(wert);
  }
  return werte.length > 0 ? werte : null;
}

// Alle Werte-Notiz-Pfade einer Definitions-Liste, rekursiv über die
// Kind-Definitionen: Eine Kind-Definition darf ihren Vorrat aus derselben
// Quelle beziehen wie eine oberste (dieselbe Fehler-Isolation, dieselbe
// Gestalt — sie ist eine Definition wie jede andere).
function sammleNotizPfade(fields, out) {
  for (const def of Array.isArray(fields) ? fields : []) {
    if (def && def.valuesFrom && def.valuesFrom.note) out.add(def.valuesFrom.note);
    if (def && Array.isArray(def.fields)) sammleNotizPfade(def.fields, out);
  }
  return out;
}

// Den gelesenen Vorrat in die Definitionen einsetzen, rekursiv. Gefüllt wird
// `values` — damit sehen Auflösung und beide Editoren einen Vorrat aus einer
// Notiz genau wie eine feste Werte-Liste, ohne dass ein Verbraucher etwas
// davon wissen muss. `valuesFrom` bleibt daneben stehen: Aus «Quelle gesetzt,
// aber values leer» liest die Oberfläche den Hinweis-Fall ab, und der
// Unterschied zur festen Liste geht nicht verloren.
function setzeNotizWerte(fields, vorraete) {
  return (Array.isArray(fields) ? fields : []).map((def) => {
    let neu = def;
    const pfad = def && def.valuesFrom ? def.valuesFrom.note : null;
    if (pfad && vorraete.has(pfad)) {
      const werte = vorraete.get(pfad);
      if (werte !== null) neu = { ...neu, values: werte };
    }
    if (neu.fields) neu = { ...neu, fields: setzeNotizWerte(neu.fields, vorraete) };
    return neu;
  });
}

// Werte-Notizen eines Profil-Satzes lesen, mit demselben mtime- und
// Größen-Abgleich wie die Profil-Dateien (der zweite Eingang). Liefert eine
// Map Pfad -> Werte-Liste oder null (Quelle fehlt, ist leer oder liegt
// außerhalb des Bereichs).
async function ladeWerteNotizen({ pfade, areaRoot, fsp, cache, alive }) {
  const vorraete = new Map();
  for (const rel of pfade) {
    const abs = path.resolve(areaRoot, rel);
    // Harte Bereichs-Grenze wie bei jedem anderen Datei-Zugriff: Eine
    // Profil-Datei darf nicht aus dem Bereich herausgreifen.
    if (!isInsideArea(areaRoot, abs)) {
      vorraete.set(rel, null);
      continue;
    }
    const cacheKey = pathCompareKey(abs);
    let stat;
    try {
      stat = await fsp.stat(abs);
    } catch {
      cache.delete(cacheKey);
      vorraete.set(rel, null); // fehlende Quelle: leerer Vorrat, kein Wurf
      continue;
    }
    alive.add(cacheKey);
    let eintrag = cache.get(cacheKey);
    if (!eintrag || eintrag.mtimeMs !== stat.mtimeMs || eintrag.size !== stat.size) {
      let raw;
      try {
        raw = await fsp.readFile(abs, 'utf8');
      } catch {
        cache.delete(cacheKey);
        alive.delete(cacheKey);
        vorraete.set(rel, null);
        continue;
      }
      eintrag = { mtimeMs: stat.mtimeMs, size: stat.size, werte: parseWerteNotiz(raw) };
      cache.set(cacheKey, eintrag);
    }
    vorraete.set(rel, eintrag.werte);
  }
  return vorraete;
}

// Katalog des Profil-Ordners: { missingFolder, profiles }. profiles sind
// alphabetisch sortierte Einträge { name, fileName, fields, errors,
// parent, exclude }; name = Datei-Titel (Dateiname ohne .md), die Identität
// der Zuordnung. parent/exclude sind die Vererbungs-Angaben der Profil-Ebene
// (4T-001142, `extends`/`exclude` im Metadaten-Block); die ordnerweiten
// Zyklus- und Fehlt-Hinweise berechnet der Verbraucher über
// attachHeritageHints, weil sie am Datei-Cache vorbei vom ganzen Ordner
// abhängen. Ein YAML-Fehler im Frontmatter einer Profil-Datei setzt nur
// dieses Profil auf null Definitionen (Hinweis-Code 'yaml'); unlesbare
// Einzel-Dateien entfallen still (Fehler-Isolation pro Datei).
async function loadProfileCatalog({ folderAbs, fsp, cache, areaRoot = null }) {
  let dirents;
  try {
    dirents = await fsp.readdir(folderAbs, { withFileTypes: true });
  } catch {
    return { missingFolder: true, profiles: [] };
  }
  const profiles = [];
  const alive = new Set();
  for (const entry of dirents) {
    if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue;
    const abs = path.join(folderAbs, entry.name);
    const cacheKey = pathCompareKey(abs);
    let stat;
    try {
      stat = await fsp.stat(abs);
    } catch {
      continue;
    }
    alive.add(cacheKey);
    let parsed = cache.get(cacheKey);
    if (!parsed || parsed.mtimeMs !== stat.mtimeMs || parsed.size !== stat.size) {
      let raw;
      try {
        raw = await fsp.readFile(abs, 'utf8');
      } catch {
        cache.delete(cacheKey);
        alive.delete(cacheKey);
        continue;
      }
      // BOM strippen wie file:read/templates:read (die Frontmatter-
      // Erkennung erwartet '---' ab Byte 0).
      const fm = extractFrontmatter(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
      const { fields, errors } = parseProfileFields(fm.data);
      const heritage = parseProfileHeritage(fm.data);
      errors.push(...heritage.errors);
      if (fm.parseError) {
        // 4T-001143: dieselbe Hinweis-Gestalt wie die Parser-Hinweise.
        errors.unshift({ code: 'yaml', index: -1, name: null, key: null, expected: null });
      }
      parsed = {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        fields,
        errors,
        parent: heritage.parent,
        exclude: heritage.exclude,
        // 4T-001161 (Epic 3E-000219, E5): Symbol des Profils.
        icon: heritage.icon,
      };
      cache.set(cacheKey, parsed);
    }
    profiles.push({
      name: entry.name.replace(/\.md$/i, ''),
      fileName: entry.name,
      fields: parsed.fields,
      errors: parsed.errors,
      parent: parsed.parent,
      exclude: parsed.exclude,
      icon: parsed.icon,
    });
  }
  // 4T-001157 (E12): der zweite Eingang — Werte-Notizen der Definitionen mit
  // demselben Abgleich lesen und ihren Vorrat einsetzen. Läuft nach dem
  // Profil-Durchlauf, weil erst dann feststeht, welche Notizen überhaupt
  // gebraucht werden; ohne `valuesFrom.note` kostet der Schritt keinen
  // einzigen Datei-Zugriff.
  if (areaRoot) {
    const pfade = new Set();
    for (const profil of profiles) sammleNotizPfade(profil.fields, pfade);
    if (pfade.size > 0) {
      const vorraete = await ladeWerteNotizen({ pfade, areaRoot, fsp, cache, alive });
      for (const profil of profiles) {
        profil.fields = setzeNotizWerte(profil.fields, vorraete);
      }
    }
  }

  // Cache-Einträge verschwundener Dateien räumen (nur die dieses Ordners —
  // der Cache wird prozessweit über Bereiche hinweg geteilt). Werte-Notizen
  // liegen außerhalb des Profil-Ordners und fallen deshalb nicht unter den
  // Präfix; sie werden geräumt, sobald ihre Datei verschwindet (oben).
  const prefix = pathCompareKey(folderAbs) + path.sep;
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix) && !alive.has(key)) cache.delete(key);
  }
  profiles.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
  return { missingFolder: false, profiles };
}

module.exports = { createProfileCatalogCache, loadProfileCatalog };
