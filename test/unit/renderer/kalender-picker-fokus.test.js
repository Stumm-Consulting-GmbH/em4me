// @vitest-environment jsdom
// 4T-002212 (Epic 3E-000353): Fokus der Eingabe-Hilfe eines Kalender-Werts nach
// einem Neuaufbau. Der Neuaufbau entfernt das Bedienelement, das ihn ausgelöst
// hat; liegt der Fokus danach nicht im Fenster, erreicht die Escape-Taste
// dessen Tasten-Rückruf nicht mehr. `click()` setzt in jsdom keinen Fokus, der
// Klick-Fall bildet den Ausfall deshalb ab. Den Weg über die gebaute
// Oberfläche prüft test/e2e/funktionen/kalender-eingabehilfe-escape.spec.js.
//
// Die Übersetzung ist eine Attrappe, die den Schlüssel zurückgibt.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import { normalizeCalendarConfig } from '../../../src/shared/calendar/calendar-config.js';

vi.mock('../../../src/renderer/i18n.js', async (importOriginal) => ({
  ...(await importOriginal()),
  t: (key) => key,
}));

const { showCalendarPicker } =
  await import('../../../src/renderer/modules/calendar/calendar-picker.js');

// 30-Tage-Monate, 12-Monate-Jahre; zwei Zeitrechnungen mit verschiedenem
// Block-Anker, damit die Entsprechung eine eigene Zeile hat (Muster
// kalender-umrechnung-dialog.test.js).
function jahreskalender(id, anker) {
  return {
    id,
    name: id,
    levels: [
      { id: 'tag', name: 'Tag', section: 'Datum', start: 1 },
      {
        id: 'monat',
        name: 'Monat',
        section: 'Datum',
        start: 1,
        rel: { type: 'factor', count: 30 },
      },
      { id: 'jahr', name: 'Jahr', section: 'Datum', start: 1, rel: { type: 'factor', count: 12 } },
    ],
    ...(anker ? { blockAnchor: anker } : {}),
  };
}

// Zeitrechnung mit einer Zeit-Ebene vor den Datums-Ebenen (Zeit-Segment).
const UHRWERK = {
  id: 'uhrwerk',
  name: 'uhrwerk',
  levels: [
    { id: 'sekunde', name: 'Sekunde', section: 'Zeit', start: 0 },
    { id: 'tag', name: 'Tag', section: 'Datum', start: 1, rel: { type: 'factor', count: 100 } },
    { id: 'monat', name: 'Monat', section: 'Datum', start: 1, rel: { type: 'factor', count: 10 } },
  ],
};

const CONFIG = normalizeCalendarConfig({
  blocks: [
    {
      id: 'welt',
      name: 'Welt',
      calendars: [jahreskalender('Mond'), jahreskalender('Zahl', [5, 2, 3])],
    },
    { id: 'takt', name: 'Takt', calendars: [UHRWERK] },
  ],
});

const popup = () => document.getElementById('calendar-picker-popup');

function taste(el, key) {
  const ereignis = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  el.dispatchEvent(ereignis);
  return ereignis;
}

// Die Eingabe-Hilfe hängt ihr Fenster einmalig an und behält es; es bleibt
// stehen, alles andere wird vor jedem Fall entfernt.
beforeEach(() => {
  for (const el of [...document.body.children]) {
    if (el.id !== 'calendar-picker-popup') el.remove();
  }
});

describe('Eingabe-Hilfe: Fokus nach dem Neuaufbau (4T-002212)', () => {
  it('nach Klick auf eine Entsprechung liegt der Fokus im Fenster, und Escape schließt ohne Wert', async () => {
    const hilfe = showCalendarPicker({ config: CONFIG, calendarName: 'Mond', value: '6-03-07' });
    const zeile = popup().querySelector('.calendar-picker-conv');
    expect(zeile.dataset.calendarId).toBe('Zahl');
    zeile.click();
    expect(popup().contains(document.activeElement)).toBe(true);
    taste(document.activeElement, 'Escape');
    expect(await hilfe).toBeNull();
    expect(popup().hidden).toBe(true);
  });

  it('nach einer Ziffer im Zeit-Segment liegt der Fokus weiter in diesem Segment', async () => {
    const hilfe = showCalendarPicker({ config: CONFIG, calendarName: 'uhrwerk' });
    const segment = popup().querySelector('.calendar-picker-time-seg');
    const k = segment.dataset.k;
    segment.focus();
    taste(segment, '7');
    const aktiv = document.activeElement;
    expect(aktiv.classList.contains('calendar-picker-time-seg')).toBe(true);
    expect(aktiv.dataset.k).toBe(k);
    expect(aktiv.textContent).toMatch(/7$/);
    taste(aktiv, 'Escape');
    expect(await hilfe).toBeNull();
  });
});
