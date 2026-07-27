// Zentraler UI-Zustand, Tab-/Pane-Fabriken, DOM-Referenzen, Zoom- und Theme-Button-Logik.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
'use strict';

import { t } from '../i18n.js';

import { api, $ } from './api.js';
// 4T-0213 (Epic 3E-0042): Seiten-Registry fuer die Tab-Titel der
// Handbuch-Tabs (lokalisierter Seiten-Titel statt Unbenannt-Zaehler).
import { manualPageById } from '../../shared/manual-pages.js';
// 4T-0277 (Epic 3E-0049): Registry der System-Seiten (Einstellungen) fuer
// die Tab-Titel. Modul-Zyklus app-state <-> system-pages ist unkritisch:
// Zugriff erfolgt erst zur Laufzeit in tabDisplayName (Muster 4T-0179).
import { systemPageById } from './system-pages.js';
import { editorCompartments, paneEditors, typewriterScrollExtension } from './editor.js';
import { reportMenuStateNow } from './tabs.js';
// 3E-0105: Frontmatter-Parser fuer die dokument-gebundenen Editor-Ansicht-
// Schalter. frontmatter.js ist Electron-frei (kein markdown.js-Import!) und
// wird auch von live-widgets.js direkt ins Renderer-Bundle importiert.
import { extractFrontmatter } from '../../shared/markdown/frontmatter.js';

// --- Konstanten -------------------------------------------------------------
export const MAX_PANES = 2;
export const MIME_TAB = 'application/x-mdv-tab';
// R4-04 (4T-0170): Fenster-Kennung im Tab-Drag-Payload. Chromium erlaubt
// Drag&Drop zwischen BrowserWindows derselben App; ein Drop mit fremden
// Pane-/Tab-Indizes wuerde auf dem lokalen State den falschen Tab
// verschieben. parseTabDrag verwirft Payloads mit fremdem Token.
export const WINDOW_DRAG_TOKEN = crypto.randomUUID();

// Defaults für neue Tabs (per-Tab-Einstellungen).
export const DEFAULT_VIEW_MODE = 'rendered';
export const DEFAULT_WRAP_LINES = false;
export const DEFAULT_SHOW_LINE_NUMBERS = true;
// 4T-0013: Heading-Folding-Gutter (Gliederung) default eingeschaltet. Pro Tab
// toggelbar analog zu showLineNumbers.
export const DEFAULT_SHOW_FOLD_GUTTER = true;

// 4T-0572 (Epic 3E-0105): Frontmatter-Schluessel der drei dokument-gebundenen
// Editor-Ansicht-Schalter (Kebab-Case wie 'numbered-headings'). Nur echtes
// true/false im Frontmatter uebersteuert die globale Voreinstellung.
export const EDITOR_VIEW_FM_KEYS = {
  wrapLines: 'word-wrap',
  showLineNumbers: 'line-numbers',
  showFoldGutter: 'fold-gutter',
};

// 4T-0572: Globale Voreinstellung der drei Editor-Ansicht-Schalter. Ersetzt
// die hartkodierten Konstanten als Default-Quelle (die Konstanten bleiben
// letzter Fallback und Startwert). Wird beim App-Start aus den Store-Keys
// 'editor.defaultWrapLines' / 'editor.defaultLineNumbers' /
// 'editor.defaultFoldGutter' geladen (app-init.js) und vom Einstellungs-
// Bereich "Darstellung" geschrieben (settings-page.js).
const editorViewDefaults = {
  wrapLines: DEFAULT_WRAP_LINES,
  showLineNumbers: DEFAULT_SHOW_LINE_NUMBERS,
  showFoldGutter: DEFAULT_SHOW_FOLD_GUTTER,
};

export function getEditorViewDefaults() {
  return { ...editorViewDefaults };
}

export function setEditorViewDefaults(partial) {
  if (!partial || typeof partial !== 'object') return;
  for (const key of Object.keys(editorViewDefaults)) {
    const v = partial[key];
    if (v === true || v === false) editorViewDefaults[key] = v;
  }
}

// 4T-0572: Ebenen-Aufloesung der drei Editor-Ansicht-Schalter beim Tab-
// Erstellen: Dokument-Frontmatter → uebergebene Tab-Settings (Sitzungs-
// Wiederherstellung, Tab-Transfer, Entwurfs-Wiederherstellung) → globale
// Voreinstellung (mit Konstante als Startwert). Frontmatter gewinnt immer,
// damit die dokument-gebundene Vorgabe portabel bleibt und auch nach einem
// Neustart nicht von veralteten Sitzungs-Werten ueberdeckt wird.
export function resolveEditorViewSettings(content, settings = {}) {
  let fmData = null;
  if (typeof content === 'string' && content.startsWith('---')) {
    try {
      fmData = extractFrontmatter(content).data;
    } catch {
      fmData = null;
    }
  }
  const pick = (field) => {
    if (fmData && typeof fmData === 'object') {
      const fmValue = fmData[EDITOR_VIEW_FM_KEYS[field]];
      if (fmValue === true || fmValue === false) return fmValue;
    }
    const s = settings[field];
    if (s === true || s === false) return s;
    return editorViewDefaults[field];
  };
  return {
    wrapLines: pick('wrapLines'),
    showLineNumbers: pick('showLineNumbers'),
    showFoldGutter: pick('showFoldGutter'),
  };
}

