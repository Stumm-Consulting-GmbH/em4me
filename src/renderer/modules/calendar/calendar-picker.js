// 4T-000545 (Epic 3E-000097): Picker fuer benutzerdefinierte Kalender.
//
// Popup mit Block-/Kalender-/Epochen-Wahl, generischem Gitter aus der
// Ebenen-Struktur (Zyklus-Laenge = Spalten-Zahl, Zyklus-Nummern-Spalte bei
// Nummerierungs-Regel; ohne Zyklus fortlaufende Liste der Einheit),
// generischen Zeit-Segmenten und Umrechnungs-Anzeige aller Parallel-
// Kalender des Blocks (Klick wechselt den aktiven Kalender dorthin).
// Promise-API nach dem Vorbild von showDateTimePicker (cursor-verankert,
// vorbelegbar, Ergebnis oder null); die Popup-Muster (Positionierung,
// Segment-Steuerung, Tastatur) sind auf Code-Ebene uebernommen, ohne
// funktionale Kopplung an die Erweiterung der ISO-Datums-Eingabe
// (Workshop-Punkt 7).
//
// Alle Kalender-Mathematik kommt aus dem Kalender-Kern (calendar-core.js);
// ungueltige Werte sind konstruktionsbedingt nicht eingebbar (Gitter und
// Segmente kennen nur gueltige Positionen). "Referenz" springt zum
// Block-Anker des Kalenders — einen realen Heute-Bezug hat das Modell
// bewusst nicht (Bloecke sind in sich geschlossen).
'use strict';

import { Decoration, ViewPlugin } from '@codemirror/view';
import { t } from '../../i18n.js';
import {
  tupleToAxis,
  axisToTuple,
  segmentRanges,
  epochOf,
  cycleAt,
  formatTuple,
  parseCanonical,
  convertBetween,
  findCalendarByName,
  findCalendarValues,
  parseCalendarValueRaw,
} from '../../../shared/calendar/calendar-core.js';
// 4T-000995 (Epic 3E-000196): Die Aufloesung des Bezugs einer Ableitung haengt
// an der eingebauten Standard-Zeitrechnung und liegt deshalb im
// Konfigurations-Rand des Kalender-Kerns.
import { baseCalendarOf } from '../../../shared/calendar/calendar-config.js';
// 4T-000546 (Epic 3E-000097): Renderer-Zustand der calendarSystems-
// Konfiguration (gesetzt von app-init; die Preload-Pipeline haelt ihren
// eigenen Zustand — markdown.js ist im Renderer-Bundle nicht importierbar).
import { getAreaCalendarConfig } from './calendar-config.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { detectFrontmatterLines } from '../live/live-marker-fields.js';
import { activeLineSet, positionInsideCode } from '../live/live-shared.js';

// --- Ebenen-Geometrie (Spiegel der Kern-Regeln, rein) -------------------------------

// Zeit-Teil-Laenge: Praefix mit dem Ebenen-Bereich der kleinsten Ebene,
// sofern mehr als ein Bereich existiert (Regel des Kerns).
function timeCountOf(cal) {
  const levels = cal.levels;
  const sec0 = levels[0].section;
  let prefix = 0;
  while (prefix < levels.length && levels[prefix].section === sec0) prefix++;
  return prefix < levels.length ? prefix : 0;
}

// Tupel-Position eines Ebenen-Index (Tupel ist groesste Ebene zuerst).
function tuplePos(cal, levelIdx) {
  return cal.levels.length - 1 - levelIdx;
}

// --- Popup-Singleton ----------------------------------------------------------------

let popupEl = null;
// Laufende Sitzung: { resolve, config, block, cal, tuple, target }.
// 4T-000748 (Epic 3E-000138): Bei einer abgeleiteten Zeitrechnung arbeitet der
// Picker in der Notation ihres Bezugs (Entscheidung 2a): Gitter und Kopf
// zeigen den Bezug, `target` haelt die Ableitung, und uebernommen wird ihr
// Wert. Ein Datum zu waehlen ist die natuerliche Handlung; die Zaehlung ab
// dem Nullpunkt ist das Ergebnis.
let session = null;

function ensurePopup() {
  if (popupEl) return;
  popupEl = document.createElement('div');
  popupEl.id = 'calendar-picker-popup';
  popupEl.className = 'date-picker-popup calendar-picker-popup';
  popupEl.setAttribute('role', 'dialog');
  popupEl.hidden = true;
  document.body.appendChild(popupEl);
  popupEl.addEventListener('keydown', onPopupKeydown, true);
}

