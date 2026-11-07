'use strict';

// 4T-002516 (Epic 3E-000402): Die Auswahl der Filter am Kopf eines Dashboards,
// je geöffnetem Dokument und Block (Konzept-Stufe 4T-002506, Abschnitt 3.3).
// Das Modul beantwortet zwei Fragen: welche Werte die Filter eines Blocks beim
// Zeichnen tragen, und welche Kacheln eine Änderung der Auswahl betrifft. Die
// Auswahlfelder selbst baut `dashboard-filter.js`.
//
// **Die Auswahl lebt im Arbeitsspeicher und nie in der Datei** (Muster
// `canvas/canvas-block-zustand.js`): eine `WeakMap` je geöffnetem Dokument mit
// einer `Map` je Block. Eine Auswahl ist eine Befüllung und keine Bearbeitung;
// sie setzt kein Änderungs-Zeichen und schreibt nichts. Mit dem geöffneten
// Dokument stirbt sie, beim nächsten Öffnen gilt die Vorbelegung (Story
// 4S-001186, AK3).
//
// **Schlüssel** (Entscheidung der Sitzung vom 2026-11-03): Pfad des Dokuments,
// Nummer der Spalte und Ordnungszahl des Blocks im Puffer, dazu eine Signatur aus
// den Filter-Namen des Blocks in ihrer Reihenfolge. Wird oberhalb ein Block
// eingefügt oder gelöscht, wandert die Ordnungszahl; passt die Signatur des
// Blocks dann nicht zum gemerkten Stand, verfällt die Auswahl auf die
// Vorbelegung. Die geteilte Ansicht hält je Spalte eine eigene Auswahl, weil
// jede Spalte ihr eigenes geöffnetes Dokument führt; in einer Einbettung gilt
// der Pfad der eingebetteten Datei und das geöffnete Dokument der einbettenden
// Spalte.
//
// **Ein verschwundener Wert bleibt stehen** (Entscheidung der Sitzung vom
// 2026-11-03): Ein gewählter Wert aus dem Bestand, der beim Nachzug nicht mehr
// vorkommt, bleibt gewählter Eintrag der Auswahl, und die Kacheln zeigen dann
// keine Treffer; kein stilles Zurückspringen auf «alle». Dasselbe gilt für eine
// Vorbelegung aus dem Bestand, die gerade nicht vorkommt (Abschnitt 1.3).
//
// Ohne Import und ohne DOM: Die Funktionen nehmen Werte und liefern Werte, damit
// sie ohne Anwendung prüfbar sind und dieser Ordner keinem Import-Zyklus
// beitritt.

// Der Kanal der Abfrage nimmt höchstens zwanzig Namen und Werte bis 500
// Zeichen (src/main/ipc/dashboard.js, Konzept-Stufe Abschnitt 3.4).
export const HOECHSTENS_FILTER = 20;
export const HOECHSTE_WERT_LAENGE = 500;

// Trenner zwischen Teilen eines Schlüssels; kommt in Pfad und Name nicht vor.
const TRENNER = '\u0000';

// Name eines Platzhalters hinter `$` (query-platzhalter.js, NAME_RE).
const PLATZHALTER_RE = /\$([\p{L}_][\p{L}\p{N}_]*)/gu;

// geöffnetes Dokument -> Map<Schlüssel, { signatur, werte }>
const auswahlJeDokument = new WeakMap();

/**
 * Schlüssel eines Blocks im geöffneten Dokument.
 * @param {number} spalte Nummer der Spalte, -1 außerhalb jeder Spalte
 * @param {string} pfad Pfad des Dokuments, das den Block trägt
 * @param {number} ordnungszahl Ordnungszahl des Blocks im Puffer, ab 0
 * @returns {string}
 */
export function schluesselDes(spalte, pfad, ordnungszahl) {
  return [String(spalte), String(pfad || ''), String(ordnungszahl)].join(TRENNER);
}

/**
 * Signatur der Filter eines Blocks: ihre Namen in Reihenfolge, ohne Rücksicht
 * auf Groß- und Kleinschreibung wie der Name selbst.
 * @param {string[]} namen
 * @returns {string}
 */
export function signaturDer(namen) {
  return namen.map((n) => String(n).toLowerCase()).join(TRENNER);
}

/**
 * Die gemerkten Werte eines Blocks, sofern seine Signatur passt; eine
 * unpassende Erinnerung wird dabei verworfen.
 * @param {object|null} dokument geöffnetes Dokument (Zustand des Reiters)
 * @param {string} schluessel
 * @param {string} signatur
 * @returns {(string|null)[]|null} ein Wert je Filter oder null
 */
