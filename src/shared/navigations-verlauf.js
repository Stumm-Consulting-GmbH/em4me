// 4T-002642 (Epic 3E-000397): Verlauf der besuchten Orte für «Zurück» und «Vor».
//
// **Zweck.** Der Kern führt die Liste der besuchten Orte eines Fensters samt
// Zeiger auf den aktuellen Ort: Besuchen schneidet den Vorwärts-Teil ab und
// legt einen Eintrag an oder fasst ihn mit dem aktuellen zusammen, «Zurück» und
// «Vor» bewegen den Zeiger, nicht mehr vorhandene Orte lassen sich entfernen und
// umbenannte Dokumente nachziehen. Prozessneutral: CommonJS, ohne Electron, ohne
// DOM; welche Bedienung einen Besuch auslöst, ist Sache des Aufrufers.
//
// **Form eines Eintrags.** `{ schluessel, pfad, stelle }`: `schluessel` ist eine
// nicht-leere Zeichenkette, die der Aufrufer bildet und die der Kern allein auf
// Gleichheit vergleicht; `pfad` ist eine Zeichenkette oder `null` (Seite ohne
// Pfad); `stelle` ist `null` oder eine Stelle im Sinn von `normalisiereStelle`
// aus `lese-stelle.js` (eine ungültige Stelle wird `null`, der Eintrag gilt
// trotzdem).
//
// **Nähe.** Zwei Orte gelten als nah, wenn ihr Schlüssel gleich ist und die
// obersten Zeilen ihrer Stellen weniger als `nah` Zeilen auseinanderliegen;
// fehlt eine der beiden Stellen, nur dann, wenn beide fehlen. Ein naher Besuch
// legt keinen neuen Eintrag an, sondern aktualisiert den aktuellen.
//
// **Reinheit.** Keine Funktion verändert übergebene Objekte; nach außen gehen
// nur Kopien.
'use strict';

const { normalisiereStelle } = require('./lese-stelle');

/** Vorgabe für die Zahl der Einträge. */
const MAX_EINTRAEGE = 100;
/** Vorgabe für den Zeilen-Abstand, unter dem zwei Stellen zusammengefasst werden. */
const NAH_ZEILEN = 10;

function istSchluessel(wert) {
  return typeof wert === 'string' && wert.length > 0;
}

function kopiereStelle(stelle) {
  if (!stelle) return null;
  return {
    zeileOben: stelle.zeileOben,
    schreibmarke: stelle.schreibmarke
      ? { zeile: stelle.schreibmarke.zeile, spalte: stelle.schreibmarke.spalte }
      : null,
  };
}

function kopiereEintrag(eintrag) {
  return {
    schluessel: eintrag.schluessel,
    pfad: eintrag.pfad,
    stelle: kopiereStelle(eintrag.stelle),
  };
}

// Prüft einen rohen Eintrag; liefert einen eigenen Eintrag oder null.
function normalisiereEintrag(roh) {
  if (!roh || typeof roh !== 'object') return null;
  if (!istSchluessel(roh.schluessel)) return null;
  const pfad = typeof roh.pfad === 'string' ? roh.pfad : null;
  return { schluessel: roh.schluessel, pfad, stelle: normalisiereStelle(roh.stelle) };
}

function ganzeZahlOder(wert, vorgabe, min) {
  return Number.isInteger(wert) && wert >= min ? wert : vorgabe;
}

/**
 * Erzeugt einen leeren Verlauf.
 * @param {{max?: number, nah?: number}} [optionen] Höchstzahl der Einträge
 *   (mindestens 1) und Zeilen-Abstand, unter dem zusammengefasst wird
 *   (mindestens 0; 0 fasst nie über Stellen hinweg zusammen).
 */
