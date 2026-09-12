// 4T-001600 (Epic 3E-000191, Story 4S-000906): Kennzahlen-Beschleuniger der
// Gefaess-Liste My Extended Memory.
//
// Die Seite zeigt auch Gefaesse, die gerade nicht erreichbar sind — getrenntes
// Netzlaufwerk, abgezogener Datentraeger — und zwar mit den zuletzt bekannten
// Zahlen. Deshalb liegen die Kennzahlen zentral im Benutzerprofil und nicht
// neben ihrem Gegenstand: Eine Ablage im Gefaess zeigte dort nichts. Zug-
// Entscheidung Z4; der Weg durch die Ablage-Regel steht in der Architektur.
//
// Drei Zusicherungen, die den Aufbau erklaeren:
//
// 1. REGENERIERBAR, NIE ALLEINIGE QUELLE. Fehlt die Datei oder ist ihr Inhalt
//    defekt, faengt der Beschleuniger leer an und baut sich aus den Gefaessen
//    neu auf; ein defekter Inhalt wird verworfen statt repariert (Muster
//    ladeCache in area-search-cache.js). Es geht nichts verloren, was nicht aus
//    dem Gefaess selbst wieder zu gewinnen waere.
// 2. STAND JE EINTRAG. Jeder Eintrag traegt den Zeitpunkt seiner Erhebung, und
//    die Seite zeigt ihn. Zahlen ohne Stand waeren hier irrefuehrend, weil sie
//    aelter sein koennen als das Gefaess.
// 3. KEIN INDEX-AUFBAU. Erhoben wird, was ohne Anbau eines Index zu haben ist.
//    Fuer einen nicht geoeffneten Bereich bleiben Tags, Aufgaben und Waisen
//    deshalb `null` (nie 0) und der Eintrag steht auf `partial`. Ob sich das
//    aendern laesst, ist ausdruecklich nicht Gegenstand dieses Moduls.
//
// Der eine Ordner-Scan kommt aus area-stats.js (`scanArea` mit
// `mitMarkdown: true`); es gibt keine zweite Zaehl-Grundlage. Der Index-Leser
// ist injizierbar wie in area-stats.js, damit der Unit-Test seinen
// Fixture-Index hereinreichen kann.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ersetzeDateiOderWirf } = require('../documents/atomic-write');
const backlinks = require('../backlinks.js');
const { scanArea } = require('../area/area-stats');
const { standJetzt } = require('./memory-entries');
const { readBookSettings } = require('../books/books');
const { buildShelfState } = require('../books/shelves');
const { readChapterTree, flattenChapters } = require('../../shared/books/book-core.js');

// Schema-Version des Beschleunigers. Ein fremder Wert fuehrt zum leeren Start,
// nicht zu einer Migration: Der Bestand ist regenerierbar.
const MEMORY_STATS_VERSION = 1;

// Eigene Datei neben config.json statt einer Sektion darin (Z4): Die
// Einstellungen sollen nicht bei jeder Erhebung neu geschrieben werden.
const DATEI_NAME = 'memory-stats.json';

const ZULAESSIGE_STATUS = new Set(['ready', 'partial', 'unreachable', 'error']);

let benutzerprofil = null;

// Wird vom Hauptprozess beim Start gesetzt, der Unit-Test setzt sein eigenes
// Verzeichnis (Naht statt harter Electron-Abhaengigkeit, Muster
// konfiguriereCache in area-search-cache.js). Ohne Konfiguration arbeitet die
// Liste ohne Persistenz weiter — sie zeigt dann eben keine Kennzahlen.
function konfiguriereMemoryStats(optionen) {
  benutzerprofil =
    optionen && typeof optionen.userDataDir === 'string' ? optionen.userDataDir : null;
}

function statsPfad() {
  return benutzerprofil ? path.join(benutzerprofil, DATEI_NAME) : null;
}

function istZahlOderNull(wert) {
  return wert === null || (typeof wert === 'number' && Number.isFinite(wert));
}

// Defensive Normalisierung eines gespeicherten Eintrags. Alles, was nicht der
// Form entspricht, faellt heraus; der Gegenstand entsteht dann bei der
// naechsten Erhebung neu.
function normalisiereEintrag(roh) {
  if (!roh || typeof roh !== 'object') return null;
  if (typeof roh.kind !== 'string' || roh.kind === '') return null;
  if (!ZULAESSIGE_STATUS.has(roh.status)) return null;
  const werte = {};
  for (const [name, wert] of Object.entries(roh.werte || {})) {
    if (istZahlOderNull(wert)) werte[name] = wert;
  }
  return {
    kind: roh.kind,
    stand: typeof roh.stand === 'string' && roh.stand !== '' ? roh.stand : null,
    status: roh.status,
    werte,
  };
}