function onDocumentMousedown(e) {
  if (!session) return;
  if (popupEl.contains(e.target)) return;
  closeSession(null);
}

function closeSession(result) {
  if (!session) return;
  const resolve = session.resolve;
  session = null;
  popupEl.hidden = true;
  document.removeEventListener('mousedown', onDocumentMousedown, true);
  resolve(result);
}

// Aktiven Kalender der Sitzung setzen. Eine Ableitung wird in der Notation
// ihres Bezugs angezeigt; `tupleInNext` ist der gewuenschte Zeitpunkt in den
// Koordinaten von `next` (null = Anker).
function setSessionCalendar(next, tupleInNext) {
  const base = next && next.derived ? baseCalendarOf(session.block, next) : null;
  if (base) {
    session.target = next;
    session.cal = base;
    let tuple = null;
    if (tupleInNext) {
      const conv = convertBetween(next, tupleInNext, base);
      if (conv.ok) tuple = conv.tuple;
    }
    session.tuple = tuple || zeroTupleInBase(next, base) || base.blockAnchor.slice();
    return;
  }
  session.target = null;
  session.cal = next;
  session.tuple = tupleInNext || next.blockAnchor.slice();
}

// Nullpunkt einer Ableitung, ausgedrueckt im Bezug (Sprungziel und Default).
function zeroTupleInBase(derived, base) {
  if (!derived.epochs[1] || !derived.epochs[1].start) return null;
  const timeCount = timeCountOf(derived);
  const timeSegs = [];
  for (let i = timeCount - 1; i >= 0; i--) timeSegs.push(derived.levels[i].start);
  const conv = convertBetween(derived, derived.epochs[1].start.concat(timeSegs), base);
  return conv.ok ? conv.tuple : null;
}

function accept() {
  if (!session) return;
  const { cal, block, tuple, target } = session;
  if (target) {
    const converted = convertBetween(cal, tuple, target);
    if (!converted.ok) return;
    const epT = epochOf(target, converted.tuple);
    closeSession({
      text: formatTuple(target, converted.tuple),
      calendarName: target.name,
      calendarId: target.id,
      blockId: block.id,
      tuple: converted.tuple,
      epochIndex: epT ? epT.index : null,
    });
    return;
  }
  const ep = epochOf(cal, tuple);
  closeSession({
    text: formatTuple(cal, tuple),
    calendarName: cal.name,
    calendarId: cal.id,
    blockId: block.id,
    tuple,
    epochIndex: ep ? ep.index : null,
  });
}

// --- Auswahl-Arithmetik ---------------------------------------------------------------

// Segment-Wert klemmen: nach Struktur-Spruengen (Jahres-/Epochen-Wechsel)
// werden die unteren Segmente von oben nach unten in ihre Bereiche geklemmt.
function clampTuple(cal, tuple) {
  const out = tuple.slice();
  for (let k = 1; k < out.length; k++) {
    const ranges = segmentRanges(cal, out);
    if (!ranges) return tuple;
    const r = ranges[k];
    if (out[k] < r.min) out[k] = r.min;
    if (out[k] > r.max) out[k] = r.max;
  }
  return out;
}

// Basis-Tupel der Gitter-Einheit (kleinste Datums-Ebene in Minimal-Stellung,
// Zeit unveraendert).
function unitBase(cal, tuple) {
  const kDay = tuplePos(cal, timeCountOf(cal));
  const out = tuple.slice();
  const ranges = segmentRanges(cal, out);
  out[kDay] = ranges[kDay].min;
  return out;
}

// Achsen-Schrittweite eines Tages (Einheit der kleinsten Datums-Ebene);
// null, wenn sie nicht bestimmbar ist (Ein-Tages-Einheiten).
function dayUnitAxis(cal, tuple) {
  const kDay = tuplePos(cal, timeCountOf(cal));
  const base = unitBase(cal, tuple);
  const ranges = segmentRanges(cal, base);
  if (ranges[kDay].max <= ranges[kDay].min) return null;
  const second = base.slice();
  second[kDay] = ranges[kDay].min + 1;
  const a = tupleToAxis(cal, base);
  const b = tupleToAxis(cal, second);
  return a === null || b === null ? null : b - a;
}

