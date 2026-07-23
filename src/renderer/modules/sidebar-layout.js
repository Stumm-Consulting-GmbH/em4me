// 4T-0287 (Epic 3E-0051): Panel-Registry und Sidebar-Layout-Modell.
//
// Fundament der dynamischen Sidebar: die sechs Bestands-Panels (Outline,
// Properties, Tags, Outgoing-Links, Backlinks, Bookmarks) registrieren sich
// hier als Panel-Definitionen (Andockpunkt auch für spätere Erweiterungs-
// Panels, 3E-0052/3E-0053). Das globale Layout-Modell (Einstellung
// `sidebar.layout`) beschreibt beide Seiten (links, rechts) als geordnete
// Slot-Listen; ein Slot mit mehreren Panel-IDs bildet eine Reiter-Gruppe,
// der aktive Reiter wird mitpersistiert. Die Sichtbarkeit je Panel bleibt
// unverändert pro Pane über die bestehenden `<panel>.visibleColumn0/1`-Keys
// geschaltet — das Layout beschreibt nur Seite, Reihenfolge und Gruppierung.
//
// Die Layout-Operationen sind reine Funktionen (Eingabe unverändert, neues
// Layout als Rückgabe; No-op liefert die Eingabe-Referenz zurück). Das hält
// sie unit-testbar und macht Änderungs-Erkennung über Identität möglich.
// Konsumenten (Rendering 4T-0288, Konfigurations-UI 4T-0289) hängen am
// Dokument-Event 'scg:sidebar-layout-changed' (Muster task-states/
// frontmatter-display).
'use strict';

import { api } from './api.js';
// 4T-0568 (Epic 3E-0104): Zugangs-Reihenfolge der Panel-Toggles (Statusbar-
// Leiste und Ansichtsmenü-Untermenü) aus dem prozess-neutralen Modell —
// reine Daten, zyklusfrei.
import {
  DEFAULT_PANEL_TOGGLE_ORDER,
  normalizePanelToggleOrder,
} from '../../shared/panel-access.js';

// Bewusst KEIN Import aus views.js oder anderen App-Modulen: die
// Panel-Module registrieren sich hier bereits während ihrer Modul-Body-
// Evaluierung — ein (transitiver) Rück-Import der Panel-Module würde die
// Registry in der TDZ treffen (ReferenceError im Zyklus). Der Persist-
// Helfer mit Statusbar-Feedback (persistSetting, views.js) wird deshalb
// zur Laufzeit von app-init.js angehängt (Muster attachBroadcast der
// Backlinks im Main); bis dahin gilt der schlanke api-Fallback.
let persistFn = async (key, value) => {
  try {
    await api.setSetting(key, value);
    return true;
  } catch (err) {
    console.warn('setSetting fehlgeschlagen:', key, err);
    return false;
  }
};

export function attachSidebarLayoutPersistence(fn) {
  if (typeof fn === 'function') persistFn = fn;
}

