// 4T-000446 (Epic 3E-000083): Unit-Tests des Profil-Datei-Formats — tolerante
// Normalisierung der propertyProfiles-Sektion und Definitions-Parsing mit
// weicher Validierung (Fehler-Isolation pro Definition).
// 4T-001141 (Epic 3E-000218): erweitertes Definitions-Format — options,
// valuesFrom, verschachtelte Kind-Definitionen, entkoppelter Mehrfach-Modus.
// 4T-001143 (Epic 3E-000218): Ortsbezug des Hinweis-Datensatzes.
//
// Gegenstück: `property-profiles-aufloesung.test.js` prüft die Auflösung
// über mehrere Profile, die Vererbung und die gemeinsame Editor-Logik
// (Schnitt in 4T-001145 entlang der Naht der beiden Module).
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

  it('jeder Typ des Satzes ist definierbar', () => {
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
        { name: 'x', type: 'gibtsnicht' }, // unbekannter Typ
        // 4T-001155: multipleType trifft seit der Entkopplung nur noch die
        // Typen ohne Mehrfach-Darstellung; `number` mit multiple ist gültig.
        { name: 'z', type: 'boolean', multiple: true }, // multipleType
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
    // 4T-001143 die betroffene Angabe und die Erwartung.
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

// 4T-001141 (Epic 3E-000218): erweitertes Definitions-Format — typ-eigene
// Angaben im Unterobjekt (E9), Quelle des Wertevorrats (E12), verschachtelte
// Kind-Definitionen (Konzept 6.12) und der entkoppelte Mehrfach-Modus (E11).
describe('parseProfileFields — erweitertes Format (4T-001141)', () => {
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
        { name: 'teilnehmer', fields: [{ name: 'rolle', type: 'gibtsnicht' }, { name: 'person' }] },
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

  // 4T-001155 löst die frühere Fassung dieses Falls ab: Bis Stufe 1 war
  // `multiple` an jedem Nicht-multistring-Typ ein Fehler; mit dem Typ-Ausbau
  // gilt es für jeden Typ, bei dem mehrere Werte sinnvoll sind (E11).
  it('AK4: multiple an einem Typ ohne Mehrfach-Darstellung bleibt ein Fehler', () => {
    for (const type of ['boolean', 'multiline']) {
      const { fields, errors } = parseProfileFields({
        fields: [{ name: 'x', type, multiple: true }],
      });
      expect(fields).toEqual([]);
      expect(errors.map((e) => e.code)).toEqual(['multipleType']);
      expect(errors[0].expected).toEqual([
        'string',
        'multistring',
        'number',
        'date',
        'link',
        'time',
      ]);
    }
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
          // 4T-001155: `control` statt `sort` — die Optionen werden jetzt je
          // Typ geprüft, und `sort` gehört zum Verweis-Typ. An einem Feld mit
          // Wertevorrat ist `control` die zulässige Angabe.
          options: { control: 'cycle' },
          fields: [{ name: 'rolle' }],
          default: ['intern'],
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields[0].multiple).toBe(true);
    expect(fields[0].type).toBe('multistring');
    expect(fields[0].valuesFrom).toEqual({ note: null, query: 'FROM Projekte' });
    expect(fields[0].options).toEqual({ control: 'cycle' });
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

// 4T-001143 (Epic 3E-000218, E4): Ortsbezug des Hinweis-Datensatzes — jeder
// Hinweis trägt die betroffene Angabe (key) und die maschinen-lesbare
// Erwartung (expected); Kind-Hinweise zusätzlich den Pfad.
describe('Hinweis-Datensatz mit Angabe und Erwartung (4T-001143)', () => {
  it('AK2: Hinweise tragen die betroffene Angabe und die Erwartung', () => {
    const { errors } = parseProfileFields({
      fields: [
        { name: 'a', type: 'gibtsnicht' },
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

// --- 4T-001155 (Epic 3E-000219, E11): Typ-Ausbau und typ-eigene Optionen -------
// Der Typ-Satz wächst um Verweis und Uhrzeit, der Mehrfach-Modus gilt für
// jeden Typ mit sinnvoller Mehrfach-Darstellung, und die Options-Angaben
// werden je Typ geprüft statt blind durchgereicht.
describe('parseProfileFields — Typ-Ausbau und typ-eigene Optionen (4T-001155)', () => {
  it('AK1: link und time sind erklärbar und erscheinen unverändert im Ergebnis', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'quelle', type: 'link' },
        { name: 'beginn', type: 'time' },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields[0]).toEqual({
      name: 'quelle',
      type: 'link',
      values: null,
      multiple: false,
      default: null,
    });
    expect(fields[1].type).toBe('time');
  });

  it('AK2: multiple an link bleibt link — die Vielzahl trägt das Flag', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'beteiligte', type: 'link', multiple: true }],
    });
    expect(errors).toEqual([]);
    expect(fields[0].type).toBe('link');
    expect(fields[0].multiple).toBe(true);
  });

  it('AK2: das historische Paar string/multistring bleibt unberührt', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'a', multiple: true }, // ohne Typ: multistring wie bisher
        { name: 'b', type: 'string', multiple: true }, // bis Stufe 1 ein Fehler
        { name: 'c', type: 'multistring', multiple: true },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields.map((f) => f.type)).toEqual(['multistring', 'multistring', 'multistring']);
  });

  it('AK2: multiple gilt auch für number, date und time', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'werte', type: 'number', multiple: true },
        { name: 'termine', type: 'date', multiple: true },
        { name: 'zeiten', type: 'time', multiple: true },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields.map((f) => f.type)).toEqual(['number', 'date', 'time']);
    expect(fields.every((f) => f.multiple === true)).toBe(true);
  });

  it('AK3: die typ-eigenen Optionen werden je Typ geführt', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'budget', type: 'number', options: { step: 100, min: 0, max: 100000 } },
        { name: 'faellig', type: 'date', options: { shift: 7 } },
        {
          name: 'quelle',
          type: 'link',
          options: { restrictTo: '10 Projekte', display: 'titel', sort: 'name' },
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields[0].options).toEqual({ step: 100, min: 0, max: 100000 });
    expect(fields[1].options).toEqual({ shift: 7 });
    expect(fields[2].options).toEqual({
      restrictTo: ['10 Projekte'],
      display: 'titel',
      sort: 'name',
    });
  });

  it('AK3: restrictTo nimmt einen Pfad oder eine Pfad-Liste', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'a', type: 'link', options: { restrictTo: ['10 Projekte', ' 20 Kunden '] } },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields[0].options.restrictTo).toEqual(['10 Projekte', '20 Kunden']);
  });

  it('AK4: control gilt am Feld mit Wertevorrat, aus fester Liste wie aus Quelle', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'status', values: ['offen', 'fertig'], options: { control: 'cycle' } },
        { name: 'ort', valuesFrom: { note: 'Werte/Orte.md' }, options: { control: 'cycle' } },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields[0].options).toEqual({ control: 'cycle' });
    expect(fields[1].options).toEqual({ control: 'cycle' });
    // Der Wertebereich und der gespeicherte Wert bleiben unberührt: die
    // Option ist eine Bedien-Angabe und kein Typ (Konzept 6.8).
    expect(fields[0].values).toEqual(['offen', 'fertig']);
    expect(fields[0].type).toBe('string');
  });

  it('AK5: eine unbekannte Option entfällt einzeln, Feld und übrige Optionen bleiben', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'budget', type: 'number', options: { step: 10, farbe: 'rot' } }],
    });
    expect(fields[0].name).toBe('budget');
    expect(fields[0].options).toEqual({ step: 10 });
    expect(errors).toEqual([
      {
        code: 'optionUnknown',
        index: 0,
        name: 'budget',
        key: 'options',
        expected: ['step', 'min', 'max'],
      },
    ]);
  });

  it('AK5: control ohne Wertevorrat ist unbekannt — die Option gehört zur Auswahl', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'frei', options: { control: 'cycle' } }],
    });
    expect(fields[0].options).toEqual({});
    expect(errors.map((e) => e.code)).toEqual(['optionUnknown']);
  });

  it('AK6: eine unpassend belegte Option entfällt einzeln', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'a', type: 'number', options: { step: 'viel', min: 0 } },
        { name: 'b', type: 'date', options: { shift: 1.5 } },
        { name: 'c', type: 'link', options: { sort: 'groesse' } },
        { name: 'd', type: 'link', options: { restrictTo: [''] } },
      ],
    });
    expect(fields.map((f) => f.name)).toEqual(['a', 'b', 'c', 'd']);
    expect(fields[0].options).toEqual({ min: 0 });
    expect(fields[1].options).toEqual({});
    expect(fields[2].options).toEqual({});
    expect(fields[3].options).toEqual({});
    expect(errors.map((e) => e.code)).toEqual([
      'optionValue',
      'optionValue',
      'optionValue',
      'optionValue',
    ]);
    expect(errors[0].expected).toBe('number');
    expect(errors[2].expected).toEqual(['name', 'path']);
  });

  it('AK6: min über max lässt die obere Grenze entfallen, das Feld bleibt bedienbar', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'budget', type: 'number', options: { min: 100, max: 10, step: 5 } }],
    });
    expect(fields[0].options).toEqual({ min: 100, step: 5 });
    expect(errors).toEqual([
      {
        code: 'optionValue',
        index: 0,
        name: 'budget',
        key: 'options',
        expected: 'max-not-below-min',
      },
    ]);
  });

  it('AK8: ein Datum bleibt ein Datums-Wert; die ISO-Prüfung des Defaults gilt unverändert', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'gut', type: 'date', default: '2026-09-01' },
        { name: 'verweis', type: 'date', default: '[[2026-09-01]]' },
      ],
    });
    expect(fields[0].default).toBe('2026-09-01');
    expect(fields[1].default).toBeNull();
    expect(errors.map((e) => e.code)).toEqual(['default']);
  });

  it('AK8: ein Zeit-Default wird gegen das 24-Stunden-Format geprüft', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'a', type: 'time', default: '09:30' },
        { name: 'b', type: 'time', default: '23:59:59' },
        { name: 'c', type: 'time', default: '24:00' },
        { name: 'd', type: 'time', default: 'morgens' },
      ],
    });
    expect(fields.map((f) => f.default)).toEqual(['09:30', '23:59:59', null, null]);
    expect(errors.map((e) => e.code)).toEqual(['default', 'default']);
  });

  it('AK8: ein Verweis-Default bleibt ungeprüfter Text', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'quelle', type: 'link', default: '[[Meier 2024]]' }],
    });
    expect(errors).toEqual([]);
    expect(fields[0].default).toBe('[[Meier 2024]]');
  });

  it('AK10: Optionen an einem Typ ohne eigene entfallen; das leere Objekt bleibt sichtbar', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'a', type: 'boolean', options: { step: 1 } },
        { name: 'b', options: {} },
      ],
    });
    expect(fields[0].options).toEqual({});
    expect(fields[1].options).toEqual({});
    expect(errors.map((e) => e.code)).toEqual(['optionUnknown']);
    expect(errors[0].expected).toEqual([]);
  });

  it('AK10: ein Options-Hinweis einer Kind-Definition trägt ihren Pfad', () => {
    const { errors } = parseProfileFields({
      fields: [
        {
          name: 'teilnehmer',
          fields: [{ name: 'rolle', type: 'number', options: { sort: 'name' } }],
        },
      ],
    });
    expect(errors).toEqual([
      {
        code: 'optionUnknown',
        index: 0,
        name: 'rolle',
        key: 'options',
        expected: ['step', 'min', 'max'],
        path: ['teilnehmer'],
      },
    ]);
  });

  it('AK9: die belegten Bestands-Formen liefern weiterhin exakt dieselben Objekte', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'Titel' },
        { name: 'Status', values: ['offen', 'fertig'] },
        { name: 'Tags', type: 'multistring', values: ['a', 'b'] },
        { name: 'Fällig', type: 'date', default: '2026-01-01' },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields).toEqual([
      { name: 'Titel', type: 'string', values: null, multiple: false, default: null },
      {
        name: 'Status',
        type: 'string',
        values: ['offen', 'fertig'],
        multiple: false,
        default: null,
      },
      { name: 'Tags', type: 'multistring', values: ['a', 'b'], multiple: true, default: null },
      { name: 'Fällig', type: 'date', values: null, multiple: false, default: '2026-01-01' },
    ]);
    // Keine der neuen Angaben taucht ungefragt am Objekt auf.
    expect(fields.every((f) => !('options' in f) && !('valuesFrom' in f))).toBe(true);
  });
});
