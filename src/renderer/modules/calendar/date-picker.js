// 4T-0486 (Epic 3E-0091): Datums-/Uhrzeit-Picker.
//
// Wiederverwendbares Popup mit Kalender-Monatsansicht (Montag-Start,
// ISO-KW-Spalte) links und Uhrzeit-Eingabe rechts; beide Teile sind ueber
// Aktivierungs-Schalter einzeln zuschaltbar (mindestens einer aktiv).
// Promise-API: showDateTimePicker() liefert { date, time, text } oder null
// bei Abbruch (Esc, Klick ausserhalb, Abbrechen). Aufrufer sind die drei
// Registry-Kommandos (app-init.js), der Schreib-Trigger "\\"
// (datePickerTriggerExtension, unten) und ab 4T-0487 die klickbaren
// Datums-Werte im Live-Modus; das Folge-Epic 3E-0096 dockt mit
// Task-Dialog und Auto-Vervollstaendigung an dieselbe API an.
//
// Kalender-Mathematik kommt aus dem Perioden-Kern (journal-core.js:
// monthGrid, msToIsoDate — Format-Kern formatDateMs/isoWeekOf dahinter),
// die Gueltigkeits-Pruefung aus dem Task-Marker-Kern (isValidIsoDate/
// isValidTime). Die Ausgabeformate 'yyyy-MM-dd', 'HH:mm' und
// 'yyyy-MM-dd HH:mm' passen damit exakt zu den Termin-Markern aus 3E-0090.
'use strict';

import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
// 4T-0641 (Epic 3E-0069): Fence-Sprache am Cursor bestimmen (Ausnahme der
// Perspective-Tabellen vom Code-Ausschluss).
import { syntaxTree } from '@codemirror/language';
import { t } from '../../i18n.js';
import { msToIsoDate } from '../../../shared/journal-core.js';
// 4T-0752 (Epic 3E-0146): gemeinsamer Gitter-Aufbau, geteilt mit dem
// Kalender-Panel der Journale und dem Kalender-Modus der Uhr.
import { createDayCell, monthLabel, renderMonthGrid } from './month-grid-view.js';
import {
  isValidIsoDate,
  isValidTime,
  parseTaskLine,
  markerValueRangesInLine,
} from '../../../shared/tasks/task-markers.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import {
  computeMathBlockRanges,
  liveDateValueMarkDeco,
  LIVE_MATH_INLINE_RE,
} from '../live/live-deco.js';
import { detectFrontmatterLines } from '../live/live-marker-fields.js';
import { activeLineSet, positionInsideCode } from '../live/live-shared.js';

// 4T-0641 (Epic 3E-0069): Zeichenfolge des Schreib-Triggers. Bis dahin waren
// es zwei Backslashes; die Wahl kollidierte mit der Bedeutung des Backslash
// als Escape-Zeichen (`\\` ist in CommonMark ein literaler Backslash). Das
// Semikolon-Doppel hat weder in CommonMark noch in einer der Erweiterungen
// dieser App eine Bedeutung und bleibt mit einer Taste erreichbar.
// Anders als beim Backslash gibt es keine Altlasten: der Trigger hinterlaesst
// keine Spuren in Dokumenten.
const DATE_TRIGGER_CHAR = ';';
const DATE_TRIGGER = ';;';

// --- Wert-Parsing und -Komposition (rein, unit-testbar) ---------------------------

const DATE_ONLY_RE = /^(\d{4}-\d{2}-\d{2})$/;
const TIME_ONLY_RE = /^(\d{2}:\d{2})$/;
const DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/;

// Zerlegt einen Text in den Einfuege-Formaten in { date, time } (beide
// String oder null). Liefert null bei fremder Form oder kalendarisch/
// zeitlich ungueltigen Werten — die Vorbelegung faellt dann auf die
// Defaults zurueck (und 4T-0487 dekoriert solche Werte gar nicht erst).
export function parseDateTimeValue(text) {
  const s = String(text || '');
  let m = s.match(DATE_TIME_RE);
  if (m) {
    if (!isValidIsoDate(m[1]) || !isValidTime(m[2])) return null;
    return { date: m[1], time: m[2] };
  }
  m = s.match(DATE_ONLY_RE);
  if (m) {
    if (!isValidIsoDate(m[1])) return null;
    return { date: m[1], time: null };
  }
  m = s.match(TIME_ONLY_RE);
  if (m) {
    if (!isValidTime(m[1])) return null;
    return { date: null, time: m[1] };
  }
  return null;
}

// Komponiert den Einfuege-Text aus Datum und/oder Uhrzeit (Leerzeichen-
// getrennt, identisch zur Serialisierung der Task-Termin-Marker).
export function composeDateTimeText(date, time) {
  if (date && time) return `${date} ${time}`;
  if (date) return date;
  if (time) return time;
  return '';
}

