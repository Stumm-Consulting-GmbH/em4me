// 4T-001048 (Epic 3E-000151): Auflösung der Mindmap-Darstellungs-Optionen.
//
// Zwei Ebenen (Konzept-Entscheidung des Product Owners vom 2026-08-14, als
// Abweichung vom dreistufigen Ideen-Text gekennzeichnet): eine anwendungsweite
// Voreinstellung und die Übersteuerung je Dokument über den Kopfbereich-
// Schlüssel `mindmap`. Die Ebene der Bereichs-Begleitdatei ist zurückgestellt.
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein DOM) nach dem
// Muster von mindmap-core.js; das gelebte Vorbild der Auflösung ist die
// Gliederungs-Nummerierung (renderer/modules/heading-numbering.js).
//
// Grundsatz für unzulässige Werte: **still auf die Voreinstellung zurück**,
// nie ein Fehler. Eine Datei bleibt lesbar, auch wenn eine Angabe darin nicht
// verstanden wird; genau so behandelt der Bestand den Kopfbereich.
'use strict';

// Erlaubte Werte der Aufzählungs-Optionen. Sie stehen hier und nicht in der
// Ansicht, damit Einstellungs-Bereich, Auflösung und Prüfung dieselbe Quelle
// lesen.
// 4T-001049: Die Werte benennen die **Lage der Wurzel**, nicht die
// Wuchsrichtung: «links» heißt Wurzel links und Äste nach rechts. Die
// Reihenfolge ist die des Einstellungs-Menüs und folgt der Anschauung
// (waagerecht von links über die Mitte nach rechts, dann senkrecht).
//
// Die frühere Fassung kannte «einseitig» und «beidseitig». Ein
// Umsetzungs-Pfad für Altwerte gibt es bewusst nicht: Die Mindmap-Ansicht ist
// noch nicht ausgeliefert, ein gespeicherter Altwert fällt still auf die
// Voreinstellung zurück, und die traf mit «links» ohnehin das frühere
// «einseitig».
const LAYOUTS = ['links', 'mitte', 'rechts', 'oben', 'unten'];
const LINIENFUEHRUNGEN = ['geschwungen', 'gerade'];

// Voreinstellung ab Werk. `anfangsTiefe: -1` heißt «alles ausgeklappt»
// (Muster initialExpandLevel der Referenz-Vorlage).
const MINDMAP_VORGABEN = {
  layout: 'links',
  linienfuehrung: 'geschwungen',
  farbEinfrierEbene: 1,
  anfangsTiefe: -1,
  hoechstBreite: 320,
};

// Grenzen der Zahl-Optionen. Werte außerhalb gelten als unzulässig und
// fallen zurück, statt eine unbrauchbare Karte zu erzeugen.
const GRENZEN = {
  farbEinfrierEbene: { von: 0, bis: 6 },
  anfangsTiefe: { von: -1, bis: 12 },
  hoechstBreite: { von: 80, bis: 1200 },
};

function istGanzzahlImBereich(wert, grenze) {
  return Number.isInteger(wert) && wert >= grenze.von && wert <= grenze.bis;
}

/**
 * Nimmt aus einem rohen Objekt genau die gültigen Angaben und verwirft alles
 * Übrige. Unbekannte Schlüssel, falsche Typen und Werte außerhalb der Grenzen
 * verschwinden hier; der Aufrufer bekommt nur Brauchbares.
 *
 * @param {*} roh beliebiger Eingang (auch null, Zeichenkette, Liste).
 * @returns {object} Teilmenge der bekannten Optionen.
 */
function normalisiereMindmapOptionen(roh) {
  const aus = {};
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return aus;

  if (LAYOUTS.includes(roh.layout)) aus.layout = roh.layout;
  if (LINIENFUEHRUNGEN.includes(roh.linienfuehrung)) aus.linienfuehrung = roh.linienfuehrung;
  for (const name of ['farbEinfrierEbene', 'anfangsTiefe', 'hoechstBreite']) {
    if (istGanzzahlImBereich(roh[name], GRENZEN[name])) aus[name] = roh[name];
  }
  return aus;
}

/**
 * Effektive Optionen eines Dokuments: Voreinstellung, darüber die gültigen
 * Angaben aus dem Kopfbereich.
 *
 * @param {object} [global] anwendungsweite Voreinstellung (roh oder normalisiert).
 * @param {object} [fmData] geparster Kopfbereich des Dokuments.
 * @returns {object} vollständiger Options-Satz, alle Felder gesetzt.
 */
function resolveMindmapOptionen(global, fmData) {
  const ausGlobal = normalisiereMindmapOptionen(global);
  const ausDokument =
    fmData && typeof fmData === 'object' ? normalisiereMindmapOptionen(fmData.mindmap) : {};
  return { ...MINDMAP_VORGABEN, ...ausGlobal, ...ausDokument };
}

module.exports = {
  MINDMAP_VORGABEN,
  MINDMAP_LAYOUTS: LAYOUTS,
  MINDMAP_LINIENFUEHRUNGEN: LINIENFUEHRUNGEN,
  MINDMAP_GRENZEN: GRENZEN,
  normalisiereMindmapOptionen,
  resolveMindmapOptionen,
};
