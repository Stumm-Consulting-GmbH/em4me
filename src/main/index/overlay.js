// 4T-000977 (Epic 3E-000196): Puffer-Overlay-Schicht des Index, herausgelöst aus
// src/main/backlinks.js (die Map selbst wohnt in store.js).
//
// --- Puffer-Overlay (4T-000935, Befund B-08) ---------------------------------------
// Zweite, ausdrueckliche Schicht ueber dem Index: je Datei-Pfad optional der
// Parse des GESCHRIEBENEN Stands aus dem Editor-Puffer. Die Platten-Schicht
// bleibt unangetastet daneben liegen; der Datei-Beobachter bleibt damit Herr
// ueber sie, und ein Overlay verschwindet erst mit Speichern, Verwerfen oder
// Schliessen.
//
// Die Schicht wirkt NICHT von selbst. Nur wer sie ausdruecklich anfordert,
// sieht sie — freigeschaltet sind in 4T-000935 die drei Verbraucher der
// gerenderten Ansicht (frontmatterQueryFor, scriptDataFor, eventsForQuery),
// in 4T-000950 und 4T-000951 das Tag-Panel und der Erinnerungs-Pruefer.
// 4T-000952 (Epic 3E-000198, Befunde E-04, E-05 und E-08) nimmt die vier
// uebrigen Index-Verbraucher dazu, die der Product Owner nach dem
// Hauptrelease 1 verortet hat: Rueckverweise (backlinksFor), Graphenansicht
// (graphFor) sowie die Vervollstaendigung von Ankern und Tags. Am
// Platten-Stand bleiben damit noch die Ziel-Aufloesung samt Linter
// (existingWikiTargets, resolveWikiTargetInIndex) und die Wiki-Ziel-
// Vervollstaendigung — sie beantworten «welche Dateien gibt es», und daran
// aendert ein ungespeicherter Puffer nichts.
//
// Sie liegt bewusst im Hauptprozess und gilt damit fensteruebergreifend: Der
// gemeldete Fall hatte dieselbe Datei in zwei Fenstern offen. Melden zwei
// Fenster verschiedene Staende derselben Datei, gilt der zuletzt gemeldete —
// dieselbe Regel, die beim Speichern ohnehin greift.
// 4T-000948 (Befund E-01): Der Eintrag fuehrt neben dem Parse den ROH-TEXT, weil
// die Wiki-Einbettung ihren Anker am Text schneidet (extractEmbedSnippet). Die
// uebrigen Verbraucher sehen davon nichts: overlaysUnder reicht wie bisher
// allein den Parse weiter.

'use strict';

const { isFilesystemCaseInsensitive } = require('../../shared/platform.js');
const { isInsideArea } = require('../area/area-path.js');
const { bufferOverlays } = require('./store.js');
const { parseContent } = require('./parse.js');
// 4T-001610 (Epic 3E-000252): Ein offenes Folge-Segment erbt die Definition
// seiner Kopf-Datei; ohne sie koennte der geschriebene Stand seine Zellen nicht
// zuordnen. Die Ablage haelt sie bereits, weil der Index-Aufbau sie geholt hat;
// nur ein Segment, das VOR seiner Kopf-Datei geoeffnet wird, kostet einmalig
// das Lesen eines Datei-Kopfes.
const { definitionFuerSegment } = require('./datensatz-erfassung.js');

// 4T-000952 (Epic 3E-000198): Aenderungs-Stand der Overlay-Schicht, nach dem
// Muster von indexStand in store.js. Eine Zahl, die bei jeder Aenderung der
// Schicht hochzaehlt — die Bezugsgroesse fuer Zwischenspeicher, die ueber die
// UEBERLAGERTE Sicht rechnen. indexStand allein genuegt dafuer nicht: Er
// bewegt sich nur, wenn die Platte sich meldet, und beim Tippen tut sie das
// gerade nicht.
//
// Sie zaehlt bewusst auch dann hoch, wenn dieselbe Datei denselben Text
// erneut meldet. Ein Inhalts-Vergleich waere je Meldung ein Text-Vergleich
// ueber das ganze Dokument, und die Meldung kommt ohnehin nur verzoegert
// (300 ms) und nur bei tatsaechlicher Doc-Aenderung.
let overlayZaehler = 0;

function overlayStand() {
  return overlayZaehler;
}

function setBufferOverlay(filePath, content) {
  if (typeof filePath !== 'string' || !filePath) return false;
  if (typeof content !== 'string') return false;
  const parsed = parseContent(filePath, content, definitionFuerSegment(filePath));
  bufferOverlays.set(filePath, { parsed, text: content });
  overlayZaehler += 1;
  return true;
}

function clearBufferOverlay(filePath) {
  const entfernt = bufferOverlays.delete(filePath);
  if (entfernt) overlayZaehler += 1;
  return entfernt;
}

function clearAllBufferOverlays() {
  if (bufferOverlays.size > 0) overlayZaehler += 1;
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

// 4T-000948 (Befund E-01): Roh-Text-Auskunft fuer Verbraucher, die den
// geschriebenen Stand als Text brauchen (Wiki-Einbettung). Ohne Bereichs-
// Filter, weil der Aufrufer den Ziel-Pfad bereits geprueft hat. Der zweite
// Anlauf ohne Ruecksicht auf Gross- und Kleinschreibung faengt '![[quelle]]'
// gegen 'Quelle.md' und gilt auf case-insensitiven Dateisystemen (seit
// 4T-001203 Windows UND macOS, zentrale Eigenschaft in shared/platform.js);
// wo das Dateisystem die Schreibweise unterscheidet, waeren das zwei Dateien.
function bufferTextFor(absPath) {
  if (typeof absPath !== 'string' || !absPath) return null;
  const genau = bufferOverlays.get(absPath);
  if (genau) return genau.text;
  if (!isFilesystemCaseInsensitive()) return null;
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
// Ebenso bleibt der an dieser Sicht haengende Link-Graph der der Platte: Er
// wird ueber alle Dateien gebaut und an entry.linkGraph gecacht; ein
// FROM-Link-Bezug einer Abfrage auf einen erst geschriebenen Link wirkt
// deshalb weiter erst nach dem Speichern.
//
// 4T-000952 (Epic 3E-000198): Die Graphenansicht braucht genau diese Kanten
// und bekommt sie seither ueber einen ZWEITEN, eigenen Graphen (graphUeberlagert
// in link-graph.js) mit eigenem Zwischenspeicher. entry.linkGraph bleibt
// unangetastet, damit der Satz oben fuer die Abfrage-Verbraucher wahr bleibt.
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
    // 4T-001510 (Epic 3E-000250): Die Datenbank-Marken folgen dem geschriebenen
    // Stand, damit eine gerade angelegte, noch nicht gespeicherte Tabelle im
    // Katalog erscheint (Puffer-Overlay-Zusicherung, E25).
    dbKindsPerFile: patchOf('dbKindsPerFile', (p) => (Array.isArray(p.dbKinds) ? p.dbKinds : [])),
    // 4T-001610 (Epic 3E-000252): Der Datensatz-Bestand folgt dem geschriebenen
    // Stand, aus demselben Grund und mit derselben Zusicherung (E25): Ein
    // gerade angelegter, noch nicht gespeicherter Datensatz ist auffindbar.
    recordsPerFile: patchOf('recordsPerFile', (p) => (Array.isArray(p.records) ? p.records : [])),
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
  // 4T-000952: Aenderungs-Stand der Schicht fuer Zwischenspeicher darueber.
  overlayStand,
};
