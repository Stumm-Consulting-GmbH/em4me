// --- Unbenannt-Tabs und Entwurfs-Zwischenspeicher ---------------------------
// 4T-0989 (Epic 3E-0196): aus views.js in den Ordner views/ ausgezogen.
// Anlage eines leeren Reiters (Datei -> Neu) sowie das Einsammeln und
// Wiederherstellen ungespeicherter Entwuerfe ueber das App-Ende hinweg.
'use strict';

import { createTab, state } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
import { activatePane, activateTab } from '../tabs/tabs.js';

import { applyAllLayouts } from './pane-render.js';
import { persistState } from './views.js';

// Erzeugt einen leeren "Unbenannt"-Tab im aktiven Pane (Datei → Neu / Strg+N).
// Edit-Modus aktiv, View "Geteilt", damit der Nutzer sofort tippen und die
// Vorschau live sehen kann. Nicht persistiert ueber App-Neustart, weil Tabs
// ohne Pfad in buildPanesSnapshot herausgefiltert werden.
export function newUntitledTab() {
  const targetPane = state.activePaneIndex;
  const tab = createTab(null, '', {
    viewMode: 'split',
    untitledIndex: state.untitledCounter++,
  });
  tab.editMode = true;
  state.panes[targetPane].tabs.push(tab);
  activatePane(targetPane);
  activateTab(targetPane, state.panes[targetPane].tabs.length - 1);
  applyAllLayouts();
  persistState();
  const view = paneEditors[targetPane];
  if (view) setTimeout(() => view.focus(), 0);
}

// 4T-0368 (Epic 3E-0068): Unbenannt-Tabs mit Inhalt fuer den Entwurfs-
// Zwischenspeicher einsammeln. Nur echte Nutzer-Entwuerfe (kein Pfad, keine
// read-only System-/Handbuch-Seite) mit nicht-leerem Inhalt; leere Tabs bleiben
// aussen vor. `order` haelt die Pane-/Tab-Reihenfolge fuer die Wiederherstellung.
export function collectUnsavedDrafts() {
  const drafts = [];
  let order = 0;
  state.panes.forEach((p) => {
    p.tabs.forEach((tab) => {
      const isUserDraft = !tab.path && !tab.manualPage && !tab.systemPage;
      if (isUserDraft && typeof tab.content === 'string' && tab.content.trim() !== '') {
        drafts.push({
          content: tab.content,
          tabSettings: {
            viewMode: tab.viewMode,
            wrapLines: tab.wrapLines,
            showLineNumbers: tab.showLineNumbers,
            showFoldGutter: tab.showFoldGutter,
            scrollSyncEnabled: !!tab.scrollSyncEnabled,
          },
          order,
        });
      }
      order++;
    });
  });
  return drafts;
}

// 4T-0368: wiederhergestellte Entwuerfe als dirty Unbenannt-Tabs im ersten Pane
// oeffnen (PO: erste Pane). originalContent bleibt leer, damit der Tab wie ein
// nie gespeicherter Entwurf dirty ist; leert der Nutzer ihn, wird er wieder
// non-dirty und beim naechsten App-Ende verworfen.
export function openDraftsAsUntitled(drafts) {
  if (!Array.isArray(drafts) || drafts.length === 0) return;
  const pane = state.panes[0];
  if (!pane) return;
  for (const d of drafts) {
    if (!d || typeof d.content !== 'string') continue;
    const settings = d.tabSettings && typeof d.tabSettings === 'object' ? d.tabSettings : {};
    const tab = createTab(null, d.content, { ...settings, untitledIndex: state.untitledCounter++ });
    tab.originalContent = '';
    tab.dirty = true;
    tab.editMode = true;
    pane.tabs.push(tab);
  }
  if (pane.activeIndex < 0 && pane.tabs.length > 0) pane.activeIndex = pane.tabs.length - 1;
}
