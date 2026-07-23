// 4T-0377 (Epic 3E-0071): Editor-Kontextmenü.
//
// Rechtsklick im CodeMirror-Editor (Quelltext- und Live-Modus, dieselbe
// EditorView) öffnet ein Kontextmenü über die gemeinsame Infrastruktur aus
// dialogs.js (gleiche Optik und Viewport-Klemmung wie Tab- und Panel-Menüs).
// Dieser Grundgerüst-Task liefert den Klipboard-Block und die Andockpunkte
// für die Format-/Absatz-/Einfüge-Aktionen der Folge-Tasks (4T-0378 füllt
// Link + Format, 4T-0379 Absatz + Einfügen). Die Klipboard-Aktionen laufen
// synchron über die Electron-Klipboard-Brücke (api.clipboard*), nicht über
// navigator.clipboard: kein Permission-Prompt, kein Fokus-Verlust.
'use strict';

import { api } from './api.js';
import { contextMenu } from './app-state.js';
import { appendContextMenuItem, placeContextMenuAt } from './dialogs.js';
import { computeClipboardMenuState } from '../../shared/editor-menu.js';
// 4T-0378 (Epic 3E-0071): Format-/Link-Kommandos — ein Ausführungs-Pfad mit
// dem Hotkey (siehe editor-format.js).
import { FORMAT_COMMANDS, getParagraphState } from './editor-format.js';
// 4T-0426 (Epic 3E-0080): „Vorlage einfügen" im Einfügen-Submenü — derselbe
// Ausführungs-Pfad wie das Registry-Kommando; verschwindet mit deaktivierter
// templates-Erweiterung (Kommando-Filterung der Erweiterungs-Registry).
import { insertTemplateCommand } from './templates.js';
import { disabledCommandIdSet } from '../../shared/extensions.js';
import { getDisabledExtensionIds } from './extension-lifecycle.js';
// 4T-0506 (Epic 3E-0096): Task-Bearbeitungs-Dialog im Einfuegen-Submenü —
// derselbe Ausfuehrungs-Pfad wie das Registry-Kommando task.editDialog.
import { runTaskEditDialogCommand } from './task-dialog.js';
// 4T-0521 (Epic 3E-0094): nutzerdefinierte Sektion am Menü-Ende. Die
// Imports werden ausschließlich zur Laufzeit (Menü-Aufbau beim
// Rechtsklick) genutzt — der Modul-Zyklus über command-palette/editor ist
// damit unkritisch (Muster des dokumentierten Laufzeit-Zyklus
// dialogs <-> views).
import { t } from '../i18n.js';
import { COMMANDS } from '../../shared/commands.js';
import {
  COMMAND_PLACEMENT_EXTENSION_ID,
  visibleContextMenuEntries,
} from '../../shared/command-placement.js';
import { COMMAND_ICONS, DEFAULT_COMMAND_ICON } from '../../shared/command-icons.js';
import { getCommandPlacement } from './command-placement.js';
import { executeCommandById, isCommandIdAvailable } from './command-palette.js';
import { isExtensionActive } from './extension-lifecycle.js';
import { paneEditors } from './editor.js';
// 4T-0590 (Epic 3E-0109): Untermenü „Tabelle" — Menü-Zustand und Ausführung
// aus dem Tabellen-Backend (Nutzung nur beim Menü-Aufbau, Laufzeit-Zyklus
// unkritisch wie oben).
import { getTableMenuState, runTableCommand } from './editor-table-tools.js';

// --- Klipboard-Aktionen -----------------------------------------------------

// Text aller nicht-leeren Selektions-Ranges, mehrere Ranges newline-getrennt
// (wie CodeMirrors eigenes Kopieren bei Multi-Cursor).
function selectionText(view) {
  return view.state.selection.ranges
    .filter((r) => !r.empty)
    .map((r) => view.state.sliceDoc(r.from, r.to))
    .join('\n');
}

export function copySelection(view) {
  const text = selectionText(view);
  if (text) api.clipboardWriteText(text);
  view.focus();
}