/**
 * Liest den Beschleuniger. Fehlende Datei, defekter Inhalt und eine fremde
 * Schema-Version fuehren alle drei zum leeren Bestand; geworfen wird nie
 * (AK3).
 *
 * @returns {Promise<object>} Eintraege je Gefaess-Schluessel.
 */
async function ladeMemoryStats() {
  const pfad = statsPfad();
  if (!pfad) return {};
  let roh;
  try {
    roh = await fs.promises.readFile(pfad, 'utf8');
  } catch {
    return {};
  }
  let container;
  try {
    container = JSON.parse(roh);
  } catch {
    return {};
  }
  if (!container || container.version !== MEMORY_STATS_VERSION) return {};
  if (!container.eintraege || typeof container.eintraege !== 'object') return {};
  const out = {};
  for (const [key, wert] of Object.entries(container.eintraege)) {
    const eintrag = normalisiereEintrag(wert);
    if (eintrag !== null) out[key] = eintrag;
  }
  return out;
}

/**
 * Schreibt den Beschleuniger atomar. Ein Fehlschlag ist nie fatal — der
 * Bestand entsteht bei der naechsten Erhebung neu.
 *
 * @param {object} eintraege Eintraege je Gefaess-Schluessel.
 */
async function schreibeMemoryStats(eintraege) {
  const pfad = statsPfad();
  if (!pfad) return;
  const container = { version: MEMORY_STATS_VERSION, eintraege: eintraege || {} };
  try {
    await fs.promises.mkdir(path.dirname(pfad), { recursive: true });
    await ersetzeDateiOderWirf(pfad, JSON.stringify(container, null, 2));
  } catch (err) {
    console.warn('Gefaess-Liste: Kennzahlen schreiben fehlgeschlagen:', pfad, err && err.message);
  }
}

