// 4T-000765 (Epic 3E-000158): Mehrfach-Auswahl in der Reiterleiste — reine Helfer
// ohne DOM und ohne IPC (Muster tab-groups.js).
//
// Die Auswahl ist Bedien-Zustand und keine Struktur: Sie gehört zur einzelnen
// Reiterleiste, wandert nicht über die Spaltengrenze, wird nicht persistiert
// und überlebt keinen Neustart. `pane.selection` hält Tab-OBJEKTE statt
// Indizes, weil sich Indizes bei jedem Einfügen und Verschieben verschieben;
// die Objekt-Identität ist im Bestand bereits das Mittel der Wahl
// (moveTabKeepActive in tab-groups.js, refTab in openInPane).
//
// Invarianten (von den Helfern hergestellt bzw. erhalten):
//   1. Mitglied ist nur, was in der Leiste liegt (pruneSelection).
//   2. Der aktive Reiter ist Mitglied, solange eine Auswahl besteht.
//   3. Eine Auswahl aus genau einem Reiter ist der Normalfall; die Leiste
//      verhält sich dann wie ohne Auswahl (Rendering, Ziehen, Kontextmenü).
'use strict';

import { groupIdForInsertion, isTabVisible } from './tab-groups.js';

// Defensive Initialisierung: Panes aus Fremd-Quellen (alte Snapshots, Tests)
// tragen kein selection-Feld.
export function ensurePaneSelection(pane) {
  if (!Array.isArray(pane.selection)) pane.selection = [];
  return pane.selection;
}

// Invariante 1: Mitglieder, die die Leiste verlassen haben (geschlossen, in
// die andere Spalte oder in ein anderes Fenster gewandert), fallen heraus.
export function pruneSelection(pane) {
  const sel = ensurePaneSelection(pane);
  if (sel.length > 0) pane.selection = sel.filter((tab) => pane.tabs.includes(tab));
  return pane.selection;
}

// Indizes der Auswahl in Streifen-Reihenfolge.
export function selectedIndices(pane) {
  pruneSelection(pane);
  const out = [];
  pane.tabs.forEach((tab, i) => {
    if (pane.selection.includes(tab)) out.push(i);
  });
  return out;
}

export function isTabSelected(pane, tabIdx) {
  const tab = pane.tabs[tabIdx];
  if (!tab) return false;
  return ensurePaneSelection(pane).includes(tab);
}

// Invariante 3: Erst ab zwei Mitgliedern ist die Auswahl eine Menge. Alles,
// was sich an der Auswahl ausrichtet (Markierung, Ziehen, Kontextmenü),
// fragt hier und nicht nach der bloßen Existenz eines Eintrags.
export function hasMultiSelection(pane) {
  return selectedIndices(pane).length > 1;
}

export function setSelection(pane, tabIdx) {
  const tab = pane.tabs[tabIdx];
  pane.selection = tab ? [tab] : [];
  return pane.selection;
}

export function clearSelection(pane) {
  pane.selection = [];
  return pane.selection;
}

// Strg+Klick: Reiter aufnehmen oder herausnehmen. Liefert true, wenn er neu
// aufgenommen wurde und deshalb zu aktivieren ist. Der aktive Reiter bleibt
// Mitglied (Invariante 2) — ein Strg+Klick auf ihn ändert nichts.
export function toggleSelection(pane, tabIdx) {
  const tab = pane.tabs[tabIdx];
  if (!tab) return false;
  pruneSelection(pane);
  if (pane.selection.length === 0 && pane.activeIndex >= 0) {
    const active = pane.tabs[pane.activeIndex];
    if (active) pane.selection.push(active);
  }
  const pos = pane.selection.indexOf(tab);
  if (pos < 0) {
    pane.selection.push(tab);
    return true;
  }
  if (tabIdx !== pane.activeIndex) pane.selection.splice(pos, 1);
  return false;
}

// Umschalt+Klick: Spanne vom aktiven Reiter bis zum angeklickten. Verborgene
// Mitglieder zugeklappter Gruppen bleiben außen vor — was der Anwender nicht
// sieht, wählt er nicht mit. Bei abgeschalteter Erweiterung tab-groups zeigt
// die Leiste alle Reiter, dann zählt auch die Spanne alle (groupsActive).
export function extendSelection(pane, tabIdx, groupsActive = true) {
  const target = pane.tabs[tabIdx];
  if (!target) return ensurePaneSelection(pane);
  const anchor = pane.activeIndex >= 0 ? pane.activeIndex : tabIdx;
  const from = Math.min(anchor, tabIdx);
  const to = Math.max(anchor, tabIdx);
  const sel = [];
  for (let i = from; i <= to; i++) {
    if (groupsActive && !isTabVisible(pane, i)) continue;
    sel.push(pane.tabs[i]);
  }
  // Der aktive Reiter darf seit 4T-000767 selbst verborgen sein; Invariante 2
  // gilt trotzdem.
  const active = pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (active && !sel.includes(active)) sel.push(active);
  pane.selection = sel;
  return pane.selection;
}

// Menge als Block an die Einfüge-Stelle verschieben. insertIdx ist wie bei den
// Tab-Drop-Zonen der Index VOR dem Entfernen der Menge. Die Reihenfolge der
// Mitglieder bleibt erhalten; der aktive Reiter bleibt über Objekt-Identität
// stabil (Muster moveGroupWithinPane).
//
// Die Gruppen-Zugehörigkeit entsteht EINMAL für die Einfüge-Stelle und gilt
// dann für alle Mitglieder: Eine Menge, deren Teile verschiedenen Gruppen
// angehören, würde den Ziel-Block sonst zerreißen (Zusammenhangs-Invariante
// des Gruppen-Modells). Stammen alle Mitglieder aus derselben Gruppe, wird
// diese als eigene Gruppe durchgereicht, damit ein Verschieben innerhalb des
// eigenen Blocks nicht als Austritt gilt (Semantik von reorderTabWithinPane).
export function moveTabsWithinPane(pane, tabIdxList, insertIdx) {
  const idxs = [...new Set(tabIdxList)]
    .filter((i) => Number.isInteger(i) && pane.tabs[i])
    .sort((a, b) => a - b);
  if (idxs.length === 0) return false;
  const block = idxs.map((i) => pane.tabs[i]);
  const activeObj = pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const rest = pane.tabs.filter((tab) => !block.includes(tab));
  let idx = insertIdx - idxs.filter((i) => i < insertIdx).length;
  idx = Math.max(0, Math.min(idx, rest.length));
  const ownGroupId = block.every((tab) => tab.groupId === block[0].groupId)
    ? block[0].groupId || null
    : null;
  const groupId = groupIdForInsertion(rest, idx, ownGroupId);
  for (const tab of block) tab.groupId = groupId;
  pane.tabs = [...rest.slice(0, idx), ...block, ...rest.slice(idx)];
  if (activeObj) pane.activeIndex = pane.tabs.indexOf(activeObj);
  return true;
}