// Normalisiert die Uhrzeit-Eingabe ('9:05' -> '09:05'); null bei
// ungueltiger Form oder Uhrzeit ausserhalb 00:00-23:59.
export function normalizeTimeInput(raw) {
  const m = String(raw || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const time = `${m[1].padStart(2, '0')}:${m[2]}`;
  return isValidTime(time) ? time : null;
}

// Datums-Arithmetik der Tastatur-Navigation. Mittags-Anker vermeidet
// DST-Kanten der lokalen Zeitzone.
export function shiftIsoDate(iso, deltaDays) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return msToIsoDate(new Date(y, m - 1, d + deltaDays, 12).getTime());
}

// Monats-Schritt mit Tages-Klemmung (31. Januar + 1 Monat = 28./29. Februar).
export function shiftIsoMonth(iso, deltaMonths) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const first = new Date(y, m - 1 + deltaMonths, 1, 12);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
  return msToIsoDate(
    new Date(first.getFullYear(), first.getMonth(), Math.min(d, lastDay), 12).getTime(),
  );
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// --- Kandidaten-Suche der Klick-Dekoration (4T-0487, rein) -----------------------------

// Werte in den drei Einfuege-Formen im Fliesstext. Die Waechter-Gruppen
// (kein Wort-Zeichen/Doppelpunkt davor oder danach) verhindern Treffer in
// laengeren Token: '14:30' in '14:30:15', '2026-07-10' in
// '2026-07-10T14:30'. Trenner der Kombi-Form ist genau EIN Leerzeichen
// (die Tab-Variante der Task-Marker zerfaellt bewusst in zwei
// Einzel-Treffer). Laengste Alternative zuerst.
export const LIVE_DATE_VALUE_RE =
  /(?<![\w:])(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?|\d{2}:\d{2})(?![\w:])/g;

// Liefert alle plausiblen Datums-/Uhrzeit-Werte eines Text-Ausschnitts als
// { from, to, date, time } (Offsets relativ zum Ausschnitt). Formen ohne
// Kalender-/Uhrzeit-Gueltigkeit (2026-02-30, 24:00) fallen heraus.
export function findDateValueRanges(text) {
  const out = [];
  for (const m of String(text || '').matchAll(LIVE_DATE_VALUE_RE)) {
    const parsed = parseDateTimeValue(m[1]);
    if (!parsed) continue;
    out.push({ from: m.index, to: m.index + m[1].length, date: parsed.date, time: parsed.time });
  }
  return out;
}

// Ende der Beschreibung einer Checkbox-Zeile (Offset in der Zeile) bzw.
// null fuer Nicht-Task-Zeilen. Werte hinter diesem Offset gehoeren zum
// Marker-Schwanz (Termin-/Prioritaets-/Wiederholungs-Segmente) — die
// tragen bei aktiver tasks-Erweiterung bereits ihre Badge-Dekoration und
// werden von der Klick-Dekoration ausgenommen.
export function taskLineDescriptionEnd(lineText) {
  const model = parseTaskLine(lineText);
  if (!model) return null;
  return (
    model.indent.length +
    model.bullet.length +
    model.bulletGap.length +
    2 +
    model.statusChar.length +
    model.statusGap.length +
    model.description.length
  );
}

// --- Trigger-Ausschluss-Kontexte (exportiert fuer Tests) ---------------------------

// Der Schreib-Trigger greift nicht in Code (Inline/Fenced/Block), Formeln
// (Inline- und Block-Math) und im Frontmatter — dieselben Kontext-Helfer
// wie die Live-Modus-Paesse (live-deco.js/live-widgets.js).
// 4T-0641 (Epic 3E-0069): Fence-Sprache an einer Position oder null.
// Lezer liefert den FencedCode-Knoten samt CodeInfo (Sprach-Tag); Vorlage
// ist getPerspectiveContext in editor-table-tools.js.
function fenceLanguageAt(state, pos) {
  let node = syntaxTree(state).resolveInner(pos, 1);
  while (node) {
    if (node.name === 'FencedCode') break;
    node = node.parent;
  }
  if (!node) return null;
  let child = node.firstChild;
  while (child) {
    if (child.name === 'CodeInfo') return state.doc.sliceString(child.from, child.to).trim();
    child = child.nextSibling;
  }
  return '';
}

// 4T-0641: Fence-Sprachen, die trotz Code-Kontext Eingabe-Kontext sind.
// Die Perspective-Tabellen sind technisch Fenced-Code, für den Nutzer aber
// Tabellen mit Inhaltszellen — der pauschale Code-Ausschluss trifft hier
// einen Fall, für den er nicht gedacht war (PO-Entscheidung 2026-07-20).
const DATE_TRIGGER_FENCE_ALLOWLIST = new Set(['perspective-table', 'perspective-datatable']);