// --- Konstanten ---------------------------------------------------------------
export const SIDEBAR_SIDES = ['left', 'right'];
// Kanonische Reihenfolge der eingebauten Panels. Seit 4T-0563 (Epic 3E-0102)
// bestimmt sie nicht mehr das Default-Layout (das liefert die explizite
// Struktur DEFAULT_SIDEBAR_STRUCTURE unten), sondern nur noch die kanonische
// Ordnung von knownPanelIds() und die Anhänge-Reihenfolge fehlender Panels
// in normalizeSidebarLayout. Bestehende persistierte Layouts werden nicht
// umsortiert (normalizeSidebarLayout übernimmt die gespeicherte Slot-Reihen-
// folge unverändert und ergänzt nur fehlende Panel-IDs am Ende).
// 4T-0475 (Epic 3E-0088): 'bookmarks' vor 'outline' (PO-Wunsch I-05).
export const DEFAULT_PANEL_ORDER = [
  'bookmarks',
  'properties',
  // 4T-0364 (Epic 3E-0067): Block-Eigenschaften-Panel (Block-Metadaten aus der
  // .mdd), direkt neben dem Dokument-Properties-Panel.
  'blockprops',
  'tags',
  'outgoing',
  'backlinks',
  // 4T-0359 (Epic 3E-0066): Notizen-Panel (Dokument-Notiz aus der .mdd).
  'notes',
  'outline',
  // 4T-0563 (Epic 3E-0102): Unterseiten-Panel in die kanonische Reihenfolge
  // aufgenommen (fehlte zuvor und hing nur über den extras-Zweig von
  // knownPanelIds hinten an), thematisch neben dem Inhaltsverzeichnis.
  'subpages',
  // 4T-0327 (Epic 3E-0059): Bereichs-Panel (Ordnerbaum plus Dateiliste).
  'area',
  // 4T-0434 (Epic 3E-0081): Kalender-Panel (Journal-Einstieg, Monatsansicht).
  'calendar',
  // 4T-0527 (Epic 3E-0095): Erinnerungs-Panel (Fälligkeits-Gruppen mit
  // Überfällig-Sektion), thematisch neben dem Kalender.
  'reminders',
  // 4T-0372 (Epic 3E-0069): Uhr-Panel (analoge und digitale Zeit, Datum),
  // Abschluss der Zeit-Gruppe hinter Kalender und Erinnerungen.
  'clock',
  // 4T-0456 (Epic 3E-0084): Datei-Graph-Panel (Umfeld der aktiven Datei).
  'filegraph',
];
// 4T-0563 (Epic 3E-0102): explizite Standard-Anordnung der Sidebar (PO-
// Vorgabe): Panels auf beide Seiten verteilt, thematisch als Reiter-Gruppen
// gebündelt. Innere Arrays mit mehreren IDs sind Reiter-Gruppen, aktiver
// Reiter ist das jeweils erste Panel. Gilt für die frische Installation
// (kein gespeichertes Layout) und „Auf Standard-Anordnung zurücksetzen";
// hier nicht genannte Panels (z.B. Erweiterungs-Panels) hängt
// normalizeSidebarLayout robust als Einzel-Slots links an.
const DEFAULT_SIDEBAR_STRUCTURE = {
  left: [
    ['bookmarks', 'area'],
    ['outline', 'subpages', 'filegraph'],
    // 4T-0372 (Epic 3E-0069): die Uhr schliesst die Zeit-Gruppe ab. Als
    // dritter Reiter derselben Gruppe kostet sie keinen zusaetzlichen
    // vertikalen Platz in der Sidebar.
    ['calendar', 'reminders', 'clock'],
  ],
  right: [['notes'], ['properties', 'tags', 'blockprops'], ['outgoing', 'backlinks']],
};
// Breiten-Grenzen wie die bisherige Sidebar (panels.js OUTLINE_MIN/MAX_WIDTH);
// Default entspricht der bisherigen CSS-Startbreite der .pane-sidebar.
// 4T-0639 (Epic 3E-0069): Die Untergrenze bleibt auch im Icon-Zustand der
// Panel-Überschriften bei 180 Pixeln. Eine testweise Absenkung auf 120 hat
// der Product Owner am 2026-07-20 verworfen: Panel-Inhalte sind auf diese
// Breite ausgelegt (die Modusleiste der Uhr braucht allein 124 Pixel).
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 500;
export const SIDEBAR_DEFAULT_WIDTH = 260;

