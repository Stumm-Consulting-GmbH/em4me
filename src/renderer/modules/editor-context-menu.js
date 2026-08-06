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
// 4T-0887 (Befund L-04 des Struktur-Reviews): drei Kommandos ohne Bedienort im
// Menü bekommen hier einen; Ausführungs-Pfad wie insertTemplateCommand.
import { openCalendarPickerAtSelection } from './calendar-picker.js';
import { insertEventsBlock } from './events-editor.js';
import { runListSelectSubtree } from './editor-list-tools.js';
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

// 4T-0887: Menü-Eintrag zu einem Registry-Kommando (Label über command.<id>).
const kmd = (id, dataId, action) => ({ key: `command.${id}`, dataId, action });

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
  const listen = [
    para('bulletList', 'paragraph-bullet', st.list === 'bullet'),
    para('orderedList', 'paragraph-ordered', st.list === 'ordered'),
    para('taskList', 'paragraph-task', st.list === 'task'),
  ];
  // 4T-0887 (Befund L-04): „Teilbaum auswählen" schließt die Listen-Gruppe ab
  // (Auswahl statt Umschaltung); entfällt mit der outliner-Erweiterung.
  if (!disabledCommandIdSet(getDisabledExtensionIds()).has('list.selectSubtree')) {
    listen.push(kmd('list.selectSubtree', 'list-subtree', () => runListSelectSubtree(view)));
  }
  return [
    {
      key: 'editor.contextMenu.paragraph',
      dataId: 'paragraph',
      submenu: [
        ...listen,
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
  const aus = disabledCommandIdSet(getDisabledExtensionIds());
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
  // 4T-0887 (Befund L-04): Ereignis-Block und Kalender-Datum fügen ebenfalls an
  // der Cursor-Position ein und stehen deshalb in derselben Gruppe. Der
  // Ereignis-Block schreibt in den Haupt-Editor der aktiven Spalte statt in die
  // angeklickte View und bleibt vom Notiz-Feld aus weg (Muster buildCustomItems).
  if (paneEditors.includes(view) && !aus.has('edit.insertEvents')) {
    submenu.push(kmd('edit.insertEvents', 'insert-events', () => insertEventsBlock()));
  }
  if (!aus.has('calendar.insertValue')) {
    submenu.push(
      kmd('calendar.insertValue', 'insert-calendar', () => openCalendarPickerAtSelection(view)),
    );
  }
  // 4T-0426: Vorlage an der Cursor-Position (nach einem Trenner, weil der
  // Eintrag eine Dialog-Kette startet statt direkt einzufügen).
  if (!aus.has('edit.insertTemplate')) {
    submenu.push({ separator: true });
    submenu.push(kmd('edit.insertTemplate', 'insert-template', () => insertTemplateCommand(view)));
  }
  // 4T-0506 (Epic 3E-0096): Task-Bearbeitungs-Dialog (Task-Zeile bearbeiten,
  // leere Zeile anlegen) — entfaellt bei deaktivierter Erweiterung.
  if (!aus.has('task.editDialog')) {
    submenu.push({ separator: true });
    submenu.push(kmd('task.editDialog', 'task-edit-dialog', () => runTaskEditDialogCommand()));
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

// --- Rechtschreib-Vorschläge (4T-0582, Epic 3E-0107) -------------------------
// Chromium meldet das falsch geschriebene Wort und seine Korrektur-Vorschläge
// ausschließlich im Main-Prozess (webContents 'context-menu'). Der Ablauf pro
// Rechtsklick ist deshalb zweistufig: Der DOM-Handler baut das Menü sofort,
// die Daten treffen 0,3 bis 2,2 ms später ein (gemessen am 2026-08-02) und
// lösen einen Neuaufbau mit Vorschlags-Sektion aus. Beides liegt im selben
// Bild, ein Sprung ist nicht sichtbar.
//
// Bedingung dafür ist, dass showEditorContextMenu das DOM-Ereignis NICHT mit
// preventDefault abbricht — ein Abbruch unterdrückt das Main-Ereignis
// vollständig (ebenfalls gemessen). Ein natives Menü entsteht dadurch nicht,
// weil Electron von sich aus keines anbietet.

// Zustand des laufenden Rechtsklicks. Die Marke unterscheidet Menü-Aufbauten:
// eine Meldung zu einem älteren Klick darf ein neueres Menü nicht umbauen.
let spellState = { marke: 0, view: null, x: 0, y: 0, zeit: 0, wort: '', vorschlaege: [] };
let spellMarke = 0;

// Verfallszeit einer Meldung. Sie trifft im Normalfall nach wenigen
// Millisekunden ein; alles jenseits dieser Spanne gehört zu einem Klick, auf
// den inzwischen eine andere Bedienung gefolgt sein kann, und wird verworfen.
const SPELL_PAYLOAD_MAX_ALTER_MS = 500;

// Höchstzahl angebotener Vorschläge. Chromium liefert bis zu fünf; die Grenze
// steht hier ausdrücklich, damit ein längerer Vorschlags-Satz das Menü nicht
// überlaufen ließe.
const MAX_SPELL_SUGGESTIONS = 5;

// Meldung des Main-Prozesses: gehört sie zum laufenden Klick, wird das Menü
// mit Vorschlags-Sektion neu aufgebaut. Ohne Tippfehler unter dem Zeiger
// bleibt alles, wie es ist.
export function handleSpellcheckContext(payload) {
  const wort = payload && typeof payload.word === 'string' ? payload.word : '';
  const vorschlaege =
    payload && Array.isArray(payload.suggestions)
      ? payload.suggestions.filter((s) => typeof s === 'string' && s !== '')
      : [];
  if (!spellState.view || spellState.marke !== spellMarke) return;
  if (performance.now() - spellState.zeit > SPELL_PAYLOAD_MAX_ALTER_MS) return;
  if (!wort) return;
  spellState = { ...spellState, wort, vorschlaege };
  renderEditorContextMenu(spellState.view, spellState.x, spellState.y);
}

function buildSpellItems(view) {
  if (view.state.readOnly) return [];
  if (spellState.view !== view || !spellState.wort) return [];
  const wort = spellState.wort;
  const items = spellState.vorschlaege.slice(0, MAX_SPELL_SUGGESTIONS).map((vorschlag) => ({
    label: vorschlag,
    dataId: `spell-suggestion-${vorschlag}`,
    action: () => {
      // Ersetzt wird über den Main-Prozess: replaceMisspelling arbeitet auf
      // dem WebContents und trifft genau das gemeldete Wort, unabhängig davon,
      // wo der Cursor inzwischen steht.
      void api.spellcheckReplace(vorschlag);
    },
  }));
  if (items.length > 0) items.push({ separator: true });
  items.push({
    key: 'editor.contextMenu.addToDictionary',
    dataId: 'spell-add-to-dictionary',
    action: () => {
      void api.spellcheckAddWord(wort);
    },
  });
  return items;
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
    // 4T-0582 (Epic 3E-0107): Rechtschreib-Vorschläge ganz oben, weil sie sich
    // auf das Wort unter dem Zeiger beziehen und damit die unmittelbarste
    // Antwort auf den Rechtsklick sind. Ohne Tippfehler ist die Sektion leer
    // und entfällt samt Trenner.
    buildSpellItems(view),
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

// Baut das Menü in das globale #context-menu und setzt es an die Position.
// Eigene Funktion, weil der Aufbau zweimal pro Rechtsklick laufen kann: einmal
// sofort und einmal, sobald die Rechtschreib-Daten aus dem Main-Prozess
// eintreffen (4T-0582).
function renderEditorContextMenu(view, x, y) {
  contextMenu.innerHTML = '';
  for (const item of buildEditorContextMenuItems(view)) {
    appendContextMenuItem(contextMenu, item);
  }
  placeContextMenuAt(contextMenu, x, y);
}

// Rechtsklick-Handler am Editor: Cursor an die Klick-Position setzen (wenn
// außerhalb einer bestehenden Selektion), Menü an der Maus-Position öffnen.
// Greift in Quelltext- und Live-Modus (dieselbe EditorView). Das globale
// #context-menu wird vom Esc-/Outside-Click-Handler in app-init.js
// automatisch geschlossen.
//
// 4T-0582 (Epic 3E-0107): Das frühere preventDefault ist entfallen. Es hatte
// das native Menü unterdrücken sollen, das Electron ohnehin nicht anbietet,
// unterdrückte aber zugleich das context-menu-Ereignis des Main-Prozesses und
// damit die einzige Quelle der Korrektur-Vorschläge (gemessen am 2026-08-02).
export function showEditorContextMenu(event, view) {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos != null) {
    const inSelection = view.state.selection.ranges.some(
      (r) => !r.empty && pos >= r.from && pos <= r.to,
    );
    if (!inSelection) view.dispatch({ selection: { anchor: pos } });
  }
  // Neuer Klick: Vorschlags-Zustand zurücksetzen und die Marke hochzählen,
  // damit eine verspätete Meldung zum vorigen Klick verworfen wird.
  spellMarke += 1;
  spellState = {
    marke: spellMarke,
    view,
    x: event.clientX,
    y: event.clientY,
    zeit: performance.now(),
    wort: '',
    vorschlaege: [],
  };
  renderEditorContextMenu(view, event.clientX, event.clientY);
}
