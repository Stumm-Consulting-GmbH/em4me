// 4T-002023 (Epic 3E-000192): Buchführung über die Ziele der Diagramme, die
// eine Tabelle in einem anderen Dokument nennen — der Stand je Ziel für den
// Schlüssel der Live-Widgets, das zuletzt gezeichnete Bild als Platzhalter und
// der Pfad-Vergleich, den Einbettungen und Diagramme gemeinsam benutzen.
//
// **Warum ein Stand je Ziel.** Ein Live-Widget wird nur neu gebaut, wenn sich
// sein Schlüssel ändert (`eq()` in live-widget-render.js). Ändert sich allein
// das andere Dokument, bleiben Quelltext, Vorspann und Darstellung gleich, und
// das Widget behielte sein altes Bild. Der Stand zählt deshalb je Paar aus
// Dokument und geschriebenem Namen hoch, sobald die Anwendung eine Änderung
// des Ziels meldet; er geht in den Schlüssel ein (live-block-field.js).
//
// **Geführt wird er am Paar, nicht am Pfad.** Den Pfad kennt erst die Antwort
// des Lese-Kanals; der Schlüssel entsteht vorher. Das Paar ist schon im
// Quelltext da, und sein Stand bewegt sich allein auf eine Meldung hin — nie
// durch das Lesen selbst. Sonst änderte schon die erste Antwort den Schlüssel,
// und jedes Widget würde einmal ohne Anlass neu gebaut.
//
// **Warum ein Platzhalter.** Ein neu gebautes Widget liest das andere Dokument
// asynchron. Bis die Antwort da ist, stünde es leer und wäre niedriger; danach
// spränge die Höhe zurück (Entwicklungsrichtlinien, Kapitel 10). Es zeigt
// deshalb bis dahin das Bild, das an derselben Stelle zuletzt stand.
//
// Das Modul importiert nichts.
'use strict';

// `${basePath}\0${file}` -> { abs, fehlt, stand }; begrenzt wie die Bilder, der
// älteste fällt. Ein verworfener Eintrag zählt beim nächsten Lesen wieder ab
// null; das kostet höchstens einen Neu-Aufbau, nie einen falschen Stand.
const ZIELE = new Map();
const MAX_ZIELE = 1000;
// Schlüssel des Blocks -> { html, undrawable }; begrenzt, der älteste fällt.
const BILDER = new Map();
const MAX_BILDER = 200;
// Zahl aller Meldungen über geänderte oder wieder auffindbare Ziele. Eine
// Lesung, während der sie sich bewegt, kann einen alten Stand gelesen haben
// (chart-view.js, liesFremdeTabelle). Grob, aber ohne Lücke: Den Pfad einer
// ersten Lesung kennt erst ihre Antwort.
let meldungen = 0;

function paar(basePath, file) {
  return `${String(basePath || '')}\0${String(file || '')}`;
}

function vergleichsForm(pfad) {
  return String(pfad || '')
    .normalize('NFC')
    .replace(/\\/g, '/')
    .toLowerCase();
}

/**
 * Meint der eine Pfad dieselbe Datei wie der andere? Trenner werden
 * angeglichen, Groß- und Kleinschreibung zählen nicht (die Anwendung vergleicht
 * Ziel-Pfade überall so; ein zweites Auffrischen auf einem Dateisystem, das die
 * Schreibweise unterscheidet, kostet nur Zeit). Ein leerer Pfad trifft nie.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function gleicherPfad(a, b) {
  const links = vergleichsForm(a);
  return links !== '' && links === vergleichsForm(b);
}

/**
 * Die Ziel-Pfade einer Meldung als Liste: ein Pfad oder eine Menge von Pfaden
 * (eine Invalidierungs-Meldung nennt viele auf einmal). Leere fallen weg.
 *
 * @param {string|Iterable<string>} ziel
 * @returns {string[]}
 */
export function zielPfadListe(ziel) {
  const roh = typeof ziel === 'string' ? [ziel] : ziel ? [...ziel] : [];
  return roh.filter((p) => typeof p === 'string' && p !== '');
}