// --- State ------------------------------------------------------------------
// Eine Pane: { tabs: [...], activeIndex }
// Ein Tab: { path, content, scrollSrc, scrollRen, missing,
//            viewMode, wrapLines, showLineNumbers }
export const state = {
  panes: [createEmptyPane()],
  activePaneIndex: 0,
  language: 'en',
  restoreSession: true,
  autoSave: false,
  // 4T-0603 (Epic 3E-0113): Schalter „URL beim Einfügen in eine Auswahl als
  // Link" (Default an). Der Editor-Paste-Handler liest den Wert synchron; er
  // wird beim App-Start und bei Änderung in den Einstellungen aktualisiert.
  pasteUrlAsLink: true,
  // 4T-0656 (Epic 3E-0112): Tabulator ausserhalb von Listen und Tabellen —
  // true rueckt ein, false laesst den Fokus weiterwandern (Store-Key
  // input.tabIndents).
  tabIndents: true,
  // 4T-0604 (Epic 3E-0113): Automatik für die Frontmatter-Felder created und
  // updated beim Speichern (created = Dateisystem-Erstellungszeit, updated =
  // Speicherzeitpunkt). Beim App-Start aus dem Store geladen; der Speicher-Hook
  // (views.js) liest die Konfiguration synchron. Beide Schalter sind
  // standardmäßig aus, ebenso das Anlegen fehlender Felder.
  frontmatterTimestamps: {
    createdEnabled: false,
    createdField: 'created',
    updatedEnabled: false,
    updatedField: 'updated',
    format: 'datetime',
    autoCreate: false,
  },
  // 4T-0030: Theme-Vorzug ('light' | 'dark' | 'system'). Initial 'system';
  // tatsaechlicher Wert wird beim Init aus electron-store geladen.
  themePref: 'system',
  // 4T-0085 (Epic 3E-0014): Default-View-Modus fuer neue Tabs. Wird beim
  // Tab-Erstellen verwendet, wenn keine pro-Tab-Persistenz vorliegt.
  // Konfigurierbar im Settings-Dialog; Fallback bleibt DEFAULT_VIEW_MODE
  // ('rendered'). Initial-Wert wird beim App-Start aus dem Store geladen.
  defaultViewMode: DEFAULT_VIEW_MODE,
  // 4T-0207 (Epic 3E-0015): User-Overrides der Tastenkuerzel aus dem
  // Store-Key 'hotkeys' ({ commandId: acceleratorString }, leerer String =
  // entbunden). Wird beim App-Start geladen; Dispatcher-Map, Editor-Keymap
  // und Hilfe-Tabelle mergen damit die Registry-Defaults.
  hotkeyOverrides: {},
  // Hochzählender Zaehler fuer "Datei → Neu"-Tabs in diesem Fenster
  // (pro Fenster lokal, pro App-Lebenszyklus). Wird nicht persistiert.
  untitledCounter: 1,
  // 4T-0012: Anzeige-Nummer dieses Fensters und Gesamtzahl der offenen Fenster.
  // Vom Main bei jedem Open/Close gepusht; bestimmt den Titel-Suffix und
  // steuert Solo-vs-Multi-Modus im Tab-Kontextmenue.
  // 4T-0318 (Epic 3E-0057): displayNumber/totalWindowCount sind APP-lokal
  // (Fenster innerhalb der eigenen logischen Applikation); dazu kommen die
  // eigene Fenster-ID (Selbst-Filter im Kontextmenue), App-Nummer, Zahl der
  // nummerierten Apps und die Bereichs-Daten der eigenen App (3E-0058).
  windowId: null,
  displayNumber: 1,
  totalWindowCount: 1,
  appNumber: 1,
  numberedAppCount: 1,
  appCount: 1,
  areaName: null,
  areaPath: null,
  // 4T-0538 (Epic 3E-0098): Arbeitsbereichs-Name der eigenen App (null
  // ausserhalb eines Arbeitsbereichs; Fenster-Titel und Palette-Dimmung).
  workspaceName: null,
  // 4T-0014: Outline-Sidebar pro Spalte. visibleByPane: sichtbar/versteckt
  // (Default versteckt). activeLineByPane: aktuell aktive Heading-Zeile pro
  // Spalte, wird fuer die Hervorhebung in der Outline gespeichert.
  // 4T-0288 (Epic 3E-0051): die fruehere gemeinsame Sidebar-Breite
  // (outline.width) lebt jetzt seitengetrennt in sidebar-layout.js
  // (sidebar.widthLeft/widthRight, Migration des Legacy-Keys beim Laden).
  outline: {
    visibleByPane: [false, false],
    activeLineByPane: [0, 0],
  },
  // 4T-0327 (Epic 3E-0059): Bereichs-Panel pro Spalte. visibleByPane ist
  // dreiwertig: null = nie explizit geschaltet (Default: sichtbar in Spalte 0
  // einer Bereichs-App, sonst unsichtbar), true/false = explizite bzw.
  // persistierte Wahl. selectedDirByPane ist der in der Dateiliste gezeigte
  // Ordner, expandedByPane die aufgeklappten Ordner-Pfade des Baums (beides
  // fluechtig pro Fenster-Lebensdauer).
  areaPanel: {
    visibleByPane: [null, null],
    selectedDirByPane: [null, null],
    expandedByPane: [[], []],
  },
  // 4T-0434 (Epic 3E-0081): Kalender-Panel pro Spalte. monthByPane haelt den
  // angezeigten Monat (ms des Monatsersten; null = aktueller Monat),
  // filterByPane die Regal-/Journal-Auswahl ('all' | 'shelf:<name>' |
  // 'journal:<id>'), loadTokens sichert gegen Lade-Races der Punkte.
  calendar: {
    visibleByPane: [false, false],
    monthByPane: [null, null],
    filterByPane: ['all', 'all'],
    loadTokens: [0, 0],
  },
  // 4T-0527 (Epic 3E-0095): Erinnerungs-Panel pro Spalte. Eintraege kommen
  // pro Render frisch vom Main-Pruefer (reminders:list); loadTokens sichern
  // gegen Async-Lade-Races (Muster Kalender).
  reminders: {
    visibleByPane: [false, false],
    loadTokens: [0, 0],
  },
  // 4T-0372 (Epic 3E-0069): Uhr-Panel pro Spalte. Sichtbarkeit und (seit
  // 4T-0636) der Anzeige-Modus sind Pane-Zustand; die Anzeige-Optionen liegen
  // global im Store (clock.options, Laufzeit-Wahrheit in clock-panel.js).
  clock: {
    visibleByPane: [false, false],
    modeByPane: ['clock', 'clock'],
    // 4T-0752 (Epic 3E-0146): angezeigter Monat des Kalender-Modus je Spalte
    // als { year, monthIndex }. Bedien-Zustand ohne Persistenz (Muster
    // state.calendar.monthByPane); null bedeutet "laufender Monat".
    monthByPane: [null, null],
  },
  // 4T-0456 (Epic 3E-0084): Datei-Graph-Panel pro Spalte. Tiefe (1..5) und
  // Richtung ('both'|'in'|'out') sind Sitzungs-Zustand ohne Persistenz
  // (Task-Entscheidung); loadTokens sichert gegen Lade-Races, renderTimers
  // debouncen das Folgen der aktiven Datei.
  fileGraph: {
    visibleByPane: [false, false],
    depthByPane: [1, 1],
    directionByPane: ['both', 'both'],
    loadTokens: [0, 0],
    renderTimers: [null, null],
  },
  // 4T-0015: Backlinks-Sidebar-Sektion pro Spalte. visibleByPane wie Outline.
  // currentFileByPane haelt die aktuell beim Main angemeldete Datei pro Pane
  // (fuer paarweises request/release beim Tab-Wechsel). lastResultsByPane
  // cached das letzte Status-Payload, damit Re-Render ohne neuen Request
  // moeglich ist (z.B. nach Sprachwechsel).
  backlinks: {
    visibleByPane: [false, false],
    currentFileByPane: [null, null],
    lastResultsByPane: [null, null],
  },
  // 4T-0073 (Epic 3E-0013): Outgoing-Links-Sidebar-Sektion pro Spalte.
  // Kein globaler Index noetig — die Liste wird pro Re-Render aus dem
  // Tab-Content extrahiert. updateTimers haelt pro Pane einen Debounce-
  // Timer (150 ms) gegen Tipp-Flackern bei grossen Dateien.
  outgoing: {
    visibleByPane: [false, false],
    updateTimers: [null, null],
  },
  // 4T-0341 (Epic 3E-0061): Unterseiten-Sidebar-Sektion pro Spalte. Die
  // Liste der direkten Unterseiten der aktiven Datei kommt aus dem
  // Nachfahren-Scan des Main (subpage:descendants); updateTimers wie bei
  // Outgoing (150-ms-Debounce), renderTokens gegen Async-Races.
  subpages: {
    visibleByPane: [false, false],
    updateTimers: [null, null],
    renderTokens: [0, 0],
  },
  // 4T-0075 (Epic 3E-0013): Bookmarks. tree ist die persistente Baum-Struktur
  // (Array von Knoten {type:'file'|'folder', ...} am Root). selectedId ist
  // der aktuell selektierte Knoten in der Sidebar (fuer Tastatur-Nav und
  // fuer Strg+D-Ablage-Logik). visibleByPane wie die anderen Sidebar-
  // Sektionen. 4T-0078: editingId markiert den Knoten, der gerade per
  // Inline-Edit umbenannt wird; editingIsNew unterscheidet "Neuer Ordner"
  // (bei Esc loeschen) von "Umbenennen" (bei Esc nur Bearbeitung abbrechen).
  // moveDialog haelt den Source-Knoten und den aktuell gewaehlten Ziel-
  // Folder fuer den "In Ordner verschieben"-Picker.
  bookmarks: {
    tree: [],
    // 4T-0612 (Epic 3E-0115): Bereichs-Lesezeichen — zweiter, paralleler Baum.
    // Ziele sind WURZEL-RELATIV zur Bereichs-Wurzel (state.areaPath) und werden
    // in der bookmarks-Sektion der Bereichsdatei Area_Settings.mdda persistiert
    // (IPC-Bruecken aus 4T-0611). Ohne geoeffneten Bereich leer und im Panel
    // ausgeblendet. areaFirst steuert die Abschnitts-Reihenfolge im Panel
    // (globale Einstellung, Default an: Bereichs-Lesezeichen oben).
    areaTree: [],
    areaFirst: true,
    selectedId: null,
    visibleByPane: [false, false],
    editingId: null,
    editingIsNew: false,
    // 4T-0612: In welchem Abschnitt der Inline-Edit laeuft ('general'|'area'),
    // damit commit/cancel den richtigen Baum und dessen Persistenz-Ziel treffen.
    editingSectionKind: 'general',
    moveDialog: { sourceId: null, targetFolderId: null, blockedIds: null, sectionKind: 'general' },
    // 4T-0079: HTML5-Drag-and-Drop. sourceId ist der gerade gezogene Knoten,
    // blockedIds enthaelt source plus alle Nachfahren (Zyklus-Schutz fuer
    // Folder-Drags). targetId / zone halten den aktuellen Drop-Indikator-
    // Stand (vor/nach Knoten oder in einen Folder hinein). 4T-0612: sectionKind
    // bindet den Drag an seinen Abschnitt (kein Cross-Drop ueber die Grenze).
    dragging: { sourceId: null, blockedIds: null, targetId: null, zone: null, sectionKind: null },
  },
  // 4T-0051: Properties-Sidebar-Sektion pro Spalte. visibleByPane wie
  // Outline und Backlinks. saveTimers haelt pro Pane den Debounce-Timer,
  // damit Live-Edits nicht jeden Tastendruck zu IPC umsetzen. originalData-
  // ByPane spiegelt die zuletzt geparste Frontmatter-Map; readonly-Felder
  // werden bei jedem Save daraus uebernommen.
  properties: {
    visibleByPane: [false, false],
    saveTimers: [null, null],
    originalDataByPane: [{}, {}],
    // 4T-0448 (Epic 3E-0083): zuletzt aufgeloeste Profil-Definitionen der
    // aktiven Datei pro Pane ({ assignField, fields } oder null) plus
    // Lauf-Token gegen veraltete Async-Antworten (Muster blockProps).
    profileByPane: [null, null],
    profileTokens: [0, 0],
  },
  // 4T-0056: Tag-Sidebar-Sektion pro Spalte. visibleByPane wie Outline.
  // filterByPane haelt den aktuell aktivierten Filter-Tag (Klick auf Tag
  // setzt ihn, Klick auf Back-Button loescht ihn). queryByPane haelt die
  // Filter-Eingabe (Substring-Match).
  tags: {
    visibleByPane: [false, false],
    filterByPane: [null, null],
    queryByPane: ['', ''],
  },
  // 4T-0359 (Epic 3E-0066): Notizen-Panel pro Spalte. Editierbares Textfeld
  // plus umschaltbare gerenderte Vorschau; die Notiz lebt in der .mdd
  // (readNote/writeNote), nicht im Dokument-Inhalt (kein Tab-Dirty).
  // currentFileByPane haelt die aktuell im Panel gezeigte Datei (fuer den
  // note:changed-Abgleich). saveTimers/saveTabs sind der Debounce wie bei
  // Properties. loadTokens schuetzt gegen Async-Lade-Races (readNote ist
  // asynchron). previewByPane haelt den Vorschau-Modus. baselineByPane ist
  // der zuletzt geladene bzw. geschriebene Notiz-Stand (dirty- und Konflikt-
  // Erkennung; ein eingehender Eigen-Broadcast gleicht der Baseline und loest
  // daher keinen Konflikt aus).
  notes: {
    visibleByPane: [false, false],
    currentFileByPane: [null, null],
    saveTimers: [null, null],
    saveTabs: [null, null],
    loadTokens: [0, 0],
    previewByPane: [false, false],
    baselineByPane: ['', ''],
  },
  // 4T-0364 (Epic 3E-0067): Block-Eigenschaften-Panel. dataByPane haelt die
  // geladene Anker->{values,updated}-Map der .mdd; activeAnchorByPane den Anker
  // unter dem Cursor bzw. den per Dropdown gewaehlten. loadTokens gegen Lade-
  // Races; cursor-/renderTimers debouncen Cursor-Folge und Doc-Aenderung.
  blockProps: {
    visibleByPane: [false, false],
    currentFileByPane: [null, null],
    dataByPane: [{}, {}],
    activeAnchorByPane: [null, null],
    loadTokens: [0, 0],
    saveTimers: [null, null],
    saveContext: [null, null],
    cursorTimers: [null, null],
    renderTimers: [null, null],
  },
  // 4T-0019: Fokus-Modus und Typewriter-Scroll. Toggle wirkt nur auf das
  // aktive Fenster; persistierter Wert ist global (settings: focusMode /
  // typewriterScroll). Beim Start eines Fensters wird der gespeicherte
  // Wert auf das neue Fenster angewendet.
  focusMode: false,
  typewriterScroll: false,
  // 4T-0697 (Epic 3E-0141): Kollaps-Zustand der Sidebar-Spalten je Editor-
  // Spalte (Pane-Group 0/1) und Seite. Ein eigener Zustand ÜBER den Panel-
  // Sichtbarkeiten (kein Abschalten der Panels): Einklappen legt sich als
  // Spalten-Zustand darüber, Ausklappen stellt exakt den vorherigen Stand
  // wieder her. Getrennt vom Sichtbarkeits-hidden, das renderSidebarSide für
  // panel-leere Spalten setzt. Global persistiert (settings: sidebarCollapsed)
  // und beim Fensterstart geladen (Muster Fokus-Modus).
  sidebarCollapsed: {
    left: [false, false],
    right: [false, false],
  },
};

