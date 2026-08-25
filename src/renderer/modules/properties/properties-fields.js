// Feld-DOM der Properties-Sidebar: Sektion rendern und Feld-Zeilen bauen.
// 4T-0981 (Epic 3E-0196): Auszug aus properties-tags.js.
// 4T-1172 (Epic 3E-0220): Die Wert-Editoren und der Typ-Wechsel sind nach
// properties-wert-editor.js gezogen (Datei-Größen-Budget; Begründung dort).
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
import { isAllEmpty } from '../views/views.js';
// 4T-1156: Öffnen eines Verweis-Ziels über den Wiki-Link-Weg.
import { activateLink } from '../views/link-navigation.js';
import {
  buildProfileFillMap,
  emptyValueForDefinition,
  fieldDefinitionHint,
} from '../../../shared/property-profiles.js';
// 4T-1172 (Epic 3E-0220): Feld-Formular über alle Felder samt Herkunft.
import {
  baueFeldFormular,
  baueHerkunftsZeichen,
  fehlendeDefinitionen,
  fehlendeDefinitionenDerEbene,
  zeigtFeldFormular,
} from './properties-feld-formular.js';
import {
  applyFieldHint,
  inferType,
  NICHT_WAEHLBARE_TYPEN,
  onProfileResolutionChanged,
  profileDefFor,
  PROPERTY_TYPES,
  refreshProfileResolution,
  renderTypeFor,
} from './properties-types.js';
// 4T-1185 (Epic 3E-0221): die abgeleiteten Felder der geltenden Profile;
// der Zeilen-Bau kommt von hier als Parameter herein (Begruendung dort).
import { baueAbgeleiteteFelder } from './properties-abgeleitet.js';
import { flushPendingPropertiesSave, scheduleSavePropertiesFromPane } from './properties-save.js';
import {
  onTypeChange,
  renderValueEditor,
  setzeWertEditorUmgebung,
} from './properties-wert-editor.js';

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

  // 4T-1185 (Epic 3E-0221, E1): die abgeleiteten Felder der geltenden Profile.
  // Sie stehen NICHT in `data` — genau das ist die sichtbare Folge von E1 —
  // und müssen deshalb zusätzlich gebaut werden.
  //
  // **Sie stehen nach den Feldern des Dokuments und vor dem Feld-Formular.**
  // Zuerst, was in der Datei steht; danach, was gerechnet wird; zuletzt, was
  // man anlegen könnte. Eine Einsortierung zwischen die Dokument-Felder gäbe
  // es nicht zu tun: Ein abgeleitetes Feld hat in der Frontmatter-Reihenfolge
  // keinen Platz, weil es dort nicht vorkommt.
  baueAbgeleiteteFelder(els.propertiesFields, {
    aufloesung: state.properties.profileByPane[paneIdx],
    werte: data,
    baueZeile: (def, wert, hinweis) =>
      buildPropertyFieldDom(paneIdx, def.name, wert, def.type, def, hinweis),
  });

  // 4T-1172 (Epic 3E-0220, E5): Der Ausklapp-Bereich mit den Feldern, die die
  // Profile definieren und das Dokument noch nicht trägt. Er hängt IM selben
  // Container wie die übrigen Felder — dadurch sammelt ihn der vorhandene
  // Save-Weg von selbst ein, und ein zweiter Schreibweg entsteht nicht.
  // Ohne geltendes Profil, ohne Erweiterung und bei defektem Metadaten-Block
  // entsteht er gar nicht (AK6, AK9, AK7 — Begründung je Fall am Prädikat).
  const aufloesung = state.properties.profileByPane[paneIdx];
  if (zeigtFeldFormular(aufloesung, { parseError: !!fm.parseError })) {
    baueFeldFormular(els.propertiesFields, {
      fehlende: fehlendeDefinitionen(aufloesung.fields, data),
      // 4T-1173: die Kette der beteiligten Profile samt Übernahme je Ebene.
      kette: aufloesung.chain,
      fehlendeJeEbene: (profil) => fehlendeDefinitionenDerEbene(aufloesung.fields, data, profil),
      uebernehmen: (profil) => uebernimmEbene(paneIdx, aufloesung.fields, data, profil),
      // 4T-1173: Auf-Zustand ueber das Neu-Rendern hinweg halten.
      offen: !!state.properties.feldFormularOffenByPane[paneIdx],
      merkeZustand: (auf) => {
        state.properties.feldFormularOffenByPane[paneIdx] = auf;
      },
      baueFeld: (def) =>
        buildPropertyFieldDom(paneIdx, def.name, emptyValueForDefinition(def), def.type, def),
    });
  }
}

