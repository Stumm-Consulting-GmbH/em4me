// Vorschlags-Menü für „Eigenschaft hinzufügen" und die Komplett-Übernahme
// eines Profils.
// 4T-000981 (Epic 3E-000196): Auszug aus properties-tags.js. Das Menü selbst ist
// generisch (Handler-Objekt) und wird vom Block-Eigenschaften-Panel
// mitbenutzt — ein Verhalten, zwei Oberflächen.
'use strict';

import { t } from '../../i18n.js';
// 4T-000491 (Epic 3E-000093): isolierte Undo-Einheit der Komplett-Übernahme.
import { isolateHistory } from '@codemirror/commands';
import { api, getDocText } from '../app/api.js';
import { applyRenderPipeline } from '../render-mermaid.js';
import { getPaneEls, state } from '../app/app-state.js';
import { paneEditors, syncEditorForPane, updateWindowTitle } from '../editor/editor.js';
import { renderTabbar } from '../views/tabbar.js';
import { scheduleAutoSave } from '../views/views.js';
// 4T-000491 (Epic 3E-000093): profil-gruppierte Menü-Struktur.
import { profileSuggestGroups } from '../../../shared/property-profiles.js';
import { defaultValueForType, FIELD_TYPE_HINTS } from './properties-types.js';
import { flushPendingPropertiesSave, scheduleSavePropertiesFromPane } from './properties-save.js';
import { buildPropertyFieldDom, renderProperties } from './properties-fields.js';
// 4T-001172 (Epic 3E-000220): Der Typ-Wechsel liegt seit dem Schnitt des
// Datei-Budgets bei den Wert-Editoren.
import { onTypeChange } from './properties-wert-editor.js';
// 4T-001179 (Epic 3E-000220): Marke der Angebots-Felder des Feld-Formulars.
import { MARKE_NICHT_IM_DOKUMENT } from './properties-feld-formular.js';

// --- 4T-000448: Vorschlags-Menü für „Eigenschaft hinzufügen" --------------------

let suggestMenuEl = null;

function closeSuggestMenu() {
  if (!suggestMenuEl) return;
  suggestMenuEl.remove();
  suggestMenuEl = null;
  document.removeEventListener('mousedown', onSuggestMenuOutside, true);
  document.removeEventListener('keydown', onSuggestMenuKey, true);
}

function onSuggestMenuOutside(e) {
  if (suggestMenuEl && !suggestMenuEl.contains(e.target)) closeSuggestMenu();
}

function onSuggestMenuKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeSuggestMenu();
  }
}

// Öffnet das Vorschlags-Menü am Hinzufügen-Button als eine nach Profilen
// gruppierte, eingerückte Liste (PO-Festlegung 2026-07-11): pro aufgelöstem
// Profil ein KLICKBARER Kopf mit dem Profil-Namen (Komplett-Übernahme aller
// fehlenden Felder dieses Profils), darunter eingerückt die Einzel-Felder;
// danach die profillosen Standard-Vorschläge unter einer dezenten Überschrift
// „Weitere Felder", am Ende „Eigenes Feld". `groups` ist das Ergebnis von
// profileSuggestGroups. Exportiert generisch (handlers.onBulk / onSuggestion /
// onCustom) — das Block-Panel nutzt dasselbe Menü (ein Verhalten, zwei
// Oberflächen).
export function openFieldSuggestMenu(anchorEl, groups, handlers) {
  closeSuggestMenu();
  const menu = document.createElement('div');
  menu.className = 'properties-suggest-menu';
  const addButton = (label, opts = {}) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'properties-suggest-item' +
      (opts.extraClass ? ' ' + opts.extraClass : '') +
      (opts.indent ? ' is-indent' : '');
    if (opts.title) btn.title = opts.title;
    const name = document.createElement('span');
    name.className = 'properties-suggest-name';
    name.textContent = label;
    btn.appendChild(name);
    btn.addEventListener('click', () => {
      closeSuggestMenu();
      opts.onPick();
    });
    menu.appendChild(btn);
  };
  const g = groups || {};
  const profileGroups = Array.isArray(g.profileGroups) ? g.profileGroups : [];
  const otherFields = Array.isArray(g.otherFields) ? g.otherFields : [];
  for (const grp of profileGroups) {
    addButton(grp.profile, {
      onPick: () => handlers.onBulk(grp),
      extraClass: 'is-profile-head',
      title: t('properties.profileSuggest.fillProfileHint').replace('{profile}', grp.profile),
    });
    for (const s of grp.fields) {
      addButton(s.name, { onPick: () => handlers.onSuggestion(s), indent: true });
    }
  }
  if (otherFields.length > 0) {
    const grouped = profileGroups.length > 0;
    if (grouped) {
      const lbl = document.createElement('div');
      lbl.className = 'properties-suggest-group-label';
      lbl.textContent = t('properties.profileSuggest.otherFields');
      menu.appendChild(lbl);
    }
    for (const s of otherFields) {
      addButton(s.name, { onPick: () => handlers.onSuggestion(s), indent: grouped });
    }
  }
  addButton(t('properties.profileSuggest.custom'), {
    onPick: () => handlers.onCustom(),
    extraClass: 'is-custom',
  });
  const rect = anchorEl.getBoundingClientRect();
  menu.style.left = `${Math.round(rect.left)}px`;
  menu.style.top = `${Math.round(rect.bottom + 2)}px`;
  document.body.appendChild(menu);
  // Menü im Fenster halten (die Sidebar sitzt am Rand).
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.right > window.innerWidth - 4) {
    menu.style.left = `${Math.max(4, Math.round(window.innerWidth - menuRect.width - 4))}px`;
  }
  if (menuRect.bottom > window.innerHeight - 4) {
    menu.style.top = `${Math.max(4, Math.round(rect.top - menuRect.height - 2))}px`;
  }
  suggestMenuEl = menu;
  document.addEventListener('mousedown', onSuggestMenuOutside, true);
  document.addEventListener('keydown', onSuggestMenuKey, true);
}

