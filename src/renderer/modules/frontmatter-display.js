// 4T-0283/4T-0284 (Epic 3E-0050): Renderer-seitiger Zustand der
// Frontmatter-Anzeige (Setting render.showFrontmatter, Default an).
// Zwei Pipeline-Instanzen muessen synchron bleiben (Muster task-states.js):
// die PRELOAD-Instanz (Render-Pane, Live-Widget-Inhalte via
// api.renderMarkdown) ueber api.configureFrontmatterDisplay und der
// hiesige Bundle-Zustand als Guard fuer den Live-Block-Widget-Aufbau
// (live-widgets.js) — die geteilte markdown.js wird bewusst NICHT ins
// Bundle importiert (sie zoege markdown-it samt Plugins und highlight.js
// in den Renderer-Bundle).
'use strict';

import { api } from './app/api.js';

let enabled = true;
// 4T-0312 (Epic 3E-0055): dauerhaft ausgeklappte Darstellung (Setting
// render.frontmatterExpanded, Default aus). Rein CSS-getragen: die
// Root-Klasse frontmatter-expanded haelt den Block offen — das Markup
// der Pipeline bleibt unveraendert, kein Re-Render noetig. Wirkt in
// Render-Pane, Live-Widget (gleiche Klassen) und damit im PDF-Export.
let expanded = false;

export function isFrontmatterDisplayEnabled() {
  return enabled;
}

export function isFrontmatterExpanded() {
  return expanded;
}

// Idempotent; laeuft lokal beim Anwenden der Einstellung und beim
// Multi-Window-Broadcast (auch im Sender-Fenster).
export function applyFrontmatterExpanded(value) {
  expanded = value === true;
  document.documentElement.classList.toggle('frontmatter-expanded', expanded);
}

export function setFrontmatterDisplayEnabled(value) {
  enabled = value !== false;
  try {
    api.configureFrontmatterDisplay(enabled);
  } catch (err) {
    console.warn('configureFrontmatterDisplay (Preload) fehlgeschlagen:', err);
  }
}

// 4T-0284: Zustand anwenden und Konsumenten benachrichtigen. Das Event
// triggert den Pane-Re-Render (app-init.js: Cache-Invalidierung +
// renderAllPanes) und den Live-Widget-Rebuild (live-widgets.js) —
// Muster 'scg:taskstates-changed'. Idempotent; laeuft lokal beim
// Anwenden und beim Multi-Window-Broadcast (auch im Sender-Fenster).
export function applyFrontmatterDisplay(value) {
  setFrontmatterDisplayEnabled(value);
  document.dispatchEvent(new CustomEvent('scg:frontmatter-display-changed'));
}

// 4T-0284: App-Start — persistierten Wert laden (Store-Key
// render.showFrontmatter). Default an, auch fuer Bestands-Nutzer ohne
// gespeicherten Wert (undefined -> true; nur explizites false schaltet ab).
export async function initFrontmatterDisplayFromStore() {
  let stored;
  let storedExpanded;
  try {
    stored = await api.getSetting('render.showFrontmatter');
    storedExpanded = await api.getSetting('render.frontmatterExpanded');
  } catch (err) {
    console.warn('Frontmatter-Anzeige-Settings laden fehlgeschlagen:', err);
  }
  setFrontmatterDisplayEnabled(stored !== false);
  // 4T-0312: nur explizites true klappt dauerhaft aus (Default aus).
  applyFrontmatterExpanded(storedExpanded === true);
}
