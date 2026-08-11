// 4T-0364 (Epic 3E-0067): Block-Eigenschaften-Panel — Sidebar-Panel zur Pflege
// der Block-Metadaten (strukturierte Daten pro Block-Anker `^id`, gespeichert in
// der .mdd-Sektion `blockData`; Datenpfad aus 4T-0363 ueber api.readBlockData/
// writeBlockData/renameBlockAnchor/onBlockDataChanged).
//
// Das Panel folgt der Cursor-Position (Block unter dem Cursor, Konzept-
// Entscheidung 5): der Editor-updateListener ruft scheduleBlockPropsCursorUpdate
// bei Cursor-Bewegung und scheduleBlockPropsRender bei Doc-Aenderung. Die Kopf-
// zeile zeigt den aktiven Anker samt Dropdown aller Anker der Datei; ein Block
// ohne Anker bietet "Anker anlegen" (kurze Zufalls-ID). Die Eigenschafts-Zeilen
// folgen dem Properties-Editor-Muster (properties-tags.js als Typ- und UI-
// Vorbild, gleiche .properties-field-*-Optik). Verwaiste Daten (Anker aus dem
// Text verschwunden) bleiben erhalten und erscheinen im Verwaisten-Abschnitt mit
// "einem Anker zuordnen" und "loeschen" (Entscheidung 3). In Lese-Ansichten
// (Reading, Handbuch-Tabs) ist das Panel read-only.
'use strict';

// 4T-0484 (Epic 3E-0088): Undo-Isolation der Ganz-Dokument-Ersetzung beim
// Anker-Umbenennen (Muster handleLinkUpdateApplied in views.js).
import { isolateHistory } from '@codemirror/commands';
import { t } from '../i18n.js';
import { api, getDocText } from './api.js';
import { getPaneEls, state } from './app-state.js';
import { applySidebarVisibility } from './panels.js';
import { reportMenuStateNow } from './tabs.js';
import { isAllEmpty, persistSetting } from './views.js';
import { ensurePanelTabActive, registerSidebarPanel } from './sidebar-layout.js';
import { paneEditors } from './editor.js';
// 4T-0449 (Epic 3E-0083): Eigenschafts-Profile — Blöcke erben die Datei-
// Auflösung; Definitions-Lookup, Hinweis-Darstellung und Vorschlags-Menü
// kommen aus dem Properties-Editor-Modul (ein Verhalten, zwei Oberflächen),
// die reine Logik aus dem Shared-Modul.
import {
  applyFieldHint,
  coerceValue,
  defaultValueForType,
  inferType,
  onProfileResolutionChanged,
  openFieldSuggestMenu,
  profileDefFor,
  PROPERTY_TYPES,
  refreshProfileResolution,
  renderTypeFor,
} from './properties-tags.js';
import {
  fieldDefinitionHint,
  // 4T-0491 (Epic 3E-0093): profil-gruppierte Menü-Struktur.
  profileSuggestGroups,
} from '../../shared/property-profiles.js';
import {
  extractBlockAnchors,
  blockAnchorForLine,
  rewriteAnchorReferences,
  generateBlockAnchorId,
  isValidBlockAnchorId,
} from '../../shared/block-anchors.js';

// Editierbare Typen: der 'readonly'-Fallback der Dokument-Ebene entfaellt, weil
// das Block-Schema app-kontrolliert ist (Konzept-Entscheidung 1).
const BLOCK_PROP_TYPES = PROPERTY_TYPES.filter((ty) => ty !== 'readonly');

// --- Kontext-Helfer ----------------------------------------------------------

function activeTabForPane(paneIdx) {
  const pane = state.panes[paneIdx];
  return pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
}

function activePathForPane(paneIdx) {
  const tab = activeTabForPane(paneIdx);
  return tab && tab.path ? tab.path : null;
}

function docTextForPane(paneIdx) {
  const tab = activeTabForPane(paneIdx);
  return tab ? tab.content || '' : '';
}

// Lese-Ansichten: Handbuch-Tabs und der reine Render-Modus haben keinen aktiven
// Editier-Cursor; das Panel zeigt dann nur an (Konzept-Entscheidung 5).
function isReadOnlyForPane(paneIdx) {
  const tab = activeTabForPane(paneIdx);
  return !!(tab && (tab.manualPage || tab.viewMode === 'rendered'));
}

