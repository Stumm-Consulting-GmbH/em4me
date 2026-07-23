// 4T-0277/4T-0278/4T-0279 (Epic 3E-0049): Einstellungs-Seite als System-Tab.
//
// Ersetzt den modalen Einstellungs-Dialog: 4T-0277 lieferte die
// Tab-Infrastruktur, 4T-0278 das Seiten-Layout (Bereichsnavigation links,
// Bereichs-Inhalt rechts, seitenweite Button-Leiste) samt Bereichs-Registry
// mit Andockpunkt für dynamische Bereiche (YAML-Schalter aus 3E-0050,
// Erweiterungs-Bereiche aus 3E-0052/3E-0053), 4T-0279 die vier migrierten
// Bereiche Darstellung, Verhalten, Task-Status und Tastenkürzel (1:1 aus
// dem früheren Modal in settings-search.js, jetzt search.js).
//
// Entwurfs-Semantik wie im früheren Dialog: Snapshot beim Öffnen,
// Live-Vorschau der Darstellungs-Werte über CSS-Variablen, Validierung und
// Persistierung erst bei Anwenden/OK; Abbrechen bzw. Schließen des Tabs
// ohne Anwenden verwirft (onClose-Haken revertiert die Live-Vorschau).
'use strict';

import { t } from '../i18n.js';
import { api } from './api.js';
import {
  DEFAULT_VIEW_MODE,
  getEditorViewDefaults,
  setEditorViewDefaults,
  state,
} from './app-state.js';
import { closeTab } from './tabs.js';
import { persistSetting, showStatusbarHint } from './views.js';
import { findSystemTabAcrossPanes, openSystemPage, registerSystemPage } from './system-pages.js';
// 4T-0204: Task-Status-Verwaltung (Aufloesung, Persistenz-Form, Anwenden).
import {
  TASK_STATE_FORBIDDEN_CHARS,
  TASK_STATE_TYPES,
  applyTaskStates,
  taskStatesResolved,
  toStoredTaskStates,
} from './task-states.js';
// 4T-0498 (Epic 3E-0090): Bereich „Aufgaben" — Global Filter, Ausblende-
// Option, Automatik-Schalter und Einfüge-Position der Wiederholungs-Instanz.
// Erweiterungs-eigener Bereich der tasks-Erweiterung (settingsSections-
// Eintrag in src/shared/extensions.js): erscheint nur bei aktiver Erweiterung.
import { tasksConfig, applyTasksConfig, normalizeTasksConfig } from './tasks.js';
// 4T-0528 (Epic 3E-0095): Erinnerungs-Bereich — aktuelle Konfiguration aus
// dem Dialog-Modul (Broadcast-aktuell), Normalisierung und Einheiten aus
// dem Erinnerungs-Kern, Zeit-Eingabe ueber den Picker (kein Freitext).
import { currentRemindersConfig } from './reminders.js';
import { normalizeRemindersConfig, SNOOZE_UNITS } from '../../shared/reminders.js';
import { showDateTimePicker } from './date-picker.js';
// 4T-0208 (Epic 3E-0015): Tastenkuerzel-Editor — Registry, Normalisierung,
// Capture-Regeln und Konflikt-Erkennung aus der Kommando-Registry.
import {
  COMMANDS,
  COMMAND_CATEGORIES,
  mergeBindings,
  normalizeBinding,
  eventToBinding,
  bindingToDisplayString,
  isBindingCapturable,
  findBindingConflict,
  findDuplicateBindings,
} from '../../shared/commands.js';
// Anzeige-Lokalisierung der Tasten-Tokens (bestehende Hilfe-Pipeline).
// Modul-Zyklus settings-page <-> autocomplete-help ist unkritisch:
// Zugriff erfolgt erst zur Laufzeit (Funktionsaufrufe), Muster wie die
// dokumentierten Zyklen der Modularisierung (4T-0179).
import { localizeKey, splitShortcutKeys } from './autocomplete-help.js';
// 4T-0359 (Epic 3E-0066): Vorschau-Default des Notizen-Panels (Setting
// notes.previewByDefault, Wirkung wie showFrontmatter erst bei Anwenden/OK).
import { isNotesPreviewByDefault, setNotesPreviewByDefault } from './notes-panel.js';
// 4T-0284 (Epic 3E-0050): Frontmatter-Anzeige-Schalter im Bereich
// Darstellung (Setting render.showFrontmatter, Default an).
import {
  applyFrontmatterDisplay,
  applyFrontmatterExpanded,
  isFrontmatterDisplayEnabled,
  isFrontmatterExpanded,
} from './frontmatter-display.js';
import {
  isHeadingNumberingEnabled,
  headingNumberingStartLevel,
  applyHeadingNumbering,
} from './heading-numbering.js';
// 4T-0414 (Epic 3E-0078): Skript-Blöcke ausführen (Setting scripts.run,
// Default aus, Warntext) im Bereich Verhalten; Wirkung erst bei Anwenden/OK
// (Muster showFrontmatter), Multi-Window-Sync über den Settings-Broadcast.
import {
  applyPerspectiveScriptsEnabled,
  isPerspectiveScriptsEnabled,
} from './perspective-script-view.js';
// 4T-0294 (Epic 3E-0052): Kommandos deaktivierter Erweiterungen erscheinen
// nicht im Tastenkuerzel-Editor (ihre Overrides bleiben unangetastet
// persistiert und kehren beim Wiedereinschalten zurueck).
// 4T-0295: Bereich „Erweiterungen" (Schalter je interner Erweiterung mit
// Abhaengigkeits-Hinweis) plus dynamische erweiterungs-eigene Bereiche
// (settingsSections im Manifest erscheinen nur bei aktiver Erweiterung).
import {
  EXTENSION_CATEGORIES,
  allExtensions,
  disabledCommandIdSet,
  disabledSettingsSectionIdSet,
  effectiveDisabledSet,
  extensionById,
} from '../../shared/extensions.js';
import { applyExtensionsState, getDisabledExtensionIds } from './extension-lifecycle.js';
// 4T-0450 (Epic 3E-0083): Klick auf einen Profil-Listen-Eintrag öffnet die
// Profil-Datei als Tab (bestehender Sprung-Helfer der Lesezeichen); die
// Sektions-Normalisierung liefert die Persistenz- und Vergleichs-Form.
import { openOrJumpToPath } from './bookmarks.js';
import { normalizeProfilesConfig } from '../../shared/property-profiles.js';
// 4T-0436 (Epic 3E-0081): Bereich „Journale" — Regal- und Journal-Verwaltung
// der journals-Sektion der Bereichsdatei; die Pfad-Vorschau läuft über die
// Schema-Auflösung des Perioden-Kerns.
import {
  JOURNAL_GRANULARITIES,
  DEFAULT_DATE_PROP,
  DEFAULT_START_PROP,
  DEFAULT_END_PROP,
  isoDateToMs,
  periodOf,
  resolveEntryPath,
} from '../../shared/journal-core.js';
// 4T-0544 (Epic 3E-0097): Bereich „Kalender-Systeme" — zweistufige Pflege
// der calendarSystems-Sektion der Bereichsdatei; Validierung, Vorschau und
// Vorlage laufen ausschließlich über die Kern-API.
import {
  normalizeCalendarConfig,
  createGregorianTemplate,
  formatTuple,
  parseCanonical,
  cycleAt,
} from '../../shared/calendar-core.js';
// 4T-0332 (Epic 3E-0060): nach Anwenden der Historien-Einstellungen den
// Statusbar-Zustand nachziehen.
import { updateHistoryStatus } from './history-status.js';
// 4T-0300 (Epic 3E-0053): Bereich „Erweiterungen (extern)" — Verwaltungs-
// Oberfläche des Vertrauensmodells (Liste mit Status, Aktivieren über den
// Warn-Dialog, Deaktivieren, Entfernen, erneuter Scan, Explorer-Zugang).
import {
  disableExternalExtension,
  enableExternalExtension,
  externalExtensionEntries,
  removeExternalExtension,
  rescanExternalExtensions,
} from './extension-host.js';
// 4T-0304 (Epic 3E-0054): Bereich „Export" — Formate, Rand-Stufen und
// Defaults kommen aus demselben Modul, das der Main beim Druck nutzt
// (electron-frei, gemeinsame Quelle statt doppelter Wertelisten).
import {
  PDF_PAGE_SIZES,
  PDF_MARGIN_PRESETS,
  PDF_EXPORT_DEFAULTS,
  normalizePdfExportSettings,
} from '../../shared/pdf-options.js';
// 4T-0466 (Epic 3E-0086): Farbschema-Bereich — aktueller Zustand und
// Live-Anwendung aus dem Renderer-Modul, Slot- und Verwaltungs-Logik aus dem
// prozessneutralen Shared-Modul.
import { getColorSchemeState, setColorSchemeState } from './color-schemes.js';
import {
  SLOT_GROUPS,
  COLOR_SLOTS,
  BUILTIN_SCHEMES,
  allSchemes,
  schemeById,
  isBuiltinId,
  resolveSchemeColors,
  addCustomScheme,
  renameCustomScheme,
  duplicateScheme,
  deleteCustomScheme,
  setSlotColor,
  resetSlotColor,
  setActiveScheme,
} from '../../shared/color-schemes.js';

export const SETTINGS_PAGE_ID = 'settings';

// --- Darstellung: Konstanten und Helfer (4T-0018) -------------------------------
// Konfigurierbare Schriftart und -groesse fuer Editor und Render-Pane.
// Werte werden ueber electron-store unter dem Schluessel-Prefix appearance.*
// persistiert; eine Aenderung in einem Fenster wird vom Main an alle anderen
// Fenster broadcastet, sodass die neuen Werte sofort ueberall greifen.

export const APPEARANCE_DEFAULTS = {
  editorFont: 'Consolas',
  editorSize: 14,
  renderFont: 'Segoe UI',
  renderSize: 15,
  contentWidth: 80,
  // 4T-0575 (Epic 3E-0106): abgerundete Ecken der Dokument-Reiter und der
  // Tab-Gruppen-Koepfe. Default aus, das heutige eckige Bild bleibt damit
  // der Auslieferungszustand.
  roundedTabs: false,
  // 4T-0577 (Epic 3E-0106): Hervorhebung der Cursor-Zeile im Edit-Modus.
  // Default an (PO-Festlegung: ueblicher Editor-Komfort).
  highlightActiveLine: true,
};
export const APPEARANCE_SIZE_MIN = 8;
export const APPEARANCE_SIZE_MAX = 32;
// 4T-0383 (Epic 3E-0072): Inhalts-Breite der gerenderten Ansicht in Prozent
// der Pane-Breite (PO-Festlegung: freie Prozent-Eingabe 20 bis 100,
// Default 80). Ersetzt die feste 920-px-Begrenzung der .markdown-body-Regel.
export const CONTENT_WIDTH_MIN = 20;
export const CONTENT_WIDTH_MAX = 100;

export function clampAppearanceSize(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(APPEARANCE_SIZE_MIN, Math.min(APPEARANCE_SIZE_MAX, Math.round(n)));
}

export function clampContentWidth(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(CONTENT_WIDTH_MIN, Math.min(CONTENT_WIDTH_MAX, Math.round(n)));
}

// Setzt die fuenf appearance-CSS-Variablen auf :root. Jede Schriftart kommt
// mit einer Fallback-Kette, damit nicht installierte Familien nicht zu
// kaputtem Layout fuehren.
export function applyAppearanceVars(values) {
  const root = document.documentElement;
  const editorFont = (values.editorFont || APPEARANCE_DEFAULTS.editorFont).trim();
  const renderFont = (values.renderFont || APPEARANCE_DEFAULTS.renderFont).trim();
  root.style.setProperty(
    '--editor-font-family',
    `"${editorFont}", "Cascadia Code", "Consolas", "Courier New", monospace`,
  );
  root.style.setProperty(
    '--editor-font-size',
    `${clampAppearanceSize(values.editorSize, APPEARANCE_DEFAULTS.editorSize)}px`,
  );
  root.style.setProperty(
    '--render-font-family',
    `"${renderFont}", "Segoe UI", system-ui, sans-serif`,
  );
  root.style.setProperty(
    '--render-font-size',
    `${clampAppearanceSize(values.renderSize, APPEARANCE_DEFAULTS.renderSize)}px`,
  );
  // 4T-0383: Prozent-Breite der gerenderten Ansicht (Render-Pane und
  // Reading; der PDF-Export ueberschreibt mit max-width: none).
  root.style.setProperty(
    '--content-width',
    `${clampContentWidth(values.contentWidth, APPEARANCE_DEFAULTS.contentWidth)}%`,
  );
  // 4T-0575: Ecken-Form der Reiter und Gruppen-Koepfe. Reine Root-Klasse
  // (Muster frontmatter-expanded) — die Geometrie (Radius, Abstand statt
  // Trennlinie) liegt vollstaendig im Stylesheet, damit Themes und
  // Farbschemas sie ueber --tab-radius uebersteuern koennen.
  root.classList.toggle('rounded-tabs', values.roundedTabs === true);
  // 4T-0577: Hervorhebung der Cursor-Zeile. Default an, deshalb schaltet
  // nur ein explizites false ab (Alt-Profile und leere Broadcast-Payloads
  // landen auf dem Default).
  root.classList.toggle('highlight-active-line', values.highlightActiveLine !== false);
}

export async function readAppearanceFromStore() {
  const editorFont = await api.getSetting('appearance.editorFont');
  const editorSize = await api.getSetting('appearance.editorSize');
  const renderFont = await api.getSetting('appearance.renderFont');
  const renderSize = await api.getSetting('appearance.renderSize');
  const contentWidth = await api.getSetting('appearance.contentWidth');
  const roundedTabs = await api.getSetting('appearance.roundedTabs');
  const highlightActiveLine = await api.getSetting('appearance.highlightActiveLine');
  return {
    editorFont: editorFont || APPEARANCE_DEFAULTS.editorFont,
    editorSize: clampAppearanceSize(editorSize, APPEARANCE_DEFAULTS.editorSize),
    renderFont: renderFont || APPEARANCE_DEFAULTS.renderFont,
    renderSize: clampAppearanceSize(renderSize, APPEARANCE_DEFAULTS.renderSize),
    contentWidth: clampContentWidth(contentWidth, APPEARANCE_DEFAULTS.contentWidth),
    // 4T-0575: nur explizites true rundet (Default aus, auch fuer
    // Bestands-Profile ohne gespeicherten Wert).
    roundedTabs: roundedTabs === true,
    // 4T-0577: Default an, nur explizites false schaltet ab.
    highlightActiveLine: highlightActiveLine !== false,
  };
}

// Bereinigte Darstellungs-Werte aus dem Entwurf (Pendant des frueheren
// settingsCurrentInputValues, jetzt draft- statt DOM-basiert).
function appearanceDraftValues(draft) {
  const a = (draft && draft.appearance) || {};
  return {
    editorFont: String(a.editorFont || '').trim() || APPEARANCE_DEFAULTS.editorFont,
    editorSize: clampAppearanceSize(a.editorSize, APPEARANCE_DEFAULTS.editorSize),
    renderFont: String(a.renderFont || '').trim() || APPEARANCE_DEFAULTS.renderFont,
    renderSize: clampAppearanceSize(a.renderSize, APPEARANCE_DEFAULTS.renderSize),
    contentWidth: clampContentWidth(a.contentWidth, APPEARANCE_DEFAULTS.contentWidth),
    roundedTabs: a.roundedTabs === true,
    highlightActiveLine: a.highlightActiveLine !== false,
  };
}

// 4T-0179/R5-08: Merge fuer den Appearance-Broadcast eines anderen
// Fensters — der offene Entwurfs-Snapshot zieht mit, sonst revertiert
// "Abbrechen" auf den Stand vor dem Broadcast und ueberschreibt die
// Aenderung des anderen Fensters.
export function mergeAppearanceSnapshot(values) {
  const snapshot = pageState.draft && pageState.draft.appearanceSnapshot;
  if (!snapshot || !values) return;
  const clean = Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined && v !== null),
  );
  pageState.draft.appearanceSnapshot = { ...snapshot, ...clean };
}

// --- Seiten-Zustand -----------------------------------------------------------
// Lebt pro Fenster über die Lebensdauer einer geöffneten Seite (Einfach-
// Instanz). draft ist der zentrale Entwurfs-Kontext, den die Bereichs-
// Renderfunktionen lesen und schreiben; Bereichswechsel verwirft nichts.
const pageState = {
  activeSectionId: 'appearance',
  draft: null,
  // Bereichs-ID -> lokalisierter Fehlertext des letzten Apply-Versuchs.
  errors: new Map(),
  // Zählt pro Neu-Öffnen hoch; asynchrone Nachlade-Pfade (Appearance aus
  // dem Store) verwerfen ihr Ergebnis, wenn zwischenzeitlich neu geöffnet
  // wurde.
  generation: 0,
};

// Frischer Entwurf beim Öffnen einer neuen Seite (nicht beim Aktivieren
// einer bestehenden und nicht beim Sprachwechsel-Re-Mount). Task-Status-
// und Hotkeys-Draft entstehen synchron aus dem Laufzeit-Zustand; die
// Darstellungs-Werte kommen asynchron aus dem Store nach (Muster des
// frueheren showSettings) und rendern den aktiven Bereich dann nach.
function resetPageState() {
  pageState.activeSectionId = 'appearance';
  pageState.errors = new Map();
  pageState.generation += 1;
  cancelHotkeyCapture();
  hotkeysResetAllArmed = false;
  pageState.draft = {
    // null = noch nicht aus dem Store geladen; die Darstellung rendert bis
    // dahin mit Defaults und zieht nach dem Laden nach.
    appearance: null,
    appearanceSnapshot: null,
    // 4T-0466 (Epic 3E-0086): Farbschema-Zustand als Arbeitskopie des aktuellen
    // Modul-Stands (beim App-Start aus dem Store geladen). Live-Vorschau über
    // setColorSchemeState; Abbrechen revertiert auf den Snapshot.
    colorSchemes: structuredClone(getColorSchemeState()),
    colorSchemesSnapshot: structuredClone(getColorSchemeState()),
    // 4T-0284: Frontmatter-Anzeige aus dem Laufzeit-Zustand (beim
    // App-Start aus dem Store geladen); kein Sofort-Anwenden, Wirkung
    // erst bei Anwenden/OK.
    showFrontmatter: isFrontmatterDisplayEnabled(),
    // 4T-0312: dauerhaft ausgeklappte Frontmatter-Darstellung (Wirkung
    // erst bei Anwenden/OK, Muster showFrontmatter).
    frontmatterExpanded: isFrontmatterExpanded(),
    // 4T-0359 (Epic 3E-0066): Vorschau-Default des Notizen-Panels.
    notesPreviewByDefault: isNotesPreviewByDefault(),
    // 4T-0572 (Epic 3E-0105): globale Voreinstellung der drei Editor-
    // Ansicht-Schalter aus dem Laufzeit-Zustand (beim App-Start aus dem
    // Store geladen; Wirkung erst bei Anwenden/OK, Muster showFrontmatter).
    editorViewDefaults: getEditorViewDefaults(),
    // 4T-0414 (Epic 3E-0078): Skript-Blöcke ausführen (Laufzeit-Zustand,
    // beim App-Start aus dem Store geladen; Wirkung erst bei Anwenden/OK).
    scriptsRun: isPerspectiveScriptsEnabled(),
    defaultViewMode: state.defaultViewMode || DEFAULT_VIEW_MODE,
    // 4T-0204: Arbeitskopie des Task-Status-Sets (Abbrechen verwirft sie;
    // Anwenden validiert, persistiert und wendet an).
    taskStates: taskStatesResolved.map((s) => ({ ...s })),
    // 4T-0498 (Epic 3E-0090): Arbeitskopie der Aufgaben-Konfiguration aus
    // dem Laufzeit-Zustand (beim App-Start aus dem Store geladen). Wirkung
    // erst bei Anwenden/OK; Abbrechen verwirft die Kopie.
    tasks: { ...tasksConfig },
    // 4T-0208: Arbeitskopie der effektiven Bindings (nur Abweichungen vom
    // Default werden persistiert).
    hotkeys: buildHotkeysDraftFromState(),
    // 4T-0295: Arbeitskopie der bewusst deaktivierten Erweiterungs-IDs
    // (Wirkung erst bei Anwenden/OK, Muster der uebrigen Bereiche).
    extensionsDisabled: getDisabledExtensionIds(),
    // 4T-0304: null = Export-Einstellungen noch nicht aus dem Store
    // geladen; der Bereich rendert bis dahin mit den Defaults und zieht
    // nach dem Laden nach (Muster appearance). Der Snapshot traegt den
    // geladenen Stand fuer den Nur-bei-Aenderung-Persist.
    exportPdf: null,
    exportPdfSnapshot: null,
    // 4T-0332 (Epic 3E-0060): Dokument-Historie (App-Schalter, Zeitparameter,
    // Bereichs-Default). null = noch nicht geladen (Muster exportPdf).
    history: null,
    historySnapshot: null,
    // 4T-0428 (Epic 3E-0080): Vorlagen-Konfiguration (globaler Ordner und
    // Regeln, Bereichs-Übersteuerung). null = noch nicht geladen.
    templates: null,
    templatesSnapshot: null,
    // 4T-0450 (Epic 3E-0083): Eigenschafts-Profile (propertyProfiles-Sektion
    // der Bereichsdatei plus Profil-Liste). null = noch nicht geladen.
    profiles: null,
    profilesSnapshot: null,
    // 4T-0544 (Epic 3E-0097): Kalender-Systeme (calendarSystems-Sektion
    // der Bereichsdatei). null = noch nicht geladen (Muster journals).
    calendar: null,
    calendarSnapshot: null,
  };
  const generation = pageState.generation;
  readAppearanceFromStore().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.appearance = { ...values };
    pageState.draft.appearanceSnapshot = { ...values };
    if (pageState.activeSectionId === 'appearance') renderActiveSection();
  });
  readPdfExportFromStore().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.exportPdf = { ...values };
    pageState.draft.exportPdfSnapshot = { ...values };
    if (pageState.activeSectionId === 'export') renderActiveSection();
  });
  readHistoryFromStore().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.history = { ...values };
    pageState.draft.historySnapshot = { ...values };
    // 4T-0555: der Bereichs-Default lebt in der eigenen Sektion historyArea.
    if (['behavior', 'historyArea'].includes(pageState.activeSectionId)) renderActiveSection();
  });
  // 4T-0346 (Epic 3E-0062): Link-Update-Einstellungen (Bereich Verhalten).
  readRenameLinkSettings().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.renameLinks = { ...values };
    pageState.draft.renameLinksSnapshot = { ...values };
    if (pageState.activeSectionId === 'behavior') renderActiveSection();
  });
  // 4T-0428 (Epic 3E-0080): Vorlagen-Konfiguration (Muster exportPdf).
  readTemplatesFromConfig().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.templates = values.draft;
    pageState.draft.templatesSnapshot = values.snapshot;
    // 4T-0555: die Bereichs-Konfiguration lebt in der Sektion templatesArea.
    if (['templates', 'templatesArea'].includes(pageState.activeSectionId)) renderActiveSection();
  });
  // 4T-0436 (Epic 3E-0081): Journal-Konfiguration des Bereichs.
  readJournalsFromConfig().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.journals = values.draft;
    pageState.draft.journalsSnapshot = values.snapshot;
    if (pageState.activeSectionId === 'journals') renderActiveSection();
  });
  // 4T-0450 (Epic 3E-0083): Profil-Konfiguration des Bereichs.
  readProfilesFromConfig().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.profiles = values.draft;
    pageState.draft.profilesSnapshot = values.snapshot;
    if (pageState.activeSectionId === 'propertyProfiles') renderActiveSection();
  });
  // 4T-0544 (Epic 3E-0097): Kalender-System-Konfiguration des Bereichs.
  readCalendarFromConfig().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.calendar = values.draft;
    pageState.draft.calendarSnapshot = values.snapshot;
    if (pageState.activeSectionId === 'calendarSystems') renderActiveSection();
  });
  // 4T-0369 (Epic 3E-0068): Entwurfs-Zwischenspeicher-Schalter (Bereich Verhalten).
  api.getSetting('keepUnsavedDrafts').then((value) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.keepUnsavedDrafts = value !== false;
    pageState.draft.keepUnsavedDraftsSnapshot = value !== false;
    if (pageState.activeSectionId === 'behavior') renderActiveSection();
  });
  // 4T-0603 (Epic 3E-0113): Link-in-Auswahl-Schalter (Bereich Verhalten).
  api.getSetting('input.tabIndents').then((value) => {
    pageState.draft.tabIndents = value !== false;
    pageState.draft.tabIndentsSnapshot = value !== false;
  });
  api.getSetting('input.pasteUrlAsLink').then((value) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.pasteUrlAsLink = value !== false;
    pageState.draft.pasteUrlAsLinkSnapshot = value !== false;
    if (pageState.activeSectionId === 'behavior') renderActiveSection();
  });
  // 4T-0604 (Epic 3E-0113): Zeitstempel-Automatik (eigener Bereich).
  Promise.all([
    api.getSetting('frontmatter.createdEnabled'),
    api.getSetting('frontmatter.createdField'),
    api.getSetting('frontmatter.updatedEnabled'),
    api.getSetting('frontmatter.updatedField'),
    api.getSetting('frontmatter.timestampFormat'),
    api.getSetting('frontmatter.autoCreateField'),
  ]).then(([ce, cf, ue, uf, fmt, ac]) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    const ts = normalizeTimestampDraft({
      createdEnabled: ce === true,
      createdField: cf || 'created',
      updatedEnabled: ue === true,
      updatedField: uf || 'updated',
      format: fmt === 'date' ? 'date' : 'datetime',
      autoCreate: ac === true,
    });
    pageState.draft.timestamps = ts;
    pageState.draft.timestampsSnapshot = { ...ts };
    if (pageState.activeSectionId === 'frontmatterTimestamps') renderActiveSection();
  });
}

export function openSettingsPage() {
  openSystemPage(SETTINGS_PAGE_ID);
}

function closeSettingsTab() {
  const found = findSystemTabAcrossPanes(SETTINGS_PAGE_ID);
  if (found) closeTab(found.paneIdx, found.tabIdx);
}

// Tab geschlossen ohne Anwenden (X, Strg+W, Abbrechen, Fenster-Transfer):
// Capture-Listener abbauen und die Live-Vorschau auf den Snapshot
// zurücksetzen (Semantik des früheren Abbrechen).
function handleSettingsPageClose() {
  cancelHotkeyCapture();
  hotkeysResetAllArmed = false;
  if (pageState.draft && pageState.draft.appearanceSnapshot) {
    applyAppearanceVars(pageState.draft.appearanceSnapshot);
  }
  // 4T-0466 (Epic 3E-0086): Farbschema-Live-Vorschau auf den Snapshot
  // zurücksetzen (Semantik Abbrechen). Bei OK trägt der Snapshot bereits den
  // angewandten Stand, der Revert ist dann ein No-op.
  if (pageState.draft && pageState.draft.colorSchemesSnapshot) {
    setColorSchemeState(pageState.draft.colorSchemesSnapshot);
  }
  pageState.draft = null;
  pageEls = null;
}

