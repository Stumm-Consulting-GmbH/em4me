// 4T-000480 (Epic 3E-000089): Kommando-Palette — filterbares Popup aller
// Registry-Kommandos. Aufbau nach dem Overlay-Muster des Vorlagen-Pickers
// (templates.js showTemplatePickerDialog): statisches Modal in index.html,
// Filter-Input mit dauerhaftem Fokus, Pfeil-Navigation ueber die
// .active-Klasse, Enter/Klick fuehrt aus, Esc/Backdrop/Abbrechen schliesst
// (Capture-Phase-keydown mit stopPropagation haelt die globale Esc-Kaskade
// heraus). Quelle ist ausschliesslich die Kommando-Registry
// (shared/commands/commands.js); die Ausfuehrung laeuft ueber den bestehenden
// Dispatch-Pfad: global dispatchte Kommandos ueber die commandHandlers-Map
// aus app-init.js (via initCommandPalette injiziert, zyklenfrei),
// editorScoped-Kommandos ueber EDITOR_COMMAND_FUNCTIONS auf der aktiven
// EditorView (derselbe Funktions-Satz wie die CodeMirror-Keymap).
//
// Verfuegbarkeit: im aktuellen Kontext nicht ausfuehrbare Kommandos
// erscheinen gedimmt (.unavailable) und sind nicht ausfuehrbar. Die Regeln
// spiegeln die enabled-Ausdruecke des Anwendungs-Menues (src/main/menu/menu.js)
// auf Basis derselben Renderer-Flags, die reportMenuStateNow (tabs.js) an
// den Main-Prozess meldet; Handler-Guards bleiben als zweite Sicherung.
'use strict';

import { COMMANDS, COMMAND_CATEGORIES, mergeBindings } from '../../shared/commands/commands.js';
// 4T-000993: Anzeige-String eines Bindings aus der Binding-Schicht.
import { bindingToDisplayString } from '../../shared/commands/command-bindings.js';
import { disabledCommandIdSet } from '../../shared/extensions/extensions-core.js';
import { filterCommandEntries } from '../../shared/commands/command-palette-filter.js';
import { t } from '../i18n.js';
import { state, activeTab } from './app/app-state.js';
// 4T-000546 (Epic 3E-000097): Verfuegbarkeits-Regel des Kalender-Kommandos
// (zyklenfreier Renderer-Zustand der Kalender-Konfiguration).
import { hasCalendarConfig } from './calendar/calendar-config.js';
import { getDisabledExtensionIds } from './extensions/extension-lifecycle.js';
import { paneEditors } from './editor/editor.js';
import { EDITOR_COMMAND_FUNCTIONS } from './editor/editor-keymaps.js';
// 4T-000590 (Epic 3E-000109): Verfuegbarkeits-Regel der table.*-Kommandos —
// zusaetzlich zum Editor-Kontext muss der Cursor in einer Tabelle stehen.
import { hasTableContext } from './editor/editor-table-tools.js';

function $(sel) {
  return document.querySelector(sel);
}

// Von app-init.js injizierter Ausfuehrungs-Pfad fuer global dispatchte
// Kommandos (commandHandlers-Map). Injektion statt Import, weil app-init
// dieses Modul importiert (Zyklus-Vermeidung, Muster Wiring-Objekt).
let runGlobalCommand = null;

export function initCommandPalette({ executeCommand }) {
  runGlobalCommand = typeof executeCommand === 'function' ? executeCommand : null;
}

// --- Verfuegbarkeits-Regeln --------------------------------------------------

