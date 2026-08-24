// 4T-1156 (Epic 3E-0219, E11): Bedienelemente der Typen und Optionen aus dem
// Typ-Ausbau der Stufe 2 — Verweis, Uhrzeit, die Optionen von Zahl und Datum
// und der Zyklus der Einfach-Auswahl.
//
// **Warum ein gemeinsames Modul und nicht zwei Zweige.** Eine ausgelieferte
// Anforderung verlangt, dass sich das Block-Eigenschaften-Panel identisch zum
// Dokument-Panel verhält (Konzept 7.3). Die sechs Bestands-Typen erfüllen das
// über zwei gleichlautende Kopien in `properties-fields.js` und
// `block-props-fields.js` — eine Parität, die von Disziplin lebt. Für die
// neuen Typen trägt sie stattdessen **eine Quelle**: Beide Panels rufen
// dieselben Bau-Funktionen, und der Paritäts-Test prüft ihre Aufrufe statt
// zweier Umsetzungen. Möglich ist das, weil beide Panels bereits dieselben
// CSS-Klassen verwenden; verschieden sind allein das Lese-Flag und der
// Speicher-Weg, und beide kommen als Parameter herein.
//
// **Blatt-Modul, und zwar über Ordner-Grenzen hinweg.** Es importiert weder
// aus `properties/` noch aus `views/`. Der zweite Teil ist keine Ästhetik,
// sondern eine Auflage des Import-Wächters: Zwischen den Renderer-Ordnern
// besteht eine eingefrorene Zyklus-Komponente, und eine neue Datei darf ihr
// nicht beitreten («Zyklus auflösen statt einfrieren»). Das Öffnen eines
// Verweis-Ziels braucht `activateLink` aus `views/link-navigation.js` —
// deshalb kommt es als Parameter `onOpen` herein, gerufen von den beiden
// Panels, die ohnehin schon in der Komponente liegen. Dasselbe Mittel, mit
// dem `properties-types.js` seine Auflösungs-Listener führt.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';

// Wiki-Schreibweise eines Verweis-Werts: `[[Ziel]]` bzw. `[[Ziel|Label]]`.
// Der Wert wird im Metadaten-Block genau so geführt (Konzept 6.12); das
// Bedienelement zeigt ihn deshalb roh und wandelt ihn nicht still um.
const WIKI_RE = /^\s*\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]\s*$/;

// Ziel-Name eines Verweis-Werts, oder null wenn der Wert keiner ist. Ein
// blanker Name ohne Klammern zählt mit: Wer ihn eintippt, meint ein Ziel,
// und die Existenz-Prüfung soll ihm antworten können.
export function zielName(wert) {
  if (typeof wert !== 'string') return null;
  const roh = wert.trim();
  if (roh === '') return null;
  const treffer = WIKI_RE.exec(roh);
  if (treffer) return treffer[1].trim() || null;
  return roh.includes('[[') ? null : roh;
}

// Ziel-Liste eines Verweis-Feldes, gefiltert und sortiert im Main. Liefert
// immer ein Ergebnis; ein Fehler ist `unavailable` und keine Ausnahme, damit
// ein Bedienelement nie an der Vervollständigung hängen bleibt.
async function ladeZiele(def, filePath) {
  if (typeof api.profilesLinkTargets !== 'function') return { status: 'unavailable', targets: [] };
  const options = def && def.options ? def.options : {};
  try {
    const antwort = await api.profilesLinkTargets({ path: filePath || null, options });
    if (!antwort || !antwort.ok) return { status: 'unavailable', targets: [] };
    return {
      status: antwort.status,
      targets: Array.isArray(antwort.targets) ? antwort.targets : [],
    };
  } catch {
    return { status: 'unavailable', targets: [] };
  }
}

let listenSeq = 0;

