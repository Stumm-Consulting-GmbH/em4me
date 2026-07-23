// 4T-0471 (Epic 3E-0087): Renderer-seitiger Zustand der Gliederungs-
// Nummerierung — globale Einstellung "Ueberschriften nummerieren" plus
// Start-Ebene.
//
// Haelt zwei Konsumenten synchron (Muster frontmatter-display.js):
// - die PRELOAD-Pipeline (Render-Pane, Lese-Ansicht, PDF, Portable ueber
//   api.renderMarkdown) via api.configureHeadingNumbering, und
// - die Renderer-Welt (Live-Modus und Gliederungs-Ansicht), die die Nummern
//   selbst aus dem CodeMirror-Zustand berechnet und dazu den effektiven
//   Zustand pro Dokument braucht (resolveHeadingNumberingForDoc).
//
// Die geteilte markdown.js wird bewusst NICHT ins Renderer-Bundle importiert
// (sie zoege markdown-it in den Bundle); der Nummerierungs-Kern
// heading-numbers.js ist dagegen reine Logik und im Bundle nutzbar.
'use strict';

import { api } from './api.js';

let enabled = false;
let startLevel = 1;

export function isHeadingNumberingEnabled() {
  return enabled;
}

export function headingNumberingStartLevel() {
  return startLevel;
}

// Effektiver Zustand fuer ein Dokument: der Frontmatter-Schalter
// numbered-headings (nur echtes true/false) uebersteuert die globale
// Einstellung; die Start-Ebene bleibt global. Fuer Live-Modus und Outline,
// die die Nummern selbst berechnen (der Render-Pfad loest identisch in
// markdown.js auf).
export function resolveHeadingNumberingForDoc(fmData) {
  let eff = enabled;
  if (fmData && typeof fmData === 'object') {
    const v = fmData['numbered-headings'];
    if (v === true || v === false) eff = v;
  }
  return { enabled: eff, startLevel };
}

// Zustand setzen und an die Preload-Pipeline durchreichen. Idempotent.
export function setHeadingNumbering(nextEnabled, nextStartLevel) {
  enabled = nextEnabled === true;
  startLevel = nextStartLevel === 2 ? 2 : 1;
  try {
    api.configureHeadingNumbering({ enabled, startLevel });
  } catch (err) {
    console.warn('configureHeadingNumbering (Preload) fehlgeschlagen:', err);
  }
}

// Zustand anwenden und Konsumenten benachrichtigen: das Event triggert den
// Pane-Re-Render (app-init.js: Cache-Invalidierung + renderAllPanes), den
// Live-Widget-Rebuild und den Outline-Rebuild. Idempotent; laeuft lokal beim
// Anwenden der Einstellung und beim Multi-Window-Broadcast.
export function applyHeadingNumbering(nextEnabled, nextStartLevel) {
  setHeadingNumbering(nextEnabled, nextStartLevel);
  document.dispatchEvent(new CustomEvent('scg:heading-numbering-changed'));
}

// App-Start: persistierten Wert laden (Store-Key render.headingNumbering, ein
// Objekt { enabled, startLevel }). Default aus, Start-Ebene 1.
export async function initHeadingNumberingFromStore() {
  let stored;
  try {
    stored = await api.getSetting('render.headingNumbering');
  } catch (err) {
    console.warn('Nummerierungs-Settings laden fehlgeschlagen:', err);
  }
  const cfg = stored && typeof stored === 'object' ? stored : {};
  setHeadingNumbering(cfg.enabled === true, cfg.startLevel === 2 ? 2 : 1);
}