export function isDateTriggerExcludedAt(state, pos) {
  if (positionInsideCode(state, pos)) {
    if (!DATE_TRIGGER_FENCE_ALLOWLIST.has(fenceLanguageAt(state, pos))) return true;
  }
  const frontmatter = detectFrontmatterLines(state.doc);
  const line = state.doc.lineAt(pos);
  if (frontmatter && line.number <= frontmatter.toLine) return true;
  for (const block of computeMathBlockRanges(state)) {
    if (pos >= block.from && pos <= block.to) return true;
  }
  for (const m of line.text.matchAll(LIVE_MATH_INLINE_RE)) {
    const from = line.from + m.index;
    if (pos >= from && pos <= from + m[0].length) return true;
  }
  return false;
}

// --- Popup-Singleton ----------------------------------------------------------------

let popupEl = null;
let els = null;
// Laufende Sitzung: { resolve, selectedIso, time, dateEnabled, timeEnabled,
// todayIso, viewYear, viewMonthIndex }. Nur eine Instanz gleichzeitig.
let session = null;

function buildPopup() {
  popupEl = document.createElement('div');
  popupEl.id = 'date-picker-popup';
  popupEl.className = 'date-picker-popup';
  popupEl.setAttribute('role', 'dialog');
  popupEl.hidden = true;
  popupEl.innerHTML = `
    <div class="date-picker-columns">
      <section class="date-picker-date-section">
        <label class="date-picker-toggle">
          <input type="checkbox" id="date-picker-toggle-date" />
          <span id="date-picker-label-date"></span>
        </label>
        <div class="date-picker-cal-head">
          <button type="button" class="btn date-picker-nav" id="date-picker-prev">&#8249;</button>
          <span class="date-picker-month-label" id="date-picker-month-label"></span>
          <button type="button" class="btn date-picker-nav" id="date-picker-next">&#8250;</button>
        </div>
        <div class="calendar-grid date-picker-grid" id="date-picker-grid"></div>
        <button type="button" class="btn date-picker-today" id="date-picker-today"></button>
      </section>
      <section class="date-picker-time-section">
        <label class="date-picker-toggle">
          <input type="checkbox" id="date-picker-toggle-time" />
          <span id="date-picker-label-time"></span>
        </label>
        <div class="date-picker-time-control" id="date-picker-time-control">
          <span class="date-picker-time-digit" data-seg="0" tabindex="0"></span>
          <span class="date-picker-time-digit" data-seg="1" tabindex="0"></span>
          <span class="date-picker-time-colon">:</span>
          <span class="date-picker-time-digit" data-seg="2" tabindex="0"></span>
          <span class="date-picker-time-digit" data-seg="3" tabindex="0"></span>
          <span class="date-picker-time-steppers">
            <button type="button" class="btn date-picker-step" id="date-picker-time-up">
              &#9650;
            </button>
            <button type="button" class="btn date-picker-step" id="date-picker-time-down">
              &#9660;
            </button>
          </span>
        </div>
        <button type="button" class="btn date-picker-now" id="date-picker-now"></button>
      </section>
    </div>
    <div class="date-picker-buttons">
      <button type="button" class="btn" id="date-picker-cancel"></button>
      <button type="button" class="btn btn-primary" id="date-picker-ok"></button>
    </div>`;
  document.body.appendChild(popupEl);
  els = {
    toggleDate: popupEl.querySelector('#date-picker-toggle-date'),
    toggleTime: popupEl.querySelector('#date-picker-toggle-time'),
    labelDate: popupEl.querySelector('#date-picker-label-date'),
    labelTime: popupEl.querySelector('#date-picker-label-time'),
    prev: popupEl.querySelector('#date-picker-prev'),
    next: popupEl.querySelector('#date-picker-next'),
    monthLabel: popupEl.querySelector('#date-picker-month-label'),
    grid: popupEl.querySelector('#date-picker-grid'),
    today: popupEl.querySelector('#date-picker-today'),
    timeControl: popupEl.querySelector('#date-picker-time-control'),
    timeDigits: [...popupEl.querySelectorAll('.date-picker-time-digit')],
    timeUp: popupEl.querySelector('#date-picker-time-up'),
    timeDown: popupEl.querySelector('#date-picker-time-down'),
    now: popupEl.querySelector('#date-picker-now'),
    ok: popupEl.querySelector('#date-picker-ok'),
    cancel: popupEl.querySelector('#date-picker-cancel'),
  };

  els.prev.addEventListener('click', () => shiftView(-1));
  els.next.addEventListener('click', () => shiftView(1));
  els.today.addEventListener('click', () => {
    if (!session || !session.dateEnabled) return;
    selectDate(session.todayIso);
  });
  els.now.addEventListener('click', () => {
    if (!session || !session.timeEnabled) return;
    const now = new Date();
    setTimeFromString(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
    renderTimeDigits();
  });
  // Segment-Steuerung der Uhrzeit (PO-Befund Runde 1, 4T-0486): vier
  // einzeln einstellbare Stellen statt Freitext — ungueltige Uhrzeiten
  // sind konstruktionsbedingt nicht eingebbar. Klick waehlt die Stelle,
  // die Pfeil-Buttons und Pfeiltasten aendern sie (mit Umlauf), Ziffern-
  // Tasten setzen sie direkt und ruecken weiter.
  els.timeDigits.forEach((digitEl, idx) => {
    digitEl.addEventListener('mousedown', (e) => {
      if (!session || !session.timeEnabled) return;
      e.preventDefault();
      setActiveSegment(idx);
      digitEl.focus();
    });
    digitEl.addEventListener('focus', () => {
      if (!session || !session.timeEnabled) return;
      setActiveSegment(idx);
    });
  });
  els.timeUp.addEventListener('click', () => stepActiveSegment(1));
  els.timeDown.addEventListener('click', () => stepActiveSegment(-1));
  els.toggleDate.addEventListener('change', () => {
    if (!session) return;
    session.dateEnabled = els.toggleDate.checked;
    updateControls();
  });
  els.toggleTime.addEventListener('change', () => {
    if (!session) return;
    session.timeEnabled = els.toggleTime.checked;
    updateControls();
  });
  els.ok.addEventListener('click', () => accept());
  els.cancel.addEventListener('click', () => closeSession(null));

  // Capture-Phase haelt Esc/Enter aus den globalen Handlern heraus
  // (Muster showTemplatePickerDialog). Pfeiltasten navigieren den
  // Kalender, ausser der Fokus steht in der Uhrzeit-Eingabe.
  popupEl.addEventListener('keydown', onPopupKeydown, true);
}

function onPopupKeydown(e) {
  if (!session) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeSession(null);
    return;
  }
  if (e.key === 'Enter') {
    // Enter auf Hilfs-Buttons (Monats-Navigation, Heute, Jetzt) loest den
    // Button selbst aus; ueberall sonst gilt Enter als Uebernehmen.
    if ([els.prev, els.next, els.today, els.now].includes(e.target)) {
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.target === els.cancel) closeSession(null);
    else accept();
    return;
  }
  // Fokus in der Uhrzeit-Segment-Steuerung: Pfeile stellen die aktive
  // Stelle bzw. wechseln sie, Ziffern setzen sie direkt.
  if (els.timeControl.contains(e.target)) {
    if (session.timeEnabled && e.target.classList.contains('date-picker-time-digit')) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        stepActiveSegment(e.key === 'ArrowUp' ? 1 : -1);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        setActiveSegment(session.timeSeg + (e.key === 'ArrowRight' ? 1 : -1));
        els.timeDigits[session.timeSeg].focus();
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        typeSegmentDigit(Number(e.key));
        return;
      }
    }
    return;
  }
  if (!session.dateEnabled) return;
  const dayDelta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
  if (dayDelta !== undefined) {
    e.preventDefault();
    e.stopPropagation();
    selectDate(shiftIsoDate(session.selectedIso, dayDelta));
    return;
  }
  if (e.key === 'PageUp' || e.key === 'PageDown') {
    e.preventDefault();
    e.stopPropagation();
    selectDate(shiftIsoMonth(session.selectedIso, e.key === 'PageUp' ? -1 : 1));
  }
}