// --- Panel-Registry -------------------------------------------------------------
// Panel-Definition:
//   id           stabile Panel-Kennung (zugleich ID im Layout-Modell).
//   titleKey     i18n-Key des Panel-Titels (Sektion-Header, Reiter-Label).
//   buttonId     DOM-ID des Statusbar-Toggle-Buttons.
//   sectionClass CSS-Klasse der Panel-Sektion im Pane-DOM (ohne Punkt),
//                z.B. 'sidebar-outline'.
//   getVisible   (paneIdx) -> effektive Sichtbarkeit des Panels in der Pane
//                (inklusive Empty-State-Overrides des jeweiligen Moduls).
//   applyVisibility (paneIdx) Sichtbarkeit anwenden (bestehende
//                applyXxxVisibility-Funktion des Panel-Moduls).
//   toggle       (paneIdx) Sichtbarkeit umschalten (bestehender Toggle).
const panelRegistry = new Map();

export function registerSidebarPanel(def) {
  if (!def || typeof def.id !== 'string' || def.id === '') return;
  if (typeof def.titleKey !== 'string' || typeof def.sectionClass !== 'string') return;
  // Re-Registrierung derselben ID ersetzt den Eintrag (idempotent, Muster
  // registerSettingsSection).
  panelRegistry.set(def.id, def);
}

// 4T-0299 (Epic 3E-0053): Abmeldung fuer Panels externer Erweiterungen
// (Rollback beim Deaktivieren). Das Layout-Modell verliert die ID beim
// naechsten Normalisieren (unbekannte IDs werden verworfen); persistierte
// Positionen bleiben im Store und greifen wieder, wenn das Panel vor dem
// Layout-Laden erneut registriert ist.
export function unregisterSidebarPanel(id) {
  return panelRegistry.delete(id);
}

export function sidebarPanelById(id) {
  return panelRegistry.get(id) || null;
}

// Bekannte Panel-IDs in kanonischer Reihenfolge: eingebaute Panels in der
// Default-Reihenfolge, danach weitere registrierte (künftige Erweiterungs-
// Panels) in Registrierungs-Reihenfolge. Solange nichts registriert ist
// (isolierte Unit-Tests), gilt die eingebaute Liste.
export function knownPanelIds() {
  if (panelRegistry.size === 0) return [...DEFAULT_PANEL_ORDER];
  const builtins = DEFAULT_PANEL_ORDER.filter((id) => panelRegistry.has(id));
  const extras = [...panelRegistry.keys()].filter((id) => !DEFAULT_PANEL_ORDER.includes(id));
  return [...builtins, ...extras];
}

export function sidebarPanels() {
  return knownPanelIds()
    .map((id) => panelRegistry.get(id))
    .filter(Boolean);
}

// --- Zugangs-Reihenfolge der Panel-Toggles (4T-0568/4T-0569, Epic 3E-0104) -------
// Effektive Reihenfolge der Panel-Zugänge in Statusbar-Leiste und
// Ansichtsmenü-Untermenü. Getrennt vom Sidebar-Layout (Seite/Gruppen der
// Panels IN der Sidebar): hier geht es nur um die Toggle-Anordnung.
// Startwert ist die Modell-Reihenfolge; das persistierte Reihenfolge-
// Setting überschreibt sie zur Laufzeit. Konsumenten hängen am
// Dokument-Event 'scg:panel-toggle-order-changed' (Muster
// 'scg:sidebar-layout-changed').
const PANEL_TOGGLE_ORDER_KEY = 'panelToggle.order';
let panelToggleOrder = [...DEFAULT_PANEL_TOGGLE_ORDER];

export function getPanelToggleOrder() {
  return [...panelToggleOrder];
}

// 4T-0569: persistierte Reihenfolge laden (fehlend oder defekt fällt auf
// die Modell-Reihenfolge zurück). Läuft in init() vor dem ersten
// applyPanelButtonOrder/reportMenuStateNow-Durchgang.
export async function initPanelToggleOrderFromStore() {
  let stored;
  try {
    stored = await api.getSetting(PANEL_TOGGLE_ORDER_KEY);
  } catch {
    stored = null;
  }
  panelToggleOrder = normalizePanelToggleOrder(
    stored == null ? DEFAULT_PANEL_TOGGLE_ORDER : stored,
  );
  return getPanelToggleOrder();
}