// --- Bereichs-Registry (4T-0278) ---------------------------------------------
// Bereichs-Definition:
//   id        stabile Bereichs-Kennung (zugleich Navigations-Anker).
//   titleKey  i18n-Key des Bereichs-Titels (Navigation und Inhalts-Kopf).
//   render    baut den Bereichs-Inhalt in den Container; liest und
//             schreibt ausschließlich den übergebenen Entwurfs-Kontext.
//   validate  optional; prüft den Entwurf des Bereichs und liefert bei
//             Ablehnung einen lokalisierten Fehlertext (String), sonst
//             null. Ein Fehler markiert den Bereich in der Navigation
//             und blockiert Anwenden/OK seitenweit.
//   apply     optional; persistiert den Bereichs-Entwurf (läuft erst,
//             wenn ALLE Bereiche validiert sind — ein halber Apply wäre
//             verwirrender als ein abgelehnter, Muster des Modals).
//   dirty     optional (4T-0554, Epic 3E-0100); meldet, ob der Bereichs-
//             Entwurf ungesicherte Änderungen trägt. Spiegelt exakt die
//             Änderungs-Prüfung des apply-Hooks (Snapshot-Diff bzw.
//             Live-Getter-Vergleich): true genau dann, wenn ein Anwenden
//             mindestens einen Wert persistieren würde. Bereiche ohne
//             Entwurfs-Logik (Sofort-Wirkung) lassen den Hook weg.
//   group     optional (4T-0555, Epic 3E-0100); 'area' für bereichs-
//             gebundene Sektionen — sie erscheinen in der Navigations-
//             Gruppe „Aktueller Bereich" und nur bei gebundenem Bereich
//             (state.areaPath). Ohne Angabe gilt 'general' (Gruppe
//             „Allgemein", immer sichtbar); das ist auch der Default für
//             dynamisch registrierte Sektionen.
const FIXED_SECTIONS = [
  {
    id: 'appearance',
    titleKey: 'settings.appearance',
    render: renderAppearanceSection,
    apply: applyAppearanceSection,
    dirty: dirtyAppearanceSection,
  },
  // 4T-0466 (Epic 3E-0086): Farbschemas (kuratierte Slots, Live-Vorschau).
  // Position direkt hinter „Darstellung": beide gestalten das Erscheinungsbild.
  // Kern-Bereich (keine settingsSections-Kopplung), immer sichtbar.
  {
    id: 'colorSchemes',
    titleKey: 'settings.colorSchemes.title',
    render: renderColorSchemesSection,
    apply: applyColorSchemesSection,
    dirty: dirtyColorSchemesSection,
  },
  {
    id: 'behavior',
    titleKey: 'settings.behavior',
    render: renderBehaviorSection,
    apply: applyBehaviorSection,
    dirty: dirtyBehaviorSection,
  },
  // 4T-0604 (Epic 3E-0113): Zeitstempel-Automatik (created/updated im
  // Frontmatter). Erweiterungs-eigener Bereich der Erweiterung
  // 'frontmatter-timestamps' (settingsSections-Eintrag in
  // src/shared/extensions.js) — erscheint nur bei aktiver Erweiterung.
  {
    id: 'frontmatterTimestamps',
    titleKey: 'settings.frontmatterTimestamps.title',
    render: renderFrontmatterTimestampsSection,
    apply: applyFrontmatterTimestampsSection,
    dirty: dirtyFrontmatterTimestampsSection,
  },
  // 4T-0555 (Epic 3E-0100): Bereichs-Default der Dokument-Historie als
  // eigene Sektion der Gruppe „Aktueller Bereich" (PO-Entscheidung E3:
  // hybride Bereiche aufteilen). Teilt draft.history mit „Verhalten";
  // persistiert wird über dessen apply-Hook (applyHistorySettings), ein
  // eigener apply würde doppelt schreiben.
  {
    id: 'historyArea',
    titleKey: 'settings.history.group',
    group: 'area',
    render: renderHistoryAreaSection,
    dirty: dirtyHistoryAreaSection,
  },
  // 4T-0304 (Epic 3E-0054): Export-Einstellungen (PDF: Seitenformat,
  // Ausrichtung, Raender). Position direkt hinter "Verhalten": beide
  // konfigurieren generelles App-/Dokument-Verhalten, waehrend die
  // spezielleren Bereiche (Task-Status, Tastenkuerzel) und der
  // Erweiterungs-Block dahinter zusammenbleiben. Der Bereich ist offen
  // fuer spaetere Export-Einstellungen (z.B. Portable-Export-Optionen).
  {
    id: 'export',
    titleKey: 'settings.export',
    render: renderExportSection,
    apply: applyExportSection,
    dirty: dirtyExportSection,
  },
  // 4T-0428 (Epic 3E-0080): Vorlagen (globaler Ordner und Regeln, Bereichs-
  // Übersteuerung). Erweiterungs-eigener Bereich der templates-Erweiterung
  // (settingsSections-Eintrag in src/shared/extensions.js, Muster taskStates):
  // erscheint nur bei aktiver Erweiterung.
  {
    id: 'templates',
    titleKey: 'settings.templates.title',
    render: renderTemplatesSection,
    validate: validateTemplatesSection,
    apply: applyTemplatesSection,
    dirty: dirtyTemplatesSection,
  },
  // 4T-0555 (Epic 3E-0100): Bereichs-Konfiguration der Vorlagen als eigene
  // Sektion der Gruppe „Aktueller Bereich" (PO-Entscheidung E3). Teilt
  // draft.templates mit „Vorlagen"; persistiert wird über dessen
  // apply-Hook (applyTemplatesSection, dort hasArea-gesichert).
  {
    id: 'templatesArea',
    titleKey: 'settings.templates.title',
    group: 'area',
    render: renderTemplatesAreaSection,
    validate: validateTemplatesAreaSection,
    dirty: dirtyTemplatesAreaSection,
  },
  // 4T-0436 (Epic 3E-0081): Journale (Regale und Journal-Definitionen der
  // Bereichsdatei). Erweiterungs-eigener Bereich der journals-Erweiterung
  // (settingsSections-Eintrag in src/shared/extensions.js).
  {
    id: 'journals',
    titleKey: 'settings.journals.title',
    group: 'area',
    render: renderJournalsSection,
    validate: validateJournalsSection,
    apply: applyJournalsSection,
    dirty: dirtyJournalsSection,
  },
  // 4T-0544 (Epic 3E-0097): Kalender-Systeme (calendarSystems-Sektion der
  // Bereichsdatei: Blöcke mit parallelen Kalender-Definitionen). Erweiterungs-
  // eigener Bereich der custom-calendars-Erweiterung (settingsSections-
  // Eintrag in src/shared/extensions.js, Registrierung in 4T-0546).
  {
    id: 'calendarSystems',
    titleKey: 'settings.calendar.title',
    group: 'area',
    render: renderCalendarSection,
    validate: validateCalendarSection,
    apply: applyCalendarSection,
    dirty: dirtyCalendarSection,
  },
  // 4T-0450 (Epic 3E-0083): Eigenschafts-Profile (propertyProfiles-Sektion
  // der Bereichsdatei: Profil-Ordner, Zuordnungs-Feldname, Standard-Profil,
  // Profil-Liste). Erweiterungs-eigener Bereich der property-profiles-
  // Erweiterung (settingsSections-Eintrag in src/shared/extensions.js).
  {
    id: 'propertyProfiles',
    titleKey: 'settings.profiles.title',
    group: 'area',
    render: renderProfilesSection,
    apply: applyProfilesSection,
    dirty: dirtyProfilesSection,
  },
  {
    id: 'taskStates',
    titleKey: 'settings.taskStates.title',
    render: renderTaskStatesSection,
    validate: validateTaskStatesSection,
    apply: applyTaskStatesSection,
    dirty: dirtyTaskStatesSection,
  },
  // 4T-0498 (Epic 3E-0090): Aufgaben (Global Filter, Automatik-Schalter,
  // Wiederholungs-Einfüge-Position). Erweiterungs-eigener Bereich der
  // tasks-Erweiterung (settingsSections-Eintrag in src/shared/extensions.js):
  // erscheint nur bei aktiver Erweiterung (Muster taskStates/templates).
  {
    id: 'tasks',
    titleKey: 'settings.tasks.title',
    render: renderTasksSection,
    apply: applyTasksSection,
    dirty: dirtyTasksSection,
  },
  // 4T-0528 (Epic 3E-0095): Erinnerungen (Default-Uhrzeit, Snooze-Optionen,
  // System-Notification). Erweiterungs-eigener Bereich der reminders-
  // Erweiterung (settingsSections-Eintrag in src/shared/extensions.js):
  // erscheint nur bei aktiver Erweiterung (Muster tasks/templates).
  {
    id: 'reminders',
    titleKey: 'settings.reminders.title',
    render: renderRemindersSection,
    apply: applyRemindersSection,
    dirty: dirtyRemindersSection,
  },
  // 4T-0471 (Epic 3E-0087): Ueberschriften-Nummerierung (Schalter plus
  // Start-Ebene). Erweiterungs-eigener Bereich der heading-numbering-
  // Erweiterung (settingsSections-Eintrag in src/shared/extensions.js):
  // erscheint nur bei aktiver Erweiterung (Muster taskStates/reminders).
  {
    id: 'headingNumbering',
    titleKey: 'settings.headingNumbering.title',
    render: renderHeadingNumberingSection,
    apply: applyHeadingNumberingSection,
    dirty: dirtyHeadingNumberingSection,
  },
  {
    id: 'hotkeys',
    titleKey: 'settings.hotkeys.title',
    render: renderHotkeysSection,
    validate: validateHotkeysSection,
    apply: applyHotkeysSection,
    dirty: dirtyHotkeysSection,
  },
  // 4T-0295 (Epic 3E-0052): Schalter der internen Erweiterungen.
  {
    id: 'extensions',
    titleKey: 'settings.extensions.title',
    render: renderExtensionsSection,
    apply: applyExtensionsSection,
    dirty: dirtyExtensionsSection,
  },
  // 4T-0300 (Epic 3E-0053): Verwaltung der EXTERNEN Erweiterungen. Bewusst
  // ohne apply-Hook: Aktivieren/Deaktivieren wirken wegen des Warn-Dialogs
  // sofort und sind nicht Teil der Entwurf-/Anwenden-Logik (der Intro-Text
  // macht das sichtbar). Deshalb auch ohne dirty-Hook.
  {
    id: 'extensionsExternal',
    titleKey: 'settings.extensionsExternal.title',
    render: renderExternalExtensionsSection,
  },
];

// Dynamische Bereiche (Andockpunkt für 3E-0050 und 3E-0052/3E-0053):
// erscheinen nach den festen Bereichen, in Registrierungs-Reihenfolge.
const dynamicSections = [];

export function registerSettingsSection(def) {
  if (!def || typeof def.id !== 'string' || def.id === '') return;
  if (typeof def.render !== 'function' || typeof def.titleKey !== 'string') return;
  if (FIXED_SECTIONS.some((s) => s.id === def.id)) return;
  // Re-Registrierung derselben ID ersetzt den Eintrag (idempotent, z.B.
  // beim Neuladen einer Erweiterung), statt Duplikate zu stapeln.
  const existing = dynamicSections.findIndex((s) => s.id === def.id);
  if (existing >= 0) dynamicSections[existing] = def;
  else dynamicSections.push(def);
}

// 4T-0299 (Epic 3E-0053): Abmeldung fuer Bereiche externer Erweiterungen
// (Rollback beim Deaktivieren). Die Bereichsnavigation zieht ueber den
// scg:extensions-changed-Listener nach; persistierte Werte des Bereichs
// bleiben unangetastet.
export function unregisterSettingsSection(id) {
  const idx = dynamicSections.findIndex((s) => s.id === id);
  if (idx >= 0) dynamicSections.splice(idx, 1);
  return idx >= 0;
}

export function settingsSections() {
  // 4T-0295: Bereiche effektiv deaktivierter Erweiterungen erscheinen
  // nicht (die persistierten Werte des Bereichs bleiben erhalten).
  const disabledSections = disabledSettingsSectionIdSet(getDisabledExtensionIds());
  return [...FIXED_SECTIONS, ...dynamicSections].filter((s) => !disabledSections.has(s.id));
}

function sectionById(id) {
  return settingsSections().find((s) => s.id === id) || null;
}

// --- Speicher-Status (4T-0554, Epic 3E-0100) -----------------------------------
// Bereichsübergreifende Änderungs-Erkennung für die Schaltflächen-Leiste.
// Jeder dirty-Hook spiegelt exakt die Änderungs-Prüfung seines apply-Hooks
// (dort dokumentiert): true genau dann, wenn ein Anwenden mindestens einen
// Wert persistieren würde. Vergleichs-Grundlage sind die vorhandenen
// pro-Bereich-Snapshots bzw. — für Bereiche ohne Snapshot-Paar — derselbe
// Laufzeit-Zustand, gegen den auch der apply-Hook vergleicht (Live-Getter
// wie isFrontmatterDisplayEnabled; nach Anwenden ist der Laufzeit-Zustand
// der neue Referenzstand, die Erkennung setzt sich damit selbst zurück).

function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Spiegelt applyAppearanceSection: bereinigte Darstellungs-Werte gegen den
// Snapshot, die drei Schalter gegen ihren Laufzeit-Zustand.
function dirtyAppearanceSection(draft) {
  if (draft.appearance && !jsonEqual(appearanceDraftValues(draft), draft.appearanceSnapshot)) {
    return true;
  }
  if ((draft.showFrontmatter !== false) !== isFrontmatterDisplayEnabled()) return true;
  if ((draft.frontmatterExpanded === true) !== isFrontmatterExpanded()) return true;
  if (draft.editorViewDefaults && !jsonEqual(draft.editorViewDefaults, getEditorViewDefaults())) {
    return true;
  }
  return (draft.notesPreviewByDefault !== false) !== isNotesPreviewByDefault();
}

// Spiegelt applyColorSchemesSection (JSON-Diff gegen den Snapshot).
function dirtyColorSchemesSection(draft) {
  if (!draft.colorSchemes) return false;
  return !jsonEqual(draft.colorSchemes, draft.colorSchemesSnapshot);
}

// Spiegelt den app-weiten Teil von applyHistorySettings (Feld-Diffs gegen
// den Snapshot; die Minuten-Werte in der geklemmten Persistenz-Form). Der
// Bereichs-Default gehört zur Sektion historyArea (4T-0555).
function dirtyHistorySettings(draft) {
  if (!draft.history) return false;
  const snap = draft.historySnapshot || {};
  const next = draft.history;
  return (
    next.enabled !== snap.enabled ||
    clampHistoryMinutes(next.maxMinutes, HISTORY_DEFAULTS.maxMinutes) !== snap.maxMinutes ||
    clampHistoryMinutes(next.inactivityMinutes, HISTORY_DEFAULTS.inactivityMinutes) !==
      snap.inactivityMinutes
  );
}

// Spiegelt den Bereichs-Teil von applyHistorySettings (4T-0555).
function dirtyHistoryAreaSection(draft) {
  if (!draft.history) return false;
  const snap = draft.historySnapshot || {};
  return !!(draft.history.hasArea && draft.history.areaValue !== snap.areaValue);
}

// Spiegelt applyRenameLinkSettings (zwei Schalter gegen den Snapshot).
function dirtyRenameLinkSettings(draft) {
  if (!draft.renameLinks) return false;
  const snap = draft.renameLinksSnapshot || {};
  return (
    draft.renameLinks.updateLinks !== snap.updateLinks || draft.renameLinks.preview !== snap.preview
  );
}

// Spiegelt applyKeepDraftsSetting (Skalar gegen den Snapshot).
function dirtyKeepDraftsSetting(draft) {
  if (typeof draft.keepUnsavedDrafts !== 'boolean') return false;
  return draft.keepUnsavedDrafts !== draft.keepUnsavedDraftsSnapshot;
}

// Spiegelt applyPasteLinkSetting (Skalar gegen den Snapshot).
function dirtyPasteLinkSetting(draft) {
  if (typeof draft.pasteUrlAsLink !== 'boolean') return false;
  return draft.pasteUrlAsLink !== draft.pasteUrlAsLinkSnapshot;
}

// Spiegelt applyBehaviorSection (View-Mode gegen den Laufzeit-Zustand plus
// die vier Unter-Blöcke des Bereichs).
function dirtyBehaviorSection(draft) {
  const mode = draft.defaultViewMode;
  if (['rendered', 'split', 'source', 'live'].includes(mode) && mode !== state.defaultViewMode) {
    return true;
  }
  return (
    dirtyHistorySettings(draft) ||
    dirtyRenameLinkSettings(draft) ||
    dirtyKeepDraftsSetting(draft) ||
    dirtyPasteLinkSetting(draft) ||
    dirtyTabIndentSetting(draft) ||
    (draft.scriptsRun === true) !== isPerspectiveScriptsEnabled()
  );
}

// Spiegelt applyExportSection (normalisierte Werte gegen den Snapshot).
function dirtyExportSection(draft) {
  if (!draft.exportPdf) return false;
  return !jsonEqual(normalizePdfExportSettings(draft.exportPdf), draft.exportPdfSnapshot);
}

// Spiegelt den globalen Teil von applyTemplatesSection (normalisierte
// Persistenz-Form gegen den Snapshot). Der Bereichs-Teil gehört zur
// Sektion templatesArea (4T-0555).
function dirtyTemplatesSection(draft) {
  const values = draft.templates;
  if (!values) return false;
  const snap = draft.templatesSnapshot || {};
  return !jsonEqual(normalizedTemplatesPart(values.global), snap.global);
}

// Spiegelt den Bereichs-Teil von applyTemplatesSection (4T-0555).
function dirtyTemplatesAreaSection(draft) {
  const values = draft.templates;
  if (!values || !values.hasArea) return false;
  const snap = draft.templatesSnapshot || {};
  const areaOut = values.areaEnabled ? normalizedTemplatesPart(values.area) : null;
  return !jsonEqual(areaOut, snap.area);
}

// Spiegelt applyJournalsSection (Persistenz-Form gegen den Snapshot; die
// id-Vergabe neuer Journale entfällt hier — ein neues Journal ist so oder
// so eine Änderung, die Prüfung bleibt frei von Draft-Mutationen).
function dirtyJournalsSection(draft) {
  const values = draft.journals;
  if (!values || !values.hasArea) return false;
  return !jsonEqual(journalsPersistForm(values), draft.journalsSnapshot);
}

// Spiegelt applyCalendarSection (Persistenz-Form gegen den Snapshot;
// id-Vergabe entfällt wie bei den Journalen).
function dirtyCalendarSection(draft) {
  const values = draft.calendar;
  if (!values || !values.hasArea) return false;
  return !jsonEqual(calendarConfigPersistForm(values), draft.calendarSnapshot);
}

// Spiegelt applyProfilesSection (normalisierte Konfiguration gegen den
// Snapshot).
function dirtyProfilesSection(draft) {
  const values = draft.profiles;
  if (!values || !values.hasArea) return false;
  const out = normalizeProfilesConfig({
    folder: values.folder,
    assignField: values.assignField,
    defaultProfile: values.defaultProfile,
  });
  return !jsonEqual(out, draft.profilesSnapshot);
}

// Spiegelt applyTaskStatesSection (aufgelöste Entwurfs-Form in der
// Persistenz-Form gegen das aktuell wirksame Set).
function dirtyTaskStatesSection(draft) {
  if (!Array.isArray(draft.taskStates)) return false;
  return !jsonEqual(
    toStoredTaskStates(resolvedTaskStatesFromDraft(draft)),
    toStoredTaskStates(taskStatesResolved),
  );
}

// Spiegelt applyTasksSection (normalisierte Konfiguration gegen die
// wirksame tasksConfig).
function dirtyTasksSection(draft) {
  if (!draft.tasks) return false;
  return !jsonEqual(normalizeTasksConfig(draft.tasks), tasksConfig);
}

// Spiegelt applyRemindersSection (normalisierte Konfiguration gegen die
// wirksame Erinnerungs-Konfiguration).
function dirtyRemindersSection(draft) {
  if (!draft.reminders) return false;
  return !jsonEqual(normalizeRemindersConfig(draft.reminders), currentRemindersConfig());
}

// Spiegelt applyHeadingNumberingSection (zwei Werte gegen den Laufzeit-
// Zustand).
function dirtyHeadingNumberingSection(draft) {
  if (!draft.headingNumbering) return false;
  const enabled = draft.headingNumbering.enabled === true;
  const startLevel = draft.headingNumbering.startLevel === 2 ? 2 : 1;
  return enabled !== isHeadingNumberingEnabled() || startLevel !== headingNumberingStartLevel();
}

// Spiegelt applyHotkeysSection (Overrides gegen den wirksamen Stand).
function dirtyHotkeysSection(draft) {
  if (!draft.hotkeys) return false;
  return !jsonEqual(hotkeysDraftToOverrides(draft.hotkeys), state.hotkeyOverrides || {});
}

// Spiegelt applyExtensionsSection (sortierte id-Listen gegen den
// wirksamen Stand).
function dirtyExtensionsSection(draft) {
  if (!Array.isArray(draft.extensionsDisabled)) return false;
  return !jsonEqual([...draft.extensionsDisabled].sort(), [...getDisabledExtensionIds()].sort());
}

// Seitenweiter Speicher-Status: dirty, sobald irgendein Bereich eine
// ungesicherte Änderung meldet. Exportiert für die Unit-Tests.
export function isSettingsPageDirty() {
  const draft = pageState.draft;
  if (!draft) return false;
  return settingsSections().some((s) => typeof s.dirty === 'function' && !!s.dirty(draft));
}

// --- Apply/OK/Abbrechen (seitenweit, Semantik des Modals) ----------------------
// Erst ALLE Bereiche validieren (Fehler markieren die Navigation und
// blockieren komplett), dann alle apply-Hooks in Registry-Reihenfolge.
export async function applySettingsPage() {
  if (!pageState.draft) return false;
  cancelHotkeyCapture();
  pageState.errors = new Map();
  for (const section of settingsSections()) {
    if (typeof section.validate !== 'function') continue;
    const error = section.validate(pageState.draft);
    if (error) pageState.errors.set(section.id, error);
  }
  refreshSettingsNav();
  renderActiveSectionError();
  if (pageState.errors.size > 0) return false;
  for (const section of settingsSections()) {
    if (typeof section.apply === 'function') await section.apply(pageState.draft);
  }
  // 4T-0554: Die apply-Hooks haben Snapshots bzw. Laufzeit-Zustand auf den
  // neuen Referenzstand gezogen — Schaltflächen zurück auf „nicht dirty".
  refreshSettingsButtons();
  return true;
}

export async function okSettingsPage() {
  if ((await applySettingsPage()) === false) return;
  closeSettingsTab();
}

export function cancelSettingsPage() {
  // Revert der Live-Vorschau übernimmt der onClose-Haken beim Tab-Schluss.
  closeSettingsTab();
}

// --- Bereich Darstellung (4T-0018) ---------------------------------------------
// Vier Font-Controls mit Live-Vorschau über CSS-Variablen; Datalists
// liefern kuratierte Vorschläge, freie Eingabe ist erlaubt. Persistiert
// wird erst bei Anwenden/OK.
const MONO_FONT_SUGGESTIONS = [
  'Consolas',
  'Cascadia Code',
  'Cascadia Mono',
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'Courier New',
];
const PROPORTIONAL_FONT_SUGGESTIONS = [
  'Segoe UI',
  'Calibri',
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Verdana',
];

function buildDatalist(id, options) {
  const datalist = document.createElement('datalist');
  datalist.id = id;
  for (const value of options) {
    const option = document.createElement('option');
    option.value = value;
    datalist.appendChild(option);
  }
  return datalist;
}

function buildSettingsRow(labelKey, inputEl) {
  const row = document.createElement('div');
  row.className = 'settings-row';
  const label = document.createElement('label');
  label.htmlFor = inputEl.id;
  label.textContent = t(labelKey);
  row.append(label, inputEl);
  return row;
}

function buildFontInput(id, listId, draft, key) {
  const input = document.createElement('input');
  input.id = id;
  input.className = 'settings-input';
  input.type = 'text';
  input.setAttribute('list', listId);
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.value = (draft.appearance && draft.appearance[key]) || APPEARANCE_DEFAULTS[key];
  input.addEventListener('input', () => {
    if (!draft.appearance) return;
    draft.appearance[key] = input.value;
    applyAppearanceVars(appearanceDraftValues(draft));
  });
  // Auswahl-Trick fuer die <input list>-Felder: Chromium filtert die
  // Datalist-Optionen auf Substring-Matches des aktuellen Werts — bei
  // gefuelltem Feld bleibt damit nur ein Eintrag sichtbar. Loesung: Beim
  // ersten Maus-Klick auf ein fokussiertes-noch-nicht-Feld wird der Wert
  // zwischengespeichert und visuell auf leer gesetzt; das Dropdown zeigt
  // anschliessend alle Optionen. Geht der Fokus ohne Eingabe verloren,
  // wird der gemerkte Wert wiederhergestellt. Programmatisches value-
  // Setzen loest kein input-Event aus — die Live-Vorschau bleibt auf dem
  // letzten guten Stand.
  input.addEventListener('mousedown', () => {
    if (document.activeElement !== input && input.value) {
      input.dataset.savedValue = input.value;
      input.value = '';
    }
  });
  input.addEventListener('blur', () => {
    if (!input.value && input.dataset.savedValue) {
      input.value = input.dataset.savedValue;
    }
    delete input.dataset.savedValue;
  });
  return input;
}

// 4T-0383: opts.min/opts.max erlauben abweichende Bereiche (Inhalts-Breite
// 20 bis 100); ohne opts bleibt der Schriftgroessen-Bereich der Default.
function buildSizeInput(id, draft, key, opts) {
  const input = document.createElement('input');
  input.id = id;
  input.className = 'settings-input settings-input-size';
  input.type = 'number';
  input.min = String(opts && opts.min != null ? opts.min : APPEARANCE_SIZE_MIN);
  input.max = String(opts && opts.max != null ? opts.max : APPEARANCE_SIZE_MAX);
  input.step = '1';
  input.value = String((draft.appearance && draft.appearance[key]) || APPEARANCE_DEFAULTS[key]);
  input.addEventListener('input', () => {
    if (!draft.appearance) return;
    draft.appearance[key] = input.value;
    applyAppearanceVars(appearanceDraftValues(draft));
  });
  return input;
}

function renderAppearanceSection(container, draft) {
  container.appendChild(
    buildSettingsRow(
      'settings.editorFont',
      buildFontInput('settings-editor-font', 'settings-mono-fonts', draft, 'editorFont'),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.editorSize',
      buildSizeInput('settings-editor-size', draft, 'editorSize'),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.renderFont',
      buildFontInput('settings-render-font', 'settings-proportional-fonts', draft, 'renderFont'),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.renderSize',
      buildSizeInput('settings-render-size', draft, 'renderSize'),
    ),
  );
  // 4T-0383 (Epic 3E-0072): Inhalts-Breite der gerenderten Ansicht in
  // Prozent (20 bis 100). Live-Vorschau wie bei den Schriftgroessen ueber
  // die CSS-Variable; Werte ausserhalb des Bereichs klemmt
  // appearanceDraftValues auf die Grenzen.
  container.appendChild(
    buildSettingsRow(
      'settings.contentWidth',
      buildSizeInput('settings-content-width', draft, 'contentWidth', {
        min: CONTENT_WIDTH_MIN,
        max: CONTENT_WIDTH_MAX,
      }),
    ),
  );
  container.appendChild(buildDatalist('settings-mono-fonts', MONO_FONT_SUGGESTIONS));
  container.appendChild(
    buildDatalist('settings-proportional-fonts', PROPORTIONAL_FONT_SUGGESTIONS),
  );
  // 4T-0575 (Epic 3E-0106): abgerundete Ecken der Dokument-Reiter und der
  // Tab-Gruppen-Koepfe. Anders als die Schalter darunter mit Live-Vorschau
  // (Muster der Schrift- und Breiten-Felder): die Wirkung ist reine
  // CSS-Geometrie, ein Re-Render der Panes faellt nicht an.
  const roundedTabs = document.createElement('input');
  roundedTabs.id = 'settings-rounded-tabs';
  roundedTabs.type = 'checkbox';
  roundedTabs.checked = draft.appearance ? draft.appearance.roundedTabs === true : false;
  roundedTabs.addEventListener('change', () => {
    if (!draft.appearance) return;
    draft.appearance.roundedTabs = roundedTabs.checked;
    applyAppearanceVars(appearanceDraftValues(draft));
  });
  container.appendChild(buildSettingsRow('settings.roundedTabs', roundedTabs));
  // 4T-0577 (Epic 3E-0106): Hervorhebung der Cursor-Zeile im Edit-Modus,
  // ebenfalls mit Live-Vorschau (reine CSS-Wirkung).
  const activeLine = document.createElement('input');
  activeLine.id = 'settings-highlight-active-line';
  activeLine.type = 'checkbox';
  activeLine.checked = draft.appearance ? draft.appearance.highlightActiveLine !== false : true;
  activeLine.addEventListener('change', () => {
    if (!draft.appearance) return;
    draft.appearance.highlightActiveLine = activeLine.checked;
    applyAppearanceVars(appearanceDraftValues(draft));
  });
  container.appendChild(buildSettingsRow('settings.highlightActiveLine', activeLine));
  // 4T-0284: Frontmatter-Anzeige im Gerenderten (Render-Pane und
  // Live-Modus). Checkbox folgt der Entwurfs-Semantik: Wirkung erst bei
  // Anwenden/OK (keine Live-Vorschau — ein Re-Render aller Panes als
  // Vorschau waere teurer und inkonsistent zum Broadcast-Pfad).
  const showFm = document.createElement('input');
  showFm.id = 'settings-show-frontmatter';
  showFm.type = 'checkbox';
  showFm.checked = draft.showFrontmatter !== false;
  showFm.addEventListener('change', () => {
    draft.showFrontmatter = showFm.checked;
  });
  container.appendChild(buildSettingsRow('settings.showFrontmatter', showFm));
  // 4T-0312: dauerhaft ausgeklappte Darstellung, nur wirksam bei aktiver
  // Frontmatter-Anzeige (rein CSS-getragene Root-Klasse).
  const showFmExpanded = document.createElement('input');
  showFmExpanded.id = 'settings-frontmatter-expanded';
  showFmExpanded.type = 'checkbox';
  showFmExpanded.checked = draft.frontmatterExpanded === true;
  showFmExpanded.addEventListener('change', () => {
    draft.frontmatterExpanded = showFmExpanded.checked;
  });
  container.appendChild(buildSettingsRow('settings.showFrontmatterExpanded', showFmExpanded));
  // 4T-0359 (Epic 3E-0066): Vorschau des Notizen-Panels standardmaessig aktiv.
  const notesPreview = document.createElement('input');
  notesPreview.id = 'settings-notes-preview-default';
  notesPreview.type = 'checkbox';
  notesPreview.checked = draft.notesPreviewByDefault !== false;
  notesPreview.addEventListener('change', () => {
    draft.notesPreviewByDefault = notesPreview.checked;
  });
  container.appendChild(buildSettingsRow('settings.notesPreviewByDefault', notesPreview));
  // 4T-0572 (Epic 3E-0105): globale Voreinstellung der drei Editor-Ansicht-
  // Schalter fuer Dokumente ohne eigene Frontmatter-Angabe (Reihenfolge wie
  // Statusbar/Ansichtsmenue: Gliederung, Zeilennummern, Zeilenumbruch).
  // Wirkung erst bei Anwenden/OK; bereits offene Tabs behalten ihren Stand.
  const editorViewRows = [
    ['showFoldGutter', 'settings-editor-default-fold-gutter', 'settings.editorDefaultFoldGutter'],
    [
      'showLineNumbers',
      'settings-editor-default-line-numbers',
      'settings.editorDefaultLineNumbers',
    ],
    ['wrapLines', 'settings-editor-default-word-wrap', 'settings.editorDefaultWordWrap'],
  ];
  for (const [field, domId, labelKey] of editorViewRows) {
    const box = document.createElement('input');
    box.id = domId;
    box.type = 'checkbox';
    box.checked = draft.editorViewDefaults ? draft.editorViewDefaults[field] === true : false;
    box.addEventListener('change', () => {
      if (draft.editorViewDefaults) draft.editorViewDefaults[field] = box.checked;
    });
    container.appendChild(buildSettingsRow(labelKey, box));
  }
}

async function applyAppearanceSection(draft) {
  // Die Font-/Breiten-Werte hängen am asynchronen Store-Laden; die drei
  // Schalter darunter sind davon unabhängig und laufen immer (4T-0554:
  // ein Anwenden vor Abschluss des Ladens verlor Schalter-Änderungen
  // sonst still — der frühere Komplett-Abbruch bei draft.appearance null
  // übersprang auch die Schalter-Blöcke).
  if (draft.appearance) {
    const values = appearanceDraftValues(draft);
    // Sechs separate setSetting-Aufrufe; der Main broadcastet bei jedem
    // appearance.*-Key an alle Fenster. Endzustand bleibt konsistent.
    await persistSetting('appearance.editorFont', values.editorFont);
    await persistSetting('appearance.editorSize', values.editorSize);
    await persistSetting('appearance.renderFont', values.renderFont);
    await persistSetting('appearance.renderSize', values.renderSize);
    await persistSetting('appearance.contentWidth', values.contentWidth);
    // 4T-0575 (Epic 3E-0106): Ecken-Form der Reiter und Gruppen-Koepfe.
    await persistSetting('appearance.roundedTabs', values.roundedTabs);
    // 4T-0577 (Epic 3E-0106): Hervorhebung der Cursor-Zeile.
    await persistSetting('appearance.highlightActiveLine', values.highlightActiveLine);
    applyAppearanceVars(values);
    // Snapshot auf den neuen Apply-Stand setzen, damit ein spaeteres
    // Abbrechen nur Aenderungen seit diesem Apply verwirft.
    draft.appearance = { ...values };
    draft.appearanceSnapshot = { ...values };
  }
  // 4T-0284: Frontmatter-Anzeige — lokal sofort anwenden (Pipeline,
  // Cache-Invalidierung, Re-Render via Event) und persistieren; der
  // settings:set-Broadcast erreicht zusaetzlich alle Fenster inkl.
  // diesem (idempotent, Muster taskStates).
  const showFrontmatter = draft.showFrontmatter !== false;
  if (showFrontmatter !== isFrontmatterDisplayEnabled()) {
    applyFrontmatterDisplay(showFrontmatter);
    await persistSetting('render.showFrontmatter', showFrontmatter);
  }
  // 4T-0312: ausgeklappte Darstellung — lokal anwenden (Root-Klasse) und
  // persistieren; der settings:set-Broadcast erreicht alle Fenster.
  const frontmatterExpanded = draft.frontmatterExpanded === true;
  if (frontmatterExpanded !== isFrontmatterExpanded()) {
    applyFrontmatterExpanded(frontmatterExpanded);
    await persistSetting('render.frontmatterExpanded', frontmatterExpanded);
  }
  // 4T-0359: Vorschau-Default des Notizen-Panels — lokal anwenden (offene Panels
  // ziehen nach) und persistieren.
  const notesPreviewByDefault = draft.notesPreviewByDefault !== false;
  if (notesPreviewByDefault !== isNotesPreviewByDefault()) {
    setNotesPreviewByDefault(notesPreviewByDefault);
    await persistSetting('notes.previewByDefault', notesPreviewByDefault);
  }
  // 4T-0572 (Epic 3E-0105): globale Voreinstellung der Editor-Ansicht-
  // Schalter — lokal anwenden (wirkt beim naechsten Tab-Erstellen) und nur
  // geaenderte Werte persistieren. Andere offene Fenster lesen die Werte
  // beim eigenen Start; bereits offene Tabs bleiben unberuehrt.
  if (draft.editorViewDefaults) {
    const liveDefaults = getEditorViewDefaults();
    const storeKeys = {
      wrapLines: 'editor.defaultWrapLines',
      showLineNumbers: 'editor.defaultLineNumbers',
      showFoldGutter: 'editor.defaultFoldGutter',
    };
    for (const [field, storeKey] of Object.entries(storeKeys)) {
      const value = draft.editorViewDefaults[field] === true;
      if (value !== liveDefaults[field]) {
        setEditorViewDefaults({ [field]: value });
        await persistSetting(storeKey, value);
      }
    }
  }
}

