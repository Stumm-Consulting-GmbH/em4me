// 4T-000431 (Epic 3E-000081): Unit-Tests des Journal-Modells — tolerante
// Normalisierung der journals-Sektion (Fehler-Isolation pro Eintrag,
// Defaults, Regal-Selbstheilung, Roundtrip-Idempotenz).
import { describe, it, expect } from 'vitest';
import {
  JOURNAL_GRANULARITIES,
  DEFAULT_NAME_PROP,
  DEFAULT_DATE_PROP,
  DEFAULT_START_PROP,
  DEFAULT_END_PROP,
  normalizeJournalsConfig,
} from '../../src/shared/journal-core.js';

// Vollständig ausgefülltes, gültiges Journal (Wochen-Journal nach dem
// belegten Nutzungs-Muster des PO: Jahres-Unterordner mit KW-Namen).
const WEEKLY = {
  id: 'wochenbuch',
  name: 'Wochenbuch',
  shelf: 'Tagebuch',
  granularity: 'week',
  folderPattern: 'Tagebuch/{{date::yyyy}}',
  namePattern: '{{date::yyyy}}-KW-Name',
  template: 'Journal/Woche.md',
  startDate: '2024-01-01',
  endDate: null,
  nameProp: 'journal',
  dateProp: 'journal-date',
  startProp: 'journal-start-date',
  endProp: 'journal-end-date',
  // 4T-002738 (Epic 3E-000396): Einstellung des Übertrags offener Aufgaben.
  carryOverAuto: true,
  carryOverMode: 'remove',
  carryOverSection: 'Aufgaben',
};

describe('normalizeJournalsConfig — Leer- und Defekt-Fälle', () => {
  it('liefert null für fehlende, leere oder defekte Sektionen', () => {
    expect(normalizeJournalsConfig(undefined)).toBeNull();
    expect(normalizeJournalsConfig(null)).toBeNull();
    expect(normalizeJournalsConfig('journals')).toBeNull();
    expect(normalizeJournalsConfig([])).toBeNull();
    expect(normalizeJournalsConfig({})).toBeNull();
    expect(normalizeJournalsConfig({ shelves: [], journals: [] })).toBeNull();
    expect(normalizeJournalsConfig({ shelves: 'Tagebuch', journals: {} })).toBeNull();
  });

  it('defekte Einzel-Einträge entfallen, gültige bleiben (Fehler-Isolation)', () => {
    const config = normalizeJournalsConfig({
      journals: [
        WEEKLY,
        null,
        'kein-objekt',
        { ...WEEKLY, id: '' }, // ohne id
        { ...WEEKLY, id: 'x1', granularity: 'sprint' }, // unbekannte Granularität
        { ...WEEKLY, id: 'x2', namePattern: '  ' }, // ohne Namens-Schema
      ],
    });
    expect(config.journals.map((j) => j.id)).toEqual(['wochenbuch']);
  });

  it('doppelte ids behalten den ersten Eintrag', () => {
    const config = normalizeJournalsConfig({
      journals: [WEEKLY, { ...WEEKLY, name: 'Duplikat' }],
    });
    expect(config.journals).toHaveLength(1);
    expect(config.journals[0].name).toBe('Wochenbuch');
  });
});

