// 4T-0446 (Epic 3E-0083): Unit-Tests der Eigenschafts-Profile — tolerante
// Normalisierung der propertyProfiles-Sektion, Profil-Datei-Format mit
// weicher Validierung (Fehler-Isolation pro Definition) und Auswertung des
// Zuordnungs-Felds. 4T-0447: Definitions-Auflösung mit Konflikt-Regeln.
import { describe, it, expect } from 'vitest';
import {
  PROFILE_FIELD_TYPES,
  DEFAULT_ASSIGN_FIELD,
  normalizeProfilesConfig,
  parseProfileFields,
  assignedProfileNames,
  resolveProfileFields,
  fieldDefinitionHint,
  profileFieldSuggestions,
  emptyValueForType,
  buildProfileFillMap,
  profileSuggestGroups,
} from '../../src/shared/property-profiles.js';
import { extensionById } from '../../src/shared/extensions/extensions.js';

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
    expect(errors).toEqual([{ code: 'fieldsNotList', index: -1, name: null }]);
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
        { name: 'y', multiple: true }, // multiple ohne values
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
      'multipleWithoutValues',
      'multipleType',
      'values',
      'values',
      'values',
    ]);
    // Hinweise tragen Position und (falls bekannt) den Feldnamen.
    expect(errors[2]).toEqual({ code: 'name', index: 3, name: null });
    expect(errors[5]).toEqual({ code: 'type', index: 6, name: 'x' });
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
    expect(errors).toEqual([{ code: 'defaultOutsideValues', index: 0, name: 'Status' }]);
  });
});

describe('assignedProfileNames', () => {
  it('liest String- und Listen-Werte des Zuordnungs-Felds', () => {
    expect(assignedProfileNames({ class: 'Projekt' }, 'class')).toEqual(['Projekt']);
    expect(assignedProfileNames({ class: ['Projekt', 'Person'] }, 'class')).toEqual([
      'Projekt',
      'Person',
    ]);
  });

  it('Feldname case-insensitiv, Default class, Werte getrimmt und dedupliziert', () => {
    expect(assignedProfileNames({ Class: ' Projekt ' }, undefined)).toEqual(['Projekt']);
    expect(assignedProfileNames({ TYP: ['A', 'A', '', null] }, 'typ')).toEqual(['A']);
  });

  it('fehlendes Feld, leere oder defekte Frontmatter-Daten ergeben leer', () => {
    expect(assignedProfileNames({}, 'class')).toEqual([]);
    expect(assignedProfileNames(null, 'class')).toEqual([]);
    expect(assignedProfileNames({ class: { verschachtelt: true } }, 'class')).toEqual([]);
    expect(assignedProfileNames({ class: [{ a: 1 }] }, 'class')).toEqual([]);
  });

  it('Reihenfolge der Zuordnung bleibt erhalten (Konflikt-Regel 4T-0447)', () => {
    expect(assignedProfileNames({ class: ['B', 'A', 'C'] }, 'class')).toEqual(['B', 'A', 'C']);
  });
});

