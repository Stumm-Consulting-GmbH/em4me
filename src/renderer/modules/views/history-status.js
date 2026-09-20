// 4T-000332 (Epic 3E-000060): Statusbar-Anzeige der Dokument-Historie.
//
// Drei Zustände am aktiven Tab (Epic-Entscheidung): aktiv (Protokollierung
// läuft), pausiert (wirksam aus, .mdd vorhanden), inaktiv (wirksam aus,
// keine .mdd). Der Tooltip nennt die Herkunft der wirksamen Einstellung
// (Datei, Bereich, App). Klick öffnet das Menü für den Datei-Schalter:
// aktivieren/deaktivieren schreibt die YAML-Eigenschaft `history` in das
// Frontmatter des Dokuments (Round-Trip, Tab wird dirty wie bei einer
// Editor-Änderung), Erbwert entfernt den Eintrag.
//
// Modul-Zyklen zu views/tabs sind Laufzeit-Zugriffe (dokumentiertes Muster
// der Modularisierung, 4T-000179).
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { activeTab, contextMenu, getPaneEls, state } from '../app/app-state.js';
import { rendererAvailabilityContext } from '../command-palette.js';
import { setzeLeistenSchalter } from '../statusbar-availability.js';
import {
  appendContextMenuItem,
  hideContextMenu,
  placeContextMenuAt,
} from '../dialogs/context-menu-utils.js';
import { syncEditorForPane, updateWindowTitle } from '../editor/editor.js';
import { applyRenderPipeline } from '../render-mermaid.js';
import { renderTabbar } from './tabbar.js';
import { scheduleAutoSave, showStatusbarHint } from './views.js';
// 4T-000333 (Epic 3E-000060): Zugang zur Historien-Ansicht aus dem Klick-Menü.
import { openHistoryPage } from './history-page.js';

// Laufender Abfrage-Zähler: eine langsame history:getState-Antwort darf
// keinen neueren Zustand (anderer Tab) überschreiben.
let requestSeq = 0;

function historyButton() {
  return document.getElementById('btn-history');
}

// Zustand des Buttons an den aktiven Tab anpassen. Wird aus der zentralen
// Statusbar-Synchronisation (tabs.syncToolbarToActiveTab) und nach
// Speichern/Schalter-Änderungen aufgerufen.
export async function updateHistoryStatus() {
  const btn = historyButton();
  if (!btn) return;
  const tab = activeTab();
  // System- und Handbuch-Seiten sind keine Dokumente. 4T-001765 (Epic
  // 3E-000186, E6): Die Bedingung dafür steht seither nicht mehr hier, sondern
  // im Verfügbarkeits-Modell — über das Kommando `history.open` und dessen
  // Bedingung `fileTab`, die wörtlich dieselbe Regel trägt. Die gemeinsame
  // Funktion setzt `disabled` und, bei Wert «ausblenden», die Klasse, die den
  // Schalter aus der Leiste nimmt.
  const kontext = rendererAvailabilityContext();
  // Der Abfrage-Zähler wird VOR der Verfügbarkeits-Prüfung erhöht, und das ist
  // eine Behebung: Bis hierher zählte nur der Weg mit Abfrage, und der
  // Ausstieg ohne Dokument blieb stumm. Eine langsame Antwort für das vorige
  // Dokument setzte danach `disabled = false` zurück, obwohl inzwischen eine
  // System-Seite vorn lag — der Schalter stand dort bedienbar da (4T-001765,
  // Befund der eigenen Prüffälle; im Bestand seit 4T-000332 latent, weil
  // niemand auf der Einstellungs-Seite nach der Historie sah). Mit dem
  // Zähler-Schritt an dieser Stelle verwirft die alte Antwort sich selbst.
  const seq = ++requestSeq;
  if (!setzeLeistenSchalter(btn, 'history.open', kontext)) {
    btn.classList.remove('active', 'paused');
    btn.title = t('statusbar.history.inactive').replace('{source}', t('history.source.app'));
    return;
  }
  let info;
  try {
    info = await api.getHistoryState(tab.path || null, tab.content || '');
  } catch {
    return;
  }
  if (seq !== requestSeq) return; // veraltete Antwort
  // Zustand und Darstellung noch einmal über die gemeinsame Funktion setzen:
  // Die Abfrage lief asynchron, und der Aufruf ist mit demselben Kontext ein
  // No-op mit demselben Ergebnis wie oben (statt eines eigenen `disabled`).
  setzeLeistenSchalter(btn, 'history.open', kontext);
  const sourceLabel = t(`history.source.${info.source}`);
  let stateKey;
  if (info.effective && !info.suspended) {
    btn.classList.add('active');
    btn.classList.remove('paused');
    stateKey = 'statusbar.history.active';
  } else if (info.mddExists) {
    btn.classList.remove('active');
    btn.classList.add('paused');
    stateKey = 'statusbar.history.paused';
  } else {
    btn.classList.remove('active', 'paused');
    stateKey = 'statusbar.history.inactive';
  }
  btn.title = t(stateKey).replace('{source}', sourceLabel);
}