// Auswahl um ganze Tage verschieben (Achsen-Arithmetik, traegt ueber alle
// Grenzen); bei nicht bestimmbarer Schrittweite unveraendert.
function shiftDays(cal, tuple, delta) {
  const unit = dayUnitAxis(cal, tuple);
  const axis = tupleToAxis(cal, tuple);
  if (unit === null || axis === null) return tuple;
  const next = axisToTuple(cal, axis + unit * BigInt(delta));
  return next || tuple;
}

// Auswahl um eine Gitter-Einheit (z.B. Monat) verschieben.
function shiftUnit(cal, tuple, delta) {
  const kDay = tuplePos(cal, timeCountOf(cal));
  const unit = dayUnitAxis(cal, tuple);
  if (unit === null) return tuple;
  const base = unitBase(cal, tuple);
  const baseAxis = tupleToAxis(cal, base);
  if (baseAxis === null) return tuple;
  let targetBase;
  if (delta > 0) {
    const ranges = segmentRanges(cal, base);
    const days = BigInt(ranges[kDay].max - ranges[kDay].min + 1);
    targetBase = axisToTuple(cal, baseAxis + days * unit);
  } else {
    const prevLast = axisToTuple(cal, baseAxis - unit);
    targetBase = prevLast ? unitBase(cal, prevLast) : null;
  }
  if (!targetBase) return tuple;
  // Tages-Position moeglichst erhalten (auf die neue Einheit geklemmt).
  const out = targetBase.slice();
  out[kDay] = tuple[kDay];
  for (let k = tuple.length - 1; k > kDay; k--) out[k] = tuple[k];
  return clampTuple(cal, out);
}

// Auswahl um eine oberste Einheit (Jahr) verschieben.
function shiftTop(cal, tuple, delta) {
  const out = tuple.slice();
  out[0] += delta;
  return clampTuple(cal, out);
}

// Sprung zum Jahr 1 einer Epoche (ueber die kanonische Form, damit die
// Epochen-Abbildung des Kerns die interne Jahres-Zahl liefert).
function epochStartTuple(cal, epochIndex) {
  const timeCount = timeCountOf(cal);
  const dateCount = cal.levels.length - timeCount;
  const segs = ['1'];
  for (let k = 1; k < dateCount; k++) {
    segs.push(String(cal.levels[cal.levels.length - 1 - k].start));
  }
  const epoch = cal.epochs[epochIndex];
  const label = epoch.abbr || epoch.name || `#${epochIndex + 1}`;
  const parsed = parseCanonical(cal, `${segs.join('-')} ${label}`);
  return parsed.ok ? parsed.tuple : null;
}

// --- Rendering ------------------------------------------------------------------------

function labelFor(level, seg) {
  const pos = seg - level.start;
  return level.names && level.names[pos] != null ? level.names[pos] : String(seg);
}

// Kopf-Beschriftung der Gitter-Einheit: benannte Einheit + Anzeige-Jahr
// (+ Epochen-Kuerzel ausserhalb der letzten Epoche).
function unitLabel(cal, tuple) {
  const timeCount = timeCountOf(cal);
  const top = cal.levels.length - 1;
  const ep = epochOf(cal, tuple);
  const parts = [];
  // Ebenen zwischen Gitter-Ebene und oberster Ebene, klein nach gross.
  for (let i = timeCount + 1; i < top; i++) {
    parts.push(labelFor(cal.levels[i], tuple[tuplePos(cal, i)]));
  }
  let yearPart = ep ? String(ep.year) : String(tuple[0]);
  if (ep && ep.index < cal.epochs.length - 1) {
    yearPart += ` ${cal.epochs[ep.index].abbr || cal.epochs[ep.index].name || `#${ep.index + 1}`}`;
  }
  parts.push(yearPart);
  return parts.join(' ');
}