// Kommandos, die einen geoeffneten Bereich brauchen (Menue: state.hasArea).
const AREA_COMMANDS = new Set([
  'journal.openToday',
  'journal.openForDate',
  'journal.nachtragen',
  'area.close',
  'graph.openArea',
  // 4T-000620 (Epic 3E-000117): Bereichs-Statistik braucht den abgegrenzten
  // Datei-Raum eines Bereichs.
  'stats.openArea',
]);
// Kommandos auf einer echten Datei (Menue: hasActiveTab && !manualTab &&
// !systemTab).
const FILE_TAB_COMMANDS = new Set([
  'file.newSubpage',
  'file.save',
  'file.saveAs',
  'file.rename',
  'file.detachSubpage',
  'history.open',
  'view.toggleEdit',
]);
// Kommandos auf einem Inhalts-Tab (Menue: hasActiveTab && !systemTab).
// 4T-000890 (Befund L-05): der portable Export teilt die enabled-Regel des
// Export-Untermenues mit dem PDF-Export und wird deshalb hier gespiegelt.
const CONTENT_TAB_COMMANDS = new Set(['file.exportPdf', 'file.exportPortable']);
// Kommandos, die irgendeinen aktiven Tab brauchen (Menue: hasActiveTab).
const ANY_TAB_COMMANDS = new Set(['file.bookmarkAdd', 'tab.close', 'view.toggleScrollSync']);
// Ansichtsmodi: auf System-Seiten deaktiviert (Menue: !systemTab).
const VIEW_MODE_COMMANDS = new Set([
  'view.modeRendered',
  'view.modeSplit',
  'view.modeSource',
  'view.modeLive',
]);
// Editor-Darstellungs-Toggles (Menue: togglesEnabled = Quelltext sichtbar).
const SOURCE_TOGGLE_COMMANDS = new Set([
  'view.toggleFoldGutter',
  'view.toggleLineNumbers',
  'view.toggleWordWrap',
]);
// Einfuege-Kommandos mit eigenem Editor-Guard im Handler (app-init.js).
const EDITOR_CONTEXT_COMMANDS = new Set(['edit.insertTimestamp', 'edit.insertTemplate']);

function currentPaletteContext() {
  const tab = activeTab();
  const manualTab = !!(tab && tab.manualPage);
  const systemTab = !!(tab && tab.systemPage);
  const viewMode = tab ? tab.viewMode : null;
  return {
    hasTab: !!tab,
    manualTab,
    systemTab,
    editMode: tab ? !!tab.editMode : false,
    viewMode,
    hasArea: !!state.areaPath,
    // 4T-000538 (Epic 3E-000098): Arbeitsbereichs-Zuordnung der eigenen App.
    hasWorkspace: !!state.workspaceName,
    sourceVisible: viewMode === 'source' || viewMode === 'split' || viewMode === 'live',
    // 4T-000590 (Epic 3E-000109): steht der Cursor des aktiven Editors in einer
    // Tabelle? (Dimmung der table.*-Kommandos ausserhalb von Tabellen.)
    inTable: hasTableContext(paneEditors[state.activePaneIndex]),
  };
}

// Editor-Kontext: bearbeitbarer Datei-Tab mit sichtbarem Editor (Guard-
// Muster von edit.insertTimestamp in app-init.js).
function editorContextAvailable(ctx) {
  return (
    ctx.hasTab && !ctx.manualTab && !ctx.systemTab && ctx.editMode && ctx.viewMode !== 'rendered'
  );
}

export function isCommandAvailable(cmd, ctx) {
  // 4T-000590 (Epic 3E-000109): Tabellen-Operationen nur mit Cursor in einer
  // Tabelle (sichtbar, aber gedimmt ausserhalb — wie die Menue-Dimmung).
  if (cmd.id.startsWith('table.')) {
    return editorContextAvailable(ctx) && !!ctx.inTable;
  }
  if (cmd.editorScoped || EDITOR_CONTEXT_COMMANDS.has(cmd.id)) {
    return editorContextAvailable(ctx);
  }
  // 4T-000546 (Epic 3E-000097): Kalender-Wert einfuegen — Editor-Kontext plus
  // Bereich mit mindestens einem definierten Kalender.
  if (cmd.id === 'calendar.insertValue') {
    return editorContextAvailable(ctx) && ctx.hasArea && hasCalendarConfig();
  }
  if (AREA_COMMANDS.has(cmd.id)) return ctx.hasArea;
  // 4T-000538 (Epic 3E-000098): Arbeitsbereichs-Kommandos — "speichern als"
  // nur ohne bestehende Zuordnung, "schliessen" nur im Arbeitsbereichs-
  // Fenster (spiegelt die enabled-Regeln des Datei-Menues).
  if (cmd.id === 'workspace.saveAs') return !ctx.hasWorkspace;
  if (cmd.id === 'workspace.close') return ctx.hasWorkspace;
  if (FILE_TAB_COMMANDS.has(cmd.id)) return ctx.hasTab && !ctx.manualTab && !ctx.systemTab;
  if (CONTENT_TAB_COMMANDS.has(cmd.id)) return ctx.hasTab && !ctx.systemTab;
  if (ANY_TAB_COMMANDS.has(cmd.id)) return ctx.hasTab;
  if (VIEW_MODE_COMMANDS.has(cmd.id)) return !ctx.systemTab;
  if (SOURCE_TOGGLE_COMMANDS.has(cmd.id)) return ctx.sourceVisible;
  return true;
}

