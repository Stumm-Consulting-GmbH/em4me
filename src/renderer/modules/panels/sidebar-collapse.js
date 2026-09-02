// === 4T-000697/4T-000698 (Epic 3E-000141): Kollaps der Sidebar-Spalten ============
// 4T-000990 (Epic 3E-000196): aus panels.js in den Ordner panels/ ausgezogen.
// Zwei Teile in einem Modul, weil sie dieselbe Bedienung tragen: der
// Zustand der Spalte (Setter, Toggle, Aufhebung) und die beiden Bedien-Orte
// (Kopf-Toggle im obersten sichtbaren Kopf, Strich-Button am eingeklappten
// Rand), die der Kern beim Aufbau der Spalte einhängt.
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { SIDEBAR_SIDES } from '../sidebar-layout.js';
import { reportMenuStateNow } from '../tabs/tabs.js';
// Laufzeit-Zyklus innerhalb des Ordners panels/: Der Kern hängt Kopf-Toggle
// und Strich-Button beim Aufbau einer Spalte ein, die Setter hier stoßen
// umgekehrt das Neu-Rendern an. Beide Richtungen greifen ausschließlich zur
// Laufzeit (kein Top-Level-Wert-Zugriff); eine dritte Datei nur für die
// beiden Render-Aufrufe brächte keinen Gewinn.
import { renderAllSidebars, renderSidebarForPane } from './panels.js';

// Klassisches Sidebar-Symbol als Inline-SVG: Rechteck-Rahmen mit gefüllter
// linker Teilfläche (Trennlinie bei x=9), im Stil der Sektions-Header-Icons
// (viewBox 24, 14px, currentColor, stroke-width 2). Die rechte Spalte spiegelt
// es allein per CSS (transform: scaleX(-1)); die Grafik ist in beiden
// Zuständen identisch, nur der Tooltip wechselt (einklappen/ausklappen).
const SIDEBAR_TOGGLE_SVG_NS = 'http://www.w3.org/2000/svg';

function buildSidebarToggleIcon() {
  const svg = document.createElementNS(SIDEBAR_TOGGLE_SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const frame = document.createElementNS(SIDEBAR_TOGGLE_SVG_NS, 'rect');
  frame.setAttribute('x', '3');
  frame.setAttribute('y', '4');
  frame.setAttribute('width', '18');
  frame.setAttribute('height', '16');
  frame.setAttribute('rx', '2');
  svg.appendChild(frame);
  // Gefüllte linke Teilfläche mit gerundeten Außenecken (folgen dem Rahmen),
  // gerade Kante bei x=9 als Trennlinie zur (leeren) rechten Fläche.
  const fill = document.createElementNS(SIDEBAR_TOGGLE_SVG_NS, 'path');
  fill.setAttribute('d', 'M5 4h4v16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z');
  fill.setAttribute('fill', 'currentColor');
  fill.setAttribute('stroke', 'none');
  svg.appendChild(fill);
  return svg;
}

// Klick-Guards, gemeinsam für Kopf-Toggle und Strich-Button: kein Panel-Drag
// aus dem Button heraus (der Sektions-Kopf ist Drag-Quelle) und kein
// Durchreichen an Reiter- oder Container-Klicks — der Klick toggelt
// ausschließlich den Kollaps der eigenen Spalte.
function bindCollapseToggleHandlers(btn, paneIdx, side) {
  btn.draggable = true;
  btn.addEventListener('dragstart', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
  });
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleSidebarCollapse(paneIdx, side);
  });
}

// Kopf-Toggle (eingeblendeter Zustand): am inneren Rand des obersten
// sichtbaren Kopfs. Linke Spalte rechtsbündig (ans Ende, CSS margin-left:auto),
// rechte Spalte linksbündig vor dem ersten Element (als erstes Kind).
export function injectCollapseToggle(headEl, paneIdx, side) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sidebar-collapse-toggle';
  const label = t('sidebar.collapse.tooltip');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.appendChild(buildSidebarToggleIcon());
  bindCollapseToggleHandlers(btn, paneIdx, side);
  if (side === 'right') headEl.insertBefore(btn, headEl.firstChild);
  else headEl.appendChild(btn);
}

// Strich-Button (eingeklappter Zustand): direktes Container-Kind, per CSS nur
// bei .collapsed sichtbar und erst beim Überfahren des Strichs eingeblendet.
// Gleiche Grafik wie der Kopf-Toggle, Tooltip „ausklappen".
export function buildCollapseStrip(paneIdx, side) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sidebar-collapse-strip';
  const label = t('sidebar.expand.tooltip');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.appendChild(buildSidebarToggleIcon());
  bindCollapseToggleHandlers(btn, paneIdx, side);
  return btn;
}

// === 4T-000697 (Epic 3E-000141): Kollaps-Zustand der Sidebar-Spalten ===========
// Setter/Toggle des Spalten-Kollaps je Editor-Spalte (Pane-Group) und Seite.
// Verhaltensmuster setFocusMode/toggleFocusMode: Zustand setzen, Rendern der
// betroffenen Spalte anstoßen, api.setSetting schreiben, Menü-Häkchen der
// aktiven Spalte nachziehen. Physisch hier statt in app-state.js, weil der
// Setter — wie der Bestands-Setter toggleOutlinePanel — eine pane-gebundene
// Sidebar neu rendern muss; app-state.js bleibt bewusst zyklusarm (kein
// Import der Panel-Module). Die Panel-Sichtbarkeiten bleiben unangetastet, das
// spätere Ausklappen stellt exakt den vorherigen Stand wieder her.
export function setSidebarCollapsed(paneIdx, side, on) {
  if (side !== 'left' && side !== 'right') return;
  const arr = state.sidebarCollapsed[side];
  if (!arr || paneIdx < 0 || paneIdx >= arr.length) return;
  const next = !!on;
  if (arr[paneIdx] === next) return;
  arr[paneIdx] = next;
  renderSidebarForPane(paneIdx);
  api.setSetting('sidebarCollapsed', state.sidebarCollapsed);
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export function toggleSidebarCollapse(paneIdx, side) {
  const arr = state.sidebarCollapsed[side];
  if (!arr || paneIdx < 0 || paneIdx >= arr.length) return;
  setSidebarCollapsed(paneIdx, side, !arr[paneIdx]);
}

// 4T-000697: Aus-Zustand der Erweiterung — gespeicherten Kollaps-Zustand
// vollständig aufheben, damit keine Spalte unbedienbar eingeklappt
// zurückbleibt (im Aus-Zustand gibt es weder Kommando noch Icon zum
// Ausklappen). No-op, wenn ohnehin alles ausgeklappt ist (kein überflüssiger
// Store-Write, kein Re-Render). Mit { render: false } unterdrückt der Aufrufer
// den eigenen Re-Render, weil er unmittelbar danach selbst alle Sidebars
// rendert (Deaktivierungs-Hook, siehe app-init.js) — so entsteht kein
// doppeltes Rendern, wenn eine Spalte eingeklappt war.
export function clearSidebarCollapsed({ render = true } = {}) {
  let any = false;
  for (const side of SIDEBAR_SIDES) {
    const arr = state.sidebarCollapsed[side];
    if (!arr) continue;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i]) {
        arr[i] = false;
        any = true;
      }
    }
  }
  if (!any) return;
  if (render) renderAllSidebars();
  api.setSetting('sidebarCollapsed', state.sidebarCollapsed);
  reportMenuStateNow();
}
