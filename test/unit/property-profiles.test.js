// 4T-0446 (Epic 3E-0083): Unit-Tests des Profil-Datei-Formats — tolerante
// Normalisierung der propertyProfiles-Sektion und Definitions-Parsing mit
// weicher Validierung (Fehler-Isolation pro Definition).
// 4T-1141 (Epic 3E-0218): erweitertes Definitions-Format — options,
// valuesFrom, verschachtelte Kind-Definitionen, entkoppelter Mehrfach-Modus.
// 4T-1143 (Epic 3E-0218): Ortsbezug des Hinweis-Datensatzes.
//
// Gegenstück: `property-profiles-aufloesung.test.js` prüft die Auflösung
// über mehrere Profile, die Vererbung und die gemeinsame Editor-Logik
// (Schnitt in 4T-1145 entlang der Naht der beiden Module).
import { describe, it, expect } from 'vitest';
import {
  PROFILE_FIELD_TYPES,
  DEFAULT_ASSIGN_FIELD,
  normalizeProfilesConfig,
  parseProfileFields,
} from '../../src/shared/property-profiles.js';

describe('normalizeProfilesConfig', () => {
  it('liefert null für fehlende, leere oder defekte Sektionen', () => {
    expect(normalizeProfilesConfig(undefined)).toBeNull();
    expect(normalizeProfilesConfig(null)).toBeNull();
    expect(normalizeProfilesConfig('profiles')).toBeNull();
    expect(normalizeProfilesConfig([])).toBeNull();
    expect(normalizeProfilesConfig({})).toBeNull();
    expect(normalizeProfilesConfig({ folder: '  ', assignField: '', defaultProfile: '' })).toBe(
      null,
    );
  });

  it('normalisiert eine vollständige Konfiguration (Roundtrip-Idempotenz)', () => {
    const config = normalizeProfilesConfig({
      folder: ' 91 Organisation/Classes ',
      assignField: 'Class',
      defaultProfile: 'All',
    });
    expect(config).toEqual({
      folder: '91 Organisation/Classes',
      assignField: 'Class',
      defaultProfile: 'All',
    });
    expect(normalizeProfilesConfig(config)).toEqual(config);
  });

  it('füllt den Zuordnungs-Feldnamen mit dem Default class', () => {
    const config = normalizeProfilesConfig({ folder: 'Profile' });
    expect(config).toEqual({ folder: 'Profile', assignField: 'class', defaultProfile: null });
    expect(DEFAULT_ASSIGN_FIELD).toBe('class');
  });

  it('behält einen explizit gesetzten Feldnamen auch ohne Ordner', () => {
    expect(normalizeProfilesConfig({ assignField: 'typ' })).toEqual({
      folder: null,
      assignField: 'typ',
      defaultProfile: null,
    });
  });
});

describe('parseProfileFields — gültige Definitionen', () => {
  it('leeres oder fehlendes fields ergibt keine Felder und keine Hinweise', () => {
    expect(parseProfileFields(undefined)).toEqual({ fields: [], errors: [] });
    expect(parseProfileFields({})).toEqual({ fields: [], errors: [] });
    expect(parseProfileFields({ fields: [] })).toEqual({ fields: [], errors: [] });
  });

  it('alle sechs Typen sind definierbar', () => {
    const { fields, errors } = parseProfileFields({
      fields: PROFILE_FIELD_TYPES.map((type, i) => ({ name: `f${i}`, type })),
    });
    expect(errors).toEqual([]);
    expect(fields.map((f) => f.type)).toEqual(PROFILE_FIELD_TYPES);
  });

  it('füllt Defaults: Typ string, keine Werte-Liste, kein Default', () => {
    const { fields, errors } = parseProfileFields({ fields: [{ name: 'Projekt' }] });
    expect(errors).toEqual([]);
    expect(fields).toEqual([
      { name: 'Projekt', type: 'string', values: null, multiple: false, default: null },
    ]);
  });

  it('Einfach-Auswahl: Werte-Liste getrimmt, dedupliziert, Skalare als String', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'Status', values: [' offen ', 'offen', 42, true, '', null] }],
    });
    expect(errors).toEqual([]);
    expect(fields[0]).toEqual({
      name: 'Status',
      type: 'string',
      values: ['offen', '42', 'true'],
      multiple: false,
      default: null,
    });
  });

  it('Mehrfach-Auswahl: multiple mit values erzwingt Typ multistring', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'Themen', values: ['A', 'B'], multiple: true }],
    });
    expect(errors).toEqual([]);
    expect(fields[0].type).toBe('multistring');
    expect(fields[0].multiple).toBe(true);
  });

  it('multistring mit Werte-Liste ist implizit Mehrfach-Auswahl', () => {
    const { fields } = parseProfileFields({
      fields: [{ name: 'Themen', type: 'multistring', values: ['A', 'B'] }],
    });
    expect(fields[0].multiple).toBe(true);
  });

  it('number-Wertebereich: endliche Zahlen, numerische Strings konvertiert', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'Prio', type: 'number', values: [1, '2', 'drei', 2] }],
    });
    expect(errors).toEqual([]);
    expect(fields[0].values).toEqual([1, 2]);
  });

  it('Defaults werden typgerecht übernommen', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'a', type: 'string', default: 'x' },
        { name: 'b', type: 'number', default: 5 },
        { name: 'c', type: 'boolean', default: true },
        { name: 'd', type: 'date', default: '2026-07-09' },
        { name: 'e', type: 'multistring', default: 'einzeln' },
        { name: 'f', type: 'multistring', default: ['x', 'y'] },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields.map((f) => f.default)).toEqual([
      'x',
      5,
      true,
      '2026-07-09',
      ['einzeln'],
      ['x', 'y'],
    ]);
  });
});

