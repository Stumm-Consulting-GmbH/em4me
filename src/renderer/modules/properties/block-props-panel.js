// 4T-000364 (Epic 3E-000067): Block-Eigenschaften-Panel — Sidebar-Panel zur Pflege
// der Block-Metadaten (strukturierte Daten pro Block-Anker `^id`, gespeichert in
// der .mdd-Sektion `blockData`; Datenpfad aus 4T-000363 ueber api.readBlockData/
// writeBlockData/renameBlockAnchor/onBlockDataChanged).
//
// Das Panel folgt der Cursor-Position (Block unter dem Cursor, Konzept-
// Entscheidung 5): der Editor-updateListener ruft scheduleBlockPropsCursorUpdate
// bei Cursor-Bewegung und scheduleBlockPropsRender bei Doc-Aenderung. Die Kopf-
// zeile zeigt den aktiven Anker samt Dropdown aller Anker der Datei; ein Block
// ohne Anker bietet "Anker anlegen" (kurze Zufalls-ID). Die Eigenschafts-Zeilen
// folgen dem Properties-Editor-Muster (properties-tags als Typ- und UI-
// Vorbild, gleiche .properties-field-*-Optik). Verwaiste Daten (Anker aus dem
// Text verschwunden) bleiben erhalten und erscheinen im Verwaisten-Abschnitt mit
// "einem Anker zuordnen" und "loeschen" (Entscheidung 3). In Lese-Ansichten
// (Reading, Handbuch-Tabs) ist das Panel read-only.
//
// 4T-000979 (Epic 3E-000196): Kern des Panels. Kontext-Helfer, Wert-Editoren,
// Schreibweg und Anker-Verwaltung liegen in den Nachbar-Modulen
// block-props-context, block-props-fields, block-props-save und
// block-props-anchors.
'use strict';

import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
import { applySidebarVisibility } from '../panels/panels.js';
import { reportMenuStateNow } from '../tabs/tabs.js';
import { isAllEmpty, persistSetting } from '../views/views.js';
import { ensurePanelTabActive, registerSidebarPanel } from '../sidebar-layout.js';
import {
  // 4T-000491 (Epic 3E-000093): profil-gruppierte Menü-Struktur.
  profileSuggestGroups,
} from '../../../shared/property-profiles.js';
import { isValidBlockAnchorId } from '../../../shared/block-anchors.js';
// 4T-000449 (Epic 3E-000083): Eigenschafts-Profile — Blöcke erben die Datei-
// Auflösung; Definitions-Lookup, Hinweis-Darstellung und Vorschlags-Menü
// kommen aus den Properties-Editor-Modulen (ein Verhalten, zwei Oberflächen),
// die reine Logik aus dem Shared-Modul.
import {
  defaultValueForType,
  onProfileResolutionChanged,
  refreshProfileResolution,
} from './properties-types.js';
import { openFieldSuggestMenu } from './properties-suggest.js';
import { activePathForPane, computeContext, isReadOnlyForPane } from './block-props-context.js';
import { buildFieldRow, buildFields, refreshKeyDatalist } from './block-props-fields.js';
import { flushPendingSave, scheduleSaveBlockProps } from './block-props-save.js';
import { pathCompareKey } from '../../../shared/platform.js';
import {
  buildAnchorSelect,
  buildOrphans,
  createAnchorForCursor,
  jumpToAnchor,
  setBlockPropsViewHooks,
  startRename,
} from './block-props-anchors.js';

// --- Laden -------------------------------------------------------------------

export async function renderBlockProps(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.blockPropsSection) return;
  flushPendingSave(paneIdx);
  // 4T-000449: Profil-Auflösung der Datei nachziehen (Blöcke erben sie);
  // Änderungen melden sich über onProfileResolutionChanged zurück.
  void refreshProfileResolution(paneIdx);
  const token = ++state.blockProps.loadTokens[paneIdx];
  const path = activePathForPane(paneIdx);
  state.blockProps.currentFileByPane[paneIdx] = path;
  if (!path) {
    // Unbenannte Datei: keine .mdd, kein Block-Metadaten-Kontext.
    state.blockProps.dataByPane[paneIdx] = {};
    state.blockProps.activeAnchorByPane[paneIdx] = null;
    refreshView(paneIdx, { hint: 'untitled' });
    return;
  }
  let result;
  try {
    result = await api.readBlockData(path);
  } catch {
    result = { ok: false };
  }
  if (token !== state.blockProps.loadTokens[paneIdx]) return;
  if (!result || !result.ok) {
    // Defekte .mdd: Block-Metadaten ausgesetzt (Hinweis wie bei der Historie).
    state.blockProps.dataByPane[paneIdx] = {};
    refreshView(paneIdx, { hint: 'suspended' });
    return;
  }
  state.blockProps.dataByPane[paneIdx] = result.blockData || {};
  syncActive(paneIdx, { reloadFields: true });
}

