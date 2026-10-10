// @vitest-environment jsdom
// 4T-001863 (Epic 3E-000307): Einzahl und Mehrzahl der Einheiten-Namen an den
// beiden Anzeige-Stellen mit Anzahl — Abzeichen eines Kalender-Werts im
// Dokument und Vorschau der Zeitspanne in den Einstellungen — sowie auf dem Weg
// durch die Entwurfs-Form der Einstellungen (Ausgabe und erneutes Einlesen).
// Dazu die beiden Nebenbefunde des Tasks: Einheiten-Namen der eingebauten
// Bezugs-Zeitrechnung in der Oberflächen-Sprache und keine Warnung vor
// verschobenen Werten, wenn am Bezug nur die Mehrzahl nachgetragen wird.
// Die Regel selbst (unitNameFor) prüft test/unit/calendar-core.test.js.
// 4T-002065 (Epic 3E-000307): Am Ende die Ausweitung der Ausnahme auf alle
// übrigen Benennungen samt Gegenproben.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
import en from '../../../src/i18n/en.json';
// Die geteilten Module brauchen kein window.api und stehen deshalb statisch da.
import { normalizeCalendarConfig } from '../../../src/shared/calendar/calendar-config.js';
import { calendarValueBadgeSpec } from '../../../src/shared/markdown/plugins/calendar.js';

// Der Katalog wird im Programm per fetch geladen; hier kommt er aus der Datei.
global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const { calendarToDraft, calendarPersistForm, calendarConfigPersistForm } =
  await import('../../../src/renderer/modules/settings/settings-calendar-model.js');
const { applyCalendarSection } =
  await import('../../../src/renderer/modules/settings/settings-calendar-section.js');
const { buildDerivedCalendarEditor } =
  await import('../../../src/renderer/modules/settings/settings-calendar-derived.js');
const { buildCalendarEditor } =
  await import('../../../src/renderer/modules/settings/settings-calendar-editor.js');

// Selbst definierte Zeitrechnung: 30-Tage-Monate, 12-Monate-Jahre, eine
// Sechs-Tage-Woche und Quartale. `mitMehrzahl` schaltet die zweite Form an
// Ebenen, Woche und Quartal zu; ohne sie entspricht die Definition dem Bestand.
function eigeneZeitrechnung(id, mitMehrzahl) {
  const mz = (form) => (mitMehrzahl ? { namePlural: form } : {});
  return {
    id,
    name: id,
    levels: [
      { id: 'tag', name: 'Tag', ...mz('Tage'), section: 'Datum', start: 1 },
      {
        id: 'monat',
        name: 'Monat',
        ...mz('Monate'),
        section: 'Datum',
        start: 1,
        rel: { type: 'factor', count: 30 },
      },
      {
        id: 'jahr',
        name: 'Jahr',
        ...mz('Jahre'),
        section: 'Datum',
        start: 1,
        rel: { type: 'factor', count: 12 },
      },
    ],
    cycles: [{ id: 'woche', name: 'Woche', ...mz('Wochen'), of: 'tag', length: 6 }],
    groups: [{ id: 'quartal', name: 'Quartal', ...mz('Quartale'), of: 'monat', size: 3 }],
  };
}

const CONFIG = normalizeCalendarConfig({
  blocks: [
    {
      id: 'welt',
      calendars: [
        eigeneZeitrechnung('Eigen', true),
        eigeneZeitrechnung('Alt', false),
        { id: 'projekt', name: 'Projekt', derivedFrom: 'Eigen', zero: [10, 1, 1] },
        { id: 'altzaehlung', name: 'Altzählung', derivedFrom: 'Alt', zero: [10, 1, 1] },
        { id: 'golive', name: 'Go-Live', derivedFrom: '@standard', zero: [2028, 7, 1] },
      ],
    },
  ],
});
const EIGEN = CONFIG.blocks[0].calendars[0];
const ALT = CONFIG.blocks[0].calendars[1];
const PROJEKT = CONFIG.blocks[0].calendars[2];
const ALTZAEHLUNG = CONFIG.blocks[0].calendars[3];
const GOLIVE = CONFIG.blocks[0].calendars[4];

