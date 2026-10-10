// @vitest-environment jsdom
// Zwei Nachzügler des Epics 3E-000307 an der Pflege einer Zeitrechnung
// (Einstellungen › Kalender-Systeme):
// - 4T-001863: Kopfzeile eines Zyklus und einer Gruppierung tragen über
//   Namens- und Mehrzahl-Feld je eine sichtbare Beschriftung, gebaut wie an
//   den Ebenen (umschließendes label, damit Bildschirmleser das Feld benennen).
// - 4T-002065: Der Hinweis auf die abgeleiteten Zeitrechnungen hat eine eigene
//   Einzahl-Fassung für genau eine Ableitung. Rückfrage und Lösch-Sperre des
//   Hauptprozesses prüft test/unit/kalender-epochen-rueckfrage.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
import { normalizeCalendarConfig } from '../../../src/shared/calendar/calendar-config.js';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const { calendarToDraft } =
  await import('../../../src/renderer/modules/settings/settings-calendar-model.js');
const { buildCalendarEditor } =
  await import('../../../src/renderer/modules/settings/settings-calendar-editor.js');

// Bezug mit Woche und Quartal; daneben bis zu zwei Ableitungen.
const CONFIG = normalizeCalendarConfig({
  blocks: [
    {
      id: 'welt',
      calendars: [
        {
          id: 'eigen',
          name: 'Eigen',
          levels: [
            { id: 'tag', name: 'Tag', section: 'Datum', start: 1 },
            {
              id: 'monat',
              name: 'Monat',
              section: 'Datum',
              start: 1,
              rel: { type: 'factor', count: 30 },
            },
            {
              id: 'jahr',
              name: 'Jahr',
              section: 'Datum',
              start: 1,
              rel: { type: 'factor', count: 12 },
            },
          ],
          cycles: [{ id: 'woche', name: 'Woche', namePlural: 'Wochen', of: 'tag', length: 6 }],
          groups: [
            { id: 'quartal', name: 'Quartal', namePlural: 'Quartale', of: 'monat', size: 3 },
          ],
        },
        { id: 'projekt', name: 'Projekt', derivedFrom: 'eigen', zero: [10, 1, 1] },
        { id: 'reise', name: 'Reise', derivedFrom: 'eigen', zero: [12, 1, 1] },
      ],
    },
  ],
});
const [EIGEN, PROJEKT, REISE] = CONFIG.blocks[0].calendars;

// Baut den Editor des Bezugs in einem Block mit den gegebenen Ableitungen.
function baue(ableitungen) {
  const bezug = calendarToDraft(EIGEN);
  const block = { calendars: [bezug, ...ableitungen.map((c) => calendarToDraft(c))] };
  buildCalendarEditor(document.body, block, bezug, 0);
  return bezug;
}

// Die sichtbare Beschriftung eines Felds: der Text des umschließenden label
// ohne das Feld selbst — so liest ihn auch ein Bildschirmleser.
function beschriftung(id) {
  const feld = document.getElementById(id);
  const label = feld.closest('label');
  expect(label, `${id} steckt in keinem label`).not.toBeNull();
  expect(feld.labels[0]).toBe(label);
  return label.querySelector('span').textContent;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Beschriftung der Namens-Felder an Zyklus und Gruppierung (4T-001863)', () => {
  it('die Kopfzeile eines Zyklus trägt zwei sichtbare Beschriftungen', () => {
    baue([]);
    const kopf = document.getElementById('settings-calsys-cycle-0-0-name').closest('div');
    expect([...kopf.querySelectorAll(':scope > label > span')].map((s) => s.textContent)).toEqual([
      'Zyklus-Name',
      'Zyklus-Name (Mehrzahl)',
    ]);
    expect(beschriftung('settings-calsys-cycle-0-0-name')).toBe('Zyklus-Name');
    expect(beschriftung('settings-calsys-cycle-0-0-plural')).toBe('Zyklus-Name (Mehrzahl)');
  });

  it('die Zeile einer Gruppierung trägt zwei sichtbare Beschriftungen', () => {
    baue([]);
    expect(beschriftung('settings-calsys-group-0-0-name')).toBe('Gruppierungs-Name');
    expect(beschriftung('settings-calsys-group-0-0-plural')).toBe('Gruppierungs-Name (Mehrzahl)');
  });

  it('die Beschriftung steht auch bei gefüllten Feldern, die Eingaben landen im Entwurf', () => {
    const bezug = baue([]);
    const name = document.getElementById('settings-calsys-cycle-0-0-name');
    const mehrzahl = document.getElementById('settings-calsys-group-0-0-plural');
    expect(name.value).toBe('Woche');
    expect(mehrzahl.value).toBe('Quartale');
    name.value = 'Dekade';
    name.dispatchEvent(new Event('input'));
    mehrzahl.value = 'Viertel';
    mehrzahl.dispatchEvent(new Event('input'));
    expect(bezug.cycles[0].name).toBe('Dekade');
    expect(bezug.groups[0].namePlural).toBe('Viertel');
  });

  it('die Ebenen behalten ihre Beschriftungen Name und Mehrzahl', () => {
    baue([]);
    expect(beschriftung('settings-calsys-level-0-0-name')).toBe('Name');
    expect(beschriftung('settings-calsys-level-0-0-plural')).toBe('Mehrzahl');
  });
});

describe('Hinweis auf die abgeleiteten Zeitrechnungen (4T-002065)', () => {
  const hinweis = () => document.getElementById('settings-calsys-cal-dependents-0');

  it('genau eine Ableitung: Einzahl-Fassung', () => {
    baue([PROJEKT]);
    expect(hinweis().textContent).toBe(
      'Auf dieser Zeitrechnung steht eine abgeleitete: Projekt. Änderungen wirken auch dort.',
    );
  });

  it('zwei Ableitungen: Mehrzahl-Fassung', () => {
    baue([PROJEKT, REISE]);
    expect(hinweis().textContent).toBe(
      'Auf dieser Zeitrechnung stehen 2 abgeleitete: Projekt, Reise. Änderungen wirken auch dort.',
    );
  });

  it('ohne Ableitung kein Hinweis', () => {
    baue([]);
    expect(hinweis()).toBeNull();
  });
});