function cursorLineForPane(paneIdx) {
  const view = paneEditors[paneIdx];
  if (!view) return 0;
  const head = view.state.selection.main.head;
  return view.state.doc.lineAt(head).number;
}

// Anker-Kontext der aktiven Datei: Anker im Text (Dropdown-Reihenfolge),
// Duplikate, verwaiste Daten-IDs (Daten ohne Anker im Text) und der Anker unter
// dem Cursor (null in Lese-Ansichten oder bei einem Block ohne Anker).
function computeContext(paneIdx) {
  const text = docTextForPane(paneIdx);
  const { order, duplicates } = extractBlockAnchors(text);
  const inText = new Set(order);
  const data = state.blockProps.dataByPane[paneIdx] || {};
  const orphans = Object.keys(data).filter((id) => !inText.has(id));
  const cursorAnchor = isReadOnlyForPane(paneIdx)
    ? null
    : blockAnchorForLine(text, cursorLineForPane(paneIdx));
  return { anchorsInText: order, duplicates, orphans, cursorAnchor, data };
}

// --- Laden -------------------------------------------------------------------

export async function renderBlockProps(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.blockPropsSection) return;
  flushPendingSave(paneIdx);
  // 4T-0449: Profil-Auflösung der Datei nachziehen (Blöcke erben sie);
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
      // 4T-0449: Doc-Änderungen können das Zuordnungs-Feld betreffen —
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

// Schluessel-Vorschlaege (Konzept-Entscheidung 1): eine datalist pro Pane mit
// allen im Dokument bereits verwendeten Block-Schluesseln (ueber alle Anker,
// inklusive verwaister Eintraege). Die Schluessel-Eingaben der Eigenschafts-
// Zeilen referenzieren sie ueber das list-Attribut.
function keyDatalistId(paneIdx) {
  return `blockprops-keylist-${paneIdx}`;
}

function refreshKeyDatalist(paneIdx, els, data) {
  let dl = els.blockPropsSection.querySelector(`#${keyDatalistId(paneIdx)}`);
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = keyDatalistId(paneIdx);
    els.blockPropsSection.appendChild(dl);
  }
  const keys = new Set();
  for (const entry of Object.values(data || {})) {
    for (const k of Object.keys((entry && entry.values) || {})) keys.add(k);
  }
  dl.innerHTML = '';
  // 4T-0449: Definitions-Felder der Datei-Auflösung zuerst, danach die im
  // Dokument verwendeten Block-Schlüssel (Task-Vorgabe Rangfolge).
  const seen = new Set();
  const addOption = (k) => {
    const lower = k.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    const opt = document.createElement('option');
    opt.value = k;
    dl.appendChild(opt);
  };
  const resolution = state.properties.profileByPane[paneIdx];
  for (const def of (resolution && resolution.fields) || []) addOption(def.name);
  for (const k of [...keys].sort((a, b) => a.localeCompare(b, 'de'))) addOption(k);
}

function hideAll(els) {
  els.blockPropsEmpty.hidden = true;
  els.blockPropsSuspended.hidden = true;
  els.blockPropsAnchorbar.hidden = true;
  els.blockPropsNoAnchor.hidden = true;
  els.blockPropsDuplicate.hidden = true;
  els.blockPropsOrphans.hidden = true;
}

// --- Anker-Dropdown und Sprung ----------------------------------------------

