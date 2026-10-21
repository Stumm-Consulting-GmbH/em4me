// 4T-002217 (Epic 3E-000355): Zeigt eine Fundstelle der Lese-Ansicht — der
// eine Weg, auf dem jede Suche in einer gerenderten Ansicht ihren aktuellen
// Treffer in die Mitte holt: Dokument-Suche in «Gerendert» (setCurrentMatch in
// search.js) und, über rolleZurFundstelleInDerLeseAnsicht in search-jump.js,
// Bereichs- und Handbuch-Suche.
//
// Warum eigenes Modul: search.js kann aus search-jump.js nicht importieren,
// ohne einen Import-Zyklus über Ordner-Grenzen zu schließen (search-jump.js
// importiert manual.js; am 2026-10-17 mit lint-ordner-importe.js geprüft:
// Befund). Dieses Modul importiert nichts und steht deshalb beiden offen.
'use strict';

// Öffnet jeden eingeklappten Kasten, in dem die Fundstelle liegt, und rollt
// sie danach in die Mitte ihres Rollen-Containers.
//
// Warum das Öffnen: Ein klappbarer Hinweis-Kasten (`> [!note]- Titel`) wird
// als `details` ohne `open` gerendert (callouts.js). Sein Inhalt hat kein
// Layout, und `scrollIntoView` wirkt auf ein Element ohne Layout nicht. Der
// Zähler zählte den Treffer mit, die Ansicht blieb stehen, der Treffer blieb
// unsichtbar — gemessen am 2026-10-17 in «Gerendert», vorwärts und rückwärts.
// Geöffnet wird jeder Vorfahre, weil Kästen ineinander liegen können; vor dem
// Rollen, weil erst das Öffnen die Höhe schafft, nach der sich die Mitte
// rechnet. Der Kasten bleibt danach offen wie ein von Hand aufgeklappter
// (Vorlage P1 im Epic, Entscheidung des Product Owners vom 2026-10-17).
export function zeigeFundstelleInDerLeseAnsicht(ziel) {
  if (!ziel || typeof ziel.scrollIntoView !== 'function') return;
  for (let el = ziel.parentElement; el; el = el.parentElement) {
    if (el.tagName === 'DETAILS' && !el.open) el.open = true;
  }
  ziel.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
}
