// 4T-0520 (Epic 3E-0094): Laufzeit der Kommando-Platzierung im Renderer.
//
// Hält die persistierte Konfiguration (Store-Key 'commandPlacement') im
// Fenster, rendert das eigene Statusbar-Segment mit den nutzerdefinierten
// Kommando-Buttons (Icon aus dem kuratierten Set, Tooltip aus Anzeigename
// plus Original-Kommando, Klick über executeCommandById) und wendet die
// Hide-Liste der Standard-Elemente an. Ausblendung über die Render-Logik:
// diese Funktion setzt pro Ziel die Klasse 'sb-user-hidden' (DOM bleibt
// erhalten — kein Konflikt mit dem hidden-Attribut der Erweiterungs-Gates
// und der Selbstverwaltung von Wort-Statistik/Zoom-Indikator; die
// PZ-Reihenfolge-Asserts zählen weiterhin alle Buttons). Überlauf: passt
// das Segment nicht mehr in die Statusbar, wandern Buttons von rechts in
// ein Mehr-Menü (Popup-Muster showHistoryMenu). Setter/Broadcast nach dem
// Muster setPanelToggleOrder (sidebar-layout.js): lokales Dokument-Event
// 'scg:command-placement-changed', Multi-Window über den
// commandPlacement:changed-Kanal (Empfang mit persist:false).
'use strict';

import { t } from '../i18n.js';
import { api } from './app/api.js';
import { contextMenu } from './app/app-state.js';
import { COMMANDS } from '../../shared/commands/commands.js';
import { disabledCommandIdSet } from '../../shared/extensions/extensions-core.js';
import {
  COMMAND_PLACEMENT_EXTENSION_ID,
  COMMAND_PLACEMENT_KEY,
  STATUSBAR_HIDE_TARGETS,
  defaultCommandPlacement,
  normalizeCommandPlacement,
} from '../../shared/commands/command-placement.js';
import { COMMAND_ICONS, DEFAULT_COMMAND_ICON } from '../../shared/commands/command-icons.js';
import { executeCommandById } from './command-palette.js';
import { getDisabledExtensionIds, isExtensionActive } from './extensions/extension-lifecycle.js';
import {
  appendContextMenuItem,
  hideContextMenu,
  placeContextMenuAt,
} from './dialogs/context-menu-utils.js';
import { persistSetting } from './views/views.js';

// --- Konfigurations-Zustand ------------------------------------------------------

let placement = defaultCommandPlacement();

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getCommandPlacement() {
  return deepCopy(placement);
}

// App-Start: persistierten Stand laden (defekt oder fehlend fällt still
// auf den leeren Default zurück) — vor dem ersten UI-Aufbau.
export async function initCommandPlacementFromStore() {
  let stored;
  try {
    stored = await api.getSetting(COMMAND_PLACEMENT_KEY);
  } catch {
    stored = null;
  }
  placement = normalizeCommandPlacement(stored);
  return getCommandPlacement();
}

// Konfiguration setzen — normalisiert, wendet auf Statusbar-Segment und
// Hide-Liste an, benachrichtigt Konsumenten (offene Einstellungs-Entwürfe)
// und persistiert. persist:false für den Empfang des Fenster-Broadcasts;
// eine unveränderte Konfiguration ist ein No-op.
export async function setCommandPlacement(next, opts = {}) {
  const normalized = normalizeCommandPlacement(next);
  const changed = JSON.stringify(normalized) !== JSON.stringify(placement);
  if (changed) {
    placement = normalized;
    applyCommandPlacementUi();
    document.dispatchEvent(new CustomEvent('scg:command-placement-changed'));
    if (opts.persist !== false) await persistSetting(COMMAND_PLACEMENT_KEY, normalized);
  }
  return getCommandPlacement();
}

// --- Statusbar-Segment -----------------------------------------------------------

// Einträge, die aktuell im Mehr-Menü liegen (von rechts eingelagerte
// Buttons); Neuaufbau bei jedem Überlauf-Durchlauf.
let overflowEntries = [];

function segmentContainer() {
  return document.getElementById('command-buttons');
}

function overflowButton() {
  return document.getElementById('btn-command-overflow');
}

// Baut die Kommando-Buttons des Segments neu auf. Einträge ohne
// registriertes Kommando (z.B. gelöschtes Makro) und Kommandos
// deaktivierter Erweiterungen erscheinen nicht (Konsistenz zu Menü und
// Palette); die Konfiguration bleibt unangetastet.
export function renderCommandButtons() {
  const container = segmentContainer();
  if (!container) return;
  container.querySelectorAll('.command-placement-button').forEach((b) => b.remove());
  const active = isExtensionActive(COMMAND_PLACEMENT_EXTENSION_ID);
  const entries = active ? placement.statusbar : [];
  const disabled = disabledCommandIdSet(getDisabledExtensionIds());
  const moreBtn = overflowButton();
  for (const entry of entries) {
    if (disabled.has(entry.commandId)) continue;
    const cmd = COMMANDS.find((c) => c.id === entry.commandId);
    if (!cmd) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-toggle btn-icon command-placement-button';
    btn.dataset.commandId = entry.commandId;
    btn.innerHTML = COMMAND_ICONS[entry.icon] || COMMAND_ICONS[DEFAULT_COMMAND_ICON];
    const baseLabel = t(cmd.labelKey);
    const title = entry.label ? `${entry.label} (${baseLabel})` : baseLabel;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.addEventListener('click', () => {
      executeCommandById(entry.commandId);
    });
    container.insertBefore(btn, moreBtn);
  }
  updateCommandButtonOverflow();
}

