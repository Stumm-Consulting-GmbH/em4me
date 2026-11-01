// Die Dateikopf-Zeile der gezeichneten Ansicht: Klick-Pin, lokalisierte
// Feldanzahl und, seit 4T-002404, die Markierung der Befunde einer Karteikarte.
//
// 4T-002404 (Epic 3E-000266): aus `render-mermaid.js` geschnitten, dessen
// Größen-Budget eingefroren ist und keine Zeile mehr trägt. Der Rumpf der
// Interaktion steht unverändert wie dort; neu sind allein der Parameter
// `basePath` und der Aufruf der Markierung.
'use strict';

import { t } from '../i18n.js';
import { markiereKarteiDateikopf } from './database/karteikarte-befunde.js';
// 4T-002407 (Epic 3E-000266, F6 A, S4): die Sichten einer Karteikarte unter der Zeile.
import { blendeSichtenEin } from './database/karteikarte-sichten.js';

// 4T-000282 (Epic 3E-000050): Interaktion der Frontmatter-Zeile. Das Markup
// kommt aus der Pipeline (renderFrontmatterBlockHtml in markdown.js); hier
// werden pro Block einmalig (data-fm-bound) der Klick-Pin gebunden und die
// lokalisierte Feldanzahl gesetzt. Aufklappen/Zuklappen laeuft rein ueber
// CSS (:hover mit Schliess-Verzoegerung gegen Hover-Flattern, .is-pinned
// haelt offen). Enter/Leertaste bedienen den Pin ueber den nativen
// <button>-Klick; aria-expanded spiegelt den Pin-Zustand.
//
// 4T-002404 (Epic 3E-000266, F3 A): Mit dem Pfad des Dokuments markiert die
// Zeile zusätzlich die Befunde einer Karteikarte nach dem Speichern; ohne Pfad
// (Block-Widget des Live-Modus) bleibt es bei der Interaktion.
//
// 4T-002407 (Epic 3E-000266, F6 A, S4): Mit dem Pfad blendet die Zeile zudem die
// Sichten einer Karteikarte unter sich ein. Ohne Pfad (Live-Modus) nie, weil
// dort die Zeilen des Textes bearbeitet werden.
export function applyFrontmatterLine(container, basePath = null) {
  if (!container) return;
  for (const header of container.querySelectorAll('.frontmatter-header')) {
    if (header.dataset.fmBound) continue;
    header.dataset.fmBound = '1';
    const countEl = header.querySelector('.frontmatter-count');
    if (countEl) {
      const n = parseInt(countEl.dataset.fmCount, 10);
      if (Number.isFinite(n)) {
        const key = n === 1 ? 'frontmatter.line.fieldCountOne' : 'frontmatter.line.fieldCount';
        countEl.textContent = t(key).replace('{count}', String(n));
      }
    }
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      const block = header.closest('.frontmatter-block');
      if (!block) return;
      const pinned = block.classList.toggle('is-pinned');
      header.setAttribute('aria-expanded', pinned ? 'true' : 'false');
    });
  }
  if (!basePath) return;
  markiereKarteiDateikopf(container, basePath);
  void blendeSichtenEin(container, basePath);
}
