// Feld-DOM der Properties-Sidebar: Sektion rendern, Feld-Zeilen und
// Wert-Editoren bauen, Typ-Wechsel.
// 4T-0981 (Epic 3E-0196): Auszug aus properties-tags.js.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
import { isAllEmpty } from '../views/views.js';
import { fieldDefinitionHint } from '../../../shared/property-profiles.js';
import {
  applyFieldHint,
  coerceValue,
  extractFieldValue,
  inferType,
  onProfileResolutionChanged,
  profileDefFor,
  PROPERTY_TYPES,
  refreshProfileResolution,
  renderTypeFor,
} from './properties-types.js';
import { flushPendingPropertiesSave, scheduleSavePropertiesFromPane } from './properties-save.js';

// 4T-0051: Rendert die Properties-Sidebar-Sektion fuer eine Spalte neu.
// Wird gerufen bei Toggle-on, Tab-Wechsel, View-Mode-Wechsel und externer
// Datei-Aenderung. Bewusst synchron: api.getFrontmatter ist im Preload als
// sync-Funktion exposed. Wuerde renderProperties async sein, oeffnet ein
// 'await' zwischen Container-leeren und appendChild ein Race-Fenster, in
// dem ein paralleler Aufruf nochmals appendet — Folge: doppelte/dreifache
// Property-Listen je nach Zahl der parallelen Trigger.
export function renderProperties(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.propertiesSection) return;
  // R5-03 (4T-0172): pending Debounce-Save des bisherigen Tabs flushen,
  // BEVOR die Feld-DOM ersetzt wird — sonst ist die Eingabe still verloren.
  flushPendingPropertiesSave(paneIdx);
  // 4T-0448: Profil-Auflösung asynchron nachziehen (re-rendert nur bei
  // tatsächlicher Änderung); dieser Durchlauf nutzt den gecachten Stand.
  void refreshProfileResolution(paneIdx);
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;

  els.propertiesFields.innerHTML = '';
  els.propertiesParseError.hidden = true;
  els.propertiesParseError.textContent = '';
  els.propertiesEmpty.hidden = true;

  if (!tab) {
    els.propertiesEmpty.hidden = false;
    state.properties.originalDataByPane[paneIdx] = {};
    return;
  }

  // 4T-0213 (Epic 3E-0042): Handbuch-Tabs sind read-only — die Sektion
  // zeigt den Leer-Hinweis, und "Feld hinzufuegen" bleibt deaktiviert
  // (der Debounce-Save wuerde sonst in das Handbuch-Doc schreiben).
  if (tab.manualPage) {
    els.propertiesEmpty.hidden = false;
    state.properties.originalDataByPane[paneIdx] = {};
    if (els.propertiesAddBtn) {
      els.propertiesAddBtn.disabled = true;
      els.propertiesAddBtn.title = t('manual.editDisabled');
    }
    return;
  }

  let fm;
  try {
    fm = api.getFrontmatter(tab.content || '');
  } catch {
    fm = { raw: null, data: null, body: tab.content || '', parseError: null, endOffset: 0 };
  }

  if (fm.parseError) {
    els.propertiesParseError.hidden = false;
    els.propertiesParseError.textContent = t('properties.parseError').replace(
      '{error}',
      fm.parseError,
    );
  }
  // R5-02 (4T-0172): Bei defektem YAML kein "Feld hinzufuegen" — der
  // erste Debounce-Save wuerde das gesamte Frontmatter durch die leeren
  // Sidebar-Felder ersetzen. Tooltip nennt den Grund.
  if (els.propertiesAddBtn) {
    els.propertiesAddBtn.disabled = !!fm.parseError;
    els.propertiesAddBtn.title = fm.parseError ? t('properties.addDisabledParseError') : '';
  }

  const data = fm.data || {};
  state.properties.originalDataByPane[paneIdx] = data;

  const keys = Object.keys(data);
  if (keys.length === 0 && !fm.parseError) {
    els.propertiesEmpty.hidden = false;
  }
  for (const key of keys) {
    const value = data[key];
    // 4T-0448: definierte Felder nutzen den Definitions-Typ statt der
    // Inferenz; undefinierte Felder verhalten sich unverändert.
    const def = profileDefFor(paneIdx, key);
    const type = def ? renderTypeFor(def, value) : inferType(value);
    const fieldEl = buildPropertyFieldDom(paneIdx, key, value, type, def);
    els.propertiesFields.appendChild(fieldEl);
  }
}