// --- Eintrags-Aufbau ----------------------------------------------------------

// Baut die Palette-Eintraege beim Oeffnen: Registry-Reihenfolge innerhalb
// der fuenf Kategorie-Gruppen (Muster der Kuerzel-Einstellungsseite),
// Kommandos deaktivierter Erweiterungen ausgeschlossen, effektive Kuerzel
// inklusive Nutzer-Umbelegungen ueber mergeBindings.
export function buildPaletteEntries() {
  const disabled = disabledCommandIdSet(getDisabledExtensionIds());
  const effective = mergeBindings(state.hotkeyOverrides);
  const ctx = currentPaletteContext();
  const entries = [];
  for (const categoryKey of COMMAND_CATEGORIES) {
    for (const cmd of COMMANDS) {
      if (cmd.categoryKey !== categoryKey) continue;
      // Die Palette listet sich nicht selbst (Ausfuehrung waere ein No-op).
      if (cmd.id === 'app.commandPalette') continue;
      if (disabled.has(cmd.id)) continue;
      // editorScoped ohne hinterlegte CM-Funktion waere nicht ausfuehrbar.
      if (cmd.editorScoped && !EDITOR_COMMAND_FUNCTIONS[cmd.id]) continue;
      const binding = (effective[cmd.id] || [])[0] || '';
      entries.push({
        id: cmd.id,
        label: t(cmd.labelKey),
        group: t(categoryKey),
        editorScoped: !!cmd.editorScoped,
        shortcut: binding ? bindingToDisplayString(binding) : '',
        available: isCommandAvailable(cmd, ctx),
      });
    }
  }
  return entries;
}

// --- Ausfuehrung --------------------------------------------------------------

function executePaletteEntry(entry) {
  if (entry.editorScoped) {
    const run = EDITOR_COMMAND_FUNCTIONS[entry.id];
    const view = paneEditors[state.activePaneIndex];
    if (run && view) {
      // Fokus zurueck in den Editor, dann die CM-Funktion wie ueber die
      // Keymap ausfuehren.
      view.focus();
      run(view);
    }
    return;
  }
  if (runGlobalCommand) runGlobalCommand(entry.id);
}

// 4T-000520 (Epic 3E-000094): zentrale Ausfuehrung per Kommando-ID fuer die
// platzierten Zugaenge (Statusbar-Buttons, Kontextmenue-Sektion) und die
// Makro-Schritte. Buendelt beide Dispatch-Pfade der Palette und liefert —
// anders als executePaletteEntry — ein Erfolgs-Signal: false bei
// unbekannter ID, gefiltertem Kommando (deaktivierte Erweiterung), im
// Kontext nicht verfuegbarem Kommando oder einem Handler, der den Aufruf
// mit false ablehnt (Guard-Konvention der commandHandlers-Map). Verzoegerte
// Fehler asynchroner Handler sind damit bewusst nicht erfassbar.
// 4T-000521 (Epic 3E-000094): Verfügbarkeits-Prädikat per Kommando-ID für die
// Kontextmenü-Sektion (Einträge erscheinen deaktiviert statt zu
// verschwinden — Konsistenz zum restlichen Menü).
export function isCommandIdAvailable(commandId) {
  const cmd = COMMANDS.find((c) => c.id === commandId);
  if (!cmd) return false;
  if (cmd.editorScoped && !EDITOR_COMMAND_FUNCTIONS[cmd.id]) return false;
  return isCommandAvailable(cmd, currentPaletteContext());
}

