// 4T-001187 (Epic 3E-000221, E11): Gestapelte Bedienung der beiden Objekt-Typen —
// ein Objekt mit benannten Kind-Feldern und eine Liste gleichartiger Objekte.
//
// **Eine Quelle, zwei Panels.** Beide Eigenschafts-Editoren rufen dieselben
// Funktionen; verschieden sind allein das Lese-Flag, der Speicher-Weg und der
// Bau der Kind-Bedienelemente — und alle drei kommen als Parameter herein.
// Dieselbe Entscheidung wie bei `properties-neue-typen.js` in Stufe 2, und aus
// demselben Grund: Die Parität der beiden Panels ist eine ausgelieferte Zusage
// (Konzept 7.3), und sie hängt so an einer Quelle statt an zwei gleichlautenden
// Kopien.
//
// **Warum eine eigene Datei neben den übrigen neuen Typen.** Die
// Bedienelemente der Stufe 2 sind flach: ein Eingabefeld, eine Auswahl, ein
// Knopf. Was hier liegt, ist eine Ebene tiefer — es baut Kind-Zeilen, liest sie
// zurück und verwaltet Einträge einer Liste. Das ist ein eigener Gegenstand,
// und `properties-neue-typen.js` stünde mit ihm über seinem Datei-Budget.
//
// **Blatt-Modul über Ordner-Grenzen hinweg**, wie sein Nachbar: Es importiert
// weder aus `views/` noch aus den Panel-Modulen. Der Bau eines Kind-Editors
// käme sonst als Import herein und machte dieses Modul zum Teilnehmer der
// eingefrorenen Zyklus-Komponente des Import-Wächters.
'use strict';

import { t } from '../../i18n.js';

// Marke einer Kind-Zeile am DOM. Sie trägt den Kind-Feldnamen als Attribut,
// weil die Auslese die Zeilen über ihn wiederfindet — der Wert eines
// Eingabe-Feldes ist eine DOM-Property und kein Attribut, über ihn ließe sich
// nicht suchen (belegter Fall aus 4T-001185).
const KIND_KLASSE = 'properties-objekt-kind';
const EINTRAG_KLASSE = 'properties-objekt-eintrag';

/**
 * Die Kind-Definitionen eines Objekt-Feldes, oder eine leere Liste.
 *
 * Ein Objekt-Typ ohne erklärte Kinder ist zulässig (4T-001186); er bekommt keine
 * gestapelte Bedienung, sondern fällt beim Aufrufer auf die vorhandene nur
 * lesende Anzeige verschachtelter Strukturen zurück.
 */
export function kindDefinitionen(def) {
  return def && Array.isArray(def.fields) ? def.fields.filter((k) => k && k.name) : [];
}

/**
 * Baut die Bedienung eines Objekt-Feldes in seine Wert-Zelle.
 *
 * @param {HTMLElement} container Wert-Zelle der Feld-Zeile.
 * @param {object} def Feld-Definition (type 'object' oder 'objectlist').
 * @param {*} wert Ist-Wert: ein Objekt bzw. eine Liste von Objekten.
 * @param {object} opts
 * @param {boolean} [opts.readOnly] Lese-Zustand des Panels.
 * @param {Function} opts.baueKindEditor (zelle, kindDef, kindWert) => void.
 * @param {Function} [opts.onChange] Nach Anlegen/Entfernen eines Eintrags.
 * @returns {HTMLElement} der gebaute Rahmen.
 */
export function renderObjektFeld(container, def, wert, opts) {
  const { readOnly = false, baueKindEditor, onChange = null } = opts || {};
  const kinder = kindDefinitionen(def);
  const rahmen = document.createElement('div');
  rahmen.className = 'properties-objekt';
  rahmen.dataset.objektTyp = def.type;
  container.appendChild(rahmen);

  if (def.type === 'object') {
    rahmen.appendChild(
      baueEintrag(kinder, istObjekt(wert) ? wert : {}, { readOnly, baueKindEditor }),
    );
    return rahmen;
  }

  const liste = document.createElement('div');
  liste.className = 'properties-objekt-liste';
  rahmen.appendChild(liste);
  for (const eintrag of Array.isArray(wert) ? wert : []) {
    if (!istObjekt(eintrag)) continue;
    liste.appendChild(
      baueEintrag(kinder, eintrag, { readOnly, baueKindEditor, entfernbar: true, onChange }),
    );
  }

  if (readOnly) return rahmen;
  const hinzu = document.createElement('button');
  hinzu.type = 'button';
  hinzu.className = 'properties-objekt-add';
  hinzu.textContent = t('properties.objectAddEntry');
  hinzu.addEventListener('click', () => {
    // Ein neuer Eintrag entsteht LEER: Seine Kind-Felder werden nicht
    // vorbelegt, damit sie als fehlend erkennbar bleiben (AK3 des Tasks,
    // AK4 der Story). Deshalb steht hier {} und kein Leer-Wert je Kind.
    liste.appendChild(
      baueEintrag(kinder, {}, { readOnly, baueKindEditor, entfernbar: true, onChange }),
    );
    if (typeof onChange === 'function') onChange();
  });
  rahmen.appendChild(hinzu);
  return rahmen;
}

