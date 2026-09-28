// 4T-001882 (Epic 3E-000185, Story 4S-000993): Laufzeit-Zustand und
// Lebenszyklus der eigenen Arbeitsmodi im Anzeige-Prozess — speichern,
// anwenden, umbenennen, überschreiben, löschen (Vorbild
// src/renderer/modules/sidebar-variants.js).
//
// **Die Liste ist Bestand, kein Schalter-Stand.** Sie liegt global im
// Einstellungs-Speicher unter `extensions.modes`, neben dem Schalter-Stand
// selbst; eine bereichsgebundene zweite Liste entsteht nicht (Entscheidung E7
// des Epics). Das Anwenden eines Modus läuft dagegen nicht über dieses Modul,
// sondern über denselben Weg wie ein fester Modus: Der Einstellungs-Bereich
// setzt den Schalter-Satz in seinen Entwurf, und «Anwenden» oder «OK» macht ihn
// über `applyExtensionsState` in allen Fenstern wirksam.
//
// **Warum kein eigener Broadcast** (anders als beim Vorbild): Die Wirkung eines
// Modus trägt der bestehende Broadcast des Schalter-Stands in alle Fenster; die
// LISTE selbst hat genau einen Bedien-Ort, den Einstellungs-Bereich
// «Erweiterungen». Der liest sie bei jedem Zeichnen frisch aus dem Speicher,
// und jeder schreibende Handgriff liest unmittelbar davor ebenfalls frisch —
// zwei Fenster können sich deshalb nicht gegenseitig überschreiben. Ein
// zweiter Verteil-Weg käme erst mit einem zweiten Bedien-Ort (Menü, Kommando)
// zu seinem Zweck.
//
// Kein Import aus App-Modulen ausser `api` (Muster extension-lifecycle.js):
// Das Modul hängt am Einstellungs-Bereich und soll nicht Teil der Start-Kette
// werden.
'use strict';

import { api } from '../app/api.js';
import {
  EXTENSION_MODES_KEY,
  extensionModeById,
  extensionModeByName,
  normalizeExtensionModeList,
} from '../../../shared/extensions/extension-modes.js';

let modi = [];

// Eindeutige Kennungen nach dem Muster der Sidebar-Varianten (Zeitstempel plus
// laufende Nummer); sie sind dem Anwender unsichtbar.
let zaehler = 0;
function naechsteId() {
  zaehler += 1;
  return `mode-${Date.now()}-${zaehler}`;
}

export function eigeneArbeitsmodi() {
  return modi;
}

export function eigenerArbeitsmodusMitNamen(name) {
  return extensionModeByName(modi, name);
}

// Den Speicher lesen. `null` heisst «keine Auskunft» — der Schlüssel fehlt
// (noch kein Modus gespeichert) oder das Lesen ist fehlgeschlagen; in beiden
// Fällen bleibt der gehaltene Stand unberührt, statt ihn zu leeren.
async function ausSpeicher() {
  let roh;
  try {
    roh = await api.getSetting(EXTENSION_MODES_KEY);
  } catch (err) {
    console.warn('Eigene Arbeitsmodi laden fehlgeschlagen:', err);
    return null;
  }
  if (roh === undefined || roh === null) return null;
  return normalizeExtensionModeList(roh);
}

/**
 * Den gehaltenen Stand aus dem Speicher auffrischen.
 *
 * @returns {Promise<boolean>} true, wenn sich die Liste dabei geändert hat —
 *   der Aufrufer zeichnet dann neu und sonst nicht (kein Zeichnen im Kreis).
 */
export async function frischeEigeneArbeitsmodi() {
  const gelesen = await ausSpeicher();
  if (!gelesen) return false;
  if (JSON.stringify(gelesen) === JSON.stringify(modi)) return false;
  modi = gelesen;
  return true;
}

// Schreiben. Die Grundlage ist der SPEICHER und nicht der gehaltene Stand:
// Hat ein zweites Fenster inzwischen einen Modus angelegt, bleibt er erhalten.
async function schreibe(bauen) {
  const basis = (await ausSpeicher()) || modi;
  const naechste = normalizeExtensionModeList(bauen(basis));
  try {
    await api.setSetting(EXTENSION_MODES_KEY, naechste);
  } catch (err) {
    console.warn('Eigene Arbeitsmodi schreiben fehlgeschlagen:', err);
    return false;
  }
  modi = naechste;
  return true;
}

/**
 * Den übergebenen Schalter-Stand als neuen Modus ablegen.
 *
 * @param {string} name Vom Anwender vergebener Name.
 * @param {string[]} disabledIds Abgeschaltete Kennungen des Augenblicks.
 * @returns {Promise<boolean>} false bei leerem Namen.
 */
export async function speichereEigenenArbeitsmodus(name, disabledIds) {
  const getrimmt = typeof name === 'string' ? name.trim() : '';
  if (getrimmt === '') return false;
  const eintrag = {
    id: naechsteId(),
    name: getrimmt,
    disabled: Array.isArray(disabledIds) ? [...disabledIds] : [],
  };
  return schreibe((basis) => [...basis, eintrag]);
}

/**
 * Den Schalter-Stand eines vorhandenen Modus ersetzen — der ausdrückliche
 * Rückweg zu einer Momentaufnahme (AK13).
 */
export async function ueberschreibeEigenenArbeitsmodus(id, disabledIds) {
  if (!extensionModeById(modi, id)) return false;
  return schreibe((basis) =>
    basis.map((m) =>
      m.id === id ? { ...m, disabled: Array.isArray(disabledIds) ? [...disabledIds] : [] } : m,
    ),
  );
}

/**
 * Umbenennen. Ein leerer Name und ein im Bestand bereits vergebener werden
 * abgewiesen; der geltende Schalter-Stand bleibt unberührt (AK14).
 */
export async function benenneEigenenArbeitsmodusUm(id, name) {
  const getrimmt = typeof name === 'string' ? name.trim() : '';
  if (getrimmt === '' || !extensionModeById(modi, id)) return false;
  const anderer = extensionModeByName(modi, getrimmt);
  if (anderer && anderer.id !== id) return false;
  return schreibe((basis) => basis.map((m) => (m.id === id ? { ...m, name: getrimmt } : m)));
}

/**
 * Löschen. Ebenfalls ohne Wirkung auf den geltenden Schalter-Stand (AK14).
 */
export async function loescheEigenenArbeitsmodus(id) {
  if (!extensionModeById(modi, id)) return false;
  return schreibe((basis) => basis.filter((m) => m.id !== id));
}

// Nur für Tests: Modul-Zustand zurücksetzen (er überlebt sonst zwischen
// Testfällen desselben Imports; Muster resetExtensionStateForTests).
export function resetEigeneArbeitsmodiForTests() {
  modi = [];
  zaehler = 0;
}
