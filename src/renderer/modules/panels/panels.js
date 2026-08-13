// Kern der dynamischen Sidebar: Slot-Mounting, Reiter-Gruppen und Splitter.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
// 4T-0990 (Epic 3E-0196): in den Feature-Ordner panels/ geteilt. Hier bleibt,
// was die Spalte aufbaut; die vier Panels (Outline, Backlinks, Outgoing,
// Unterseiten), das Höhen-Modell, das Drag-and-Drop und der Spalten-Kollaps
// liegen in den Nachbar-Modulen des Ordners.
'use strict';

import { getPaneEls, isSidebarCollapsed, state } from '../app/app-state.js';
// 4T-0697 (Epic 3E-0141): der Spalten-Kollaps ist eine Erweiterung; im
// Aus-Zustand bleibt die Spalte sichtbar.
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
// 4T-0287/4T-0288 (Epic 3E-0051): Panel-Registry und Layout-Modell — das
// Slot-Mounting (renderSidebarForPane) liest beide.
import {
  SIDEBAR_SIDES,
  activePanelInSlot,
  clampSidebarWidth,
  getIconHeadings,
  getSidebarLayout,
  getSidebarWidth,
  setActivePanelForColumn,
  setSidebarWidth,
  sidebarPanelById,
} from '../sidebar-layout.js';

import { applyPanelHeading, sectionElFor } from './panel-sections.js';
import { buildCollapseStrip, injectCollapseToggle } from './sidebar-collapse.js';
import {
  cancelPanelDrag,
  handlePanelDragOverTabbar,
  handlePanelDragStart,
  handlePanelDrop,
} from './sidebar-dnd.js';
import { buildPanelResizer, heightRefForSlot, readHeightRef } from './sidebar-heights.js';

// 4T-0014/4T-0015/4T-0288: Gemeinsame Sidebar-Sichtbarkeit. Seit 4T-0288
// (Epic 3E-0051) delegiert die Funktion an das Slot-Mounting der dynamischen
// Sidebar: beide Container der Pane werden gemäß Layout-Modell bestückt; ein
// Container (samt Splitter) ist nur sichtbar, wenn mindestens ein dort
// zugeordnetes Panel in dieser Pane sichtbar ist. Die effektive Sichtbarkeit
// je Panel (inklusive Empty-State-Overrides aus 4T-0075) liefert die
// Registry über getVisible.
export function applySidebarVisibility(paneIdx) {
  renderSidebarForPane(paneIdx);
}

// 4T-0288: Slot-Mounting — hängt die bestehenden Panel-DOM-Strukturen
// (.sidebar-section) gemäß Layout-Modell in die Container der richtigen
// Seite und Reihenfolge um. Die inneren Strukturen bleiben unverändert,
// Selektoren und Event-Bindungen der Panel-Module überleben das Umhängen.
// Reiter-Gruppen erhalten eine pro Durchlauf neu gebaute Reiterleiste;
// nur das aktive Panel des Slots ist eingeblendet (CSS-Klasse tab-hidden,
// getrennt vom hidden-Attribut der Panel-Sichtbarkeit).
export function renderSidebarForPane(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.sidebarLeft || !els.sidebarRight) return;
  const layout = getSidebarLayout();
  for (const side of SIDEBAR_SIDES) {
    renderSidebarSide(paneIdx, els, layout, side);
  }
}

// 4T-0697 (Epic 3E-0141): Alle Sidebars beider Panes neu rendern. renderAllPanes
// (views.js) rendert nur Reiterleiste und Pane-Inhalt, nicht die Sidebar-Slots;
// diese Wrapper-Funktion schließt genau diese Lücke für die Laufzeit-Hooks der
// Kollaps-Erweiterung und das Aufheben des Kollaps-Zustands.
export function renderAllSidebars() {
  for (let i = 0; i < state.panes.length; i++) renderSidebarForPane(i);
}

