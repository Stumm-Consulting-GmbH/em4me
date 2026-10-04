// 4T-001713 (Epic 3E-000300): Die Vorschlagsliste am Eingabefeld einer
// Tabellenzelle der Live-Ansicht — Anzeige, Tasten und Übernahme.
//
// **Warum eine eigene Liste.** Die Vervollständigung des Editors ist eine
// Erweiterung von CodeMirror und erreicht das native Eingabefeld der Zelle
// nicht. Entschieden ist Weg B (`4T-001710`, Lösungs-Kapitel Punkt 5): Das
// abgenommene Feld bleibt, und diese Liste daneben befragt dieselben Quellen
// über einen gedachten Quelltext-Stand (`live-table-suggestion-core.js`).
// Einträge, Reihenfolge und eingefügter Text kommen damit aus den Quellen; hier
// wird allein nachgebildet, was die Bibliothek um sie herum tut — Aufbau der
// Liste mit ihren Stil-Klassen, dieselben Tasten, dieselben Anlässe zum Öffnen
// und Schließen.
//
// **Vorrang vor der Tabellen-Navigation.** Solange die Liste offen ist, gehören
// ihr Pfeile hoch und runter, Bild-Tasten, Eingabetaste und Escape; die
// Zell-Bedienung sieht diese Tasten dann nicht. Ist sie zu, läuft jeder
// Tastendruck unverändert durch. Der Tabulator ist in der Liste des Editors
// nicht belegt und bleibt es hier: Er schließt die Liste und wirkt wie immer.
//
// **Wo die Liste hängt.** Im Editor, aber außerhalb des Tabellen-Widgets: Das
// Widget wird beim Betreten und Verlassen seiner Zeile neu aufgebaut
// (gemessen in `4T-001710`), und eine Tabelle schneidet ab, was über ihren Rand
// ragt. Als Kind des Editors erbt sie dessen Gestaltung der Vorschlagsliste.
'use strict';

import {
  applySuggestion,
  collectOptions,
  imaginedState,
  querySources,
  rawOffset,
} from './live-table-suggestion-core.js';

// Die Zell-Eingabe, an der die Liste gerade hängen kann: das Feld und die
// Frage nach Editor, Zell-Bereich und Zelle. Es gibt app-weit höchstens eine.
let current = null;
// Die offene Liste, oder `null`.
let open = null;
// Jede Anfrage bekommt eine Nummer; eine Antwort, die nicht mehr die jüngste
// ist, wird verworfen — die Quellen fragen den Index asynchron.
let generation = 0;

const LIST_ID = 'cm-live-tabelle-vorschlaege-liste';

// Die Quellen leben im Editor-Ordner, der über seinen Editor den Ordner der
// Live-Ansicht lädt. Ein statischer Bezug schlösse den Kreis zwischen beiden
// Ordnern (Wächter `ordner-import-zyklen`); der Zugriff zur Laufzeit ist dort
// der vorgesehene Weg, und die Quellen sind ohnehin asynchron.
async function loadSources() {
  const modul = await import('../editor/autocomplete-help.js');
  return modul.AUTOCOMPLETE_SOURCES;
}

/**
 * Verbindet ein frisch geöffnetes Zell-Eingabefeld mit der Vorschlagsliste.
 *
 * @param {HTMLInputElement} input das Eingabefeld der Zelle.
 * @param {() => ({view: object, state?: object, range: {from: number, to: number}, cell: HTMLElement}|null)} locate
 *   liefert Editor, Inhalts-Bereich der Zelle im Dokument und Zell-Element,
 *   oder `null`, wenn die Zelle nicht zweifelsfrei im Dokument steht.
 *   4T-001987: Das optionale `state` ersetzt den Stand des Editors als
 *   Grundstand des gedachten Quelltexts; `range` bezieht sich dann auf ihn.
 *   Die Datentabelle liefert so eine gedachte Zeile, weil ihre Zelle während
 *   der Bearbeitung keinen stabilen Bereich im Dokument hat. Der Editor bleibt
 *   `view`, denn über ihn finden die Quellen die geöffnete Datei.
 */
export function attachCellSuggestions(input, locate) {
  closeCellSuggestions();
  current = { input, locate };
  input.setAttribute('aria-autocomplete', 'list');
  input.addEventListener('input', (event) => onInput(input, event));
  input.addEventListener('blur', () => {
    if (current && current.input === input) closeCellSuggestions();
  });
  // Ein Klick in das Feld setzt die Schreibmarke neu; wie im Editor schließt
  // das die Liste.
  input.addEventListener('mousedown', () => {
    if (current && current.input === input) closeCellSuggestions();
  });
}

