// 4T-000607 (Epic 3E-000114): Laufzeit der Format-Toolbar im Renderer.
//
// Hält die persistierte Belegung (Store-Key 'formatToolbar') im Fenster
// und rendert pro Pane eine Leiste oberhalb des Editors (Container
// #format-toolbar-<paneIdx> in .pane-source). Sichtbar nur, wenn der
// aktive Tab der Pane im Edit-Modus ist und die Ansicht einen Editor
// zeigt (Quelltext, Geteilt, Live) — Sichtbarkeits-Anker ist der
// Edit-Zustand des Tabs, nicht der Editor-Fokus (Festlegung aus dem
// Epic-Risiko). Jede Schaltfläche löst ihr Registry-Kommando über
// executeCommandById aus (Kommandos statt Sonderlogik); ein Klick in die
// Leiste einer nicht-aktiven Pane aktiviert diese zuerst (activatePane),
// damit der editorScoped-Dispatch die richtige EditorView trifft.
// Zustands-Anzeige: Absatz-Zustände über getParagraphState, Zeichen-
// Formate über detectInlineFormats — gedrückt heißt „erneuter Klick
// entfernt das Format" (deckungsgleich mit der Toggle-Wirkung).
// Überlauf: passt die Belegung nicht in die Pane-Breite, wandern
// Einträge von rechts in ein Mehr-Menü (Muster des Statusbar-Überlaufs
// der Kommando-Platzierung). Setter/Broadcast nach dem Muster
// setCommandPlacement: lokales Dokument-Event
// 'scg:format-toolbar-changed', Multi-Window über den
// formatToolbar:changed-Kanal (Empfang mit persist:false).
//
// Modul-Zyklus: die Imports aus editor.js (paneEditors) und
// command-palette.js werden ausschließlich zur Laufzeit genutzt — der
// Zyklus über editor.js ist damit unkritisch (Muster des dokumentierten
// Laufzeit-Zyklus in editor-context-menu.js).
'use strict';

import { t } from '../../i18n.js';
import { api, getDocText } from '../app/api.js';
import { contextMenu, state } from '../app/app-state.js';
import { COMMANDS, mergeBindings } from '../../../shared/commands/commands.js';
// 4T-000993: Anzeige-String eines Bindings aus der Binding-Schicht.
import { bindingToDisplayString } from '../../../shared/commands/command-bindings.js';
import { disabledCommandIdSet } from '../../../shared/extensions/extensions-core.js';
import {
  FORMAT_TOOLBAR_EXTENSION_ID,
  FORMAT_TOOLBAR_KEY,
  normalizeFormatToolbar,
  visibleFormatToolbarEntries,
  collapseToolbarSeparators,
} from '../../../shared/format-toolbar.js';
import { COMMAND_ICONS, DEFAULT_COMMAND_ICON } from '../../../shared/commands/command-icons.js';
import { detectInlineFormats } from '../../../shared/markdown-format.js';
import { executeCommandById, isCommandIdAvailable } from '../command-palette.js';
import { getDisabledExtensionIds, isExtensionActive } from '../extensions/extension-lifecycle.js';
import {
  appendContextMenuItem,
  hideContextMenu,
  placeContextMenuAt,
} from '../dialogs/context-menu-utils.js';
import { getParagraphState, insertTableSized } from './editor-format.js';
import { paneEditors } from './editor.js';
import { activatePane } from '../tabs/tabs.js';
import { persistSetting } from '../views/views.js';

// --- Konfigurations-Zustand ------------------------------------------------------

let toolbar = normalizeFormatToolbar(null);

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getFormatToolbar() {
  return deepCopy(toolbar);
}

// App-Start: persistierten Stand laden (defekt oder fehlend fällt still
// auf die Standard-Belegung zurück) — vor dem ersten UI-Aufbau.
export async function initFormatToolbarFromStore() {
  let stored;
  try {
    stored = await api.getSetting(FORMAT_TOOLBAR_KEY);
  } catch {
    stored = null;
  }
  toolbar = normalizeFormatToolbar(stored);
  return getFormatToolbar();
}