function onDocumentMousedown(e) {
  if (!session) return;
  if (popupEl.contains(e.target)) return;
  closeSession(null);
}

// --- Uhrzeit-Segmente ---------------------------------------------------------------
// session.timeDigits = [Stunden-Zehner, Stunden-Einer, Minuten-Zehner,
// Minuten-Einer]; session.timeSeg ist die aktive Stelle. Wertebereiche pro
// Stelle mit Klemmung (Stunden-Einer max. 3, wenn der Zehner 2 ist).

function segmentMax(seg) {
  if (seg === 0) return 2;
  if (seg === 1) return session.timeDigits[0] === 2 ? 3 : 9;
  if (seg === 2) return 5;
  return 9;
}

function clampSegments() {
  for (let s = 0; s < 4; s++) {
    if (session.timeDigits[s] > segmentMax(s)) session.timeDigits[s] = segmentMax(s);
  }
}

function setTimeFromString(time) {
  session.timeDigits = [Number(time[0]), Number(time[1]), Number(time[3]), Number(time[4])];
}

function timeString() {
  const d = session.timeDigits;
  return `${d[0]}${d[1]}:${d[2]}${d[3]}`;
}

function setActiveSegment(seg) {
  session.timeSeg = Math.max(0, Math.min(3, seg));
  renderTimeDigits();
}

