// 4T-001874 (Epic 3E-000323): Der Dialog «Datum umrechnen».
//
// **Was er zeigt:** einen Zeitpunkt einer Zeitrechnung und darunter dieselbe
// Stelle in jeder weiteren Zeitrechnung desselben Blocks. Die Zeilen stellt
// `blockEquivalents` des gemeinsamen Moduls zusammen; dieser Dialog rechnet
// nicht selbst. Eine Zeile mit Ergebnis ist ein Knopf und macht ihre
// Zeitrechnung zum Ausgangspunkt, eine ohne Ergebnis ist Text mit Auskunft.
//
// **Was er schreibt** (4T-002097): Jede Zeile mit Ergebnis trägt «Kopieren»
// (Zwischenablage über die Brücke wie «Kopieren» im Editor-Kontextmenü) und
// «Einfügen». Beide geben das Kalender-Datum in der Form des Dokuments weiter,
// `@{Name: kanonischer Wert}` — dieselbe Form wie «Kalender-Datum einfügen»
// (`resultToSource` der Eingabe-Hilfe). Den Editor kennt der Dialog nicht: Er
// ruft beim Einfügen einen hereingereichten Rückruf; fehlt der, ist die Taste
// sichtbar deaktiviert. In eine Definition schreibt er nie. Deshalb ist er auch
// in der Lese-Ansicht und ohne geöffnetes Dokument verfügbar.
//
// **Vorbelegung** aus der Auswahl eines Editors (`calendarPrefillFromSelection`):
// ein berührtes Kalender-Datum, sonst einzeiliger Text als kanonischer Wert,
// sonst nichts. Den Editor-Teil trägt der gemeinsame Weg `openCalendarConvertAt`.
//
// **Gelesen und geschrieben wie das Abzeichen** (`calendarValueBadgeSpec` in
// src/shared/markdown/plugins/calendar.js): Das Feld «Datum» nimmt die
// kanonische Schreibweise und wird mit `parseCanonical` gelesen; eine Zeile
// zeigt bei einer gewöhnlichen Zeitrechnung den Wert mit Namen
// (`formatTuple(…, { named: true })`), bei einer Ableitung den kanonischen
// Wert, den auch der Kurzhinweis des Abzeichens trägt.
//
// **Bauform** nach dem Dialog «Einstellungen dieser Tafel…»
// (kanban-einstellungs-dialog.js): zur Laufzeit gebaut, mit den Klassen der
// festen Dialoge und damit demselben Aussehen und Schließ-Verhalten (Escape,
// Hintergrund, Knopf). Der Tabulator bleibt im Dialog wie in der
// Bild-Vergrößerung (image-lightbox.js). Übersetzung und Eingabe-Hilfe kommen
// wie bei den Nachbarn dieses Ordners als Import herein.
'use strict';

import { t } from '../../i18n.js';
import {
  convertBetween,
  findCalendarByName,
  findCalendarValues,
  formatTuple,
  parseCanonical,
} from '../../../shared/calendar/calendar-core.js';
import { blockEquivalents, EQUIVALENT_UNKNOWN } from '../../../shared/calendar/calendar-convert.js';
import { api } from '../app/api.js';
// Schreibweg und Dokument-Form eines Kalender-Datums kommen von der
// Eingabe-Hilfe, damit «Einfügen» hier dasselbe schreibt wie dort.
import { applyResult, resultToSource, showCalendarPicker } from './calendar-picker.js';
// Renderer-Zustand der Konfiguration des Bereichs — dieselbe Quelle, aus der
// die Eingabe-Hilfe beim Einfügen liest (openCalendarPickerAtSelection).
import { getAreaCalendarConfig } from './calendar-config.js';

// Dauer der Bestätigung «Kopiert» (Muster des Kopier-Knopfs der Code-Blöcke in
// render-mermaid.js).
const COPIED_MS = 1500;

/**
 * Der Wert `@{Name: Wert}`, in dem eine Stelle einer Zeile steht. Die Stelle
 * zählt auch unmittelbar vor `@` und unmittelbar nach `}` als «im Wert», damit
 * ein Cursor am Rand des Werts ihn trifft.
 *
 * @param {string} text Zeilen-Text.
 * @param {number} offset Stelle in der Zeile (0 = vor dem ersten Zeichen).
 * @returns {{calendarName: string, value: string}|null}
 */
export function calendarValueAt(text, offset) {
  for (const v of findCalendarValues(text)) {
    if (offset >= v.from && offset <= v.to) return { calendarName: v.name, value: v.value };
  }
  return null;
}