// Belegung setzen — normalisiert, wendet auf beide Panes an,
// benachrichtigt Konsumenten (offene Einstellungs-Entwürfe) und
// persistiert. persist:false für den Empfang des Fenster-Broadcasts;
// eine unveränderte Belegung ist ein No-op.
export async function setFormatToolbar(next, opts = {}) {
  const normalized = normalizeFormatToolbar(next);
  const changed = JSON.stringify(normalized) !== JSON.stringify(toolbar);
  if (changed) {
    toolbar = normalized;
    applyFormatToolbarUi();
    document.dispatchEvent(new CustomEvent('scg:format-toolbar-changed'));
    if (opts.persist !== false) await persistSetting(FORMAT_TOOLBAR_KEY, normalized);
  }
  return getFormatToolbar();
}

// --- DOM-Zugriffe ----------------------------------------------------------------

function toolbarEl(paneIdx) {
  return document.getElementById(`format-toolbar-${paneIdx}`);
}

function moreButton(paneIdx) {
  return document.getElementById(`btn-format-toolbar-more-${paneIdx}`);
}

// Pro Pane die aktuell gerenderten Einträge parallel zur DOM-Item-Liste
// (Index i gehört zu Item i); Grundlage von Zustands-Refresh und Überlauf.
const renderedEntriesByPane = [[], []];

function itemElements(paneIdx) {
  const el = toolbarEl(paneIdx);
  return el ? [...el.querySelectorAll('.format-toolbar-item')] : [];
}

// --- Zustands-Erkennung ----------------------------------------------------------

// Gedrückt-Zustand eines Kommandos: true/false für zustandstragende
// Kommandos, null für zustandsfreie (Einfüge- und Link-Kommandos).
function commandActiveState(commandId, paragraphState, inlineActive) {
  if (commandId.startsWith('format.')) {
    const formatId = commandId.slice('format.'.length);
    return formatId === 'clear' ? null : inlineActive.includes(formatId);
  }
  if (commandId === 'paragraph.bulletList') return paragraphState.list === 'bullet';
  if (commandId === 'paragraph.orderedList') return paragraphState.list === 'ordered';
  if (commandId === 'paragraph.taskList') return paragraphState.list === 'task';
  if (commandId === 'paragraph.quote') return paragraphState.quote;
  const heading = commandId.match(/^paragraph\.heading([1-6])$/);
  if (heading) return paragraphState.heading === Number(heading[1]);
  if (commandId === 'paragraph.noHeading') return paragraphState.heading === 0;
  return null;
}

// Absatz- und Zeichen-Format-Zustand an der aktuellen Selektion der Pane.
function paneEditorState(paneIdx) {
  const view = paneEditors[paneIdx];
  if (!view) return null;
  const { from, to } = view.state.selection.main;
  return {
    paragraph: getParagraphState(view),
    inline: detectInlineFormats(getDocText(view.state.doc), from, to),
  };
}

// --- Tooltip ---------------------------------------------------------------------

// Kommando-Name plus effektives Kürzel (inklusive Nutzer-Umbelegungen,
// Muster der Kommando-Palette).
function commandTooltip(cmd) {
  const binding = (mergeBindings(state.hotkeyOverrides)[cmd.id] || [])[0] || '';
  const label = t(cmd.labelKey);
  return binding ? `${label} (${bindingToDisplayString(binding)})` : label;
}

// --- Rendern ---------------------------------------------------------------------

// Sichtbare Einträge der Belegung: Kommandos deaktivierter Erweiterungen
// und unbekannte Kommandos entfallen (Konsistenz zu Menü und Palette),
// überzählige Trenner werden bereinigt. Im Aus-Zustand der Erweiterung
// ist die Liste leer.
function currentVisibleEntries() {
  if (!isExtensionActive(FORMAT_TOOLBAR_EXTENSION_ID)) return [];
  return visibleFormatToolbarEntries(
    toolbar.entries,
    disabledCommandIdSet(getDisabledExtensionIds()),
    new Set(COMMANDS.map((c) => c.id)),
  );
}

function runEntryCommand(paneIdx, commandId) {
  activatePane(paneIdx);
  executeCommandById(commandId);
}

