// @vitest-environment jsdom
// 4T-0752 (Epic 3E-0146): Gemeinsamer Gitter-Aufbau des Renderers. Geprüft
// sind die Struktur (Kopfzeile, Zellen-Anzahl, Reihenfolge), die abschaltbare
// Kalenderwochen-Spalte und die Zustands-Klassen der Tages-Zelle.
//
// Der Wächter-Charakter liegt in der Zellen-Anzahl: Kopfzeile plus sechs oder
// fünf Wochen ergeben eine feste Zahl, ein verrutschter Durchlauf fällt damit
// sofort auf.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDayCell,
  monthLabel,
  renderGridRows,
  renderMonthGrid,
  weekdayLabels,
} from '../../../src/renderer/modules/calendar/month-grid-view.js';
import { monthGrid, weekRow } from '../../../src/shared/journal-core.js';

let grid;

beforeEach(() => {
  document.body.innerHTML = '<div id="grid"></div>';
  grid = document.getElementById('grid');
});

function tagCounts() {
  return {
    spans: grid.querySelectorAll('span').length,
    buttons: grid.querySelectorAll('button').length,
    heads: grid.querySelectorAll('.calendar-head').length,
    weekCells: grid.querySelectorAll('.calendar-week-col:not(.calendar-head)').length,
    days: grid.querySelectorAll('.calendar-day-btn').length,
  };
}

describe('month-grid-view: Kopfzeile und Zeilen', () => {
  it('zeichnet Ecke, sieben Wochentage und je Woche acht Zellen', () => {
    // Juli 2026 beginnt an einem Mittwoch und braucht fünf Wochen-Zeilen.
    renderMonthGrid(grid, {
      year: 2026,
      monthIndex: 6,
      weekColumnLabel: 'KW',
      dayCell: (day) => createDayCell(day, { todayIso: '2026-07-27', as: 'span' }),
    });
    const counts = tagCounts();
    expect(counts.heads).toBe(8); // Ecke plus sieben Wochentage
    expect(counts.weekCells).toBe(5);
    expect(counts.days).toBe(35);
    expect(grid.firstChild.textContent).toBe('KW');
  });

  it('ohne Kalenderwochen-Spalte entfallen Ecke und Wochen-Zellen', () => {
    renderMonthGrid(grid, {
      year: 2026,
      monthIndex: 6,
      showWeekColumn: false,
      dayCell: (day) => createDayCell(day, { as: 'span' }),
    });
    const counts = tagCounts();
    expect(counts.heads).toBe(7);
    expect(counts.weekCells).toBe(0);
    expect(counts.days).toBe(35);
  });

  it('ein zweiter Aufruf ersetzt den Inhalt, statt ihn zu verdoppeln', () => {
    const args = {
      year: 2026,
      monthIndex: 6,
      weekColumnLabel: 'KW',
      dayCell: (day) => createDayCell(day, { as: 'span' }),
    };
    renderMonthGrid(grid, args);
    const erste = grid.childElementCount;
    renderMonthGrid(grid, args);
    expect(grid.childElementCount).toBe(erste);
  });

  it('eine eigene Wochen-Zelle wird uebernommen', () => {
    renderMonthGrid(grid, {
      year: 2026,
      monthIndex: 6,
      weekColumnLabel: 'KW',
      weekCell: (row) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'calendar-cell calendar-week-col calendar-week-btn';
        btn.textContent = String(row.week.week);
        return btn;
      },
      dayCell: (day) => createDayCell(day, { as: 'span' }),
    });
    expect(grid.querySelectorAll('.calendar-week-btn').length).toBe(5);
  });
});

// 4T-1063 (Epic 3E-0212): Zeilen-Durchlauf als eigener Einstieg. Der
// Waechter-Charakter liegt im Gleichlauf: renderMonthGrid muss exakt das
// erzeugen, was renderGridRows mit den Zeilen desselben Monats erzeugt.
describe('month-grid-view: renderGridRows', () => {
  it('zeichnet eine einzelne Wochen-Zeile mit Kopfzeile und KW-Spalte', () => {
    renderGridRows(grid, [weekRow(Date.UTC(2026, 7, 20))], {
      weekColumnLabel: 'KW',
      dayCell: (day) => createDayCell(day, { as: 'span' }),
    });
    const counts = tagCounts();
    expect(counts.heads).toBe(8);
    expect(counts.weekCells).toBe(1);
    expect(counts.days).toBe(7);
  });

  it('erzeugt fuer einen ganzen Monat dasselbe DOM wie renderMonthGrid', () => {
    const dayCell = (day) => createDayCell(day, { todayIso: '2026-07-27', as: 'span' });
    renderMonthGrid(grid, { year: 2026, monthIndex: 6, weekColumnLabel: 'KW', dayCell });
    const ueberMonat = grid.innerHTML;
    renderGridRows(grid, monthGrid(2026, 6), { weekColumnLabel: 'KW', dayCell });
    expect(grid.innerHTML).toBe(ueberMonat);
  });

  it('ohne Zeilen bleibt die Kopfzeile allein stehen', () => {
    renderGridRows(grid, [], {
      weekColumnLabel: 'KW',
      dayCell: (day) => createDayCell(day, { as: 'span' }),
    });
    const counts = tagCounts();
    expect(counts.heads).toBe(8);
    expect(counts.days).toBe(0);
  });
});

describe('month-grid-view: Tages-Zelle', () => {
  it('traegt Grundklassen, Tages-Zahl und die beiden Zustands-Klassen', () => {
    const tag = { ms: 0, iso: '2026-07-27', day: 27, inMonth: true };
    const zelle = createDayCell(tag, { todayIso: '2026-07-27' });
    expect(zelle.tagName).toBe('BUTTON');
    expect(zelle.type).toBe('button');
    expect(zelle.className).toBe('calendar-cell calendar-day-btn today');
    expect(zelle.textContent).toBe('27');
  });

  it('markiert Tage ausserhalb des Monats und akzeptiert eine Zusatz-Klasse', () => {
    const tag = { ms: 0, iso: '2026-08-02', day: 2, inMonth: false };
    const zelle = createDayCell(tag, { todayIso: '2026-07-27', as: 'span', className: 'extra' });
    expect(zelle.tagName).toBe('SPAN');
    expect(zelle.classList.contains('extra')).toBe(true);
    expect(zelle.classList.contains('other-month')).toBe(true);
    expect(zelle.classList.contains('today')).toBe(false);
  });
});

describe('month-grid-view: Beschriftungen', () => {
  it('liefert sieben Wochentage, beginnend am Montag', () => {
    const labels = weekdayLabels();
    expect(labels).toHaveLength(7);
    expect(new Set(labels).size).toBe(7);
  });

  it('die Monats-Bezeichnung nennt Monat und Jahr', () => {
    const label = monthLabel(1960, 8);
    expect(label).toContain('1960');
  });
});
