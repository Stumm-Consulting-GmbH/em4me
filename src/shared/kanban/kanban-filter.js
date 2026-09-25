// 4T-001907 (Epic 3E-000318): Der Filter der Tafel — welche Karten zu einem
// Suchtext passen, je Spalte gezählt (Story 4S-000983).
//
// Prozessneutral wie die Nachbarn und wie das Vorbild `canvas-filter.js`:
// reine Funktionen, kein DOM, kein Electron, kein Datei-Zugriff, keine Sprache.
// Die Regel ist damit ohne Anzeige prüfbar, und die Anzeige bekommt ihre
// Treffer geliefert, statt ein zweites Mal zu suchen.
//
// **Die Treffer-Regel ist die der räumlichen Arbeitsfläche und damit die der
// Kommando-Palette** (Entscheidung im Epic vom 2026-09-21: Die Suche folgt dem
// Muster der Canvas-Fläche). Der Suchtext wird getrimmt und locale-korrekt
// kleingeschrieben und dann als **eine** Teilzeichenkette gesucht: kein
// Zerlegen in Wörter, kein Muster, kein unscharfer Treffer. Normalisierung und
// Fundstellen werden **wiederverwendet** statt nachgeschrieben
// (`normalisiereCanvasSuche`, `fundStellen`); drei Filter-Felder derselben
// Anwendung, die bei derselben Eingabe Verschiedenes finden, wären für den
// Anwender nicht erklärbar, und eine zweite Normalisierung liefe beim
// nächsten Eingriff auseinander.
//
// **Durchsucht wird der Dokument-Text der Karte**: ihre Aufgaben-Zeile ohne
// Kästchen (`karte.text`) und jede eingerückte Folgezeile, wie sie im
// Dokument steht. Die Tags stehen in diesem Text und werden dadurch gefunden,
// **unabhängig davon, ob die Tafel sie im Text oder am Kartenfuß zeigt**
// (4T-001904): Der Kartenfuß ist eine Darstellung, keine zweite Quelle. Aus
// demselben Grund findet die Suche auch einen Termin des Vorbild-Werkzeugs,
// den die Karte als Abzeichen statt als Text zeigt.
'use strict';

const { fundStellen, normalisiereCanvasSuche } = require('../canvas/canvas-filter.js');
const { ohneCr } = require('./kanban-core.js');

/**
 * Normalisiert die Roh-Eingabe des Filter-Feldes der Tafel — dieselbe Regel
 * wie auf der räumlichen Arbeitsfläche und in der Kommando-Palette.
 *
 * @param {string} text Roh-Eingabe.
 * @returns {string} normalisierter Suchtext; leer, wenn nicht gefiltert wird.
 */
function normalisiereTafelSuche(text) {
  return normalisiereCanvasSuche(text);
}

// Die Funde einer Karte zu einem bereits normalisierten Suchtext, oder null.
// Die Fundstellen stehen im Original-Wert (Rückgabe-Form von `fundStellen`);
// eine Hervorhebung im Karten-Text ist keine Zusage dieses Vorgangs, die
// Stellen werden aber mitgeliefert, damit eine spätere Anzeige nicht ein
// zweites Mal sucht.
function kartenFunde(karte, zeilen, nadel) {
  if (!karte || !nadel) return null;
  const imText = fundStellen(karte.text, nadel);
  const folge = [];
  const liste = Array.isArray(zeilen) ? zeilen : [];
  for (const nr of Array.isArray(karte.folgeZeilen) ? karte.folgeZeilen : []) {
    const stellen = fundStellen(ohneCr(String(liste[nr] == null ? '' : liste[nr])), nadel);
    if (stellen !== null) folge.push({ zeile: nr, stellen });
  }
  if (imText === null && folge.length === 0) return null;
  return { text: imText, folge };
}

/**
 * Trägt die Karte den Suchtext — in ihrem Text, ihren Tags oder einer ihrer
 * Folgezeilen?
 *
 * @param {object} karte Karte aus dem Modell von `leseTafel`.
 * @param {string[]} zeilen Zeilen-Puffer des Modells.
 * @param {string} suche Roh-Eingabe des Filter-Feldes.
 * @returns {boolean} bei leerer Suche immer `true` — ohne Suchtext wird nicht
 *   gefiltert.
 */
function karteTrifft(karte, zeilen, suche) {
  const nadel = normalisiereTafelSuche(suche);
  if (!nadel) return true;
  return kartenFunde(karte, zeilen, nadel) !== null;
}

/**
 * Filtert die Karten aller Spalten einer Tafel.
 *
 * **Jede Spalte erscheint im Ergebnis**, auch eine ohne Treffer: Die Tafel
 * behält beim Filtern alle Spalten (AK4 der Story), und die Anzeige ordnet
 * über die Nummer der Spalte zu. Die Karten werden über ihre **Zeilen-Nummer**
 * genannt, weil die Zeile ihre Kennung im Dokument ist und die Zeichnung sie
 * an jedem Karten-Element führt.
 *
 * @param {object} model Modell aus `leseTafel`.
 * @param {string} suche Roh-Eingabe des Filter-Feldes.
 * @returns {{aktiv: boolean, suche: string, treffer: number, gesamt: number,
 *   spalten: Array<{treffer: number, gesamt: number, kartenZeilen: Set<number>,
 *   funde: Map<number, object>}>}} Bei leerer Suche ist `aktiv` falsch und
 *   jede Karte ein Treffer, ohne Funde.
 */
function tafelFiltern(model, suche) {
  const nadel = normalisiereTafelSuche(suche);
  const zeilen = model && Array.isArray(model.zeilen) ? model.zeilen : [];
  const spalten = model && Array.isArray(model.spalten) ? model.spalten : [];
  const ergebnis = { aktiv: nadel !== '', suche: nadel, treffer: 0, gesamt: 0, spalten: [] };
  for (const spalte of spalten) {
    const karten = Array.isArray(spalte && spalte.karten) ? spalte.karten : [];
    const eintrag = {
      treffer: 0,
      gesamt: karten.length,
      kartenZeilen: new Set(),
      funde: new Map(),
    };
    for (const karte of karten) {
      const funde = nadel ? kartenFunde(karte, zeilen, nadel) : null;
      if (nadel && funde === null) continue;
      eintrag.kartenZeilen.add(karte.zeile);
      if (funde) eintrag.funde.set(karte.zeile, funde);
    }
    eintrag.treffer = eintrag.kartenZeilen.size;
    ergebnis.treffer += eintrag.treffer;
    ergebnis.gesamt += eintrag.gesamt;
    ergebnis.spalten.push(eintrag);
  }
  return ergebnis;
}

module.exports = { normalisiereTafelSuche, karteTrifft, tafelFiltern };