// Datei-Schalter: YAML-Eigenschaft `history` setzen (true/false) oder
// entfernen (null = Erbwert). Verhält sich wie eine Editor-Änderung
// (Muster savePropertiesFromPane): Inhalt aktualisieren, dirty neu
// berechnen, Editor/Vorschau synchronisieren, Auto-Save anstoßen.
async function setFileHistoryOverride(value) {
  const paneIdx = state.activePaneIndex;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (!tab || tab.systemPage || tab.manualPage) return;
  let fm;
  try {
    fm = api.getFrontmatter(tab.content || '');
  } catch {
    fm = null;
  }
  // Defektes Frontmatter nie überschreiben (Muster R5-02 der Properties).
  if (!fm || fm.parseError) {
    showStatusbarHint('history.yamlErrorHint', { duration: 4000, error: true });
    return;
  }
  const data = { ...(fm.data || {}) };
  if (value === null) delete data.history;
  else data.history = value;
  const result = api.writeFrontmatter(tab.content || '', data);
  if (!result || !result.ok) {
    showStatusbarHint('history.yamlErrorHint', { duration: 4000, error: true });
    return;
  }
  if (result.text !== tab.content) {
    tab.content = result.text;
    const wasDirty = tab.dirty;
    tab.dirty = tab.content !== tab.originalContent;
    // Editor und Vorschau synchron halten (gleiche Nachverarbeitung wie der
    // Properties-Editor).
    syncEditorForPane(paneIdx);
    const els = getPaneEls(paneIdx);
    if (els && els.renderedHtml) {
      els.renderedHtml.innerHTML = api.renderMarkdown(tab.content, tab.path);
      applyRenderPipeline(els.renderedHtml, tab.path);
    }
    if (wasDirty !== tab.dirty) {
      renderTabbar(paneIdx);
      if (paneIdx === state.activePaneIndex) updateWindowTitle();
    }
    scheduleAutoSave();
  }
  await updateHistoryStatus();
}

// Klick-Menü: Historie öffnen plus die drei Datei-Schalter-Einträge.
function showHistoryMenu(event) {
  const tab = activeTab();
  if (!tab || tab.systemPage || tab.manualPage) return;
  contextMenu.innerHTML = '';
  // 4T-000333: Zugang zur Historien-Ansicht auch über das Statusbar-Element.
  if (tab.path) {
    appendContextMenuItem(contextMenu, {
      key: 'history.menu.open',
      action: () => openHistoryPage(tab.path),
    });
  }
  appendContextMenuItem(contextMenu, {
    key: 'history.menu.enable',
    action: () => void setFileHistoryOverride(true),
  });
  appendContextMenuItem(contextMenu, {
    key: 'history.menu.disable',
    action: () => void setFileHistoryOverride(false),
  });
  appendContextMenuItem(contextMenu, {
    key: 'history.menu.inherit',
    action: () => void setFileHistoryOverride(null),
  });
  const rect = event.currentTarget.getBoundingClientRect();
  placeContextMenuAt(contextMenu, rect.left, rect.top - 8);
}

export function initHistoryStatus() {
  const btn = historyButton();
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideContextMenu();
    showHistoryMenu(e);
  });
  void updateHistoryStatus();
}
