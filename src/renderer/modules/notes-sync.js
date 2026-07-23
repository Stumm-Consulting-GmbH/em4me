// 4T-0359 (Epic 3E-0066): reine Entscheidungslogik fuer die Notiz-Synchronisation
// bei einem note:changed-Broadcast. Bewusst abhaengigkeitsfrei (kein DOM, kein
// state), damit sie ohne Renderer-Umgebung unit-testbar ist.
'use strict';

// Entscheidet, wie eine Spalte auf einen eingehenden Broadcast reagiert. Die
// Baseline ist der zuletzt geladene bzw. geschriebene Notiz-Stand der Spalte.
//   'ignore'   incoming gleicht der Baseline (Eigen-Broadcast oder schon aktuell)
//   'adopt'    kein lokaler Bearbeitungsstand -> fremde Fassung uebernehmen
//   'conflict' lokale ungespeicherte Aenderung trifft eine fremde Aenderung
export function decideNoteSync(incoming, baseline, currentValue) {
  if (incoming === baseline) return 'ignore';
  if (currentValue === baseline) return 'adopt';
  return 'conflict';
}