// Vorschlags-Liste als datalist: Wert ist die Wiki-Schreibweise (das ist, was
// gespeichert wird), Beschriftung der Anzeige-Name aus der Option `display`,
// sonst der Datei-Name.
function baueDatalist(targets) {
  const dl = document.createElement('datalist');
  dl.id = `properties-link-targets-${listenSeq++}`;
  for (const ziel of targets) {
    const opt = document.createElement('option');
    opt.value = `[[${ziel.name}]]`;
    if (ziel.display) opt.textContent = ziel.display;
    dl.appendChild(opt);
  }
  return dl;
}

// Existenz-Markierung eines Verweis-Werts. Solange der Index nicht bereit
// ist, wird NICHTS behauptet: Ein laufender Aufbau meldete sonst jedes Ziel
// als fehlend (weiche Linie — ein Hinweis, nie eine Blockade).
function setzeExistenz(markerEl, wert, ziele) {
  const name = zielName(wert);
  if (!markerEl) return;
  if (ziele.status !== 'ready' || name === null) {
    markerEl.hidden = true;
    markerEl.title = '';
    return;
  }
  const bekannt = ziele.targets.some((z) => z.name.toLowerCase() === name.toLowerCase());
  markerEl.hidden = bekannt;
  markerEl.title = bekannt ? '' : t('properties.linkMissing').replace('{name}', name);
}

/**
 * Verweis-Feld (Einzel-Wert). Baut Eingabe, Vervollständigung,
 * Existenz-Markierung und den Öffnen-Knopf.
 *
 * @param {HTMLElement} container Ziel-Container (wird nicht geleert).
 * @param {*} value Ist-Wert.
 * @param {object} opts { def, readOnly, filePath, onOpen }
 *   onOpen bekommt den Ziel-NAMEN (nicht den Roh-Wert) und öffnet ihn; ohne
 *   die Angabe bleibt der Knopf wirkungslos statt zu werfen.
 * @returns {HTMLInputElement} das Eingabe-Element (für den Speicher-Weg).
 */
export function renderLinkField(container, value, opts) {
  const { def = null, readOnly = false, filePath = null, onOpen = null } = opts || {};
  const wrap = document.createElement('div');
  wrap.className = 'properties-field-link';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'properties-field-value-input properties-field-link-input';
  input.value = typeof value === 'string' ? value : value == null ? '' : String(value);
  input.placeholder = t('properties.linkPlaceholder');
  input.disabled = readOnly;
  wrap.appendChild(input);

  const marker = document.createElement('span');
  marker.className = 'properties-field-link-missing';
  marker.textContent = '⚠';
  marker.hidden = true;
  wrap.appendChild(marker);

  const oeffnen = document.createElement('button');
  oeffnen.type = 'button';
  oeffnen.className = 'properties-field-link-open';
  oeffnen.textContent = '↗';
  oeffnen.title = t('properties.linkOpen');
  oeffnen.addEventListener('click', () => {
    const name = zielName(input.value);
    if (name !== null && typeof onOpen === 'function') onOpen(name);
  });
  wrap.appendChild(oeffnen);

  container.appendChild(wrap);

  // Vervollständigung und Existenz-Markierung kommen nach; das Feld ist ab
  // dem ersten Zeichenzug bedienbar, auch wenn der Index noch aufbaut.
  void ladeZiele(def, filePath).then((ziele) => {
    if (!wrap.isConnected) return;
    if (!readOnly && ziele.targets.length > 0) {
      const dl = baueDatalist(ziele.targets);
      wrap.appendChild(dl);
      input.setAttribute('list', dl.id);
    }
    setzeExistenz(marker, input.value, ziele);
    input.addEventListener('input', () => setzeExistenz(marker, input.value, ziele));
  });

  return input;
}

/**
 * Vervollständigung einer Chips-Leiste für ein Verweis-Feld im
 * Mehrfach-Modus. Die Leiste selbst baut das jeweilige Panel (sie trägt
 * dessen Speicher-Weg); hier kommt nur die Ziel-Liste dazu.
 *
 * @param {HTMLElement} list Die Chips-Leiste.
 * @param {HTMLInputElement} input Ihr Eingabe-Feld.
 * @param {object} opts { def, filePath }
 */
