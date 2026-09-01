// 4T-0988 (Epic 3E-0196): Entwurf der Einstellungs-Seite.
//
// Aufbau des Entwurfs beim Öffnen, die asynchrone Nachlade-Strecke aus
// Store und Bereichsdatei, der Abbruch-Weg beim Schließen des Tabs und der
// Bereichs-Wechsel einer offenen Seite. Der Entwurf ist der Kontext, den
// die Bereichs-Module lesen und schreiben; persistiert wird erst über die
// apply-Hooks der Registry (settings-page.js).
'use strict';

import {
  SPELLCHECK_KEY,
  normalizeDictionaryWords,
  normalizeSpellcheckSetting,
} from '../../../shared/spellcheck.js';
import { api } from '../app/api.js';
import { DEFAULT_VIEW_MODE, getEditorViewDefaults, state } from '../app/app-state.js';
// 4T-1341 (Epic 3E-0238): Die Voreinstellung kommt aus der einen Quelle.
import { DEFAULT_EDIT_VIEW_MODE } from '../views/view-modes.js';
import { getColorSchemeState, setColorSchemeState } from '../color-schemes.js';
import { getDisabledExtensionIds } from '../extensions/extension-lifecycle.js';
import { isFrontmatterDisplayEnabled, isFrontmatterExpanded } from '../frontmatter-display.js';
import { isNotesPreviewByDefault } from '../panels/notes-panel.js';
import { isPerspectiveScriptsEnabled } from '../query/perspective-script-view.js';
import { taskStatesResolved } from '../task-states.js';
import { tasksConfig } from '../tasks.js';
import { applyAppearanceVars, readAppearanceFromStore } from './settings-appearance.js';
import { readAttachmentsFromConfig } from './settings-attachments.js';
import { readRenameLinkSettings } from './settings-behavior.js';
import { readCalendarFromConfig } from './settings-calendar-model.js';
import { readHistoryFromStore } from './settings-history.js';
import {
  buildHotkeysDraftFromState,
  cancelHotkeyCapture,
  disarmHotkeysResetAll,
} from './settings-hotkeys.js';
import { readJournalsFromConfig } from './settings-journals.js';
import {
  buildSettingsNavEntries,
  renderActiveSection,
  setSettingsPageEls,
  settingsPageEls,
} from './settings-mount.js';
import { readProfilesFromConfig } from './settings-profiles.js';
import { pageState } from './settings-shared.js';
import { normalizeTimestampDraft, readPdfExportFromStore } from './settings-small-sections.js';
import { readTemplatesFromConfig } from './settings-templates.js';

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

// Frischer Entwurf beim Öffnen einer neuen Seite (nicht beim Aktivieren
// einer bestehenden und nicht beim Sprachwechsel-Re-Mount). Task-Status-
// und Hotkeys-Draft entstehen synchron aus dem Laufzeit-Zustand; die
// Darstellungs-Werte kommen asynchron aus dem Store nach (Muster des
// frueheren showSettings) und rendern den aktiven Bereich dann nach.
export function resetPageState() {
  pageState.activeSectionId = 'appearance';
  pageState.errors = new Map();
  pageState.generation += 1;
  cancelHotkeyCapture();
  disarmHotkeysResetAll();
  pageState.draft = buildDraft();
  void ladeAppearanceInDraft();
}

// 4T-0761 (Epic 3E-0142): Der Entwurfs-Aufbau ist aus resetPageState
// herausgeloest, damit die Such-Ernte einen Wegwerf-Entwurf bauen kann,
// ohne einen offenen Entwurf der Seite anzutasten. Rein mechanischer,
// verhaltensneutraler Schnitt.
export function buildDraft() {
  return {
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
    // 4T-1341 (Epic 3E-0238): Ziel-Ansicht des Wechsels in den Aenderungsmodus.
    editViewMode: state.editViewMode || DEFAULT_EDIT_VIEW_MODE,
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
}

// 4T-0761 (Epic 3E-0142): Nachlade-Strecke des Entwurfs (asynchrone Store-
// und Bereichsdatei-Werte, die den aktiven Bereich nachrendern). Sie
// gehoert zum GEOEFFNETEN Entwurf und laeuft deshalb nicht fuer den
// Wegwerf-Entwurf der Such-Ernte.
function ladeAppearanceInDraft() {
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
  // 4T-0791 (Epic 3E-0125): Anlagen-Konfiguration (Muster Vorlagen).
  readAttachmentsFromConfig().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.attachments = values.draft;
    pageState.draft.attachmentsSnapshot = values.snapshot;
    if (['attachments', 'attachmentsArea'].includes(pageState.activeSectionId)) {
      renderActiveSection();
    }
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
  // 4T-0581/4T-0582 (Epic 3E-0107): Schalter und Wörterbuch-Liste der
  // Rechtschreibprüfung.
  api.getSetting(SPELLCHECK_KEY).then((value) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.spellcheck = normalizeSpellcheckSetting(value);
    pageState.draft.spellcheckSnapshot = pageState.draft.spellcheck;
    if (pageState.activeSectionId === 'spellcheck') renderActiveSection();
  });
  api.spellcheckListWords().then((words) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.spellcheckWords = normalizeDictionaryWords(words);
    if (pageState.activeSectionId === 'spellcheck') renderActiveSection();
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

// Tab geschlossen ohne Anwenden (X, Strg+W, Abbrechen, Fenster-Transfer):
// Capture-Listener abbauen und die Live-Vorschau auf den Snapshot
// zurücksetzen (Semantik des früheren Abbrechen).
export function handleSettingsPageClose() {
  cancelHotkeyCapture();
  disarmHotkeysResetAll();
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
  setSettingsPageEls(null);
}

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
  const els = settingsPageEls();
  if (els && els.nav && els.nav.isConnected) {
    buildSettingsNavEntries(els.nav);
    renderActiveSection();
  }
}