function buildAnchorSelect(els, ctx, active) {
  const sel = els.blockPropsAnchorSelect;
  sel.innerHTML = '';
  const ids = [...ctx.anchorsInText];
  // Aktiven verwaisten Anker (via Dropdown/Broadcast gewaehlt) sichtbar halten.
  if (active && !ids.includes(active)) ids.unshift(active);
  if (ids.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = t('blockProps.noAnchorsInFile');
    opt.disabled = true;
    sel.appendChild(opt);
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  for (const id of ids) {
    const opt = document.createElement('option');
    opt.value = id;
    const hasData = ctx.data[id] && Object.keys(ctx.data[id].values || {}).length > 0;
    opt.textContent = hasData ? `^${id} •` : `^${id}`;
    sel.appendChild(opt);
  }
  sel.value = active || '';
}

// Springt zum gewaehlten Anker: setzt den Cursor auf die Anker-Zeile (loest die
// Cursor-Folge aus). In Lese-Ansichten ohne Cursor wird der aktive Anker direkt
// gesetzt.
function jumpToAnchor(paneIdx, anchorId) {
  if (!anchorId) return;
  const view = paneEditors[paneIdx];
  const text = docTextForPane(paneIdx);
  const { lineById } = extractBlockAnchors(text);
  const line = lineById.get(anchorId);
  if (view && line && !isReadOnlyForPane(paneIdx)) {
    const pos = view.state.doc.line(line).to;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
    // Die Cursor-Folge (updateListener) zieht den aktiven Anker nach.
  } else {
    state.blockProps.activeAnchorByPane[paneIdx] = anchorId;
    syncActive(paneIdx, { reloadFields: true });
  }
}

// --- Eigenschafts-Felder (Properties-Editor-Muster) --------------------------

function buildFields(paneIdx, els, values, readOnly) {
  els.blockPropsFields.innerHTML = '';
  const data = values && typeof values === 'object' ? values : {};
  for (const key of Object.keys(data)) {
    // 4T-0449: definierte Felder (Datei-Auflösung, Blöcke erben sie) nutzen
    // den Definitions-Typ statt der Inferenz — gleiche Regeln wie im
    // Properties-Editor (4T-0448).
    const def = profileDefFor(paneIdx, key);
    const type = def ? renderTypeFor(def, data[key]) : inferType(data[key]);
    els.blockPropsFields.appendChild(buildFieldRow(paneIdx, key, data[key], type, readOnly, def));
  }
}

// Baut eine Eigenschafts-Zeile (Kopf: Schluessel | Typ | Hinweis | Loeschen;
// darunter der typisierte Wert-Editor). Gleiche .properties-field-*-Klassen
// wie der Dokument-Properties-Editor, aber mit dem Block-Save-Hook.
// 4T-0449: optionaler def-Parameter — Kennzeichnung, Typ-Sperre, Hinweis und
// Auswahl-Listen wie im Properties-Editor.
function buildFieldRow(paneIdx, key, value, type, readOnly, def = null) {
  const wrap = document.createElement('div');
  wrap.className = 'properties-field';
  wrap.dataset.currentType = type;
  wrap.dataset.paneIdx = String(paneIdx);
  wrap._profileDef = def || null;
  const hintCode = def ? fieldDefinitionHint(def, value) : null;
  if (def) wrap.classList.add('is-profile-defined');

  const head = document.createElement('div');
  head.className = 'properties-field-head';

  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.className = 'properties-field-key';
  keyInput.value = key;
  keyInput.spellcheck = false;
  keyInput.disabled = readOnly;
  if (def) keyInput.title = t('properties.profileDefined').replace('{profile}', def.profile);
  // Schluessel-Vorschlaege aus dem Dokument-Bestand (Konzept-Entscheidung 1).
  keyInput.setAttribute('list', keyDatalistId(paneIdx));
  head.appendChild(keyInput);

  const typeSelect = document.createElement('select');
  typeSelect.className = 'properties-field-type';
  for (const tname of BLOCK_PROP_TYPES) {
    const opt = document.createElement('option');
    opt.value = tname;
    opt.textContent = t('properties.type.' + tname) || tname;
    typeSelect.appendChild(opt);
  }
  typeSelect.value = type;
  typeSelect.disabled = readOnly;
  // 4T-0449: Typ-Sperre definierter Felder (Regel aus 4T-0448 — frei nur
  // bei Typ-Abweichung, damit der Wert koerzierbar bleibt).
  if (def && hintCode !== 'typeMismatch') {
    typeSelect.value = def.type;
    typeSelect.disabled = true;
    typeSelect.title = t('properties.profileTypeLocked').replace('{profile}', def.profile);
  }
  typeSelect.addEventListener('change', () => {
    onTypeChange(wrap, typeSelect.value, paneIdx);
    scheduleSaveBlockProps(paneIdx);
  });
  head.appendChild(typeSelect);

  // 4T-0449: weicher Hinweis (gleiche Darstellung wie im Properties-Editor).
  const hintEl = document.createElement('span');
  hintEl.className = 'properties-field-hint';
  hintEl.textContent = '⚠';
  applyFieldHint(hintEl, def, hintCode);
  head.appendChild(hintEl);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'properties-field-delete';
  delBtn.textContent = '×';
  delBtn.title = t('properties.deleteField');
  delBtn.disabled = readOnly;
  delBtn.addEventListener('click', () => {
    wrap.remove();
    scheduleSaveBlockProps(paneIdx);
  });
  head.appendChild(delBtn);
  wrap.appendChild(head);

  const valueWrap = document.createElement('div');
  valueWrap.className = 'properties-field-value';
  wrap.appendChild(valueWrap);
  renderValueEditor(valueWrap, type, value, paneIdx, readOnly, {
    def: hintCode === 'typeMismatch' ? null : def,
  });

  if (!readOnly) {
    wrap.addEventListener('input', () => scheduleSaveBlockProps(paneIdx));
    wrap.addEventListener('change', () => scheduleSaveBlockProps(paneIdx));
  }
  return wrap;
}

// 4T-0449: laufende Nummer für eindeutige datalist-IDs der Wertebereichs-
// Eingaben (Mehrfach-Auswahl) im Block-Panel.
let blockValueListSeq = 0;

// 4T-0449: Einfach-Auswahl eines Wertebereichs-Felds im Block-Panel —
// gleiche Semantik wie im Properties-Editor (eigene Option für einen Wert
// außerhalb, „Eigener Wert…" wechselt in den Freitext-Editor); der Save
// läuft über das bubbelnde change-Event der Zeile.
function renderBlockValueSelect(container, def, value, paneIdx) {
  const select = document.createElement('select');
  select.className = 'properties-field-value-select';
  const current = value == null ? '' : String(value);
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '—';
  select.appendChild(emptyOpt);
  const known = def.values.map((v) => String(v));
  for (const v of known) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  }
  if (current !== '' && !known.includes(current)) {
    const opt = document.createElement('option');
    opt.value = current;
    opt.textContent = current;
    opt.className = 'is-outside-values';
    select.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = t('properties.profileCustomValue');
  select.appendChild(customOpt);
  select.value = current === '' ? '' : current;
  select.addEventListener('change', () => {
    if (select.value !== '__custom__') return;
    renderValueEditor(container, def.type, current, paneIdx, false);
    const input = container.querySelector('input, textarea');
    if (input) setTimeout(() => input.focus(), 0);
  });
  container.appendChild(select);
}

function renderValueEditor(container, type, value, paneIdx, readOnly, opts = {}) {
  container.innerHTML = '';
  // 4T-0449: Wertebereichs-Felder (nur editierbar; read-only bleibt der
  // deaktivierte Freitext-Editor).
  const def = opts.def || null;
  if (def && !readOnly && Array.isArray(def.values) && def.values.length > 0 && !def.multiple) {
    renderBlockValueSelect(container, def, value, paneIdx);
    return;
  }
  if (type === 'string' || type === 'date') {
    const input = document.createElement('input');
    input.type = type === 'date' ? 'date' : 'text';
    input.className = 'properties-field-value-input';
    input.value = typeof value === 'string' ? value : value == null ? '' : String(value);
    input.disabled = readOnly;
    container.appendChild(input);
    return;
  }
  if (type === 'multiline') {
    const ta = document.createElement('textarea');
    ta.className = 'properties-field-value-textarea';
    ta.value = typeof value === 'string' ? value : value == null ? '' : String(value);
    ta.disabled = readOnly;
    container.appendChild(ta);
    return;
  }
  if (type === 'number') {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'properties-field-value-input';
    input.value = typeof value === 'number' ? String(value) : value == null ? '' : String(value);
    input.disabled = readOnly;
    container.appendChild(input);
    return;
  }
  if (type === 'boolean') {
    const bwrap = document.createElement('div');
    bwrap.className = 'properties-field-bool';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!value;
    cb.disabled = readOnly;
    bwrap.appendChild(cb);
    container.appendChild(bwrap);
    return;
  }
  if (type === 'multistring') {
    const list = document.createElement('div');
    list.className = 'properties-field-multistring';
    const arr = Array.isArray(value) ? value : value ? [String(value)] : [];
    for (const v of arr) appendPill(list, String(v), undefined, paneIdx, readOnly);
    if (!readOnly) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'properties-field-multistring-input';
      input.placeholder = t('properties.multistringPlaceholder');
      // PO-Befund Release 0.56.0: Chip nur anfügen, wenn der Wert noch nicht
      // gesetzt ist (keine doppelten Listen-Einträge; Regel wie im
      // Properties-Editor — ein Verhalten, zwei Oberflächen).
      const addChip = (v) => {
        const exists = [...list.querySelectorAll('.properties-field-multistring-pill')].some(
          (p) => p.dataset.value === v,
        );
        if (!exists) appendPill(list, v, input, paneIdx, false);
        input.value = '';
        return !exists;
      };
      // 4T-0449: Mehrfach-Auswahl eines Wertebereichs — definierte Werte als
      // Eingabe-Vorschläge; freie Eingabe bleibt möglich (weiche Haltung).
      if (def && def.multiple && Array.isArray(def.values) && def.values.length > 0) {
        const dl = document.createElement('datalist');
        dl.id = `blockprops-value-list-${paneIdx}-${blockValueListSeq++}`;
        for (const v of def.values) {
          const opt = document.createElement('option');
          opt.value = String(v);
          dl.appendChild(opt);
        }
        list.appendChild(dl);
        input.setAttribute('list', dl.id);
        // PO-Befund Release 0.56.0: Übernahme aus der Vorschlagsliste wird
        // DIREKT zum Chip (Erkennung wie im Properties-Editor über den
        // Ersetzungs-inputType; Tipp-Eingaben bleiben unberührt).
        const allowed = def.values.map((v) => String(v));
        input.addEventListener('input', (e) => {
          if (e.inputType && e.inputType !== 'insertReplacementText') return;
          const v = input.value.trim();
          if (v && allowed.includes(v) && addChip(v)) scheduleSaveBlockProps(paneIdx);
        });
      }
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const v = input.value.trim();
          if (v && addChip(v)) scheduleSaveBlockProps(paneIdx);
        } else if (e.key === 'Backspace' && input.value === '') {
          const pills = list.querySelectorAll('.properties-field-multistring-pill');
          if (pills.length > 0) {
            pills[pills.length - 1].remove();
            scheduleSaveBlockProps(paneIdx);
          }
        }
      });
      list.appendChild(input);
    }
    container.appendChild(list);
  }
}