// 4T-0051: Baut die DOM-Komponente fuer ein Property-Feld in der Sidebar-
// Sektion. Layout zweizeilig: Head (Key | Type | Hint | Delete) ueber Value.
// Hooks fuer Live-Save: jedes input/change-Event triggert Debounce-Save.
// 4T-0448: optionaler def-Parameter (aufgelöste Profil-Definition) — dann
// dezente Kennzeichnung, Typ-Sperre (solange der Wert dem Typ entspricht),
// weicher Hinweis und ggf. Auswahl-Listen im Wert-Editor.
export function buildPropertyFieldDom(paneIdx, key, value, type, def = null) {
  const wrap = document.createElement('div');
  wrap.className = 'properties-field';
  if (type === 'readonly') wrap.classList.add('is-readonly');
  wrap.dataset.originalKey = key;
  wrap.dataset.currentType = type;
  wrap.dataset.paneIdx = String(paneIdx);
  // 4T-0448: Definition am Element hinterlegen (Hinweis-Aktualisierung beim
  // Save und Rückkehr zur Auswahl-Liste nach einem Typ-Wechsel).
  wrap._profileDef = def || null;
  const hintCode = def ? fieldDefinitionHint(def, value) : null;
  if (def) wrap.classList.add('is-profile-defined');

  // Head-Zeile: Key, Type, Hint, Delete
  const head = document.createElement('div');
  head.className = 'properties-field-head';

  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.className = 'properties-field-key';
  keyInput.value = key;
  keyInput.spellcheck = false;
  if (type === 'readonly') keyInput.disabled = true;
  if (def) keyInput.title = t('properties.profileDefined').replace('{profile}', def.profile);
  head.appendChild(keyInput);

  const typeSelect = document.createElement('select');
  typeSelect.className = 'properties-field-type';
  for (const tname of PROPERTY_TYPES) {
    // 4T-0051: 'readonly' ist ein interner Fallback-Typ fuer verschachtelte
    // YAML-Strukturen (Objekte, Arrays mit Objekten). Im Dropdown nur
    // sichtbar, wenn das Feld ohnehin bereits readonly ist — dann ist der
    // Dropdown disabled, also keine Aktion. Bei nicht-readonly-Feldern
    // verbergen, damit der Nutzer ihn nicht versehentlich waehlt und sich
    // selbst in eine Sackgasse manoevriert.
    if (tname === 'readonly' && type !== 'readonly') continue;
    const opt = document.createElement('option');
    opt.value = tname;
    opt.textContent = t('properties.type.' + tname) || tname;
    typeSelect.appendChild(opt);
  }
  typeSelect.value = type;
  if (type === 'readonly') typeSelect.disabled = true;
  // 4T-0448: definierte Felder zeigen den Definitions-Typ, der Wechsler ist
  // gesperrt (Tooltip nennt das Profil). Ausnahme Typ-Abweichung: dann bleibt
  // der Wechsler frei, damit der Wert per Koerzierung auf den Definitions-Typ
  // gebracht werden KANN (keine Sackgasse) — der Hinweis nennt den Soll-Typ.
  if (def && hintCode !== 'typeMismatch') {
    typeSelect.value = def.type;
    typeSelect.disabled = true;
    typeSelect.title = t('properties.profileTypeLocked').replace('{profile}', def.profile);
  }
  typeSelect.addEventListener('change', () => onTypeChange(wrap, typeSelect.value));
  head.appendChild(typeSelect);

  // 4T-0448: weicher Validierungs-Hinweis (Icon plus Tooltip) — keine
  // Blockade, keine Wert-Änderung. Wird beim Save live nachgezogen.
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
  delBtn.addEventListener('click', () => {
    wrap.remove();
    scheduleSavePropertiesFromPane(paneIdx);
  });
  head.appendChild(delBtn);

  wrap.appendChild(head);

  // Value-Zeile.
  const valueWrap = document.createElement('div');
  valueWrap.className = 'properties-field-value';
  wrap.appendChild(valueWrap);
  renderValueEditor(valueWrap, type, value, paneIdx, hintCode === 'typeMismatch' ? null : def);

  // Live-Save-Hook: jede Eingabe in Key/Wert triggert Debounce-Save.
  wrap.addEventListener('input', () => scheduleSavePropertiesFromPane(paneIdx));
  wrap.addEventListener('change', () => scheduleSavePropertiesFromPane(paneIdx));

  return wrap;
}