// 4T-0569: Reihenfolge setzen — normalisiert, benachrichtigt Konsumenten
// (Statusbar-Anordnung, Menü-State-Meldung, offene Einstellungs-Entwürfe)
// und persistiert. persist:false für den Empfang des Fenster-Broadcasts
// (panelToggleOrder:changed), damit der Store nicht doppelt geschrieben
// wird; eine unveränderte Reihenfolge ist ein No-op.
export async function setPanelToggleOrder(order, opts = {}) {
  const normalized = normalizePanelToggleOrder(order);
  const changed = JSON.stringify(normalized) !== JSON.stringify(panelToggleOrder);
  if (changed) {
    panelToggleOrder = normalized;
    document.dispatchEvent(new CustomEvent('scg:panel-toggle-order-changed'));
    if (opts.persist !== false) await persistFn(PANEL_TOGGLE_ORDER_KEY, normalized);
  }
  return getPanelToggleOrder();
}

// 4T-0569: Zurücksetzen auf die Modell-Reihenfolge (Einstellungs-Knopf).
export function defaultPanelToggleOrder() {
  return [...DEFAULT_PANEL_TOGGLE_ORDER];
}

// --- Layout-Modell (reine Funktionen) --------------------------------------------
// Layout: { left: [Slot, ...], right: [Slot, ...] }
// Slot:   { panels: [panelId, ...], active: panelId }
// Invarianten (von normalizeSidebarLayout hergestellt):
//   - jede bekannte Panel-ID kommt genau einmal im Gesamtlayout vor,
//   - kein leerer Slot,
//   - slot.active ist immer Element von slot.panels.

function cloneLayout(layout) {
  return JSON.parse(JSON.stringify(layout));
}

export function layoutsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Stellt aus beliebigem (auch defektem) Input ein gültiges Layout her:
// unbekannte Panel-IDs werden verworfen, Duplikate auf das erste Vorkommen
// reduziert, leere Slots entfernt, fehlende bekannte Panels als eigene
// Slots ans Ende der linken Seite ergänzt (robust gegen künftige
// Panel-Zu- und Abgänge), ungültige active-Werte auf das erste Panel des
// Slots gesetzt.
export function normalizeSidebarLayout(raw, knownIds) {
  const known = Array.isArray(knownIds) ? knownIds : [];
  const knownSet = new Set(known);
  const seen = new Set();
  const result = { left: [], right: [] };
  for (const side of SIDEBAR_SIDES) {
    const slots = raw && typeof raw === 'object' && Array.isArray(raw[side]) ? raw[side] : [];
    for (const slot of slots) {
      const panels = slot && Array.isArray(slot.panels) ? slot.panels : [];
      const cleaned = [];
      for (const id of panels) {
        if (typeof id !== 'string' || !knownSet.has(id) || seen.has(id)) continue;
        seen.add(id);
        cleaned.push(id);
      }
      if (cleaned.length === 0) continue;
      const active = slot && cleaned.includes(slot.active) ? slot.active : cleaned[0];
      result[side].push({ panels: cleaned, active });
    }
  }
  for (const id of known) {
    if (!seen.has(id)) result.left.push({ panels: [id], active: id });
  }
  return result;
}

// Default-Layout: die explizite Standard-Anordnung DEFAULT_SIDEBAR_STRUCTURE
// (4T-0563), normalisiert gegen die bekannten Panel-IDs. Nicht registrierte
// Struktur-Panels fallen dabei heraus, nicht in der Struktur genannte
// bekannte Panels (Erweiterungs-Panels) werden als Einzel-Slots links
// angehängt. Bewusst entkoppelt vom Defekt-Fallback normalizeSidebarLayout(
// null, ...), der weiterhin „alle Panels links, keine Gruppen" liefert.
export function defaultSidebarLayout(knownIds) {
  const known = Array.isArray(knownIds) ? knownIds : knownPanelIds();
  const raw = { left: [], right: [] };
  for (const side of SIDEBAR_SIDES) {
    for (const panels of DEFAULT_SIDEBAR_STRUCTURE[side]) {
      raw[side].push({ panels: [...panels], active: panels[0] });
    }
  }
  return normalizeSidebarLayout(raw, known);
}

