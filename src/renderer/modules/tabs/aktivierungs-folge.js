// 4T-002106 (Story 4S-001042): Aktivierungs-Reihenfolge der geöffneten Dokumente
// je Spalte. Wird das aktive Dokument geschlossen, wird das jüngste noch geöffnete
// Dokument davor aktiv; gibt es keines, gilt die bisherige Regel (Nachbar im
// Dokument-Streifen). Die Regel gilt für jedes Dokument, auch für System-Seiten
// wie die Einstellungen (Entscheidung des Product Owners vom 2026-10-03).
//
// Reine Helfer ohne Importe: Die Folge hängt in einer WeakMap am Spalten-Objekt
// und hält die Reiter-Objekte selbst, nicht ihre Indizes — Verschieben,
// Umsortieren und Schließen anderer Reiter lassen sie damit gültig. Sie wird nie
// gespeichert (Abgrenzung der Story: keine Wiederherstellung über einen Neustart).
'use strict';

const folgen = new WeakMap(); // Spalte -> Reiter[] (zuletzt aktiv zuerst)

// Merkt die Reiter der Reihe nach als zuletzt aktiv; der letzte steht danach an
// der Spitze. `activateTab` reicht das verlassene und das neue Dokument herein,
// damit auch ein Dokument in der Folge steht, das auf einem anderen Weg aktiv
// wurde (Wiederherstellung der Sitzung, Gruppen-Helfer).
export function merkeAktivierung(pane, ...tabs) {
  if (!pane) return;
  for (const tab of tabs) {
    if (!tab) continue;
    const folge = (folgen.get(pane) || []).filter((t) => t !== tab);
    folge.unshift(tab);
    folgen.set(pane, folge);
  }
}

// Index des Dokuments, das nach dem Schließen des aktiven Dokuments `geschlossen`
// aktiv wird; die Spalte trägt den Reiter zu diesem Zeitpunkt nicht mehr, ihr
// `activeIndex` steht noch auf seiner Stelle. Ist kein zuvor aktives Dokument
// mehr geöffnet, gilt die bisherige Regel: der Reiter, der auf die Stelle
// nachgerückt ist, am Ende des Streifens der letzte. Der geschlossene Reiter
// fällt dabei aus der Folge.
export function aktivNachSchliessen(pane, geschlossen) {
  const folge = (folgen.get(pane) || []).filter((t) => t !== geschlossen && pane.tabs.includes(t));
  folgen.set(pane, folge);
  if (folge.length > 0) return pane.tabs.indexOf(folge[0]);
  return Math.min(pane.activeIndex, pane.tabs.length - 1);
}