export function cutSelection(view) {
  const text = selectionText(view);
  if (!text) return;
  api.clipboardWriteText(text);
  view.dispatch({
    ...view.state.replaceSelection(''),
    scrollIntoView: true,
    userEvent: 'delete.cut',
  });
  view.focus();
}

export function pasteIntoSelection(view) {
  const text = api.clipboardReadText();
  if (text) {
    view.dispatch({
      ...view.state.replaceSelection(text),
      scrollIntoView: true,
      userEvent: 'input.paste',
    });
  }
  view.focus();
}

export function selectAllInEditor(view) {
  view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
  view.focus();
}

// --- Andockpunkte für die Folge-Tasks --------------------------------------
// Jede Funktion liefert eine (möglicherweise leere) Liste von Menü-Items.
// Leere Sektionen werden im Menü-Aufbau samt zugehörigem Trenner weggelassen,
// sodass 4T-0378/4T-0379 hier nur die Rümpfe füllen.
// Link-Aktionen oben im Menü (4T-0378). Im Read-only-Editor abgemeldet.
function buildLinkItems(view) {
  if (view.state.readOnly) return [];
  return [
    {
      key: 'command.link.insertWiki',
      dataId: 'link-wiki',
      action: () => FORMAT_COMMANDS['link.insertWiki'](view),
    },
    {
      key: 'command.link.insertExternal',
      dataId: 'link-external',
      action: () => FORMAT_COMMANDS['link.insertExternal'](view),
    },
  ];
}
// Format-Submenü in Hardcopy-Reihenfolge; „Formatierung entfernen" nach einem
// Trenner. Alle Einträge rufen dieselben Registry-Kommandos wie die Hotkeys.
function buildFormatItems(view) {
  if (view.state.readOnly) return [];
  const fmt = (id, dataId) => ({
    key: `command.format.${id}`,
    dataId,
    action: () => FORMAT_COMMANDS[`format.${id}`](view),
  });
  return [
    {
      key: 'editor.contextMenu.format',
      dataId: 'format',
      submenu: [
        fmt('bold', 'format-bold'),
        fmt('italic', 'format-italic'),
        fmt('strikethrough', 'format-strikethrough'),
        fmt('highlight', 'format-highlight'),
        fmt('code', 'format-code'),
        fmt('math', 'format-math'),
        fmt('comment', 'format-comment'),
        { separator: true },
        fmt('clear', 'format-clear'),
      ],
    },
  ];
}
// Absatz-Submenü mit Zustands-Häkchen (4T-0379): Listen, Überschrift 1–6 plus
// „Keine Überschrift", Zitat. Das Häkchen zeigt den Zustand der Cursor-Zeile.
function buildParagraphItems(view) {
  if (view.state.readOnly) return [];
  const st = getParagraphState(view);
  const para = (id, dataId, checked) => ({
    key: `command.paragraph.${id}`,
    dataId,
    checked,
    action: () => FORMAT_COMMANDS[`paragraph.${id}`](view),
  });
  const headings = [];
  for (let lvl = 1; lvl <= 6; lvl++) {
    headings.push(para(`heading${lvl}`, `paragraph-heading${lvl}`, st.heading === lvl));
  }
  return [
    {
      key: 'editor.contextMenu.paragraph',
      dataId: 'paragraph',
      submenu: [
        para('bulletList', 'paragraph-bullet', st.list === 'bullet'),
        para('orderedList', 'paragraph-ordered', st.list === 'ordered'),
        para('taskList', 'paragraph-task', st.list === 'task'),
        { separator: true },
        ...headings,
        para('noHeading', 'paragraph-noheading', st.heading === 0),
        { separator: true },
        para('quote', 'paragraph-quote', st.quote),
      ],
    },
  ];
}
// Einfügen-Submenü (4T-0379): Fußnote, Tabelle, Hinweisblock, Horizontale
// Linie, Quelltext-Block.
function buildInsertItems(view) {
  if (view.state.readOnly) return [];
  const ins = (id, dataId) => ({
    key: `command.insert.${id}`,
    dataId,
    action: () => FORMAT_COMMANDS[`insert.${id}`](view),
  });
  const submenu = [
    ins('footnote', 'insert-footnote'),
    ins('table', 'insert-table'),
    ins('callout', 'insert-callout'),
    ins('horizontalRule', 'insert-hr'),
    ins('codeBlock', 'insert-codeblock'),
  ];
  // 4T-0426: Vorlage an der Cursor-Position (nach einem Trenner, weil der
  // Eintrag eine Dialog-Kette startet statt direkt einzufügen).
  if (!disabledCommandIdSet(getDisabledExtensionIds()).has('edit.insertTemplate')) {
    submenu.push({ separator: true });
    submenu.push({
      key: 'command.edit.insertTemplate',
      dataId: 'insert-template',
      action: () => insertTemplateCommand(view),
    });
  }
  // 4T-0506 (Epic 3E-0096): Task-Bearbeitungs-Dialog (Task-Zeile bearbeiten,
  // leere Zeile anlegen) — entfaellt bei deaktivierter Erweiterung.
  if (!disabledCommandIdSet(getDisabledExtensionIds()).has('task.editDialog')) {
    submenu.push({ separator: true });
    submenu.push({
      key: 'command.task.editDialog',
      dataId: 'task-edit-dialog',
      action: () => {
        void runTaskEditDialogCommand();
      },
    });
  }
  return [
    {
      key: 'editor.contextMenu.insert',
      dataId: 'insert',
      submenu,
    },
  ];
}