/**
 * Vorbelegung des Dialogs aus dem Cursor eines Editors: Name und Wert des
 * Kalender-Werts unter dem Cursor, sonst ein leeres Objekt.
 *
 * @param {object|null} view CodeMirror-EditorView oder null.
 * @returns {{calendarName?: string, value?: string}}
 */
export function calendarValueAtCursor(view) {
  if (!view || !view.state) return {};
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  return calendarValueAt(line.text, head - line.from) || {};
}

// Die Blöcke, die mindestens eine Zeitrechnung tragen, in ihrer Reihenfolge.
function calendarBlocks(config) {
  return config && Array.isArray(config.blocks)
    ? config.blocks.filter((b) => Array.isArray(b.calendars) && b.calendars.length > 0)
    : [];
}

// Der erste Wert `@{Name: Wert}`, den der Bereich [from, to] eines Dokuments
// berührt; die Ränder zählen mit wie bei `calendarValueAt`, ohne Auswahl ist das
// also genau der Wert unter dem Cursor.
function calendarValueInRange(doc, from, to) {
  const last = doc.lineAt(to).number;
  for (let n = doc.lineAt(from).number; n <= last; n++) {
    const line = doc.line(n);
    for (const v of findCalendarValues(line.text)) {
      if (line.from + v.from <= to && line.from + v.to >= from) {
        return { calendarName: v.name, value: v.value };
      }
    }
  }
  return null;
}

/**
 * Vorbelegung des Dialogs aus der Haupt-Auswahl eines Editor-Zustands
 * (4T-002097, Reihenfolge nach Abschnitt 1 des Vorgangs): (1) das erste
 * Kalender-Datum, das die Auswahl berührt — ohne Auswahl das unter dem Cursor;
 * (2) sonst einzeiliger Text, nach dem Beschneiden nicht leer, als kanonischer
 * Wert der ersten Zeitrechnung in Block-Reihenfolge, die ihn annimmt, und
 * ohne solche der ersten Zeitrechnung überhaupt (der Dialog meldet ihn dann
 * als ungültig); (3) sonst nichts. Andere Schreibweisen werden nicht gedeutet.
 *
 * @param {object|null} state CodeMirror-EditorState oder null.
 * @param {object|null} config normalisierte calendarSystems-Konfiguration.
 * @returns {{calendarName?: string, value?: string}}
 */
export function calendarPrefillFromSelection(state, config) {
  if (!state || !state.doc) return {};
  const { from, to } = state.selection.main;
  const touched = calendarValueInRange(state.doc, from, to);
  if (touched) return touched;
  const text = from === to ? '' : state.sliceDoc(from, to).trim();
  // Ein Zeilenumbruch nach dem Beschneiden heißt: mehrzeilige Auswahl.
  if (text === '' || /[\r\n]/.test(text)) return {};
  const blocks = calendarBlocks(config);
  if (blocks.length === 0) return {};
  for (const block of blocks) {
    for (const calendar of block.calendars) {
      if (parseCanonical(calendar, text).ok) return { calendarName: calendar.name, value: text };
    }
  }
  return { calendarName: blocks[0].calendars[0].name, value: text };
}

/**
 * Wohin «Einfügen» schreibt, aus dem Zustand zum Zeitpunkt des Einfügens: eine
 * Auswahl wird ersetzt — erweitert um jedes Kalender-Datum, das sie nur
 * teilweise erfasst, damit kein zerrissenes oder verschachteltes `@{…}`
 * entsteht; ohne Auswahl wird an der Schreibmarke eingefügt, steht sie aber
 * echt im Inneren eines Kalender-Datums, hinter diesem mit einem Leerzeichen
 * davor. An seinen Außen-Rändern zählt sie nicht als «im Datum».
 *
 * @param {object} state CodeMirror-EditorState.
 * @returns {{from: number, to: number, prefix: string}}
 */
