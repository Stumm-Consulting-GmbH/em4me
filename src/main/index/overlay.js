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
const { bufferOverlays, broadcast } = require('./store.js');
const { parseContent } = require('./parse.js');
// 4T-001610 (Epic 3E-000252): Ein offenes Folge-Segment erbt die Definition
// seiner Kopf-Datei; ohne sie koennte der geschriebene Stand seine Zellen nicht
// zuordnen. Die Ablage haelt sie bereits, weil der Index-Aufbau sie geholt hat;
// nur ein Segment, das VOR seiner Kopf-Datei geoeffnet wird, kostet einmalig
// das Lesen eines Datei-Kopfes.
const { definitionFuerSegment } = require('./datensatz-erfassung.js');
// 4T-002047: Der Puffer einer Kopf-Datei ist das ganze geteilte Dokument; die
// Regel dazu gilt für jeden Bestand der Sicht (Begründung im Modul).
const { ohneVerdeckteFolgeteile } = require('./part-files.js');
// 4T-002462 (Epic 3E-000367): Der Puffer-Stand ist eine der beiden Schichten,
// aus denen das Ereignis «Aufgabe erledigt» entsteht (Klick auf das Kästchen
// ändert nur den Puffer); Setzen und Rücknahme melden sich dort.
const { meldePuffer, meldePufferEnde, meldePufferNachPlatte } = require('./aufgaben-erledigt.js');
// 4T-002387 (Epic 3E-000265): Eine offene Karteikarte trägt ihren Datensatz im
// Dateikopf; der Parser kennt die Kartei-Tabellen nicht und ergänzt ihn nicht.
const { mitKarteikarte } = require('./karteikarten-erfassung.js');

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

// 4T-002740 (Epic 3E-000396): Ablage der gemeldeten Stände JE FENSTER, neben
// der Schicht. Die Schicht hält je Datei nur den zuletzt gemeldeten Stand; ein
// Fenster, das dieselbe Datei unverändert offen hat und nach einem
// Dokument-Wechsel seinen Text meldet, überdeckt dort den ungespeicherten Stand
// eines anderen Fensters. Wer wissen muss, ob IRGENDEIN Fenster einen Stand
// hält, der vom Platten-Stand abweicht (der Übertrag offener Aufgaben schreibt
// sonst unter einem ungespeicherten Editor-Stand weg), fragt deshalb diese
// Ablage und nicht den Eintrag der Schicht. Sie ändert nichts an dem, was die
// Verbraucher der Schicht sehen. Ein Stand fällt mit der Rücknahme durch sein
// Fenster (Speichern, Verwerfen, Schließen, Neuladen) und mit dem Schließen
// des Fensters. Schlüssel des Fensters ist die Kennung seines
// Anzeige-Prozesses, `null` für einen Melder ohne Kennung.
const staendeJeFenster = new Map(); // Datei-Pfad -> Map(Fenster -> Text)

function merkeStandJeFenster(filePath, besitzer, text) {
  let jeFenster = staendeJeFenster.get(filePath);
  if (!jeFenster) {
    jeFenster = new Map();
    staendeJeFenster.set(filePath, jeFenster);
  }
  jeFenster.set(besitzer, text);
}

// Ohne `besitzer` (undefined) fallen alle Stände der Datei.
function vergissStandJeFenster(filePath, besitzer) {
  const jeFenster = staendeJeFenster.get(filePath);
  if (!jeFenster) return;
  if (besitzer === undefined) jeFenster.clear();
  else jeFenster.delete(besitzer);
  if (jeFenster.size === 0) staendeJeFenster.delete(filePath);
}

// Die Stände aller Fenster für diese Datei, als Liste von Texten (leer, wenn
// kein Fenster einen hält). Schreibweise wie bei bufferTextFor: auf
// Dateisystemen ohne Unterscheidung der Schreibung auch der anders
// geschriebene Pfad.
function bufferTexteAllerFenster(absPath) {
  if (typeof absPath !== 'string' || !absPath) return [];
  const texte = [];
  const ohneSchreibung = isFilesystemCaseInsensitive();
  const gesucht = ohneSchreibung ? absPath.toLowerCase() : absPath;
  for (const [pfad, jeFenster] of staendeJeFenster) {
    if ((ohneSchreibung ? pfad.toLowerCase() : pfad) === gesucht) texte.push(...jeFenster.values());
  }
  return texte;
}

