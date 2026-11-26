// 4T-002641 (Epic 3E-000397): Lese-Position je Dokument merken und herstellen.
//
// **Zweck.** Der Kern prüft eine gemerkte Lese-Stelle (oberste sichtbare Zeile
// und Schreibmarke), begrenzt sie auf das Dokument, in dem sie hergestellt wird,
// und führt die Tabelle der Stellen je Pfad: Nachschlagen, Vermerken mit
// Verdrängung des ältesten Eintrags und Umbenennen. Prozessneutral: CommonJS,
// ohne Electron, ohne DOM, ohne Datei-Zugriff; die Ablage der Tabelle ist Sache
// des Aufrufers.
//
// **Form der Tabelle.** `{ <Pfad>: { zeileOben, schreibmarke, zuletzt } }`;
// `schreibmarke` ist `null` oder `{ zeile, spalte }`, `zuletzt` ein Zeitpunkt
// in Millisekunden. Pfade gelten als gleich, wenn ihr Vergleichs-Schlüssel
// (`pathCompareKey`) gleich ist; gespeichert wird die zuletzt übergebene
// Schreibweise.
//
// **Strenge.** Eine Stelle mit einem ungültigen Teil ist insgesamt ungültig:
// keine Rundung, keine Zahl aus Text, keine Teil-Übernahme. Alle Funktionen sind
// rein und geben neue Objekte zurück; die Eingaben bleiben unverändert.
'use strict';

const { pathCompareKey } = require('./platform');

/** Höchste zulässige Zeile und Spalte. */
const MAX_ZEILE = 10_000_000;
/** Vorgabe für die Zahl der Einträge der Tabelle. */
const MAX_EINTRAEGE = 500;

function istEinfachesObjekt(wert) {
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return false;
  const proto = Object.getPrototypeOf(wert);
  return proto === Object.prototype || proto === null;
}

function istGanzeZahlIn(wert, min, max) {
  return Number.isInteger(wert) && wert >= min && wert <= max;
}

// `__proto__` ist als Schlüssel eines schlichten Objekts kein Eintrag, sondern
// der Prototyp; ein solcher «Pfad» wird deshalb wie ein ungültiger behandelt.
function istPfad(wert) {
  return typeof wert === 'string' && wert.length > 0 && wert !== '__proto__';
}

// Liefert den vorhandenen Schlüssel der Tabelle mit gleichem Vergleichs-Schlüssel.
function vorhandenerSchluessel(tabelle, pfad) {
  const ziel = pathCompareKey(pfad);
  for (const schluessel of Object.keys(tabelle)) {
    if (pathCompareKey(schluessel) === ziel) return schluessel;
  }
  return null;
}

function kopie(tabelle) {
  return istEinfachesObjekt(tabelle) ? { ...tabelle } : {};
}

/**
 * Prüft eine rohe Stelle streng.
 * @returns {{zeileOben:number, schreibmarke:null|{zeile:number, spalte:number}}|null}
 */
function normalisiereStelle(roh) {
  if (!istEinfachesObjekt(roh)) return null;
  if (!istGanzeZahlIn(roh.zeileOben, 1, MAX_ZEILE)) return null;
  const marke = roh.schreibmarke;
  if (marke === undefined || marke === null) {
    return { zeileOben: roh.zeileOben, schreibmarke: null };
  }
  if (!istEinfachesObjekt(marke)) return null;
  if (!istGanzeZahlIn(marke.zeile, 1, MAX_ZEILE)) return null;
  if (!istGanzeZahlIn(marke.spalte, 0, MAX_ZEILE)) return null;
  return {
    zeileOben: roh.zeileOben,
    schreibmarke: { zeile: marke.zeile, spalte: marke.spalte },
  };
}

/**
 * Begrenzt eine Stelle auf ein Dokument mit `zeilenZahl` Zeilen. Musste die
 * Zeile der Schreibmarke gekürzt werden, gilt das Ende der letzten Zeile
 * (`amZeilenEnde: true`).
 */
function stelleFuerDokument(stelle, zeilenZahl) {
  const geprueft = normalisiereStelle(stelle);
  if (!geprueft) return null;
  if (!istGanzeZahlIn(zeilenZahl, 1, Number.MAX_SAFE_INTEGER)) return null;
  const zeileOben = Math.min(geprueft.zeileOben, zeilenZahl);
  const marke = geprueft.schreibmarke;
  if (!marke) return { zeileOben, schreibmarke: null };
  const gekuerzt = marke.zeile > zeilenZahl;
  return {
    zeileOben,
    schreibmarke: {
      zeile: gekuerzt ? zeilenZahl : marke.zeile,
      spalte: marke.spalte,
      amZeilenEnde: gekuerzt,
    },
  };
}

/** Stelle des Eintrags zu `pfad` (nach Vergleichs-Schlüssel) oder `null`. */
function findeStelle(tabelle, pfad) {
  if (!istEinfachesObjekt(tabelle) || !istPfad(pfad)) return null;
  const schluessel = vorhandenerSchluessel(tabelle, pfad);
  if (schluessel === null) return null;
  return normalisiereStelle(tabelle[schluessel]);
}

/**
 * Vermerkt die Stelle zu `pfad` mit Zeitpunkt `zeitpunkt`. Bei mehr als `max`
 * Einträgen fallen die ältesten heraus; der soeben vermerkte bleibt.
 */
function vermerkeStelle(tabelle, pfad, stelle, zeitpunkt, max = MAX_EINTRAEGE) {
  const geprueft = normalisiereStelle(stelle);
  if (!geprueft || !istPfad(pfad) || typeof zeitpunkt !== 'number' || !Number.isFinite(zeitpunkt)) {
    return tabelle;
  }
  const neu = kopie(tabelle);
  const alt = vorhandenerSchluessel(neu, pfad);
  if (alt !== null) delete neu[alt];
  neu[pfad] = { ...geprueft, zuletzt: zeitpunkt };
  const grenze = Number.isInteger(max) && max >= 1 ? max : MAX_EINTRAEGE;
  let schluessel = Object.keys(neu);
  while (schluessel.length > grenze) {
    let aeltester = null;
    for (const s of schluessel) {
      if (s === pfad) continue;
      const z =
        istEinfachesObjekt(neu[s]) && Number.isFinite(neu[s].zuletzt) ? neu[s].zuletzt : -Infinity;
      if (aeltester === null || z < aeltester.z) aeltester = { s, z };
    }
    if (aeltester === null) break;
    delete neu[aeltester.s];
    schluessel = Object.keys(neu);
  }
  return neu;
}

/** Führt den Eintrag von `alt` unter `neu` weiter; ohne Eintrag unverändert. */
function benenneUm(tabelle, alt, neu) {
  if (!istEinfachesObjekt(tabelle) || !istPfad(alt) || !istPfad(neu)) return tabelle;
  const quelle = vorhandenerSchluessel(tabelle, alt);
  if (quelle === null) return tabelle;
  const ergebnis = kopie(tabelle);
  const eintrag = ergebnis[quelle];
  delete ergebnis[quelle];
  const ziel = vorhandenerSchluessel(ergebnis, neu);
  if (ziel !== null) delete ergebnis[ziel];
  ergebnis[neu] = { ...eintrag };
  return ergebnis;
}

module.exports = {
  MAX_ZEILE,
  MAX_EINTRAEGE,
  normalisiereStelle,
  stelleFuerDokument,
  findeStelle,
  vermerkeStelle,
  benenneUm,
};
