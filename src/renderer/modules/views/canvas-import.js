// 4T-001806 (Epic 3E-000292): Der Weg des Einlesens im Anzeige-Prozess
// (Story 4S-000960).
//
// **Hier steht wenig, und das mit Absicht.** Lesen, Pruefen, Uebersetzen,
// Umrechnen der fremden Pfade und Anlegen des Dokuments laufen vollstaendig im
// Hauptprozess (src/main/ipc/canvas-import.js), weil sie alle das Dateisystem
// und die Bereichs-Grenze brauchen. Dieses Modul tut das, was nur hier geht:
// die entstandenen Dokumente oeffnen, sie in die Canvas-Ansicht schalten und
// die gemeinsame Ergebnis-Meldung ausloesen.
//
// **Getrennt von save-export.js**, wo die Gegenrichtung liegt: Das Einlesen
// ist kein Speicher-Weg — es erzeugt Dokumente, waehrend jenes Modul den
// Inhalt eines Reiters hinausgibt.
'use strict';

import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { openInPane } from '../tabs/tabs.js';
import { setViewMode, showStatusbarHint } from './views.js';

/**
 * Liest eine oder mehrere Dateien des offenen Formats JSON Canvas ein
 * (Kommando `file.importJsonCanvas`).
 *
 * Je gelesener Datei entsteht ein Dokument neben ihr; es wird geoeffnet und
 * zeigt die Canvas-Ansicht. Am Ende steht **eine** Meldung ueber alle
 * gewaehlten Dateien (Entscheidung F1 des Product Owners vom 2026-09-19).
 *
 * @returns {Promise<boolean>} true, wenn mindestens ein Dokument entstanden ist.
 */
export async function importJsonCanvasFiles() {
  let antwort;
  try {
    antwort = await api.importJsonCanvas();
  } catch {
    antwort = null;
  }
  // Abbruch im Oeffnen-Dialog ist kein Fehler: keine Datei, keine Meldung.
  // Ein weggebrochener Kanal dagegen bleibt nicht stumm — ein stiller
  // Fehlschlag waere fuer den Anwender von «nichts gewaehlt» nicht zu
  // unterscheiden.
  if (!antwort || !antwort.ok) {
    if (!antwort)
      showStatusbarHint('canvas.austausch.importFehlgeschlagen', {
        duration: 3000,
        error: true,
      });
    return false;
  }
  const ergebnisse = Array.isArray(antwort.ergebnisse) ? antwort.ergebnisse : [];

  // Je Dokument einzeln oeffnen und danach umschalten: setViewMode wirkt auf
  // den aktiven Reiter, und so zeigt JEDES neue Dokument die Flaeche, nicht
  // nur das zuletzt geoeffnete. Die Reihenfolge bleibt die der Auswahl; aktiv
  // ist danach das letzte.
  for (const ergebnis of ergebnisse) {
    if (!ergebnis || typeof ergebnis.pfad !== 'string' || ergebnis.pfad === '') continue;
    await openInPane(state.activePaneIndex, [ergebnis.pfad]);
    setViewMode('canvas');
  }

  await api.showCanvasExchangeReport({
    richtung: 'import',
    dateien: ergebnisse.map((e) => ({
      name: (e && e.name) || '',
      zahlen: (e && e.zahlen) || null,
      verluste: (e && e.verluste) || [],
      fehler: (e && e.fehler) || null,
    })),
  });
  return ergebnisse.some((e) => e && e.pfad);
}