export function calendarInsertTarget(state) {
  const { from, to, head } = state.selection.main;
  if (from !== to) {
    // Vereinigung aus Auswahl und jedem Kalender-Datum, das sie echt überlappt;
    // ein Datum, das nur an einem Rand anstößt, bleibt unberührt.
    let start = from;
    let end = to;
    const last = state.doc.lineAt(to).number;
    for (let n = state.doc.lineAt(from).number; n <= last; n++) {
      const line = state.doc.line(n);
      for (const v of findCalendarValues(line.text)) {
        if (line.from + v.from < to && line.from + v.to > from) {
          start = Math.min(start, line.from + v.from);
          end = Math.max(end, line.from + v.to);
        }
      }
    }
    return { from: start, to: end, prefix: '' };
  }
  const line = state.doc.lineAt(head);
  const offset = head - line.from;
  for (const v of findCalendarValues(line.text)) {
    if (offset > v.from && offset < v.to) {
      return { from: line.from + v.to, to: line.from + v.to, prefix: ' ' };
    }
  }
  return { from: head, to: head, prefix: '' };
}

// Die Dokument-Form einer Zeile, für «Kopieren» und «Einfügen» dieselbe.
function rowSource(calendar, tuple) {
  return resultToSource({ calendarName: calendar.name, text: formatTuple(calendar, tuple) });
}

// «Kopieren»: Zwischenablage über die Brücke des Hauptprozesses (Muster
// copySelection im Editor-Kontextmenü: synchron, ohne Berechtigungs-Abfrage
// und ohne Fokus-Verlust). Schlägt das Schreiben fehl, gibt es keine
// Bestätigung, nur den Eintrag im Protokoll (Muster des Kopier-Knopfs der
// Code-Blöcke in render-mermaid.js).
function copyToClipboard(button, text, timers) {
  try {
    api.clipboardWriteText(text);
  } catch (err) {
    console.warn('[4T-002097] Datum umrechnen: Kopieren in die Zwischenablage fehlgeschlagen', err);
    return;
  }
  clearTimeout(timers.get(button));
  button.textContent = t('calendarConvert.copied');
  timers.set(
    button,
    setTimeout(() => {
      timers.delete(button);
      button.textContent = t('calendarConvert.copy');
    }, COPIED_MS),
  );
}

// Anzeige-Wert einer Zeile: mit Namen bei einer gewöhnlichen Zeitrechnung,
// kanonisch bei einer Ableitung (wie Abzeichen und Kurzhinweis).
function shownValue(calendar, tuple) {
  return formatTuple(calendar, tuple, { named: !calendar.derived });
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function fillSelect(select, entries, value) {
  select.innerHTML = '';
  for (const entry of entries) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.name;
    select.appendChild(option);
  }
  select.value = value;
}

function labelledRow(labelKey, id, ...controls) {
  const row = element('div', 'settings-row calendar-convert-row');
  const label = element('label', null, t(labelKey));
  label.htmlFor = id;
  row.append(label, ...controls);
  return row;
}

// Ausgangslage: Vorbelegung aus Name und Wert, sonst erster Block mit
// Zeitrechnung, dessen erste Zeitrechnung und ihr Anker-Zeitpunkt.
function initialState(blocks, config, calendarName, value) {
  const found = calendarName ? findCalendarByName(config, calendarName) : null;
  if (found) {
    const text =
      typeof value === 'string' && value.trim() !== ''
        ? value.trim()
        : formatTuple(found.calendar, found.calendar.blockAnchor) || '';
    return { block: found.block, calendar: found.calendar, text };
  }
  const block = blocks[0];
  const calendar = block.calendars[0];
  return { block, calendar, text: formatTuple(calendar, calendar.blockAnchor) || '' };
}

// Ein geöffneter Dialog zur Zeit; ein zweiter Aufruf schließt den ersten.
let openClose = null;

/**
 * Öffnet den Dialog «Datum umrechnen».
 *
 * @param {object} options
 * @param {object} options.config normalisierte calendarSystems-Konfiguration
 *   des Bereichs.
 * @param {string} [options.calendarName] Vorbelegung: Name der Zeitrechnung.
 * @param {string} [options.value] Vorbelegung: kanonischer Wert, auch ungültig.
 * @param {(sourceText: string) => void} [options.onInsert] schreibt
 *   `@{Name: Wert}` in einen Editor; der Dialog schließt vorher. Ohne ihn ist
 *   «Einfügen» deaktiviert.
 * @returns {Promise<void>} löst beim Schließen auf; sofort, wenn die
 *   Konfiguration keine Zeitrechnung trägt.
 */