const abzeichen = (name, wert, L = null) => calendarValueBadgeSpec(name, wert, CONFIG, L).text;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Abzeichen eines Kalender-Werts (4T-001863)', () => {
  it('AK2/AK10: Einzahl bei genau einer Einheit, sonst Mehrzahl — auch für Woche und Quartal', () => {
    expect(abzeichen('Projekt', '1-7-13')).toBe('1 Jahr, 2 Quartale, 1 Monat, 2 Wochen, 1 Tag');
    expect(abzeichen('Projekt', '2-3-3')).toBe('2 Jahre, 1 Quartal, 3 Tage');
    expect(abzeichen('Projekt', '0-0-15 vor')).toBe('2 Wochen, 3 Tage vor');
  });

  it('AK3: ohne Mehrzahl bleibt die Einzahl stehen', () => {
    expect(abzeichen('Altzählung', '2-3-3')).toBe('2 Jahr, 1 Quartal, 3 Tag');
  });

  it('die Standard-Zeitrechnung behält den Vorrang ihrer Übersetzungs-Schlüssel', () => {
    const englisch = { 'events.unit.day': 'day', 'events.unit.days': 'days' };
    expect(abzeichen('Go-Live', '0-0-3', (key) => englisch[key])).toBe('3 days');
  });
});

describe('Entwurfs-Form der Einstellungen (4T-001863)', () => {
  it('AK7: Ausgabe und erneutes Einlesen tragen beide Formen unverändert', () => {
    const ablage = calendarPersistForm(calendarToDraft(EIGEN));
    expect(ablage.levels.map((l) => l.namePlural)).toEqual(['Tage', 'Monate', 'Jahre']);
    expect(ablage.cycles[0].namePlural).toBe('Wochen');
    expect(ablage.groups[0].namePlural).toBe('Quartale');
    const wieder = normalizeCalendarConfig({ blocks: [{ id: 'welt', calendars: [ablage] }] });
    expect(wieder.blocks[0].calendars[0]).toStrictEqual(EIGEN);
  });

  it('AK4: eine Definition ohne Mehrzahl kommt ohne das Feld zurück', () => {
    const entwurf = calendarToDraft(ALT);
    expect(entwurf.levels.map((l) => l.namePlural)).toEqual(['', '', '']);
    expect(JSON.stringify(calendarPersistForm(entwurf))).not.toContain('namePlural');
  });
});

describe('Pflege-Oberfläche und Vorschau der Einstellungen (4T-001863)', () => {
  it('AK5: Ebene, Woche und Quartal bieten die Mehrzahl neben dem Namen an', () => {
    const entwurf = calendarToDraft(EIGEN);
    const block = { calendars: [entwurf] };
    buildCalendarEditor(document.body, block, entwurf, 0);
    const feld = (id) => document.getElementById(id);
    expect(feld('settings-calsys-level-0-0-plural').value).toBe('Tage');
    expect(feld('settings-calsys-cycle-0-0-plural').value).toBe('Wochen');
    expect(feld('settings-calsys-group-0-0-plural').value).toBe('Quartale');
    expect(feld('settings-calsys-level-0-0-plural').title).toContain('Mehrzahl');
    // Die Eingabe landet im Entwurf.
    const eingabe = feld('settings-calsys-level-0-2-plural');
    eingabe.value = 'Jahrzehnte';
    eingabe.dispatchEvent(new Event('input'));
    expect(entwurf.levels[2].namePlural).toBe('Jahrzehnte');
  });

  it('AK2: die Vorschau einer Ableitung zeigt die Form zur Anzahl', () => {
    const basis = calendarToDraft(EIGEN);
    const ableitung = { ...calendarToDraft(PROJEKT), previewInput: '1-7-13' };
    const block = { calendars: [basis, ableitung] };
    buildDerivedCalendarEditor(document.body, block, ableitung, 1);
    expect(document.getElementById('settings-calsys-preview-1').textContent).toContain(
      'Spanne: 1 Jahr, 2 Quartale, 1 Monat, 2 Wochen, 1 Tag',
    );
  });

  // Nebenbefund des Tasks: Vorschau und Tiefen-Auswahl einer Ableitung auf der
  // eingebauten Bezugs-Zeitrechnung zeigten die deutschen Vorgaben der Vorlage
  // in jeder Oberflächen-Sprache. Beide nutzen seither die Namen des Abzeichens.
  it('die eingebaute Bezugs-Zeitrechnung zeigt ihre Einheiten in der Oberflächen-Sprache', async () => {
    global.fetch.mockImplementationOnce(async () => ({ ok: true, json: async () => en }));
    await i18n.loadTranslations('en');
    try {
      const ableitung = { ...calendarToDraft(GOLIVE), previewInput: '0-1-18' };
      buildDerivedCalendarEditor(document.body, { calendars: [ableitung] }, ableitung, 0);
      expect(document.getElementById('settings-calsys-preview-0').textContent).toContain(
        'Span: 1 month, 2 weeks, 4 days',
      );
      const tiefen = [...document.getElementById('settings-calsys-derived-depth-0').options];
      expect(tiefen[0].textContent).toBe('day');
      expect(tiefen[2].textContent).toBe('month, week, day');
    } finally {
      await i18n.loadTranslations('de');
    }
  });
});

