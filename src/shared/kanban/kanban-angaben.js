// 4T-001957 (Epic 3E-000319, Story 4S-000985): Die Angaben der verlinkten
// Notiz auf der Karte — was sich aus Feldwahl, Kopf-Daten und Tafel-Modell
// allein ableiten lässt.
//
// **Warum ein eigenes Modul und nicht der Format-Kern.** Der Kern liest und
// schreibt das Tafel-Dokument; hier geht es um den Kopf eines **anderen**
// Dokuments und seine Darstellung. Beide Prozess-Seiten brauchen dieselben
// Regeln: Der Hauptprozess wählt die Schlüssel aus und erkennt Bild-Werte, bevor
// er Bilder liest; der Anzeige-Prozess sammelt die Ziele und zeichnet die
// Zeilen. Eine Kopie auf jeder Seite liefe beim nächsten Wert-Typ auseinander.
//
// **Werte werden Text, nie Markup.** Eine Zeichenkette bleibt, wie sie ist;
// Zahl und Wahrheitswert werden zu ihrer Schreibweise; eine Liste wird mit
// Komma verbunden; ein verschachtelter Wert erscheint als kompaktes JSON. Die
// Einstellung `containsMarkdown` der Feldwahl wird in dieser Stufe nicht
// gerendert (Grenze, im Vorgang vermerkt).
//
// Prozessneutral (CJS, reine Daten und Funktionen), Muster der Nachbarn.
'use strict';

const { ersterVerweisMitZielDerKarte } = require('./kanban-core.js');
const { istBildDatei } = require('../bild-endungen.js');

// Ein Wert, der ganz aus einem Wiki-Verweis besteht: `[[bild.png]]` oder
// `![[bild.png|200]]`. Ein `[` im Inneren macht ihn ungültig, wie im
// Render-Plugin.
const WIKI_WERT_RE = /^!?\[\[([^[\]]+)\]\]$/;
// Ein Adress-Schema wie `https:` oder `data:`. Ein Laufwerks-Buchstabe `C:\`
// ist keins — der Pfad bleibt ein Pfad, und die Grenze prüft der Hauptprozess.
const SCHEMA_RE = /^[a-z][a-z0-9+.-]*:/i;
const LAUFWERK_RE = /^[a-z]:[\\/]/i;

/**
 * Die Feldwahl einer Tafel als bereinigte Liste.
 *
 * @param {*} wert `wirksam.feldwahl.wert` aus der Auflösungs-Kette.
 * @returns {Array<{feld: string, bezeichnung: string, bezeichnungVerbergen: boolean,
 *   enthaeltMarkdown: boolean}>} leer, wenn nichts gewählt ist (Entscheidung C2).
 */
function feldwahlAus(wert) {
  if (!Array.isArray(wert)) return [];
  const gesehen = new Set();
  const liste = [];
  for (const eintrag of wert) {
    const feld = eintrag && typeof eintrag.feld === 'string' ? eintrag.feld.trim() : '';
    if (!feld || gesehen.has(feld)) continue;
    gesehen.add(feld);
    liste.push({
      feld,
      bezeichnung: typeof eintrag.bezeichnung === 'string' ? eintrag.bezeichnung.trim() : '',
      bezeichnungVerbergen: eintrag.bezeichnungVerbergen === true,
      enthaeltMarkdown: eintrag.enthaeltMarkdown === true,
    });
  }
  return liste;
}

/** Der Anzeige-Name einer Angabe: ihre Bezeichnung, sonst ihr Schlüssel. */
function angabenName(eintrag) {
  return eintrag.bezeichnung ? eintrag.bezeichnung : eintrag.feld;
}

function einzelwertAlsText(wert) {
  if (wert == null) return '';
  if (typeof wert === 'string') return wert;
  if (typeof wert === 'number' || typeof wert === 'boolean') return String(wert);
  return JSON.stringify(wert);
}

/**
 * Ein Wert aus dem Dokument-Kopf als Zeichenkette.
 *
 * @param {*} wert
 * @returns {string|null} `null`, wenn es keinen Wert gibt — dann entfällt die
 *   Zeile auf der Karte, statt «Name:» ohne Wert zu zeigen.
 */