function renderSidebarSide(paneIdx, els, layout, side) {
  const container = side === 'left' ? els.sidebarLeft : els.sidebarRight;
  const splitter = side === 'left' ? els.sidebarSplitterLeft : els.sidebarSplitterRight;
  if (!container) return;
  // Reiterleisten werden pro Durchlauf neu gebaut (kleine, seltene DOM-
  // Arbeit; nur bei Layout-/Sichtbarkeits-Änderungen, nie pro Tastendruck).
  container.querySelectorAll('.sidebar-slot-tabs').forEach((el) => el.remove());
  // 4T-0475 (Epic 3E-0088): Höhen-Griffe werden ebenfalls pro Durchlauf neu
  // gebaut (Listener hängen direkt am erzeugten Element) — alte zuerst weg.
  container.querySelectorAll('.sidebar-panel-resizer').forEach((el) => el.remove());
  // 4T-0698 (Epic 3E-0141): Kopf-Toggle und Strich-Button je Durchlauf neu
  // aufbauen (frische Tooltips bei Sprachwechsel; Muster Reiterleiste).
  container
    .querySelectorAll('.sidebar-collapse-toggle, .sidebar-collapse-strip')
    .forEach((el) => el.remove());
  let anyVisible = false;
  // 4T-0698 (Epic 3E-0141): Kopf des obersten sichtbaren Slots — dort zieht
  // das Toggle-Icon ein. Bei einer Reiter-Gruppe die Reiterleiste, sonst der
  // Sektions-Header. Wird beim ersten sichtbaren Slot einmalig gesetzt.
  let topHeadEl = null;
  // 4T-0475: governing Panel-ID des zuletzt gerenderten sichtbaren Blocks.
  // Sobald der nächste sichtbare Block folgt, entsteht dazwischen ein Griff,
  // der die Höhe des Blocks DARÜBER (= prevGoverningId) steuert. Der letzte
  // sichtbare Block der Seite bleibt ohne Griff (kein Folge-Block).
  let prevGoverningId = null;
  // 4T-0855 (Epic 3E-0164): Bezugsgröße des zuletzt gerenderten sichtbaren
  // Blocks. Der Griff darunter schreibt in diesen Speicher — im Gruppen-Modus
  // also in die Gruppen-Höhe statt in die des aktiven Reiters.
  let prevRef = null;
  // 4T-0682 (Epic 3E-0139): Sektion des zuletzt gerenderten sichtbaren
  // Blocks. Nach der Schleife ist das der letzte Block der Seite — der
  // einzige ohne Höhen-Griff (siehe Nachbehandlung unten).
  let lastGoverningSection = null;
  // 4T-0639: einmal je Seite lesen, für Köpfe und Reiter derselbe Zustand.
  const useIconHeadings = getIconHeadings();
  for (const slot of layout[side] || []) {
    const isGroup = slot.panels.length > 1;
    const entries = [];
    for (const id of slot.panels) {
      const def = sidebarPanelById(id);
      const sectionEl = def ? sectionElFor(els, id, def) : null;
      if (def && sectionEl) entries.push({ id, def, sectionEl });
    }
    if (entries.length === 0) continue;
    const visibleIds = entries.filter((e) => e.def.getVisible(paneIdx)).map((e) => e.id);
    const slotVisible = visibleIds.length > 0;
    // 4T-0942 (Befund B-07): der aktive Reiter gilt je Spalte; der
    // Layout-Wert ist nur noch die Vorgabe (activePanelInSlot).
    const slotActive = activePanelInSlot(slot, paneIdx);
    const effectiveActive = visibleIds.includes(slotActive) ? slotActive : visibleIds[0] || null;
    // 4T-0475: governing Panel dieses Blocks — bei einer Reiter-Gruppe der
    // aktive Reiter, sonst die Einzel-Sektion. Dessen Höhe steuert der Griff.
    const governingId = effectiveActive;
    // 4T-0855: Bezugsgröße dieses Blocks (Panel oder Gruppe, je nach Modell).
    const heightRef = heightRefForSlot(slot, governingId);
    // 4T-0475: Vor jedem sichtbaren Block außer dem ersten einen Höhen-Griff
    // einschieben, der die Höhe des vorherigen sichtbaren Blocks steuert.
    if (slotVisible && prevGoverningId) {
      container.appendChild(buildPanelResizer(paneIdx, prevGoverningId, prevRef));
    }
    // 4T-0698: Referenz auf die Reiterleiste dieses Slots (Kopf einer Gruppe),
    // damit sie unten als oberster sichtbarer Kopf verfügbar ist.
    let slotTabbar = null;
    if (isGroup && slotVisible) {
      slotTabbar = buildSlotTabbar(entries, visibleIds, effectiveActive, paneIdx);
      // Trenner vor jedem sichtbaren Block außer dem ersten (ersetzt die
      // frühere panel-gebundene border-top von Outgoing/Backlinks/Bookmarks,
      // die bei freier Reihenfolge an falscher Stelle säße).
      slotTabbar.classList.toggle('sidebar-sep', anyVisible);
      container.appendChild(slotTabbar);
    }
    for (const e of entries) {
      // appendChild hängt um bzw. sortiert ein — die Iterations-Reihenfolge
      // (Slots, darin Panels) ergibt die endgültige DOM-Reihenfolge.
      container.appendChild(e.sectionEl);
      e.sectionEl.classList.toggle('in-tab-group', isGroup);
      e.sectionEl.classList.toggle('tab-hidden', isGroup && e.id !== effectiveActive);
      // 4T-0639: Kopf-Darstellung je Durchlauf nachziehen. In Gruppen ist
      // der Kopf ausgeblendet (die Reiterleiste ersetzt ihn), die Pflege
      // schadet dort aber nicht und hält den Zustand konsistent, falls das
      // Panel die Gruppe später verlässt.
      const titleEl = e.sectionEl.querySelector('.sidebar-section-title');
      if (titleEl) applyPanelHeading(titleEl, e.def, useIconHeadings);
      e.sectionEl.classList.toggle(
        'sidebar-sep',
        !isGroup && anyVisible && slotVisible && e.def.getVisible(paneIdx),
      );
      // 4T-0475: fixierte Höhe nur auf die governing-Sektion des sichtbaren
      // Blocks anwenden; alle übrigen Sektionen auf Automatik zurücksetzen
      // (idempotent bei jedem Render).
      // 4T-0855: Der Wert kommt aus der Bezugsgröße des Blocks; im
      // Gruppen-Modus ist das die Gruppen-Höhe, sodass der Reiter-Wechsel die
      // Blockhöhe nicht mehr verändert.
      const fixedH = slotVisible && e.id === governingId ? readHeightRef(heightRef) : null;
      if (fixedH != null) {
        e.sectionEl.style.height = fixedH + 'px';
        e.sectionEl.classList.add('has-fixed-height');
      } else {
        e.sectionEl.style.height = '';
        e.sectionEl.classList.remove('has-fixed-height');
      }
    }
    if (slotVisible) {
      // 4T-0698: oberster sichtbarer Kopf — Reiterleiste bei einer Gruppe,
      // sonst der Sektions-Header des sichtbaren Einzel-Panels. Nur beim
      // ersten sichtbaren Slot festhalten.
      if (!topHeadEl) {
        topHeadEl = slotTabbar
          ? slotTabbar
          : (entries
              .find((e) => visibleIds.includes(e.id))
              ?.sectionEl.querySelector('.sidebar-section-header') ?? null);
      }
      anyVisible = true;
      prevGoverningId = governingId;
      prevRef = heightRef;
      lastGoverningSection = entries.find((e) => e.id === governingId)?.sectionEl ?? null;
    }
  }
  // 4T-0682 (Epic 3E-0139): Der letzte sichtbare Block einer Seite läuft
  // immer auf Automatik und nimmt damit genau seine Inhaltshöhe. Grund: Ein
  // Griff steuert stets den Block DARÜBER, hinter dem letzten folgt keiner
  // mehr, also hat er keinen. Eine fixierte Höhe wäre dort eine Sackgasse —
  // freezeSidePanelHeights hat sie bis hierher auch ohne Zutun des Anwenders
  // angelegt, und danach gab es keine Bedienung mehr, um sie zu ändern. Ein
  // Panel stand so dauerhaft auf der Höhe, die es beim ersten Ziehen
  // zufällig hatte, und rollte, obwohl darunter beliebig viel Platz frei
  // war (Befund des Product Owners am Uhr-Panel). Der gespeicherte Wert
  // bleibt erhalten und greift wieder, sobald das Panel nicht mehr der
  // letzte Block ist; dann hat es auch wieder einen Griff.
  if (lastGoverningSection) {
    lastGoverningSection.style.height = '';
    lastGoverningSection.classList.remove('has-fixed-height');
  }
  container.hidden = !anyVisible;
  // 4T-0697 (Epic 3E-0141): Kollaps-Zustand der Spalte über eine eigene
  // Klasse, strikt getrennt vom Sichtbarkeits-hidden oben. Er greift nur bei
  // sichtbaren Panels (eine panel-leere Spalte kollabiert weiterhin über
  // container.hidden) und nur bei aktiver Erweiterung — im Aus-Zustand bleibt
  // die Spalte sichtbar (Muster Fokus-Modus-Laden).
  const extActive = isExtensionActive('sidebar-collapse');
  const collapsed = anyVisible && extActive && isSidebarCollapsed(paneIdx, side);
  container.classList.toggle('collapsed', collapsed);
  // 4T-0698 (Epic 3E-0141): Bedien-Ort in der Spalte. Kopf-Toggle in den
  // obersten sichtbaren Kopf einhängen (im Kollaps über die Klasse mit-
  // ausgeblendet, dort übernimmt der Strich-Button). Der Strich-Button lebt
  // als direkter Container-Kind unabhängig von den Slots und ist per CSS nur
  // im eingeklappten Zustand sichtbar. Beides nur bei aktiver Erweiterung und
  // nur bei sichtbaren Panels — eine panel-leere Spalte kollabiert weiterhin
  // vollständig über container.hidden, ohne Strich und ohne Icon.
  if (extActive && anyVisible) {
    if (topHeadEl) injectCollapseToggle(topHeadEl, paneIdx, side);
    container.appendChild(buildCollapseStrip(paneIdx, side));
  }
  if (splitter) splitter.hidden = !anyVisible || collapsed;
  if (anyVisible && !collapsed) {
    container.style.width = getSidebarWidth(side) + 'px';
  } else if (collapsed) {
    // 4T-0698: Die Laufzeit-Breite (Inline-style aus dem letzten ausgeklappten
    // Render) aktiv räumen, damit die schmale Strich-Breite aus der CSS-Klasse
    // .pane-sidebar.collapsed greift (Inline-width schlägt sonst die Klasse).
    container.style.width = '';
  }
}

