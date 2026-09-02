// Sichtbarkeit, Umschalten und Persistenz der Properties- und der Tag-Sektion,
// dazu die Registrierung beider Panels in der Sidebar-Registry.
// 4T-000179 (Epic 3E-000039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
// 4T-000981 (Epic 3E-000196): Kern des Feature-Ordners `properties/`; Typ-System,
// Feld-DOM, Schreibweg und Vorschlags-Menü liegen in den Nachbar-Modulen
// properties-types, properties-fields, properties-save und properties-suggest.
'use strict';

import { api } from '../app/api.js';
// 4T-000294 (Epic 3E-000052): Tag-Panel gehoert zur Tag-Erweiterung.
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { getPaneEls, state } from '../app/app-state.js';
import { applySidebarVisibility } from '../panels/panels.js';
import { reportMenuStateNow } from '../tabs/tabs.js';
import { isAllEmpty, persistSetting } from '../views/views.js';
import { renderTags } from '../editor/autocomplete-help.js';
// 4T-000287/4T-000288 (Epic 3E-000051): Panel-Registry — Properties und Tags
// registrieren sich am Modul-Ende; Einblenden aktiviert den Gruppen-Reiter.
import { ensurePanelTabActive, registerSidebarPanel } from '../sidebar-layout.js';
import { renderProperties } from './properties-fields.js';

// --- Properties-Sidebar (4T-000051) -------------------------------------------
// Live-editierbare Sidebar-Sektion fuer YAML-Frontmatter-Felder (Sektion
// neben Outline und Backlinks). Pro Spalte eine eigene Instanz; Sichtbar-
// keit pro Spalte persistent. Typ-Inferenz aus dem aktuellen Wert, Round-
// Trip-Schreiben via writeFrontmatter (src/shared/markdown/frontmatter.js) (erhaelt Kommentare
// und Stil nicht-geaenderter Felder). Felder leben direkt im DOM der
// jeweiligen Sektion; bei Field-Change laeuft Debounce-Save (500 ms).
//
// State:
//   state.properties = {
//     visibleByPane: { 0: false, 1: false },
//     saveTimers:    { 0: null,  1: null },
//     originalDataByPane: { 0: {}, 1: {} },  // fuer readonly-Felder-Lookup
//   }

// --- Properties-Sidebar: Sichtbarkeit, Toggle, Persistenz -------------------
export function applyPropertiesVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.propertiesSection) return;
  // 4T-000075: Properties im Empty-State zwangsweise unsichtbar.
  const visible = !isAllEmpty() && !!state.properties.visibleByPane[paneIdx];
  els.propertiesSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) {
    renderProperties(paneIdx);
  }
  updatePropertiesToggleButton();
}