// Ein Eintrag: die Kind-Zeilen eines Objekts, bei einer Liste zusätzlich mit
// Entfernen-Knopf.
function baueEintrag(kinder, werte, opts) {
  const { readOnly, baueKindEditor, entfernbar = false, onChange = null } = opts;
  const eintrag = document.createElement('div');
  eintrag.className = EINTRAG_KLASSE;

  for (const kind of kinder) {
    const zeile = document.createElement('div');
    zeile.className = KIND_KLASSE;
    zeile.dataset.kindFeld = kind.name;

    const label = document.createElement('span');
    label.className = 'properties-objekt-kind-label';
    label.textContent = kind.name;
    // **Ein nicht gesetztes Kind-Feld ist als fehlend erkennbar** (AK3): Die
    // Beschriftung sagt es, statt dass ein vorbelegter Wert es verdeckte.
    const gesetzt = Object.prototype.hasOwnProperty.call(werte, kind.name);
    if (!gesetzt) {
      zeile.classList.add('is-fehlend');
      label.title = t('properties.objectFieldMissing');
    }
    zeile.appendChild(label);

    const zelle = document.createElement('div');
    zelle.className = 'properties-objekt-kind-wert';
    zeile.appendChild(zelle);
    if (typeof baueKindEditor === 'function') {
      baueKindEditor(zelle, kind, gesetzt ? werte[kind.name] : undefined);
    }
    eintrag.appendChild(zeile);
  }

  // Kind-Werte ohne Definition gehen nicht verloren: Sie werden mitgeführt und
  // beim Auslesen unverändert zurückgeschrieben. Ein Bedienelement bekommen
  // sie nicht — die Definitions-Liste ist ein Angebot, aber was der Anwender
  // von Hand eingetragen hat, gehört ihm.
  const bekannt = new Set(kinder.map((k) => k.name));
  const fremd = {};
  for (const key of Object.keys(werte)) if (!bekannt.has(key)) fremd[key] = werte[key];
  if (Object.keys(fremd).length > 0) eintrag._fremdeWerte = fremd;

  if (entfernbar && !readOnly) {
    const weg = document.createElement('button');
    weg.type = 'button';
    weg.className = 'properties-objekt-remove';
    weg.textContent = '×';
    weg.title = t('properties.objectRemoveEntry');
    weg.addEventListener('click', () => {
      eintrag.remove();
      if (typeof onChange === 'function') onChange();
    });
    eintrag.appendChild(weg);
  }
  return eintrag;
}

function istObjekt(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Liest den Wert eines Objekt-Feldes aus dem DOM zurück.
 *
 * **Ein leeres Kind-Feld wird nicht geschrieben.** Es bleibt fehlend, statt als
 * Leer-Wert im Metadaten-Block zu landen — sonst füllte das bloße Anzeigen
 * eines Objekts alle seine Kind-Felder auf, und AK3 wäre nach dem ersten
 * Speichern nicht mehr nachweisbar.
 *
 * @param {HTMLElement} container Wert-Zelle der Feld-Zeile.
 * @param {object} def Feld-Definition.
 * @param {Function} leseKindWert (zelle, kindDef) => Wert.
 * @returns {object|Array} das Objekt bzw. die Liste.
 */
export function leseObjektWert(container, def, leseKindWert) {
  const rahmen = container.querySelector('.properties-objekt');
  if (!rahmen) return def.type === 'objectlist' ? [] : {};
  const eintraege = rahmen.querySelectorAll(`.${EINTRAG_KLASSE}`);
  if (def.type === 'object') {
    return eintraege.length > 0 ? leseEintrag(eintraege[0], leseKindWert) : {};
  }
  return Array.from(eintraege).map((e) => leseEintrag(e, leseKindWert));
}

function leseEintrag(eintrag, leseKindWert) {
  const out = {};
  for (const zeile of eintrag.querySelectorAll(`.${KIND_KLASSE}`)) {
    const name = zeile.dataset.kindFeld;
    if (!name) continue;
    const zelle = zeile.querySelector('.properties-objekt-kind-wert');
    const wert = typeof leseKindWert === 'function' ? leseKindWert(zelle, name) : undefined;
    if (wert === undefined || wert === null || wert === '') continue;
    if (Array.isArray(wert) && wert.length === 0) continue;
    out[name] = wert;
  }
  // Die mitgeführten Werte ohne Definition kommen zuletzt und überschreiben
  // nichts, was das Formular selbst gesetzt hat.
  const fremd = eintrag._fremdeWerte;
  if (fremd) for (const key of Object.keys(fremd)) if (!(key in out)) out[key] = fremd[key];
  return out;
}