// Reiterleiste eines Gruppen-Slots: ein Reiter je sichtbarem Panel,
// lokalisierter Panel-Titel, Klick aktiviert den Reiter in DIESER Spalte
// (4T-0942; zuvor im fensterweiten Layout, wodurch die andere Spalte
// mitsprang).
function buildSlotTabbar(entries, visibleIds, effectiveActive, paneIdx) {
  const bar = document.createElement('div');
  bar.className = 'sidebar-slot-tabs';
  bar.setAttribute('role', 'tablist');
  // 4T-0639: Reiter folgen demselben Zustand wie die Sektions-Köpfe — nie
  // gemischt Text und Icon.
  const useIcon = getIconHeadings();
  for (const e of entries) {
    if (!visibleIds.includes(e.id)) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-slot-tab';
    btn.dataset.panelId = e.id;
    applyPanelHeading(btn, e.def, useIcon);
    btn.setAttribute('role', 'tab');
    const active = e.id === effectiveActive;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.addEventListener('click', () => {
      // 4T-0942: Der Klick wirkt in der Spalte, in der die Leiste steht.
      void setActivePanelForColumn(e.id, paneIdx);
    });
    // 4T-0289: Reiter sind Drag-Quelle fuer gruppierte Panels (die
    // Sektions-Header sind in Gruppen ausgeblendet).
    btn.draggable = true;
    btn.addEventListener('dragstart', (ev) => handlePanelDragStart(ev, e.id));
    btn.addEventListener('dragend', cancelPanelDrag);
    bar.appendChild(btn);
  }
  // 4T-0289: Drop auf die Reiterleiste erweitert die Gruppe; das erste
  // Panel des Slots identifiziert die Gruppe stabil.
  const anchorId = entries[0].id;
  bar.addEventListener('dragover', (ev) => handlePanelDragOverTabbar(ev, anchorId, bar));
  bar.addEventListener('drop', handlePanelDrop);
  return bar;
}

