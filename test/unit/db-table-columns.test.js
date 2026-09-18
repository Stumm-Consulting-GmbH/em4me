// 4T-001507 (Epic 3E-000250, E5): Unit-Tests des Spalten-Typ-Satzes — die acht
// zulässigen Typen, der Datensatz-Verweis mit seiner Ziel-Tabelle, der
// Wertebereich als Angabe am Typ und die vier Ausschlüsse samt der mehrwertigen
// Spalte, jeder mit der Meldung, die seinen Grund nennt.
//
// Geprüft wird durch den Definitions-Parser hindurch, weil dort die Wirkung
// entsteht; die beiden Bausteine des Typ-Moduls sind zusätzlich einzeln
// belegt.
import { describe, it, expect } from 'vitest';
import {
  DB_TABLE_KEY,
  DB_FIELDS_KEY,
  DB_COLUMN_TYPES,
  DB_DEFAULT_COLUMN_TYPE,
  parseTableDefinition,
} from '../../src/shared/database/table-definition.js';
import {
  COMPUTED_TYPES,
  STRUCTURED_TYPES,
  MULTI_VALUE_TYPE,
  spaltenTyp,
  spaltenOptionsSpec,
} from '../../src/shared/database/table-columns.js';

function tabelle(...eintraege) {
  return { [DB_TABLE_KEY]: { [DB_FIELDS_KEY]: eintraege } };
}

function ersteSpalte(...eintraege) {
  const { fields, hints } = parseTableDefinition(tabelle(...eintraege));
  return { spalte: fields[0], fields, hints };
}

describe('Spalten-Typen: der Satz der acht (AK1)', () => {
  it('trägt genau die acht entschiedenen Typen', () => {
    expect(DB_COLUMN_TYPES).toEqual([
      'string',
      'multiline',
      'number',
      'boolean',
      'date',
      'time',
      'link',
      'record',
    ]);
  });

  it('jeder der acht ist an einer Spalte definierbar', () => {
    const { fields, hints } = parseTableDefinition(
      tabelle(...DB_COLUMN_TYPES.map((type, i) => ({ name: `f${i}`, type }))),
    );
    expect(hints).toEqual([]);
    expect(fields.map((f) => f.type)).toEqual(DB_COLUMN_TYPES);
  });

  it('ein unbekannter Typ wird abgewiesen und die Meldung nennt den Satz', () => {
    const { fields, hints } = ersteSpalte({ name: 'preis', type: 'waehrung' });
    expect(fields).toEqual([]);
    expect(hints).toEqual([
      { code: 'type', index: 0, name: 'preis', key: 'type', expected: DB_COLUMN_TYPES },
    ]);
  });
});

describe('Spalten-Typen: der Datensatz-Verweis (AK2)', () => {
  it('benennt seine Ziel-Tabelle', () => {
    const { spalte, hints } = ersteSpalte({
      name: 'artikel',
      type: 'record',
      options: { table: 'Artikel' },
    });
    expect(hints).toEqual([]);
    expect(spalte).toEqual({ name: 'artikel', type: 'record', options: { table: 'Artikel' } });
  });

  it('ist vom Datei-Verweis unterscheidbar: beide tragen verschiedene Angaben', () => {
    const record = Object.keys(spaltenOptionsSpec('record', false));
    const link = Object.keys(spaltenOptionsSpec('link', false));
    expect(record).toEqual(['table']);
    expect(link).toEqual(['restrictTo', 'display', 'sort']);
    expect(record.some((k) => link.includes(k))).toBe(false);
  });

  it('die Ziel-Tabelle an einem Datei-Verweis ist nicht vorgesehen', () => {
    const { spalte, hints } = ersteSpalte({
      name: 'anhang',
      type: 'link',
      options: { table: 'Artikel' },
    });
    expect(spalte.options).toEqual({});
    expect(hints.map((h) => h.code)).toEqual(['optionUnknown']);
  });

  it('eine Ziel-Tabelle ohne Text entfällt einzeln, die Spalte bleibt', () => {
    const { spalte, hints } = ersteSpalte({
      name: 'artikel',
      type: 'record',
      options: { table: 7 },
    });
    expect(spalte).toEqual({ name: 'artikel', type: 'record', options: {} });
    expect(hints).toEqual([
      { code: 'optionValue', index: 0, name: 'artikel', key: 'options', expected: 'table-name' },
    ]);
  });
});