function appendPill(list, value, beforeInputEl, paneIdx, readOnly) {
  const pill = document.createElement('span');
  pill.className = 'properties-field-multistring-pill';
  pill.dataset.value = value;
  pill.textContent = value;
  if (!readOnly) {
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'properties-field-multistring-pill-remove';
    rm.textContent = '×';
    rm.addEventListener('click', () => {
      pill.remove();
      scheduleSaveBlockProps(paneIdx);
    });
    pill.appendChild(rm);
  }
  if (beforeInputEl) list.insertBefore(pill, beforeInputEl);
  else list.appendChild(pill);
}

function onTypeChange(wrap, newType, paneIdx) {
  const valueWrap = wrap.querySelector('.properties-field-value');
  if (!valueWrap) return;
  const oldType = wrap.dataset.currentType || 'string';
  const current = extractRowValue(wrap, oldType);
  const coerced = coerceValue(current, oldType, newType);
  // 4T-0449: Rückkehr zum Definitions-Typ reaktiviert Auswahl-Liste, Sperre
  // und Hinweis-Abgleich (Regel aus 4T-0448).
  const def = wrap._profileDef || null;
  const backToDefined = def && def.type === newType;
  renderValueEditor(valueWrap, newType, coerced, paneIdx, false, {
    def: backToDefined ? def : null,
  });
  wrap.dataset.currentType = newType;
  if (backToDefined) {
    const typeSelect = wrap.querySelector('.properties-field-type');
    if (typeSelect) {
      typeSelect.disabled = true;
      typeSelect.title = t('properties.profileTypeLocked').replace('{profile}', def.profile);
    }
    applyFieldHint(
      wrap.querySelector('.properties-field-hint'),
      def,
      fieldDefinitionHint(def, coerced),
    );
  }
}

