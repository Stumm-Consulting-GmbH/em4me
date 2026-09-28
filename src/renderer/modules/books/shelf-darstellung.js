// 4T-001885 (Epic 3E-000189): Die Darstellung eines Bücherregals — Kacheln oder
// Zeilen — als EINE Ablage für beide Bedienorte.
//
// **Warum ein eigenes Modul.** Die Darstellung wird seit 4T-000868 über den
// Umschalter der Regal-Ansicht gesetzt; seit 4T-001885 auch im
// Einstellungs-Abschnitt «Eigene Angaben». Zwei Bedienorte, aber **eine**
// Ablage: Läge der Zugriff weiter in `shelf-view.js`, müsste die
// Einstellungs-Seite die Regal-Ansicht importieren und damit deren
// Seiten-Registrierung samt Meldungs-Anmeldung mitladen. Hier liegt allein der
// Zugriff, und beide Seiten hängen an ihm.
//
// **Wo die Darstellung liegt: unverändert im globalen Speicher**, unter dem
// Schlüssel `shelfViewModes` als Zuordnung vom Regal-Ordner auf den
// abweichenden Wert; nur die Abweichung von der Kachel-Vorgabe wird abgelegt.
// Der Weg durch die Ablage-Regel der Architektur steht im Lösungs-Kapitel des
// Tasks 4T-001885 — die kurze Fassung: Die Darstellung ist eine Sicht-Vorliebe
// des Anwenders an diesem Rechner, nicht eine Eigenschaft des Regals, und sie
// darf deshalb gerade nicht mit dem Regal-Ordner zu einem anderen Anwender
// wandern.
'use strict';

import { api } from '../app/api.js';
import { pathCompareKey } from '../../../shared/platform.js';

// Store-Schlüssel des Umschalter-Zustands: { [Regal-Ordner]: 'rows' }. Nur die
// Abweichung vom Default 'tiles' wird abgelegt.
export const SHELF_VIEW_MODES_KEY = 'shelfViewModes';

// Dokument-Ereignis, mit dem ein Bedienort dem anderen eine Umstellung meldet
// (Muster 'scg:extensions-changed'). Ohne es bliebe eine offene Regal-Ansicht
// auf ihrem alten Stand stehen, bis sie neu lädt.
export const DARSTELLUNG_EVENT = 'scg:shelf-view-mode-changed';

/**
 * Der Ablage-Schlüssel eines Regals: sein Ordner in der Schreibweise, die das
 * Dateisystem der Plattform unterscheidet.
 *
 * 4T-001885 (Epic 3E-000189): Beim Auszug aus `shelf-view.js` hat die feste
 * Kleinschreibung der bisherigen Fassung der zentralen Auskunft Platz gemacht.
 * Der Schlüssel IST hier Datei-Identität — er ist der Regal-Ordner —, und eine
 * feste Kleinschreibung ist auf Linux falsch: Dort sind `…/Regal` und
 * `…/regal` zwei verschiedene Regale, die sich bisher einen Eintrag teilten
 * (Befund B1 des Epics 3E-000232). Auf Windows und macOS ändert sich nichts,
 * weil die Auskunft dort weiterhin kleinschreibt; auf Linux verliert ein
 * vorhandener Eintrag einmalig seine Zuordnung, und das Regal startet wieder
 * in der Kachel-Vorgabe.
 *
 * @param {string} shelfDir Regal-Ordner.
 * @returns {string|null} Ablage-Schlüssel oder null ohne Ordner.
 */
export function darstellungsSchluessel(shelfDir) {
  return shelfDir ? pathCompareKey(String(shelfDir)) : null;
}

/**
 * Liest die abgelegte Darstellung eines Regals.
 *
 * @param {string} shelfDir Regal-Ordner.
 * @returns {Promise<string>} 'rows' oder 'tiles' (Vorgabe).
 */
export async function leseDarstellung(shelfDir) {
  const key = darstellungsSchluessel(shelfDir);
  if (!key) return 'tiles';
  let map;
  try {
    map = await api.getSetting(SHELF_VIEW_MODES_KEY);
  } catch {
    map = null;
  }
  return map && typeof map === 'object' && map[key] === 'rows' ? 'rows' : 'tiles';
}

/**
 * Legt die Darstellung eines Regals ab und meldet die Umstellung im Fenster.
 *
 * @param {string} shelfDir Regal-Ordner.
 * @param {string} modus 'rows' oder 'tiles'.
 * @returns {Promise<void>}
 */
export async function schreibeDarstellung(shelfDir, modus) {
  const key = darstellungsSchluessel(shelfDir);
  if (!key) return;
  let map;
  try {
    map = await api.getSetting(SHELF_VIEW_MODES_KEY);
  } catch {
    map = null;
  }
  const next = map && typeof map === 'object' && !Array.isArray(map) ? { ...map } : {};
  if (modus === 'rows') next[key] = 'rows';
  else delete next[key];
  try {
    await api.setSetting(SHELF_VIEW_MODES_KEY, next);
  } catch {
    /* Der Store meldet den Fehlschlag selbst; die Anzeige bleibt bedienbar. */
  }
  meldeDarstellung(shelfDir, modus === 'rows' ? 'rows' : 'tiles');
}

/**
 * Meldet eine Umstellung an die übrigen Bedienorte desselben Fensters.
 *
 * @param {string} shelfDir Regal-Ordner.
 * @param {string} modus 'rows' oder 'tiles'.
 * @returns {void}
 */
export function meldeDarstellung(shelfDir, modus) {
  if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
  document.dispatchEvent(new CustomEvent(DARSTELLUNG_EVENT, { detail: { shelfDir, modus } }));
}