describe('Warnung vor verschobenen Werten beim Anwenden (4T-001863)', () => {
  // Bezug «Alt» mit der Ableitung «Altzählung»: Der Entwurf wird gegen den
  // Schnappschuss des unveränderten Stands angewendet.
  async function wendeAn(aendere) {
    const values = {
      hasArea: true,
      blocks: [
        {
          id: 'welt',
          name: 'Welt',
          calendars: [calendarToDraft(ALT), calendarToDraft(ALTZAEHLUNG)],
        },
      ],
    };
    const draft = { calendar: values, calendarSnapshot: calendarConfigPersistForm(values) };
    aendere(values.blocks[0].calendars[0]);
    window.api.calendarConfirmDependents = vi.fn(async () => true);
    window.api.calendarSetAreaConfig = vi.fn(async () => ({ ok: true }));
    await applyCalendarSection(draft);
    return window.api;
  }

  it('die nachgetragene Mehrzahl am Bezug löst keine Warnung aus und wird gespeichert', async () => {
    const api = await wendeAn((bezug) => {
      bezug.levels[0].namePlural = 'Tage';
      bezug.cycles[0].namePlural = 'Wochen';
      bezug.groups[0].namePlural = 'Quartale';
    });
    expect(api.calendarConfirmDependents).not.toHaveBeenCalled();
    expect(api.calendarSetAreaConfig).toHaveBeenCalledTimes(1);
    const gespeichert = api.calendarSetAreaConfig.mock.calls[0][0].blocks[0].calendars[0];
    expect(gespeichert.levels[0].namePlural).toBe('Tage');
  });

  it('Gegenprobe: eine Änderung, die Werte verschiebt, warnt weiterhin', async () => {
    const api = await wendeAn((bezug) => {
      bezug.levels[1].factorCount = '31';
    });
    expect(api.calendarConfirmDependents).toHaveBeenCalledTimes(1);
  });
});

// 4T-002065 (Epic 3E-000307): Über die Mehrzahl hinaus verschiebt keine
// Benennung einen Wert — Name einer Ebene, eines Zyklus oder einer
// Gruppierung und die Positions-Namen. Der Bezug «Mond» trägt dafür alles,
// was die Pflege anbietet: Monats-Namen an der Längen-Tabelle, eine
// Schalt-Regel, eine Woche mit Tages-Namen und eine Gruppierung.
const MOND_CONFIG = normalizeCalendarConfig({
  blocks: [
    {
      id: 'mondwelt',
      calendars: [
        {
          id: 'mond',
          name: 'Mond',
          levels: [
            { id: 'tag', name: 'Tag', section: 'Datum', start: 1 },
            {
              id: 'monat',
              name: 'Monat',
              section: 'Datum',
              start: 1,
              names: ['Eismond', 'Saatmond', 'Erntemond', 'Nebelmond'],
              rel: { type: 'lengths', table: [30, 29, 30, 29] },
            },
            {
              id: 'jahr',
              name: 'Jahr',
              section: 'Datum',
              start: 1,
              rel: { type: 'leap', count: 4, rules: [{ cycle: 4 }], targetIndex: 1, extra: 1 },
            },
          ],
          cycles: [
            {
              id: 'woche',
              name: 'Woche',
              of: 'tag',
              length: 5,
              names: ['Erst', 'Zweit', 'Dritt', 'Viert', 'Fünft'],
            },
          ],
          groups: [{ id: 'halbjahr', name: 'Halbjahr', of: 'monat', size: 2 }],
        },
        { id: 'mondzaehlung', name: 'Mondzählung', derivedFrom: 'mond', zero: [10, 1, 1] },
      ],
    },
  ],
});
const MOND = MOND_CONFIG.blocks[0].calendars[0];
const MONDZAEHLUNG = MOND_CONFIG.blocks[0].calendars[1];