// Liefert die Position eines Panels: { side, slotIndex, panelIndex } | null.
export function findPanelInLayout(layout, panelId) {
  if (!layout) return null;
  for (const side of SIDEBAR_SIDES) {
    const slots = Array.isArray(layout[side]) ? layout[side] : [];
    for (let s = 0; s < slots.length; s++) {
      const panels = Array.isArray(slots[s].panels) ? slots[s].panels : [];
      const p = panels.indexOf(panelId);
      if (p >= 0) return { side, slotIndex: s, panelIndex: p };
    }
  }
  return null;
}

// Entfernt ein Panel in-place aus einem (geklonten) Layout. Leer gewordene
// Slots verschwinden; verliert ein Slot sein aktives Panel, übernimmt das
// erste verbleibende. Liefert true bei Treffer.
function removePanelInPlace(layout, panelId) {
  const loc = findPanelInLayout(layout, panelId);
  if (!loc) return false;
  const slots = layout[loc.side];
  const slot = slots[loc.slotIndex];
  slot.panels.splice(loc.panelIndex, 1);
  if (slot.panels.length === 0) {
    slots.splice(loc.slotIndex, 1);
  } else if (slot.active === panelId) {
    slot.active = slot.panels[0];
  }
  return true;
}

// Verschiebt ein Panel als eigenen Slot an die Position slotIndex der
// Zielseite. slotIndex bezieht sich auf die Slot-Liste NACH dem Entfernen
// des Panels aus seiner alten Position (relevant beim Verschieben innerhalb
// derselben Seite) und wird auf [0, Anzahl Slots] geklemmt. Unbekanntes
// Panel oder ungültige Seite: No-op (Eingabe-Referenz zurück).
export function movePanelToNewSlot(layout, panelId, targetSide, slotIndex) {
  if (!SIDEBAR_SIDES.includes(targetSide)) return layout;
  if (!findPanelInLayout(layout, panelId)) return layout;
  const next = cloneLayout(layout);
  removePanelInPlace(next, panelId);
  const slots = next[targetSide];
  const idx = Math.max(0, Math.min(slots.length, Number.isInteger(slotIndex) ? slotIndex : 0));
  slots.splice(idx, 0, { panels: [panelId], active: panelId });
  return layoutsEqual(next, layout) ? layout : next;
}

// 4T-0289: Verschiebt ein Panel als eigenen Slot direkt vor bzw. hinter den
// Slot, der targetPanelId enthält. Die Ziel-Identifikation über die Panel-ID
// ist gegenüber Slot-Indizes stabil (das Entfernen des Quell-Panels kann
// Indizes verschieben). No-op bei Selbst-Bezug oder unbekannten IDs.
export function movePanelRelativeTo(layout, panelId, targetPanelId, position) {
  if (panelId === targetPanelId) return layout;
  if (position !== 'before' && position !== 'after') return layout;
  const src = findPanelInLayout(layout, panelId);
  const dst = findPanelInLayout(layout, targetPanelId);
  if (!src || !dst) return layout;
  const next = cloneLayout(layout);
  removePanelInPlace(next, panelId);
  const dstAfter = findPanelInLayout(next, targetPanelId);
  const idx = dstAfter.slotIndex + (position === 'after' ? 1 : 0);
  next[dstAfter.side].splice(idx, 0, { panels: [panelId], active: panelId });
  return layoutsEqual(next, layout) ? layout : next;
}

