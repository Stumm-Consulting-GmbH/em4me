// 4T-002188 (Epic 3E-000347): Der Quelltext fuer jede Ausgabe aus der
// Quelltext-Ansicht — PDF-Export, Druck und HTML-Export. Die Regel lebt hier an
// einem Ort; die Druck-Vorbereitung baut ihren Print-Block daraus, der
// HTML-Export seinen Quelltext-Block. Herausgehoben aus html-export.js
// (4T-002167), wo sie zuerst nur fuer den HTML-Export galt.
'use strict';

import { extractFrontmatter } from '../../../shared/markdown/frontmatter.js';
import { stripPercentComments } from '../../../shared/markdown/plugins/comments.js';
// 4T-002792 (Epic 3E-000434): meldet die Bruecke als Code-Frage des Scanners an.
import '../app/kommentar-code-frage.js';

/**
 * Der Quelltext fuer den Export aus der Quelltext-Ansicht: die privaten
 * %%-Kommentare zeilentreu entfernt, mit demselben Scanner und im selben
 * Umfang wie beim Rendern (nur der Rumpf nach dem Frontmatter; Code-Spannen
 * und \%% bleiben). Ist die Erweiterung «comments» aus, sind %% gewoehnlicher
 * Text und bleiben stehen — wie in der Render-Pipeline.
 *
 * 4T-002797 (Epic 3E-000449): Die Entfernung laeuft ueber die Bruecke
 * `quelltextOhneKommentare`, weil nur der Zerleger der Anzeige im Preload die
 * Ruempfe von Datentabelle, Canvas-Flaeche und den uebrigen Sonder-Bloecken auf
 * jeder Ebene findet; die Regel des Fliesstexts allein laesst sie als Code
 * stehen. Ohne Bruecke oder ohne Zeichenkette als Antwort (Pruefungen ohne
 * Fenster) gilt die Regel des Fliesstexts wie bisher.
 *
 * @param {string} text Der Dokument-Text.
 * @param {boolean} kommentareAktiv Zustand der Erweiterung «comments».
 * @returns {string}
 */
export function quelltextFuerExport(text, kommentareAktiv) {
  const quelle = String(text == null ? '' : text);
  if (!kommentareAktiv) return quelle;
  const fm = extractFrontmatter(quelle);
  return (fm.raw || '') + rumpfOhneKommentare(fm.body);
}

function rumpfOhneKommentare(rumpf) {
  const bruecke = typeof window !== 'undefined' && window ? window.api : null;
  if (bruecke && typeof bruecke.quelltextOhneKommentare === 'function') {
    const frei = bruecke.quelltextOhneKommentare(rumpf);
    if (typeof frei === 'string') return frei;
  }
  return stripPercentComments(rumpf);
}