// --- Aktiver Anker und Ansicht ----------------------------------------------

// Bestimmt den aktiven Anker und baut die Ansicht auf. Im editierbaren Modus
// folgt der aktive Anker dem Block unter dem Cursor; in Lese-Ansichten (kein
// Editier-Cursor) bleibt der per Dropdown gewaehlte Anker bestehen und faellt
// nur, wenn er nicht mehr gueltig ist, auf den ersten Anker der Datei. Die
// Eigenschafts-Felder werden nur neu gebaut, wenn der aktive Anker wechselt oder
// `reloadFields` gesetzt ist — sonst gingen laufende Feld-Eingaben bei jeder
// Doc-Aenderung verloren.
function syncActive(paneIdx, opts = {}) {
  const ctx = computeContext(paneIdx);
  const prev = state.blockProps.activeAnchorByPane[paneIdx];
  let nextActive;
  if (isReadOnlyForPane(paneIdx)) {
    nextActive = prev && ctx.anchorsInText.includes(prev) ? prev : ctx.anchorsInText[0] || null;
  } else {
    nextActive = ctx.cursorAnchor;
  }
  const changed = nextActive !== prev;
  if (changed) state.blockProps.activeAnchorByPane[paneIdx] = nextActive;
  refreshView(paneIdx, { ctx, rebuildFields: changed || !!opts.reloadFields });
}

export function scheduleBlockPropsCursorUpdate(paneIdx) {
  const timers = state.blockProps.cursorTimers;
  if (timers[paneIdx]) clearTimeout(timers[paneIdx]);
  timers[paneIdx] = setTimeout(() => {
    timers[paneIdx] = null;
    if (state.blockProps.visibleByPane[paneIdx]) syncActive(paneIdx);
  }, 100);
}

export function scheduleBlockPropsRender(paneIdx) {
  const timers = state.blockProps.renderTimers;
  if (timers[paneIdx]) clearTimeout(timers[paneIdx]);
  timers[paneIdx] = setTimeout(() => {
    timers[paneIdx] = null;
    if (state.blockProps.visibleByPane[paneIdx]) {
      // 4T-000449: Doc-Änderungen können das Zuordnungs-Feld betreffen —
      // Auflösung mit nachziehen (re-rendert nur bei echter Änderung).
      void refreshProfileResolution(paneIdx);
      syncActive(paneIdx);
    }
  }, 200);
}