// Welche Eingabe öffnet oder schließt die Liste? Dieselbe Einteilung wie in
// der Bibliothek: Tippen fragt die Quellen, das Löschen nach links fragt bei
// offener Liste neu und schließt sie, sobald die Schreibmarke vor den Anfang
// der ersetzten Stelle rückt; jede andere Änderung schließt.
function onInput(input, event) {
  if (!current || current.input !== input) return;
  const art = String(event.inputType || '');
  if (art === 'insertText' || art === 'insertCompositionText' || art === 'insertReplacementText') {
    void refresh(false);
    return;
  }
  if (art === 'deleteContentBackward' && open) {
    const caret = input.selectionStart ?? input.value.length;
    if (caret < open.fieldFrom) {
      closeCellSuggestions();
      return;
    }
    void refresh(open.explicit);
    return;
  }
  closeCellSuggestions();
}

// Fragt die Quellen am jetzigen Feld-Inhalt und zeigt, was sie liefern.
async function refresh(explicit) {
  if (!current) return;
  const { input, locate } = current;
  const lage = locate();
  if (!lage) {
    closeCellSuggestions();
    return;
  }
  const mine = ++generation;
  const raw = String(input.value);
  const caret = input.selectionStart ?? raw.length;
  const stand = imaginedState(lage.state || lage.view.state, lage.range, raw, caret);
  // Solange die Quellen fragen, ist das Feld «beschäftigt» — für Hilfsmittel
  // der Barrierefreiheit wie für die Ablauf-Prüfung, die sonst nicht wüsste,
  // wann eine ausgebliebene Liste wirklich ausgeblieben ist.
  input.setAttribute('aria-busy', 'true');
  const sources = await loadSources();
  const results = await querySources(sources, stand, explicit, lage.view);
  if (mine !== generation || !current || current.input !== input || !input.isConnected) return;
  input.removeAttribute('aria-busy');
  const options = collectOptions(results, stand);
  if (options.length === 0) {
    closeCellSuggestions();
    return;
  }
  // Wo die ersetzte Stelle im Feld beginnt: Das Löschen nach links schließt
  // die Liste, sobald die Schreibmarke davor steht.
  const fieldFrom = rawOffset(raw, options[0].from - stand.cellFrom);
  show(lage, options, explicit, fieldFrom);
}

// --- Anzeige ------------------------------------------------------------------

// Eine Zeile der Liste, im Aufbau der Bibliothek: Symbol, Beschriftung mit
// hervorgehobener Fundstelle, Zusatztext. Dieselben Klassen tragen dieselbe
// Gestaltung.
function buildOption(option, index) {
  const { completion, match } = option;
  const li = document.createElement('li');
  li.id = `${LIST_ID}-${index}`;
  li.setAttribute('role', 'option');
  const icon = document.createElement('div');
  icon.className =
    'cm-completionIcon' +
    (completion.type
      ? ' ' +
        String(completion.type)
          .split(/\s+/g)
          .map((cls) => 'cm-completionIcon-' + cls)
          .join(' ')
      : '');
  icon.setAttribute('aria-hidden', 'true');
  li.appendChild(icon);
  const label = document.createElement('span');
  label.className = 'cm-completionLabel';
  const text = String(completion.displayLabel || completion.label);
  let off = 0;
  for (let j = 0; j + 1 < match.length; j += 2) {
    const from = match[j];
    const to = match[j + 1];
    if (from > off) label.appendChild(document.createTextNode(text.slice(off, from)));
    const span = document.createElement('span');
    span.className = 'cm-completionMatchedText';
    span.textContent = text.slice(from, to);
    label.appendChild(span);
    off = to;
  }
  if (off < text.length) label.appendChild(document.createTextNode(text.slice(off)));
  li.appendChild(label);
  if (completion.detail) {
    const detail = document.createElement('span');
    detail.className = 'cm-completionDetail';
    detail.textContent = completion.detail;
    li.appendChild(detail);
  }
  return li;
}

function show(lage, options, explicit, fieldFrom) {
  const input = current.input;
  if (!open) {
    const dom = document.createElement('div');
    dom.className = 'cm-tooltip cm-tooltip-autocomplete cm-live-tabelle-vorschlaege';
    const list = document.createElement('ul');
    list.id = LIST_ID;
    list.setAttribute('role', 'listbox');
    dom.appendChild(list);
    // Ein Klick auf einen Eintrag übernimmt ihn; das Feld behält den Fokus,
    // damit die Zell-Eingabe nicht als verlassen gilt.
    dom.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const li =
        event.target && event.target.closest ? event.target.closest('li[role=option]') : null;
      if (!li || !open) return;
      const index = Number(li.id.slice(LIST_ID.length + 1));
      if (Number.isInteger(index)) accept(index);
    });
    const reposition = () => place();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    open = { dom, list, reposition, options: [], selected: 0, explicit, fieldFrom, lage };
    lage.view.dom.appendChild(dom);
  }
  open.options = options;
  open.selected = 0;
  open.explicit = explicit;
  open.fieldFrom = fieldFrom;
  open.lage = lage;
  open.list.textContent = '';
  options.forEach((option, index) => open.list.appendChild(buildOption(option, index)));
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', LIST_ID);
  markSelected();
  place();
}