describe('normalizeJournalsConfig — Normalisierung und Defaults', () => {
  it('gültige Konfiguration bleibt inhaltlich erhalten (Roundtrip)', () => {
    const config = normalizeJournalsConfig({ shelves: ['Tagebuch'], journals: [WEEKLY] });
    expect(config).toEqual({ shelves: ['Tagebuch'], journals: [WEEKLY] });
    // Idempotenz: erneutes Normalisieren ändert nichts.
    expect(normalizeJournalsConfig(config)).toEqual(config);
  });

  it('füllt Defaults: name = id, Property-Namen, leere optionale Felder', () => {
    const config = normalizeJournalsConfig({
      journals: [{ id: 'tag', granularity: 'day', namePattern: '{{date}}' }],
    });
    expect(config.journals[0]).toEqual({
      id: 'tag',
      name: 'tag',
      shelf: null,
      granularity: 'day',
      folderPattern: '',
      namePattern: '{{date}}',
      template: null,
      startDate: null,
      endDate: null,
      nameProp: DEFAULT_NAME_PROP,
      dateProp: DEFAULT_DATE_PROP,
      startProp: DEFAULT_START_PROP,
      endProp: DEFAULT_END_PROP,
      carryOverAuto: false,
      carryOverMode: 'mark',
      carryOverSection: '',
    });
  });

  it('alle fünf Granularitäten sind zulässig', () => {
    const journals = JOURNAL_GRANULARITIES.map((granularity, i) => ({
      id: `j${i}`,
      granularity,
      namePattern: '{{date}}',
    }));
    const config = normalizeJournalsConfig({ journals });
    expect(config.journals.map((j) => j.granularity)).toEqual(JOURNAL_GRANULARITIES);
  });

  it('ungültige Datums-Grenzen fallen auf null (Kalender-Gültigkeit)', () => {
    const config = normalizeJournalsConfig({
      journals: [
        {
          id: 'tag',
          granularity: 'day',
          namePattern: '{{date}}',
          startDate: '2026-02-30', // kein Kalender-Tag
          endDate: '26-01-01', // falsches Format
        },
      ],
    });
    expect(config.journals[0].startDate).toBeNull();
    expect(config.journals[0].endDate).toBeNull();
  });

  it('Regal-Liste: getrimmt, eindeutig, leere Namen entfallen', () => {
    const config = normalizeJournalsConfig({
      shelves: [' Tagebuch ', 'Tagebuch', '', 42, 'Arbeit'],
    });
    expect(config.shelves).toEqual(['Tagebuch', 'Arbeit']);
  });

  it('referenziertes, nicht deklariertes Regal wird angefügt (selbstheilend)', () => {
    const config = normalizeJournalsConfig({
      shelves: ['Tagebuch'],
      journals: [
        { id: 'kp', shelf: 'Körperprogramm', granularity: 'day', namePattern: '{{date}}' },
      ],
    });
    expect(config.shelves).toEqual(['Tagebuch', 'Körperprogramm']);
    expect(config.journals[0].shelf).toBe('Körperprogramm');
  });
});

// 4T-002738 (Epic 3E-000396): Die drei Felder des Übertrags offener Aufgaben
// stehen im normalisierten Journal immer; ungültige Werte fallen auf die
// sichere Vorgabe zurück (Übertrag aus, kennzeichnen, alle Abschnitte).
describe('normalizeJournalsConfig — Übertrag offener Aufgaben', () => {
  const tag = { id: 'tag', granularity: 'day', namePattern: '{{date}}' };
  const normalisiere = (zusatz) =>
    normalizeJournalsConfig({ journals: [{ ...tag, ...zusatz }] }).journals[0];

  it('Vorgaben ohne Angabe: aus, kennzeichnen, leerer Abschnitt', () => {
    const j = normalisiere({});
    expect(j.carryOverAuto).toBe(false);
    expect(j.carryOverMode).toBe('mark');
    expect(j.carryOverSection).toBe('');
  });

  it('gültige Werte bleiben erhalten, der Abschnitt ohne Rand-Leerraum', () => {
    const j = normalisiere({
      carryOverAuto: true,
      carryOverMode: 'remove',
      carryOverSection: '  Aufgaben  ',
    });
    expect(j.carryOverAuto).toBe(true);
    expect(j.carryOverMode).toBe('remove');
    expect(j.carryOverSection).toBe('Aufgaben');
  });

  it('nur ein echtes true schaltet den Übertrag ein', () => {
    for (const wert of ['true', 1, 'ja', {}, [], null, undefined, false]) {
      expect(normalisiere({ carryOverAuto: wert }).carryOverAuto).toBe(false);
    }
  });

  it('jeder andere Modus als genau remove wird mark', () => {
    for (const wert of ['Remove', ' remove', 'delete', 'mark', '', 0, null, true]) {
      expect(normalisiere({ carryOverMode: wert }).carryOverMode).toBe('mark');
    }
  });

  it('ein Abschnitt, der kein Text ist, wird leer', () => {
    for (const wert of [42, null, undefined, ['Aufgaben'], { text: 'Aufgaben' }, '   ']) {
      expect(normalisiere({ carryOverSection: wert }).carryOverSection).toBe('');
    }
  });

  it('die Einstellung gilt je Journal und bleibt beim erneuten Normalisieren gleich', () => {
    const config = normalizeJournalsConfig({
      journals: [
        { ...tag, id: 'a', carryOverAuto: true, carryOverMode: 'remove', carryOverSection: 'X' },
        { ...tag, id: 'b' },
      ],
    });
    expect(config.journals[0].carryOverAuto).toBe(true);
    expect(config.journals[1].carryOverAuto).toBe(false);
    expect(config.journals[1].carryOverMode).toBe('mark');
    expect(normalizeJournalsConfig(config)).toEqual(config);
  });
});