function stepActiveSegment(delta) {
  if (!session || !session.timeEnabled) return;
  const seg = session.timeSeg;
  const max = segmentMax(seg);
  session.timeDigits[seg] = (session.timeDigits[seg] + delta + max + 1) % (max + 1);
  clampSegments();
  renderTimeDigits();
}

// Ziffer direkt setzen (auf den Stellen-Maximalwert geklemmt) und zur
// naechsten Stelle weiterruecken.
function typeSegmentDigit(digit) {
  const seg = session.timeSeg;
  session.timeDigits[seg] = Math.min(digit, segmentMax(seg));
  clampSegments();
  if (seg < 3) {
    setActiveSegment(seg + 1);
    els.timeDigits[session.timeSeg].focus();
  } else {
    renderTimeDigits();
  }
}

function renderTimeDigits() {
  els.timeDigits.forEach((digitEl, idx) => {
    digitEl.textContent = String(session.timeDigits[idx]);
    digitEl.classList.toggle('active', session.timeEnabled && idx === session.timeSeg);
    if (session.timeEnabled) digitEl.setAttribute('tabindex', '0');
    else digitEl.removeAttribute('tabindex');
  });
}

// Auswahl setzen, Monatsansicht folgt dem gewaehlten Tag.
function selectDate(iso) {
  session.selectedIso = iso;
  session.viewYear = Number(iso.slice(0, 4));
  session.viewMonthIndex = Number(iso.slice(5, 7)) - 1;
  renderCalendar();
  focusSelectedDay();
}

function shiftView(delta) {
  if (!session) return;
  const d = new Date(session.viewYear, session.viewMonthIndex + delta, 1, 12);
  session.viewYear = d.getFullYear();
  session.viewMonthIndex = d.getMonth();
  renderCalendar();
}

function renderCalendar() {
  els.monthLabel.textContent = monthLabel(session.viewYear, session.viewMonthIndex);

  // 4T-0752 (Epic 3E-0146): Kopfzeile und Zeilen-Durchlauf kommen aus dem
  // gemeinsamen Gitter-Modul; picker-spezifisch bleiben Auswahl-Zustand,
  // Sperre und der Klick auf einen Tag.
  renderMonthGrid(els.grid, {
    year: session.viewYear,
    monthIndex: session.viewMonthIndex,
    weekColumnLabel: t('calendar.weekColumn'),
    weekCell: (row) => {
      const weekCell = document.createElement('span');
      weekCell.className = 'calendar-cell calendar-week-col date-picker-week';
      weekCell.textContent = String(row.week.week);
      return weekCell;
    },
    dayCell: (day) => {
      const btn = createDayCell(day, { todayIso: session.todayIso, className: 'date-picker-day' });
      btn.dataset.iso = day.iso;
      if (day.iso === session.selectedIso) btn.classList.add('selected');
      btn.disabled = !session.dateEnabled;
      btn.addEventListener('click', () => {
        if (!session || !session.dateEnabled) return;
        selectDate(day.iso);
      });
      return btn;
    },
  });
}

function focusSelectedDay() {
  const btn = els.grid.querySelector('.date-picker-day.selected');
  if (btn && !btn.disabled) btn.focus();
}

// Schalter- und Bedien-Zustand nachziehen. Der jeweils letzte aktive
// Schalter ist gesperrt (mindestens ein Teil bleibt aktiv). Die Uhrzeit
// ist ueber die Segment-Steuerung konstruktionsbedingt immer gueltig,
// OK ist nie gesperrt (PO-Befund Runde 1).
function updateControls() {
  els.toggleDate.checked = session.dateEnabled;
  els.toggleTime.checked = session.timeEnabled;
  els.toggleDate.disabled = session.dateEnabled && !session.timeEnabled;
  els.toggleTime.disabled = session.timeEnabled && !session.dateEnabled;
  els.timeUp.disabled = !session.timeEnabled;
  els.timeDown.disabled = !session.timeEnabled;
  els.now.disabled = !session.timeEnabled;
  els.today.disabled = !session.dateEnabled;
  els.prev.disabled = !session.dateEnabled;
  els.next.disabled = !session.dateEnabled;
  popupEl
    .querySelector('.date-picker-date-section')
    .classList.toggle('inactive', !session.dateEnabled);
  popupEl
    .querySelector('.date-picker-time-section')
    .classList.toggle('inactive', !session.timeEnabled);
  renderTimeDigits();
  renderCalendar();
}

