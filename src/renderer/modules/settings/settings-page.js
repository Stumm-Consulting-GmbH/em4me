// 4T-0277/4T-0278/4T-0279 (Epic 3E-0049): Einstellungs-Seite als System-Tab.
//
// Ersetzt den modalen Einstellungs-Dialog: 4T-0277 lieferte die
// Tab-Infrastruktur, 4T-0278 das Seiten-Layout (Bereichsnavigation links,
// Bereichs-Inhalt rechts, seitenweite Button-Leiste) samt Bereichs-Registry
// mit Andockpunkt für dynamische Bereiche (YAML-Schalter aus 3E-0050,
// Erweiterungs-Bereiche aus 3E-0052/3E-0053), 4T-0279 die vier migrierten
// Bereiche Darstellung, Verhalten, Task-Status und Tastenkürzel.
//
// Entwurfs-Semantik wie im früheren Dialog: Snapshot beim Öffnen,
// Live-Vorschau der Darstellungs-Werte über CSS-Variablen, Validierung und
// Persistierung erst bei Anwenden/OK; Abbrechen bzw. Schließen des Tabs
// ohne Anwenden verwirft (onClose-Haken revertiert die Live-Vorschau).
//
// 4T-0988 (Epic 3E-0196): Der Kern trägt die Bereichs-Registry, die
// seitenweiten Aktionen (Anwenden/OK/Abbrechen) und die Lade-Seiteneffekte
// (Dokument-Listener, Anmeldung der System-Seite); die Bereiche selbst, der
// Entwurf und das Seiten-DOM leben in den Nachbar-Modulen dieses Ordners.
'use strict';

import { disabledSettingsSectionIdSet } from '../../../shared/extensions/extensions-core.js';
import { getDisabledExtensionIds } from '../extensions/extension-lifecycle.js';
import {
  findSystemTabAcrossPanes,
  openSystemPage,
  registerSystemPage,
  systemPageOpenCount,
} from '../app/system-pages.js';
import { closeTab } from '../tabs/tabs.js';
import {
  applyAppearanceSection,
  dirtyAppearanceSection,
  renderAppearanceSection,
} from './settings-appearance.js';
import {
  applyAttachmentsSection,
  dirtyAttachmentsSection,
  renderAttachmentsAreaSection,
  renderAttachmentsSection,
  validateAttachmentsAreaSection,
  validateAttachmentsSection,
} from './settings-attachments.js';
import {
  applyBehaviorSection,
  dirtyBehaviorSection,
  renderBehaviorSection,
} from './settings-behavior.js';
import { dirtyCalendarSection } from './settings-calendar-model.js';
import {
  applyCalendarSection,
  renderCalendarSection,
  validateCalendarSection,
} from './settings-calendar-section.js';
import {
  applyColorSchemesSection,
  dirtyColorSchemesSection,
  renderColorSchemesSection,
} from './settings-color-schemes.js';
import { handleSettingsPageClose, resetPageState } from './settings-draft.js';
import {
  applyExtensionsSection,
  dirtyExtensionsSection,
  renderExtensionsSection,
  renderExternalExtensionsSection,
} from './settings-extensions.js';
import { dirtyHistoryAreaSection, renderHistoryAreaSection } from './settings-history.js';
import {
  applyHotkeysSection,
  cancelHotkeyCapture,
  dirtyHotkeysSection,
  renderHotkeysSection,
  validateHotkeysSection,
} from './settings-hotkeys.js';
import {
  applyJournalsSection,
  dirtyJournalsSection,
  renderJournalsSection,
  validateJournalsSection,
} from './settings-journals.js';
import {
  buildSettingsNavEntries,
  mountSettingsPage,
  refreshSettingsButtons,
  refreshSettingsNav,
  renderActiveSection,
  renderActiveSectionError,
  settingsPageEls,
} from './settings-mount.js';
import {
  applyProfilesSection,
  dirtyProfilesSection,
  renderProfilesSection,
} from './settings-profiles.js';
import { pageState } from './settings-shared.js';
import {
  applyExportSection,
  applyFrontmatterTimestampsSection,
  applyHeadingNumberingSection,
  applySpellcheckSection,
  dirtyExportSection,
  dirtyFrontmatterTimestampsSection,
  dirtyHeadingNumberingSection,
  dirtySpellcheckSection,
  renderExportSection,
  renderFrontmatterTimestampsSection,
  renderHeadingNumberingSection,
  renderSpellcheckSection,
} from './settings-small-sections.js';
import {
  applyRemindersSection,
  applyTasksSection,
  dirtyRemindersSection,
  dirtyTasksSection,
  renderRemindersSection,
  renderTasksSection,
} from './settings-tasks.js';
import {
  applyTaskStatesSection,
  dirtyTaskStatesSection,
  renderTaskStatesSection,
  validateTaskStatesSection,
} from './settings-task-states.js';
import {
  applyTemplatesSection,
  dirtyTemplatesAreaSection,
  dirtyTemplatesSection,
  renderTemplatesAreaSection,
  renderTemplatesSection,
  validateTemplatesAreaSection,
  validateTemplatesSection,
} from './settings-templates.js';