// Liest den Wert einer Feld-Zeile passend zum Typ aus dem DOM.
function extractRowValue(fieldEl, type) {
  const valueEl = fieldEl.querySelector('.properties-field-value');
  if (!valueEl) return defaultValueForType(type);
  // 4T-0449: Auswahl-Liste eines Wertebereichs-Felds (Einfach-Auswahl).
  const select = valueEl.querySelector('select.properties-field-value-select');
  if (select) {
    if (type === 'number') {
      const n = parseFloat(select.value);
      return Number.isFinite(n) ? n : 0;
    }
    return select.value;
  }
  if (type === 'string' || type === 'date') {
    const input = valueEl.querySelector('input');
    return input ? input.value : '';
  }
  if (type === 'multiline') {
    const ta = valueEl.querySelector('textarea');
    return ta ? ta.value : '';
  }
  if (type === 'number') {
    const input = valueEl.querySelector('input');
    const n = input ? parseFloat(input.value) : NaN;
    return Number.isFinite(n) ? n : 0;
  }
  if (type === 'boolean') {
    const cb = valueEl.querySelector('input[type=checkbox]');
    return cb ? !!cb.checked : false;
  }
  if (type === 'multistring') {
    const pills = valueEl.querySelectorAll('.properties-field-multistring-pill');
    return Array.from(pills)
      .map((p) => p.dataset.value)
      .filter((v) => v != null && v !== '');
  }
  return defaultValueForType(type);
}

