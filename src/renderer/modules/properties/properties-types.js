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
  // 4T-1157 (Epic 3E-0219): Hinweis zur Quelle eines Wertevorrats.
  valueSourceHint,
} from '../../../shared/property-profiles.js';

// 4T-1155/4T-1156 (Epic 3E-0219): um 'link' und 'time' erweitert, in
// derselben Reihenfolge wie PROFILE_FIELD_TYPES des Format-Moduls; 'readonly'
// bleibt der DOM-interne Fallback am Ende.
export const PROPERTY_TYPES = [
  'string',
  'multistring',
  'number',
  'boolean',
  'date',
  'multiline',
  'link',
  'time',
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

// 4T-1161 (Epic 3E-0219, E5): Symbol des aufgelösten Profils im Kopf der
// Eigenschaften-Sektion.
//
// **Warum hier und nicht am Reiter** (PO-Entscheidung vom 2026-08-23): Der
// Zweck aus E13 ist, dass erklärbar wird, woher die Felder kommen — wer die
// Felder sieht, sieht dann auch ihre Herkunft. Ein Dokument kann seine
// Felder vollständig aus Ordner-Regel und Standard-Profil beziehen, ohne
// dass in ihm etwas davon steht; genau dafür ist das Symbol da.
//
// Ohne Profil oder ohne Symbol erscheint NICHTS — kein Platzhalter (AK4).
function applyProfileBadge(els, aufloesung) {
  const badge = els && els.propertiesProfileBadge;
  if (!badge) return;
  const leading = aufloesung && aufloesung.leading;
  if (!leading || !leading.icon) {
    badge.hidden = true;
    badge.textContent = '';
    badge.title = '';
    return;
  }
  badge.hidden = false;
  badge.textContent = leading.icon;
  // Der Tooltip nennt das Profil UND die Stufe, über die es gefunden wurde.
  // Die Stufe ist der eigentliche Punkt: Sie beantwortet die Frage, die ein
  // Dokument ohne eigene Aussage aufwirft.
  const stufe = t('properties.profileVia.' + (leading.stufe || 'assigned'));
  badge.title = t('properties.profileBadge')
    .replace('{profile}', leading.profile)
    .replace('{via}', stufe);
}

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
      // 4T-1159 (Epic 3E-0219, E13): `text` kommt dazu — aus ihm liest der
      // Main die Schlagworte des Dokuments (Frontmatter und Inline). Der
      // LIVE-Inhalt und nicht der Index, damit eine ungespeicherte
      // Schlagwort-Änderung sofort wirkt, so wie beim Zuordnungs-Feld.
      result = await api.profilesResolve({
        frontmatter: fmData || {},
        path: tab.path || null,
        text: tab.content || '',
      });
    } catch {
      result = null;
    }
    if (token !== state.properties.profileTokens[paneIdx]) return;
    if (result && result.ok && result.hasConfig) {
      next = {
        assignField: result.assignField,
        fields: result.fields,
        // 4T-1161 (E5): das zuerst aufgelöste Profil samt Symbol und Fund-Stufe.
        leading: result.leading || null,
      };
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
  // 4T-1161 (Epic 3E-0219, E5): Symbol des aufgelösten Profils am Dokument.
  applyProfileBadge(els, next);
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

// 4T-1156 (Epic 3E-0219): Uhrzeit im 24-Stunden-Format, Sekunden optional —
// dieselbe Regel wie im Format-Modul (`property-profiles-format.js`).
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

// 4T-1156: `link` und `time` werden bewusst NICHT inferiert. Ein Verweis ist
// als Wert ein gewöhnlicher Text, und eine Uhrzeit steht in Anführungszeichen
// wie jeder andere String; sie zu erraten hieße, jedes Textfeld mit `[[…]]`
// oder `09:30` still zum Verweis- bzw. Zeit-Feld zu machen. Beide Typen
// entstehen allein aus einer Definition oder aus der Wahl im Typ-Wechsler.
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
  // 4T-1156 (Epic 3E-0219): Ein Verweis ist beim Wechsel schlicht sein Text —
  // die Wiki-Schreibweise bleibt erhalten, damit ein versehentlicher
  // Typ-Wechsel das Ziel nicht verliert. Eine Uhrzeit dagegen wird geprüft
  // wie ein Datum: Ein nicht darstellbarer Wert würde das Bedienelement
  // leeren, ohne dass jemand ihn zurückholen kann.
  if (toType === 'link') {
    if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
    return value === null || value === undefined ? '' : String(value);
  }
  if (toType === 'time') {
    if (typeof value === 'string' && TIME_RE.test(value.trim())) return value.trim();
    return '';
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
  if (!def) {
    hintEl.hidden = true;
    hintEl.title = '';
    return;
  }
  // 4T-1157 (Epic 3E-0219, E12): Fehlt die Quelle eines Wertevorrats oder
  // liefert sie nichts, bleibt das Feld bedienbar, der Vorrat ist leer, und
  // ein Hinweis steht am Feld (E12, letzte Festlegung). Er greift, wenn kein
  // Wert-Hinweis vorliegt: Ein Wert-Problem ist das konkretere und geht vor.
  if (!code) {
    const quelle = valueSourceHint(def);
    hintEl.hidden = quelle === null;
    hintEl.title = quelle === null ? '' : t('properties.profileHint.' + quelle);
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
  // 4T-1156 (Epic 3E-0219): Zyklus-Knopf und Chips-Leiste stehen vor der
  // Typ-Verzweigung, weil beide seit der Entkopplung (E11) an jedem Typ
  // hängen können — der Typ-Name verrät die Vielzahl nicht mehr, und der
  // Zyklus ist ein Bedienelement der Auswahl, kein Typ.
  const zyklus = valueEl.querySelector('button.properties-field-value-cycle');
  if (zyklus) return zyklus.dataset.value || '';
  const chipListe = valueEl.querySelector('.properties-field-multistring');
  if (chipListe) {
    const pills = chipListe.querySelectorAll('.properties-field-multistring-pill');
    return Array.from(pills)
      .map((p) => p.dataset.value)
      .filter((v) => v != null && v !== '');
  }
  if (type === 'string' || type === 'date' || type === 'link' || type === 'time') {
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