export function attachLinkSuggestions(list, input, opts) {
  const { def = null, filePath = null } = opts || {};
  void ladeZiele(def, filePath).then((ziele) => {
    if (!list.isConnected || ziele.targets.length === 0) return;
    const dl = baueDatalist(ziele.targets);
    list.appendChild(dl);
    input.setAttribute('list', dl.id);
  });
}

/**
 * 4T-1158 (Epic 3E-0219, E12): Hat ein Feld Auswahl-Charakter?
 *
 * Seit der Abfrage-Quelle genügt die feste Werte-Liste nicht mehr als
 * Kennzeichen: Ein Feld mit `valuesFrom.query` bekommt seinen Vorrat erst
 * nach der Auswertung und trägt bis dahin keine Werte — es ist trotzdem eine
 * Auswahl und braucht ihr Bedienelement. Die Notiz-Quelle (4T-1157) füllt
 * `values` bereits im Profil-Katalog und fällt deshalb schon unter den
 * ersten Teil der Bedingung.
 *
 * Im gemeinsamen Modul und nicht je Panel, weil sie in beiden dieselbe
 * Entscheidung trifft (Paritäts-Auflage, Konzept 7.3).
 */
export function hatAuswahl(def) {
  if (!def) return false;
  if (Array.isArray(def.values) && def.values.length > 0) return true;
  return !!(def.valuesFrom && def.valuesFrom.query);
}

// 4T-1158 (Epic 3E-0219, E12): Wertevorrat aus einer Abfrage. Er wird **hier**
// geholt und nicht beim Auflösen des Profils — genau darin steckt die Zusage
// «auf Verlangen»: Nur ein Feld, das sein Bedienelement bekommt, löst eine
// Auswertung aus. Ein Fehler ist ein leerer Vorrat, keine Ausnahme.
async function ladeAbfrageWerte(def, filePath) {
  const query = def && def.valuesFrom ? def.valuesFrom.query : null;
  if (!query || typeof api.profilesFieldValues !== 'function') return [];
  try {
    const antwort = await api.profilesFieldValues({ path: filePath || null, query });
    if (!antwort || !antwort.ok || antwort.status !== 'ready') return [];
    return Array.isArray(antwort.values) ? antwort.values : [];
  } catch {
    return [];
  }
}

/**
 * Wertevorrat aus einer Abfrage an ein Auswahl-Bedienelement hängen.
 *
 * Beide Formen bedient dieselbe Funktion: Ein Auswahl-Feld bekommt seine
 * Werte als Optionen nachgereicht, eine Chips-Leiste als Vorschlags-Liste.
 * Welche vorliegt, entscheidet das übergebene Element — die Panels bauen sie
 * ohnehin schon, hier kommt nur der Vorrat dazu.
 *
 * @param {HTMLElement} el Auswahl-Element (`select`) oder Chips-Leiste.
 * @param {object} opts { def, filePath, input } — `input` nur bei der Leiste.
 * @returns {Promise<string[]>} die geholten Werte (für den Prüf-Zugang).
 */
export function attachQueryValues(el, opts) {
  const { def = null, filePath = null, input = null } = opts || {};
  return ladeAbfrageWerte(def, filePath).then((werte) => {
    if (!el.isConnected || werte.length === 0) return werte;
    if (el.tagName === 'SELECT') {
      // Vor dem Sentinel «Eigener Wert…» einfügen, damit er letzter bleibt.
      const sentinel = el.querySelector('option[value="__custom__"]');
      for (const wert of werte) {
        if ([...el.options].some((o) => o.value === wert)) continue;
        const opt = document.createElement('option');
        opt.value = wert;
        opt.textContent = wert;
        el.insertBefore(opt, sentinel);
      }
      return werte;
    }
    if (!input) return werte;
    const dl = document.createElement('datalist');
    dl.id = `properties-query-values-${listenSeq++}`;
    for (const wert of werte) {
      const opt = document.createElement('option');
      opt.value = wert;
      dl.appendChild(opt);
    }
    el.appendChild(dl);
    input.setAttribute('list', dl.id);
    return werte;
  });
}