// --- Bereich Farbschemas (4T-0466, Epic 3E-0086) -------------------------------
// Modus-Zuordnung (aktives Schema je Hell/Dunkel), Schema-Verwaltung und ein
// gruppierter Slot-Editor mit nativen Farbwählern. Live-Vorschau über
// setColorSchemeState (wendet das aktive Schema des aktuellen Anzeige-Modus
// sofort an); persistiert wird erst bei Anwenden/OK. Der Editor bearbeitet das
// aktive Schema des aktuellen Anzeige-Modus (data-theme): Was man sieht,
// bearbeitet man; das dunkle Schema bearbeitet man durch Umschalten auf Dunkel.

// Fortlaufender Zähler gegen ID-Kollisionen bei schnellen Klicks.
let colorSchemeIdCounter = 0;
function nextColorSchemeId() {
  colorSchemeIdCounter += 1;
  return `custom-${Date.now()}-${colorSchemeIdCounter}`;
}

function currentThemeMode() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function colorSchemeLabel(scheme) {
  if (isBuiltinId(scheme.id)) return t(scheme.nameKey);
  return scheme.name || t('settings.colorSchemes.unnamed');
}

// Live-Vorschau: Draft-Zustand in das Renderer-Modul spiegeln und anwenden.
function previewColorSchemes(draft) {
  setColorSchemeState(draft.colorSchemes);
}

// Auswahl-Liste des aktiven Schemas für einen Modus (nur Schemas dieser Basis).
function buildColorSchemeSelect(id, draft, mode) {
  const select = document.createElement('select');
  select.id = id;
  select.className = 'settings-input';
  for (const scheme of allSchemes(draft.colorSchemes)) {
    if (scheme.base !== mode) continue;
    const opt = document.createElement('option');
    opt.value = scheme.id;
    opt.textContent = colorSchemeLabel(scheme);
    select.appendChild(opt);
  }
  select.value = mode === 'dark' ? draft.colorSchemes.activeDark : draft.colorSchemes.activeLight;
  select.addEventListener('change', () => {
    draft.colorSchemes = setActiveScheme(draft.colorSchemes, mode, select.value);
    previewColorSchemes(draft);
    renderActiveSection();
  });
  return select;
}

// Slot-Editor: Slots gruppiert mit nativem Farbwähler; für mitgelieferte
// Schemas nur-lesend (kein Wähler-Input, kein Zurücksetzen).
function renderColorSchemeEditor(container, draft, scheme) {
  const isBuiltin = isBuiltinId(scheme.id);
  const resolved = resolveSchemeColors(scheme);
  const editor = document.createElement('div');
  editor.className = 'color-scheme-editor';
  for (const group of SLOT_GROUPS) {
    const groupHead = document.createElement('div');
    groupHead.className = 'color-scheme-group-head';
    groupHead.textContent = t(group.nameKey);
    editor.appendChild(groupHead);
    for (const slot of COLOR_SLOTS) {
      if (slot.group !== group.id) continue;
      const row = document.createElement('div');
      row.className = 'settings-row color-scheme-slot-row';
      const color = document.createElement('input');
      color.type = 'color';
      color.className = 'color-scheme-slot-color';
      color.id = `settings-color-slot-${slot.id}`;
      color.value = resolved[slot.id];
      const label = document.createElement('label');
      label.htmlFor = color.id;
      label.textContent = t(slot.nameKey);
      row.append(label, color);
      if (isBuiltin) {
        color.disabled = true;
      } else {
        color.addEventListener('input', () => {
          draft.colorSchemes = setSlotColor(draft.colorSchemes, scheme.id, slot.id, color.value);
          previewColorSchemes(draft);
        });
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'btn color-scheme-slot-reset';
        reset.textContent = '↺';
        reset.title = t('settings.colorSchemes.resetSlot');
        reset.addEventListener('click', () => {
          draft.colorSchemes = resetSlotColor(draft.colorSchemes, scheme.id, slot.id);
          previewColorSchemes(draft);
          renderActiveSection();
        });
        row.appendChild(reset);
      }
      editor.appendChild(row);
    }
  }
  container.appendChild(editor);
}

function renderColorSchemesSection(container, draft) {
  const cs = draft.colorSchemes;
  const mode = currentThemeMode();

  // 1. Modus-Zuordnung: aktives Schema je Hell/Dunkel.
  container.appendChild(
    buildSettingsRow(
      'settings.colorSchemes.schemeForLight',
      buildColorSchemeSelect('settings-color-scheme-light', draft, 'light'),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.colorSchemes.schemeForDark',
      buildColorSchemeSelect('settings-color-scheme-dark', draft, 'dark'),
    ),
  );

  // 2. Verwaltung des aktiven Schemas des aktuellen Anzeige-Modus.
  const activeId = mode === 'dark' ? cs.activeDark : cs.activeLight;
  const active = schemeById(cs, activeId) || BUILTIN_SCHEMES[0];
  const isBuiltin = isBuiltinId(active.id);

  const manage = document.createElement('div');
  manage.className = 'color-scheme-manage';

  const info = document.createElement('div');
  info.className = 'color-scheme-editing-info';
  info.textContent = t('settings.colorSchemes.editingFor')
    .replace(
      '{mode}',
      t(mode === 'dark' ? 'settings.colorSchemes.modeDark' : 'settings.colorSchemes.modeLight'),
    )
    .replace('{name}', colorSchemeLabel(active));
  manage.appendChild(info);

  // 4T-0466 (Epic 3E-0086): Modus-Kopplung direkt im Bereich erklären (der
  // Editor folgt dem Anzeige-Modus; das andere Schema über den Theme-Umschalter).
  const modeHint = document.createElement('div');
  modeHint.className = 'color-scheme-mode-hint';
  modeHint.textContent = t('settings.colorSchemes.modeHint');
  manage.appendChild(modeHint);

  if (isBuiltin) {
    const note = document.createElement('div');
    note.className = 'color-scheme-builtin-note';
    note.textContent = t('settings.colorSchemes.builtinNote');
    manage.appendChild(note);
  } else {
    const nameRow = document.createElement('div');
    nameRow.className = 'settings-row';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'settings-color-scheme-name';
    nameInput.className = 'settings-input';
    nameInput.value = active.name || '';
    nameInput.addEventListener('input', () => {
      draft.colorSchemes = renameCustomScheme(draft.colorSchemes, active.id, nameInput.value);
    });
    nameInput.addEventListener('change', () => renderActiveSection());
    const nameLabel = document.createElement('label');
    nameLabel.htmlFor = nameInput.id;
    nameLabel.textContent = t('settings.colorSchemes.name');
    nameRow.append(nameLabel, nameInput);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn';
    del.id = 'settings-color-scheme-delete';
    del.textContent = t('settings.colorSchemes.delete');
    del.addEventListener('click', () => {
      draft.colorSchemes = deleteCustomScheme(draft.colorSchemes, active.id);
      previewColorSchemes(draft);
      renderActiveSection();
    });
    nameRow.appendChild(del);
    manage.appendChild(nameRow);
  }

  // Neu aus Vorlage (nur Schemas des aktuellen Modus als Vorlage) und Duplizieren.
  const actions = document.createElement('div');
  actions.className = 'color-scheme-actions';
  const templateSelect = document.createElement('select');
  templateSelect.id = 'settings-color-scheme-template';
  templateSelect.className = 'settings-input';
  for (const scheme of allSchemes(cs)) {
    if (scheme.base !== mode) continue;
    const opt = document.createElement('option');
    opt.value = scheme.id;
    opt.textContent = colorSchemeLabel(scheme);
    templateSelect.appendChild(opt);
  }
  templateSelect.value = active.id;
  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.className = 'btn';
  createBtn.id = 'settings-color-scheme-new';
  createBtn.textContent = t('settings.colorSchemes.newFromTemplate');
  createBtn.addEventListener('click', () => {
    const id = nextColorSchemeId();
    draft.colorSchemes = addCustomScheme(draft.colorSchemes, {
      id,
      name: t('settings.colorSchemes.newSchemeName'),
      templateId: templateSelect.value,
    });
    draft.colorSchemes = setActiveScheme(draft.colorSchemes, mode, id);
    previewColorSchemes(draft);
    renderActiveSection();
  });
  const dupBtn = document.createElement('button');
  dupBtn.type = 'button';
  dupBtn.className = 'btn';
  dupBtn.id = 'settings-color-scheme-duplicate';
  dupBtn.textContent = t('settings.colorSchemes.duplicate');
  dupBtn.addEventListener('click', () => {
    const id = nextColorSchemeId();
    const copyName = `${colorSchemeLabel(active)} ${t('settings.colorSchemes.copySuffix')}`;
    draft.colorSchemes = duplicateScheme(draft.colorSchemes, active.id, id, copyName);
    draft.colorSchemes = setActiveScheme(draft.colorSchemes, mode, id);
    previewColorSchemes(draft);
    renderActiveSection();
  });
  actions.append(templateSelect, createBtn, dupBtn);
  manage.appendChild(actions);
  container.appendChild(manage);

  // 3. Slot-Editor des aktiven Schemas.
  renderColorSchemeEditor(container, draft, active);
}

async function applyColorSchemesSection(draft) {
  if (!draft.colorSchemes) return;
  // Nur bei echter Änderung persistieren (spart Store-Schreiben und Broadcast).
  if (JSON.stringify(draft.colorSchemes) === JSON.stringify(draft.colorSchemesSnapshot)) return;
  // Ein Store-Key trägt den ganzen Zustand; der Main broadcastet an alle
  // Fenster (auch dieses), der Empfangspfad wendet idempotent an.
  await persistSetting('colorSchemes', draft.colorSchemes);
  draft.colorSchemesSnapshot = structuredClone(draft.colorSchemes);
}

// --- Bereich Verhalten (4T-0085) -------------------------------------------------
const VIEW_MODE_OPTION_KEYS = [
  ['rendered', 'settings.defaultViewMode.rendered'],
  ['split', 'settings.defaultViewMode.split'],
  ['source', 'settings.defaultViewMode.source'],
  ['live', 'settings.defaultViewMode.live'],
];

function renderBehaviorSection(container, draft) {
  const select = document.createElement('select');
  select.id = 'settings-default-view-mode';
  select.className = 'settings-input';
  for (const [value, key] of VIEW_MODE_OPTION_KEYS) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    select.appendChild(option);
  }
  select.value = draft.defaultViewMode || DEFAULT_VIEW_MODE;
  select.addEventListener('change', () => {
    draft.defaultViewMode = select.value;
  });
  container.appendChild(buildSettingsRow('settings.defaultViewMode.label', select));
  renderHistorySettings(container, draft);
  renderRenameLinkSettings(container, draft);
  renderKeepDraftsSetting(container, draft);
  renderPasteLinkSetting(container, draft);
  renderTabIndentSetting(container, draft);
  renderScriptBlocksSetting(container, draft);
}

// 4T-0656 (Epic 3E-0112): Schalter „Tabulator rückt ein" (Store-Key
// input.tabIndents, Default an). Aus lässt den Fokus weiterwandern, wie vor
// der Einstellung. In Listen und Tabellen behält die Taste in beiden
// Zuständen ihre eigene Bedeutung.
function renderTabIndentSetting(container, draft) {
  const input = document.createElement('input');
  input.id = 'settings-tab-indents';
  input.type = 'checkbox';
  input.checked = draft.tabIndents !== false;
  input.addEventListener('change', () => {
    draft.tabIndents = input.checked;
  });
  container.appendChild(buildSettingsRow('settings.tabIndents.label', input));

  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.textContent = t('settings.tabIndents.hint');
  container.appendChild(hint);
}

async function applyTabIndentSetting(draft) {
  if (typeof draft.tabIndents !== 'boolean') return;
  if (draft.tabIndents !== draft.tabIndentsSnapshot) {
    await persistSetting('input.tabIndents', draft.tabIndents);
    state.tabIndents = draft.tabIndents;
    draft.tabIndentsSnapshot = draft.tabIndents;
  }
}

function dirtyTabIndentSetting(draft) {
  if (typeof draft.tabIndents !== 'boolean') return false;
  return draft.tabIndents !== draft.tabIndentsSnapshot;
}

// --- 4T-0414 (Epic 3E-0078): Skript-Blöcke ausführen (Default aus) -----------
// Sicherheits-Schalter des Vertrauensmodells: Skripte stammen aus Dokumenten;
// der Warntext steht dauerhaft unter der Zeile (kein versteckter Tooltip).
function renderScriptBlocksSetting(container, draft) {
  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title';
  heading.textContent = t('settings.runScriptBlocks.group');
  container.appendChild(heading);

  const input = document.createElement('input');
  input.id = 'settings-run-script-blocks';
  input.type = 'checkbox';
  input.checked = draft.scriptsRun === true;
  input.addEventListener('change', () => {
    draft.scriptsRun = input.checked;
  });
  container.appendChild(buildSettingsRow('settings.runScriptBlocks.label', input));

  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.textContent = t('settings.runScriptBlocks.warn');
  container.appendChild(hint);
}

async function applyScriptBlocksSetting(draft) {
  const next = draft.scriptsRun === true;
  if (next === isPerspectiveScriptsEnabled()) return;
  applyPerspectiveScriptsEnabled(next);
  await persistSetting('scripts.run', next);
}

// --- 4T-0332 (Epic 3E-0060): Dokument-Historie im Bereich Verhalten ----------
// App-Schalter (Default aus, PO-Entscheidung), die zwei Zeitparameter der
// Paket-Bildung und — nur bei aktivem Bereich — der Bereichs-Default aus
// der Bereichsdatei Area_Settings.mdda (dreistufig: erben/an/aus).

const HISTORY_MINUTES_MIN = 1;
const HISTORY_MINUTES_MAX = 240;
const HISTORY_DEFAULTS = { maxMinutes: 5, inactivityMinutes: 2 };

function clampHistoryMinutes(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(HISTORY_MINUTES_MIN, Math.min(HISTORY_MINUTES_MAX, Math.round(n)));
}

async function readHistoryFromStore() {
  const enabled = !!(await api.getSetting('historyEnabled'));
  const maxMinutes = clampHistoryMinutes(
    await api.getSetting('historyMaxPacketMinutes'),
    HISTORY_DEFAULTS.maxMinutes,
  );
  const inactivityMinutes = clampHistoryMinutes(
    await api.getSetting('historyInactivityMinutes'),
    HISTORY_DEFAULTS.inactivityMinutes,
  );
  let areaInfo = { hasArea: false, value: null };
  try {
    areaInfo = (await api.getHistoryAreaDefault()) || areaInfo;
  } catch {
    /* ohne Bereichs-Info rendert der Bereich ohne Bereichs-Zeile */
  }
  return {
    enabled,
    maxMinutes,
    inactivityMinutes,
    hasArea: !!areaInfo.hasArea,
    areaValue: areaInfo.value === true || areaInfo.value === false ? areaInfo.value : null,
  };
}

function renderHistorySettings(container, draft) {
  const values = draft.history || {
    enabled: false,
    hasArea: false,
    areaValue: null,
    ...HISTORY_DEFAULTS,
  };
  const set = (key, value) => {
    if (!draft.history) draft.history = { ...values };
    draft.history[key] = value;
  };

  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title';
  heading.textContent = t('settings.history.group');
  container.appendChild(heading);

  const enabledInput = document.createElement('input');
  enabledInput.id = 'settings-history-enabled';
  enabledInput.type = 'checkbox';
  enabledInput.checked = values.enabled === true;
  enabledInput.addEventListener('change', () => set('enabled', enabledInput.checked));
  container.appendChild(buildSettingsRow('settings.history.enabled', enabledInput));

  const buildMinutes = (id, key, current) => {
    const input = document.createElement('input');
    input.id = id;
    input.type = 'number';
    input.className = 'settings-input';
    input.min = String(HISTORY_MINUTES_MIN);
    input.max = String(HISTORY_MINUTES_MAX);
    input.value = String(current);
    input.addEventListener('change', () => set(key, input.value));
    return input;
  };
  container.appendChild(
    buildSettingsRow(
      'settings.history.maxPacketMinutes',
      buildMinutes('settings-history-max-minutes', 'maxMinutes', values.maxMinutes),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.history.inactivityMinutes',
      buildMinutes('settings-history-inactivity', 'inactivityMinutes', values.inactivityMinutes),
    ),
  );

  // 4T-0555 (Epic 3E-0100): Der Bereichs-Default lebt als eigene Sektion
  // „Dokument-Historie" in der Navigations-Gruppe „Aktueller Bereich"
  // (renderHistoryAreaSection) — hier bleibt der app-weite Teil.
}