// 4T-0448: laufende Nummer für eindeutige datalist-IDs der Wertebereichs-
// Eingaben (Mehrfach-Auswahl).
let valueListSeq = 0;

// 4T-0448: Einfach-Auswahl eines Wertebereichs-Felds — Auswahl-Liste mit
// den definierten Werten plus „Eigener Wert…" (freie Eingabe bleibt möglich,
// weiche Haltung; ein Wert außerhalb erzeugt den Hinweis beim Save). Ein
// gesetzter Wert außerhalb des Bereichs erscheint als eigene Option, damit
// er sichtbar bleibt und nicht still verändert wird.
function renderValueSelect(container, def, value, paneIdx) {
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
    // „Eigener Wert…": auf den Freitext-Editor des Definitions-Typs
    // wechseln, vorbelegt mit dem bisherigen Wert. Das change-Event hat den
    // Debounce-Save bereits geplant; der liest dann den (unveränderten)
    // Eingabe-Wert — kein versehentliches Schreiben des Sentinels.
    renderValueEditor(container, def.type, current, paneIdx, null);
    const input = container.querySelector('input, textarea');
    if (input) setTimeout(() => input.focus(), 0);
  });
  container.appendChild(select);
}

export function renderValueEditor(container, type, value, paneIdx, def = null) {
  container.innerHTML = '';
  // 4T-0448: Wertebereichs-Felder — Einfach-Auswahl als Auswahl-Liste,
  // Mehrfach-Auswahl über die Chips-Leiste mit Werte-Vorschlägen (datalist).
  if (def && Array.isArray(def.values) && def.values.length > 0 && !def.multiple) {
    renderValueSelect(container, def, value, paneIdx);
    return;
  }
  if (type === 'readonly') {
    const el = document.createElement('div');
    el.className = 'properties-field-readonly-value';
    let preview;
    try {
      preview = JSON.stringify(value);
    } catch {
      preview = String(value);
    }
    if (preview && preview.length > 80) preview = preview.slice(0, 77) + '…';
    el.textContent = t('properties.readonlyHint') + ': ' + preview;
    container.appendChild(el);
    return;
  }
  if (type === 'string' || type === 'date') {
    const input = document.createElement('input');
    input.type = type === 'date' ? 'date' : 'text';
    input.className = 'properties-field-value-input';
    input.value = typeof value === 'string' ? value : value == null ? '' : String(value);
    container.appendChild(input);
    return;
  }
  if (type === 'multiline') {
    const ta = document.createElement('textarea');
    ta.className = 'properties-field-value-textarea';
    ta.value = typeof value === 'string' ? value : value == null ? '' : String(value);
    container.appendChild(ta);
    return;
  }
  if (type === 'number') {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'properties-field-value-input';
    input.value = typeof value === 'number' ? String(value) : value == null ? '' : String(value);
    container.appendChild(input);
    return;
  }
  if (type === 'boolean') {
    const wrap = document.createElement('div');
    wrap.className = 'properties-field-bool';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!value;
    wrap.appendChild(cb);
    container.appendChild(wrap);
    return;
  }
  if (type === 'multistring') {
    const list = document.createElement('div');
    list.className = 'properties-field-multistring';
    const arr = Array.isArray(value) ? value : value ? [String(value)] : [];
    for (const v of arr) {
      appendMultistringPill(list, String(v), undefined, paneIdx);
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'properties-field-multistring-input';
    input.placeholder = t('properties.multistringPlaceholder');
    // PO-Befund Release 0.56.0: Chip nur anfügen, wenn der Wert noch nicht
    // gesetzt ist (doppelte Listen-Einträge sind nie sinnvoll; das Feld
    // leert sich trotzdem — die Absicht „Wert setzen" ist erfüllt).
    const addChip = (v) => {
      const exists = [...list.querySelectorAll('.properties-field-multistring-pill')].some(
        (p) => p.dataset.value === v,
      );
      if (!exists) appendMultistringPill(list, v, input, paneIdx);
      input.value = '';
      return !exists;
    };
    // 4T-0448: Mehrfach-Auswahl eines Wertebereichs — die definierten Werte
    // als Eingabe-Vorschläge (datalist); freie Eingabe bleibt möglich
    // (weiche Haltung) und erzeugt den Hinweis beim Save.
    if (def && def.multiple && Array.isArray(def.values) && def.values.length > 0) {
      const dl = document.createElement('datalist');
      dl.id = `properties-value-list-${paneIdx}-${valueListSeq++}`;
      for (const v of def.values) {
        const opt = document.createElement('option');
        opt.value = String(v);
        dl.appendChild(opt);
      }
      list.appendChild(dl);
      input.setAttribute('list', dl.id);
      // PO-Befund Release 0.56.0: die Übernahme aus der Vorschlagsliste wird
      // DIREKT zum Chip (ohne zusätzliches Enter). Erkennung über den
      // inputType der Ersetzung ('insertReplacementText'; manche Chromium-
      // Stände liefern undefined — dann greift der exakte Werte-Treffer);
      // Tipp-Eingaben ('insertText') bleiben unberührt, damit eigene Werte
      // wie bisher frei formulierbar sind.
      const allowed = def.values.map((v) => String(v));
      input.addEventListener('input', (e) => {
        if (e.inputType && e.inputType !== 'insertReplacementText') return;
        const v = input.value.trim();
        if (v && allowed.includes(v) && addChip(v)) scheduleSavePropertiesFromPane(paneIdx);
      });
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const v = input.value.trim();
        if (v && addChip(v)) scheduleSavePropertiesFromPane(paneIdx);
      } else if (e.key === 'Backspace' && input.value === '') {
        const pills = list.querySelectorAll('.properties-field-multistring-pill');
        if (pills.length > 0) {
          pills[pills.length - 1].remove();
          scheduleSavePropertiesFromPane(paneIdx);
        }
      }
    });
    list.appendChild(input);
    container.appendChild(list);
    return;
  }
}

