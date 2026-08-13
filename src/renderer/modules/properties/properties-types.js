// Typ-System, Profil-Auflösung und die reinen Feld-Zugriffe des
// Properties-Editors.
// 4T-0981 (Epic 3E-0196): Auszug aus properties-tags.js. Blatt-Modul des
// Ordners `properties/` — es importiert kein anderes Modul dieses Ordners und
// hält den Import-Graph des Feature-Ordners damit zyklenfrei.
//
// Hier liegen auch die beiden Feld-Zugriffe applyFieldHint und
// extractFieldValue, obwohl sie am DOM arbeiten: Feld-Aufbau (properties-fields)
// und Schreibweg (properties-save) brauchen beide, und nur unterhalb beider
// bleibt der Graph gerichtet.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
// 4T-0294 (Epic 3E-0052): Tag-Panel gehoert zur Tag-Erweiterung.
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { getPaneEls, state } from '../app/app-state.js';
// 4T-0448 (Epic 3E-0083): Eigenschafts-Profile — gemeinsame Editor-Logik
// (Vorschläge, weiche Hinweise) aus dem Shared-Modul; die Auflösung liefert
// profiles:resolve (4T-0447) und wird pro Pane in state.properties gecacht.
import {
  fieldDefinitionHint,
  isEmptyPropertyValue,
  // 4T-0491 (Epic 3E-0093): gemeinsame Leer-Wert-Quelle der Komplett-Übernahme.
  emptyValueForType,
} from '../../../shared/property-profiles.js';

export const PROPERTY_TYPES = [
  'string',
  'multistring',
  'number',
  'boolean',
  'date',
  'multiline',
  'readonly',
];

// Heuristik fuer Standard-Feldnamen: schlaegt einen Typ vor, wenn ein neu
// hinzugefuegtes Feld diesen Namen bekommt. Wirkt nur, solange der Nutzer
// keinen Typ explizit gewaehlt hat.
export const FIELD_TYPE_HINTS = {
  title: 'string',
  description: 'string',
  author: 'string',
  tags: 'multistring',
  aliases: 'multistring',
  date: 'date',
  created: 'date',
  modified: 'date',
  due: 'date',
  draft: 'boolean',
  published: 'boolean',
};

// --- 4T-0448 (Epic 3E-0083): Profil-Auflösung der aktiven Datei ---------------
// Die Auflösung (profiles:resolve, 4T-0447) läuft asynchron und wird pro
// Pane gecacht, damit renderProperties synchron bleiben kann (Begründung am
// renderProperties-Kommentar). Neu aufgelöst wird beim Rendern, nach jedem
// Properties-Save (das Zuordnungs-Feld kann sich geändert haben) und beim
// profiles:changed-Broadcast; neu gerendert nur, wenn sich die Auflösung
// tatsächlich geändert hat (JSON-Vergleich — laufende Eingaben behalten
// sonst ihren Fokus).

export async function refreshProfileResolution(paneIdx) {
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  let next = null;
  if (
    tab &&
    !tab.manualPage &&
    isExtensionActive('property-profiles') &&
    typeof api.profilesResolve === 'function'
  ) {
    let fmData;
    try {
      fmData = api.getFrontmatter(tab.content || '').data;
    } catch {
      fmData = null;
    }
    const token = ++state.properties.profileTokens[paneIdx];
    let result;
    try {
      result = await api.profilesResolve({ frontmatter: fmData || {}, path: tab.path || null });
    } catch {
      result = null;
    }
    if (token !== state.properties.profileTokens[paneIdx]) return;
    if (result && result.ok && result.hasConfig) {
      next = { assignField: result.assignField, fields: result.fields };
    }
  } else {
    // Laufende Anfragen entwerten (Tab-/Erweiterungs-Wechsel).
    state.properties.profileTokens[paneIdx]++;
  }
  // Sichtbarer Zustand der Auflösung an der Sektion (auch Test-Hook: 'on'
  // erst, wenn die Vorschläge wirklich verfügbar sind).
  const els = getPaneEls(paneIdx);
  if (els && els.propertiesSection) {
    els.propertiesSection.dataset.profiles = next ? 'on' : 'off';
  }
  const prev = state.properties.profileByPane[paneIdx];
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  state.properties.profileByPane[paneIdx] = next;
  // 4T-0449: weitere Konsumenten der Auflösung (Block-Panel) nachziehen.
  // 4T-0981: Auch das Nachziehen der Properties-Sektion selbst läuft über
  // diese Registry. properties-fields.js meldet sich dafür im Modul-Rumpf an
  // und steht damit vor jeder Laufzeit-Anmeldung (das Block-Panel meldet sich
  // erst in initBlockPropsPanel an); Bedingung und Reihenfolge des früheren
  // Inline-Aufrufs bleiben unverändert.
  for (const listener of profileResolutionListeners) listener(paneIdx);
}