/**
 * Uhrzeit-Feld. Das native Zeit-Bedienelement des Browsers; der gespeicherte
 * Wert bleibt der Text `HH:MM` bzw. `HH:MM:SS`.
 */
export function renderTimeField(container, value, opts) {
  const { readOnly = false } = opts || {};
  const input = document.createElement('input');
  input.type = 'time';
  input.className = 'properties-field-value-input';
  input.value = typeof value === 'string' ? value.trim() : '';
  input.disabled = readOnly;
  // Sekunden nur zeigen, wenn der Ist-Wert welche trägt — sonst schöbe das
  // Bedienelement jedem Wert `:00` unter.
  if (/^\d{2}:\d{2}:\d{2}$/.test(input.value)) input.step = '1';
  container.appendChild(input);
  return input;
}

/**
 * Die Optionen von Zahl und Datum an ein bereits gebautes Eingabe-Element
 * legen. Eine nicht gesetzte Option lässt das Element unverändert.
 */
export function applyNumberOptions(input, def) {
  const o = (def && def.options) || {};
  if (typeof o.step === 'number') input.step = String(o.step);
  if (typeof o.min === 'number') input.min = String(o.min);
  if (typeof o.max === 'number') input.max = String(o.max);
}

// Datums-Option `shift`: Sie verschiebt den **Vorschlag** eines leeren
// Feldes, nicht einen vorhandenen Wert — ein gesetztes Datum still zu
// verrücken wäre eine Wert-Änderung ohne Zutun des Anwenders.
export function applyDateOptions(input, def) {
  const o = (def && def.options) || {};
  if (typeof o.shift !== 'number' || input.value !== '') return;
  const d = new Date();
  d.setDate(d.getDate() + o.shift);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
  input.placeholder = iso;
  input.dataset.shiftSuggestion = iso;
  // Beim ersten Fokus den verschobenen Tag vorbelegen; wer ihn nicht will,
  // überschreibt ihn wie jeden anderen Vorschlag.
  input.addEventListener(
    'focus',
    () => {
      if (input.value === '') input.value = iso;
    },
    { once: true },
  );
}

/**
 * Zyklus-Bedienelement einer Einfach-Auswahl (`options.control === 'cycle'`).
 * Ein Knopf, der beim Klick zum nächsten Wert des Vorrats schaltet; der
 * gespeicherte Wert ist derselbe wie ohne die Option — das ist die
 * tragende Zusage dieser Bedien-Option (Konzept 6.8).
 *
 * @returns {HTMLButtonElement} der Knopf; sein `dataset.value` trägt den Wert.
 */
export function renderCycleField(container, def, value, opts) {
  const { readOnly = false, onChange = null } = opts || {};
  const werte = Array.isArray(def && def.values) ? def.values.map((v) => String(v)) : [];
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'properties-field-value-cycle';
  const setze = (v) => {
    knopf.dataset.value = v;
    knopf.textContent = v === '' ? '—' : v;
  };
  setze(value == null ? '' : String(value));
  knopf.disabled = readOnly;
  knopf.title = t('properties.cycleHint');
  knopf.addEventListener('click', () => {
    // Der Leer-Wert gehört zum Zyklus: Ein Feld muss auch wieder leer
    // werden können, ohne den Typ zu wechseln.
    const folge = ['', ...werte];
    const jetzt = knopf.dataset.value || '';
    const idx = folge.indexOf(jetzt);
    setze(folge[(idx + 1) % folge.length]);
    if (typeof onChange === 'function') onChange(knopf.dataset.value);
  });
  container.appendChild(knopf);
  return knopf;
}