// --- 4T-0555 (Epic 3E-0100): Bereichs-Sektion Dokument-Historie ---------------
// Bereichs-Default (erben/an/aus) aus der Bereichsdatei; vormals ein
// hasArea-Block innerhalb des Bereichs „Verhalten" (PO-Entscheidung E3:
// hybride Bereiche aufteilen). Liest und schreibt denselben draft.history;
// die Bereichsdatei entsteht erst beim ersten Setzen.
function renderHistoryAreaSection(container, draft) {
  const values = draft.history;
  if (!values) {
    const loading = document.createElement('p');
    loading.className = 'settings-row-hint';
    // Generischer Lade-Text (bewusst geteilter Key, kein Vorlagen-Bezug).
    loading.textContent = t('settings.templates.loading');
    container.appendChild(loading);
    return;
  }
  // Ohne Bereichs-Bindung ist die Sektion über die Navigation nicht
  // erreichbar (Gruppe fehlt); der Guard deckt den Übergangs-Moment eines
  // Bereichs-Wechsels ab.
  if (!values.hasArea) return;
  const areaSelect = document.createElement('select');
  areaSelect.id = 'settings-history-area-default';
  areaSelect.className = 'settings-input';
  for (const [value, key] of [
    ['inherit', 'settings.history.inherit'],
    ['on', 'settings.history.on'],
    ['off', 'settings.history.off'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    areaSelect.appendChild(option);
  }
  areaSelect.value =
    values.areaValue === true ? 'on' : values.areaValue === false ? 'off' : 'inherit';
  areaSelect.addEventListener('change', () => {
    values.areaValue = areaSelect.value === 'on' ? true : areaSelect.value === 'off' ? false : null;
  });
  container.appendChild(buildSettingsRow('settings.history.areaDefault', areaSelect));
}

async function applyHistorySettings(draft) {
  if (!draft.history) return;
  const snap = draft.historySnapshot || {};
  const next = {
    ...draft.history,
    maxMinutes: clampHistoryMinutes(draft.history.maxMinutes, HISTORY_DEFAULTS.maxMinutes),
    inactivityMinutes: clampHistoryMinutes(
      draft.history.inactivityMinutes,
      HISTORY_DEFAULTS.inactivityMinutes,
    ),
  };
  if (next.enabled !== snap.enabled) await persistSetting('historyEnabled', !!next.enabled);
  if (next.maxMinutes !== snap.maxMinutes) {
    await persistSetting('historyMaxPacketMinutes', next.maxMinutes);
  }
  if (next.inactivityMinutes !== snap.inactivityMinutes) {
    await persistSetting('historyInactivityMinutes', next.inactivityMinutes);
  }
  if (next.hasArea && next.areaValue !== snap.areaValue) {
    await api.setHistoryAreaDefault(next.areaValue);
  }
  draft.history = { ...next };
  draft.historySnapshot = { ...next };
  // Wirksamkeit kann sich geaendert haben: Statusbar-Zustand nachziehen.
  void updateHistoryStatus();
}

async function applyBehaviorSection(draft) {
  const mode = draft.defaultViewMode;
  if (['rendered', 'split', 'source', 'live'].includes(mode) && mode !== state.defaultViewMode) {
    state.defaultViewMode = mode;
    await persistSetting('app.defaultViewMode', mode);
  }
  await applyHistorySettings(draft);
  await applyRenameLinkSettings(draft);
  await applyKeepDraftsSetting(draft);
  await applyPasteLinkSetting(draft);
  await applyTabIndentSetting(draft);
  await applyScriptBlocksSetting(draft);
}

// 4T-0346 (Epic 3E-0062): Link-Update-Einstellungen. Zwei App-weite Schalter
// (Update aktiv, Vorschau aktiv), beide Default an; die Vorschau-Option ist nur
// bedienbar, solange das Update aktiv ist.
async function readRenameLinkSettings() {
  return {
    updateLinks: (await api.getSetting('renameUpdateLinks')) !== false,
    preview: (await api.getSetting('renameLinkPreview')) !== false,
  };
}

function renderRenameLinkSettings(container, draft) {
  const values = draft.renameLinks || { updateLinks: true, preview: true };
  const set = (key, value) => {
    if (!draft.renameLinks) draft.renameLinks = { ...values };
    draft.renameLinks[key] = value;
  };

  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title';
  heading.textContent = t('settings.renameLinks.group');
  container.appendChild(heading);

  const updateInput = document.createElement('input');
  updateInput.id = 'settings-rename-update-links';
  updateInput.type = 'checkbox';
  updateInput.checked = values.updateLinks !== false;

  const previewInput = document.createElement('input');
  previewInput.id = 'settings-rename-link-preview';
  previewInput.type = 'checkbox';
  previewInput.checked = values.preview !== false;

  const syncPreview = () => {
    previewInput.disabled = !updateInput.checked;
  };
  updateInput.addEventListener('change', () => {
    set('updateLinks', updateInput.checked);
    syncPreview();
  });
  previewInput.addEventListener('change', () => set('preview', previewInput.checked));
  syncPreview();

  container.appendChild(buildSettingsRow('settings.renameLinks.updateLinks', updateInput));
  container.appendChild(buildSettingsRow('settings.renameLinks.preview', previewInput));
}

async function applyRenameLinkSettings(draft) {
  if (!draft.renameLinks) return;
  const snap = draft.renameLinksSnapshot || {};
  const next = draft.renameLinks;
  if (next.updateLinks !== snap.updateLinks) {
    await persistSetting('renameUpdateLinks', next.updateLinks !== false);
  }
  if (next.preview !== snap.preview) {
    await persistSetting('renameLinkPreview', next.preview !== false);
  }
  draft.renameLinksSnapshot = { ...next };
}

// 4T-0369 (Epic 3E-0068): Entwurfs-Zwischenspeicher — App-weiter Schalter
// (Default an), ob nie gespeicherte Unbenannt-Tabs beim App-Ende ohne Dialog
// zwischengespeichert und beim Neustart wiederhergestellt werden.
function renderKeepDraftsSetting(container, draft) {
  const input = document.createElement('input');
  input.id = 'settings-keep-unsaved-drafts';
  input.type = 'checkbox';
  input.checked = draft.keepUnsavedDrafts !== false;
  input.addEventListener('change', () => {
    draft.keepUnsavedDrafts = input.checked;
  });
  container.appendChild(buildSettingsRow('settings.keepUnsavedDrafts.label', input));

  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.textContent = t('settings.keepUnsavedDrafts.hint');
  container.appendChild(hint);
}

async function applyKeepDraftsSetting(draft) {
  if (typeof draft.keepUnsavedDrafts !== 'boolean') return;
  if (draft.keepUnsavedDrafts !== draft.keepUnsavedDraftsSnapshot) {
    await persistSetting('keepUnsavedDrafts', draft.keepUnsavedDrafts);
    draft.keepUnsavedDraftsSnapshot = draft.keepUnsavedDrafts;
  }
}

// 4T-0603 (Epic 3E-0113): Schalter „URL beim Einfügen in eine Auswahl als
// Link" (Store-Key input.pasteUrlAsLink, Default an). Bei nicht-leerer Auswahl
// und einer URL in der Zwischenablage erzeugt Strg+V einen Markdown-Link, statt
// die Auswahl zu ersetzen.
function renderPasteLinkSetting(container, draft) {
  const input = document.createElement('input');
  input.id = 'settings-paste-url-as-link';
  input.type = 'checkbox';
  input.checked = draft.pasteUrlAsLink !== false;
  input.addEventListener('change', () => {
    draft.pasteUrlAsLink = input.checked;
  });
  container.appendChild(buildSettingsRow('settings.pasteUrlAsLink.label', input));

  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.textContent = t('settings.pasteUrlAsLink.hint');
  container.appendChild(hint);
}

// Persistiert den Schalter und zieht den Laufzeit-Zustand nach, damit der
// Editor-Paste-Handler ohne Neustart den neuen Wert liest.
async function applyPasteLinkSetting(draft) {
  if (typeof draft.pasteUrlAsLink !== 'boolean') return;
  if (draft.pasteUrlAsLink !== draft.pasteUrlAsLinkSnapshot) {
    await persistSetting('input.pasteUrlAsLink', draft.pasteUrlAsLink);
    state.pasteUrlAsLink = draft.pasteUrlAsLink;
    draft.pasteUrlAsLinkSnapshot = draft.pasteUrlAsLink;
  }
}

// --- 4T-0604 (Epic 3E-0113): Bereich „Zeitstempel" ---------------------------
// Erweiterungs-eigener Bereich der Erweiterung 'frontmatter-timestamps': zwei
// unabhängige Schalter (Erstellungs-/Änderungszeitpunkt), je ein Feldname,
// gemeinsames Format und die Anlage-Option für fehlende Felder. Store-Keys
// frontmatter.*; beim Anwenden wird der Laufzeit-Zustand
// state.frontmatterTimestamps nachgezogen, damit der Speicher-Hook ohne
// Neustart mit den neuen Werten arbeitet.

const TIMESTAMP_FORMAT_OPTION_KEYS = [
  ['datetime', 'settings.frontmatterTimestamps.formatDatetime'],
  ['date', 'settings.frontmatterTimestamps.formatDate'],
];

function normalizeTimestampDraft(ts) {
  const v = ts || {};
  return {
    createdEnabled: v.createdEnabled === true,
    createdField: (v.createdField || '').trim() || 'created',
    updatedEnabled: v.updatedEnabled === true,
    updatedField: (v.updatedField || '').trim() || 'updated',
    format: v.format === 'date' ? 'date' : 'datetime',
    autoCreate: v.autoCreate === true,
  };
}

function renderFrontmatterTimestampsSection(container, draft) {
  // An den Entwurf binden statt eine lose Kopie zu rendern: sonst liefen die
  // Änderungs-Handler auf ein Objekt, das die Dirty-Prüfung nicht sieht.
  if (!draft.timestamps) draft.timestamps = normalizeTimestampDraft({});
  const ts = draft.timestamps;

  const boolRow = (id, key, get, set) => {
    const box = document.createElement('input');
    box.id = id;
    box.type = 'checkbox';
    box.checked = get() === true;
    box.addEventListener('change', () => set(box.checked));
    container.appendChild(buildSettingsRow(key, box));
  };
  const textRow = (id, key, get, set, fallback) => {
    const input = document.createElement('input');
    input.id = id;
    input.type = 'text';
    input.className = 'settings-input';
    input.value = get() || fallback;
    input.addEventListener('input', () => set(input.value));
    container.appendChild(buildSettingsRow(key, input));
  };

  boolRow(
    'settings-created-enabled',
    'settings.frontmatterTimestamps.createdEnabled',
    () => ts.createdEnabled,
    (v) => {
      ts.createdEnabled = v;
    },
  );
  textRow(
    'settings-created-field',
    'settings.frontmatterTimestamps.createdField',
    () => ts.createdField,
    (v) => {
      ts.createdField = v;
    },
    'created',
  );
  boolRow(
    'settings-updated-enabled',
    'settings.frontmatterTimestamps.updatedEnabled',
    () => ts.updatedEnabled,
    (v) => {
      ts.updatedEnabled = v;
    },
  );
  textRow(
    'settings-updated-field',
    'settings.frontmatterTimestamps.updatedField',
    () => ts.updatedField,
    (v) => {
      ts.updatedField = v;
    },
    'updated',
  );

  const format = document.createElement('select');
  format.id = 'settings-timestamp-format';
  format.className = 'settings-input';
  for (const [value, key] of TIMESTAMP_FORMAT_OPTION_KEYS) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    format.appendChild(option);
  }
  format.value = ts.format === 'date' ? 'date' : 'datetime';
  format.addEventListener('change', () => {
    ts.format = format.value;
  });
  container.appendChild(buildSettingsRow('settings.frontmatterTimestamps.formatLabel', format));

  boolRow(
    'settings-timestamp-autocreate',
    'settings.frontmatterTimestamps.autoCreate',
    () => ts.autoCreate,
    (v) => {
      ts.autoCreate = v;
    },
  );

  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.textContent = t('settings.frontmatterTimestamps.hint');
  container.appendChild(hint);
}

async function applyFrontmatterTimestampsSection(draft) {
  if (!draft.timestamps || !draft.timestampsSnapshot) return;
  const norm = normalizeTimestampDraft(draft.timestamps);
  if (jsonEqual(norm, draft.timestampsSnapshot)) return;
  await persistSetting('frontmatter.createdEnabled', norm.createdEnabled);
  await persistSetting('frontmatter.createdField', norm.createdField);
  await persistSetting('frontmatter.updatedEnabled', norm.updatedEnabled);
  await persistSetting('frontmatter.updatedField', norm.updatedField);
  await persistSetting('frontmatter.timestampFormat', norm.format);
  await persistSetting('frontmatter.autoCreateField', norm.autoCreate);
  state.frontmatterTimestamps = { ...norm };
  draft.timestamps = { ...norm };
  draft.timestampsSnapshot = { ...norm };
}

// Spiegelt applyFrontmatterTimestampsSection (normalisierte Werte gegen den
// Snapshot).
function dirtyFrontmatterTimestampsSection(draft) {
  if (!draft.timestamps || !draft.timestampsSnapshot) return false;
  return !jsonEqual(normalizeTimestampDraft(draft.timestamps), draft.timestampsSnapshot);
}

// --- Bereich Vorlagen (4T-0428, Epic 3E-0080) ----------------------------------
// Globaler Vorlagen-Ordner und globale Ordner-Regeln (Store-Keys
// templates.folder/templates.rules) plus — bei Bereichs-Fenstern — die
// Bereichs-Konfiguration in der templates-Sektion der Bereichsdatei.
// Bereichs-Werte übersteuern die globalen VOLLSTÄNDIG (keine Misch-
// Auflösung; Architekturentscheidung 2 des Epics). Änderungen wirken ohne
// Neustart: Auswahl-Popup und Regel-Trigger lesen die Konfiguration frisch
// pro Aufruf (kein Cache, Epic-Entscheidung aus 4T-0424).

// Konfigurations-Stand in die Entwurfs-Form bringen: leere Strings statt
// null, Regel-Listen als bearbeitbare Kopien; snapshot trägt die
// normalisierte Form für den Nur-bei-Änderung-Persist.
async function readTemplatesFromConfig() {
  let config;
  try {
    config = await api.templatesGetConfig();
  } catch {
    config = null;
  }
  const toDraftPart = (part) => ({
    folder: part && part.folder ? part.folder : '',
    rules:
      part && Array.isArray(part.rules)
        ? part.rules.map((r) => ({ folder: r.folder, template: r.template }))
        : [],
  });
  const global = toDraftPart(config && config.global);
  const area = toDraftPart(config && config.area);
  return {
    draft: {
      hasArea: !!(config && config.hasArea),
      areaName: (config && config.areaName) || '',
      global,
      areaEnabled: !!(config && config.area),
      area,
    },
    snapshot: {
      global: normalizedTemplatesPart(global),
      area: config && config.area ? normalizedTemplatesPart(area) : null,
    },
  };
}

// Persistenz-Form eines Konfigurations-Teils: getrimmter Ordner, Regeln ohne
// leere Vorlagen-Einträge (komplett leere Zeilen entfallen still).
function normalizedTemplatesPart(part) {
  return {
    folder: String(part.folder || '').trim(),
    rules: (part.rules || [])
      .map((r) => ({
        folder: String(r.folder || '').trim(),
        template: String(r.template || '').trim(),
      }))
      .filter((r) => r.template !== ''),
  };
}

// Regel-Tabelle (Ordner → Vorlage) mit Hinzufügen/Entfernen. Strukturelle
// Änderungen rendern den Bereich neu (renderActiveSection), Text-Eingaben
// schreiben nur in den Entwurf.
function buildTemplatesRulesEditor(container, rules, idPrefix) {
  const label = document.createElement('p');
  label.className = 'settings-row-hint';
  label.textContent = t('settings.templates.rulesLabel');
  container.appendChild(label);
  rules.forEach((rule, idx) => {
    const row = document.createElement('div');
    row.className = 'settings-templates-rule';
    const folderInput = document.createElement('input');
    folderInput.type = 'text';
    folderInput.id = `${idPrefix}-rule-folder-${idx}`;
    folderInput.className = 'settings-input settings-templates-rule-folder';
    folderInput.placeholder = t('settings.templates.ruleFolderPlaceholder');
    folderInput.value = rule.folder;
    folderInput.addEventListener('input', () => {
      rule.folder = folderInput.value;
    });
    const templateInput = document.createElement('input');
    templateInput.type = 'text';
    templateInput.id = `${idPrefix}-rule-template-${idx}`;
    templateInput.className = 'settings-input settings-templates-rule-template';
    templateInput.placeholder = t('settings.templates.ruleTemplatePlaceholder');
    templateInput.value = rule.template;
    templateInput.addEventListener('input', () => {
      rule.template = templateInput.value;
    });
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.id = `${idPrefix}-rule-remove-${idx}`;
    removeBtn.className = 'btn settings-templates-rule-remove';
    removeBtn.textContent = t('settings.templates.ruleRemove');
    removeBtn.addEventListener('click', () => {
      rules.splice(idx, 1);
      renderActiveSection();
    });
    row.append(folderInput, templateInput, removeBtn);
    container.appendChild(row);
  });
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.id = `${idPrefix}-rule-add`;
  addBtn.className = 'btn settings-templates-rule-add';
  addBtn.textContent = t('settings.templates.ruleAdd');
  addBtn.addEventListener('click', () => {
    rules.push({ folder: '', template: '' });
    renderActiveSection();
  });
  container.appendChild(addBtn);
}

// Ordner-Zeile (Text-Eingabe plus OS-Ordner-Auswahl). toRelative wandelt die
// Auswahl für die Bereichs-Gruppe in den wurzel-relativen Pfad, wenn der
// Ordner im Bereich liegt (absolute Angaben bleiben erlaubt).
function buildTemplatesFolderRow(container, part, idPrefix, toRelative) {
  const wrap = document.createElement('div');
  wrap.className = 'settings-templates-folder-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.id = `${idPrefix}-folder`;
  input.className = 'settings-input settings-templates-folder';
  input.placeholder = t('settings.templates.folderPlaceholder');
  input.value = part.folder;
  input.addEventListener('input', () => {
    part.folder = input.value;
  });
  const browseBtn = document.createElement('button');
  browseBtn.type = 'button';
  browseBtn.id = `${idPrefix}-folder-browse`;
  browseBtn.className = 'btn';
  browseBtn.textContent = t('settings.templates.folderBrowse');
  browseBtn.addEventListener('click', async () => {
    let result;
    try {
      result = await api.templatesChooseFolder();
    } catch {
      result = null;
    }
    if (!result || !result.ok || !result.path) return;
    const value = toRelative ? toRelative(result.path) : result.path;
    part.folder = value;
    input.value = value;
    // Mutation nach dem await: die delegierten Dokument-Listener der
    // Dirty-Erkennung liefen vor dem Dialog — explizit nachziehen (4T-0554).
    refreshSettingsButtons();
  });
  const row = document.createElement('div');
  row.className = 'settings-row';
  const label = document.createElement('label');
  label.htmlFor = input.id;
  label.textContent = t('settings.templates.folderLabel');
  wrap.append(input, browseBtn);
  row.append(label, wrap);
  container.appendChild(row);
}

function renderTemplatesSection(container, draft) {
  const values = draft.templates;
  if (!values) {
    const loading = document.createElement('p');
    loading.className = 'settings-row-hint';
    loading.textContent = t('settings.templates.loading');
    container.appendChild(loading);
    return;
  }
  const intro = document.createElement('p');
  intro.className = 'settings-row-hint';
  intro.textContent = t('settings.templates.intro');
  container.appendChild(intro);

  // Globale Konfiguration (Fallback ohne Bereichs-Sektion).
  const globalHeading = document.createElement('h4');
  globalHeading.className = 'settings-export-group-title';
  globalHeading.textContent = t('settings.templates.globalGroup');
  container.appendChild(globalHeading);
  buildTemplatesFolderRow(container, values.global, 'settings-templates-global', null);
  buildTemplatesRulesEditor(container, values.global.rules, 'settings-templates-global');
  // 4T-0555 (Epic 3E-0100): Die Bereichs-Konfiguration lebt als eigene
  // Sektion in der Navigations-Gruppe „Aktueller Bereich"
  // (renderTemplatesAreaSection) — hier bleibt der globale Teil.
}

// --- 4T-0555 (Epic 3E-0100): Bereichs-Sektion Vorlagen -------------------------
// Bereichs-Konfiguration der Vorlagen (übersteuert die globale vollständig);
// vormals ein hasArea-Block innerhalb des Bereichs „Vorlagen"
// (PO-Entscheidung E3: hybride Bereiche aufteilen). Liest und schreibt
// denselben draft.templates; die Bereichsdatei entsteht erst beim ersten
// Setzen.
function renderTemplatesAreaSection(container, draft) {
  const values = draft.templates;
  if (!values) {
    const loading = document.createElement('p');
    loading.className = 'settings-row-hint';
    loading.textContent = t('settings.templates.loading');
    container.appendChild(loading);
    return;
  }
  // Guard für den Übergangs-Moment eines Bereichs-Wechsels (Muster
  // renderHistoryAreaSection); regulär ist die Sektion ohne Bereich nicht
  // erreichbar.
  if (!values.hasArea) return;
  const areaHeading = document.createElement('h4');
  areaHeading.className = 'settings-export-group-title';
  areaHeading.textContent = t('settings.templates.areaGroup').replace('{name}', values.areaName);
  container.appendChild(areaHeading);
  const enabledInput = document.createElement('input');
  enabledInput.id = 'settings-templates-area-enabled';
  enabledInput.type = 'checkbox';
  enabledInput.checked = values.areaEnabled === true;
  enabledInput.addEventListener('change', () => {
    values.areaEnabled = enabledInput.checked;
    renderActiveSection();
  });
  container.appendChild(buildSettingsRow('settings.templates.areaEnabled', enabledInput));
  if (values.areaEnabled) {
    const hint = document.createElement('p');
    hint.className = 'settings-row-hint';
    hint.textContent = t('settings.templates.areaHint');
    container.appendChild(hint);
    buildTemplatesFolderRow(container, values.area, 'settings-templates-area', (absPath) => {
      // Auswahl innerhalb des Bereichs wird wurzel-relativ gespeichert
      // (umzugsfest); außerhalb bleibt der absolute Pfad (toleriert).
      if (!state.areaPath) return absPath;
      const rel = api.relative(state.areaPath, absPath);
      return rel && !rel.startsWith('..') && !/^[A-Za-z]:/.test(rel) ? rel : absPath;
    });
    buildTemplatesRulesEditor(container, values.area.rules, 'settings-templates-area');
  }
}

// Regel-Zeilen mit Ordner, aber ohne Vorlage sind unvollständig (komplett
// leere Zeilen entfallen beim Anwenden still). Gemeinsamer Prüf-Helfer der
// globalen und der Bereichs-Sektion (4T-0555: getrennte validate-Hooks,
// damit der Fehler-Punkt am richtigen Navigations-Eintrag erscheint).
function templatesRulesError(part) {
  for (const rule of part.rules) {
    if (String(rule.template || '').trim() === '' && String(rule.folder || '').trim() !== '') {
      return t('settings.templates.error.ruleTemplate');
    }
  }
  return null;
}

function validateTemplatesSection(draft) {
  const values = draft.templates;
  if (!values) return null;
  return templatesRulesError(values.global);
}

function validateTemplatesAreaSection(draft) {
  const values = draft.templates;
  if (!values || !values.hasArea || !values.areaEnabled) return null;
  return templatesRulesError(values.area);
}

async function applyTemplatesSection(draft) {
  const values = draft.templates;
  if (!values) return;
  const snap = draft.templatesSnapshot || {};
  const globalOut = normalizedTemplatesPart(values.global);
  if (JSON.stringify(globalOut) !== JSON.stringify(snap.global)) {
    await persistSetting('templates.folder', globalOut.folder);
    await persistSetting('templates.rules', globalOut.rules);
  }
  let areaOut = snap.area === undefined ? null : snap.area;
  if (values.hasArea) {
    areaOut = values.areaEnabled ? normalizedTemplatesPart(values.area) : null;
    if (JSON.stringify(areaOut) !== JSON.stringify(snap.area)) {
      let result;
      try {
        result = await api.templatesSetAreaConfig(areaOut);
      } catch {
        result = null;
      }
      if (!result || !result.ok) {
        // Defekte Bereichsdatei wird nie überschrieben; sichtbarer Hinweis.
        showStatusbarHint(null, {
          text: t('settings.templates.areaWriteFailed'),
          error: true,
          duration: 4000,
        });
        areaOut = snap.area === undefined ? null : snap.area;
      }
    }
  }
  draft.templatesSnapshot = { global: globalOut, area: areaOut };
}

// --- Bereich Eigenschafts-Profile (4T-0450, Epic 3E-0083) -------------------------
// propertyProfiles-Sektion der Bereichsdatei (Profil-Ordner, Zuordnungs-
// Feldname, Standard-Profil) plus Liste der erkannten Profile mit
// Definitions-Anzahl und Validierungs-Hinweisen. Nur bei Fenstern mit
// Bereich; persistiert wird bei Anwenden/OK über profiles:setAreaConfig,
// dessen Broadcast die Editoren ohne Neustart nachzieht (4T-0448/4T-0449).

async function readProfilesFromConfig() {
  let result;
  try {
    result = await api.profilesList();
  } catch {
    result = null;
  }
  const config = result && result.config ? result.config : null;
  const part = {
    folder: config && config.folder ? config.folder : '',
    assignField: config ? config.assignField : '',
    defaultProfile: config && config.defaultProfile ? config.defaultProfile : '',
  };
  return {
    draft: {
      hasArea: !!(result && result.hasArea),
      areaName: (result && result.areaName) || '',
      ...part,
      folderMissing: !!(result && result.folderMissing),
      list: result && Array.isArray(result.profiles) ? result.profiles : [],
    },
    snapshot: normalizeProfilesConfig(part),
  };
}

// Lokalisierter Text eines Validierungs-Hinweises ({index} 1-basiert).
function profileErrorText(err) {
  return t('settings.profiles.error.' + err.code)
    .replace('{index}', String((typeof err.index === 'number' ? err.index : -1) + 1))
    .replace('{name}', err.name || '');
}

// Profil-Liste des Bereichs frisch laden und den Bereich neu rendern
// (Aktualisieren-Button und Nachzug nach dem Anwenden).
async function refreshProfilesList(values) {
  let result;
  try {
    result = await api.profilesList();
  } catch {
    result = null;
  }
  if (!pageState.draft || pageState.draft.profiles !== values) return;
  values.list = result && Array.isArray(result.profiles) ? result.profiles : [];
  values.folderMissing = !!(result && result.folderMissing);
  if (pageState.activeSectionId === 'propertyProfiles') renderActiveSection();
}

function renderProfilesSection(container, draft) {
  const values = draft.profiles;
  if (!values) {
    const loading = document.createElement('p');
    loading.className = 'settings-row-hint';
    loading.textContent = t('settings.profiles.loading');
    container.appendChild(loading);
    return;
  }
  const intro = document.createElement('p');
  intro.className = 'settings-row-hint';
  intro.textContent = t('settings.profiles.intro');
  container.appendChild(intro);
  if (!values.hasArea) {
    const hint = document.createElement('p');
    hint.className = 'settings-row-hint';
    hint.textContent = t('settings.profiles.noArea');
    container.appendChild(hint);
    return;
  }

  // Profil-Ordner (wurzel-relativ; OS-Auswahl wie beim Vorlagen-Ordner).
  const folderWrap = document.createElement('div');
  folderWrap.className = 'settings-templates-folder-row';
  const folderInput = document.createElement('input');
  folderInput.type = 'text';
  folderInput.id = 'settings-profiles-folder';
  folderInput.className = 'settings-input settings-templates-folder';
  folderInput.placeholder = t('settings.profiles.folderPlaceholder');
  folderInput.value = values.folder;
  folderInput.addEventListener('input', () => {
    values.folder = folderInput.value;
  });
  const browseBtn = document.createElement('button');
  browseBtn.type = 'button';
  browseBtn.id = 'settings-profiles-folder-browse';
  browseBtn.className = 'btn';
  browseBtn.textContent = t('settings.profiles.folderBrowse');
  browseBtn.addEventListener('click', async () => {
    let result;
    try {
      result = await api.profilesChooseFolder();
    } catch {
      result = null;
    }
    if (!result || !result.ok || !result.path) return;
    // Auswahl innerhalb des Bereichs wurzel-relativ speichern (umzugsfest);
    // außerhalb bleibt der absolute Pfad (die Bereichs-Grenze weist ihn
    // beim Lesen ab, sichtbar über den Ordner-fehlt-Hinweis).
    let value = result.path;
    if (state.areaPath) {
      const rel = api.relative(state.areaPath, result.path);
      if (rel && !rel.startsWith('..') && !/^[A-Za-z]:/.test(rel)) value = rel;
    }
    values.folder = value;
    folderInput.value = value;
    // Mutation nach dem await — Dirty-Erkennung explizit nachziehen (4T-0554).
    refreshSettingsButtons();
  });
  const folderRow = document.createElement('div');
  folderRow.className = 'settings-row';
  const folderLabel = document.createElement('label');
  folderLabel.htmlFor = folderInput.id;
  folderLabel.textContent = t('settings.profiles.folderLabel');
  folderWrap.append(folderInput, browseBtn);
  folderRow.append(folderLabel, folderWrap);
  container.appendChild(folderRow);

  // Zuordnungs-Feldname (leer = Default class).
  const assignInput = document.createElement('input');
  assignInput.type = 'text';
  assignInput.id = 'settings-profiles-assign-field';
  assignInput.className = 'settings-input';
  assignInput.placeholder = t('settings.profiles.assignFieldPlaceholder');
  assignInput.value = values.assignField;
  assignInput.addEventListener('input', () => {
    values.assignField = assignInput.value;
  });
  container.appendChild(buildSettingsRow('settings.profiles.assignFieldLabel', assignInput));

  // Standard-Profil (Auswahl aus den erkannten Profilen; ein konfigurierter,
  // aber nicht gefundener Name bleibt als markierte Option erhalten).
  const defaultSelect = document.createElement('select');
  defaultSelect.id = 'settings-profiles-default';
  defaultSelect.className = 'settings-input';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = t('settings.profiles.defaultProfileNone');
  defaultSelect.appendChild(noneOpt);
  // 4T-0517: interne Profile (Ereignis) stehen nicht zur Wahl als
  // bereichsweites Standard-Profil — sie sind an ihr Zuordnungs-Feld
  // gebunden (PO-Freigabe 2026-07-15).
  const names = values.list.filter((p) => !p.internal).map((p) => p.name);
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    defaultSelect.appendChild(opt);
  }
  if (values.defaultProfile && !names.includes(values.defaultProfile)) {
    const opt = document.createElement('option');
    opt.value = values.defaultProfile;
    opt.textContent = t('settings.profiles.defaultProfileMissing').replace(
      '{name}',
      values.defaultProfile,
    );
    defaultSelect.appendChild(opt);
  }
  defaultSelect.value = values.defaultProfile || '';
  defaultSelect.addEventListener('change', () => {
    values.defaultProfile = defaultSelect.value;
  });
  container.appendChild(buildSettingsRow('settings.profiles.defaultProfileLabel', defaultSelect));

  // Liste der erkannten Profile (angewendeter Stand der Bereichsdatei).
  const listHeading = document.createElement('h4');
  listHeading.className = 'settings-export-group-title';
  listHeading.textContent = t('settings.profiles.listHeading');
  container.appendChild(listHeading);
  const listHint = document.createElement('p');
  listHint.className = 'settings-row-hint';
  listHint.textContent = t('settings.profiles.listHint');
  container.appendChild(listHint);
  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.id = 'settings-profiles-refresh';
  refreshBtn.className = 'btn';
  refreshBtn.textContent = t('settings.profiles.listRefresh');
  refreshBtn.addEventListener('click', () => void refreshProfilesList(values));
  container.appendChild(refreshBtn);
  // 4T-0517: interne Profile erscheinen auch ohne (oder bei fehlendem)
  // Profil-Ordner — die Hinweise bleiben, die Liste rendert trotzdem,
  // sobald sie Einträge hat.
  if (values.folderMissing) {
    const missing = document.createElement('p');
    missing.className = 'settings-row-hint';
    missing.textContent = t('settings.profiles.folderMissing');
    container.appendChild(missing);
    if (values.list.length === 0) return;
  } else if (values.list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'settings-row-hint';
    empty.textContent = t('settings.profiles.listEmpty');
    container.appendChild(empty);
    return;
  }
  const list = document.createElement('div');
  list.className = 'settings-profiles-list';
  for (const profile of values.list) {
    const row = document.createElement('div');
    row.className = profile.internal
      ? 'settings-profiles-item is-internal'
      : 'settings-profiles-item';
    if (profile.internal) {
      // Internes Profil: nicht änderbar, nicht löschbar — Name ohne
      // Öffnen-Affordanz (keine Datei dahinter).
      const nameSpan = document.createElement('span');
      nameSpan.className = 'settings-profiles-item-name-static';
      nameSpan.textContent = profile.name;
      row.appendChild(nameSpan);
    } else {
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'settings-profiles-item-name';
      openBtn.textContent = profile.name;
      openBtn.title = t('settings.profiles.openFile');
      openBtn.addEventListener('click', () => void openOrJumpToPath(profile.path));
      row.appendChild(openBtn);
    }
    const meta = document.createElement('span');
    meta.className = 'settings-profiles-item-meta';
    const parts = [
      t('settings.profiles.fieldCount').replace('{count}', String(profile.fieldCount)),
    ];
    if (profile.internal) parts.push(t('settings.profiles.internalProfile'));
    if (profile.errors.length > 0) {
      parts.push(
        t('settings.profiles.hintCount').replace('{count}', String(profile.errors.length)),
      );
    }
    meta.textContent = parts.join(' · ');
    if (profile.errors.length > 0) {
      meta.classList.add('has-errors');
      meta.title = profile.errors.map(profileErrorText).join('\n');
    }
    row.appendChild(meta);
    list.appendChild(row);
  }
  container.appendChild(list);
}

async function applyProfilesSection(draft) {
  const values = draft.profiles;
  if (!values || !values.hasArea) return;
  const out = normalizeProfilesConfig({
    folder: values.folder,
    assignField: values.assignField,
    defaultProfile: values.defaultProfile,
  });
  if (JSON.stringify(out) === JSON.stringify(draft.profilesSnapshot)) return;
  let result;
  try {
    result = await api.profilesSetAreaConfig(out);
  } catch {
    result = null;
  }
  if (!result || !result.ok) {
    // Defekte Bereichsdatei wird nie überschrieben; sichtbarer Hinweis.
    showStatusbarHint(null, {
      text: t('settings.profiles.areaWriteFailed'),
      error: true,
      duration: 4000,
    });
    return;
  }
  draft.profilesSnapshot = out;
  // Profil-Liste auf den frisch angewendeten Stand ziehen.
  void refreshProfilesList(values);
}

// --- Bereich Journale (4T-0436, Epic 3E-0081) ------------------------------------
// Regale und Journal-Definitionen der journals-Sektion der Bereichsdatei
// (Datenpfad aus 4T-0431); nur bei Fenstern mit Bereich (Architektur-
// entscheidung 2 des Epics). Entwurfs-Semantik der Seite: persistiert wird
// erst bei Anwenden/OK; der Schreib-Pfad broadcastet journals:changed,
// Kalender-Panel und Kommandos ziehen ohne Neustart nach.

// Konfigurations-Stand in die Entwurfs-Form bringen (bearbeitbare Kopien;
// Property-Namen ausgefüllt mit den Defaults). Zusätzlich wird die
// Vorlagen-Liste des aufgelösten Vorlagen-Ordners geladen (Auswahl-Feld
// "Vorlage"; leer bei unkonfiguriertem Ordner).
async function readJournalsFromConfig() {
  let config;
  try {
    config = await api.journalsGetConfig();
  } catch {
    config = null;
  }
  let templates = [];
  try {
    const list = await api.templatesList();
    if (list && list.ok && Array.isArray(list.templates)) {
      templates = list.templates.map((e) => e.relPath);
    }
  } catch {
    templates = [];
  }
  const cfg = config && config.config ? config.config : { shelves: [], journals: [] };
  const journals = (cfg.journals || []).map((j) => ({ ...j }));
  const draft = {
    hasArea: !!(config && config.hasArea),
    areaName: (config && config.areaName) || '',
    shelves: [...(cfg.shelves || [])],
    journals,
    templatesList: templates,
    // Ansichts-Zustand der zweistufigen Navigation: null = Regal-Übersicht,
    // '' = Journale ohne Regal, sonst der geöffnete Regal-Name.
    openShelf: null,
  };
  return { draft, snapshot: journalsPersistForm(draft) };
}

// Persistenz-Form des Entwurfs: leere Journale entfallen nicht (Validierung
// verhindert sie), name fällt auf id zurück; null bei komplett leerem Stand.
function journalsPersistForm(values) {
  const shelves = values.shelves.map((s) => String(s || '').trim()).filter((s) => s !== '');
  const journals = values.journals.map((j) => ({
    id: String(j.id || '').trim(),
    name: String(j.name || '').trim() || String(j.id || '').trim(),
    shelf: String(j.shelf || '').trim() || null,
    granularity: j.granularity,
    folderPattern: String(j.folderPattern || '').trim(),
    namePattern: String(j.namePattern || '').trim(),
    template: String(j.template || '').trim() || null,
    startDate: String(j.startDate || '').trim() || null,
    endDate: String(j.endDate || '').trim() || null,
    dateProp: String(j.dateProp || '').trim() || DEFAULT_DATE_PROP,
    startProp: String(j.startProp || '').trim() || DEFAULT_START_PROP,
    endProp: String(j.endProp || '').trim() || DEFAULT_END_PROP,
  }));
  if (shelves.length === 0 && journals.length === 0) return null;
  return { shelves, journals };
}

