// 4T-001882 (Epic 3E-000185, Story 4S-000993): Datenmodell der eigenen
// Arbeitsmodi.
//
// Ein eigener Modus ist ein benannter Schnappschuss des Schalter-Stands:
//   { id, name, disabled: [Kennung] }
//   id        technische Kennung, dem Anwender unsichtbar
//   name      der vom Anwender vergebene Name (ohne umschliessende Leerzeichen)
//   disabled  die Kennungen der Erweiterungen, die in diesem Modus
//             ABGESCHALTET sind — dieselbe Liste, die `extensions.disabled`
//             traegt (Story 4S-000993, AK7)
//
// **Warum die Abschalt-Liste und nicht die Einschalt-Liste:** Beides waere
// darstellbar, aber nur eine der beiden Formen beantwortet die Frage nach einer
// spaeter hinzugekommenen Erweiterung von selbst. Wer festhaelt, was AUS ist,
// laesst alles Neue an; wer festhielte, was AN ist, schaltete jede kuenftige
// Erweiterung bei jedem Anwenden eines alten Modus ab. Die Form ist damit die
// Regel selbst, und nicht bloss ihr Traeger.
//
// **Bewusst OHNE Registry-Wissen beim Speichern** (Muster
// src/shared/sidebar-variants.js): Eine Kennung, die es gerade nicht gibt,
// bleibt in der Ablage stehen und ueberlebt so ein Abschalten und spaeteres
// Wiedereinfuehren einer Erweiterung. Gegen die AKTUELLE Registry gemessen wird
// erst beim Anwenden (`disabledIdsForExtensionMode`) und beim Vergleich
// (`matchingExtensionMode`) — genau die beiden Stellen, an denen die Antwort
// von der Gegenwart abhaengt.
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein DOM): Der
// Renderer fuehrt damit die Liste, die Prueffaelle laden es ohne Umgebung.
'use strict';

const { normalizeDisabledIds } = require('./extensions-core.js');

// Schluessel der Ablage im globalen Einstellungs-Speicher — neben
// `extensions.disabled`, dem Schalter-Stand selbst (EXTENSIONS_DISABLED_KEY in
// extensions.js). Der Weg durch die Ablage-Regel der Architektur steht im
// Loesungs-Kapitel von 4T-001882.
const EXTENSION_MODES_KEY = 'extensions.modes';

// Kennungs-Liste eines gespeicherten Modus saeubern: nur nicht-leere
// Zeichenketten, keine Duplikate, Reihenfolge erhalten. Unbekannte Kennungen
// bleiben ausdruecklich stehen (siehe Kopf).
function sanitizeModeDisabledIds(raw) {
  if (!Array.isArray(raw)) return [];
  const aus = [];
  for (const id of raw) {
    if (typeof id !== 'string' || id === '' || aus.includes(id)) continue;
    aus.push(id);
  }
  return aus;
}

// Einen Modus saeubern; ohne Kennung oder ohne nicht-leeren Namen null.
// Umschliessende Leerzeichen des Namens entfallen, alles Uebrige daran bleibt
// unveraendert — Umlaute, Sonderzeichen und innere Leerzeichen (AK18).
function sanitizeExtensionMode(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (id === '' || name === '') return null;
  return { id, name, disabled: sanitizeModeDisabledIds(raw.disabled) };
}

// Liste saeubern: ungueltige Eintraege entfallen, doppelte Kennungen auf das
// erste Vorkommen reduziert (Muster normalizeSidebarVariantList).
//
// Doppelte NAMEN werden hier NICHT angefasst: Sie entstehen im regulaeren
// Betrieb nicht (die Oberflaeche fragt zurueck, das Einlesen einer fremden
// Einrichtung benennt um), und eine stille Umbenennung beim Laden aenderte den
// Bestand des Anwenders ohne Anlass.
function normalizeExtensionModeList(raw) {
  if (!Array.isArray(raw)) return [];
  const gesehen = new Set();
  const aus = [];
  for (const eintrag of raw) {
    const modus = sanitizeExtensionMode(eintrag);
    if (!modus || gesehen.has(modus.id)) continue;
    gesehen.add(modus.id);
    aus.push(modus);
  }
  return aus;
}

function extensionModeById(list, id) {
  return (Array.isArray(list) ? list : []).find((m) => m.id === id) || null;
}

// Namens-Vergleich fuer die Rueckfrage beim Speichern und fuer die Pruefung
// beim Umbenennen. Verglichen wird der getrimmte Name Zeichen fuer Zeichen:
// Gross- und Kleinschreibung unterscheidet, weil sie im Namen des Anwenders
// einen Unterschied macht.
function extensionModeByName(list, name) {
  const gesucht = typeof name === 'string' ? name.trim() : '';
  if (gesucht === '') return null;
  return (Array.isArray(list) ? list : []).find((m) => m.name === gesucht) || null;
}

// Der Schalter-Stand, den das Anwenden dieses Modus schreibt: seine
// Abschalt-Liste, gemessen an der AKTUELLEN Registry. Kennungen, die es nicht
// mehr gibt, entfallen dabei (AK8); eine hinzugekommene Erweiterung, die der
// Modus nicht nennt, bleibt eingeschaltet (AK9) — sie steht schlicht nicht in
// der Liste.
//
// Der Abhaengigkeits-Schutz bleibt davon unberuehrt: Geschrieben wird die rohe
// Liste, und die Wirkung leitet der Kern daraus ab wie bei jedem anderen
// Schalter-Stand (effectiveDisabledSet). Ein mitgebrachter Modus mit einer
// unzulaessigen Zusammenstellung — Grundlage aus, Abhaengige darin an — wird
// deshalb behandelt wie ein mitgebrachter Schalter-Stand: Die Abhaengige wirkt
// als abgeschaltet, nichts wird selbsttaetig umgeschrieben (AK17).
function disabledIdsForExtensionMode(modus, list) {
  if (!modus) return [];
  return normalizeDisabledIds(modus.disabled, list);
}

// Welcher eigene Modus entspricht diesem Schalter-Stand? Geliefert wird der
// erste passende oder null.
//
// Gemessen wird wie bei den festen Modi gegen die ROH gespeicherte Liste, aber
// beidseitig normalisiert: Ein Modus, der eine entfallene Kennung nennt, gilt
// als der Stand, den sein Anwenden erzeugt — sonst stuende die Anzeige
// unmittelbar nach dem Anwenden auf «Angepasst».
function matchingExtensionMode(rawDisabled, modes, list) {
  const ist = new Set(normalizeDisabledIds(rawDisabled, list));
  for (const modus of Array.isArray(modes) ? modes : []) {
    const soll = disabledIdsForExtensionMode(modus, list);
    if (soll.length !== ist.size) continue;
    if (soll.every((id) => ist.has(id))) return modus;
  }
  return null;
}

module.exports = {
  EXTENSION_MODES_KEY,
  sanitizeModeDisabledIds,
  sanitizeExtensionMode,
  normalizeExtensionModeList,
  extensionModeById,
  extensionModeByName,
  disabledIdsForExtensionMode,
  matchingExtensionMode,
};