// Baut die sichtbaren Teile des Panels neu auf. `hint` blendet einen Hinweis
// (untitled/suspended) statt des Editors ein. `rebuildFields` steuert, ob die
// Eigenschafts-Zeilen neu erzeugt werden (Anker-Wechsel/Neuladung).
function refreshView(paneIdx, opts = {}) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.blockPropsSection) return;
  const hint = opts.hint || null;
  hideAll(els);
  if (hint === 'untitled') {
    els.blockPropsEmpty.hidden = false;
    return;
  }
  if (hint === 'suspended') {
    els.blockPropsSuspended.hidden = false;
    return;
  }
  const ctx = opts.ctx || computeContext(paneIdx);
  const readOnly = isReadOnlyForPane(paneIdx);
  const active = state.blockProps.activeAnchorByPane[paneIdx];

  // Schluessel-Vorschlaege aus dem Dokument-Bestand nachziehen (Entscheidung 1).
  refreshKeyDatalist(paneIdx, els, ctx.data);

  // Anker-Dropdown (alle Anker der Datei; zusaetzlich der aktive verwaiste
  // Anker, falls das Dropdown ihn sonst nicht enthaelt).
  els.blockPropsAnchorbar.hidden = false;
  buildAnchorSelect(els, ctx, active);
  els.blockPropsRenameBtn.hidden = readOnly || !active;

  // Duplikat-Hinweis.
  els.blockPropsDuplicate.hidden = ctx.duplicates.size === 0;

  // Block ohne Anker: "Anker anlegen" (nur im editierbaren Modus).
  const noAnchor = !active;
  els.blockPropsNoAnchor.hidden = !(noAnchor && !readOnly);

  // Eigenschafts-Felder des aktiven Ankers.
  const showFields = !!active;
  els.blockPropsFields.hidden = !showFields;
  els.blockPropsAddBtn.hidden = !showFields || readOnly;
  if (showFields && opts.rebuildFields) {
    buildFields(paneIdx, els, ctx.data[active] ? ctx.data[active].values : {}, readOnly);
  } else if (!showFields) {
    els.blockPropsFields.innerHTML = '';
  }

  // Verwaisten-Abschnitt.
  buildOrphans(paneIdx, els, ctx.orphans, ctx, readOnly);

  updateBlockPropsToggleButton();
}

function hideAll(els) {
  els.blockPropsEmpty.hidden = true;
  els.blockPropsSuspended.hidden = true;
  els.blockPropsAnchorbar.hidden = true;
  els.blockPropsNoAnchor.hidden = true;
  els.blockPropsDuplicate.hidden = true;
  els.blockPropsOrphans.hidden = true;
}

// --- Feld hinzufuegen --------------------------------------------------------

export function addBlockPropsField(paneIdx) {
  if (isReadOnlyForPane(paneIdx)) return;
  const els = getPaneEls(paneIdx);
  if (!els || !els.blockPropsFields) return;
  if (!state.blockProps.activeAnchorByPane[paneIdx]) return;
  // 4T-000449: mit konfigurierten Profilen öffnet der Button das Vorschlags-
  // Menü (Definitions-Felder zuerst, danach die im Dokument verwendeten
  // Block-Schlüssel, am Ende „Eigenes Feld"); ohne Konfiguration bleibt das
  // direkte Anlegen wie bisher.
  const resolution = state.properties.profileByPane[paneIdx];
  if (resolution) {
    const existingKeys = [...els.blockPropsFields.querySelectorAll('.properties-field-key')].map(
      (inp) => inp.value,
    );
    const docKeys = new Set();
    for (const entry of Object.values(state.blockProps.dataByPane[paneIdx] || {})) {
      for (const k of Object.keys((entry && entry.values) || {})) docKeys.add(k);
    }
    // 4T-000491 (Epic 3E-000093): profil-gruppierte Menü-Struktur (Profil-Kopf =
    // Komplett-Übernahme). Profillose Vorschläge = im Dokument verwendete
    // Block-Schlüssel.
    const groups = profileSuggestGroups(
      resolution.fields,
      existingKeys,
      [...docKeys].sort((a, b) => a.localeCompare(b, 'de')).map((name) => ({ name })),
    );
    openFieldSuggestMenu(els.blockPropsAddBtn, groups, {
      onSuggestion: (s) => addBlockFieldFromSuggestion(paneIdx, s),
      onCustom: () => appendCustomBlockPropsField(paneIdx),
      onBulk: (grp) => applyBlockProfileFill(paneIdx, grp),
    });
    return;
  }
  appendCustomBlockPropsField(paneIdx);
}

// 4T-000449: Feld aus einem Vorschlag anlegen (Definitions-Typ und Default
// bei Profil-Feldern; Dokument-Schlüssel starten als Text-Feld).
function addBlockFieldFromSuggestion(paneIdx, suggestion) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.blockPropsFields) return;
  const def = suggestion.def || null;
  const type = suggestion.type || 'string';
  const value =
    def && def.default !== null && def.default !== undefined
      ? def.default
      : defaultValueForType(type);
  const row = buildFieldRow(paneIdx, suggestion.name, value, type, false, def);
  els.blockPropsFields.hidden = false;
  els.blockPropsFields.appendChild(row);
  scheduleSaveBlockProps(paneIdx);
  const focusTarget = row.querySelector(
    '.properties-field-value input, .properties-field-value select, .properties-field-value textarea',
  );
  if (focusTarget) setTimeout(() => focusTarget.focus(), 0);
}