describe('Rückfrage zu den Ableitungen nur bei wirksamer Änderung (4T-002065)', () => {
  async function wendeAnMond(aendere) {
    const values = {
      hasArea: true,
      blocks: [
        {
          id: 'mondwelt',
          name: 'Mondwelt',
          calendars: [calendarToDraft(MOND), calendarToDraft(MONDZAEHLUNG)],
        },
      ],
    };
    const draft = { calendar: values, calendarSnapshot: calendarConfigPersistForm(values) };
    aendere(values.blocks[0].calendars[0]);
    window.api.calendarConfirmDependents = vi.fn(async () => true);
    window.api.calendarSetAreaConfig = vi.fn(async () => ({ ok: true }));
    await applyCalendarSection(draft);
    const api = window.api;
    const gespeichert = api.calendarSetAreaConfig.mock.calls[0]?.[0]?.blocks[0].calendars[0];
    return { api, gespeichert };
  }

  // AK1: je Benennung keine Rückfrage, und die Änderung kommt in der Ablage an.
  const benennungen = [
    [
      'Name einer Ebene',
      (b) => (b.levels[1].name = 'Mondlauf'),
      (g) => expect(g.levels[1].name).toBe('Mondlauf'),
    ],
    [
      'Mehrzahl einer Ebene',
      (b) => (b.levels[1].namePlural = 'Monde'),
      (g) => expect(g.levels[1].namePlural).toBe('Monde'),
    ],
    [
      'Positions-Name einer Ebene (Monats-Name)',
      (b) => (b.levels[1].table[2].name = 'Herbstmond'),
      (g) => expect(g.levels[1].names[2]).toBe('Herbstmond'),
    ],
    [
      'Name eines Zyklus',
      (b) => (b.cycles[0].name = 'Fünftag'),
      (g) => expect(g.cycles[0].name).toBe('Fünftag'),
    ],
    [
      'Mehrzahl eines Zyklus',
      (b) => (b.cycles[0].namePlural = 'Wochen'),
      (g) => expect(g.cycles[0].namePlural).toBe('Wochen'),
    ],
    [
      'Positions-Namen eines Zyklus (Wochentags-Namen)',
      (b) => (b.cycles[0].namesText = 'Ruhe, Saat, Mühe, Markt, Fest'),
      (g) => expect(g.cycles[0].names).toEqual(['Ruhe', 'Saat', 'Mühe', 'Markt', 'Fest']),
    ],
    [
      'Name einer Gruppierung',
      (b) => (b.groups[0].name = 'Mondhälfte'),
      (g) => expect(g.groups[0].name).toBe('Mondhälfte'),
    ],
    [
      'Mehrzahl einer Gruppierung',
      (b) => (b.groups[0].namePlural = 'Halbjahre'),
      (g) => expect(g.groups[0].namePlural).toBe('Halbjahre'),
    ],
  ];

  it.each(benennungen)(
    'AK1: %s löst keine Rückfrage aus und wird gespeichert',
    async (_was, aendere, pruefe) => {
      const { api, gespeichert } = await wendeAnMond(aendere);
      expect(api.calendarConfirmDependents).not.toHaveBeenCalled();
      expect(api.calendarSetAreaConfig).toHaveBeenCalledTimes(1);
      pruefe(gespeichert);
    },
  );

  // AK2: Gegenproben — was Werte verschiebt, fragt weiter nach. Der Ebenen-
  // Bereich gehört dazu, weil er Datums- und Zeit-Teil trennt.
  const wirksam = [
    ['eine geänderte Länge', (b) => (b.levels[1].table[1].length = '30')],
    ['eine geänderte Schalt-Verlängerung', (b) => (b.levels[2].leapExtra = '2')],
    ['eine geänderte Schalt-Regel', (b) => (b.levels[2].leapRules = ['5'])],
    ['eine geänderte Zyklus-Länge', (b) => (b.cycles[0].length = '6')],
    ['ein geänderter Anker des Zyklus', (b) => (b.cycles[0].anchorPosition = '3')],
    ['ein geänderter Anker der Zeitrechnung', (b) => (b.anchorSegs = ['1', '1', '1'])],
    ['eine geänderte Skala', (b) => (b.scaleNum = '2')],
    ['ein geänderter Ebenen-Bereich', (b) => (b.levels[0].section = 'Zeit')],
  ];

  it.each(wirksam)('AK2: %s löst die Rückfrage weiter aus', async (_was, aendere) => {
    const { api } = await wendeAnMond(aendere);
    expect(api.calendarConfirmDependents).toHaveBeenCalledTimes(1);
  });

  it('AK2: der feste Faktor einer Ebene löst die Rückfrage weiter aus', async () => {
    // Faktor-Ebene des Bezugs «Alt»; die Gegenprobe des Mehrzahl-Falls oben
    // deckt dieselbe Ebene ab, hier zusammen mit einer Benennung am selben Bezug.
    const values = {
      hasArea: true,
      blocks: [
        {
          id: 'welt',
          name: 'Welt',
          calendars: [calendarToDraft(ALT), calendarToDraft(ALTZAEHLUNG)],
        },
      ],
    };
    const draft = { calendar: values, calendarSnapshot: calendarConfigPersistForm(values) };
    values.blocks[0].calendars[0].levels[2].name = 'Umlauf';
    values.blocks[0].calendars[0].levels[2].factorCount = '13';
    window.api.calendarConfirmDependents = vi.fn(async () => true);
    window.api.calendarSetAreaConfig = vi.fn(async () => ({ ok: true }));
    await applyCalendarSection(draft);
    expect(window.api.calendarConfirmDependents).toHaveBeenCalledTimes(1);
  });
});