function buildSelect(id, entries, currentValue, onChange) {
  const select = document.createElement('select');
  select.id = id;
  select.className = 'settings-input calendar-picker-select';
  for (const entry of entries) {
    const option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.label;
    select.appendChild(option);
  }
  select.value = currentValue;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function headCell(labelKey, control) {
  const wrap = document.createElement('label');
  wrap.className = 'calendar-picker-headcell';
  const span = document.createElement('span');
  span.textContent = t(labelKey);
  wrap.append(span, control);
  return wrap;
}

// Gitter der Gitter-Einheit: mit Zyklus als Spalten-Gitter (Zyklus-Namen als
// Kopf, Nummern-Spalte bei Nummerierungs-Regel, Rand-Tage der Nachbar-
// Einheiten anwaehlbar), sonst fortlaufende Liste der Einheit.
function renderGrid(container) {
  const { cal, tuple } = session;
  const timeCount = timeCountOf(cal);
  const dayLevel = cal.levels[timeCount];
  const kDay = tuplePos(cal, timeCount);
  const cycle = cal.cycles.find((c) => c.of === dayLevel.id) || null;
  const unit = dayUnitAxis(cal, tuple);
  const base = unitBase(cal, tuple);
  const ranges = segmentRanges(cal, base);
  const dayCount = ranges[kDay].max - ranges[kDay].min + 1;

  const grid = document.createElement('div');
  grid.className = 'calendar-grid calendar-picker-grid';
  grid.id = 'calendar-picker-grid';

  const selectDayTuple = (dayTuple) => {
    session.tuple = dayTuple;
    renderSession();
    focusSelectedDay();
  };
  const dayButton = (dayTuple, inUnit) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'calendar-cell calendar-day-btn calendar-picker-day';
    btn.textContent = String(dayTuple[kDay]);
    if (!inUnit) btn.classList.add('other-month');
    const isSelected = dayTuple.every((v, k) => v === session.tuple[k] || k > kDay);
    if (isSelected) btn.classList.add('selected');
    btn.addEventListener('click', () => {
      const out = dayTuple.slice();
      for (let k = kDay + 1; k < out.length; k++) out[k] = session.tuple[k];
      selectDayTuple(out);
    });
    return btn;
  };

  if (cycle && unit !== null) {
    const withNumber = !!cycle.numbering;
    grid.style.gridTemplateColumns = `${withNumber ? 'auto ' : ''}repeat(${cycle.length}, 1fr)`;
    if (withNumber) {
      const corner = document.createElement('span');
      corner.className = 'calendar-cell calendar-head calendar-week-col';
      corner.textContent = cycle.name;
      grid.appendChild(corner);
    }
    for (let p = 0; p < cycle.length; p++) {
      const head = document.createElement('span');
      head.className = 'calendar-cell calendar-head';
      head.textContent = cycle.names ? cycle.names[p] : String(p + 1);
      grid.appendChild(head);
    }
    const baseAxis = tupleToAxis(cal, base);
    const info = cycleAt(cal, base, cycle.id);
    const startAxis = baseAxis - BigInt(info.position) * unit;
    const rows = Math.ceil((info.position + dayCount) / cycle.length);
    for (let row = 0; row < rows; row++) {
      const rowFirst = axisToTuple(cal, startAxis + BigInt(row * cycle.length) * unit);
      if (!rowFirst) break;
      if (withNumber) {
        const numCell = document.createElement('span');
        numCell.className = 'calendar-cell calendar-week-col date-picker-week';
        const rowInfo = cycleAt(cal, rowFirst, cycle.id);
        numCell.textContent = rowInfo && rowInfo.number !== null ? String(rowInfo.number) : '';
        grid.appendChild(numCell);
      }
      for (let col = 0; col < cycle.length; col++) {
        const cellTuple = axisToTuple(cal, startAxis + BigInt(row * cycle.length + col) * unit);
        if (!cellTuple) continue;
        const inUnit = cellTuple.every((v, k) => k >= kDay || v === base[k]);
        grid.appendChild(dayButton(cellTuple, inUnit));
      }
    }
  } else {
    // Fortlaufende Liste der Einheit (kein Zyklus definiert).
    grid.classList.add('calendar-picker-list');
    for (let d = ranges[kDay].min; d <= ranges[kDay].max; d++) {
      const dayTuple = base.slice();
      dayTuple[kDay] = d;
      grid.appendChild(dayButton(dayTuple, true));
    }
  }
  container.appendChild(grid);
}

