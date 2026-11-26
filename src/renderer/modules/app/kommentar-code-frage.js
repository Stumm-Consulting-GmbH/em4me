// 4T-002792 (Epic 3E-000434): Code-Frage des Scanners der %%-Kommentare im
// Renderer.
//
// Der Scanner (shared/markdown/plugins/comments.js) entscheidet nicht selbst,
// ob ein Marker in Code liegt; er fragt die Anzeige. Deren Zerleger lebt im
// Preload und nicht im Renderer-Bundle. Dieses Modul meldet deshalb beim Laden
// die Bruecke `kommentarImCode` als Code-Frage dieser Laufzeit-Welt an. Jeder
// Verwender des Scanners im Renderer fuehrt es ein (Kommentar-Bereiche des
// Editors, Tags der Tafel, Quelltext-Export), damit die Anmeldung nicht an
// einer Lade-Reihenfolge haengt.
//
// 4T-002802: Vorgelegt wird der Text mit Kennungen an Stelle der Marker samt
// Leit-Zeichen, das ganze Dokument oder ein Abschnitt davon. Die Antwort ist
// ein Objekt mit den Nummern der Kennungen in Code, den unsicheren Nummern,
// den Anfangs-Zeilen der obersten Bloecke und der Neustart-Stellen, je
// Neustart-Stelle der Kopfzeile ihrer Tabelle und der Spaltenzahl
// (4T-002837) sowie den Definitionen (Form in
// comments.js, baueCodeFrage); die fruehere Form, ein Feld von Nummern, bleibt
// fuer Pruefungen gueltig.
//
// Bewusst ohne Import von api.js: Die Bruecke wird erst beim Aufruf gelesen.
// So bleibt das Modul ladbar, wo es kein Fenster gibt (Pruefungen), und fehlt
// die Bruecke, bleibt die Frage ohne Antwort (null); der Scanner nimmt dann ab
// dem Marker alles als privat (sichere Seite).
'use strict';

import { setzeCodeFrage } from '../../../shared/markdown/plugins/comments.js';

// portabel: ob das Dokument die Portable-Kennzeichnung traegt; die Bruecke fragt
// dann die portable Fassung der Anzeige.
// optionen: wie bei der Code-Frage in comments.js, ein Objekt oder true.
export function kommentarCodeFrage(text, leit, portabel, optionen) {
  const bruecke = typeof window !== 'undefined' && window ? window.api : null;
  if (!bruecke || typeof bruecke.kommentarImCode !== 'function') return null;
  const opt = optionen !== null && typeof optionen === 'object' ? optionen : optionen === true;
  const antwort = bruecke.kommentarImCode(text, leit, portabel === true, opt);
  if (Array.isArray(antwort)) return antwort;
  return antwort && typeof antwort === 'object' ? antwort : null;
}

setzeCodeFrage(
  (text, leit, optionen) => kommentarCodeFrage(text, leit, false, optionen),
  (text, leit, optionen) => kommentarCodeFrage(text, leit, true, optionen),
);