// Splitter-Logik der Sidebars (Drag horizontal). 4T-0288: verallgemeinert
// auf beide Seiten — jede Seite hat eine eigene, global persistierte Breite
// (sidebar.widthLeft/widthRight); der rechte Splitter arbeitet gespiegelt
// (Ziehen nach links vergrößert die rechte Sidebar).
export function bindSidebarSplitters(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els) return;
  for (const side of SIDEBAR_SIDES) {
    const splitter = side === 'left' ? els.sidebarSplitterLeft : els.sidebarSplitterRight;
    const container = side === 'left' ? els.sidebarLeft : els.sidebarRight;
    if (!splitter || !container) continue;
    splitter.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      const startX = ev.clientX;
      const startW = container.getBoundingClientRect().width;
      function onMove(e) {
        const dx = e.clientX - startX;
        const next = clampSidebarWidth(side === 'left' ? startW + dx : startW - dx);
        setSidebarWidth(side, next, { persist: false });
        // Beide Panes an die gleiche Breite dieser Seite anpassen (die
        // Breite gilt pro Seite, nicht pro Pane).
        for (let i = 0; i < state.panes.length; i++) {
          const e2 = getPaneEls(i);
          const c2 = e2 && (side === 'left' ? e2.sidebarLeft : e2.sidebarRight);
          if (c2 && !c2.hidden) c2.style.width = next + 'px';
        }
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        // Erst am Drag-Ende persistieren (ein Store-Schreibzugriff statt
        // einem pro Mouse-Move).
        setSidebarWidth(side, getSidebarWidth(side));
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }
}
