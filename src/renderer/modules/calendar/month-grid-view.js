// 4T-0752 (Epic 3E-0146): Gemeinsamer Aufbau des Monatsgitters im Renderer.
//
// Drei Stellen zeichnen dasselbe Gitter: das Kalender-Panel der Journale
// (klickbare Woche und Tage mit Eintrags-Punkt), das Popup der Datums-Eingabe
// (Auswahl-Zustand und Sperre) und der Kalender-Modus der Uhr (reine
// Anzeige). Gemeinsam sind Wochentags-Beschriftung, Monats-Bezeichnung,
// Kopfzeile und Zeilen-Durchlauf; verschieden sind allein die Zell-Inhalte,
// die deshalb beim Aufrufer bleiben.
//
// Das erzeugte DOM ist bewusst identisch mit dem, was die beiden aelteren
// Stellen zuvor selbst gebaut haben (gleiche Element-Arten, gleiche Klassen,
// gleiche Reihenfolge): Der Zusammenzug soll ihre Darstellung nicht
// veraendern, und ihre bestehenden Specs sind der Nachweis dafuer.
//
// Die Kalender-Mathematik kommt unveraendert aus dem Perioden-Kern
// (journal-core.js: monthGrid), den beide aelteren Stellen bereits nutzen.
'use strict';

import { getLanguage } from '../../i18n.js';
import { monthGrid } from '../../../shared/journal-core.js';

// Wochentags-Kopf lokalisiert ueber Intl in der App-Sprache; als Referenz
// dient eine bekannte Montag-Woche (der 2024-01-01 war ein Montag).
export function weekdayLabels() {
  const format = new Intl.DateTimeFormat(getLanguage(), { weekday: 'short' });
  const labels = [];
  for (let i = 0; i < 7; i++) {
    labels.push(format.format(new Date(2024, 0, 1 + i)));
  }
  return labels;
}

// Monats-Bezeichnung ("Juli 2026") in der App-Sprache. Die Uhrzeit 12 haelt
// die Formatierung von Zeitzonen-Verschiebungen um Mitternacht frei.
export function monthLabel(year, monthIndex) {
  return new Intl.DateTimeFormat(getLanguage(), { month: 'long', year: 'numeric' }).format(
    new Date(year, monthIndex, 1, 12),
  );
}

// Basis-Zelle eines Tages: Element-Art nach Bedarf ('button' fuer klickbare
// Gitter, 'span' fuer reine Anzeige), Grundklassen, Tages-Zahl sowie die
// beiden Zustands-Klassen, die alle drei Aufrufer gleich brauchen.
export function createDayCell(day, { todayIso, as = 'button', className = '' } = {}) {
  const el = document.createElement(as);
  if (as === 'button') el.type = 'button';
  el.className = `calendar-cell calendar-day-btn${className ? ` ${className}` : ''}`;
  el.textContent = String(day.day);
  if (!day.inMonth) el.classList.add('other-month');
  if (day.iso === todayIso) el.classList.add('today');
  return el;
}

/**
 * Zeichnet Kopfzeile und Zeilen eines Monats in ein Gitter-Element.
 *
 * @param {HTMLElement} grid          Ziel-Element (wird geleert).
 * @param {object} opts
 * @param {number} opts.year          Jahr des angezeigten Monats.
 * @param {number} opts.monthIndex    Monat 0..11.
 * @param {string} [opts.weekColumnLabel] Beschriftung der Ecke ueber der
 *                                    Kalenderwochen-Spalte.
 * @param {boolean} [opts.showWeekColumn=true] Kalenderwochen-Spalte zeichnen.
 *                                    Ist sie aus, entfallen Ecke und
 *                                    Wochen-Zellen, und das Gitter traegt
 *                                    sieben statt acht Spalten.
 * @param {(row: object) => HTMLElement} [opts.weekCell] Zelle der
 *                                    Kalenderwoche; ohne Angabe eine
 *                                    schlichte Anzeige-Zelle.
 * @param {(day: object, row: object) => HTMLElement} opts.dayCell Zelle eines
 *                                    Tages.
 */
export function renderMonthGrid(
  grid,
  { year, monthIndex, weekColumnLabel = '', showWeekColumn = true, weekCell, dayCell },
) {
  grid.innerHTML = '';
  if (showWeekColumn) {
    const corner = document.createElement('span');
    corner.className = 'calendar-cell calendar-head calendar-week-col';
    corner.textContent = weekColumnLabel;
    grid.appendChild(corner);
  }
  for (const label of weekdayLabels()) {
    const cell = document.createElement('span');
    cell.className = 'calendar-cell calendar-head';
    cell.textContent = label;
    grid.appendChild(cell);
  }
  for (const row of monthGrid(year, monthIndex)) {
    if (showWeekColumn) {
      grid.appendChild(weekCell ? weekCell(row) : defaultWeekCell(row));
    }
    for (const day of row.days) grid.appendChild(dayCell(day, row));
  }
}

function defaultWeekCell(row) {
  const el = document.createElement('span');
  el.className = 'calendar-cell calendar-week-col';
  el.textContent = String(row.week.week);
  return el;
}