// 4T-0449: Listener für Auflösungs-Änderungen (das Block-Panel registriert
// sich hier — bewusst als Callback-Registry statt Import, um den Zyklus
// properties-tags <-> block-props-panel zu vermeiden).
const profileResolutionListeners = [];
export function onProfileResolutionChanged(listener) {
  if (typeof listener === 'function') profileResolutionListeners.push(listener);
}

// profiles:changed-Broadcast (Konfigurations-Änderung, auch aus anderen
// Fenstern): beide Panes neu auflösen. Verdrahtung in app-init.js.
export function handleProfilesChanged() {
  for (let p = 0; p < state.panes.length; p++) void refreshProfileResolution(p);
}

// Definition eines Feldnamens aus der gecachten Auflösung (case-insensitiv);
// null ohne Konfiguration oder für nicht definierte Felder. Exportiert für
// das Block-Panel (4T-0449: Blöcke erben die Datei-Auflösung).
export function profileDefFor(paneIdx, key) {
  const resolution = state.properties.profileByPane[paneIdx];
  if (!resolution || !Array.isArray(resolution.fields)) return null;
  const wanted = String(key == null ? '' : key)
    .trim()
    .toLowerCase();
  if (wanted === '') return null;
  return resolution.fields.find((f) => f.name.toLowerCase() === wanted) || null;
}

// Editor-Typ eines definierten Felds: der Definitions-Typ; weicht der
// Ist-Wert vom Typ ab, bleibt der inferierte Typ (der Wert bleibt sichtbar
// und unverändert editierbar — keine Blockade, PO-Entscheidung 3).
export function renderTypeFor(def, value) {
  if (isEmptyPropertyValue(value)) return def.type;
  return fieldDefinitionHint(def, value) === 'typeMismatch' ? inferType(value) : def.type;
}

export function inferType(value) {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
    if (value.includes('\n')) return 'multiline';
    return 'string';
  }
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) return 'multistring';
    return 'readonly';
  }
  if (typeof value === 'object') return 'readonly';
  return 'string';
}

// Konvertiert einen Wert von einem Typ in einen anderen, so robust wie
// moeglich. Bei nicht erfolgreicher Konvertierung wird ein typgerechter
// Default zurueckgegeben (leer string, leeres Array, 0, false, '').
export function coerceValue(value, fromType, toType) {
  if (fromType === toType) return value;
  if (toType === 'string') {
    if (Array.isArray(value)) return value.join(', ');
    if (value === null || value === undefined) return '';
    return String(value);
  }
  if (toType === 'multistring') {
    if (Array.isArray(value)) return value.map((v) => String(v));
    if (typeof value === 'string') {
      return value
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter((s) => s);
    }
    return [];
  }
  if (toType === 'number') {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (toType === 'boolean') {
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return !!value;
  }
  if (toType === 'date') {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return '';
  }
  if (toType === 'multiline') {
    if (Array.isArray(value)) return value.join('\n');
    return String(value || '');
  }
  return value;
}

// Liefert einen typgerechten Default-Wert fuer ein neu angelegtes Feld.
// 4T-0491 (Epic 3E-0093): die sechs Profil-Typen kommen aus der gemeinsamen
// Quelle (emptyValueForType); nur der DOM-interne 'readonly'-Fall bleibt hier.
export function defaultValueForType(type) {
  if (type === 'readonly') return null;
  return emptyValueForType(type);
}

// 4T-0448: Hinweis-Icon eines Felds setzen bzw. verbergen. code ist der
// Hinweis-Code aus fieldDefinitionHint (null = konform). Exportiert für
// das Block-Panel (4T-0449, gleiche Hinweis-Darstellung).
export function applyFieldHint(hintEl, def, code) {
  if (!hintEl) return;
  if (!def || !code) {
    hintEl.hidden = true;
    hintEl.title = '';
    return;
  }
  hintEl.hidden = false;
  hintEl.title =
    code === 'typeMismatch'
      ? t('properties.profileHint.typeMismatch').replace(
          '{type}',
          t('properties.type.' + def.type) || def.type,
        )
      : t('properties.profileHint.outsideValues');
}

export function extractFieldValue(fieldEl, type) {
  const valueEl = fieldEl.querySelector('.properties-field-value');
  if (!valueEl) return defaultValueForType(type);
  // 4T-0448: Auswahl-Liste eines Wertebereichs-Felds (Einfach-Auswahl).
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
    if (!input) return 0;
    const n = parseFloat(input.value);
    return Number.isFinite(n) ? n : 0;
  }
  if (type === 'boolean') {
    const cb = valueEl.querySelector('input[type=checkbox]');
    return cb ? !!cb.checked : false;
  }
  if (type === 'multistring') {
    const container = valueEl.querySelector('.properties-field-multistring');
    if (!container) return [];
    const pills = container.querySelectorAll('.properties-field-multistring-pill');
    return Array.from(pills)
      .map((p) => p.dataset.value)
      .filter((v) => v != null && v !== '');
  }
  return defaultValueForType(type);
}