describe('parseProfileFields — weiche Validierung (Fehler-Isolation)', () => {
  it('fields als Nicht-Liste ergibt nur den Sammel-Hinweis', () => {
    const { fields, errors } = parseProfileFields({ fields: 'Status' });
    expect(fields).toEqual([]);
    expect(errors).toEqual([
      { code: 'fieldsNotList', index: -1, name: null, key: 'fields', expected: 'list' },
    ]);
  });

  it('defekte Einzel-Definitionen entfallen, gültige bleiben', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'ok1' },
        null, // entry
        'kein-objekt', // entry
        { type: 'string' }, // name fehlt
        { name: 'ok1' }, // duplicate (case-insensitiv folgt unten)
        { name: 'OK1' }, // duplicate
        { name: 'x', type: 'lookup' }, // unbekannter Typ
        { name: 'z', type: 'number', values: ['A', 'B'], multiple: true }, // multipleType
        { name: 'v1', values: 'offen' }, // values kein Array
        { name: 'v2', type: 'boolean', values: [true] }, // Typ ohne Wertebereich
        { name: 'v3', type: 'number', values: ['drei'] }, // leer nach Normalisierung
        { name: 'ok2', type: 'date' },
      ],
    });
    expect(fields.map((f) => f.name)).toEqual(['ok1', 'ok2']);
    expect(errors.map((e) => e.code)).toEqual([
      'entry',
      'entry',
      'name',
      'duplicate',
      'duplicate',
      'type',
      'multipleType',
      'values',
      'values',
      'values',
    ]);
    // Hinweise tragen Position, (falls bekannt) den Feldnamen sowie seit
    // 4T-1143 die betroffene Angabe und die Erwartung.
    expect(errors[2]).toEqual({ code: 'name', index: 3, name: null, key: 'name', expected: null });
    expect(errors[5]).toEqual({
      code: 'type',
      index: 6,
      name: 'x',
      key: 'type',
      expected: PROFILE_FIELD_TYPES,
    });
  });

  it('unpassender Default setzt nur den Default aus, das Feld bleibt', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'a', type: 'number', default: 'fünf' },
        { name: 'b', type: 'date', default: 'morgen' },
        { name: 'c', type: 'boolean', default: 'ja' },
      ],
    });
    expect(fields.map((f) => f.name)).toEqual(['a', 'b', 'c']);
    expect(fields.map((f) => f.default)).toEqual([null, null, null]);
    expect(errors.map((e) => e.code)).toEqual(['default', 'default', 'default']);
  });

  it('Default außerhalb des Wertebereichs bleibt mit Hinweis erhalten', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'Status', values: ['offen', 'erledigt'], default: 'unklar' }],
    });
    expect(fields[0].default).toBe('unklar');
    expect(errors).toEqual([
      {
        code: 'defaultOutsideValues',
        index: 0,
        name: 'Status',
        key: 'default',
        expected: ['offen', 'erledigt'],
      },
    ]);
  });
});