function angabeAlsText(wert) {
  if (wert == null) return null;
  if (Array.isArray(wert)) {
    const teile = wert.map(einzelwertAlsText).filter((teil) => teil.trim() !== '');
    return teile.length > 0 ? teile.join(', ') : null;
  }
  if (typeof wert === 'object') {
    return Object.keys(wert).length > 0 ? JSON.stringify(wert) : null;
  }
  const text = einzelwertAlsText(wert);
  return text.trim() === '' ? null : text;
}

/**
 * Verweist der Wert auf eine Bilddatei? Dann der Pfad, sonst `null`.
 *
 * Erkannt werden ein Pfad mit Bild-Endung und ein Wiki-Verweis `[[bild.png]]`
 * oder `![[bild.png]]` (Anker und Größenangabe fallen weg). Eine Adresse mit
 * Schema wird nie ein Bild: Die Anwendung lädt keine Inhalte aus dem Netz.
 *
 * @param {*} wert
 * @returns {string|null}
 */
function bildVerweisAus(wert) {
  if (typeof wert !== 'string') return null;
  const text = wert.trim();
  if (!text || /[\r\n]/.test(text)) return null;
  const wiki = WIKI_WERT_RE.exec(text);
  const pfad = wiki ? wiki[1].split('|')[0].split('#')[0].trim() : text;
  if (!pfad) return null;
  if (SCHEMA_RE.test(pfad) && !LAUFWERK_RE.test(pfad)) return null;
  return istBildDatei(pfad) ? pfad : null;
}

/**
 * Die gewählten Angaben aus einem gelesenen Dokument-Kopf.
 *
 * @param {*} daten Frontmatter-Objekt (oder `null`).
 * @param {string[]} schluessel die gewählten Schlüssel in ihrer Reihenfolge.
 * @returns {Array<{schluessel: string, text: string, bild: string|null}>} nur
 *   Schlüssel mit vorhandenem Wert; `bild` ist der Pfad eines Bild-Werts, den
 *   der Hauptprozess erst noch auflösen muss.
 */
function angabenAusKopf(daten, schluessel) {
  if (!daten || typeof daten !== 'object' || Array.isArray(daten)) return [];
  const liste = [];
  for (const name of Array.isArray(schluessel) ? schluessel : []) {
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(daten, name)) continue;
    const text = angabeAlsText(daten[name]);
    if (text === null) continue;
    liste.push({ schluessel: name, text, bild: bildVerweisAus(daten[name]) });
  }
  return liste;
}

/**
 * Die gebündelte Anfrage einer Tafel: je Karte ihr maßgebliches Ziel.
 *
 * Eine Karte ohne Verweis mit Ziel fehlt. Ebenso eine Karte, deren Verweis in
 * einen verknüpften Bereich führt (`[[@kuerzel:Ziel]]`): Die Auflösung über
 * die Bereichs-Grenze ist in dieser Stufe nicht angeschlossen (Grenze, im
 * Vorgang vermerkt).
 *
 * @param {object} model Modell aus `leseTafel`.
 * @param {Array} feldwahl Liste aus `feldwahlAus`.
 * @returns {null|{schluessel: string[], ziele: string[],
 *   karten: Array<{spalte: number, karte: number, ziel: string}>}} `null`, wenn
 *   nichts anzufragen ist — leere Feldwahl oder keine Karte mit Ziel.
 */
function angabenAnfrage(model, feldwahl) {
  if (!Array.isArray(feldwahl) || feldwahl.length === 0) return null;
  if (!model || !model.istTafel || !Array.isArray(model.spalten)) return null;
  const karten = [];
  const ziele = new Set();
  model.spalten.forEach((spalte, spalteNr) => {
    spalte.karten.forEach((karte, kartenNr) => {
      const verweis = ersterVerweisMitZielDerKarte(model, karte);
      if (!verweis || verweis.bereich) return;
      karten.push({ spalte: spalteNr, karte: kartenNr, ziel: verweis.ziel });
      ziele.add(verweis.ziel);
    });
  });
  if (karten.length === 0) return null;
  return { schluessel: feldwahl.map((eintrag) => eintrag.feld), ziele: [...ziele], karten };
}

module.exports = {
  feldwahlAus,
  angabenName,
  angabeAlsText,
  bildVerweisAus,
  angabenAusKopf,
  angabenAnfrage,
};