// Stabile Journal-id aus dem Namen (Anlage-Zeitpunkt): kebab-Slug plus
// Zähler-Suffix bei Kollision. Die id bleibt beim Umbenennen erhalten
// (Persistenz-Schlüssel, nicht sichtbar in der UI).
function journalIdFromName(name, taken) {
  const base =
    String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'journal';
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

// Text-Eingabe-Zeile des Journal-Formulars (schreibt in den Entwurf).
function buildJournalInputRow(container, labelKey, id, value, placeholder, onInput) {
  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.className = 'settings-input';
  input.placeholder = placeholder || '';
  input.value = value || '';
  input.addEventListener('input', () => onInput(input.value));
  container.appendChild(buildSettingsRow(labelKey, input));
  return input;
}

// Live-Vorschau des aufgelösten Beispiel-Pfads (heutige Periode); Schema-
// Fehler erscheinen direkt am Feld (rote Hinweis-Zeile).
function updateJournalPreview(el, journal) {
  const period = periodOf(Date.now(), journal.granularity);
  const resolved = period ? resolveEntryPath(journal, period) : { ok: false };
  if (resolved.ok) {
    el.textContent = t('settings.journals.previewLabel').replace('{path}', resolved.relPath);
    el.classList.remove('settings-journals-preview-error');
  } else {
    el.textContent = t('settings.journals.previewInvalid');
    el.classList.add('settings-journals-preview-error');
  }
}

// Formular-Gruppe eines Journals.
function buildJournalEditor(container, values, journal, idx, snapshotById) {
  const group = document.createElement('div');
  group.className = 'settings-journals-journal';
  const head = document.createElement('div');
  head.className = 'settings-journals-journal-head';
  const title = document.createElement('h5');
  title.className = 'settings-journals-journal-title';
  title.textContent = String(journal.name || '').trim() || t('settings.journals.journalUntitled');
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.id = `settings-journals-remove-${idx}`;
  removeBtn.className = 'btn settings-journals-remove';
  removeBtn.textContent = t('settings.journals.journalRemove');
  removeBtn.addEventListener('click', () => {
    values.journals.splice(idx, 1);
    renderActiveSection();
  });
  head.append(title, removeBtn);
  group.appendChild(head);

  const nameInput = buildJournalInputRow(
    group,
    'settings.journals.nameLabel',
    `settings-journals-name-${idx}`,
    journal.name,
    '',
    (v) => {
      journal.name = v;
      title.textContent = v.trim() || t('settings.journals.journalUntitled');
    },
  );
  nameInput.classList.add('settings-journals-name');

  // Regal-Auswahl (kein Regal oder einer der definierten Regal-Namen).
  const shelfSelect = document.createElement('select');
  shelfSelect.id = `settings-journals-shelf-${idx}`;
  shelfSelect.className = 'settings-input';
  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = t('settings.journals.shelfNone');
  shelfSelect.appendChild(noneOption);
  for (const shelf of values.shelves) {
    const name = String(shelf || '').trim();
    if (name === '') continue;
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    shelfSelect.appendChild(option);
  }
  shelfSelect.value = journal.shelf || '';
  shelfSelect.addEventListener('change', () => {
    journal.shelf = shelfSelect.value || null;
    // Regal-Wechsel verschiebt das Journal in eine andere Detailansicht —
    // neu rendern, damit die aktuelle Ansicht konsistent bleibt.
    renderActiveSection();
  });
  group.appendChild(buildSettingsRow('settings.journals.shelfLabel', shelfSelect));

  // Granularität.
  const granularitySelect = document.createElement('select');
  granularitySelect.id = `settings-journals-granularity-${idx}`;
  granularitySelect.className = 'settings-input';
  for (const granularity of JOURNAL_GRANULARITIES) {
    const option = document.createElement('option');
    option.value = granularity;
    option.textContent = t(`journal.granularity.${granularity}`);
    granularitySelect.appendChild(option);
  }
  granularitySelect.value = journal.granularity;
  group.appendChild(buildSettingsRow('settings.journals.granularityLabel', granularitySelect));

  // Ordner- und Namens-Schema mit Live-Vorschau des Beispiel-Pfads.
  buildJournalInputRow(
    group,
    'settings.journals.folderLabel',
    `settings-journals-folder-${idx}`,
    journal.folderPattern,
    t('settings.journals.folderPlaceholder'),
    (v) => {
      journal.folderPattern = v;
      updateJournalPreview(preview, journal);
      updateSchemaWarning();
    },
  );
  buildJournalInputRow(
    group,
    'settings.journals.namePatternLabel',
    `settings-journals-namepattern-${idx}`,
    journal.namePattern,
    t('settings.journals.namePatternPlaceholder'),
    (v) => {
      journal.namePattern = v;
      updateJournalPreview(preview, journal);
      updateSchemaWarning();
    },
  );
  const preview = document.createElement('p');
  preview.className = 'settings-row-hint settings-journals-preview';
  preview.id = `settings-journals-preview-${idx}`;
  group.appendChild(preview);
  updateJournalPreview(preview, journal);
  granularitySelect.addEventListener('change', () => {
    journal.granularity = granularitySelect.value;
    updateJournalPreview(preview, journal);
  });

  // Warnung bei Schema-Änderung eines bestehenden Journals: Dateien werden
  // nicht umbenannt, die Kalender-Punkte folgen dem neuen Schema.
  const schemaWarning = document.createElement('p');
  schemaWarning.className = 'settings-row-hint settings-journals-schema-warning';
  schemaWarning.hidden = true;
  schemaWarning.textContent = t('settings.journals.schemaChangeHint');
  group.appendChild(schemaWarning);
  const updateSchemaWarning = () => {
    const before = snapshotById.get(journal.id);
    schemaWarning.hidden = !(
      before &&
      (before.folderPattern !== String(journal.folderPattern || '').trim() ||
        before.namePattern !== String(journal.namePattern || '').trim())
    );
  };
  updateSchemaWarning();

  // Vorlage aus dem aufgelösten Vorlagen-Ordner (leer = ohne Vorlage);
  // ein konfigurierter, aber nicht (mehr) gelisteter Pfad bleibt wählbar.
  const templateSelect = document.createElement('select');
  templateSelect.id = `settings-journals-template-${idx}`;
  templateSelect.className = 'settings-input';
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = t('settings.journals.templateNone');
  templateSelect.appendChild(emptyOption);
  const templateValues = [...values.templatesList];
  if (journal.template && !templateValues.includes(journal.template)) {
    templateValues.unshift(journal.template);
  }
  for (const relPath of templateValues) {
    const option = document.createElement('option');
    option.value = relPath;
    option.textContent = relPath;
    templateSelect.appendChild(option);
  }
  templateSelect.value = journal.template || '';
  templateSelect.addEventListener('change', () => {
    journal.template = templateSelect.value || null;
  });
  group.appendChild(buildSettingsRow('settings.journals.templateLabel', templateSelect));

  // Zeitraum (optional) und Property-Namen.
  buildJournalInputRow(
    group,
    'settings.journals.startLabel',
    `settings-journals-start-${idx}`,
    journal.startDate,
    'JJJJ-MM-TT',
    (v) => {
      journal.startDate = v;
    },
  );
  buildJournalInputRow(
    group,
    'settings.journals.endLabel',
    `settings-journals-end-${idx}`,
    journal.endDate,
    'JJJJ-MM-TT',
    (v) => {
      journal.endDate = v;
    },
  );
  buildJournalInputRow(
    group,
    'settings.journals.datePropLabel',
    `settings-journals-dateprop-${idx}`,
    journal.dateProp,
    DEFAULT_DATE_PROP,
    (v) => {
      journal.dateProp = v;
    },
  );
  buildJournalInputRow(
    group,
    'settings.journals.startPropLabel',
    `settings-journals-startprop-${idx}`,
    journal.startProp,
    DEFAULT_START_PROP,
    (v) => {
      journal.startProp = v;
    },
  );
  buildJournalInputRow(
    group,
    'settings.journals.endPropLabel',
    `settings-journals-endprop-${idx}`,
    journal.endProp,
    DEFAULT_END_PROP,
    (v) => {
      journal.endProp = v;
    },
  );
  container.appendChild(group);
}

function renderJournalsSection(container, draft) {
  const values = draft.journals;
  if (!values) {
    const loading = document.createElement('p');
    loading.className = 'settings-row-hint';
    loading.textContent = t('settings.journals.loading');
    container.appendChild(loading);
    return;
  }
  if (!values.hasArea) {
    const hint = document.createElement('p');
    hint.className = 'settings-row-hint';
    hint.id = 'settings-journals-no-area';
    hint.textContent = t('settings.journals.noArea');
    container.appendChild(hint);
    return;
  }
  const intro = document.createElement('p');
  intro.className = 'settings-row-hint';
  intro.textContent = t('settings.journals.intro').replace('{name}', values.areaName);
  container.appendChild(intro);

  // Zweistufige Navigation (PO-Befund der Release-Test-Iteration 0.55.0):
  // die Übersicht zeigt nur die Regale; „Öffnen" wechselt in die Detail-
  // ansicht mit den Journalen genau dieses Regals, „Regal schließen" führt
  // zurück. openShelf: null = Übersicht, '' = Journale ohne Regal,
  // sonst der Regal-Name (flüchtiger Ansichts-Zustand des Entwurfs).
  if (values.openShelf === null || values.openShelf === undefined) {
    renderJournalsShelfOverview(container, values);
  } else {
    renderJournalsShelfDetail(container, draft, values);
  }
}

// Übersicht: Regal-Zeilen (öffnen, umbenennen mit Nachzug der Journal-
// Zuordnung, löschen — referenzierende Journale verlieren nur die
// Zuordnung) plus die feste Zeile „Ohne Regal" für unzugeordnete Journale.
function renderJournalsShelfOverview(container, values) {
  const shelvesHeading = document.createElement('h4');
  shelvesHeading.className = 'settings-export-group-title';
  shelvesHeading.textContent = t('settings.journals.shelvesGroup');
  container.appendChild(shelvesHeading);

  const journalCount = (shelf) => values.journals.filter((j) => (j.shelf || '') === shelf).length;
  const buildOpenBtn = (idPart, shelfKey) => {
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.id = `settings-journals-shelf-open-${idPart}`;
    openBtn.className = 'btn settings-journals-shelf-open';
    openBtn.textContent = t('settings.journals.shelfOpen');
    openBtn.addEventListener('click', () => {
      values.openShelf = shelfKey;
      renderActiveSection();
    });
    return openBtn;
  };

  values.shelves.forEach((shelf, idx) => {
    const row = document.createElement('div');
    row.className = 'settings-journals-shelf';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `settings-journals-shelf-name-${idx}`;
    input.className = 'settings-input';
    input.placeholder = t('settings.journals.shelfPlaceholder');
    input.value = shelf;
    let previous = shelf;
    input.addEventListener('change', () => {
      const next = input.value.trim();
      for (const journal of values.journals) {
        if (journal.shelf === previous) journal.shelf = next || null;
      }
      values.shelves[idx] = next;
      previous = next;
      renderActiveSection();
    });
    const count = document.createElement('span');
    count.className = 'settings-journals-shelf-count';
    count.textContent = t('settings.journals.shelfCount').replace(
      '{count}',
      String(journalCount(shelf)),
    );
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.id = `settings-journals-shelf-remove-${idx}`;
    removeBtn.className = 'btn settings-journals-shelf-remove';
    removeBtn.textContent = t('settings.journals.shelfRemove');
    removeBtn.addEventListener('click', () => {
      for (const journal of values.journals) {
        if (journal.shelf === values.shelves[idx]) journal.shelf = null;
      }
      values.shelves.splice(idx, 1);
      renderActiveSection();
    });
    const openBtn = buildOpenBtn(String(idx), shelf);
    // Ein frisch angelegtes Regal ohne Namen ist noch nicht öffenbar
    // (der leere Schlüssel gehört der Zeile „Ohne Regal").
    if (shelf === '') openBtn.disabled = true;
    row.append(input, count, openBtn, removeBtn);
    container.appendChild(row);
  });

  // Feste Zeile für Journale ohne Regal-Zuordnung (immer erreichbar).
  {
    const row = document.createElement('div');
    row.className = 'settings-journals-shelf settings-journals-shelf-none';
    const label = document.createElement('span');
    label.className = 'settings-journals-shelf-none-label';
    label.textContent = t('settings.journals.shelfNoneGroup');
    const count = document.createElement('span');
    count.className = 'settings-journals-shelf-count';
    count.textContent = t('settings.journals.shelfCount').replace(
      '{count}',
      String(journalCount('')),
    );
    row.append(label, count, buildOpenBtn('none', ''));
    container.appendChild(row);
  }

  const shelfAddBtn = document.createElement('button');
  shelfAddBtn.type = 'button';
  shelfAddBtn.id = 'settings-journals-shelf-add';
  shelfAddBtn.className = 'btn settings-journals-shelf-add';
  shelfAddBtn.textContent = t('settings.journals.shelfAdd');
  shelfAddBtn.addEventListener('click', () => {
    values.shelves.push('');
    renderActiveSection();
  });
  container.appendChild(shelfAddBtn);
}

// Detailansicht eines Regals: nur dessen Journale (Editor-Formulare mit
// den ORIGINAL-Indizes der Gesamtliste — stabile Feld-IDs und korrektes
// Entfernen), „Journal hinzufügen" mit vorbelegtem Regal und „Regal
// schließen" zurück zur Übersicht. Ein nicht mehr existentes offenes Regal
// (z.B. nach Umbenennen) fällt beim nächsten Aufbau auf die Übersicht
// zurück (renderJournalsSection prüft openShelf nicht erneut — der Wechsel
// passiert ausschließlich über die Buttons, die neu rendern).
function renderJournalsShelfDetail(container, draft, values) {
  const shelfKey = values.openShelf;
  const head = document.createElement('div');
  head.className = 'settings-journals-detail-head';
  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title settings-journals-detail-title';
  heading.textContent =
    shelfKey === ''
      ? t('settings.journals.shelfNoneGroup')
      : t('settings.journals.shelfDetailTitle').replace('{name}', shelfKey);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.id = 'settings-journals-shelf-close';
  closeBtn.className = 'btn settings-journals-shelf-close';
  closeBtn.textContent = t('settings.journals.shelfClose');
  closeBtn.addEventListener('click', () => {
    values.openShelf = null;
    renderActiveSection();
  });
  head.append(heading, closeBtn);
  container.appendChild(head);

  const snapshot = draft.journalsSnapshot;
  const snapshotById = new Map(((snapshot && snapshot.journals) || []).map((j) => [j.id, j]));
  let shown = 0;
  values.journals.forEach((journal, idx) => {
    if ((journal.shelf || '') !== shelfKey) return;
    buildJournalEditor(container, values, journal, idx, snapshotById);
    shown++;
  });
  if (shown === 0) {
    const empty = document.createElement('p');
    empty.className = 'settings-row-hint';
    empty.textContent = t('settings.journals.shelfEmpty');
    container.appendChild(empty);
  }

  const journalAddBtn = document.createElement('button');
  journalAddBtn.type = 'button';
  journalAddBtn.id = 'settings-journals-add';
  journalAddBtn.className = 'btn settings-journals-add';
  journalAddBtn.textContent = t('settings.journals.journalAdd');
  journalAddBtn.addEventListener('click', () => {
    values.journals.push({
      id: '',
      name: '',
      shelf: shelfKey === '' ? null : shelfKey,
      granularity: 'day',
      folderPattern: '',
      namePattern: '{{date}}',
      template: null,
      startDate: '',
      endDate: '',
      dateProp: DEFAULT_DATE_PROP,
      startProp: DEFAULT_START_PROP,
      endProp: DEFAULT_END_PROP,
    });
    renderActiveSection();
  });
  container.appendChild(journalAddBtn);
}

// Pflichtfelder und Format-Prüfung: Name, Namens-Schema, Schema-Auflösung
// über die Vorlagen-Engine (heutige Beispiel-Periode), Datums-Grenzen.
function validateJournalsSection(draft) {
  const values = draft.journals;
  if (!values || !values.hasArea) return null;
  for (const journal of values.journals) {
    const name = String(journal.name || '').trim();
    if (name === '') return t('settings.journals.error.name');
    if (String(journal.namePattern || '').trim() === '') {
      return t('settings.journals.error.namePattern').replace('{name}', name);
    }
    const probe = {
      ...journal,
      folderPattern: String(journal.folderPattern || '').trim(),
      namePattern: String(journal.namePattern || '').trim(),
    };
    const resolved = resolveEntryPath(probe, periodOf(Date.now(), journal.granularity));
    if (!resolved.ok) {
      return t('settings.journals.error.pattern').replace('{name}', name);
    }
    const start = String(journal.startDate || '').trim();
    const end = String(journal.endDate || '').trim();
    if (start !== '' && isoDateToMs(start) === null) {
      return t('settings.journals.error.date').replace('{name}', name);
    }
    if (end !== '' && isoDateToMs(end) === null) {
      return t('settings.journals.error.date').replace('{name}', name);
    }
    if (start !== '' && end !== '' && isoDateToMs(start) > isoDateToMs(end)) {
      return t('settings.journals.error.dateOrder').replace('{name}', name);
    }
  }
  return null;
}

async function applyJournalsSection(draft) {
  const values = draft.journals;
  if (!values || !values.hasArea) return;
  // Neue Journale erhalten ihre stabile id erst jetzt (Slug aus dem Namen).
  const taken = new Set(values.journals.map((j) => j.id).filter(Boolean));
  for (const journal of values.journals) {
    if (!String(journal.id || '').trim()) {
      journal.id = journalIdFromName(journal.name, taken);
      taken.add(journal.id);
    }
  }
  const out = journalsPersistForm(values);
  if (JSON.stringify(out) === JSON.stringify(draft.journalsSnapshot)) return;
  let result;
  try {
    result = await api.journalsSetAreaConfig(out);
  } catch {
    result = null;
  }
  if (!result || !result.ok) {
    // Defekte Bereichsdatei wird nie überschrieben; sichtbarer Hinweis.
    showStatusbarHint(null, {
      text: t('settings.journals.areaWriteFailed'),
      error: true,
      duration: 4000,
    });
    return;
  }
  draft.journalsSnapshot = out;
}

// --- Bereich Kalender-Systeme (4T-0544, Epic 3E-0097) --------------------------
// Zweistufige Pflege der calendarSystems-Sektion der Bereichsdatei
// (Datenpfad aus 4T-0543): Übersicht = Blöcke, Detail = Kalender-Editoren
// des geöffneten Blocks. Struktur-Änderungen (Ebene/Zyklus/Epoche anlegen,
// entfernen, verschieben, Typ-Wechsel) rendern den Bereich neu (Muster
// Journale); Text-/Zahlen-Eingaben aktualisieren nur Hinweis und Vorschau.
// Validierung läuft ausschließlich über die Kern-Normalisierung: weich im
// Entwurf (Hinweis-Zeile pro Kalender), hart beim Anwenden (validate).

// Zahlen-Eingabe streng parsen (ganze Zahl, auch negativ); null = ungültig.
function calSysInt(v) {
  const s = String(v == null ? '' : v).trim();
  return /^-?\d{1,15}$/.test(s) ? Number(s) : null;
}

// Zeit-Teil-Länge der Entwurfs-Ebenen (Regel des Kerns: Präfix mit dem
// Ebenen-Bereich der kleinsten Ebene, sofern mehr als ein Bereich existiert).
function calSysTimeCount(levels) {
  if (levels.length === 0) return 0;
  const sec0 = String(levels[0].section || '').trim();
  let prefix = 0;
  while (prefix < levels.length && String(levels[prefix].section || '').trim() === sec0) prefix++;
  return prefix < levels.length ? prefix : 0;
}

// Datums-Ebenen des Entwurfs in Anzeige-Reihenfolge (größte zuerst) — die
// Beschriftungs- und Segment-Basis der Epochen-/Anker-Eingaben.
function calSysDateLevels(levels) {
  return levels.slice(calSysTimeCount(levels)).reverse();
}

// Segment-Liste eines Entwurfs an eine Ziel-Länge angleichen (Ebenen-
// Änderungen ändern die Anzahl der Eingabe-Felder; Bestand bleibt erhalten).
function calSysSyncSegs(segs, length) {
  const out = Array.isArray(segs) ? segs.slice(0, length) : [];
  while (out.length < length) out.push('');
  return out;
}

// Nächste freie laufende Kennung (ebene-1, zyklus-2, …) im Entwurf.
function calSysNextId(prefix, taken) {
  let n = 1;
  while (taken.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

// Stabile Kennung aus dem Namen beim Anwenden (Muster journalIdFromName).
function calSysIdFromName(name, fallback, taken) {
  const base =
    String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, '-')
      .replace(/^-+|-+$/g, '') || fallback;
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

// Normalisierten Kalender in die Entwurfs-Form bringen (bearbeitbare Kopien,
// Zahlen als Eingabe-Strings, 1-basierte Positionen für die UI).
function calendarToDraft(cal) {
  const levels = cal.levels.map((level) => {
    const draft = {
      id: level.id,
      name: level.name,
      section: level.section,
      start: String(level.start),
      relType: level.rel ? level.rel.type : '',
      factorCount: '',
      table: [],
      leapCount: '',
      leapRules: [],
      leapTarget: '',
      leapExtra: '',
    };
    if (level.rel && level.rel.type === 'factor') draft.factorCount = String(level.rel.count);
    if (level.rel && level.rel.type === 'lengths') {
      draft.table = level.rel.table.map((length, i) => ({
        name: level.names ? level.names[i] || '' : '',
        length: String(length),
      }));
    }
    if (level.rel && level.rel.type === 'leap') {
      draft.leapCount = String(level.rel.count);
      draft.leapRules = level.rel.rules.map((r) => String(r.cycle));
      draft.leapTarget = String(level.rel.targetIndex + 1);
      draft.leapExtra = String(level.rel.extra);
    }
    return draft;
  });
  return {
    id: cal.id,
    name: cal.name,
    levels,
    cycles: cal.cycles.map((cycle) => ({
      id: cycle.id,
      name: cycle.name,
      of: cycle.of,
      length: String(cycle.length),
      namesText: cycle.names ? cycle.names.join(', ') : '',
      anchorSegs: cycle.anchor.tuple.map(String),
      anchorPosition: String(cycle.anchor.position + 1),
      ruleIndex: cycle.numbering ? String(cycle.numbering.ruleIndex + 1) : '',
    })),
    groups: cal.groups.map((group) => ({
      id: group.id,
      name: group.name,
      of: group.of,
      size: String(group.size),
    })),
    epochs: cal.epochs.map((epoch) => ({
      name: epoch.name,
      abbr: epoch.abbr || '',
      startSegs: epoch.start ? epoch.start.map(String) : null,
    })),
    anchorSegs: cal.blockAnchor.map(String),
    scaleNum: String(cal.blockScale.num),
    scaleDen: String(cal.blockScale.den),
    previewInput: formatTuple(cal, cal.blockAnchor) || '',
  };
}

// Entwurfs-Form eines Kalenders in die Persistenz-/Kern-Form bringen.
// Ungültige Zahlen werden bewusst als ungültige Werte durchgereicht — die
// Kern-Normalisierung lehnt den Kalender dann ab (weiche/harte Validierung
// aus einer Quelle).
function calendarPersistForm(calDraft) {
  const levels = calDraft.levels.map((level, i) => {
    const out = {
      id: level.id,
      name: String(level.name || '').trim(),
      section: String(level.section || '').trim(),
      start: calSysInt(level.start) ?? NaN,
    };
    const names = level.table.map((row) => String(row.name || '').trim());
    if (level.table.length > 0 && names.every((n) => n !== '')) out.names = names;
    if (i === 0) return out;
    if (level.relType === 'factor') {
      out.rel = { type: 'factor', count: calSysInt(level.factorCount) };
    } else if (level.relType === 'lengths') {
      out.rel = { type: 'lengths', table: level.table.map((row) => calSysInt(row.length)) };
    } else if (level.relType === 'leap') {
      const below = calDraft.levels[i - 1];
      const count =
        below && below.relType === 'lengths' ? below.table.length : calSysInt(level.leapCount);
      const target = calSysInt(level.leapTarget);
      out.rel = {
        type: 'leap',
        count,
        rules: level.leapRules.map((cycle) => ({ cycle: calSysInt(cycle) })),
        targetIndex: target === null ? null : target - 1,
        extra: calSysInt(level.leapExtra),
      };
    }
    return out;
  });
  const segsOf = (segs) => segs.map((s) => calSysInt(s));
  const out = {
    id: calDraft.id,
    name: String(calDraft.name || '').trim(),
    levels,
    cycles: calDraft.cycles.map((cycle) => {
      const position = calSysInt(cycle.anchorPosition);
      const rule = String(cycle.ruleIndex || '').trim();
      const names = String(cycle.namesText || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
      const entry = {
        id: cycle.id,
        name: String(cycle.name || '').trim(),
        of: cycle.of,
        length: calSysInt(cycle.length),
        anchor: {
          tuple: segsOf(cycle.anchorSegs),
          position: position === null ? null : position - 1,
        },
        numbering:
          rule === '' ? null : { ruleIndex: calSysInt(rule) === null ? null : calSysInt(rule) - 1 },
      };
      if (names.length > 0) entry.names = names;
      return entry;
    }),
    groups: calDraft.groups.map((group) => ({
      id: group.id,
      name: String(group.name || '').trim(),
      of: group.of,
      size: calSysInt(group.size),
    })),
    epochs: calDraft.epochs.map((epoch) => ({
      name: String(epoch.name || '').trim(),
      abbr: String(epoch.abbr || '').trim() || null,
      start: epoch.startSegs === null ? null : segsOf(epoch.startSegs),
    })),
  };
  // Leerer Anker/leere Skala = Kern-Defaults (Minimal-Tupel bzw. 1/1);
  // teilweise gefüllte Eingaben reichen als ungültig durch.
  if (calDraft.anchorSegs.some((s) => String(s).trim() !== '')) {
    out.blockAnchor = segsOf(calDraft.anchorSegs);
  }
  const num = String(calDraft.scaleNum || '').trim();
  const den = String(calDraft.scaleDen || '').trim();
  if (num !== '' || den !== '') {
    out.blockScale = { num: calSysInt(num), den: calSysInt(den) };
  }
  return out;
}

// Persistenz-Form des gesamten Entwurfs ({ blocks } oder null bei leerem
// Stand) — Grundlage für Snapshot-Vergleich und Anwenden.
function calendarConfigPersistForm(values) {
  const blocks = values.blocks.map((block) => ({
    id: block.id,
    name: String(block.name || '').trim(),
    calendars: block.calendars.map((cal) => calendarPersistForm(cal)),
  }));
  if (blocks.length === 0) return null;
  return { blocks };
}

// Einzelnen Entwurfs-Kalender über die Kern-Normalisierung prüfen; liefert
// den normalisierten Kalender oder null (ungültig).
function calSysNormalizedDraft(calDraft) {
  const probe = normalizeCalendarConfig({
    blocks: [{ id: 'probe', calendars: [{ ...calendarPersistForm(calDraft), id: 'probe-cal' }] }],
  });
  return probe && probe.blocks[0].calendars.length === 1 ? probe.blocks[0].calendars[0] : null;
}

async function readCalendarFromConfig() {
  let config;
  try {
    config = await api.calendarGetConfig();
  } catch {
    config = null;
  }
  const cfg = config && config.config ? config.config : { blocks: [] };
  const draft = {
    hasArea: !!(config && config.hasArea),
    areaName: (config && config.areaName) || '',
    blocks: (cfg.blocks || []).map((block) => ({
      id: block.id,
      name: block.name,
      calendars: block.calendars.map((cal) => calendarToDraft(cal)),
    })),
    // Ansichts-Zustand der zweistufigen Navigation: null = Block-Übersicht,
    // sonst der Index des geöffneten Blocks (flüchtig, Muster openShelf).
    openBlock: null,
  };
  return { draft, snapshot: calendarConfigPersistForm(draft) };
}

// Beschriftete Zahlen-Eingabe (kompakte Inline-Zelle der Editor-Zeilen).
function buildCalSysNumCell(labelText, id, value, width, onInput) {
  const wrap = document.createElement('label');
  wrap.className = 'settings-calsys-numcell';
  const span = document.createElement('span');
  span.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.id = id;
  input.className = 'settings-input settings-calsys-num';
  if (width) input.style.width = `${width}px`;
  input.value = value == null ? '' : String(value);
  input.addEventListener('input', () => onInput(input.value));
  wrap.append(span, input);
  return wrap;
}

// Segment-Eingaben (ein Zahlen-Feld je Ebene, beschriftet mit Ebenen-Namen).
function buildCalSysSegRow(container, labelKey, idBase, segs, levelsForLabels, onChange) {
  const row = document.createElement('div');
  row.className = 'settings-row settings-calsys-segrow';
  const label = document.createElement('label');
  label.textContent = t(labelKey);
  const cells = document.createElement('div');
  cells.className = 'settings-calsys-segcells';
  levelsForLabels.forEach((level, i) => {
    cells.appendChild(
      buildCalSysNumCell(String(level.name || level.id), `${idBase}-${i}`, segs[i], 70, (v) => {
        segs[i] = v;
        onChange();
      }),
    );
  });
  row.append(label, cells);
  container.appendChild(row);
}

// Übersicht: Block-Zeilen (Name, Kalender-Zähler, Öffnen, Entfernen) plus
// „Block hinzufügen" (Muster Journal-Regale).
function renderCalendarBlocksOverview(container, values) {
  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title';
  heading.textContent = t('settings.calendar.blocksGroup');
  container.appendChild(heading);

  values.blocks.forEach((block, idx) => {
    const row = document.createElement('div');
    row.className = 'settings-calsys-block';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `settings-calsys-block-name-${idx}`;
    input.className = 'settings-input';
    input.placeholder = t('settings.calendar.blockPlaceholder');
    input.value = block.name;
    input.addEventListener('input', () => {
      block.name = input.value;
    });
    const count = document.createElement('span');
    count.className = 'settings-calsys-block-count';
    count.textContent = t('settings.calendar.blockCount').replace(
      '{count}',
      String(block.calendars.length),
    );
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.id = `settings-calsys-block-open-${idx}`;
    openBtn.className = 'btn settings-calsys-block-open';
    openBtn.textContent = t('settings.calendar.blockOpen');
    openBtn.addEventListener('click', () => {
      values.openBlock = idx;
      renderActiveSection();
    });
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.id = `settings-calsys-block-remove-${idx}`;
    removeBtn.className = 'btn settings-calsys-block-remove';
    removeBtn.textContent = t('settings.calendar.blockRemove');
    removeBtn.addEventListener('click', () => {
      values.blocks.splice(idx, 1);
      renderActiveSection();
    });
    row.append(input, count, openBtn, removeBtn);
    container.appendChild(row);
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.id = 'settings-calsys-block-add';
  addBtn.className = 'btn settings-calsys-block-add';
  addBtn.textContent = t('settings.calendar.blockAdd');
  addBtn.addEventListener('click', () => {
    values.blocks.push({ id: '', name: '', calendars: [] });
    renderActiveSection();
  });
  container.appendChild(addBtn);
}

// Ebenen-Editor eines Kalenders (kleinste zuerst, Pfeile tauschen Nachbarn).
function buildCalSysLevelEditor(container, calDraft, level, levelIdx, calIdx, onChange) {
  const box = document.createElement('div');
  box.className = 'settings-calsys-level';
  const head = document.createElement('div');
  head.className = 'settings-calsys-level-head';
  const title = document.createElement('span');
  title.className = 'settings-calsys-level-title';
  title.textContent = t(
    levelIdx === 0 ? 'settings.calendar.levelSmallest' : 'settings.calendar.levelNth',
  ).replace('{n}', String(levelIdx + 1));
  const buttons = document.createElement('span');
  buttons.className = 'settings-calsys-level-buttons';
  const mkMove = (delta, label, titleKey) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn settings-calsys-level-move';
    btn.id = `settings-calsys-level-${calIdx}-${levelIdx}-${delta < 0 ? 'up' : 'down'}`;
    btn.textContent = label;
    btn.title = t(titleKey);
    const target = levelIdx + delta;
    btn.disabled = target < 0 || target >= calDraft.levels.length;
    btn.addEventListener('click', () => {
      const tmp = calDraft.levels[levelIdx];
      calDraft.levels[levelIdx] = calDraft.levels[target];
      calDraft.levels[target] = tmp;
      renderActiveSection();
    });
    return btn;
  };
  // „größer" steht weiter unten in der Liste; ▲ schiebt Richtung kleinste.
  buttons.append(
    mkMove(-1, '▲', 'settings.calendar.levelMoveUp'),
    mkMove(1, '▼', 'settings.calendar.levelMoveDown'),
  );
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.id = `settings-calsys-level-${calIdx}-${levelIdx}-remove`;
  removeBtn.className = 'btn settings-calsys-level-remove';
  removeBtn.textContent = t('settings.calendar.levelRemove');
  removeBtn.addEventListener('click', () => {
    calDraft.levels.splice(levelIdx, 1);
    renderActiveSection();
  });
  buttons.appendChild(removeBtn);
  head.append(title, buttons);
  box.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'settings-calsys-level-grid';
  const nameCell = document.createElement('label');
  nameCell.className = 'settings-calsys-numcell settings-calsys-level-name';
  const nameLabel = document.createElement('span');
  nameLabel.textContent = t('settings.calendar.levelName');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = `settings-calsys-level-${calIdx}-${levelIdx}-name`;
  nameInput.className = 'settings-input';
  nameInput.value = level.name;
  nameInput.addEventListener('input', () => {
    level.name = nameInput.value;
    onChange();
  });
  nameCell.append(nameLabel, nameInput);
  const sectionCell = document.createElement('label');
  sectionCell.className = 'settings-calsys-numcell';
  const sectionLabel = document.createElement('span');
  sectionLabel.textContent = t('settings.calendar.levelSection');
  const sectionInput = document.createElement('input');
  sectionInput.type = 'text';
  sectionInput.id = `settings-calsys-level-${calIdx}-${levelIdx}-section`;
  sectionInput.className = 'settings-input';
  sectionInput.value = level.section;
  sectionInput.addEventListener('change', () => {
    level.section = sectionInput.value;
    // Bereichs-Wechsel verschiebt die Zeit/Datum-Grenze → Segment-Felder neu.
    renderActiveSection();
  });
  sectionCell.append(sectionLabel, sectionInput);
  grid.append(
    nameCell,
    sectionCell,
    buildCalSysNumCell(
      t('settings.calendar.levelStart'),
      `settings-calsys-level-${calIdx}-${levelIdx}-start`,
      level.start,
      60,
      (v) => {
        level.start = v;
        onChange();
      },
    ),
  );
  box.appendChild(grid);

  if (levelIdx > 0) {
    const relRow = document.createElement('div');
    relRow.className = 'settings-calsys-level-rel';
    const typeSelect = document.createElement('select');
    typeSelect.id = `settings-calsys-level-${calIdx}-${levelIdx}-type`;
    typeSelect.className = 'settings-input';
    for (const [value, key] of [
      ['factor', 'settings.calendar.relFactor'],
      ['lengths', 'settings.calendar.relLengths'],
      ['leap', 'settings.calendar.relLeap'],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = t(key);
      typeSelect.appendChild(option);
    }
    typeSelect.value = level.relType || 'factor';
    if (!level.relType) level.relType = 'factor';
    typeSelect.addEventListener('change', () => {
      level.relType = typeSelect.value;
      renderActiveSection();
    });
    const typeCell = document.createElement('label');
    typeCell.className = 'settings-calsys-numcell settings-calsys-level-type';
    const typeLabel = document.createElement('span');
    typeLabel.textContent = t('settings.calendar.levelRelType');
    typeCell.append(typeLabel, typeSelect);
    relRow.appendChild(typeCell);

    if (level.relType === 'factor') {
      relRow.appendChild(
        buildCalSysNumCell(
          t('settings.calendar.factorCount'),
          `settings-calsys-level-${calIdx}-${levelIdx}-count`,
          level.factorCount,
          70,
          (v) => {
            level.factorCount = v;
            onChange();
          },
        ),
      );
    }
    if (level.relType === 'leap') {
      const below = calDraft.levels[levelIdx - 1];
      if (below && below.relType === 'lengths') {
        const auto = document.createElement('span');
        auto.className = 'settings-calsys-leap-auto';
        auto.textContent = t('settings.calendar.leapCountAuto').replace(
          '{count}',
          String(below.table.length),
        );
        relRow.appendChild(auto);
      } else {
        relRow.appendChild(
          buildCalSysNumCell(
            t('settings.calendar.factorCount'),
            `settings-calsys-level-${calIdx}-${levelIdx}-count`,
            level.leapCount,
            70,
            (v) => {
              level.leapCount = v;
              onChange();
            },
          ),
        );
      }
      relRow.append(
        buildCalSysNumCell(
          t('settings.calendar.leapTarget'),
          `settings-calsys-level-${calIdx}-${levelIdx}-target`,
          level.leapTarget,
          60,
          (v) => {
            level.leapTarget = v;
            onChange();
          },
        ),
        buildCalSysNumCell(
          t('settings.calendar.leapExtra'),
          `settings-calsys-level-${calIdx}-${levelIdx}-extra`,
          level.leapExtra,
          60,
          (v) => {
            level.leapExtra = v;
            onChange();
          },
        ),
      );
    }
    box.appendChild(relRow);

    if (level.relType === 'lengths') {
      const tableBox = document.createElement('div');
      tableBox.className = 'settings-calsys-table';
      level.table.forEach((row, rowIdx) => {
        const tr = document.createElement('div');
        tr.className = 'settings-calsys-table-row';
        const nameIn = document.createElement('input');
        nameIn.type = 'text';
        nameIn.id = `settings-calsys-table-${calIdx}-${levelIdx}-${rowIdx}-name`;
        nameIn.className = 'settings-input';
        nameIn.placeholder = t('settings.calendar.tableName');
        nameIn.value = row.name;
        nameIn.addEventListener('input', () => {
          row.name = nameIn.value;
          onChange();
        });
        tr.appendChild(nameIn);
        tr.appendChild(
          buildCalSysNumCell(
            t('settings.calendar.tableLength'),
            `settings-calsys-table-${calIdx}-${levelIdx}-${rowIdx}-length`,
            row.length,
            70,
            (v) => {
              row.length = v;
              onChange();
            },
          ),
        );
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn settings-calsys-row-remove';
        del.textContent = t('settings.calendar.rowRemove');
        del.addEventListener('click', () => {
          level.table.splice(rowIdx, 1);
          renderActiveSection();
        });
        tr.appendChild(del);
        tableBox.appendChild(tr);
      });
      const addRow = document.createElement('button');
      addRow.type = 'button';
      addRow.id = `settings-calsys-table-${calIdx}-${levelIdx}-add`;
      addRow.className = 'btn settings-calsys-row-add';
      addRow.textContent = t('settings.calendar.tableRowAdd');
      addRow.addEventListener('click', () => {
        level.table.push({ name: '', length: '' });
        renderActiveSection();
      });
      tableBox.appendChild(addRow);
      box.appendChild(tableBox);
    }

    if (level.relType === 'leap') {
      const rulesBox = document.createElement('div');
      rulesBox.className = 'settings-calsys-table';
      level.leapRules.forEach((cycle, ruleIdx) => {
        const tr = document.createElement('div');
        tr.className = 'settings-calsys-table-row';
        tr.appendChild(
          buildCalSysNumCell(
            t(ruleIdx % 2 === 0 ? 'settings.calendar.leapRuleOn' : 'settings.calendar.leapRuleOff'),
            `settings-calsys-leap-${calIdx}-${levelIdx}-${ruleIdx}`,
            cycle,
            70,
            (v) => {
              level.leapRules[ruleIdx] = v;
              onChange();
            },
          ),
        );
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn settings-calsys-row-remove';
        del.textContent = t('settings.calendar.rowRemove');
        del.addEventListener('click', () => {
          level.leapRules.splice(ruleIdx, 1);
          renderActiveSection();
        });
        tr.appendChild(del);
        rulesBox.appendChild(tr);
      });
      const addRule = document.createElement('button');
      addRule.type = 'button';
      addRule.id = `settings-calsys-leap-${calIdx}-${levelIdx}-add`;
      addRule.className = 'btn settings-calsys-row-add';
      addRule.textContent = t('settings.calendar.leapRuleAdd');
      addRule.addEventListener('click', () => {
        level.leapRules.push('');
        renderActiveSection();
      });
      rulesBox.appendChild(addRule);
      box.appendChild(rulesBox);
    }
  }
  container.appendChild(box);
}

// Auswahl-Feld über die Ebenen des Kalenders (für Zyklen und Gruppierungen).
function buildCalSysLevelSelect(id, calDraft, current, onChange, filter) {
  const select = document.createElement('select');
  select.id = id;
  select.className = 'settings-input';
  calDraft.levels.forEach((level, i) => {
    if (filter && !filter(level, i)) return;
    const option = document.createElement('option');
    option.value = level.id;
    option.textContent = String(level.name || level.id);
    select.appendChild(option);
  });
  if (current) select.value = current;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

// Kalender-Editor (Formular-Gruppe eines Kalenders im Block-Detail).
function buildCalendarEditor(container, block, calDraft, calIdx) {
  const group = document.createElement('div');
  group.className = 'settings-calsys-cal';
  const head = document.createElement('div');
  head.className = 'settings-journals-journal-head';
  const title = document.createElement('h5');
  title.className = 'settings-journals-journal-title';
  title.textContent = String(calDraft.name || '').trim() || t('settings.calendar.calUntitled');
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.id = `settings-calsys-cal-remove-${calIdx}`;
  removeBtn.className = 'btn settings-calsys-cal-remove';
  removeBtn.textContent = t('settings.calendar.calRemove');
  removeBtn.addEventListener('click', () => {
    block.calendars.splice(calIdx, 1);
    renderActiveSection();
  });
  head.append(title, removeBtn);
  group.appendChild(head);

  // Weiche Validierung: Hinweis-Zeile pro Kalender, gespeist aus der
  // Kern-Normalisierung; die Vorschau nutzt denselben Normalisierungs-Stand.
  const hint = document.createElement('p');
  hint.className = 'settings-row-hint settings-calsys-invalid';
  hint.id = `settings-calsys-cal-invalid-${calIdx}`;
  const previewOut = document.createElement('p');
  previewOut.className = 'settings-row-hint settings-calsys-preview';
  previewOut.id = `settings-calsys-preview-${calIdx}`;
  const refresh = () => {
    const normalized = calSysNormalizedDraft(calDraft);
    hint.hidden = !!normalized;
    hint.textContent = normalized ? '' : t('settings.calendar.invalidHint');
    if (!normalized) {
      previewOut.textContent = t('settings.calendar.previewUnavailable');
      previewOut.classList.add('settings-calsys-preview-error');
      return;
    }
    const parsed = parseCanonical(normalized, calDraft.previewInput);
    if (!parsed.ok) {
      previewOut.textContent = t('settings.calendar.previewInvalidValue');
      previewOut.classList.add('settings-calsys-preview-error');
      return;
    }
    previewOut.classList.remove('settings-calsys-preview-error');
    let text = t('settings.calendar.previewOk')
      .replace('{canonical}', formatTuple(normalized, parsed.tuple) || '')
      .replace('{named}', formatTuple(normalized, parsed.tuple, { named: true }) || '');
    const cycle = normalized.cycles.length > 0 ? cycleAt(normalized, parsed.tuple) : null;
    if (cycle && cycle.positionName) {
      text += t('settings.calendar.previewCycle')
        .replace('{name}', cycle.name)
        .replace('{position}', cycle.positionName);
    }
    previewOut.textContent = text;
  };

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = `settings-calsys-cal-name-${calIdx}`;
  nameInput.className = 'settings-input';
  nameInput.value = calDraft.name;
  nameInput.addEventListener('input', () => {
    calDraft.name = nameInput.value;
    title.textContent = nameInput.value.trim() || t('settings.calendar.calUntitled');
  });
  group.appendChild(buildSettingsRow('settings.calendar.calNameLabel', nameInput));
  group.appendChild(hint);

  // Ebenen (kleinste zuerst).
  const levelsHeading = document.createElement('h4');
  levelsHeading.className = 'settings-export-group-title';
  levelsHeading.textContent = t('settings.calendar.levelsGroup');
  group.appendChild(levelsHeading);
  calDraft.levels.forEach((level, levelIdx) => {
    buildCalSysLevelEditor(group, calDraft, level, levelIdx, calIdx, refresh);
  });
  const levelAdd = document.createElement('button');
  levelAdd.type = 'button';
  levelAdd.id = `settings-calsys-level-add-${calIdx}`;
  levelAdd.className = 'btn settings-calsys-row-add';
  levelAdd.textContent = t('settings.calendar.levelAdd');
  levelAdd.addEventListener('click', () => {
    const taken = new Set(calDraft.levels.map((l) => l.id));
    calDraft.levels.push({
      id: calSysNextId('ebene', taken),
      name: '',
      section: calDraft.levels.length ? calDraft.levels[calDraft.levels.length - 1].section : '',
      start: '1',
      relType: 'factor',
      factorCount: '',
      table: [],
      leapCount: '',
      leapRules: [],
      leapTarget: '',
      leapExtra: '',
    });
    renderActiveSection();
  });
  group.appendChild(levelAdd);

  const dateLevels = calSysDateLevels(calDraft.levels);

  // Epochen (konstruktiv nahtlos: nur Start-Daten, Ende = nächster Start).
  const epochsHeading = document.createElement('h4');
  epochsHeading.className = 'settings-export-group-title';
  epochsHeading.textContent = t('settings.calendar.epochsGroup');
  group.appendChild(epochsHeading);
  const epochHint = document.createElement('p');
  epochHint.className = 'settings-row-hint';
  epochHint.textContent = t('settings.calendar.epochSeamlessHint');
  group.appendChild(epochHint);
  calDraft.epochs.forEach((epoch, epochIdx) => {
    const box = document.createElement('div');
    box.className = 'settings-calsys-level';
    const headRow = document.createElement('div');
    headRow.className = 'settings-calsys-level-head';
    const label = document.createElement('span');
    label.className = 'settings-calsys-level-title';
    label.textContent =
      epochIdx === 0
        ? t('settings.calendar.epochPast')
        : t('settings.calendar.epochNth').replace('{n}', String(epochIdx + 1));
    headRow.appendChild(label);
    if (epochIdx > 0) {
      const del = document.createElement('button');
      del.type = 'button';
      del.id = `settings-calsys-epoch-remove-${calIdx}-${epochIdx}`;
      del.className = 'btn settings-calsys-row-remove';
      del.textContent = t('settings.calendar.rowRemove');
      del.addEventListener('click', () => {
        calDraft.epochs.splice(epochIdx, 1);
        renderActiveSection();
      });
      headRow.appendChild(del);
    }
    box.appendChild(headRow);
    const grid = document.createElement('div');
    grid.className = 'settings-calsys-level-grid';
    const nameCell = document.createElement('label');
    nameCell.className = 'settings-calsys-numcell settings-calsys-level-name';
    const nameLabel = document.createElement('span');
    nameLabel.textContent = t('settings.calendar.epochName');
    const epochName = document.createElement('input');
    epochName.type = 'text';
    epochName.id = `settings-calsys-epoch-${calIdx}-${epochIdx}-name`;
    epochName.className = 'settings-input';
    epochName.value = epoch.name;
    epochName.addEventListener('input', () => {
      epoch.name = epochName.value;
      refresh();
    });
    nameCell.append(nameLabel, epochName);
    const abbrCell = document.createElement('label');
    abbrCell.className = 'settings-calsys-numcell';
    const abbrLabel = document.createElement('span');
    abbrLabel.textContent = t('settings.calendar.epochAbbr');
    const abbrInput = document.createElement('input');
    abbrInput.type = 'text';
    abbrInput.id = `settings-calsys-epoch-${calIdx}-${epochIdx}-abbr`;
    abbrInput.className = 'settings-input settings-calsys-abbr';
    abbrInput.value = epoch.abbr;
    abbrInput.addEventListener('input', () => {
      epoch.abbr = abbrInput.value;
      refresh();
    });
    abbrCell.append(abbrLabel, abbrInput);
    grid.append(nameCell, abbrCell);
    box.appendChild(grid);
    if (epochIdx > 0) {
      epoch.startSegs = calSysSyncSegs(epoch.startSegs, dateLevels.length);
      buildCalSysSegRow(
        box,
        'settings.calendar.epochStart',
        `settings-calsys-epoch-${calIdx}-${epochIdx}-start`,
        epoch.startSegs,
        dateLevels,
        refresh,
      );
    }
    group.appendChild(box);
  });
  const epochAdd = document.createElement('button');
  epochAdd.type = 'button';
  epochAdd.id = `settings-calsys-epoch-add-${calIdx}`;
  epochAdd.className = 'btn settings-calsys-row-add';
  epochAdd.textContent = t('settings.calendar.epochAdd');
  epochAdd.addEventListener('click', () => {
    calDraft.epochs.push({ name: '', abbr: '', startSegs: [] });
    renderActiveSection();
  });
  group.appendChild(epochAdd);

  // Eigenständige Zyklen (Woche).
  const cyclesHeading = document.createElement('h4');
  cyclesHeading.className = 'settings-export-group-title';
  cyclesHeading.textContent = t('settings.calendar.cyclesGroup');
  group.appendChild(cyclesHeading);
  calDraft.cycles.forEach((cycle, cycleIdx) => {
    const box = document.createElement('div');
    box.className = 'settings-calsys-level';
    const headRow = document.createElement('div');
    headRow.className = 'settings-calsys-level-head';
    const nameIn = document.createElement('input');
    nameIn.type = 'text';
    nameIn.id = `settings-calsys-cycle-${calIdx}-${cycleIdx}-name`;
    nameIn.className = 'settings-input';
    nameIn.placeholder = t('settings.calendar.cycleName');
    nameIn.value = cycle.name;
    nameIn.addEventListener('input', () => {
      cycle.name = nameIn.value;
      refresh();
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.id = `settings-calsys-cycle-remove-${calIdx}-${cycleIdx}`;
    del.className = 'btn settings-calsys-row-remove';
    del.textContent = t('settings.calendar.rowRemove');
    del.addEventListener('click', () => {
      calDraft.cycles.splice(cycleIdx, 1);
      renderActiveSection();
    });
    headRow.append(nameIn, del);
    box.appendChild(headRow);
    const relRow = document.createElement('div');
    relRow.className = 'settings-calsys-level-rel';
    const ofCell = document.createElement('label');
    ofCell.className = 'settings-calsys-numcell';
    const ofLabel = document.createElement('span');
    ofLabel.textContent = t('settings.calendar.cycleOf');
    ofCell.append(
      ofLabel,
      buildCalSysLevelSelect(
        `settings-calsys-cycle-${calIdx}-${cycleIdx}-of`,
        calDraft,
        cycle.of,
        (v) => {
          cycle.of = v;
          refresh();
        },
      ),
    );
    relRow.append(
      ofCell,
      buildCalSysNumCell(
        t('settings.calendar.cycleLength'),
        `settings-calsys-cycle-${calIdx}-${cycleIdx}-length`,
        cycle.length,
        60,
        (v) => {
          cycle.length = v;
          refresh();
        },
      ),
      buildCalSysNumCell(
        t('settings.calendar.cycleAnchorPosition'),
        `settings-calsys-cycle-${calIdx}-${cycleIdx}-position`,
        cycle.anchorPosition,
        60,
        (v) => {
          cycle.anchorPosition = v;
          refresh();
        },
      ),
      buildCalSysNumCell(
        t('settings.calendar.cycleRule'),
        `settings-calsys-cycle-${calIdx}-${cycleIdx}-rule`,
        cycle.ruleIndex,
        60,
        (v) => {
          cycle.ruleIndex = v;
          refresh();
        },
      ),
    );
    box.appendChild(relRow);
    cycle.anchorSegs = calSysSyncSegs(cycle.anchorSegs, dateLevels.length);
    buildCalSysSegRow(
      box,
      'settings.calendar.cycleAnchorDate',
      `settings-calsys-cycle-${calIdx}-${cycleIdx}-anchor`,
      cycle.anchorSegs,
      dateLevels,
      refresh,
    );
    const namesIn = document.createElement('input');
    namesIn.type = 'text';
    namesIn.id = `settings-calsys-cycle-${calIdx}-${cycleIdx}-names`;
    namesIn.className = 'settings-input';
    namesIn.value = cycle.namesText;
    namesIn.addEventListener('input', () => {
      cycle.namesText = namesIn.value;
      refresh();
    });
    box.appendChild(buildSettingsRow('settings.calendar.cycleNames', namesIn));
    group.appendChild(box);
  });
  const cycleAdd = document.createElement('button');
  cycleAdd.type = 'button';
  cycleAdd.id = `settings-calsys-cycle-add-${calIdx}`;
  cycleAdd.className = 'btn settings-calsys-row-add';
  cycleAdd.textContent = t('settings.calendar.cycleAdd');
  cycleAdd.addEventListener('click', () => {
    const taken = new Set(calDraft.cycles.map((c) => c.id));
    calDraft.cycles.push({
      id: calSysNextId('zyklus', taken),
      name: '',
      of: calDraft.levels.length ? calDraft.levels[0].id : '',
      length: '',
      namesText: '',
      anchorSegs: [],
      anchorPosition: '1',
      ruleIndex: '',
    });
    renderActiveSection();
  });
  group.appendChild(cycleAdd);

  // Abgeleitete Gruppierungen (Quartal).
  const groupsHeading = document.createElement('h4');
  groupsHeading.className = 'settings-export-group-title';
  groupsHeading.textContent = t('settings.calendar.groupsGroup');
  group.appendChild(groupsHeading);
  calDraft.groups.forEach((grp, grpIdx) => {
    const row = document.createElement('div');
    row.className = 'settings-calsys-table-row';
    const nameIn = document.createElement('input');
    nameIn.type = 'text';
    nameIn.id = `settings-calsys-group-${calIdx}-${grpIdx}-name`;
    nameIn.className = 'settings-input';
    nameIn.placeholder = t('settings.calendar.groupName');
    nameIn.value = grp.name;
    nameIn.addEventListener('input', () => {
      grp.name = nameIn.value;
      refresh();
    });
    row.appendChild(nameIn);
    const ofCell = document.createElement('label');
    ofCell.className = 'settings-calsys-numcell';
    const ofLabel = document.createElement('span');
    ofLabel.textContent = t('settings.calendar.groupOf');
    ofCell.append(
      ofLabel,
      buildCalSysLevelSelect(
        `settings-calsys-group-${calIdx}-${grpIdx}-of`,
        calDraft,
        grp.of,
        (v) => {
          grp.of = v;
          refresh();
        },
        (_level, i) => i < calDraft.levels.length - 1,
      ),
    );
    row.appendChild(ofCell);
    row.appendChild(
      buildCalSysNumCell(
        t('settings.calendar.groupSize'),
        `settings-calsys-group-${calIdx}-${grpIdx}-size`,
        grp.size,
        60,
        (v) => {
          grp.size = v;
          refresh();
        },
      ),
    );
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn settings-calsys-row-remove';
    del.textContent = t('settings.calendar.rowRemove');
    del.addEventListener('click', () => {
      calDraft.groups.splice(grpIdx, 1);
      renderActiveSection();
    });
    row.appendChild(del);
    group.appendChild(row);
  });
  const groupAdd = document.createElement('button');
  groupAdd.type = 'button';
  groupAdd.id = `settings-calsys-group-add-${calIdx}`;
  groupAdd.className = 'btn settings-calsys-row-add';
  groupAdd.textContent = t('settings.calendar.groupAdd');
  groupAdd.addEventListener('click', () => {
    const taken = new Set(calDraft.groups.map((g) => g.id));
    calDraft.groups.push({
      id: calSysNextId('gruppe', taken),
      name: '',
      of: calDraft.levels.length ? calDraft.levels[0].id : '',
      size: '',
    });
    renderActiveSection();
  });
  group.appendChild(groupAdd);

  // Block-Achsen-Abbildung (Anker plus Skala).
  const axisHeading = document.createElement('h4');
  axisHeading.className = 'settings-export-group-title';
  axisHeading.textContent = t('settings.calendar.axisGroup');
  group.appendChild(axisHeading);
  const axisHint = document.createElement('p');
  axisHint.className = 'settings-row-hint';
  axisHint.textContent = t('settings.calendar.axisHint');
  group.appendChild(axisHint);
  const allLevelsDesc = calDraft.levels.slice().reverse();
  calDraft.anchorSegs = calSysSyncSegs(calDraft.anchorSegs, calDraft.levels.length);
  buildCalSysSegRow(
    group,
    'settings.calendar.axisAnchor',
    `settings-calsys-anchor-${calIdx}`,
    calDraft.anchorSegs,
    allLevelsDesc,
    refresh,
  );
  const scaleRow = document.createElement('div');
  scaleRow.className = 'settings-calsys-level-rel';
  scaleRow.append(
    buildCalSysNumCell(
      t('settings.calendar.axisScaleNum'),
      `settings-calsys-scale-num-${calIdx}`,
      calDraft.scaleNum,
      70,
      (v) => {
        calDraft.scaleNum = v;
        refresh();
      },
    ),
    buildCalSysNumCell(
      t('settings.calendar.axisScaleDen'),
      `settings-calsys-scale-den-${calIdx}`,
      calDraft.scaleDen,
      70,
      (v) => {
        calDraft.scaleDen = v;
        refresh();
      },
    ),
  );
  group.appendChild(scaleRow);

  // Live-Vorschau (Beispiel-Wert, kanonisch eingegeben).
  const previewHeading = document.createElement('h4');
  previewHeading.className = 'settings-export-group-title';
  previewHeading.textContent = t('settings.calendar.previewGroup');
  group.appendChild(previewHeading);
  const previewIn = document.createElement('input');
  previewIn.type = 'text';
  previewIn.id = `settings-calsys-preview-input-${calIdx}`;
  previewIn.className = 'settings-input';
  previewIn.value = calDraft.previewInput;
  previewIn.addEventListener('input', () => {
    calDraft.previewInput = previewIn.value;
    refresh();
  });
  group.appendChild(buildSettingsRow('settings.calendar.previewInput', previewIn));
  group.appendChild(previewOut);

  refresh();
  container.appendChild(group);
}

// Detailansicht eines Blocks: Kalender-Editoren, „Kalender hinzufügen",
// Vorlage-Knopf und „Block schließen" (Muster Journal-Regal-Detail).
function renderCalendarBlockDetail(container, values) {
  const block = values.blocks[values.openBlock];
  if (!block) {
    values.openBlock = null;
    renderCalendarBlocksOverview(container, values);
    return;
  }
  const head = document.createElement('div');
  head.className = 'settings-journals-detail-head';
  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title settings-journals-detail-title';
  heading.textContent = t('settings.calendar.blockDetailTitle').replace(
    '{name}',
    String(block.name || '').trim() || t('settings.calendar.calUntitled'),
  );
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.id = 'settings-calsys-block-close';
  closeBtn.className = 'btn settings-calsys-block-close';
  closeBtn.textContent = t('settings.calendar.blockClose');
  closeBtn.addEventListener('click', () => {
    values.openBlock = null;
    renderActiveSection();
  });
  head.append(heading, closeBtn);
  container.appendChild(head);

  if (block.calendars.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'settings-row-hint';
    empty.textContent = t('settings.calendar.blockEmpty');
    container.appendChild(empty);
  }
  block.calendars.forEach((calDraft, calIdx) => {
    buildCalendarEditor(container, block, calDraft, calIdx);
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.id = 'settings-calsys-cal-add';
  addBtn.className = 'btn settings-calsys-cal-add';
  addBtn.textContent = t('settings.calendar.calAdd');
  addBtn.addEventListener('click', () => {
    block.calendars.push({
      id: '',
      name: '',
      levels: [
        {
          id: 'ebene-1',
          name: '',
          section: '',
          start: '1',
          relType: '',
          factorCount: '',
          table: [],
          leapCount: '',
          leapRules: [],
          leapTarget: '',
          leapExtra: '',
        },
      ],
      cycles: [],
      groups: [],
      epochs: [
        { name: '', abbr: '', startSegs: null },
        { name: '', abbr: '', startSegs: ['1'] },
      ],
      anchorSegs: [],
      scaleNum: '',
      scaleDen: '',
      previewInput: '',
    });
    renderActiveSection();
  });
  const templateBtn = document.createElement('button');
  templateBtn.type = 'button';
  templateBtn.id = 'settings-calsys-cal-template';
  templateBtn.className = 'btn settings-calsys-cal-template';
  templateBtn.textContent = t('settings.calendar.calTemplate');
  templateBtn.addEventListener('click', () => {
    // Vorlage lokalisiert über die Kern-Fixture; die id entsteht (eindeutig)
    // erst beim Anwenden, der Entwurf trägt nur Namen und Struktur.
    const template = createGregorianTemplate({
      name: t('settings.calendar.templateName'),
      monthNames: t('settings.calendar.templateMonths').split(','),
      weekdayNames: t('settings.calendar.templateWeekdays').split(','),
      weekName: t('settings.calendar.templateWeek'),
      epochNames: [
        {
          name: t('settings.calendar.templateEpochPast'),
          abbr: t('settings.calendar.templateEpochPast'),
        },
        {
          name: t('settings.calendar.templateEpochFuture'),
          abbr: t('settings.calendar.templateEpochFuture'),
        },
      ],
      levelNames: {
        second: t('settings.calendar.templateLevelSecond'),
        minute: t('settings.calendar.templateLevelMinute'),
        hour: t('settings.calendar.templateLevelHour'),
        day: t('settings.calendar.templateLevelDay'),
        month: t('settings.calendar.templateLevelMonth'),
        year: t('settings.calendar.templateLevelYear'),
      },
      sectionNames: {
        time: t('settings.calendar.templateSectionTime'),
        date: t('settings.calendar.templateSectionDate'),
      },
      groupNames: {
        quarter: t('settings.calendar.templateQuarter'),
        halfYear: t('settings.calendar.templateHalfYear'),
      },
    });
    const normalized = normalizeCalendarConfig({
      blocks: [{ id: 'probe', calendars: [template] }],
    });
    if (!normalized) return;
    const draft = calendarToDraft(normalized.blocks[0].calendars[0]);
    draft.id = '';
    block.calendars.push(draft);
    renderActiveSection();
  });
  const btnRow = document.createElement('div');
  btnRow.className = 'settings-calsys-detail-buttons';
  btnRow.append(addBtn, templateBtn);
  container.appendChild(btnRow);
}

function renderCalendarSection(container, draft) {
  const values = draft.calendar;
  if (!values) {
    const loading = document.createElement('p');
    loading.className = 'settings-row-hint';
    loading.textContent = t('settings.calendar.loading');
    container.appendChild(loading);
    return;
  }
  if (!values.hasArea) {
    const hint = document.createElement('p');
    hint.className = 'settings-row-hint';
    hint.id = 'settings-calsys-no-area';
    hint.textContent = t('settings.calendar.noArea');
    container.appendChild(hint);
    return;
  }
  const intro = document.createElement('p');
  intro.className = 'settings-row-hint';
  intro.textContent = t('settings.calendar.intro').replace('{name}', values.areaName);
  container.appendChild(intro);
  if (values.openBlock === null || values.openBlock === undefined) {
    renderCalendarBlocksOverview(container, values);
  } else {
    renderCalendarBlockDetail(container, values);
  }
}

// Harte Validierung beim Anwenden: Block-/Kalender-Namen, Eindeutigkeit der
// Kalender-Namen (Bezugsname der Wert-Syntax) und Kern-Normalisierung pro
// Kalender (ein abgelehnter Kalender blockiert mit konkretem Hinweis).
function validateCalendarSection(draft) {
  const values = draft.calendar;
  if (!values || !values.hasArea) return null;
  const seenNames = new Set();
  for (const block of values.blocks) {
    const blockName = String(block.name || '').trim();
    if (blockName === '') return t('settings.calendar.error.blockName');
    for (const calDraft of block.calendars) {
      const calName = String(calDraft.name || '').trim();
      if (calName === '') {
        return t('settings.calendar.error.calName').replace('{block}', blockName);
      }
      const lower = calName.toLowerCase();
      if (seenNames.has(lower)) {
        return t('settings.calendar.error.duplicateName').replace('{name}', calName);
      }
      seenNames.add(lower);
      if (!calSysNormalizedDraft(calDraft)) {
        return t('settings.calendar.error.calInvalid')
          .replace('{name}', calName)
          .replace('{block}', blockName);
      }
    }
  }
  return null;
}

async function applyCalendarSection(draft) {
  const values = draft.calendar;
  if (!values || !values.hasArea) return;
  // Neue Blöcke/Kalender erhalten ihre stabile id erst jetzt (Slug aus dem
  // Namen, Muster Journale).
  const takenBlocks = new Set(values.blocks.map((b) => b.id).filter(Boolean));
  for (const block of values.blocks) {
    if (!String(block.id || '').trim()) {
      block.id = calSysIdFromName(block.name, 'block', takenBlocks);
      takenBlocks.add(block.id);
    }
    const takenCals = new Set(block.calendars.map((c) => c.id).filter(Boolean));
    for (const calDraft of block.calendars) {
      if (!String(calDraft.id || '').trim()) {
        calDraft.id = calSysIdFromName(calDraft.name, 'kalender', takenCals);
        takenCals.add(calDraft.id);
      }
    }
  }
  const out = calendarConfigPersistForm(values);
  if (JSON.stringify(out) === JSON.stringify(draft.calendarSnapshot)) return;
  let result;
  try {
    result = await api.calendarSetAreaConfig(out);
  } catch {
    result = null;
  }
  if (!result || !result.ok) {
    // Defekte Bereichsdatei wird nie überschrieben; sichtbarer Hinweis.
    showStatusbarHint(null, {
      text: t('settings.calendar.areaWriteFailed'),
      error: true,
      duration: 4000,
    });
    return;
  }
  draft.calendarSnapshot = out;
}

// --- Bereich Export (4T-0304, Epic 3E-0054) ----------------------------------
// Drei Felder fuer den PDF-Export: Seitenformat, Ausrichtung, Raender.
// Wertelisten und Defaults kommen aus src/shared/pdf-options.js (dieselbe
// Quelle liest der Main beim Druck); persistiert wird erst bei Anwenden/OK.
// Die Format-Namen (A4, Letter, ...) sind Eigennamen und erscheinen
// unuebersetzt (Muster der Schriftart-Vorschlaege im Bereich Darstellung).

async function readPdfExportFromStore() {
  return normalizePdfExportSettings({
    pageSize: await api.getSetting('export.pdf.pageSize'),
    landscape: await api.getSetting('export.pdf.landscape'),
    margins: await api.getSetting('export.pdf.margins'),
  });
}

// Select-Baustein: options als [wert, label]-Paare.
function buildExportSelect(id, options, value, onChange) {
  const select = document.createElement('select');
  select.id = id;
  select.className = 'settings-input';
  for (const [optionValue, label] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function renderExportSection(container, draft) {
  const values = draft.exportPdf || { ...PDF_EXPORT_DEFAULTS };
  // Aenderungs-Guard wie im Bereich Darstellung: solange der Store-Stand
  // nicht geladen ist, verwerfen Eingaben nichts Persistiertes.
  const set = (key, value) => {
    if (!draft.exportPdf) draft.exportPdf = { ...values };
    draft.exportPdf[key] = value;
  };

  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title';
  heading.textContent = t('settings.export.pdfGroup');
  container.appendChild(heading);

  container.appendChild(
    buildSettingsRow(
      'settings.export.pageSize',
      buildExportSelect(
        'settings-export-page-size',
        PDF_PAGE_SIZES.map((size) => [size, size]),
        values.pageSize,
        (value) => set('pageSize', value),
      ),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.export.orientation',
      buildExportSelect(
        'settings-export-orientation',
        [
          ['portrait', t('settings.export.orientation.portrait')],
          ['landscape', t('settings.export.orientation.landscape')],
        ],
        values.landscape ? 'landscape' : 'portrait',
        (value) => set('landscape', value === 'landscape'),
      ),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.export.margins',
      buildExportSelect(
        'settings-export-margins',
        Object.keys(PDF_MARGIN_PRESETS).map((level) => [
          level,
          t(`settings.export.margins.${level}`),
        ]),
        values.margins,
        (value) => set('margins', value),
      ),
    ),
  );
}

async function applyExportSection(draft) {
  // Noch nicht aus dem Store geladen und nicht angefasst: nichts zu tun.
  if (!draft.exportPdf) return;
  const values = normalizePdfExportSettings(draft.exportPdf);
  // Nur bei tatsaechlicher Aenderung persistieren (Muster der Bereiche
  // Verhalten und Tastenkuerzel) — jedes store.set schreibt die komplette
  // Config-Datei, unnoetige Schreibvorgaenge verlaengern sonst bei jedem
  // OK die Persist-Kette aller Bereiche.
  if (JSON.stringify(values) !== JSON.stringify(draft.exportPdfSnapshot)) {
    await persistSetting('export.pdf.pageSize', values.pageSize);
    await persistSetting('export.pdf.landscape', values.landscape);
    await persistSetting('export.pdf.margins', values.margins);
    draft.exportPdfSnapshot = { ...values };
  }
  draft.exportPdf = { ...values };
}

// --- Bereich Task-Status (4T-0204) -----------------------------------------------
// Arbeitskopie des aufgeloesten Sets fuer die Seiten-Sitzung. Default-
// Eintraege: Zeichen und Bezeichnung readonly (Label kommt aus i18n),
// Farbe und Aktiv-Haken aenderbar. Custom-Eintraege: alles aenderbar
// plus Entfernen-Button.
// 4T-0497 (Epic 3E-0090): zusaetzlich pro Zeile Typ (Semantik) und
// Folge-Symbol (Ketten-Toggle), beide auch fuer builtin-Zeilen editierbar
// (freie Typ-Zuordnung ist PO-Anforderung, z.B. '*' = DONE).

// Typ-Konstante -> i18n-Key des Anzeige-Labels (Mapping 4T-0497).
const TASK_STATE_TYPE_LABEL_KEYS = {
  TODO: 'taskState.type.todo',
  IN_PROGRESS: 'taskState.type.inProgress',
  ON_HOLD: 'taskState.type.onHold',
  DONE: 'taskState.type.done',
  CANCELLED: 'taskState.type.cancelled',
  NON_TASK: 'taskState.type.nonTask',
};

// 4T-0497: mehrfach belegte Zeichen (in Reihenfolge des ersten Auftretens).
// Grundlage der Live-Warnung und der spezifischen Sektions-Fehlermeldung.
export function duplicateTaskStateChars(taskStates) {
  const counts = new Map();
  const order = [];
  for (const s of Array.isArray(taskStates) ? taskStates : []) {
    const ch = String((s && s.char) || '');
    if (ch.length !== 1) continue;
    if (!counts.has(ch)) {
      counts.set(ch, 0);
      order.push(ch);
    }
    counts.set(ch, counts.get(ch) + 1);
  }
  return order.filter((ch) => counts.get(ch) > 1);
}

// 4T-0497: Live-Warnung unter der Liste pflegen (unsichtbar ohne Duplikate).
function updateTaskStatesWarning(warningEl, draft) {
  if (!warningEl) return;
  const dups = duplicateTaskStateChars(draft.taskStates);
  if (dups.length === 0) {
    warningEl.hidden = true;
    warningEl.textContent = '';
  } else {
    warningEl.hidden = false;
    warningEl.textContent = t('settings.taskStates.duplicateWarning').replace(
      '{chars}',
      dups.join(' '),
    );
  }
}

function renderTaskStatesEditor(listEl, draft) {
  listEl.innerHTML = '';
  draft.taskStates.forEach((s, idx) => {
    const row = document.createElement('div');
    row.className = 'task-state-row';

    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.className = 'ts-enabled';
    enabled.checked = !!s.enabled;
    enabled.addEventListener('change', () => {
      s.enabled = enabled.checked;
    });

    const charInput = document.createElement('input');
    charInput.type = 'text';
    charInput.className = 'settings-input ts-char';
    charInput.maxLength = 1;
    charInput.value = s.char || '';
    charInput.spellcheck = false;
    if (s.builtin) charInput.readOnly = true;
    else
      charInput.addEventListener('input', () => {
        s.char = charInput.value;
        // 4T-0497: Duplikat-Warnung folgt jeder Zeichen-Aenderung live.
        updateTaskStatesWarning(
          listEl.parentElement && listEl.parentElement.querySelector('.task-states-warning'),
          draft,
        );
      });

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'settings-input ts-label';
    labelInput.value = s.label || '';
    if (s.builtin) labelInput.readOnly = true;
    else
      labelInput.addEventListener('input', () => {
        s.label = labelInput.value;
      });

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'ts-color';
    colorInput.value = /^#[0-9a-fA-F]{6}$/.test(String(s.color || '')) ? s.color : '#888888';
    colorInput.addEventListener('input', () => {
      s.color = colorInput.value;
    });

    // 4T-0497: Typ-Auswahl (auch bei builtin editierbar).
    const typeSelect = document.createElement('select');
    typeSelect.className = 'settings-input ts-type';
    for (const type of TASK_STATE_TYPES) {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = t(TASK_STATE_TYPE_LABEL_KEYS[type]);
      typeSelect.appendChild(opt);
    }
    typeSelect.value = TASK_STATE_TYPES.includes(s.type) ? s.type : 'TODO';
    typeSelect.addEventListener('change', () => {
      s.type = typeSelect.value;
    });

    // 4T-0497: Folge-Symbol des Ketten-Toggles (Einzelzeichen, Default 'x').
    const nextInput = document.createElement('input');
    nextInput.type = 'text';
    nextInput.className = 'settings-input ts-next';
    nextInput.maxLength = 1;
    nextInput.placeholder = 'x';
    nextInput.spellcheck = false;
    nextInput.value = s.next || '';
    nextInput.addEventListener('input', () => {
      s.next = nextInput.value;
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn ts-remove';
    remove.textContent = '✕';
    remove.title = t('settings.taskStates.remove');
    if (s.builtin) remove.style.visibility = 'hidden';
    else
      remove.addEventListener('click', () => {
        draft.taskStates.splice(idx, 1);
        renderTaskStatesEditor(listEl, draft);
      });

    row.append(enabled, charInput, labelInput, colorInput, typeSelect, nextInput, remove);
    listEl.appendChild(row);
  });
  // 4T-0497: Warnung nach jedem Neuaufbau der Liste aktualisieren.
  updateTaskStatesWarning(
    listEl.parentElement && listEl.parentElement.querySelector('.task-states-warning'),
    draft,
  );
}

function renderTaskStatesSection(container, draft) {
  const head = document.createElement('div');
  head.className = 'task-states-head';
  for (const key of [
    'settings.taskStates.enabled',
    'settings.taskStates.char',
    'settings.taskStates.label',
    'settings.taskStates.color',
    'settings.taskStates.type',
    'settings.taskStates.next',
  ]) {
    const span = document.createElement('span');
    span.textContent = t(key);
    head.appendChild(span);
  }
  head.appendChild(document.createElement('span'));
  container.appendChild(head);

  const list = document.createElement('div');
  list.id = 'settings-task-states-list';
  list.className = 'task-states-list';
  container.appendChild(list);

  // 4T-0497: Duplikat-Warnung unter der Liste (vor dem Editor-Lauf anlegen,
  // damit renderTaskStatesEditor sie beim ersten Aufbau schon findet).
  const warning = document.createElement('div');
  warning.id = 'settings-task-states-warning';
  warning.className = 'task-states-warning';
  warning.hidden = true;
  container.appendChild(warning);

  renderTaskStatesEditor(list, draft);

  const actions = document.createElement('div');
  actions.className = 'task-states-actions';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.id = 'btn-task-state-add';
  addBtn.className = 'btn';
  addBtn.textContent = t('settings.taskStates.add');
  addBtn.addEventListener('click', () => {
    draft.taskStates.push({
      char: '',
      builtin: false,
      color: '#888888',
      enabled: true,
      label: '',
      type: 'TODO',
      next: 'x',
    });
    renderTaskStatesEditor(list, draft);
    const last = list.lastElementChild;
    const input = last && last.querySelector('.ts-char');
    if (input) input.focus();
  });
  actions.appendChild(addBtn);
  container.appendChild(actions);
}

export function validateTaskStatesDraft(taskStates) {
  const seen = new Set();
  for (const s of taskStates) {
    const ch = String(s.char || '');
    if (ch.length !== 1) return false;
    if (TASK_STATE_FORBIDDEN_CHARS.has(ch)) return false;
    if (seen.has(ch)) return false;
    seen.add(ch);
  }
  return true;
}

function validateTaskStatesSection(draft) {
  // 4T-0497: Duplikate zuerst mit spezifischer Meldung (welche Zeichen);
  // sonstige Fehler (leer, verbotenes Zeichen) fallen auf die bestehende
  // generische Meldung zurueck.
  const dups = duplicateTaskStateChars(draft.taskStates);
  if (dups.length > 0) {
    return t('settings.taskStates.duplicateWarning').replace('{chars}', dups.join(' '));
  }
  return validateTaskStatesDraft(draft.taskStates) ? null : t('settings.taskStates.invalid');
}

// 4T-0497: Typ-/Folge-Symbol-Normalisierung beim Anwenden (Muster der
// normalize-Helfer in task-states.js). Ungueltiger Typ -> 'TODO';
// Folge-Symbol kein Einzelzeichen oder syntaxbrechend -> 'x'.
function normalizeApplyType(type) {
  return TASK_STATE_TYPES.includes(type) ? type : 'TODO';
}

function normalizeApplyNext(next) {
  const ch = typeof next === 'string' ? next : '';
  if (ch.length !== 1 || ch === '[' || ch === ']' || ch === '\\') return 'x';
  return ch;
}

// Aufgelöste Anwenden-Form des Task-Status-Entwurfs (gemeinsame Basis von
// applyTaskStatesSection und der Dirty-Erkennung, 4T-0554).
function resolvedTaskStatesFromDraft(draft) {
  return draft.taskStates.map((s) => ({
    ...s,
    char: String(s.char || ''),
    label: s.builtin
      ? t(`taskState.${s.name}.label`)
      : String(s.label || '').trim() || String(s.char || ''),
    type: normalizeApplyType(s.type),
    next: normalizeApplyNext(s.next),
  }));
}

async function applyTaskStatesSection(draft) {
  // Task-Status anwenden (lokal sofort; der Broadcast erreicht zusaetzlich
  // alle Fenster inkl. diesem — idempotent) und persistieren.
  const resolvedNew = resolvedTaskStatesFromDraft(draft);
  applyTaskStates(resolvedNew);
  await persistSetting('taskStates', toStoredTaskStates(resolvedNew));
  draft.taskStates = resolvedNew.map((s) => ({ ...s }));
}

// --- Bereich Tastenkürzel (4T-0208, Epic 3E-0015) ---------------------------------
// Tabelle aller Registry-Kommandos in den fuenf Hilfe-Gruppen, Hotkey-
// Capture pro Zeile, Konflikt-Erkennung gegen den Draft-Stand und die
// fixen Bindings, Einzel- und Gesamt-Reset. Persistiert werden nur
// Abweichungen vom Default (Store-Key 'hotkeys', siehe 4T-0207).

// Aktiver Capture-Zustand: { commandId, interim, warning } | null.
// warning: { kind: 'notAllowed' } | { kind: 'fixed', descKey }
//        | { kind: 'command', otherId, binding }.
export let hotkeyCapture = null;
// Zwei-Schritt-Zustand des Gesamt-Reset-Buttons (erster Klick bewaffnet,
// zweiter fuehrt aus; Neuoeffnen der Seite entwaffnet).
let hotkeysResetAllArmed = false;
// DOM-Referenz der zuletzt gerenderten Tastenkuerzel-Liste (Bereich kann
// gerade nicht montiert sein — dann entfallen Re-Renders einfach).
let hotkeysListEl = null;

function defaultBindingOf(cmd) {
  return cmd.defaultBindings.length > 0 ? cmd.defaultBindings[0] : '';
}

export function buildHotkeysDraftFromState() {
  const effective = mergeBindings(state.hotkeyOverrides);
  const draft = {};
  for (const cmd of COMMANDS) {
    const bindings = effective[cmd.id] || [];
    draft[cmd.id] = bindings.length > 0 ? bindings[0] : '';
  }
  return draft;
}

// Bindet ein Binding als <kbd>-Folge in den Container (lokalisierte
// Tasten-Tokens ueber die bestehende Hilfe-Pipeline); unbelegt als '—'.
function renderBindingKbds(container, binding) {
  container.innerHTML = '';
  if (!binding) {
    container.textContent = '—';
    return;
  }
  const display = bindingToDisplayString(binding);
  const parts = splitShortcutKeys(display);
  parts.forEach((part, i) => {
    if (i > 0) container.appendChild(document.createTextNode(' + '));
    const kbd = document.createElement('kbd');
    kbd.textContent = localizeKey(part);
    container.appendChild(kbd);
  });
}

// Modifier-Zwischenstand waehrend des Captures ("Strg+Umschalt+…").
function captureInterimText(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push(localizeKey('Strg'));
  if (e.altKey) parts.push(localizeKey('Alt'));
  if (e.shiftKey) parts.push(localizeKey('Umschalt'));
  parts.push('…');
  return parts.join(' + ');
}

function hotkeyRowEl(commandId) {
  return hotkeysListEl && hotkeysListEl.isConnected
    ? hotkeysListEl.querySelector(`.hotkey-row[data-command-id="${commandId}"]`)
    : null;
}

function buildHotkeyRow(cmd, hotkeysDraft) {
  const row = document.createElement('div');
  row.className = 'hotkey-row';
  row.dataset.commandId = cmd.id;
  const capturing = !!(hotkeyCapture && hotkeyCapture.commandId === cmd.id);
  if (capturing) row.classList.add('capturing');

  const label = document.createElement('span');
  label.className = 'hotkey-label';
  label.textContent = t(cmd.labelKey);
  label.title = cmd.id;

  const binding = document.createElement('span');
  binding.className = 'hotkey-binding';
  if (capturing) {
    binding.textContent = hotkeyCapture.interim || t('settings.hotkeys.capturePrompt');
    binding.classList.add('capturing');
  } else {
    renderBindingKbds(binding, hotkeysDraft[cmd.id]);
  }

  const actions = document.createElement('span');
  actions.className = 'hotkey-actions';
  if (capturing) {
    // Im Capture-Zustand: Binding entfernen oder Capture abbrechen.
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn hotkey-remove';
    removeBtn.textContent = t('settings.hotkeys.remove');
    removeBtn.addEventListener('click', () => {
      hotkeysDraft[cmd.id] = '';
      finishHotkeyCapture();
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn hotkey-capture-cancel';
    cancelBtn.textContent = t('settings.hotkeys.cancel');
    cancelBtn.addEventListener('click', () => cancelHotkeyCapture());
    actions.append(removeBtn, cancelBtn);
  } else {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn hotkey-edit';
    editBtn.textContent = t('settings.hotkeys.edit');
    editBtn.addEventListener('click', () => startHotkeyCapture(cmd.id));
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn hotkey-reset';
    resetBtn.textContent = '⟲';
    const def = defaultBindingOf(cmd);
    resetBtn.title = t('settings.hotkeys.resetTitle').replace(
      '{default}',
      def ? bindingToDisplayString(def) : '—',
    );
    resetBtn.disabled =
      normalizeBinding(hotkeysDraft[cmd.id] || '') === normalizeBinding(def || '');
    resetBtn.addEventListener('click', () => {
      // 4T-0211 (Hotfix 0.28.1): Der Default kann inzwischen von einem
      // anderen Kommando belegt sein (z.B. nach "Ueberschreiben"). Dann
      // dieselbe Inline-Warnung wie beim Capture statt eines stillen
      // Setzens — sonst entsteht ein doppelt vergebenes Binding.
      const conflict = def ? findBindingConflict(hotkeysDraft, cmd.id, def) : null;
      if (conflict) {
        startHotkeyCapture(cmd.id);
        hotkeyCapture.warning =
          conflict.type === 'command'
            ? { kind: 'command', otherId: conflict.commandId, binding: def }
            : { kind: 'fixed', descKey: conflict.descKey };
        renderHotkeysEditor();
        return;
      }
      hotkeysDraft[cmd.id] = def;
      renderHotkeysEditor();
    });
    actions.append(editBtn, resetBtn);
  }

  row.append(label, binding, actions);

  // Konflikt-/Hinweis-Box unterhalb der Zeile (nur im Capture-Zustand).
  if (capturing && hotkeyCapture.warning) {
    const warning = hotkeyCapture.warning;
    const box = document.createElement('div');
    box.className = 'hotkey-conflict';
    const text = document.createElement('span');
    if (warning.kind === 'notAllowed') {
      text.textContent = t('settings.hotkeys.notAllowed');
    } else if (warning.kind === 'fixed') {
      text.textContent = t('settings.hotkeys.conflictFixed').replace(
        '{command}',
        t(warning.descKey),
      );
    } else {
      const other = COMMANDS.find((c) => c.id === warning.otherId);
      text.textContent = t('settings.hotkeys.conflict').replace(
        '{command}',
        other ? t(other.labelKey) : warning.otherId,
      );
    }
    box.appendChild(text);
    if (warning.kind === 'command') {
      const overwriteBtn = document.createElement('button');
      overwriteBtn.type = 'button';
      overwriteBtn.className = 'btn hotkey-overwrite';
      overwriteBtn.textContent = t('settings.hotkeys.overwrite');
      overwriteBtn.addEventListener('click', () => {
        // Das andere Kommando verliert sein Binding ('—').
        hotkeysDraft[warning.otherId] = '';
        hotkeysDraft[cmd.id] = warning.binding;
        finishHotkeyCapture();
      });
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn hotkey-conflict-cancel';
      cancelBtn.textContent = t('settings.hotkeys.cancel');
      cancelBtn.addEventListener('click', () => cancelHotkeyCapture());
      box.append(overwriteBtn, cancelBtn);
    }
    row.appendChild(box);
  }
  return row;
}

export function renderHotkeysEditor() {
  if (!hotkeysListEl || !hotkeysListEl.isConnected || !pageState.draft) return;
  const hotkeysDraft = pageState.draft.hotkeys;
  // 4T-0294: Kommandos effektiv deaktivierter Erweiterungen ausblenden.
  const disabledCommands = disabledCommandIdSet(getDisabledExtensionIds());
  hotkeysListEl.innerHTML = '';
  for (const categoryKey of COMMAND_CATEGORIES) {
    const cmds = COMMANDS.filter(
      (c) => c.categoryKey === categoryKey && !disabledCommands.has(c.id),
    );
    if (cmds.length === 0) continue;
    const heading = document.createElement('h4');
    heading.className = 'hotkeys-group-title';
    heading.textContent = t(categoryKey);
    hotkeysListEl.appendChild(heading);
    for (const cmd of cmds) hotkeysListEl.appendChild(buildHotkeyRow(cmd, hotkeysDraft));
  }
}

// Capture-Listener: keydown in der Capture-Phase MIT stopPropagation —
// laeuft damit vor dem globalen Kommando-Dispatcher (window, Bubble), der
// Esc-Kaskade und den CodeMirror-Keymaps. Tab wird als Taste erfasst,
// nicht als Fokus-Wechsel (preventDefault).
function onHotkeyCaptureKeydown(e) {
  if (!hotkeyCapture || !pageState.draft) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') {
    cancelHotkeyCapture();
    return;
  }
  const binding = eventToBinding(e);
  if (!binding) {
    // Reiner Modifier-Druck: Zwischenstand anzeigen.
    hotkeyCapture.interim = captureInterimText(e);
    hotkeyCapture.warning = null;
    renderHotkeysEditor();
    return;
  }
  hotkeyCapture.interim = null;
  if (!isBindingCapturable(binding)) {
    hotkeyCapture.warning = { kind: 'notAllowed' };
    renderHotkeysEditor();
    return;
  }
  const hotkeysDraft = pageState.draft.hotkeys;
  const conflict = findBindingConflict(hotkeysDraft, hotkeyCapture.commandId, binding);
  if (!conflict) {
    hotkeysDraft[hotkeyCapture.commandId] = binding;
    finishHotkeyCapture();
    return;
  }
  if (conflict.type === 'fixed') {
    hotkeyCapture.warning = { kind: 'fixed', descKey: conflict.descKey };
  } else {
    hotkeyCapture.warning = { kind: 'command', otherId: conflict.commandId, binding };
  }
  renderHotkeysEditor();
}

// Klick ausserhalb der Capture-Zeile bricht das Capture ab.
function onHotkeyCaptureMousedown(e) {
  if (!hotkeyCapture) return;
  const row = hotkeyRowEl(hotkeyCapture.commandId);
  if (row && row.contains(e.target)) return;
  cancelHotkeyCapture();
}

export function startHotkeyCapture(commandId) {
  cancelHotkeyCapture();
  hotkeyCapture = { commandId, interim: null, warning: null };
  document.addEventListener('keydown', onHotkeyCaptureKeydown, true);
  document.addEventListener('mousedown', onHotkeyCaptureMousedown, true);
  renderHotkeysEditor();
}

function teardownHotkeyCaptureListeners() {
  document.removeEventListener('keydown', onHotkeyCaptureKeydown, true);
  document.removeEventListener('mousedown', onHotkeyCaptureMousedown, true);
}

export function cancelHotkeyCapture() {
  if (!hotkeyCapture) return;
  hotkeyCapture = null;
  teardownHotkeyCaptureListeners();
  renderHotkeysEditor();
}

function finishHotkeyCapture() {
  hotkeyCapture = null;
  teardownHotkeyCaptureListeners();
  renderHotkeysEditor();
}

// Gesamt-Reset (zweistufig): erster Klick bewaffnet den Button mit dem
// Bestaetigungs-Text, der zweite setzt alle Kommandos auf den Default.
function handleHotkeysResetAllClick(btn, draft) {
  if (!hotkeysResetAllArmed) {
    hotkeysResetAllArmed = true;
    btn.textContent = t('settings.hotkeys.resetAllConfirm');
    btn.classList.add('armed');
    return;
  }
  for (const cmd of COMMANDS) {
    draft.hotkeys[cmd.id] = defaultBindingOf(cmd);
  }
  hotkeysResetAllArmed = false;
  btn.textContent = t('settings.hotkeys.resetAll');
  btn.classList.remove('armed');
  cancelHotkeyCapture();
  renderHotkeysEditor();
}

// Liefert das Override-Objekt fuer den Store: nur normalisierte
// Abweichungen vom Default ('' = bewusst entbunden).
export function hotkeysDraftToOverrides(hotkeysDraft) {
  const overrides = {};
  for (const cmd of COMMANDS) {
    const def = defaultBindingOf(cmd);
    const cur = hotkeysDraft[cmd.id] !== undefined ? hotkeysDraft[cmd.id] : def;
    if (normalizeBinding(cur || '') !== normalizeBinding(def || '')) {
      overrides[cmd.id] = cur || '';
    }
  }
  return overrides;
}

function renderHotkeysSection(container, draft) {
  const hint = document.createElement('p');
  hint.className = 'hotkeys-hint';
  hint.textContent = t('settings.hotkeys.hint');
  container.appendChild(hint);

  const list = document.createElement('div');
  list.id = 'settings-hotkeys-list';
  list.className = 'hotkeys-list';
  container.appendChild(list);
  hotkeysListEl = list;
  renderHotkeysEditor();

  const actions = document.createElement('div');
  actions.className = 'hotkeys-actions';
  const resetAllBtn = document.createElement('button');
  resetAllBtn.type = 'button';
  resetAllBtn.id = 'btn-hotkeys-reset-all';
  resetAllBtn.className = 'btn';
  resetAllBtn.textContent = t(
    hotkeysResetAllArmed ? 'settings.hotkeys.resetAllConfirm' : 'settings.hotkeys.resetAll',
  );
  resetAllBtn.classList.toggle('armed', hotkeysResetAllArmed);
  resetAllBtn.addEventListener('click', () => handleHotkeysResetAllClick(resetAllBtn, draft));
  actions.appendChild(resetAllBtn);
  container.appendChild(actions);
}

// 4T-0211 (Hotfix 0.28.1): Sicherheitsnetz — ein Draft mit doppelt
// vergebenen Bindings blockiert Anwenden/OK komplett mit lokalisiertem
// Hinweis (Muster Task-Status-Validierung).
function validateHotkeysSection(draft) {
  const duplicates = findDuplicateBindings(draft.hotkeys);
  if (duplicates.length === 0) return null;
  const first = duplicates[0];
  const labels = first.commandIds
    .map((id) => {
      const cmd = COMMANDS.find((c) => c.id === id);
      return cmd ? t(cmd.labelKey) : id;
    })
    .join(', ');
  return t('settings.hotkeys.duplicate')
    .replace('{binding}', bindingToDisplayString(first.binding))
    .replace('{commands}', labels);
}

async function applyHotkeysSection(draft) {
  // Hotkey-Overrides persistieren (nur bei Aenderung gegenueber dem
  // aktuellen Stand — der Main broadcastet 'hotkeys:changed' an alle
  // Fenster inkl. diesem und baut die Menues neu; der Empfangspfad in
  // app-init wendet Dispatcher-Map und Editor-Keymap idempotent an).
  const overrides = hotkeysDraftToOverrides(draft.hotkeys);
  if (JSON.stringify(overrides) !== JSON.stringify(state.hotkeyOverrides || {})) {
    await persistSetting('hotkeys', overrides);
  }
}

// --- Bereich Erweiterungen (4T-0295, Epic 3E-0052) --------------------------------
// Liste der internen Erweiterungen, gruppiert nach Kategorie (Render,
// Vernetzung, Werkzeuge), je Zeile Schalter, Name und Kurzbeschreibung.
// Abhaengig mit-deaktivierte Erweiterungen zeigen einen Hinweis und einen
// gesperrten Schalter (ihr eigener Schalt-Zustand bleibt erhalten und
// kehrt mit der Abhaengigkeit zurueck). Wirkung erst bei Anwenden/OK.

function renderExtensionsEditor(listEl, draft) {
  listEl.innerHTML = '';
  const effective = effectiveDisabledSet(draft.extensionsDisabled);
  for (const category of EXTENSION_CATEGORIES) {
    const extensions = allExtensions().filter((m) => m.category === category);
    if (extensions.length === 0) continue;
    const heading = document.createElement('h4');
    heading.className = 'settings-extensions-group-title';
    heading.textContent = t(`settings.extensions.category.${category}`);
    listEl.appendChild(heading);
    for (const manifest of extensions) {
      const row = document.createElement('div');
      row.className = 'settings-extension-row';
      row.dataset.extensionId = manifest.id;

      const directlyDisabled = draft.extensionsDisabled.includes(manifest.id);
      const byDependency = effective.has(manifest.id) && !directlyDisabled;

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'settings-extension-toggle';
      toggle.id = `settings-extension-${manifest.id}`;
      toggle.checked = !effective.has(manifest.id);
      toggle.disabled = byDependency;
      toggle.addEventListener('change', () => {
        if (toggle.checked) {
          draft.extensionsDisabled = draft.extensionsDisabled.filter((id) => id !== manifest.id);
        } else if (!draft.extensionsDisabled.includes(manifest.id)) {
          draft.extensionsDisabled.push(manifest.id);
        }
        // Abhaengigkeits-Hinweise der uebrigen Zeilen nachziehen.
        renderExtensionsEditor(listEl, draft);
      });

      const text = document.createElement('div');
      text.className = 'settings-extension-text';
      const name = document.createElement('label');
      name.className = 'settings-extension-name';
      name.htmlFor = toggle.id;
      name.textContent = t(manifest.nameKey);
      text.appendChild(name);
      const desc = document.createElement('div');
      desc.className = 'settings-extension-desc';
      desc.textContent = t(manifest.descKey);
      text.appendChild(desc);
      if (byDependency) {
        const hint = document.createElement('div');
        hint.className = 'settings-extension-dependency-hint';
        const names = (manifest.dependencies || [])
          .filter((dep) => effective.has(dep))
          .map((dep) => {
            const depManifest = extensionById(dep);
            return depManifest ? t(depManifest.nameKey) : dep;
          })
          .join(', ');
        hint.textContent = t('settings.extensions.dependencyHint').replace('{name}', names);
        text.appendChild(hint);
      }

      row.append(toggle, text);
      listEl.appendChild(row);
    }
  }
}

function renderExtensionsSection(container, draft) {
  const intro = document.createElement('p');
  intro.className = 'settings-extensions-intro';
  intro.textContent = t('settings.extensions.intro');
  container.appendChild(intro);
  const list = document.createElement('div');
  list.id = 'settings-extensions-list';
  list.className = 'settings-extensions-list';
  container.appendChild(list);
  renderExtensionsEditor(list, draft);
}

async function applyExtensionsSection(draft) {
  const next = [...draft.extensionsDisabled].sort();
  const current = [...getDisabledExtensionIds()].sort();
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  // Wendet lokal an (Pipeline, UI-Hooks, Event) und persistiert; der
  // settings:set-Broadcast erreicht zusaetzlich alle Fenster inkl. diesem
  // (idempotent). Der Umschalt-Pfad in app-init rendert die Panes neu und
  // re-montiert damit auch diese Seite (Bereichsnavigation zieht nach).
  await applyExtensionsState(draft.extensionsDisabled);
}

// --- Bereich Aufgaben (4T-0498, Epic 3E-0090) ----------------------------------
// Global Filter (Text plus Ausblende-Option), die drei Automatik-Schalter
// (Erstellt/Erledigt/Abgebrochen) und die Einfüge-Position der neuen
// Wiederholungs-Instanz. Alle Werte leben im Entwurf (draft.tasks, eine in
// resetPageState synchron erstellte Arbeitskopie von tasksConfig); Wirkung
// erst bei Anwenden/OK (Muster Task-Status).
function renderTasksSection(container, draft) {
  if (!draft.tasks) draft.tasks = { ...tasksConfig };
  const values = draft.tasks;

  // (a) Global Filter (Text-Eingabe) plus Erklärungs-Hinweis.
  const filterInput = document.createElement('input');
  filterInput.id = 'settings-tasks-global-filter';
  filterInput.type = 'text';
  filterInput.className = 'settings-input';
  filterInput.autocomplete = 'off';
  filterInput.spellcheck = false;
  filterInput.value = values.globalFilter || '';
  filterInput.addEventListener('input', () => {
    values.globalFilter = filterInput.value;
  });
  container.appendChild(buildSettingsRow('settings.tasks.globalFilter', filterInput));
  const filterHint = document.createElement('p');
  filterHint.className = 'settings-row-hint';
  filterHint.textContent = t('settings.tasks.globalFilterHint');
  container.appendChild(filterHint);

  // (a2) 4T-0505 (Epic 3E-0096): globale Abfrage — FROM-/WHERE-Vorgabe,
  // die jeder TASKS-Abfrage implizit vorangestellt wird.
  const globalQuery = document.createElement('textarea');
  globalQuery.id = 'settings-tasks-global-query';
  globalQuery.className = 'settings-input';
  globalQuery.rows = 2;
  globalQuery.spellcheck = false;
  globalQuery.value = values.globalQuery || '';
  globalQuery.addEventListener('input', () => {
    values.globalQuery = globalQuery.value;
  });
  container.appendChild(buildSettingsRow('settings.tasks.globalQuery', globalQuery));
  const queryHint = document.createElement('p');
  queryHint.className = 'settings-row-hint';
  queryHint.textContent = t('settings.tasks.globalQueryHint');
  container.appendChild(queryHint);

  // (b) Filter-Text in Anzeigen ausblenden.
  const hideFilter = document.createElement('input');
  hideFilter.id = 'settings-tasks-hide-filter';
  hideFilter.type = 'checkbox';
  hideFilter.checked = values.hideGlobalFilter === true;
  hideFilter.addEventListener('change', () => {
    values.hideGlobalFilter = hideFilter.checked;
  });
  container.appendChild(buildSettingsRow('settings.tasks.hideGlobalFilter', hideFilter));

  // (c) Drei Automatik-Schalter (Erstellt/Erledigt/Abgebrochen). Die Kopie
  // ist bereits normalisiert, daher spiegelt der Bool-Wert direkt den Stand.
  const buildAuto = (id, key, labelKey) => {
    const input = document.createElement('input');
    input.id = id;
    input.type = 'checkbox';
    input.checked = !!values[key];
    input.addEventListener('change', () => {
      values[key] = input.checked;
    });
    container.appendChild(buildSettingsRow(labelKey, input));
  };
  buildAuto('settings-tasks-auto-created', 'autoCreated', 'settings.tasks.autoCreated');
  buildAuto('settings-tasks-auto-done', 'autoDone', 'settings.tasks.autoDone');
  buildAuto('settings-tasks-auto-cancelled', 'autoCancelled', 'settings.tasks.autoCancelled');

  // (d) Einfüge-Position der neuen Wiederholungs-Instanz.
  const insertSelect = document.createElement('select');
  insertSelect.id = 'settings-tasks-recurrence-insert';
  insertSelect.className = 'settings-input';
  for (const [value, key] of [
    ['above', 'settings.tasks.recurrenceInsert.above'],
    ['below', 'settings.tasks.recurrenceInsert.below'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    insertSelect.appendChild(option);
  }
  insertSelect.value = values.recurrenceInsert === 'below' ? 'below' : 'above';
  insertSelect.addEventListener('change', () => {
    values.recurrenceInsert = insertSelect.value;
  });
  container.appendChild(buildSettingsRow('settings.tasks.recurrenceInsert', insertSelect));

  // (e) 4T-0507 (Epic 3E-0096): Task-Zeilen-Vervollstaendigung — Mindest-
  // Tipplaenge und Vorschlagszahl (Zahl-Steuerungen mit festen Grenzen;
  // die Normalisierung klemmt zusaetzlich).
  const buildNumber = (id, key, labelKey, min, max) => {
    const input = document.createElement('input');
    input.id = id;
    input.type = 'number';
    input.className = 'settings-input';
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.value = String(values[key]);
    input.addEventListener('input', () => {
      values[key] = input.value;
    });
    container.appendChild(buildSettingsRow(labelKey, input));
  };
  buildNumber(
    'settings-tasks-ac-minlength',
    'autocompleteMinLength',
    'settings.tasks.autocompleteMinLength',
    1,
    5,
  );
  buildNumber(
    'settings-tasks-ac-max',
    'autocompleteMaxSuggestions',
    'settings.tasks.autocompleteMaxSuggestions',
    3,
    12,
  );
}

async function applyTasksSection(draft) {
  if (!draft.tasks) return;
  const normalized = normalizeTasksConfig(draft.tasks);
  // Unveränderter Stand ist ein No-op: sonst würde JEDER OK der
  // Einstellungs-Seite einen tasksConfig-Broadcast samt Voll-Re-Render
  // aller Fenster auslösen und die Persistenz nachfolgender Sektionen
  // messbar verzögern (EW-01-Befund im Voll-Suite-Gate von 4T-0501).
  // Schlüssel-Reihenfolge ist stabil (beide Seiten aus
  // normalizeTasksConfig), der JSON-Vergleich damit verlässlich.
  if (JSON.stringify(normalized) === JSON.stringify(tasksConfig)) {
    draft.tasks = { ...normalized };
    return;
  }
  // Lokal anwenden (beide Pipeline-Instanzen, Labels, Re-Render-Event) und
  // persistieren; der settings:set-Broadcast erreicht zusätzlich alle
  // Fenster inkl. diesem (idempotent, Muster taskStates).
  applyTasksConfig(normalized);
  await persistSetting('tasksConfig', normalized);
  draft.tasks = { ...normalized };
}

// --- Bereich Erinnerungen (4T-0528, Epic 3E-0095) --------------------------------
// Default-Uhrzeit (Wert plus Aendern-Knopf ueber den Zeit-Picker, kein
// Freitext — Eingabe-Komfort-Konvention), Snooze-Optionen als editierbare
// Liste (Zahl plus Einheiten-Auswahl) und der System-Notification-Schalter.
// Werte leben im Entwurf (draft.reminders); Wirkung erst bei Anwenden/OK.
function renderRemindersSection(container, draft) {
  if (!draft.reminders) {
    const current = currentRemindersConfig();
    draft.reminders = {
      defaultTime: current.defaultTime,
      snoozeOptions: current.snoozeOptions.map((o) => ({ ...o })),
      systemNotification: current.systemNotification,
    };
  }
  const values = draft.reminders;

  // (a) Default-Uhrzeit fuer Anker ohne Zeitanteil.
  const timeWrap = document.createElement('span');
  const timeValue = document.createElement('span');
  timeValue.id = 'settings-reminders-default-time';
  timeValue.className = 'task-dialog-date-value';
  timeValue.textContent = values.defaultTime;
  timeWrap.appendChild(timeValue);
  const timeBtn = document.createElement('button');
  timeBtn.type = 'button';
  timeBtn.className = 'btn task-dialog-date-btn';
  timeBtn.textContent = t('settings.reminders.pickTime');
  timeBtn.addEventListener('click', async () => {
    const rect = timeBtn.getBoundingClientRect();
    const picked = await showDateTimePicker({
      x: rect.left,
      y: rect.bottom + 4,
      time: values.defaultTime,
      dateEnabled: false,
      timeEnabled: true,
    });
    if (!picked || !picked.time) return;
    values.defaultTime = picked.time;
    timeValue.textContent = picked.time;
    // Mutation nach dem await — Dirty-Erkennung explizit nachziehen (4T-0554).
    refreshSettingsButtons();
  });
  timeWrap.appendChild(timeBtn);
  container.appendChild(buildSettingsRow('settings.reminders.defaultTime', timeWrap));
  const timeHint = document.createElement('p');
  timeHint.className = 'settings-row-hint';
  timeHint.textContent = t('settings.reminders.defaultTimeHint');
  container.appendChild(timeHint);

  // (b) Snooze-Optionen als editierbare Liste (Zahl plus Einheit; Muster
  // Regel-Editor der Vorlagen — strukturelle Aenderung baut die Liste neu).
  const listWrap = document.createElement('div');
  listWrap.id = 'settings-reminders-snooze-list';
  const rebuildList = () => {
    listWrap.innerHTML = '';
    values.snoozeOptions.forEach((opt, idx) => {
      const row = document.createElement('div');
      row.className = 'settings-reminders-snooze-row';
      const amount = document.createElement('input');
      amount.type = 'number';
      amount.className = 'settings-input';
      amount.min = '1';
      amount.max = '999';
      amount.step = '1';
      amount.value = String(opt.amount);
      amount.addEventListener('input', () => {
        opt.amount = amount.value;
      });
      row.appendChild(amount);
      const unit = document.createElement('select');
      unit.className = 'settings-input';
      for (const u of SNOOZE_UNITS) {
        const option = document.createElement('option');
        option.value = u;
        option.textContent = t(`settings.reminders.unit.${u}`);
        unit.appendChild(option);
      }
      unit.value = opt.unit;
      unit.addEventListener('change', () => {
        opt.unit = unit.value;
      });
      row.appendChild(unit);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn task-dialog-date-btn';
      remove.textContent = '✕';
      remove.title = t('settings.reminders.snoozeRemove');
      remove.addEventListener('click', () => {
        values.snoozeOptions.splice(idx, 1);
        rebuildList();
      });
      row.appendChild(remove);
      listWrap.appendChild(row);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn task-dialog-date-btn';
    add.textContent = t('settings.reminders.snoozeAdd');
    add.addEventListener('click', () => {
      values.snoozeOptions.push({ amount: 1, unit: 'h' });
      rebuildList();
    });
    listWrap.appendChild(add);
  };
  rebuildList();
  container.appendChild(buildSettingsRow('settings.reminders.snoozeOptions', listWrap));

  // (c) System-Notification (Standard aus).
  const notify = document.createElement('input');
  notify.id = 'settings-reminders-system-notification';
  notify.type = 'checkbox';
  notify.checked = values.systemNotification === true;
  notify.addEventListener('change', () => {
    values.systemNotification = notify.checked;
  });
  container.appendChild(buildSettingsRow('settings.reminders.systemNotification', notify));
  const notifyHint = document.createElement('p');
  notifyHint.className = 'settings-row-hint';
  notifyHint.textContent = t('settings.reminders.systemNotificationHint');
  container.appendChild(notifyHint);
}

async function applyRemindersSection(draft) {
  if (!draft.reminders) return;
  const normalized = normalizeRemindersConfig(draft.reminders);
  // No-op-Erkennung wie beim Aufgaben-Bereich (kein unnoetiger Broadcast).
  if (JSON.stringify(normalized) === JSON.stringify(currentRemindersConfig())) {
    draft.reminders = normalized;
    return;
  }
  await persistSetting('remindersConfig', normalized);
  draft.reminders = normalized;
}

// --- Bereich Ueberschriften-Nummerierung (4T-0471, Epic 3E-0087) -----------
// Globale Einstellung "Ueberschriften nummerieren" plus Start-Ebene (H1/H2).
// Werte leben im Entwurf; Wirkung erst bei Anwenden/OK (Muster showFrontmatter).
const HEADING_START_LEVEL_KEYS = [
  ['1', 'settings.headingNumbering.startH1'],
  ['2', 'settings.headingNumbering.startH2'],
];

function renderHeadingNumberingSection(container, draft) {
  if (!draft.headingNumbering) {
    draft.headingNumbering = {
      enabled: isHeadingNumberingEnabled(),
      startLevel: headingNumberingStartLevel(),
    };
  }
  const values = draft.headingNumbering;

  const intro = document.createElement('p');
  intro.className = 'settings-row-hint';
  intro.textContent = t('settings.headingNumbering.intro');
  container.appendChild(intro);

  const enable = document.createElement('input');
  enable.id = 'settings-number-headings';
  enable.type = 'checkbox';
  enable.checked = values.enabled === true;
  enable.addEventListener('change', () => {
    values.enabled = enable.checked;
  });
  container.appendChild(buildSettingsRow('settings.headingNumbering.enable', enable));

  const select = document.createElement('select');
  select.id = 'settings-heading-start-level';
  select.className = 'settings-input';
  for (const [value, key] of HEADING_START_LEVEL_KEYS) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    select.appendChild(option);
  }
  select.value = String(values.startLevel === 2 ? 2 : 1);
  select.addEventListener('change', () => {
    values.startLevel = select.value === '2' ? 2 : 1;
  });
  container.appendChild(buildSettingsRow('settings.headingNumbering.startLevel', select));
}

async function applyHeadingNumberingSection(draft) {
  if (!draft.headingNumbering) return;
  const next = {
    enabled: draft.headingNumbering.enabled === true,
    startLevel: draft.headingNumbering.startLevel === 2 ? 2 : 1,
  };
  if (
    next.enabled === isHeadingNumberingEnabled() &&
    next.startLevel === headingNumberingStartLevel()
  ) {
    return; // No-op: kein unnoetiger Broadcast/Re-Render.
  }
  applyHeadingNumbering(next.enabled, next.startLevel);
  await persistSetting('render.headingNumbering', next);
}

// --- Bereich Erweiterungen (extern) (4T-0300, Epic 3E-0053) -----------------------
// Verwaltungs-Oberfläche des Vertrauensmodells. Die Liste kommt aus dem
// Host (Scan-Einträge plus Status); Aktionen laufen asynchron über den
// Host (Warn-Dialog und Entfernen-Bestätigung zeigt der Main lokalisiert).
// Zustands-Änderungen feuern scg:extensions-changed — der Modul-Listener
// unten re-rendert dann den aktiven Bereich; das manuelle Re-Render nach
// jeder Aktion deckt die No-op-Fälle ab (abgebrochener Dialog, Scan ohne
// Änderung).

const EXTERNAL_STATUS_KEYS = {
  active: 'settings.extensionsExternal.status.active',
  inactive: 'settings.extensionsExternal.status.inactive',
  confirm: 'settings.extensionsExternal.status.confirm',
  error: 'settings.extensionsExternal.status.error',
  invalid: 'settings.extensionsExternal.status.invalid',
  incompatible: 'settings.extensionsExternal.status.incompatible',
};

function buildExternalActionButton(labelKey, idSuffix, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn settings-extension-external-action';
  btn.id = `btn-ext-external-${idSuffix}`;
  btn.textContent = t(labelKey);
  btn.addEventListener('click', async () => {
    // Doppel-Klick-Schutz während der asynchronen Aktion (Dialog, IPC).
    btn.disabled = true;
    try {
      await onClick();
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

function renderExternalExtensionsList(listEl) {
  if (!listEl.isConnected && listEl.childNodes.length > 0) return;
  listEl.innerHTML = '';
  const rerender = () => {
    if (listEl.isConnected) renderExternalExtensionsList(listEl);
  };
  const entries = externalExtensionEntries();
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'settings-extensions-external-empty';
    empty.textContent = t('settings.extensionsExternal.empty');
    listEl.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'settings-extension-external-row';
    row.dataset.extensionId = entry.ok ? entry.manifest.id : entry.dirName;
    row.dataset.status = entry.status;

    const head = document.createElement('div');
    head.className = 'settings-extension-external-head';
    const name = document.createElement('span');
    name.className = 'settings-extension-name';
    name.textContent = entry.ok ? entry.manifest.name : entry.dirName;
    head.appendChild(name);
    if (entry.ok) {
      const version = document.createElement('span');
      version.className = 'settings-extension-external-version';
      version.textContent = entry.manifest.version;
      head.appendChild(version);
    }
    const status = document.createElement('span');
    status.className = 'settings-extension-external-status';
    status.dataset.status = entry.status;
    status.textContent =
      entry.status === 'incompatible'
        ? t(EXTERNAL_STATUS_KEYS.incompatible).replace('{version}', entry.manifest.apiVersion)
        : t(EXTERNAL_STATUS_KEYS[entry.status] || entry.status);
    head.appendChild(status);
    row.appendChild(head);

    if (entry.ok && entry.manifest.description) {
      const desc = document.createElement('div');
      desc.className = 'settings-extension-desc';
      desc.textContent = entry.manifest.description;
      row.appendChild(desc);
    }
    const dir = document.createElement('div');
    dir.className = 'settings-extension-external-path';
    dir.textContent = entry.dir;
    row.appendChild(dir);
    if (entry.lastError) {
      const error = document.createElement('div');
      error.className = 'settings-extension-external-error';
      error.textContent = entry.lastError;
      row.appendChild(error);
    }

    const actions = document.createElement('div');
    actions.className = 'settings-extension-external-actions';
    if (entry.ok) {
      const id = entry.manifest.id;
      if (entry.status === 'active') {
        actions.appendChild(
          buildExternalActionButton(
            'settings.extensionsExternal.action.disable',
            `disable-${id}`,
            async () => {
              await disableExternalExtension(id);
              rerender();
            },
          ),
        );
      } else if (entry.status !== 'incompatible') {
        // inactive/confirm/error: Aktivieren löst den Warn-Dialog aus,
        // wenn die installierte Version nicht bestätigt ist.
        actions.appendChild(
          buildExternalActionButton(
            'settings.extensionsExternal.action.enable',
            `enable-${id}`,
            async () => {
              await enableExternalExtension(id);
              rerender();
            },
          ),
        );
      }
      actions.appendChild(
        buildExternalActionButton(
          'settings.extensionsExternal.action.remove',
          `remove-${id}`,
          async () => {
            await removeExternalExtension(id);
            rerender();
          },
        ),
      );
    }
    if (actions.childNodes.length > 0) row.appendChild(actions);
    listEl.appendChild(row);
  }
}

function renderExternalExtensionsSection(container) {
  const intro = document.createElement('p');
  intro.className = 'settings-extensions-intro';
  intro.textContent = t('settings.extensionsExternal.intro');
  container.appendChild(intro);

  const list = document.createElement('div');
  list.id = 'settings-extensions-external-list';
  list.className = 'settings-extensions-external-list';
  container.appendChild(list);
  renderExternalExtensionsList(list);

  const footer = document.createElement('div');
  footer.className = 'settings-extension-external-footer';
  footer.appendChild(
    buildExternalActionButton('settings.extensionsExternal.action.rescan', 'rescan', async () => {
      await rescanExternalExtensions();
      if (list.isConnected) renderExternalExtensionsList(list);
    }),
  );
  footer.appendChild(
    buildExternalActionButton(
      'settings.extensionsExternal.action.openDir',
      'open-dir',
      async () => {
        if (typeof api.openExternalExtensionsDir === 'function') {
          await api.openExternalExtensionsDir();
        }
      },
    ),
  );
  container.appendChild(footer);
}

// --- Seiten-DOM ----------------------------------------------------------------
// Referenzen auf das zuletzt montierte DOM (pro Fenster genau eine Seite).
let pageEls = null;

// Baut die Navigations-Einträge aus der (gefilterten) Bereichs-Liste —
// beim Mount, beim Erweiterungs-Umschalten (4T-0295: erweiterungs-eigene
// Bereiche erscheinen und verschwinden mit ihrer Erweiterung) und beim
// Bereichs-Wechsel (4T-0555). Seit 4T-0555 in zwei Gruppen mit
// Zwischenüberschriften: „Allgemein" (group 'general', Default) und
// „Aktueller Bereich" (group 'area', nur bei gebundenem Bereich —
// einheitliche Quelle ist state.areaPath). Die Reihenfolge innerhalb
// jeder Gruppe folgt der Registry-Reihenfolge.
function buildSettingsNavEntries(nav) {
  nav.innerHTML = '';
  const groups = [
    { id: 'general', titleKey: 'settings.navGroup.general', sections: [] },
    { id: 'area', titleKey: 'settings.navGroup.area', sections: [] },
  ];
  for (const section of settingsSections()) {
    (section.group === 'area' ? groups[1] : groups[0]).sections.push(section);
  }
  for (const group of groups) {
    if (group.id === 'area' && !state.areaPath) continue;
    if (group.sections.length === 0) continue;
    const wrap = document.createElement('div');
    wrap.className = 'settings-nav-group';
    wrap.dataset.navGroup = group.id;
    const title = document.createElement('div');
    title.className = 'settings-nav-group-title';
    title.textContent = t(group.titleKey);
    wrap.appendChild(title);
    for (const section of group.sections) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-nav-entry';
      btn.dataset.sectionId = section.id;
      btn.textContent = t(section.titleKey);
      btn.addEventListener('click', () => activateSection(section.id));
      wrap.appendChild(btn);
    }
    nav.appendChild(wrap);
  }
}

// 4T-0295: Erweiterungs-Umschalten (eigener Apply oder Broadcast eines
// anderen Fensters) zieht die Bereichsnavigation einer offenen Seite nach;
// renderActiveSection enthält den Rückfall auf den Bereich „Erweiterungen",
// falls der offene Bereich weggefallen ist. Der Entwurf übernimmt den
// neuen Schalt-Zustand (ein Apply danach würde sonst den Stand des
// anderen Fensters zurückdrehen, Muster mergeAppearanceSnapshot).
document.addEventListener('scg:extensions-changed', () => {
  if (pageState.draft) pageState.draft.extensionsDisabled = getDisabledExtensionIds();
  if (!pageEls || !pageEls.nav || !pageEls.nav.isConnected) return;
  buildSettingsNavEntries(pageEls.nav);
  renderActiveSection();
});

// 4T-0555 (Epic 3E-0100): Bereichs-Wechsel einer offenen Seite (Bindung
// einer leeren App; Signal ist der areaPath-Wechsel in onWindowDisplayInfo,
// app-init.js). Die bereichsgebundenen Entwürfe gehören zum alten Bereich
// und dürfen nicht in den neuen geschrieben werden: rein bereichsgebundene
// Sektionen laden komplett neu (offene Änderungen entfallen bewusst), bei
// den geteilten Entwürfen der aufgeteilten Hybride (history, templates)
// wird nur der Bereichs-Anteil samt Snapshot ersetzt — app-weite
// Änderungen bleiben erhalten. Danach Navigation neu aufbauen (Gruppe
// „Aktueller Bereich" erscheint/entfällt) und den aktiven Bereich neu
// rendern (enthält den Rückfall für entfallene Bereichs-Sektionen).
export function refreshSettingsPageForAreaChange() {
  if (!pageState.draft) return;
  const generation = pageState.generation;
  const rerenderIfActive = (ids) => {
    if (ids.includes(pageState.activeSectionId)) renderActiveSection();
  };
  readHistoryFromStore().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    const draft = pageState.draft;
    if (draft.history) {
      draft.history.hasArea = values.hasArea;
      draft.history.areaValue = values.areaValue;
    }
    if (draft.historySnapshot) {
      draft.historySnapshot.hasArea = values.hasArea;
      draft.historySnapshot.areaValue = values.areaValue;
    }
    rerenderIfActive(['historyArea']);
  });
  readTemplatesFromConfig().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    const draft = pageState.draft;
    if (draft.templates) {
      draft.templates.hasArea = values.draft.hasArea;
      draft.templates.areaName = values.draft.areaName;
      draft.templates.areaEnabled = values.draft.areaEnabled;
      draft.templates.area = values.draft.area;
      if (draft.templatesSnapshot) draft.templatesSnapshot.area = values.snapshot.area;
    }
    rerenderIfActive(['templatesArea']);
  });
  readJournalsFromConfig().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.journals = values.draft;
    pageState.draft.journalsSnapshot = values.snapshot;
    rerenderIfActive(['journals']);
  });
  readProfilesFromConfig().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.profiles = values.draft;
    pageState.draft.profilesSnapshot = values.snapshot;
    rerenderIfActive(['propertyProfiles']);
  });
  readCalendarFromConfig().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.calendar = values.draft;
    pageState.draft.calendarSnapshot = values.snapshot;
    rerenderIfActive(['calendarSystems']);
  });
  if (pageEls && pageEls.nav && pageEls.nav.isConnected) {
    buildSettingsNavEntries(pageEls.nav);
    renderActiveSection();
  }
}

function refreshSettingsNav() {
  if (!pageEls || !pageEls.nav || !pageEls.nav.isConnected) return;
  for (const btn of pageEls.nav.querySelectorAll('.settings-nav-entry')) {
    const id = btn.dataset.sectionId;
    btn.classList.toggle('active', id === pageState.activeSectionId);
    btn.classList.toggle('has-error', pageState.errors.has(id));
  }
}

// 4T-0554 (Epic 3E-0100): Schaltflächen spiegeln den Speicher-Status.
// Bei ungesicherten Änderungen tragen „Anwenden" und „OK" die Primary-
// Hervorhebung; ohne Änderungen ist „Anwenden" deaktiviert (PO-Entscheidung
// E2), „OK" bleibt immer klickbar (schließt die Seite auch ohne Änderungen).
// Exportiert, damit Bereichs-Module mit eigenem Broadcast-Abgleich
// (sidebar-settings.js) nach einer Entwurfs-Anpassung nachziehen können.
export function refreshSettingsButtons() {
  if (!pageEls || !pageEls.applyBtn || !pageEls.applyBtn.isConnected) return;
  const dirty = isSettingsPageDirty();
  pageEls.applyBtn.disabled = !dirty;
  pageEls.applyBtn.classList.toggle('btn-primary', dirty);
  pageEls.okBtn.classList.toggle('btn-primary', dirty);
}

// 4T-0554: Dirty-Neubewertung über delegierte Dokument-Listener statt pro
// Kontroll-Element — die weit über hundert Wert-Handler der Bereiche
// schreiben direkt in den Entwurf, und jede Nutzer-Interaktion (Eingabe,
// Auswahl, Klick, Tasten-Capture) läuft danach hier durch. Ziel-Handler
// laufen vor dem Dokument-Listener (Bubbling), die Neubewertung sieht also
// den mutierten Entwurf. Popups außerhalb der Seite (Zeit-Picker) sind über
// dieselben Dokument-Events abgedeckt; Handler, die erst nach einem await
// mutieren (OS-Ordner-Dialoge, Picker-Promise), rufen refreshSettingsButtons
// zusätzlich explizit. Ohne offene Seite ist der Aufruf ein früher Return.
for (const eventType of ['input', 'change', 'click', 'keyup']) {
  document.addEventListener(eventType, () => refreshSettingsButtons());
}

// Fehlertext des aktiven Bereichs unterhalb des Inhalts (Muster der
// Error-Divs des Modals, seitenweit vereinheitlicht).
function renderActiveSectionError() {
  if (!pageEls || !pageEls.error || !pageEls.error.isConnected) return;
  const error = pageState.errors.get(pageState.activeSectionId) || null;
  pageEls.error.hidden = !error;
  pageEls.error.textContent = error || '';
}

function renderActiveSection() {
  if (!pageEls || !pageEls.content || !pageEls.content.isConnected) return;
  if (!pageState.draft) return;
  let section = sectionById(pageState.activeSectionId);
  // 4T-0295: verschwindet der offene Bereich (Erweiterung deaktiviert,
  // z.B. per Broadcast aus einem anderen Fenster), faellt die Seite auf
  // den Bereich „Erweiterungen" zurueck.
  if (!section) {
    pageState.activeSectionId = 'extensions';
    section = sectionById('extensions');
  }
  // 4T-0555: bereichsgebundene Sektionen sind ohne gebundenen Bereich
  // nicht erreichbar (Navigations-Gruppe fehlt) — entfällt die Bindung
  // einer offenen Sektion, fällt die Seite auf den ersten Bereich zurück.
  if (section && section.group === 'area' && !state.areaPath) {
    pageState.activeSectionId = 'appearance';
    section = sectionById('appearance');
  }
  pageEls.content.innerHTML = '';
  if (!section) return;
  const heading = document.createElement('h3');
  heading.className = 'settings-section-heading';
  heading.textContent = t(section.titleKey);
  pageEls.content.appendChild(heading);
  const body = document.createElement('div');
  body.className = 'settings-section-body';
  pageEls.content.appendChild(body);
  section.render(body, pageState.draft);
  refreshSettingsNav();
  renderActiveSectionError();
  // 4T-0554: Struktur-Änderungen der Bereiche laufen über ein Re-Render
  // (Regel-/Journal-/Kalender-Editoren) — der Speicher-Status zieht mit.
  refreshSettingsButtons();
}

function activateSection(id) {
  if (!sectionById(id)) return;
  // Bereichswechsel beendet ein laufendes Capture (die Capture-Zeile
  // verschwindet aus dem DOM; Dokument-Listener duerfen nicht haengen
  // bleiben). Der Entwurf bleibt unangetastet.
  cancelHotkeyCapture();
  pageState.activeSectionId = id;
  renderActiveSection();
}

function buildButton(id, labelKey, className, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = id;
  btn.className = className;
  btn.textContent = t(labelKey);
  btn.addEventListener('click', onClick);
  return btn;
}

// Baut das Seiten-DOM: Titel, zweispaltiger Rumpf (Navigation links,
// Bereichs-Inhalt rechts), seitenweite Button-Leiste. Wird beim ersten
// Anzeigen, nach Sprachwechsel und nach Pane-Wechsel gerufen
// (renderSystemPane leert den Container vorher); der Entwurf liegt im
// Modul-Zustand und übersteht den Re-Mount.
function mountSettingsPage(container) {
  const page = document.createElement('div');
  page.className = 'settings-page';

  const title = document.createElement('h2');
  title.className = 'settings-page-title';
  title.textContent = t('settings.title');
  page.appendChild(title);

  const body = document.createElement('div');
  body.className = 'settings-page-body';

  const nav = document.createElement('nav');
  nav.className = 'settings-nav';
  buildSettingsNavEntries(nav);
  body.appendChild(nav);

  const main = document.createElement('div');
  main.className = 'settings-section-pane';
  const content = document.createElement('div');
  content.className = 'settings-section-content';
  main.appendChild(content);
  const error = document.createElement('div');
  error.className = 'settings-section-error';
  error.hidden = true;
  main.appendChild(error);
  body.appendChild(main);
  page.appendChild(body);

  const buttons = document.createElement('div');
  buttons.className = 'settings-page-buttons';
  buttons.appendChild(
    buildButton('btn-settings-cancel', 'settings.cancel', 'btn', () => cancelSettingsPage()),
  );
  // 4T-0554: „Anwenden" und „OK" starten neutral; refreshSettingsButtons
  // (am Ende von renderActiveSection) setzt Primary-Hervorhebung und
  // Deaktivierung aus dem Speicher-Status — auch beim Re-Mount einer Seite
  // mit bereits geändertem Entwurf (Sprachwechsel, Pane-Wechsel).
  const applyBtn = buildButton('btn-settings-apply', 'settings.apply', 'btn', () =>
    applySettingsPage(),
  );
  buttons.appendChild(applyBtn);
  const okBtn = buildButton('btn-settings-ok', 'settings.ok', 'btn', () => okSettingsPage());
  buttons.appendChild(okBtn);
  page.appendChild(buttons);

  container.appendChild(page);
  pageEls = { nav, content, error, applyBtn, okBtn };
  renderActiveSection();
}

registerSystemPage({
  id: SETTINGS_PAGE_ID,
  titleKey: 'settings.title',
  mount: mountSettingsPage,
  // Frischer Entwurf nur beim echten Neu-Öffnen (openSystemPage ruft den
  // Hook nicht beim Aktivieren einer bestehenden Seite).
  onOpen: resetPageState,
  // Tab-Schließen ohne Anwenden entspricht Abbrechen (Revert der
  // Live-Vorschau, Capture-Teardown).
  onClose: handleSettingsPageClose,
});

// Nur für Tests: seiteninterner Zustand lesbar (Bereichswechsel- und
// Validierungs-Verhalten ohne DOM-Introspektion prüfbar).
export function settingsPageStateForTests() {
  return pageState;
}
