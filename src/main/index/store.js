// 4T-0977 (Epic 3E-0196): zentraler Zustand des Backlinks-Index-Subsystems,
// herausgelöst aus src/main/backlinks.js. Dieses Modul hält die beiden
// Zustands-Maps (Index-Einträge je Wurzel, Puffer-Overlays je Datei) sowie
// die aus main.js injizierten Funktionen (Broadcast, Selbst-Schreib-
// Markierung). Beschreibbarer Modul-Zustand verlässt das Modul nie als
// beschreibbares Export-Binding (Entwicklungsrichtlinien §1): Die injizierten
// Funktionen sind nur über die Zugriffs-Funktionen broadcast/selfWrite
// erreichbar, die Maps sind konstante Bindings mit veränderlichem Inhalt.
// Dazu die Wurzel-Bestimmung (resolveRootInfo), weil sie von fast allen
// Untermodulen gebraucht wird und selbst zustandsfrei ist.

'use strict';

const path = require('node:path');
// 4T-0347 (Epic 3E-0062): isInsideArea ist die kanonische, reine Innerhalb-
// Pruefung des Bereichs-Konzepts (case-insensitiv, ..-sicher). Bereichs-
// Applikationen indexieren den gesamten Bereichs-Baum als eine Wurzel; die
// Grenze ist dieselbe wie fuer alle uebrigen Bereichs-Pfade der App.
const { isInsideArea } = require('../area/area-path.js');

// State pro Wurzel.
// indexes: Map<wurzel(absolut), Eintrag>
// Eintrag = {
//   wurzel, status: 'indexing'|'ready'|'oversized',
//   files: Map<absoluterPfad, Array<{zeile, linkTyp, ziel(absolut)|null, ankerTeilTyp, anker, snippet}>>,
//   fileCount, byteSize,
//   watcher, refCount, softTimer,
//   invalidateTimer
// }
const indexes = new Map();

// Puffer-Overlay-Schicht (4T-0935, Befund B-08): je Datei-Pfad optional der
// Parse plus Roh-Text des geschriebenen Stands. Die Schicht selbst (Setzen,
// Löschen, Sichten) liegt in overlay.js; hier wohnt nur die Map.
const bufferOverlays = new Map(); // absPath -> { parsed, text }

let broadcastFn = null;

// Registriert den Broadcast-Mechanismus aus main.js. broadcastFn(channel, payload)
// sendet an alle BrowserWindows.
function attachBroadcast(fn) {
  broadcastFn = fn;
}

// Zugriffs-Funktion: sendet über den registrierten Mechanismus und schweigt,
// solange keiner verdrahtet ist (z. B. Unit-Test) — dieselbe Wirkung wie das
// frühere `if (broadcastFn) broadcastFn(…)` an jeder Aufruf-Stelle.
function broadcast(channel, payload) {
  if (broadcastFn) broadcastFn(channel, payload);
}

// 4T-0348 (Epic 3E-0062): markSelfWriting aus main.js, damit das Schreiben der
// Cache-Datei nicht als Fremd-Aenderung zaehlt (Konsistenz zum Area_Settings.mdda-
// Schreibpfad; die Cache-Datei selbst ist nie ein Tab). null = kein Writer
// verdrahtet (z.B. Unit-Test) -> Schreiben laeuft ohne Selbst-Markierung.
let selfWriterFn = null;
function attachSelfWriter(fn) {
  selfWriterFn = fn;
}

// Zugriffs-Funktion analog zu broadcast: markiert den eigenen Schreibvorgang,
// wenn ein Writer verdrahtet ist, sonst wirkungslos.
function selfWrite(zielPfad, inhalt) {
  if (selfWriterFn) selfWriterFn(zielPfad, inhalt);
}

const INVALIDATE_DEBOUNCE_MS = 200;

// Debouncete Invalidierungs-Meldung eines Eintrags an alle Fenster. Liegt
// beim Zustand, weil sowohl der Aufbau-/Watcher-Pfad (build.js) als auch die
// Block-Daten-Invalidierung (lifecycle.js) sie brauchen und sie außer dem
// Broadcast nichts kennt.
function scheduleInvalidate(entry) {
  if (entry.invalidateTimer) return;
  entry.invalidateTimer = setTimeout(() => {
    entry.invalidateTimer = null;
    broadcast('backlinks:invalidated', { wurzel: entry.wurzel });
  }, INVALIDATE_DEBOUNCE_MS);
}

// Liefert die Wurzel zur aktiven Datei.
function rootFor(filePath) {
  if (!filePath) return null;
  try {
    return path.dirname(path.resolve(filePath));
  } catch {
    return null;
  }
}

// 4T-0347 (Epic 3E-0062): Index-Wurzel bereichsbewusst bestimmen. Fuer Dateien
// innerhalb einer Bereichs-Applikation ist die Wurzel der Bereichs-Wurzelordner
// (voller Bereichs-Baum, keine Tiefen-Grenze, keine Caps); ohne Bereich bleibt
// es bei rootFor (Ordner der Datei plus SCAN_DEPTH, mit Caps). areaRoot liefert
// der IPC-Handler aus der App-Registry (areaOfWindow); null/leere Werte fallen
// auf das bisherige Ordner-Verhalten zurueck. isArea steuert Tiefe und Cap-
// Verhalten des Index-Eintrags.
function resolveRootInfo(filePath, areaRoot) {
  if (areaRoot && filePath && isInsideArea(areaRoot, filePath)) {
    return { root: path.resolve(areaRoot), isArea: true };
  }
  return { root: rootFor(filePath), isArea: false };
}

// Liefert den aktuellen Wurzel-Pfad fuer eine Datei (fuer Refcount-Release).
function rootForActiveFile(filePath, areaRoot) {
  // 4T-0347 (Epic 3E-0062): dieselbe bereichsbewusste Wurzel wie backlinksFor,
  // damit backlinks:release exakt den Owner freigibt, den backlinks:request
  // registriert hat (sonst Owner-Leak in Bereichs-Apps).
  return resolveRootInfo(filePath, areaRoot).root;
}

module.exports = {
  indexes,
  bufferOverlays,
  attachBroadcast,
  broadcast,
  attachSelfWriter,
  selfWrite,
  scheduleInvalidate,
  resolveRootInfo,
  rootForActiveFile,
};