// 4T-0051: Baut die DOM-Komponente fuer ein Property-Feld in der Sidebar-
// Sektion. Layout zweizeilig: Head (Key | Type | Hint | Delete) ueber Value.
// Hooks fuer Live-Save: jedes input/change-Event triggert Debounce-Save.
// 4T-0448: optionaler def-Parameter (aufgelöste Profil-Definition) — dann
// dezente Kennzeichnung, Typ-Sperre (solange der Wert dem Typ entspricht),
// weicher Hinweis und ggf. Auswahl-Listen im Wert-Editor.
export function buildPropertyFieldDom(paneIdx, key, value, type, def = null, hinweis = null) {
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
    // 4T-1185: dieselbe Regel gilt seit der Stufe 4 auch für die beiden
    // abgeleiteten Typen (Liste in properties-types.js).
    if (NICHT_WAEHLBARE_TYPEN.includes(tname) && tname !== type) continue;
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

  // 4T-1172 (Epic 3E-0220, AK3): Herkunft des Feldes — aus welchem Profil es
  // stammt, über welchen Weg dieses Profil gilt und auf welcher
  // Vererbungs-Ebene es steht. Undefinierte Felder tragen nichts.
  const aufloesung = state.properties.profileByPane[paneIdx];
  const originEl = baueHerkunftsZeichen(def, aufloesung && aufloesung.chain);
  if (originEl) head.appendChild(originEl);

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
  renderValueEditor(
    valueWrap,
    type,
    value,
    paneIdx,
    hintCode === 'typeMismatch' ? null : def,
    hinweis,
  );

  // Live-Save-Hook: jede Eingabe in Key/Wert triggert Debounce-Save.
  wrap.addEventListener('input', () => scheduleSavePropertiesFromPane(paneIdx));
  wrap.addEventListener('change', () => scheduleSavePropertiesFromPane(paneIdx));

  return wrap;
}

// 4T-1173 (Epic 3E-0220, AK2/AK3/AK5): Übernahme der fehlenden Felder EINER
// Ketten-Ebene.
//
// Sie geht über `applyProfileFill` — denselben Weg, den die vorhandene
// Komplett-Übernahme seit 4T-0491 nimmt: ein einziger writeFrontmatter-Aufruf,
// eine isolierte Undo-Einheit, gesperrt bei defektem Metadaten-Block. Der
// Unterschied ist allein die Feld-Menge, und die baut `buildProfileFillMap`
// aus den Definitionen dieser einen Ebene. Bestehende Werte bleiben dabei
// unangetastet (AK5), weil die Funktion gegen die vorhandenen Schlüssel
// filtert.
//
// Der Import läuft als Laufzeit-Zugriff und nicht als statischer Import:
// properties-suggest.js lädt seinerseits aus dieser Datei, und ein weiterer
// statischer Zyklus im Ordner wäre ein Befund statt einer Lösung
// (Entwicklungsrichtlinien, Kapitel: keine Import-Zyklen).
async function uebernimmEbene(paneIdx, fields, data, profilName) {
  const felder = (Array.isArray(fields) ? fields : []).filter(
    (def) => def && String(def.profile || '').toLowerCase() === String(profilName).toLowerCase(),
  );
  if (felder.length === 0) return;
  const map = buildProfileFillMap(felder, Object.keys(data || {}));
  if (Object.keys(map).length === 0) return;
  const { applyProfileFill } = await import('./properties-suggest.js');
  applyProfileFill(paneIdx, { map });
}

// 4T-1156: Pfad der aktiven Datei einer Spalte — er bestimmt den Suchraum
// der Ziel-Vorschläge eines Verweis-Feldes (derselbe Suchraum, den die
// Wiki-Link-Vervollständigung des Editors nutzt).
function aktiverPfad(paneIdx) {
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  return tab && tab.path ? tab.path : null;
}

// 4T-1172 (Epic 3E-0220): Umgebung der Wert-Editoren einreichen. Sie steht
// hier und nicht dort, weil diese drei Zugriffe in die Renderer-Komponente
// zurückzeigen und das Blatt-Modul sonst in die eingefrorene Bestands-
// Komponente des Ordner-Import-Wächters geriete (Begründung dort).
setzeWertEditorUmgebung({
  aktiverPfad,
  speichern: scheduleSavePropertiesFromPane,
  oeffneVerweis: (paneIdx, name) => void activateLink(paneIdx, name, true),
});

// 4T-0981 (Epic 3E-0196): Nachziehen der Sektion bei geänderter Profil-
// Auflösung. Vor dem Schnitt stand dieser Aufruf mit derselben Bedingung
// inline in refreshProfileResolution. Die Anmeldung im Modul-Rumpf hält die
// Reihenfolge unverändert, weil sie vor jeder Laufzeit-Anmeldung liegt (das
// Block-Panel meldet sich erst in initBlockPropsPanel an).
onProfileResolutionChanged((paneIdx) => {
  if (!isAllEmpty() && state.properties.visibleByPane[paneIdx]) renderProperties(paneIdx);
});