// Zeit-Segmente gemaess den Zeit-Ebenen (eine Stelle je Ebene, Maxima aus
// den Ebenen-Faktoren; Umlauf beim Steppen, Ziffern haengen an).
function renderTimeRow(container) {
  const { cal, tuple } = session;
  const timeCount = timeCountOf(cal);
  if (timeCount === 0) return;
  const row = document.createElement('div');
  row.className = 'calendar-picker-time';
  const label = document.createElement('span');
  label.className = 'calendar-picker-time-label';
  label.textContent = t('calendarPicker.time');
  row.appendChild(label);
  const ranges = segmentRanges(cal, tuple);
  const dateCount = cal.levels.length - timeCount;
  for (let k = dateCount; k < cal.levels.length; k++) {
    if (k > dateCount) {
      const sep = document.createElement('span');
      sep.className = 'date-picker-time-colon';
      sep.textContent = ':';
      row.appendChild(sep);
    }
    const seg = document.createElement('span');
    seg.className = 'date-picker-time-digit calendar-picker-time-seg';
    seg.tabIndex = 0;
    seg.dataset.k = String(k);
    const width = String(ranges[k].max).length;
    seg.textContent = String(tuple[k]).padStart(width, '0');
    seg.addEventListener('keydown', (e) => {
      const r = segmentRanges(cal, session.tuple)[k];
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        const span = r.max - r.min + 1;
        const next =
          ((session.tuple[k] - r.min + (e.key === 'ArrowUp' ? 1 : -1) + span) % span) + r.min;
        session.tuple = session.tuple.slice();
        session.tuple[k] = next;
        renderSession();
        focusTimeSeg(k);
      } else if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        let v = session.tuple[k] * 10 + Number(e.key);
        if (v > r.max) v = Number(e.key);
        if (v < r.min) v = r.min;
        session.tuple = session.tuple.slice();
        session.tuple[k] = v;
        renderSession();
        focusTimeSeg(k);
      }
    });
    row.appendChild(seg);
  }
  container.appendChild(row);
}

// Umrechnungs-Anzeige: der gewaehlte Zeitpunkt in allen Parallel-Kalendern
// des Blocks; Klick wechselt den aktiven Kalender dorthin.
function renderConversions(container) {
  const { block, cal, tuple, target } = session;
  const others = block.calendars.filter((c) => c.id !== cal.id && c.id !== (target && target.id));
  if (others.length === 0) return;
  const head = document.createElement('div');
  head.className = 'calendar-picker-conv-head';
  head.textContent = t('calendarPicker.conversions');
  container.appendChild(head);
  for (const other of others) {
    const result = convertBetween(cal, tuple, other);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'btn calendar-picker-conv';
    row.dataset.calendarId = other.id;
    row.textContent = result.ok
      ? `${other.name}: ${formatTuple(other, result.tuple)}`
      : `${other.name}: —`;
    row.disabled = !result.ok;
    row.addEventListener('click', () => {
      if (!result.ok) return;
      setSessionCalendar(other, result.tuple);
      renderSession();
    });
    container.appendChild(row);
  }
}

function focusSelectedDay() {
  const btn = popupEl.querySelector('.calendar-picker-day.selected');
  if (btn) btn.focus();
}

function focusTimeSeg(k) {
  const seg = popupEl.querySelector(`.calendar-picker-time-seg[data-k="${k}"]`);
  if (seg) seg.focus();
}