// Legt ein Feld aus einem Vorschlag an: Definitions-Felder mit Definitions-
// Typ und Default (PO-Konzept), Heuristik-Felder mit dem Hint-Typ.
function addFieldFromSuggestion(paneIdx, suggestion) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.propertiesFields) return;
  const def = suggestion.def || null;
  const type = suggestion.type || 'string';
  const value =
    def && def.default !== null && def.default !== undefined
      ? def.default
      : defaultValueForType(type);
  const fieldEl = buildPropertyFieldDom(paneIdx, suggestion.name, value, type, def);
  if (els.propertiesEmpty) els.propertiesEmpty.hidden = true;
  els.propertiesFields.appendChild(fieldEl);
  scheduleSavePropertiesFromPane(paneIdx);
  const focusTarget = fieldEl.querySelector(
    '.properties-field-value input, .properties-field-value select, .properties-field-value textarea',
  );
  if (focusTarget) setTimeout(() => focusTarget.focus(), 0);
}

// 4T-000491 (Epic 3E-000093): Komplett-Übernahme im Properties-Editor. Ergänzt alle
// fehlenden Felder des Ziels in EINEM writeFrontmatter-Aufruf (ein Undo-Schritt);
// leere Stub-Felder erscheinen als bare YAML-Schlüssel. Bestehende Werte und ihre
// Reihenfolge bleiben unangetastet; der Schreibpfad geht am DOM vorbei direkt auf
// den Datei-Inhalt (keine Feld-für-Feld-Debounce-Saves).
// 4T-001173 (Epic 3E-000220): exportiert, damit die Profil-Kette des Feld-
// Formulars je Ebene übernehmen kann. Sie reicht dieselbe `map` herein, nur
// auf die Felder einer Ebene gefiltert — derselbe Schreibweg, dieselbe
// Undo-Einheit, dieselbe Sperre bei defektem YAML.
export function applyProfileFill(paneIdx, target) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.propertiesFields) return;
  // R5-02-Linie: bei defektem YAML ist der Hinzufügen-Button gesperrt.
  if (els.propertiesAddBtn && els.propertiesAddBtn.disabled) return;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (!tab || !target || !target.map) return;
  // Pending Debounce-Save zuerst flushen (ungespeicherter DOM-Stand).
  flushPendingPropertiesSave(paneIdx);
  let fm;
  try {
    fm = api.getFrontmatter(tab.content || '');
  } catch {
    return;
  }
  if (fm && fm.parseError) return; // defektes YAML: niemals schreiben
  const current = fm && fm.data ? fm.data : {};
  const stubKeys = Object.keys(target.map);
  const newData = { ...current, ...target.map };
  const result = api.writeFrontmatter(tab.content || '', newData, { emptyStubKeys: stubKeys });
  if (!result || !result.ok) {
    els.propertiesParseError.hidden = false;
    els.propertiesParseError.textContent = t('properties.writeError').replace(
      '{error}',
      result && result.error ? result.error : 'unknown',
    );
    return;
  }
  if (result.text === tab.content) return; // nichts Neues (alle Felder schon da)
  const wasDirty = tab.dirty;
  tab.content = result.text;
  tab.dirty = tab.content !== tab.originalContent;
  els.propertiesParseError.hidden = true;
  // Sidebar-Felder neu aufbauen (Menü-Aktion, kein Feld hat Fokus).
  renderProperties(paneIdx);
  // Editor-Inhalt als EIGENE, isolierte Undo-Einheit setzen: ein Undo-Schritt
  // nimmt genau die Komplett-Übernahme zurück und verschmilzt nicht mit einem
  // vorherigen Historien-Ereignis (Muster block-props applyRename, 4T-000484) —
  // sonst kann ein Undo bis zum leeren Dokument zurücklaufen.
  const view = paneEditors[paneIdx];
  if (view && getDocText(view.state.doc) !== tab.content) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: tab.content },
      annotations: isolateHistory.of('full'),
    });
  } else if (!view) {
    syncEditorForPane(paneIdx);
  }
  const elsR = getPaneEls(paneIdx);
  if (elsR.renderedHtml) {
    elsR.renderedHtml.innerHTML = api.renderMarkdown(tab.content, tab.path);
    applyRenderPipeline(elsR.renderedHtml, tab.path);
  }
  if (wasDirty !== tab.dirty) {
    renderTabbar(paneIdx);
    if (paneIdx === state.activePaneIndex) updateWindowTitle();
  }
  scheduleAutoSave();
}