// Zusammenbau des Funktions-Release (Zweitblick Runde 2, Befund Z5): Folgt der
// Eintrag der Schicht dem geschriebenen Plattenstand (folgePlattenStand), folgen
// auch die Stände je Fenster, die bis dahin den alten Plattenstand hielten, also
// die unverändert geöffneten Fenster. Sonst wiche ihr Stand von der Platte ab,
// und der Übertrag offener Aufgaben (pufferWeichtAb) lehnte bis zum Nachladen
// im Fenster grundlos ab. Ein Fenster mit abweichendem, ungespeichertem Stand
// bleibt unberührt. Schreibweise wie bei bufferTexteAllerFenster.
function folgeStaendeJeFenster(absPath, alterText, neuerText) {
  const ohneSchreibung = isFilesystemCaseInsensitive();
  const gesucht = ohneSchreibung ? absPath.toLowerCase() : absPath;
  for (const [pfad, jeFenster] of staendeJeFenster) {
    if ((ohneSchreibung ? pfad.toLowerCase() : pfad) !== gesucht) continue;
    for (const [fenster, stand] of jeFenster) {
      if (stand === alterText) jeFenster.set(fenster, neuerText);
    }
  }
}

// 4T-001727 (Epic 3E-000305): Der Eintrag merkt sich, WELCHES Fenster den Stand
// gemeldet hat (Kennung seines Anzeige-Prozesses, optional). Eine Erinnerung,
// die aus dem ungespeicherten Stand faellig wird, muss dort bearbeitet werden,
// wo dieser Stand liegt; auf der Platte steht ihre Zeile so nicht. Es gilt
// derselbe Grundsatz wie oben: der zuletzt meldende Besitzer.
//
// 4T-002812 (Epic 3E-000444): Der Eintrag führt zusätzlich das Merkmal
// «ungespeichert» aus dem Reiter des Melders (tab.dirty). Gemeldet wird auch
// ein unveränderter Stand, etwa beim Öffnen oder nach dem Zurücktippen auf den
// gespeicherten Text; die Anzeige-Schicht braucht ihn so. Ein Schreibziel ist
// ein solches Fenster aber nicht: bufferOwnerFor nennt nur den Besitzer eines
// ungespeicherten Stands. Ohne Angabe gilt der Stand als ungespeichert, das
// bisherige Verhalten.
function setBufferOverlay(filePath, content, besitzer = null, ungespeichert = true) {
  if (typeof filePath !== 'string' || !filePath) return false;
  if (typeof content !== 'string') return false;
  const parsed = mitKarteikarte(
    filePath,
    parseContent(filePath, content, definitionFuerSegment(filePath)),
  );
  bufferOverlays.set(filePath, {
    parsed,
    text: content,
    besitzer: besitzer ?? null,
    ungespeichert: ungespeichert !== false,
  });
  merkeStandJeFenster(filePath, besitzer ?? null, content);
  overlayZaehler += 1;
  meldePuffer(filePath, parsed.tasks);
  return true;
}

// Der Schlüssel eines Eintrags zu einem Pfad, in der Schreibweise wie bei
// bufferTextFor; null, wenn keiner vorliegt.
function eintragsPfad(absPath) {
  if (bufferOverlays.has(absPath)) return absPath;
  if (!isFilesystemCaseInsensitive()) return null;
  const gesucht = absPath.toLowerCase();
  for (const pfad of bufferOverlays.keys()) if (pfad.toLowerCase() === gesucht) return pfad;
  return null;
}

// 4T-002812 (Epic 3E-000444, Zweitblick Runde 1, Befund 1): Ein Schreibweg hat
// eine Datei auf die Platte geschrieben, die ein Fenster unverändert geöffnet
// hält. Der Eintrag dieses Fensters übernimmt den geschriebenen Stand sofort.
// Sonst läse ein nachfolgender Schritt desselben Laufs (bufferTextFor, etwa
// beim Abhaken oder als Quelle) bis zum Nachladen im Fenster den Stand vor dem
// Schreiben, und ein Anhängen mit anschließendem Abhaken fände die eben
// angehängte Aufgabe nicht. Ein ungespeicherter Stand bleibt unberührt: Er geht
// der Platte vor, und auf ihn schreibt der Weg ohnehin nicht. Besitzer und
// Merkmal bleiben, das Nachladen im Fenster meldet danach denselben Stand.
// Wie jede Änderung der Schicht geht sie an alle Fenster
// (`meldeOverlayAenderung`), damit Einbettungen und Abfragen desselben Ziels
// nicht bis zum Nachladen den alten Stand zeigen (Zweitblick Runde 2,
// Hinweis 3). Rückgabe: ob ein Eintrag gefolgt ist.
function folgePlattenStand(filePath, text) {
  if (typeof filePath !== 'string' || !filePath) return false;
  if (typeof text !== 'string') return false;
  const pfad = eintragsPfad(filePath);
  if (pfad === null) return false;
  const eintrag = bufferOverlays.get(pfad);
  if (!eintrag || eintrag.ungespeichert !== false) return false;
  const parsed = mitKarteikarte(pfad, parseContent(pfad, text, definitionFuerSegment(pfad)));
  bufferOverlays.set(pfad, { ...eintrag, parsed, text });
  folgeStaendeJeFenster(pfad, eintrag.text, text);
  overlayZaehler += 1;
  meldePufferNachPlatte(pfad, eintrag.parsed && eintrag.parsed.tasks, parsed.tasks);
  meldeOverlayAenderung(pfad);
  return true;
}

