// @vitest-environment jsdom
// 4T-002191 (Epic 3E-000353), Teil 2: Die Text-Schreibweise eines Datums liest
// jeden Teil bis zur sicheren Ganzzahl-Grenze.
//
// Befund aus 4T-002098 («Bekannter Rest»): Modell und Pflege nehmen jede
// sichere ganze Zahl an (sechzehn Ziffern), das Einlesen der Text-Schreibweise
// las je Teil höchstens fünfzehn Ziffern. Ein Datum mit sechzehnstelligem Jahr,
// das das Programm schreibt, las es damit nicht wieder ein, und die Vorschau
// eines Kalenders mit sechzehnstelligem Anker-Jahr zeigte «ungültiger Wert».
// Die Prüfung sitzt an vier Stellen des Rechen-Kerns (Datum und Uhrzeit, je in
// der gewöhnlichen und der abgeleiteten Schreibweise); jede Stelle hat hier
// einen eigenen Fall.
import { describe, it, expect, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
import {
  formatTuple,
  parseCanonical,
  tupleToAxis,
} from '../../../src/shared/calendar/calendar-core.js';
import { normalizeCalendarConfig } from '../../../src/shared/calendar/calendar-config.js';
import { createGregorianTemplate } from '../../../src/shared/calendar/calendar-template.js';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { t } = i18n;
const { readCalendarFromConfig } =
  await import('../../../src/renderer/modules/settings/settings-calendar-model.js');
const { renderCalendarSection } =
  await import('../../../src/renderer/modules/settings/settings-calendar-section.js');

const SECHZEHN_ZIFFERN = 1000000000000000;
const GROESSTER_SICHERER = Number.MAX_SAFE_INTEGER; // 9007199254740991

// Gregorianischer Kalender und eine Ableitung mit Nullpunkt 23.07.2026 im
// selben Block, so wie sie der Kern normalisiert.
function kalender() {
  const config = normalizeCalendarConfig({
    blocks: [
      {
        id: 'real',
        calendars: [
          createGregorianTemplate(),
          {
            id: 'abl',
            name: 'Ableitung',
            derivedFrom: 'gregorian',
            labelBefore: 'davor',
            labelAfter: 'danach',
            zero: [2026, 7, 23],
          },
        ],
      },
    ],
  });
  const [gregor, abgeleitet] = config.blocks[0].calendars;
  return { gregor, abgeleitet };
}

// Schreiben und wieder Lesen: derselbe Zeitpunkt auf der Achse.
function rundlauf(cal, tuple) {
  const text = formatTuple(cal, tuple);
  const gelesen = parseCanonical(cal, text);
  return { text, gelesen };
}

describe('4T-002191: Text-Schreibweise eines gewöhnlichen Kalenders', () => {
  it('4T-002191: ein sechzehnstelliges Jahr übersteht Schreiben und Lesen', () => {
    const { gregor } = kalender();
    const tuple = [SECHZEHN_ZIFFERN, 3, 5, 12, 30, 0];
    const { text, gelesen } = rundlauf(gregor, tuple);
    expect(text).toBe('1000000000000000-03-05 12:30:00');
    expect(gelesen.ok).toBe(true);
    expect(gelesen.tuple).toEqual(tuple);
    expect(tupleToAxis(gregor, gelesen.tuple)).toBe(tupleToAxis(gregor, tuple));
  });

  it('4T-002191: das größte sichere Jahr übersteht Schreiben und Lesen, auch vor der Zeitenwende', () => {
    const { gregor } = kalender();
    for (const tuple of [
      [GROESSTER_SICHERER, 12, 31, 0, 0, 0],
      [-SECHZEHN_ZIFFERN, 3, 5, 0, 0, 0],
    ]) {
      const { gelesen } = rundlauf(gregor, tuple);
      expect(gelesen.ok).toBe(true);
      expect(gelesen.tuple).toEqual(tuple);
    }
  });

  it('4T-002191: ein Wert über der sicheren Grenze bleibt ungültig', () => {
    const { gregor } = kalender();
    expect(parseCanonical(gregor, '9007199254740992-01-01')).toEqual({
      ok: false,
      code: 'malformed',
    });
    expect(parseCanonical(gregor, '12345678901234567890-01-01').ok).toBe(false);
    expect(parseCanonical(gregor, '2026-07-23 9007199254740992:00').code).toBe('malformed');
  });

  it('4T-002191: auch die Uhrzeit liest mehr als fünfzehn Ziffern, solange der Wert sicher ist', () => {
    const { gregor } = kalender();
    // Zweiundzwanzig Ziffern mit dem Wert 12: früher «malformed».
    const gelesen = parseCanonical(gregor, '2026-07-23 0000000000000000000012:30');
    expect(gelesen.ok).toBe(true);
    expect(gelesen.tuple).toEqual([2026, 7, 23, 12, 30, 0]);
  });
});

describe('4T-002191: Text-Schreibweise eines abgeleiteten Kalenders', () => {
  it('4T-002191: ein sechzehnstelliger Zähler übersteht Schreiben und Lesen', () => {
    const { abgeleitet } = kalender();
    const tuple = [1000000000002027, 3, 5, 12, 30, 0];
    const { text, gelesen } = rundlauf(abgeleitet, tuple);
    expect(text).toBe('1000000000000000-2-5 12:30:00');
    expect(gelesen.ok).toBe(true);
    expect(gelesen.tuple).toEqual(tuple);
  });

  it('4T-002191: in der Vergangenheits-Richtung ebenso', () => {
    const { abgeleitet } = kalender();
    const tuple = [-1000000000002027, 3, 5, 0, 0, 0];
    const { text, gelesen } = rundlauf(abgeleitet, tuple);
    expect(text).toBe('1000000000004053-9-26 davor');
    expect(gelesen.ok).toBe(true);
    expect(gelesen.tuple).toEqual(tuple);
  });

  it('4T-002191: Uhrzeit mit mehr als fünfzehn Ziffern und Wert über der Grenze', () => {
    const { abgeleitet } = kalender();
    const gelesen = parseCanonical(abgeleitet, '1-0-1 0000000000000000000012:30');
    expect(gelesen.ok).toBe(true);
    expect(gelesen.tuple.slice(3)).toEqual([12, 30, 0]);
    expect(parseCanonical(abgeleitet, '9007199254740992-0-1').code).toBe('malformed');
    expect(parseCanonical(abgeleitet, '1-0-1 9007199254740992:00').code).toBe('malformed');
  });
});

describe('4T-002191: Vorschau der Pflege bei sechzehnstelligem Anker-Jahr', () => {
  it('4T-002191: die Vorschau zeigt das Datum statt «ungültiger Wert»', async () => {
    const definition = {
      id: 'gregor',
      ...createGregorianTemplate(),
      name: 'Gregor',
      blockAnchor: [SECHZEHN_ZIFFERN, 1, 1, 0, 0, 0],
    };
    const config = normalizeCalendarConfig({
      blocks: [{ id: 'welt', name: 'Welt', calendars: [definition] }],
    });
    // Vorbedingung: Der Kern hat den Kalender samt Anker angenommen.
    expect(config.blocks[0].calendars[0].blockAnchor[0]).toBe(SECHZEHN_ZIFFERN);
    window.api.calendarGetConfig = vi.fn(async () => ({ hasArea: true, areaName: 'Welt', config }));
    const { draft } = await readCalendarFromConfig();
    delete window.api.calendarGetConfig;
    // Die Vorschau startet auf dem Anker (calendarToDraft).
    expect(draft.blocks[0].calendars[0].previewInput).toBe('1000000000000000-01-01');
    draft.openBlock = 0;
    document.body.innerHTML = '';
    renderCalendarSection(document.body, { calendar: draft });
    const vorschau = document.getElementById('settings-calsys-preview-0');
    expect(vorschau.textContent).not.toBe(t('settings.calendar.previewInvalidValue'));
    expect(vorschau.classList.contains('settings-calsys-preview-error')).toBe(false);
    expect(vorschau.textContent).toContain('1000000000000000-01-01');
  });
});