// 4T-1141 (Epic 3E-0218): erweitertes Definitions-Format — typ-eigene
// Angaben im Unterobjekt (E9), Quelle des Wertevorrats (E12), verschachtelte
// Kind-Definitionen (Konzept 6.12) und der entkoppelte Mehrfach-Modus (E11).
describe('parseProfileFields — erweitertes Format (4T-1141)', () => {
  it('AK1: options wird als flaches Unterobjekt geführt, die obere Ebene bleibt frei', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'budget', type: 'number', options: { step: 100, min: 0, max: 100000 } }],
    });
    expect(errors).toEqual([]);
    expect(fields[0]).toEqual({
      name: 'budget',
      type: 'number',
      values: null,
      multiple: false,
      default: null,
      options: { step: 100, min: 0, max: 100000 },
    });
  });

  it('AK1: options als Nicht-Objekt entfällt mit Hinweis, das Feld bleibt', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'budget', type: 'number', options: 'step 100' },
        { name: 'b', options: [1] },
      ],
    });
    expect(fields.map((f) => f.name)).toEqual(['budget', 'b']);
    expect(fields.every((f) => !('options' in f))).toBe(true);
    expect(errors.map((e) => e.code)).toEqual(['options', 'options']);
  });

  it('AK2: valuesFrom steht auf der oberen Ebene und trägt note und query', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'ort', valuesFrom: { note: ' Werte/Orte.md ' } },
        { name: 'projekt', type: 'string', valuesFrom: { query: 'FROM Projekte' } },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields[0].valuesFrom).toEqual({ note: 'Werte/Orte.md', query: null });
    expect(fields[1].valuesFrom).toEqual({ note: null, query: 'FROM Projekte' });
  });

  it('AK5: values und valuesFrom zugleich — values gilt, die Quelle entfällt mit Hinweis', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'status', values: ['a', 'b'], valuesFrom: { note: 'W.md' } }],
    });
    expect(fields).toHaveLength(1);
    expect(fields[0].values).toEqual(['a', 'b']);
    expect('valuesFrom' in fields[0]).toBe(false);
    expect(errors).toEqual([
      {
        code: 'valuesFromConflict',
        index: 0,
        name: 'status',
        key: 'valuesFrom',
        expected: 'values',
      },
    ]);
  });

  it('AK3: Kind-Definitionen rekursiv nach demselben Schema, mit Pfad zum Eltern-Feld', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        {
          name: 'teilnehmer',
          fields: [
            { name: 'person', type: 'string' },
            { name: 'rolle', values: ['Leitung', 'Gast'] },
            { name: 'adresse', fields: [{ name: 'ort' }] },
          ],
        },
      ],
    });
    expect(errors).toEqual([]);
    const kids = fields[0].fields;
    expect(kids.map((f) => f.name)).toEqual(['person', 'rolle', 'adresse']);
    expect(kids[0].path).toEqual(['teilnehmer']);
    expect(kids[1].values).toEqual(['Leitung', 'Gast']);
    expect(kids[2].fields[0].path).toEqual(['teilnehmer', 'adresse']);
  });

  it('AK3/AK6: Fehler in Kind-Definitionen tragen den Pfad und setzen nur die Kind-Definition aus', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'teilnehmer', fields: [{ name: 'rolle', type: 'lookup' }, { name: 'person' }] },
        { name: 'titel' },
      ],
    });
    expect(errors).toEqual([
      {
        code: 'type',
        index: 0,
        name: 'rolle',
        key: 'type',
        expected: PROFILE_FIELD_TYPES,
        path: ['teilnehmer'],
      },
    ]);
    expect(fields[0].fields.map((f) => f.name)).toEqual(['person']);
    expect(fields.map((f) => f.name)).toEqual(['teilnehmer', 'titel']);
  });

  it('fields an einem Eintrag ist kein Fehler, auch wenn sein Typ keine Kinder kennt', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'notiz', type: 'multiline', fields: [{ name: 'zusatz' }] }],
    });
    expect(errors).toEqual([]);
    expect(fields[0].fields[0].name).toBe('zusatz');
  });

  it('AK6: Kind-fields als Nicht-Liste entfällt mit Hinweis, das Feld bleibt', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'teilnehmer', fields: 'person' }],
    });
    expect(fields.map((f) => f.name)).toEqual(['teilnehmer']);
    expect('fields' in fields[0]).toBe(false);
    expect(errors).toEqual([
      {
        code: 'childFieldsNotList',
        index: 0,
        name: 'teilnehmer',
        key: 'fields',
        expected: 'list',
      },
    ]);
  });

  it('AK4: multiple ohne values ist gültig (Entkopplung E11)', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'beteiligte', multiple: true }],
    });
    expect(errors).toEqual([]);
    expect(fields[0]).toEqual({
      name: 'beteiligte',
      type: 'multistring',
      values: null,
      multiple: true,
      default: null,
    });
  });

  it('AK4: die Typ-Regel bleibt — multiple mit Nicht-multistring-Typ ist weiter ein Fehler', () => {
    const { errors } = parseProfileFields({
      fields: [{ name: 'x', type: 'number', multiple: true }],
    });
    expect(errors.map((e) => e.code)).toEqual(['multipleType']);
  });

  it('AK8: Ränder — leeres options, leere Kind-Liste, valuesFrom ohne Unter-Angabe', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'a', options: {} },
        { name: 'b', fields: [] },
        { name: 'c', valuesFrom: {} },
        { name: 'd', valuesFrom: { note: '   ' } },
      ],
    });
    expect(fields.map((f) => f.name)).toEqual(['a', 'b', 'c', 'd']);
    expect(fields[0].options).toEqual({});
    expect(fields[1].fields).toEqual([]);
    expect('valuesFrom' in fields[2]).toBe(false);
    expect('valuesFrom' in fields[3]).toBe(false);
    expect(errors.map((e) => e.code)).toEqual(['valuesFrom', 'valuesFrom']);
  });

  it('AK8: eine Definition mit allen neuen Angaben zugleich', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        {
          name: 'projekt',
          multiple: true,
          valuesFrom: { query: 'FROM Projekte' },
          options: { sort: 'name' },
          fields: [{ name: 'rolle' }],
          default: ['intern'],
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields[0].multiple).toBe(true);
    expect(fields[0].type).toBe('multistring');
    expect(fields[0].valuesFrom).toEqual({ note: null, query: 'FROM Projekte' });
    expect(fields[0].options).toEqual({ sort: 'name' });
    expect(fields[0].fields[0].name).toBe('rolle');
    expect(fields[0].default).toEqual(['intern']);
  });

  it('AK7: die vier Bestands-Formen liefern exakt dieselben Objekte wie vor der Erweiterung', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'Projekt' },
        { name: 'Fällig', type: 'date' },
        { name: 'Status', values: ['offen', 'erledigt'] },
        { name: 'Prio', type: 'number', default: 3 },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields).toEqual([
      { name: 'Projekt', type: 'string', values: null, multiple: false, default: null },
      { name: 'Fällig', type: 'date', values: null, multiple: false, default: null },
      {
        name: 'Status',
        type: 'string',
        values: ['offen', 'erledigt'],
        multiple: false,
        default: null,
      },
      { name: 'Prio', type: 'number', values: null, multiple: false, default: 3 },
    ]);
    // Keine neue Angabe erscheint ungefragt am Objekt (Rückwärts-Verträglichkeit).
    for (const f of fields) {
      expect(Object.keys(f).sort()).toEqual(['default', 'multiple', 'name', 'type', 'values']);
    }
  });
});

