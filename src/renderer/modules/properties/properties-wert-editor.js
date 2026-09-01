// Wert-Editoren der Properties-Sidebar: das typgerechte Bedienelement eines
// Feldes, die Auswahl-Liste eines Wertebereichs, die Chips-Leiste des
// Mehrfach-Modus und der Typ-Wechsel.
//
// 4T-1172 (Epic 3E-0220): Auszug aus properties-fields.js, erzwungen vom
// Datei-Größen-Budget (die Datei stand bei genau 500 Zeilen, und das
// Feld-Formular der Stufe 3 braucht dort Platz). Der Schnitt folgt der
// Fachlichkeit und nicht der Zeilenzahl: Eine FELD-ZEILE zu bauen (Name, Typ,
// Hinweis, Löschen) und ein WERT-BEDIENELEMENT zu bauen sind zwei
// Verantwortlichkeiten; die zweite hängt am Typ-Satz und wächst mit jedem
// neuen Typ, die erste nicht. Funktions-Rümpfe unverändert übernommen.
//
// Stellung im Ordner: Blatt. Das Modul lädt nichts aus properties-fields.js
// zurück, der Import-Graph bleibt damit kreisfrei.
'use strict';

import { t } from '../../i18n.js';
import { fieldDefinitionHint } from '../../../shared/property-profiles.js';
import {
  applyFieldHint,
  coerceValue,
  extractFieldValue,
  inferType,
} from './properties-typ-werte.js';
// 4T-1156 (Epic 3E-0219): Bedienelemente der neuen Typen und Optionen — eine
// gemeinsame Quelle für beide Panels (Paritäts-Auflage, Konzept 7.3).
import {
  applyDateOptions,
  applyNumberOptions,
  attachLinkSuggestions,
  attachLookupWerte,
  attachQueryValues,
  hatAuswahl,
  renderAbgeleitetesFeld,
  renderCycleField,
  renderLinkField,
  renderTimeField,
} from './properties-neue-typen.js';
// 4T-1185/4T-1187 (Epic 3E-0221): Die Typ-Mengen der abgeleiteten und der
// strukturierten Felder kommen aus dem geteilten Format-Modul, damit Renderer
// und Datenseite dieselbe Quelle haben.
import { DERIVED_TYPES, OBJECT_TYPES } from '../../../shared/property-profiles.js';
// 4T-1187: gestapelte Bedienung der Objekt-Typen — gemeinsame Quelle beider
// Panels, der Bau der Kind-Editoren kommt als Parameter herein.
import { kindDefinitionen, renderObjektFeld } from './properties-objekt-felder.js';
// 4T-1340 (Epic 3E-0238): zweite Werte-Quelle — die im Bereich vergebenen Werte.
import { attachBestandsWerte } from './properties-bestandswerte.js';

function istAbgeleiteterTyp(type) {
  return DERIVED_TYPES.includes(type);
}

// 4T-1172 (Epic 3E-0220): Drei Zugriffe dieses Moduls zeigen zurück in die
// Renderer-Komponente — der Sitzungs-Zustand für den aktiven Pfad, der
// Debounce-Save und das Öffnen eines Verweis-Ziels. Als Importe würden sie
// dieses Modul in die eingefrorene Bestands-Komponente des Ordner-Import-
// Wächters ziehen, die technisch nicht wachsen darf. Sie kommen deshalb von
// außen herein: properties-fields.js reicht sie im Modul-Rumpf ein. Das ist
// dasselbe Muster, mit dem sich properties-neue-typen.js als Blatt hält
// (dort als Callback-Parameter je Aufruf); hier eine Umgebung, weil die
// Zugriffe über die ganze Datei verteilt sind und jede Signatur sonst drei
// Parameter mehr trüge.
let umgebung = {
  aktiverPfad: () => null,
  speichern: () => {},
  oeffneVerweis: () => {},
};