// 4T-0526 (Epic 3E-0095): Zeitstempel des letzten Editor-Edits (Haupt-
// Editoren und Notizen-Feld). Der Erinnerungs-Dialog wartet damit die
// Tipp-Ruhe ab (10 Sekunden, Workshop-Punkt 7), bevor er erscheint.
// Bewusst hier statt in editor.js oder reminders.js: app-state.js ist
// zyklusarm und beide Seiten (Schreiber editor.js, Leser reminders.js)
// importieren es ohnehin.
export const editorActivity = { lastDocEditAt: 0 };

// Dialog-Tracking fuer Auto-Save: solange ein modaler Dialog (Schliessen-
// Dialog, Konflikt-Dialog, Save-As-Dialog) laeuft, soll Auto-Save nicht
// triggern. withDialog kapselt asynchrone Dialog-Calls.
// R2-03 (4T-0174): Zaehler statt Boolean — ein frueh endender Dialog gab
// Auto-Save sonst frei, waehrend ein zweiter (z.B. mehrere Konflikt-
// Dialoge nacheinander) noch offen war.
export let dialogDepth = 0;
export async function withDialog(fn) {
  dialogDepth++;
  try {
    return await fn();
  } finally {
    dialogDepth = Math.max(0, dialogDepth - 1);
  }
}