// 4T-0447 (Epic 3E-0083): Definitions-Auflösung pro Datei.
describe('resolveProfileFields', () => {
  const field = (name, extra = {}) => ({
    name,
    type: 'string',
    values: null,
    multiple: false,
    default: null,
    ...extra,
  });
  const CATALOG = [
    { name: 'All', fields: [field('status', { values: ['a', 'b'] }), field('thema')] },
    { name: 'Projekt', fields: [field('status', { type: 'date' }), field('budget')] },
    { name: 'Person', fields: [field('Status', { type: 'number' }), field('rolle')] },
  ];

  it('Vereinigung: Standard-Profil plus zugeordnete Profile', () => {
    const { fields, missing } = resolveProfileFields(CATALOG, {
      defaultProfile: 'All',
      assigned: ['Projekt'],
    });
    expect(missing).toEqual([]);
    expect(fields.map((f) => [f.name, f.profile, f.fromDefault])).toEqual([
      ['status', 'Projekt', false],
      ['budget', 'Projekt', false],
      ['thema', 'All', true],
    ]);
  });

  it('Konflikt: zugeordnetes Profil gewinnt vor dem Standard-Profil', () => {
    const { fields } = resolveProfileFields(CATALOG, {
      defaultProfile: 'All',
      assigned: ['Projekt'],
    });
    expect(fields.find((f) => f.name === 'status').type).toBe('date');
  });

  it('Konflikt unter Zugeordneten: das zuerst genannte Profil gewinnt (case-insensitiv)', () => {
    const { fields } = resolveProfileFields(CATALOG, {
      defaultProfile: null,
      assigned: ['Person', 'Projekt'],
    });
    const status = fields.find((f) => f.name.toLowerCase() === 'status');
    expect(status.type).toBe('number');
    expect(status.profile).toBe('Person');
    expect(fields.map((f) => f.name)).toEqual(['Status', 'rolle', 'budget']);
  });

  it('Profil-Namen matchen case-insensitiv (Windows-Dateisystem)', () => {
    const { fields, missing } = resolveProfileFields(CATALOG, {
      defaultProfile: null,
      assigned: ['projekt'],
    });
    expect(missing).toEqual([]);
    expect(fields.map((f) => f.name)).toEqual(['status', 'budget']);
  });

  it('nicht vorhandene Profile landen in missing, doppelte zählen einmal', () => {
    const { fields, missing } = resolveProfileFields(CATALOG, {
      defaultProfile: 'Fehlt',
      assigned: ['Projekt', 'projekt', 'Unbekannt'],
    });
    expect(missing).toEqual(['Unbekannt', 'Fehlt']);
    expect(fields.map((f) => f.name)).toEqual(['status', 'budget']);
  });

  it('Standard-Profil auch zugeordnet: Felder bleiben als zugeordnet gekennzeichnet', () => {
    const { fields } = resolveProfileFields(CATALOG, {
      defaultProfile: 'All',
      assigned: ['all'],
    });
    expect(fields.every((f) => f.fromDefault === false)).toBe(true);
  });

  it('leerer Katalog oder keine Zuordnung ergibt leer bzw. nur den Standard', () => {
    expect(resolveProfileFields([], { defaultProfile: null, assigned: [] })).toEqual({
      fields: [],
      missing: [],
    });
    const { fields } = resolveProfileFields(CATALOG, { defaultProfile: 'All', assigned: [] });
    expect(fields.map((f) => [f.name, f.fromDefault])).toEqual([
      ['status', true],
      ['thema', true],
    ]);
  });
});

// 4T-0448 (Epic 3E-0083): gemeinsame Editor-Logik (Hinweise, Vorschläge)
// und Registrierung als schaltbare Erweiterung.
describe('fieldDefinitionHint', () => {
  const def = (extra) => ({
    name: 'f',
    type: 'string',
    values: null,
    multiple: false,
    default: null,
    ...extra,
  });

  it('leere Werte erzeugen keinen Hinweis (weiche Haltung)', () => {
    expect(fieldDefinitionHint(def(), '')).toBeNull();
    expect(fieldDefinitionHint(def(), null)).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'multistring' }), [])).toBeNull();
    expect(fieldDefinitionHint(null, 'x')).toBeNull();
  });

  it('typ-konforme Werte sind hinweisfrei', () => {
    expect(fieldDefinitionHint(def(), 'Text')).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'number' }), 5)).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'boolean' }), true)).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'date' }), '2026-07-09')).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'multistring' }), ['a'])).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'multiline' }), 'a\nb')).toBeNull();
  });

  it('Typ-Abweichungen melden typeMismatch', () => {
    expect(fieldDefinitionHint(def({ type: 'number' }), 'fünf')).toBe('typeMismatch');
    expect(fieldDefinitionHint(def({ type: 'date' }), 'morgen')).toBe('typeMismatch');
    expect(fieldDefinitionHint(def({ type: 'boolean' }), 'ja')).toBe('typeMismatch');
    expect(fieldDefinitionHint(def(), 42)).toBe('typeMismatch');
    expect(fieldDefinitionHint(def(), 'mehr\nzeilig')).toBe('typeMismatch');
  });

  it('Werte außerhalb des Wertebereichs melden outsideValues', () => {
    const single = def({ values: ['offen', 'erledigt'] });
    expect(fieldDefinitionHint(single, 'offen')).toBeNull();
    expect(fieldDefinitionHint(single, 'unklar')).toBe('outsideValues');
    const multi = def({ type: 'multistring', values: ['a', 'b'], multiple: true });
    expect(fieldDefinitionHint(multi, ['a', 'b'])).toBeNull();
    expect(fieldDefinitionHint(multi, ['a', 'c'])).toBe('outsideValues');
    // number-Wertebereich: Zahl und String-Repräsentation zählen als Treffer.
    const num = def({ type: 'number', values: [1, 2] });
    expect(fieldDefinitionHint(num, 2)).toBeNull();
    expect(fieldDefinitionHint(num, 3)).toBe('outsideValues');
  });

  it('Typ-Abweichung hat Vorrang vor dem Wertebereichs-Hinweis', () => {
    const d = def({ type: 'number', values: [1, 2] });
    expect(fieldDefinitionHint(d, 'eins')).toBe('typeMismatch');
  });
});