// Überschrift-Menü: die sieben paragraph.-Kommandos als Dropdown mit
// Zustands-Häkchen (Ebene der Cursor-Zeile, Muster Absatz-Submenü des
// Editor-Kontextmenüs).
function buildHeadingMenuItems(paneIdx) {
  const editorState = paneEditorState(paneIdx);
  const heading = editorState ? editorState.paragraph.heading : 0;
  const items = [];
  for (let lvl = 1; lvl <= 6; lvl++) {
    items.push({
      key: `command.paragraph.heading${lvl}`,
      dataId: `format-toolbar-heading${lvl}`,
      checked: heading === lvl,
      action: () => runEntryCommand(paneIdx, `paragraph.heading${lvl}`),
    });
  }
  items.push({
    key: 'command.paragraph.noHeading',
    dataId: 'format-toolbar-noheading',
    checked: heading === 0,
    action: () => runEntryCommand(paneIdx, 'paragraph.noHeading'),
  });
  return items;
}

function showHeadingMenu(paneIdx, anchorRect) {
  contextMenu.innerHTML = '';
  for (const item of buildHeadingMenuItems(paneIdx)) {
    appendContextMenuItem(contextMenu, item);
  }
  placeContextMenuAt(contextMenu, anchorRect.left, anchorRect.bottom + 2);
}

// --- Tabellen-Raster-Picker (4T-000608) --------------------------------------------

// Hover-Raster nach Textverarbeitungs-Vorbild: Überstreichen markiert
// Zeilen mal Spalten (Live-Beschriftung „3 × 4", Zeilen inklusive
// Kopfzeile), Klick fügt die leere Pipe-Tabelle am Cursor ein (ein
// dispatch — Undo in einem Schritt). Ein geteiltes Popup für beide Panes
// (dataset.paneIdx), lazy erzeugt; Außenklick und Escape schließen.
const TABLE_GRID_MAX = 8;
let tableGridEl = null;
let tableGridCleanup = null;

function markTableGrid(rows, cols) {
  if (!tableGridEl) return;
  for (const cell of tableGridEl.querySelectorAll('.table-grid-cell')) {
    const marked =
      rows > 0 && Number(cell.dataset.rows) <= rows && Number(cell.dataset.cols) <= cols;
    cell.classList.toggle('marked', marked);
  }
  const label = tableGridEl.querySelector('.table-grid-picker-label');
  if (label) label.textContent = rows > 0 ? `${rows} × ${cols}` : '';
}

function pickTableSize(rows, cols) {
  const paneIdx = Number(tableGridEl.dataset.paneIdx);
  hideTableGridPicker();
  activatePane(paneIdx);
  const view = paneEditors[paneIdx];
  if (!view) return;
  view.focus();
  insertTableSized(view, rows, cols);
}

function ensureTableGridPicker() {
  if (tableGridEl) return tableGridEl;
  const el = document.createElement('div');
  el.id = 'table-grid-picker';
  el.className = 'table-grid-picker';
  el.hidden = true;
  const grid = document.createElement('div');
  grid.className = 'table-grid-picker-cells';
  for (let r = 1; r <= TABLE_GRID_MAX; r++) {
    for (let c = 1; c <= TABLE_GRID_MAX; c++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'table-grid-cell';
      cell.dataset.rows = String(r);
      cell.dataset.cols = String(c);
      cell.setAttribute('aria-label', `${r} × ${c}`);
      cell.addEventListener('mouseenter', () => markTableGrid(r, c));
      cell.addEventListener('click', () => pickTableSize(r, c));
      grid.appendChild(cell);
    }
  }
  grid.addEventListener('mouseleave', () => markTableGrid(0, 0));
  const label = document.createElement('div');
  label.className = 'table-grid-picker-label';
  el.append(grid, label);
  document.body.appendChild(el);
  tableGridEl = el;
  return el;
}

function hideTableGridPicker() {
  if (!tableGridEl || tableGridEl.hidden) return;
  tableGridEl.hidden = true;
  if (tableGridCleanup) {
    tableGridCleanup();
    tableGridCleanup = null;
  }
}

