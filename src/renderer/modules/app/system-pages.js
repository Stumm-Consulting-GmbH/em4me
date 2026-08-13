// 4T-0277 (Epic 3E-0049): System-Seiten im Tab-System.
//
// Verallgemeinerung des Handbuch-Musters (tab.manualPage) auf interaktive
// Seiten mit eigenem DOM: eine System-Seite läuft als pfadloser Tab
// (tab.systemPage = Seiten-ID), maximal eine Instanz pro Fenster, ohne
// Session-Persistenz (buildPanesSnapshot filtert pfadlose Tabs), ohne
// Edit-Modus und ohne Speichern (Guards in views.js/tabs.js). Anders als
// Handbuch-Tabs rendert eine System-Seite kein Markdown, sondern montiert
// ihr Formular-DOM in den .pane-system-Container der Pane; die
// View-Modus-Umschaltung ist für System-Tabs deaktiviert.
//
// Die Registry ist renderer-lokal (der Main braucht sie nicht) und wird
// von den Seiten-Modulen zur Ladezeit befüllt (settings-page.js).
//
// Modul-Zyklus system-pages <-> app-state/tabs/views ist unkritisch:
// alle Zugriffe erfolgen erst zur Laufzeit (Funktionsaufrufe), Muster wie
// die dokumentierten manual.js-Zyklen der Modularisierung (4T-0179).
'use strict';

import { createTab, getPaneEls, state } from './app-state.js';
import { activatePane, activateTab } from '../tabs/tabs.js';
import { applyAllLayouts } from '../views/pane-render.js';
import { persistState } from '../views/views.js';
// 4T-0648 (Epic 3E-0130): Platzierung einer Folge-Ansicht neben ihrem
// Bezugsdokument (reine Helfer des Tab-Modells).
import { insertTabNextTo, moveTabNextTo } from '../tabs/tab-groups.js';

// Registry: Seiten-ID -> { id, titleKey, mount(container, paneIdx), onOpen? }.
//   id        stabile, sprachneutrale Seiten-Kennung (Wert von tab.systemPage).
//   titleKey  i18n-Key des lokalisierten Tab-Titels.
//   title     optional; Funktion für dynamische Tab-Titel (4T-0455:
//             „Graph: <Bereichs-Name>"). Hat Vorrang vor titleKey; wird bei
//             jedem Tabbar-Render frisch ausgewertet (tabDisplayName).
//   mount     baut das Seiten-DOM in den übergebenen Container; wird beim
//             ersten Anzeigen sowie nach einem Sprachwechsel erneut gerufen
//             (der Container wird vorher geleert).
//   onOpen    optional; läuft beim echten Neu-Öffnen der Seite (nicht beim
//             Aktivieren einer bestehenden Instanz) — Lebenszyklus-Haken
//             für einen frischen Seiten-Zustand (4T-0278: Entwurfs-Reset
//             der Einstellungs-Seite, auch beim Transfer-Pfad).
//   onClose   optional; läuft beim Schließen des Tabs (jeder Pfad:
//             Button, Tab-X, Strg+W, Fenster-Transfer) — Aufräum-Haken
//             (4T-0279: Abbrechen-Semantik der Einstellungs-Seite).
const SYSTEM_PAGES = new Map();

export function registerSystemPage(def) {
  if (!def || typeof def.id !== 'string' || def.id === '') return;
  SYSTEM_PAGES.set(def.id, def);
}

export function systemPageById(id) {
  if (typeof id !== 'string' || id === '') return null;
  return SYSTEM_PAGES.get(id) || null;
}

export function findSystemTabAcrossPanes(pageId) {
  for (let p = 0; p < state.panes.length; p++) {
    const idx = state.panes[p].tabs.findIndex((tb) => tb.systemPage === pageId);
    if (idx >= 0) return { paneIdx: p, tabIdx: idx };
  }
  return null;
}

// Mount-Tracking pro Seite: wo ist das Seiten-DOM aktuell montiert, für
// welche Sprache und welche Öffnungs-Generation. Der Guard hält das DOM
// über Re-Render-Kaskaden stabil (Formular-Fokus und Scroll bleiben
// erhalten) und re-montiert nur bei Sprachwechsel, Pane-Wechsel (Tab in
// die andere Spalte verschoben) oder Neu-Öffnen nach Schließen (die
// Generation zählt pro openSystemPage-Neuanlage hoch; das alte DOM bliebe
// sonst mit veraltetem Seiten-Zustand stehen).
const mountState = new Map(); // pageId -> { container, lang, generation }
const pageGenerations = new Map(); // pageId -> number

// 4T-0701 (Epic 3E-0161): Zaehler der Oeffnungs-Anforderungen je Seite.
// Anders als pageGenerations, das nur echte Neu-Anlagen zaehlt, zaehlt er
// JEDE Anforderung — auch das Aktivieren einer bereits offenen Instanz.
// Genau diese Unterscheidung traegt: Waehrend eines laufenden, asynchronen
// Schliess-Vorgangs existiert die Seite noch, eine Anforderung landet also
// im Aktivierungs-Zweig und laesst Generation und Reiter-Identitaet
// unberuehrt. Ein Schliess-Pfad, der ueber ein await laeuft, haelt den Stand
// vor dem Warten fest und prueft ihn danach: Ist er gestiegen, hat jemand
// die Seite zwischenzeitlich angefordert, und sie gehoert offen.
const openRequests = new Map(); // pageId -> number