// Baut das values-Objekt aus den Feld-Zeilen (leere Schluessel uebersprungen).
function readValuesFromDom(els) {
  const out = {};
  const rows = els.blockPropsFields.querySelectorAll('.properties-field');
  for (const row of rows) {
    const keyInput = row.querySelector('.properties-field-key');
    const typeSelect = row.querySelector('.properties-field-type');
    const key = ((keyInput && keyInput.value) || '').trim();
    if (!key) continue;
    const type = typeSelect ? typeSelect.value : 'string';
    out[key] = extractRowValue(row, type);
  }
  return out;
}

export function addBlockPropsField(paneIdx) {
  if (isReadOnlyForPane(paneIdx)) return;
  const els = getPaneEls(paneIdx);
  if (!els || !els.blockPropsFields) return;
  if (!state.blockProps.activeAnchorByPane[paneIdx]) return;
  // 4T-0449: mit konfigurierten Profilen öffnet der Button das Vorschlags-
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
    // 4T-0491 (Epic 3E-0093): profil-gruppierte Menü-Struktur (Profil-Kopf =
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

// 4T-0449: Feld aus einem Vorschlag anlegen (Definitions-Typ und Default
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

// 4T-0491 (Epic 3E-0093): Komplett-Übernahme im Block-Panel. Ergänzt alle
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

// --- Speichern (Debounce + Flush) -------------------------------------------

function scheduleSaveBlockProps(paneIdx) {
  const timers = state.blockProps.saveTimers;
  if (timers[paneIdx]) clearTimeout(timers[paneIdx]);
  state.blockProps.saveContext[paneIdx] = {
    path: activePathForPane(paneIdx),
    anchorId: state.blockProps.activeAnchorByPane[paneIdx],
  };
  timers[paneIdx] = setTimeout(() => {
    timers[paneIdx] = null;
    saveBlockProps(paneIdx, state.blockProps.saveContext[paneIdx]);
  }, 500);
}

export function flushPendingSave(paneIdx) {
  const timers = state.blockProps.saveTimers;
  if (!timers[paneIdx]) return;
  clearTimeout(timers[paneIdx]);
  timers[paneIdx] = null;
  saveBlockProps(paneIdx, state.blockProps.saveContext[paneIdx]);
}

async function saveBlockProps(paneIdx, ctx) {
  if (!ctx || !ctx.path || !isValidBlockAnchorId(ctx.anchorId)) return;
  const els = getPaneEls(paneIdx);
  if (!els || !els.blockPropsFields) return;
  const values = readValuesFromDom(els);
  // 4T-0449: weiche Hinweise der definierten Felder live nachziehen
  // (gleiche Regel wie im Properties-Editor, ohne DOM-Neuaufbau).
  for (const row of els.blockPropsFields.querySelectorAll('.properties-field')) {
    const def = row._profileDef;
    if (!def) continue;
    const type = row.dataset.currentType || 'string';
    applyFieldHint(
      row.querySelector('.properties-field-hint'),
      def,
      fieldDefinitionHint(def, extractRowValue(row, type)),
    );
  }
  // Lokalen Datenstand optimistisch nachziehen (Broadcast-Echo-Abgleich).
  const store = state.blockProps.dataByPane[paneIdx];
  if (store) {
    if (Object.keys(values).length === 0) delete store[ctx.anchorId];
    else store[ctx.anchorId] = { values, updated: null };
  }
  try {
    await api.writeBlockData(ctx.path, ctx.anchorId, values);
  } catch {
    /* transienter Fehler: der naechste Save wiederholt */
  }
}

// --- Anker anlegen / umbenennen ---------------------------------------------

// Legt fuer den Block unter dem Cursor einen Anker an (kurze Zufalls-ID) und
// schreibt ihn als `^id` an das Ende der letzten nicht-leeren Zeile des Blocks.
export function createAnchorForCursor(paneIdx) {
  if (isReadOnlyForPane(paneIdx)) return;
  const view = paneEditors[paneIdx];
  if (!view) return;
  const text = docTextForPane(paneIdx);
  const lines = text.split(/\r?\n/);
  const cursorLine = cursorLineForPane(paneIdx);
  const idx = cursorLine - 1;
  if (idx < 0 || idx >= lines.length || lines[idx].trim() === '') return;
  // Letzte nicht-leere Zeile des Blocks bestimmen (der Anker sitzt am Blockende).
  let end = idx;
  while (end < lines.length - 1 && lines[end + 1].trim() !== '') end++;
  const { order } = extractBlockAnchors(text);
  const id = generateBlockAnchorId(new Set(order));
  const targetLine = view.state.doc.line(end + 1);
  // Anker ans Blockende anhaengen; der Cursor landet am Ende des eingefuegten
  // Textes (weiter in derselben Zeile), damit die Cursor-Folge den neuen Anker
  // erkennt.
  const insert = ` ^${id}`;
  view.dispatch({
    changes: { from: targetLine.to, insert },
    selection: { anchor: targetLine.to + insert.length },
    scrollIntoView: true,
    // 4T-0484 (Epic 3E-0088): Klick-/Kommando-Pfad ohne Tipp-Ereignis —
    // Annotation verhindert das Verschmelzen mit dem vorherigen Historien-
    // Ereignis (Muster views.js toggleTaskFromRendered).
    userEvent: 'input',
  });
  view.focus();
  state.blockProps.activeAnchorByPane[paneIdx] = id;
  syncActive(paneIdx, { reloadFields: true });
}

// Startet das Umbenennen des aktiven Ankers: ersetzt die Anker-Leiste durch ein
// Eingabefeld. Bestaetigen schreibt Text-Anker und .mdd-Schluessel synchron um
// (inklusive der eingehenden Verweise im selben Dokument, Entscheidung 3).
function startRename(paneIdx, els) {
  if (isReadOnlyForPane(paneIdx)) return;
  const oldId = state.blockProps.activeAnchorByPane[paneIdx];
  if (!oldId) return;
  const bar = els.blockPropsAnchorbar;
  const sel = els.blockPropsAnchorSelect;
  const renameBtn = els.blockPropsRenameBtn;
  // Select und Umbenennen-Knopf nur ausblenden (nicht aus dem DOM loesen — die
  // getPaneEls-Referenzen sind memoisiert), temporaeres Eingabefeld anhaengen.
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'block-props-rename-input';
  input.value = oldId;
  input.spellcheck = false;
  sel.hidden = true;
  renameBtn.hidden = true;
  bar.appendChild(input);
  let done = false;
  const cleanup = () => {
    input.remove();
    sel.hidden = false;
  };
  const finish = (proceed) => {
    if (done) return;
    done = true;
    const newId = input.value.trim();
    cleanup();
    if (proceed && newId && newId !== oldId && isValidBlockAnchorId(newId)) {
      applyRename(paneIdx, oldId, newId);
    } else {
      refreshView(paneIdx, { rebuildFields: true });
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
  setTimeout(() => input.focus(), 0);
}

async function applyRename(paneIdx, oldId, newId) {
  const view = paneEditors[paneIdx];
  const path = activePathForPane(paneIdx);
  // Kollision: das Ziel existiert bereits im Text.
  const { order } = extractBlockAnchors(docTextForPane(paneIdx));
  if (order.includes(newId)) {
    refreshView(paneIdx, { rebuildFields: true });
    return;
  }
  flushPendingSave(paneIdx);
  if (view) {
    const oldText = getDocText(view.state.doc);
    const newText = rewriteAnchorReferences(oldText, oldId, newId);
    if (newText !== oldText) {
      // 4T-0484 (Epic 3E-0088): Ganz-Dokument-Ersetzung aus dem Panel-Pfad als
      // eigene Undo-Einheit isolieren (Muster handleLinkUpdateApplied,
      // views.js) — sonst verschmilzt sie mit dem vorherigen Historien-
      // Ereignis und ein Undo nimmt zu viel zurück.
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: newText },
        annotations: isolateHistory.of('full'),
      });
    }
  }
  if (path) {
    try {
      await api.renameBlockAnchor(path, oldId, newId);
    } catch {
      /* transienter Fehler */
    }
  }
  const store = state.blockProps.dataByPane[paneIdx];
  if (store && store[oldId]) {
    store[newId] = store[oldId];
    delete store[oldId];
  }
  state.blockProps.activeAnchorByPane[paneIdx] = newId;
  syncActive(paneIdx, { reloadFields: true });
}