export function setzeWertEditorUmgebung(teile) {
  umgebung = { ...umgebung, ...teile };
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
  // 4T-1158: Mit Abfrage-Quelle kommt das Feld ohne feste Werte hierher.
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

// 4T-1340 (Epic 3E-0238): Name der Eigenschaft, zu der dieses Bedienelement
// gehört. Er steht im Schlüssel-Feld desselben Rahmens und nicht in der
// Definition: Ein Feld ohne Profil hat keine Definition, und genau dort hilft
// die Bestands-Quelle am meisten. Gelesen wird das Feld statt eines
// mitgeführten Werts, weil der Name umbenennbar ist und die DOM ihn führt.
function feldNameAus(container) {
  const rahmen = container && container.closest ? container.closest('.properties-field') : null;
  const key = rahmen ? rahmen.querySelector('.properties-field-key') : null;
  const name = key && typeof key.value === 'string' ? key.value.trim() : '';
  return name || null;
}

// Die Bestands-Werte an ein Bedienelement hängen, sofern der Feldname bekannt
// ist. Ein Feld ohne Namen — die noch leere Zeile einer neuen Eigenschaft —
// hat nichts, wonach sich fragen ließe.
function haengeBestandsWerte(container, el, paneIdx, input = null) {
  const feld = feldNameAus(container);
  if (!feld) return;
  attachBestandsWerte(el, { feld, filePath: umgebung.aktiverPfad(paneIdx), input });
}

export function renderValueEditor(container, type, value, paneIdx, def = null, hinweis = null) {
  container.innerHTML = '';
  // 4T-1185 (Epic 3E-0221, E1): Abgeleitete Felder zuerst — vor jeder anderen
  // Verzweigung, weil an ihnen kein Bedienelement entstehen darf. `value`
  // trägt den bereits errechneten Wert; der Lookup-Wert kommt über
  // `attachLookupWerte` nach, und genau darin steckt die Zusage «nur
  // auswerten, wenn sichtbar» (Konzept 6.11).
  if (istAbgeleiteterTyp(type)) {
    const el = renderAbgeleitetesFeld(container, value, { hinweis });
    if (type === 'lookup') {
      attachLookupWerte(el, { def, filePath: umgebung.aktiverPfad(paneIdx) });
    }
    return;
  }
  // 4T-1187 (Epic 3E-0221, E11): gestapelte Bedienung der Objekt-Typen.
  //
  // **Nur mit erklärten Kind-Feldern.** Ein Objekt-Typ ohne `fields` ist
  // zulässig (4T-1186), hat aber nichts zu stapeln; er fällt auf die
  // vorhandene nur lesende Anzeige verschachtelter Strukturen zurück — genau
  // der Rückfall, den Konzept 6.8 dafür vorsieht.
  if (OBJECT_TYPES.includes(type) && kindDefinitionen(def).length > 0) {
    renderObjektFeld(container, def, value, {
      baueKindEditor: (zelle, kindDef, kindWert) =>
        renderValueEditor(zelle, kindDef.type, kindWert, paneIdx, kindDef),
      onChange: () => umgebung.speichern(paneIdx),
    });
    return;
  }
  // 4T-0448: Wertebereichs-Felder — Einfach-Auswahl als Auswahl-Liste,
  // Mehrfach-Auswahl über die Chips-Leiste mit Werte-Vorschlägen (datalist).
  if (hatAuswahl(def) && !def.multiple) {
    // 4T-1156 (E11): Zyklus — anderes Bedienelement, gleicher Wert.
    if (def.options && def.options.control === 'cycle') {
      renderCycleField(container, def, value, {
        onChange: () => umgebung.speichern(paneIdx),
      });
      return;
    }
    renderValueSelect(container, def, value, paneIdx);
    // 4T-1158: Abfrage-Werte kommen nach — auf Verlangen, erst hier.
    const select = container.querySelector('select.properties-field-value-select');
    if (select) attachQueryValues(select, { def, filePath: umgebung.aktiverPfad(paneIdx) });
    // 4T-1340: die zweite Herkunft, als eigene Gruppe hinter dem Vorrat.
    if (select) haengeBestandsWerte(container, select, paneIdx);
    return;
  }
  // 4T-1156: Verweis im Einzel-Modus; der Mehrfach-Fall läuft über die
  // Chips-Leiste weiter unten.
  if (type === 'link' && !(def && def.multiple)) {
    renderLinkField(container, value, {
      def,
      filePath: umgebung.aktiverPfad(paneIdx),
      // Öffnen über den Wiki-Link-Weg (Alias-Auflösung eingeschlossen); als
      // Parameter statt als Import des Bau-Moduls (Ordner-Import-Wächter).
      onOpen: (name) => umgebung.oeffneVerweis(paneIdx, name),
    });
    return;
  }
  if (type === 'time') {
    renderTimeField(container, value, {});
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
    if (type === 'date') applyDateOptions(input, def); // 4T-1156: shift
    container.appendChild(input);
    // 4T-1340: Werte-Vorschläge aus dem Bestand. Nur am Text-Feld — ein
    // Datums-Feld hat sein eigenes Bedienelement, und eine Vorschlagsliste
    // daneben wäre ein zweiter Weg zur selben Angabe.
    if (type === 'string') haengeBestandsWerte(container, container, paneIdx, input);
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
    applyNumberOptions(input, def); // 4T-1156: step, min, max
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
  // 4T-1156 (E11): Chips-Leiste für JEDES Mehrfach-Feld — seit der
  // Entkopplung verrät der Typ-Name die Vielzahl nicht mehr.
  if (type === 'multistring' || (def && def.multiple === true)) {
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
    // 4T-1158: Vorschlags-Lage — gesetzt unten, ausgewertet einmal.
    let erlaubt = null;
    let hatVorschlaege = false;
    // 4T-0448: Mehrfach-Auswahl eines Wertebereichs — die definierten Werte
    // als Eingabe-Vorschläge (datalist); freie Eingabe bleibt möglich
    // (weiche Haltung) und erzeugt den Hinweis beim Save.
    if (def && def.multiple && Array.isArray(def.values) && def.values.length > 0) {
      hatVorschlaege = true;
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
      erlaubt = def.values.map((v) => String(v));
    }
    // 4T-1158: Abfrage-Quelle — die Werte kommen nach.
    if (def && def.multiple && def.valuesFrom && def.valuesFrom.query) {
      attachQueryValues(list, { def, filePath: umgebung.aktiverPfad(paneIdx), input });
      hatVorschlaege = true;
      erlaubt = null;
    }
    // 4T-1340 (Epic 3E-0238): Werte-Vorschläge aus dem Bestand — auch hier,
    // weil eine Mehrfach-Eigenschaft dieselbe Frage stellt wie eine einfache.
    // Der Verweis-Fall bleibt draußen: Dort sind die Vorschläge Ziele und
    // keine Werte, und die Bestands-Werte wären dieselben Namen ein zweites
    // Mal.
    //
    // `erlaubt` fällt damit wie bei der Abfrage-Quelle auf null: Die Liste
    // trägt jetzt zwei Herkünfte, und welche Werte aus dem Bestand kommen,
    // steht erst nach dem Holen fest. Die weiche Haltung bleibt unberührt —
    // der Hinweis beim Speichern prüft weiterhin gegen den definierten
    // Wertevorrat, und genau er ist die Zusicherung, nicht dieser Filter.
    if (type !== 'link' && feldNameAus(container)) {
      haengeBestandsWerte(container, list, paneIdx, input);
      hatVorschlaege = true;
      erlaubt = null;
    }
    // 4T-1156: Verweis-Feld — dieselbe Leiste, Ziele statt Werte.
    if (type === 'link') {
      attachLinkSuggestions(list, input, { def, filePath: umgebung.aktiverPfad(paneIdx) });
      hatVorschlaege = true;
      erlaubt = null;
    }
    // 4T-1158: EIN Übernahme-Listener für alle drei Quellen — verschieden ist
    // nur, WOHER die Vorschläge kommen (Regel: PO-Befund 0.56.0, oben).
    // `erlaubt` prüft feste Werte, null lässt jeden Vorschlag zu.
    if (hatVorschlaege) {
      input.addEventListener('input', (e) => {
        if (e.inputType && e.inputType !== 'insertReplacementText') return;
        const v = input.value.trim();
        if (!v || (erlaubt && !erlaubt.includes(v))) return;
        if (addChip(v)) umgebung.speichern(paneIdx);
      });
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const v = input.value.trim();
        if (v && addChip(v)) umgebung.speichern(paneIdx);
      } else if (e.key === 'Backspace' && input.value === '') {
        const pills = list.querySelectorAll('.properties-field-multistring-pill');
        if (pills.length > 0) {
          pills[pills.length - 1].remove();
          umgebung.speichern(paneIdx);
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
    if (paneIdx != null) umgebung.speichern(paneIdx);
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