export function createEmptyPane() {
  // 4T-0459 (Epic 3E-0085): groups traegt die Tab-Gruppen der Leiste
  // ([{ id, name, color, collapsed }]; Helfer in modules/tab-groups.js).
  return { tabs: [], activeIndex: -1, groups: [] };
}

export function createTab(path, content, settings = {}) {
  // 4T-0572 (Epic 3E-0105): Ebenen-Aufloesung Frontmatter → Tab-Settings →
  // globale Voreinstellung fuer die drei Editor-Ansicht-Schalter.
  const view = resolveEditorViewSettings(content, settings);
  return {
    path,
    content,
    // Letzter gespeicherter bzw. zuletzt von Datei gelesener Stand. Die
    // Dirty-Berechnung vergleicht content gegen originalContent.
    originalContent: content,
    scrollSrc: 0,
    scrollRen: 0,
    missing: false,
    viewMode: settings.viewMode || state.defaultViewMode || DEFAULT_VIEW_MODE,
    wrapLines: view.wrapLines,
    showLineNumbers: view.showLineNumbers,
    showFoldGutter: view.showFoldGutter,
    // Edit-Modus pro Tab; nicht persistiert ueber Neustarts.
    editMode: false,
    // 4T-0070: Scroll-Synchronisation in der geteilten Ansicht. Pro Tab,
    // Default aus. Wird in der Sitzungswiederherstellung erhalten.
    scrollSyncEnabled: !!settings.scrollSyncEnabled,
    // Dirty-Flag: true sobald content vom originalContent abweicht.
    dirty: false,
    // 4T-0017: Zoom-Faktor pro Tab (Multiplikator fuer Editor- und Render-
    // Pane des Tabs). Default 1.0. Wird beim Tab-Transfer in ein anderes
    // Fenster mit uebernommen, ueberlebt aber den Fenster-Schluss und die
    // Sitzungswiederherstellung nicht.
    zoom: clampZoom(settings.zoom ?? DEFAULT_ZOOM),
    // Bei "Datei → Neu" der lokale Nummern-Index (Unbenannt 1, 2, …).
    // Null fuer Tabs mit Pfad.
    untitledIndex: settings.untitledIndex || null,
    // 4T-0459 (Epic 3E-0085): Gruppen-Zugehoerigkeit (ID aus pane.groups)
    // oder null. Wird nicht ueber settings gesetzt — die Sitzungs-
    // Wiederherstellung weist Gruppen explizit zu (restoreGroupsIntoPane).
    groupId: null,
  };
}