// --- Tabellen-Untermenü (4T-0590, Epic 3E-0109) ------------------------------
// Untermenü „Tabelle" mit den table.*-Operationen, sichtbar nur, wenn der
// Cursor in einer Tabelle steht (leere Sektion entfällt samt Trenner —
// Architekturentscheidung 4 des Epics: kein neuer Menü-Mechanismus).
// Geschützte Ziele und Ränder erscheinen gedimmt; die Ausrichtungs-Einträge
// zeigen die Ist-Ausrichtung der Cursor-Spalte als Häkchen. Entfällt bei
// deaktivierter Erweiterung table-tools.
function buildTableItems(view) {
  if (view.state.readOnly) return [];
  if (!isExtensionActive('table-tools')) return [];
  const st = getTableMenuState(view);
  if (!st) return [];
  const av = st.availability;
  const op = (name, dataId, extra = {}) => ({
    key: `command.table.${name}`,
    dataId,
    disabled: av[name] === false,
    action: () => runTableCommand(view, name),
    ...extra,
  });
  return [
    {
      key: 'editor.contextMenu.table',
      dataId: 'table',
      submenu: [
        op('alignLeft', 'table-align-left', { checked: st.align === 'left' }),
        op('alignCenter', 'table-align-center', { checked: st.align === 'center' }),
        op('alignRight', 'table-align-right', { checked: st.align === 'right' }),
        { separator: true },
        op('rowUp', 'table-row-up'),
        op('rowDown', 'table-row-down'),
        op('rowInsert', 'table-row-insert'),
        op('rowDelete', 'table-row-delete'),
        { separator: true },
        op('colLeft', 'table-col-left'),
        op('colRight', 'table-col-right'),
        op('colInsert', 'table-col-insert'),
        op('colDelete', 'table-col-delete'),
        { separator: true },
        op('transpose', 'table-transpose'),
      ],
    },
  ];
}

// --- Klipboard-Block --------------------------------------------------------
const CLIPBOARD_ACTIONS = {
  cut: { key: 'editor.contextMenu.cut', run: cutSelection },
  copy: { key: 'editor.contextMenu.copy', run: copySelection },
  paste: { key: 'editor.contextMenu.paste', run: pasteIntoSelection },
  selectAll: { key: 'editor.contextMenu.selectAll', run: selectAllInEditor },
};