// Verschiebt ein Panel in den Slot, der targetPanelId enthält (bildet bzw.
// erweitert eine Reiter-Gruppe); das verschobene Panel wird aktiver Reiter.
// No-op bei unbekannten IDs, Selbst-Bezug oder wenn beide bereits im selben
// Slot liegen.
export function groupPanelWith(layout, panelId, targetPanelId) {
  if (panelId === targetPanelId) return layout;
  const src = findPanelInLayout(layout, panelId);
  const dst = findPanelInLayout(layout, targetPanelId);
  if (!src || !dst) return layout;
  if (src.side === dst.side && src.slotIndex === dst.slotIndex) return layout;
  const next = cloneLayout(layout);
  removePanelInPlace(next, panelId);
  // Ziel-Slot nach dem Entfernen neu suchen — Slot-Indizes können sich
  // verschoben haben, die Ziel-Panel-ID identifiziert den Slot stabil.
  const dstAfter = findPanelInLayout(next, targetPanelId);
  const slot = next[dstAfter.side][dstAfter.slotIndex];
  slot.panels.push(panelId);
  slot.active = panelId;
  return next;
}

// Setzt den aktiven Reiter des Slots, der das Panel enthält. No-op, wenn
// unbekannt oder bereits aktiv.
export function setActivePanel(layout, panelId) {
  const loc = findPanelInLayout(layout, panelId);
  if (!loc) return layout;
  if (layout[loc.side][loc.slotIndex].active === panelId) return layout;
  const next = cloneLayout(layout);
  next[loc.side][loc.slotIndex].active = panelId;
  return next;
}

// Löst die Reiter-Gruppe auf, die das Panel enthält: der Slot wird an
// seiner Position durch Einzel-Slots in Panel-Reihenfolge ersetzt.
// No-op bei unbekanntem Panel oder Einzel-Slot.
export function dissolveGroup(layout, panelId) {
  const loc = findPanelInLayout(layout, panelId);
  if (!loc) return layout;
  const slot = layout[loc.side][loc.slotIndex];
  if (slot.panels.length < 2) return layout;
  const next = cloneLayout(layout);
  const singles = slot.panels.map((id) => ({ panels: [id], active: id }));
  next[loc.side].splice(loc.slotIndex, 1, ...singles);
  return next;
}

// --- Laufzeit-Zustand, Persistenz und Migration -----------------------------------
// currentLayout ist die eine Wahrheit des Fensters; null bis zum ersten
// Zugriff bzw. bis initSidebarLayoutFromStore gelaufen ist.
let currentLayout = null;
const sidebarWidths = { left: SIDEBAR_DEFAULT_WIDTH, right: SIDEBAR_DEFAULT_WIDTH };

// 4T-0475 (Epic 3E-0088): manuell eingestellte Panel-Höhen. Objekt
// panelId → Pixel-Zahl; nur gesetzte Panels haben einen Eintrag (fehlender
// Eintrag = Automatik/Default-Höhe). Die Höhe gilt global pro Panel-ID (jede
// ID kommt laut Layout-Invariante genau einmal im Gesamtlayout vor). Persistiert
// als ein Objekt unter dem Key `sidebar.panelHeights`, analog zur Breiten-
// Verwaltung darüber.
export const MIN_PANEL_HEIGHT = 60;
const MAX_PANEL_HEIGHT = 2000;
const sidebarPanelHeights = {};

export function getSidebarLayout() {
  if (!currentLayout) currentLayout = defaultSidebarLayout(knownPanelIds());
  return currentLayout;
}

// Wendet ein Layout an: normalisieren, übernehmen, Konsumenten über das
// Dokument-Event benachrichtigen und (Default) persistieren. Der Empfangs-
// pfad eines Multi-Window-Broadcasts ruft mit { persist: false } auf
// (der Auslöser hat den Store bereits geschrieben). Unverändertes Layout
// ist ein No-op (false); sonst true.
export async function applySidebarLayout(next, { persist = true } = {}) {
  const normalized = normalizeSidebarLayout(next, knownPanelIds());
  if (currentLayout && layoutsEqual(normalized, currentLayout)) return false;
  currentLayout = normalized;
  document.dispatchEvent(new CustomEvent('scg:sidebar-layout-changed'));
  if (persist) await persistFn('sidebar.layout', normalized);
  return true;
}