// 4T-000051: Fuegt der Sidebar-Sektion einer Pane ein neues, leeres Feld
// hinzu. Default-Typ 'string'; wenn der Nutzer den Key auf einen bekannten
// Standard-Namen setzt, wird der Typ aus FIELD_TYPE_HINTS uebernommen.
// 4T-000448: mit konfigurierten Profilen öffnet der Button zuerst das
// Vorschlags-Menü; ohne Konfiguration bleibt das Verhalten exakt wie bisher.
export function addPropertiesField(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.propertiesFields) return;
  // R5-02 (4T-000172): Guard zusaetzlich zum disabled-Button (defensiv).
  if (els.propertiesAddBtn && els.propertiesAddBtn.disabled) return;
  const resolution = state.properties.profileByPane[paneIdx];
  if (resolution) {
    // 4T-001179 (Epic 3E-000220): Nur die Felder des DOKUMENTS zählen als belegt.
    // Das Feld-Formular hängt seine Angebote bewusst in denselben Container
    // (4T-001172, damit der vorhandene Schreibweg sie einsammelt); ungefiltert
    // galten sie hier als vorhanden, und weil das Formular genau die
    // fehlenden Profil-Felder zeigt, blieb vom Menü kein einziger
    // Profil-Vorschlag übrig — samt seiner Profil-Köpfe. Dieselbe Regel wie
    // in `bleibtAusDemDokument`: ein nur definiertes Feld ist ein Angebot,
    // kein Inhalt.
    const existingKeys = [...els.propertiesFields.querySelectorAll('.properties-field-key')]
      .filter((inp) => !inp.closest(`.${MARKE_NICHT_IM_DOKUMENT}`))
      .map((inp) => inp.value);
    const heuristics = Object.keys(FIELD_TYPE_HINTS).map((name) => ({
      name,
      type: FIELD_TYPE_HINTS[name],
    }));
    // 4T-000491 (Epic 3E-000093): profil-gruppierte Menü-Struktur (Profil-Kopf =
    // Komplett-Übernahme, darunter die Einzel-Felder).
    const groups = profileSuggestGroups(resolution.fields, existingKeys, heuristics);
    openFieldSuggestMenu(els.propertiesAddBtn, groups, {
      onSuggestion: (s) => addFieldFromSuggestion(paneIdx, s),
      onCustom: () => appendCustomPropertiesField(paneIdx),
      onBulk: (grp) => applyProfileFill(paneIdx, grp),
    });
    return;
  }
  appendCustomPropertiesField(paneIdx);
}

function appendCustomPropertiesField(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.propertiesFields) return;
  const container = els.propertiesFields;
  let i = 1;
  const existingKeys = new Set();
  container
    .querySelectorAll('.properties-field-key')
    .forEach((inp) => existingKeys.add(inp.value.trim()));
  let key;
  while (true) {
    const candidate = `field${i}`;
    if (!existingKeys.has(candidate)) {
      key = candidate;
      break;
    }
    i++;
  }
  const fieldEl = buildPropertyFieldDom(paneIdx, key, '', 'string');
  const keyInput = fieldEl.querySelector('.properties-field-key');
  const typeSelect = fieldEl.querySelector('.properties-field-type');
  keyInput.addEventListener('change', () => {
    const k = keyInput.value.trim().toLowerCase();
    if (FIELD_TYPE_HINTS[k] && typeSelect.value === 'string') {
      typeSelect.value = FIELD_TYPE_HINTS[k];
      onTypeChange(fieldEl, FIELD_TYPE_HINTS[k]);
    }
  });
  // Empty-Hint und Empty-State entfernen, falls noch da.
  if (els.propertiesEmpty) els.propertiesEmpty.hidden = true;
  container.appendChild(fieldEl);
  setTimeout(() => keyInput.focus(), 0);
}
