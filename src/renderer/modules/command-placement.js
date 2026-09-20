// 4T-000520 (Epic 3E-000094): Laufzeit der Kommando-Platzierung im Renderer.
//
// Hält die persistierte Konfiguration (Store-Key 'commandPlacement') im
// Fenster, rendert das eigene Statusbar-Segment mit den nutzerdefinierten
// Kommando-Buttons (Icon aus dem kuratierten Set, Tooltip aus Anzeigename
// plus Original-Kommando, Klick über executeCommandById) und wendet die
// Hide-Liste der Standard-Elemente an. Ausblendung über die Render-Logik:
// diese Funktion setzt pro Ziel die Klasse 'sb-user-hidden' (DOM bleibt
// erhalten — kein Konflikt mit dem hidden-Attribut der Erweiterungs-Gates
// und der Selbstverwaltung von Wort-Statistik/Zoom-Indikator; die
// PZ-Reihenfolge-Asserts zählen weiterhin alle Buttons).
//
// 4T-001579 (Epic 3E-000283): Der eigene Überlauf dieses Segments ist
// entfallen. Seine Buttons stehen am Ende der linken Zone und wandern
// deshalb als erste in das linke Pull-up-Menü der Leiste
// (statusbar-overflow.js); zwei Mechaniken an derselben Messgröße
// (scrollWidth der Leiste) hätten sich gegenseitig verrechnet und jede
// Aussage über Schwing-Freiheit unmöglich gemacht. Dieses Modul ruft die
// neue Mechanik bewusst NICHT auf — sie beobachtet die Leiste selbst, und
// ein Gegen-Import wäre ein Ordner-Zyklus über die eingefrorene
// Bestands-Komponente.
//
// Setter/Broadcast nach dem Muster setPanelToggleOrder (sidebar-layout.js):
// lokales Dokument-Event 'scg:command-placement-changed', Multi-Window über
// den commandPlacement:changed-Kanal (Empfang mit persist:false).
'use strict';

import { t } from '../i18n.js';
import { api } from './app/api.js';
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

function segmentContainer() {
  return document.getElementById('command-buttons');
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
    container.appendChild(btn);
  }
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
}

// --- Gesamt-Anwendung und Init ---------------------------------------------------

export function applyCommandPlacementUi() {
  renderCommandButtons();
  applyStatusbarHideList();
}

// Verdrahtung des Segments (einmalig aus init() von app-init.js, nach dem
// Laden von Store-Stand und Erweiterungs-Zustand): Sprachwechsel (Tooltips
// neu auflösen) und der Multi-Window-Broadcast. Überlauf und Mehr-Menü
// liegen seit 4T-001579 in statusbar-overflow.js (siehe Modul-Kopf).
export function initCommandPlacementUi() {
  document.addEventListener('i18n-language-changed', () => renderCommandButtons());
  if (typeof api.onCommandPlacementChanged === 'function') {
    api.onCommandPlacementChanged((value) => {
      void setCommandPlacement(value, { persist: false });
    });
  }
  applyCommandPlacementUi();
}