// 4T-002462: Rücknahme an die Erkennung «Aufgabe erledigt»; sie liest danach
// die Platte und meldet nie einen Fehler zurück.
function pufferEndeMelden(filePath) {
  meldePufferEnde(filePath).catch((err) =>
    console.warn('Aufgabe erledigt: Rücknahme nicht ausgewertet:', err),
  );
}

// 4T-002740 (Epic 3E-000396): Mit `besitzer` nimmt ein Fenster in der Ablage
// je Fenster nur seinen eigenen Stand zurück; ohne ihn (Aufrufer ohne
// Fenster-Bezug) fallen dort alle Stände der Datei. Am Eintrag der Schicht
// selbst ändert der Besitzer nichts: Er fällt wie bisher.
function clearBufferOverlay(filePath, besitzer) {
  const entfernt = bufferOverlays.delete(filePath);
  vergissStandJeFenster(filePath, besitzer);
  if (entfernt) overlayZaehler += 1;
  pufferEndeMelden(filePath);
  return entfernt;
}

// 4T-002023 (Epic 3E-000192): Alle Einträge, die ein Fenster zuletzt gemeldet
// hat, zurücknehmen — beim Schließen des Fensters. Schließt der Anwender es
// und verwirft dabei seine Änderungen, nimmt der Anzeige-Prozess keinen Puffer
// mehr zurück; eine Einbettung oder ein Diagramm in einem anderen Fenster
// zeigte sonst den verworfenen Stand, bis das Programm endet. Liefert die
// Pfade, damit der Aufrufer ihre Änderung melden kann.
//
// Gilt je Besitzer, also für den zuletzt meldenden: Ist dieselbe Datei in einem
// zweiten Fenster ungespeichert geändert, fällt ihr Stand mit dem Schließen
// des Besitzers ebenfalls aus der Schicht, bis dort die nächste Eingabe ihn
// wieder meldet (benannte Grenze, hingenommen).
function clearBufferOverlaysOfOwner(besitzer) {
  if (besitzer == null) return [];
  const pfade = [];
  for (const [pfad, eintrag] of bufferOverlays) {
    if (eintrag.besitzer === besitzer) pfade.push(pfad);
  }
  for (const pfad of pfade) {
    bufferOverlays.delete(pfad);
    pufferEndeMelden(pfad);
  }
  // Die Ablage je Fenster verliert jeden Stand dieses Fensters, auch für
  // Dateien, deren Eintrag in der Schicht inzwischen ein anderes Fenster hält.
  for (const pfad of [...staendeJeFenster.keys()]) vergissStandJeFenster(pfad, besitzer);
  if (pfade.length > 0) overlayZaehler += 1;
  return pfade;
}

function clearAllBufferOverlays() {
  if (bufferOverlays.size > 0) overlayZaehler += 1;
  const pfade = [...bufferOverlays.keys()];
  bufferOverlays.clear();
  staendeJeFenster.clear();
  for (const pfad of pfade) pufferEndeMelden(pfad);
}