export async function resetSidebarLayout(options) {
  return applySidebarLayout(defaultSidebarLayout(knownPanelIds()), options);
}

// 4T-0288: Reiter des Panels in seiner Gruppe aktivieren (No-op außerhalb
// von Gruppen bzw. wenn bereits aktiv). Wird von den Sichtbarkeits-Toggles
// gerufen — das Einblenden eines gruppierten Panels aktiviert dessen Reiter.
export async function ensurePanelTabActive(panelId) {
  const layout = getSidebarLayout();
  const next = setActivePanel(layout, panelId);
  if (next === layout) return false;
  return applySidebarLayout(next);
}

// 4T-0639 (Epic 3E-0069): Panel-Überschriften als Icon statt Text. Der
// Zustand liegt hier bei den übrigen Sidebar-Layout-Daten, weil er zum
// Layout gehört und wie dieses global gilt.
const SIDEBAR_ICON_HEADINGS_KEY = 'sidebar.iconHeadings';
let iconHeadings = false;

export function getIconHeadings() {
  return iconHeadings;
}

// Setzen — benachrichtigt Konsumenten (Sidebar-Rendering, offene
// Einstellungs-Entwürfe) und persistiert. persist:false für den Empfang des
// Fenster-Broadcasts (Muster setPanelToggleOrder).
export async function setIconHeadings(value, { persist = true } = {}) {
  const next = value === true;
  if (next === iconHeadings) return iconHeadings;
  iconHeadings = next;
  document.dispatchEvent(new CustomEvent('scg:sidebar-icon-headings-changed'));
  if (persist) await persistFn(SIDEBAR_ICON_HEADINGS_KEY, next);
  return iconHeadings;
}

export function clampSidebarWidth(value) {
  // null/undefined bewusst als "kein Wert" behandeln (Number(null) wäre 0
  // und würde fälschlich auf das Minimum klemmen).
  if (value == null) return SIDEBAR_DEFAULT_WIDTH;
  const n = Number(value);
  if (!Number.isFinite(n)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(n)));
}

export function getSidebarWidth(side) {
  return sidebarWidths[side] ?? SIDEBAR_DEFAULT_WIDTH;
}

export async function setSidebarWidth(side, value, { persist = true } = {}) {
  if (!SIDEBAR_SIDES.includes(side)) return;
  sidebarWidths[side] = clampSidebarWidth(value);
  if (persist) {
    const key = side === 'left' ? 'sidebar.widthLeft' : 'sidebar.widthRight';
    await persistFn(key, sidebarWidths[side]);
  }
}

// 4T-0475 (Epic 3E-0088): numerische Sanity einer Panel-Höhe. Ungültige
// Werte (nicht-endlich, null/undefined) liefern null zurück (= Automatik),
// gültige werden auf [MIN_PANEL_HEIGHT, MAX_PANEL_HEIGHT] geklemmt und
// gerundet. Bewusst asymmetrisch zu clampSidebarWidth: dort ist der Fallback
// eine Default-Breite, hier bedeutet „kein Wert" das Löschen der Fixierung.
export function clampPanelHeight(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, Math.round(n)));
}

export function getPanelHeight(id) {
  return sidebarPanelHeights[id] ?? null;
}