// Überlauf-Behandlung: solange die Statusbar breiter ist als ihr Platz,
// wandert der jeweils letzte sichtbare Kommando-Button ins Mehr-Menü.
// Messung über scrollWidth/clientWidth der Statusbar (die Buttons haben
// feste Breiten und schrumpfen nicht); der Mehr-Button selbst braucht
// Platz und wird vor dem Einlagern eingeblendet, damit die Schleife ihn
// mitmisst. Läuft nach jedem Neuaufbau, bei Fenster-Resize
// (ResizeObserver) und nach Hide-Listen-Änderungen.
export function updateCommandButtonOverflow() {
  const bar = document.querySelector('footer.statusbar');
  const container = segmentContainer();
  const moreBtn = overflowButton();
  if (!bar || !container || !moreBtn) return;
  const buttons = [...container.querySelectorAll('.command-placement-button')];
  overflowEntries = [];
  for (const b of buttons) b.hidden = false;
  moreBtn.hidden = true;
  let remaining = buttons.filter((b) => !b.hidden);
  let guard = buttons.length;
  while (bar.scrollWidth > bar.clientWidth && remaining.length > 0 && guard > 0) {
    moreBtn.hidden = false;
    const last = remaining[remaining.length - 1];
    last.hidden = true;
    overflowEntries.unshift({ commandId: last.dataset.commandId, title: last.title });
    remaining = remaining.slice(0, -1);
    guard--;
  }
}

// Mehr-Menü am Überlauf-Button (Popup-Muster showHistoryMenu): ein
// Eintrag pro eingelagertem Button, Klick führt das Kommando aus.
function showCommandOverflowMenu(event) {
  if (overflowEntries.length === 0) return;
  contextMenu.innerHTML = '';
  for (const entry of overflowEntries) {
    appendContextMenuItem(contextMenu, {
      label: entry.title,
      dataId: `command-overflow-${entry.commandId}`,
      action: () => {
        executeCommandById(entry.commandId);
      },
    });
  }
  const rect = event.currentTarget.getBoundingClientRect();
  placeContextMenuAt(contextMenu, rect.left, rect.top - 8);
}

// --- Hide-Liste ------------------------------------------------------------------

// Wendet die Hide-Liste über die Render-Logik an: Klasse 'sb-user-hidden'
// pro Ziel-Element (nur die Hinweis-Zeile ist kein Ziel — einziger
// Warn-Kanal). Im Aus-Zustand der Erweiterung werden alle Klassen
// entfernt (Standard-Statusbar); ausgeblendete Funktionen bleiben über
// Menü und Kommandos erreichbar.
export function applyStatusbarHideList() {
  const active = isExtensionActive(COMMAND_PLACEMENT_EXTENSION_ID);
  const hidden = new Set(active ? placement.hiddenButtons : []);
  for (const target of STATUSBAR_HIDE_TARGETS) {
    const el = target.elementId
      ? document.getElementById(target.elementId)
      : document.querySelector(target.selector);
    if (el) el.classList.toggle('sb-user-hidden', hidden.has(target.key));
  }
  updateCommandButtonOverflow();
}

// --- Gesamt-Anwendung und Init ---------------------------------------------------

export function applyCommandPlacementUi() {
  renderCommandButtons();
  applyStatusbarHideList();
}

// Verdrahtung des Segments (einmalig aus init() von app-init.js, nach dem
// Laden von Store-Stand und Erweiterungs-Zustand): Mehr-Menü-Klick,
// Resize-Beobachtung, Sprachwechsel (Tooltips neu auflösen) und der
// Multi-Window-Broadcast.
export function initCommandPlacementUi() {
  const moreBtn = overflowButton();
  if (moreBtn) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideContextMenu();
      showCommandOverflowMenu(e);
    });
  }
  const bar = document.querySelector('footer.statusbar');
  if (bar && typeof ResizeObserver === 'function') {
    new ResizeObserver(() => updateCommandButtonOverflow()).observe(bar);
  }
  document.addEventListener('i18n-language-changed', () => renderCommandButtons());
  if (typeof api.onCommandPlacementChanged === 'function') {
    api.onCommandPlacementChanged((value) => {
      void setCommandPlacement(value, { persist: false });
    });
  }
  applyCommandPlacementUi();
}
