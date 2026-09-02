// 4T-001156 (Epic 3E-000219, E11): Bedienelemente der Typen und Optionen aus dem
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
 * 4T-001158 (Epic 3E-000219, E12): Hat ein Feld Auswahl-Charakter?
 *
 * Seit der Abfrage-Quelle genügt die feste Werte-Liste nicht mehr als
 * Kennzeichen: Ein Feld mit `valuesFrom.query` bekommt seinen Vorrat erst
 * nach der Auswertung und trägt bis dahin keine Werte — es ist trotzdem eine
 * Auswahl und braucht ihr Bedienelement. Die Notiz-Quelle (4T-001157) füllt
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

// 4T-001158 (Epic 3E-000219, E12): Wertevorrat aus einer Abfrage. Er wird **hier**
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

// --- 4T-001185 (Epic 3E-000221, E1): abgeleitete Felder ---------------------------

// Marke eines abgeleiteten Feldes am DOM. Sie steht hier und nicht als
// Zeichenkette in den Schreibwegen, damit Setzen und Auswerten dieselbe Quelle
// haben — dasselbe Muster wie MARKE_NICHT_IM_DOKUMENT beim Feld-Formular.
export const MARKE_ABGELEITET = 'is-abgeleitet';

/**
 * Eine fertig gebaute Feld-Zeile als abgeleitet kennzeichnen und sperren.
 *
 * **Eine Funktion für beide Panels**, weil die Sperre in beiden dieselbe
 * Zusage einlöst (AK4 der Story: in beiden Editoren nicht bearbeitbar). Sie
 * arbeitet auf dem gebauten DOM statt im Bau selbst, weil die beiden Panels
 * ihre Zeilen verschieden bauen, aber dieselben Klassen tragen — dasselbe
 * Mittel, mit dem `applyNumberOptions` die Optionen nachträglich anlegt.
 *
 * **Der Löschen-Knopf verschwindet ganz**, statt gesperrt zu werden: Ein
 * abgeleitetes Feld steht nicht in der Datei, es gibt dort also nichts zu
 * löschen. Ein grauer Knopf verspräche eine Handlung, die es nicht gibt.
 */
export function sperreAbgeleitetesFeld(wrap) {
  if (!wrap) return;
  wrap.classList.add(MARKE_ABGELEITET);
  const keyInput = wrap.querySelector('.properties-field-key');
  if (keyInput) {
    keyInput.disabled = true;
    keyInput.title = t('properties.derivedComputed');
    // Der Feldname als Attribut an der Zeile. Der Wert des Eingabe-Feldes ist
    // eine DOM-Property und kein Attribut — von außen (CSS, Prüfung) ist eine
    // Zeile darüber nicht ansprechbar, und die beiden Panels vergeben ihre
    // übrigen Kennzeichen verschieden. Hier steht die eine, die beide teilen.
    if (keyInput.value) wrap.dataset.abgeleitetFeld = keyInput.value;
  }
  const typeSelect = wrap.querySelector('.properties-field-type');
  if (typeSelect) {
    typeSelect.disabled = true;
    typeSelect.title = t('properties.derivedComputed');
  }
  const delBtn = wrap.querySelector('.properties-field-delete');
  if (delBtn) delBtn.remove();
}

/**
 * Trägt diese Feld-Zeile ein abgeleitetes Feld?
 *
 * Die Frage stellen beide Schreibwege, und sie beantworten sie mit einem
 * unbedingten «dann bleibt es draußen» — anders als beim Feld-Formular gibt es
 * hier keinen Fall, in dem der Wert doch in die Datei gehört.
 */
export function istAbgeleitetesFeld(fieldEl) {
  return !!fieldEl && fieldEl.classList.contains(MARKE_ABGELEITET);
}