// --- Verwaisten-Abschnitt ----------------------------------------------------

function buildOrphans(paneIdx, els, orphans, ctx, readOnly) {
  const listEl = els.blockPropsOrphansList;
  listEl.innerHTML = '';
  if (!orphans || orphans.length === 0) {
    els.blockPropsOrphans.hidden = true;
    return;
  }
  els.blockPropsOrphans.hidden = false;
  // Anker im Text ohne Daten sind moegliche Zuordnungs-Ziele.
  const freeAnchors = ctx.anchorsInText.filter(
    (id) => !(ctx.data[id] && Object.keys(ctx.data[id].values || {}).length > 0),
  );
  for (const orphanId of orphans) {
    const row = document.createElement('div');
    row.className = 'block-props-orphan';
    const label = document.createElement('span');
    label.className = 'block-props-orphan-id';
    label.textContent = `^${orphanId}`;
    row.appendChild(label);
    if (!readOnly) {
      const assignSel = document.createElement('select');
      assignSel.className = 'block-props-orphan-assign';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = t('blockProps.assignTo');
      assignSel.appendChild(placeholder);
      for (const target of freeAnchors) {
        const opt = document.createElement('option');
        opt.value = target;
        opt.textContent = `^${target}`;
        assignSel.appendChild(opt);
      }
      assignSel.addEventListener('change', () => {
        if (assignSel.value) assignOrphan(paneIdx, orphanId, assignSel.value);
      });
      row.appendChild(assignSel);
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'block-props-orphan-delete';
      delBtn.textContent = t('blockProps.orphanDelete');
      delBtn.addEventListener('click', () => deleteOrphan(paneIdx, orphanId));
      row.appendChild(delBtn);
    }
    listEl.appendChild(row);
  }
}

