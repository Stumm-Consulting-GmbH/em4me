// Kontext-Helfer des Block-Eigenschaften-Panels: aktiver Tab, Datei-Pfad,
// Dokument-Text, Lese-Ansicht, Cursor-Zeile und der zusammengesetzte
// Anker-Kontext einer Pane.
// 4T-0979 (Epic 3E-0196): Auszug aus block-props-panel.js. Blatt-Modul des
// Panels — es importiert kein anderes Panel-Modul und hält den Import-Graph
// des Feature-Ordners damit gerichtet.
'use strict';

import { state } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
import { extractBlockAnchors, blockAnchorForLine } from '../../../shared/block-anchors.js';
import { PROPERTY_TYPES, NICHT_WAEHLBARE_TYPEN } from './properties-types.js';

// Editierbare Typen: der 'readonly'-Fallback der Dokument-Ebene entfaellt, weil
// das Block-Schema app-kontrolliert ist (Konzept-Entscheidung 1).
// 4T-1185 (Epic 3E-0221): mit ihm entfallen die beiden abgeleiteten Typen aus
// demselben Grund — sie sind keine Vorgabe, die man waehlt, sondern ein
// Ergebnis, das ein Profil erklaert. Ein abgeleitetes Feld traegt seinen Typ
// trotzdem; sein Wechsler ist gesperrt und zeigt ihn (siehe buildFieldRow).
export const BLOCK_PROP_TYPES = PROPERTY_TYPES.filter((ty) => !NICHT_WAEHLBARE_TYPEN.includes(ty));

export function activeTabForPane(paneIdx) {
  const pane = state.panes[paneIdx];
  return pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
}

export function activePathForPane(paneIdx) {
  const tab = activeTabForPane(paneIdx);
  return tab && tab.path ? tab.path : null;
}

export function docTextForPane(paneIdx) {
  const tab = activeTabForPane(paneIdx);
  return tab ? tab.content || '' : '';
}

// Lese-Ansichten: Handbuch-Tabs und der reine Render-Modus haben keinen aktiven
// Editier-Cursor; das Panel zeigt dann nur an (Konzept-Entscheidung 5).
export function isReadOnlyForPane(paneIdx) {
  const tab = activeTabForPane(paneIdx);
  return !!(tab && (tab.manualPage || tab.viewMode === 'rendered'));
}

export function cursorLineForPane(paneIdx) {
  const view = paneEditors[paneIdx];
  if (!view) return 0;
  const head = view.state.selection.main.head;
  return view.state.doc.lineAt(head).number;
}

// Anker-Kontext der aktiven Datei: Anker im Text (Dropdown-Reihenfolge),
// Duplikate, verwaiste Daten-IDs (Daten ohne Anker im Text) und der Anker unter
// dem Cursor (null in Lese-Ansichten oder bei einem Block ohne Anker).
export function computeContext(paneIdx) {
  const text = docTextForPane(paneIdx);
  const { order, duplicates } = extractBlockAnchors(text);
  const inText = new Set(order);
  const data = state.blockProps.dataByPane[paneIdx] || {};
  const orphans = Object.keys(data).filter((id) => !inText.has(id));
  const cursorAnchor = isReadOnlyForPane(paneIdx)
    ? null
    : blockAnchorForLine(text, cursorLineForPane(paneIdx));
  return { anchorsInText: order, duplicates, orphans, cursorAnchor, data };
}

// Schluessel-Vorschlaege (Konzept-Entscheidung 1): eine datalist pro Pane mit
// allen im Dokument bereits verwendeten Block-Schluesseln (ueber alle Anker,
// inklusive verwaister Eintraege). Die Schluessel-Eingaben der Eigenschafts-
// Zeilen referenzieren sie ueber das list-Attribut.
export function keyDatalistId(paneIdx) {
  return `blockprops-keylist-${paneIdx}`;
}