describe('profileFieldSuggestions', () => {
  const FIELDS = [
    {
      name: 'status',
      type: 'string',
      values: ['a'],
      multiple: false,
      default: null,
      profile: 'All',
      fromDefault: true,
    },
    {
      name: 'budget',
      type: 'number',
      values: null,
      multiple: false,
      default: null,
      profile: 'Projekt',
      fromDefault: false,
    },
  ];
  const HEURISTICS = [
    { name: 'tags', type: 'multistring' },
    { name: 'status', type: 'string' },
  ];

  it('Definitions-Felder zuerst, danach Heuristik; gesetzte Namen entfallen', () => {
    const out = profileFieldSuggestions(FIELDS, ['Budget'], HEURISTICS);
    expect(out.map((s) => [s.source, s.name])).toEqual([
      ['profile', 'status'],
      ['heuristic', 'tags'],
    ]);
    // Definitions-Vorschläge tragen die volle Definition (Typ, Default, Profil).
    expect(out[0].def.profile).toBe('All');
    expect(out[1].def).toBeNull();
    expect(out[1].type).toBe('multistring');
  });

  it('Heuristik-Namen, die bereits definiert sind, erscheinen nicht doppelt', () => {
    const out = profileFieldSuggestions(FIELDS, [], HEURISTICS);
    expect(out.filter((s) => s.name === 'status')).toHaveLength(1);
    expect(out.find((s) => s.name === 'status').source).toBe('profile');
  });

  it('ohne Auflösung bleiben nur die Heuristik-Vorschläge', () => {
    const out = profileFieldSuggestions([], [], HEURISTICS);
    expect(out.map((s) => s.name)).toEqual(['tags', 'status']);
  });
});

describe('Erweiterungs-Registrierung property-profiles (4T-0448)', () => {
  it('ist als Werkzeug-Erweiterung mit Einstellungs-Bereich registriert', () => {
    const manifest = extensionById('property-profiles');
    expect(manifest).not.toBeNull();
    expect(manifest.category).toBe('tools');
    expect(manifest.nameKey).toBe('help.featureName.propertyProfiles');
    expect(manifest.descKey).toBe('help.feature.propertyProfiles');
    expect(manifest.settingsSections).toEqual(['propertyProfiles']);
    expect(manifest.commands).toBeUndefined();
  });
});

// 4T-0491 (Epic 3E-0093): Komplett-Übernahme — Leer-Werte, Feld-Map, Ziele.
describe('emptyValueForType (4T-0491)', () => {
  it('liefert typgerechte Leer-Werte je Typ', () => {
    expect(emptyValueForType('multistring')).toEqual([]);
    expect(emptyValueForType('number')).toBe(0);
    expect(emptyValueForType('boolean')).toBe(false);
    expect(emptyValueForType('string')).toBe('');
    expect(emptyValueForType('multiline')).toBe('');
    expect(emptyValueForType('date')).toBe('');
    expect(emptyValueForType('unbekannt')).toBe('');
  });
});