function erzeugeNavigationsVerlauf({ max = MAX_EINTRAEGE, nah = NAH_ZEILEN } = {}) {
  const hoechstzahl = ganzeZahlOder(max, MAX_EINTRAEGE, 1);
  const abstand = ganzeZahlOder(nah, NAH_ZEILEN, 0);
  let eintraege = [];
  let zeiger = -1;

  function istNah(a, b) {
    if (a.schluessel !== b.schluessel) return false;
    if (!a.stelle || !b.stelle) return !a.stelle && !b.stelle;
    return Math.abs(a.stelle.zeileOben - b.stelle.zeileOben) < abstand;
  }

  /** Besucht einen Ort: Vorwärts-Teil abschneiden, zusammenfassen oder anhängen. */
  function besuche(roh) {
    const eintrag = normalisiereEintrag(roh);
    if (!eintrag) return;
    eintraege = eintraege.slice(0, zeiger + 1);
    const aktuell = zeiger >= 0 ? eintraege[zeiger] : null;
    if (aktuell && istNah(aktuell, eintrag)) {
      eintraege[zeiger] = eintrag;
      return;
    }
    eintraege.push(eintrag);
    zeiger = eintraege.length - 1;
    if (eintraege.length > hoechstzahl) {
      const ueber = eintraege.length - hoechstzahl;
      eintraege = eintraege.slice(ueber);
      zeiger -= ueber;
    }
  }

  /** Setzt die Stelle des aktuellen Eintrags (vor dem Verlassen gemessen). */
  function aktualisiereAktuellen(stelle) {
    if (zeiger < 0) return;
    eintraege[zeiger] = { ...eintraege[zeiger], stelle: normalisiereStelle(stelle) };
  }

  function kannZurueck() {
    return zeiger > 0;
  }

  function kannVor() {
    return zeiger >= 0 && zeiger < eintraege.length - 1;
  }

  /** Ein Schritt zurück; Kopie des Ziel-Eintrags oder null. */
  function zurueck() {
    if (!kannZurueck()) return null;
    zeiger -= 1;
    return kopiereEintrag(eintraege[zeiger]);
  }

  /** Ein Schritt vor; Kopie des Ziel-Eintrags oder null. */
  function vor() {
    if (!kannVor()) return null;
    zeiger += 1;
    return kopiereEintrag(eintraege[zeiger]);
  }

  function aktueller() {
    return zeiger >= 0 ? kopiereEintrag(eintraege[zeiger]) : null;
  }

  /**
   * Entfernt alle Einträge, für die das Prädikat (mit einer Kopie) wahr ist.
   * Der Zeiger bleibt auf dem bisherigen Eintrag, sonst auf dem nächstfrüheren
   * verbliebenen, sonst auf dem ersten. Benachbarte nahe Einträge, die dadurch
   * entstehen, werden zusammengelegt; es bleibt der spätere.
   * @returns {number} Zahl der entfernten Einträge.
   */
  function entferneWo(praedikat) {
    if (typeof praedikat !== 'function') return 0;
    let neuerZeiger = -1;
    let entfernt = 0;
    const bleibend = [];
    eintraege.forEach((eintrag, i) => {
      if (praedikat(kopiereEintrag(eintrag))) {
        entfernt += 1;
        return;
      }
      bleibend.push(eintrag);
      if (i <= zeiger) neuerZeiger = bleibend.length - 1;
    });
    if (entfernt === 0) return 0;
    if (neuerZeiger < 0 && bleibend.length > 0) neuerZeiger = 0;
    // Zusammenlegen benachbarter naher Einträge; der Zeiger folgt seinem Eintrag.
    const zusammen = [];
    let zielZeiger = -1;
    bleibend.forEach((eintrag, i) => {
      const letzter = zusammen[zusammen.length - 1];
      if (letzter && istNah(letzter, eintrag)) {
        zusammen[zusammen.length - 1] = eintrag;
      } else {
        zusammen.push(eintrag);
      }
      if (i === neuerZeiger) zielZeiger = zusammen.length - 1;
    });
    entfernt += bleibend.length - zusammen.length;
    eintraege = zusammen;
    zeiger = eintraege.length > 0 ? zielZeiger : -1;
    return entfernt;
  }

  /** Zieht Schlüssel und Pfad aller Einträge eines umbenannten Dokuments nach. */
  function benenneUm(altSchluessel, neuSchluessel, neuPfad) {
    if (!istSchluessel(altSchluessel) || !istSchluessel(neuSchluessel)) return;
    const pfad = typeof neuPfad === 'string' ? neuPfad : null;
    eintraege = eintraege.map((eintrag) =>
      eintrag.schluessel === altSchluessel
        ? { ...eintrag, schluessel: neuSchluessel, pfad }
        : eintrag,
    );
  }

  function leere() {
    eintraege = [];
    zeiger = -1;
  }

  function laenge() {
    return eintraege.length;
  }

  return {
    besuche,
    aktualisiereAktuellen,
    zurueck,
    vor,
    kannZurueck,
    kannVor,
    aktueller,
    entferneWo,
    benenneUm,
    leere,
    laenge,
  };
}

module.exports = { erzeugeNavigationsVerlauf, MAX_EINTRAEGE, NAH_ZEILEN };