// 4T-002023 (Epic 3E-000192): Meldung an ALLE Fenster, dass sich der
// geschriebene Stand einer Datei geändert hat oder zurückgenommen ist
// (Entscheidung des Product Owners vom 2026-09-29, «Beide folgen»). Die Schicht
// gilt fensterübergreifend, die Meldung blieb bis dahin im tippenden Fenster;
// eine Einbettung oder ein Diagramm desselben Ziels in einem anderen Fenster
// folgte deshalb nicht. Das meldende Fenster bekommt sie ebenso und hat damit
// genau einen Weg. Getrennt vom Setzen, weil der Kanal auch eine Rücknahme
// meldet, die nichts zu entfernen fand: Ein anderes Fenster kann den Stand
// derselben Datei noch vom vorigen Melden zeigen.
function meldeOverlayAenderung(filePath) {
  if (typeof filePath !== 'string' || !filePath) return;
  broadcast('index:overlayChanged', { filePath });
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

// 4T-001727: Das Fenster, dessen ungespeicherter Stand fuer diese Datei gilt,
// oder null, wenn keiner vorliegt oder der Melder unbekannt ist. Schreibweise
// wie bei bufferTextFor.
//
// 4T-002812 (Epic 3E-000444): Hält der Melder das Dokument unverändert, gibt
// es keinen ungespeicherten Stand, und die Antwort ist null. Die Weiche
// (ipc/puffer-fenster.js) schreibt dann auf die Platte, und jedes Fenster lädt
// den neuen Stand über die Datei-Beobachtung nach. Vorher landete ein
// Text-Befehl, eine Erinnerung oder ein Handgriff der Aufgaben-Abfrage im
// Fenster und machte ein unverändertes Dokument zu einem ungespeicherten.
// bufferTextFor bleibt unberührt: Gelesen wird der gemeldete Stand weiter.
function besitzerVon(eintrag) {
  if (!eintrag || eintrag.ungespeichert === false) return null;
  return eintrag.besitzer ?? null;
}

function bufferOwnerFor(absPath) {
  if (typeof absPath !== 'string' || !absPath) return null;
  const genau = bufferOverlays.get(absPath);
  if (genau) return besitzerVon(genau);
  if (!isFilesystemCaseInsensitive()) return null;
  const gesucht = absPath.toLowerCase();
  for (const [pfad, e] of bufferOverlays) {
    if (pfad.toLowerCase() === gesucht) return besitzerVon(e);
  }
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
  // 4T-002046 für die Datensätze, 4T-002047 für alle acht Bestände: Der Puffer
  // eines geteilten Dokuments ist das ganze Dokument; seine Folge-Dateien der
  // Platte führen daneben keine Einträge, sonst stünde jeder Eintrag eines
  // Folgeteils doppelt in der Sicht. `leer` ist die Form, die der Bestand für
  // eine Datei ohne Einträge führt, dieselbe wie bei `wandeln` darunter.
  const pufferPfade = [...overlays.keys()];
  const patchOf = (feld, wandeln, leer) => {
    const m = new Map();
    for (const [absPath, parsed] of overlays) m.set(absPath, wandeln(parsed));
    return ohneVerdeckteFolgeteile(overlayView(entry[feld], m), pufferPfade, leer);
  };
  const leereListe = () => [];
  return {
    ...entry,
    files: patchOf('files', (p) => p.hits, leereListe),
    propertiesPerFile: patchOf(
      'propertiesPerFile',
      (p) => p.properties || {},
      () => ({}),
    ),
    tasksPerFile: patchOf(
      'tasksPerFile',
      (p) => (Array.isArray(p.tasks) ? p.tasks : []),
      leereListe,
    ),
    // 4T-001510 (Epic 3E-000250): Die Datenbank-Marken folgen dem geschriebenen
    // Stand, damit eine gerade angelegte, noch nicht gespeicherte Tabelle im
    // Katalog erscheint (Puffer-Overlay-Zusicherung, E25).
    dbKindsPerFile: patchOf(
      'dbKindsPerFile',
      (p) => (Array.isArray(p.dbKinds) ? p.dbKinds : []),
      leereListe,
    ),
    // 4T-001610 (Epic 3E-000252): Der Datensatz-Bestand folgt dem geschriebenen
    // Stand, aus demselben Grund und mit derselben Zusicherung (E25): Ein
    // gerade angelegter, noch nicht gespeicherter Datensatz ist auffindbar.
    recordsPerFile: patchOf(
      'recordsPerFile',
      (p) => (Array.isArray(p.records) ? p.records : []),
      leereListe,
    ),
    tagsPerFile: patchOf('tagsPerFile', (p) => p.tags || [], leereListe),
    aliasesPerFile: patchOf('aliasesPerFile', (p) => p.aliases || [], leereListe),
    anchorsPerFile: patchOf(
      'anchorsPerFile',
      (p) => ({
        headings: new Set(p.headings || []),
        blockIds: new Set(p.blockIds || []),
      }),
      () => ({ headings: new Set(), blockIds: new Set() }),
    ),
  };
}

module.exports = {
  setBufferOverlay,
  clearBufferOverlay,
  clearAllBufferOverlays,
  clearBufferOverlaysOfOwner,
  meldeOverlayAenderung,
  overlaysUnder,
  bufferTextFor,
  bufferTexteAllerFenster,
  bufferOwnerFor,
  folgePlattenStand,
  entryWithOverlay,
  // 4T-000952: Aenderungs-Stand der Schicht fuer Zwischenspeicher darueber.
  overlayStand,
};