/**
 * Prüfer «trifft dieser Pfad eines der Ziele?» mit demselben Vergleich wie
 * `gleicherPfad`, für eine Menge in einem Durchlauf je Spalte.
 *
 * @param {string[]} pfade
 * @returns {function(string): boolean}
 */
export function zielPruefer(pfade) {
  const formen = new Set(pfade.map(vergleichsForm));
  formen.delete('');
  return (pfad) => {
    const form = vergleichsForm(pfad);
    return form !== '' && formen.has(form);
  };
}

/** @returns {number} Zahl der bisherigen Meldungen (`meldeZielGeaendert`, `meldeFehlendeNeu`). */
export function meldungsStand() {
  return meldungen;
}

/**
 * Hält fest, wohin ein Diagramm-Bezug aufgelöst wurde.
 *
 * @param {string} basePath Dokument mit dem Diagramm.
 * @param {string} file Geschriebener Name des anderen Dokuments.
 * @param {string} abs Aufgelöster Pfad; bei einem fehlenden Dokument der Ort,
 *   an dem es gesucht wurde, sonst leer.
 * @param {boolean} fehlt Das Dokument war nicht lesbar.
 */
export function merkeZiel(basePath, file, abs, fehlt) {
  const k = paar(basePath, file);
  const eintrag = ZIELE.get(k) || { abs: '', fehlt: false, stand: 0 };
  eintrag.abs = String(abs || '');
  eintrag.fehlt = !!fehlt;
  // Neu einsortiert: Das zuletzt gelesene Ziel fällt als letztes.
  ZIELE.delete(k);
  ZIELE.set(k, eintrag);
  if (ZIELE.size > MAX_ZIELE) ZIELE.delete(ZIELE.keys().next().value);
}

/**
 * Stand des Ziels für den Schlüssel eines Live-Widgets.
 *
 * @returns {string} '0' für ein noch nie gemeldetes Ziel.
 */
export function zielStand(basePath, file) {
  const eintrag = ZIELE.get(paar(basePath, file));
  return String(eintrag ? eintrag.stand : 0);
}

/**
 * Die Datei eines Ziels hat sich geändert (geschriebener Stand oder Platte).
 *
 * @param {string|Iterable<string>} ziel Ein Pfad oder eine Menge von Pfaden.
 * @returns {number} Zahl der betroffenen Bezüge.
 */
export function meldeZielGeaendert(ziel) {
  meldungen += 1;
  const trifft = zielPruefer(zielPfadListe(ziel));
  let n = 0;
  for (const eintrag of ZIELE.values()) {
    if (!trifft(eintrag.abs)) continue;
    eintrag.stand += 1;
    n += 1;
  }
  return n;
}

/**
 * Ein fehlendes Ziel kann jetzt gefunden werden (Verzeichnis bereit, Datei
 * angelegt). Alle fehlenden Bezüge bekommen einen neuen Stand.
 *
 * @returns {number} Zahl der betroffenen Bezüge.
 */
export function meldeFehlendeNeu() {
  meldungen += 1;
  let n = 0;
  for (const eintrag of ZIELE.values()) {
    if (!eintrag.fehlt) continue;
    eintrag.stand += 1;
    n += 1;
  }
  return n;
}

/**
 * Das zuletzt gezeichnete Bild eines Blocks, als Platzhalter für seinen
 * Nachfolger.
 *
 * @param {string} schluessel Kennzeichen des Blocks (Ansicht, Dokument, Inhalt).
 * @param {string} html Inhalt des Containers.
 * @param {boolean} undrawable Der Container zeigt einen Hinweis.
 */
export function merkeBild(schluessel, html, undrawable) {
  BILDER.delete(schluessel);
  BILDER.set(schluessel, { html: String(html || ''), undrawable: !!undrawable });
  if (BILDER.size > MAX_BILDER) BILDER.delete(BILDER.keys().next().value);
}

/**
 * @param {string} schluessel
 * @returns {{html: string, undrawable: boolean}|null}
 */
export function letztesBild(schluessel) {
  return BILDER.get(schluessel) || null;
}