// Ist der Pfad gerade als Ordner erreichbar? Ein Fehlschlag ist kein Fehler,
// sondern die Antwort (AK4).
async function istErreichbar(p) {
  if (typeof p !== 'string' || p === '') return false;
  try {
    return (await fs.promises.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

// Summe aller Bytes unter der Wurzel: Markdown, Nicht-Markdown und
// Begleitdateien. Bewusst die Gesamt-Summe und nicht eine der Teil-Summen der
// Bereichs-Statistik — die Zeile der Gefaess-Liste nennt genau eine Zahl.
function bytesGesamt(scan) {
  return (
    scan.markdown.bytes +
    scan.bilder.bytes +
    scan.pdf.bytes +
    scan.sonstige.bytes +
    scan.mdd.bytes +
    scan.mdda.bytes
  );
}

// Index-Anteil eines Bereichs. Er kommt ausschliesslich aus dem vorhandenen
// In-Memory-Index; ist der Bereich nicht geoeffnet, liefert der Leser
// 'unavailable' und die drei Zahlen bleiben null (Punkt 6 des
// Loesungsansatzes).
function indexAnteil(wurzel, optionen) {
  const leseIndex =
    typeof optionen.statsFor === 'function' ? optionen.statsFor : backlinks.statsFor;
  let index;
  try {
    index = leseIndex(wurzel, optionen.env || {});
  } catch {
    index = null;
  }
  if (!index || index.status !== 'ready') return null;
  return {
    tags: index.tags.length,
    aufgaben: index.aufgaben.gesamt,
    waisen: index.verweise.ohneEingehende,
  };
}

async function erhebeBereich(wurzel, optionen) {
  const scan = await scanArea(wurzel, { mitMarkdown: true });
  const werte = {
    markdown: scan.markdown.anzahl,
    nichtMarkdown: scan.bilder.anzahl + scan.pdf.anzahl + scan.sonstige.anzahl,
    ordner: scan.ordner,
    bytes: bytesGesamt(scan),
    tags: null,
    aufgaben: null,
    waisen: null,
  };
  const ausIndex = indexAnteil(wurzel, optionen);
  if (ausIndex === null) return { status: 'partial', werte };
  return { status: 'ready', werte: { ...werte, ...ausIndex } };
}

async function erhebeBuch(wurzel) {
  const scan = await scanArea(wurzel, { mitMarkdown: true });
  const buch = await readBookSettings(wurzel);
  return {
    status: 'ready',
    werte: {
      markdown: scan.markdown.anzahl,
      bytes: bytesGesamt(scan),
      // Kein Buch mehr (Begleitdatei entfernt oder defekt): Die Kapitel-Zahl
      // fehlt, statt eine Null zu behaupten.
      kapitel: buch.ok ? flattenChapters(readChapterTree(buch.container)).length : null,
    },
  };
}

async function erhebeRegal(wurzel) {
  const scan = await scanArea(wurzel, { mitMarkdown: true });
  const zustand = await buildShelfState(wurzel);
  const werte = {
    buecher: null,
    fehlend: null,
    markdown: scan.markdown.anzahl,
    bytes: bytesGesamt(scan),
  };
  if (zustand.ok) {
    const { books, unassigned, missing } = zustand.state;
    // Vorhandene Buecher: die zugeordneten ohne die fehlenden, dazu die im
    // Ordner liegenden ohne Zuordnung (dieselbe Rechnung wie die
    // Regal-Ansicht, buildShelfViewData).
    werte.buecher = books.length - missing.length + unassigned.length;
    werte.fehlend = missing.length;
  }
  return { status: 'ready', werte };
}

/**
 * Erhebt die Kennzahlen eines eingetragenen Gefaesses.
 *
 * Ein Arbeitsbereich bekommt keinen Eintrag (`null`): Seine Angaben sind aus
 * `config.json` jederzeit billig ableitbar, und eine zweite Ablage waere eine
 * zweite Wahrheit. Ein nicht erreichbares Gefaess behaelt seine zuletzt
 * bekannten Zahlen und seinen alten Stand; allein der Status wechselt auf
 * `unreachable` (AK4).
 *
 * @param {object} entry Eintrag der Gefaess-Liste (`kind`, `path`).
 * @param {object} [optionen] `vorher` (bisheriger Eintrag), `statsFor` und
 *   `env` (Index-Leser, Muster deps in area-stats.js).
 * @returns {Promise<object|null>} Beschleuniger-Eintrag oder null.
 */
async function erhebe(entry, optionen = {}) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.kind === 'workspace') return null;
  const vorher = normalisiereEintrag(optionen.vorher) || {
    kind: entry.kind,
    stand: null,
    status: 'unreachable',
    werte: {},
  };
  if (!(await istErreichbar(entry.path))) {
    return { kind: entry.kind, stand: vorher.stand, status: 'unreachable', werte: vorher.werte };
  }
  const wurzel = path.resolve(entry.path);
  let erhoben;
  try {
    if (entry.kind === 'book') erhoben = await erhebeBuch(wurzel);
    else if (entry.kind === 'shelf') erhoben = await erhebeRegal(wurzel);
    else erhoben = await erhebeBereich(wurzel, optionen);
  } catch (err) {
    // Ein Lese-Fehler unter der Wurzel darf die Liste nicht anhalten. Der alte
    // Stand bleibt stehen und der Eintrag sagt, dass die Erhebung scheiterte.
    console.warn('Gefaess-Liste: Erhebung fehlgeschlagen:', wurzel, err && err.message);
    return { kind: entry.kind, stand: vorher.stand, status: 'error', werte: vorher.werte };
  }
  return { kind: entry.kind, stand: standJetzt(), status: erhoben.status, werte: erhoben.werte };
}

/**
 * Erhebt ein Gefaess und schreibt das Ergebnis in den Beschleuniger.
 *
 * @param {object} entry Eintrag der Gefaess-Liste.
 * @param {object} [optionen] wie bei `erhebe`.
 * @returns {Promise<object|null>} der geschriebene Eintrag oder null
 *   (Arbeitsbereich).
 */
async function aktualisiereEintrag(entry, optionen = {}) {
  if (!entry || entry.kind === 'workspace' || typeof entry.key !== 'string') return null;
  const eintraege = await ladeMemoryStats();
  const eintrag = await erhebe(entry, { ...optionen, vorher: eintraege[entry.key] });
  if (eintrag === null) return null;
  eintraege[entry.key] = eintrag;
  await schreibeMemoryStats(eintraege);
  return eintrag;
}

/**
 * Entfernt den Beschleuniger-Eintrag eines ausgetragenen Gefaesses. Das
 * Gefaess selbst bleibt unberuehrt.
 *
 * @param {string} key Schluessel des Eintrags.
 * @returns {Promise<boolean>} ob etwas entfernt wurde.
 */
async function entferneEintrag(key) {
  if (typeof key !== 'string' || key === '') return false;
  const eintraege = await ladeMemoryStats();
  if (!Object.prototype.hasOwnProperty.call(eintraege, key)) return false;
  delete eintraege[key];
  await schreibeMemoryStats(eintraege);
  return true;
}

module.exports = {
  MEMORY_STATS_VERSION,
  DATEI_NAME,
  konfiguriereMemoryStats,
  statsPfad,
  ladeMemoryStats,
  schreibeMemoryStats,
  erhebe,
  aktualisiereEintrag,
  entferneEintrag,
};
