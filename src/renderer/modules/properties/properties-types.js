// Typ-Satz und Profil-Auflösung des Properties-Editors.
// 4T-0981 (Epic 3E-0196): Auszug aus properties-tags.js.
//
// 4T-1172 (Epic 3E-0220): Die zustandsfreien Typ- und Wert-Hilfen sind nach
// properties-typ-werte.js gezogen und werden von hier weitergereicht
// (Begründung dort). Was bleibt, ist der zustandsbehaftete Teil: die
// Profil-Auflösung einer Spalte samt ihrem Cache, ihrer Listener-Registry und
// dem Symbol am Dokument. Damit ist dieses Modul kein Blatt des Ordners mehr —
// es liest Sitzungs-Zustand und ruft die Auflösung über IPC.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
// 4T-0294 (Epic 3E-0052): Tag-Panel gehoert zur Tag-Erweiterung.
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { getPaneEls, state } from '../app/app-state.js';
// 4T-0448 (Epic 3E-0083): Eigenschafts-Profile — gemeinsame Editor-Logik
// (Vorschläge, weiche Hinweise) aus dem Shared-Modul; die Auflösung liefert
// profiles:resolve (4T-0447) und wird pro Pane in state.properties gecacht.
import { fieldDefinitionHint, isEmptyPropertyValue } from '../../../shared/property-profiles.js';
// 4T-1172 (Epic 3E-0220): Typ-Ableitung aus dem Blatt-Modul — renderTypeFor
// braucht sie, die Fassade unten reicht sie weiter.
import { inferType } from './properties-typ-werte.js';

// 4T-1155/4T-1156 (Epic 3E-0219): um 'link' und 'time' erweitert, in
// derselben Reihenfolge wie PROFILE_FIELD_TYPES des Format-Moduls; 'readonly'
// bleibt der DOM-interne Fallback am Ende.
// 4T-1185 (Epic 3E-0221, E1): um 'formula' und 'lookup' erweitert. Beide
// erscheinen im Typ-Wechsler nur an einem Feld, das sie ohnehin trägt — genau
// wie der interne 'readonly'-Fallback und aus demselben Grund: Ein Anwender
// legt kein abgeleitetes Feld an, indem er einen Typ wählt; es entsteht durch
// eine Profil-Definition. Der Wechsler ist an solchen Feldern gesperrt.
// 4T-1187 (Epic 3E-0221, E11): um die beiden Objekt-Typen erweitert, und zwar
// aus demselben Grund und mit derselben Folge — ein strukturiertes Feld
// entsteht aus einer Profil-Definition mit Kind-Feldern, nicht aus einer
// Typ-Wahl. **Sie MÜSSEN in dieser Liste stehen**, auch wenn sie nicht wählbar
// sind: Der Typ-Wechsler baut seine Optionen daraus, und ohne eine Option für
// den eigenen Typ könnte er ihn nicht anzeigen. Genau daran ist der erste
// E2E-Lauf des Block-Panels gescheitert.
export const PROPERTY_TYPES = [
  'string',
  'multistring',
  'number',
  'boolean',
  'date',
  'multiline',
  'link',
  'time',
  'formula',
  'lookup',
  'object',
  'objectlist',
  'readonly',
];

// 4T-1185/4T-1187: Typen, die im Wechsler nur am eigenen Feld erscheinen.
// 'readonly' ist der DOM-interne Rückfall verschachtelter Strukturen, zwei
// sind abgeleitet, zwei strukturiert — keiner der fünf ist eine Vorgabe, die
// man wählt; alle entstehen aus einer Definition oder aus dem Wert selbst.
export const NICHT_WAEHLBARE_TYPEN = ['formula', 'lookup', 'object', 'objectlist', 'readonly'];

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
        // 4T-1171 (Epic 3E-0220): die geordnete Profil-Kette für das
        // Feld-Formular der Stufe 3.
        chain: Array.isArray(result.chain) ? result.chain : [],
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

// 4T-1172 (Epic 3E-0220): Die zustandsfreien Typ- und Wert-Hilfen liegen seit
// dem Schnitt in properties-typ-werte.js und werden von hier weitergereicht.
// Die Fassade bleibt der eine Ort, an dem die Verbraucher laden — dasselbe
// Muster, mit dem property-profiles.js seine Format- und Editor-Ebene führt.
export {
  applyFieldHint,
  coerceValue,
  defaultValueForType,
  extractFieldValue,
  inferType,
} from './properties-typ-werte.js';