export function showCalendarConvertDialog(options = {}) {
  const config = options.config;
  const blocks = calendarBlocks(config);
  if (blocks.length === 0) return Promise.resolve();
  if (openClose) openClose();

  const state = initialState(blocks, config, options.calendarName, options.value);
  const onInsert = typeof options.onInsert === 'function' ? options.onInsert : null;
  // Laufende Bestätigungen «Kopiert» je Knopf; das Schließen räumt sie ab.
  const copyTimers = new Map();
  // Wird beim Öffnen gesetzt; «Einfügen» schließt den Dialog vor dem Schreiben.
  let closeDialog = null;

  const modal = element('div', 'bookmark-modal calendar-convert-modal');
  const backdrop = element('div', 'bookmark-modal-backdrop');
  const content = element('div', 'bookmark-modal-content calendar-convert-content');
  content.setAttribute('role', 'dialog');
  content.setAttribute('aria-modal', 'true');
  content.setAttribute('aria-labelledby', 'calendar-convert-title');
  const title = element('h2', null, t('calendarConvert.title'));
  title.id = 'calendar-convert-title';
  content.appendChild(title);

  // Block: nur bei mehr als einem Block mit Zeitrechnungen.
  const blockSelect = element('select', 'settings-input');
  blockSelect.id = 'calendar-convert-block';
  if (blocks.length > 1) {
    fillSelect(blockSelect, blocks, state.block.id);
    content.appendChild(labelledRow('calendarConvert.block', blockSelect.id, blockSelect));
  }

  const calendarSelect = element('select', 'settings-input');
  calendarSelect.id = 'calendar-convert-calendar';
  content.appendChild(labelledRow('calendarConvert.calendar', calendarSelect.id, calendarSelect));

  const dateInput = element('input', 'settings-input');
  dateInput.type = 'text';
  dateInput.id = 'calendar-convert-date';
  dateInput.spellcheck = false;
  dateInput.setAttribute('aria-describedby', 'calendar-convert-invalid');
  const pickButton = element('button', 'btn', t('calendarConvert.pick'));
  pickButton.type = 'button';
  pickButton.id = 'calendar-convert-pick';
  content.appendChild(labelledRow('calendarConvert.date', dateInput.id, dateInput, pickButton));

  const invalid = element('p', 'name-input-error');
  invalid.id = 'calendar-convert-invalid';
  invalid.setAttribute('aria-live', 'polite');
  invalid.hidden = true;
  content.appendChild(invalid);

  const listHead = element('div', 'calendar-picker-conv-head', t('calendarConvert.equivalents'));
  listHead.id = 'calendar-convert-list-head';
  const list = element('div', 'calendar-convert-list');
  list.id = 'calendar-convert-list';
  list.setAttribute('role', 'group');
  list.setAttribute('aria-labelledby', listHead.id);
  content.append(listHead, list);
  // Der Grund für das deaktivierte «Einfügen», für Screenreader an jeder Taste
  // über aria-describedby, für die Maus im Kurzhinweis.
  let insertReason = null;
  if (!onInsert) {
    insertReason = element('span', null, t('calendarConvert.insertUnavailable'));
    insertReason.id = 'calendar-convert-insert-reason';
    insertReason.hidden = true;
    content.appendChild(insertReason);
  }
  content.appendChild(element('p', 'calendar-convert-hint', t('calendarConvert.blockHint')));

  const buttons = element('div', 'bookmark-modal-buttons');
  const closeButton = element('button', 'btn btn-primary', t('calendarConvert.close'));
  closeButton.type = 'button';
  closeButton.id = 'calendar-convert-close';
  buttons.appendChild(closeButton);
  content.appendChild(buttons);
  modal.append(backdrop, content);

  // Zeitrechnung wechseln und den Zeitpunkt in ihr ausdrücken; ohne
  // Ergebnis (ungültiges Datum oder nicht darstellbar) ihr Anker.
  const switchCalendar = (next) => {
    const parsed = parseCanonical(state.calendar, dateInput.value);
    const converted = parsed.ok ? convertBetween(state.calendar, parsed.tuple, next) : null;
    const tuple = converted && converted.ok ? converted.tuple : next.blockAnchor;
    state.calendar = next;
    dateInput.value = formatTuple(next, tuple) || '';
  };

  // «Kopieren» und «Einfügen» einer Zeile mit Ergebnis, rechts neben ihrem
  // Knopf «Name: Wert»; Kurzhinweis und Name für Screenreader nennen den Kalender.
  const rowActions = (row) => {
    const name = row.calendar.name;
    const source = rowSource(row.calendar, row.tuple);
    const copy = element('button', 'btn calendar-convert-action calendar-convert-copy');
    copy.type = 'button';
    copy.textContent = t('calendarConvert.copy');
    copy.title = t('calendarConvert.copyTitle').replace('{name}', name);
    copy.setAttribute('aria-label', copy.title);
    copy.addEventListener('click', () => copyToClipboard(copy, source, copyTimers));
    const insert = element('button', 'btn calendar-convert-action calendar-convert-insert');
    insert.type = 'button';
    insert.textContent = t('calendarConvert.insert');
    insert.setAttribute('aria-label', t('calendarConvert.insertTitle').replace('{name}', name));
    if (onInsert) {
      insert.title = insert.getAttribute('aria-label');
      insert.addEventListener('click', () => {
        if (closeDialog) closeDialog();
        onInsert(source);
      });
    } else {
      // Sichtbar deaktiviert statt still wirkungslos (Entwicklungsrichtlinien,
      // Kapitel 3), mit dem Grund.
      insert.disabled = true;
      insert.title = t('calendarConvert.insertUnavailable');
      insert.setAttribute('aria-describedby', insertReason.id);
    }
    return [copy, insert];
  };

  const refresh = () => {
    calendarSelect.value = state.calendar.id;
    list.innerHTML = '';
    const parsed = parseCanonical(state.calendar, dateInput.value);
    const result = parsed.ok
      ? blockEquivalents(state.block, state.calendar.id, parsed.tuple)
      : null;
    const valid = !!(result && result.ok);
    invalid.textContent = valid ? '' : t('calendarConvert.invalid');
    invalid.hidden = valid;
    // Ohne gültiges Datum gibt es nichts, was «entspricht».
    listHead.hidden = !valid;
    if (valid) dateInput.removeAttribute('aria-invalid');
    else dateInput.setAttribute('aria-invalid', 'true');
    if (!valid) return;
    if (result.rows.length === 0) {
      list.appendChild(element('p', 'calendar-convert-single', t('calendarConvert.single')));
      return;
    }
    for (const row of result.rows) {
      const name = row.calendar.name;
      if (!row.ok) {
        const key =
          row.code === EQUIVALENT_UNKNOWN
            ? 'calendarConvert.unknown'
            : 'calendarConvert.outOfRange';
        const text = element('div', 'calendar-convert-row-text', t(key).replace('{name}', name));
        text.dataset.calendarId = row.calendar.id;
        list.appendChild(text);
        continue;
      }
      // Eine Zeile: der Knopf «Name: Wert» und rechts daneben die beiden Tasten;
      // die Element-Reihenfolge ist zugleich die Tab-Reihenfolge.
      const item = element('div', 'calendar-convert-item');
      item.dataset.calendarId = row.calendar.id;
      const button = element('button', 'btn calendar-picker-conv calendar-convert-entry');
      button.type = 'button';
      button.dataset.calendarId = row.calendar.id;
      button.textContent = `${name}: ${shownValue(row.calendar, row.tuple)}`;
      button.addEventListener('click', () => {
        state.calendar = row.calendar;
        dateInput.value = formatTuple(row.calendar, row.tuple) || '';
        refresh();
        dateInput.focus();
      });
      item.append(button, ...rowActions(row));
      list.appendChild(item);
    }
  };

  fillSelect(calendarSelect, state.block.calendars, state.calendar.id);
  dateInput.value = state.text;
  refresh();

  blockSelect.addEventListener('change', () => {
    const next = blocks.find((b) => b.id === blockSelect.value);
    if (!next) return;
    // Blöcke haben keine gemeinsame Achse: der Wechsel springt zum Anker der
    // ersten Zeitrechnung des neuen Blocks (wie die Eingabe-Hilfe).
    state.block = next;
    state.calendar = next.calendars[0];
    fillSelect(calendarSelect, next.calendars, state.calendar.id);
    dateInput.value = formatTuple(state.calendar, state.calendar.blockAnchor) || '';
    refresh();
  });
  calendarSelect.addEventListener('change', () => {
    const next = state.block.calendars.find((c) => c.id === calendarSelect.value);
    if (!next || next === state.calendar) return;
    switchCalendar(next);
    refresh();
  });
  dateInput.addEventListener('input', refresh);

  let pickerOpen = false;
  pickButton.addEventListener('click', async () => {
    if (pickerOpen) return;
    pickerOpen = true;
    const rect = pickButton.getBoundingClientRect();
    const picked = await showCalendarPicker({
      config,
      calendarName: state.calendar.name,
      value: dateInput.value,
      x: rect.left,
      y: rect.bottom + 4,
    });
    pickerOpen = false;
    if (!modal.isConnected) return;
    if (picked) {
      // Die Eingabe-Hilfe erlaubt den Wechsel von Block und Zeitrechnung; ihr
      // Ergebnis nennt beide, und `text` ist der reine kanonische Wert.
      const block = blocks.find((b) => b.id === picked.blockId) || state.block;
      const calendar = block.calendars.find((c) => c.id === picked.calendarId) || null;
      if (calendar) {
        if (block !== state.block) {
          state.block = block;
          blockSelect.value = block.id;
          fillSelect(calendarSelect, block.calendars, calendar.id);
        }
        state.calendar = calendar;
        dateInput.value = picked.text;
        refresh();
      }
    }
    dateInput.focus();
  });

  const previousFocus = document.activeElement;

  return new Promise((resolve) => {
    const close = () => {
      modal.removeEventListener('keydown', onKeydown, true);
      modal.remove();
      openClose = null;
      closeDialog = null;
      for (const timer of copyTimers.values()) clearTimeout(timer);
      copyTimers.clear();
      if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
      resolve();
    };
    const focusables = () =>
      [...content.querySelectorAll('select, input, button')].filter(
        (el) => !el.disabled && !el.closest('[hidden]'),
      );
    function onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === 'Tab') {
        // Der Tabulator bleibt im Dialog; die Reihenfolge ist die der Elemente.
        event.preventDefault();
        event.stopPropagation();
        const items = focusables();
        if (items.length === 0) return;
        const idx = items.indexOf(document.activeElement);
        const next = event.shiftKey
          ? items[(idx <= 0 ? items.length : idx) - 1]
          : items[(idx + 1) % items.length];
        next.focus();
        return;
      }
      if (event.key === 'Enter') {
        const target = event.target;
        // Enter im Feld «Datum» löst nichts aus; auf einem Knopf löst es genau
        // ihn aus — einmal, weil die Standard-Handlung unterbleibt.
        if (target === dateInput) {
          event.preventDefault();
          event.stopPropagation();
        } else if (target instanceof HTMLButtonElement && content.contains(target)) {
          event.preventDefault();
          event.stopPropagation();
          target.click();
        }
      }
    }
    closeButton.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    modal.addEventListener('keydown', onKeydown, true);
    openClose = close;
    closeDialog = close;
    document.body.appendChild(modal);
    dateInput.focus();
    // Nachfassen wie das Vorbild: Ein Aufruf aus Menü oder Palette kann den
    // Fokus im selben Durchlauf noch an seinen Ausgangsort zurückgeben.
    setTimeout(() => {
      if (modal.isConnected && !content.contains(document.activeElement)) dateInput.focus();
    }, 0);
  });
}