// 4T-0017: Zoom-Konstanten. Schrittweite 10 %, Limits 50 % bis 300 %.
export const DEFAULT_ZOOM = 1.0;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3.0;
export const ZOOM_STEP = 0.1;

export function clampZoom(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_ZOOM;
  if (num < ZOOM_MIN) return ZOOM_MIN;
  if (num > ZOOM_MAX) return ZOOM_MAX;
  // Auf eine Nachkommastelle runden, damit 0.1-Schritte keine Floating-
  // Point-Drift erzeugen (0.1 + 0.1 + 0.1 != 0.3).
  return Math.round(num * 10) / 10;
}

// Verhindert, dass scroll-Events während eines Tab-Wechsels die gespeicherten
// Scroll-Positionen überschreiben (DOM-Updates triggern scroll-Events).

// --- DOM-Referenzen ---------------------------------------------------------
// ($-Helfer kommt aus modules/api.js)
export const panesContainer = $('#panes-container');
export const paneRoots = Array.from(panesContainer.querySelectorAll('.pane-group'));
export const outerSplitter = panesContainer.querySelector('.outer-splitter');
export const emptyState = $('#empty-state');
export const dropOverlay = $('#drop-overlay');
export const langSelect = $('#lang-select');
export const btnEdit = $('#btn-edit');
// 4T-0030: Theme-Toggle in der Statusbar. Icon und Tooltip werden zur Laufzeit
// passend zu state.themePref gesetzt; Klick schaltet zyklisch Hell -> Dunkel
// -> System -> Hell.
export const btnTheme = $('#btn-theme');

// Inline-SVGs fuer den Theme-Button. Stil identisch zum bestehenden btn-edit
// (viewBox 0 0 24 24, stroke=currentColor, stroke-width 2, round). Sonne fuer
// 'light', Mond fuer 'dark', Monitor fuer 'system'.
export const THEME_ICON_SVGS = {
  light:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/>' +
    '<path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/>' +
    '<path d="M2 12h2"/><path d="M20 12h2"/>' +
    '<path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  dark:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  system:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="2" y="3" width="20" height="14" rx="2"/>' +
    '<path d="M8 21h8"/><path d="M12 17v4"/></svg>',
};

export const THEME_TOOLTIP_KEYS = {
  light: 'statusbar.theme.tooltipLight',
  dark: 'statusbar.theme.tooltipDark',
  system: 'statusbar.theme.tooltipSystem',
};

export const THEME_NEXT = { light: 'dark', dark: 'system', system: 'light' };

// Setzt Icon und Tooltip-i18n-Key des Statusbar-Theme-Buttons passend zum
// uebergebenen Pref. Tooltip wird sofort via t() gesetzt, damit der Wert
// nach jedem Klick direkt sichtbar ist; das data-i18n-title-Attribut wird
// aktualisiert, damit ein spaeterer Sprach-Wechsel den richtigen Key trifft.
export function applyThemePrefToButton(pref) {
  if (!btnTheme) return;
  const normalized = pref === 'light' || pref === 'dark' || pref === 'system' ? pref : 'system';
  btnTheme.innerHTML = THEME_ICON_SVGS[normalized];
  const key = THEME_TOOLTIP_KEYS[normalized];
  btnTheme.setAttribute('data-i18n-title', key);
  btnTheme.title = t(key);
}
export const statusbarHint = $('#statusbar-hint');
export const contextMenu = $('#context-menu');
export const aboutModal = $('#about-modal');
export const aboutVersionEl = $('#about-version');
// 4T-0050 (Epic 3E-0010): Alias-Disambiguation-Dialog. Wird gezeigt, wenn ein
// Wiki-Link auf einen Alias zeigt, den mehrere Dateien fuehren.
export const aliasModal = $('#alias-modal');

// R2-15 (4T-0179): Memoisierung — das Pane-DOM ist statisch (zwei fixe
// .pane-group-Baeume in index.html), die ~30 querySelector pro Aufruf
// liefen aber bei jedem Tastendruck mehrfach. Cache pro Pane-Index.
const paneElsCache = [null, null];

export function getPaneEls(paneIdx) {
  if (paneElsCache[paneIdx]) return paneElsCache[paneIdx];
  const els = buildPaneEls(paneIdx);
  paneElsCache[paneIdx] = els;
  return els;
}

