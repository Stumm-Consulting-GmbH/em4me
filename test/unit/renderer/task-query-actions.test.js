// @vitest-environment jsdom
// 4T-000504 (Epic 3E-000096): Unit-Test der reinen Verschiebe-Wert-Berechnung
// postponedDateValue aus task-query-actions.js. Das Modul bindet beim Laden
// api aus modules/app/api.js und weitere Renderer-Module; der api-Stub stellt
// window.api und das minimale DOM-Geruest bereit (Muster task-states.test.js),
// bevor das Modul dynamisch importiert wird.
import { describe, it, expect } from 'vitest';
import './api-stub.js';

const { postponedDateValue } = await import('../../../src/renderer/modules/task-query-actions.js');

describe('postponedDateValue (4T-000504)', () => {
  const today = '2026-07-11';

  it('Zukunfts-Termin: day verschiebt um einen Tag', () => {
    expect(postponedDateValue({ date: '2099-01-01', time: null }, 'day', today)).toEqual({
      date: '2099-01-02',
      time: null,
    });
  });

  it('Zukunfts-Termin: week verschiebt um sieben Tage', () => {
    expect(postponedDateValue({ date: '2099-01-01', time: null }, 'week', today)).toEqual({
      date: '2099-01-08',
      time: null,
    });
  });

  it('ueberfaelliger Termin rechnet ab heute (morgen landet nie in der Vergangenheit)', () => {
    expect(postponedDateValue({ date: '2020-01-01', time: null }, 'day', today)).toEqual({
      date: '2026-07-12',
      time: null,
    });
  });

  it('die Uhrzeit bleibt unveraendert erhalten', () => {
    expect(postponedDateValue({ date: '2099-01-01', time: '14:30' }, 'day', today)).toEqual({
      date: '2099-01-02',
      time: '14:30',
    });
  });
});
