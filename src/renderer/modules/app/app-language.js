// Sprachwechsel des Fensters: gemeinsamer Pfad fuer den lokalen Wechsel am
// Dropdown und fuer den Multi-Window-Broadcast.
//
// Auszug aus app-init.js, 4T-1001 (Epic 3E-0196).
'use strict';

import { loadTranslations, applyTranslations } from '../../i18n.js';
import { api } from './api.js';
import { updateWordCountStatusbar } from '../render-mermaid.js';
import { langSelect, renderZoomIndicator, state } from './app-state.js';
import { updateWindowTitle } from '../editor/editor.js';
import { renderOutgoingLinks } from '../panels/panel-outgoing.js';
import { refreshTaskStateLabels } from '../task-states.js';
import { refreshTaskMarkerLabels } from '../tasks.js';
import { updateBookmarksToggleButton } from '../bookmarks/bookmarks.js';
import { reportMenuStateNow } from '../tabs/tabs.js';
import { renderAllPanes } from '../views/pane-render.js';
import { refreshOpenManualTabs } from '../manual.js';
import {
  isRegexHelpOpen,
  renderRegexHelp,
  search,
  updateSearchCounter,
  updateSearchScopeLabel,
} from '../search/search.js';

// M-08 (4T-0185): Gemeinsamer Sprachwechsel-Pfad fuer den lokalen
// Dropdown-Wechsel (persist: true) und den Multi-Window-Broadcast
// (persist: false; der Ausloeser hat den Store bereits geschrieben).
/**
 * Wendet einen Sprachwechsel auf das Fenster an.
 *
 * @param {string} newLang Ziel-Sprache (normalisierter Locale-Code).
 * @param {{persist: boolean}} optionen persist:false beim Broadcast-Empfang,
 *   weil das ausloesende Fenster den Store bereits geschrieben hat.
 */
export async function applyLanguageChange(newLang, { persist }) {
  state.language = newLang;
  if (persist) await api.setSetting('language', newLang);
  else if (langSelect) langSelect.value = newLang;
  await loadTranslations(newLang);
  applyTranslations(document);
  // 4T-0204: Default-Status-Labels in der neuen Sprache aufloesen und
  // beide Pipelines neu konfigurieren (rendert ueber das eigene Event
  // auch die Panes; das folgende renderAllPanes ist dadurch idempotent).
  refreshTaskStateLabels();
  // 4T-0498: Badge-Labels der Task-Marker in der neuen Sprache aufloesen
  // (Muster refreshTaskStateLabels).
  refreshTaskMarkerLabels();
  // 4T-0087: Live-Plugin-Re-Build fuer alle offenen Editor-Views ausloesen,
  // damit Callout-Default-Titel-Widgets mit dem neuen Sprach-Stand neu
  // gebaut werden. Listener sitzt direkt am livePreviewPlugin.
  document.dispatchEvent(new CustomEvent('i18n-language-changed'));
  // 4T-0213: offene Handbuch-Tabs in der neuen Sprache neu laden bzw.
  // generieren — VOR renderAllPanes, damit der folgende Render den neuen
  // Inhalt zeichnet; Tab-Titel ziehen ueber renderTabbar/tabDisplayName.
  await refreshOpenManualTabs();
  reportMenuStateNow();
  renderAllPanes();
  // 4T-0017: Zoom-Indikator-Text ist nicht ueber data-i18n abgedeckt
  // (enthaelt Platzhalter); explizit neu rendern.
  renderZoomIndicator();
  // 4T-0072: Word-Count-Statusbar-Text ist nicht ueber data-i18n abgedeckt
  // (Template mit Platzhaltern und Intl.NumberFormat); neu rendern.
  updateWordCountStatusbar();
  // 4T-0073: Outgoing-Links-Eintraege enthalten i18n-Strings (Type-Badge-
  // Title, Zeilen-Label); sichtbare Sektionen neu rendern.
  for (let p = 0; p < state.panes.length; p++) {
    if (state.outgoing && state.outgoing.visibleByPane[p]) renderOutgoingLinks(p);
  }
  // 4T-0075: Bookmarks-Sektion enthaelt nicht-i18n-Texte (Datei-Namen), aber
  // die Kontext-Menue-Strings und der Empty-Hinweis sind data-i18n abgedeckt.
  // Aktiv-Stern aktualisieren, weil Tooltip lokalisiert ist.
  updateBookmarksToggleButton();
  // Such-Labels (Scope, Counter) sind nicht ueber data-i18n abgedeckt.
  if (search.visible) {
    updateSearchScopeLabel();
    updateSearchCounter();
  }
  // Regex-Hilfe wird dynamisch befuellt; bei offener Anzeige neu rendern.
  if (isRegexHelpOpen()) renderRegexHelp();
  // 4T-0330 (Epic 3E-0057): der Klammer-Suffix des Fenstertitels ist
  // lokalisiert (App/Bereich/Fenster) und zieht beim Sprachwechsel mit.
  updateWindowTitle();
  // 4T-0279: eine offene Einstellungs-Seite braucht keinen Sonderpfad —
  // renderAllPanes oben re-montiert sie ueber renderSystemPane in der
  // neuen Sprache (der Entwurf lebt im Modul-Zustand und bleibt erhalten).
}