export function executeCommandById(commandId) {
  const cmd = COMMANDS.find((c) => c.id === commandId);
  if (!cmd) return false;
  const disabled = disabledCommandIdSet(getDisabledExtensionIds());
  if (disabled.has(cmd.id)) return false;
  if (!isCommandAvailable(cmd, currentPaletteContext())) return false;
  if (cmd.editorScoped) {
    const run = EDITOR_COMMAND_FUNCTIONS[cmd.id];
    const view = paneEditors[state.activePaneIndex];
    if (!run || !view) return false;
    view.focus();
    return run(view) !== false;
  }
  if (!runGlobalCommand) return false;
  return runGlobalCommand(cmd.id) !== false;
}

// --- Popup --------------------------------------------------------------------

export function showCommandPalette() {
  const modal = $('#command-palette-modal');
  const filterInput = $('#command-palette-filter');
  const list = $('#command-palette-list');
  const btnCancel = $('#btn-command-palette-cancel');
  if (!modal || !list || modal.hidden === false) return Promise.resolve(null);

  const allEntries = buildPaletteEntries();

  return new Promise((resolve) => {
    let activeIdx = 0;
    let visible = [];

    const finish = (entry) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      filterInput.removeEventListener('input', renderList);
      btnCancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      if (entry) executePaletteEntry(entry);
      resolve(entry ? entry.id : null);
    };
    const onCancel = () => finish(null);

    const setActive = (idx) => {
      activeIdx = Math.max(0, Math.min(idx, visible.length - 1));
      const buttons = list.querySelectorAll('button');
      buttons.forEach((b, i) => b.classList.toggle('active', i === activeIdx));
      const current = buttons[activeIdx];
      if (current) current.scrollIntoView({ block: 'nearest' });
    };

    const renderList = () => {
      visible = filterCommandEntries(allEntries, filterInput.value);
      list.innerHTML = '';
      let lastGroup = null;
      visible.forEach((entry, idx) => {
        if (entry.group !== lastGroup && entry.group !== '') {
          const groupLi = document.createElement('li');
          groupLi.className = 'template-picker-group';
          groupLi.textContent = entry.group;
          list.appendChild(groupLi);
        }
        lastGroup = entry.group;
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'command-palette-item';
        if (!entry.available) {
          btn.classList.add('unavailable');
          btn.setAttribute('aria-disabled', 'true');
        }
        const nameSpan = document.createElement('span');
        nameSpan.className = 'command-palette-name';
        nameSpan.textContent = entry.label;
        btn.appendChild(nameSpan);
        if (entry.shortcut) {
          const keySpan = document.createElement('span');
          keySpan.className = 'command-palette-shortcut';
          keySpan.textContent = entry.shortcut;
          btn.appendChild(keySpan);
        }
        // Gedimmte Eintraege bleiben sichtbar (Orientierung), sind aber
        // nicht ausfuehrbar.
        btn.addEventListener('click', () => {
          if (entry.available) finish(entry);
        });
        btn.addEventListener('mousemove', () => setActive(idx));
        li.appendChild(btn);
        list.appendChild(li);
      });
      if (visible.length === 0) {
        const li = document.createElement('li');
        li.className = 'template-picker-empty';
        li.textContent = t('commandPalette.noMatch');
        list.appendChild(li);
      }
      setActive(0);
    };

    const onKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(activeIdx + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(activeIdx - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const entry = visible[activeIdx];
        if (entry && entry.available) finish(entry);
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    filterInput.value = '';
    filterInput.placeholder = t('commandPalette.filterPlaceholder');
    renderList();
    modal.addEventListener('keydown', onKeydown, true);
    filterInput.addEventListener('input', renderList);
    btnCancel.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);
    modal.hidden = false;
    setTimeout(() => filterInput.focus(), 0);
  });
}