// Kompletter Neuaufbau des Popup-Inhalts (der Aufbau ist kalender-abhaengig
// dynamisch — Segment-Zahl, Spalten-Zahl, Parallel-Kalender).
function renderSession() {
  const { config, block, cal, tuple } = session;
  popupEl.innerHTML = '';

  // Kopf: Block- und Kalender-Auswahl (entfaellt bei genau einem Eintrag),
  // Epochen-Wahl.
  const headRow = document.createElement('div');
  headRow.className = 'calendar-picker-head';
  if (config.blocks.length > 1) {
    headRow.appendChild(
      headCell(
        'calendarPicker.block',
        buildSelect(
          'calendar-picker-block',
          config.blocks.map((b) => ({ value: b.id, label: b.name })),
          block.id,
          (value) => {
            const nextBlock = config.blocks.find((b) => b.id === value);
            if (!nextBlock || nextBlock.calendars.length === 0) return;
            session.block = nextBlock;
            // Bloecke sind bewusst nicht umrechenbar: Wechsel springt zum
            // Anker des Ziel-Kalenders.
            setSessionCalendar(nextBlock.calendars[0], null);
            renderSession();
          },
        ),
      ),
    );
  }
  if (block.calendars.length > 1) {
    headRow.appendChild(
      headCell(
        'calendarPicker.calendar',
        buildSelect(
          'calendar-picker-calendar',
          block.calendars.map((c) => ({ value: c.id, label: c.name })),
          (session.target || cal).id,
          (value) => {
            const next = block.calendars.find((c) => c.id === value);
            if (!next) return;
            const converted = convertBetween(cal, tuple, next);
            setSessionCalendar(next, converted.ok ? converted.tuple : null);
            renderSession();
          },
        ),
      ),
    );
  }
  const ep = epochOf(cal, tuple);
  headRow.appendChild(
    headCell(
      'calendarPicker.epoch',
      buildSelect(
        'calendar-picker-epoch',
        cal.epochs.map((e, i) => ({ value: String(i), label: e.name || e.abbr || `#${i + 1}` })),
        String(ep ? ep.index : cal.epochs.length - 1),
        (value) => {
          const target = epochStartTuple(cal, Number(value));
          if (!target) return;
          session.tuple = target;
          renderSession();
        },
      ),
    ),
  );
  popupEl.appendChild(headRow);

  // Navigation: oberste Einheit (doppelt) und Gitter-Einheit (einfach).
  const nav = document.createElement('div');
  nav.className = 'date-picker-cal-head calendar-picker-nav';
  const mkNav = (id, label, titleKey, handler) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn date-picker-nav';
    btn.id = id;
    btn.innerHTML = label;
    btn.title = t(titleKey);
    btn.addEventListener('click', handler);
    return btn;
  };
  const monthLabel = document.createElement('span');
  monthLabel.className = 'date-picker-month-label';
  monthLabel.id = 'calendar-picker-unit-label';
  monthLabel.textContent = unitLabel(cal, tuple);
  const hasUnitNav = cal.levels.length - timeCountOf(cal) > 1;
  nav.append(
    mkNav('calendar-picker-prev-top', '&#171;', 'calendarPicker.prevTop', () => {
      session.tuple = shiftTop(cal, session.tuple, -1);
      renderSession();
    }),
  );
  if (hasUnitNav) {
    nav.append(
      mkNav('calendar-picker-prev', '&#8249;', 'calendarPicker.prevUnit', () => {
        session.tuple = shiftUnit(cal, session.tuple, -1);
        renderSession();
      }),
    );
  }
  nav.appendChild(monthLabel);
  if (hasUnitNav) {
    nav.append(
      mkNav('calendar-picker-next', '&#8250;', 'calendarPicker.nextUnit', () => {
        session.tuple = shiftUnit(cal, session.tuple, 1);
        renderSession();
      }),
    );
  }
  nav.append(
    mkNav('calendar-picker-next-top', '&#187;', 'calendarPicker.nextTop', () => {
      session.tuple = shiftTop(cal, session.tuple, 1);
      renderSession();
    }),
  );
  popupEl.appendChild(nav);

  renderGrid(popupEl);
  renderTimeRow(popupEl);

  const refBtn = document.createElement('button');
  refBtn.type = 'button';
  refBtn.className = 'btn date-picker-today';
  refBtn.id = 'calendar-picker-reference';
  refBtn.textContent = t('calendarPicker.reference');
  refBtn.addEventListener('click', () => {
    session.tuple = session.target
      ? zeroTupleInBase(session.target, session.cal) || session.cal.blockAnchor.slice()
      : session.cal.blockAnchor.slice();
    renderSession();
    focusSelectedDay();
  });
  popupEl.appendChild(refBtn);

  renderConversions(popupEl);

  const buttons = document.createElement('div');
  buttons.className = 'date-picker-buttons';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn';
  cancelBtn.id = 'calendar-picker-cancel';
  cancelBtn.textContent = t('dialog.cancel');
  cancelBtn.addEventListener('click', () => closeSession(null));
  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = 'btn btn-primary';
  okBtn.id = 'calendar-picker-ok';
  okBtn.textContent = t('dialog.ok');
  okBtn.addEventListener('click', () => accept());
  buttons.append(cancelBtn, okBtn);
  popupEl.appendChild(buttons);
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
    if (e.target && e.target.classList && e.target.classList.contains('btn')) {
      // Buttons (Navigation, Referenz, Entsprechung, Abbrechen) loesen sich
      // selbst aus; nur ausserhalb gilt Enter als Uebernehmen.
      if (e.target.id === 'calendar-picker-cancel') {
        e.preventDefault();
        e.stopPropagation();
        closeSession(null);
        return;
      }
      if (
        e.target.classList.contains('calendar-picker-day') ||
        e.target.id === 'calendar-picker-ok'
      ) {
        e.preventDefault();
        e.stopPropagation();
        accept();
      } else {
        e.stopPropagation();
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    accept();
    return;
  }
  // Pfeil-Navigation im Gitter (Zeit-Segmente behandeln ihre Tasten selbst).
  if (e.target && e.target.classList && e.target.classList.contains('calendar-picker-time-seg')) {
    return;
  }
  const cycle =
    session.cal.cycles.find((c) => c.of === session.cal.levels[timeCountOf(session.cal)].id) ||
    null;
  const rowLen = cycle ? cycle.length : 10;
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -rowLen, ArrowDown: rowLen }[e.key];
  if (delta !== undefined) {
    e.preventDefault();
    e.stopPropagation();
    session.tuple = shiftDays(session.cal, session.tuple, delta);
    renderSession();
    focusSelectedDay();
    return;
  }
  if (e.key === 'PageUp' || e.key === 'PageDown') {
    e.preventDefault();
    e.stopPropagation();
    session.tuple = shiftUnit(session.cal, session.tuple, e.key === 'PageUp' ? -1 : 1);
    renderSession();
    focusSelectedDay();
  }
}