export function appendMultistringPill(list, value, beforeInputEl, paneIdx) {
  const pill = document.createElement('span');
  pill.className = 'properties-field-multistring-pill';
  pill.dataset.value = value;
  pill.textContent = value;
  const rm = document.createElement('button');
  rm.type = 'button';
  rm.className = 'properties-field-multistring-pill-remove';
  rm.textContent = '×';
  rm.addEventListener('click', () => {
    pill.remove();
    if (paneIdx != null) scheduleSavePropertiesFromPane(paneIdx);
  });
  pill.appendChild(rm);
  if (beforeInputEl) list.insertBefore(pill, beforeInputEl);
  else list.appendChild(pill);
}

export function onTypeChange(wrap, newType) {
  const valueWrap = wrap.querySelector('.properties-field-value');
  if (!valueWrap) return;
  const typeSelect = wrap.querySelector('.properties-field-type');
  const oldType = wrap.dataset.currentType || inferType(extractFieldValue(wrap, typeSelect.value));
  const current = extractFieldValue(wrap, oldType);
  const coerced = coerceValue(current, oldType, newType);
  const paneIdx = parseInt(wrap.dataset.paneIdx || '0', 10);
  // 4T-0448: kehrt ein definiertes Feld (Typ-Abweichung, Wechsler frei) per
  // Koerzierung zum Definitions-Typ zurück, greifen Auswahl-Liste, Sperre
  // und Hinweis-Abgleich wieder.
  const def = wrap._profileDef || null;
  const backToDefined = def && def.type === newType;
  renderValueEditor(valueWrap, newType, coerced, paneIdx, backToDefined ? def : null);
  wrap.dataset.currentType = newType;
  if (backToDefined) {
    typeSelect.disabled = true;
    typeSelect.title = t('properties.profileTypeLocked').replace('{profile}', def.profile);
    applyFieldHint(
      wrap.querySelector('.properties-field-hint'),
      def,
      fieldDefinitionHint(def, coerced),
    );
  }
}

// 4T-0981 (Epic 3E-0196): Nachziehen der Sektion bei geänderter Profil-
// Auflösung. Vor dem Schnitt stand dieser Aufruf mit derselben Bedingung
// inline in refreshProfileResolution. Die Anmeldung im Modul-Rumpf hält die
// Reihenfolge unverändert, weil sie vor jeder Laufzeit-Anmeldung liegt (das
// Block-Panel meldet sich erst in initBlockPropsPanel an).
onProfileResolutionChanged((paneIdx) => {
  if (!isAllEmpty() && state.properties.visibleByPane[paneIdx]) renderProperties(paneIdx);
});