// Bestands-Keys des Kalender-Panels (Heute, Monats-Navigation, KW) werden
// nachgenutzt; nur die Picker-eigenen Texte haben datePicker.*-Keys.
function applyStaticTexts() {
  els.labelDate.textContent = t('datePicker.date');
  els.labelTime.textContent = t('datePicker.time');
  els.today.textContent = t('calendar.today');
  els.now.textContent = t('datePicker.now');
  els.ok.textContent = t('dialog.ok');
  els.cancel.textContent = t('dialog.cancel');
  els.prev.title = t('calendar.prevMonth');
  els.next.title = t('calendar.nextMonth');
  els.timeUp.title = t('datePicker.timeUp');
  els.timeDown.title = t('datePicker.timeDown');
}

// Erst unsichtbar messen, dann an den Anker klemmen (Muster
// placeContextMenuAt in dialogs.js). Ohne Anker mittig im Fenster.
function positionPopup(x, y) {
  popupEl.style.left = '0px';
  popupEl.style.top = '0px';
  popupEl.hidden = false;
  const rect = popupEl.getBoundingClientRect();
  let px = typeof x === 'number' ? x : (window.innerWidth - rect.width) / 2;
  let py = typeof y === 'number' ? y : (window.innerHeight - rect.height) / 2;
  if (px + rect.width > window.innerWidth) px = window.innerWidth - rect.width - 4;
  if (py + rect.height > window.innerHeight) py = window.innerHeight - rect.height - 4;
  popupEl.style.left = `${Math.max(0, px)}px`;
  popupEl.style.top = `${Math.max(0, py)}px`;
}

function accept() {
  if (!session) return;
  const date = session.dateEnabled ? session.selectedIso : null;
  const time = session.timeEnabled ? timeString() : null;
  closeSession({ date, time, text: composeDateTimeText(date, time) });
}

function closeSession(result) {
  if (!session) return;
  const resolve = session.resolve;
  session = null;
  popupEl.hidden = true;
  document.removeEventListener('mousedown', onDocumentMousedown, true);
  resolve(result);
}