// Unter der Zelle, links an ihr ausgerichtet; reicht der Platz darunter nicht,
// darüber. Die Liste bleibt im Fenster, auch an der letzten Spalte. Die Stelle
// wird nach dem Setzen nachgemessen, weil ein Vorfahre mit eigener
// Transformation den Bezug fester Positionen verschöbe.
function place() {
  if (!open) return;
  const cell = open.lage.cell;
  if (!cell || !cell.isConnected) {
    closeCellSuggestions();
    return;
  }
  const { dom } = open;
  const rect = cell.getBoundingClientRect();
  dom.style.position = 'fixed';
  dom.style.left = '0px';
  dom.style.top = '0px';
  const origin = dom.getBoundingClientRect();
  const width = origin.width;
  const height = origin.height;
  const innerW = document.documentElement.clientWidth || window.innerWidth;
  const innerH = document.documentElement.clientHeight || window.innerHeight;
  let left = Math.min(rect.left, innerW - width - 4);
  left = Math.max(0, left);
  let top = rect.bottom + 2;
  if (top + height > innerH && rect.top - height - 2 >= 0) top = rect.top - height - 2;
  dom.style.left = `${left - origin.left}px`;
  dom.style.top = `${top - origin.top}px`;
}

function markSelected() {
  const items = open.list.children;
  for (let i = 0; i < items.length; i++) {
    if (i === open.selected) items[i].setAttribute('aria-selected', 'true');
    else items[i].removeAttribute('aria-selected');
  }
  const chosen = items[open.selected];
  if (chosen) {
    current.input.setAttribute('aria-activedescendant', chosen.id);
    if (chosen.scrollIntoView) chosen.scrollIntoView({ block: 'nearest' });
  }
}

/** Schließt die Liste, falls eine offen ist; eine laufende Anfrage verfällt. */
export function closeCellSuggestions() {
  generation++;
  if (current && current.input) {
    current.input.removeAttribute('aria-busy');
    current.input.removeAttribute('aria-expanded');
    current.input.removeAttribute('aria-activedescendant');
    current.input.removeAttribute('aria-controls');
  }
  if (!open) return;
  window.removeEventListener('scroll', open.reposition, true);
  window.removeEventListener('resize', open.reposition);
  open.dom.remove();
  open = null;
}

// --- Tasten und Übernahme -------------------------------------------------------

// Auswahl bewegen wie `moveCompletionSelection` der Bibliothek: einzeln mit
// Umlauf am Ende, seitenweise mit Anschlag.
function move(forward, page) {
  const length = open.options.length;
  let step = 1;
  if (page) {
    const first = open.list.querySelector('li');
    const hoehe = first ? first.offsetHeight : 0;
    step = hoehe > 0 ? Math.max(2, Math.floor(open.dom.offsetHeight / hoehe) - 1) : 2;
  }
  let selected = open.selected + step * (forward ? 1 : -1);
  if (selected < 0) selected = page ? 0 : length - 1;
  else if (selected >= length) selected = page ? length - 1 : 0;
  open.selected = selected;
  markSelected();
}

function accept(index) {
  if (!open || !current) return;
  const option = open.options[index];
  const { input } = current;
  const lage = current.locate();
  closeCellSuggestions();
  if (!option || !lage) return;
  const raw = String(input.value);
  const caret = input.selectionStart ?? raw.length;
  const stand = imaginedState(lage.state || lage.view.state, lage.range, raw, caret);
  const neu = applySuggestion(stand, raw, option);
  if (!neu) return;
  input.value = neu.value;
  input.setSelectionRange(neu.caret, neu.caret);
}

/**
 * Tastendruck im Zell-Eingabefeld, bevor die Zell-Bedienung ihn sieht.
 *
 * @param {KeyboardEvent} event
 * @returns {boolean} `true`, wenn die Liste den Tastendruck verbraucht hat.
 */
export function handleCellSuggestionKey(event) {
  if (!current || event.target !== current.input) return false;
  const modifiers = event.ctrlKey || event.altKey || event.metaKey || event.shiftKey;
  const consume = () => {
    event.preventDefault();
    event.stopPropagation();
    return true;
  };
  // Strg+Leertaste öffnet ausdrücklich, auch bei geschlossener Liste.
  if (event.key === ' ' && event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
    void refresh(true);
    return consume();
  }
  if (!open) return false;
  if (!modifiers) {
    const wirkung = {
      ArrowDown: () => move(true, false),
      ArrowUp: () => move(false, false),
      PageDown: () => move(true, true),
      PageUp: () => move(false, true),
      Enter: () => accept(open.selected),
      Escape: () => closeCellSuggestions(),
    }[event.key];
    if (wirkung) {
      wirkung();
      return consume();
    }
  }
  // Alles, was die Schreibmarke bewegt oder die Zelle verlässt, schließt die
  // Liste und wirkt danach wie immer — auch der Tabulator.
  if (['Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    closeCellSuggestions();
  }
  return false;
}
