// 4T-002792 (Epic 3E-000434): Code-Frage des Scanners der %%-Kommentare im
// Renderer.
//
// Der Scanner (shared/markdown/plugins/comments.js) entscheidet nicht selbst,
// ob ein Marker in einem Code-Stueck im Fliesstext liegt; er fragt die
// Anzeige. Deren Zerleger lebt im Preload und nicht im Renderer-Bundle. Dieses
// Modul meldet deshalb beim Laden die Bruecke `kommentarImCode` als Code-Frage
// dieser Laufzeit-Welt an. Jeder Verwender des Scanners im Renderer fuehrt es
// ein (Kommentar-Bereiche des Editors, Tags der Tafel, Quelltext-Export),
// damit die Anmeldung nicht an einer Lade-Reihenfolge haengt.
//
// Bewusst ohne Import von api.js: Die Bruecke wird erst beim Aufruf gelesen.
// So bleibt das Modul ladbar, wo es kein Fenster gibt (Pruefungen), und fehlt
// die Bruecke, bleibt die Frage ohne Antwort (null); der Scanner nimmt dann ab
// dem Marker alles als privat (sichere Seite).
'use strict';

import { setzeCodeFrage } from '../../../shared/markdown/plugins/comments.js';

// portabel: ob das Dokument die Portable-Kennzeichnung traegt; die Bruecke fragt
// dann die portable Fassung der Anzeige.
export function kommentarCodeFrage(stueck, portabel) {
  const bruecke = typeof window !== 'undefined' && window ? window.api : null;
  if (!bruecke || typeof bruecke.kommentarImCode !== 'function') return null;
  const antwort = bruecke.kommentarImCode(stueck, portabel === true);
  return antwort === true || antwort === false ? antwort : null;
}

setzeCodeFrage(
  (stueck) => kommentarCodeFrage(stueck, false),
  (stueck) => kommentarCodeFrage(stueck, true),
);