// Oeffnet den Picker. Optionen (alle optional):
//   x, y                 Viewport-Anker (linke obere Ecke, geklemmt)
//   date ('yyyy-MM-dd')  Vorbelegung Kalender (Default: heute)
//   time ('HH:mm')       Vorbelegung Uhrzeit (Default: jetzt)
//   dateEnabled/timeEnabled  Schalter-Vorbelegung (Default: beide an)
//   now (Date)           Referenz-Zeitpunkt fuer Defaults (Tests)
// Ergebnis: { date, time, text } oder null bei Abbruch.
export function showDateTimePicker(options = {}) {
  if (!popupEl) buildPopup();
  if (session) closeSession(null);
  const now = options.now instanceof Date ? options.now : new Date();
  const todayIso = msToIsoDate(now.getTime());
  const date =
    typeof options.date === 'string' &&
    DATE_ONLY_RE.test(options.date) &&
    isValidIsoDate(options.date)
      ? options.date
      : todayIso;
  const time =
    typeof options.time === 'string' && normalizeTimeInput(options.time)
      ? normalizeTimeInput(options.time)
      : `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const timeEnabled = options.timeEnabled !== false;
  // Mindestens ein Teil aktiv: ohne beide Schalter faellt Datum an.
  const dateEnabled = options.dateEnabled !== false || !timeEnabled;

  return new Promise((resolve) => {
    session = {
      resolve,
      selectedIso: date,
      todayIso,
      dateEnabled,
      timeEnabled,
      timeDigits: [0, 0, 0, 0],
      timeSeg: 0,
      viewYear: Number(date.slice(0, 4)),
      viewMonthIndex: Number(date.slice(5, 7)) - 1,
    };
    setTimeFromString(time);
    applyStaticTexts();
    updateControls();
    positionPopup(options.x, options.y);
    document.addEventListener('mousedown', onDocumentMousedown, true);
    setTimeout(() => {
      if (!session) return;
      if (session.dateEnabled) focusSelectedDay();
      else els.timeDigits[0].focus();
    }, 0);
  });
}

// --- Editor-Anbindung ----------------------------------------------------------------

// Anker unterhalb der Cursor-Position; Fallback auf die Editor-Ecke, wenn
// die Position nicht gemessen werden kann (z.B. ausserhalb des Viewports).
function anchorForPos(view, pos) {
  const coords = view.coordsAtPos(pos);
  if (coords) return { x: coords.left, y: coords.bottom + 4 };
  const rect = view.dom.getBoundingClientRect();
  return { x: rect.left + 40, y: rect.top + 40 };
}

function applyResult(view, from, to, text) {
  // 4T-0487: programmatischer Dispatch wird von EditorState.readOnly nicht
  // blockiert — expliziter Guard (Muster Task-Toggle), z.B. fuer den
  // Klick-Pfad in read-only Ansichten.
  if (view.state.readOnly) return;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
}

// Kommando-Pfad: Picker am Cursor, Ergebnis ersetzt die aktive Selektion
// (ein Undo-Schritt, Muster edit.insertTimestamp).
export async function openDatePickerAtSelection(view, { dateEnabled, timeEnabled }) {
  const anchor = anchorForPos(view, view.state.selection.main.head);
  const result = await showDateTimePicker({ ...anchor, dateEnabled, timeEnabled });
  if (!result) {
    view.focus();
    return;
  }
  const range = view.state.selection.main;
  applyResult(view, range.from, range.to, result.text);
}

// Bereichs-Pfad (Schreib-Trigger, ab 4T-0487 Klick-Reaktivierung): Ergebnis
// ersetzt exakt [from, to). expected sichert gegen zwischenzeitliche
// Dokument-Aenderungen — bei Abweichung wird nichts ersetzt.
export async function openDatePickerForRange(view, { from, to, expected, ...pickerOptions }) {
  const anchor = anchorForPos(view, from);
  const result = await showDateTimePicker({ ...anchor, ...pickerOptions });
  if (!result) {
    view.focus();
    return;
  }
  if (to > view.state.doc.length) return;
  if (typeof expected === 'string' && view.state.sliceDoc(from, to) !== expected) return;
  applyResult(view, from, to, result.text);
}

// --- Schreib-Trigger "\\" ---------------------------------------------------------------

// Zweiter Backslash direkt hinter einem Backslash oeffnet den kombinierten
// Picker (Vorbild des Epics). Das Zeichen wird normal eingefuegt (return
// false); Uebernehmen ersetzt beide Backslashes, Abbruch laesst sie stehen.
// Kein Trigger in Code/Formeln/Frontmatter und bei deaktivierter
// Erweiterung.
export const datePickerTriggerExtension = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== DATE_TRIGGER_CHAR) return false;
  if (!isExtensionActive('date-picker')) return false;
  if (from === 0 || view.state.sliceDoc(from - 1, from) !== DATE_TRIGGER_CHAR) return false;
  if (isDateTriggerExcludedAt(view.state, from)) return false;
  setTimeout(() => {
    openDatePickerForRange(view, { from: from - 1, to: from + 1, expected: DATE_TRIGGER });
  }, 0);
  return false;
});

// --- Klickbare Datums-Werte im Editor (4T-0487, PO-Befund Runde 1) ---------------------

// Dekorations-Plugin fuer Quelltext- UND Live-Modus (Basis-Extension der
// EditorView, nicht Teil des Live-Compartments): Werte in den Einfuege-
// Formen werden als Mark mit exaktem Doc-Bereich dekoriert; Klick oeffnet
// den vorbelegten Picker. Der PO-Befund der ersten Test-Runde verlangte
// die Klick-Reaktivierung auch im Quelltext-Modus (nicht nur Live).
// Ausschluesse: read-only Ansichten (dort waere Ersetzen wirkungslos),
// Code, Formeln, Frontmatter, aktive Cursor-Zeilen (dort greift normale
// Text-Bearbeitung), Wiki-Link-Ziele und bei aktiver tasks-Erweiterung
// der Marker-Schwanz von Checkbox-Zeilen (Badge-Dekoration aus 3E-0090).
// 4T-0528 (Epic 3E-0095): Wert-Bereich des Erinnerungs-Markers einer Zeile
// (Offsets in der Zeile) oder null. Der Marker-Schwanz von Checkbox-Zeilen
// ist von der Klick-Dekoration ausgenommen (Badges aus 3E-0090); der
// ⏰-Wert bleibt als gezielte Ausnahme klickbar (Popup vorbelegt, Ersetzen
// an Ort und Stelle — Workshop-Punkt 1). Das rechteste Vorkommen ist das
// wirksame Segment (Parse-Richtung des Marker-Kerns).
function buildDateValueDecorations(view) {
  const { state } = view;
  if (state.readOnly || !isExtensionActive('date-picker')) return Decoration.none;
  const frontmatter = detectFrontmatterLines(state.doc);
  const frontmatterEndLine = frontmatter ? frontmatter.toLine : 0;
  const activeLines = activeLineSet(state);
  const mathBlockRanges = computeMathBlockRanges(state);
  const katexActive = isExtensionActive('katex');
  const tasksActive = isExtensionActive('tasks');
  // 4T-0528 (Epic 3E-0095): Ausnahme vom Marker-Schwanz-Ausschluss.
  const remindersActive = tasksActive && isExtensionActive('reminders');
  const ranges = [];
  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to);
    const descEndByLine = new Map();
    const markerRangesByLine = new Map();
    for (const r of findDateValueRanges(text)) {
      const docFrom = from + r.from;
      const docTo = from + r.to;
      if (positionInsideCode(state, docFrom)) continue;
      const line = state.doc.lineAt(docFrom);
      if (line.number <= frontmatterEndLine) continue;
      // 4T-0943 (Epic 3E-0197): Die aktive Zeile wird nicht mehr
      // uebersprungen — der Wert bleibt dort dekoriert und oeffnet auf
      // den Strg-Klick (E1). Ohne Marke gaebe es kein Klick-Ziel.
      const inAktiverZeile = activeLines.has(line.number);
      if (docTo > line.to) continue;
      let insideMath = false;
      for (const block of mathBlockRanges) {
        if (docFrom >= block.from && docTo <= block.to) {
          insideMath = true;
          break;
        }
      }
      if (!insideMath && katexActive) {
        for (const m of line.text.matchAll(LIVE_MATH_INLINE_RE)) {
          const mathFrom = line.from + m.index;
          if (docFrom >= mathFrom && docTo <= mathFrom + m[0].length) {
            insideMath = true;
            break;
          }
        }
      }
      if (insideMath) continue;
      if (text.slice(r.from - 2, r.from) === '[[') continue;
      if (tasksActive) {
        let descEnd = descEndByLine.get(line.number);
        if (descEnd === undefined) {
          descEnd = taskLineDescriptionEnd(line.text);
          descEndByLine.set(line.number, descEnd);
        }
        if (descEnd !== null && docTo - line.from > descEnd) {
          // 4T-0937 (Befund B-09): Im Marker-Schwanz bleibt jeder Wert eines
          // Datums-Markers klick-dekoriert (Cursor auf der Zeile zeigt
          // Roh-Text; der generische openDatePickerForRange-Pfad ersetzt
          // exakt den Wert und liest Datum wie Uhrzeit aus ihm). Alles
          // uebrige des Schwanzes bleibt ausgenommen, weil es Badges sind.
          let rv = markerRangesByLine.get(line.number);
          if (rv === undefined) {
            rv = markerValueRangesInLine(line.text, { withReminder: remindersActive });
            markerRangesByLine.set(line.number, rv);
          }
          const lineFrom = docFrom - line.from;
          const lineTo = docTo - line.from;
          if (!rv.some((r) => r.from === lineFrom && r.to === lineTo)) continue;
        }
      }
      ranges.push(liveDateValueMarkDeco(docFrom, docTo, inAktiverZeile).range(docFrom, docTo));
    }
  }
  return Decoration.set(ranges, true);
}

export const dateValuePlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDateValueDecorations(view);
    }
    update(update) {
      // Jede Transaktion rechnet neu: Doc-/Selektions-/Viewport-Wechsel
      // direkt, Erweiterungs-Toggles ueber die Effekt-Dispatches aus
      // app-init (scg:extensions-changed), Edit-Modus-Wechsel ueber die
      // readOnly-Compartment-Rekonfiguration.
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.transactions.length > 0
      ) {
        this.decorations = buildDateValueDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      // mousedown statt click: CodeMirror setzt den Cursor bereits beim
      // mousedown (Begruendung am livePreviewClickHandler). Werte, die
      // zugleich in einer Link-Dekoration liegen, bleiben dem Link-Klick
      // des Live-Handlers ueberlassen.
      mousedown(event, view) {
        if (event.button !== 0) return false;
        const tgt = event.target;
        if (!(tgt instanceof Element)) return false;
        const dateEl = tgt.closest('[data-live-date-from]');
        if (!dateEl) return false;
        if (tgt.closest('[data-live-link-href]')) return false;
        if (view.state.readOnly) return false;
        // 4T-0943 (Epic 3E-0197): In der Zeile mit dem Cursor traegt die
        // Marke data-live-date-mod. Dort oeffnet erst der Strg-/Cmd-Klick,
        // damit der einfache Klick weiterhin den Cursor setzt (E1).
        if (dateEl.getAttribute('data-live-date-mod') === '1' && !event.ctrlKey && !event.metaKey) {
          return false;
        }
        const from = parseInt(dateEl.getAttribute('data-live-date-from'), 10);
        const to = parseInt(dateEl.getAttribute('data-live-date-to'), 10);
        if (Number.isNaN(from) || Number.isNaN(to) || from < 0 || to <= from) return false;
        if (to > view.state.doc.length) return false;
        // Wert frisch aus dem Doc lesen: eine veraltete Decoration
        // oeffnet den aktuellen Stand oder gar nichts.
        const valueText = view.state.sliceDoc(from, to);
        const parsed = parseDateTimeValue(valueText);
        if (!parsed) return false;
        event.preventDefault();
        openDatePickerForRange(view, {
          from,
          to,
          expected: valueText,
          date: parsed.date,
          time: parsed.time,
          dateEnabled: !!parsed.date,
          timeEnabled: !!parsed.time,
        });
        return true;
      },
    },
  },
);