export function updatePropertiesToggleButton() {
  const btn = document.getElementById('btn-properties');
  if (!btn) return;
  const visible = !!state.properties.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function togglePropertiesPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.properties.visibleByPane[paneIdx];
  state.properties.visibleByPane[paneIdx] = next;
  // 4T-000288: Einblenden aktiviert den Reiter in einer Gruppe.
  if (next) await ensurePanelTabActive('properties', paneIdx);
  applyPropertiesVisibility(paneIdx);
  await persistPropertiesSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

// 4T-001174 (Epic 3E-000220, AK1/AK2): Das Feld-Formular öffnen.
//
// «Öffnen» heißt hier drei Dinge, weil das Formular ein Ausklapp-Bereich der
// Eigenschaften-Sektion ist (Festlegung des Product Owners vom 2026-08-24) und
// kein eigenes Fenster: die Sektion sichtbar machen, falls sie verborgen ist,
// den Bereich aufklappen und ihn in den sichtbaren Ausschnitt rücken.
//
// Sichtbar machen läuft über `togglePropertiesPanel` und nicht über eine
// eigene Zuweisung an `state`: Dort hängen der Gruppen-Reiter, die Persistenz
// und die Menü-Meldung mit dran, und ein zweiter Weg würde sie beim Öffnen
// über dieses Kommando still übergehen. Ist die Sektion schon sichtbar, wird
// nichts umgeschaltet — nur der Gruppen-Reiter aktiviert, damit der Bereich in
// einer Reiter-Anordnung auch wirklich vorne liegt.
//
// AK4: Ohne aktives Dokument gibt es keinen Bereich; die Funktion endet dann
// still, statt einen leeren aufzuklappen.
export async function oeffneFeldFormular(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return null;
  if (state.properties.visibleByPane[paneIdx]) {
    await ensurePanelTabActive('properties', paneIdx);
  } else {
    await togglePropertiesPanel(paneIdx);
  }
  // 4T-001173: Erst den Merker setzen, dann das Element aufklappen. Ein
  // spaeteres Neu-Rendern (etwa durch die nachziehende Aufloesung) baut den
  // Bereich neu und liest ihn von dort; ohne den Merker klappte er dabei
  // sofort wieder zu.
  state.properties.feldFormularOffenByPane[paneIdx] = true;
  const els = getPaneEls(paneIdx);
  const bereich =
    els && els.propertiesFields
      ? els.propertiesFields.querySelector('.properties-all-fields')
      : null;
  if (!bereich) return null;
  bereich.open = true;
  if (typeof bereich.scrollIntoView === 'function') bereich.scrollIntoView({ block: 'nearest' });
  return bereich;
}

export async function persistPropertiesSettings() {
  await persistSetting('properties.visibleColumn0', !!state.properties.visibleByPane[0]);
  await persistSetting('properties.visibleColumn1', !!state.properties.visibleByPane[1]);
}

export async function loadPropertiesSettings() {
  const v0 = await api.getSetting('properties.visibleColumn0');
  const v1 = await api.getSetting('properties.visibleColumn1');
  state.properties.visibleByPane[0] = !!v0;
  state.properties.visibleByPane[1] = !!v1;
}

// --- Tag-Sidebar (4T-000056, Epic 3E-000011) ------------------------------------
// Vierte Sidebar-Sektion zwischen Properties und Backlinks. Zeigt alle
// Tags im Backlinks-Suchraum mit Haeufigkeits-Counts in hierarchischer
// Anzeige (Slash-getrennte Hierarchie). Filter-Eingabe macht Substring-
// Match. Klick auf einen Tag wechselt die Anzeige auf die Datei-Liste
// fuer diesen Tag; Back-Button geht zur Tag-Liste zurueck.
export function applyTagsVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.tagsSection) return;
  // 4T-000075: Tags im Empty-State zwangsweise unsichtbar.
  // 4T-000294: bei deaktivierter Tag-Erweiterung ebenso; die persistierte
  // Sichtbarkeits-Preference bleibt erhalten.
  const visible = !isAllEmpty() && isExtensionActive('tags') && !!state.tags.visibleByPane[paneIdx];
  els.tagsSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) renderTags(paneIdx);
  updateTagsToggleButton();
}

export function updateTagsToggleButton() {
  const btn = document.getElementById('btn-tags');
  if (!btn) return;
  const visible = !!state.tags.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleTagsPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.tags.visibleByPane[paneIdx];
  state.tags.visibleByPane[paneIdx] = next;
  // 4T-000288: Einblenden aktiviert den Reiter in einer Gruppe.
  if (next) await ensurePanelTabActive('tags', paneIdx);
  applyTagsVisibility(paneIdx);
  await persistTagsSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistTagsSettings() {
  await persistSetting('tags.visibleColumn0', !!state.tags.visibleByPane[0]);
  await persistSetting('tags.visibleColumn1', !!state.tags.visibleByPane[1]);
}

export async function loadTagsSettings() {
  const v0 = await api.getSetting('tags.visibleColumn0');
  const v1 = await api.getSetting('tags.visibleColumn1');
  state.tags.visibleByPane[0] = !!v0;
  state.tags.visibleByPane[1] = !!v1;
}

// === 4T-000287 (Epic 3E-000051): Panel-Registrierung =============================
// getVisible spiegelt die effektive Sichtbarkeits-Logik aus
// applySidebarVisibility (panels.js) inklusive Empty-State-Override.

registerSidebarPanel({
  id: 'properties',
  titleKey: 'properties.title',
  buttonId: 'btn-properties',
  sectionClass: 'sidebar-properties',
  getVisible: (paneIdx) =>
    !isAllEmpty() && !!(state.properties && state.properties.visibleByPane[paneIdx]),
  applyVisibility: applyPropertiesVisibility,
  toggle: togglePropertiesPanel,
});

registerSidebarPanel({
  id: 'tags',
  titleKey: 'tags.title',
  buttonId: 'btn-tags',
  sectionClass: 'sidebar-tags',
  getVisible: (paneIdx) =>
    !isAllEmpty() &&
    isExtensionActive('tags') &&
    !!(state.tags && state.tags.visibleByPane[paneIdx]),
  applyVisibility: applyTagsVisibility,
  toggle: toggleTagsPanel,
});