function buildPaneEls(paneIdx) {
  const root = paneRoots[paneIdx];
  return {
    root,
    tabbar: root.querySelector('.tabbar'),
    content: root.querySelector('.content'),
    sourceEl: root.querySelector('.pane-source'),
    sourceEditor: root.querySelector('.pane-source-editor'),
    renderedEl: root.querySelector('.pane-rendered'),
    // 4T-0359 (Epic 3E-0066): spezifisch auf das Render-Pane — die Notizen-
    // Vorschau traegt ebenfalls .markdown-body und steht im DOM davor, ein
    // nackter '.markdown-body'-Selektor faende sie statt des Render-Ziels.
    renderedHtml: root.querySelector('.pane-rendered .markdown-body'),
    // 4T-0277: Container der System-Seiten (Einstellungen). Sichtbar nur
    // bei .content.view-system; das Seiten-DOM montiert renderSystemPane.
    systemEl: root.querySelector('.pane-system'),
    innerSplitter: root.querySelector('.splitter.inner-splitter'),
    // 4T-0288 (Epic 3E-0051): je Pane ein linker und ein rechter Sidebar-
    // Container mit eigenem Splitter. Die Sektions-Referenzen darunter sind
    // root-bezogen und überleben das DOM-Umhängen zwischen den Containern.
    sidebarLeft: root.querySelector('.pane-sidebar-left'),
    sidebarRight: root.querySelector('.pane-sidebar-right'),
    sidebarSplitterLeft: root.querySelector('.splitter.sidebar-splitter-left'),
    sidebarSplitterRight: root.querySelector('.splitter.sidebar-splitter-right'),
    outlineSection: root.querySelector('.sidebar-outline'),
    outlineTree: root.querySelector('.outline-tree'),
    outlineEmpty: root.querySelector('.outline-empty'),
    outlineTitle: root.querySelector('.sidebar-outline .sidebar-section-title'),
    backlinksSection: root.querySelector('.sidebar-backlinks'),
    backlinksStatus: root.querySelector('.backlinks-status'),
    backlinksResults: root.querySelector('.backlinks-results'),
    backlinksInfo: root.querySelector('.sidebar-backlinks .sidebar-section-info'),
    // 4T-0341 (Epic 3E-0061): Unterseiten-Sektion plus Breadcrumb-Leisten
    // ueber dem Dokument (je eine Instanz im Render- und im Source-Pane;
    // data-host steuert, in welchem Ansichts-Modus welche sichtbar ist).
    subpagesSection: root.querySelector('.sidebar-subpages'),
    subpagesStatus: root.querySelector('.subpages-status'),
    subpagesList: root.querySelector('.subpages-list'),
    subpageBreadcrumbs: [...root.querySelectorAll('.subpage-breadcrumb')],
    // 4T-0585 (Epic 3E-0108): Titelzeilen-Instanzen (je eine im Source- und
    // im Render-Pane; data-host steuert wie beim Breadcrumb die Sichtbarkeit
    // pro Ansichts-Modus).
    titleLines: [...root.querySelectorAll('.title-line')],
    // 4T-0073 (Epic 3E-0013): Outgoing-Links-Sektion.
    outgoingSection: root.querySelector('.sidebar-outgoing'),
    outgoingStatus: root.querySelector('.outgoing-status'),
    outgoingResults: root.querySelector('.outgoing-results'),
    // 4T-0075 (Epic 3E-0013): Bookmarks-Sektion. Tree-Container und
    // Leer-Hinweis pro Pane.
    // 4T-0612 (Epic 3E-0115): zwei Abschnitte im selben Panel — ein Bereichs-
    // Abschnitt (nur bei geoeffnetem Bereich) und der allgemeine Abschnitt.
    // Der allgemeine Tree-/Empty-Selektor ist bewusst auf die allgemeine
    // Gruppe qualifiziert, weil der Bereichs-Tree eigene Klassen traegt.
    bookmarksSection: root.querySelector('.sidebar-bookmarks'),
    bookmarksAreaGroup: root.querySelector('.bookmarks-group-area'),
    bookmarksAreaHead: root.querySelector('.bookmarks-group-area .bookmarks-group-head'),
    bookmarksAreaTree: root.querySelector('.bookmarks-area-tree'),
    bookmarksAreaEmpty: root.querySelector('.bookmarks-area-empty'),
    bookmarksGeneralGroup: root.querySelector('.bookmarks-group-general'),
    bookmarksGeneralHead: root.querySelector('.bookmarks-group-general .bookmarks-group-head'),
    bookmarksTree: root.querySelector('.bookmarks-group-general .bookmarks-tree'),
    bookmarksEmpty: root.querySelector('.bookmarks-group-general .bookmarks-empty'),
    // 4T-0051: Properties-Sektion in der Sidebar. Pro Spalte eine Instanz.
    propertiesSection: root.querySelector('.sidebar-properties'),
    propertiesFields: root.querySelector('.sidebar-properties .properties-fields'),
    propertiesEmpty: root.querySelector('.sidebar-properties .properties-empty'),
    propertiesParseError: root.querySelector('.sidebar-properties .properties-parse-error'),
    propertiesAddBtn: root.querySelector('.sidebar-properties .properties-add-btn'),
    // 4T-0327 (Epic 3E-0059): Bereichs-Panel. Ordnerbaum oben, Markdown-
    // Dateiliste des gewaehlten Ordners darunter; Empty-State ohne Bereich.
    areaSection: root.querySelector('.sidebar-area'),
    areaEmpty: root.querySelector('.sidebar-area .area-empty'),
    areaSplit: root.querySelector('.sidebar-area .area-split'),
    areaTree: root.querySelector('.sidebar-area .area-tree'),
    areaFilesTitle: root.querySelector('.sidebar-area .area-files-title'),
    areaNewFileBtn: root.querySelector('.sidebar-area .area-new-file-btn'),
    areaFiles: root.querySelector('.sidebar-area .area-files'),
    // 4T-0434 (Epic 3E-0081): Kalender-Sektion. Filter, Monats-Navigation
    // und Gitter; Hinweise ohne Bereich bzw. ohne Journale.
    calendarSection: root.querySelector('.sidebar-calendar'),
    calendarEmpty: root.querySelector('.sidebar-calendar .calendar-empty'),
    calendarNone: root.querySelector('.sidebar-calendar .calendar-none'),
    calendarMain: root.querySelector('.sidebar-calendar .calendar-main'),
    calendarFilter: root.querySelector('.sidebar-calendar .calendar-filter'),
    calendarPrev: root.querySelector('.sidebar-calendar .calendar-prev'),
    calendarNext: root.querySelector('.sidebar-calendar .calendar-next'),
    calendarToday: root.querySelector('.sidebar-calendar .calendar-today-btn'),
    calendarMonthLabel: root.querySelector('.sidebar-calendar .calendar-month-label'),
    calendarGrid: root.querySelector('.sidebar-calendar .calendar-grid'),
    // 4T-0527 (Epic 3E-0095): Erinnerungs-Sektion. Status-Hinweis (kein
    // Bereich/Index) und Gruppen-Container (ueberfaellig/heute/morgen/
    // spaeter), Eintraege rendert reminders-panel.js.
    remindersSection: root.querySelector('.sidebar-reminders'),
    remindersStatus: root.querySelector('.sidebar-reminders .reminders-status'),
    remindersGroups: root.querySelector('.sidebar-reminders .reminders-groups'),
    // 4T-0372 (Epic 3E-0069): Uhr-Sektion. Den Inhalt (SVG-Zifferblatt und
    // Textzeilen) baut clock-panel.js vollstaendig aus den Optionen auf.
    clockSection: root.querySelector('.sidebar-clock'),
    clockBody: root.querySelector('.sidebar-clock .clock-body'),
    // 4T-0636 (Epic 3E-0069): Leiste der Modus-Tasten; die Tasten selbst
    // baut clock-panel.js (Icons aus command-icons.js, Beschriftung per t()).
    clockModes: root.querySelector('.sidebar-clock .clock-modes'),
    // 4T-0456 (Epic 3E-0084): Datei-Graph-Sektion. Steuerung (Tiefe,
    // Richtung), Status-/Hinweis-Zeilen und Graph-Flaeche.
    fileGraphSection: root.querySelector('.sidebar-filegraph'),
    fileGraphEmpty: root.querySelector('.sidebar-filegraph .filegraph-empty'),
    fileGraphMain: root.querySelector('.sidebar-filegraph .filegraph-main'),
    fileGraphDepth: root.querySelector('.sidebar-filegraph .filegraph-depth'),
    fileGraphDirection: root.querySelector('.sidebar-filegraph .filegraph-direction'),
    fileGraphStatus: root.querySelector('.sidebar-filegraph .filegraph-status'),
    fileGraphNote: root.querySelector('.sidebar-filegraph .filegraph-note'),
    fileGraphScopeHint: root.querySelector('.sidebar-filegraph .filegraph-scope-hint'),
    fileGraphCanvas: root.querySelector('.sidebar-filegraph .filegraph-canvas'),
    // 4T-0056: Tag-Sektion in der Sidebar. Pro Spalte eine Instanz mit
    // Filter-Eingabe, Tag-Baum und Datei-Liste.
    tagsSection: root.querySelector('.sidebar-tags'),
    tagsFilter: root.querySelector('.sidebar-tags .tags-filter'),
    tagsStatus: root.querySelector('.sidebar-tags .tags-status'),
    tagsTree: root.querySelector('.sidebar-tags .tags-tree'),
    tagsFiles: root.querySelector('.sidebar-tags .tags-files'),
    // 4T-0359 (Epic 3E-0066): Notizen-Sektion. Editier-Textfeld plus
    // gerenderte Vorschau; Hinweise fuer Unbenannt/defekt/Konflikt.
    notesSection: root.querySelector('.sidebar-notes'),
    notesEditor: root.querySelector('.sidebar-notes .notes-editor'),
    notesPreview: root.querySelector('.sidebar-notes .notes-preview'),
    notesEmpty: root.querySelector('.sidebar-notes .notes-empty'),
    notesSuspended: root.querySelector('.sidebar-notes .notes-suspended'),
    notesConflict: root.querySelector('.sidebar-notes .notes-conflict'),
    notesPreviewToggle: root.querySelector('.sidebar-notes .notes-preview-toggle'),
    // 4T-0364 (Epic 3E-0067): Block-Eigenschaften-Sektion. Anker-Leiste mit
    // Dropdown und Umbenennen, Eigenschafts-Felder, Verwaisten-Abschnitt.
    blockPropsSection: root.querySelector('.sidebar-blockprops'),
    blockPropsEmpty: root.querySelector('.sidebar-blockprops .block-props-empty'),
    blockPropsSuspended: root.querySelector('.sidebar-blockprops .block-props-suspended'),
    blockPropsAnchorbar: root.querySelector('.sidebar-blockprops .block-props-anchorbar'),
    blockPropsAnchorSelect: root.querySelector('.sidebar-blockprops .block-props-anchor-select'),
    blockPropsRenameBtn: root.querySelector('.sidebar-blockprops .block-props-rename-btn'),
    blockPropsNoAnchor: root.querySelector('.sidebar-blockprops .block-props-no-anchor'),
    blockPropsCreateBtn: root.querySelector('.sidebar-blockprops .block-props-create-btn'),
    blockPropsDuplicate: root.querySelector('.sidebar-blockprops .block-props-duplicate'),
    blockPropsFields: root.querySelector('.sidebar-blockprops .block-props-fields'),
    blockPropsAddBtn: root.querySelector('.sidebar-blockprops .block-props-add-btn'),
    blockPropsOrphans: root.querySelector('.sidebar-blockprops .block-props-orphans'),
    blockPropsOrphansList: root.querySelector('.sidebar-blockprops .block-props-orphans-list'),
  };
}

