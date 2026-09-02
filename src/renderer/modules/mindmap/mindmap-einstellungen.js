// 4T-001048 (Epic 3E-000151): Anwendungsweite Voreinstellung der Mindmap-
// Darstellung — **nur der Zustand**, ohne Oberfläche.
//
// Muster ist die Gliederungs-Nummerierung (heading-numbering.js): ein
// Modul-privater Zustand, ein Laden beim Start, ein Anwenden mit Ereignis
// für die Konsumenten. Die Auflösung gegen die Dokument-Angabe liegt im
// prozessneutralen Kern (src/shared/mindmap-optionen.js), damit sie ohne
// Fenster-Zustand prüfbar bleibt.
//
// **Der Einstellungs-Bereich liegt bewusst woanders** (settings/
// mindmap-settings.js): Er importiert settings-page.js, und dessen
// Registrierung ist ein Modul-Seiteneffekt. Läge er hier, zöge ihn die Kette
// editor → mindmap-pane → hier mit, und die Settings-Seite würde mitten im
// Laden von app-state registriert; genau das riss in 4T-001048 einundzwanzig
// Testdateien beim Import. Dieses Modul importiert deshalb nur api und den
// reinen Options-Kern.
'use strict';

import { api } from '../app/api.js';
import { MINDMAP_VORGABEN, normalisiereMindmapOptionen } from '../../../shared/mindmap-optionen.js';

// Speicher-Schlüssel der Voreinstellung; ein Objekt mit den fünf Optionen.
export const MINDMAP_SETTINGS_KEY = 'render.mindmap';

let voreinstellung = { ...MINDMAP_VORGABEN };

/** Wirksame anwendungsweite Voreinstellung. */
export function getMindmapVoreinstellung() {
  return { ...voreinstellung };
}

/**
 * Setzt die Voreinstellung und meldet die Änderung. Das Ereignis zieht die
 * offenen Mindmap-Ansichten nach, damit eine geänderte Einstellung ohne
 * Neustart wirkt (Story 4S-000805, AK5).
 */
export function applyMindmapVoreinstellung(roh) {
  voreinstellung = { ...MINDMAP_VORGABEN, ...normalisiereMindmapOptionen(roh) };
  document.dispatchEvent(new CustomEvent('scg:mindmap-optionen-changed'));
}

/** App-Start: persistierten Wert laden; unbrauchbare Angaben fallen zurück. */
export async function initMindmapOptionenFromStore() {
  let gespeichert;
  try {
    gespeichert = await api.getSetting(MINDMAP_SETTINGS_KEY);
  } catch (err) {
    console.warn('Mindmap-Einstellungen laden fehlgeschlagen:', err);
  }
  voreinstellung = { ...MINDMAP_VORGABEN, ...normalisiereMindmapOptionen(gespeichert) };
}