describe('buildProfileFillMap (4T-0491)', () => {
  const field = (name, extra = {}) => ({
    name,
    type: 'string',
    values: null,
    multiple: false,
    default: null,
    ...extra,
  });

  it('nur fehlende Felder, mit Default bzw. typgerechtem Leer-Wert', () => {
    const fields = [
      field('titel'),
      field('prio', { type: 'number', default: 3 }),
      field('anzahl', { type: 'number' }),
      field('aktiv', { type: 'boolean' }),
      field('themen', { type: 'multistring' }),
    ];
    // titel ist bereits vorhanden und entfällt.
    expect(buildProfileFillMap(fields, ['titel'])).toEqual({
      prio: 3,
      anzahl: 0,
      aktiv: false,
      themen: [],
    });
  });

  it('existingKeys case-insensitiv; Duplikat-Definitionen zählen einmal', () => {
    const fields = [field('Status'), field('status'), field('rolle')];
    expect(Object.keys(buildProfileFillMap(fields, ['STATUS']))).toEqual(['rolle']);
  });

  it('Einfüge-Reihenfolge = Definitions-Reihenfolge', () => {
    expect(Object.keys(buildProfileFillMap([field('a'), field('b'), field('c')], []))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('leere oder ungültige Eingaben ergeben eine leere Map', () => {
    expect(buildProfileFillMap([], [])).toEqual({});
    expect(buildProfileFillMap(null, [])).toEqual({});
    expect(buildProfileFillMap([field('')], [])).toEqual({});
  });
});

describe('profileSuggestGroups (4T-0491)', () => {
  const rf = (name, profile, extra = {}) => ({
    name,
    type: 'string',
    values: null,
    multiple: false,
    default: null,
    profile,
    fromDefault: false,
    ...extra,
  });
  const HEUR = [
    { name: 'tags', type: 'multistring' },
    { name: 'title', type: 'string' },
  ];

  it('gruppiert Definitions-Felder pro Profil (Reihenfolge = Auflösung), Heuristik als otherFields', () => {
    const fields = [
      rf('a', 'Projekt'),
      rf('b', 'Projekt', { type: 'number', default: 5 }),
      rf('c', 'All'),
    ];
    const { profileGroups, otherFields } = profileSuggestGroups(fields, [], HEUR);
    expect(profileGroups.map((g) => g.profile)).toEqual(['Projekt', 'All']);
    expect(profileGroups[0].fields.map((s) => s.name)).toEqual(['a', 'b']);
    expect(profileGroups[0].map).toEqual({ a: '', b: 5 });
    expect(profileGroups[1].fields.map((s) => s.name)).toEqual(['c']);
    expect(profileGroups[1].map).toEqual({ c: '' });
    expect(otherFields.map((s) => s.name)).toEqual(['tags', 'title']);
  });

  it('bereits gesetzte Felder entfallen; ein vollständiges Profil erhält keine Gruppe', () => {
    const { profileGroups } = profileSuggestGroups([rf('a', 'Projekt'), rf('b', 'All')], ['b'], []);
    expect(profileGroups.map((g) => g.profile)).toEqual(['Projekt']);
    expect(profileGroups[0].map).toEqual({ a: '' });
  });

  it('Heuristik, die schon als Profil-Feld existiert, erscheint nicht doppelt', () => {
    const { profileGroups, otherFields } = profileSuggestGroups(
      [rf('tags', 'Projekt', { type: 'multistring' })],
      [],
      HEUR,
    );
    expect(profileGroups[0].fields.map((s) => s.name)).toEqual(['tags']);
    expect(otherFields.map((s) => s.name)).toEqual(['title']);
  });

  it('ohne Auflösung nur otherFields (Heuristik), keine Profil-Gruppen', () => {
    const { profileGroups, otherFields } = profileSuggestGroups([], [], HEUR);
    expect(profileGroups).toEqual([]);
    expect(otherFields.map((s) => s.name)).toEqual(['tags', 'title']);
  });
});