export const SETTINGS_PAGE_ID = 'settings';

export function openSettingsPage() {
  openSystemPage(SETTINGS_PAGE_ID);
}

function closeSettingsTab() {
  const found = findSystemTabAcrossPanes(SETTINGS_PAGE_ID);
  if (found) closeTab(found.paneIdx, found.tabIdx);
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
//   origin    optional (4T-0889, Epic 3E-0168); 'external' kennzeichnet den
//             Beitrag einer EXTERNEN Erweiterung. Gesetzt wird die Marke
//             allein vom Erweiterungs-Host beim Durchreichen des Beitrags
//             (extension-host.js); die Navigation sammelt diese Sektionen
//             im eigenen Block „Erweiterungen (extern)". Bewusst eine Marke
//             am Beitrag statt einer Ableitung aus dem ID-Präfix: das
//             Präfix ist eine Formatierungs-Entscheidung des Hosts, die
//             Herkunft eine Zusicherung.
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
  // src/shared/extensions/extensions.js) — erscheint nur bei aktiver Erweiterung.
  {
    id: 'frontmatterTimestamps',
    titleKey: 'settings.frontmatterTimestamps.title',
    render: renderFrontmatterTimestampsSection,
    apply: applyFrontmatterTimestampsSection,
    dirty: dirtyFrontmatterTimestampsSection,
  },
  // 4T-0581 (Epic 3E-0107): Rechtschreibprüfung (Schalter und Liste der
  // eigenen Wörterbuch-Einträge). Erweiterungs-eigener Bereich der
  // Erweiterung 'spellcheck' (settingsSections-Eintrag in
  // src/shared/extensions/extensions.js) — erscheint nur bei aktiver Erweiterung.
  {
    id: 'spellcheck',
    titleKey: 'settings.spellcheck.title',
    render: renderSpellcheckSection,
    apply: applySpellcheckSection,
    dirty: dirtySpellcheckSection,
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
  // 4T-0791 (Epic 3E-0125): Anlagen (Ablage-Form und Ordnername beim Einfügen
  // und Ziehen). Kern-Bereich ohne Erweiterungs-Kopplung, weil die Funktion
  // nach PO-Festlegung Kern ist. Position hinter „Verhalten": beide
  // konfigurieren, was beim Arbeiten am Dokument geschieht.
  {
    id: 'attachments',
    titleKey: 'settings.attachments.title',
    render: renderAttachmentsSection,
    validate: validateAttachmentsSection,
    apply: applyAttachmentsSection,
    dirty: dirtyAttachmentsSection,
  },
  // 4T-0791: Bereichs-Übersteuerung als eigene Sektion der Gruppe „Aktueller
  // Bereich" (Muster templatesArea). Teilt draft.attachments mit „Anlagen";
  // persistiert wird über dessen apply-Hook, ein eigener schriebe doppelt.
  {
    id: 'attachmentsArea',
    titleKey: 'settings.attachments.title',
    group: 'area',
    render: renderAttachmentsAreaSection,
    validate: validateAttachmentsAreaSection,
    dirty: dirtyAttachmentsSection,
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
  // (settingsSections-Eintrag in src/shared/extensions/extensions.js, Muster taskStates):
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
  // (settingsSections-Eintrag in src/shared/extensions/extensions.js).
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
  // Eintrag in src/shared/extensions/extensions.js, Registrierung in 4T-0546).
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
  // Erweiterung (settingsSections-Eintrag in src/shared/extensions/extensions.js).
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
  // tasks-Erweiterung (settingsSections-Eintrag in src/shared/extensions/extensions.js):
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
  // Erweiterung (settingsSections-Eintrag in src/shared/extensions/extensions.js):
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
  // Erweiterung (settingsSections-Eintrag in src/shared/extensions/extensions.js):
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

export function sectionById(id) {
  return settingsSections().find((s) => s.id === id) || null;
}

// 4T-0988 (Epic 3E-0196): ungefilterte Bereichs-Menge (feste plus
// dynamische). Sie ist die Prüf-Grundlage der Erweiterungs-Ansprüche in der
// Navigation: settingsSections() blendet die Bereiche abgeschalteter
// Erweiterungen aus und hätte dort einen Fehlalarm ausgelöst. Als Funktion
// statt als Export der beiden Listen, damit die Registry-Tabelle
// ausschließlich hier geschrieben wird.
export function allSettingsSections() {
  return [...FIXED_SECTIONS, ...dynamicSections];
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

// 4T-0701 (Epic 3E-0161): OK ist ein asynchroner Zyklus — der Klick kehrt
// zurueck, waehrend applySettingsPage noch auf den apply-Hooks steht. In
// diesem Fenster kann eine neue Oeffnungs-Anforderung eintreffen (Kuerzel,
// Menue, Kommando-Palette), und weil die Seite bis zum Schluss offen ist,
// aktiviert sie den bestehenden Reiter. Ohne Absicherung nahm die
// verspaetete Fortsetzung dem Nutzer genau die Seite weg, die er soeben
// angefordert hatte: Spalte 0 wurde leer, die view-system-Ansicht fiel weg,
// und die Navigations-Eintraege blieben als unsichtbares DOM stehen.
//
// Die Absicherung ist der Oeffnungs-Stand der Seite, festgehalten vor dem
// Warten (Muster der generation-Pruefungen der asynchronen Nachlade-Pfade
// weiter oben). Ist er gestiegen, gilt die spaetere Absicht: Die Seite
// bleibt offen, das Anwenden hat trotzdem stattgefunden. Bewusst NICHT
// geloest ueber eine festgehaltene Reiter-Referenz: Die Anforderung trifft
// denselben Reiter, eine Identitaets-Pruefung wuerde ihn also genauso
// schliessen.
export async function okSettingsPage() {
  const openCount = systemPageOpenCount(SETTINGS_PAGE_ID);
  if ((await applySettingsPage()) === false) return;
  if (systemPageOpenCount(SETTINGS_PAGE_ID) !== openCount) return;
  closeSettingsTab();
}

export function cancelSettingsPage() {
  // Revert der Live-Vorschau übernimmt der onClose-Haken beim Tab-Schluss.
  closeSettingsTab();
}

// 4T-0295: Erweiterungs-Umschalten (eigener Apply oder Broadcast eines
// anderen Fensters) zieht die Bereichsnavigation einer offenen Seite nach;
// renderActiveSection enthält den Rückfall auf den Bereich „Erweiterungen",
// falls der offene Bereich weggefallen ist. Der Entwurf übernimmt den
// neuen Schalt-Zustand (ein Apply danach würde sonst den Stand des
// anderen Fensters zurückdrehen, Muster mergeAppearanceSnapshot).
document.addEventListener('scg:extensions-changed', () => {
  if (pageState.draft) pageState.draft.extensionsDisabled = getDisabledExtensionIds();
  const els = settingsPageEls();
  if (!els || !els.nav || !els.nav.isConnected) return;
  buildSettingsNavEntries(els.nav);
  renderActiveSection();
});

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

// 4T-0988 (Epic 3E-0196): Die Seite bleibt für ihre Verbraucher außerhalb
// des Ordners ein Modul. Weitergereicht wird ausschließlich, was app-init.js
// und die Unit-Tests der Seite brauchen; alles Übrige beziehen die Module
// des Ordners direkt voneinander.
export {
  APPEARANCE_DEFAULTS,
  applyAppearanceVars,
  clampContentWidth,
  readAppearanceFromStore,
} from './settings-appearance.js';
export { mergeAppearanceSnapshot, refreshSettingsPageForAreaChange } from './settings-draft.js';
export { buildHotkeysDraftFromState, hotkeysDraftToOverrides } from './settings-hotkeys.js';
export { settingsPageStateForTests } from './settings-shared.js';
export { duplicateTaskStateChars, validateTaskStatesDraft } from './settings-task-states.js';