// Erst unsichtbar messen, dann an den Anker klemmen (Muster date-picker.js).
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

// Oeffnet den Picker. Optionen:
//   config           normalisierte calendarSystems-Konfiguration (Pflicht)
//   x, y             Viewport-Anker (geklemmt; ohne Anker mittig)
//   calendarName     Vorwahl des Kalenders ueber den Bezugsnamen
//   value            Vorbelegung als kanonischer Wert (Klick-Bearbeitung)
// Ergebnis: { text, calendarName, calendarId, blockId, tuple, epochIndex }
// oder null (Abbruch bzw. unbrauchbare Konfiguration).
export function showCalendarPicker(options = {}) {
  const config = options.config;
  if (!config || !Array.isArray(config.blocks)) return Promise.resolve(null);
  let block = null;
  let cal = null;
  if (options.calendarName) {
    const found = findCalendarByName(config, options.calendarName);
    if (found) {
      block = found.block;
      cal = found.calendar;
    }
  }
  if (!cal) {
    block = config.blocks.find((b) => b.calendars.length > 0) || null;
    cal = block ? block.calendars[0] : null;
  }
  if (!cal) return Promise.resolve(null);

  let tuple = null;
  if (typeof options.value === 'string' && options.value.trim() !== '') {
    const parsed = parseCanonical(cal, options.value);
    if (parsed.ok) tuple = parsed.tuple;
  }

  ensurePopup();
  if (session) closeSession(null);
  return new Promise((resolve) => {
    // 4T-000748: Bei einer Ableitung zeigt der Picker ihren Bezug; der
    // uebernommene Wert bleibt der der Ableitung.
    session = {
      resolve,
      config,
      block,
      cal,
      tuple: tuple || cal.blockAnchor.slice(),
      target: null,
    };
    setSessionCalendar(cal, tuple);
    renderSession();
    positionPopup(options.x, options.y);
    document.addEventListener('mousedown', onDocumentMousedown, true);
    setTimeout(() => {
      if (session) focusSelectedDay();
    }, 0);
  });
}

// --- 4T-000546 (Epic 3E-000097): Editor-Anbindung der Wert-Syntax ---------------------------

// Anker unterhalb der Cursor-Position (Muster date-picker.js).
function anchorForPos(view, pos) {
  const coords = view.coordsAtPos(pos);
  if (coords) return { x: coords.left, y: coords.bottom + 4 };
  const rect = view.dom.getBoundingClientRect();
  return { x: rect.left + 40, y: rect.top + 40 };
}

function applyResult(view, from, to, text) {
  // Programmatischer Dispatch wird von EditorState.readOnly nicht
  // blockiert — expliziter Guard (Muster date-picker.js).
  if (view.state.readOnly) return;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
}

// Quelltext-Form eines Picker-Ergebnisses (kanonischer Wert mit
// Kalender-Nennung).
function resultToSource(result) {
  return `@{${result.calendarName}: ${result.text}}`;
}

// Kommando-Pfad: Picker am Cursor, Ergebnis ersetzt die aktive Selektion
// (ein Undo-Schritt, Muster openDatePickerAtSelection).
export async function openCalendarPickerAtSelection(view) {
  const anchor = anchorForPos(view, view.state.selection.main.head);
  const result = await showCalendarPicker({ config: getAreaCalendarConfig(), ...anchor });
  if (!result) {
    view.focus();
    return;
  }
  const range = view.state.selection.main;
  applyResult(view, range.from, range.to, resultToSource(result));
}