function buildClipboardItems(view) {
  const hasSelection = view.state.selection.ranges.some((r) => !r.empty);
  const docNotEmpty = view.state.doc.length > 0;
  // Klipboard-Inhalt synchron prüfen (Electron-Brücke, ohne Berechtigungs-
  // Hürde): Einfügen ist nur bei vorhandenem Text aktiv.
  const hasClipboardText = !!(
    typeof api.clipboardReadText === 'function' && api.clipboardReadText()
  );
  const states = computeClipboardMenuState({
    readOnly: view.state.readOnly,
    hasSelection,
    hasClipboardText,
    docNotEmpty,
  });
  return states.map(({ id, enabled }) => {
    const spec = CLIPBOARD_ACTIONS[id];
    return {
      key: spec.key,
      dataId: id,
      disabled: !enabled,
      action: () => spec.run(view),
    };
  });
}

// --- Nutzerdefinierte Sektion (4T-0521, Epic 3E-0094) ------------------------
// Einträge aus der Kommando-Platzierung am Menü-Ende (Quelltext- und
// Live-Modus, auch read-only — die Kommandos wirken app-weit, nicht auf
// den Editor-Inhalt). Nur der Haupt-Editor führt die Sektion: der
// Notiz-Editor teilt dieses Menü, die platzierten Kommandos wirken aber
// auf den aktiven Tab — vom Notiz-Feld aus wäre das überraschend
// (Sonderfall-Entscheidung, im Task dokumentiert). Kontextbedingt nicht
// ausführbare Einträge erscheinen deaktiviert statt zu verschwinden;
// Einträge deaktivierter Erweiterungs-Kommandos entfallen (Konsistenz zu
// Menü und Palette).
function buildCustomItems(view) {
  if (!paneEditors.includes(view)) return [];
  if (!isExtensionActive(COMMAND_PLACEMENT_EXTENSION_ID)) return [];
  const entries = visibleContextMenuEntries(
    getCommandPlacement().contextMenu,
    disabledCommandIdSet(getDisabledExtensionIds()),
    new Set(COMMANDS.map((c) => c.id)),
  );
  return entries.map((entry) => {
    const cmd = COMMANDS.find((c) => c.id === entry.commandId);
    return {
      label: entry.label || t(cmd.labelKey),
      dataId: `command-custom-${entry.commandId}`,
      icon: COMMAND_ICONS[entry.icon] || COMMAND_ICONS[DEFAULT_COMMAND_ICON],
      disabled: !isCommandIdAvailable(entry.commandId),
      action: () => {
        executeCommandById(entry.commandId);
      },
    };
  });
}

// --- Menü-Aufbau ------------------------------------------------------------
// Sektionen in Hardcopy-Reihenfolge: Link, Format, Absatz, Einfügen,
// Tabelle (nur in Tabellen, 4T-0590), Klipboard, nutzerdefinierte Sektion.
// Leere Sektionen entfallen; zwischen nicht-leeren Sektionen steht ein
// Trenner. Exportiert für Unit-nahe Nutzung und die Folge-Tasks.
export function buildEditorContextMenuItems(view) {
  const sections = [
    buildLinkItems(view),
    buildFormatItems(view),
    buildParagraphItems(view),
    buildInsertItems(view),
    buildTableItems(view),
    buildClipboardItems(view),
    buildCustomItems(view),
  ].filter((section) => section.length > 0);
  const items = [];
  sections.forEach((section, idx) => {
    if (idx > 0) items.push({ separator: true });
    items.push(...section);
  });
  return items;
}

// Rechtsklick-Handler am Editor: natives Menü unterdrücken, Cursor an die
// Klick-Position setzen (wenn außerhalb einer bestehenden Selektion), Menü an
// der Maus-Position öffnen. Greift in Quelltext- und Live-Modus (dieselbe
// EditorView). Das globale #context-menu wird vom Esc-/Outside-Click-Handler
// in app-init.js automatisch geschlossen.
export function showEditorContextMenu(event, view) {
  event.preventDefault();
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos != null) {
    const inSelection = view.state.selection.ranges.some(
      (r) => !r.empty && pos >= r.from && pos <= r.to,
    );
    if (!inSelection) view.dispatch({ selection: { anchor: pos } });
  }
  contextMenu.innerHTML = '';
  for (const item of buildEditorContextMenuItems(view)) {
    appendContextMenuItem(contextMenu, item);
  }
  placeContextMenuAt(contextMenu, event.clientX, event.clientY);
}