function showTableGridPicker(paneIdx, anchorRect) {
  const el = ensureTableGridPicker();
  hideContextMenu();
  markTableGrid(0, 0);
  el.dataset.paneIdx = String(paneIdx);
  // Position mit Viewport-Klemmung (Muster placeContextMenuAt).
  el.style.left = '0px';
  el.style.top = '0px';
  el.hidden = false;
  const rect = el.getBoundingClientRect();
  let x = anchorRect.left;
  let y = anchorRect.bottom + 2;
  if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
  if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  // Außenklick schließt; der Tabellen-Button selbst ist ausgenommen,
  // damit sein Klick-Handler als Toggle wirken kann (Capture-Phase,
  // Listener nur solange das Popup offen ist).
  const onDown = (e) => {
    if (el.contains(e.target)) return;
    if (e.target instanceof Element && e.target.closest('.format-toolbar-table-button')) return;
    hideTableGridPicker();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      hideTableGridPicker();
    }
  };
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  tableGridCleanup = () => {
    document.removeEventListener('mousedown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
  };
}

// Klick-Verhalten des Tabellen-Eintrags in der Toolbar: Toggle des
// Raster-Pickers an der Button-Kante (an allen anderen Platzierungs-Orten
// bleibt insert.table die 2×2-Schablone).
function toggleTableGridPicker(paneIdx, anchorRect) {
  if (tableGridEl && !tableGridEl.hidden && Number(tableGridEl.dataset.paneIdx) === paneIdx) {
    hideTableGridPicker();
    return;
  }
  hideTableGridPicker();
  activatePane(paneIdx);
  showTableGridPicker(paneIdx, anchorRect);
}

// Baut die Leiste einer Pane aus den sichtbaren Einträgen neu auf.
function renderFormatToolbarForPane(paneIdx) {
  const el = toolbarEl(paneIdx);
  if (!el) return;
  el.querySelectorAll('.format-toolbar-item').forEach((n) => n.remove());
  const entries = currentVisibleEntries();
  renderedEntriesByPane[paneIdx] = entries;
  const moreBtn = moreButton(paneIdx);
  for (const entry of entries) {
    let node;
    if (entry.type === 'separator') {
      node = document.createElement('span');
      node.className = 'format-toolbar-item format-toolbar-separator';
      node.setAttribute('aria-hidden', 'true');
    } else if (entry.type === 'headings') {
      node = document.createElement('button');
      node.type = 'button';
      node.className = 'btn-toggle btn-icon format-toolbar-item format-toolbar-button';
      node.dataset.special = 'headings';
      node.innerHTML = COMMAND_ICONS.heading;
      const title = t('formatToolbar.headings');
      node.title = title;
      node.setAttribute('aria-label', title);
      node.setAttribute('aria-haspopup', 'menu');
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        hideContextMenu();
        activatePane(paneIdx);
        showHeadingMenu(paneIdx, e.currentTarget.getBoundingClientRect());
      });
    } else {
      const cmd = COMMANDS.find((c) => c.id === entry.commandId);
      node = document.createElement('button');
      node.type = 'button';
      node.className = 'btn-toggle btn-icon format-toolbar-item format-toolbar-button';
      node.dataset.commandId = entry.commandId;
      node.innerHTML = COMMAND_ICONS[entry.icon] || COMMAND_ICONS[DEFAULT_COMMAND_ICON];
      const base = commandTooltip(cmd);
      const title = entry.label ? `${entry.label} (${base})` : base;
      node.title = title;
      node.setAttribute('aria-label', title);
      if (entry.commandId === 'insert.table') {
        // 4T-000608: in der Toolbar öffnet der Tabellen-Eintrag den
        // Raster-Picker statt der festen 2×2-Schablone.
        node.classList.add('format-toolbar-table-button');
        node.setAttribute('aria-haspopup', 'menu');
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleTableGridPicker(paneIdx, e.currentTarget.getBoundingClientRect());
        });
      } else {
        node.addEventListener('click', () => {
          runEntryCommand(paneIdx, entry.commandId);
        });
      }
    }
    el.insertBefore(node, moreBtn);
  }
  updateFormatToolbarOverflow(paneIdx);
  refreshFormatToolbarState(paneIdx);
}