export function activeTab() {
  const pane = state.panes[state.activePaneIndex];
  if (!pane || pane.activeIndex < 0) return null;
  return pane.tabs[pane.activeIndex];
}

// 4T-0330 (Epic 3E-0059, PO-Testbefund): dreiwertige Sichtbarkeits-Praeferenz
// des Bereichs-Panels aufloesen — null/undefined = nie explizit geschaltet
// (Default: sichtbar in Spalte 0 einer Bereichs-App, sonst unsichtbar),
// true/false = explizite bzw. persistierte Wahl. Zentral hier, weil sowohl
// das Panel (area-panel.js) als auch die Empty-State-Mechanik (views.js)
// dieselbe Aufloesung brauchen.
export function areaPanelVisiblePref(paneIdx) {
  const v = state.areaPanel.visibleByPane[paneIdx];
  if (v === null || v === undefined) return !!state.areaPath && paneIdx === 0;
  return !!v;
}

// 4T-0017: Wendet den Zoom-Faktor des aktiven Tabs einer Pane auf deren
// Inhalts-Container an. Chromium-`zoom` skaliert sowohl Schrift als auch
// Layout-Geometrie inklusive Scrollbars; CodeMirror sieht weiterhin
// konsistente getBoundingClientRect-Werte. Bei Faktor 1.0 wird das Property
// entfernt, damit der Default-Stack greift.
export function applyZoomToPane(paneIdx) {
  const pane = state.panes[paneIdx];
  const els = getPaneEls(paneIdx);
  if (!els) return;
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const zoom = tab ? clampZoom(tab.zoom) : DEFAULT_ZOOM;
  const value = zoom === 1 ? '' : String(zoom);
  if (els.sourceEditor) els.sourceEditor.style.zoom = value;
  if (els.renderedHtml) els.renderedHtml.style.zoom = value;
}