// Klick-Pfad: Ergebnis ersetzt exakt [from, to); expected sichert gegen
// zwischenzeitliche Dokument-Aenderungen (Muster openDatePickerForRange).
export async function openCalendarPickerForRange(view, { from, to, expected, ...pickerOptions }) {
  const anchor = anchorForPos(view, from);
  const result = await showCalendarPicker({
    config: getAreaCalendarConfig(),
    ...anchor,
    ...pickerOptions,
  });
  if (!result) {
    view.focus();
    return;
  }
  if (to > view.state.doc.length) return;
  if (typeof expected === 'string' && view.state.sliceDoc(from, to) !== expected) return;
  applyResult(view, from, to, resultToSource(result));
}

// Klick-Dekoration fuer Quelltext- UND Live-Modus (Muster dateValuePlugin):
// @{…}-Werte werden als Mark mit exaktem Doc-Bereich dekoriert; Klick
// oeffnet den vorbelegten Picker, Ersetzen an Ort und Stelle in einem
// Undo-Schritt. Ausschluesse: read-only, Code, Frontmatter, aktive
// Cursor-Zeilen. Im Live-Modus ersetzen die Badge-Widgets (live-widgets.js)
// dieselben Bereiche; deren data-Attribute sprechen denselben mousedown-
// Handler an (kein zweiter Klick-Pfad).
// 4T-000943 (Epic 3E-000197): `modifierOnly` wie bei den ISO-Werten (E2).
function calendarValueMarkDeco(from, to, modifierOnly) {
  const attributes = {
    'data-live-calvalue-from': String(from),
    'data-live-calvalue-to': String(to),
  };
  if (modifierOnly) attributes['data-live-calvalue-mod'] = '1';
  return Decoration.mark({
    class: modifierOnly
      ? 'cm-live-calendar-value cm-live-calendar-value-mod'
      : 'cm-live-calendar-value',
    attributes,
  });
}

function buildCalendarValueDecorations(view) {
  const { state } = view;
  if (state.readOnly || !isExtensionActive('custom-calendars')) return Decoration.none;
  const frontmatter = detectFrontmatterLines(state.doc);
  const frontmatterEndLine = frontmatter ? frontmatter.toLine : 0;
  const activeLines = activeLineSet(state);
  const ranges = [];
  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to);
    for (const v of findCalendarValues(text)) {
      const docFrom = from + v.from;
      const docTo = from + v.to;
      if (positionInsideCode(state, docFrom)) continue;
      const line = state.doc.lineAt(docFrom);
      if (line.number <= frontmatterEndLine) continue;
      // 4T-000943 (Epic 3E-000197): wie bei den ISO-Werten, siehe E2 im Epic.
      const inAktiverZeile = activeLines.has(line.number);
      if (docTo > line.to) continue;
      ranges.push(calendarValueMarkDeco(docFrom, docTo, inAktiverZeile).range(docFrom, docTo));
    }
  }
  return Decoration.set(ranges, true);
}

export const calendarValuePlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildCalendarValueDecorations(view);
    }
    update(update) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.transactions.length > 0
      ) {
        this.decorations = buildCalendarValueDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(event, view) {
        if (event.button !== 0) return false;
        const tgt = event.target;
        if (!(tgt instanceof Element)) return false;
        const el = tgt.closest('[data-live-calvalue-from]');
        if (!el) return false;
        if (view.state.readOnly) return false;
        // 4T-000943 (Epic 3E-000197): Strg-Klick in der Zeile mit dem Cursor.
        if (el.getAttribute('data-live-calvalue-mod') === '1' && !event.ctrlKey && !event.metaKey) {
          return false;
        }
        const from = parseInt(el.getAttribute('data-live-calvalue-from'), 10);
        const to = parseInt(el.getAttribute('data-live-calvalue-to'), 10);
        if (Number.isNaN(from) || Number.isNaN(to) || from < 0 || to <= from) return false;
        if (to > view.state.doc.length) return false;
        // Wert frisch aus dem Doc lesen (Muster dateValuePlugin).
        const raw = view.state.sliceDoc(from, to);
        const parsed = parseCalendarValueRaw(raw);
        if (!parsed) return false;
        event.preventDefault();
        openCalendarPickerForRange(view, {
          from,
          to,
          expected: raw,
          calendarName: parsed.name,
          value: parsed.value,
        });
        return true;
      },
    },
  },
);