export function renderFormatToolbars() {
  for (let i = 0; i < renderedEntriesByPane.length; i++) renderFormatToolbarForPane(i);
}

// --- Sichtbarkeit ----------------------------------------------------------------

// Sichtbar genau dann, wenn die Erweiterung aktiv ist und der aktive Tab
// der Pane im Edit-Modus einen Editor zeigt. Nach dem Einblenden Überlauf
// und Zustand nachziehen (im hidden-Zustand ist die Breite nicht messbar).
export function updateFormatToolbarForPane(paneIdx) {
  const el = toolbarEl(paneIdx);
  if (!el) return;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const editorVisible =
    !!tab && ['source', 'split', 'live'].includes(tab.viewMode) && !!tab.editMode;
  const visible = editorVisible && isExtensionActive(FORMAT_TOOLBAR_EXTENSION_ID);
  const wasHidden = el.hidden;
  el.hidden = !visible;
  if (visible && wasHidden) {
    updateFormatToolbarOverflow(paneIdx);
    refreshFormatToolbarState(paneIdx);
  }
}

export function applyFormatToolbarUi() {
  renderFormatToolbars();
  for (let i = 0; i < renderedEntriesByPane.length; i++) updateFormatToolbarForPane(i);
}

// --- Zustands-Anzeige ------------------------------------------------------------

// Gedrückt-Darstellung der zustandstragenden Buttons und Ausgrau-Zustand
// global wirkender Kommandos. editorScoped-Kommandos werden nicht
// ausgegraut: die sichtbare Leiste impliziert den Editor-Kontext der
// eigenen Pane (die Verfügbarkeits-Prüfung der Palette bewertet dagegen
// die aktive Pane).
export function refreshFormatToolbarState(paneIdx) {
  const el = toolbarEl(paneIdx);
  if (!el || el.hidden) return;
  const editorState = paneEditorState(paneIdx);
  if (!editorState) return;
  const items = itemElements(paneIdx);
  const entries = renderedEntriesByPane[paneIdx];
  items.forEach((node, i) => {
    const entry = entries[i];
    if (!entry) return;
    if (entry.type === 'headings') {
      node.classList.toggle('active', editorState.paragraph.heading > 0);
      node.setAttribute('aria-pressed', String(editorState.paragraph.heading > 0));
      return;
    }
    if (entry.type !== 'command') return;
    const active = commandActiveState(entry.commandId, editorState.paragraph, editorState.inline);
    if (active !== null) {
      node.classList.toggle('active', active);
      node.setAttribute('aria-pressed', String(active));
    }
    const cmd = COMMANDS.find((c) => c.id === entry.commandId);
    if (cmd && !cmd.editorScoped) {
      node.disabled = !isCommandIdAvailable(entry.commandId);
    }
  });
}

// Debounce über requestAnimationFrame: Cursor-Bewegungen beim Tippen
// kollabieren auf einen Refresh pro Frame (Aufruf aus dem updateListener
// des Editors bei jeder Selektions- oder Dokument-Änderung).
const refreshScheduled = [false, false];

export function scheduleFormatToolbarStateRefresh(view) {
  const paneIdx = paneEditors.indexOf(view);
  if (paneIdx < 0 || refreshScheduled[paneIdx]) return;
  const el = toolbarEl(paneIdx);
  if (!el || el.hidden) return;
  refreshScheduled[paneIdx] = true;
  requestAnimationFrame(() => {
    refreshScheduled[paneIdx] = false;
    refreshFormatToolbarState(paneIdx);
  });
}

// --- Überlauf --------------------------------------------------------------------

// Einträge, die aktuell im Mehr-Menü der Pane liegen (von rechts
// eingelagerte Items); Neuaufbau bei jedem Überlauf-Durchlauf.
const overflowEntriesByPane = [[], []];

