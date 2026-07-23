// 4T-0431 (Epic 3E-0081): Unit-Tests des Journal-Modells — tolerante
// Normalisierung der journals-Sektion (Fehler-Isolation pro Eintrag,
// Defaults, Regal-Selbstheilung, Roundtrip-Idempotenz).
import { describe, it, expect } from 'vitest';
import {
  JOURNAL_GRANULARITIES,
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
  dateProp: 'journal-date',
  startProp: 'journal-start-date',
  endProp: 'journal-end-date',
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
      dateProp: DEFAULT_DATE_PROP,
      startProp: DEFAULT_START_PROP,
      endProp: DEFAULT_END_PROP,
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
