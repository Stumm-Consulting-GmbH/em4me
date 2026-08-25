// Wert-Editoren des Block-Eigenschaften-Panels: Schluessel-Vorschlagsliste,
// Eigenschafts-Zeilen und die typisierten Wert-Editoren.
// 4T-0979 (Epic 3E-0196): Auszug aus block-props-panel.js. Die Zeilen folgen
// dem Properties-Editor-Muster (gleiche .properties-field-*-Optik), haben aber
// den Block-Save-Hook.
'use strict';

import { t } from '../../i18n.js';
import { state } from '../app/app-state.js';
import {
  DERIVED_TYPES,
  OBJECT_TYPES,
  fieldDefinitionHint,
} from '../../../shared/property-profiles.js';
// 4T-1187 (Epic 3E-0221): gestapelte Bedienung der Objekt-Typen, gemeinsame
// Quelle beider Panels.
import { kindDefinitionen, renderObjektFeld } from './properties-objekt-felder.js';
// 4T-1185 (Epic 3E-0221): die abgeleiteten Felder — dieselbe Regel wie im
// Dokument-Panel, der Zeilen-Bau kommt als Parameter herein.
import { baueAbgeleiteteFelder } from './properties-abgeleitet.js';
import {
  applyFieldHint,
  coerceValue,
  inferType,
  profileDefFor,
  renderTypeFor,
} from './properties-types.js';
// 4T-1156: Öffnen eines Verweis-Ziels über den Wiki-Link-Weg.
import { activateLink } from '../views/link-navigation.js';
import { BLOCK_PROP_TYPES, keyDatalistId } from './block-props-context.js';
import { extractRowValue, scheduleSaveBlockProps } from './block-props-save.js';
// 4T-1156 (Epic 3E-0219): dieselben Bau-Funktionen wie im Dokument-Panel —
// die Parität der neuen Typen hängt damit an einer Quelle statt an zwei
// gleichlautenden Kopien (Konzept 7.3).
import {
  applyDateOptions,
  applyNumberOptions,
  attachLinkSuggestions,
  attachQueryValues,
  hatAuswahl,
  renderCycleField,
  renderLinkField,
  renderTimeField,
  renderAbgeleitetesFeld,
  attachLookupWerte,
} from './properties-neue-typen.js';