export function systemPageOpenCount(pageId) {
  if (typeof pageId !== 'string' || pageId === '') return 0;
  return openRequests.get(pageId) || 0;
}

// 4T-0648 (Epic 3E-0130): Index des Bezugs-Reiters einer Folge-Ansicht in
// einer bestimmten Spalte. -1, wenn kein Bezug angegeben ist oder das
// Dokument dort nicht offen ist. Bewusst spalten-lokal: liegt das Dokument
// in der ANDEREN Spalte, gilt das bisherige Verhalten (Epic-Randfall) —
// eine Folge-Ansicht springt nicht ungefragt in die andere Spalte.
function refTabIndexInPane(paneIdx, refPath) {
  if (!refPath) return -1;
  const pane = state.panes[paneIdx];
  if (!pane) return -1;
  return pane.tabs.findIndex((tb) => tb.path === refPath);
}

// Öffnet eine System-Seite als Tab in der aktiven Pane bzw. aktiviert den
// bestehenden Tab (Einfach-Instanz pro Fenster, Muster openManualPage).
// viewMode ist für System-Tabs bedeutungslos (die Pane trägt die Klasse
// view-system); 'rendered' hält Statusbar-Toggles und Menü-Radio konsistent.
// 4T-0648: nextToPath kennzeichnet eine Folge-Ansicht, die zu einem
// Dokument gehört (heute die Dokument-Historie). Ist dieses Dokument in der
// Ziel-Spalte offen, entsteht der Reiter unmittelbar rechts daneben statt
// am Streifen-Ende; ein bereits offener Reiter wandert beim Umbinden auf
// ein anderes Dokument dorthin mit. Ohne Angabe bleibt alles wie bisher.
export function openSystemPage(pageId, { nextToPath = null } = {}) {
  const page = systemPageById(pageId);
  if (!page) return;
  // 4T-0701: vor beiden Zweigen, damit die Anforderung auch dann zaehlt,
  // wenn sie nur eine bestehende Instanz aktiviert.
  openRequests.set(page.id, (openRequests.get(page.id) || 0) + 1);
  const existing = findSystemTabAcrossPanes(pageId);
  if (existing) {
    let tabIdx = existing.tabIdx;
    const refIdx = refTabIndexInPane(existing.paneIdx, nextToPath);
    if (refIdx >= 0) {
      const moved = moveTabNextTo(state.panes[existing.paneIdx], tabIdx, refIdx);
      if (moved >= 0) tabIdx = moved;
    }
    activatePane(existing.paneIdx);
    // activateTab rendert (applyAllLayouts) und persistiert selbst.
    activateTab(existing.paneIdx, tabIdx);
    return;
  }
  pageGenerations.set(page.id, (pageGenerations.get(page.id) || 0) + 1);
  if (typeof page.onOpen === 'function') page.onOpen();
  const targetPane = state.activePaneIndex;
  const pane = state.panes[targetPane];
  const tab = createTab(null, '', { viewMode: 'rendered' });
  tab.systemPage = page.id;
  const refIdx = refTabIndexInPane(targetPane, nextToPath);
  let newIdx = refIdx >= 0 ? insertTabNextTo(pane, tab, refIdx) : -1;
  if (newIdx < 0) {
    pane.tabs.push(tab);
    newIdx = pane.tabs.length - 1;
  }
  activatePane(targetPane);
  activateTab(targetPane, newIdx);
  applyAllLayouts();
  persistState();
}

// Montiert das Seiten-DOM in den .pane-system-Container der Pane. Wird bei
// jedem renderPaneContent-Durchlauf gerufen; Re-Mount nur, wenn der
// Mount-Guard (siehe mountState) es verlangt. Beim Pane-Wechsel wird der
// alte Container geleert, damit kein verwaistes Seiten-DOM mit toten
// Referenzen zurückbleibt.
// 4T-0455 (Epic 3E-0084, PO-Befund der Release-Test-Iteration 0.57.0):
// Der Guard prüft zusätzlich, ob der Container aktuell dieser Seite gehört
// (data-system-page). Teilen sich zwei System-Tabs eine Pane (z.B.
// Bereichs-Graph und Einstellungen), überschreibt jede Seite beim
// Aktivieren denselben .pane-system-Container — ohne Besitz-Prüfung hielt
// der Guard das eigene DOM fälschlich für montiert und der Tab-Wechsel
// zeigte die jeweils andere Seite weiter an.
export function renderSystemPane(paneIdx, tab) {
  const page = systemPageById(tab.systemPage);
  const els = getPaneEls(paneIdx);
  if (!page || !els || !els.systemEl) return;
  const container = els.systemEl;
  const lang = state.language || '';
  const generation = pageGenerations.get(page.id) || 0;
  const current = mountState.get(page.id);
  if (
    current &&
    current.container === container &&
    current.lang === lang &&
    current.generation === generation &&
    container.dataset.systemPage === page.id
  ) {
    return;
  }
  if (current && current.container !== container) current.container.innerHTML = '';
  container.innerHTML = '';
  container.dataset.systemPage = page.id;
  page.mount(container, paneIdx);
  mountState.set(page.id, { container, lang, generation });
}

// Verdrahtungs-Schnittstelle zum Öffnen einer Seite ohne direkten
// Modul-Import (Muster scg:open-manual-page): genutzt von der E2E-Suite.
document.addEventListener('scg:open-system-page', (ev) => {
  const pageId = ev && ev.detail && ev.detail.pageId;
  if (pageId) openSystemPage(pageId);
});