// 4T-1143 (Epic 3E-0218, E4): Ortsbezug des Hinweis-Datensatzes — jeder
// Hinweis trägt die betroffene Angabe (key) und die maschinen-lesbare
// Erwartung (expected); Kind-Hinweise zusätzlich den Pfad.
describe('Hinweis-Datensatz mit Angabe und Erwartung (4T-1143)', () => {
  it('AK2: Hinweise tragen die betroffene Angabe und die Erwartung', () => {
    const { errors } = parseProfileFields({
      fields: [
        { name: 'a', type: 'lookup' },
        { name: 'b', type: 'number', default: 'fünf' },
        { name: 'c', values: ['x'], default: 'y' },
        { name: 'd', options: 'nein' },
      ],
    });
    expect(errors).toEqual([
      { code: 'type', index: 0, name: 'a', key: 'type', expected: PROFILE_FIELD_TYPES },
      { code: 'default', index: 1, name: 'b', key: 'default', expected: 'number' },
      { code: 'defaultOutsideValues', index: 2, name: 'c', key: 'default', expected: ['x'] },
      { code: 'options', index: 3, name: 'd', key: 'options', expected: 'object' },
    ]);
  });

  it('AK3: Kind-Hinweise tragen Pfad, Angabe und Erwartung', () => {
    const { errors } = parseProfileFields({
      fields: [{ name: 'eltern', fields: [{ name: 'kind', valuesFrom: {} }] }],
    });
    expect(errors).toEqual([
      {
        code: 'valuesFrom',
        index: 0,
        name: 'kind',
        key: 'valuesFrom',
        expected: ['note', 'query'],
        path: ['eltern'],
      },
    ]);
  });
});
