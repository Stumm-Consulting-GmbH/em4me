// 4T-0977 (Epic 3E-0196): Puffer-Overlay-Schicht des Index, herausgelöst aus
// src/main/backlinks.js (die Map selbst wohnt in store.js).
//
// --- Puffer-Overlay (4T-0935, Befund B-08) ---------------------------------------
// Zweite, ausdrueckliche Schicht ueber dem Index: je Datei-Pfad optional der
// Parse des GESCHRIEBENEN Stands aus dem Editor-Puffer. Die Platten-Schicht
// bleibt unangetastet daneben liegen; der Datei-Beobachter bleibt damit Herr
// ueber sie, und ein Overlay verschwindet erst mit Speichern, Verwerfen oder
// Schliessen.
//
// Die Schicht wirkt NICHT von selbst. Nur wer sie ausdruecklich anfordert,
// sieht sie — freigeschaltet sind in 4T-0935 die drei Verbraucher der
// gerenderten Ansicht (frontmatterQueryFor, scriptDataFor, eventsForQuery).
// Die uebrigen neun Index-Verbraucher (Backlinks, Tags, Graph, Autocomplete,
// Ziel-Aufloesung samt Linter, Embeds) sehen weiter den Platten-Stand; ob sie
// folgen sollen, erhebt 4T-0936 und entscheidet der Product Owner.
//
// Sie liegt bewusst im Hauptprozess und gilt damit fensteruebergreifend: Der
// gemeldete Fall hatte dieselbe Datei in zwei Fenstern offen. Melden zwei
// Fenster verschiedene Staende derselben Datei, gilt der zuletzt gemeldete —
// dieselbe Regel, die beim Speichern ohnehin greift.
// 4T-0948 (Befund E-01): Der Eintrag fuehrt neben dem Parse den ROH-TEXT, weil
// die Wiki-Einbettung ihren Anker am Text schneidet (extractEmbedSnippet). Die
// uebrigen Verbraucher sehen davon nichts: overlaysUnder reicht wie bisher
// allein den Parse weiter.

'use strict';

const { isInsideArea } = require('../area/area-path.js');
const { bufferOverlays } = require('./store.js');
const { parseContent } = require('./parse.js');

function setBufferOverlay(filePath, content) {
  if (typeof filePath !== 'string' || !filePath) return false;
  if (typeof content !== 'string') return false;
  bufferOverlays.set(filePath, { parsed: parseContent(filePath, content), text: content });
  return true;
}

function clearBufferOverlay(filePath) {
  return bufferOverlays.delete(filePath);
}

function clearAllBufferOverlays() {
  bufferOverlays.clear();
}

// Overlays unterhalb einer Wurzel. Leere Map = nichts zu ueberlagern; die
// Aufrufer geben dann den Original-Eintrag weiter und zahlen nichts.
function overlaysUnder(root) {
  if (bufferOverlays.size === 0) return null;
  const treffer = new Map();
  for (const [absPath, eintrag] of bufferOverlays) {
    if (isInsideArea(root, absPath)) treffer.set(absPath, eintrag.parsed);
  }
  return treffer.size > 0 ? treffer : null;
}

// 4T-0948 (Befund E-01): Roh-Text-Auskunft fuer Verbraucher, die den
// geschriebenen Stand als Text brauchen (Wiki-Einbettung). Ohne Bereichs-
// Filter, weil der Aufrufer den Ziel-Pfad bereits geprueft hat. Der zweite
// Anlauf ohne Ruecksicht auf Gross- und Kleinschreibung gilt nur unter
// Windows und faengt '![[quelle]]' gegen 'Quelle.md'; wo das Dateisystem die
// Schreibweise unterscheidet, waeren das zwei Dateien.
function bufferTextFor(absPath) {
  if (typeof absPath !== 'string' || !absPath) return null;
  const genau = bufferOverlays.get(absPath);
  if (genau) return genau.text;
  if (process.platform !== 'win32') return null;
  const gesucht = absPath.toLowerCase();
  for (const [pfad, e] of bufferOverlays) if (pfad.toLowerCase() === gesucht) return e.text;
  return null;
}

// Map-artige Sicht: Werte des Patches gewinnen, Schluessel beider Seiten sind
// sichtbar. Bewusst kein Kopieren der Basis-Map — die Auswertungen laufen bei
// jedem Tastendruck (debounced) und ein Bereich kann tausende Dateien fuehren.
function overlayView(base, patch) {
  return {
    get: (k) => (patch.has(k) ? patch.get(k) : base.get(k)),
    has: (k) => patch.has(k) || base.has(k),
    get size() {
      let n = base.size;
      for (const k of patch.keys()) if (!base.has(k)) n++;
      return n;
    },
    *keys() {
      for (const k of base.keys()) yield k;
      for (const k of patch.keys()) if (!base.has(k)) yield k;
    },
    *[Symbol.iterator]() {
      for (const k of base.keys()) yield [k, patch.has(k) ? patch.get(k) : base.get(k)];
      for (const [k, v] of patch) if (!base.has(k)) yield [k, v];
    },
  };
}

// Eintrags-Sicht mit ueberlagerten Datei-Daten. Ueberlagert werden die
// Bestaende, die aus dem Datei-Text stammen; Datei-Groesse und Zeitstempel
// bleiben die der Platte, weil ein ungespeicherter Puffer keine hat (eine
// Abfrage ueber file.mtimeMs sieht also weiter den Speicher-Zeitpunkt).
// Ebenso bleibt der Link-Graph der der Platte: Er wird ueber alle Dateien
// gebaut und gecacht; ein FROM-Link-Bezug auf einen erst geschriebenen Link
// wirkt deshalb erst nach dem Speichern.
function entryWithOverlay(entry, overlays) {
  if (!overlays || overlays.size === 0) return entry;
  const patchOf = (feld, wandeln) => {
    const m = new Map();
    for (const [absPath, parsed] of overlays) m.set(absPath, wandeln(parsed));
    return overlayView(entry[feld], m);
  };
  return {
    ...entry,
    files: patchOf('files', (p) => p.hits),
    propertiesPerFile: patchOf('propertiesPerFile', (p) => p.properties || {}),
    tasksPerFile: patchOf('tasksPerFile', (p) => (Array.isArray(p.tasks) ? p.tasks : [])),
    tagsPerFile: patchOf('tagsPerFile', (p) => p.tags || []),
    aliasesPerFile: patchOf('aliasesPerFile', (p) => p.aliases || []),
    anchorsPerFile: patchOf('anchorsPerFile', (p) => ({
      headings: new Set(p.headings || []),
      blockIds: new Set(p.blockIds || []),
    })),
  };
}

module.exports = {
  setBufferOverlay,
  clearBufferOverlay,
  clearAllBufferOverlays,
  overlaysUnder,
  bufferTextFor,
  entryWithOverlay,
};