describe('Spalten-Typen: der Wertebereich bleibt eine Angabe am Typ (AK3)', () => {
  it('eine Text-Spalte trägt ihren Wertebereich, ohne einen eigenen Typ zu brauchen', () => {
    const { spalte, hints } = ersteSpalte({
      name: 'status',
      type: 'string',
      values: ['offen', 'erledigt'],
    });
    expect(hints).toEqual([]);
    expect(spalte).toEqual({ name: 'status', type: 'string', values: ['offen', 'erledigt'] });
  });

  it('eine Zahl-Spalte bekommt Zahlen in ihrem Wertebereich', () => {
    const { spalte } = ersteSpalte({ name: 'stufe', type: 'number', values: [1, '2', 3] });
    expect(spalte.values).toEqual([1, 2, 3]);
  });

  it('Wahrheitswert und Langtext haben keinen Wertebereich', () => {
    for (const type of ['boolean', 'multiline']) {
      const { spalte, hints } = ersteSpalte({ name: 'f', type, values: ['a', 'b'] });
      expect(spalte, type).toEqual({ name: 'f', type });
      expect(
        hints.map((h) => h.code),
        type,
      ).toEqual(['values']);
    }
  });

  it('der Vorgabewert wird gegen den Typ geprüft und bleibt bei Abweichung aus', () => {
    const { spalte, hints } = ersteSpalte({ name: 'menge', type: 'number', default: 'viel' });
    expect(spalte).toEqual({ name: 'menge', type: 'number' });
    expect(hints).toEqual([
      { code: 'default', index: 0, name: 'menge', key: 'default', expected: 'number' },
    ]);
  });

  it('ein Vorgabewert außerhalb des Wertebereichs bleibt stehen und trägt einen Hinweis', () => {
    const { spalte, hints } = ersteSpalte({
      name: 'status',
      values: ['offen', 'erledigt'],
      default: 'unklar',
    });
    expect(spalte.default).toBe('unklar');
    expect(hints.map((h) => h.code)).toEqual(['defaultOutsideValues']);
  });
});

describe('Spalten-Typen: die Ausschlüsse nennen ihren Grund (AK4)', () => {
  it('berechnete Felder scheiden aus, und die Meldung sagt es', () => {
    for (const type of COMPUTED_TYPES) {
      const { fields, hints } = ersteSpalte({ name: 'summe', type });
      expect(fields, type).toEqual([]);
      expect(hints, type).toEqual([
        {
          code: 'typeComputed',
          index: 0,
          name: 'summe',
          key: 'type',
          expected: DB_COLUMN_TYPES,
        },
      ]);
    }
  });

  it('strukturierte Werte scheiden aus, und die Meldung sagt es', () => {
    for (const type of STRUCTURED_TYPES) {
      const { fields, hints } = ersteSpalte({ name: 'anschrift', type });
      expect(fields, type).toEqual([]);
      expect(
        hints.map((h) => h.code),
        type,
      ).toEqual(['typeStructured']);
    }
  });

  it('die mehrwertige Spalte als Typ lässt den Eintrag entfallen', () => {
    const { fields, hints } = ersteSpalte({ name: 'schlagworte', type: MULTI_VALUE_TYPE });
    expect(fields).toEqual([]);
    expect(hints.map((h) => h.code)).toEqual(['multipleColumn']);
  });

  it('die Vielzahl als Angabe entfällt, die Spalte bleibt einwertig', () => {
    // Anders als beim Typ steht hier ein deutbarer Typ da; allein die Vielzahl
    // entfällt — die weiche Linie wie bei jeder anderen Angabe.
    const { spalte, hints } = ersteSpalte({ name: 'schlagworte', type: 'string', multiple: true });
    expect(spalte).toEqual({ name: 'schlagworte', type: 'string' });
    expect(hints).toEqual([
      {
        code: 'multipleColumn',
        index: 0,
        name: 'schlagworte',
        key: 'multiple',
        expected: DB_COLUMN_TYPES,
      },
    ]);
  });

  it('ein Ausschluss lässt die übrigen Spalten unberührt', () => {
    const { fields, hints } = parseTableDefinition(
      tabelle(
        { name: 'menge', type: 'number' },
        { name: 'summe', type: 'formula' },
        { name: 'bemerkung' },
      ),
    );
    expect(fields.map((f) => f.name)).toEqual(['menge', 'bemerkung']);
    expect(fields[1].type).toBe(DB_DEFAULT_COLUMN_TYPE);
    expect(hints.map((h) => h.code)).toEqual(['typeComputed']);
  });

  it('der Typ-Befund trennt die drei Gründe auch einzeln', () => {
    expect(spaltenTyp('record')).toEqual({ type: 'record' });
    expect(spaltenTyp('lookup')).toEqual({ code: 'typeComputed' });
    expect(spaltenTyp('objectlist')).toEqual({ code: 'typeStructured' });
    expect(spaltenTyp('multistring')).toEqual({ code: 'multipleColumn' });
    expect(spaltenTyp('waehrung')).toEqual({ code: 'type' });
    expect(spaltenTyp(42)).toEqual({ code: 'type' });
  });
});