// value null (oder ungültig) löscht den Eintrag → Panel fällt auf die
// automatische Höhe zurück. Persist-Default true schreibt das gesamte
// Höhen-Objekt unter `sidebar.panelHeights` (Muster setSidebarWidth).
export async function setPanelHeight(id, value, { persist = true } = {}) {
  if (typeof id !== 'string' || id === '') return;
  const clamped = clampPanelHeight(value);
  if (clamped == null) {
    delete sidebarPanelHeights[id];
  } else {
    sidebarPanelHeights[id] = clamped;
  }
  if (persist) await persistFn('sidebar.panelHeights', { ...sidebarPanelHeights });
}

// App-Start: persistiertes Höhen-Objekt laden (Muster der Breiten-Lade-
// Logik in initSidebarLayoutFromStore). Wird im selben Init-Pfad gerufen.
// Robust gegen defekte Stände: nur Einträge mit gültiger geklemmter Höhe
// werden übernommen.
export async function loadSidebarPanelHeights() {
  let stored;
  try {
    stored = await api.getSetting('sidebar.panelHeights');
  } catch (err) {
    console.warn('Sidebar-Panel-Höhen laden fehlgeschlagen:', err);
  }
  for (const key of Object.keys(sidebarPanelHeights)) delete sidebarPanelHeights[key];
  if (stored && typeof stored === 'object') {
    for (const [id, value] of Object.entries(stored)) {
      const clamped = clampPanelHeight(value);
      if (clamped != null) sidebarPanelHeights[id] = clamped;
    }
  }
}

// App-Start: persistiertes Layout und Breiten laden. Ohne gespeichertes
// Layout entsteht das explizite Default-Layout (4T-0563; derselbe Stand wie
// nach „Auf Standard-Anordnung zurücksetzen"); ein vorhandener, auch
// defekter Speicher-Stand läuft dagegen durch die Normalisierung und bleibt
// damit als Nutzer-Layout erhalten. Die bisherige gemeinsame Breite
// `outline.width` wird als Startbreite der linken Seite übernommen, die
// rechte Seite erhält den Default. Der Legacy-Key bleibt unangetastet (kein
// Zurückschreiben nötig, `sidebar.widthLeft` gewinnt ab dem ersten eigenen
// Persist).
export async function initSidebarLayoutFromStore() {
  let storedLayout;
  let storedLeft;
  let storedRight;
  let legacyWidth;
  try {
    storedLayout = await api.getSetting('sidebar.layout');
    storedLeft = await api.getSetting('sidebar.widthLeft');
    storedRight = await api.getSetting('sidebar.widthRight');
    legacyWidth = await api.getSetting('outline.width');
    // 4T-0639: Icon-Zustand der Panel-Überschriften.
    iconHeadings = (await api.getSetting(SIDEBAR_ICON_HEADINGS_KEY)) === true;
  } catch (err) {
    console.warn('Sidebar-Layout laden fehlgeschlagen:', err);
  }
  currentLayout =
    storedLayout == null
      ? defaultSidebarLayout(knownPanelIds())
      : normalizeSidebarLayout(storedLayout, knownPanelIds());
  sidebarWidths.left = clampSidebarWidth(storedLeft ?? legacyWidth ?? SIDEBAR_DEFAULT_WIDTH);
  sidebarWidths.right = clampSidebarWidth(storedRight ?? SIDEBAR_DEFAULT_WIDTH);
}

// Nur für Tests: Laufzeit-Zustand zurücksetzen (Modul-Zustand überlebt
// sonst zwischen Testfällen desselben Imports).
export function resetSidebarLayoutStateForTests() {
  currentLayout = null;
  sidebarWidths.left = SIDEBAR_DEFAULT_WIDTH;
  sidebarWidths.right = SIDEBAR_DEFAULT_WIDTH;
  // 4T-0639: Icon-Zustand der Überschriften ebenfalls zurücksetzen.
  iconHeadings = false;
  // 4T-0475 (Epic 3E-0088): Panel-Höhen ebenfalls zurücksetzen.
  for (const key of Object.keys(sidebarPanelHeights)) delete sidebarPanelHeights[key];
  panelRegistry.clear();
}
