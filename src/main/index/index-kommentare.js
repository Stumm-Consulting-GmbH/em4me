// 4T-002863 (Epic 3E-000449): Private Kommentare im Such-Index.
//
// **Was hier geschieht.** Der Index liest den Rumpf eines Dokuments ohne seine
// privaten Kommentare ein, solange die Erweiterung «Private Kommentare»
// eingeschaltet ist. Treffer, Ausschnitte, Schlagworte, Verweise, Aufgaben und
// Erinnerungen entstehen damit aus dem Text, den die Anzeige zeigt; was nur in
// einem Kommentar steht, zählt nicht (Entscheidung des Auftraggebers zu
// Punkt 87, Option A, Story 4S-001260).
//
// **Eine Quelle für die Erkennung.** Bereinigt wird mit derselben Funktion wie
// in der Anzeige (`textOhneKommentare`, portable-fences.js) und mit ihrem
// Zerleger (markdown.js). Erst das Laden des Zerlegers meldet im Haupt-Prozess
// die Code-Frage an; ohne sie gälte die sichere Seite, und alles nach dem
// ersten Marker fiele aus dem Index. Geladen wird er erst beim ersten Dokument
// mit Marker, damit ein Bereich ohne Kommentare nichts dafür zahlt. Der
// Preload lädt ihn zwar ebenfalls (auch über extensions/extension-loader.js),
// das ist aber die Anzeige-Seite mit eigener Instanz; im Haupt-Prozess lädt
// ihn sonst nur der Export mit Inhaltsverzeichnis (portable-fences.js), ebenso
// erst bei Bedarf.
//
// **Der Zustand wird eingeschleust**, wie beim Schalter des Datensatz-Bestands
// (index-schalter.js): gesetzt beim Start (ipc/index-views.js) und bei jedem
// Umlegen der Erweiterungen (ipc/settings-verteilung.js), dort mit Neuaufbau,
// wenn sich «Private Kommentare» geändert hat. Ohne Aufruf gilt «an», wie ab
// Werk.
//
// **Der Kopf-Block bleibt roh**, wie in der Anzeige (`fm.body`): Ein `%%` in
// einem Eigenschafts-Wert ist dort Text.
'use strict';

const { textOhneKommentare } = require('../../shared/markdown/portable-fences.js');

let deaktiviert = new Set();
let zerlegerModul = null;
// Zählt jedes Setzen der Erweiterungen; auch andere Erweiterungen ändern die
// Zerlegung. Gemerkte Ergebnisse (teil-kommentare.js) gelten nur zum selben Stand.
let regelZaehler = 0;

/** Stand der gesetzten Erweiterungen, für gemerkte Ergebnisse. */
function regelStand() {
  return regelZaehler;
}

/**
 * Liest der Index ohne private Kommentare?
 *
 * @returns {boolean} true, solange die Erweiterung «Private Kommentare» an ist.
 */
function kommentareAusblenden() {
  return !deaktiviert.has('comments');
}

/**
 * Setzt die wirksam abgeschalteten Erweiterungen und sagt, ob sich die Regel
 * des Index dabei geändert hat.
 *
 * @param {Iterable<string>} effektivDeaktiviert Wirksam abgeschaltete Erweiterungen.
 * @returns {boolean} true, wenn «Private Kommentare» vorher anders stand.
 */
function setzeKommentarRegel(effektivDeaktiviert) {
  const vorher = kommentareAusblenden();
  deaktiviert = new Set(effektivDeaktiviert || []);
  regelZaehler++;
  if (zerlegerModul) zerlegerModul.configureExtensions([...deaktiviert]);
  return vorher !== kommentareAusblenden();
}

function zerleger() {
  if (!zerlegerModul) {
    zerlegerModul = require('../../shared/markdown/markdown.js');
    zerlegerModul.configureExtensions([...deaktiviert]);
  }
  return zerlegerModul.md;
}

/**
 * Ein Text ohne private Kommentare, nach der geltenden Regel; zeilentreu.
 *
 * @param {string} text Rumpf eines Dokuments.
 * @returns {string}
 */
function textOhnePrivateKommentare(text) {
  if (!kommentareAusblenden() || !text.includes('%%')) return text;
  return textOhneKommentare(text, deaktiviert, zerleger());
}

/**
 * Die Zeilen eines Dokuments, der Rumpf ab `rumpfAb` ohne private Kommentare.
 * Die Zahl der Zeilen bleibt gleich (Fundstellen sind Zeilennummern); ohne
 * Änderung kommt dasselbe Feld zurück.
 *
 * Bei einem Teil eines geteilten Dokuments steht die Bereinigung schon fest,
 * weil sie am zusammengesetzten Dokument erfolgt (teil-kommentare.js); sie
 * kommt dann als `rumpfZeilen` herein und ersetzt den Rumpf.
 *
 * @param {string[]} zeilen Rohe Zeilen.
 * @param {number} rumpfAb Index der ersten Zeile nach dem Kopf-Block.
 * @param {string[]|null} [rumpfZeilen] Bereinigte Rumpf-Zeilen eines Teils.
 * @returns {string[]}
 */
function zeilenOhneKommentare(zeilen, rumpfAb, rumpfZeilen) {
  if (!kommentareAusblenden()) return zeilen;
  if (Array.isArray(rumpfZeilen)) return zeilen.slice(0, rumpfAb).concat(rumpfZeilen);
  const rumpf = zeilen.slice(rumpfAb).join('\n');
  const sauber = textOhnePrivateKommentare(rumpf);
  if (sauber === rumpf) return zeilen;
  return zeilen.slice(0, rumpfAb).concat(sauber.split('\n'));
}

module.exports = {
  kommentareAusblenden,
  regelStand,
  setzeKommentarRegel,
  textOhnePrivateKommentare,
  zeilenOhneKommentare,
};
