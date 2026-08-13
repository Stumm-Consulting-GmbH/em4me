// Sidebar-Panels: Zugriff auf die Sektions-Elemente und Kopf-Darstellung.
// 4T-0990 (Epic 3E-0196): aus panels.js ausgezogenes Blatt-Modul des Ordners
// panels/. Kern (Mounting), Höhen-Modell und Drag-and-Drop brauchen dieselben
// Helfer; als eigenes Blatt ohne Rück-Import bleibt der Import-Graph des
// Ordners azyklisch.
'use strict';

import { t } from '../../i18n.js';

import { getPaneEls } from '../app/app-state.js';
import { sidebarPanelById } from '../sidebar-layout.js';

// Sektion-Element eines Panels in dieser Pane: bevorzugt die memoisierten
// getPaneEls-Referenzen (outlineSection, tagsSection, …); Fallback über die
// registrierte Klasse (künftige Erweiterungs-Panels, 3E-0052/3E-0053).
export function sectionElFor(els, id, def) {
  const cached = els[id + 'Section'];
  if (cached) return cached;
  return def && def.sectionClass ? els.root.querySelector('.' + def.sectionClass) : null;
}

// 4T-0475 (Epic 3E-0088): Sektions-Element eines Panels in einer bestimmten
// Pane (für die Höhen-Anwendung über beide Panes hinweg während eines Drags).
export function panelSectionEl(paneIdx, panelId) {
  const paneEls = getPaneEls(paneIdx);
  const def = sidebarPanelById(panelId);
  if (!paneEls || !def) return null;
  return sectionElFor(paneEls, panelId, def);
}

// === 4T-0639 (Epic 3E-0069): Panel-Überschriften als Icon ====================
// Das Symbol kommt aus dem zugehörigen Statusbar-Button. Bewusst keine
// zweite Icon-Quelle im Panel-Modell: der Paritäts-Wächter erzwingt bereits,
// dass jedes Panel einen Statusbar-Button führt, und alle vierzehn tragen
// ihr SVG inline. Eine eigene Kennung könnte gegen die Statusbar
// auseinanderlaufen; hier ist es konstruktionsbedingt dasselbe Symbol.
export function panelIconFor(def) {
  if (!def || !def.buttonId) return null;
  const btn = document.getElementById(def.buttonId);
  const svg = btn ? btn.querySelector('svg') : null;
  if (!svg) return null;
  const clone = svg.cloneNode(true);
  clone.setAttribute('aria-hidden', 'true');
  return clone;
}

// Kopf-Inhalt eines Panels: im Icon-Zustand das Symbol, sonst der Text. Der
// Name bleibt in beiden Zuständen als Tooltip und Screenreader-Label
// erhalten; die Überschrift-Semantik (h2 bzw. Reiter) ändert sich nicht.
// Ohne klonbares Symbol bleibt es beim Text — lieber eine Textzeile zu viel
// als ein leerer Kopf.
export function applyPanelHeading(el, def, useIcon) {
  const label = t(def.titleKey);
  el.title = label;
  el.setAttribute('aria-label', label);
  const icon = useIcon ? panelIconFor(def) : null;
  el.textContent = '';
  el.classList.toggle('icon-heading', !!icon);
  if (icon) el.appendChild(icon);
  else el.textContent = label;
}