// «Einfügen» in einen Editor: Ziel aus dem Zustand zum Zeitpunkt des Einfügens,
// geschrieben über den Weg der Eingabe-Hilfe (ein Rückgängig-Schritt,
// Schreibmarke dahinter, Fokus im Editor, Schutz vor Schreibschutz).
function insertIntoEditor(view, sourceText) {
  const target = calendarInsertTarget(view.state);
  applyResult(view, target.from, target.to, target.prefix + sourceText);
}

/**
 * Der gemeinsame Weg von Kommando und Kontextmenü: der Dialog mit der
 * Konfiguration des Bereichs, vorbelegt aus der Auswahl von `view` (ohne
 * Editor ohne Vorbelegung). Nur ein beschreibbarer Editor bekommt den
 * Einfüge-Rückruf; ein schreibgeschützter — das Dokument nicht im
 * Bearbeiten-Modus — und kein Editor lassen «Einfügen» deaktiviert.
 *
 * @param {object|null} view CodeMirror-EditorView oder null.
 * @returns {Promise<void>}
 */
export function openCalendarConvertAt(view) {
  const config = getAreaCalendarConfig();
  const writable = !!(view && view.state && !view.state.readOnly);
  return showCalendarConvertDialog({
    config,
    ...calendarPrefillFromSelection(view && view.state, config),
    ...(writable ? { onInsert: (sourceText) => insertIntoEditor(view, sourceText) } : {}),
  }).then(() => {
    // Aus Palette oder Kontextmenü geöffnet, ist der Ausgangsort des Fokus
    // beim Schließen schon verschwunden; die Schreibmarke gehört dann zurück
    // in den Editor, aus dem der Aufruf kam.
    const active = document.activeElement;
    if (view && typeof view.focus === 'function' && (!active || active === document.body)) {
      view.focus();
    }
  });
}