export function refreshKeyDatalist(paneIdx, els, data) {
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

// --- Eigenschafts-Felder (Properties-Editor-Muster) --------------------------

export function buildFields(paneIdx, els, values, readOnly) {
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

  // 4T-1185 (Epic 3E-0221, E1): die abgeleiteten Felder — hier aus demselben
  // Grund wie im Dokument-Panel und über dieselbe Regel. Die Parität ist keine
  // Zugabe, sondern eine ausgelieferte Zusage (Konzept 7.3); der Unterschied
  // liegt allein im Zeilen-Bau, und der kommt als Parameter herein.
  //
  // **Auch im Lese-Zustand.** Ein abgeleitetes Feld ist ohnehin nicht
  // bearbeitbar; es zu verbergen, nähme dem Leser eine Information, ohne
  // irgendetwas zu schützen.
  baueAbgeleiteteFelder(els.blockPropsFields, {
    aufloesung: state.properties.profileByPane[paneIdx],
    werte: data,
    baueZeile: (def, wert, hinweis) =>
      buildFieldRow(paneIdx, def.name, wert, def.type, readOnly, def, hinweis),
  });
}

// Baut eine Eigenschafts-Zeile (Kopf: Schluessel | Typ | Hinweis | Loeschen;
// darunter der typisierte Wert-Editor). Gleiche .properties-field-*-Klassen
// wie der Dokument-Properties-Editor, aber mit dem Block-Save-Hook.
// 4T-0449: optionaler def-Parameter — Kennzeichnung, Typ-Sperre, Hinweis und
// Auswahl-Listen wie im Properties-Editor.
export function buildFieldRow(paneIdx, key, value, type, readOnly, def = null, hinweis = null) {
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
    hinweis,
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

// 4T-1156: Pfad der aktiven Datei einer Spalte — Suchraum der
// Ziel-Vorschläge eines Verweis-Feldes. Blöcke erben die Datei-Auflösung
// (PO-Entscheidung 4), also auch ihren Suchraum.
function aktiverPfad(paneIdx) {
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  return tab && tab.path ? tab.path : null;
}

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
  // 4T-1158: Ein Feld mit Abfrage-Quelle kommt ohne feste Werte hierher.
  const known = (Array.isArray(def.values) ? def.values : []).map((v) => String(v));
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

export function renderValueEditor(container, type, value, paneIdx, readOnly, opts = {}) {
  container.innerHTML = '';
  // 4T-0449: Wertebereichs-Felder (nur editierbar; read-only bleibt der
  // deaktivierte Freitext-Editor).
  const def = opts.def || null;
  // 4T-1185 (Epic 3E-0221, E1): Abgeleitete Felder zuerst und unabhaengig vom
  // Lese-Zustand — an ihnen darf kein Bedienelement entstehen. Gleichlautend
  // zum Dokument-Panel (Paritaets-Auflage, Konzept 7.3).
  if (DERIVED_TYPES.includes(type)) {
    const el = renderAbgeleitetesFeld(container, value, { hinweis: opts.hinweis || null });
    if (type === 'lookup') attachLookupWerte(el, { def, filePath: aktiverPfad(paneIdx) });
    return;
  }
  // 4T-1187 (Epic 3E-0221, E11): gestapelte Bedienung der Objekt-Typen —
  // gleichlautend zum Dokument-Panel und aus derselben Quelle. Ohne erklaerte
  // Kind-Felder bleibt der nur lesende Rueckfall (Begruendung dort).
  if (OBJECT_TYPES.includes(type) && kindDefinitionen(def).length > 0) {
    renderObjektFeld(container, def, value, {
      readOnly,
      baueKindEditor: (zelle, kindDef, kindWert) =>
        renderValueEditor(zelle, kindDef.type, kindWert, paneIdx, readOnly, { def: kindDef }),
      onChange: () => scheduleSaveBlockProps(paneIdx),
    });
    return;
  }
  if (!readOnly && hatAuswahl(def) && !def.multiple) {
    // 4T-1156 (E11): Zyklus als Bedien-Option derselben Einfach-Auswahl.
    if (def.options && def.options.control === 'cycle') {
      renderCycleField(container, def, value, {
        readOnly,
        onChange: () => scheduleSaveBlockProps(paneIdx),
      });
      return;
    }
    renderBlockValueSelect(container, def, value, paneIdx);
    // 4T-1158: Werte aus einer Abfrage kommen nach (auf Verlangen).
    const select = container.querySelector('select.properties-field-value-select');
    if (select) attachQueryValues(select, { def, filePath: aktiverPfad(paneIdx) });
    return;
  }
  // 4T-1156: Verweis im Einzel-Modus; der Mehrfach-Modus läuft über die
  // Chips-Leiste weiter unten.
  if (type === 'link' && !(def && def.multiple)) {
    renderLinkField(container, value, {
      def,
      readOnly,
      filePath: aktiverPfad(paneIdx),
      // Gleicher Öffnen-Weg wie im Dokument-Panel; als Parameter und nicht
      // als Import des Bau-Moduls (Import-Wächter, siehe dort).
      onOpen: (name) => void activateLink(paneIdx, name, true),
    });
    return;
  }
  if (type === 'time') {
    renderTimeField(container, value, { readOnly });
    return;
  }
  if (type === 'string' || type === 'date') {
    const input = document.createElement('input');
    input.type = type === 'date' ? 'date' : 'text';
    input.className = 'properties-field-value-input';
    input.value = typeof value === 'string' ? value : value == null ? '' : String(value);
    input.disabled = readOnly;
    if (type === 'date') applyDateOptions(input, def); // 4T-1156: shift
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
    applyNumberOptions(input, def); // 4T-1156: step, min, max
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
  // 4T-1156 (E11): Chips-Leiste für JEDES Mehrfach-Feld, nicht nur für das
  // historische 'multistring' — gleiche Regel wie im Dokument-Panel.
  if (type === 'multistring' || (def && def.multiple === true)) {
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
      // 4T-1158: Mehrfach-Auswahl mit Abfrage-Quelle — Werte kommen nach.
      if (def && def.multiple && def.valuesFrom && def.valuesFrom.query) {
        attachQueryValues(list, { def, filePath: aktiverPfad(paneIdx), input });
        input.addEventListener('input', (e) => {
          if (e.inputType && e.inputType !== 'insertReplacementText') return;
          const v = input.value.trim();
          if (v && addChip(v)) scheduleSaveBlockProps(paneIdx);
        });
      }
      // 4T-1156: Verweis-Feld im Mehrfach-Modus — Ziel-Vorschläge statt
      // Werte-Vorschläge, Übernahme nach demselben Muster.
      if (type === 'link') {
        attachLinkSuggestions(list, input, { def, filePath: aktiverPfad(paneIdx) });
        input.addEventListener('input', (e) => {
          if (e.inputType && e.inputType !== 'insertReplacementText') return;
          const v = input.value.trim();
          if (v && addChip(v)) scheduleSaveBlockProps(paneIdx);
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