export function gemerkteWerte(dokument, schluessel, signatur) {
  if (!dokument || typeof dokument !== 'object') return null;
  const karte = auswahlJeDokument.get(dokument);
  const eintrag = karte ? karte.get(schluessel) : null;
  if (!eintrag) return null;
  if (eintrag.signatur !== signatur) {
    karte.delete(schluessel);
    return null;
  }
  return eintrag.werte.slice();
}

/**
 * Merkt die Werte eines Blocks am geöffneten Dokument. Ohne Dokument (etwa im
 * Notizen-Bereich) bleibt die Auswahl allein im gezeichneten Block.
 * @param {object|null} dokument
 * @param {string} schluessel
 * @param {string} signatur
 * @param {(string|null)[]} werte
 * @returns {boolean} ob gemerkt wurde
 */
export function merkeWerte(dokument, schluessel, signatur, werte) {
  if (!dokument || typeof dokument !== 'object') return false;
  let karte = auswahlJeDokument.get(dokument);
  if (!karte) {
    karte = new Map();
    auswahlJeDokument.set(dokument, karte);
  }
  karte.set(schluessel, { signatur, werte: werte.slice() });
  return true;
}

function tauglich(wert) {
  return typeof wert === 'string' && wert !== '' && wert.length <= HOECHSTE_WERT_LAENGE;
}

/**
 * Die Werte, mit denen ein Block beginnt: je Filter der gemerkte Wert oder die
 * Vorbelegung, `null` für «alle». Ein gemerkter Wert eines aufgezählten Filters
 * gilt nur, solange er noch aufgezählt ist; ein gemerkter Wert aus dem Bestand
 * gilt auch, wenn er gerade nicht vorkommt.
 * @param {{werte: string[]|null, vorbelegung: string|null}[]} filter
 * @param {(string|null)[]|null} gemerkt
 * @returns {(string|null)[]}
 */
export function anfangsWerte(filter, gemerkt) {
  return filter.map((f, i) => {
    const vorbelegung = tauglich(f.vorbelegung) ? f.vorbelegung : null;
    if (!Array.isArray(gemerkt) || i >= gemerkt.length) return vorbelegung;
    const wert = gemerkt[i];
    if (wert === null) return null;
    if (!tauglich(wert)) return vorbelegung;
    if (Array.isArray(f.werte) && !f.werte.includes(wert)) return vorbelegung;
    return wert;
  });
}

/**
 * Die wählbaren Werte eines Filters nach «alle»: aufgezählte Werte in ihrer
 * Reihenfolge, sonst die Werte aus dem Bestand alphabetisch nach `vergleich`,
 * ergänzt um den gewählten Wert, falls er gerade nicht vorkommt.
 * @param {{werte: string[]|null}} filter
 * @param {string[]|null} bestand Werte aus dem Bestand, null solange unbekannt
 * @param {string|null} gewaehlt
 * @param {(a: string, b: string) => number} [vergleich]
 * @returns {string[]}
 */
export function optionenDes(filter, bestand, gewaehlt, vergleich) {
  if (Array.isArray(filter.werte)) return filter.werte.filter(tauglich);
  const werte = (Array.isArray(bestand) ? bestand : []).filter(tauglich);
  if (tauglich(gewaehlt) && !werte.includes(gewaehlt)) werte.push(gewaehlt);
  return werte.sort(typeof vergleich === 'function' ? vergleich : undefined);
}

/**
 * Die Werte als `data-fm-params` der Kacheln: Name -> Wert oder `null`.
 * @param {{name: string}[]} filter
 * @param {(string|null)[]} werte
 * @returns {string} JSON
 */
export function paramsDer(filter, werte) {
  const params = {};
  filter.slice(0, HOECHSTENS_FILTER).forEach((f, i) => {
    params[f.name] = tauglich(werte[i]) ? werte[i] : null;
  });
  return JSON.stringify(params);
}

/**
 * Die Namen der Platzhalter einer Abfrage, klein geschrieben. Gesucht wird im
 * Text: Ein `$name` in einer Zeichenkette zählt mit; das kostet höchstens eine
 * unnötige Neu-Befüllung, übersieht aber keinen echten Platzhalter.
 * @param {string} abfrage
 * @returns {Set<string>}
 */
export function platzhalterNamen(abfrage) {
  const namen = new Set();
  for (const m of String(abfrage || '').matchAll(PLATZHALTER_RE)) {
    namen.add(m[1].toLowerCase());
  }
  return namen;
}

/**
 * Betrifft eine Änderung der Filter `namen` eine Kachel mit dieser Abfrage?
 * Nur dann wird sie neu befüllt; eine Kachel ohne Platzhalter bleibt unberührt.
 * @param {string} abfrage
 * @param {Iterable<string>} namen geänderte Filter-Namen
 * @returns {boolean}
 */
export function istBetroffen(abfrage, namen) {
  const genutzt = platzhalterNamen(abfrage);
  for (const name of namen) {
    if (genutzt.has(String(name).toLowerCase())) return true;
  }
  return false;
}