async function assignOrphan(paneIdx, orphanId, targetId) {
  const path = activePathForPane(paneIdx);
  if (!path || !isValidBlockAnchorId(targetId)) return;
  const store = state.blockProps.dataByPane[paneIdx];
  if (store && store[orphanId]) {
    store[targetId] = store[orphanId];
    delete store[orphanId];
  }
  try {
    await api.renameBlockAnchor(path, orphanId, targetId);
  } catch {
    /* transienter Fehler */
  }
  syncActive(paneIdx, { reloadFields: true });
}

async function deleteOrphan(paneIdx, orphanId) {
  const path = activePathForPane(paneIdx);
  if (!path) return;
  const store = state.blockProps.dataByPane[paneIdx];
  if (store) delete store[orphanId];
  try {
    await api.writeBlockData(path, orphanId, {});
  } catch {
    /* transienter Fehler */
  }
  syncActive(paneIdx, { reloadFields: true });
}

// --- Mehrfenster-Sync --------------------------------------------------------

export function handleBlockDataChanged(payload) {
  if (!payload || typeof payload.path !== 'string') return;
  const incomingPath = payload.path.toLowerCase();
  for (let p = 0; p < state.panes.length; p++) {
    const current = state.blockProps.currentFileByPane[p];
    if (!current || current.toLowerCase() !== incomingPath) continue;
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

// 4T-0365 (Epic 3E-0067): Klick-Pfad des Block-Indikators — oeffnet das Panel
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
  // 4T-0449: Auflösungs-Änderungen der Eigenschafts-Profile (properties-tags
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