/**
 * Ein abgeleitetes Feld anzeigen: der errechnete Wert, nur lesend.
 *
 * **Kein Bedienelement, sondern eine Anzeige.** Ein abgeleitetes Feld hat
 * keinen eigenen Wert, den man ändern könnte; es zeigt, was gerade gilt. Der
 * Rückfall `readonly` des Editors wäre die naheliegende Vorlage, sagt aber das
 * Falsche: Er heißt «nicht darstellbar», hier gilt «wird gerechnet».
 *
 * Ein Hinweis (Kreis, Bezug ins Leere, fehlende Rechenvorschrift) ersetzt den
 * Wert nicht, sondern begleitet den leeren Wert — die weiche Linie aus E10.
 *
 * @param {HTMLElement} container Wert-Zelle der Feld-Zeile.
 * @param {*} wert Der errechnete Wert, oder null.
 * @param {object} opts { hinweis } — Hinweis-Code aus DERIVED_HINTS oder null.
 * @returns {HTMLElement} das Anzeige-Element (Nachreichen des Lookup-Werts).
 */
export function renderAbgeleitetesFeld(container, wert, opts) {
  const { hinweis = null } = opts || {};
  const el = document.createElement('div');
  el.className = 'properties-field-abgeleitet';
  setzeAbgeleitetenWert(el, wert, hinweis);
  container.appendChild(el);
  return el;
}

/**
 * Wert und Hinweis eines abgeleiteten Anzeige-Elements setzen.
 *
 * Eigene Funktion, weil der Lookup-Wert nachkommt: Er entsteht erst, wenn das
 * Feld sichtbar ist (Konzept 6.11), und wird dann in dasselbe Element
 * geschrieben, statt die Zeile neu zu bauen.
 */
export function setzeAbgeleitetenWert(el, wert, hinweis) {
  if (!el) return;
  const leer = wert === null || wert === undefined || wert === '';
  const text = Array.isArray(wert) ? wert.join(', ') : leer ? '' : String(wert);
  el.textContent = text;
  el.classList.toggle('is-leer', text === '');
  if (hinweis) {
    el.dataset.hinweis = hinweis;
    el.title = t('properties.derivedHint.' + hinweis);
  } else {
    delete el.dataset.hinweis;
    el.title = t('properties.derivedComputed');
  }
}

// 4T-001184/4T-001185: Treffer eines Lookup-Feldes. Sie werden **hier** geholt und
// nicht beim Auflösen des Profils — genau darin steckt die Zusage «nur
// auswerten, wenn sichtbar» aus Konzept 6.11. Ein Fehler ist ein leeres
// Ergebnis mit Hinweis, keine Ausnahme.
async function ladeLookupTreffer(def, filePath) {
  const options = (def && def.options) || {};
  if (!options.relatedField || typeof api.profilesLookup !== 'function') return null;
  try {
    const antwort = await api.profilesLookup({ path: filePath || null, options });
    if (!antwort || !antwort.ok || antwort.status !== 'ready') return null;
    return Array.isArray(antwort.values) ? antwort.values : null;
  } catch {
    return null;
  }
}

/**
 * Die Treffer eines Lookup-Feldes an sein Anzeige-Element nachreichen.
 *
 * @param {HTMLElement} el Element aus `renderAbgeleitetesFeld`.
 * @param {object} opts { def, filePath }.
 * @returns {Promise<string[]|null>} die geholten Werte (für den Prüf-Zugang).
 */
export function attachLookupWerte(el, opts) {
  const { def = null, filePath = null } = opts || {};
  return ladeLookupTreffer(def, filePath).then((werte) => {
    if (!el.isConnected) return werte;
    if (werte === null) {
      // Keine Aussage möglich: leer mit Hinweis, statt «keine Treffer» zu
      // behaupten. Der Unterschied ist für den Anwender wesentlich.
      setzeAbgeleitetenWert(el, null, 'derivedUnavailable');
      return werte;
    }
    setzeAbgeleitetenWert(el, werte, null);
    return werte;
  });
}