// 4T-000491 (Epic 3E-000093): Komplett-Übernahme im Block-Panel. Ergänzt alle
// fehlenden Felder des Ziels in EINEM writeBlockData-Aufruf; der Block-Pfad
// speichert die typgerechten Leer-Werte direkt (JSON in der .mdd). Bestehende
// Werte und ihre Reihenfolge bleiben unangetastet.
async function applyBlockProfileFill(paneIdx, target) {
  if (isReadOnlyForPane(paneIdx)) return;
  const els = getPaneEls(paneIdx);
  if (!els || !els.blockPropsFields) return;
  const path = activePathForPane(paneIdx);
  const anchorId = state.blockProps.activeAnchorByPane[paneIdx];
  if (!path || !isValidBlockAnchorId(anchorId) || !target || !target.map) return;
  // Pending Debounce-Save flushen (ungespeicherter DOM-Stand).
  flushPendingSave(paneIdx);
  const store = state.blockProps.dataByPane[paneIdx] || {};
  const currentValues = (store[anchorId] && store[anchorId].values) || {};
  const newValues = { ...currentValues, ...target.map };
  // Optimistisch lokalen Stand nachziehen (Broadcast-Echo-Abgleich).
  store[anchorId] = { values: newValues, updated: null };
  state.blockProps.dataByPane[paneIdx] = store;
  try {
    await api.writeBlockData(path, anchorId, newValues);
  } catch {
    /* transienter Fehler: der nächste Save wiederholt */
  }
  // Felder neu aufbauen (Menü-Aktion, kein Feld hat Fokus).
  syncActive(paneIdx, { reloadFields: true });
}

function appendCustomBlockPropsField(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.blockPropsFields) return;
  const existing = new Set();
  els.blockPropsFields
    .querySelectorAll('.properties-field-key')
    .forEach((inp) => existing.add(inp.value.trim()));
  let i = 1;
  let key;
  while (true) {
    const candidate = `feld${i}`;
    if (!existing.has(candidate)) {
      key = candidate;
      break;
    }
    i++;
  }
  const row = buildFieldRow(paneIdx, key, '', 'string', false);
  els.blockPropsFields.hidden = false;
  els.blockPropsFields.appendChild(row);
  const keyInput = row.querySelector('.properties-field-key');
  if (keyInput) setTimeout(() => keyInput.focus(), 0);
}

// --- Mehrfenster-Sync --------------------------------------------------------

export function handleBlockDataChanged(payload) {
  if (!payload || typeof payload.path !== 'string') return;
  // 4T-001276 (Epic 3E-000232, Befund B1): Pfad-Identität über die zentrale Auskunft.
  const incomingPath = pathCompareKey(payload.path);
  for (let p = 0; p < state.panes.length; p++) {
    const current = state.blockProps.currentFileByPane[p];
    if (!current || pathCompareKey(current) !== incomingPath) continue;
    if (!state.blockProps.visibleByPane[p]) continue;
    state.blockProps.dataByPane[p] = payload.blockData || {};
    // Felder nicht neu bauen, wenn der Nutzer gerade in diesem Panel tippt.
    const els = getPaneEls(p);
    const editing =
      els && els.blockPropsFields && els.blockPropsFields.contains(document.activeElement);
    syncActive(p, { reloadFields: !editing });
  }
}

// --- Sichtbarkeit, Toggle, Persistenz ---------------------------------------

export function applyBlockPropsVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.blockPropsSection) return;
  const visible = !isAllEmpty() && !!state.blockProps.visibleByPane[paneIdx];
  els.blockPropsSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) renderBlockProps(paneIdx);
  updateBlockPropsToggleButton();
}

