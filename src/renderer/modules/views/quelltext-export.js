// 4T-002188 (Epic 3E-000347): Der Quelltext fuer jede Ausgabe aus der
// Quelltext-Ansicht — PDF-Export, Druck und HTML-Export. Die Regel lebt hier an
// einem Ort; die Druck-Vorbereitung baut ihren Print-Block daraus, der
// HTML-Export seinen Quelltext-Block. Herausgehoben aus html-export.js
// (4T-002167), wo sie zuerst nur fuer den HTML-Export galt.
'use strict';

import { extractFrontmatter } from '../../../shared/markdown/frontmatter.js';
import { stripPercentComments } from '../../../shared/markdown/plugins/comments.js';

/**
 * Der Quelltext fuer den Export aus der Quelltext-Ansicht: die privaten
 * %%-Kommentare zeilentreu entfernt, mit demselben Scanner und im selben
 * Umfang wie beim Rendern (nur der Rumpf nach dem Frontmatter; Code-Spannen
 * und \%% bleiben). Ist die Erweiterung «comments» aus, sind %% gewoehnlicher
 * Text und bleiben stehen — wie in der Render-Pipeline.
 *
 * @param {string} text Der Dokument-Text.
 * @param {boolean} kommentareAktiv Zustand der Erweiterung «comments».
 * @returns {string}
 */
export function quelltextFuerExport(text, kommentareAktiv) {
  const quelle = String(text == null ? '' : text);
  if (!kommentareAktiv) return quelle;
  const fm = extractFrontmatter(quelle);
  return (fm.raw || '') + stripPercentComments(fm.body);
}