// Solange die Leiste breiter ist als ihr Platz, wandert das jeweils
// letzte sichtbare Item ins Mehr-Menü (Muster updateCommandButtonOverflow;
// der Mehr-Button wird vor dem Einlagern eingeblendet, damit die Schleife
// ihn mitmisst).
export function updateFormatToolbarOverflow(paneIdx) {
  const el = toolbarEl(paneIdx);
  const moreBtn = moreButton(paneIdx);
  if (!el || el.hidden || !moreBtn) return;
  const items = itemElements(paneIdx);
  const entries = renderedEntriesByPane[paneIdx];
  overflowEntriesByPane[paneIdx] = [];
  for (const item of items) item.hidden = false;
  moreBtn.hidden = true;
  let remaining = items.length;
  let guard = items.length;
  while (el.scrollWidth > el.clientWidth && remaining > 0 && guard > 0) {
    moreBtn.hidden = false;
    remaining--;
    items[remaining].hidden = true;
    overflowEntriesByPane[paneIdx].unshift(entries[remaining]);
    guard--;
  }
}

// Mehr-Menü: ein Eintrag pro eingelagertem Item mit Label, Icon und
// Zustands-Häkchen; das Überschrift-Menü erscheint als Untermenü.
function showFormatToolbarOverflowMenu(paneIdx, anchorRect) {
  const entries = collapseToolbarSeparators(overflowEntriesByPane[paneIdx]);
  if (entries.length === 0) return;
  activatePane(paneIdx);
  const editorState = paneEditorState(paneIdx);
  contextMenu.innerHTML = '';
  for (const entry of entries) {
    if (entry.type === 'separator') {
      appendContextMenuItem(contextMenu, { separator: true });
      continue;
    }
    if (entry.type === 'headings') {
      appendContextMenuItem(contextMenu, {
        label: t('formatToolbar.headings'),
        dataId: 'format-toolbar-overflow-headings',
        submenu: buildHeadingMenuItems(paneIdx),
      });
      continue;
    }
    const cmd = COMMANDS.find((c) => c.id === entry.commandId);
    if (!cmd) continue;
    const active = editorState
      ? commandActiveState(entry.commandId, editorState.paragraph, editorState.inline)
      : null;
    appendContextMenuItem(contextMenu, {
      label: entry.label || t(cmd.labelKey),
      dataId: `format-toolbar-overflow-${entry.commandId}`,
      icon: COMMAND_ICONS[entry.icon] || COMMAND_ICONS[DEFAULT_COMMAND_ICON],
      ...(active !== null ? { checked: active } : {}),
      disabled: !cmd.editorScoped && !isCommandIdAvailable(entry.commandId),
      action: () => {
        // 4T-000608: auch im Mehr-Menü öffnet der Tabellen-Eintrag den
        // Raster-Picker (am Menü-Anker, das Menü ist beim Öffnen zu).
        if (entry.commandId === 'insert.table') {
          showTableGridPicker(paneIdx, anchorRect);
          return;
        }
        runEntryCommand(paneIdx, entry.commandId);
      },
    });
  }
  placeContextMenuAt(contextMenu, anchorRect.left, anchorRect.bottom + 2);
}

// --- Init ------------------------------------------------------------------------

// Verdrahtung (einmalig aus init() von app-init.js, nach dem Laden von
// Store-Stand und Erweiterungs-Zustand): Mehr-Menü-Klicks, Resize-
// Beobachtung pro Leiste, Sprachwechsel (Tooltips neu auflösen) und der
// Multi-Window-Broadcast.
export function initFormatToolbarUi() {
  for (let i = 0; i < renderedEntriesByPane.length; i++) {
    const moreBtn = moreButton(i);
    if (moreBtn) {
      const paneIdx = i;
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideContextMenu();
        showFormatToolbarOverflowMenu(paneIdx, e.currentTarget.getBoundingClientRect());
      });
    }
    const el = toolbarEl(i);
    if (el && typeof ResizeObserver === 'function') {
      const paneIdx = i;
      new ResizeObserver(() => updateFormatToolbarOverflow(paneIdx)).observe(el);
    }
  }
  document.addEventListener('i18n-language-changed', () => renderFormatToolbars());
  if (typeof api.onFormatToolbarChanged === 'function') {
    api.onFormatToolbarChanged((value) => {
      void setFormatToolbar(value, { persist: false });
    });
  }
  applyFormatToolbarUi();
}