export function updateBlockPropsToggleButton() {
  const btn = document.getElementById('btn-blockprops');
  if (!btn) return;
  const visible = !!state.blockProps.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleBlockPropsPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.blockProps.visibleByPane[paneIdx];
  state.blockProps.visibleByPane[paneIdx] = next;
  if (next) await ensurePanelTabActive('blockprops', paneIdx);
  applyBlockPropsVisibility(paneIdx);
  await persistBlockPropsSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

// 4T-000365 (Epic 3E-000067): Klick-Pfad des Block-Indikators — oeffnet das Panel
// (falls geschlossen) und macht den gegebenen Anker aktiv. jumpToAnchor setzt im
// editierbaren Modus den Cursor (Cursor-Folge zieht nach), in Lese-Ansichten den
// aktiven Anker direkt.
export async function openBlockPropsForAnchor(paneIdx, anchorId) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  state.blockProps.activeAnchorByPane[paneIdx] = anchorId;
  if (!state.blockProps.visibleByPane[paneIdx]) {
    state.blockProps.visibleByPane[paneIdx] = true;
    await ensurePanelTabActive('blockprops', paneIdx);
    applyBlockPropsVisibility(paneIdx);
    await persistBlockPropsSettings();
    if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
      reportMenuStateNow();
    }
  } else {
    await ensurePanelTabActive('blockprops', paneIdx);
    applyBlockPropsVisibility(paneIdx);
  }
  jumpToAnchor(paneIdx, anchorId);
}

export async function persistBlockPropsSettings() {
  await persistSetting('blockProps.visibleColumn0', !!state.blockProps.visibleByPane[0]);
  await persistSetting('blockProps.visibleColumn1', !!state.blockProps.visibleByPane[1]);
}

export async function loadBlockPropsSettings() {
  const v0 = await api.getSetting('blockProps.visibleColumn0');
  const v1 = await api.getSetting('blockProps.visibleColumn1');
  state.blockProps.visibleByPane[0] = !!v0;
  state.blockProps.visibleByPane[1] = !!v1;
}

// --- Init und Registrierung --------------------------------------------------

export function initBlockPropsPanel() {
  for (let p = 0; p < 2; p++) {
    const els = getPaneEls(p);
    if (!els || !els.blockPropsSection) continue;
    if (els.blockPropsAnchorSelect) {
      els.blockPropsAnchorSelect.addEventListener('change', () =>
        jumpToAnchor(p, els.blockPropsAnchorSelect.value),
      );
    }
    if (els.blockPropsRenameBtn) {
      els.blockPropsRenameBtn.addEventListener('click', () => startRename(p, els));
    }
    if (els.blockPropsCreateBtn) {
      els.blockPropsCreateBtn.addEventListener('click', () => createAnchorForCursor(p));
    }
    if (els.blockPropsAddBtn) {
      els.blockPropsAddBtn.addEventListener('click', () => addBlockPropsField(p));
    }
  }
  window.addEventListener('beforeunload', () => {
    for (let p = 0; p < 2; p++) flushPendingSave(p);
  });
  if (typeof api.onBlockDataChanged === 'function') {
    api.onBlockDataChanged(handleBlockDataChanged);
  }
  // 4T-000449: Auflösungs-Änderungen der Eigenschafts-Profile (properties-types
  // verwaltet den Cache) ziehen die Felder nach — außer der Nutzer tippt
  // gerade in diesem Panel (Muster handleBlockDataChanged).
  onProfileResolutionChanged((paneIdx) => {
    if (!state.blockProps.visibleByPane[paneIdx]) return;
    const els = getPaneEls(paneIdx);
    const editing =
      els && els.blockPropsFields && els.blockPropsFields.contains(document.activeElement);
    syncActive(paneIdx, { reloadFields: !editing });
  });
}

// 4T-000979 (Epic 3E-000196): Rückweg der Anker-Aktionen in den Kern (siehe
// setBlockPropsViewHooks). Die Anmeldung im Modul-Rumpf liegt vor jedem
// Laufzeit-Aufruf, weil alle Anker-Aktionen an Bedien-Ereignissen haengen.
setBlockPropsViewHooks({ syncActive, refreshView });

registerSidebarPanel({
  id: 'blockprops',
  titleKey: 'blockProps.title',
  buttonId: 'btn-blockprops',
  sectionClass: 'sidebar-blockprops',
  getVisible: (paneIdx) =>
    !isAllEmpty() && !!(state.blockProps && state.blockProps.visibleByPane[paneIdx]),
  applyVisibility: applyBlockPropsVisibility,
  toggle: toggleBlockPropsPanel,
});