// 4T-0017: Aktualisiert den Statusbar-Indikator anhand des Zooms des aktiven
// Tabs der fokussierten Pane. Bei Faktor 1.0 ist der Indikator versteckt.
export function renderZoomIndicator() {
  const el = document.getElementById('zoom-indicator');
  if (!el) return;
  const tab = activeTab();
  const zoom = tab ? clampZoom(tab.zoom) : DEFAULT_ZOOM;
  if (zoom === 1) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  const percent = Math.round(zoom * 100);
  el.hidden = false;
  el.textContent = t('statusbar.zoom').replace('{percent}', String(percent));
  el.title = t('statusbar.zoomResetTitle');
}

// 4T-0017: Setzt den Zoom des aktiven Tabs der angegebenen Pane absolut oder
// relativ (delta in Anzahl Schritten). Beide Pfade clampen auf das gueltige
// Intervall und schreiben den Wert nur, wenn er sich tatsaechlich aendert
// (sonst kein DOM-Update, kein Indikator-Re-Render). Speichert den State
// nicht in den Settings (Zoom ist fluechtig).
export function adjustTabZoom(paneIdx, deltaSteps) {
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return;
  const tab = pane.tabs[pane.activeIndex];
  if (!tab) return;
  const next = clampZoom((tab.zoom || DEFAULT_ZOOM) + deltaSteps * ZOOM_STEP);
  if (next === tab.zoom) return;
  tab.zoom = next;
  applyZoomToPane(paneIdx);
  renderZoomIndicator();
}

export function resetTabZoom(paneIdx) {
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return;
  const tab = pane.tabs[pane.activeIndex];
  if (!tab) return;
  if (tab.zoom === DEFAULT_ZOOM) return;
  tab.zoom = DEFAULT_ZOOM;
  applyZoomToPane(paneIdx);
  renderZoomIndicator();
}

// 4T-0019: Fokus-Modus toggelt die CSS-Klasse body.focus-mode (CSS blendet
// Tabbar, Statusbar und Sidebar-Panels aus), schreibt den Wert in den Store
// und aktualisiert das Menue-Haekchen des eigenen Fensters. Kein Multi-Window-
// Broadcast — andere Fenster bleiben unberuehrt.
export function setFocusMode(on) {
  const next = !!on;
  if (state.focusMode === next) return;
  state.focusMode = next;
  document.body.classList.toggle('focus-mode', next);
  api.setSetting('focusMode', next);
  reportMenuStateNow();
}

export function toggleFocusMode() {
  setFocusMode(!state.focusMode);
}

// 4T-0697 (Epic 3E-0141): reiner Lese-Zugriff auf den Kollaps-Zustand einer
// Spalte (Pane-Group und Seite). renderSidebarSide fragt ihn je Durchlauf ab;
// eine unbekannte Pane/Seite gilt als nicht eingeklappt.
export function isSidebarCollapsed(paneIdx, side) {
  const arr = state.sidebarCollapsed[side];
  return !!(arr && arr[paneIdx]);
}

// 4T-0697 (Epic 3E-0141): Store-Wert des Kollaps-Zustands zur festen Form
// { left: [bool, bool], right: [bool, bool] } normalisieren (robust gegen
// fehlende, defekte oder zu kurze/lange Werte — Muster normalizeMenuState).
// Ohne verwertbaren Wert bleibt alles ausgeklappt (Default).
export function normalizeSidebarCollapsed(raw) {
  const side = (v) => [!!(Array.isArray(v) && v[0]), !!(Array.isArray(v) && v[1])];
  const r = raw && typeof raw === 'object' ? raw : {};
  return { left: side(r.left), right: side(r.right) };
}

// 4T-0019: Typewriter-Scroll als Compartment auf allen Pane-Editoren
// ein- oder ausschalten. Wert wird global persistiert und beim Menue-
// Haekchen gespiegelt.
export function setTypewriterScroll(on) {
  const next = !!on;
  if (state.typewriterScroll === next) return;
  state.typewriterScroll = next;
  const extension = next ? typewriterScrollExtension : [];
  for (const view of paneEditors) {
    if (!view) continue;
    view.dispatch({ effects: editorCompartments.typewriter.reconfigure(extension) });
  }
  api.setSetting('typewriterScroll', next);
  reportMenuStateNow();
}

export function toggleTypewriterScroll() {
  setTypewriterScroll(!state.typewriterScroll);
}

// Anzeigename eines Tabs: Dateiname bei Tabs mit Pfad, lokalisierter
// Seiten-Titel bei Handbuch-Tabs (4T-0213) und System-Seiten (4T-0277),
// sonst lokalisierter Unbenannt-Stamm plus Index (z.B. "Unbenannt 1").
export function tabDisplayName(tab) {
  if (!tab) return '';
  if (tab.path) return api.basename(tab.path);
  if (tab.manualPage) {
    const page = manualPageById(tab.manualPage);
    if (page) return t(page.titleKey);
  }
  if (tab.systemPage) {
    const page = systemPageById(tab.systemPage);
    // 4T-0455: dynamischer Seiten-Titel hat Vorrang (Bereichs-Graph traegt
    // den Bereichs-Namen im Tab-Titel).
    if (page && typeof page.title === 'function') return page.title();
    if (page) return t(page.titleKey);
  }
  return `${t('save.untitled')}${tab.untitledIndex ? ' ' + tab.untitledIndex : ''}`;
}
